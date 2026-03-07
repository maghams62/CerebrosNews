import { extractClaimsWithLlm, verifyClaimWithLlm } from "@/lib/fundgraph/llm";
import { linkClaimsToEntities } from "@/lib/fundgraph/entityLinking";
import { createId } from "@/lib/fundgraph/ids";
import {
  ClaimEvidence,
  ClaimCategory,
  ClaimNormalization,
  MachineVerificationBreakdown,
  NewsClaim,
  NewsSource,
} from "@/lib/fundgraph/types";

const CATEGORY_KEYWORDS: Array<{ keywords: string[]; category: ClaimCategory }> = [
  { keywords: ["raise", "raised", "funding", "valuation", "round"], category: "Funding" },
  { keywords: ["launch", "released", "introduce", "product", "feature"], category: "Product" },
  { keywords: ["regulator", "regulation", "policy", "compliance", "government"], category: "Regulation" },
  { keywords: ["partner", "partnership", "agreement", "deal", "collaboration"], category: "Partnership" },
  { keywords: ["hiring", "hire", "headcount", "talent", "executive"], category: "Hiring" },
  { keywords: ["lawsuit", "legal", "court", "settlement", "antitrust"], category: "Legal" },
  { keywords: ["revenue", "growth", "demand", "market", "forecast"], category: "Market" },
  { keywords: ["infrastructure", "cloud", "data center", "network", "compute"], category: "Infrastructure" },
  { keywords: ["research", "study", "paper", "benchmark", "experiment"], category: "Research" },
];

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function splitSentences(input: string): string[] {
  return input
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 30);
}

function inferCategory(text: string): ClaimCategory {
  const lowered = text.toLowerCase();
  for (const row of CATEGORY_KEYWORDS) {
    if (row.keywords.some((keyword) => lowered.includes(keyword))) {
      return row.category;
    }
  }
  return "Other";
}

function extractEntities(input: string): string[] {
  const maybe = input.match(/\b([A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+){0,2})\b/g) ?? [];
  const cleaned = maybe
    .map((entity) => entity.trim())
    .filter((entity) => entity.length > 1)
    .filter((entity) => !/^(The|This|That|These|Those|A|An)$/.test(entity));
  return Array.from(new Set(cleaned)).slice(0, 8);
}

export function normalizeClaimForConflict(claimText: string, entities: string[]): ClaimNormalization {
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

  let polarity: ClaimNormalization["polarity"] = "neutral";
  if (/\b(not|no|deny|denied|decline|decrease|down|drop|halt|cut|fell|fall)\b/.test(lowered)) {
    polarity = "negative";
  } else if (/\b(launched|signed|raised|increased|grew|growth|up|added|expanded)\b/.test(lowered)) {
    polarity = "positive";
  }

  return {
    entity,
    attribute,
    value,
    polarity,
  };
}

