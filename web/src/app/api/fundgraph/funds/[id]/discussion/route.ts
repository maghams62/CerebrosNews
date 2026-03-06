import { NextResponse } from "next/server";
import { getFundgraphDataMode } from "@/lib/fundgraph/mode";
import { readFunds } from "@/lib/fundgraph/storage";
import { getFundDiscussionNotes } from "@/lib/fundgraph/store";

export const runtime = "nodejs";

function parseLimit(value: string | null, fallback = 24): number {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"), 24);
  const funds = await readFunds();
  const fund = funds.find((entry) => entry.id === id || entry.slug === id);
  if (!fund) {
    return NextResponse.json({ error: "fund_not_found" }, { status: 404 });
  }

  const items = await getFundDiscussionNotes(fund.id, limit);
  return NextResponse.json({
    mode: getFundgraphDataMode(),
    fundId: fund.id,
    count: items.length,
    items,
    realModePlaceholder: getFundgraphDataMode() === "real",
  });
}
