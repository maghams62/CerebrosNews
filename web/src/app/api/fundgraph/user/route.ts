import { NextResponse } from "next/server";
import { getGamificationUser } from "@/lib/fundgraph/gamification";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId =
    url.searchParams.get("userId")?.trim() || req.headers.get("x-fundgraph-user-id")?.trim() || "demo";
  const snapshot = await getGamificationUser(userId);
  return NextResponse.json(snapshot);
}
