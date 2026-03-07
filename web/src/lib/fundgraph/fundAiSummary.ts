import { Fund, Signal } from "@/lib/fundgraph/types";

export type FundAiSummary = {
  summary: string;
  insights: string[];
  citations: Array<{ title: string; url: string }>;
  signalCount: number;
};

function uniq(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function topTags(signals: Signal[], limit = 3): string[] {
  const counts = new Map<string, number>();
  for (const signal of signals) {
    for (const tag of signal.tags ?? []) {
      const cleaned = tag.trim();
      if (!cleaned) continue;
      counts.set(cleaned, (counts.get(cleaned) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((left, right) => (right[1] === left[1] ? left[0].localeCompare(right[0]) : right[1] - left[1]))
    .map(([tag]) => tag)
    .slice(0, limit);
}

export function buildFundAiSummary(fund: Fund, signals: Signal[]): FundAiSummary {
  const sorted = [...signals].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  if (!sorted.length) {
    return {
      summary: `${fund.name} currently has no published fund-specific signals, so there is not enough evidence to generate a reliable AI synthesis yet.`,
      insights: ["No recent intelligence to aggregate.", "Publish or ingest new signals to unlock synthesis."],
      citations: [],
      signalCount: 0,
    };
  }

  const highConfidence = sorted.filter((signal) => signal.confidence >= 0.75).length;
  const verified = sorted.reduce((sum, signal) => sum + (signal.verifiedCount ?? signal.verifyCount ?? signal.verifies ?? 0), 0);
  const disputed = sorted.reduce((sum, signal) => sum + (signal.disputedCount ?? signal.disagreeCount ?? signal.disagrees ?? 0), 0);
  const avgConfidence = sorted.reduce((sum, signal) => sum + signal.confidence, 0) / sorted.length;
  const dominantTags = topTags(sorted, 3);
  const citationRows = uniq(
    sorted
      .filter((signal) => signal.evidenceUrl)
      .map((signal) => `${signal.title}|||${signal.evidenceUrl as string}`)
  )
    .slice(0, 3)
    .map((row) => {
      const [title, url] = row.split("|||");
      return {
        title: title || "Signal source",
        url: url || "",
      };
    })
    .filter((row) => Boolean(row.url));

  const netVerification = verified - disputed;
  const trendLabel =
    avgConfidence >= 0.78 ? "high-conviction" : avgConfidence >= 0.62 ? "moderate-conviction" : "emerging-conviction";

  const summary = `${fund.name} shows ${trendLabel} momentum across ${sorted.length} fund-linked signals, with ${highConfidence} high-confidence items and a net verification score of ${netVerification >= 0 ? "+" : ""}${netVerification}.`;

  const insights = [
    `${highConfidence} of ${sorted.length} signals are high confidence (${Math.round(avgConfidence * 100)}% average confidence).`,
    `Community verification: ${verified} verify votes vs ${disputed} disputes.`,
    dominantTags.length
      ? `Dominant themes: ${dominantTags.join(", ")}.`
      : "Dominant themes are still forming from current signal tags.",
  ];

  return {
    summary,
    insights,
    citations: citationRows,
    signalCount: sorted.length,
  };
}

