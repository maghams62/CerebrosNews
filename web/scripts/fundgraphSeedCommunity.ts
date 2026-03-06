import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { normalizeFundgraphText } from "@/lib/fundgraph/textNormalization";
import { FundgraphDbFile, Signal, SignalStance, Verification } from "@/lib/fundgraph/types";

const WEB_ROOT = process.cwd();
const REPO_ROOT = path.resolve(WEB_ROOT, "..");
const DB_PATH = path.join(WEB_ROOT, ".fundgraph-db.json");
const ARTIFACT_PATH = path.join(REPO_ROOT, "artifacts", "community_seed_summary.json");
const PUBLIC_ARTIFACT_PATH = path.join(WEB_ROOT, "public", "data", "fundgraph", "community_seed_summary.json");
const SEED_VERSION = "community_seed_v1";

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function stableHash(parts: string[]): number {
  const text = parts.join("|");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function isCuratedSignal(signal: Signal): boolean {
  return signal.qualityTier === "ALIGNED" || signal.qualityTier === "WARNING";
}

function normalizeReason(reason: string | undefined): string {
  if (!reason) return "citation alignment needs review";
  return reason.replace(/_/g, " ").trim();
}

function signalSummaryFact(signal: Signal): string {
  const snapshot = signal.articleSnapshot;
  const headline = normalizeFundgraphText(snapshot?.headline || signal.sourceTitle || signal.title, 180);
  const bullet = normalizeFundgraphText(snapshot?.bullets?.[0] || snapshot?.excerpt || signal.summary, 180);
  const keyFact = snapshot?.keyFacts?.[0];
  const factPart = keyFact
    ? `${normalizeFundgraphText(keyFact.label, 40)}: ${normalizeFundgraphText(keyFact.value, 80)}`
    : bullet;
  return normalizeFundgraphText(`${headline}. ${factPart}.`, 220);
}

function ensureReadableNote(note: string): string {
  const cleaned = normalizeFundgraphText(note, 320);
  if (cleaned.length >= 24 && /[.!?]/.test(cleaned)) return cleaned;
  return "Baseline review indicates source-backed fund activity and warrants continued verification.";
}

function stancePlan(signal: Signal): { bullish: number; neutral: number; bearish: number } {
  const confidence = clamp(signal.confidence ?? 0.5, 0, 1);
  const reasons = signal.qualityReasons ?? [];
  const cautionReasonHit = reasons.some((reason) => /mismatch|missing|ambiguous|not/.test(reason));

  const base = { bullish: 1, neutral: 1, bearish: 1 };
  const confidenceLift = confidence >= 0.8 ? 2 : confidence >= 0.65 ? 1 : 0;

  if (signal.qualityTier === "ALIGNED") {
    base.bullish += 1 + confidenceLift;
    base.neutral += 1;
  } else {
    base.neutral += 1 + confidenceLift;
    base.bearish += 1;
  }
  if (cautionReasonHit) base.bearish += 1;

  return base;
}

function verificationPlan(signal: Signal): { verifies: number; disputes: number } {
  const confidence = clamp(signal.confidence ?? 0.5, 0, 1);
  const baseVerify = signal.qualityTier === "ALIGNED" ? 2 : 1;
  const verifyLift = confidence >= 0.82 ? 2 : confidence >= 0.68 ? 1 : 0;
  const disputeBase = signal.qualityTier === "WARNING" ? 1 : 0;
  const reasonPenalty = (signal.qualityReasons ?? []).some((reason) => /missing|ambiguous|not/.test(reason)) ? 1 : 0;
  return {
    verifies: baseVerify + verifyLift,
    disputes: disputeBase + reasonPenalty,
  };
}

function seededUserId(signalId: string, type: "stance" | "verify" | "dispute", bucket: string, index: number): string {
  return `seed:${type}:${bucket}:${index + 1}:${stableHash([signalId, type, bucket, String(index)]).toString(36)}`;
}

function seededVerificationRows(signal: Signal, createdAt: string): Verification[] {
  const fact = signalSummaryFact(signal);
  const reasons = (signal.qualityReasons ?? []).map((reason) => normalizeReason(reason)).slice(0, 2);
  const plan = verificationPlan(signal);
  const rows: Verification[] = [];

  for (let index = 0; index < plan.verifies; index += 1) {
    const stanceText =
      index % 2 === 0
        ? `Seeded baseline verify. ${fact}`
        : `Seeded baseline verify. Citation-backed summary aligns with the signal framing. ${fact}`;
    rows.push({
      id: `seed-ver-${stableHash([signal.id, "verify", String(index)]).toString(36)}`,
      targetType: "signal",
      signalId: signal.id,
      userId: seededUserId(signal.id, "verify", "verify", index),
      vote: "verify",
      note: ensureReadableNote(stanceText),
      createdAt,
      seeded: true,
      dataOrigin: "derived",
      seedVersion: SEED_VERSION,
      trustWeight: 0.35,
      qualityChecked: true,
      contributor: {
        label: "Seeded baseline",
        role: "ANALYST",
        tier: "INTERNAL_ANALYST",
        isAnonymous: false,
      },
    });
  }

  for (let index = 0; index < plan.disputes; index += 1) {
    const reasonText = reasons[index % Math.max(1, reasons.length)] || "citation alignment needs additional confirmation";
    const note = ensureReadableNote(
      `Seeded baseline dispute. Quality checks flagged ${reasonText}; keep this signal visible with caution until stronger corroboration appears.`
    );
    rows.push({
      id: `seed-dis-${stableHash([signal.id, "dispute", String(index)]).toString(36)}`,
      targetType: "signal",
      signalId: signal.id,
      userId: seededUserId(signal.id, "dispute", "dispute", index),
      vote: "dispute",
      note,
      createdAt,
      seeded: true,
      dataOrigin: "derived",
      seedVersion: SEED_VERSION,
      trustWeight: 0.35,
      qualityChecked: true,
      contributor: {
        label: "Seeded baseline",
        role: "ANALYST",
        tier: "INTERNAL_ANALYST",
        isAnonymous: false,
      },
    });
  }

  return rows;
}

function seededStanceRows(signal: Signal, createdAt: string): SignalStance[] {
  const plan = stancePlan(signal);
  const rows: SignalStance[] = [];
  const pushRows = (stanceType: SignalStance["stanceType"], count: number) => {
    for (let index = 0; index < count; index += 1) {
      rows.push({
        id: `seed-stance-${stableHash([signal.id, stanceType, String(index)]).toString(36)}`,
        signalId: signal.id,
        userId: seededUserId(signal.id, "stance", stanceType, index),
        stanceType,
        createdAt,
        seeded: true,
        dataOrigin: "derived",
        seedVersion: SEED_VERSION,
        trustWeight: 0.35,
      });
    }
  };
  pushRows("bullish", plan.bullish);
  pushRows("neutral", plan.neutral);
  pushRows("bearish", plan.bearish);
  return rows;
}

function recomputeSignalCounters(db: FundgraphDbFile): void {
  const voteMap = new Map<string, Verification[]>();
  for (const vote of db.verifications ?? []) {
    if (!vote.signalId) continue;
    const bucket = voteMap.get(vote.signalId) ?? [];
    bucket.push(vote);
    voteMap.set(vote.signalId, bucket);
  }

  const stanceMap = new Map<string, SignalStance[]>();
  for (const stance of db.signalStances ?? []) {
    const bucket = stanceMap.get(stance.signalId) ?? [];
    bucket.push(stance);
    stanceMap.set(stance.signalId, bucket);
  }

  for (const signal of db.signals ?? []) {
    const votes = voteMap.get(signal.id) ?? [];
    const stances = stanceMap.get(signal.id) ?? [];
    const verifies = votes.filter((entry) => entry.vote === "verify").length;
    const disputes = votes.filter((entry) => entry.vote === "dispute").length;

    const bullish = stances.filter((entry) => entry.stanceType === "bullish").length;
    const neutral = stances.filter((entry) => entry.stanceType === "neutral").length;
    const bearish = stances.filter((entry) => entry.stanceType === "bearish").length;

    signal.verifyCount = verifies;
    signal.verifiedCount = verifies;
    signal.verifies = verifies;
    signal.disagreeCount = disputes;
    signal.disputedCount = disputes;
    signal.disagrees = disputes;
    signal.commentsCount = votes.filter((entry) => Boolean((entry.note || entry.comment || "").trim())).length;
    signal.bullishCount = bullish;
    signal.neutralCount = neutral;
    signal.bearishCount = bearish;
    signal.upvotes = bullish;
  }
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

async function runSeedCommunity(): Promise<void> {
  const db = await readJson<FundgraphDbFile>(DB_PATH, {
    claims: [],
    signals: [],
    profiles: [],
    verifications: [],
    credByUser: {},
    users: [],
    conflicts: [],
    sources: [],
    claimLinks: [],
    memos: [],
    contributionEvents: [],
    signalStances: [],
  });

  db.verifications = (db.verifications ?? []).filter(
    (entry) => !(entry.signalId && (entry.seeded || entry.seedVersion === SEED_VERSION || entry.userId.startsWith("seed:")))
  );
  db.signalStances = (db.signalStances ?? []).filter(
    (entry) => !(entry.seeded || entry.seedVersion === SEED_VERSION || entry.userId.startsWith("seed:"))
  );

  const curatedSignals = (db.signals ?? []).filter(isCuratedSignal);
  const nowIso = new Date().toISOString();

  let seededVerifications = 0;
  let seededStances = 0;
  let fullStanceCoverage = 0;
  let verificationCoverage = 0;

  for (const signal of curatedSignals) {
    const createdAt = signal.createdAt || nowIso;
    const verificationRows = seededVerificationRows(signal, createdAt);
    const stanceRows = seededStanceRows(signal, createdAt);
    db.verifications.push(...verificationRows);
    db.signalStances.push(...stanceRows);
    seededVerifications += verificationRows.length;
    seededStances += stanceRows.length;

    const stanceSet = new Set(stanceRows.map((row) => row.stanceType));
    if (stanceSet.has("bullish") && stanceSet.has("neutral") && stanceSet.has("bearish")) {
      fullStanceCoverage += 1;
    }
    if (verificationRows.some((row) => row.vote === "verify")) verificationCoverage += 1;
  }

  recomputeSignalCounters(db);
  await writeJson(DB_PATH, db);

  const summary = {
    generated_at: nowIso,
    seed_version: SEED_VERSION,
    curated_signals_processed: curatedSignals.length,
    seeded_verifications_added: seededVerifications,
    seeded_stances_added: seededStances,
    signals_with_full_stance_coverage: fullStanceCoverage,
    signals_with_verification_coverage: verificationCoverage,
  };
  await Promise.all([writeJson(ARTIFACT_PATH, summary), writeJson(PUBLIC_ARTIFACT_PATH, summary)]);

  console.log(
    `[seed-community] curated=${curatedSignals.length} verifications=${seededVerifications} stances=${seededStances} full_stance_coverage=${fullStanceCoverage}`
  );
}

const isMainModule = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainModule) {
  runSeedCommunity().catch((error) => {
    console.error("[seed-community] failed", error);
    process.exit(1);
  });
}

export {
  runSeedCommunity,
  ensureReadableNote as __testEnsureReadableNote,
  seededVerificationRows as __testSeededVerificationRows,
  seededStanceRows as __testSeededStanceRows,
  stancePlan as __testStancePlan,
  verificationPlan as __testVerificationPlan,
};
