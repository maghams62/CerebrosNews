import { generateAdvancedSignalNarrativeWithLlm } from "@/lib/fundgraph/llm";
import { AdvancedSignalInsight, AdvancedSignalRelatedType, Fund, GraphEdge, Signal, SignalStanceType } from "@/lib/fundgraph/types";

export const ADVANCED_SIGNAL_INSIGHT_VERSION = "advanced_v2";
export const ADVANCED_SIGNAL_INSIGHT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const ADVANCED_SIGNAL_RELATED_DRIFT_THRESHOLD = 0.6;
const RELATED_SIGNAL_LIMIT = 5;
const RELATED_CAPS: Record<AdvancedSignalRelatedType, number> = {
  same_fund: 2,
  same_entity: 2,
  same_theme: 5,
  similar_pattern: 5,
};

type SignalStanceCounts = { bullish: number; neutral: number; bearish: number; total: number };

export type RelatedSignalMatch = {
  signalId: string;
  title: string;
  relationType: AdvancedSignalRelatedType;
  similarityScore: number;
  createdAt: string;
  confidence: number;
  fundId: string;
};

export type AdvancedSignalFeaturePacket = {
  signalId: string;
  signalTitle: string;
  signalSummary: string;
  createdAt: string;
  sourceType: string;
  sourceDomain: string | null;
  evidenceSnippet: string | null;
  confidenceScore: number;
  verification: { verifies: number; disputes: number };
  stances: SignalStanceCounts;
  sentiment: {
    dominant: SignalStanceType | "mixed";
    dominantShare: number;
    engagement: number;
  };
  hasEvidence: boolean;
  trust: {
    score: number;
    tier: string;
    explanation: string | null;
  };
  tags: string[];
  entities: string[];
  fundId: string;
  fundName: string;
  fundProfile: {
    stages: string[];
    sectors: string[];
    momentumScore: number;
    trendScore: number;
    communityScore: number;
    risk: string;
  };
  relatedSignals: RelatedSignalMatch[];
  relatedSummary: {
    sameFund: number;
    sameEntity: number;
    sameTheme: number;
    similarPattern: number;
  };
  historical: {
    similarCount30d: number;
    similarCount90d: number;
    averageConfidence90d: number;
  };
  graph: {
    signalNeighborCount: number;
    fundNeighborCount: number;
    signalClusterSize: number;
    relationBreakdown: Array<{ relation: string; count: number }>;
    topConnectedNodeIds: string[];
  };
};

export type AdvancedSignalCacheEvaluation = {
  shouldRefresh: boolean;
  reason: "missing" | "version_mismatch" | "expired" | "related_drift" | "fresh";
  overlap: number;
};

export type AdvancedSignalInsightGenerationResult =
  | {
      status: "ready";
      insight: AdvancedSignalInsight;
      message: string;
      attempts: number;
      deterministicInsight: AdvancedSignalInsight;
    }
  | {
      status: "failed";
      message: string;
      attempts: number;
      deterministicInsight: AdvancedSignalInsight;
    };

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function safeNumber(value: number | undefined | null): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractHost(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.trim());
    return parsed.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function normalizeText(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeSignalPhrase(input: string): string {
  return normalizeText(input).replace(/^[a-z0-9\s]{2,50}:\s+/i, "").trim();
}

function unique(values: string[], limit = 100): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(value.trim());
    if (out.length >= limit) break;
  }
  return out;
}

function ratioOverlap(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) intersection += 1;
  }
  return intersection / Math.max(left.size, right.size);
}

function titleTokens(text: string): Set<string> {
  const normalized = normalizeText(text);
  const tokens = normalized
    .split(" ")
    .filter((token) => token.length >= 3 && !["with", "from", "this", "that", "their", "about"].includes(token));
  return new Set(tokens);
}

function relationPriority(type: AdvancedSignalRelatedType): number {
  if (type === "same_fund") return 4;
  if (type === "same_entity") return 3;
  if (type === "same_theme") return 2;
  return 1;
}

function signalStanceCounts(signal: Signal): SignalStanceCounts {
  const bullish = Math.max(0, Math.floor(safeNumber(signal.bullishCount ?? signal.upvotes)));
  const neutral = Math.max(0, Math.floor(safeNumber(signal.neutralCount)));
  const bearish = Math.max(0, Math.floor(safeNumber(signal.bearishCount)));
  return {
    bullish,
    neutral,
    bearish,
    total: bullish + neutral + bearish,
  };
}

function dominantSignalSentiment(counts: SignalStanceCounts): { dominant: SignalStanceType | "mixed"; share: number } {
  if (counts.total <= 0) {
    return { dominant: "mixed", share: 0 };
  }
  const ranked = [
    { stance: "bullish" as const, count: counts.bullish },
    { stance: "neutral" as const, count: counts.neutral },
    { stance: "bearish" as const, count: counts.bearish },
  ].sort((left, right) => right.count - left.count);
  if (ranked[0].count === ranked[1].count) {
    return { dominant: "mixed", share: Number((ranked[0].count / counts.total).toFixed(3)) };
  }
  return { dominant: ranked[0].stance, share: Number((ranked[0].count / counts.total).toFixed(3)) };
}

