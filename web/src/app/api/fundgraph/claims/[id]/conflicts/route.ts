import { NextResponse } from "next/server";
import { getFundgraphDataMode } from "@/lib/fundgraph/mode";
import { getClaimById, getClaimConflicts } from "@/lib/fundgraph/store";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const claim = await getClaimById(id);
  if (!claim) {
    return NextResponse.json({ error: "claim_not_found" }, { status: 404 });
  }

  const conflicts = await getClaimConflicts(id);
  return NextResponse.json({
    mode: getFundgraphDataMode(),
    claimId: id,
    count: conflicts.length,
    conflicts,
    realModePlaceholder: getFundgraphDataMode() === "real",
  });
}
