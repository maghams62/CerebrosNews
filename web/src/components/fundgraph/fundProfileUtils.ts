import { Fund, FundPortfolioMetrics, Signal } from "@/fundgraph/types";

export type FundDiscussionItem = {
  id: string;
  user: string;
  comment: string;
  timestamp: string;
  votes: number;
  seeded?: boolean;
  signalId?: string;
};

type CompanyBadgeStyle = {
  accent: string;
  tint: string;
  token: string;
};

const COMPANY_STYLES: Record<string, CompanyBadgeStyle> = {
  openai: { accent: "#111827", tint: "#e5e7eb", token: "OA" },
  perplexity: { accent: "#1d4ed8", tint: "#dbeafe", token: "PX" },
  "scale ai": { accent: "#b91c1c", tint: "#fee2e2", token: "SA" },
  cognition: { accent: "#0f766e", tint: "#ccfbf1", token: "CG" },
  stripe: { accent: "#4c1d95", tint: "#ede9fe", token: "ST" },
  anthropic: { accent: "#7c2d12", tint: "#ffedd5", token: "AN" },
  ramp: { accent: "#166534", tint: "#dcfce7", token: "RP" },
  vercel: { accent: "#111827", tint: "#f3f4f6", token: "VC" },
  figma: { accent: "#be123c", tint: "#ffe4e6", token: "FG" },
  databricks: { accent: "#b91c1c", tint: "#fee2e2", token: "DB" },
  linear: { accent: "#3730a3", tint: "#e0e7ff", token: "LN" },
};

const DEFAULT_ACCENTS = ["#0f766e", "#1d4ed8", "#374151", "#7c3aed", "#be123c", "#0f172a"];
const DEFAULT_TINTS = ["#ccfbf1", "#dbeafe", "#f1f5f9", "#ede9fe", "#ffe4e6", "#e2e8f0"];
function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pick<T>(list: T[], seed: string): T {
  return list[stableHash(seed) % list.length] as T;
}

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
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

export function fundTypeLabel(fund: Fund): string {
  if (fund.fundType?.trim()) return fund.fundType.trim();
  const sector = fund.sectorFocus?.[0] ?? fund.sectors[0] ?? "AI";
  const stage = fund.stageFocus?.[0] ?? fund.stages[0] ?? "Seed";
  return `${sector} ${stage} Fund`;
}

export function stageFocusLabel(fund: Fund): string {
  const stages = (fund.stageFocus?.length ? fund.stageFocus : fund.stages) ?? [];
  return stages.join(" / ");
}

export function geoFocusLabel(fund: Fund): string {
  const geos = (fund.geoFocus?.length ? fund.geoFocus : fund.geography) ?? [];
  return geos.join(", ");
}

export function sectorFocusLabel(fund: Fund): string {
  const sectors = (fund.sectorFocus?.length ? fund.sectorFocus : fund.sectors) ?? [];
  return sectors.join(", ");
}

export function checkSizeLabel(fund: Fund): string {
  return `$${fund.checkSizeMinM.toFixed(1)}M-$${fund.checkSizeMaxM.toFixed(1)}M`;
}

export function fundMetrics(fund: Fund): FundPortfolioMetrics {
  if (fund.portfolioMetrics) {
    return {
      portfolioSize: fund.portfolioMetrics.portfolioSize || fund.portfolio.length,
      leadInvestmentRate: fund.portfolioMetrics.leadInvestmentRate,
      followOnRate: fund.portfolioMetrics.followOnRate,
      topExits: fund.portfolioMetrics.topExits ?? [],
    };
  }

  const base = stableHash(fund.id);
  return {
    portfolioSize: fund.portfolio.length ? Math.max(fund.portfolio.length, 20 + (base % 18)) : 20 + (base % 18),
    leadInvestmentRate: 48 + (base % 30),
    followOnRate: 38 + ((base >> 2) % 26),
    topExits: [pick(["Datadog", "Figma", "Cloudflare", "MongoDB"], `${fund.id}:exit:1`), pick(["Snowflake", "Twilio", "Nubank", "GitHub"], `${fund.id}:exit:2`)],
  };
}

export function companyBadgeStyle(name: string): CompanyBadgeStyle {
  const key = name.trim().toLowerCase();
  const exact = COMPANY_STYLES[key];
  if (exact) return exact;

  const hash = stableHash(key || "company");
  const words = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);
  const token = words.slice(0, 2).map((part) => part[0]).join("").toUpperCase().slice(0, 2) || "CO";
  return {
    accent: DEFAULT_ACCENTS[hash % DEFAULT_ACCENTS.length] as string,
    tint: DEFAULT_TINTS[hash % DEFAULT_TINTS.length] as string,
    token,
  };
}

export function initialsFromName(name: string): string {
  return name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "GP";
}

export function fundDiscussionItems(_fund: Fund, signals: Signal[]): FundDiscussionItem[] {
  const hasDisplaySignals = signals.some((signal) => signal.qualityTier === "ALIGNED" || signal.qualityTier === "WARNING");
  if (!hasDisplaySignals) return [];
  return [];
}

export function graphPreviewData(fund: Fund): {
  companies: string[];
  coInvestors: string[];
  founders: string[];
} {
  const companies = uniq(fund.portfolio).slice(0, 4);
  const coInvestors = uniq(fund.coInvestors ?? []).slice(0, 3);
  const founders = uniq(fund.founders ?? []).slice(0, 3);
  return { companies, coInvestors, founders };
}

export function confidenceLabel(confidence: number): "High" | "Medium" | "Low" {
  if (confidence >= 0.78) return "High";
  if (confidence >= 0.62) return "Medium";
  return "Low";
}
