import { NextResponse } from "next/server";
import { getFundgraphDataMode } from "@/lib/fundgraph/mode";
import { getClaimVerificationRecord } from "@/lib/fundgraph/store.contract";
import { getClaimById } from "@/lib/fundgraph/store";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const claim = await getClaimById(id);
  if (!claim) {
    return NextResponse.json({ error: "claim_not_found" }, { status: 404 });
  }

  const record = (await getClaimVerificationRecord(id)) ?? claim.verificationRecord;
  if (!record) {
    return NextResponse.json({ error: "verification_not_found" }, { status: 404 });
  }

  const mode = getFundgraphDataMode();
  return NextResponse.json({
    mode,
    ...record,
    realModePlaceholder: mode === "real",
  });
}
