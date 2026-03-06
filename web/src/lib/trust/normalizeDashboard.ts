import { TrustDashboard } from "@/types/insights";

export interface NormalizedDashboard {
  dashboard: TrustDashboard;
  fallbackReason: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function clampPercent(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function clampCount(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.round(n));
}

function safeString(value: unknown, fallback = "n/a"): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : fallback;
}

function asAgreement(value: unknown): TrustDashboard["coverage"]["agreement"] {
  return value === "High" || value === "Medium" || value === "Low" ? value : "Low";
}

function asConfidence(value: unknown): TrustDashboard["confidence"]["level"] {
  return value === "High" || value === "Medium" || value === "Low" ? value : "Low";
}

export function defaultTrustDashboard(): TrustDashboard {
  const nowIso = new Date().toISOString();
  return {
    selection: { relevance: 0, freshness: 0, trending: 0, informationGain: 0 },
    framing: { political: 0, techSentiment: 0, powerLens: 0 },
    coverage: {
      independentSourceCount: 0,
      mix: { media: 0, community: 0, official: 0 },
      agreement: "Low",
    },
    confidence: { level: "Low", updatedAtIso: nowIso },
    missing: {
      bullets: [
        "Trust signals not available for this story yet.",
        "Trust signals not available for this story yet.",
        "Trust signals not available for this story yet.",
      ],
    },
    provenance: {
      computedFromSources: 0,
      updatedMinsAgo: 0,
      models: { clustering: "n/a", framing: "n/a", coverage: "n/a" },
    },
  };
}

export function normalizeTrustDashboard(raw: TrustDashboard | null | undefined): NormalizedDashboard {
  if (!raw || typeof raw !== "object") {
    return { dashboard: defaultTrustDashboard(), fallbackReason: "Trust signals not available for this story yet." };
  }

  const selection = asRecord(raw.selection);
  const framing = asRecord(raw.framing);
  const coverage = asRecord(raw.coverage);
  const mix = asRecord(coverage.mix);
  const confidence = asRecord(raw.confidence);
  const missing = asRecord(raw.missing);
  const provenance = asRecord(raw.provenance);
  const models = asRecord(provenance.models);

  const missingBulletsRaw = Array.isArray(missing.bullets)
    ? (missing.bullets as unknown[]).map((b) => safeString(b, "")).filter(Boolean)
    : [];
  const missingBullets =
    missingBulletsRaw.length >= 3
      ? missingBulletsRaw.slice(0, 3)
      : [
          ...missingBulletsRaw,
          ...Array.from({ length: Math.max(0, 3 - missingBulletsRaw.length) }, () =>
            "Trust signals not available for this story yet."
          ),
        ];

  const normalized: TrustDashboard = {
    selection: {
      relevance: clampPercent(selection.relevance, 0),
      freshness: clampPercent(selection.freshness, 0),
      trending: clampPercent(selection.trending, 0),
      informationGain: clampPercent(selection.informationGain, 0),
    },
    framing: {
      political: clampPercent(framing.political, 0),
      techSentiment: clampPercent(framing.techSentiment, 0),
      powerLens: clampPercent(framing.powerLens, 0),
    },
    coverage: {
      independentSourceCount: clampCount(coverage.independentSourceCount, 0),
      mix: {
        media: clampCount(mix.media, 0),
        community: clampCount(mix.community, 0),
        official: clampCount(mix.official, 0),
      },
      agreement: asAgreement(coverage.agreement),
    },
    confidence: {
      level: asConfidence(confidence.level),
      updatedAtIso: safeString(confidence.updatedAtIso, new Date().toISOString()),
    },
    missing: {
      bullets: missingBullets as [string, string, string],
    },
    provenance: {
      computedFromSources: clampCount(provenance.computedFromSources, 0),
      updatedMinsAgo: clampCount(provenance.updatedMinsAgo, 0),
      models: {
        clustering: safeString(models.clustering, "n/a"),
        framing: safeString(models.framing, "n/a"),
        coverage: safeString(models.coverage, "n/a"),
      },
    },
    vestedInterestHint: typeof raw.vestedInterestHint === "boolean" ? raw.vestedInterestHint : undefined,
  };

  const missingRequired =
    !raw.selection ||
    !raw.framing ||
    !raw.coverage ||
    !raw.confidence ||
    !raw.missing ||
    !raw.provenance;

  return {
    dashboard: normalized,
    fallbackReason: missingRequired ? "Trust signals were incomplete; showing defaults." : null,
  };
}
