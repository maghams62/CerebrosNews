import { getFundGraphData } from "@/lib/fundgraph/data";
import { buildFundEdges } from "@/lib/fundgraph/graph/buildEdges";
import { fundCompanyRecords, fundGeoList, fundGpRecords, fundMomentumScore, fundSectorList, fundStageList } from "@/lib/fundgraph/fundEntities";
import { createId } from "@/lib/fundgraph/ids";
import { rankFunds } from "@/lib/fundgraph/recommendation/rankFunds";
import { getFundgraphDataMode } from "@/lib/fundgraph/config";
import { readSeedGraphEdges } from "@/lib/fundgraph/seed";
import { readFunds, readGraphEdges } from "@/lib/fundgraph/storage";
import { addSignal } from "@/lib/fundgraph/store";
import { curateSignalsForFeed, sanitizeFundForDisplay } from "@/lib/fundgraph/quality";
import { Fund, FundFilters, FundGraphDataMode, FundGraphView, GraphNode, Signal, SignalFilters, UserProfile } from "@/lib/fundgraph/types";

export interface CreateSignalInput {
  fundId: string;
  title: string;
  summary: string;
  confidence: number;
  author?: string;
  tags?: string[];
  evidenceUrl?: string;
  evidenceSnippet?: string;
}

function normalizeText(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function limitNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function matchesFilter(candidate: string[], filter?: string): boolean {
  if (!filter) return true;
  const needle = normalizeText(filter);
  return candidate.map((value) => normalizeText(value)).some((value) => value === needle);
}

function normalizeProfile(profile: Partial<UserProfile> | undefined): UserProfile {
  const geographyFocus = Array.isArray(profile?.geographyFocus)
    ? profile?.geographyFocus
    : Array.isArray(profile?.geographies)
      ? profile?.geographies
      : [];

  const checkSizeMinM = typeof profile?.checkSizeMinM === "number" ? profile.checkSizeMinM : 0.5;
  const checkSizeMaxM = typeof profile?.checkSizeMaxM === "number" ? profile.checkSizeMaxM : 10;
  const typicalCheckSizeM =
    typeof profile?.typicalCheckSizeM === "number"
      ? profile.typicalCheckSizeM
      : typeof profile?.typicalCheckSizeKUsd === "number"
        ? profile.typicalCheckSizeKUsd / 1000
        : (checkSizeMinM + checkSizeMaxM) / 2;

  return {
    id: profile?.id,
    userId: profile?.userId ?? profile?.id ?? "anon",
    sectorFocus: Array.isArray(profile?.sectorFocus) ? profile.sectorFocus : [],
    stageFocus: Array.isArray(profile?.stageFocus) ? profile.stageFocus : [],
    geographyFocus,
    geographies: geographyFocus,
    riskTolerance: profile?.riskTolerance ?? "medium",
    checkSizeMinM,
    checkSizeMaxM,
    typicalCheckSizeM,
    typicalCheckSizeKUsd: Math.max(10, Math.round(typicalCheckSizeM * 1000)),
    thesisKeywords: Array.isArray(profile?.thesisKeywords) ? profile.thesisKeywords : [],
    updatedAt: profile?.updatedAt ?? new Date().toISOString(),
    weights: profile?.weights,
  };
}

function sortFunds(funds: Fund[], sort: FundFilters["sort"]): Fund[] {
  const next = [...funds];
  if (sort === "aum") {
    next.sort((a, b) => (b.aumM ?? b.aumUsdM ?? 0) - (a.aumM ?? a.aumUsdM ?? 0));
    return next;
  }
  if (sort === "recent") {
    next.sort((a, b) => (b.vintageYear ?? 0) - (a.vintageYear ?? 0));
    return next;
  }
  next.sort((a, b) => fundMomentumScore(b) - fundMomentumScore(a));
  return next;
}

function normalizeSignalInput(input: CreateSignalInput): CreateSignalInput {
  return {
    fundId: String(input.fundId || "").trim(),
    title: String(input.title || "").trim(),
    summary: String(input.summary || "").trim(),
    confidence: clamp(Number(input.confidence), 0, 1),
    author: String(input.author || "Community Member").trim() || "Community Member",
    tags: Array.isArray(input.tags)
      ? input.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 8)
      : [],
    evidenceUrl: input.evidenceUrl ? String(input.evidenceUrl).trim() : undefined,
    evidenceSnippet: input.evidenceSnippet ? String(input.evidenceSnippet).trim() : undefined,
  };
}