function confidenceScore(signal: Signal): number {
  return clamp(Math.round(safeNumber(signal.confidence) * 100), 0, 100);
}

function extractSignalEntities(signal: Signal, fundName?: string): string[] {
  const text = `${signal.title} ${signal.summary}`;
  const matches = text.match(/\b[A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,2}\b/g) ?? [];
  const entities = unique([
    ...(fundName ? [fundName] : []),
    ...matches.filter((item) => item.length >= 3 && item.length <= 40),
  ]);
  return entities.slice(0, 8);
}

function signalEvidenceState(signal: Signal): boolean {
  return Boolean((signal.evidenceUrl || signal.evidence?.url || signal.evidenceSnippet || signal.evidence?.snippet || "").trim());
}

function relationTypeForMatch(params: {
  sameFund: boolean;
  entityOverlap: number;
  tagOverlap: number;
}): AdvancedSignalRelatedType {
  if (params.sameFund) return "same_fund";
  if (params.entityOverlap > 0) return "same_entity";
  if (params.tagOverlap > 0) return "same_theme";
  return "similar_pattern";
}

function relationScore(params: {
  sameFund: boolean;
  tagOverlap: number;
  entityOverlap: number;
  titleOverlap: number;
}): number {
  const score =
    (params.sameFund ? 0.2 : 0) + params.tagOverlap * 0.35 + params.entityOverlap * 0.3 + params.titleOverlap * 0.15;
  return Number(clamp(score, 0, 1).toFixed(3));
}

function relatedFingerprint(signal: Signal): string {
  const core = `${normalizeSignalPhrase(signal.title)} ${normalizeSignalPhrase(signal.summary)}`.trim();
  const tokens = core.split(" ").filter((token) => token.length >= 3).slice(0, 22);
  return tokens.join(" ");
}

function fingerprintTokens(value: string): Set<string> {
  return new Set(value.split(" ").map((token) => token.trim()).filter((token) => token.length >= 3));
}

function fingerprintOverlap(left: string, right: string): number {
  const leftTokens = fingerprintTokens(left);
  const rightTokens = fingerprintTokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1;
  }
  return shared / Math.max(leftTokens.size, rightTokens.size);
}

function dedupeAndDiversifyRelatedSignals(candidates: RelatedSignalMatch[], allCandidates: RelatedSignalMatch[]): RelatedSignalMatch[] {
  const ordered = [...candidates].sort((left, right) => {
    const leftPriority = relationPriority(left.relationType);
    const rightPriority = relationPriority(right.relationType);
    if (rightPriority !== leftPriority) return rightPriority - leftPriority;
    if (right.similarityScore !== left.similarityScore) return right.similarityScore - left.similarityScore;
    return toMs(right.createdAt) - toMs(left.createdAt);
  });

  const selected: RelatedSignalMatch[] = [];
  const counts: Record<AdvancedSignalRelatedType, number> = {
    same_fund: 0,
    same_entity: 0,
    same_theme: 0,
    similar_pattern: 0,
  };
  for (const candidate of ordered) {
    if (selected.length >= RELATED_SIGNAL_LIMIT) break;
    if (counts[candidate.relationType] >= RELATED_CAPS[candidate.relationType]) continue;
    selected.push(candidate);
    counts[candidate.relationType] += 1;
  }

  const hasNonSameFund = selected.some((item) => item.relationType !== "same_fund");
  if (hasNonSameFund) return selected;
  const nonSameFund = allCandidates
    .filter((item) => item.relationType !== "same_fund")
    .sort((left, right) => {
      const leftPriority = relationPriority(left.relationType);
      const rightPriority = relationPriority(right.relationType);
      if (rightPriority !== leftPriority) return rightPriority - leftPriority;
      if (right.similarityScore !== left.similarityScore) return right.similarityScore - left.similarityScore;
      return toMs(right.createdAt) - toMs(left.createdAt);
    })[0];
  if (!nonSameFund) return selected;
  const replaceIndex = selected.map((item, idx) => ({ idx, score: item.similarityScore })).sort((a, b) => a.score - b.score)[0]?.idx;
  if (replaceIndex === undefined) return selected;
  const next = [...selected];
  next[replaceIndex] = nonSameFund;
  return next;
}

function signalTags(signal: Signal): Set<string> {
  return new Set((signal.tags ?? []).map((tag) => normalizeText(tag)).filter(Boolean));
}

function signalEntitySet(signal: Signal, fundName?: string): Set<string> {
  return new Set(extractSignalEntities(signal, fundName).map((item) => normalizeText(item)).filter(Boolean));
}

function determineFundName(signal: Signal, fundsById: Map<string, Fund>): string {
  return fundsById.get(signal.fundId)?.name ?? signal.fundId;
}

function graphNeighbors(edges: GraphEdge[], nodeId: string): number {
  return edges.filter((edge) => edge.fromId === nodeId || edge.toId === nodeId).length;
}

function graphIncidentEdges(edges: GraphEdge[], nodeIds: Set<string>): GraphEdge[] {
  return edges.filter((edge) => nodeIds.has(edge.fromId) || nodeIds.has(edge.toId));
}

