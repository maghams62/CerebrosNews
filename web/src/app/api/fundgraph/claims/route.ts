import { NextResponse } from "next/server";
import { bootstrapClaimsIfEmpty } from "@/lib/fundgraph/actions/extractClaims";
import { filterClaimLinksByClaims, filterClaimsForDemoMode } from "@/lib/fundgraph/demoModeFilter";
import { getFundgraphDataMode } from "@/lib/fundgraph/mode";
import { getClaimLinks, getClaims } from "@/lib/fundgraph/store";

export const runtime = "nodejs";

function parseLimit(value: string | null, fallback = 50): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(200, Math.floor(parsed)));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = getFundgraphDataMode();
  const limit = parseLimit(url.searchParams.get("limit"), 50);
  const category = (url.searchParams.get("category") ?? "").trim().toLowerCase();
  const sourceId = (url.searchParams.get("sourceId") ?? "").trim();

  await bootstrapClaimsIfEmpty(5);
  const claims = await filterClaimsForDemoMode(await getClaims());

  const filtered = claims
    .filter((claim) => (category ? claim.category.toLowerCase() === category : true))
    .filter((claim) => (sourceId ? claim.sourceId === sourceId : true))
    .slice(0, limit);

  const allLinks = filterClaimLinksByClaims(await getClaimLinks(), claims);
  const linksByClaimId = new Map<string, typeof allLinks>();
  for (const link of allLinks) {
    const bucket = linksByClaimId.get(link.claimId) ?? [];
    bucket.push(link);
    linksByClaimId.set(link.claimId, bucket);
  }

  return NextResponse.json({
    mode,
    count: filtered.length,
    claims: filtered.map((claim) => ({
      ...claim,
      links: linksByClaimId.get(claim.id) ?? [],
    })),
    realModePlaceholder: mode === "real",
  });
}
