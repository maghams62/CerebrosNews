"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SignalCard } from "@/components/fundgraph/SignalCard";
import { UnlockBanner } from "@/components/fundgraph/UnlockBanner";
import { useFundGraphState } from "@/fundgraph/state";
import { Fund, Signal } from "@/fundgraph/types";
import { listProfileFilterChips, profileHasActiveSignalFeedFilters, signalMatchesUserProfile } from "@/fundgraph/profilePreferences";
import { curateSignalsForFeed } from "@/lib/fundgraph/quality";
import { getThemeFilterOptions, parseThemeFilter, signalMatchesTheme } from "@/lib/fundgraph/signalThemes";

const MAX_SIGNAL_CARDS = 500;
const CONFIDENCE_FILTERS = ["All", "High", "Medium", "Emerging"] as const;
type ConfidenceFilter = (typeof CONFIDENCE_FILTERS)[number];
const PINNED_SIGNAL_TITLE = "Andreessen Horowitz: Why AI startups are selling the same equity at two different prices";
const PINNED_SIGNAL_SUMMARY = "Some AI founders are using a novel valuation mechanism to manufacture unicorn status.";
const PINNED_SIGNAL_AUTHOR = "TechCrunch Startups";

function normalizeFeedText(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function signalDuplicateKey(signal: Signal): string {
  return `${signal.fundId}::${normalizeFeedText(signal.title)}`;
}

function isPinnedSignal(signal: Signal): boolean {
  return (
    normalizeFeedText(signal.title) === normalizeFeedText(PINNED_SIGNAL_TITLE) &&
    normalizeFeedText(signal.summary) === normalizeFeedText(PINNED_SIGNAL_SUMMARY) &&
    normalizeFeedText(signal.authorName) === normalizeFeedText(PINNED_SIGNAL_AUTHOR) &&
    signal.confidence >= 0.85
  );
}

function isIndexFundSignal(signal: Signal, fundById: Record<string, Fund>): boolean {
  if (signal.fundId.toLowerCase().includes("index-ventures")) return true;
  const fundName = fundById[signal.fundId]?.name ?? "";
  if (normalizeFeedText(fundName).includes("index ventures")) return true;
  return normalizeFeedText(signal.title).startsWith("index ventures:");
}

function matchesConfidenceFilter(confidence: number, filter: ConfidenceFilter): boolean {
  if (filter === "All") return true;
  if (filter === "High") return confidence >= 0.78;
  if (filter === "Medium") return confidence >= 0.62 && confidence < 0.78;
  return confidence < 0.62;
}

function signalSearchHaystack(signal: Signal, fundName: string): string {
  const snapshot = signal.articleSnapshot;
  const keyFactText = (snapshot?.keyFacts ?? []).flatMap((fact) => [fact.label, fact.value, fact.citationId]);
  const evidenceQuoteText = (snapshot?.evidenceQuotes ?? []).flatMap((quote) => [quote.text, quote.url, quote.citationId]);

  return [
    signal.id,
    signal.title,
    signal.summary,
    signal.authorName,
    signal.author,
    signal.sourceId,
    signal.sourceTitle,
    signal.evidenceUrl,
    signal.evidenceSnippet,
    signal.evidence?.url,
    signal.evidence?.snippet,
    fundName,
    signal.fundId,
    ...(signal.tags ?? []),
    snapshot?.headline,
    snapshot?.sourceName,
    snapshot?.sourceUrl,
    snapshot?.publishedAt,
    snapshot?.excerpt,
    ...(snapshot?.bullets ?? []),
    ...keyFactText,
    ...evidenceQuoteText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function SignalsFeed({
  signals,
  fundNameById,
  fundById,
}: {
  signals: Signal[];
  fundNameById: Record<string, string>;
  fundById: Record<string, Fund>;
}) {
  const { profilePreferences } = useFundGraphState();
  const searchParams = useSearchParams();
  const queryParam = useMemo(() => searchParams.get("q")?.trim() ?? "", [searchParams]);
  const themeParam = useMemo(() => parseThemeFilter(searchParams.get("theme")), [searchParams]);
  const [query, setQuery] = useState(queryParam);
  const [fundId, setFundId] = useState("All");
  const [confidence, setConfidence] = useState<ConfidenceFilter>("All");
  const [themeSlug, setThemeSlug] = useState(themeParam);
  const [useProfileFilters, setUseProfileFilters] = useState(false);
  const autoOpenSignalId = useMemo(() => searchParams.get("signalId")?.trim() || null, [searchParams]);
  const autoOpenCitationComposer = useMemo(() => {
    const quickAction = searchParams.get("quickAction")?.trim().toLowerCase();
    return quickAction === "addcitation" || quickAction === "add-citation";
  }, [searchParams]);
  const themeOptions = useMemo(() => getThemeFilterOptions(signals), [signals]);
  const profileFilterChips = useMemo(() => listProfileFilterChips(profilePreferences), [profilePreferences]);
  const hasSavedProfileFilters = useMemo(
    () => profileHasActiveSignalFeedFilters(profilePreferences),
    [profilePreferences]
  );

  useEffect(() => {
    setThemeSlug(themeParam);
  }, [themeParam]);

  useEffect(() => {
    setQuery(queryParam);
  }, [queryParam]);

  useEffect(() => {
    if (!hasSavedProfileFilters) setUseProfileFilters(false);
  }, [hasSavedProfileFilters]);

  const fundOptions = useMemo(() => {
    const ids = Array.from(new Set(signals.map((signal) => signal.fundId).filter(Boolean)));
    return ids
      .map((id) => ({ id, name: fundNameById[id] ?? id }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [signals, fundNameById]);

  const matchingSignals = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return signals.filter((signal) => {
      if (fundId !== "All" && signal.fundId !== fundId) return false;
      if (!matchesConfidenceFilter(signal.confidence, confidence)) return false;
      if (!signalMatchesTheme(signal, themeSlug)) return false;
      if (useProfileFilters && hasSavedProfileFilters && !signalMatchesUserProfile(signal, fundById, profilePreferences)) return false;
      if (!normalizedQuery) return true;
      const haystack = signalSearchHaystack(signal, fundNameById[signal.fundId] ?? signal.fundId);
      return haystack.includes(normalizedQuery);
    });
  }, [confidence, fundById, fundId, fundNameById, hasSavedProfileFilters, profilePreferences, query, signals, themeSlug, useProfileFilters]);

  const curatedSignals = useMemo(
    () => curateSignalsForFeed(matchingSignals, { maxPerFund: 0, surface: "fund" }),
    [matchingSignals]
  );
  const orderedSignals = useMemo(() => {
    if (curatedSignals.length <= 1) return curatedSignals;
    const duplicateCounts = new Map<string, number>();
    for (const signal of curatedSignals) {
      const key = signalDuplicateKey(signal);
      duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + 1);
    }

    return curatedSignals
      .map((signal, index) => ({
        signal,
        index,
        pinned: isPinnedSignal(signal),
        indexFund: isIndexFundSignal(signal, fundById),
        duplicate: (duplicateCounts.get(signalDuplicateKey(signal)) ?? 0) > 1,
      }))
      .sort((left, right) => {
        if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
        if (left.duplicate !== right.duplicate) return left.duplicate ? 1 : -1;
        if (left.indexFund !== right.indexFund) return left.indexFund ? 1 : -1;
        return left.index - right.index;
      })
      .map((entry) => entry.signal);
  }, [curatedSignals, fundById]);
  const visibleSignals = useMemo(() => {
    const base = orderedSignals.slice(0, MAX_SIGNAL_CARDS);
    if (!autoOpenSignalId || base.some((signal) => signal.id === autoOpenSignalId)) return base;
    const autoOpenSignal = signals.find((signal) => signal.id === autoOpenSignalId);
    if (!autoOpenSignal) return base;
    return [autoOpenSignal, ...base.filter((signal) => signal.id !== autoOpenSignalId)].slice(0, MAX_SIGNAL_CARDS);
  }, [autoOpenSignalId, orderedSignals, signals]);
  const hiddenCount = Math.max(0, orderedSignals.length - visibleSignals.length);

  return (
    <>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition duration-150 hover:shadow-md">
        <div className="grid gap-2 lg:grid-cols-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search signals, tags, sources, URLs, and fund names"
            className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-400"
          />
          <select
            value={fundId}
            onChange={(event) => setFundId(event.target.value)}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="All">All funds</option>
            {fundOptions.map((fund) => (
              <option key={fund.id} value={fund.id}>
                {fund.name}
              </option>
            ))}
          </select>
          <select
            value={confidence}
            onChange={(event) => setConfidence(event.target.value as ConfidenceFilter)}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm"
          >
            {CONFIDENCE_FILTERS.map((item) => (
              <option key={item} value={item}>
                {item} confidence
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setThemeSlug("all")}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              themeSlug === "all" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            All themes
          </button>
          {themeOptions.map((theme) => (
            <button
              key={theme.slug}
              type="button"
              onClick={() => setThemeSlug(theme.slug)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                themeSlug === theme.slug
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {theme.title} ({theme.count})
            </button>
          ))}
        </div>
        {hasSavedProfileFilters ? (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-emerald-900">LP profile filters are {useProfileFilters ? "on" : "off"} for this signals feed.</p>
              <button
                type="button"
                onClick={() => setUseProfileFilters((current) => !current)}
                className="inline-flex h-7 items-center rounded-full border border-emerald-300 bg-white px-3 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                {useProfileFilters ? "Disable profile filters" : "Enable profile filters"}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {profileFilterChips.map((chip) => (
                <span key={chip} className="inline-flex rounded-full border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                  {chip}
                </span>
              ))}
              <Link href="/cerebrosfund/profile" className="text-[11px] font-semibold text-emerald-900 underline underline-offset-2">
                Edit profile
              </Link>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500">
            No LP profile filters saved yet. Save preferences in{" "}
            <Link href="/cerebrosfund/profile" className="font-semibold text-slate-700 underline underline-offset-2">
              My Profile
            </Link>{" "}
            to personalize this feed.
          </p>
        )}
        <p className="mt-3 text-xs font-semibold text-slate-500">
          {matchingSignals.length} raw matches, {curatedSignals.length} quality-passing unique signals
        </p>
      </section>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {visibleSignals.map((signal) => (
          <SignalCard
            key={signal.id}
            signal={signal}
            fundName={fundNameById[signal.fundId] ?? signal.fundId}
            initiallyOpen={autoOpenSignalId === signal.id}
            initiallyOpenAddCitation={autoOpenCitationComposer && autoOpenSignalId === signal.id}
          />
        ))}
      </section>
      {!visibleSignals.length ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">
          No signals match these filters.
        </div>
      ) : null}

      {visibleSignals.length > 0 ? (
        <UnlockBanner
          title="Signals are free to browse."
          detail="Unlock deep analysis inside each signal when you need implications, scenarios, and related patterns."
        />
      ) : null}
      {hiddenCount > 0 ? (
        <p className="mt-3 text-xs text-slate-500">
          Showing top {visibleSignals.length} signals for this filter. {hiddenCount} additional signals are hidden.
        </p>
      ) : null}
    </>
  );
}
