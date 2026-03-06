import { NextResponse } from "next/server";
import { listFunds } from "@/lib/fundgraph/service";

export const runtime = "nodejs";

function parseLimit(value: string | null, fallback = 100): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(1000, Math.floor(parsed)));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const response = await listFunds({
    q: url.searchParams.get("q") ?? url.searchParams.get("search") ?? undefined,
    sector: url.searchParams.get("sector") ?? undefined,
    stage: url.searchParams.get("stage") ?? undefined,
    geo: url.searchParams.get("geo") ?? undefined,
    sort: (url.searchParams.get("sort") as "trending" | "aum" | "recent" | null) ?? undefined,
    limit: parseLimit(url.searchParams.get("limit"), 100),
  });

  return NextResponse.json({
    mode: response.mode,
    count: response.funds.length,
    funds: response.funds,
    realModePlaceholder: response.mode === "real",
  });
}
