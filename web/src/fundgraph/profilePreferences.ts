import { Fund, NewsClaim, RiskTolerance, Signal, UserProfile } from "@/fundgraph/types";

export const DEFAULT_PROFILE_RISK_TOLERANCE: RiskTolerance = "medium";
export const DEFAULT_PROFILE_CHECK_MIN_M = 0.5;
export const DEFAULT_PROFILE_CHECK_MAX_M = 10;

function uniqNormalized(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  const unique = new Set<string>();
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized) continue;
    unique.add(normalized);
  }
  return Array.from(unique);
}

function normalizeRiskTolerance(value: unknown): RiskTolerance {
  if (value === "low" || value === "medium" || value === "high") return value;
  return DEFAULT_PROFILE_RISK_TOLERANCE;
}

function normalizeCheckSize(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0.05, Number(value.toFixed(2)));
}

function normalizeTypicalCheckSizeM(profile: Partial<UserProfile> | null | undefined, minCheckM: number, maxCheckM: number): number {
  const fromMillions = typeof profile?.typicalCheckSizeM === "number" && Number.isFinite(profile.typicalCheckSizeM)
    ? profile.typicalCheckSizeM
    : null;
  if (fromMillions !== null) return Math.max(0.05, Number(fromMillions.toFixed(2)));

  const fromKUsd = typeof profile?.typicalCheckSizeKUsd === "number" && Number.isFinite(profile.typicalCheckSizeKUsd)
    ? profile.typicalCheckSizeKUsd / 1000
    : null;
  if (fromKUsd !== null) return Math.max(0.05, Number(fromKUsd.toFixed(2)));

  return Number(((minCheckM + maxCheckM) / 2).toFixed(2));
}

function normalizeCheckRange(minM: number, maxM: number): { minM: number; maxM: number } {
  if (maxM >= minM) return { minM, maxM };
  return { minM, maxM: minM };
}

function normalizeForMatch(values: string[]): Set<string> {
  return new Set(values.map((value) => value.toLowerCase()));
}

function hasOverlap(profileValues: string[], fundValues: string[]): boolean {
  if (!profileValues.length) return true;
  if (!fundValues.length) return false;
  const normalizedFund = normalizeForMatch(fundValues);
  return profileValues.some((value) => normalizedFund.has(value.toLowerCase()));
}

function resolveFundSectors(fund: Fund): string[] {
  return uniqNormalized([...(fund.sectors ?? []), ...(fund.sectorFocus ?? [])]);
}

function resolveFundStages(fund: Fund): string[] {
  return uniqNormalized([...(fund.stages ?? []), ...(fund.stageFocus ?? [])]);
}

function resolveFundGeographies(fund: Fund): string[] {
  return uniqNormalized([...(fund.geographies ?? []), ...(fund.geography ?? []), ...(fund.geoFocus ?? [])]);
}

function resolveFundRiskTolerance(fund: Fund): RiskTolerance {
  if (fund.risk === "low" || fund.risk === "medium" || fund.risk === "high") return fund.risk;
  if (fund.riskBand === "low" || fund.riskBand === "medium" || fund.riskBand === "high") return fund.riskBand;
  return "medium";
}

function resolveFundCheckRangeM(fund: Fund): { minM: number; maxM: number } {
  if (typeof fund.checkSizeMinM === "number" && typeof fund.checkSizeMaxM === "number") {
    return {
      minM: Math.max(0.05, fund.checkSizeMinM),
      maxM: Math.max(0.05, fund.checkSizeMaxM),
    };
  }
  const minFromKusd = typeof fund.checkSizeKUsd?.min === "number" ? fund.checkSizeKUsd.min / 1000 : DEFAULT_PROFILE_CHECK_MIN_M;
  const maxFromKusd = typeof fund.checkSizeKUsd?.max === "number" ? fund.checkSizeKUsd.max / 1000 : DEFAULT_PROFILE_CHECK_MAX_M;
  return normalizeCheckRange(Math.max(0.05, minFromKusd), Math.max(0.05, maxFromKusd));
}

function riskRank(risk: RiskTolerance): number {
  if (risk === "low") return 1;
  if (risk === "medium") return 2;
  return 3;
}