function graphRelationBreakdown(edges: GraphEdge[]): Array<{ relation: string; count: number }> {
  const relationCounts = new Map<string, number>();
  for (const edge of edges) {
    const relation = String(edge.relation || "unknown").toUpperCase();
    relationCounts.set(relation, (relationCounts.get(relation) ?? 0) + 1);
  }
  return [...relationCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([relation, count]) => ({ relation, count }));
}

function graphTopConnectedNodes(edges: GraphEdge[], nodeIds: Set<string>, limit = 6): string[] {
  const counts = new Map<string, number>();
  for (const edge of edges) {
    if (nodeIds.has(edge.fromId) && !nodeIds.has(edge.toId)) {
      counts.set(edge.toId, (counts.get(edge.toId) ?? 0) + 1);
    }
    if (nodeIds.has(edge.toId) && !nodeIds.has(edge.fromId)) {
      counts.set(edge.fromId, (counts.get(edge.fromId) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([nodeId]) => nodeId);
}

export function computeRelatedSignalMatches(params: {
  signal: Signal;
  allSignals: Signal[];
  fundsById?: Map<string, Fund>;
  now?: Date;
}): RelatedSignalMatch[] {
  const fundsById = params.fundsById ?? new Map<string, Fund>();
  const targetFundName = determineFundName(params.signal, fundsById);
  const targetTags = signalTags(params.signal);
  const targetEntities = signalEntitySet(params.signal, targetFundName);
  const targetTitleTokens = titleTokens(`${params.signal.title} ${params.signal.summary}`);

  const relatedByFingerprint = new Map<string, RelatedSignalMatch>();
  for (const candidate of params.allSignals) {
    if (candidate.id === params.signal.id) continue;
    const candidateFundName = determineFundName(candidate, fundsById);
    const sameFund = candidate.fundId === params.signal.fundId;
    const tagOverlap = ratioOverlap(targetTags, signalTags(candidate));
    const entityOverlap = ratioOverlap(targetEntities, signalEntitySet(candidate, candidateFundName));
    const titleOverlap = ratioOverlap(targetTitleTokens, titleTokens(`${candidate.title} ${candidate.summary}`));
    const similarityScore = relationScore({
      sameFund,
      tagOverlap,
      entityOverlap,
      titleOverlap,
    });
    if (similarityScore <= 0.05 && !sameFund) continue;
    const match: RelatedSignalMatch = {
      signalId: candidate.id,
      title: candidate.title,
      relationType: relationTypeForMatch({ sameFund, entityOverlap, tagOverlap }),
      similarityScore,
      createdAt: candidate.createdAt,
      confidence: confidenceScore(candidate),
      fundId: candidate.fundId,
    };
    const fingerprint = relatedFingerprint(candidate);
    let existingKey = "";
    let existing: RelatedSignalMatch | undefined;
    for (const [key, value] of relatedByFingerprint.entries()) {
      if (fingerprintOverlap(key, fingerprint) >= 0.82) {
        existingKey = key;
        existing = value;
        break;
      }
    }
    if (!existing) {
      relatedByFingerprint.set(fingerprint, match);
      continue;
    }
    const existingPriority = relationPriority(existing.relationType);
    const nextPriority = relationPriority(match.relationType);
    if (nextPriority > existingPriority || (nextPriority === existingPriority && match.similarityScore > existing.similarityScore)) {
      relatedByFingerprint.delete(existingKey);
      relatedByFingerprint.set(fingerprint, match);
    }
  }

  const deduped = Array.from(relatedByFingerprint.values());
  return dedupeAndDiversifyRelatedSignals(deduped, deduped).slice(0, RELATED_SIGNAL_LIMIT);
}

function similarSignalsInWindow(related: RelatedSignalMatch[], now: Date, days: number): RelatedSignalMatch[] {
  const threshold = now.getTime() - days * 24 * 60 * 60 * 1000;
  return related.filter((item) => toMs(item.createdAt) >= threshold);
}

function materialityLabel(score: number): "low" | "medium" | "high" {
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}

function ensureMinimum(items: string[], fallbackItems: string[], min = 2): string[] {
  const uniqueItems = unique([...items, ...fallbackItems], 8);
  return uniqueItems.slice(0, Math.max(min, uniqueItems.length < min ? min : uniqueItems.length));
}

type SignalArchetype = "funding" | "people" | "product" | "partnership" | "market" | "other";

function classifySignalArchetype(packet: AdvancedSignalFeaturePacket): SignalArchetype {
  const text = normalizeText(`${packet.signalTitle} ${packet.signalSummary} ${packet.tags.join(" ")}`);
  if (/\b(funding|fundraise|seed|series|raised|valuation|investor|co-invest)\b/.test(text)) return "funding";
  if (/\b(founder|ceo|cfo|cto|partner|hiring|joined|appointment|leadership|managing director)\b/.test(text)) return "people";
  if (/\b(product|launch|release|rollout|feature|platform|api)\b/.test(text)) return "product";
  if (/\b(partnership|collaboration|alliance|integrat|cooperate)\b/.test(text)) return "partnership";
  if (/\b(regulation|legal|policy|market|macro|demand|supply|pricing)\b/.test(text)) return "market";
  return "other";
}

function deterministicNarrative(packet: AdvancedSignalFeaturePacket): Omit<AdvancedSignalInsight, "generated_at" | "generation_version"> {
  const verifyRatio =
    packet.verification.verifies + packet.verification.disputes > 0
      ? packet.verification.verifies / (packet.verification.verifies + packet.verification.disputes)
      : 0.5;
  const hasCategoryCluster = packet.historical.similarCount30d >= 3;
  const recencyLift = packet.historical.similarCount30d > Math.max(1, Math.floor(packet.historical.similarCount90d / 3)) ? 1 : 0;

  const fundRelevance = clamp(
    0.4 + (packet.relatedSignals.some((item) => item.relationType === "same_fund") ? 0.35 : 0) + verifyRatio * 0.25,
    0,
    1
  );
  const marketRelevance = clamp(0.3 + Math.min(0.4, packet.tags.length * 0.07) + (hasCategoryCluster ? 0.2 : 0), 0, 1);
  const novelty = clamp(1 - Math.min(1, packet.historical.similarCount90d / 10), 0, 1);
  const downstreamImpact = clamp(0.25 + packet.confidenceScore / 200 + verifyRatio * 0.3 + recencyLift * 0.2, 0, 1);
  const connectivity = clamp(0.2 + Math.min(0.6, packet.graph.fundNeighborCount / 14) + Math.min(0.2, packet.relatedSignals.length / 10), 0, 1);

  const materialityScore = Math.round(
    (fundRelevance * 0.25 + marketRelevance * 0.2 + novelty * 0.2 + downstreamImpact * 0.2 + connectivity * 0.15) * 100
  );
  const noveltyScore = Math.round(novelty * 100);
  const riskScore = Math.round(
    clamp(
      0.2 +
        (packet.hasEvidence ? 0 : 0.26) +
        (1 - verifyRatio) * 0.28 +
        (packet.confidenceScore < 60 ? 0.14 : 0.07) +
        (packet.historical.similarCount30d === 0 ? 0.08 : 0),
      0,
      1
    ) * 100
  );

  const materialityTag = materialityLabel(materialityScore);
  const archetype = classifySignalArchetype(packet);
  const sourcePhrase = packet.sourceDomain ? `The current evidence is anchored to ${packet.sourceDomain}` : "Current evidence is still source-light";
  const sentimentPhrase =
    packet.sentiment.engagement > 0
      ? `Community sentiment is ${
          packet.sentiment.dominant === "mixed"
            ? "mixed"
            : `leaning ${packet.sentiment.dominant} (${Math.round(packet.sentiment.dominantShare * 100)}%)`
        } across ${packet.sentiment.engagement} votes.`
      : "Community sentiment has limited participation so far.";
  const fundFocus =
    packet.fundProfile.sectors.length > 0
      ? `${packet.fundName}'s visible focus includes ${packet.fundProfile.sectors.slice(0, 2).join(" and ")}.`
      : `${packet.fundName}'s explicit sector focus is still sparse in the curated profile.`;
  const trustPhrase = packet.trust.score > 0 ? `Trust score context is ${packet.trust.score}/100 (${packet.trust.tier}).` : "";

  const implicationSummary =
    materialityTag === "high"
      ? `This signal is likely decision-relevant now because it links to an active pattern around ${
          packet.tags.slice(0, 2).join(" and ") || "the current theme cluster"
        }, with enough network connectivity to matter for near-term fund research prioritization. ${sourcePhrase}. ${fundFocus} ${sentimentPhrase} ${trustPhrase}`.trim()
      : materialityTag === "medium"
        ? `This signal is directionally useful: it adds context to the current ${
            packet.tags[0] || "market"
          } narrative, but still needs stronger corroboration before it should drive high-conviction decisions. ${sourcePhrase}. ${sentimentPhrase}`.trim()
        : `This signal currently reads as low-materiality context. It is useful for monitoring, but not yet strong enough to materially shift diligence priority on its own. ${sourcePhrase}. ${sentimentPhrase}`.trim();

  const bullCase =
    archetype === "funding"
      ? "Bull case: this signal marks early financing momentum, and if follow-on confirmations and investor overlap continue, it may indicate a sustained allocation trend in this theme."
      : archetype === "people"
        ? "Bull case: this leadership or talent movement meaningfully improves execution odds, and if follow-on outcomes validate the move, conviction could rise quickly."
        : archetype === "product"
          ? "Bull case: this product signal indicates genuine adoption momentum, and if additional usage or distribution evidence appears, it can become a high-priority thesis input."
          : "Bull case: this signal is an early marker of improving category momentum and can become a stronger decision input as corroborating datapoints accumulate.";
  const baseCase =
    archetype === "funding"
      ? "Base case: this remains a directional financing datapoint that helps prioritize watchlist coverage, but it is not enough alone for a conviction shift until corroboration deepens."
      : archetype === "people"
        ? "Base case: this is useful context for operator quality and positioning, but material impact still depends on execution evidence over the next cycle."
        : archetype === "product"
          ? "Base case: this is a useful product-progress indicator that should inform diligence queueing, without yet justifying a major assessment change."
          : "Base case: this remains a directional datapoint that improves prioritization, but needs additional evidence before driving a strong allocation decision.";
  const bearCase =
    archetype === "funding"
      ? "Bear case: this is a single-thread financing mention with weak corroboration, and confidence should be discounted if investor, amount, or sequencing details diverge."
      : archetype === "people"
        ? "Bear case: this is mostly narrative-level people news with limited independent confirmation, and it may not translate into measurable execution outcomes."
        : archetype === "product"
          ? "Bear case: this appears to be announcement-level product noise without downstream validation, so conviction should stay conservative."
          : "Bear case: this is mostly a single-thread datapoint with limited corroboration, and confidence should be discounted if conflicting details emerge.";

  const missingEvidence = ensureMinimum(
    [
      packet.hasEvidence ? "" : "A second independent source confirming the core claim details.",
      packet.sourceDomain ? `Independent corroboration beyond ${packet.sourceDomain}.` : "",
      packet.evidenceSnippet ? "A fuller primary-source excerpt with concrete factual anchors (who, what, when)." : "A richer evidence snippet with concrete factual anchors.",
      packet.verification.verifies === 0 ? "At least one external verification from a high-credibility contributor." : "",
      packet.relatedSignals.length < 2 ? "Additional adjacent signals linking this event to a broader pattern." : "",
      packet.trust.score < 55 ? "Higher-credibility sources to improve trust calibration for this signal." : "",
    ].filter(Boolean),
    [
      "Primary-source confirmation (official statement, filing, or investor post) to reduce ambiguity.",
      "Independent corroboration from an additional publication or source channel.",
    ],
    2
  );

  const confidenceTriggers = ensureMinimum(
    [
      archetype === "funding"
        ? "Confidence should increase if independent sources confirm the same investor, round details, and timeline."
        : "Confidence should increase if independent sources confirm the same core claim details and timeline.",
      archetype === "funding"
        ? "Confidence should decrease if reported amounts, participants, or event sequencing diverge across sources."
        : "Confidence should decrease if independent sources conflict on key entities, sequencing, or outcomes.",
      packet.verification.disputes > 0
        ? "Confidence should be downgraded until existing disputes are resolved with citation-backed evidence."
        : "",
      packet.sourceDomain ? `Confidence should rise if the claim is corroborated outside ${packet.sourceDomain}.` : "",
    ].filter(Boolean),
    [
      "A direct company or fund statement would materially reduce uncertainty.",
      "Conflicting disclosures across reputable sources should trigger a confidence downgrade.",
    ],
    2
  );

  const fundImpact = `For ${packet.fundName}, this signal ${
    materialityTag === "high" ? "reinforces active thematic positioning" : "provides incremental thematic context"
  } but still requires follow-up evidence before materially changing top-level fund conviction.`;

  const entityImpact = [
    {
      entity_id: packet.fundId,
      entity_name: packet.fundName,
      entity_type: "fund",
      impact_summary: fundImpact,
      relevance_score: materialityScore,
    },
    ...packet.entities.slice(0, 2).map((entity, index) => ({
      entity_id: `${packet.signalId}-entity-${index + 1}`,
      entity_name: entity,
      entity_type: "entity",
      impact_summary: `For ${entity}, this signal suggests ${
        materialityTag === "high" ? "potentially meaningful near-term attention shift" : "a monitor-worthy development"
      } tied to current sector narratives.`,
      relevance_score: clamp(Math.round(materialityScore - index * 8), 0, 100),
    })),
  ];

  const relatedSignals = packet.relatedSignals.map((item) => ({
    signal_id: item.signalId,
    title: item.title,
    relation_type: item.relationType,
    similarity_score: Number(item.similarityScore.toFixed(3)),
  }));

  const graphInsightSummary =
    packet.graph.signalClusterSize >= 3
      ? `This signal sits inside a connected mini-cluster (${packet.graph.signalClusterSize} closely related signals) with ${
          packet.graph.fundNeighborCount
        } nearby fund-level graph links, suggesting non-isolated context. Dominant graph relations: ${
          packet.graph.relationBreakdown.slice(0, 2).map((item) => `${item.relation} (${item.count})`).join(", ") || "sparse relation coverage"
        }.`
      : `This signal appears relatively sparse in the current graph neighborhood, with ${packet.graph.signalNeighborCount} direct signal links and ${
          packet.graph.fundNeighborCount
        } nearby fund links. Dominant graph relations: ${
          packet.graph.relationBreakdown.slice(0, 2).map((item) => `${item.relation} (${item.count})`).join(", ") || "sparse relation coverage"
        }.`;

  const historicalContext =
    packet.historical.similarCount30d > 0
      ? `Historical context: ${packet.historical.similarCount30d} similar signals appeared in the last 30d and ${packet.historical.similarCount90d} in 90d, with an average confidence of ${Math.round(
          packet.historical.averageConfidence90d
        )}/100 in the broader cohort. Related mix: ${packet.relatedSummary.sameFund} same-fund, ${packet.relatedSummary.sameEntity} same-entity, ${packet.relatedSummary.sameTheme} same-theme patterns.`
      : `Historical context: no strongly similar signals were found in the last 30d; this may indicate either novelty or sparse coverage, so follow-up corroboration is important.`;

  const nextQuestions = ensureMinimum(
    [
      archetype === "funding"
        ? "Which primary source can confirm the key factual details (participants, amount, and timing)?"
        : "Which primary source can confirm the key factual details and timeline for this signal?",
      `Do related signals tied to ${packet.fundName} indicate a repeatable pattern or an isolated datapoint?`,
      `How well does this align with ${packet.fundName}'s current stage/sector focus?`,
      "What observable downstream milestones would validate this signal over the next 30-60 days?",
      "Are there contradictory datapoints that would materially alter current interpretation?",
    ],
    [
      "Which additional source would most quickly increase confidence if confirmed?",
      "What outcome would invalidate the current read of this signal?",
      "How should this change near-term diligence prioritization?",
    ],
    3
  ).slice(0, 5);

  const analystSummary = `${implicationSummary} Materiality reads ${materialityLabel(materialityScore)}, novelty is ${noveltyScore}/100, and uncertainty is ${riskScore}/100, so the current best use is directed follow-up rather than blind conviction.`;
  const analystBullets = [
    `Why it matters: ${materialityTag === "high" ? "potentially meaningful category movement" : "incremental signal for ongoing pattern tracking"}.`,
    `What remains uncertain: corroboration depth is ${packet.hasEvidence ? "still limited" : "currently thin"}, trust is ${packet.trust.score}/100, and dispute sensitivity remains non-trivial.`,
    `What to watch next: independent source confirmation plus follow-on related signals in the next 30 days (current top links: ${
      packet.graph.topConnectedNodeIds.slice(0, 2).join(", ") || "none yet"
    }).`,
  ];

  return {
    materiality_score: clamp(materialityScore, 0, 100),
    materiality_label: materialityLabel(materialityScore),
    novelty_score: clamp(noveltyScore, 0, 100),
    risk_uncertainty_score: clamp(riskScore, 0, 100),
    implication_summary: implicationSummary,
    bull_case: bullCase,
    base_case: baseCase,
    bear_case: bearCase,
    missing_evidence: missingEvidence.slice(0, 5),
    confidence_change_triggers: confidenceTriggers.slice(0, 5),
    entity_impact: entityImpact,
    related_signals: relatedSignals,
    next_questions: nextQuestions,
    graph_insight_summary: graphInsightSummary,
    historical_context: historicalContext,
    analyst_note: {
      summary: analystSummary,
      bullets: analystBullets,
    },
  };
}

export function buildAdvancedSignalFeaturePacket(params: {
  signal: Signal;
  allSignals: Signal[];
  funds?: Fund[];
  graphEdges?: GraphEdge[];
  now?: Date;
}): AdvancedSignalFeaturePacket {
  const now = params.now ?? new Date();
  const fundsById = new Map((params.funds ?? []).map((fund) => [fund.id, fund]));
  const fundName = determineFundName(params.signal, fundsById);
  const relatedSignals = computeRelatedSignalMatches({
    signal: params.signal,
    allSignals: params.allSignals,
    fundsById,
    now,
  });
  const related30 = similarSignalsInWindow(relatedSignals, now, 30);
  const related90 = similarSignalsInWindow(relatedSignals, now, 90);
  const avgConfidence90 = related90.length
    ? related90.reduce((sum, item) => sum + item.confidence, 0) / related90.length
    : confidenceScore(params.signal);
  const edges = params.graphEdges ?? [];
  const currentStances = signalStanceCounts(params.signal);
  const dominantSentiment = dominantSignalSentiment(currentStances);
  const fund = fundsById.get(params.signal.fundId);
  const trustScore = clamp(Math.round(safeNumber(params.signal.trustScore)), 0, 100);
  const relatedSummary = {
    sameFund: relatedSignals.filter((item) => item.relationType === "same_fund").length,
    sameEntity: relatedSignals.filter((item) => item.relationType === "same_entity").length,
    sameTheme: relatedSignals.filter((item) => item.relationType === "same_theme").length,
    similarPattern: relatedSignals.filter((item) => item.relationType === "similar_pattern").length,
  };
  const graphAnchors = new Set<string>([params.signal.id, params.signal.fundId]);
  const incidentEdges = graphIncidentEdges(edges, graphAnchors);
  const relationBreakdown = graphRelationBreakdown(incidentEdges);
  const topConnectedNodeIds = graphTopConnectedNodes(incidentEdges, graphAnchors);

  return {
    signalId: params.signal.id,
    signalTitle: params.signal.title,
    signalSummary: params.signal.summary,
    createdAt: params.signal.createdAt,
    sourceType: params.signal.source ?? "community",
    sourceDomain: extractHost(params.signal.evidenceUrl || params.signal.evidence?.url),
    evidenceSnippet: (params.signal.evidenceSnippet || params.signal.evidence?.snippet || "").trim() || null,
    confidenceScore: confidenceScore(params.signal),
    verification: {
      verifies: Math.max(0, Math.floor(safeNumber(params.signal.verifyCount ?? params.signal.verifiedCount ?? params.signal.verifies))),
      disputes: Math.max(0, Math.floor(safeNumber(params.signal.disagreeCount ?? params.signal.disputedCount ?? params.signal.disagrees))),
    },
    stances: currentStances,
    sentiment: {
      dominant: dominantSentiment.dominant,
      dominantShare: dominantSentiment.share,
      engagement: currentStances.total,
    },
    hasEvidence: signalEvidenceState(params.signal),
    trust: {
      score: trustScore,
      tier: params.signal.trustTier || "unknown",
      explanation: params.signal.trustExplanation?.trim() || null,
    },
    tags: unique(params.signal.tags ?? [], 8),
    entities: extractSignalEntities(params.signal, fundName),
    fundId: params.signal.fundId,
    fundName,
    fundProfile: {
      stages: unique(fund?.stages ?? [], 4),
      sectors: unique(fund?.sectors ?? [], 5),
      momentumScore: clamp(Math.round(safeNumber(fund?.momentumScore)), 0, 100),
      trendScore: clamp(Math.round(safeNumber(fund?.trendScore)), 0, 100),
      communityScore: clamp(Math.round(safeNumber(fund?.communityScore)), 0, 100),
      risk: fund?.risk || "unknown",
    },
    relatedSignals,
    relatedSummary,
    historical: {
      similarCount30d: related30.length,
      similarCount90d: related90.length,
      averageConfidence90d: Number(avgConfidence90.toFixed(2)),
    },
    graph: {
      signalNeighborCount: graphNeighbors(edges, params.signal.id),
      fundNeighborCount: graphNeighbors(edges, params.signal.fundId),
      signalClusterSize: relatedSignals.length,
      relationBreakdown,
      topConnectedNodeIds,
    },
  };
}

function mergeNarrative(
  base: Omit<AdvancedSignalInsight, "generated_at" | "generation_version">,
  llmNarrative: Partial<Omit<AdvancedSignalInsight, "generated_at" | "generation_version">> | null
): Omit<AdvancedSignalInsight, "generated_at" | "generation_version"> {
  if (!llmNarrative) return base;
  return {
    ...base,
    implication_summary: llmNarrative.implication_summary || base.implication_summary,
    bull_case: llmNarrative.bull_case || base.bull_case,
    base_case: llmNarrative.base_case || base.base_case,
    bear_case: llmNarrative.bear_case || base.bear_case,
    missing_evidence: llmNarrative.missing_evidence?.length ? llmNarrative.missing_evidence : base.missing_evidence,
    confidence_change_triggers: llmNarrative.confidence_change_triggers?.length
      ? llmNarrative.confidence_change_triggers
      : base.confidence_change_triggers,
    next_questions: llmNarrative.next_questions?.length ? llmNarrative.next_questions : base.next_questions,
    graph_insight_summary: llmNarrative.graph_insight_summary || base.graph_insight_summary,
    historical_context: llmNarrative.historical_context || base.historical_context,
    analyst_note:
      llmNarrative.analyst_note && llmNarrative.analyst_note.summary
        ? {
            summary: llmNarrative.analyst_note.summary,
            bullets: llmNarrative.analyst_note.bullets?.length ? llmNarrative.analyst_note.bullets : base.analyst_note.bullets,
          }
        : base.analyst_note,
    entity_impact: llmNarrative.entity_impact?.length ? llmNarrative.entity_impact : base.entity_impact,
    related_signals: llmNarrative.related_signals?.length ? llmNarrative.related_signals : base.related_signals,
  };
}

function isLikelyFundingSignal(packet: AdvancedSignalFeaturePacket): boolean {
  const keywords = new Set([
    "funding",
    "fundraise",
    "funding round",
    "series a",
    "series b",
    "seed",
    "venture",
    "round",
    "investment",
    "investor",
  ]);
  if (packet.tags.some((tag) => keywords.has(normalizeText(tag)))) return true;
  const text = normalizeText(`${packet.signalTitle} ${packet.entities.join(" ")}`);
  return /\b(funding|fundraise|investor|raised|series|round|seed|valuation|backed)\b/.test(text);
}

function hasFundingOnlyLanguage(text: string): boolean {
  return /\b(participants?|investor participation|round details|series [abce]|seed round|raised \$?|valuation|lead investor)\b/i.test(text);
}

export function evaluateAdvancedInsightQuality(input: {
  packet: AdvancedSignalFeaturePacket;
  candidate: Omit<AdvancedSignalInsight, "generated_at" | "generation_version">;
  deterministicBase: Omit<AdvancedSignalInsight, "generated_at" | "generation_version">;
}): { ok: boolean; reason?: string } {
  const candidate = input.candidate;
  if (!candidate.implication_summary.trim()) return { ok: false, reason: "empty_implication_summary" };
  if (candidate.missing_evidence.length < 2) return { ok: false, reason: "missing_evidence_too_short" };
  if (candidate.confidence_change_triggers.length < 2) return { ok: false, reason: "confidence_triggers_too_short" };
  if (candidate.next_questions.length < 3) return { ok: false, reason: "next_questions_too_short" };
  if (!candidate.bull_case.trim() || !candidate.base_case.trim() || !candidate.bear_case.trim()) {
    return { ok: false, reason: "scenario_missing" };
  }

  const identicalFields = [
    candidate.implication_summary === input.deterministicBase.implication_summary,
    candidate.bull_case === input.deterministicBase.bull_case,
    candidate.base_case === input.deterministicBase.base_case,
    candidate.bear_case === input.deterministicBase.bear_case,
    candidate.analyst_note.summary === input.deterministicBase.analyst_note.summary,
  ].filter(Boolean).length;
  if (identicalFields >= 3) return { ok: false, reason: "near_template_copy" };

  const combinedNarrative = [
    candidate.implication_summary,
    candidate.bull_case,
    candidate.base_case,
    candidate.bear_case,
    candidate.analyst_note.summary,
    ...candidate.next_questions,
  ].join(" ");

  if (!isLikelyFundingSignal(input.packet) && hasFundingOnlyLanguage(combinedNarrative)) {
    return { ok: false, reason: "domain_mismatch_funding_language" };
  }

  return { ok: true };
}

function advancedInsightLlmEnabled(): boolean {
  return process.env.FUNDGRAPH_ADVANCED_USE_LLM === "1" && Boolean(process.env.OPENAI_API_KEY);
}

function withMetadata(
  insight: Omit<AdvancedSignalInsight, "generated_at" | "generation_version">,
  now: Date
): AdvancedSignalInsight {
  return {
    ...insight,
    generated_at: now.toISOString(),
    generation_version: ADVANCED_SIGNAL_INSIGHT_VERSION,
  };
}

export async function buildAdvancedSignalInsightWithQuality(params: {
  signal: Signal;
  allSignals: Signal[];
  funds?: Fund[];
  graphEdges?: GraphEdge[];
  now?: Date;
}): Promise<AdvancedSignalInsightGenerationResult> {
  const now = params.now ?? new Date();
  const packet = buildAdvancedSignalFeaturePacket({ ...params, now });
  const base = deterministicNarrative(packet);
  const deterministicInsight = withMetadata(base, now);

  if (!advancedInsightLlmEnabled()) {
    return {
      status: "ready",
      insight: deterministicInsight,
      message: "llm_unavailable:fallback_deterministic",
      attempts: 0,
      deterministicInsight,
    };
  }

  let lastFailure = "llm_generation_failed";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const llmNarrative = await generateAdvancedSignalNarrativeWithLlm({
        packet,
        deterministicBase: base,
      });
      const merged = mergeNarrative(base, llmNarrative);
      const quality = evaluateAdvancedInsightQuality({
        packet,
        deterministicBase: base,
        candidate: merged,
      });
      if (!quality.ok) {
        lastFailure = `quality_guard:${quality.reason ?? "unknown"}`;
        continue;
      }
      return {
        status: "ready",
        insight: withMetadata(merged, now),
        message: "ok",
        attempts: attempt,
        deterministicInsight,
      };
    } catch (error) {
      lastFailure = error instanceof Error && error.message ? error.message : "llm_generation_failed";
    }
  }

  return {
    status: "ready",
    insight: deterministicInsight,
    message: `${lastFailure}:fallback_deterministic`,
    attempts: 2,
    deterministicInsight,
  };
}

export async function buildAdvancedSignalInsight(params: {
  signal: Signal;
  allSignals: Signal[];
  funds?: Fund[];
  graphEdges?: GraphEdge[];
  now?: Date;
}): Promise<AdvancedSignalInsight> {
  const result = await buildAdvancedSignalInsightWithQuality(params);
  if (result.status === "ready") return result.insight;
  return result.deterministicInsight;
}

export function evaluateAdvancedInsightCache(params: {
  signal: Signal;
  allSignals: Signal[];
  funds?: Fund[];
  now?: Date;
}): AdvancedSignalCacheEvaluation {
  const insight = params.signal.advancedInsight;
  if (!insight) {
    return { shouldRefresh: true, reason: "missing", overlap: 0 };
  }
  if (insight.generation_version !== ADVANCED_SIGNAL_INSIGHT_VERSION) {
    return { shouldRefresh: true, reason: "version_mismatch", overlap: 0 };
  }
  const nowMs = (params.now ?? new Date()).getTime();
  const generatedMs = toMs(insight.generated_at);
  if (!generatedMs || nowMs - generatedMs > ADVANCED_SIGNAL_INSIGHT_MAX_AGE_MS) {
    return { shouldRefresh: true, reason: "expired", overlap: 0 };
  }

  const freshRelated = computeRelatedSignalMatches({
    signal: params.signal,
    allSignals: params.allSignals,
    fundsById: new Map((params.funds ?? []).map((fund) => [fund.id, fund])),
  }).map((item) => item.signalId);
  const storedRelated = (insight.related_signals ?? []).map((item) => item.signal_id).filter(Boolean);
  if (!freshRelated.length && !storedRelated.length) {
    return { shouldRefresh: false, reason: "fresh", overlap: 1 };
  }
  const freshSet = new Set(freshRelated);
  let shared = 0;
  for (const signalId of storedRelated) {
    if (freshSet.has(signalId)) shared += 1;
  }
  const overlap = shared / Math.max(1, Math.max(freshRelated.length, storedRelated.length));
  if (overlap < ADVANCED_SIGNAL_RELATED_DRIFT_THRESHOLD) {
    return {
      shouldRefresh: true,
      reason: "related_drift",
      overlap: Number(overlap.toFixed(3)),
    };
  }
  return { shouldRefresh: false, reason: "fresh", overlap: Number(overlap.toFixed(3)) };
}
