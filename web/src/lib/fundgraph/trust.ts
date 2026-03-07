import { TrustFields, TrustTier, VerificationVerdict } from "@/lib/fundgraph/types";

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function verdictBase(verdict: VerificationVerdict | undefined): number {
  if (verdict === "supported") return 40;
  if (verdict === "mixed") return 20;
  return 0;
}

function trustTierFromScore(score: number): TrustTier {
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

function communityTerm(verifiedCount: number, disputedCount: number): number {
  const raw = 5 * verifiedCount - 5 * disputedCount;
  return clamp(raw, -20, 20);
}

function citationTerm(snippetLength: number): number {
  return clamp(snippetLength / 20, 0, 15);
}

function authorTerm(authorCredScore: number): number {
  return clamp(authorCredScore / 2, 0, 10);
}

function scoreBreakdown(input: {
  verificationVerdict?: VerificationVerdict;
  verificationConfidence?: number;
  citationSnippetLength: number;
  citationCount: number;
  verifiedCount: number;
  disputedCount: number;
  authorCredScore: number;
}): {
  total: number;
  llmScore: number;
  citationScore: number;
  communityScore: number;
  authorScore: number;
} {
  const llmScore =
    verdictBase(input.verificationVerdict) + clamp(input.verificationConfidence ?? 0, 0, 1) * 30;
  const citationScore = citationTerm(input.citationSnippetLength) + clamp(input.citationCount - 1, 0, 2) * 2;
  const communityScore = communityTerm(input.verifiedCount, input.disputedCount);
  const authorScore = authorTerm(input.authorCredScore);

  const total = clamp(llmScore + citationScore + communityScore + authorScore, 0, 100);

  return {
    total,
    llmScore,
    citationScore,
    communityScore,
    authorScore,
  };
}

function explanation(input: {
  score: number;
  tier: TrustTier;
  verificationVerdict?: VerificationVerdict;
  verifiedCount: number;
  disputedCount: number;
  hasEvidence: boolean;
}): string {
  const tierText = input.tier === "HIGH" ? "High" : input.tier === "MEDIUM" ? "Medium" : "Low";
  const verdictText = input.verificationVerdict ?? "unverified";
  const evidenceText = input.hasEvidence ? "supported by evidence" : "limited evidence";
  const communityText = `${input.verifiedCount} verifications, ${input.disputedCount} disputes`;
  return `${tierText}: ${evidenceText}; LLM ${verdictText}; community ${communityText}.`;
}

export function computeTrustScore(input: {
  verificationVerdict?: VerificationVerdict;
  verificationConfidence?: number;
  citationSnippetLength: number;
  citationCount?: number;
  verifiedCount: number;
  disputedCount: number;
  authorCredScore?: number;
}): TrustFields {
  const breakdown = scoreBreakdown({
    verificationVerdict: input.verificationVerdict,
    verificationConfidence: input.verificationConfidence,
    citationSnippetLength: input.citationSnippetLength,
    citationCount: Math.max(0, Math.floor(input.citationCount ?? 1)),
    verifiedCount: Math.max(0, Math.floor(input.verifiedCount)),
    disputedCount: Math.max(0, Math.floor(input.disputedCount)),
    authorCredScore: Math.max(0, input.authorCredScore ?? 0),
  });

  const trustScore = Number(breakdown.total.toFixed(2));
  const trustTier = trustTierFromScore(trustScore);
  const trustExplanation = explanation({
    score: trustScore,
    tier: trustTier,
    verificationVerdict: input.verificationVerdict,
    verifiedCount: Math.max(0, Math.floor(input.verifiedCount)),
    disputedCount: Math.max(0, Math.floor(input.disputedCount)),
    hasEvidence: input.citationSnippetLength > 0,
  });

  return {
    trustScore,
    trustTier,
    trustExplanation,
  };
}
