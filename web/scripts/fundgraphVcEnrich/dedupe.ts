import { ClaimEvidence, ClaimLink, GraphEdge, NewsClaim, Signal, Source } from "@/lib/fundgraph/types";
import { dedupeSignals } from "@/lib/fundgraph/signalDedup";
import { SourceCandidate } from "./types";
import { canonicalizeUrl, domainFromUrl, normalizeName, normalizeTitle, stableHash, to72hBucket, toDayKey, uniqStrings } from "./utils";

function signalTierRank(tier: Signal["qualityTier"]): number {
  if (tier === "ALIGNED") return 3;
  if (tier === "WARNING") return 2;
  if (tier === "FAILED") return 1;
  return 0;
}

export function sourceCandidateDedupeKey(candidate: SourceCandidate): string {
  const url = canonicalizeUrl(candidate.url);
  if (url) return `url:${url}`;
  const title = normalizeTitle(candidate.title);
  const day = toDayKey(candidate.publishedAt);
  const fundKey = uniqStrings(candidate.fundIds).sort().join(",");
  return `title:${title}|day:${day}|source:${normalizeName(candidate.sourceName)}|funds:${fundKey}`;
}

export function dedupeSourceCandidates(candidates: SourceCandidate[]): {
  candidates: SourceCandidate[];
  merged: number;
} {
  const byKey = new Map<string, SourceCandidate>();
  let merged = 0;

  for (const candidate of candidates) {
    const key = sourceCandidateDedupeKey(candidate);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, candidate);
      continue;
    }
    merged += 1;
    byKey.set(key, {
      ...existing,
      title: existing.title.length >= candidate.title.length ? existing.title : candidate.title,
      summary: existing.summary.length >= candidate.summary.length ? existing.summary : candidate.summary,
      content: existing.content.length >= candidate.content.length ? existing.content : candidate.content,
      sourceType: existing.sourceType,
      sourceName: existing.sourceName || candidate.sourceName,
      fundIds: uniqStrings([...(existing.fundIds ?? []), ...(candidate.fundIds ?? [])], 50),
      tags: uniqStrings([...(existing.tags ?? []), ...(candidate.tags ?? [])], 50),
      isSynthetic: Boolean(existing.isSynthetic && candidate.isSynthetic),
    });
  }

  return {
    candidates: [...byKey.values()],
    merged,
  };
}

function evidenceIdentity(evidence: ClaimEvidence): string {
  const url = canonicalizeUrl(evidence.url);
  if (url) return `url:${url}`;
  return `snippet:${normalizeTitle(evidence.snippet ?? "")}|title:${normalizeTitle(evidence.title ?? "")}`;
}

function citationToEvidence(claim: NewsClaim, idSuffix = ""): ClaimEvidence {
  return {
    id: `evidence-citation-${claim.id}${idSuffix}`,
    claimId: claim.id,
    sourceType: "PUBLIC_ARTICLE",
    visibility: "PUBLIC",
    title: claim.citation.title,
    url: claim.citation.url,
    snippet: claim.citation.snippet,
    submittedAt: claim.createdAt,
    confidence: "MEDIUM",
    isSynthetic: claim.dataOrigin === "derived",
    metadata: {
      mergedFromSourceId: claim.sourceId,
    },
  };
}

function claimSignature(claimText: string): string {
  return normalizeTitle(claimText);
}

function hasFundOverlap(left: string[], right: string[]): boolean {
  const set = new Set(left);
  return right.some((fundId) => set.has(fundId));
}

function withinDays(left: string, right: string, days: number): boolean {
  const leftDate = Date.parse(left);
  const rightDate = Date.parse(right);
  if (!Number.isFinite(leftDate) || !Number.isFinite(rightDate)) return false;
  const delta = Math.abs(leftDate - rightDate);
  return delta <= days * 24 * 60 * 60 * 1000;
}

function mergeClaimEvidence(target: NewsClaim, incoming: NewsClaim): { mergedCitationCount: number } {
  const targetEvidence = Array.isArray(target.verificationRecord?.evidence) ? [...target.verificationRecord.evidence] : [];
  const incomingEvidence = Array.isArray(incoming.verificationRecord?.evidence) ? incoming.verificationRecord.evidence : [];
  const evidenceIndex = new Map<string, ClaimEvidence>();

  const allEvidence = [
    ...targetEvidence,
    citationToEvidence(target),
    ...incomingEvidence,
    citationToEvidence(incoming, `-${stableHash([incoming.citation.url, incoming.citation.snippet], 8)}`),
  ];

  for (const evidence of allEvidence) {
    const key = evidenceIdentity(evidence);
    if (evidenceIndex.has(key)) continue;
    evidenceIndex.set(key, evidence);
  }

  const mergedEvidence = [...evidenceIndex.values()];
  const previousCitationCount = target.citationCount ?? 1;
  const mergedCitationCount = Math.max(0, mergedEvidence.length - targetEvidence.length);

  target.citationCount = Math.max(previousCitationCount, mergedEvidence.length);
  target.verificationRecord = target.verificationRecord
    ? {
        ...target.verificationRecord,
        evidence: mergedEvidence.map((evidence, idx) => ({
          ...evidence,
          claimId: target.id,
          id: evidence.id || `evidence-${target.id}-${idx + 1}`,
        })),
      }
    : undefined;
  return { mergedCitationCount };
}