function formatMillions(value: number): string {
  const rounded = Number(value.toFixed(1));
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function hasCustomCheckRange(profile: UserProfile): boolean {
  return (
    Math.abs(profile.checkSizeMinM - DEFAULT_PROFILE_CHECK_MIN_M) > 0.001 ||
    Math.abs(profile.checkSizeMaxM - DEFAULT_PROFILE_CHECK_MAX_M) > 0.001
  );
}

export function normalizeUserProfileInput(profile: Partial<UserProfile> | null | undefined, fallbackUserId = "demo"): UserProfile {
  const geographies = uniqNormalized(
    Array.isArray(profile?.geographies) && profile?.geographies.length ? profile.geographies : profile?.geographyFocus
  );
  const minCheckM = normalizeCheckSize(profile?.checkSizeMinM, DEFAULT_PROFILE_CHECK_MIN_M);
  const maxCheckM = normalizeCheckSize(profile?.checkSizeMaxM, DEFAULT_PROFILE_CHECK_MAX_M);
  const normalizedRange = normalizeCheckRange(minCheckM, maxCheckM);
  const typicalCheckSizeM = normalizeTypicalCheckSizeM(profile, normalizedRange.minM, normalizedRange.maxM);

  return {
    id: typeof profile?.id === "string" ? profile.id : undefined,
    userId:
      typeof profile?.userId === "string" && profile.userId.trim()
        ? profile.userId.trim()
        : typeof profile?.id === "string" && profile.id.trim()
          ? profile.id.trim()
          : fallbackUserId,
    sectorFocus: uniqNormalized(profile?.sectorFocus),
    stageFocus: uniqNormalized(profile?.stageFocus),
    geographyFocus: geographies,
    geographies,
    riskTolerance: normalizeRiskTolerance(profile?.riskTolerance),
    checkSizeMinM: normalizedRange.minM,
    checkSizeMaxM: normalizedRange.maxM,
    typicalCheckSizeM,
    typicalCheckSizeKUsd: Math.max(10, Math.round(typicalCheckSizeM * 1000)),
    thesisKeywords: uniqNormalized(profile?.thesisKeywords),
    updatedAt: profile?.updatedAt,
    weights: profile?.weights,
  };
}

export function profileHasActiveSignalFeedFilters(profile: UserProfile | null | undefined): boolean {
  if (!profile) return false;
  const normalized = normalizeUserProfileInput(profile, profile.userId ?? "demo");
  if (normalized.sectorFocus.length || normalized.stageFocus.length || normalized.geographies.length) return true;
  if (normalized.riskTolerance !== DEFAULT_PROFILE_RISK_TOLERANCE) return true;
  return hasCustomCheckRange(normalized);
}

export function listProfileFilterChips(profile: UserProfile | null | undefined): string[] {
  if (!profile) return [];
  const normalized = normalizeUserProfileInput(profile, profile.userId ?? "demo");
  const chips = [...normalized.sectorFocus, ...normalized.stageFocus, ...normalized.geographies];
  if (normalized.riskTolerance !== DEFAULT_PROFILE_RISK_TOLERANCE) {
    chips.push(`Risk: ${normalized.riskTolerance[0]?.toUpperCase() ?? ""}${normalized.riskTolerance.slice(1)}`);
  }
  if (hasCustomCheckRange(normalized)) {
    chips.push(`Check: $${formatMillions(normalized.checkSizeMinM)}M-$${formatMillions(normalized.checkSizeMaxM)}M`);
  }
  return Array.from(new Set(chips)).slice(0, 14);
}

export function fundMatchesUserProfile(fund: Fund | null | undefined, profile: UserProfile | null | undefined): boolean {
  if (!fund) return !profileHasActiveSignalFeedFilters(profile);
  if (!profileHasActiveSignalFeedFilters(profile)) return true;

  const normalized = normalizeUserProfileInput(profile, profile?.userId ?? "demo");
  if (!hasOverlap(normalized.sectorFocus, resolveFundSectors(fund))) return false;
  if (!hasOverlap(normalized.stageFocus, resolveFundStages(fund))) return false;
  if (!hasOverlap(normalized.geographies, resolveFundGeographies(fund))) return false;

  if (normalized.riskTolerance !== DEFAULT_PROFILE_RISK_TOLERANCE) {
    const userRiskRank = riskRank(normalized.riskTolerance);
    const fundRiskRank = riskRank(resolveFundRiskTolerance(fund));
    if (fundRiskRank > userRiskRank) return false;
  }

  if (hasCustomCheckRange(normalized)) {
    const checkRange = resolveFundCheckRangeM(fund);
    const fundRange = normalizeCheckRange(checkRange.minM, checkRange.maxM);
    const overlaps =
      normalized.checkSizeMinM <= fundRange.maxM &&
      normalized.checkSizeMaxM >= fundRange.minM;
    if (!overlaps) return false;
  }

  return true;
}

export function signalMatchesUserProfile(
  signal: Signal,
  fundById: Record<string, Fund>,
  profile: UserProfile | null | undefined
): boolean {
  if (!profileHasActiveSignalFeedFilters(profile)) return true;
  const fund = fundById[signal.fundId];
  return fundMatchesUserProfile(fund, profile);
}

export function claimMatchesUserProfile(
  claim: NewsClaim,
  fundById: Record<string, Fund>,
  profile: UserProfile | null | undefined
): boolean {
  if (!profileHasActiveSignalFeedFilters(profile)) return true;
  if (!Array.isArray(claim.linkedFundIds) || !claim.linkedFundIds.length) return false;
  return claim.linkedFundIds.some((fundId) => fundMatchesUserProfile(fundById[fundId], profile));
}
