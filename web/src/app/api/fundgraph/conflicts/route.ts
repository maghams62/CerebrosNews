import { NextResponse } from "next/server";
import { getFundgraphDataMode } from "@/lib/fundgraph/mode";
import { getClaimById, getOpenConflicts } from "@/lib/fundgraph/store";

export const runtime = "nodejs";

export async function GET() {
  const conflicts = await getOpenConflicts();

  const enriched = await Promise.all(
    conflicts.map(async (conflict) => {
      const [claimA, claimB] = await Promise.all([
        getClaimById(conflict.claimIdA),
        getClaimById(conflict.claimIdB),
      ]);

      return {
        ...conflict,
        claimA: claimA
          ? {
              id: claimA.id,
              claimText: claimA.claimText,
              sourceId: claimA.sourceId,
              trustScore: claimA.trustScore,
              trustTier: claimA.trustTier,
            }
          : null,
        claimB: claimB
          ? {
              id: claimB.id,
              claimText: claimB.claimText,
              sourceId: claimB.sourceId,
              trustScore: claimB.trustScore,
              trustTier: claimB.trustTier,
            }
          : null,
      };
    })
  );

  return NextResponse.json({
    mode: getFundgraphDataMode(),
    count: enriched.length,
    conflicts: enriched,
    realModePlaceholder: getFundgraphDataMode() === "real",
  });
}
