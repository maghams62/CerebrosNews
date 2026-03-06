import { NextResponse } from "next/server";
import { z } from "zod";
import { spendCredits } from "@/lib/fundgraph/gamification";

export const runtime = "nodejs";

const schema = z.object({
  userId: z.string().trim().min(1).optional(),
  amount: z.number().min(1),
  reason: z.string().trim().min(1).max(120),
  targetId: z.string().trim().min(1).optional(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", detail: parsed.error.flatten() }, { status: 400 });
  }

  const userId = parsed.data.userId?.trim() || req.headers.get("x-fundgraph-user-id")?.trim() || "demo";
  try {
    const snapshot = await spendCredits(userId, parsed.data.amount, parsed.data.reason, parsed.data.targetId);
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "spend_failed";
    if (message === "insufficient_credits") {
      return NextResponse.json({ error: "insufficient_credits" }, { status: 402 });
    }
    return NextResponse.json({ error: "spend_failed", detail: message }, { status: 500 });
  }
}
