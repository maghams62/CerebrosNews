import { NextResponse } from "next/server";
import { z } from "zod";
import { applyContribution } from "@/lib/fundgraph/gamification";

export const runtime = "nodejs";

const schema = z.object({
  userId: z.string().trim().min(1).optional(),
  type: z.enum(["verify_claim", "add_signal", "add_source", "add_comment", "share_signal", "upvote"]),
  targetId: z.string().trim().min(1).optional(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", detail: parsed.error.flatten() }, { status: 400 });
  }

  const userId = parsed.data.userId?.trim() || req.headers.get("x-fundgraph-user-id")?.trim() || "demo";
  const snapshot = await applyContribution(userId, parsed.data.type, parsed.data.targetId);
  return NextResponse.json(snapshot);
}