export function dedupeClaims(claims: NewsClaim[]): {
  claims: NewsClaim[];
  merged: number;
  citationsMerged: number;
} {
  const buckets = new Map<string, NewsClaim[]>();
  const deduped: NewsClaim[] = [];
  let merged = 0;
  let citationsMerged = 0;

  const sortedClaims = [...claims].sort((left, right) => +new Date(left.createdAt) - +new Date(right.createdAt));
  for (const claim of sortedClaims) {
    const signature = claimSignature(claim.claimText);
    const claimDomain = domainFromUrl(claim.citation?.url);
    const bucketKey = `${signature}|${claimDomain || "unknown-domain"}`;
    const bucket = buckets.get(bucketKey) ?? [];
    let mergedInto: NewsClaim | null = null;
    for (const existing of bucket) {
      const fundOverlap = hasFundOverlap(existing.linkedFundIds ?? [], claim.linkedFundIds ?? []);
      if (!fundOverlap) continue;
      if (!withinDays(existing.createdAt, claim.createdAt, 7)) continue;
      mergedInto = existing;
      break;
    }

    if (!mergedInto) {
      bucket.push(claim);
      buckets.set(bucketKey, bucket);
      deduped.push(claim);
      continue;
    }

    merged += 1;
    mergedInto.linkedFundIds = uniqStrings([...(mergedInto.linkedFundIds ?? []), ...(claim.linkedFundIds ?? [])], 40);
    mergedInto.entities = uniqStrings([...(mergedInto.entities ?? []), ...(claim.entities ?? [])], 40);
    mergedInto.claimText =
      mergedInto.claimText.length >= claim.claimText.length ? mergedInto.claimText : claim.claimText;
    mergedInto.llmConfidence = Math.max(mergedInto.llmConfidence ?? 0, claim.llmConfidence ?? 0);
    mergedInto.updatedAt =
      +new Date(mergedInto.updatedAt) >= +new Date(claim.updatedAt) ? mergedInto.updatedAt : claim.updatedAt;
    mergedInto.citation = {
      ...mergedInto.citation,
      snippet:
        mergedInto.citation.snippet.length >= claim.citation.snippet.length
          ? mergedInto.citation.snippet
          : claim.citation.snippet,
    };
    const mergeResult = mergeClaimEvidence(mergedInto, claim);
    citationsMerged += mergeResult.mergedCitationCount;
  }

  return {
    claims: deduped,
    merged,
    citationsMerged,
  };
}

function advancedSignalKey(signal: Signal): string {
  const evidenceUrl = canonicalizeUrl(signal.evidenceUrl ?? signal.evidence?.url);
  const normalizedTitle = normalizeTitle(signal.title);
  const normalizedClaimSignature = normalizeTitle(`${signal.title} ${signal.summary}`.slice(0, 280));
  if (evidenceUrl) {
    return [signal.fundId, normalizedTitle || normalizedClaimSignature, evidenceUrl].join("|");
  }
  const bucket = to72hBucket(signal.createdAt);
  return [
    signal.fundId,
    normalizedTitle || normalizedClaimSignature,
    bucket,
    normalizeTitle(signal.evidenceSnippet ?? signal.evidence?.snippet ?? ""),
  ].join("|");
}

function dedupeSignalsById(signals: Signal[]): Signal[] {
  const byId = new Map<string, Signal>();
  for (const signal of signals) {
    const existing = byId.get(signal.id);
    if (!existing) {
      byId.set(signal.id, signal);
      continue;
    }
    const existingRank = signalTierRank(existing.qualityTier) * 100 + (existing.confidence ?? 0);
    const nextRank = signalTierRank(signal.qualityTier) * 100 + (signal.confidence ?? 0);
    const winner = nextRank >= existingRank ? signal : existing;
    const loser = winner === existing ? signal : existing;
    byId.set(signal.id, {
      ...winner,
      tags: uniqStrings([...(winner.tags ?? []), ...(loser.tags ?? [])], 20),
      claimIds: uniqStrings([...(winner.claimIds ?? []), ...(loser.claimIds ?? [])], 30),
      sourceId: winner.sourceId || loser.sourceId,
      sourceTitle: winner.sourceTitle || loser.sourceTitle,
      qualityReasons: uniqStrings([...(winner.qualityReasons ?? []), ...(loser.qualityReasons ?? [])], 12),
      articleSnapshot: winner.articleSnapshot ?? loser.articleSnapshot,
    });
  }
  return [...byId.values()];
}

