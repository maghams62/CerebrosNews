import { Fund, UserProfile } from "@/lib/fundgraph/types";

function normalize(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((value) => value.trim().toLowerCase()).filter(Boolean);
}

function overlapScore(profileValues: string[] | undefined, fundValues: string[] | undefined): number {
  const profile = normalize(profileValues);
  if (!profile.length) return 0.45;
  const fund = new Set(normalize(fundValues));
  if (!fund.size) return 0;
  const hits = profile.filter((value) => fund.has(value)).length;
  return hits / Math.max(1, profile.length);
}

function stageRiskScore(stageFocus: string[] | undefined, riskTolerance: UserProfile["riskTolerance"]): number {
  const stage = new Set(normalize(stageFocus));
  if (!stage.size) return 0.6;

  const isEarly = stage.has("pre-seed") || stage.has("seed") || stage.has("series a");
  const isLate = stage.has("series b+") || stage.has("growth");

  if (riskTolerance === "high") return isEarly ? 1 : 0.55;
  if (riskTolerance === "low") return isLate ? 1 : 0.55;
  return 0.75;
}

function checkSizeScore(targetKusd: number, minKusd: number, maxKusd: number): number {
  if (!targetKusd || targetKusd <= 0) return 0.5;
  if (targetKusd >= minKusd && targetKusd <= maxKusd) return 1;
  const distance = targetKusd < minKusd ? minKusd - targetKusd : targetKusd - maxKusd;
  const range = Math.max(1, maxKusd - minKusd);
  return Math.max(0, 1 - distance / (range * 2));
}

export function scoreFund(profile: UserProfile, fund: Fund): {
  score: number;
  parts: {
    sector: number;
    stage: number;
    geo: number;
    risk: number;
    check: number;
    momentum: number;
  };
} {
  const sector = overlapScore(profile.sectorFocus, fund.sectors);
  const stage = overlapScore(profile.stageFocus, fund.stages);
  const geo = overlapScore(profile.geographyFocus ?? profile.geographies, fund.geographies);
  const risk = stageRiskScore(profile.stageFocus, profile.riskTolerance);

  const typicalKUsd =
    typeof profile.typicalCheckSizeKUsd === "number"
      ? profile.typicalCheckSizeKUsd
      : typeof profile.typicalCheckSizeM === "number"
        ? profile.typicalCheckSizeM * 1000
        : typeof profile.checkSizeMinM === "number" && typeof profile.checkSizeMaxM === "number"
          ? ((profile.checkSizeMinM + profile.checkSizeMaxM) / 2) * 1000
          : 1000;

  const check = checkSizeScore(typicalKUsd, fund.checkSizeKUsd.min, fund.checkSizeKUsd.max);
  const momentum = Math.max(0, Math.min(1, (fund.momentumScore * 0.65 + fund.communityScore * 0.35) / 100));

  const score =
    sector * 0.26 +
    stage * 0.2 +
    geo * 0.16 +
    risk * 0.12 +
    check * 0.16 +
    momentum * 0.1;

  return {
    score: Number(score.toFixed(4)),
    parts: { sector, stage, geo, risk, check, momentum },
  };
}
