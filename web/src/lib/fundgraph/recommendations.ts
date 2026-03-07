import { FundRecommendation, UserProfile } from "@/lib/fundgraph/types";
import { rankFunds } from "@/lib/fundgraph/recommendation/rankFunds";

export async function rankFundsForProfile(
  profile: UserProfile,
  opts?: { limit?: number; includeLlmExplanation?: boolean }
): Promise<FundRecommendation[]> {
  return rankFunds(profile, opts);
}
