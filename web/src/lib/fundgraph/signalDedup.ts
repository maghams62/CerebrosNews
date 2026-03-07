import { Signal } from "@/lib/fundgraph/types";

function norm(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function parseDateMs(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeUrlForKey(raw: string | undefined): string {
  const input = (raw ?? "").trim();
  if (!input) return "";
  try {
    const parsed = new URL(input);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    return `${host}${pathname}`;
  } catch {
    return norm(input);
  }
}

function signalRank(signal: Signal): number {
  const verifies = signal.verifiedCount ?? signal.verifyCount ?? signal.verifies ?? 0;
  const bullish = signal.bullishCount ?? signal.upvotes ?? 0;
  const neutral = signal.neutralCount ?? 0;
  const bearish = signal.bearishCount ?? 0;
  const stanceActivity = bullish + neutral + bearish;
  const confidence = signal.confidence ?? 0;
  const freshness = parseDateMs(signal.createdAt) / 1_000_000_000_000;
  return confidence * 120 + verifies * 4 + stanceActivity * 0.2 + freshness;
}

function signalKey(signal: Signal): string {
  const fundId = signal.fundId?.trim();
  if (!fundId) return `id:${signal.id}`;

  const title = norm(signal.title);
  const summary = norm(signal.summary);
  const url = normalizeUrlForKey(signal.evidenceUrl ?? signal.evidence?.url);
  const snippet = norm(signal.evidenceSnippet ?? signal.evidence?.snippet);
  const content = [title, summary, url || snippet].filter(Boolean).join("||");

  if (!content) return `id:${signal.id}`;
  return `${fundId}||${content}`;
}

function mergeSignals(base: Signal, next: Signal): Signal {
  const baseRank = signalRank(base);
  const nextRank = signalRank(next);
  const primary = nextRank > baseRank ? next : base;
  const secondary = primary === base ? next : base;

  const tags = Array.from(new Set([...(primary.tags ?? []), ...(secondary.tags ?? [])].filter(Boolean)));
  const createdAt = parseDateMs(primary.createdAt) >= parseDateMs(secondary.createdAt) ? primary.createdAt : secondary.createdAt;
  const verifyCount = Math.max(
    primary.verifiedCount ?? primary.verifyCount ?? primary.verifies ?? 0,
    secondary.verifiedCount ?? secondary.verifyCount ?? secondary.verifies ?? 0
  );
  const disagreeCount = Math.max(
    primary.disputedCount ?? primary.disagreeCount ?? primary.disagrees ?? 0,
    secondary.disputedCount ?? secondary.disagreeCount ?? secondary.disagrees ?? 0
  );

  const evidenceUrl = primary.evidenceUrl ?? secondary.evidenceUrl ?? primary.evidence?.url ?? secondary.evidence?.url;
  const evidenceSnippet =
    primary.evidenceSnippet ?? secondary.evidenceSnippet ?? primary.evidence?.snippet ?? secondary.evidence?.snippet;

  return {
    ...primary,
    title: primary.title || secondary.title,
    summary: primary.summary || secondary.summary,
    confidence: Math.max(primary.confidence ?? 0, secondary.confidence ?? 0),
    upvotes: Math.max(primary.upvotes ?? primary.bullishCount ?? 0, secondary.upvotes ?? secondary.bullishCount ?? 0),
    bullishCount: Math.max(primary.bullishCount ?? primary.upvotes ?? 0, secondary.bullishCount ?? secondary.upvotes ?? 0),
    neutralCount: Math.max(primary.neutralCount ?? 0, secondary.neutralCount ?? 0),
    bearishCount: Math.max(primary.bearishCount ?? 0, secondary.bearishCount ?? 0),
    verifiedCount: verifyCount,
    verifyCount,
    verifies: verifyCount,
    disputedCount: disagreeCount,
    disagreeCount,
    disagrees: disagreeCount,
    commentsCount: Math.max(primary.commentsCount ?? 0, secondary.commentsCount ?? 0),
    createdAt,
    authorName: primary.authorName || secondary.authorName || "Community Member",
    userId: primary.userId ?? secondary.userId,
    authorUserId: primary.authorUserId ?? secondary.authorUserId,
    source: primary.source ?? secondary.source ?? "community",
    evidenceUrl,
    evidenceSnippet,
    evidence: evidenceUrl || evidenceSnippet ? { url: evidenceUrl, snippet: evidenceSnippet } : undefined,
    tags,
    trustScore: Math.max(primary.trustScore ?? 0, secondary.trustScore ?? 0) || undefined,
    trustTier: primary.trustTier ?? secondary.trustTier,
    trustExplanation: primary.trustExplanation ?? secondary.trustExplanation,
  };
}

export function dedupeSignals(signals: Signal[]): Signal[] {
  const buckets = new Map<string, Signal>();

  for (const signal of signals) {
    const key = signalKey(signal);
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, signal);
      continue;
    }
    buckets.set(key, mergeSignals(existing, signal));
  }

  return Array.from(buckets.values()).sort((left, right) => parseDateMs(right.createdAt) - parseDateMs(left.createdAt));
}
