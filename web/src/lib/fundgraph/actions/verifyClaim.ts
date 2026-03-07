import { verifyClaim } from "@/lib/fundgraph/claims";
import { applyContribution } from "@/lib/fundgraph/gamification";
import { createId } from "@/lib/fundgraph/ids";
import { getFundgraphDataMode } from "@/lib/fundgraph/mode";
import {
  addClaimVote,
  ensureUser,
  getClaimById,
  getUserById,
  setClaimLlmVerification,
} from "@/lib/fundgraph/store";
import { ClaimEvidence, CommunityVoteInput, VerificationContributorProfile } from "@/lib/fundgraph/types";

function normalizeVote(vote: CommunityVoteInput): "verify" | "dispute" {
  return vote === "disagree" ? "dispute" : vote;
}

export interface VerifyClaimActionInput {
  claimId: string;
  userId: string;
  vote: CommunityVoteInput;
  note?: string;
  comment?: string;
  userName?: string;
  contributor?: VerificationContributorProfile;
}

export async function verifyClaimAction(input: VerifyClaimActionInput) {
  const claim = await getClaimById(input.claimId);
  if (!claim) return { error: "claim_not_found" as const };

  await ensureUser(input.userId, input.userName);

  const evidence: ClaimEvidence[] =
    claim.verificationRecord?.evidence?.length
      ? claim.verificationRecord.evidence
      : [
          {
            id: `evidence-citation-${claim.id}`,
            claimId: claim.id,
            sourceType: "PUBLIC_ARTICLE",
            visibility: "PUBLIC",
            title: claim.citation.title,
            url: claim.citation.url,
            snippet: claim.citation.snippet,
            submittedAt: claim.createdAt,
            confidence: "MEDIUM",
          },
        ];

  const machineVerification = await verifyClaim(claim.claimText, evidence);
  await setClaimLlmVerification(input.claimId, machineVerification);

  const updated = await addClaimVote({
    claimId: input.claimId,
    userId: input.userId,
    vote: normalizeVote(input.vote),
    note: input.note,
    comment: input.comment,
    contributor: input.contributor,
    verificationId: createId("fg-verification"),
  });

  if (!updated) return { error: "claim_not_found" as const };

  const gamification = await applyContribution(input.userId, "verify_claim", input.claimId);
  const user = await getUserById(input.userId);
  const mode = getFundgraphDataMode();

  return {
    mode,
    claim: updated,
    verificationRecord: updated.verificationRecord,
    verificationSummary: {
      status: updated.verificationRecord?.status ?? "UNVERIFIED",
      finalScore: updated.verificationRecord?.score.finalScore ?? 0,
      confidenceTier: updated.verificationRecord?.score.confidenceTier ?? "LOW",
      publicEvidenceCount: updated.verificationRecord?.evidence.filter((item) => item.visibility === "PUBLIC").length ?? 0,
      privateEvidenceCount: updated.verificationRecord?.evidence.filter((item) => item.visibility !== "PUBLIC").length ?? 0,
      verifyCount: updated.verificationRecord?.community.verifyCount ?? updated.community.verifyCount ?? 0,
      disputeCount: updated.verificationRecord?.community.disputeCount ?? updated.community.disagreeCount ?? 0,
    },
    verifiedCount: updated.community.verifiedCount ?? updated.community.verifyCount ?? 0,
    disputedCount: updated.community.disputedCount ?? updated.community.disagreeCount ?? 0,
    trustScore: updated.trustScore,
    trustTier: updated.trustTier,
    trustExplanation: updated.trustExplanation,
    machineVerification,
    llmVerification: updated.llmVerification,
    contributor: {
      userId: input.userId,
      credScore: gamification.credits,
      badgeTier: user?.badgeTier ?? "NEW",
    },
    gamification,
    realModePlaceholder: mode === "real",
  };
}
