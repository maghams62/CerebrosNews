import fundsJson from "@/lib/fundgraph/seed/funds.json";
import signalsJson from "@/lib/fundgraph/seed/signals.json";
import graphEdgesJson from "@/lib/fundgraph/seed/graph_edges.json";
import { normalizeDealFactsForFund } from "@/lib/fundgraph/dealFacts";
import { dedupeSignals } from "@/lib/fundgraph/signalDedup";
import { Fund, GraphEdge, Signal } from "@/lib/fundgraph/types";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toFundStage(value: string): string {
  if (value === "Pre-Seed" || value === "Seed" || value === "Series A" || value === "Series B+" || value === "Growth") {
    return value;
  }
  return "Seed";
}

function toFundCategory(value: string): string {
  const allowed = new Set<string>([
    "AI",
    "Developer Tools",
    "Fintech",
    "Cloud",
    "Security",
    "Climate",
    "Bio",
    "Consumer",
    "Enterprise",
    "Web3",
    "Data Infrastructure",
    "Robotics",
    "Health",
    "Semiconductors",
    "Defense",
    "Other",
  ]);
  return allowed.has(value) ? value : "Other";
}

function normalizeFund(raw: Partial<Fund>, idx: number): Fund {
  const stages: Fund["stages"] = (
    Array.isArray(raw.stages)
      ? raw.stages.map((entry) => toFundStage(String(entry)))
      : ["Seed"]
  ) as Fund["stages"];
  const sectors: Fund["sectors"] = (
    Array.isArray(raw.sectors)
      ? raw.sectors.map((entry) => toFundCategory(String(entry)))
      : ["Other"]
  ) as Fund["sectors"];
  const geography = Array.isArray(raw.geography)
    ? raw.geography.map(String)
    : Array.isArray(raw.geographies)
      ? raw.geographies.map(String)
      : ["US"];

  const checkSizeMinM = typeof raw.checkSizeMinM === "number" ? raw.checkSizeMinM : 0.5;
  const checkSizeMaxM = typeof raw.checkSizeMaxM === "number" ? raw.checkSizeMaxM : 8;

  const gpName =
    raw.gp?.name || (Array.isArray(raw.gpNames) && raw.gpNames[0]) || `Partner ${(idx % 9) + 1}`;

  const portfolio = Array.isArray(raw.portfolio) ? raw.portfolio.map(String).filter(Boolean) : [];
  const portfolioSize = typeof raw.portfolioMetrics?.portfolioSize === "number" ? raw.portfolioMetrics.portfolioSize : portfolio.length;
  const leadInvestmentRate =
    typeof raw.portfolioMetrics?.leadInvestmentRate === "number"
      ? raw.portfolioMetrics.leadInvestmentRate
      : 48 + (idx % 28);
  const followOnRate =
    typeof raw.portfolioMetrics?.followOnRate === "number"
      ? raw.portfolioMetrics.followOnRate
      : 36 + (idx % 24);
  const topExits = Array.isArray(raw.portfolioMetrics?.topExits)
    ? raw.portfolioMetrics.topExits.map(String).filter(Boolean)
    : [];

  const fund: Fund = {
    id: String(raw.id ?? `fund-${idx + 1}`),
    name: String(raw.name ?? `Fund ${idx + 1}`),
    slug: String(raw.slug ?? `fund-${idx + 1}`),
    officialUrl: raw.officialUrl,
    entityType: raw.entityType,
    aliases: Array.isArray(raw.aliases) ? raw.aliases.map(String).filter(Boolean) : undefined,
    description: String(raw.description ?? "Synthetic fund profile"),
    headquarters: String(raw.headquarters ?? raw.hq ?? "San Francisco, US"),
    geography,
    geographies: geography,
    stages,
    sectors,
    checkSizeMinM,
    checkSizeMaxM,
    checkSizeKUsd:
      raw.checkSizeKUsd && typeof raw.checkSizeKUsd.min === "number" && typeof raw.checkSizeKUsd.max === "number"
        ? raw.checkSizeKUsd
        : {
            min: Math.max(10, Math.round(checkSizeMinM * 1000)),
            max: Math.max(10, Math.round(checkSizeMaxM * 1000)),
          },
    aumM: typeof raw.aumM === "number" ? raw.aumM : typeof raw.aumUsdM === "number" ? raw.aumUsdM : 100,
    vintageYear: typeof raw.vintageYear === "number" ? raw.vintageYear : 2020,
    trendScore: typeof raw.trendScore === "number" ? raw.trendScore : raw.metrics?.trendScore ?? 60,
    momentumScore:
      typeof raw.momentumScore === "number"
        ? raw.momentumScore
        : typeof raw.metrics?.signalVelocity === "number"
          ? raw.metrics.signalVelocity
          : 60,
    communityScore:
      typeof raw.communityScore === "number"
        ? raw.communityScore
        : typeof raw.metrics?.communityTrust === "number"
          ? raw.metrics.communityTrust
          : 60,
    risk: raw.risk ?? raw.riskBand ?? "medium",
    gp: raw.gp ?? {
      name: gpName,
      title: "General Partner",
      bio: `${gpName} focuses on early-stage software and AI infrastructure.`,
    },
    gpNames: Array.isArray(raw.gpNames) && raw.gpNames.length ? raw.gpNames.map(String) : [gpName],
    portfolio,
    portfolioInvestments: Array.isArray(raw.portfolioInvestments) ? raw.portfolioInvestments : [],
    strategy: String(raw.strategy ?? raw.thesis ?? "Concentrated early-stage thesis with operator support."),
    fundType: raw.fundType ? String(raw.fundType) : undefined,
    portfolioMetrics: {
      portfolioSize,
      leadInvestmentRate,
      followOnRate,
      topExits,
    },
    coInvestors: Array.isArray(raw.coInvestors) ? raw.coInvestors.map(String).filter(Boolean) : [],
    founders: Array.isArray(raw.founders) ? raw.founders.map(String).filter(Boolean) : [],
    thesis: raw.thesis,
    hq: raw.hq,
    aumUsdM: raw.aumUsdM,
    dryPowderUsdM: raw.dryPowderUsdM,
    stageFocus: raw.stageFocus,
    sectorFocus: raw.sectorFocus,
    geoFocus: raw.geoFocus,
    riskBand: raw.riskBand,
    gps: raw.gps,
    metrics: raw.metrics,
    dataOrigin: raw.dataOrigin,
  };

  return {
    ...fund,
    portfolioInvestments: normalizeDealFactsForFund(fund),
  };
}

