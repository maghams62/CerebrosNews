import { NextResponse } from "next/server";
import { z } from "zod";
import { badgeForCred } from "@/lib/fundgraph/cred";
import { getFundById } from "@/lib/fundgraph/funds";
import { applyContribution } from "@/lib/fundgraph/gamification";
import { createId } from "@/lib/fundgraph/ids";
import { getFundgraphDataMode } from "@/lib/fundgraph/mode";
import { curateSignalsForFeed, filterSignalsForGraph } from "@/lib/fundgraph/quality";
import { addSignal, ensureUser, getUserById, readFundgraphDb } from "@/lib/fundgraph/store";
import { Signal } from "@/lib/fundgraph/types";

export const runtime = "nodejs";

const createSignalSchema = z.object({
  fundId: z.string().trim().min(1),
  title: z.string().trim().min(5).max(180),
  summary: z.string().trim().min(15).max(2000),
  confidence: z.number().min(0).max(1),
  tags: z.array(z.string().trim().min(1).max(32)).max(8).optional(),
  evidenceUrl: z.string().url().optional(),
  evidenceSnippet: z.string().trim().max(500).optional(),
  userId: z.string().trim().min(1).optional(),
  userName: z.string().trim().min(1).max(120).optional(),
});

function parseLimit(value: string | null, fallback = 50): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(1000, Math.floor(parsed)));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fundId = (url.searchParams.get("fundId") ?? "").trim();
  const scope = (url.searchParams.get("scope") ?? "feed").trim().toLowerCase();
  const limit = parseLimit(url.searchParams.get("limit"), 50);
  const db = await readFundgraphDb();
  const all = [...(db.signals ?? [])].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const scopedSignals =
    scope === "graph"
      ? filterSignalsForGraph(all)
      : curateSignalsForFeed(all, { maxPerFund: 0, surface: fundId ? "fund" : "global" });
  const filtered = scopedSignals.filter((signal) => (fundId ? signal.fundId === fundId : true)).slice(0, limit);

  return NextResponse.json({
    mode: getFundgraphDataMode(),
    count: filtered.length,
    scope,
    signals: filtered,
    realModePlaceholder: getFundgraphDataMode() === "real",
  });
}

export async function POST(req: Request) {
  const parsed = createSignalSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", detail: parsed.error.flatten() }, { status: 400 });
  }
  const userId = parsed.data.userId?.trim() || req.headers.get("x-fundgraph-user-id")?.trim() || "demo";

  const fund = await getFundById(parsed.data.fundId);
  if (!fund) {
    return NextResponse.json({ error: "fund_not_found" }, { status: 404 });
  }

  const signal: Signal = {
    id: createId("fg-signal"),
    fundId: parsed.data.fundId,
    title: parsed.data.title,
    summary: parsed.data.summary,
    confidence: Number(parsed.data.confidence.toFixed(3)),
    tags: parsed.data.tags ?? [],
    source: "community",
    authorName: parsed.data.userName ?? userId,
    authorUserId: userId,
    author: parsed.data.userName ?? userId,
    evidenceUrl: parsed.data.evidenceUrl,
    evidenceSnippet: parsed.data.evidenceSnippet,
    userId,
    upvotes: 0,
    bullishCount: 0,
    neutralCount: 0,
    bearishCount: 0,
    verifiedCount: 0,
    verifies: 0,
    disagrees: 0,
    verifyCount: 0,
    disagreeCount: 0,
    commentsCount: 0,
    createdAt: new Date().toISOString(),
  };

  await ensureUser(userId, parsed.data.userName);
  const stored = await addSignal(signal);
  const gamification = await applyContribution(userId, "add_signal", stored.id);
  const user = await getUserById(userId);

  return NextResponse.json({
    mode: getFundgraphDataMode(),
    signal: stored,
    contributor: {
      userId,
      cred: gamification.credits,
      badge: user?.badgeTier ?? badgeForCred(gamification.credits),
    },
    gamification,
    realModePlaceholder: getFundgraphDataMode() === "real",
  });
}
