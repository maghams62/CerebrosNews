import { Fund, RecommendationResult, Signal, UserProfile } from "@/lib/fundgraph/types";
import { scoreFund } from "@/lib/fundgraph/recommendation/scoreFund";

export function rankFundsForProfile(
  funds: Fund[],
  _signals: Signal[],
  profile?: Partial<UserProfile>,
  limit = 10
): { profile: UserProfile; recommendations: RecommendationResult[] } {
  const normalizedProfile: UserProfile = {
    id: profile?.id,
    userId: profile?.userId ?? profile?.id ?? "anon",
    sectorFocus: Array.isArray(profile?.sectorFocus) ? profile.sectorFocus : [],
    stageFocus: Array.isArray(profile?.stageFocus) ? profile.stageFocus : [],
    geographyFocus: Array.isArray(profile?.geographyFocus)
      ? profile.geographyFocus
      : Array.isArray(profile?.geographies)
        ? profile.geographies
        : [],
    geographies: Array.isArray(profile?.geographies)
      ? profile.geographies
      : Array.isArray(profile?.geographyFocus)
        ? profile.geographyFocus
        : [],
    riskTolerance: profile?.riskTolerance ?? "medium",
    checkSizeMinM: profile?.checkSizeMinM ?? 0.5,
    checkSizeMaxM: profile?.checkSizeMaxM ?? 10,
    typicalCheckSizeM:
      profile?.typicalCheckSizeM ??
      (typeof profile?.typicalCheckSizeKUsd === "number"
        ? profile.typicalCheckSizeKUsd / 1000
        : ((profile?.checkSizeMinM ?? 0.5) + (profile?.checkSizeMaxM ?? 10)) / 2),
    typicalCheckSizeKUsd:
      profile?.typicalCheckSizeKUsd ??
      Math.round(
        (profile?.typicalCheckSizeM ??
          ((profile?.checkSizeMinM ?? 0.5) + (profile?.checkSizeMaxM ?? 10)) / 2) * 1000
      ),
    thesisKeywords: profile?.thesisKeywords ?? [],
    updatedAt: profile?.updatedAt,
    weights: profile?.weights,
  };

  const ranked = funds
    .map((fund) => {
      const { score, parts } = scoreFund(normalizedProfile, fund);
      const reason =
        parts.sector >= 0.7
          ? "Strong sector match for your LP profile."
          : parts.geo >= 0.7
            ? "Geography and check-size profile align well."
            : "Balanced fit with positive momentum signals.";

      return {
        fundId: fund.id,
        score: Number((score * 100).toFixed(2)),
        reasons: [reason],
        explanation: reason,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));

  return {
    profile: normalizedProfile,
    recommendations: ranked,
  };
}
