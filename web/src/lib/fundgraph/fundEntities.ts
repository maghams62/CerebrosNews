import { Fund } from "@/lib/fundgraph/types";

export function normalizeMatchText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniq(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function fundStageList(fund: Fund): string[] {
  return uniq([...(fund.stageFocus ?? []), ...(fund.stages ?? [])]);
}

export function fundSectorList(fund: Fund): string[] {
  return uniq([...(fund.sectorFocus ?? []), ...(fund.sectors ?? [])]);
}

export function fundGeoList(fund: Fund): string[] {
  return uniq([...(fund.geoFocus ?? []), ...(fund.geographies ?? [])]);
}

export function fundMomentumScore(fund: Fund): number {
  if (typeof fund.metrics?.trendScore === "number") return fund.metrics.trendScore;
  if (typeof fund.momentumScore === "number") return fund.momentumScore;
  return 0;
}

export function fundCommunityScore(fund: Fund): number {
  if (typeof fund.metrics?.communityTrust === "number") return fund.metrics.communityTrust;
  if (typeof fund.communityScore === "number") return fund.communityScore;
  return 0;
}

export function fundCheckSizeRangeM(fund: Fund): { min: number; max: number } {
  if (typeof fund.checkSizeMinM === "number" && typeof fund.checkSizeMaxM === "number") {
    return {
      min: fund.checkSizeMinM,
      max: fund.checkSizeMaxM,
    };
  }

  return {
    min: (fund.checkSizeKUsd?.min ?? 0) / 1000,
    max: (fund.checkSizeKUsd?.max ?? 0) / 1000,
  };
}

export function fundGpRecords(fund: Fund): Array<{ id: string; name: string }> {
  const gps = Array.isArray(fund.gps) ? fund.gps : [];
  const fromObjects = gps
    .map((gp) => ({ id: gp.id ?? `${fund.id}_gp_${normalizeMatchText(gp.name).replace(/\s+/g, "-")}`, name: gp.name }))
    .filter((entry) => Boolean(entry.name));

  const fromNames = (fund.gpNames ?? []).map((name, idx) => ({
    id: `${fund.id}_gp_${idx + 1}`,
    name,
  }));

  return [...fromObjects, ...fromNames];
}

export function fundCompanyRecords(fund: Fund): Array<{ id: string; name: string }> {
  const companies = Array.isArray(fund.portfolio) ? fund.portfolio : [];
  const fromNames = companies.map((name, idx) => ({
      id: `${fund.id}_co_${idx + 1}`,
      name: String(name),
    }));

  return fromNames;
}
