import { NextResponse } from "next/server";
import { filterClaimLinksByClaims, filterClaimsForDemoMode } from "@/lib/fundgraph/demoModeFilter";
import { getFundgraphDataMode } from "@/lib/fundgraph/mode";
import { curateSignalsForFeed, sanitizeFundForDisplay } from "@/lib/fundgraph/quality";
import { listSignals } from "@/lib/fundgraph/service";
import { readFunds } from "@/lib/fundgraph/storage";
import { getClaimLinks, getClaims } from "@/lib/fundgraph/store";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const funds = await readFunds();
  const fund = funds.find((item) => item.id === id) ?? funds.find((item) => item.slug === id);
  if (!fund) {
    return NextResponse.json({ error: "fund_not_found" }, { status: 404 });
  }

  const [signalsResponse, rawClaims, rawClaimLinks] = await Promise.all([
    listSignals({ fundId: fund.id, limit: 120 }),
    getClaims(),
    getClaimLinks(),
  ]);
  const claims = await filterClaimsForDemoMode(rawClaims);
  const claimLinks = filterClaimLinksByClaims(rawClaimLinks, claims);
  const fundSignals = curateSignalsForFeed(signalsResponse.signals, { maxPerFund: 0, surface: "fund" });
  const linkedClaims = claims.filter((claim) => claim.linkedFundIds.includes(fund.id));
  const linksByClaimId = new Map<string, typeof claimLinks>();
  for (const link of claimLinks) {
    const bucket = linksByClaimId.get(link.claimId) ?? [];
    bucket.push(link);
    linksByClaimId.set(link.claimId, bucket);
  }

  return NextResponse.json({
    mode: signalsResponse.mode || getFundgraphDataMode(),
    fund: sanitizeFundForDisplay(fund),
    signals: fundSignals,
    claims: linkedClaims.map((claim) => ({
      ...claim,
      links: linksByClaimId.get(claim.id) ?? [],
    })),
    realModePlaceholder: (signalsResponse.mode || getFundgraphDataMode()) === "real",
  });
}