function validateSignalInput(input: CreateSignalInput): string | null {
  if (!input.fundId) return "missing_fund_id";
  if (!input.title || input.title.length < 5) return "invalid_title";
  if (!input.summary || input.summary.length < 12) return "invalid_summary";
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) return "invalid_confidence";
  return null;
}

function toSignal(input: CreateSignalInput): Signal {
  return {
    id: createId("fg-signal"),
    fundId: input.fundId,
    title: input.title,
    summary: input.summary,
    confidence: Number(input.confidence.toFixed(2)),
    upvotes: 0,
    bullishCount: 0,
    neutralCount: 0,
    bearishCount: 0,
    verifiedCount: 0,
    verifies: 0,
    disagrees: 0,
    commentsCount: 0,
    authorName: input.author ?? "Community Member",
    userId: input.author,
    createdAt: new Date().toISOString(),
    evidence:
      input.evidenceUrl || input.evidenceSnippet
        ? {
            url: input.evidenceUrl,
            snippet: input.evidenceSnippet,
          }
        : undefined,
    evidenceUrl: input.evidenceUrl,
    evidenceSnippet: input.evidenceSnippet,
    tags: input.tags ?? [],
    source: "community",
  };
}

function graphNodesForFund(fund: Fund, signals: Signal[]): GraphNode[] {
  const nodes: GraphNode[] = [
    {
      id: fund.id,
      type: "fund",
      label: fund.name,
      meta: {
        aumM: fund.aumM,
        trendScore: fund.trendScore ?? fund.metrics?.trendScore ?? 0,
        sectors: fundSectorList(fund),
        stages: fundStageList(fund),
      },
    },
  ];

  for (const gp of fundGpRecords(fund)) {
    nodes.push({ id: gp.id, type: "gp", label: gp.name });
  }

  for (const company of fundCompanyRecords(fund)) {
    nodes.push({ id: company.id, type: "portfolio", label: company.name });
  }

  for (const signal of signals) {
    nodes.push({
      id: signal.id,
      type: "signal",
      label: signal.title,
      meta: {
        confidence: signal.confidence,
        verifies: signal.verifies,
        disagrees: signal.disagrees,
      },
    });
  }

  return nodes;
}

export async function getFundgraphSnapshot(): Promise<{
  mode: FundGraphDataMode;
  funds: Fund[];
  signals: Signal[];
}> {
  const data = await getFundGraphData();
  return {
    mode: data.mode,
    funds: data.funds,
    signals: data.signals,
  };
}

export async function listFunds(filters?: FundFilters): Promise<{ mode: string; funds: Fund[] }> {
  const snapshot = await getFundgraphSnapshot();
  const sort = filters?.sort ?? "trending";
  const limit = limitNumber(filters?.limit, 50, 1, 1000);
  const q = normalizeText(filters?.q ?? "");

  let funds = snapshot.funds.map(sanitizeFundForDisplay);
  if (q) {
    funds = funds.filter((fund) => {
      const text = normalizeText(
        [
          fund.name,
          fund.headquarters ?? fund.hq ?? "",
          fund.strategy ?? "",
          fund.description ?? "",
          ...fundSectorList(fund),
          ...fundStageList(fund),
          ...fundGeoList(fund),
          ...fundGpRecords(fund).map((gp) => gp.name),
          ...fundCompanyRecords(fund).map((company) => company.name),
        ].join(" ")
      );
      return text.includes(q);
    });
  }

  if (filters?.sector) funds = funds.filter((fund) => matchesFilter(fundSectorList(fund), filters.sector));
  if (filters?.stage) funds = funds.filter((fund) => matchesFilter(fundStageList(fund), filters.stage));
  if (filters?.geo) funds = funds.filter((fund) => matchesFilter(fundGeoList(fund), filters.geo));

  funds = sortFunds(funds, sort).slice(0, limit);

  return {
    mode: snapshot.mode,
    funds,
  };
}

