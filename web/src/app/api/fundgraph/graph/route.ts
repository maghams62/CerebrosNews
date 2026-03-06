import { NextResponse } from "next/server";
import { buildGraphData } from "@/lib/fundgraph/graph/buildGraphData";
import { getGamificationUser } from "@/lib/fundgraph/gamification";

export const runtime = "nodejs";

function parseNumber(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.floor(parsed);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fundId = (url.searchParams.get("fundId") ?? "").trim() || undefined;
  const slug = (url.searchParams.get("slug") ?? "").trim() || undefined;
  const claimId = (url.searchParams.get("claimId") ?? "").trim() || undefined;
  const requestedDepth = parseNumber(url.searchParams.get("depth"));
  const limit = parseNumber(url.searchParams.get("limit"));
  const userId = url.searchParams.get("userId")?.trim() || req.headers.get("x-fundgraph-user-id")?.trim() || "demo";
  const gamification = await getGamificationUser(userId);
  const depth = Math.min(requestedDepth ?? gamification.limits.graphDepth, gamification.limits.graphDepth);

  const rawGraph = await buildGraphData({
    fundId,
    slug,
    claimId,
    depth,
    limit,
  });

  return NextResponse.json({
    ...rawGraph,
    depth,
    gamification,
  });
}
