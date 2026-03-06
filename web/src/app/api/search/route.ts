import { NextResponse } from "next/server";
import { readOfflineDataset } from "@/lib/dataset/offlineDataset";
import { getMarkets } from "@/lib/markets/markets";
import { FeedItem } from "@/types/feed";
import { canonicalizeTag, HIGH_SIGNAL_TAGS } from "@/lib/tags/highSignal";

export const runtime = "nodejs";

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "are",
  "was",
  "were",
  "been",
  "have",
  "has",
  "had",
  "will",
  "would",
  "could",
  "should",
  "about",
  "into",
  "over",
  "under",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "how",
  "not",
  "but",
  "than",
  "then",
  "them",
  "they",
  "their",
  "its",
  "it's",
  "you",
  "your",
  "our",
  "out",
  "new",
]);

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function tokenSet(input: string): Set<string> {
  return new Set(tokenize(input));
}

function scoreOverlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / Math.sqrt(a.size * b.size);
}

function parseLimit(value: string | null, fallback = 12): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(50, Math.floor(n)));
}

type ArticleLike = {
  id: string;
  title: string;
  summary: string;
  url?: string;
  sourceName?: string;
  sourceId?: string;
  publishedAt: string;
  tags?: string[];
};

function buildArticleText(item: ArticleLike): string {
  const source = item.sourceName ?? item.sourceId ?? "";
  return [item.title, item.summary, item.tags?.join(" ") ?? "", source].filter(Boolean).join(" ");
}

function buildMarketText(item: FeedItem): string {
  return [
    item.market?.question ?? item.title,
    item.summary,
    item.tags?.join(" ") ?? "",
    item.sourceName,
  ]
    .filter(Boolean)
    .join(" ");
}

function isTechArticle(tags?: string[]): boolean {
  if (!tags?.length) return false;
  const techSet = new Set(HIGH_SIGNAL_TAGS);
  return tags
    .map((t) => canonicalizeTag(t))
    .filter(Boolean)
    .some((t) => techSet.has(t as (typeof HIGH_SIGNAL_TAGS)[number]));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  if (query.length < 2) {
    return NextResponse.json({ error: "missing_query" }, { status: 400 });
  }

  const limit = parseLimit(url.searchParams.get("limit"));
  const marketLimit = parseLimit(url.searchParams.get("marketLimit"), 30);
  const marketMode = url.searchParams.get("marketMode") ?? undefined;
  const techOnly = url.searchParams.get("techOnly") === "1";

  const dataset = await readOfflineDataset();
  const items = (dataset?.items ?? []) as ArticleLike[];
  const queryTokens = tokenSet(query);

  const scoredArticles = items
    .map((item) => {
      const tokens = tokenSet(buildArticleText(item));
      const score = scoreOverlap(queryTokens, tokens);
      return { item, score, tokens };
    })
    .filter((entry) => entry.score > 0)
    .filter((entry) => (techOnly ? isTechArticle(entry.item.tags) : true))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return new Date(b.item.publishedAt).getTime() - new Date(a.item.publishedAt).getTime();
    })
    .slice(0, limit);

  const { items: marketItems } = await getMarkets({
    mode: marketMode === "live" || marketMode === "static" || marketMode === "auto" ? marketMode : undefined,
    limit: marketLimit,
  });

  const scoredMarkets = marketItems
    .map((item) => {
      const tokens = tokenSet(buildMarketText(item));
      const score = scoreOverlap(queryTokens, tokens);
      return { item, score, tokens };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const linked = scoredArticles
    .map((entry) => {
      const matches = scoredMarkets
        .map((m) => ({
          item: m.item,
          score: scoreOverlap(entry.tokens, m.tokens),
        }))
        .filter((m) => m.score >= 0.15)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((m) => ({
          id: m.item.id,
          title: m.item.title,
          sourceName: m.item.sourceName,
          publishedAt: m.item.publishedAt,
          score: Number(m.score.toFixed(3)),
          market: m.item.market ?? null,
        }));
      return {
        article: {
          id: entry.item.id,
          title: entry.item.title,
          summary: entry.item.summary,
          url: entry.item.url ?? null,
          sourceName: entry.item.sourceName ?? entry.item.sourceId ?? "Unknown",
          publishedAt: entry.item.publishedAt,
          score: Number(entry.score.toFixed(3)),
        },
        matches,
      };
    })
    .filter((entry) => entry.matches.length > 0);

  return NextResponse.json({
    query,
    counts: {
      articles: scoredArticles.length,
      markets: scoredMarkets.length,
      links: linked.length,
    },
    articles: scoredArticles.map((entry) => ({
      id: entry.item.id,
      title: entry.item.title,
      summary: entry.item.summary,
      url: entry.item.url ?? null,
      sourceName: entry.item.sourceName ?? entry.item.sourceId ?? "Unknown",
      publishedAt: entry.item.publishedAt,
      tags: entry.item.tags ?? [],
      score: Number(entry.score.toFixed(3)),
    })),
    markets: scoredMarkets.slice(0, limit).map((entry) => ({
      id: entry.item.id,
      title: entry.item.title,
      sourceName: entry.item.sourceName,
      publishedAt: entry.item.publishedAt,
      score: Number(entry.score.toFixed(3)),
      market: entry.item.market ?? null,
    })),
    linked,
  });
}