export async function listSignals(filters?: SignalFilters): Promise<{ mode: string; signals: Signal[] }> {
  const snapshot = await getFundgraphSnapshot();
  const limit = limitNumber(filters?.limit, 80, 1, 1000);
  const q = normalizeText(filters?.q ?? "");

  let signals = [...snapshot.signals];
  if (filters?.fundId) signals = signals.filter((signal) => signal.fundId === filters.fundId);
  if (q) {
    signals = signals.filter((signal) => {
      const text = normalizeText([signal.title, signal.summary, ...(signal.tags ?? [])].join(" "));
      return text.includes(q);
    });
  }

  signals = curateSignalsForFeed(signals, {
    maxPerFund: filters?.fundId ? 0 : 5,
    surface: filters?.fundId ? "fund" : "global",
  });
  signals.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  return {
    mode: snapshot.mode,
    signals: signals.slice(0, limit),
  };
}

export async function createSignal(raw: CreateSignalInput): Promise<{ mode: string; signal: Signal }> {
  const snapshot = await getFundgraphSnapshot();
  const input = normalizeSignalInput(raw);
  const validation = validateSignalInput(input);
  if (validation) throw new Error(validation);

  const fund = snapshot.funds.find((item) => item.id === input.fundId);
  if (!fund) throw new Error("fund_not_found");

  const signal = toSignal(input);
  signal.tags = signal.tags?.length ? signal.tags : fundSectorList(fund).slice(0, 2);

  const stored = await addSignal(signal);

  return {
    mode: snapshot.mode,
    signal: stored,
  };
}

export async function getRecommendations(
  profile: Partial<UserProfile> | undefined,
  options?: { limit?: number }
): Promise<{
  mode: string;
  profile: UserProfile;
  recommendations: Array<{ fund: Fund; score: number; reasons: string[]; reason: string; explanation: string }>;
}> {
  const funds = await readFunds();
  const limit = limitNumber(options?.limit, 12, 1, 50);
  const normalizedProfile = normalizeProfile(profile);
  const ranked = await rankFunds(normalizedProfile, { limit, includeLlmExplanation: false });
  const fundById = new Map(funds.map((fund) => [fund.id, fund]));
  const recommendations = ranked
    .map((entry) => {
      const fund = fundById.get(entry.fundId);
      if (!fund) return null;
      return {
        fund,
        score: entry.score,
        reason: entry.reason,
        reasons: [entry.reason],
        explanation: entry.explanation ?? entry.reason,
      };
    })
    .filter((entry): entry is { fund: Fund; score: number; reasons: string[]; reason: string; explanation: string } => Boolean(entry));

  const fallbackRecommendations =
    recommendations.length > 0
      ? recommendations
      : funds.slice(0, limit).map((fund) => ({
          fund,
          score: 0.5,
          reason: "Fallback recommendation based on available fund coverage.",
          reasons: ["Fallback recommendation based on available fund coverage."],
          explanation: "Fallback recommendation based on available fund coverage.",
        }));

  return {
    mode: getFundgraphDataMode(),
    profile: normalizedProfile,
    recommendations: fallbackRecommendations,
  };
}

export async function getFundGraphView(fundId: string): Promise<{ mode: string; graph: FundGraphView | null }> {
  const snapshot = await getFundGraphData();
  const fund = snapshot.funds.find((item) => item.id === fundId);
  if (!fund) {
    return { mode: snapshot.mode, graph: null };
  }

  const fundSignals = snapshot.signals
    .filter((signal) => signal.fundId === fundId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 24);

  const linkedClaims = snapshot.claims.filter((claim) => claim.linkedFundIds.includes(fundId));

  const seededEdges = await readGraphEdges();
  const fallbackSeedEdges = seededEdges.length ? seededEdges : await readSeedGraphEdges();
  const usedEdgeIds = new Set<string>();
  const edges = fallbackSeedEdges.filter((edge) => {
    if (edge.fromId === fundId || edge.toId === fundId) {
      usedEdgeIds.add(edge.id);
      return true;
    }
    return false;
  });

  for (const edge of buildFundEdges(fund, fundSignals, linkedClaims)) {
    if (usedEdgeIds.has(edge.id)) continue;
    edges.push(edge);
    usedEdgeIds.add(edge.id);
  }

  return {
    mode: snapshot.mode,
    graph: {
      fundId,
      nodes: graphNodesForFund(fund, fundSignals),
      edges,
    },
  };
}
