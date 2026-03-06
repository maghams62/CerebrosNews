import {
  ClaimEvidence,
  ContributorRole,
  MembershipTier,
  VerificationContributorProfile,
  VerificationStatus,
} from "@/lib/fundgraph/types";

export function verificationStatusLabel(status: VerificationStatus): string {
  if (status === "VERIFIED") return "Verified";
  if (status === "PARTIALLY_VERIFIED") return "Partially Verified";
  if (status === "DISPUTED") return "Disputed";
  return "Unverified";
}

export function verificationStatusClass(status: VerificationStatus): string {
  if (status === "VERIFIED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "PARTIALLY_VERIFIED") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "DISPUTED") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

export function membershipTierLabel(tier?: MembershipTier): string {
  if (!tier) return "Member";
  if (tier === "INTERNAL_ANALYST") return "Internal analyst";
  if (tier === "VERIFIED_PARTNER") return "Verified partner";
  return `${tier.charAt(0)}${tier.slice(1).toLowerCase()} member`;
}

export function contributorRoleLabel(role?: ContributorRole): string {
  if (!role) return "Member";
  if (role === "ANONYMOUS_FOUNDER") return "Anonymous founder";
  if (role === "ANONYMOUS_SERIES_B_INVESTOR") return "Anonymous Series B investor";
  if (role === "ANONYMOUS_GP") return "Anonymous GP";
  if (role === "ANONYMOUS_LP") return "Anonymous LP";
  if (role === "OPERATOR") return "Operator";
  if (role === "ANALYST") return "Analyst";
  if (role === "MEMBER") return "Member";
  return "Contributor";
}

export function evidenceSourceTypeLabel(sourceType: ClaimEvidence["sourceType"]): string {
  if (sourceType === "PUBLIC_ARTICLE") return "Public article";
  if (sourceType === "TWEET_THREAD") return "Tweet thread";
  if (sourceType === "PODCAST") return "Podcast";
  if (sourceType === "YOUTUBE_VIDEO") return "YouTube video";
  if (sourceType === "PASTED_TEXT") return "Pasted text";
  if (sourceType === "PRIVATE_INTEL") return "Private intel";
  if (sourceType === "FOUNDER_NOTE") return "Founder note";
  if (sourceType === "LP_NOTE") return "LP note";
  if (sourceType === "GP_NOTE") return "GP note";
  if (sourceType === "FUND_DECK") return "Fund deck";
  return "Other";
}

export function evidenceVisibilityLabel(visibility: ClaimEvidence["visibility"]): string {
  if (visibility === "PUBLIC") return "Public";
  if (visibility === "PRIVATE") return "Private";
  return "Anonymous";
}

export function contributorDisplayLabel(
  contributor?: VerificationContributorProfile,
  visibility?: ClaimEvidence["visibility"]
): string {
  if (!contributor) return "Community member";
  const forceAnonymous = visibility === "ANONYMOUS" || contributor.isAnonymous || contributor.role?.startsWith("ANONYMOUS_");
  if (forceAnonymous) {
    return contributorRoleLabel(contributor.role);
  }
  return contributor.label?.trim() || contributorRoleLabel(contributor.role) || membershipTierLabel(contributor.tier);
}

export function scoreClass(score: number): string {
  if (score >= 70) return "text-emerald-700";
  if (score >= 40) return "text-amber-700";
  return "text-rose-700";
}