function normalizeSignal(raw: Partial<Signal>, idx: number): Signal {
  const verifies = typeof raw.verifies === "number" ? raw.verifies : typeof raw.verifiedCount === "number" ? raw.verifiedCount : 0;
  const disagrees = typeof raw.disagrees === "number" ? raw.disagrees : 0;
  const bullishCount = typeof raw.bullishCount === "number" ? raw.bullishCount : typeof raw.upvotes === "number" ? raw.upvotes : 0;
  const neutralCount = typeof raw.neutralCount === "number" ? raw.neutralCount : 0;
  const bearishCount = typeof raw.bearishCount === "number" ? raw.bearishCount : 0;
  const evidence = raw.evidence ??
    (raw.evidenceUrl || raw.evidenceSnippet
      ? {
          url: raw.evidenceUrl,
          snippet: raw.evidenceSnippet,
        }
      : undefined);

  return {
    id: String(raw.id ?? `signal-${idx + 1}`),
    fundId: String(raw.fundId ?? "fund-1"),
    title: String(raw.title ?? `Signal ${idx + 1}`),
    summary: String(raw.summary ?? "Signal summary"),
    confidence: typeof raw.confidence === "number" ? raw.confidence : 0.6,
    upvotes: bullishCount,
    bullishCount,
    neutralCount,
    bearishCount,
    verifiedCount: typeof raw.verifiedCount === "number" ? raw.verifiedCount : verifies,
    verifies,
    disagrees,
    commentsCount: typeof raw.commentsCount === "number" ? raw.commentsCount : 0,
    authorName: String(raw.authorName ?? raw.userId ?? "Community Member"),
    userId: raw.userId,
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    evidence,
    evidenceUrl: raw.evidenceUrl ?? evidence?.url,
    evidenceSnippet: raw.evidenceSnippet ?? evidence?.snippet,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    source: raw.source ?? "community",
    dataOrigin: raw.dataOrigin,
  };
}

export function loadSeedFunds(): Fund[] {
  return clone(fundsJson).map((item, idx) => normalizeFund(item as Partial<Fund>, idx));
}

export function loadSeedSignals(): Signal[] {
  return dedupeSignals(clone(signalsJson).map((item, idx) => normalizeSignal(item as Partial<Signal>, idx)));
}

export function loadSeedGraphEdges(): GraphEdge[] {
  return clone(graphEdgesJson).map((item) => item as GraphEdge);
}
