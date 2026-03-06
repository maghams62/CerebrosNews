import { NextResponse } from "next/server";
import { z } from "zod";
import { resetGamificationUser } from "@/lib/fundgraph/gamification";

export const runtime = "nodejs";

const schema = z.object({
  userId: z.string().trim().min(1).optional(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", detail: parsed.error.flatten() }, { status: 400 });
  }

  const userId = parsed.data.userId?.trim() || req.headers.get("x-fundgraph-user-id")?.trim() || "demo";
  const snapshot = await resetGamificationUser(userId);
  return NextResponse.json(snapshot);
}
