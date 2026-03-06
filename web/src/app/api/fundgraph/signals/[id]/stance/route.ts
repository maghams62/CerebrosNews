import { NextResponse } from "next/server";
import { z } from "zod";
import { applyContribution } from "@/lib/fundgraph/gamification";
import { createId } from "@/lib/fundgraph/ids";
import { getFundgraphDataMode } from "@/lib/fundgraph/mode";
import { ensureUser, getCred, getSignalById, getUserById, setSignalStance } from "@/lib/fundgraph/store";

export const runtime = "nodejs";

const requestSchema = z.object({
  userId: z.string().trim().min(1).optional(),
  userName: z.string().trim().min(1).max(120).optional(),
  stance: z.enum(["bullish", "neutral", "bearish"]),
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
  const gamification = await applyContribution(userId, "upvote", id);
  const updated = await setSignalStance({
    signalId: id,
    userId,
    stanceType: parsed.data.stance,
    stanceId: createId("fg-signal-stance"),
  });
  if (!updated) {
    return NextResponse.json({ error: "signal_not_found" }, { status: 404 });
  }

  const user = await getUserById(userId);
  const cred = await getCred(userId);

  return NextResponse.json({
    mode: getFundgraphDataMode(),
    signal: updated,
    stance: parsed.data.stance,
    stanceCounts: {
      bullish: updated.bullishCount ?? updated.upvotes ?? 0,
      neutral: updated.neutralCount ?? 0,
      bearish: updated.bearishCount ?? 0,
    },
    contributor: {
      userId,
      credScore: cred,
      badgeTier: user?.badgeTier ?? "NEW",
    },
    gamification,
    realModePlaceholder: getFundgraphDataMode() === "real",
  });
}
