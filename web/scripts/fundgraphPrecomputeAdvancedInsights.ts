import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import {
  buildAdvancedSignalInsightWithQuality,
  evaluateAdvancedInsightCache,
} from "@/lib/fundgraph/advancedSignalInsight";
import { Fund, FundgraphDbFile, GraphEdge, Signal } from "@/lib/fundgraph/types";

const WEB_ROOT = process.cwd();
const PUBLIC_DIR = path.join(WEB_ROOT, "public", "data", "fundgraph");
const SEED_DIR = path.join(WEB_ROOT, "src", "lib", "fundgraph", "seed");
const DB_PATH = path.join(WEB_ROOT, ".fundgraph-db.json");

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(name);
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeSignal(signal: Signal): Signal {
  const title = normalizeWhitespace(signal.title || "Untitled signal");
  const summary = normalizeWhitespace(signal.summary || title);
  const confidence = Number(clamp(Number.isFinite(signal.confidence) ? signal.confidence : 0.55, 0, 1).toFixed(3));
  const createdAt = signal.createdAt || new Date().toISOString();
  const verifies = Number.isFinite(signal.verifies) ? Number(signal.verifies) : Number(signal.verifyCount ?? signal.verifiedCount ?? 0);
  const disagrees = Number.isFinite(signal.disagrees) ? Number(signal.disagrees) : Number(signal.disagreeCount ?? signal.disputedCount ?? 0);
  const bullishCount = Number.isFinite(signal.bullishCount) ? Number(signal.bullishCount) : Number(signal.upvotes ?? 0);
  const neutralCount = Number.isFinite(signal.neutralCount) ? Number(signal.neutralCount) : 0;
  const bearishCount = Number.isFinite(signal.bearishCount) ? Number(signal.bearishCount) : 0;
  const evidenceUrl = normalizeWhitespace(signal.evidenceUrl || signal.evidence?.url || "");
  const evidenceSnippet = normalizeWhitespace(signal.evidenceSnippet || signal.evidence?.snippet || summary);
  const advancedInsightStatus =
    signal.advancedInsightStatus === "preparing" || signal.advancedInsightStatus === "ready" || signal.advancedInsightStatus === "failed"
      ? signal.advancedInsightStatus
      : signal.advancedInsight
        ? "ready"
        : undefined;

  return {
    ...signal,
    title,
    summary,
    confidence,
    createdAt,
    authorName: normalizeWhitespace(signal.authorName || signal.author || signal.userId || "FundGraph Enrichment"),
    author: normalizeWhitespace(signal.author || signal.authorName || signal.userId || "FundGraph Enrichment"),
    source: signal.source ?? "system",
    tags: Array.isArray(signal.tags) && signal.tags.length ? signal.tags : ["vc-enrich"],
    evidenceUrl,
    evidenceSnippet,
    evidence: {
      url: evidenceUrl || undefined,
      snippet: evidenceSnippet || undefined,
    },
    verifyCount: verifies,
    verifiedCount: Number.isFinite(signal.verifiedCount) ? Number(signal.verifiedCount) : verifies,
    verifies,
    disagreeCount: disagrees,
    disputedCount: Number.isFinite(signal.disputedCount) ? Number(signal.disputedCount) : disagrees,
    disagrees,
    commentsCount: Number.isFinite(signal.commentsCount) ? Number(signal.commentsCount) : 0,
    upvotes: Number.isFinite(signal.upvotes) ? Number(signal.upvotes) : bullishCount,
    bullishCount,
    neutralCount,
    bearishCount,
    dataOrigin: signal.dataOrigin ?? "fetched",
    advancedInsightStatus,
    advancedInsightError: signal.advancedInsightError ?? undefined,
    advancedInsightUpdatedAt: signal.advancedInsightUpdatedAt ?? signal.advancedInsight?.generated_at,
  };
}

