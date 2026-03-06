import { NextResponse } from "next/server";
import { z } from "zod";
import { applyContribution } from "@/lib/fundgraph/gamification";
import { createId } from "@/lib/fundgraph/ids";
import { getFundgraphDataMode } from "@/lib/fundgraph/mode";
import { addSignalVote, ensureUser, getCred, getSignalById, getUserById } from "@/lib/fundgraph/store";

export const runtime = "nodejs";

const requestSchema = z.object({
  userId: z.string().trim().min(1).optional(),
  vote: z.enum(["verify", "dispute"]),
  note: z.string().trim().max(500).optional(),
  userName: z.string().trim().min(1).max(120).optional(),
});

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", detail: parsed.error.flatten() }, { status: 400 });
  }
  const userId = parsed.data.userId?.trim() || req.headers.get("x-fundgraph-user-id")?.trim() || "demo";

  const signal = await getSignalById(id);
  if (!signal) {
    return NextResponse.json({ error: "signal_not_found" }, { status: 404 });
  }

  await ensureUser(userId, parsed.data.userName);
  const gamification = await applyContribution(userId, "verify_claim", id);

  const updated = await addSignalVote({
    signalId: id,
    userId,
    vote: parsed.data.vote,
    note: parsed.data.note,
    verificationId: createId("fg-verification"),
  });

  if (!updated) {
    return NextResponse.json({ error: "signal_not_found" }, { status: 404 });
  }

  const user = await getUserById(userId);
  const cred = await getCred(userId);

  return NextResponse.json({
    mode: getFundgraphDataMode(),
    signal: updated,
    verifiedCount: updated.verifiedCount ?? updated.verifyCount ?? 0,
    disputedCount: updated.disputedCount ?? updated.disagreeCount ?? 0,
    trustScore: updated.trustScore,
    trustTier: updated.trustTier,
    trustExplanation: updated.trustExplanation,
    contributor: {
      userId,
      credScore: cred,
      badgeTier: user?.badgeTier ?? "NEW",
    },
    gamification,
    realModePlaceholder: getFundgraphDataMode() === "real",
  });
}
