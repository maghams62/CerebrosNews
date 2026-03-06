import { NextResponse } from "next/server";
import { getMarkets } from "@/lib/markets/markets";

export const runtime = "nodejs";

function parseLimit(value: string | null, fallback = 400): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(400, Math.floor(n)));
}

function parseMode(value: string | null): "auto" | "live" | "static" | undefined {
  if (!value) return undefined;
  if (value === "live" || value === "static" || value === "auto") return value;
  return undefined;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const mode = parseMode(url.searchParams.get("mode"));
  const { items, source } = await getMarkets({ mode, limit });
  return NextResponse.json({
    status: items.length ? "ok" : "empty",
    markets: items,
    count: items.length,
    source,
  });
}
