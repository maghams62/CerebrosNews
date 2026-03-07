import { ContributionEventType, GamificationTier } from "@/lib/fundgraph/types";

export type Tier = GamificationTier;

export interface TierLimits {
  maxClaimsVisible: number;
  maxSignalsVisible: number;
  graphDepth: number;
  memoAllowed: boolean;
  fullAccess: boolean;
  earlySignals: boolean;
}

export interface CreditRule {
  key: string;
  label: string;
  deltaCredits: number;
  note?: string;
}

export interface SpendRule {
  key: string;
  label: string;
  costText: string;
  note?: string;
}

export const DEFAULT_STARTING_CREDITS = 10;

export const TIER_ORDER: Tier[] = ["visitor", "contributor", "analyst", "insider"];

export const TIER_THRESHOLDS: Record<Tier, number> = {
  visitor: 0,
  contributor: 3,
  analyst: 10,
  insider: 25,
};

export const LIMITS_BY_TIER: Record<Tier, TierLimits> = {
  visitor: {
    maxClaimsVisible: 5,
    maxSignalsVisible: 3,
    graphDepth: 4,
    memoAllowed: false,
    fullAccess: false,
    earlySignals: false,
  },
  contributor: {
    maxClaimsVisible: 25,
    maxSignalsVisible: 15,
    graphDepth: 2,
    memoAllowed: true,
    fullAccess: false,
    earlySignals: false,
  },
  analyst: {
    maxClaimsVisible: 9999,
    maxSignalsVisible: 9999,
    graphDepth: 3,
    memoAllowed: true,
    fullAccess: true,
    earlySignals: false,
  },
  insider: {
    maxClaimsVisible: 9999,
    maxSignalsVisible: 9999,
    graphDepth: 4,
    memoAllowed: true,
    fullAccess: true,
    earlySignals: true,
  },
};

export const EARN_RULES: CreditRule[] = [
  { key: "add_signal", label: "Add Signal", deltaCredits: 3 },
  { key: "verify_claim", label: "Verify Claim", deltaCredits: 2 },
  { key: "dispute_claim", label: "Dispute Claim", deltaCredits: 2, note: "Counts as a claim verification action." },
  { key: "add_source", label: "Cite Source", deltaCredits: 4 },
  { key: "add_comment", label: "Add Comment", deltaCredits: 1 },
  { key: "share_signal", label: "Share Signal", deltaCredits: 1 },
  { key: "upvote", label: "Submit Stance", deltaCredits: 1, note: "Optional and capped daily." },
];

export const SPEND_RULES: SpendRule[] = [
  { key: "memo_generate", label: "Generate Memo", costText: "-2 tokens", note: "Analyst+ can generate without spend." },
  {
    key: "unlock_signal",
    label: "Unlock Advanced Signal Intelligence",
    costText: "-5 tokens",
    note: "Reveals deep verification, full citations, graph context, and AI reasoning.",
  },
  { key: "claims_unlock", label: "Unlock Full Claims Feed", costText: "Tier based" },
  { key: "graph_expand", label: "Expand Graph Depth", costText: "Tier based" },
];

export const CREDIT_DELTAS: Record<ContributionEventType, number> = {
  verify_claim: 2,
  add_signal: 3,
  add_source: 4,
  add_comment: 1,
  share_signal: 1,
  upvote: 1,
  memo_generate: -2,
};

export const DAILY_CREDITS_CAP = 50;

export const DAILY_ACTION_CAPS: Record<ContributionEventType, number> = {
  verify_claim: 20,
  add_signal: 10,
  add_source: 10,
  add_comment: 30,
  share_signal: 20,
  upvote: 25,
  memo_generate: 1000,
};

export function tierLabel(tier: Tier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

export function getTier(contributions: number): Tier {
  if (contributions >= TIER_THRESHOLDS.insider) return "insider";
  if (contributions >= TIER_THRESHOLDS.analyst) return "analyst";
  if (contributions >= TIER_THRESHOLDS.contributor) return "contributor";
  return "visitor";
}

export function getNextTierThreshold(tier: Tier): number | null {
  const next = getNextTier(tier);
  if (!next) return null;
  return TIER_THRESHOLDS[next];
}

export function getNextTier(tier: Tier): Tier | null {
  if (tier === "visitor") return "contributor";
  if (tier === "contributor") return "analyst";
  if (tier === "analyst") return "insider";
  return null;
}

export function getLimits(tier: Tier): TierLimits {
  return LIMITS_BY_TIER[tier];
}
