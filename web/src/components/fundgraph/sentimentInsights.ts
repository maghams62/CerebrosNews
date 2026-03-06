import { Fund, Signal, SignalStanceType } from "@/fundgraph/types";

export interface SignalStanceCounts {
  bullish: number;
  neutral: number;
  bearish: number;
  total: number;
}

export interface FundSentimentSummaryData {
  counts: SignalStanceCounts;
  dominant: SignalStanceType | "mixed" | "none";
  shiftLabel: string;
}

export interface FundSignalActivitySummaryData {
  signalsLastWindow: number;
  verifiedSignals: number;
  challengedSignals: number;
  dominantSentiment: SignalStanceType | "mixed" | "none";
  latestMovement: string | null;
}

const TREND_KEYWORDS: Array<{ key: string; regex: RegExp; label: string }> = [
  { key: "ai-infra", regex: /\b(ai|inference|gpu|chip|compute|infrastructure)\b/i, label: "AI infra" },
  { key: "hiring", regex: /\b(hiring|headcount|team growth|talent)\b/i, label: "portfolio hiring spike" },
  { key: "co-invest", regex: /\b(co-?invest|syndicate|alongside)\b/i, label: "co-investment activity" },
  { key: "founder", regex: /\b(founder|referral|alumni)\b/i, label: "founder network" },
  { key: "follow-on", regex: /\b(series a|series b|follow-?on)\b/i, label: "follow-on rounds" },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function trimLine(input: string, max = 86): string {
  const text = input.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function signalTimestamp(signal: Signal): number {
  const ts = +new Date(signal.createdAt);
  return Number.isFinite(ts) ? ts : 0;
}

function signalStanceValue(signal: Signal, stance: SignalStanceType): number {
  if (stance === "bullish") return Math.max(0, Math.floor(signal.bullishCount ?? signal.upvotes ?? 0));
  if (stance === "neutral") return Math.max(0, Math.floor(signal.neutralCount ?? 0));
  return Math.max(0, Math.floor(signal.bearishCount ?? 0));
}

export function signalStanceCounts(signal: Signal): SignalStanceCounts {
  const bullish = signalStanceValue(signal, "bullish");
  const neutral = signalStanceValue(signal, "neutral");
  const bearish = signalStanceValue(signal, "bearish");
  return { bullish, neutral, bearish, total: bullish + neutral + bearish };
}

export function dominantStance(counts: SignalStanceCounts): SignalStanceType | "mixed" | "none" {
  if (!counts.total) return "none";
  const maxValue = Math.max(counts.bullish, counts.neutral, counts.bearish);
  const winners = [
    counts.bullish === maxValue ? "bullish" : null,
    counts.neutral === maxValue ? "neutral" : null,
    counts.bearish === maxValue ? "bearish" : null,
  ].filter(Boolean) as SignalStanceType[];
  if (winners.length !== 1) return "mixed";
  return winners[0];
}

export function stanceLabel(stance: SignalStanceType | "mixed" | "none"): string {
  if (stance === "bullish") return "Bullish";
  if (stance === "neutral") return "Neutral";
  if (stance === "bearish") return "Bearish";
  if (stance === "mixed") return "Mixed";
  return "No stance";
}

export function signalsInWindow(signals: Signal[], days: number, nowTs = Date.now()): Signal[] {
  const windowMs = Math.max(1, days) * 24 * 60 * 60 * 1000;
  const start = nowTs - windowMs;
  return signals
    .filter((signal) => {
      const ts = signalTimestamp(signal);
      return ts >= start && ts <= nowTs;
    })
    .sort((a, b) => signalTimestamp(b) - signalTimestamp(a));
}

function aggregateCounts(signals: Signal[]): SignalStanceCounts {
  let bullish = 0;
  let neutral = 0;
  let bearish = 0;
  for (const signal of signals) {
    bullish += signalStanceValue(signal, "bullish");
    neutral += signalStanceValue(signal, "neutral");
    bearish += signalStanceValue(signal, "bearish");
  }
  return { bullish, neutral, bearish, total: bullish + neutral + bearish };
}

export function buildFundSentimentSummary(
  signals: Signal[],
  windowDays = 30,
  nowTs = Date.now()
): FundSentimentSummaryData {
  const currentSignals = signalsInWindow(signals, windowDays, nowTs);
  const previousSignals = signalsInWindow(signals, windowDays, nowTs - windowDays * 24 * 60 * 60 * 1000);
  const counts = aggregateCounts(currentSignals);
  const dominant = dominantStance(counts);

  const currentBias = counts.bullish - counts.bearish;
  const previousCounts = aggregateCounts(previousSignals);
  const previousBias = previousCounts.bullish - previousCounts.bearish;
  const delta = currentBias - previousBias;

  let shiftLabel = "Stable sentiment";
  if (delta >= 2) shiftLabel = "Recent sentiment shift: turning bullish";
  else if (delta <= -2) shiftLabel = "Recent sentiment shift: turning bearish";
  else if (counts.total > 0) shiftLabel = "Recent sentiment shift: mostly stable";

  return {
    counts,
    dominant,
    shiftLabel,
  };
}

export function buildFundSignalActivitySummary(
  signals: Signal[],
  windowDays = 30,
  nowTs = Date.now()
): FundSignalActivitySummaryData {
  const recent = signalsInWindow(signals, windowDays, nowTs);
  const verifiedSignals = recent.filter((signal) => (signal.verifiedCount ?? signal.verifyCount ?? signal.verifies ?? 0) > 0).length;
  const challengedSignals = recent.filter((signal) => (signal.disputedCount ?? signal.disagreeCount ?? signal.disagrees ?? 0) > 0).length;
  const dominantSentiment = dominantStance(aggregateCounts(recent));
  const latestMovement = recent[0] ? trimLine(recent[0].title, 74) : null;

  return {
    signalsLastWindow: recent.length,
    verifiedSignals,
    challengedSignals,
    dominantSentiment,
    latestMovement,
  };
}

export function deriveFundTrendDrivers(
  fund: Fund,
  signals: Signal[],
  windowDays = 30,
  nowTs = Date.now()
): string[] {
  const recent = signalsInWindow(signals, windowDays, nowTs);
  if (!recent.length) {
    return [`No fresh signals in the last ${windowDays}d`];
  }

  const drivers: string[] = [];
  const highConfidence = recent.filter((signal) => signal.confidence >= 0.75).length;
  if (highConfidence > 0) {
    drivers.push(`${highConfidence} high-confidence signal${highConfidence === 1 ? "" : "s"} this window`);
  }

  const keywordCounts = new Map<string, { label: string; count: number }>();
  for (const signal of recent) {
    const text = `${signal.title} ${signal.summary} ${(signal.tags ?? []).join(" ")}`;
    for (const keyword of TREND_KEYWORDS) {
      if (!keyword.regex.test(text)) continue;
      const entry = keywordCounts.get(keyword.key) ?? { label: keyword.label, count: 0 };
      entry.count += 1;
      keywordCounts.set(keyword.key, entry);
    }
  }

  const keywordDrivers = [...keywordCounts.values()]
    .sort((a, b) => b.count - a.count)
    .map((item) => {
      if (item.label === "portfolio hiring spike") {
        return `${item.count} signal${item.count === 1 ? "" : "s"} indicate portfolio hiring spike`;
      }
      if (item.label === "co-investment activity") {
        return "Increased co-investment activity in linked signals";
      }
      if (item.label === "follow-on rounds") {
        return `${item.count} follow-on round signal${item.count === 1 ? "" : "s"}`;
      }
      if (item.label === "founder network") {
        return `${item.count} founder-network signal${item.count === 1 ? "" : "s"}`;
      }
      return `${item.count} ${item.label} signal${item.count === 1 ? "" : "s"}`;
    });

  drivers.push(...keywordDrivers);

  if ((fund.coInvestors ?? []).length && !drivers.some((line) => line.toLowerCase().includes("co-invest"))) {
    drivers.push(`Active overlap with ${(fund.coInvestors ?? []).slice(0, 2).join(" and ")}`);
  }

  if (!drivers.length) {
    drivers.push(`${recent.length} new signal${recent.length === 1 ? "" : "s"} in the last ${windowDays}d`);
  }

  return Array.from(new Set(drivers.map((line) => line.trim()).filter(Boolean))).slice(0, 3);
}

export function stanceBarPercent(value: number, total: number): number {
  if (!total) return 0;
  return clamp((value / total) * 100, 0, 100);
}
