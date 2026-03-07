"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ClaimsDebatePanel } from "@/components/fundgraph/ClaimsDebatePanel";
import { EmergingOpportunitiesPanel } from "@/components/fundgraph/EmergingOpportunitiesPanel";
import { GraphEventsPanel } from "@/components/fundgraph/GraphEventsPanel";
import { GraphQuerySnapshotsPanel } from "@/components/fundgraph/GraphQuerySnapshotsPanel";
import { SignalMomentumGraph } from "@/components/fundgraph/SignalMomentumGraph";
import { ThemeDriversPanel } from "@/components/fundgraph/ThemeDriversPanel";
import { TodaysSignalsPanel } from "@/components/fundgraph/TodaysSignalsPanel";
import { TrendingFundsPanel } from "@/components/fundgraph/TrendingFundsPanel";
import {
  ClaimDebateItem,
  EmergingOpportunityItem,
  ForYouWindow,
  GraphEventItem,
  GraphQuerySnapshotItem,
  SignalConfidenceLevel,
  SignalMomentumTheme,
  ThemeDriverRow,
  TodaysSignalItem,
  TrendingFundPanelItem,
} from "@/components/fundgraph/forYouTypes";
import { WINDOW_MS } from "@/components/fundgraph/forYouMath";
import { deriveFundTrendDrivers } from "@/components/fundgraph/sentimentInsights";
import { useFundGraphState } from "@/fundgraph/state";
import { Fund, NewsClaim, Signal } from "@/fundgraph/types";
import {
  getCuratedThemeTitle,
  getSignalsThemeHref,
  mapClaimToCuratedTheme,
  mapSignalToCuratedTheme,
} from "@/lib/fundgraph/signalThemes";