async function enrichSignals(params: {
  signals: Signal[];
  funds: Fund[];
  graphEdges: GraphEdge[];
  force: boolean;
  reuseById?: Map<string, Signal>;
  captureById?: Map<string, Signal>;
  label?: string;
}): Promise<{ signals: Signal[]; generated: number; reused: number; ready: number; failed: number }> {
  const normalizedSignals = params.signals.map(normalizeSignal);
  const { funds, graphEdges, force } = params;
  let generated = 0;
  let reused = 0;
  let ready = 0;
  let failed = 0;
  const enriched: Signal[] = [];
  const total = normalizedSignals.length;
  const label = params.label ?? "signals";
  const llmEnabled = process.env.FUNDGRAPH_ADVANCED_USE_LLM === "1";

  for (let index = 0; index < normalizedSignals.length; index += 1) {
    const signal = normalizedSignals[index]!;
    const skipLlmForTier = llmEnabled && signal.qualityTier && signal.qualityTier !== "ALIGNED";
    if (skipLlmForTier && signal.advancedInsightStatus === "ready" && signal.advancedInsight) {
      reused += 1;
      enriched.push(signal);
      params.captureById?.set(signal.id, signal);
      if ((index + 1) % 10 === 0 || index + 1 === total) {
        console.log(`[advanced-insights] ${label} progress ${index + 1}/${total} generated=${generated} reused=${reused}`);
      }
      continue;
    }
    const cached = params.reuseById?.get(signal.id);
    if (cached && (cached.advancedInsight || cached.advancedInsightStatus === "failed")) {
      reused += 1;
      const reusedSignal: Signal = {
        ...signal,
        advancedInsight: cached.advancedInsight,
        advancedInsightStatus: cached.advancedInsightStatus ?? "ready",
        advancedInsightError: cached.advancedInsightError,
        advancedInsightUpdatedAt:
          cached.advancedInsightUpdatedAt ??
          cached.advancedInsight?.generated_at ??
          signal.advancedInsightUpdatedAt ??
          signal.advancedInsight?.generated_at,
      };
      if (reusedSignal.advancedInsightStatus === "ready" && reusedSignal.advancedInsight) {
        ready += 1;
      } else if (reusedSignal.advancedInsightStatus === "failed") {
        failed += 1;
      }
      enriched.push(reusedSignal);
      if ((index + 1) % 10 === 0 || index + 1 === total) {
        console.log(`[advanced-insights] ${label} progress ${index + 1}/${total} generated=${generated} reused=${reused}`);
      }
      continue;
    }

    const evaluation =
      signal.advancedInsightStatus === "ready" && signal.advancedInsight
        ? evaluateAdvancedInsightCache({
            signal,
            allSignals: normalizedSignals,
            funds,
          })
        : { shouldRefresh: true };
    const shouldRegenerate = force || signal.advancedInsightStatus !== "ready" || !signal.advancedInsight || evaluation.shouldRefresh;
    if (!shouldRegenerate && signal.advancedInsight && signal.advancedInsightStatus === "ready") {
      reused += 1;
      enriched.push(signal);
      params.captureById?.set(signal.id, signal);
      if ((index + 1) % 10 === 0 || index + 1 === total) {
        console.log(`[advanced-insights] ${label} progress ${index + 1}/${total} generated=${generated} reused=${reused}`);
      }
      continue;
    }
    const generation = await buildAdvancedSignalInsightWithQuality({
      signal,
      allSignals: normalizedSignals,
      funds,
      graphEdges,
    });
    generated += 1;
    if (generation.status === "ready") {
      ready += 1;
      const nextSignal: Signal = {
        ...signal,
        advancedInsight: generation.insight,
        advancedInsightStatus: "ready",
        advancedInsightError: undefined,
        advancedInsightUpdatedAt: generation.insight.generated_at,
      };
      enriched.push(nextSignal);
      params.captureById?.set(signal.id, nextSignal);
    } else if (generation.deterministicInsight) {
      // Persist deterministic insight when LLM is unavailable/guarded so UI still has rich advanced content.
      ready += 1;
      const nextSignal: Signal = {
        ...signal,
        advancedInsight: generation.deterministicInsight,
        advancedInsightStatus: "ready",
        advancedInsightError: generation.message,
        advancedInsightUpdatedAt: generation.deterministicInsight.generated_at,
      };
      enriched.push(nextSignal);
      params.captureById?.set(signal.id, nextSignal);
    } else {
      failed += 1;
      const nextSignal: Signal = {
        ...signal,
        advancedInsight: undefined,
        advancedInsightStatus: "failed",
        advancedInsightError: generation.message,
        advancedInsightUpdatedAt: new Date().toISOString(),
      };
      enriched.push(nextSignal);
      params.captureById?.set(signal.id, nextSignal);
    }
    if ((index + 1) % 10 === 0 || index + 1 === total) {
      console.log(`[advanced-insights] ${label} progress ${index + 1}/${total} generated=${generated} reused=${reused}`);
    }
  }

  return { signals: enriched, generated, reused, ready, failed };
}

