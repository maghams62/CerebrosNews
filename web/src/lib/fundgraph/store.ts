import fs from "fs/promises";
import path from "path";
import {
  ClaimEvidence,
  ClaimLLMVerification,
  ClaimLink,
  ClaimVerificationRecord,
  AdvancedSignalInsight,
  CommunityVoteInput,
  Conflict,
  CredBadgeTier,
  FundgraphDbFile,
  FundgraphUser,
  MachineVerificationBreakdown,
  NewsClaim,
  Signal,
  SignalStance,
  SignalStanceType,
  Source,
  UserProfile,
  Verification,
  VerificationContributorProfile,
} from "@/lib/fundgraph/types";
import { resolveConflictHintWithLlm } from "@/lib/fundgraph/llm";
import { dedupeSignals } from "@/lib/fundgraph/signalDedup";
import { filterSignalsForDisplay } from "@/lib/fundgraph/quality";
import { readFunds, readSignals as readSignalSeedSnapshot } from "@/lib/fundgraph/storage";
import {
  hasHardScrapeNoise,
  hasNavigationNoise,
  isLikelyBoilerplateScrapeText,
  normalizeFundgraphText,
} from "@/lib/fundgraph/textNormalization";
import { computeTrustScore } from "@/lib/fundgraph/trust";
import { buildClaimVerificationRecord, ensureContributorProfile, tierForGamificationTier } from "@/lib/fundgraph/verification";

function resolveDbFilePath(): string {
  const configuredPath = process.env.FUNDGRAPH_DB_FILE?.trim();
  if (configuredPath) return configuredPath;
  if (process.env.VERCEL) return path.join("/tmp", ".fundgraph-db.json");
  return path.join(process.cwd(), ".fundgraph-db.json");
}

const DB_FILE = resolveDbFilePath();
const DEFAULT_USERS: Array<{ id: string; name: string }> = [
  { id: "siddharth", name: "Siddharth" },
  { id: "anon", name: "Anonymous" },
];

const EMPTY_DB: FundgraphDbFile = {
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
};

let writeChain: Promise<void> = Promise.resolve();
let dbInitializationChecked = false;

function normalizeVote(vote: CommunityVoteInput): "verify" | "dispute" {
  return vote === "disagree" ? "dispute" : vote;
}

