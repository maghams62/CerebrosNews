"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StoryWithInsights } from "@/types/storyWithInsights";
import { cn } from "@/lib/cn";
import { filterHighSignalTags } from "@/lib/tags/highSignal";

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
  "then",
  "than",
  "they",
  "them",
  "their",
  "its",
  "it's",
  "you",
  "your",
  "our",
  "out",
  "will",
]);

function extractAnchorPhrases(text: string): string[] {
  if (!text) return [];
  const blocked = new Set(["Will", "Would", "Could", "Should", "Can", "Is", "Are", "Do", "Does", "Did", "The", "A", "An"]);
  const phrases = new Set<string>();
  const proper = text.match(/\b[A-Z][A-Za-z0-9]*(?:[-/][A-Za-z0-9]+)?(?:\s+[A-Z][A-Za-z0-9]*(?:[-/][A-Za-z0-9]+)?){0,2}\b/g);
  const acronyms = text.match(/\b[A-Z]{2,}(?:-\d+)?\b/g);
  [...(proper ?? []), ...(acronyms ?? [])].forEach((p) => {
    const trimmed = p.trim();
    if (!trimmed || blocked.has(trimmed)) return;
    if (trimmed.length < 2) return;
    phrases.add(trimmed);
  });
  return Array.from(phrases);
}

function anchorTokens(text: string): Set<string> {
  if (!text) return new Set();
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/g)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
  );
}