function normalizeSnippet(snippet: string, content: string): string {
  const trimmed = snippet.trim();
  if (trimmed.length >= 8 && content.includes(trimmed)) {
    return trimmed;
  }

  const snippetWords = trimmed.toLowerCase().split(/\s+/).filter((word) => word.length > 3);
  const sentences = splitSentences(content);
  if (!sentences.length) return content.slice(0, 280);

  let best = sentences[0];
  let bestScore = -1;
  for (const sentence of sentences) {
    const lowered = sentence.toLowerCase();
    let score = 0;
    for (const word of snippetWords) {
      if (lowered.includes(word)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = sentence;
    }
  }
  return best.slice(0, 500);
}

function heuristicallyExtractClaims(source: NewsSource): Array<{
  claimText: string;
  category: ClaimCategory;
  entities: string[];
  llmConfidence: number;
  citation: { snippet: string };
}> {
  const sentences = splitSentences(source.content || source.summary || source.title);
  const candidates = sentences.length ? sentences : [source.summary || source.title];
  const claims = candidates.slice(0, 12).map((sentence, index) => ({
    claimText: sentence.slice(0, 220),
    category: inferCategory(sentence),
    entities: extractEntities(`${source.title}. ${sentence}`),
    llmConfidence: Number(clamp(0.58 + (12 - index) * 0.02, 0.4, 0.86).toFixed(2)),
    citation: {
      snippet: sentence.slice(0, 500),
    },
  }));

  if (claims.length >= 5) return claims.slice(0, 12);

  const summaryLine = (source.summary || source.content || source.title).replace(/\s+/g, " ").slice(0, 220);
  const fallback = [
    `${source.title} was reported by ${source.sourceName}.`,
    `${source.title} includes updates relevant to venture and portfolio activity.`,
    `${source.title} suggests movement that can be linked to investor and company entities.`,
    summaryLine || `${source.title} contains source-backed details that can be cited.`,
  ];

  for (const line of fallback) {
    claims.push({
      claimText: line,
      category: inferCategory(line),
      entities: extractEntities(`${source.title}. ${line}`),
      llmConfidence: 0.55,
      citation: {
        snippet: source.summary.slice(0, 500) || source.title,
      },
    });
    if (claims.length >= 5) break;
  }

  return claims.slice(0, 12);
}

export async function extractClaimsForSource(source: NewsSource): Promise<NewsClaim[]> {
  const now = new Date().toISOString();

  let extracted: Array<{
    claimText: string;
    category: ClaimCategory;
    entities: string[];
    llmConfidence: number;
    citation: { snippet: string };
  }>;

  try {
    const llm = await extractClaimsWithLlm({
      title: source.title,
      url: source.url,
      content: source.content || source.summary || source.title,
    });
    extracted = llm.claims;
  } catch {
    extracted = heuristicallyExtractClaims(source);
  }

  const claims = extracted.map((item) => {
    const snippet = normalizeSnippet(item.citation.snippet, source.content || source.summary || source.title);
    const claim: NewsClaim = {
      id: createId("fg-claim"),
      sourceId: source.id,
      claimText: item.claimText.trim(),
      category: item.category,
      entities: item.entities.filter(Boolean).slice(0, 12),
      llmConfidence: Number(clamp(item.llmConfidence, 0, 1).toFixed(3)),
      citation: {
        sourceId: source.id,
        url: source.url,
        title: source.title,
        snippet,
      },
      community: {
        verifiedCount: 0,
        disputedCount: 0,
        verifyCount: 0,
        disagreeCount: 0,
        commentCount: 0,
        verifies: 0,
        disagrees: 0,
        trustScore: 0,
      },
      linkedFundIds: [],
      citationCount: 1,
      normalized: normalizeClaimForConflict(item.claimText.trim(), item.entities.filter(Boolean).slice(0, 12)),
      dataOrigin: "fetched",
      createdAt: now,
      updatedAt: now,
    };
    return claim;
  });

  const deduped = claims
    .filter((claim) => claim.claimText.length >= 8)
    .filter((claim, idx, arr) => arr.findIndex((other) => other.claimText === claim.claimText) === idx)
    .slice(0, 12);

  const linked = await linkClaimsToEntities(deduped);
  return linked.claims;
}

function fallbackMachineBreakdown(
  claim: string,
  evidence: ClaimEvidence[],
  conflicts?: Array<{ claimText: string; snippet?: string }>
): MachineVerificationBreakdown {
  const claimTokens = claim
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 3);
  const evidenceText = evidence
    .map((item) => `${item.snippet ?? ""} ${item.note ?? ""}`.trim())
    .join(" ")
    .toLowerCase();
  const overlap = claimTokens.filter((token) => evidenceText.includes(token)).length;
  const ratio = claimTokens.length ? overlap / claimTokens.length : 0;
  const machineConfidence = Number(clamp(18 + ratio * 82, 0, 100).toFixed(2));
  const citationSupport =
    ratio >= 0.66 ? "STRONG" : ratio >= 0.4 ? "MEDIUM" : ratio >= 0.18 ? "WEAK" : "NONE";
  const sourceRelevance =
    ratio >= 0.55 ? "HIGH" : ratio >= 0.24 ? "MEDIUM" : "LOW";

  const latestSubmittedAt = evidence
    .map((item) => +new Date(item.submittedAt))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0];
  const ageDays = Number.isFinite(latestSubmittedAt) ? (Date.now() - latestSubmittedAt) / (1000 * 60 * 60 * 24) : Number.POSITIVE_INFINITY;
  const freshness = ageDays <= 14 ? "TIMELY" : ageDays <= 120 ? "RECENT" : "STALE";
  const conflictText = conflicts?.map((item) => `${item.claimText} ${item.snippet ?? ""}`).join(" ").toLowerCase() ?? "";
  const conflictDetected =
    Boolean(conflicts?.length) ||
    /(conflict|contradict|dispute|denied|inconsistent)/.test(evidenceText) ||
    /(conflict|contradict|dispute|denied|inconsistent)/.test(conflictText);

  return {
    citationSupport,
    sourceRelevance,
    freshness,
    conflictDetected,
    reasoningSummary: conflictDetected
      ? "Evidence overlap exists, but conflicting claims are present and reduce machine certainty."
      : citationSupport === "STRONG"
        ? "Provided evidence strongly overlaps with core factual statements in the claim."
        : citationSupport === "MEDIUM"
          ? "Evidence supports part of the claim, but important specifics remain indirect."
          : citationSupport === "WEAK"
            ? "Evidence has weak lexical overlap with the claim and should be treated cautiously."
            : "Evidence is missing or insufficient to support the claim.",
    machineConfidence,
  };
}

export async function verifyClaim(
  claimText: string,
  evidence: ClaimEvidence[],
  conflicts?: Array<{ claimText: string; snippet?: string }>
): Promise<MachineVerificationBreakdown> {
  try {
    const llm = await verifyClaimWithLlm({
      claim: claimText,
      evidence,
      conflicts,
    });
    return {
      citationSupport: llm.citationSupport,
      sourceRelevance: llm.sourceRelevance,
      freshness: llm.freshness,
      conflictDetected: llm.conflictDetected,
      reasoningSummary: llm.reasoningSummary,
      machineConfidence: Number(clamp(llm.machineConfidence, 0, 100).toFixed(2)),
    };
  } catch {
    return fallbackMachineBreakdown(claimText, evidence, conflicts);
  }
}