function toBadgeTier(cred: number): CredBadgeTier {
  if (cred >= 30) return "HIGH_SIGNAL";
  if (cred >= 15) return "VERIFIER";
  if (cred >= 5) return "CONTRIBUTOR";
  return "NEW";
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function machineFromLegacyClaim(claim: NewsClaim): MachineVerificationBreakdown {
  const verdict = claim.llmVerification?.verdict ?? claim.verificationVerdict ?? claim.verification?.verdict;
  const confidenceRaw =
    claim.verificationRecord?.machine.machineConfidence ??
    (typeof claim.llmVerification?.confidence === "number" ? claim.llmVerification.confidence * 100 : undefined) ??
    (typeof claim.verificationConfidence === "number" ? claim.verificationConfidence * 100 : undefined) ??
    (typeof claim.verification?.confidence === "number" ? claim.verification.confidence * 100 : undefined) ??
    (typeof claim.llmConfidence === "number" ? claim.llmConfidence * 100 : 0);

  const citationSupport =
    claim.verificationRecord?.machine.citationSupport ??
    (verdict === "supported" ? "STRONG" : verdict === "mixed" ? "MEDIUM" : verdict === "unsupported" ? "WEAK" : "NONE");
  const sourceRelevance =
    claim.verificationRecord?.machine.sourceRelevance ??
    (verdict === "supported" ? "HIGH" : verdict === "mixed" ? "MEDIUM" : "LOW");
  const freshness = claim.verificationRecord?.machine.freshness ?? "RECENT";
  const reasoningSummary =
    claim.verificationRecord?.machine.reasoningSummary ??
    claim.llmVerification?.rationale ??
    claim.verification?.rationale ??
    "Machine verification has partial information and should be interpreted with the evidence trail.";

  return {
    citationSupport,
    sourceRelevance,
    freshness,
    conflictDetected: Boolean(claim.verificationRecord?.machine.conflictDetected),
    reasoningSummary,
    machineConfidence: Number(clamp(confidenceRaw, 0, 100).toFixed(2)),
  };
}

function legacyVerdictFromMachine(machine: MachineVerificationBreakdown): "supported" | "unsupported" | "mixed" {
  if (machine.citationSupport === "STRONG" && !machine.conflictDetected) return "supported";
  if (machine.citationSupport === "NONE" || (machine.conflictDetected && machine.citationSupport === "WEAK")) return "unsupported";
  return "mixed";
}

function defaultCitationEvidence(claim: NewsClaim): ClaimEvidence {
  return {
    id: `evidence-citation-${claim.id}`,
    claimId: claim.id,
    sourceType: "PUBLIC_ARTICLE",
    visibility: "PUBLIC",
    title: claim.citation.title,
    url: claim.citation.url,
    snippet: claim.citation.snippet,
    submittedAt: claim.createdAt,
    confidence: "MEDIUM",
    contributor: {
      label: "System citation",
      role: "ANALYST",
      tier: "INTERNAL_ANALYST",
      isAnonymous: false,
    },
  };
}

function normalizeSignalSnapshot(snapshot: Signal["articleSnapshot"]): Signal["articleSnapshot"] {
  if (!snapshot) return undefined;
  const bullets = Array.isArray(snapshot.bullets)
    ? snapshot.bullets.map((item) => String(item).trim()).filter(Boolean).slice(0, 5)
    : [];
  const keyFacts = Array.isArray(snapshot.keyFacts)
    ? snapshot.keyFacts
        .map((fact) => ({
          label: String(fact?.label ?? "").trim(),
          value: String(fact?.value ?? "").trim(),
          citationId: fact?.citationId ? String(fact.citationId).trim() : undefined,
        }))
        .filter((fact) => fact.label && fact.value)
        .slice(0, 8)
    : [];
  const evidenceQuotes = Array.isArray(snapshot.evidenceQuotes)
    ? snapshot.evidenceQuotes
        .map((quote) => ({
          citationId: String(quote?.citationId ?? "").trim(),
          text: String(quote?.text ?? "").trim(),
          url: quote?.url ? String(quote.url).trim() : undefined,
        }))
        .filter((quote) => quote.citationId && quote.text)
        .slice(0, 6)
    : [];

  return {
    headline: String(snapshot.headline ?? "").trim() || "",
    sourceName: String(snapshot.sourceName ?? "").trim() || "",
    sourceUrl: snapshot.sourceUrl ? String(snapshot.sourceUrl).trim() : undefined,
    publishedAt: snapshot.publishedAt ? String(snapshot.publishedAt).trim() : undefined,
    bullets,
    keyFacts,
    evidenceQuotes,
    excerpt: snapshot.excerpt ? String(snapshot.excerpt).trim() : undefined,
    extraction: {
      extractedAt:
        typeof snapshot.extraction?.extractedAt === "string" && snapshot.extraction.extractedAt
          ? snapshot.extraction.extractedAt
          : new Date().toISOString(),
      extractor: String(snapshot.extraction?.extractor ?? "signal_article_v1"),
      sourceTextLength:
        typeof snapshot.extraction?.sourceTextLength === "number" && Number.isFinite(snapshot.extraction.sourceTextLength)
          ? Math.max(0, Math.floor(snapshot.extraction.sourceTextLength))
          : 0,
      snippetOverlapScore:
        typeof snapshot.extraction?.snippetOverlapScore === "number" && Number.isFinite(snapshot.extraction.snippetOverlapScore)
          ? Number(clamp(snapshot.extraction.snippetOverlapScore, 0, 1).toFixed(3))
          : 0,
      fundRelevanceScore:
        typeof snapshot.extraction?.fundRelevanceScore === "number" && Number.isFinite(snapshot.extraction.fundRelevanceScore)
          ? Number(clamp(snapshot.extraction.fundRelevanceScore, 0, 1).toFixed(3))
          : 0,
      sourceJoinScore:
        typeof snapshot.extraction?.sourceJoinScore === "number" && Number.isFinite(snapshot.extraction.sourceJoinScore)
          ? Number(clamp(snapshot.extraction.sourceJoinScore, 0, 1).toFixed(3))
          : 0,
      isSynthetic: Boolean(snapshot.extraction?.isSynthetic),
    },
  };
}


function normalizeSignal(signal: Signal): Signal {
  const verifies = typeof signal.verifies === "number" ? signal.verifies : signal.verifyCount ?? signal.verifiedCount ?? 0;
  const disagrees = typeof signal.disagrees === "number" ? signal.disagrees : signal.disagreeCount ?? 0;
  const fallbackBullish = Number.isFinite(signal.upvotes) ? signal.upvotes : 0;
  const bullishCount = Number.isFinite(signal.bullishCount) ? Number(signal.bullishCount) : fallbackBullish;
  const neutralCount = Number.isFinite(signal.neutralCount) ? Number(signal.neutralCount) : 0;
  const bearishCount = Number.isFinite(signal.bearishCount) ? Number(signal.bearishCount) : 0;
  const evidence = signal.evidence ??
    (signal.evidenceUrl || signal.evidenceSnippet
      ? {
          url: signal.evidenceUrl,
          snippet: signal.evidenceSnippet,
        }
      : undefined);

  const normalizedAdvancedStatus =
    signal.advancedInsightStatus === "preparing" || signal.advancedInsightStatus === "ready" || signal.advancedInsightStatus === "failed"
      ? signal.advancedInsightStatus
      : signal.advancedInsight
        ? "ready"
        : undefined;
  const claimIds = Array.isArray(signal.claimIds)
    ? Array.from(new Set(signal.claimIds.map((entry) => String(entry).trim()).filter(Boolean))).slice(0, 20)
    : undefined;
  const qualityTier =
    signal.qualityTier === "ALIGNED" || signal.qualityTier === "WARNING" || signal.qualityTier === "FAILED"
      ? signal.qualityTier
      : undefined;
  const alignmentScore =
    typeof signal.alignmentScore === "number" && Number.isFinite(signal.alignmentScore)
      ? Number(clamp(signal.alignmentScore, 0, 1).toFixed(3))
      : undefined;
  const citationMatchScore =
    typeof signal.citationMatchScore === "number" && Number.isFinite(signal.citationMatchScore)
      ? Number(clamp(signal.citationMatchScore, 0, 1).toFixed(3))
      : undefined;
  const qualityReasons = Array.isArray(signal.qualityReasons)
    ? Array.from(new Set(signal.qualityReasons.map((entry) => String(entry).trim()).filter(Boolean))).slice(0, 12)
    : undefined;
  const articleSnapshot = normalizeSignalSnapshot(signal.articleSnapshot);

  return {
    ...signal,
    authorName: signal.authorName || signal.author || signal.userId || "Community Member",
    upvotes: Number.isFinite(signal.upvotes) ? signal.upvotes : Math.max(0, Math.floor(bullishCount)),
    verifiedCount: Number.isFinite(signal.verifiedCount) ? signal.verifiedCount : verifies,
    verifyCount: Number.isFinite(signal.verifyCount) ? signal.verifyCount : verifies,
    verifies,
    disagreeCount: Number.isFinite(signal.disagreeCount) ? signal.disagreeCount : disagrees,
    disputedCount: Number.isFinite(signal.disputedCount) ? signal.disputedCount : disagrees,
    disagrees,
    commentsCount: Number.isFinite(signal.commentsCount) ? signal.commentsCount : 0,
    bullishCount: Math.max(0, Math.floor(bullishCount)),
    neutralCount: Math.max(0, Math.floor(neutralCount)),
    bearishCount: Math.max(0, Math.floor(bearishCount)),
    userStance:
      signal.userStance === "bullish" || signal.userStance === "neutral" || signal.userStance === "bearish"
        ? signal.userStance
        : undefined,
    createdAt: signal.createdAt || new Date().toISOString(),
    evidence,
    evidenceUrl: signal.evidenceUrl ?? evidence?.url,
    evidenceSnippet: signal.evidenceSnippet ?? evidence?.snippet,
    tags: Array.isArray(signal.tags) ? signal.tags : [],
    source: signal.source ?? "community",
    advancedInsightStatus: normalizedAdvancedStatus,
    advancedInsightError: signal.advancedInsightError || undefined,
    advancedInsightUpdatedAt: signal.advancedInsightUpdatedAt ?? signal.advancedInsight?.generated_at,
    sourceId: signal.sourceId ? String(signal.sourceId).trim() : undefined,
    sourceTitle: signal.sourceTitle ? String(signal.sourceTitle).trim() : undefined,
    claimIds,
    qualityTier,
    alignmentScore,
    citationMatchScore,
    qualityReasons,
    articleSnapshot,
  };
}

function clearAdvancedInsight(signal: Signal): void {
  signal.advancedInsight = undefined;
  signal.advancedInsightStatus = undefined;
  signal.advancedInsightError = undefined;
  signal.advancedInsightUpdatedAt = undefined;
}

function signalStanceCountsFromSignal(signal: Signal): { bullish: number; neutral: number; bearish: number } {
  return {
    bullish: Math.max(0, Math.floor(signal.bullishCount ?? signal.upvotes ?? 0)),
    neutral: Math.max(0, Math.floor(signal.neutralCount ?? 0)),
    bearish: Math.max(0, Math.floor(signal.bearishCount ?? 0)),
  };
}

function writeSignalStanceCounts(
  signal: Signal,
  counts: { bullish: number; neutral: number; bearish: number }
): void {
  signal.bullishCount = Math.max(0, Math.floor(counts.bullish));
  signal.neutralCount = Math.max(0, Math.floor(counts.neutral));
  signal.bearishCount = Math.max(0, Math.floor(counts.bearish));
  // Keep legacy compatibility fields synchronized.
  signal.upvotes = signal.bullishCount;
}

function syncSignalStanceCounts(signal: Signal, db: FundgraphDbFile): void {
  const stanceRows = (db.signalStances ?? []).filter((entry) => entry.signalId === signal.id);
  if (!stanceRows.length) {
    writeSignalStanceCounts(signal, signalStanceCountsFromSignal(signal));
    return;
  }

  const counts = { bullish: 0, neutral: 0, bearish: 0 };
  for (const row of stanceRows) {
    if (row.stanceType === "bullish") counts.bullish += 1;
    else if (row.stanceType === "neutral") counts.neutral += 1;
    else counts.bearish += 1;
  }
  writeSignalStanceCounts(signal, counts);
}

function defaultUsers(now: string): FundgraphUser[] {
  return DEFAULT_USERS.map((user) => ({
    id: user.id,
    userId: user.id,
    name: user.name,
    credScore: 0,
    badgeTier: "NEW",
    credits: 0,
    contributions: 0,
    tier: "visitor",
    daily: {
      date: now.slice(0, 10),
      creditsEarned: 0,
      actions: { verify: 0, signal: 0, source: 0, upvote: 0 },
    },
    reputation: { credScore: 0 },
    createdAt: now,
    updatedAt: now,
  }));
}

function reconcileSignalsWithCuratedData(
  persistedSignals: Signal[],
  curatedSignals: Signal[],
  validFundIds: Set<string>
): { signals: Signal[]; changed: boolean } {
  const curatedById = new Map(curatedSignals.map((signal) => [signal.id, signal]));
  const merged = new Map<string, Signal>();
  let changed = false;

  for (const signal of persistedSignals.map(normalizeSignal)) {
    if (!signal.id) {
      changed = true;
      continue;
    }
    if (!validFundIds.has(signal.fundId)) {
      const curated = curatedById.get(signal.id);
      if (curated && validFundIds.has(curated.fundId)) {
        merged.set(signal.id, { ...curated, ...signal, fundId: curated.fundId });
      }
      changed = true;
      continue;
    }
    merged.set(signal.id, signal);
  }

  for (const curatedSignal of curatedSignals) {
    if (!validFundIds.has(curatedSignal.fundId)) continue;
    if (merged.has(curatedSignal.id)) continue;
    merged.set(curatedSignal.id, curatedSignal);
    changed = true;
  }

  const reconciled = dedupeSignals(Array.from(merged.values()));
  if (reconciled.length !== persistedSignals.length) changed = true;

  return { signals: reconciled, changed };
}

function normalizeClaim(claim: NewsClaim): NewsClaim {
  const verifies = Number.isFinite(claim.community.verifies)
    ? claim.community.verifies
    : claim.community.verifyCount ?? claim.community.verifiedCount ?? 0;
  const disagrees = Number.isFinite(claim.community.disagrees)
    ? claim.community.disagrees
    : claim.community.disagreeCount ?? claim.community.disputedCount ?? 0;
  const commentCount = Number.isFinite(claim.community.commentCount) ? claim.community.commentCount : 0;

  const machine = machineFromLegacyClaim(claim);
  const existingEvidence = Array.isArray(claim.verificationRecord?.evidence)
    ? claim.verificationRecord.evidence.filter((item) => !item.isSynthetic && item.metadata?.demoOnly !== true)
    : [];
  const citationEvidence = defaultCitationEvidence(claim);
  const evidence = [...existingEvidence];
  if (!evidence.find((item) => item.id === citationEvidence.id)) {
    evidence.unshift(citationEvidence);
  }
  const verificationRecord =
    claim.verificationRecord ??
    buildClaimVerificationRecord({
      claimId: claim.id,
      machine,
      evidence,
      votes: [],
      updatedAt: claim.updatedAt || claim.createdAt || new Date().toISOString(),
    });

  const trust = computeTrustScore({
    verificationVerdict: claim.llmVerification?.verdict ?? claim.verificationVerdict,
    verificationConfidence:
      claim.llmVerification?.confidence ??
      claim.verificationConfidence ??
      clamp((verificationRecord.score.finalScore ?? 0) / 100, 0, 1),
    citationSnippetLength: claim.citation?.snippet?.length ?? 0,
    citationCount: claim.citationCount ?? 1,
    verifiedCount: verifies,
    disputedCount: disagrees,
    authorCredScore: claim.authorCredScore ?? 0,
  });

  return {
    ...claim,
    linkedFundIds: Array.isArray(claim.linkedFundIds) ? claim.linkedFundIds : [],
    normalized: claim.normalized ?? normalizeClaimForConflict(claim.claimText, claim.entities),
    verification: claim.verification ??
      (claim.llmVerification
        ? {
            verdict: claim.llmVerification.verdict,
            rationale: claim.llmVerification.rationale,
            confidence: claim.llmVerification.confidence,
          }
        : undefined),
    verificationRecord: {
      ...verificationRecord,
      evidence,
      machine,
      updatedAt: verificationRecord.updatedAt || claim.updatedAt || claim.createdAt || new Date().toISOString(),
    },
    community: {
      ...claim.community,
      verifyCount: claim.community.verifyCount ?? verifies,
      disagreeCount: claim.community.disagreeCount ?? disagrees,
      commentCount,
      verifies,
      disagrees,
      trustScore: Number((claim.community.trustScore ?? trust.trustScore).toFixed(3)),
      verifiedCount: claim.community.verifiedCount ?? verifies,
      disputedCount: claim.community.disputedCount ?? disagrees,
    },
    trustScore: Number((claim.trustScore ?? trust.trustScore).toFixed(3)),
    trustTier: claim.trustTier ?? trust.trustTier,
    trustExplanation: claim.trustExplanation ?? trust.trustExplanation,
    createdAt: claim.createdAt || new Date().toISOString(),
    updatedAt: claim.updatedAt || claim.createdAt || new Date().toISOString(),
  };
}

function normalizeClaimForConflict(claimText: string, entities: string[]) {
  const text = claimText.trim();
  const lowered = text.toLowerCase();

  const entity = entities.find((item) => item.trim().length > 1)?.trim() ?? "Unknown Entity";

  let attribute = "general";
  if (/fund\s*size|aum|assets under management/.test(lowered)) attribute = "fund_size";
  else if (/round|raised|financing|valuation|amount|investment/.test(lowered)) attribute = "round_amount";
  else if (/revenue|arr|sales/.test(lowered)) attribute = "revenue";
  else if (/headcount|employees|hiring/.test(lowered)) attribute = "headcount";
  else if (/partnership|agreement|signed|deal/.test(lowered)) attribute = "partnership";

  const amountMatch = text.match(/\$?\d+(?:\.\d+)?\s?(?:billion|million|bn|m|k|%)/i);
  const value = amountMatch?.[0]?.trim() ?? text.slice(0, 120);

  let polarity: "positive" | "negative" | "neutral" = "neutral";
  if (/\b(not|no|deny|denied|decline|decrease|down|drop|halt|cut|fell|fall)\b/.test(lowered)) {
    polarity = "negative";
  } else if (/\b(launched|signed|raised|increased|grew|growth|up|added|expanded)\b/.test(lowered)) {
    polarity = "positive";
  }

  return { entity, attribute, value, polarity };
}

function conflictKey(claimIdA: string, claimIdB: string): string {
  return [claimIdA, claimIdB].sort().join("::");
}

function claimsConflict(a: NewsClaim, b: NewsClaim): boolean {
  const an = a.normalized ?? normalizeClaimForConflict(a.claimText, a.entities);
  const bn = b.normalized ?? normalizeClaimForConflict(b.claimText, b.entities);

  if (an.entity.toLowerCase().trim() !== bn.entity.toLowerCase().trim()) return false;
  if (an.attribute.toLowerCase().trim() !== bn.attribute.toLowerCase().trim()) return false;

  const av = an.value.toLowerCase().trim();
  const bv = bn.value.toLowerCase().trim();
  if (av && bv && av !== bv) return true;
  if (an.polarity !== "neutral" && bn.polarity !== "neutral" && an.polarity !== bn.polarity) return true;
  return false;
}

function fallbackResolutionHint(a: NewsClaim, b: NewsClaim): string {
  const entity = (a.normalized?.entity || b.normalized?.entity || "the entity").trim();
  const attribute = (a.normalized?.attribute || b.normalized?.attribute || "the contested attribute").trim();
  return `Collect a primary source that directly states ${entity}'s ${attribute} (official filing, press release, or audited report).`;
}

async function resolutionHintForConflict(a: NewsClaim, b: NewsClaim): Promise<string> {
  try {
    const llm = await resolveConflictHintWithLlm({
      claimA: a.claimText,
      citationA: a.citation?.snippet ?? "",
      claimB: b.claimText,
      citationB: b.citation?.snippet ?? "",
    });
    if (typeof llm.resolutionHint === "string" && llm.resolutionHint.trim().length) {
      return llm.resolutionHint.trim();
    }
  } catch {
    // Fallback is used when LLM is unavailable.
  }
  return fallbackResolutionHint(a, b);
}

async function ensureConflicts(db: FundgraphDbFile): Promise<void> {
  const claimById = new Map(db.claims.map((claim) => [claim.id, claim]));
  db.conflicts = db.conflicts.filter((conflict) => claimById.has(conflict.claimIdA) && claimById.has(conflict.claimIdB));

  const existing = new Set(db.conflicts.map((conflict) => conflictKey(conflict.claimIdA, conflict.claimIdB)));
  const now = new Date().toISOString();

  for (let i = 0; i < db.claims.length; i += 1) {
    for (let j = i + 1; j < db.claims.length; j += 1) {
      const a = db.claims[i];
      const b = db.claims[j];
      if (!claimsConflict(a, b)) continue;

      const key = conflictKey(a.id, b.id);
      if (existing.has(key)) continue;

      const hint = await resolutionHintForConflict(a, b);
      db.conflicts.push({
        id: `fg-conflict-${db.conflicts.length + 1}-${Date.now()}`,
        claimIdA: [a.id, b.id].sort()[0],
        claimIdB: [a.id, b.id].sort()[1],
        status: "open",
        resolutionHint: hint,
        createdAt: now,
        updatedAt: now,
      });
      existing.add(key);
    }
  }
}

function normalizeProfile(profile: UserProfile): UserProfile {
  const geographyFocus = Array.isArray(profile.geographyFocus)
    ? profile.geographyFocus
    : Array.isArray(profile.geographies)
      ? profile.geographies
      : [];

  const checkSizeMinM = typeof profile.checkSizeMinM === "number" ? profile.checkSizeMinM : 0.5;
  const checkSizeMaxM = typeof profile.checkSizeMaxM === "number" ? profile.checkSizeMaxM : 10;
  const typicalCheckSizeM =
    typeof profile.typicalCheckSizeM === "number"
      ? profile.typicalCheckSizeM
      : typeof profile.typicalCheckSizeKUsd === "number"
        ? profile.typicalCheckSizeKUsd / 1000
        : (checkSizeMinM + checkSizeMaxM) / 2;

  return {
    ...profile,
    userId: profile.userId ?? profile.id ?? "anon",
    id: profile.id ?? profile.userId,
    sectorFocus: Array.isArray(profile.sectorFocus) ? profile.sectorFocus : [],
    stageFocus: Array.isArray(profile.stageFocus) ? profile.stageFocus : [],
    geographyFocus,
    geographies: geographyFocus,
    checkSizeMinM,
    checkSizeMaxM,
    typicalCheckSizeM,
    typicalCheckSizeKUsd: Math.max(10, Math.round(typicalCheckSizeM * 1000)),
    riskTolerance: profile.riskTolerance ?? "medium",
    thesisKeywords: Array.isArray(profile.thesisKeywords) ? profile.thesisKeywords : [],
    updatedAt: profile.updatedAt ?? new Date().toISOString(),
    weights: profile.weights,
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function initializeDbIfMissing(): Promise<void> {
  if (dbInitializationChecked) return;
  try {
    const [seedSignalsRaw, funds, exists] = await Promise.all([
      readSignalSeedSnapshot().catch(() => [] as Signal[]),
      readFunds().catch(() => []),
      fileExists(DB_FILE),
    ]);
    const seededSignals = dedupeSignals(seedSignalsRaw.map(normalizeSignal));
    const validFundIds = new Set(funds.map((fund) => fund.id));
    const now = new Date().toISOString();
    const fallbackUsers = defaultUsers(now);
    await fs.mkdir(path.dirname(DB_FILE), { recursive: true });

    if (!exists) {
      await fs.writeFile(
        DB_FILE,
        JSON.stringify({ ...EMPTY_DB, signals: seededSignals, users: fallbackUsers, credByUser: { siddharth: 0, anon: 0 } }, null, 2),
        "utf8"
      );
      return;
    }

    let parsed: Partial<FundgraphDbFile>;
    try {
      parsed = JSON.parse(await fs.readFile(DB_FILE, "utf8")) as Partial<FundgraphDbFile>;
    } catch {
      parsed = {};
    }

    const persistedSignals = Array.isArray(parsed.signals) ? parsed.signals.map(normalizeSignal) : [];
    const signalSync = reconcileSignalsWithCuratedData(persistedSignals, seededSignals, validFundIds);

    const nextUsers = Array.isArray(parsed.users) ? [...parsed.users] : [];
    const nextCredByUser =
      parsed.credByUser && typeof parsed.credByUser === "object"
        ? { ...(parsed.credByUser as Record<string, number>) }
        : {};

    const fallbackByUserId = new Map(fallbackUsers.map((user) => [user.id, user]));
    let userSyncChanged = false;
    for (const seed of DEFAULT_USERS) {
      if (!nextUsers.some((user) => user.id === seed.id)) {
        const fallback = fallbackByUserId.get(seed.id);
        if (fallback) nextUsers.push(fallback);
        userSyncChanged = true;
      }
      if (!(seed.id in nextCredByUser)) {
        nextCredByUser[seed.id] = 0;
        userSyncChanged = true;
      }
    }

    if (!signalSync.changed && !userSyncChanged) return;

    const nextDb: FundgraphDbFile = {
      claims: Array.isArray(parsed.claims) ? parsed.claims : [],
      signals: signalSync.signals,
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      verifications: Array.isArray(parsed.verifications) ? parsed.verifications : [],
      credByUser: nextCredByUser,
      users: nextUsers,
      conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [],
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      claimLinks: Array.isArray(parsed.claimLinks) ? parsed.claimLinks : [],
      memos: Array.isArray(parsed.memos) ? parsed.memos : [],
      contributionEvents: Array.isArray(parsed.contributionEvents) ? parsed.contributionEvents : [],
      signalStances: Array.isArray(parsed.signalStances) ? parsed.signalStances : [],
    };
    await fs.writeFile(DB_FILE, JSON.stringify(nextDb, null, 2), "utf8");
  } finally {
    dbInitializationChecked = true;
  }
}

async function readDbFile(): Promise<FundgraphDbFile> {
  await initializeDbIfMissing();
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<FundgraphDbFile>;
    const db: FundgraphDbFile = {
      claims: Array.isArray(parsed.claims) ? parsed.claims.map(normalizeClaim) : [],
      signals: dedupeSignals(Array.isArray(parsed.signals) ? parsed.signals.map(normalizeSignal) : []),
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles.map(normalizeProfile) : [],
      verifications: Array.isArray(parsed.verifications)
        ? parsed.verifications.map((entry) => ({
            ...entry,
            vote: normalizeVote((entry as Verification).vote as CommunityVoteInput),
            targetType: (entry as Verification).targetType ?? ((entry as Verification).signalId ? "signal" : "claim"),
            contributor: ensureContributorProfile((entry as Verification).contributor),
          }))
        : [],
      credByUser:
        parsed.credByUser && typeof parsed.credByUser === "object"
          ? (parsed.credByUser as Record<string, number>)
          : {},
      users: Array.isArray(parsed.users) ? parsed.users : [],
      conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [],
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      claimLinks: Array.isArray(parsed.claimLinks) ? parsed.claimLinks : [],
      memos: Array.isArray(parsed.memos) ? parsed.memos : [],
      contributionEvents: Array.isArray(parsed.contributionEvents) ? parsed.contributionEvents : [],
      signalStances: Array.isArray(parsed.signalStances)
        ? (parsed.signalStances as SignalStance[]).filter(
            (entry) =>
              typeof entry?.signalId === "string" &&
              typeof entry?.userId === "string" &&
              (entry.stanceType === "bullish" || entry.stanceType === "neutral" || entry.stanceType === "bearish")
          )
        : [],
    };

    for (const seed of DEFAULT_USERS) {
      if (!(seed.id in db.credByUser)) db.credByUser[seed.id] = 0;
      touchUser(db, seed.id, seed.name);
    }

    db.claims = db.claims.map((claim) => syncClaimTrustFromVerificationRecord(claim, db));
    db.signals = db.signals.map((signal) => {
      syncSignalStanceCounts(signal, db);
      return signal;
    });

    return db;
  } catch {
    const now = new Date().toISOString();
    const [seedSignalsRaw, funds] = await Promise.all([
      readSignalSeedSnapshot().catch(() => [] as Signal[]),
      readFunds().catch(() => []),
    ]);
    const seedSignals = seedSignalsRaw.map(normalizeSignal);
    const validFundIds = new Set(funds.map((fund) => fund.id));
    const fallbackSignals = reconcileSignalsWithCuratedData([], seedSignals, validFundIds).signals;
    return {
      ...EMPTY_DB,
      signals: fallbackSignals,
      users: defaultUsers(now),
      credByUser: { siddharth: 0, anon: 0 },
    };
  }
}

async function writeDbFile(db: FundgraphDbFile): Promise<void> {
  await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
  const tmp = `${DB_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, DB_FILE);
}

async function withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  const prev = writeChain;
  let resolveNext: () => void = () => {};
  writeChain = new Promise<void>((resolve) => {
    resolveNext = resolve;
  });
  await prev;
  try {
    return await operation();
  } finally {
    resolveNext();
  }
}

function touchUser(db: FundgraphDbFile, userId: string, name?: string): FundgraphUser {
  const now = new Date().toISOString();
  const existing = db.users.find((user) => user.id === userId);
  const cred = db.credByUser[userId] ?? existing?.credScore ?? existing?.credits ?? 0;
  const contributions = typeof existing?.contributions === "number" ? existing.contributions : 0;
  const tier = existing?.tier ?? "visitor";
  const daily = existing?.daily ?? {
    date: now.slice(0, 10),
    creditsEarned: 0,
    actions: { verify: 0, signal: 0, source: 0, upvote: 0 },
  };
  const reputation = existing?.reputation ?? { credScore: cred };

  if (existing) {
    if (name && name.trim()) existing.name = name.trim();
    existing.userId = userId;
    existing.credScore = cred;
    existing.badgeTier = toBadgeTier(cred);
    existing.credits = cred;
    existing.contributions = contributions;
    existing.tier = tier;
    existing.daily = daily;
    existing.reputation = { ...reputation, credScore: cred };
    existing.updatedAt = now;
    return existing;
  }

  const created: FundgraphUser = {
    id: userId,
    userId,
    name: name?.trim() || userId,
    credScore: cred,
    badgeTier: toBadgeTier(cred),
    credits: cred,
    contributions,
    tier,
    daily,
    reputation: { ...reputation, credScore: cred },
    createdAt: now,
    updatedAt: now,
  };
  db.users.push(created);
  return created;
}

function defaultContributorForUser(db: FundgraphDbFile, userId: string): VerificationContributorProfile {
  const user = touchUser(db, userId);
  const membershipTier = tierForGamificationTier(user.tier);
  return {
    label: `${membershipTier.replace("_", " ").toLowerCase()} member`,
    role: "MEMBER",
    tier: membershipTier,
    isAnonymous: false,
  };
}

function applyCredDelta(db: FundgraphDbFile, userId: string, delta: number, name?: string): number {
  const current = db.credByUser[userId] ?? 0;
  const next = Math.max(0, current + Math.floor(delta));
  db.credByUser[userId] = next;

  const user = touchUser(db, userId, name);
  user.credScore = next;
  user.badgeTier = toBadgeTier(next);
  user.credits = next;
  user.reputation = {
    ...(user.reputation ?? {}),
    credScore: next,
  };
  user.updatedAt = new Date().toISOString();
  return next;
}

function claimVotes(db: FundgraphDbFile, claimId: string): Verification[] {
  return db.verifications.filter((entry) => entry.claimId === claimId && !entry.signalId);
}

function signalVotes(db: FundgraphDbFile, signalId: string): Verification[] {
  return db.verifications.filter((entry) => entry.signalId === signalId);
}

function weightedSignalVoteCounts(votes: Verification[]): { verifies: number; disputes: number } {
  let verifies = 0;
  let disputes = 0;
  for (const vote of votes) {
    const weight = typeof vote.trustWeight === "number" && Number.isFinite(vote.trustWeight)
      ? Math.max(0.1, Math.min(1, vote.trustWeight))
      : vote.seeded
        ? 0.35
        : 1;
    if (vote.vote === "verify") verifies += weight;
    else if (vote.vote === "dispute") disputes += weight;
  }
  return {
    verifies: Number(verifies.toFixed(3)),
    disputes: Number(disputes.toFixed(3)),
  };
}

function refreshClaimVerificationRecord(db: FundgraphDbFile, claim: NewsClaim): ClaimVerificationRecord {
  const persistedVotes = claimVotes(db, claim.id).map((vote) => ({
    ...vote,
    contributor: ensureContributorProfile(vote.contributor),
  }));
  const votes = [...persistedVotes];
  const baseEvidence = Array.isArray(claim.verificationRecord?.evidence)
    ? claim.verificationRecord.evidence.filter((item) => !item.isSynthetic && item.metadata?.demoOnly !== true)
    : [];
  const citationEvidence = defaultCitationEvidence(claim);
  const evidenceIndex = new Map<string, ClaimEvidence>();
  for (const item of [...baseEvidence, citationEvidence]) {
    evidenceIndex.set(item.id, {
      ...item,
      claimId: claim.id,
      contributor: ensureContributorProfile(item.contributor),
      submittedAt: item.submittedAt || claim.updatedAt || claim.createdAt || new Date().toISOString(),
    });
  }
  const evidence = [...evidenceIndex.values()];
  const machine = claim.verificationRecord?.machine ?? machineFromLegacyClaim(claim);
  const record = buildClaimVerificationRecord({
    claimId: claim.id,
    machine,
    evidence,
    votes,
    updatedAt: claim.updatedAt || new Date().toISOString(),
  });
  claim.verificationRecord = record;
  return record;
}

function syncClaimTrustFromVerificationRecord(claim: NewsClaim, db: FundgraphDbFile): NewsClaim {
  const record = refreshClaimVerificationRecord(db, claim);
  const verifies = record.community.verifyCount;
  const disputes = record.community.disputeCount;

  const legacyVerdict =
    record.status === "VERIFIED"
      ? "supported"
      : record.status === "DISPUTED"
        ? "unsupported"
        : record.machine.citationSupport === "STRONG" || record.machine.citationSupport === "MEDIUM"
          ? "mixed"
          : "unsupported";
  const legacyConfidence = Number(clamp(record.score.finalScore / 100, 0, 1).toFixed(3));

  const authorCred = claim.authorUserId ? db.credByUser[claim.authorUserId] ?? 0 : claim.authorCredScore ?? 0;
  claim.authorCredScore = authorCred;
  claim.verificationVerdict = legacyVerdict;
  claim.verificationConfidence = legacyConfidence;
  claim.verification = {
    verdict: legacyVerdict,
    rationale: record.machine.reasoningSummary,
    confidence: legacyConfidence,
  };
  claim.community.verifyCount = verifies;
  claim.community.verifiedCount = verifies;
  claim.community.verifies = verifies;
  claim.community.disagreeCount = disputes;
  claim.community.disputedCount = disputes;
  claim.community.disagrees = disputes;
  claim.community.trustScore = record.score.finalScore;
  claim.trustScore = record.score.finalScore;
  claim.trustTier = record.score.confidenceTier;
  claim.trustExplanation = `${record.status}: machine ${record.machine.citationSupport.toLowerCase()}, community ${verifies} verify / ${disputes} dispute.`;
  return claim;
}

function withClaimTrust(claim: NewsClaim, db: FundgraphDbFile): NewsClaim {
  const cloned: NewsClaim = JSON.parse(JSON.stringify(claim)) as NewsClaim;
  return syncClaimTrustFromVerificationRecord(cloned, db);
}

function withSignalTrust(signal: Signal, db: FundgraphDbFile): Signal {
  const hydrated = normalizeSignal(signal);
  syncSignalStanceCounts(hydrated, db);
  const verifies = hydrated.verifyCount ?? hydrated.verifiedCount ?? hydrated.verifies ?? 0;
  const disputes = hydrated.disagreeCount ?? hydrated.disputedCount ?? hydrated.disagrees ?? 0;
  const weightedVotes = weightedSignalVoteCounts(signalVotes(db, hydrated.id));
  const authorId = hydrated.authorUserId ?? hydrated.userId;
  const authorCred = authorId ? db.credByUser[authorId] ?? 0 : 0;
  const citationSnippetLength = hydrated.evidenceSnippet?.length ?? hydrated.evidence?.snippet?.length ?? 0;
  const citationCount = hydrated.evidenceSnippet || hydrated.evidenceUrl || hydrated.evidence?.snippet || hydrated.evidence?.url ? 1 : 0;

  const trust = computeTrustScore({
    verificationVerdict: hydrated.verificationVerdict,
    verificationConfidence: hydrated.verificationConfidence ?? hydrated.confidence,
    citationSnippetLength,
    citationCount,
    verifiedCount: weightedVotes.verifies,
    disputedCount: weightedVotes.disputes,
    authorCredScore: authorCred,
  });

  return {
    ...hydrated,
    verifyCount: verifies,
    verifiedCount: verifies,
    verifies,
    disagreeCount: disputes,
    disputedCount: disputes,
    disagrees: disputes,
    trustScore: trust.trustScore,
    trustTier: trust.trustTier,
    trustExplanation: trust.trustExplanation,
  };
}

function isDiscussionNoteReadable(value: string): boolean {
  const text = normalizeFundgraphText(value, 320);
  if (!text || text.length < 24) return false;
  if (hasHardScrapeNoise(text) || hasNavigationNoise(text) || isLikelyBoilerplateScrapeText(text)) return false;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount < 6) return false;
  return true;
}

export async function getFundDiscussionNotes(
  fundId: string,
  limit = 30,
  options?: { includeSeeded?: boolean }
): Promise<Array<{ id: string; user: string; comment: string; timestamp: string; votes: number; seeded: boolean; signalId: string }>> {
  const db = await readDbFile();
  const includeSeeded = Boolean(options?.includeSeeded);
  const signalIds = new Set((db.signals ?? []).filter((signal) => signal.fundId === fundId).map((signal) => signal.id));
  if (!signalIds.size) return [];

  const userById = new Map((db.users ?? []).map((user) => [user.id, user.name || "Community Member"]));
  const seen = new Set<string>();
  const notes: Array<{ id: string; user: string; comment: string; timestamp: string; votes: number; seeded: boolean; signalId: string }> = [];

  const ranked = [...(db.verifications ?? [])]
    .filter((entry) => entry.signalId && signalIds.has(entry.signalId))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  for (const entry of ranked) {
    if (!includeSeeded && entry.seeded) continue;
    const raw = entry.note || entry.comment || "";
    const comment = normalizeFundgraphText(raw, 320);
    if (!isDiscussionNoteReadable(comment)) continue;
    const key = `${entry.signalId}|${comment.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    notes.push({
      id: entry.id,
      user: entry.seeded ? "Seeded baseline" : userById.get(entry.userId) ?? "Community Member",
      comment,
      timestamp: entry.createdAt,
      votes: entry.vote === "verify" ? 3 : 2,
      seeded: Boolean(entry.seeded),
      signalId: entry.signalId!,
    });
    if (notes.length >= Math.max(1, Math.floor(limit))) break;
  }

  return notes;
}

export async function readFundgraphDb(): Promise<FundgraphDbFile> {
  return readDbFile();
}

export async function mutateFundgraphDb<T>(operation: (db: FundgraphDbFile) => Promise<T> | T): Promise<T> {
  return withWriteLock(async () => {
    const db = await readDbFile();
    const result = await operation(db);
    await writeDbFile(db);
    return result;
  });
}

export async function getClaims(): Promise<NewsClaim[]> {
  const db = await readDbFile();
  return [...db.claims].map((claim) => withClaimTrust(claim, db)).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export async function getClaimById(claimId: string): Promise<NewsClaim | null> {
  const db = await readDbFile();
  const claim = db.claims.find((entry) => entry.id === claimId);
  return claim ? withClaimTrust(claim, db) : null;
}

export async function getClaimVerificationRecord(claimId: string): Promise<ClaimVerificationRecord | null> {
  const db = await readDbFile();
  const claim = db.claims.find((entry) => entry.id === claimId);
  if (!claim) return null;
  const hydrated = withClaimTrust(claim, db);
  return hydrated.verificationRecord ?? null;
}

export async function addClaimEvidence(input: { claimId: string; evidence: ClaimEvidence }): Promise<NewsClaim | null> {
  return withWriteLock(async () => {
    const db = await readDbFile();
    const claim = db.claims.find((entry) => entry.id === input.claimId);
    if (!claim) return null;

    const currentEvidence = Array.isArray(claim.verificationRecord?.evidence) ? claim.verificationRecord.evidence : [];
    const nextEvidence: ClaimEvidence = {
      ...input.evidence,
      claimId: input.claimId,
      submittedAt: input.evidence.submittedAt || new Date().toISOString(),
      contributor: ensureContributorProfile(input.evidence.contributor),
    };
    const deduped = currentEvidence.filter((item) => item.id !== nextEvidence.id);
    deduped.unshift(nextEvidence);
    claim.verificationRecord = claim.verificationRecord
      ? { ...claim.verificationRecord, evidence: deduped, updatedAt: new Date().toISOString() }
      : buildClaimVerificationRecord({
          claimId: claim.id,
          machine: machineFromLegacyClaim(claim),
          evidence: deduped.length ? deduped : [defaultCitationEvidence(claim)],
          votes: claimVotes(db, claim.id),
          updatedAt: new Date().toISOString(),
        });
    claim.updatedAt = new Date().toISOString();
    syncClaimTrustFromVerificationRecord(claim, db);
    await writeDbFile(db);
    return withClaimTrust(claim, db);
  });
}

export async function upsertClaims(claims: NewsClaim[]): Promise<NewsClaim[]> {
  return withWriteLock(async () => {
    const db = await readDbFile();
    const index = new Map<string, NewsClaim>();
    for (const claim of db.claims) index.set(claim.id, claim);
    for (const claim of claims.map(normalizeClaim)) index.set(claim.id, claim);
    db.claims = Array.from(index.values()).map(normalizeClaim);
    await ensureConflicts(db);
    await writeDbFile(db);
    return claims.map(normalizeClaim).map((claim) => withClaimTrust(claim, db));
  });
}

export async function replaceClaimsForSource(sourceId: string, claims: NewsClaim[]): Promise<NewsClaim[]> {
  return withWriteLock(async () => {
    const db = await readDbFile();
    db.claims = db.claims.filter((claim) => claim.sourceId !== sourceId).concat(claims.map(normalizeClaim));
    await ensureConflicts(db);
    await writeDbFile(db);
    return claims.map(normalizeClaim).map((claim) => withClaimTrust(claim, db));
  });
}

export async function setClaimLlmVerification(
  claimId: string,
  verification: ClaimLLMVerification | MachineVerificationBreakdown
): Promise<NewsClaim | null> {
  return withWriteLock(async () => {
    const db = await readDbFile();
    const claim = db.claims.find((item) => item.id === claimId);
    if (!claim) return null;

    const machine: MachineVerificationBreakdown =
      "citationSupport" in verification
        ? verification
        : {
            citationSupport:
              verification.verdict === "supported"
                ? "STRONG"
                : verification.verdict === "mixed"
                  ? "MEDIUM"
                  : "WEAK",
            sourceRelevance: verification.verdict === "supported" ? "HIGH" : verification.verdict === "mixed" ? "MEDIUM" : "LOW",
            freshness: "RECENT",
            conflictDetected: verification.verdict === "unsupported",
            reasoningSummary: verification.rationale,
            machineConfidence: Number(clamp(verification.confidence * 100, 0, 100).toFixed(2)),
          };
    const verdict = legacyVerdictFromMachine(machine);
    const confidence = Number(clamp(machine.machineConfidence / 100, 0, 1).toFixed(3));

    claim.llmVerification = {
      verdict,
      rationale: machine.reasoningSummary,
      confidence,
      verifiedAt: new Date().toISOString(),
    };
    claim.verification = {
      verdict,
      rationale: machine.reasoningSummary,
      confidence,
    };
    claim.verificationVerdict = verdict;
    claim.verificationConfidence = confidence;
    const existingEvidence = Array.isArray(claim.verificationRecord?.evidence)
      ? claim.verificationRecord.evidence.filter((item) => !item.isSynthetic && item.metadata?.demoOnly !== true)
      : [];
    const citationEvidence = defaultCitationEvidence(claim);
    const evidence = [
      citationEvidence,
      ...existingEvidence.filter((item) => item.id !== citationEvidence.id),
    ];
    claim.verificationRecord = claim.verificationRecord
      ? { ...claim.verificationRecord, machine }
      : buildClaimVerificationRecord({
          claimId: claim.id,
          machine,
          evidence,
          votes: claimVotes(db, claim.id),
          updatedAt: claim.updatedAt || new Date().toISOString(),
        });
    claim.updatedAt = new Date().toISOString();
    syncClaimTrustFromVerificationRecord(claim, db);

    await writeDbFile(db);
    return withClaimTrust(claim, db);
  });
}

export async function addClaimVote(input: {
  claimId: string;
  userId: string;
  vote: CommunityVoteInput;
  note?: string;
  comment?: string;
  contributor?: VerificationContributorProfile;
  verificationId: string;
}): Promise<NewsClaim | null> {
  return withWriteLock(async () => {
    const db = await readDbFile();
    const claim = db.claims.find((item) => item.id === input.claimId);
    if (!claim) return null;

    const vote = normalizeVote(input.vote);
    const normalizedNote = input.note ? normalizeFundgraphText(input.note, 320) : undefined;
    const normalizedComment = input.comment ? normalizeFundgraphText(input.comment, 320) : undefined;
    const now = new Date().toISOString();
    const existing = db.verifications.find(
      (entry) => entry.claimId === input.claimId && entry.userId === input.userId && !entry.signalId
    );

    if (existing) {
      existing.vote = vote;
      existing.note = normalizedNote;
      existing.comment = normalizedComment;
      existing.contributor = ensureContributorProfile(input.contributor ?? existing.contributor ?? defaultContributorForUser(db, input.userId));
      existing.createdAt = now;
    } else {
      const row: Verification = {
        id: input.verificationId,
        targetType: "claim",
        claimId: input.claimId,
        userId: input.userId,
        vote,
        note: normalizedNote,
        comment: normalizedComment,
        contributor: ensureContributorProfile(input.contributor ?? defaultContributorForUser(db, input.userId)),
        createdAt: now,
      };
      db.verifications.push(row);
    }

    const votes = db.verifications.filter((entry) => entry.claimId === input.claimId && !entry.signalId);
    const verifies = votes.filter((entry) => entry.vote === "verify").length;
    const disputes = votes.filter((entry) => entry.vote === "dispute").length;

    claim.community.verifyCount = verifies;
    claim.community.disagreeCount = disputes;
    claim.community.commentCount = Math.max(claim.community.commentCount, votes.filter((entry) => entry.note || entry.comment).length);
    claim.community.verifies = verifies;
    claim.community.disagrees = disputes;
    claim.community.verifiedCount = verifies;
    claim.community.disputedCount = disputes;
    claim.updatedAt = now;
    syncClaimTrustFromVerificationRecord(claim, db);

    await writeDbFile(db);
    return withClaimTrust(claim, db);
  });
}

export async function getSignals(): Promise<Signal[]> {
  const db = await readDbFile();
  return filterSignalsForDisplay(
    [...db.signals]
    .map((signal) => withSignalTrust(signal, db))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
  );
}

export async function getSignalById(signalId: string): Promise<Signal | null> {
  const db = await readDbFile();
  const signal = db.signals.find((entry) => entry.id === signalId);
  return signal ? withSignalTrust(signal, db) : null;
}

export async function addSignal(signal: Signal): Promise<Signal> {
  const normalized = normalizeSignal({
    ...signal,
    advancedInsight: undefined,
    advancedInsightStatus: undefined,
    advancedInsightError: undefined,
    advancedInsightUpdatedAt: undefined,
  });
  return withWriteLock(async () => {
    const db = await readDbFile();
    db.signals = dedupeSignals([normalized, ...db.signals]);
    const stored = db.signals.find((entry) => entry.id === normalized.id) ?? db.signals[0] ?? normalized;
    await writeDbFile(db);
    return withSignalTrust(stored, db);
  });
}

export async function setSignalAdvancedInsight(input: {
  signalId: string;
  insight: AdvancedSignalInsight;
}): Promise<Signal | null> {
  return withWriteLock(async () => {
    const db = await readDbFile();
    const signal = db.signals.find((item) => item.id === input.signalId);
    if (!signal) return null;
    signal.advancedInsight = input.insight;
    signal.advancedInsightStatus = "ready";
    signal.advancedInsightError = undefined;
    signal.advancedInsightUpdatedAt = new Date().toISOString();
    await writeDbFile(db);
    return withSignalTrust(signal, db);
  });
}

export async function setSignalAdvancedInsightState(input: {
  signalId: string;
  status: "preparing" | "ready" | "failed";
  insight?: AdvancedSignalInsight;
  error?: string;
  clearInsight?: boolean;
  updatedAt?: string;
}): Promise<Signal | null> {
  return withWriteLock(async () => {
    const db = await readDbFile();
    const signal = db.signals.find((item) => item.id === input.signalId);
    if (!signal) return null;
    const now = input.updatedAt ?? new Date().toISOString();

    signal.advancedInsightStatus = input.status;
    signal.advancedInsightUpdatedAt = now;

    if (input.status === "ready" && input.insight) {
      signal.advancedInsight = input.insight;
      signal.advancedInsightError = undefined;
    } else {
      if (input.clearInsight || input.status !== "ready") {
        signal.advancedInsight = undefined;
      }
      signal.advancedInsightError = input.error?.trim() || undefined;
    }

    await writeDbFile(db);
    return withSignalTrust(signal, db);
  });
}

export async function addSignalSourceCitation(input: {
  signalId: string;
  title?: string;
  url?: string;
  snippet?: string;
  note?: string;
}): Promise<Signal | null> {
  return withWriteLock(async () => {
    const db = await readDbFile();
    const signal = db.signals.find((item) => item.id === input.signalId);
    if (!signal) return null;

    const nextUrl = input.url?.trim();
    const nextSnippet = input.snippet?.trim() || input.note?.trim();
    if (nextUrl) signal.evidenceUrl = nextUrl;
    if (nextSnippet) signal.evidenceSnippet = nextSnippet;
    if (nextUrl || nextSnippet) {
      signal.evidence = {
        url: signal.evidenceUrl,
        snippet: signal.evidenceSnippet,
      };
    }
    clearAdvancedInsight(signal);

    await writeDbFile(db);
    return withSignalTrust(signal, db);
  });
}

export async function addSignalVote(input: {
  signalId: string;
  userId: string;
  vote: CommunityVoteInput;
  note?: string;
  verificationId: string;
}): Promise<Signal | null> {
  return withWriteLock(async () => {
    const db = await readDbFile();
    const signal = db.signals.find((item) => item.id === input.signalId);
    if (!signal) return null;

    const vote = normalizeVote(input.vote);
    const normalizedNote = input.note ? normalizeFundgraphText(input.note, 320) : undefined;
    const now = new Date().toISOString();
    const existing = db.verifications.find(
      (entry) => entry.signalId === input.signalId && entry.userId === input.userId
    );

    if (existing) {
      existing.vote = vote;
      existing.note = normalizedNote;
      existing.createdAt = now;
    } else {
      db.verifications.push({
        id: input.verificationId,
        targetType: "signal",
        signalId: input.signalId,
        userId: input.userId,
        vote,
        note: normalizedNote,
        createdAt: now,
      });
    }

    const votes = db.verifications.filter((entry) => entry.signalId === input.signalId);
    const verifies = votes.filter((entry) => entry.vote === "verify").length;
    const disputes = votes.filter((entry) => entry.vote === "dispute").length;

    signal.verifiedCount = verifies;
    signal.verifyCount = verifies;
    signal.verifies = verifies;
    signal.disputedCount = disputes;
    signal.disagreeCount = disputes;
    signal.disagrees = disputes;
    signal.commentsCount = Math.max(signal.commentsCount, votes.filter((entry) => entry.note).length);

    const authorUserId = signal.authorUserId ?? signal.userId;
    const authorCred = authorUserId ? db.credByUser[authorUserId] ?? 0 : 0;
    const trust = computeTrustScore({
      verificationVerdict: signal.verificationVerdict,
      verificationConfidence: signal.verificationConfidence,
      citationSnippetLength: signal.evidenceSnippet?.length ?? 0,
      citationCount: signal.evidenceSnippet ? 1 : 0,
      verifiedCount: verifies,
      disputedCount: disputes,
      authorCredScore: authorCred,
    });

    signal.trustScore = trust.trustScore;
    signal.trustTier = trust.trustTier;
    signal.trustExplanation = trust.trustExplanation;

    const recomputedTrust = computeTrustScore({
      verificationVerdict: signal.verificationVerdict,
      verificationConfidence: signal.verificationConfidence,
      citationSnippetLength: signal.evidenceSnippet?.length ?? 0,
      citationCount: signal.evidenceSnippet ? 1 : 0,
      verifiedCount: verifies,
      disputedCount: disputes,
      authorCredScore: (signal.authorUserId ?? signal.userId) ? db.credByUser[signal.authorUserId ?? signal.userId ?? ""] ?? 0 : 0,
    });
    signal.trustScore = recomputedTrust.trustScore;
    signal.trustTier = recomputedTrust.trustTier;
    signal.trustExplanation = recomputedTrust.trustExplanation;
    clearAdvancedInsight(signal);

    await writeDbFile(db);
    return withSignalTrust(signal, db);
  });
}

export async function setSignalStance(input: {
  signalId: string;
  userId: string;
  stanceType: SignalStanceType;
  stanceId: string;
}): Promise<Signal | null> {
  return withWriteLock(async () => {
    const db = await readDbFile();
    const signal = db.signals.find((item) => item.id === input.signalId);
    if (!signal) return null;

    db.signalStances = db.signalStances ?? [];
    const now = new Date().toISOString();
    const existing = db.signalStances.find((entry) => entry.signalId === input.signalId && entry.userId === input.userId);
    if (existing) {
      existing.stanceType = input.stanceType;
      existing.createdAt = now;
    } else {
      db.signalStances.push({
        id: input.stanceId,
        signalId: input.signalId,
        userId: input.userId,
        stanceType: input.stanceType,
        createdAt: now,
      });
    }

    syncSignalStanceCounts(signal, db);
    clearAdvancedInsight(signal);
    await writeDbFile(db);
    return { ...withSignalTrust(signal, db), userStance: input.stanceType };
  });
}

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const db = await readDbFile();
  return db.profiles.find((profile) => (profile.userId ?? profile.id) === userId) ?? null;
}

export async function upsertProfile(profile: UserProfile): Promise<UserProfile> {
  const normalized = normalizeProfile(profile);
  return withWriteLock(async () => {
    const db = await readDbFile();
    const key = normalized.userId ?? normalized.id ?? "anon";
    const idx = db.profiles.findIndex((item) => (item.userId ?? item.id) === key);
    if (idx === -1) db.profiles.push(normalized);
    else db.profiles[idx] = normalized;
    await writeDbFile(db);
    return normalized;
  });
}

export async function ensureUser(userId: string, name?: string): Promise<FundgraphUser> {
  return withWriteLock(async () => {
    const db = await readDbFile();
    const user = touchUser(db, userId, name);
    await writeDbFile(db);
    return user;
  });
}

export async function getUserById(userId: string): Promise<FundgraphUser | null> {
  const db = await readDbFile();
  return db.users.find((user) => user.id === userId) ?? null;
}

export async function addCred(userId: string, delta: number): Promise<number> {
  return withWriteLock(async () => {
    const db = await readDbFile();
    const next = applyCredDelta(db, userId, delta);
    await writeDbFile(db);
    return next;
  });
}

export async function getCred(userId: string): Promise<number> {
  const db = await readDbFile();
  return db.credByUser[userId] ?? 0;
}

export async function addSource(source: Source): Promise<Source> {
  return withWriteLock(async () => {
    const db = await readDbFile();
    const existing = db.sources?.find((item) => item.id === source.id);
    if (existing) {
      Object.assign(existing, source);
    } else {
      db.sources = db.sources ?? [];
      db.sources.unshift(source);
    }
    await writeDbFile(db);
    return source;
  });
}

export async function getSources(limit?: number): Promise<Source[]> {
  const db = await readDbFile();
  const sorted = [...(db.sources ?? [])].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  if (!Number.isFinite(limit) || typeof limit !== "number") return sorted;
  return sorted.slice(0, Math.max(0, Math.floor(limit)));
}

export async function getSourceById(sourceId: string): Promise<Source | null> {
  const db = await readDbFile();
  return (db.sources ?? []).find((source) => source.id === sourceId) ?? null;
}

export async function getClaimLinks(): Promise<ClaimLink[]> {
  const db = await readDbFile();
  return [...(db.claimLinks ?? [])];
}

export async function getClaimLinksForClaim(claimId: string): Promise<ClaimLink[]> {
  const db = await readDbFile();
  return (db.claimLinks ?? []).filter((link) => link.claimId === claimId).sort((a, b) => b.score - a.score);
}

export async function setClaimLinks(claimId: string, links: ClaimLink[]): Promise<void> {
  const normalized = links.map((link) => ({
    ...link,
    claimId,
  }));
  await replaceClaimLinksForClaims([claimId], normalized);
}

export async function replaceClaimLinksForClaims(claimIds: string[], links: ClaimLink[]): Promise<void> {
  await withWriteLock(async () => {
    const db = await readDbFile();
    const claimIdSet = new Set(claimIds);
    db.claimLinks = (db.claimLinks ?? []).filter((link) => !claimIdSet.has(link.claimId)).concat(links);
    await writeDbFile(db);
  });
}

export async function getOpenConflicts(): Promise<Conflict[]> {
  return withWriteLock(async () => {
    const db = await readDbFile();
    await ensureConflicts(db);
    await writeDbFile(db);
    return db.conflicts
      .filter((conflict) => conflict.status === "open")
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  });
}

export async function getClaimConflicts(claimId: string): Promise<Conflict[]> {
  const conflicts = await getOpenConflicts();
  return conflicts.filter((conflict) => conflict.claimIdA === claimId || conflict.claimIdB === claimId);
}

export async function addMemo(memo: NonNullable<FundgraphDbFile["memos"]>[number]): Promise<void> {
  await withWriteLock(async () => {
    const db = await readDbFile();
    db.memos = db.memos ?? [];
    db.memos.unshift(memo);
    await writeDbFile(db);
  });
}

export async function listMemos(limit?: number): Promise<NonNullable<FundgraphDbFile["memos"]>[number][]> {
  const db = await readDbFile();
  const sorted = [...(db.memos ?? [])].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  if (!Number.isFinite(limit) || typeof limit !== "number") return sorted;
  return sorted.slice(0, Math.max(0, Math.floor(limit)));
}

export async function getMemoById(memoId: string): Promise<NonNullable<FundgraphDbFile["memos"]>[number] | null> {
  const db = await readDbFile();
  return (db.memos ?? []).find((memo) => memo.id === memoId) ?? null;
}

export async function updateMemoById(
  memoId: string,
  patch: Partial<NonNullable<FundgraphDbFile["memos"]>[number]>
): Promise<NonNullable<FundgraphDbFile["memos"]>[number] | null> {
  return withWriteLock(async () => {
    const db = await readDbFile();
    db.memos = db.memos ?? [];
    const index = db.memos.findIndex((memo) => memo.id === memoId);
    if (index < 0) {
      return null;
    }

    const existing = db.memos[index]!;
    const updated = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
    };
    db.memos[index] = updated;
    await writeDbFile(db);
    return updated;
  });
}