function formatCurrency(value: number | undefined | null): string {
  if (value === null || value === undefined) return "—";
  if (!Number.isFinite(value)) return "—";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value)}`;
}

function relativeTimeFromIso(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const deltaMs = Date.now() - d.getTime();
  const mins = Math.max(0, Math.floor(deltaMs / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function MarketStoryCard({
  item,
  onOpenMarket,
}: {
  item: StoryWithInsights;
  onOpenMarket?: () => void;
}) {
  const { story } = item;
  const market = story.market;

  const yes = Math.max(0, Math.min(100, market?.yes ?? 0));
  const no = Math.max(0, Math.min(100, market?.no ?? 0));
  const updatedLabel = relativeTimeFromIso(market?.updatedAt) || story.publishedAt;
  const platformUrl = market?.platform === "polymarket" ? "https://polymarket.com" : "https://kalshi.com";
  const marketUrl = market?.marketUrl ?? null;
  const specificMarketUrl = useMemo(() => {
    if (!marketUrl) return null;
    try {
      const parsed = new URL(marketUrl);
      if (!parsed.pathname || parsed.pathname === "/" || parsed.pathname === "/markets" || parsed.pathname === "/market") {
        return null;
      }
      return parsed.toString();
    } catch {
      return null;
    }
  }, [marketUrl]);
  const marketSearchUrl = useMemo(() => {
    const question = market?.question?.trim() || story.title?.trim();
    if (!question) return null;
    const host = market?.platform === "polymarket" ? "polymarket.com" : "kalshi.com";
    const query = `${question} site:${host}`;
    return `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
  }, [market?.platform, market?.question, story.title]);
  const displayTags = useMemo(
    () => filterHighSignalTags(story.tags ?? [], { max: 6 }),
    [story.tags]
  );
  const [coverageResults, setCoverageResults] = useState<Array<{ title: string; url: string; sourceName: string }>>([]);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const coverageFetchedRef = useRef<string | null>(null);
  const [sentimentSummary, setSentimentSummary] = useState<string[]>(() => market?.sentimentSummary ?? []);
  const [sentimentLoading, setSentimentLoading] = useState(false);
  const [sentimentError, setSentimentError] = useState<string | null>(null);
  const [sentimentOpen, setSentimentOpen] = useState<boolean>(() => (market?.sentimentSummary?.length ?? 0) > 0);
  const coverageAnchors = useMemo(() => {
    const question = market?.question ?? story.title ?? "";
    const phrases = extractAnchorPhrases(question).map((p) => p.toLowerCase());
    const tokens = anchorTokens(`${question} ${(story.tags ?? []).join(" ")}`);
    return { phrases, tokens };
  }, [market?.question, story.title, story.tags]);

  const commentList = useMemo(
    () => (market?.comments?.filter((c) => c?.author && c?.text) ?? []).slice(0, 18),
    [market]
  );

  const coverageQuery = useMemo(() => {
    if (!market) return "";
    return market.question ?? story.title ?? "";
  }, [market, story.title]);
  const coveragePayload = useMemo(
    () => ({
      question: market?.question ?? story.title ?? "",
      summary: story.summary ?? "",
      tags: story.tags ?? [],
    }),
    [market?.question, story.title, story.summary, story.tags]
  );

  useEffect(() => {
    if (!market) return;
    const preset = market.sentimentSummary ?? [];
    setSentimentSummary(preset);
    setSentimentOpen(preset.length > 0);
    setSentimentError(null);
    setSentimentLoading(false);
  }, [market]);

  const fetchSentiment = async () => {
    if (!market) return;
    if (!commentList.length) {
      setSentimentOpen(true);
      setSentimentError("Market comment data unavailable.");
      return;
    }
    setSentimentOpen(true);
    setSentimentLoading(true);
    setSentimentError(null);
    try {
      const res = await fetch("/api/crowd-sentiment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: market.question,
          comments: commentList.map((c) => c.text).filter(Boolean),
          tags: story.tags ?? [],
        }),
      });
      if (!res.ok) throw new Error("sentiment_failed");
      const data = await res.json();
      const summary = Array.isArray(data?.summary) ? data.summary.map(String).filter(Boolean).slice(0, 3) : [];
      if (!summary.length) {
        setSentimentError("No summary available yet.");
      } else {
        setSentimentSummary(summary);
      }
    } catch {
      setSentimentError("Unable to summarize chatter.");
    } finally {
      setSentimentLoading(false);
    }
  };

  const loadCoverage = useCallback(async ({ open }: { open: boolean }) => {
    if (!coverageQuery) return;
    if (open) setCoverageOpen(true);
    setCoverageLoading(true);
    setCoverageError(null);
    try {
      const res = await fetch("/api/coverage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...coveragePayload, limit: 6 }),
      });
      if (!res.ok) throw new Error("coverage_failed");
      const data = await res.json();
      const queryUsed = typeof data?.query === "string" ? data.query : coverageQuery;
      const fallbackQuery = coverageQuery || queryUsed;
      const items = Array.isArray(data?.results) ? data.results : [];
      const normalized: Array<{ title: string; url: string; sourceName: string; tags: string[] }> = items
        .map((entry: unknown) => {
          const a = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
          const title = String(a.title ?? "").trim();
          const url = String(a.url ?? "").trim();
          return {
            title,
            url,
            sourceName: String(a.sourceName ?? "").trim() || (url ? new URL(url).hostname.replace(/^www\./, "") : "Source"),
            tags: Array.isArray(a.tags) ? a.tags.map(String).filter((tag): tag is string => Boolean(tag)) : [],
          };
        })
        .filter((a: { title: string; url: string }) => a.title && a.url);
      if (normalized.length) {
        const storyTags = new Set((story.tags ?? []).map((t) => t.toLowerCase()));
        const filtered = normalized.filter((a: { title: string; tags: string[] }) => {
          const titleLower = a.title.toLowerCase();
          const hasPhrase = coverageAnchors.phrases.some((p) => p && titleLower.includes(p));
          const titleTokens = anchorTokens(a.title);
          const overlap = coverageAnchors.tokens.size
            ? Array.from(coverageAnchors.tokens).filter((t: string) => titleTokens.has(t)).length
            : 0;
          const tagOverlap = a.tags?.some((t) => storyTags.has(String(t).toLowerCase())) ?? false;
          if ((coverageAnchors.phrases.length || coverageAnchors.tokens.size) && !hasPhrase && overlap < 1) return false;
          if (tagOverlap) return true;
          return overlap >= 2;
        });
        setCoverageResults(filtered.length ? filtered.slice(0, 6) : normalized.slice(0, 6));
        return;
      }

      const fallback = await fetch(`/api/search?q=${encodeURIComponent(fallbackQuery)}&limit=6&techOnly=1`);
      if (fallback.ok) {
        const payload = await fallback.json();
        const alt = Array.isArray(payload?.articles) ? payload.articles : [];
        const normalizedAlt: Array<{ title: string; url: string; sourceName: string; tags: string[] }> = alt
          .map((entry: unknown) => {
            const a = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
            const title = String(a.title ?? "").trim();
            const url = String(a.url ?? "").trim();
            return {
              title,
              url,
              sourceName: String(a.sourceName ?? "Source"),
              tags: Array.isArray(a.tags) ? a.tags.map(String).filter((tag): tag is string => Boolean(tag)) : [],
            };
          })
          .filter((a: { title: string; url: string }) => a.title && a.url);
        if (normalizedAlt.length) {
          const storyTags = new Set((story.tags ?? []).map((t) => t.toLowerCase()));
          const filteredAlt = normalizedAlt.filter((a: { title: string; tags: string[] }) => {
            const titleLower = a.title.toLowerCase();
            const hasPhrase = coverageAnchors.phrases.some((p) => p && titleLower.includes(p));
            const titleTokens = anchorTokens(a.title);
            const overlap = coverageAnchors.tokens.size
              ? Array.from(coverageAnchors.tokens).filter((t: string) => titleTokens.has(t)).length
              : 0;
            const tagOverlap = a.tags?.some((t) => storyTags.has(String(t).toLowerCase())) ?? false;
            if ((coverageAnchors.phrases.length || coverageAnchors.tokens.size) && !hasPhrase && overlap < 1) return false;
            if (tagOverlap) return true;
            return overlap >= 2;
          });
          if (filteredAlt.length) {
            setCoverageResults(filteredAlt.slice(0, 6));
            return;
          }
          setCoverageResults([]);
          setCoverageError("No related coverage found yet.");
          return;
        }
      }

      setCoverageResults([]);
      setCoverageError("No related coverage found yet.");
    } catch {
      setCoverageResults([]);
      setCoverageError("Unable to load related coverage.");
    } finally {
      setCoverageLoading(false);
    }
  }, [coverageQuery, coveragePayload, coverageAnchors, story.tags]);

  const fetchCoverage = async () => loadCoverage({ open: true });

  useEffect(() => {
    if (!coverageQuery || !market) return;
    if (coverageFetchedRef.current === coverageQuery) return;
    coverageFetchedRef.current = coverageQuery;
    void loadCoverage({ open: true });
  }, [coverageQuery, market, loadCoverage]);

  if (!market) return null;

  return (
    <div className="h-full w-full">
      <div className="relative h-full w-full rounded-3xl bg-white shadow-xl ring-1 ring-slate-200 overflow-hidden">
        <div className="flex h-full flex-col p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                Prediction Market
              </span>
              <span className="text-xs text-slate-500">
                {market.platform === "polymarket" ? "Polymarket" : "Kalshi"}
              </span>
            </div>
            <div className="text-xs text-slate-500">Updated {updatedLabel}</div>
          </div>

          <div className="mt-5">
            <div className="text-xl font-semibold text-slate-900 leading-snug">{market.question}</div>
            <div className="mt-3 text-sm text-slate-600">{story.summary}</div>
            {displayTags.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {displayTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
              <span>Yes {yes.toFixed(0)}%</span>
              <span>No {no.toFixed(0)}%</span>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
              <div className="flex h-full">
                <div className="h-full bg-emerald-500" style={{ width: `${yes}%` }} />
                <div className="h-full bg-rose-500" style={{ width: `${no}%` }} />
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-slate-100 px-2.5 py-1">24h Vol {formatCurrency(market.volume24h)}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1">Liquidity {formatCurrency(market.liquidity)}</span>
            {commentList.length ? (
              <span className="rounded-full bg-slate-100 px-2.5 py-1">{commentList.length} comments</span>
            ) : null}
          </div>

          <div className="mt-5 flex-1 min-h-0 overflow-y-auto pr-1 space-y-4" data-feed-scroll-area="summary">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              {commentList.length ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold text-slate-600">Crowd Chatter</div>
                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    {commentList.map((c, idx) => (
                      <div key={`${c.author}-${idx}`} className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
                        <div className="text-xs font-semibold text-slate-500">{c.author}</div>
                        <div className="mt-1 text-sm text-slate-700">{c.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold text-slate-600">Crowd Chatter</div>
                  <div className="mt-2 text-sm text-slate-500">Market comment data unavailable.</div>
                </div>
              )}
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-slate-600">Crowd sentiment</div>
                      <div className="mt-1 text-xs text-slate-500">
                        A neutral summary of what people are discussing.
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={fetchSentiment}
                      disabled={sentimentLoading}
                    >
                      {sentimentLoading ? "Summarizing…" : sentimentSummary.length ? "Refresh" : "Summarize"}
                    </button>
                  </div>
                  {sentimentOpen ? (
                    <div className="mt-3 space-y-2 text-sm text-slate-700">
                      {sentimentError ? <div className="text-sm text-rose-600">{sentimentError}</div> : null}
                      {!sentimentError && sentimentSummary.length ? (
                        <ul className="list-disc space-y-2 pl-4 text-sm text-slate-700">
                          {sentimentSummary.map((line, idx) => (
                            <li key={`${idx}:${line}`}>{line}</li>
                          ))}
                        </ul>
                      ) : sentimentLoading ? null : sentimentError ? null : (
                        <div className="text-sm text-slate-500">No summary yet.</div>
                      )}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-slate-600">Related coverage</div>
                      <div className="mt-1 text-xs text-slate-500">Find reporting related to this market.</div>
                    </div>
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={fetchCoverage}
                      disabled={coverageLoading}
                    >
                      {coverageLoading ? "Searching…" : coverageResults.length ? "Refresh" : "Find coverage"}
                    </button>
                  </div>

                  {coverageOpen ? (
                    <div className="mt-3 space-y-2 text-sm text-slate-700">
                      {coverageError ? <div className="text-sm text-rose-600">{coverageError}</div> : null}
                      {!coverageError && coverageResults.length ? (
                        coverageResults.map((a) => (
                          <div key={a.url} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-slate-900">{a.title}</div>
                              <div className="text-xs text-slate-500">{a.sourceName}</div>
                            </div>
                            <a
                              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                              href={a.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open
                            </a>
                          </div>
                        ))
                      ) : coverageLoading ? null : coverageError ? null : (
                        <div className="text-sm text-slate-500">No related coverage yet.</div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

          </div>

          <div className="mt-auto flex flex-wrap items-center gap-3 pt-6">
            {specificMarketUrl ? (
              <a
                className="rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                href={specificMarketUrl}
                target="_blank"
                rel="noreferrer"
                onClick={onOpenMarket}
              >
                Open market ↗
              </a>
            ) : marketSearchUrl ? (
              <a
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                href={marketSearchUrl}
                target="_blank"
                rel="noreferrer"
                onClick={onOpenMarket}
              >
                Find market ↗
              </a>
            ) : (
              <span className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-600">
                Market link unavailable
              </span>
            )}
            <a
              className={cn("rounded-full px-4 py-2 text-xs font-semibold", "bg-slate-100 text-slate-700 hover:bg-slate-200")}
              href={platformUrl}
              target="_blank"
              rel="noreferrer"
            >
              {market.platform === "polymarket" ? "Polymarket ↗" : "Kalshi ↗"}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