async function main(): Promise<void> {
  const force = hasFlag("--force");
  const enableLlm = hasFlag("--llm") || process.env.FUNDGRAPH_ADVANCED_USE_LLM === "1";
  if (enableLlm) {
    process.env.FUNDGRAPH_ADVANCED_USE_LLM = "1";
  }
  if (process.env.FUNDGRAPH_ADVANCED_USE_LLM === "1" && !process.env.OPENAI_API_KEY) {
    console.warn("[advanced-insights] FUNDGRAPH_ADVANCED_USE_LLM=1 but OPENAI_API_KEY is missing; deterministic fallback will be used.");
  }

  const [funds, graphEdges, publicSignals, seedSignals, db] = await Promise.all([
    readJson<Fund[]>(path.join(PUBLIC_DIR, "funds.json"), []),
    readJson<GraphEdge[]>(path.join(PUBLIC_DIR, "graph_edges.json"), []),
    readJson<Signal[]>(path.join(PUBLIC_DIR, "signals.json"), []),
    readJson<Signal[]>(path.join(SEED_DIR, "signals.json"), []),
    readJson<FundgraphDbFile | null>(DB_PATH, null),
  ]);

  const sharedBySignalId = new Map<string, Signal>();

  const publicResult = await enrichSignals({
    signals: publicSignals,
    funds,
    graphEdges,
    force,
    captureById: sharedBySignalId,
    reuseById: sharedBySignalId,
    label: "public",
  });
  const seedResult = await enrichSignals({
    signals: seedSignals,
    funds,
    graphEdges,
    force,
    captureById: sharedBySignalId,
    reuseById: sharedBySignalId,
    label: "seed",
  });

  await Promise.all([
    writeJson(path.join(PUBLIC_DIR, "signals.json"), publicResult.signals),
    writeJson(path.join(SEED_DIR, "signals.json"), seedResult.signals),
  ]);

  let dbGenerated = 0;
  let dbReused = 0;
  let dbReady = 0;
  let dbFailed = 0;
  if (db && Array.isArray(db.signals)) {
    const dbResult = await enrichSignals({
      signals: db.signals as Signal[],
      funds,
      graphEdges,
      force,
      captureById: sharedBySignalId,
      reuseById: sharedBySignalId,
      label: "db",
    });
    db.signals = dbResult.signals;
    dbGenerated = dbResult.generated;
    dbReused = dbResult.reused;
    dbReady = dbResult.ready;
    dbFailed = dbResult.failed;
    await writeJson(DB_PATH, db);
  }

  console.log(
    [
      `[advanced-insights] llm=${process.env.FUNDGRAPH_ADVANCED_USE_LLM === "1" ? "on" : "off"}`,
      `[advanced-insights] public generated=${publicResult.generated} reused=${publicResult.reused} ready=${publicResult.ready} failed=${publicResult.failed}`,
      `[advanced-insights] seed generated=${seedResult.generated} reused=${seedResult.reused} ready=${seedResult.ready} failed=${seedResult.failed}`,
      `[advanced-insights] db generated=${dbGenerated} reused=${dbReused} ready=${dbReady} failed=${dbFailed}`,
    ].join("\n")
  );
}

main().catch((error) => {
  console.error("[advanced-insights] precompute failed", error);
  process.exit(1);
});
