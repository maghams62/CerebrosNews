import {
  ClaimEvidence,
  ClaimVerificationRecord,
  ContributorRole,
  CommunityVerificationSummary,
  EvidenceConfidenceTier,
  GamificationTier,
  MachineVerificationBreakdown,
  MembershipTier,
  Verification,
  VerificationConfidenceTier,
  VerificationContributorProfile,
  VerificationStatus,
} from "@/lib/fundgraph/types";

type ScoreWeights = {
  machine: number;
  publicEvidence: number;
  privateEvidence: number;
  community: number;
  reputation: number;
};

const SCORE_WEIGHTS: ScoreWeights = {
  machine: 0.3,
  publicEvidence: 0.2,
  privateEvidence: 0.15,
  community: 0.2,
  reputation: 0.15,
};

export const MEMBERSHIP_TIER_WEIGHTS: Record<MembershipTier, number> = {
  BRONZE: 1,
  SILVER: 1.15,
  GOLD: 1.35,
  PLATINUM: 1.6,
  INTERNAL_ANALYST: 1.75,
  VERIFIED_PARTNER: 1.9,
};

const MACHINE_CITATION_SCORES: Record<MachineVerificationBreakdown["citationSupport"], number> = {
  NONE: 5,
  WEAK: 35,
  MEDIUM: 65,
  STRONG: 90,
};

const MACHINE_RELEVANCE_SCORES: Record<MachineVerificationBreakdown["sourceRelevance"], number> = {
  LOW: 20,
  MEDIUM: 60,
  HIGH: 90,
};

const MACHINE_FRESHNESS_SCORES: Record<MachineVerificationBreakdown["freshness"], number> = {
  STALE: 20,
  RECENT: 65,
  TIMELY: 90,
};

