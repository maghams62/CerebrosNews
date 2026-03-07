import { explainRecommendationWithLlm } from "@/lib/fundgraph/llm";
import { readFunds } from "@/lib/fundgraph/storage";
import { FundRecommendation, UserProfile } from "@/lib/fundgraph/types";
import { scoreFund } from "@/lib/fundgraph/recommendation/scoreFund";

function fallbackReason(parts: {
  sector: number;
  stage: number;
  geo: number;
  check: number;
  momentum: number;
}): string {
  if (parts.sector >= 0.75 && parts.stage >= 0.75) {
    return "High match on your sector and stage preferences.";
  }
  if (parts.geo >= 0.7 && parts.check >= 0.7) {
    return "Strong alignment with your geography and check-size profile.";
  }
  if (parts.momentum >= 0.8) {
    return "High recent momentum and community validation make this a strong fit.";
  }
  return "Balanced fit across your profile with competitive momentum signals.";
}

export async function rankFunds(
  profile: UserProfile,
  opts?: { limit?: number; includeLlmExplanation?: boolean }
): Promise<FundRecommendation[]> {
  const funds = await readFunds();
  const ranked = funds
    .map((fund) => {
      const { score, parts } = scoreFund(profile, fund);
      return {
        fund,
        score,
        reason: fallbackReason(parts),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, opts?.limit ?? 10)
    .map((entry) => ({
      fundId: entry.fund.id,
      score: entry.score,
      reason: entry.reason,
    }));

  if (!opts?.includeLlmExplanation) return ranked;

  return Promise.all(
    ranked.map(async (entry) => {
      const fund = funds.find((item) => item.id === entry.fundId);
      if (!fund) return entry;
      try {
        const llm = await explainRecommendationWithLlm({ profile, fund });
        return { ...entry, reason: llm.explanation, explanation: llm.explanation };
      } catch {
        return entry;
      }
    })
  );
}
