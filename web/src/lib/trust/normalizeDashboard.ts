import { TrustDashboard } from "@/types/insights";

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
    missing: { bullets: ["Trust signals not available for this story yet."] },
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

  const selection = raw.selection ?? {};
  const framing = raw.framing ?? {};
  const coverage = raw.coverage ?? {};
  const mix = coverage.mix ?? {};
  const confidence = raw.confidence ?? {};
  const missing = raw.missing ?? {};
  const provenance = raw.provenance ?? {};

  const normalized: TrustDashboard = {
    selection: {
      relevance: clampPercent((selection as any).relevance, 0),
      freshness: clampPercent((selection as any).freshness, 0),
      trending: clampPercent((selection as any).trending, 0),
      informationGain: clampPercent((selection as any).informationGain, 0),
    },
    framing: {
      political: clampPercent((framing as any).political, 0),
      techSentiment: clampPercent((framing as any).techSentiment, 0),
      powerLens: clampPercent((framing as any).powerLens, 0),
    },
    coverage: {
      independentSourceCount: clampCount((coverage as any).independentSourceCount, 0),
      mix: {
        media: clampCount((mix as any).media, 0),
        community: clampCount((mix as any).community, 0),
        official: clampCount((mix as any).official, 0),
      },
      agreement: ((coverage as any).agreement as TrustDashboard["coverage"]["agreement"]) ?? "Low",
    },
    confidence: {
      level: ((confidence as any).level as TrustDashboard["confidence"]["level"]) ?? "Low",
      updatedAtIso: safeString((confidence as any).updatedAtIso, new Date().toISOString()),
    },
    missing: {
      bullets: Array.isArray((missing as any).bullets) && (missing as any).bullets.length
        ? (missing as any).bullets.map((b: unknown) => safeString(b, "")).filter(Boolean)
        : ["Trust signals not available for this story yet."],
    },
    provenance: {
      computedFromSources: clampCount((provenance as any).computedFromSources, 0),
      updatedMinsAgo: clampCount((provenance as any).updatedMinsAgo, 0),
      models: {
        clustering: safeString((provenance as any).models?.clustering, "n/a"),
        framing: safeString((provenance as any).models?.framing, "n/a"),
        coverage: safeString((provenance as any).models?.coverage, "n/a"),
      },
    },
    vestedInterestHint: (raw as any).vestedInterestHint ?? undefined,
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