const EVIDENCE_CONFIDENCE_SCORES: Record<EvidenceConfidenceTier, number> = {
  LOW: 35,
  MEDIUM: 65,
  HIGH: 85,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function confidenceScore(value?: EvidenceConfidenceTier): number {
  if (!value) return 55;
  return EVIDENCE_CONFIDENCE_SCORES[value] ?? 55;
}

function sourceStrengthBoost(sourceType: ClaimEvidence["sourceType"]): number {
  if (sourceType === "PUBLIC_ARTICLE" || sourceType === "FUND_DECK") return 10;
  if (sourceType === "TWEET_THREAD" || sourceType === "YOUTUBE_VIDEO" || sourceType === "PODCAST") return 6;
  if (sourceType === "PRIVATE_INTEL" || sourceType === "FOUNDER_NOTE" || sourceType === "LP_NOTE" || sourceType === "GP_NOTE") return 8;
  if (sourceType === "PASTED_TEXT") return 4;
  return 3;
}

function evidenceScore(evidence: ClaimEvidence[]): number {
  if (!evidence.length) return 0;
  const avg = evidence.reduce((sum, item) => sum + confidenceScore(item.confidence) + sourceStrengthBoost(item.sourceType), 0) / evidence.length;
  const quantityBoost = Math.min(24, evidence.length * 8);
  return round2(clamp(avg + quantityBoost, 0, 100));
}

function voteTierWeight(vote: Verification): number {
  const tier = vote.contributor?.tier ?? "BRONZE";
  return MEMBERSHIP_TIER_WEIGHTS[tier] ?? MEMBERSHIP_TIER_WEIGHTS.BRONZE;
}

function defaultRoleLabel(role?: ContributorRole): string | undefined {
  if (!role) return undefined;
  if (role === "ANONYMOUS_FOUNDER") return "Anonymous founder";
  if (role === "ANONYMOUS_SERIES_B_INVESTOR") return "Anonymous Series B investor";
  if (role === "ANONYMOUS_GP") return "Anonymous GP";
  if (role === "ANONYMOUS_LP") return "Anonymous LP";
  if (role === "OPERATOR") return "Operator";
  if (role === "ANALYST") return "Analyst";
  if (role === "MEMBER") return "Member";
  return "Contributor";
}

export function tierForGamificationTier(tier?: GamificationTier): MembershipTier {
  if (tier === "contributor") return "SILVER";
  if (tier === "analyst") return "INTERNAL_ANALYST";
  if (tier === "insider") return "VERIFIED_PARTNER";
  return "BRONZE";
}

export function ensureContributorProfile(input?: VerificationContributorProfile): VerificationContributorProfile {
  if (!input) {
    return { tier: "BRONZE", role: "MEMBER", label: "Bronze member", isAnonymous: false };
  }
  const tier = input.tier ?? "BRONZE";
  const role = input.role ?? "MEMBER";
  const isAnonymous = Boolean(input.isAnonymous || role.startsWith("ANONYMOUS_"));
  return {
    label: input.label,
    tier,
    role,
    isAnonymous,
  };
}

function scoreMachine(machine: MachineVerificationBreakdown): number {
  const base =
    clamp(machine.machineConfidence, 0, 100) * 0.5 +
    MACHINE_CITATION_SCORES[machine.citationSupport] * 0.2 +
    MACHINE_RELEVANCE_SCORES[machine.sourceRelevance] * 0.15 +
    MACHINE_FRESHNESS_SCORES[machine.freshness] * 0.15;
  const conflictPenalty = machine.conflictDetected ? 20 : 0;
  return round2(clamp(base - conflictPenalty, 0, 100));
}

export function computeCommunitySummary(votes: Verification[]): CommunityVerificationSummary {
  const claimVotes = votes.filter((vote) => vote.claimId && !vote.signalId);
  const verifyVotes = claimVotes.filter((vote) => vote.vote === "verify");
  const disputeVotes = claimVotes.filter((vote) => vote.vote === "dispute");

  const weightedVerifyScore = round2(verifyVotes.reduce((sum, vote) => sum + voteTierWeight(vote), 0));
  const weightedDisputeScore = round2(disputeVotes.reduce((sum, vote) => sum + voteTierWeight(vote), 0));

  const tierWeights = new Map<MembershipTier, number>();
  for (const vote of verifyVotes) {
    const tier = vote.contributor?.tier ?? "BRONZE";
    tierWeights.set(tier, MEMBERSHIP_TIER_WEIGHTS[tier] ?? MEMBERSHIP_TIER_WEIGHTS.BRONZE);
  }

  const topVerifierTiers = [...tierWeights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([tier]) => tier);

  const breakdownMap = new Map<
    string,
    {
      label: string;
      count: number;
      vote: "verify" | "dispute";
      tier?: MembershipTier;
      role?: ContributorRole;
      weightedScore: number;
    }
  >();
  for (const vote of claimVotes) {
    const contributor = ensureContributorProfile(vote.contributor);
    const label =
      contributor.label?.trim() ||
      defaultRoleLabel(contributor.role) ||
      `${(contributor.tier ?? "BRONZE").replace(/_/g, " ").toLowerCase()} member`;
    const key = `${vote.vote}|${contributor.tier ?? ""}|${contributor.role ?? ""}|${label.toLowerCase()}`;
    const entry = breakdownMap.get(key);
    const weight = voteTierWeight(vote);
    if (entry) {
      entry.count += 1;
      entry.weightedScore = round2(entry.weightedScore + weight);
      continue;
    }
    breakdownMap.set(key, {
      label,
      count: 1,
      vote: vote.vote,
      tier: contributor.tier,
      role: contributor.role,
      weightedScore: round2(weight),
    });
  }
  const breakdown = [...breakdownMap.values()].sort((a, b) => b.weightedScore - a.weightedScore || b.count - a.count);

  return {
    verifyCount: verifyVotes.length,
    disputeCount: disputeVotes.length,
    weightedVerifyScore,
    weightedDisputeScore,
    topVerifierTiers,
    breakdown,
  };
}

function communityScore(community: CommunityVerificationSummary): number {
  const total = community.weightedVerifyScore + community.weightedDisputeScore;
  if (total <= 0) return 0;
  const netRatio = (community.weightedVerifyScore - community.weightedDisputeScore) / total;
  const engagementBoost = Math.min(10, total * 3.5);
  return round2(clamp(50 + netRatio * 45 + engagementBoost, 0, 100));
}

function reputationScore(votes: Verification[], evidence: ClaimEvidence[]): number {
  const tierWeights: number[] = [];
  for (const vote of votes) {
    const tier = vote.contributor?.tier;
    if (tier) tierWeights.push(MEMBERSHIP_TIER_WEIGHTS[tier] ?? MEMBERSHIP_TIER_WEIGHTS.BRONZE);
  }
  for (const item of evidence) {
    const tier = item.contributor?.tier;
    if (tier) tierWeights.push(MEMBERSHIP_TIER_WEIGHTS[tier] ?? MEMBERSHIP_TIER_WEIGHTS.BRONZE);
  }
  if (!tierWeights.length) return 20;
  const avg = tierWeights.reduce((sum, value) => sum + value, 0) / tierWeights.length;
  const normalized = ((avg - MEMBERSHIP_TIER_WEIGHTS.BRONZE) / (MEMBERSHIP_TIER_WEIGHTS.VERIFIED_PARTNER - MEMBERSHIP_TIER_WEIGHTS.BRONZE)) * 100;
  return round2(clamp(normalized, 0, 100));
}

function confidenceTier(score: number): VerificationConfidenceTier {
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

function isDisputed(community: CommunityVerificationSummary, machine: MachineVerificationBreakdown, finalScore: number): boolean {
  if (machine.conflictDetected) return true;
  const heavyDispute = community.weightedDisputeScore >= 2.6 && community.weightedDisputeScore >= community.weightedVerifyScore;
  if (heavyDispute) return true;
  return finalScore < 40 && community.disputeCount >= community.verifyCount && community.disputeCount >= 2;
}

export function computeVerificationStatus(
  finalScore: number,
  machine: MachineVerificationBreakdown,
  community: CommunityVerificationSummary
): VerificationStatus {
  if (isDisputed(community, machine, finalScore)) return "DISPUTED";
  if (finalScore >= 70 && community.weightedDisputeScore <= community.weightedVerifyScore * 0.7) return "VERIFIED";
  if (finalScore >= 40) return "PARTIALLY_VERIFIED";
  return "UNVERIFIED";
}

export function buildClaimVerificationRecord(input: {
  claimId: string;
  machine: MachineVerificationBreakdown;
  evidence: ClaimEvidence[];
  votes: Verification[];
  updatedAt?: string;
}): ClaimVerificationRecord {
  const machineScore = scoreMachine(input.machine);
  const publicEvidenceScore = evidenceScore(input.evidence.filter((item) => item.visibility === "PUBLIC"));
  const privateEvidenceScore = evidenceScore(input.evidence.filter((item) => item.visibility !== "PUBLIC"));
  const community = computeCommunitySummary(input.votes);
  const communityScoreValue = communityScore(community);
  const reputationScoreValue = reputationScore(input.votes, input.evidence);

  const finalScore = round2(
    clamp(
      machineScore * SCORE_WEIGHTS.machine +
        publicEvidenceScore * SCORE_WEIGHTS.publicEvidence +
        privateEvidenceScore * SCORE_WEIGHTS.privateEvidence +
        communityScoreValue * SCORE_WEIGHTS.community +
        reputationScoreValue * SCORE_WEIGHTS.reputation,
      0,
      100
    )
  );
  const status = computeVerificationStatus(finalScore, input.machine, community);

  return {
    claimId: input.claimId,
    status,
    machine: input.machine,
    community,
    score: {
      machineScore,
      publicEvidenceScore,
      privateEvidenceScore,
      communityScore: communityScoreValue,
      reputationScore: reputationScoreValue,
      finalScore,
      confidenceTier: confidenceTier(finalScore),
    },
    evidence: input.evidence,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}
