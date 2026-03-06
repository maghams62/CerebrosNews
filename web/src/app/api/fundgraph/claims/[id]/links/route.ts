import { NextResponse } from "next/server";
import { fundContextForLinks } from "@/lib/fundgraph/entityLinking";
import { readFunds } from "@/lib/fundgraph/storage";
import { getLinksForClaim } from "@/lib/fundgraph/store.contract";
import { getClaimById } from "@/lib/fundgraph/store";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const claim = await getClaimById(id);
  if (!claim) {
    return NextResponse.json({ error: "claim_not_found" }, { status: 404 });
  }

  const [links, funds] = await Promise.all([getLinksForClaim(id), readFunds()]);
  const lookup = fundContextForLinks(funds);

  const hydrated = links.map((link) => {
    if (link.targetType === "FUND") {
      const fund = lookup.fundById.get(link.targetId);
      return {
        ...link,
        target: fund
          ? {
              id: fund.id,
              name: fund.name,
              type: "FUND" as const,
            }
          : null,
      };
    }

    if (link.targetType === "GP") {
      const gp = lookup.gpById.get(link.targetId);
      return {
        ...link,
        target: gp
          ? {
              id: gp.id,
              name: gp.name,
              type: "GP" as const,
              fundId: gp.fundId,
            }
          : null,
      };
    }

    const company = lookup.companyById.get(link.targetId);
    return {
      ...link,
      target: company
        ? {
            id: company.id,
            name: company.name,
            type: "COMPANY" as const,
            fundId: company.fundId,
          }
        : null,
    };
  });

  return NextResponse.json({
    claimId: id,
    count: hydrated.length,
    links: hydrated,
  });
}