export function dedupeSignalsAdvanced(signals: Signal[]): { signals: Signal[]; merged: number } {
  const idDeduped = dedupeSignalsById(signals);
  const baseline = dedupeSignals(idDeduped);
  const buckets = new Map<string, Signal>();
  let merged = signals.length - idDeduped.length + (idDeduped.length - baseline.length);

  for (const signal of baseline) {
    const key = advancedSignalKey(signal);
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, signal);
      continue;
    }
    merged += 1;
    const winner =
      (existing.confidence ?? 0) >= (signal.confidence ?? 0)
        ? existing
        : signal;
    const loser = winner === existing ? signal : existing;
    const winnerTierRank = signalTierRank(winner.qualityTier);
    const loserTierRank = signalTierRank(loser.qualityTier);
    const mergedTier =
      winnerTierRank >= loserTierRank ? winner.qualityTier : loser.qualityTier;
    buckets.set(key, {
      ...winner,
      tags: uniqStrings([...(winner.tags ?? []), ...(loser.tags ?? [])], 20),
      claimIds: uniqStrings([...(winner.claimIds ?? []), ...(loser.claimIds ?? [])], 30),
      sourceId: winner.sourceId || loser.sourceId,
      sourceTitle: winner.sourceTitle || loser.sourceTitle,
      evidenceSnippet:
        (winner.evidenceSnippet ?? "").length >= (loser.evidenceSnippet ?? "").length
          ? winner.evidenceSnippet
          : loser.evidenceSnippet,
      upvotes: Math.max(winner.upvotes ?? 0, loser.upvotes ?? 0),
      verifiedCount: Math.max(winner.verifiedCount ?? 0, loser.verifiedCount ?? 0),
      verifies: Math.max(winner.verifies ?? 0, loser.verifies ?? 0),
      disagrees: Math.max(winner.disagrees ?? 0, loser.disagrees ?? 0),
      commentsCount: Math.max(winner.commentsCount ?? 0, loser.commentsCount ?? 0),
      qualityTier: mergedTier,
      alignmentScore:
        typeof winner.alignmentScore === "number" || typeof loser.alignmentScore === "number"
          ? Math.max(winner.alignmentScore ?? 0, loser.alignmentScore ?? 0)
          : undefined,
      citationMatchScore:
        typeof winner.citationMatchScore === "number" || typeof loser.citationMatchScore === "number"
          ? Math.max(winner.citationMatchScore ?? 0, loser.citationMatchScore ?? 0)
          : undefined,
      qualityReasons: uniqStrings([...(winner.qualityReasons ?? []), ...(loser.qualityReasons ?? [])], 12),
      articleSnapshot:
        winnerTierRank > loserTierRank
          ? winner.articleSnapshot ?? loser.articleSnapshot
          : loserTierRank > winnerTierRank
            ? loser.articleSnapshot ?? winner.articleSnapshot
            : winner.articleSnapshot ?? loser.articleSnapshot,
    });
  }

  return {
    signals: [...buckets.values()].sort((left, right) => +new Date(right.createdAt) - +new Date(left.createdAt)),
    merged,
  };
}

export function dedupeGraphEdges(edges: GraphEdge[]): { edges: GraphEdge[]; merged: number } {
  const buckets = new Map<string, GraphEdge>();
  let merged = 0;
  for (const edge of edges) {
    const key = `${edge.fromType}|${edge.fromId}|${edge.toType}|${edge.toId}|${edge.relation}`;
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, edge);
      continue;
    }
    merged += 1;
    if ((edge.weight ?? 0) > (existing.weight ?? 0)) {
      buckets.set(key, edge);
    }
  }
  return {
    edges: [...buckets.values()],
    merged,
  };
}

export function dedupeClaimLinks(links: ClaimLink[]): { links: ClaimLink[]; merged: number } {
  const buckets = new Map<string, ClaimLink>();
  let merged = 0;
  for (const link of links) {
    const key = `${link.claimId}|${link.targetType}|${link.targetId}`;
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, link);
      continue;
    }
    merged += 1;
    if ((link.score ?? 0) > (existing.score ?? 0)) {
      buckets.set(key, link);
    }
  }
  return {
    links: [...buckets.values()],
    merged,
  };
}

export function dedupeDbSources(sources: Source[]): { sources: Source[]; merged: number } {
  const buckets = new Map<string, Source>();
  let merged = 0;
  for (const source of sources) {
    const url = canonicalizeUrl(source.url);
    const key =
      url ||
      [
        normalizeTitle(source.title),
        toDayKey(source.metadata?.publishedAt as string | undefined),
        domainFromUrl(source.url),
      ].join("|");
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, source);
      continue;
    }
    merged += 1;
    buckets.set(key, {
      ...existing,
      title: existing.title.length >= source.title.length ? existing.title : source.title,
      rawText: existing.rawText.length >= source.rawText.length ? existing.rawText : source.rawText,
      metadata: {
        ...(existing.metadata ?? {}),
        ...(source.metadata ?? {}),
        matchedFundIds: uniqStrings(
          [
            ...((existing.metadata?.matchedFundIds as string[] | undefined) ?? []),
            ...((source.metadata?.matchedFundIds as string[] | undefined) ?? []),
          ].map(String),
          100
        ),
      },
    });
  }
  return {
    sources: [...buckets.values()],
    merged,
  };
}
