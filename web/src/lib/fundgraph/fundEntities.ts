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

const GEO_COUNTRY_MAP: Record<string, string> = {
  US: "US",
  USA: "US",
  "UNITED STATES": "US",
  UK: "Europe",
  "UNITED KINGDOM": "Europe",
  GB: "Europe",
  FR: "Europe",
  DE: "Europe",
  NL: "Europe",
  ES: "Europe",
  IT: "Europe",
  CH: "Europe",
  IE: "Europe",
  PT: "Europe",
  SE: "Europe",
  NO: "Europe",
  DK: "Europe",
  FI: "Europe",
  IN: "India",
  INDIA: "India",
  SG: "APAC",
  JP: "APAC",
  CN: "APAC",
  HK: "APAC",
  KR: "APAC",
  AU: "APAC",
  NZ: "APAC",
  TW: "APAC",
  ID: "APAC",
  MY: "APAC",
  TH: "APAC",
  VN: "APAC",
  PH: "APAC",
  BR: "LatAm",
  MX: "LatAm",
  AR: "LatAm",
  CL: "LatAm",
  CO: "LatAm",
  PE: "LatAm",
  UY: "LatAm",
};

function normalizeGeoLabel(value: string): string {
  const cleaned = value.trim();
  if (!cleaned) return "";
  const normalized = normalizeMatchText(cleaned);
  if (normalized === "us" || normalized === "usa" || normalized === "united states") return "US";
  if (normalized === "europe" || normalized === "eu") return "Europe";
  if (normalized === "india") return "India";
  if (normalized === "apac" || normalized === "asia pacific") return "APAC";
  if (normalized === "latam" || normalized === "latin america" || normalized === "latin american") return "LatAm";
  if (normalized === "middle east" || normalized === "mea") return "Middle East";
  return cleaned;
}

function geoFromHeadquarters(headquarters: string | undefined): string[] {
  const raw = String(headquarters ?? "").trim();
  if (!raw) return [];
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return [];
  const countryToken = parts[parts.length - 1]?.toUpperCase();
  if (!countryToken) return [];
  const geo = GEO_COUNTRY_MAP[countryToken];
  return geo ? [geo] : [];
}

export function fundStageList(fund: Fund): string[] {
  return uniq([...(fund.stageFocus ?? []), ...(fund.stages ?? [])]);
}

export function fundSectorList(fund: Fund): string[] {
  return uniq([...(fund.sectorFocus ?? []), ...(fund.sectors ?? [])]);
}

export function fundGeoList(fund: Fund): string[] {
  const fromHq = geoFromHeadquarters(fund.headquarters ?? fund.hq);
  if (fromHq.length) return uniq(fromHq);
  return uniq([...(fund.geoFocus ?? []), ...(fund.geography ?? []), ...(fund.geographies ?? [])].map(normalizeGeoLabel).filter(Boolean));
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