const WINDOW_LABELS: Record<ForYouWindow, string> = {
  "24h": "last 24h",
  "72h": "last 72h",
  "7d": "last 7 days",
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function inRange(iso: string, startInclusive: number, endExclusive: number): boolean {
  const ts = +new Date(iso);
  return Number.isFinite(ts) && ts >= startInclusive && ts < endExclusive;
}

function ageHours(iso: string, nowTs: number): number {
  const ms = nowTs - +new Date(iso);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return ms / (1000 * 60 * 60);
}

function countSignalVotes(signal: Signal): { verified: number; disputed: number } {
  const verified = signal.verifiedCount ?? signal.verifyCount ?? signal.verifies ?? 0;
  const disputed = signal.disputedCount ?? signal.disagreeCount ?? signal.disagrees ?? 0;
  return { verified, disputed };
}

function countClaimVotes(claim: NewsClaim): { verified: number; disputed: number } {
  const verified = claim.community.verifiedCount ?? claim.community.verifyCount ?? claim.community.verifies ?? 0;
  const disputed = claim.community.disputedCount ?? claim.community.disagreeCount ?? claim.community.disagrees ?? 0;
  return { verified, disputed };
}

function signalIsContested(signal: Signal): boolean {
  const { verified, disputed } = countSignalVotes(signal);
  return disputed > verified;
}

function claimIsContested(claim: NewsClaim): boolean {
  const { verified, disputed } = countClaimVotes(claim);
  return disputed > verified;
}

function trustScore(signal: Signal): number {
  const direct = signal.trustScore;
  if (typeof direct === "number" && Number.isFinite(direct)) {
    return direct > 1 ? clamp(direct / 100, 0, 1) : clamp(direct, 0, 1);
  }

  const { verified, disputed } = countSignalVotes(signal);
  return clamp(0.52 + (verified - disputed) * 0.06, 0.05, 0.98);
}

function claimConfidence(claim: NewsClaim): number {
  const base =
    claim.verificationConfidence ??
    claim.llmVerification?.confidence ??
    claim.verification?.confidence ??
    claim.llmConfidence ??
    0.5;
  return clamp(base, 0, 1);
}

function confidenceLevel(value: number): SignalConfidenceLevel {
  if (value >= 0.75) return "High";
  if (value >= 0.58) return "Medium";
  return "Low";
}

function trimLine(input: string, max = 88): string {
  const text = input.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function themeSlugForSignal(signal: Signal): string {
  return mapSignalToCuratedTheme(signal);
}

function themeSlugForClaim(claim: NewsClaim): string {
  return mapClaimToCuratedTheme(claim);
}

function themeTitle(slug: string): string {
  return getCuratedThemeTitle(slug);
}

function themeHref(slug: string): string {
  return getSignalsThemeHref(slug);
}

function graphQueryHref(query: string): string {
  return `/cerebrosfund/graph?q=${encodeURIComponent(query)}`;
}

function signalCitationQuickHref(signalId: string): string {
  const encodedSignalId = encodeURIComponent(signalId);
  return `/cerebrosfund/signals?signalId=${encodedSignalId}&quickAction=addCitation#signal-${encodedSignalId}`;
}

function toTimestamp(iso: string): number | null {
  const timestamp = +new Date(iso);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function recencyDistanceHours(signal: Signal, claimTimestamp: number | null): number {
  if (claimTimestamp === null) return Number.POSITIVE_INFINITY;
  const signalTimestamp = toTimestamp(signal.createdAt);
  if (signalTimestamp === null) return Number.POSITIVE_INFINITY;
  return Math.abs(claimTimestamp - signalTimestamp) / (1000 * 60 * 60);
}

function compareSignalClaimMatch(left: Signal, right: Signal, claimTimestamp: number | null): number {
  const recencyDelta = recencyDistanceHours(left, claimTimestamp) - recencyDistanceHours(right, claimTimestamp);
  if (recencyDelta !== 0) return recencyDelta;
  if (left.confidence !== right.confidence) return right.confidence - left.confidence;
  return +new Date(right.createdAt) - +new Date(left.createdAt);
}

function resolveSignalForClaim(claim: NewsClaim, signalsByRecency: Signal[]): Signal | null {
  if (!signalsByRecency.length) return null;

  const claimTimestamp = toTimestamp(claim.createdAt);
  const claimSourceId = claim.sourceId?.trim();

  const sourceOrClaimMatches = signalsByRecency.filter((signal) => {
    if (signal.claimIds?.includes(claim.id)) return true;
    if (claimSourceId && signal.sourceId?.trim() === claimSourceId) return true;
    return false;
  });
  if (sourceOrClaimMatches.length) {
    return [...sourceOrClaimMatches].sort((left, right) => compareSignalClaimMatch(left, right, claimTimestamp))[0] ?? null;
  }

  const linkedFundIds = new Set(claim.linkedFundIds);
  const fundMatches = signalsByRecency.filter((signal) => linkedFundIds.has(signal.fundId));
  if (fundMatches.length) {
    return [...fundMatches].sort((left, right) => compareSignalClaimMatch(left, right, claimTimestamp))[0] ?? null;
  }

  return signalsByRecency[0] ?? null;
}

function hostLabelFromUrl(rawUrl: string | undefined): string {
  if (!rawUrl) return "";
  if (rawUrl.startsWith("/")) return "";
  try {
    const url = new URL(rawUrl);
    return url.hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function sourceLabelForSignal(signal: Signal): string {
  const host = hostLabelFromUrl(signal.evidence?.url || signal.evidenceUrl);
  if (host) return host;
  if (signal.source === "community") return "Inside community";
  return "Inside partners";
}

function offsetFromKey(key: string): number {
  let hash = 0;
  for (let idx = 0; idx < key.length; idx += 1) {
    hash = (hash * 31 + key.charCodeAt(idx)) >>> 0;
  }
  return (hash % 13) - 6;
}

function formatBinLabel(ts: number, window: ForYouWindow): string {
  const date = new Date(ts);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
  const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
  const hour24 = date.getUTCHours();
  const hour12 = hour24 % 12 || 12;
  const amPm = hour24 >= 12 ? "PM" : "AM";

  if (window === "24h") {
    return `${hour12} ${amPm}`;
  }
  if (window === "72h") {
    return `${weekdayNames[date.getUTCDay()] ?? "Day"} ${hour12} ${amPm}`;
  }
  return `${monthNames[date.getUTCMonth()] ?? "Mon"} ${date.getUTCDate()}`;
}

function buildBins(startInclusive: number, endExclusive: number, window: ForYouWindow, count = 7): Array<{ start: number; end: number; label: string }> {
  const span = Math.max(1, endExclusive - startInclusive);
  const step = span / count;
  return Array.from({ length: count }, (_, idx) => {
    const start = startInclusive + idx * step;
    const end = idx === count - 1 ? endExclusive + 1 : startInclusive + (idx + 1) * step;
    const mid = start + step / 2;
    return {
      start,
      end,
      label: formatBinLabel(mid, window),
    };
  });
}

export function ForYouPage({
  funds,
  signals,
  claims,
  recommendations,
  referenceNowMs,
  profileFilterApplied = false,
  profileFilterChips = [],
  onOpenCreditsGuide,
}: {
  funds: Fund[];
  signals: Signal[];
  claims: NewsClaim[];
  recommendations: Array<{ fund: Fund; score: number; reason: string }>;
  referenceNowMs: number;
  profileFilterApplied?: boolean;
  profileFilterChips?: string[];
  onOpenCreditsGuide: () => void;
}) {
  const { shortlistFundIds } = useFundGraphState();
  const [selectedWindow, setSelectedWindow] = useState<ForYouWindow>("24h");
  const shortlistFundIdSet = useMemo(() => new Set(shortlistFundIds), [shortlistFundIds]);

  const fundById = useMemo(() => {
    const map = new Map<string, Fund>();
    for (const fund of funds) map.set(fund.id, fund);
    return map;
  }, [funds]);

  const recommendationScoreByFund = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of recommendations) {
      if (!item?.fund?.id) continue;
      map.set(item.fund.id, item.score);
    }
    return map;
  }, [recommendations]);

  const watchlistFundIds = useMemo(() => {
    if (shortlistFundIdSet.size) {
      return shortlistFundIdSet;
    }
    const ids = recommendations.slice(0, 8).map((item) => item.fund.id);
    if (ids.length) return new Set(ids);
    return new Set(funds.slice(0, 8).map((fund) => fund.id));
  }, [funds, recommendations, shortlistFundIdSet]);

  const watchlistSectors = useMemo(() => {
    if (shortlistFundIdSet.size) {
      const out = new Set<string>();
      for (const fund of funds) {
        if (!shortlistFundIdSet.has(fund.id)) continue;
        for (const sector of fund.sectors.slice(0, 2)) out.add(sector);
      }
      if (out.size) return out;
    }

    const out = new Set<string>();
    for (const item of recommendations.slice(0, 8)) {
      for (const sector of item.fund.sectors.slice(0, 2)) out.add(sector);
    }
    if (!out.size) {
      for (const fund of funds.slice(0, 8)) {
        for (const sector of fund.sectors.slice(0, 2)) out.add(sector);
      }
    }
    return out;
  }, [funds, recommendations, shortlistFundIdSet]);

  const now = useMemo(() => {
    let maxTs = 0;
    for (const signal of signals) {
      const ts = +new Date(signal.createdAt);
      if (Number.isFinite(ts) && ts > maxTs) maxTs = ts;
    }
    for (const claim of claims) {
      const ts = +new Date(claim.createdAt);
      if (Number.isFinite(ts) && ts > maxTs) maxTs = ts;
    }
    return maxTs;
  }, [claims, signals]);

  const windowMs = WINDOW_MS[selectedWindow];
  const selectedWindowDays = selectedWindow === "24h" ? 1 : selectedWindow === "72h" ? 3 : 7;
  const currentStart = now - windowMs;
  const previousStart = now - windowMs * 2;

  const signalsByRecency = useMemo(
    () => [...signals].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [signals]
  );
  const claimsByRecency = useMemo(
    () => [...claims].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [claims]
  );

  const recentSignals = useMemo(() => {
    const inWindow = signals.filter((signal) => inRange(signal.createdAt, currentStart, now));
    if (inWindow.length) return inWindow;
    return signalsByRecency.slice(0, 96);
  }, [currentStart, now, signals, signalsByRecency]);

  const previousSignals = useMemo(
    () => signals.filter((signal) => inRange(signal.createdAt, previousStart, currentStart)),
    [currentStart, previousStart, signals]
  );

  const recentClaims = useMemo(() => {
    const inWindow = claims.filter((claim) => inRange(claim.createdAt, currentStart, now));
    if (inWindow.length) return inWindow;
    return claimsByRecency.slice(0, 80);
  }, [claims, claimsByRecency, currentStart, now]);

  const previousClaims = useMemo(
    () => claims.filter((claim) => inRange(claim.createdAt, previousStart, currentStart)),
    [claims, currentStart, previousStart]
  );

  const { momentumThemes, themeDrivers } = useMemo<{
    momentumThemes: SignalMomentumTheme[];
    themeDrivers: ThemeDriverRow[];
  }>(() => {
    type ThemeBucket = {
      slug: string;
      title: string;
      currentSignals: number;
      previousSignals: number;
      currentClaims: number;
      previousClaims: number;
      contestedCount: number;
      confidenceSum: number;
      confidenceWeight: number;
      bins: number[];
    };

    const bins = buildBins(currentStart, now, selectedWindow, 7);
    const bucketBySlug = new Map<string, ThemeBucket>();

    function ensureBucket(slug: string): ThemeBucket {
      const existing = bucketBySlug.get(slug);
      if (existing) return existing;
      const created: ThemeBucket = {
        slug,
        title: themeTitle(slug),
        currentSignals: 0,
        previousSignals: 0,
        currentClaims: 0,
        previousClaims: 0,
        contestedCount: 0,
        confidenceSum: 0,
        confidenceWeight: 0,
        bins: Array.from({ length: bins.length }, () => 0),
      };
      bucketBySlug.set(slug, created);
      return created;
    }

    const span = Math.max(1, now - currentStart);

    for (const signal of recentSignals) {
      const slug = themeSlugForSignal(signal);
      const bucket = ensureBucket(slug);
      bucket.currentSignals += 1;
      bucket.confidenceSum += signal.confidence;
      bucket.confidenceWeight += 1;
      if (signalIsContested(signal)) bucket.contestedCount += 1;

      const ts = +new Date(signal.createdAt);
      if (Number.isFinite(ts)) {
        const offset = clamp(ts - currentStart, 0, span - 1);
        const idx = Math.min(bins.length - 1, Math.floor((offset / span) * bins.length));
        bucket.bins[idx] += 1;
      }
    }

    for (const signal of previousSignals) {
      const slug = themeSlugForSignal(signal);
      const bucket = ensureBucket(slug);
      bucket.previousSignals += 1;
    }

    for (const claim of recentClaims) {
      const slug = themeSlugForClaim(claim);
      const bucket = ensureBucket(slug);
      bucket.currentClaims += 1;
      bucket.confidenceSum += claimConfidence(claim);
      bucket.confidenceWeight += 1;
      if (claimIsContested(claim)) bucket.contestedCount += 1;
    }

    for (const claim of previousClaims) {
      const slug = themeSlugForClaim(claim);
      const bucket = ensureBucket(slug);
      bucket.previousClaims += 1;
    }

    const rows = Array.from(bucketBySlug.values()).map((bucket) => {
      const supportCount = bucket.currentSignals + bucket.currentClaims;
      const previousSupport = bucket.previousSignals + bucket.previousClaims;
      const trendDelta = supportCount - previousSupport;
      const confidence = bucket.confidenceWeight ? bucket.confidenceSum / bucket.confidenceWeight : 0.5;
      const samples = bins.map((bin, idx) => ({ label: bin.label, value: bucket.bins[idx] ?? 0 }));
      const query = `funds investing in ${bucket.title}`;
      return {
        slug: bucket.slug,
        theme: bucket.title,
        signalCount: bucket.currentSignals,
        supportCount,
        trendDelta,
        contestedCount: bucket.contestedCount,
        confidence,
        samples,
        href: themeHref(bucket.slug),
        graphQuery: query,
        graphHref: graphQueryHref(query),
      };
    });

    const meaningfulRows = rows.filter((row) => row.supportCount > 0 || row.signalCount > 0 || row.trendDelta !== 0);
    const activeRows = meaningfulRows.length ? meaningfulRows : rows;

    const maxSupport = Math.max(1, ...activeRows.map((row) => row.supportCount));
    const maxAbsDelta = Math.max(1, ...activeRows.map((row) => Math.abs(row.trendDelta)));

    const scoredRows = activeRows.map((row) => {
      const supportNorm = row.supportCount / maxSupport;
      const momentumNorm = (row.trendDelta + maxAbsDelta) / (maxAbsDelta * 2);
      const contestedRatio = row.contestedCount / Math.max(1, row.supportCount);
      const score = clamp(Math.round(supportNorm * 45 + momentumNorm * 30 + row.confidence * 35 - contestedRatio * 28), 0, 100);
      return {
        ...row,
        score,
      };
    });

    const momentum = [...scoredRows]
      .sort((a, b) => Math.abs(b.trendDelta) + b.signalCount - (Math.abs(a.trendDelta) + a.signalCount))
      .slice(0, 4)
      .map((row) => ({
        slug: row.slug,
        theme: row.theme,
        signalCount: row.signalCount,
        trendDelta: row.trendDelta,
        confidence: row.confidence,
        samples: row.samples,
        href: row.href,
      } satisfies SignalMomentumTheme));

    const drivers = [...scoredRows]
      .sort((a, b) => b.score - a.score || b.supportCount - a.supportCount)
      .slice(0, 5)
      .map((row) => ({
        slug: row.slug,
        theme: row.theme,
        supportCount: row.supportCount,
        contestedCount: row.contestedCount,
        trendDelta: row.trendDelta,
        confidence: row.confidence,
        score: row.score,
        href: row.href,
        graphQuery: row.graphQuery,
        graphHref: row.graphHref,
      } satisfies ThemeDriverRow));

    return {
      momentumThemes: momentum,
      themeDrivers: drivers,
    };
  }, [currentStart, now, previousClaims, previousSignals, recentClaims, recentSignals, selectedWindow]);

  const todaysSignals = useMemo<TodaysSignalItem[]>(() => {
    const windowHours = windowMs / (1000 * 60 * 60);
    const rows = recentSignals.map((signal) => {
      const fund = fundById.get(signal.fundId);
      if (!fund) return null;

      const { verified, disputed } = countSignalVotes(signal);
      const voteActivity = verified + disputed;
      const signalTrust = trustScore(signal);
      const confidenceScore = clamp(Math.round((signalTrust * 0.55 + signal.confidence * 0.45) * 100), 0, 100);
      const impactScore = clamp(Math.round(fund.trendScore * 0.52 + signal.confidence * 35 + Math.min(22, voteActivity * 2.4)), 0, 100);

      const overlap = fund.sectors.some((sector) => watchlistSectors.has(sector));
      const networkProximity = watchlistFundIds.has(fund.id) ? 100 : overlap ? 72 : 44;

      const recency = clamp(
        Math.round(100 - (ageHours(signal.createdAt, now) / Math.max(windowHours, 1)) * 90),
        12,
        100
      );

      const priorityScore = Math.round(
        impactScore * 0.38 + confidenceScore * 0.28 + recency * 0.2 + networkProximity * 0.14
      );

      const sourceCount =
        1 +
        Number(Boolean(signal.evidence?.url || signal.evidenceUrl)) +
        Number(Boolean(signal.evidence?.snippet || signal.evidenceSnippet));

      const theme = themeTitle(themeSlugForSignal(signal));
      let rationale = `${theme} signal with elevated market impact.`;
      if (watchlistFundIds.has(fund.id)) {
        rationale = `${fund.name} is on your watchlist.`;
      } else if (disputed > verified) {
        rationale = "Contested signal with active verification disagreement.";
      } else if (confidenceScore >= 78) {
        rationale = "High-confidence signal with recent validation activity.";
      }

      return {
        id: signal.id,
        title: trimLine(signal.title, 110),
        fundName: fund.name,
        confidence: confidenceLevel(confidenceScore / 100),
        confidenceScore,
        sourceCount,
        sourceLabel: sourceLabelForSignal(signal),
        impactScore,
        recencyScore: recency,
        networkProximity,
        priorityScore,
        rationale,
        createdAt: signal.createdAt,
        href: `/cerebrosfund/signals?signalId=${encodeURIComponent(signal.id)}#signal-${encodeURIComponent(signal.id)}`,
      } satisfies TodaysSignalItem;
    });

    return rows
      .filter((item): item is TodaysSignalItem => item !== null)
      .sort((a, b) => b.priorityScore - a.priorityScore || b.impactScore - a.impactScore);
  }, [fundById, now, recentSignals, watchlistFundIds, watchlistSectors, windowMs]);

  const trendingFunds = useMemo<TrendingFundPanelItem[]>(() => {
    const recentByFund = new Map<string, Signal[]>();
    for (const signal of recentSignals) {
      const existing = recentByFund.get(signal.fundId) ?? [];
      existing.push(signal);
      recentByFund.set(signal.fundId, existing);
    }

    const previousCountByFund = new Map<string, number>();
    for (const signal of previousSignals) {
      previousCountByFund.set(signal.fundId, (previousCountByFund.get(signal.fundId) ?? 0) + 1);
    }

    return [...funds]
      .map((fund) => {
        const recentForFund = (recentByFund.get(fund.id) ?? []).sort((a, b) => {
          const aVotes = countSignalVotes(a).verified + countSignalVotes(a).disputed;
          const bVotes = countSignalVotes(b).verified + countSignalVotes(b).disputed;
          return b.confidence + bVotes * 0.04 - (a.confidence + aVotes * 0.04);
        });

        const recentCount = recentForFund.length;
        const previousCount = previousCountByFund.get(fund.id) ?? 0;
        const recScore = recommendationScoreByFund.get(fund.id) ?? 0;

        const trendScore = clamp(Math.round(fund.trendScore * 0.68 + recentCount * 5 + recScore * 0.5), 0, 100);
        const trendDelta = recentCount - previousCount;
        const graphQuery = `companies ${fund.name} invested in`;

        const trendDrivers = deriveFundTrendDrivers(fund, recentForFund, selectedWindowDays, now);

        return {
          fundId: fund.id,
          fundName: fund.name,
          trendScore,
          trendDelta,
          trendDrivers,
          aumM: fund.aumM,
          stage: fund.stages.slice(0, 2).join(" / ") || "Multi-stage",
          href: `/cerebrosfund/funds/${encodeURIComponent(fund.id)}`,
          graphQuery,
          graphHref: graphQueryHref(graphQuery),
          _rank: trendScore + Math.max(0, trendDelta * 2),
        };
      })
      .sort((a, b) => b._rank - a._rank)
      .slice(0, 4)
      .map((item) => ({
        fundId: item.fundId,
        fundName: item.fundName,
        trendScore: item.trendScore,
        trendDelta: item.trendDelta,
        trendDrivers: item.trendDrivers,
        aumM: item.aumM,
        stage: item.stage,
        href: item.href,
        graphQuery: item.graphQuery,
        graphHref: item.graphHref,
      }));
  }, [funds, now, previousSignals, recentSignals, recommendationScoreByFund, selectedWindowDays]);

  const claimsDebate = useMemo<ClaimDebateItem[]>(() => {
    const citationSignalPool = recentSignals.length ? recentSignals : signalsByRecency;
    if (recentClaims.length) {
      return recentClaims
        .map((claim) => {
          const { verified, disputed } = countClaimVotes(claim);
          const confidence = claimConfidence(claim);
          const recencyWeight = clamp(48 - ageHours(claim.createdAt, now), 0, 48);
          const score = disputed * 2.2 + verified * 1.4 + confidence * 24 + recencyWeight;
          const linkedFundNames = claim.linkedFundIds
            .map((fundId) => fundById.get(fundId)?.name)
            .filter((name): name is string => Boolean(name));
          const theme = themeTitle(themeSlugForClaim(claim));
          const graphQuery =
            linkedFundNames.length >= 2
              ? `common investments between ${linkedFundNames[0]} and ${linkedFundNames[1]}`
              : linkedFundNames.length === 1
                ? `companies ${linkedFundNames[0]} invested in`
                : `funds investing in ${theme}`;
          const graphHref = `/cerebrosfund/graph?claimId=${encodeURIComponent(claim.id)}&q=${encodeURIComponent(graphQuery)}`;
          const citationSignal = resolveSignalForClaim(claim, citationSignalPool);
          return {
            id: claim.id,
            claim: trimLine(claim.claimText, 120),
            supportCount: verified,
            contestedCount: disputed,
            confidence,
            createdAt: claim.createdAt,
            href: graphHref,
            addCitationHref: citationSignal ? signalCitationQuickHref(citationSignal.id) : "/cerebrosfund/signals",
            graphQuery,
            score,
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((item) => ({
          id: item.id,
          claim: item.claim,
          supportCount: item.supportCount,
          contestedCount: item.contestedCount,
          confidence: item.confidence,
          createdAt: item.createdAt,
          href: item.href,
          addCitationHref: item.addCitationHref,
          graphQuery: item.graphQuery,
        }));
    }

    return recentSignals
      .map((signal) => {
        const { verified, disputed } = countSignalVotes(signal);
        const score = disputed * 2 + verified + signal.confidence * 20;
        const fundName = fundById.get(signal.fundId)?.name ?? "Tracked fund";
        const graphQuery = `companies ${fundName} invested in`;
        return {
          id: `signal-fallback-${signal.id}`,
          claim: trimLine(signal.title, 120),
          supportCount: verified,
          contestedCount: disputed,
          confidence: clamp(signal.confidence, 0, 1),
          createdAt: signal.createdAt,
          href: graphQueryHref(graphQuery),
          addCitationHref: signalCitationQuickHref(signal.id),
          graphQuery,
          score,
        };
      })
      .filter((item) => item.supportCount > 0 || item.contestedCount > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((item) => ({
        id: item.id,
        claim: item.claim,
        supportCount: item.supportCount,
        contestedCount: item.contestedCount,
        confidence: item.confidence,
        createdAt: item.createdAt,
        href: item.href,
        addCitationHref: item.addCitationHref,
        graphQuery: item.graphQuery,
      }));
  }, [fundById, now, recentClaims, recentSignals, signalsByRecency]);

  const graphEvents = useMemo<GraphEventItem[]>(() => {
    const events: GraphEventItem[] = [];

    const topFunds = trendingFunds
      .map((item) => fundById.get(item.fundId))
      .filter((fund): fund is Fund => Boolean(fund));

    let bestPair: { a: Fund; b: Fund; overlap: number } | null = null;
    for (let i = 0; i < topFunds.length; i += 1) {
      for (let j = i + 1; j < topFunds.length; j += 1) {
        const a = topFunds[i];
        const b = topFunds[j];
        const overlap = (a.coInvestors ?? []).filter((name) => (b.coInvestors ?? []).includes(name)).length;
        if (!bestPair || overlap > bestPair.overlap) {
          bestPair = { a, b, overlap };
        }
      }
    }

    if (bestPair && bestPair.overlap > 0) {
      const graphQuery = `common investments between ${bestPair.a.name} and ${bestPair.b.name}`;
      events.push({
        id: "event-co-investment",
        kind: "co-investment",
        text: `${bestPair.a.name} and ${bestPair.b.name} share ${bestPair.overlap} active co-investor links in this window.`,
        href: graphQueryHref(graphQuery),
        graphQuery,
      });
    }

    const founderKeywords = ["founder", "founded", "alumni", "hiring", "joins", "team"];
    const founderSignals = recentSignals.filter((signal) => {
      const text = normalizeText(`${signal.title} ${signal.summary}`);
      return founderKeywords.some((keyword) => text.includes(keyword));
    });

    if (founderSignals.length) {
      const topFounderSignal = [...founderSignals].sort((a, b) => b.confidence - a.confidence)[0];
      const fundName = fundById.get(topFounderSignal.fundId)?.name ?? "Tracked fund";
      const graphQuery = `founders ${fundName} invested in`;
      events.push({
        id: "event-founder-movement",
        kind: "founder-movement",
        text: `${founderSignals.length} founder-network signals surfaced, led by activity around ${fundName}.`,
        href: graphQueryHref(graphQuery),
        graphQuery,
      });
    }

    const relationshipKeywords = ["raise", "raises", "led", "invest", "partnership", "acquire", "launch"];
    const relationshipSignals = recentSignals.filter((signal) => {
      const text = normalizeText(`${signal.title} ${signal.summary}`);
      return relationshipKeywords.some((keyword) => text.includes(keyword));
    });

    if (relationshipSignals.length) {
      const strongest = [...relationshipSignals].sort((a, b) => b.confidence - a.confidence)[0];
      const fund = fundById.get(strongest.fundId);
      const fundName = fund?.name ?? "Tracked fund";
      const anchorCompany = fund?.portfolio[0];
      const graphQuery = anchorCompany ? `path between ${fundName} and ${anchorCompany}` : `companies ${fundName} invested in`;
      events.push({
        id: "event-network-change",
        kind: "network-change",
        text: `${relationshipSignals.length} relationship-change signals detected (${WINDOW_LABELS[selectedWindow]}), strongest near ${fundName}.`,
        href: graphQueryHref(graphQuery),
        graphQuery,
      });
    }

    const topDebate = claimsDebate[0];
    if (topDebate) {
      events.push({
        id: "event-top-debate",
        kind: "network-change",
        text: `Verification activity spiked on: “${trimLine(topDebate.claim, 86)}” (${topDebate.supportCount} support / ${topDebate.contestedCount} contested).`,
        href: topDebate.href,
        graphQuery: topDebate.graphQuery,
      });
    }

    return events.slice(0, 4);
  }, [claimsDebate, fundById, recentSignals, selectedWindow, trendingFunds]);

  const emergingOpportunities = useMemo<EmergingOpportunityItem[]>(() => {
    const seeds = themeDrivers.slice(0, 6);
    if (!seeds.length) return [];

    const maxSupport = Math.max(1, ...seeds.map((row) => row.supportCount));
    const minDelta = Math.min(...seeds.map((row) => row.trendDelta));
    const maxDelta = Math.max(...seeds.map((row) => row.trendDelta));
    const minScore = Math.min(...seeds.map((row) => row.score));
    const maxScore = Math.max(...seeds.map((row) => row.score));

    return seeds.map((row) => {
      const deltaSpan = maxDelta - minDelta;
      const scoreSpan = maxScore - minScore;
      const xNorm = deltaSpan > 0 ? (row.trendDelta - minDelta) / deltaSpan : 0.5;
      const yNorm = scoreSpan > 0 ? (row.score - minScore) / scoreSpan : 0.5;
      const x = clamp(Math.round(16 + xNorm * 68 + offsetFromKey(row.slug) * 0.8), 8, 92);
      const y = clamp(Math.round(24 + yNorm * 64 + offsetFromKey(`${row.slug}-y`) * 0.45), 14, 94);
      const size = clamp(Math.round(34 + (row.supportCount / maxSupport) * 34 + row.confidence * 10), 34, 78);

      return {
        id: row.slug,
        label: row.theme,
        impactScore: row.score,
        trendDelta: row.trendDelta,
        supportCount: row.supportCount,
        contestedCount: row.contestedCount,
        confidence: row.confidence,
        x,
        y,
        size,
        href: row.graphHref,
        graphQuery: row.graphQuery,
      } satisfies EmergingOpportunityItem;
    });
  }, [themeDrivers]);

  const graphQuerySnapshots = useMemo<GraphQuerySnapshotItem[]>(() => {
    const items: GraphQuerySnapshotItem[] = [];

    const topTheme = themeDrivers[0];
    if (topTheme) {
      items.push({
        id: `snapshot-theme-${topTheme.slug}`,
        title: `${topTheme.theme} is one of the highest-impact themes`,
        subtitle: `${topTheme.supportCount} support signals and claims with a ${topTheme.trendDelta >= 0 ? "+" : ""}${topTheme.trendDelta} momentum shift.`,
        sourceLabel: "Highest-impact themes",
        href: topTheme.graphHref,
        query: topTheme.graphQuery,
      });
    }

    const topClaim = claimsDebate[0];
    if (topClaim) {
      items.push({
        id: `snapshot-claim-${topClaim.id}`,
        title: "Debated claim with active verification pressure",
        subtitle: `${topClaim.supportCount} support vs ${topClaim.contestedCount} contested votes.`,
        sourceLabel: "Debated claims",
        href: topClaim.href,
        query: topClaim.graphQuery,
      });
    }

    const topFund = trendingFunds[0];
    if (topFund) {
      items.push({
        id: `snapshot-fund-${topFund.fundId}`,
        title: `${topFund.fundName} is moving in entity trends`,
        subtitle: `Trend ${topFund.trendScore} with ${topFund.trendDelta >= 0 ? "+" : ""}${topFund.trendDelta} recent delta.`,
        sourceLabel: "Entities moving",
        href: topFund.graphHref,
        query: topFund.graphQuery,
      });
    }

    const relationship = graphEvents[0];
    if (relationship) {
      items.push({
        id: `snapshot-event-${relationship.id}`,
        title: "Relationship event worth investigating",
        subtitle: relationship.text,
        sourceLabel: "Network relationships",
        href: relationship.href,
        query: relationship.graphQuery,
      });
    }

    const topSignal = todaysSignals[0];
    if (topSignal) {
      const query = `companies ${topSignal.fundName} invested in`;
      items.push({
        id: `snapshot-signal-${topSignal.id}`,
        title: "Today’s brief anchor signal",
        subtitle: `${topSignal.title} (${topSignal.sourceLabel}, ${topSignal.sourceCount} sources).`,
        sourceLabel: "Today's brief",
        href: graphQueryHref(query),
        query,
      });
    }

    const uniqueByHref = new Map<string, GraphQuerySnapshotItem>();
    for (const item of items) {
      if (uniqueByHref.has(item.href)) continue;
      uniqueByHref.set(item.href, item);
    }

    return Array.from(uniqueByHref.values()).slice(0, 6);
  }, [claimsDebate, graphEvents, themeDrivers, todaysSignals, trendingFunds]);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">For You</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Decision cockpit</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              See what changed in the market, why it matters, and what signals to investigate next.
            </p>
            {profileFilterApplied ? (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2">
                <p className="text-xs font-semibold text-emerald-900">This feed is personalized from your LP profile preferences.</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {profileFilterChips.slice(0, 10).map((chip) => (
                    <span key={chip} className="inline-flex rounded-full border border-emerald-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                      {chip}
                    </span>
                  ))}
                  <Link href="/cerebrosfund/profile" className="text-[11px] font-semibold text-emerald-900 underline underline-offset-2">
                    Edit profile
                  </Link>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
              {(["24h", "72h", "7d"] as ForYouWindow[]).map((window) => (
                <button
                  key={window}
                  type="button"
                  onClick={() => setSelectedWindow(window)}
                  className={`rounded-full px-3 py-1 ${
                    selectedWindow === window ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {window}
                </button>
              ))}
            </div>

            <Link
              href="/cerebrosfund/profile"
              className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Tune profile
            </Link>

            <Link
              href="/cerebrosfund/shortlist"
              className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Open shortlist
            </Link>

            <button
              type="button"
              onClick={onOpenCreditsGuide}
              className="inline-flex h-9 items-center rounded-full border border-slate-300 bg-slate-50 px-4 text-xs font-semibold text-slate-700 hover:bg-white"
            >
              How to earn credits
            </button>
          </div>
        </div>
      </section>

      <SignalMomentumGraph items={momentumThemes} windowLabel={WINDOW_LABELS[selectedWindow]} />

      <div className="grid gap-4 xl:grid-cols-2">
        <TrendingFundsPanel items={trendingFunds} />
        <TodaysSignalsPanel items={todaysSignals.slice(0, 5)} referenceNowMs={referenceNowMs} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ClaimsDebatePanel items={claimsDebate} referenceNowMs={referenceNowMs} />
        <EmergingOpportunitiesPanel items={emergingOpportunities} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <GraphEventsPanel items={graphEvents} />
        <ThemeDriversPanel items={themeDrivers} />
      </div>

      <GraphQuerySnapshotsPanel items={graphQuerySnapshots} />
    </div>
  );
}
