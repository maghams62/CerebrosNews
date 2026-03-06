import { NextResponse } from "next/server";
import { z } from "zod";
import { getFundgraphDataMode } from "@/lib/fundgraph/config";
import { readFundgraphDb } from "@/lib/fundgraph/store";
import { readFunds } from "@/lib/fundgraph/storage";
import { ContributionEventType } from "@/lib/fundgraph/types";

export const runtime = "nodejs";

const querySchema = z.object({
  userId: z.string().trim().min(1),
  limit: z.number().int().min(1).max(30).default(8),
});

function parseLimit(value: string | null, fallback = 8): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(30, Math.floor(parsed)));
}

function isUserSignal(signal: { userId?: string; authorUserId?: string }, userId: string): boolean {
  return signal.userId === userId || signal.authorUserId === userId;
}

function countContributionByType(events: Array<{ type: ContributionEventType }>, type: ContributionEventType): number {
  let count = 0;
  for (const event of events) {
    if (event.type === type) count += 1;
  }
  return count;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    userId:
      url.searchParams.get("userId")?.trim() || req.headers.get("x-fundgraph-user-id")?.trim() || "demo",
    limit: parseLimit(url.searchParams.get("limit"), 8),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", detail: parsed.error.flatten() }, { status: 400 });
  }

  const { userId, limit } = parsed.data;
  const [db, funds] = await Promise.all([readFundgraphDb(), readFunds()]);
  const fundNameById = Object.fromEntries(funds.map((fund) => [fund.id, fund.name]));

  const allEvents = [...(db.contributionEvents ?? [])]
    .filter((event) => event.userId === userId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const allMemos = [...(db.memos ?? [])]
    .filter((memo) => (memo.userId ?? "demo") === userId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const allSignals = [...(db.signals ?? [])]
    .filter((signal) => isUserSignal(signal, userId))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const allVerifications = [...(db.verifications ?? [])]
    .filter((verification) => verification.userId === userId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  const recentSignals = allSignals.slice(0, limit).map((signal) => ({
    id: signal.id,
    title: signal.title,
    fundId: signal.fundId,
    fundName: fundNameById[signal.fundId] ?? signal.fundId,
    createdAt: signal.createdAt,
    confidence: signal.confidence,
    verifies: signal.verifies ?? signal.verifyCount ?? signal.verifiedCount ?? 0,
    disagrees: signal.disagrees ?? signal.disagreeCount ?? signal.disputedCount ?? 0,
  }));

  const recentMemos = allMemos.slice(0, limit).map((memo) => ({
    id: memo.id,
    title: memo.sections.find((section) => section.key === "title")?.content?.trim() || `Memo ${memo.id.slice(-6)}`,
    memoType: memo.memoType ?? "investment_memo",
    artifactType: memo.artifactType ?? "fund_memo",
    createdAt: memo.createdAt,
    primaryFundId: memo.primaryFundId ?? memo.fundIds[0] ?? null,
    primaryFundName:
      memo.primaryFundId && fundNameById[memo.primaryFundId]
        ? fundNameById[memo.primaryFundId]
        : memo.fundIds[0] && fundNameById[memo.fundIds[0]]
          ? fundNameById[memo.fundIds[0]]
          : null,
  }));

  const recentEvents = allEvents.slice(0, limit).map((event) => ({
    id: event.id,
    type: event.type,
    targetId: event.targetId ?? null,
    deltaCredits: event.deltaCredits,
    createdAt: event.createdAt,
  }));

  const recentVerifications = allVerifications.slice(0, limit).map((verification) => ({
    id: verification.id,
    vote: verification.vote,
    claimId: verification.claimId ?? null,
    signalId: verification.signalId ?? null,
    targetType: verification.targetType ?? null,
    createdAt: verification.createdAt,
  }));

  const disputesSubmitted = allVerifications.filter((verification) => verification.vote === "dispute").length;
  const verificationActions = allVerifications.length;
  const citationsAdded = countContributionByType(allEvents, "add_source");
  const commentsAdded = countContributionByType(allEvents, "add_comment");
  const sharesSubmitted = countContributionByType(allEvents, "share_signal");
  const stancesSubmitted = countContributionByType(allEvents, "upvote");

  return NextResponse.json({
    mode: getFundgraphDataMode(),
    userId,
    summary: {
      memosCreated: allMemos.length,
      signalsPublished: allSignals.length,
      contributionEvents: allEvents.length,
      citationsAdded,
      verificationActions,
      disputesSubmitted,
      commentsAdded,
      sharesSubmitted,
      stancesSubmitted,
    },
    recent: {
      memos: recentMemos,
      publishedSignals: recentSignals,
      contributionEvents: recentEvents,
      verifications: recentVerifications,
    },
    realModePlaceholder: getFundgraphDataMode() === "real",
  });
}
