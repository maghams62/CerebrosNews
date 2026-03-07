import {
  GraphAnalyzerFilters,
  GraphAnalyzerData,
  GraphAnalyzerEdge,
  GraphAnalyzerNode,
  GraphAnalyzerPresetId,
  GraphAnalyzerQueryResult,
  GraphTimelineRange,
  GraphDisplayOptions,
  GraphDisplayResult,
  PortfolioOverlapConfig,
} from "@/components/fundgraph/graphAnalyzer/types";
import { citationCountForDealFact, dealFactByCompanyName, isDealFactVerified } from "@/lib/fundgraph/dealFacts";
import { getPortfolioCompanyProfile, sanitizePortfolioCompanyName } from "@/lib/fundgraph/fundEntityProfiles";
import { Fund, Signal } from "@/lib/fundgraph/types";

const MAX_THEME_SIGNALS = 280;
const MAX_DIFFUSION_SIGNALS = 320;
const MAX_CONTEXT_PORTFOLIO_PER_FUND = 64;
const MAX_PROFILE_FOUNDERS_PER_COMPANY = 2;

const INVESTED_IN = "INVESTED_IN" as const;
const FOUNDED = "FOUNDED" as const;
const MENTIONS = "MENTIONS" as const;
const SUPPORTED_BY = "SUPPORTED_BY" as const;
const CO_INVESTED = "CO_INVESTED" as const;
const CONTRADICTS = "CONTRADICTS" as const;

const GRAPH_NOISE_COMPANY_TOKENS = new Set([
  "all",
  "announcement",
  "announcements",
  "capital",
  "cli",
  "founder",
  "funding",
  "insights",
  "investment",
  "map",
  "maps",
  "market",
  "newsroom",
  "now",
  "ops",
  "other",
  "practices",
  "series",
  "software",
  "stories",
  "story",
  "tech",
  "their",
  "themes",
  "this",
  "today",
  "topics",
  "we",
  "why",
]);

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function edgeCitationCount(edge: GraphAnalyzerEdge): number {
  const fromMeta = asNumber(edge.meta?.citationCount);
  if (fromMeta > 0) return fromMeta;
  if (!Array.isArray(edge.meta?.sourceRefs)) return 0;
  return edge.meta.sourceRefs.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object")).length;
}

function normalizeToken(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

function sanitizeCompanyLabel(raw: string): string | null {
  const cleaned = sanitizePortfolioCompanyName(raw);
  if (!cleaned) return null;

  const normalized = normalizeToken(cleaned);
  if (!normalized) return null;
  const tokens = normalized.split(" ").filter(Boolean);
  if (!tokens.length) return null;

  const badRatio = tokens.filter((token) => GRAPH_NOISE_COMPANY_TOKENS.has(token)).length / tokens.length;
  if (badRatio >= 0.5) return null;

  return cleaned;
}

function buildPortfolioCompanyLookup(funds: Fund[]): Set<string> {
  const lookup = new Set<string>();
  for (const fund of funds) {
    for (const company of fund.portfolio ?? []) {
      const cleaned = sanitizeCompanyLabel(company);
      if (!cleaned) continue;
      lookup.add(normalizeToken(cleaned));
    }
  }
  return lookup;
}

function acceptContextCompanyLabel(raw: string, portfolioLookup: Set<string>): string | null {
  const cleaned = sanitizeCompanyLabel(raw);
  if (!cleaned) return null;
  const key = normalizeToken(cleaned);
  if (portfolioLookup.has(key)) return cleaned;
  if (getPortfolioCompanyProfile(cleaned)) return cleaned;
  return null;
}

function slugify(input: string): string {
  return normalizeToken(input).replace(/\s+/g, "-");
}

function toFundNodeId(fundId: string): string {
  return `fund:${fundId}`;
}

function toCompanyNodeId(name: string): string {
  return `company:${slugify(name)}`;
}

function toPersonNodeId(name: string): string {
  return `person:${slugify(name)}`;
}

function toSignalNodeId(signalId: string): string {
  return `signal:${signalId}`;
}

function toThemeNodeId(theme: string): string {
  return `theme:${slugify(theme)}`;
}

function toSourceNodeId(raw: string): string {
  return `source:${slugify(raw)}`;
}

function titleCase(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function hashString(input: string): number {
  let hash = 0;
  for (let idx = 0; idx < input.length; idx += 1) {
    hash = (hash * 31 + input.charCodeAt(idx)) >>> 0;
  }
  return hash;
}

function parseDateMs(value: unknown): number | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

class GraphDraft {
  private readonly nodes = new Map<string, GraphAnalyzerNode>();
  private readonly edges = new Map<string, GraphAnalyzerEdge>();

  addNode(node: GraphAnalyzerNode): void {
    const existing = this.nodes.get(node.id);
    if (!existing) {
      this.nodes.set(node.id, node);
      return;
    }

    this.nodes.set(node.id, {
      ...existing,
      label: existing.label || node.label,
      meta: {
        ...(existing.meta ?? {}),
        ...(node.meta ?? {}),
      },
    });
  }

  addEdge(edge: GraphAnalyzerEdge): void {
    if (edge.source === edge.target) return;

    const undirected = edge.type === CO_INVESTED;
    const source = undirected ? [edge.source, edge.target].sort()[0] : edge.source;
    const target = undirected ? [edge.source, edge.target].sort()[1] : edge.target;
    const key = `${source}|${target}|${edge.type}`;

    const existing = this.edges.get(key);
    if (!existing) {
      this.edges.set(key, {
        ...edge,
        id: edge.id || key,
        source,
        target,
      });
      return;
    }

    this.edges.set(key, {
      ...existing,
      weight: Math.max(existing.weight ?? 0.4, edge.weight ?? 0.4),
      meta: {
        ...(existing.meta ?? {}),
        ...(edge.meta ?? {}),
      },
    });
  }

  data(): GraphAnalyzerData {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
    };
  }
}

function fundNode(fund: Fund): GraphAnalyzerNode {
  return {
    id: toFundNodeId(fund.id),
    type: "fund",
    label: fund.name,
    meta: {
      fundId: fund.id,
      slug: fund.slug,
      sectors: fund.sectors,
      stages: fund.stages,
      trendScore: fund.trendScore,
      momentumScore: fund.momentumScore,
      aumM: fund.aumM,
      portfolioCount: fund.portfolio.length,
    },
  };
}

function companyNode(companyName: string): GraphAnalyzerNode {
  return {
    id: toCompanyNodeId(companyName),
    type: "company",
    label: companyName,
    meta: {
      companyName,
    },
  };
}

function personNode(personName: string, fund?: Fund): GraphAnalyzerNode {
  return {
    id: toPersonNodeId(personName),
    type: "person",
    label: personName,
    meta: {
      personName,
      relatedFundId: fund?.id,
      relatedFundName: fund?.name,
      relatedFundSlug: fund?.slug,
    },
  };
}

function signalTrust(signal: Signal): { verifiedCount: number; disputedCount: number; confidence: number } {
  return {
    verifiedCount: signal.verifiedCount ?? signal.verifyCount ?? signal.verifies ?? 0,
    disputedCount: signal.disputedCount ?? signal.disagreeCount ?? signal.disagrees ?? 0,
    confidence: signal.confidence ?? 0,
  };
}

function scoreSignal(signal: Signal): number {
  const trust = signalTrust(signal);
  const ageMs = Date.now() - (parseDateMs(signal.createdAt) ?? Date.now());
  const agePenalty = Math.max(0, ageMs / (1000 * 60 * 60 * 24));
  return trust.confidence * 120 + trust.verifiedCount * 2 - trust.disputedCount * 3 - agePenalty * 0.08;
}

function sortSignals(signals: Signal[]): Signal[] {
  return [...signals].sort((left, right) => scoreSignal(right) - scoreSignal(left));
}

type ContextPortfolioMeta = {
  verified: boolean;
  citationCount: number;
  sourceRefs: unknown[];
};

type ContextPortfolioHints = {
  companiesByFundId: Map<string, string[]>;
  metaByPair: Map<string, ContextPortfolioMeta>;
};

function fromFundNodeId(nodeId: string): string | null {
  return nodeId.startsWith("fund:") ? nodeId.slice("fund:".length) : null;
}

function extractPortfolioHintsFromContextGraph(
  contextGraph: GraphAnalyzerData,
  portfolioLookup: Set<string>
): ContextPortfolioHints {
  const nodeById = new Map(contextGraph.nodes.map((node) => [node.id, node]));
  const scoreByPair = new Map<string, number>();
  const labelByPair = new Map<string, string>();
  const pairKeysByFund = new Map<string, Set<string>>();
  const metaByPair = new Map<string, ContextPortfolioMeta>();

  for (const edge of contextGraph.edges) {
    if (edge.type !== INVESTED_IN && edge.type !== MENTIONS) continue;

    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode) continue;

    const fundNode =
      sourceNode.type === "fund" ? sourceNode : targetNode.type === "fund" ? targetNode : null;
    const companyNode =
      sourceNode.type === "company" ? sourceNode : targetNode.type === "company" ? targetNode : null;
    if (!fundNode || !companyNode) continue;

    const fundId = fromFundNodeId(fundNode.id);
    const companyName = acceptContextCompanyLabel(String(companyNode.label ?? ""), portfolioLookup);
    if (!fundId || !companyName) continue;

    const normalizedCompanyKey = normalizeToken(companyName);
    if (!normalizedCompanyKey || normalizedCompanyKey.length < 2) continue;
    const pairKey = `${fundId}|${normalizedCompanyKey}`;
    const edgeScore = Math.max(0.2, asNumber(edge.weight) || 0.4) + edgeCitationCount(edge) * 0.45;
    scoreByPair.set(pairKey, (scoreByPair.get(pairKey) ?? 0) + edgeScore);
    labelByPair.set(pairKey, companyName);

    const fundPairKeys = pairKeysByFund.get(fundId) ?? new Set<string>();
    fundPairKeys.add(pairKey);
    pairKeysByFund.set(fundId, fundPairKeys);

    const companyId = toCompanyNodeId(companyName);
    const investmentPairKey = `${toFundNodeId(fundId)}|${companyId}`;
    const existingMeta = metaByPair.get(investmentPairKey);
    const sourceRefs = Array.isArray(edge.meta?.sourceRefs)
      ? edge.meta.sourceRefs.filter((ref): ref is Record<string, unknown> => Boolean(ref && typeof ref === "object"))
      : [];
    const citationCount = Math.max(edgeCitationCount(edge), existingMeta?.citationCount ?? 0);
    const verified = Boolean(edge.meta?.verified) || citationCount > 0 || Boolean(existingMeta?.verified);
    const mergedSourceRefs = [
      ...(existingMeta?.sourceRefs ?? []),
      ...sourceRefs,
    ].slice(0, 12);

    metaByPair.set(investmentPairKey, {
      verified,
      citationCount,
      sourceRefs: mergedSourceRefs,
    });
  }

  const companiesByFundId = new Map<string, string[]>();
  for (const [fundId, pairKeys] of pairKeysByFund.entries()) {
    const rankedPairs = Array.from(pairKeys).sort((left, right) => (scoreByPair.get(right) ?? 0) - (scoreByPair.get(left) ?? 0));
    const companies = rankedPairs
      .map((pairKey) => labelByPair.get(pairKey))
      .filter((label): label is string => Boolean(label))
      .slice(0, MAX_CONTEXT_PORTFOLIO_PER_FUND);
    companiesByFundId.set(fundId, companies);
  }

  return {
    companiesByFundId,
    metaByPair,
  };
}

function mergeCompanyLists(primary: string[], secondary: string[], portfolioLookup: Set<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const company of [...primary, ...secondary]) {
    const label = acceptContextCompanyLabel(String(company ?? ""), portfolioLookup);
    if (!label) continue;
    const key = normalizeToken(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out.slice(0, MAX_CONTEXT_PORTFOLIO_PER_FUND);
}

function allCompaniesByFund(funds: Fund[], contextGraph?: GraphAnalyzerData): Map<string, string[]> {
  const portfolioLookup = buildPortfolioCompanyLookup(funds);
  const map = new Map<string, string[]>();
  for (const fund of funds) {
    map.set(fund.id, mergeCompanyLists(fund.portfolio ?? [], [], portfolioLookup));
  }

  if (contextGraph) {
    const hints = extractPortfolioHintsFromContextGraph(contextGraph, portfolioLookup);
    for (const fund of funds) {
      const existing = map.get(fund.id) ?? [];
      const fromContext = hints.companiesByFundId.get(fund.id) ?? [];
      map.set(fund.id, mergeCompanyLists(existing, fromContext, portfolioLookup));
    }
  }

  return map;
}

function buildFundResolver(funds: Fund[]): (fundRef: string | undefined) => Fund | undefined {
  const byId = new Map(funds.map((fund) => [fund.id, fund]));
  const bySlug = new Map(funds.map((fund) => [fund.slug, fund]));
  const byLegacyRef = new Map<string, Fund>();

  for (const fund of funds) {
    const ordinal = fund.id.match(/-(\d+)$/)?.[1];
    if (ordinal) {
      byLegacyRef.set(`fund-${ordinal}`, fund);
    }
  }

  return (fundRef: string | undefined) => {
    const key = fundRef?.trim();
    if (!key) return undefined;
    return byId.get(key) ?? bySlug.get(key) ?? byLegacyRef.get(key);
  };
}

type PortfolioBuildArtifacts = {
  companyToInvestors: Map<string, Set<string>>;
  investmentMetaByPair: Map<string, {
    verified: boolean;
    citationCount: number;
    amountMinM?: number;
    amountMaxM?: number;
    announcedAt?: string;
    roundStage?: string;
    sourceRefs: unknown[];
    checkType?: string;
  }>;
};

function addPortfolioEdges(
  draft: GraphDraft,
  funds: Fund[],
  options?: {
    portfolioByFund?: Map<string, string[]>;
    contextMetaByPair?: Map<string, ContextPortfolioMeta>;
  }
): PortfolioBuildArtifacts {
  const companyToInvestors = new Map<string, Set<string>>();
  const investmentMetaByPair = new Map<string, {
    verified: boolean;
    citationCount: number;
    amountMinM?: number;
    amountMaxM?: number;
    announcedAt?: string;
    roundStage?: string;
    sourceRefs: unknown[];
    checkType?: string;
  }>();

  for (const fund of funds) {
    const fundId = toFundNodeId(fund.id);
    const dealFactsByCompany = dealFactByCompanyName(fund);
    const companies = options?.portfolioByFund?.get(fund.id) ?? fund.portfolio;
    draft.addNode(fundNode(fund));

    for (const companyName of companies) {
      const companyId = toCompanyNodeId(companyName);
      const dealFact = dealFactsByCompany.get(companyName.toLowerCase());
      const contextMeta = options?.contextMetaByPair?.get(`${fundId}|${companyId}`);
      const citationCount = Math.max(dealFact ? citationCountForDealFact(dealFact) : 0, contextMeta?.citationCount ?? 0);
      const verified = dealFact ? isDealFactVerified(dealFact) : Boolean(contextMeta?.verified);
      const sourceRefs = [...(dealFact?.sourceRefs ?? []), ...(contextMeta?.sourceRefs ?? [])].slice(0, 16);
      draft.addNode(companyNode(companyName));
      draft.addEdge({
        id: `invested:${fund.id}:${companyId}`,
        source: fundId,
        target: companyId,
        type: INVESTED_IN,
        weight: dealFact ? 1 : contextMeta ? 0.78 : 0.7,
        meta: {
          fundId: fund.id,
          companyName,
          announcedAt: dealFact?.announcedAt,
          roundStage: dealFact?.roundStage,
          amountMinM: dealFact?.amountMinM,
          amountMaxM: dealFact?.amountMaxM,
          checkType: dealFact?.checkType,
          verified,
          citationCount,
          sourceRefs,
          metricSource: dealFact ? "deal_fact" : contextMeta ? "context_graph" : "fund_profile",
          metricEligible: true,
        },
      });
      investmentMetaByPair.set(`${fundId}|${companyId}`, {
        verified,
        citationCount,
        amountMinM: dealFact?.amountMinM,
        amountMaxM: dealFact?.amountMaxM,
        announcedAt: dealFact?.announcedAt,
        roundStage: dealFact?.roundStage,
        sourceRefs,
        checkType: dealFact?.checkType,
      });

      const investors = companyToInvestors.get(companyId) ?? new Set<string>();
      investors.add(fundId);
      companyToInvestors.set(companyId, investors);
    }
  }

  return {
    companyToInvestors,
    investmentMetaByPair,
  };
}

function addCoInvestEdges(
  draft: GraphDraft,
  companyToInvestors: Map<string, Set<string>>,
  investmentMetaByPair: Map<string, {
    verified: boolean;
    citationCount: number;
    amountMinM?: number;
    amountMaxM?: number;
    announcedAt?: string;
    roundStage?: string;
    sourceRefs: unknown[];
    checkType?: string;
  }>,
  options?: { minSharedCount?: number; maxEdges?: number }
): void {
  const pairCounts = new Map<string, { left: string; right: string; count: number; companies: string[] }>();

  for (const [companyId, investors] of companyToInvestors.entries()) {
    const investorList = Array.from(investors);
    for (let i = 0; i < investorList.length; i += 1) {
      for (let j = i + 1; j < investorList.length; j += 1) {
        const left = investorList[i];
        const right = investorList[j];
        const sorted = [left, right].sort();
        const key = `${sorted[0]}|${sorted[1]}`;
        const next = pairCounts.get(key) ?? { left: sorted[0], right: sorted[1], count: 0, companies: [] };
        next.count += 1;
        next.companies.push(companyId);
        pairCounts.set(key, next);
      }
    }
  }

  const minSharedCount = options?.minSharedCount ?? 1;
  const maxEdges = options?.maxEdges ?? 220;
  const rankedPairs = Array.from(pairCounts.values()).sort((left, right) => right.count - left.count);
  const thresholdPairs = rankedPairs.filter((pair) => pair.count >= minSharedCount);
  const selectedPairs = (thresholdPairs.length ? thresholdPairs : rankedPairs).slice(0, maxEdges);

  for (const { left, right, count, companies } of selectedPairs) {
    let verifiedSharedCount = 0;
    let citationCount = 0;
    const sharedStages = new Set<string>();
    const sharedSources = new Set<string>();

    for (const companyId of companies) {
      const leftMeta = investmentMetaByPair.get(`${left}|${companyId}`);
      const rightMeta = investmentMetaByPair.get(`${right}|${companyId}`);
      if (!leftMeta || !rightMeta) continue;
      if (leftMeta.verified && rightMeta.verified) {
        verifiedSharedCount += 1;
      }
      citationCount += leftMeta.citationCount + rightMeta.citationCount;
      if (leftMeta.roundStage) sharedStages.add(leftMeta.roundStage);
      if (rightMeta.roundStage) sharedStages.add(rightMeta.roundStage);
      for (const source of [...leftMeta.sourceRefs, ...rightMeta.sourceRefs]) {
        const sourceUrl = typeof (source as { url?: unknown }).url === "string" ? String((source as { url?: string }).url) : "";
        if (!sourceUrl) continue;
        sharedSources.add(sourceUrl);
      }
    }

    draft.addEdge({
      id: `coinvest:${left}:${right}`,
      source: left,
      target: right,
      type: CO_INVESTED,
      weight: Math.min(4, 0.6 + count * 0.4),
      meta: {
        sharedCount: count,
        sharedCompanies: companies,
        verified: verifiedSharedCount > 0,
        citationCount,
        verifiedSharedCount,
        sharedStages: Array.from(sharedStages),
        sourceRefs: Array.from(sharedSources).map((url, idx) => ({
          id: `coinvest-${left}-${right}-${idx + 1}`,
          url,
          title: "Shared deal citation",
          origin: "synthetic",
        })),
        metricSource: "co_invest_aggregate",
        metricEligible: true,
      },
    });
  }
}

function signalCompanyMatches(signal: Signal, companies: string[]): string[] {
  const text = normalizeToken(`${signal.title} ${signal.summary} ${(signal.tags ?? []).join(" ")}`);
  const matches = companies.filter((company) => {
    const token = normalizeToken(company);
    return token.length > 2 && text.includes(token);
  });

  if (matches.length) {
    return matches.slice(0, 3);
  }

  if (!companies.length) {
    return [];
  }

  const fallback = companies[hashString(signal.id) % companies.length];
  return [fallback];
}

function collectTopThemes(signals: Signal[]): string[] {
  const counts = new Map<string, number>();

  for (const signal of signals) {
    const tags = signal.tags?.length
      ? signal.tags
      : normalizeToken(signal.title)
          .split(" ")
          .filter((word) => word.length >= 4)
          .slice(0, 3);

    for (const rawTag of tags) {
      const key = normalizeToken(rawTag);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 24)
    .map(([tag]) => tag);
}

function addSignalNode(draft: GraphDraft, signal: Signal): string {
  const signalId = toSignalNodeId(signal.id);
  const trust = signalTrust(signal);

  draft.addNode({
    id: signalId,
    type: "signal",
    label: signal.title,
    meta: {
      signalId: signal.id,
      summary: signal.summary,
      createdAt: signal.createdAt,
      fundId: signal.fundId,
      confidence: trust.confidence,
      verifiedCount: trust.verifiedCount,
      disputedCount: trust.disputedCount,
      tags: signal.tags ?? [],
      evidenceUrl: signal.evidenceUrl,
      evidenceSnippet: signal.evidenceSnippet,
    },
  });

  return signalId;
}

function addSignalFundEdge(draft: GraphDraft, signal: Signal, signalId: string, fundId: string): void {
  const citationCount = signal.evidenceUrl ? 1 : 0;
  draft.addEdge({
    id: `signal-fund:${signalId}:${fundId}`,
    source: signalId,
    target: fundId,
    type: SUPPORTED_BY,
    weight: 0.9,
    meta: {
      verified: citationCount > 0,
      citationCount,
      sourceRefs: signal.evidenceUrl
        ? [
            {
              id: `signal-citation-${signal.id}`,
              url: signal.evidenceUrl,
              title: signal.title,
              snippet: signal.evidenceSnippet,
              origin: "synthetic",
            },
          ]
        : [],
      metricSource: "signal_evidence",
      metricEligible: true,
    },
  });
}

function addContradictEdgeIfNeeded(draft: GraphDraft, signal: Signal, signalId: string, fundId: string): void {
  const trust = signalTrust(signal);
  if (trust.disputedCount <= trust.verifiedCount) return;

  draft.addEdge({
    id: `contradicts:${signalId}:${fundId}`,
    source: signalId,
    target: fundId,
    type: CONTRADICTS,
    weight: 0.8,
    meta: {
      disputedCount: trust.disputedCount,
      verifiedCount: trust.verifiedCount,
    },
  });
}

function buildCoInvestmentGraph(funds: Fund[], contextGraph?: GraphAnalyzerData): GraphAnalyzerData {
  const draft = new GraphDraft();
  const portfolioLookup = buildPortfolioCompanyLookup(funds);
  const contextHints = contextGraph ? extractPortfolioHintsFromContextGraph(contextGraph, portfolioLookup) : null;
  const portfolioByFund = allCompaniesByFund(funds, contextGraph);
  const { companyToInvestors, investmentMetaByPair } = addPortfolioEdges(draft, funds, {
    portfolioByFund,
    contextMetaByPair: contextHints?.metaByPair,
  });
  addCoInvestEdges(draft, companyToInvestors, investmentMetaByPair, {
    minSharedCount: 2,
    maxEdges: 180,
  });
  return draft.data();
}

function buildFounderNetworkGraph(funds: Fund[], contextGraph?: GraphAnalyzerData): GraphAnalyzerData {
  const draft = new GraphDraft();
  const portfolioLookup = buildPortfolioCompanyLookup(funds);
  const contextHints = contextGraph ? extractPortfolioHintsFromContextGraph(contextGraph, portfolioLookup) : null;
  const portfolioByFund = allCompaniesByFund(funds, contextGraph);
  const { investmentMetaByPair } = addPortfolioEdges(draft, funds, {
    portfolioByFund,
    contextMetaByPair: contextHints?.metaByPair,
  });
  const founderCompanySeen = new Set<string>();

  for (const fund of funds) {
    const fundNodeId = toFundNodeId(fund.id);
    const companies = portfolioByFund.get(fund.id) ?? fund.portfolio;
    if (!companies.length) continue;

    for (const companyName of companies) {
      const profile = getPortfolioCompanyProfile(companyName);
      const founders =
        profile?.founders
          ?.map((name) => name.trim())
          .filter(Boolean)
          .slice(0, MAX_PROFILE_FOUNDERS_PER_COMPANY) ?? [];
      if (!founders.length) continue;

      const companyId = toCompanyNodeId(companyName);
      const investmentMeta = investmentMetaByPair.get(`${fundNodeId}|${companyId}`);
      const sourceRefs = profile?.url
        ? [
            {
              id: `company-profile:${slugify(companyName)}`,
              url: profile.url,
              title: `${companyName} company profile`,
              origin: "synthetic",
            },
          ]
        : [];

      for (const founderName of founders) {
        const pairKey = `${normalizeToken(founderName)}|${normalizeToken(companyName)}`;
        if (!pairKey || founderCompanySeen.has(pairKey)) continue;
        founderCompanySeen.add(pairKey);

        const personId = toPersonNodeId(founderName);

        draft.addNode(personNode(founderName, fund));
        draft.addNode(companyNode(companyName));
        draft.addEdge({
          id: `founded:${personId}:${companyId}`,
          source: personId,
          target: companyId,
          type: FOUNDED,
          weight: 0.94,
          meta: {
            fundId: fund.id,
            fundName: fund.name,
            companyName,
            verified: investmentMeta?.verified ?? Boolean(profile?.url),
            citationCount: Math.max(investmentMeta?.citationCount ?? 0, sourceRefs.length ? 1 : 0),
            sourceRefs,
            metricSource: "company_profile",
            metricEligible: true,
          },
        });
      }
    }
  }

  return draft.data();
}

function buildThemeMapGraph(funds: Fund[], signals: Signal[], contextGraph: GraphAnalyzerData): GraphAnalyzerData {
  const draft = new GraphDraft();
  const resolveFund = buildFundResolver(funds);
  const portfolioByFund = allCompaniesByFund(funds, contextGraph);
  const allCompanies = Array.from(new Set(Array.from(portfolioByFund.values()).flat()));

  const resolvableSignals = signals.filter((signal) => Boolean(resolveFund(signal.fundId)));
  const rankedSignals = sortSignals(resolvableSignals).slice(0, MAX_THEME_SIGNALS);
  const topThemes = collectTopThemes(rankedSignals);
  const topThemeSet = new Set(topThemes);

  for (const tag of topThemes) {
    const themeId = toThemeNodeId(tag);
    draft.addNode({
      id: themeId,
      type: "theme",
      label: titleCase(tag),
      meta: {
        theme: tag,
      },
    });
  }

  for (const signal of rankedSignals) {
    const signalId = addSignalNode(draft, signal);
    const fund = resolveFund(signal.fundId);
    if (!fund) continue;

    const fundId = toFundNodeId(fund.id);
    draft.addNode(fundNode(fund));
    addSignalFundEdge(draft, signal, signalId, fundId);
    addContradictEdgeIfNeeded(draft, signal, signalId, fundId);

    const tags = signal.tags?.length
      ? signal.tags.map((tag) => normalizeToken(tag)).filter((tag) => topThemeSet.has(tag))
      : [];
    const resolvedTags = tags.length ? tags : topThemes.slice(0, 1);

    for (const tag of resolvedTags.slice(0, 2)) {
      const themeId = toThemeNodeId(tag);
      draft.addNode({
        id: themeId,
        type: "theme",
        label: titleCase(tag),
        meta: {
          theme: tag,
        },
      });
      draft.addEdge({
        id: `theme-signal:${themeId}:${signalId}`,
        source: themeId,
        target: signalId,
        type: MENTIONS,
        weight: 0.7,
      });
    }

    const fundPortfolio = portfolioByFund.get(fund.id) ?? [];
    const matchedCompanies = signalCompanyMatches(signal, fundPortfolio.length ? fundPortfolio : allCompanies);

    for (const companyName of matchedCompanies.slice(0, 2)) {
      const companyId = toCompanyNodeId(companyName);
      draft.addNode(companyNode(companyName));
      draft.addEdge({
        id: `signal-company:${signalId}:${companyId}`,
        source: signalId,
        target: companyId,
        type: MENTIONS,
        weight: 0.8,
      });
      draft.addEdge({
        id: `fund-company:${fundId}:${companyId}`,
        source: fundId,
        target: companyId,
        type: INVESTED_IN,
        weight: 1,
      });
    }

    if (signal.evidenceUrl) {
      const sourceId = toSourceNodeId(signal.evidenceUrl);
      draft.addNode({
        id: sourceId,
        type: "source",
        label: signal.evidenceUrl,
        meta: {
          url: signal.evidenceUrl,
          createdAt: signal.createdAt,
          snippet: signal.evidenceSnippet,
        },
      });
      draft.addEdge({
        id: `source-signal:${sourceId}:${signalId}`,
        source: sourceId,
        target: signalId,
        type: SUPPORTED_BY,
        weight: 0.55,
        meta: {
          verified: true,
          citationCount: 1,
          sourceRefs: [
            {
              id: `source-signal-${signal.id}`,
              url: signal.evidenceUrl,
              title: signal.title,
              snippet: signal.evidenceSnippet,
              origin: "synthetic",
            },
          ],
          metricSource: "signal_evidence",
          metricEligible: true,
        },
      });
    }
  }

  for (const edge of contextGraph.edges) {
    if (edge.type !== SUPPORTED_BY) continue;
    const sourceNode = contextGraph.nodes.find((node) => node.id === edge.source);
    const targetNode = contextGraph.nodes.find((node) => node.id === edge.target);
    if (!sourceNode || !targetNode) continue;

    if ((sourceNode.type === "signal" && targetNode.type === "source") || (sourceNode.type === "source" && targetNode.type === "signal")) {
      draft.addNode(sourceNode);
      draft.addNode(targetNode);
      draft.addEdge(edge);
    }
  }

  return draft.data();
}

function buildPortfolioOverlapGraph(
  funds: Fund[],
  overlapConfig: PortfolioOverlapConfig,
  contextGraph?: GraphAnalyzerData
): GraphAnalyzerData {
  const left = funds.find((fund) => fund.id === overlapConfig.leftFundId);
  const right = funds.find((fund) => fund.id === overlapConfig.rightFundId);
  const draft = new GraphDraft();

  if (!left || !right) {
    return draft.data();
  }

  const portfolioByFund = allCompaniesByFund(funds, contextGraph);
  const leftPortfolio = portfolioByFund.get(left.id) ?? left.portfolio;
  const rightPortfolio = portfolioByFund.get(right.id) ?? right.portfolio;
  const leftCompanies = new Set(leftPortfolio.map((name) => normalizeToken(name)));
  const rightCompanies = new Set(rightPortfolio.map((name) => normalizeToken(name)));
  const shared = leftPortfolio.filter((companyName) => rightCompanies.has(normalizeToken(companyName)));

  draft.addNode({
    ...fundNode(left),
    meta: {
      ...(fundNode(left).meta ?? {}),
      overlapGroup: "left",
    },
  });
  draft.addNode({
    ...fundNode(right),
    meta: {
      ...(fundNode(right).meta ?? {}),
      overlapGroup: "right",
    },
  });

  const leftNodeId = toFundNodeId(left.id);
  const rightNodeId = toFundNodeId(right.id);

  if (shared.length) {
    for (const companyName of shared) {
      const companyId = toCompanyNodeId(companyName);
      draft.addNode({
        ...companyNode(companyName),
        meta: {
          ...(companyNode(companyName).meta ?? {}),
          overlapGroup: "shared",
        },
      });
      draft.addEdge({
        id: `overlap:${left.id}:${companyId}`,
        source: leftNodeId,
        target: companyId,
        type: INVESTED_IN,
        weight: 1,
      });
      draft.addEdge({
        id: `overlap:${right.id}:${companyId}`,
        source: rightNodeId,
        target: companyId,
        type: INVESTED_IN,
        weight: 1,
      });
    }
  } else {
    const fallbackLeft = leftPortfolio.slice(0, 3);
    const fallbackRight = rightPortfolio.slice(0, 3);

    for (const companyName of fallbackLeft) {
      const id = toCompanyNodeId(`${companyName}-left`);
      draft.addNode({
        id,
        type: "company",
        label: `${companyName} (left only)`,
        meta: { companyName, overlapGroup: "left" },
      });
      draft.addEdge({
        id: `left-only:${left.id}:${id}`,
        source: leftNodeId,
        target: id,
        type: INVESTED_IN,
        weight: 0.8,
      });
    }

    for (const companyName of fallbackRight) {
      const id = toCompanyNodeId(`${companyName}-right`);
      draft.addNode({
        id,
        type: "company",
        label: `${companyName} (right only)`,
        meta: { companyName, overlapGroup: "right" },
      });
      draft.addEdge({
        id: `right-only:${right.id}:${id}`,
        source: rightNodeId,
        target: id,
        type: INVESTED_IN,
        weight: 0.8,
      });
    }
  }

  draft.addEdge({
    id: `overlap-funds:${left.id}:${right.id}`,
    source: leftNodeId,
    target: rightNodeId,
    type: CO_INVESTED,
    weight: shared.length ? 0.9 + shared.length * 0.3 : 0.45,
    meta: {
      sharedCount: shared.length,
      sharedCompanies: shared,
    },
  });

  // Keep a deterministic but useful counterweight for ranking when overlap is zero.
  if (!shared.length && leftCompanies.size && rightCompanies.size) {
    draft.addEdge({
      id: `overlap-gap:${left.id}:${right.id}`,
      source: leftNodeId,
      target: rightNodeId,
      type: CONTRADICTS,
      weight: 0.3,
      meta: {
        reason: "No shared portfolio companies in current snapshot",
      },
    });
  }

  return draft.data();
}

function buildSignalDiffusionGraph(funds: Fund[], signals: Signal[], contextGraph?: GraphAnalyzerData): GraphAnalyzerData {
  const draft = new GraphDraft();
  const resolveFund = buildFundResolver(funds);
  const portfolioLookup = buildPortfolioCompanyLookup(funds);
  const contextHints = contextGraph ? extractPortfolioHintsFromContextGraph(contextGraph, portfolioLookup) : null;
  const portfolioByFund = allCompaniesByFund(funds, contextGraph);
  const { companyToInvestors } = addPortfolioEdges(draft, funds, {
    portfolioByFund,
    contextMetaByPair: contextHints?.metaByPair,
  });
  const allCompanies = Array.from(new Set(Array.from(portfolioByFund.values()).flat()));

  const rankedSignals = sortSignals(signals).slice(0, MAX_DIFFUSION_SIGNALS);
  const rankedResolvableSignals = rankedSignals.filter((signal) => Boolean(resolveFund(signal.fundId)));

  for (const signal of rankedResolvableSignals) {
    const fund = resolveFund(signal.fundId);
    if (!fund) continue;

    const signalId = addSignalNode(draft, signal);
    const fundId = toFundNodeId(fund.id);
    addSignalFundEdge(draft, signal, signalId, fundId);
    addContradictEdgeIfNeeded(draft, signal, signalId, fundId);

    const fundPortfolio = portfolioByFund.get(fund.id) ?? [];
    const matchedCompanies = signalCompanyMatches(signal, fundPortfolio.length ? fundPortfolio : allCompanies);

    for (const companyName of matchedCompanies.slice(0, 2)) {
      const companyId = toCompanyNodeId(companyName);
      draft.addNode(companyNode(companyName));
      draft.addEdge({
        id: `diffusion:${signalId}:${companyId}`,
        source: signalId,
        target: companyId,
        type: MENTIONS,
        weight: 0.8,
      });

      const investors = Array.from(companyToInvestors.get(companyId) ?? []);
      for (const investorFundId of investors.slice(0, 5)) {
        draft.addEdge({
          id: `investor:${investorFundId}:${companyId}`,
          source: investorFundId,
          target: companyId,
          type: INVESTED_IN,
          weight: investorFundId === fundId ? 1 : 0.72,
        });
      }

      for (let i = 0; i < investors.length; i += 1) {
        for (let j = i + 1; j < investors.length; j += 1) {
          draft.addEdge({
            id: `diffusion-coinvest:${investors[i]}:${investors[j]}:${companyId}`,
            source: investors[i],
            target: investors[j],
            type: CO_INVESTED,
            weight: 0.7,
            meta: {
              viaCompany: companyName,
            },
          });
        }
      }
    }

    if (signal.evidenceUrl) {
      const sourceId = toSourceNodeId(signal.evidenceUrl);
      draft.addNode({
        id: sourceId,
        type: "source",
        label: signal.evidenceUrl,
        meta: {
          url: signal.evidenceUrl,
          createdAt: signal.createdAt,
          snippet: signal.evidenceSnippet,
        },
      });
      draft.addEdge({
        id: `signal-source:${signalId}:${sourceId}`,
        source: signalId,
        target: sourceId,
        type: SUPPORTED_BY,
        weight: 0.6,
        meta: {
          verified: true,
          citationCount: 1,
          sourceRefs: [
            {
              id: `signal-source-${signal.id}`,
              url: signal.evidenceUrl,
              title: signal.title,
              snippet: signal.evidenceSnippet,
              origin: "synthetic",
            },
          ],
          metricSource: "signal_evidence",
          metricEligible: true,
        },
      });
    }
  }

  return draft.data();
}

function convertContextGraph(contextGraph: GraphAnalyzerData): GraphAnalyzerData {
  return contextGraph;
}

function timelineCutoffMs(range: GraphTimelineRange): number | null {
  if (range === "ALL") return null;
  const now = Date.now();
  const months = range === "6M" ? 6 : 12;
  return now - months * 30 * 24 * 60 * 60 * 1000;
}

function isVerifiedNode(node: GraphAnalyzerNode): boolean {
  if (node.type !== "signal" && node.type !== "claim") return true;
  const verified = asNumber(node.meta?.verifiedCount);
  const disputed = asNumber(node.meta?.disputedCount);
  const trustTier = typeof node.meta?.trustTier === "string" ? node.meta.trustTier.toUpperCase() : "";
  return trustTier === "HIGH" || verified >= disputed;
}

function buildAdjacency(edges: GraphAnalyzerEdge[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();

  for (const edge of edges) {
    const left = adjacency.get(edge.source) ?? new Set<string>();
    left.add(edge.target);
    adjacency.set(edge.source, left);

    const right = adjacency.get(edge.target) ?? new Set<string>();
    right.add(edge.source);
    adjacency.set(edge.target, right);
  }

  return adjacency;
}

function collectHopNeighborhood(adjacency: Map<string, Set<string>>, startIds: string[], depth: number): Set<string> {
  const keep = new Set<string>(startIds);
  let frontier = new Set<string>(startIds);

  for (let hop = 0; hop < depth; hop += 1) {
    const next = new Set<string>();
    for (const nodeId of frontier) {
      for (const neighbor of adjacency.get(nodeId) ?? []) {
        if (keep.has(neighbor)) continue;
        keep.add(neighbor);
        next.add(neighbor);
      }
    }
    if (!next.size) break;
    frontier = next;
  }

  return keep;
}

function applySectorStageFilter(
  graph: GraphAnalyzerData,
  sector: string,
  stage: string,
  hopDepth: number
): GraphAnalyzerData {
  if (sector === "ALL" && stage === "ALL") return graph;

  const matchingFundIds = new Set(
    graph.nodes
    .filter((node) => node.type === "fund")
    .filter((node) => {
      const sectors = asStringArray(node.meta?.sectors).map((entry) => entry.toLowerCase());
      const stages = asStringArray(node.meta?.stages).map((entry) => entry.toLowerCase());
      const sectorOk = sector === "ALL" || sectors.includes(sector.toLowerCase());
      const stageOk = stage === "ALL" || stages.includes(stage.toLowerCase());
      return sectorOk && stageOk;
    })
    .map((node) => node.id)
  );

  if (!matchingFundIds.size) {
    return {
      nodes: [],
      edges: [],
    };
  }

  const adjacency = buildAdjacency(graph.edges);
  const expanded = collectHopNeighborhood(adjacency, Array.from(matchingFundIds), Math.max(1, hopDepth));
  const expandedNodes = graph.nodes.filter((node) => expanded.has(node.id));
  const expandedNodeIds = new Set(expandedNodes.map((node) => node.id));
  const expandedEdges = graph.edges.filter((edge) => expandedNodeIds.has(edge.source) && expandedNodeIds.has(edge.target));

  // Sector/stage filters are fund-scoped. Never keep non-matching funds just because they are nearby.
  const constrainedNodes = expandedNodes.filter((node) => node.type !== "fund" || matchingFundIds.has(node.id));
  const constrainedNodeIds = new Set(constrainedNodes.map((node) => node.id));
  const constrainedEdges = expandedEdges.filter(
    (edge) => constrainedNodeIds.has(edge.source) && constrainedNodeIds.has(edge.target)
  );

  // Remove artifacts that are no longer reachable from the matching fund seed set.
  const constrainedAdjacency = buildAdjacency(constrainedEdges);
  const reachable = collectHopNeighborhood(
    constrainedAdjacency,
    Array.from(matchingFundIds).filter((nodeId) => constrainedNodeIds.has(nodeId)),
    Math.max(1, hopDepth)
  );
  const reachableNodeIds = new Set(reachable);

  return {
    nodes: constrainedNodes.filter((node) => reachableNodeIds.has(node.id)),
    edges: constrainedEdges.filter((edge) => reachableNodeIds.has(edge.source) && reachableNodeIds.has(edge.target)),
  };
}

function applyTimelineFilter(graph: GraphAnalyzerData, timeline: GraphTimelineRange): GraphAnalyzerData {
  const cutoff = timelineCutoffMs(timeline);
  if (!cutoff) return graph;

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const initiallyAllowed = new Set<string>();

  for (const node of graph.nodes) {
    if (node.type === "signal" || node.type === "claim" || node.type === "source" || node.type === "theme") {
      const createdAt = parseDateMs(node.meta?.createdAt) ?? parseDateMs(node.meta?.lastSeenAt);
      if (!createdAt || createdAt >= cutoff) {
        initiallyAllowed.add(node.id);
      }
      continue;
    }
    initiallyAllowed.add(node.id);
  }

  const filteredEdges = graph.edges.filter((edge) => initiallyAllowed.has(edge.source) && initiallyAllowed.has(edge.target));
  const adjacency = buildAdjacency(filteredEdges);

  // Preserve structural nodes (fund/company/person) only when connected to surviving temporal nodes.
  const temporalSeeds = graph.nodes
    .filter((node) => initiallyAllowed.has(node.id))
    .filter((node) => node.type === "signal" || node.type === "claim" || node.type === "source" || node.type === "theme")
    .map((node) => node.id);

  if (!temporalSeeds.length) {
    return {
      nodes: graph.nodes.filter((node) => initiallyAllowed.has(node.id)),
      edges: filteredEdges,
    };
  }

  const keep = collectHopNeighborhood(adjacency, temporalSeeds, 3);
  return {
    nodes: graph.nodes.filter((node) => keep.has(node.id) && nodesById.has(node.id)),
    edges: filteredEdges.filter((edge) => keep.has(edge.source) && keep.has(edge.target)),
  };
}

function applyEntityFilter(graph: GraphAnalyzerData, enabledTypes: GraphAnalyzerFilters["entityTypeEnabled"]): GraphAnalyzerData {
  const allowedNodes = graph.nodes.filter((node) => enabledTypes[node.type]);
  const allowedIds = new Set(allowedNodes.map((node) => node.id));
  return {
    nodes: allowedNodes,
    edges: graph.edges.filter((edge) => allowedIds.has(edge.source) && allowedIds.has(edge.target)),
  };
}

function applyEdgeTypeFilter(graph: GraphAnalyzerData, edgeType: GraphAnalyzerFilters["edgeType"]): GraphAnalyzerData {
  if (!edgeType || edgeType === "ALL") return graph;
  const edges = graph.edges.filter((edge) => edge.type === edgeType);
  if (!edges.length) {
    return {
      nodes: [],
      edges: [],
    };
  }

  const nodeIds = new Set<string>();
  for (const edge of edges) {
    nodeIds.add(edge.source);
    nodeIds.add(edge.target);
  }

  return {
    nodes: graph.nodes.filter((node) => nodeIds.has(node.id)),
    edges,
  };
}

function applyCitationFilter(graph: GraphAnalyzerData, minCitationCount: number): GraphAnalyzerData {
  const threshold = Math.max(0, Math.floor(minCitationCount));
  if (threshold <= 0) return graph;

  const edges = graph.edges.filter((edge) => edgeCitationCount(edge) >= threshold);
  if (!edges.length) {
    return {
      nodes: [],
      edges: [],
    };
  }

  const nodeIds = new Set<string>();
  for (const edge of edges) {
    nodeIds.add(edge.source);
    nodeIds.add(edge.target);
  }

  return {
    nodes: graph.nodes.filter((node) => nodeIds.has(node.id)),
    edges,
  };
}

function applyVerifiedFilter(graph: GraphAnalyzerData, enabled: boolean): GraphAnalyzerData {
  if (!enabled) return graph;
  const allowedNodes = graph.nodes.filter((node) => isVerifiedNode(node));
  const allowedIds = new Set(allowedNodes.map((node) => node.id));
  return {
    nodes: allowedNodes,
    edges: graph.edges.filter((edge) => allowedIds.has(edge.source) && allowedIds.has(edge.target)),
  };
}

function applyHopFocus(graph: GraphAnalyzerData, focusNodeId: string, depth: number): GraphAnalyzerData {
  if (!focusNodeId) return graph;
  const nodeExists = graph.nodes.some((node) => node.id === focusNodeId);
  if (!nodeExists) return graph;

  const boundedDepth = Math.max(1, depth);
  const adjacency = buildAdjacency(graph.edges);
  const keep = new Set<string>([focusNodeId]);
  const distance = new Map<string, number>([[focusNodeId, 0]]);
  let frontier = new Set<string>([focusNodeId]);

  for (let hop = 0; hop < boundedDepth; hop += 1) {
    const next = new Set<string>();
    for (const nodeId of frontier) {
      for (const neighbor of adjacency.get(nodeId) ?? []) {
        if (distance.has(neighbor)) continue;
        distance.set(neighbor, hop + 1);
        keep.add(neighbor);
        next.add(neighbor);
      }
    }
    if (!next.size) break;
    frontier = next;
  }

  const edges = graph.edges.filter((edge) => {
    if (!keep.has(edge.source) || !keep.has(edge.target)) return false;

    const sourceDepth = distance.get(edge.source) ?? Number.POSITIVE_INFINITY;
    const targetDepth = distance.get(edge.target) ?? Number.POSITIVE_INFINITY;

    if (boundedDepth === 1) {
      // With 1-hop access, keep only direct relationships to the focus entity.
      return edge.source === focusNodeId || edge.target === focusNodeId;
    }

    // Remove outer-shell chord edges that make dense rings unreadable.
    if (sourceDepth === boundedDepth && targetDepth === boundedDepth) return false;

    return Math.abs(sourceDepth - targetDepth) <= 1 || edge.source === focusNodeId || edge.target === focusNodeId;
  });

  return {
    nodes: graph.nodes.filter((node) => keep.has(node.id)),
    edges,
  };
}

function densifyWithCoInvest(graph: GraphAnalyzerData): GraphAnalyzerData {
  const draft = new GraphDraft();
  for (const node of graph.nodes) {
    draft.addNode(node);
  }
  for (const edge of graph.edges) {
    draft.addEdge(edge);
  }

  const companyInvestors = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (edge.type !== INVESTED_IN) continue;
    const sourceNode = graph.nodes.find((node) => node.id === edge.source);
    const targetNode = graph.nodes.find((node) => node.id === edge.target);
    if (!sourceNode || !targetNode) continue;

    const fundId = sourceNode.type === "fund" ? sourceNode.id : targetNode.type === "fund" ? targetNode.id : "";
    const companyId = sourceNode.type === "company" ? sourceNode.id : targetNode.type === "company" ? targetNode.id : "";
    if (!fundId || !companyId) continue;

    const bucket = companyInvestors.get(companyId) ?? new Set<string>();
    bucket.add(fundId);
    companyInvestors.set(companyId, bucket);
  }

  addCoInvestEdges(draft, companyInvestors, new Map(), {
    minSharedCount: 2,
    maxEdges: 120,
  });
  return draft.data();
}

export function buildPresetGraph(input: {
  presetId: GraphAnalyzerPresetId;
  funds: Fund[];
  signals: Signal[];
  contextGraph: GraphAnalyzerData;
  overlapConfig: PortfolioOverlapConfig;
}): GraphAnalyzerData {
  if (input.presetId === "CO_INVESTMENT") {
    return buildCoInvestmentGraph(input.funds, input.contextGraph);
  }

  if (input.presetId === "FOUNDER_NETWORK") {
    return buildFounderNetworkGraph(input.funds, input.contextGraph);
  }

  if (input.presetId === "THEME_MAP") {
    return buildThemeMapGraph(input.funds, input.signals, input.contextGraph);
  }

  if (input.presetId === "PORTFOLIO_OVERLAP") {
    return buildPortfolioOverlapGraph(input.funds, input.overlapConfig, input.contextGraph);
  }

  return buildSignalDiffusionGraph(input.funds, input.signals, input.contextGraph);
}

export function applyGraphFilters(graph: GraphAnalyzerData, filters: GraphAnalyzerFilters): GraphAnalyzerData {
  let next = applyTimelineFilter(graph, filters.timeline);
  next = applyVerifiedFilter(next, filters.verifiedOnly);
  next = applySectorStageFilter(next, filters.sector, filters.stage, filters.hopDepth);
  next = applyEntityFilter(next, filters.entityTypeEnabled);
  next = densifyWithCoInvest(next);
  next = applyEdgeTypeFilter(next, filters.edgeType);
  next = applyCitationFilter(next, filters.minCitationCount ?? 0);
  next = applyHopFocus(next, filters.focusNodeId, filters.hopDepth);

  return next;
}

export function convertApiGraphToAnalyzerData(contextGraph: {
  nodes: Array<{ id: string; label: string; type: string; meta?: Record<string, unknown> }>;
  links: Array<{ source: string; target: string; type: string; weight?: number }>;
}): GraphAnalyzerData {
  const typeMap: Record<string, GraphAnalyzerNode["type"]> = {
    fund: "fund",
    company: "company",
    person: "person",
    claim: "claim",
    source: "source",
    signal: "signal",
    theme: "theme",
  };

  const edgeMap: Record<string, GraphAnalyzerEdge["type"]> = {
    PORTFOLIO: INVESTED_IN,
    SIGNAL_FOR: SUPPORTED_BY,
    CITES: SUPPORTED_BY,
    ABOUT: MENTIONS,
    MENTIONED_IN: MENTIONS,
    MANAGES: FOUNDED,
    CO_INVESTED,
  };

  return convertContextGraph({
    nodes: contextGraph.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      type: typeMap[node.type] ?? "source",
      meta: node.meta,
    })),
    edges: contextGraph.links.map((link) => ({
      id: `${link.source}|${link.target}|${link.type}`,
      source: link.source,
      target: link.target,
      type: edgeMap[link.type] ?? MENTIONS,
      weight: link.weight,
    })),
  });
}

function findBestNode(graph: GraphAnalyzerData, query: string, allowedTypes?: GraphAnalyzerNode["type"][]): GraphAnalyzerNode | null {
  const normalized = normalizeEntityLookup(query);
  if (!normalized) return null;
  const tokens = normalized.split(" ").filter(Boolean);

  let best: { node: GraphAnalyzerNode; score: number } | null = null;

  for (const node of graph.nodes) {
    if (allowedTypes && !allowedTypes.includes(node.type)) continue;
    const label = normalizeToken(node.label);
    if (!label) continue;

    let score = 0;
    if (label === normalized) score += 120;
    if (label.startsWith(normalized)) score += 60;
    if (label.includes(normalized)) score += 40;
    score += tokens.filter((token) => label.includes(token)).length * 14;

    if (!best || score > best.score) {
      best = { node, score };
    }
  }

  if (best && best.score > 20) return best.node;

  // Fuzzy fallback for typos like "elvennalabs" -> "ElevenLabs".
  const compactQuery = normalized.replace(/\s+/g, "");
  if (!compactQuery || compactQuery.length > 56 || tokens.length > 5) return null;

  let fuzzyBest: { node: GraphAnalyzerNode; distance: number; ratio: number } | null = null;
  for (const node of graph.nodes) {
    if (allowedTypes && !allowedTypes.includes(node.type)) continue;
    const compactLabel = normalizeToken(node.label).replace(/\s+/g, "");
    if (!compactLabel) continue;

    const maxDistance = Math.max(2, Math.min(5, Math.floor(Math.max(compactQuery.length, compactLabel.length) * 0.34)));
    const distance = levenshteinDistanceBounded(compactQuery, compactLabel, maxDistance);
    if (distance > maxDistance) continue;
    const ratio = distance / Math.max(compactQuery.length, compactLabel.length);
    if (ratio > 0.34) continue;

    if (
      !fuzzyBest ||
      ratio < fuzzyBest.ratio ||
      (ratio === fuzzyBest.ratio && distance < fuzzyBest.distance)
    ) {
      fuzzyBest = { node, distance, ratio };
    }
  }

  return fuzzyBest?.node ?? null;
}

function levenshteinDistanceBounded(left: string, right: string, maxDistance: number): number {
  const leftLen = left.length;
  const rightLen = right.length;
  if (!leftLen) return rightLen;
  if (!rightLen) return leftLen;
  if (Math.abs(leftLen - rightLen) > maxDistance) return maxDistance + 1;

  const previous = new Array<number>(rightLen + 1);
  for (let j = 0; j <= rightLen; j += 1) previous[j] = j;

  for (let i = 1; i <= leftLen; i += 1) {
    let current = i;
    let minRowValue = current;
    for (let j = 1; j <= rightLen; j += 1) {
      const insertCost = current + 1;
      const deleteCost = previous[j] + 1;
      const replaceCost = previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1);
      const next = Math.min(insertCost, deleteCost, replaceCost);
      previous[j - 1] = current;
      current = next;
      if (next < minRowValue) minRowValue = next;
    }
    previous[rightLen] = current;
    if (minRowValue > maxDistance) return maxDistance + 1;
  }

  return previous[rightLen] ?? maxDistance + 1;
}

function cleanEntityPhrase(value: string): string {
  const stripped = value
    .trim()
    .replace(/^[\s"'`“”‘’]+|[\s"'`“”‘’]+$/g, "")
    .replace(/\s+/g, " ");

  // Ignore conversational suffixes that often appear when users type full sentences.
  return stripped
    .replace(/\s+\b(?:in|on)\s+the\s+(?:run\s+)?query\b.*$/i, "")
    .replace(/\s+\b(?:in|on)\s+the\s+graph\b.*$/i, "")
    .replace(/\s+\b(?:in|on)\s+this\s+graph\b.*$/i, "")
    .replace(/\s+\b(?:in|on|under)\s+this\s+(?:view|preset|mode)\b.*$/i, "")
    .replace(/\s+\b(?:for|within)\s+the\s+current\s+(?:view|preset|mode)\b.*$/i, "")
    .replace(/[,:;]\s*(?:please|pls|thanks|thank you).*$/i, "")
    .replace(/\s+\b(?:please|pls|thanks|thank you|for me|right now|currently)\b.*$/i, "")
    .replace(/^(?:the\s+)?(?:company|fund|investor|firm)\s+/i, "")
    .replace(/^(?:called|named)\s+/i, "")
    .trim();
}

const ENTITY_ALIAS_REWRITES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\b11\s*labs?\b/g, replacement: "elevenlabs" },
  { pattern: /\beleven\s+labs?\b/g, replacement: "elevenlabs" },
  { pattern: /\ba16z\b/g, replacement: "andreessen horowitz" },
  { pattern: /\byc\b/g, replacement: "y combinator" },
  { pattern: /\balexander\s+wang\b/g, replacement: "alexandr wang" },
];

function normalizeEntityLookup(value: string): string {
  let normalized = normalizeToken(cleanEntityPhrase(value));
  for (const rewrite of ENTITY_ALIAS_REWRITES) {
    normalized = normalized.replace(rewrite.pattern, rewrite.replacement);
  }
  return normalized.replace(/\s+/g, " ").trim();
}

const COMPANY_CANONICAL_SUFFIX_TOKENS = new Set([
  "ai",
  "co",
  "company",
  "corp",
  "corporation",
  "inc",
  "labs",
  "technologies",
  "technology",
]);

function canonicalCompanyLookup(value: string): string {
  const normalized = normalizeEntityLookup(value);
  if (!normalized) return "";
  const tokens = normalized
    .split(" ")
    .filter(Boolean)
    .filter((token) => !COMPANY_CANONICAL_SUFFIX_TOKENS.has(token));
  return (tokens.join(" ") || normalized).trim();
}

function equivalentSeedNodeIdsForSearch(
  graph: GraphAnalyzerData,
  topNode: GraphAnalyzerNode,
  phrase: string
): string[] {
  const topLabel = normalizeEntityLookup(topNode.label);
  const normalizedPhrase = normalizeEntityLookup(phrase);
  const topCompanyCanonical = topNode.type === "company" ? canonicalCompanyLookup(topNode.label) : "";
  const phraseCompanyCanonical = topNode.type === "company" ? canonicalCompanyLookup(phrase) : "";

  const seedNodeIds = new Set<string>([topNode.id]);
  for (const candidate of graph.nodes) {
    if (candidate.type !== topNode.type) continue;

    const candidateLabel = normalizeEntityLookup(candidate.label);
    if (!candidateLabel) continue;

    const directMatch = candidateLabel === topLabel || (normalizedPhrase && candidateLabel === normalizedPhrase);
    let aliasMatch = false;
    if (topNode.type === "company") {
      const candidateCanonical = canonicalCompanyLookup(candidate.label);
      aliasMatch = Boolean(
        (candidateCanonical && topCompanyCanonical && candidateCanonical === topCompanyCanonical) ||
          (candidateCanonical && phraseCompanyCanonical && candidateCanonical === phraseCompanyCanonical)
      );
    }

    if (!directMatch && !aliasMatch) continue;
    seedNodeIds.add(candidate.id);
    if (seedNodeIds.size >= 6) break;
  }

  return Array.from(seedNodeIds);
}

function uniqueQueryTokens(value: string): string[] {
  const tokens = normalizeToken(value)
    .split(" ")
    .filter((token) => token.length >= 3);
  return Array.from(new Set(tokens));
}

function edgeByEndpoints(graph: GraphAnalyzerData, left: string, right: string): GraphAnalyzerEdge | undefined {
  return graph.edges.find(
    (edge) => (edge.source === left && edge.target === right) || (edge.source === right && edge.target === left)
  );
}

function normalizeQueryForParsing(query: string): string {
  return query
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .trim();
}

function intentClauseScore(value: string): number {
  const phrase = value.toLowerCase();
  let score = 0;
  if (/\b(path|connection|relationship|connect|linked|related)\b/.test(phrase)) score += 4;
  if (/\bbetween\b/.test(phrase) && /\band\b/.test(phrase)) score += 3;
  if (/\b(both|overlap|shared|common)\b/.test(phrase)) score += 4;
  if (/\b(companies|startups)\b/.test(phrase)) score += 2;
  if (/\b(funds|investors)\b/.test(phrase)) score += 2;
  if (/\b(investing|invest|backing|funded|backed)\b/.test(phrase)) score += 2;
  if (/\b(portfolio|investments?)\b/.test(phrase)) score += 3;
  return score;
}

function candidatePhrasesForParsing(query: string): string[] {
  const normalized = normalizeQueryForParsing(query);
  if (!normalized) return [];

  const clauses = normalized
    .split(/[\n.;!?]+/)
    .map((piece) => piece.trim())
    .filter(Boolean);

  if (!clauses.length) return [normalized];
  if (clauses.length === 1) return [normalized];

  const bestClause = [...clauses].sort((left, right) => intentClauseScore(right) - intentClauseScore(left))[0];
  return Array.from(new Set([normalized, bestClause].filter(Boolean)));
}

function cleanThemePhrase(value: string): string {
  return value
    .trim()
    .replace(/^[\s"'`“”‘’]+|[\s"'`“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/^(?:the\s+)?(?:theme|sector|space|category|area)\s+of\s+/i, "")
    .replace(/\s+\b(?:please|pls|thanks|thank you|right now|currently|today)\b.*$/i, "")
    .replace(/\s+\b(?:in|on)\s+this\s+graph\b.*$/i, "")
    .trim();
}

const QUERY_TOKEN_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "between",
  "into",
  "onto",
  "this",
  "that",
  "these",
  "those",
  "please",
  "show",
  "find",
  "give",
  "help",
  "understand",
  "look",
  "looking",
  "right",
  "now",
  "current",
  "view",
  "graph",
  "query",
  "path",
  "connection",
  "relationship",
  "connected",
  "related",
  "linked",
  "companies",
  "company",
  "startups",
  "startup",
  "funds",
  "fund",
  "investors",
  "investor",
  "invested",
  "investing",
  "backed",
  "backing",
  "both",
  "common",
  "shared",
  "overlap",
  "what",
  "which",
  "who",
  "where",
  "how",
  "are",
  "is",
  "can",
  "could",
  "would",
  "should",
  "like",
]);

const THEME_TOKEN_STOPWORDS = new Set([
  ...QUERY_TOKEN_STOPWORDS,
  "research",
  "researching",
  "focused",
  "focus",
  "seeking",
  "exploring",
  "interested",
  "compare",
  "comparing",
  "network",
  "ecosystem",
]);

function meaningfulQueryTokens(value: string): string[] {
  return normalizeToken(value)
    .split(" ")
    .filter((token) => token.length >= 3)
    .filter((token) => !QUERY_TOKEN_STOPWORDS.has(token));
}

function mentionScoreForNode(node: GraphAnalyzerNode, normalizedQuery: string, queryTokens: Set<string>): number {
  const label = normalizeToken(node.label);
  if (!label) return 0;

  const labelTokens = label
    .split(" ")
    .filter((token) => token.length >= 3)
    .filter((token) => !QUERY_TOKEN_STOPWORDS.has(token));

  let score = 0;
  if (normalizedQuery.includes(label)) {
    score += 220 + Math.min(80, label.length);
  }

  const tokenHits = labelTokens.filter((token) => queryTokens.has(token)).length;
  if (tokenHits > 0) {
    score += tokenHits * 24;
    if (labelTokens.length > 0 && tokenHits === labelTokens.length) {
      score += 42;
    }
  }

  if (!score && label.replace(/\s+/g, "").length >= 5) {
    const compactLabel = label.replace(/\s+/g, "");
    for (const token of queryTokens) {
      const maxDistance = Math.max(1, Math.min(3, Math.floor(Math.max(token.length, compactLabel.length) * 0.3)));
      const distance = levenshteinDistanceBounded(token, compactLabel, maxDistance);
      if (distance > maxDistance) continue;
      const ratio = distance / Math.max(token.length, compactLabel.length);
      if (ratio > 0.34) continue;
      score = Math.max(score, 26 - distance * 5 + Math.min(8, compactLabel.length / 3));
    }
  }

  return score;
}

function detectNodeMentions(
  graph: GraphAnalyzerData,
  query: string,
  options?: { allowedTypes?: GraphAnalyzerNode["type"][]; limit?: number }
): GraphAnalyzerNode[] {
  const normalizedQuery = normalizeToken(query);
  if (!normalizedQuery) return [];
  const queryTokens = new Set(meaningfulQueryTokens(query));

  const scored = graph.nodes
    .filter((node) => !options?.allowedTypes || options.allowedTypes.includes(node.type))
    .map((node) => ({ node, score: mentionScoreForNode(node, normalizedQuery, queryTokens) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || right.node.label.length - left.node.label.length);

  const unique = new Map<string, GraphAnalyzerNode>();
  for (const entry of scored) {
    const key = normalizeToken(entry.node.label);
    if (!key || unique.has(key)) continue;
    unique.set(key, entry.node);
    if (unique.size >= (options?.limit ?? 6)) break;
  }

  return Array.from(unique.values());
}

function queryHasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function queryHasAll(text: string, patterns: RegExp[]): boolean {
  return patterns.every((pattern) => pattern.test(text));
}

function extractThemeFromConversationalQuery(query: string, graph: GraphAnalyzerData): string {
  let normalized = normalizeToken(query);
  if (!normalized) return "";

  for (const node of detectNodeMentions(graph, query, { limit: 8 })) {
    const label = normalizeToken(node.label);
    if (!label) continue;
    normalized = normalized.replace(new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), " ");
  }

  const tokens = normalizeToken(normalized)
    .split(" ")
    .filter((token) => token === "ai" || token.length >= 3)
    .filter((token) => !THEME_TOKEN_STOPWORDS.has(token));

  return tokens.slice(0, 6).join(" ");
}

function inferCommandFromConversationalQuery(query: string, graph: GraphAnalyzerData): QueryCommand | null {
  const normalized = normalizeToken(query);
  if (!normalized) return null;

  const pathPatterns = [
    /\bpath\b/i,
    /\bconnection\b/i,
    /\bconnect(?:ed|ing|ion)?\b/i,
    /\brelationship\b/i,
    /\bconnected\b/i,
    /\brelated\b/i,
    /\blink(?:ed)?\b/i,
    /\bbetween\b/i,
    /\bfrom\b.*\bto\b/i,
  ];
  const overlapPatterns = [/\b(both|common|shared|overlap)\b/i, /\b(portfolio|invested|investing|funded|backed)\b/i];
  const founderPatterns = [/\b(founder|founders|people|person)\b/i, /\b(invested|invest|backed|funded)\b/i];
  const fundPortfolioPatterns = [
    /\b(companies|startups|portfolio|investments?)\b/i,
    /\b(invested|invest|backed|funded|holds?|portfolio)\b/i,
  ];
  const singleFundInvestmentPatterns = [/\b(invested|invest|backed|funded)\b/i, /\b(what|which|show)\b/i];
  const coInvestorPatterns = [
    /\b(co[\s-]?invest(?:s|ed|ing|or|ors)?|alongside)\b/i,
    /\b(with|alongside)\b/i,
  ];
  const linkedCompanyPatterns = [/\b(companies|startups)\b/i, /\b(linked|connected|related|around|adjacent|neighbor)\b/i];
  const fundsThemePatterns = [/\b(funds?|investors?)\b/i, /\b(investing|invest|backing|focused|focus|look\s+at|for|in)\b/i];

  if (queryHasAll(normalized, overlapPatterns)) {
    const funds = detectNodeMentions(graph, query, { allowedTypes: ["fund"], limit: 3 });
    if (funds.length >= 2) {
      return {
        kind: "companies_funded_by_both",
        leftFund: funds[0]?.label ?? "",
        rightFund: funds[1]?.label ?? "",
      };
    }
  }

  if (queryHasAll(normalized, founderPatterns) && !queryHasAny(normalized, [/\b(both|shared|common|overlap)\b/i])) {
    const funds = detectNodeMentions(graph, query, { allowedTypes: ["fund"], limit: 2 });
    if (funds.length >= 1) {
      return {
        kind: "founders_backed_by_fund",
        fund: funds[0]?.label ?? "",
      };
    }
  }

  if (queryHasAll(normalized, fundPortfolioPatterns) && !queryHasAny(normalized, [/\b(both|shared|common|overlap)\b/i])) {
    const funds = detectNodeMentions(graph, query, { allowedTypes: ["fund"], limit: 2 });
    if (funds.length >= 1) {
      return {
        kind: "companies_invested_by_fund",
        fund: funds[0]?.label ?? "",
      };
    }
  }

  if (queryHasAll(normalized, singleFundInvestmentPatterns) && !queryHasAny(normalized, [/\b(both|shared|common|overlap|and)\b/i])) {
    const funds = detectNodeMentions(graph, query, { allowedTypes: ["fund"], limit: 2 });
    if (funds.length === 1) {
      return {
        kind: "companies_invested_by_fund",
        fund: funds[0]?.label ?? "",
      };
    }
  }

  if (queryHasAll(normalized, coInvestorPatterns)) {
    const funds = detectNodeMentions(graph, query, { allowedTypes: ["fund"], limit: 2 });
    if (funds.length >= 1) {
      return {
        kind: "companies_linked",
        entity: funds[0]?.label ?? "",
      };
    }
  }

  if (queryHasAny(normalized, pathPatterns)) {
    const entities = detectNodeMentions(graph, query, { limit: 4 });
    if (entities.length >= 2) {
      return {
        kind: "path",
        left: entities[0]?.label ?? "",
        right: entities[1]?.label ?? "",
      };
    }
  }

  if (queryHasAll(normalized, linkedCompanyPatterns)) {
    const entities = detectNodeMentions(graph, query, { limit: 3 });
    if (entities.length >= 1) {
      return {
        kind: "companies_linked",
        entity: entities[0]?.label ?? "",
      };
    }
  }

  if (queryHasAll(normalized, fundsThemePatterns)) {
    const theme = extractThemeFromConversationalQuery(query, graph);
    if (theme) {
      return {
        kind: "funds_in_theme",
        theme,
      };
    }
  }

  return null;
}

function shortestPath(graph: GraphAnalyzerData, startId: string, endId: string): string[] | null {
  const adjacency = buildAdjacency(graph.edges);
  const queue: string[] = [startId];
  const visited = new Set<string>([startId]);
  const parent = new Map<string, string | null>([[startId, null]]);

  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;
    if (current === endId) break;

    for (const neighbor of adjacency.get(current) ?? []) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      parent.set(neighbor, current);
      queue.push(neighbor);
    }
  }

  if (!visited.has(endId)) return null;

  const path: string[] = [];
  let cursor: string | null = endId;
  while (cursor) {
    path.push(cursor);
    cursor = parent.get(cursor) ?? null;
  }
  path.reverse();
  return path;
}

function edgeNarrative(edge: GraphAnalyzerEdge): string {
  if (edge.type === INVESTED_IN) return "invested in";
  if (edge.type === FOUNDED) return "founded";
  if (edge.type === MENTIONS) return "is linked to";
  if (edge.type === SUPPORTED_BY) return "is supported by";
  if (edge.type === CO_INVESTED) return "co-invested with";
  return "is contradicted by";
}

type QueryCommand =
  | { kind: "path"; left: string; right: string }
  | { kind: "funds_in_theme"; theme: string }
  | { kind: "companies_linked"; entity: string }
  | { kind: "companies_invested_by_fund"; fund: string }
  | { kind: "founders_backed_by_fund"; fund: string }
  | { kind: "companies_funded_by_both"; leftFund: string; rightFund: string }
  | { kind: "search"; phrase: string };

function parsePathCommand(phrase: string): QueryCommand | null {
  const patterns = [
    /\b(?:shortest\s+)?(?:path|connection|relationship|link)\b[\w\s]*?\bbetween\s+(.+?)\s+and\s+(.+?)(?:[?.!,]|$)/i,
    /\b(?:shortest\s+)?(?:path|connection|relationship|link)\b[\w\s]*?\bfrom\s+(.+?)\s+to\s+(.+?)(?:[?.!,]|$)/i,
    /\bhow\s+(?:is|does)\s+(.+?)\s+(?:connected|related|linked)\s+to\s+(.+?)(?:[?.!,]|$)/i,
    /\bhow\s+(.+?)\s+is\s+(?:connected|related|linked)\s+to\s+(.+?)(?:[?.!,]|$)/i,
    /\bhow\s+are\s+(.+?)\s+and\s+(.+?)\s+(?:connected|related|linked)(?:[?.!,]|$)/i,
    /\b(?:is\s+there|show|find|give)\b[\w\s]*?\b(?:path|connection|relationship)\b[\w\s]*?\bbetween\s+(.+?)\s+and\s+(.+?)(?:[?.!,]|$)/i,
  ];

  for (const pattern of patterns) {
    const match = phrase.match(pattern);
    if (!match) continue;

    const left = cleanEntityPhrase(match[1] ?? "");
    const right = cleanEntityPhrase(match[2] ?? "");
    if (!left || !right) continue;

    return {
      kind: "path",
      left,
      right,
    };
  }

  return null;
}

function parseFundedByBothCommand(phrase: string): QueryCommand | null {
  const patterns = [
    /\b(?:companies|startups|portfolio\s+companies)\s+(?:funded|backed|invested\s+in)\s+by\s+both\s+(.+?)\s+and\s+(.+?)(?:[?.!,]|$)/i,
    /\bwhat\s+(?:companies|startups)[\w\s]*?\bboth\s+(.+?)\s+and\s+(.+?)\s+(?:funded|backed|invested\s+in)(?:[?.!,]|$)/i,
    /\b(?:what|which)\s+(?:companies|startups)\s+did\s+both\s+(.+?)\s+and\s+(.+?)\s+(?:invest\s+in|back|fund)(?:[?.!,]|$)/i,
    /\b(?:common|shared|overlap)\s+(?:investments?|portfolio)\s+(?:between|for)\s+(.+?)\s+and\s+(.+?)(?:[?.!,]|$)/i,
    /\bwhat\s+did\s+both\s+(.+?)\s+and\s+(.+?)\s+(?:invest\s+in|back|fund)(?:[?.!,]|$)/i,
  ];

  for (const pattern of patterns) {
    const match = phrase.match(pattern);
    if (!match) continue;
    const leftFund = cleanEntityPhrase(match[1] ?? "");
    const rightFund = cleanEntityPhrase(match[2] ?? "");
    if (!leftFund || !rightFund) continue;
    return {
      kind: "companies_funded_by_both",
      leftFund,
      rightFund,
    };
  }
  return null;
}

function parseCompaniesLinkedCommand(phrase: string): QueryCommand | null {
  const patterns = [
    /\b(?:companies|startups)(?:\s+that\s+are)?\s+(?:linked|connected|related)\s+to\s+(.+?)(?:[?.!,]|$)/i,
    /\b(?:funds|investors?)(?:\s+that\s+are)?\s+(?:linked|connected|related)\s+to\s+(.+?)(?:[?.!,]|$)/i,
    /\bwhat\s+(?:companies|startups)\s+are\s+(?:around|adjacent\s+to|neighbors?\s+of)\s+(.+?)(?:[?.!,]|$)/i,
    /\bshow\s+me\s+(?:the\s+)?(?:companies|startups)\s+(?:around|connected\s+to|linked\s+to)\s+(.+?)(?:[?.!,]|$)/i,
    /\b(?:who|which\s+(?:funds|investors))\s+(?:co[\s-]?invest(?:s|ed|ing|ors?)?|invest(?:s|ors?)\s+alongside)\s+(?:with\s+)?(.+?)(?:[?.!,]|$)/i,
    /\b(?:co[\s-]?investors?|investors?\s+alongside)\s+(?:for|around)\s+(.+?)(?:[?.!,]|$)/i,
    /\bshow\s+me\s+(.+?)\s+cluster(?:[?.!,]|$)/i,
  ];

  for (const pattern of patterns) {
    const match = phrase.match(pattern);
    if (!match) continue;
    const entity = cleanEntityPhrase(match[1] ?? "");
    if (!entity) continue;
    return {
      kind: "companies_linked",
      entity,
    };
  }
  return null;
}

function parseFundPortfolioCommand(phrase: string): QueryCommand | null {
  const patterns = [
    /\b(?:companies|startups|portfolio(?:\s+companies)?)\s+(.+?)\s+(?:invested\s+in|backed|funded)(?:[?.!,]|$)/i,
    /\b(?:what|which)\s+(?:companies|startups)\s+(?:did|does|has)\s+(.+?)\s+(?:invest\s+in|back|fund)(?:[?.!,]|$)/i,
    /\bwhat\s+did\s+(.+?)\s+(?:invest\s+in|back|fund)(?:[?.!,]|$)/i,
    /\bwhat\s+has\s+(.+?)\s+(?:invested\s+in|backed|funded)(?:[?.!,]|$)/i,
    /\bshow\s+me\s+(?:the\s+)?(?:portfolio|investments?)\s+(?:of|for)\s+(.+?)(?:[?.!,]|$)/i,
    /\b(?:portfolio|investments?)\s+(?:of|for)\s+(.+?)(?:[?.!,]|$)/i,
  ];

  for (const pattern of patterns) {
    const match = phrase.match(pattern);
    if (!match) continue;
    const fund = cleanEntityPhrase(match[1] ?? "");
    if (!fund) continue;
    return {
      kind: "companies_invested_by_fund",
      fund,
    };
  }
  return null;
}

function parseFoundersBackedByFundCommand(phrase: string): QueryCommand | null {
  const patterns = [
    /\b(?:founders?|people|persons?)\s+(.+?)\s+(?:invested\s+in|backed|funded)(?:[?.!,]|$)/i,
    /\b(?:who|which)\s+(?:founders?|people)\s+(?:did|does|has)\s+(.+?)\s+(?:invest\s+in|back|fund)(?:[?.!,]|$)/i,
    /\bfounders?\s+of\s+(?:companies|startups)\s+(.+?)\s+(?:invested\s+in|backed|funded)(?:[?.!,]|$)/i,
    /\bshow\s+me\s+(?:the\s+)?(?:founders?|people)\s+(?:for|of)\s+companies\s+(.+?)\s+(?:invested\s+in|backed|funded)(?:[?.!,]|$)/i,
  ];

  for (const pattern of patterns) {
    const match = phrase.match(pattern);
    if (!match) continue;
    const fund = cleanEntityPhrase(match[1] ?? "");
    if (!fund) continue;
    return {
      kind: "founders_backed_by_fund",
      fund,
    };
  }
  return null;
}

function parseFundsThemeCommand(phrase: string): QueryCommand | null {
  const patterns = [
    /\b(?:funds|investors)\b[\w\s]*?\b(?:investing|backing|focused|active)\s+in\s+(.+?)(?:[?.!,]|$)/i,
    /\bwho\s+(?:is|are)\s+investing\s+in\s+(.+?)(?:[?.!,]|$)/i,
    /\bwho\s+(?:is|are)\s+(?:active|focused)\s+in\s+(.+?)(?:[?.!,]|$)/i,
    /\b(?:which|what|show|find)\s+(?:funds|investors)[\w\s]*?\b(?:for|in)\s+(.+?)(?:[?.!,]|$)/i,
    /\b(?:show|find|which|what)\s+(?:me\s+)?(.+?)\s+funds(?:[?.!,]|$)/i,
    /\b(?:researching|research|looking\s+at|interested\s+in|focused\s+on)\s+(.+?)[, ]+\s*(?:which|what)\s+(?:funds|investors)\b/i,
  ];

  for (const pattern of patterns) {
    const match = phrase.match(pattern);
    if (!match) continue;
    const theme = cleanThemePhrase(match[1] ?? "");
    if (!theme) continue;
    return {
      kind: "funds_in_theme",
      theme,
    };
  }
  return null;
}

function parseQuery(query: string, graph: GraphAnalyzerData): QueryCommand {
  const normalized = normalizeQueryForParsing(query);
  const candidates = candidatePhrasesForParsing(normalized);

  for (const phrase of candidates) {
    const command =
      parsePathCommand(phrase) ??
      parseFundedByBothCommand(phrase) ??
      parseFoundersBackedByFundCommand(phrase) ??
      parseFundPortfolioCommand(phrase) ??
      parseCompaniesLinkedCommand(phrase) ??
      parseFundsThemeCommand(phrase);

    if (command) return command;
  }

  const inferred = inferCommandFromConversationalQuery(normalized, graph);
  if (inferred) return inferred;

  return {
    kind: "search",
    phrase: normalized,
  };
}

function collectIncidentEdges(graph: GraphAnalyzerData, nodeIds: Set<string>): GraphAnalyzerEdge[] {
  return graph.edges.filter((edge) => nodeIds.has(edge.source) || nodeIds.has(edge.target));
}

export function buildQueryResultSubgraph(
  source: GraphAnalyzerData,
  queryResult: GraphAnalyzerQueryResult | null,
  hopDepth: number
): GraphAnalyzerData | null {
  if (!queryResult) return null;

  const highlightedNodeIds = new Set(queryResult.highlightedNodeIds);
  const highlightedEdgeIds = new Set(queryResult.highlightedEdgeIds);
  if (!highlightedNodeIds.size && !highlightedEdgeIds.size) return null;

  if (queryResult.strictNodeOnly) {
    const nodeById = new Map(source.nodes.map((node) => [node.id, node]));
    const keptNodeIds = new Set(source.nodes.filter((node) => highlightedNodeIds.has(node.id)).map((node) => node.id));
    const initialNodeIdSet = new Set(keptNodeIds);
    const edges = source.edges.filter((edge) => {
      if (!initialNodeIdSet.has(edge.source) || !initialNodeIdSet.has(edge.target)) return false;
      if (!highlightedEdgeIds.size) return true;
      return highlightedEdgeIds.has(edge.id);
    });

    const keptEdgeIds = new Set(edges.map((edge) => edge.id));
    const expandedEdges = [...edges];

    // Preserve founder visibility for highlighted companies in strict query mode.
    for (const edge of source.edges) {
      if (edge.type !== FOUNDED) continue;
      const left = nodeById.get(edge.source);
      const right = nodeById.get(edge.target);
      if (!left || !right) continue;
      if (left.type !== "person" && right.type !== "person") continue;
      if (left.type !== "company" && right.type !== "company") continue;

      const companyId = left.type === "company" ? left.id : right.id;
      const personId = left.type === "person" ? left.id : right.id;
      if (!keptNodeIds.has(companyId)) continue;

      keptNodeIds.add(personId);
      if (!keptEdgeIds.has(edge.id)) {
        expandedEdges.push(edge);
        keptEdgeIds.add(edge.id);
      }
    }

    const nodes = source.nodes.filter((node) => keptNodeIds.has(node.id));
    const nodeIdSet = new Set(nodes.map((node) => node.id));
    return {
      nodes,
      edges: expandedEdges.filter((edge) => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target)),
    };
  }

  const seedIds = new Set(highlightedNodeIds);
  for (const edge of source.edges) {
    if (!highlightedEdgeIds.has(edge.id)) continue;
    seedIds.add(edge.source);
    seedIds.add(edge.target);
  }
  if (!seedIds.size) return null;

  const boundedDepth = Math.max(1, Math.floor(hopDepth));
  const keepNodeIds = collectHopNeighborhood(buildAdjacency(source.edges), Array.from(seedIds), boundedDepth);
  for (const highlightedNodeId of highlightedNodeIds) {
    keepNodeIds.add(highlightedNodeId);
  }

  const nodes = source.nodes.filter((node) => keepNodeIds.has(node.id));
  const nodeIdSet = new Set(nodes.map((node) => node.id));
  const edges = source.edges.filter((edge) => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target));
  if (!edges.length) {
    return {
      nodes,
      edges: [],
    };
  }

  return {
    nodes,
    edges,
  };
}

function runPathQuery(query: string, graph: GraphAnalyzerData, left: string, right: string): GraphAnalyzerQueryResult {
  const leftNode = findBestNode(graph, left);
  const rightNode = findBestNode(graph, right);

  if (!leftNode || !rightNode) {
    return {
      query,
      summary: "Path query could not match both entities in the current view.",
      highlightedNodeIds: [],
      highlightedEdgeIds: [],
      steps: [],
      explain: {
        intent: "path",
        entities: [left, right].filter(Boolean),
      },
    };
  }

  const path = shortestPath(graph, leftNode.id, rightNode.id);
  if (!path?.length) {
    return {
      query,
      summary: `No path found between ${leftNode.label} and ${rightNode.label} in the filtered graph.`,
      highlightedNodeIds: [leftNode.id, rightNode.id],
      highlightedEdgeIds: [],
      steps: [],
      explain: {
        intent: "path",
        entities: [leftNode.label, rightNode.label],
      },
    };
  }

  const edgeIds: string[] = [];
  const steps: string[] = [];

  for (let idx = 0; idx < path.length - 1; idx += 1) {
    const sourceId = path[idx];
    const targetId = path[idx + 1];
    const edge = edgeByEndpoints(graph, sourceId, targetId);
    if (!edge) continue;

    edgeIds.push(edge.id);
    const sourceNode = graph.nodes.find((node) => node.id === sourceId);
    const targetNode = graph.nodes.find((node) => node.id === targetId);
    if (!sourceNode || !targetNode) continue;

    steps.push(`Step ${idx + 1}: ${sourceNode.label} ${edgeNarrative(edge)} ${targetNode.label}.`);
  }

  return {
    query,
    summary: `Shortest path spans ${Math.max(0, path.length - 1)} hops between ${leftNode.label} and ${rightNode.label}.`,
    highlightedNodeIds: path,
    highlightedEdgeIds: edgeIds,
    steps,
    focusNodeId: leftNode.id,
    explain: {
      intent: "path",
      entities: [leftNode.label, rightNode.label],
    },
  };
}

function runFundsThemeQuery(query: string, graph: GraphAnalyzerData, theme: string): GraphAnalyzerQueryResult {
  const normalizedTheme = normalizeToken(theme);
  const themeMatches = graph.nodes.filter((node) => {
    if (node.type !== "theme" && node.type !== "signal" && node.type !== "company") return false;
    return normalizeToken(node.label).includes(normalizedTheme);
  });

  const fundMatches = graph.nodes.filter((node) => {
    if (node.type !== "fund") return false;
    const label = normalizeToken(node.label);
    if (label.includes(normalizedTheme)) return true;

    const sectors = asStringArray(node.meta?.sectors).map((entry) => normalizeToken(entry));
    if (sectors.some((entry) => entry.includes(normalizedTheme) || normalizedTheme.includes(entry))) return true;

    const stages = asStringArray(node.meta?.stages).map((entry) => normalizeToken(entry));
    return stages.some((entry) => entry.includes(normalizedTheme) || normalizedTheme.includes(entry));
  });

  if (!themeMatches.length && !fundMatches.length) {
    return {
      query,
      summary: `No matching theme or signal found for "${theme}".`,
      highlightedNodeIds: [],
      highlightedEdgeIds: [],
      steps: [],
      explain: {
        intent: "funds_in_theme",
        entities: [theme].filter(Boolean),
      },
    };
  }

  const adjacency = buildAdjacency(graph.edges);
  const seeds = themeMatches.length ? themeMatches.map((node) => node.id) : fundMatches.map((node) => node.id);
  const neighborhood = collectHopNeighborhood(adjacency, seeds, themeMatches.length ? 2 : 1);
  const funds = themeMatches.length
    ? graph.nodes.filter((node) => node.type === "fund" && neighborhood.has(node.id))
    : fundMatches;
  const linkedCompanies = graph.nodes.filter((node) => node.type === "company" && neighborhood.has(node.id));
  const highlightSet = new Set<string>([...seeds, ...funds.map((fund) => fund.id), ...linkedCompanies.map((company) => company.id)]);

  const incidentEdges = collectIncidentEdges(graph, highlightSet).map((edge) => edge.id);
  const sampleFundNames = funds.slice(0, 6).map((fund) => fund.label);
  const summary = themeMatches.length
    ? `Found ${funds.length} fund${funds.length === 1 ? "" : "s"} with proximity to "${theme}" signals.`
    : `Matched ${funds.length} fund${funds.length === 1 ? "" : "s"} by sector/stage relevance for "${theme}".`;

  return {
    query,
    summary,
    highlightedNodeIds: Array.from(highlightSet),
    highlightedEdgeIds: incidentEdges,
    steps: sampleFundNames.length ? [`Likely active funds: ${sampleFundNames.join(", ")}.`] : [],
    focusNodeId: funds[0]?.id ?? themeMatches[0]?.id ?? fundMatches[0]?.id,
    explain: {
      intent: "funds_in_theme",
      entities: [theme, ...sampleFundNames.slice(0, 2)].filter(Boolean),
    },
  };
}

function runFundPortfolioQuery(query: string, graph: GraphAnalyzerData, fundRef: string): GraphAnalyzerQueryResult {
  const fund = findBestNode(graph, fundRef, ["fund"]);
  if (!fund) {
    return {
      query,
      summary: `No fund match found for "${fundRef}".`,
      highlightedNodeIds: [],
      highlightedEdgeIds: [],
      steps: [],
      strictNodeOnly: true,
      explain: {
        intent: "companies_invested_by_fund",
        entities: [fundRef].filter(Boolean),
      },
    };
  }

  const investmentEdges = graph.edges
    .filter((edge) => edge.type === INVESTED_IN && (edge.source === fund.id || edge.target === fund.id))
    .sort((left, right) => {
      const rightCitations = asNumber(right.meta?.citationCount);
      const leftCitations = asNumber(left.meta?.citationCount);
      if (rightCitations !== leftCitations) return rightCitations - leftCitations;
      return asNumber(right.weight) - asNumber(left.weight);
    });

  const rankedCompanies = investmentEdges
    .map((edge) => {
      const companyId = edge.source === fund.id ? edge.target : edge.source;
      const companyNode = graph.nodes.find((node) => node.id === companyId && node.type === "company");
      return {
        edge,
        companyNode,
      };
    })
    .filter((entry): entry is { edge: GraphAnalyzerEdge; companyNode: GraphAnalyzerNode } => Boolean(entry.companyNode))
    .slice(0, 18);

  if (!rankedCompanies.length) {
    return {
      query,
      summary: `${fund.label} has no portfolio company links in the current filtered graph.`,
      highlightedNodeIds: [fund.id],
      highlightedEdgeIds: [],
      steps: [],
      focusNodeId: fund.id,
      strictNodeOnly: true,
      explain: {
        intent: "companies_invested_by_fund",
        entities: [fund.label],
      },
    };
  }

  const highlightedNodeIds = [fund.id, ...rankedCompanies.map((entry) => entry.companyNode.id)];
  const highlightedEdgeIds = rankedCompanies.map((entry) => entry.edge.id);
  const steps = rankedCompanies
    .slice(0, 6)
    .map((entry, idx) => `Step ${idx + 1}: ${fund.label} invested in ${entry.companyNode.label}.`);

  return {
    query,
    summary: `Found ${rankedCompanies.length} portfolio companies funded by ${fund.label}.`,
    highlightedNodeIds,
    highlightedEdgeIds,
    steps,
    focusNodeId: fund.id,
    strictNodeOnly: true,
    explain: {
      intent: "companies_invested_by_fund",
      entities: [fund.label],
    },
  };
}

function runFoundersBackedByFundQuery(query: string, graph: GraphAnalyzerData, fundRef: string): GraphAnalyzerQueryResult {
  const fund = findBestNode(graph, fundRef, ["fund"]);
  if (!fund) {
    return {
      query,
      summary: `No fund match found for "${fundRef}".`,
      highlightedNodeIds: [],
      highlightedEdgeIds: [],
      steps: [],
      strictNodeOnly: true,
      explain: {
        intent: "founders_backed_by_fund",
        entities: [fundRef].filter(Boolean),
      },
    };
  }

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const investmentEdges = graph.edges
    .filter((edge) => edge.type === INVESTED_IN && (edge.source === fund.id || edge.target === fund.id))
    .sort((left, right) => {
      const rightCitations = asNumber(right.meta?.citationCount);
      const leftCitations = asNumber(left.meta?.citationCount);
      if (rightCitations !== leftCitations) return rightCitations - leftCitations;
      return asNumber(right.weight) - asNumber(left.weight);
    });

  const companyById = new Map<string, GraphAnalyzerNode>();
  for (const edge of investmentEdges) {
    const companyId = edge.source === fund.id ? edge.target : edge.source;
    const companyNode = nodeById.get(companyId);
    if (!companyNode || companyNode.type !== "company") continue;
    companyById.set(companyId, companyNode);
  }

  if (!companyById.size) {
    return {
      query,
      summary: `${fund.label} has no portfolio company links in the current filtered graph.`,
      highlightedNodeIds: [fund.id],
      highlightedEdgeIds: [],
      steps: [],
      focusNodeId: fund.id,
      strictNodeOnly: true,
      explain: {
        intent: "founders_backed_by_fund",
        entities: [fund.label],
      },
    };
  }

  const foundedEdges = graph.edges
    .filter((edge) => edge.type === FOUNDED)
    .filter((edge) => companyById.has(edge.source) || companyById.has(edge.target));

  const founderRows: Array<{
    person: GraphAnalyzerNode;
    company: GraphAnalyzerNode;
    foundedEdge: GraphAnalyzerEdge;
    investEdge: GraphAnalyzerEdge;
  }> = [];

  for (const edge of foundedEdges) {
    const personId = companyById.has(edge.source) ? edge.target : edge.source;
    const companyId = companyById.has(edge.source) ? edge.source : edge.target;
    const personNode = nodeById.get(personId);
    const companyNode = companyById.get(companyId);
    if (!personNode || personNode.type !== "person" || !companyNode) continue;

    const investEdge = investmentEdges.find(
      (candidate) =>
        candidate.type === INVESTED_IN &&
        ((candidate.source === fund.id && candidate.target === companyId) || (candidate.target === fund.id && candidate.source === companyId))
    );
    if (!investEdge) continue;

    founderRows.push({
      person: personNode,
      company: companyNode,
      foundedEdge: edge,
      investEdge,
    });
  }

  if (!founderRows.length) {
    const rankedCompanies = Array.from(companyById.values()).slice(0, 12);
    return {
      query,
      summary: `${fund.label} has portfolio companies, but no founder-person links are available in this graph view.`,
      highlightedNodeIds: [fund.id, ...rankedCompanies.map((company) => company.id)],
      highlightedEdgeIds: investmentEdges
        .filter((edge) => {
          const companyId = edge.source === fund.id ? edge.target : edge.source;
          return rankedCompanies.some((company) => company.id === companyId);
        })
        .map((edge) => edge.id),
      steps: [],
      focusNodeId: fund.id,
      strictNodeOnly: true,
      explain: {
        intent: "founders_backed_by_fund",
        entities: [fund.label],
      },
    };
  }

  const rankedRows = founderRows
    .sort((left, right) => {
      const rightCitations = asNumber(right.investEdge.meta?.citationCount) + asNumber(right.foundedEdge.meta?.citationCount);
      const leftCitations = asNumber(left.investEdge.meta?.citationCount) + asNumber(left.foundedEdge.meta?.citationCount);
      if (rightCitations !== leftCitations) return rightCitations - leftCitations;
      return asNumber(right.investEdge.weight) - asNumber(left.investEdge.weight);
    })
    .slice(0, 24);

  const highlightedNodeIds = new Set<string>([fund.id]);
  const highlightedEdgeIds = new Set<string>();
  for (const row of rankedRows) {
    highlightedNodeIds.add(row.person.id);
    highlightedNodeIds.add(row.company.id);
    highlightedEdgeIds.add(row.investEdge.id);
    highlightedEdgeIds.add(row.foundedEdge.id);
  }

  const steps = rankedRows
    .slice(0, 6)
    .map((row, idx) => `Step ${idx + 1}: ${fund.label} invested in ${row.company.label}; ${row.person.label} is linked as founder.`);

  return {
    query,
    summary: `Found ${rankedRows.length} founder-linked profile${rankedRows.length === 1 ? "" : "s"} connected to ${fund.label}'s portfolio.`,
    highlightedNodeIds: Array.from(highlightedNodeIds),
    highlightedEdgeIds: Array.from(highlightedEdgeIds),
    steps,
    focusNodeId: fund.id,
    strictNodeOnly: true,
    explain: {
      intent: "founders_backed_by_fund",
      entities: [fund.label],
    },
  };
}

function runCompaniesLinkedQuery(query: string, graph: GraphAnalyzerData, entity: string): GraphAnalyzerQueryResult {
  const match = findBestNode(graph, entity);
  if (!match) {
    return {
      query,
      summary: `No entity match found for "${entity}".`,
      highlightedNodeIds: [],
      highlightedEdgeIds: [],
      steps: [],
      explain: {
        intent: "companies_linked",
        entities: [entity].filter(Boolean),
      },
    };
  }

  const companyFundMap = new Map<string, Set<string>>();
  const fundCompanyMap = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (edge.type !== INVESTED_IN) continue;
    const sourceNode = graph.nodes.find((node) => node.id === edge.source);
    const targetNode = graph.nodes.find((node) => node.id === edge.target);
    if (!sourceNode || !targetNode) continue;

    const companyId = sourceNode.type === "company" ? sourceNode.id : targetNode.type === "company" ? targetNode.id : "";
    const fundId = sourceNode.type === "fund" ? sourceNode.id : targetNode.type === "fund" ? targetNode.id : "";
    if (!companyId || !fundId) continue;

    const funds = companyFundMap.get(companyId) ?? new Set<string>();
    funds.add(fundId);
    companyFundMap.set(companyId, funds);

    const companies = fundCompanyMap.get(fundId) ?? new Set<string>();
    companies.add(companyId);
    fundCompanyMap.set(fundId, companies);
  }

  const wantsFundResults = /\b(?:funds?|investors?)\b/i.test(query) || /\bco[\s-]?invest(?:s|ed|ing|ors?)?\b/i.test(query);
  if (wantsFundResults || match.type === "person") {
    const anchorCompanyIds = new Set<string>();
    if (match.type === "company") {
      anchorCompanyIds.add(match.id);
    } else if (match.type === "person") {
      for (const edge of graph.edges) {
        if (edge.type !== FOUNDED) continue;
        const companyId = edge.source === match.id ? edge.target : edge.target === match.id ? edge.source : "";
        const companyNode = graph.nodes.find((node) => node.id === companyId);
        if (companyNode?.type === "company") {
          anchorCompanyIds.add(companyId);
        }
      }
    } else if (match.type === "fund") {
      for (const edge of graph.edges) {
        if (edge.type !== INVESTED_IN) continue;
        const companyId = edge.source === match.id ? edge.target : edge.target === match.id ? edge.source : "";
        const companyNode = graph.nodes.find((node) => node.id === companyId);
        if (companyNode?.type === "company") {
          anchorCompanyIds.add(companyId);
        }
      }
    }

    const rankedFunds = graph.nodes
      .filter((node) => node.type === "fund" && node.id !== match.id)
      .map((fundNode) => {
        const sharedCompanies: string[] = [];
        for (const companyId of anchorCompanyIds) {
          const companyFunds = companyFundMap.get(companyId) ?? new Set<string>();
          if (companyFunds.has(fundNode.id)) sharedCompanies.push(companyId);
        }
        const citationScore = graph.edges
          .filter(
            (edge) =>
              edge.type === INVESTED_IN &&
              ((edge.source === fundNode.id && sharedCompanies.includes(edge.target)) ||
                (edge.target === fundNode.id && sharedCompanies.includes(edge.source)))
          )
          .reduce((sum, edge) => sum + asNumber(edge.meta?.citationCount), 0);
        const score = sharedCompanies.length * 24 + citationScore * 4 + asNumber(fundNode.meta?.trendScore) * 0.2;
        return {
          fundNode,
          sharedCompanies,
          score,
        };
      })
      .filter((entry) => entry.sharedCompanies.length > 0)
      .sort((left, right) => right.score - left.score || left.fundNode.label.localeCompare(right.fundNode.label))
      .slice(0, 10);

    const highlightedNodeIds = new Set<string>([match.id]);
    const highlightedEdgeIds = new Set<string>();
    const steps = rankedFunds.slice(0, 6).map((entry, idx) => {
      highlightedNodeIds.add(entry.fundNode.id);
      const sampleCompanyId = entry.sharedCompanies[0];
      const sampleCompany = graph.nodes.find((node) => node.id === sampleCompanyId && node.type === "company");
      if (sampleCompany) {
        highlightedNodeIds.add(sampleCompany.id);
        const investEdge = edgeByEndpoints(graph, entry.fundNode.id, sampleCompany.id);
        if (investEdge) highlightedEdgeIds.add(investEdge.id);
        const founderEdge = edgeByEndpoints(graph, match.id, sampleCompany.id);
        if (founderEdge) highlightedEdgeIds.add(founderEdge.id);
        if (sampleCompany.id === match.id) {
          return `Step ${idx + 1}: ${entry.fundNode.label} is linked through an investment in ${match.label}.`;
        }
        return `Step ${idx + 1}: ${entry.fundNode.label} links to ${match.label} via ${sampleCompany.label}.`;
      }
      return `Step ${idx + 1}: ${entry.fundNode.label} is connected to ${match.label}.`;
    });

    if (!rankedFunds.length) {
      const fallbackEdges = collectIncidentEdges(graph, new Set([match.id])).slice(0, 18);
      for (const edge of fallbackEdges) {
        highlightedEdgeIds.add(edge.id);
        highlightedNodeIds.add(edge.source);
        highlightedNodeIds.add(edge.target);
      }
    }

    return {
      query,
      summary: `Identified ${rankedFunds.length} fund${rankedFunds.length === 1 ? "" : "s"} linked to ${match.label}.`,
      highlightedNodeIds: Array.from(highlightedNodeIds),
      highlightedEdgeIds: Array.from(highlightedEdgeIds),
      steps,
      focusNodeId: match.id,
      explain: {
        intent: "companies_linked",
        entities: [match.label],
      },
    };
  }

  const adjacency = buildAdjacency(graph.edges);
  const neighborhood = collectHopNeighborhood(adjacency, [match.id], 2);
  const matchFunds =
    match.type === "fund"
      ? new Set<string>([match.id])
      : match.type === "company"
        ? companyFundMap.get(match.id) ?? new Set<string>()
        : new Set<string>();

  const rankedCompanies = graph.nodes
    .filter((node) => node.type === "company" && node.id !== match.id)
    .map((company) => {
      const funds = companyFundMap.get(company.id) ?? new Set<string>();
      const sharedFundIds: string[] = [];
      for (const fundId of funds) {
        if (matchFunds.has(fundId)) sharedFundIds.push(fundId);
      }
      const isNearby = neighborhood.has(company.id);
      const score = sharedFundIds.length * 24 + Math.min(10, funds.size) + (isNearby ? 8 : 0);
      return { company, score, sharedFundIds, funds: Array.from(funds), isNearby };
    })
    .filter((entry) => entry.isNearby || entry.sharedFundIds.length > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.sharedFundIds.length - left.sharedFundIds.length ||
        left.company.label.localeCompare(right.company.label)
    );

  let selectedCompanies = rankedCompanies.slice(0, 8);
  if (!selectedCompanies.length && match.type === "fund") {
    selectedCompanies = Array.from(fundCompanyMap.get(match.id) ?? [])
      .map((companyId) => graph.nodes.find((node) => node.id === companyId))
      .filter((node): node is GraphAnalyzerNode => Boolean(node))
      .slice(0, 8)
      .map((company) => ({
        company,
        score: 1,
        sharedFundIds: [match.id],
        funds: [match.id],
        isNearby: true,
      }));
  }

  const bridgeFundTouches = new Map<string, number>();
  for (const entry of selectedCompanies) {
    const funds = entry.sharedFundIds.length ? entry.sharedFundIds : entry.funds.slice(0, 1);
    for (const fundId of funds.slice(0, 2)) {
      bridgeFundTouches.set(fundId, (bridgeFundTouches.get(fundId) ?? 0) + 1);
    }
  }
  const rankedBridgeFunds = Array.from(bridgeFundTouches.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([fundId]) => fundId)
    .slice(0, 8);

  const selectedCompanyIds = new Set<string>([match.id, ...selectedCompanies.map((entry) => entry.company.id)]);
  const highlighted = new Set<string>([...selectedCompanyIds, ...rankedBridgeFunds]);
  const highlightedEdgeIds = new Set<string>();

  const steps = selectedCompanies.slice(0, 5).map((entry, idx) => {
    const bridgeFunds = (entry.sharedFundIds.length ? entry.sharedFundIds : entry.funds)
      .filter((fundId) => highlighted.has(fundId))
      .slice(0, 2);
    const fundNames = bridgeFunds
      .map((fundId) => graph.nodes.find((node) => node.id === fundId)?.label)
      .filter((label): label is string => Boolean(label));

    for (const fundId of bridgeFunds) {
      const companyEdge = edgeByEndpoints(graph, fundId, entry.company.id);
      if (companyEdge) highlightedEdgeIds.add(companyEdge.id);
      const anchorEdge = edgeByEndpoints(graph, fundId, match.id);
      if (anchorEdge) highlightedEdgeIds.add(anchorEdge.id);
      highlighted.add(fundId);
    }

    const directEdge = edgeByEndpoints(graph, match.id, entry.company.id);
    if (directEdge) highlightedEdgeIds.add(directEdge.id);

    if (fundNames.length) {
      return `Step ${idx + 1}: ${entry.company.label} links to ${match.label} via ${fundNames.join(" and ")}.`;
    }
    return `Step ${idx + 1}: ${entry.company.label} is adjacent to ${match.label} in the company-investor network.`;
  });

  if (!highlightedEdgeIds.size) {
    const fallbackEdges = collectIncidentEdges(graph, new Set([match.id])).slice(0, 18);
    for (const edge of fallbackEdges) {
      highlightedEdgeIds.add(edge.id);
      highlighted.add(edge.source);
      highlighted.add(edge.target);
    }
  }

  return {
    query,
    summary: `Identified ${selectedCompanies.length} high-signal companies linked to ${match.label}.`,
    highlightedNodeIds: Array.from(highlighted),
    highlightedEdgeIds: Array.from(highlightedEdgeIds),
    steps,
    focusNodeId: match.id,
    explain: {
      intent: "companies_linked",
      entities: [match.label],
    },
  };
}

function runFundedByBothQuery(query: string, graph: GraphAnalyzerData, leftFund: string, rightFund: string): GraphAnalyzerQueryResult {
  const left = findBestNode(graph, leftFund, ["fund"]);
  const right = findBestNode(graph, rightFund, ["fund"]);

  if (!left || !right) {
    return {
      query,
      summary: "Both fund names must resolve to nodes in the active graph.",
      highlightedNodeIds: [],
      highlightedEdgeIds: [],
      steps: [],
      explain: {
        intent: "companies_funded_by_both",
        entities: [leftFund, rightFund].filter(Boolean),
      },
    };
  }

  const leftCompanies = new Set(
    graph.edges
      .filter((edge) => edge.type === INVESTED_IN && (edge.source === left.id || edge.target === left.id))
      .map((edge) => {
        const other = edge.source === left.id ? edge.target : edge.source;
        return other;
      })
  );

  const rightCompanies = new Set(
    graph.edges
      .filter((edge) => edge.type === INVESTED_IN && (edge.source === right.id || edge.target === right.id))
      .map((edge) => {
        const other = edge.source === right.id ? edge.target : edge.source;
        return other;
      })
  );

  const sharedCompanyIds = Array.from(leftCompanies).filter((id) => rightCompanies.has(id));
  const highlightedNodes = new Set<string>([left.id, right.id, ...sharedCompanyIds]);
  const highlightedEdges = graph.edges
    .filter(
      (edge) =>
        highlightedNodes.has(edge.source) &&
        highlightedNodes.has(edge.target) &&
        (edge.type === INVESTED_IN || edge.type === CO_INVESTED)
    )
    .map((edge) => edge.id);

  const sharedCompanyNames = sharedCompanyIds
    .map((id) => graph.nodes.find((node) => node.id === id)?.label)
    .filter((name): name is string => Boolean(name));

  if (!sharedCompanyIds.length) {
    const fallbackPath = shortestPath(graph, left.id, right.id);
    if (fallbackPath && fallbackPath.length > 1) {
      const edgeIds: string[] = [];
      const steps: string[] = [];

      for (let idx = 0; idx < fallbackPath.length - 1; idx += 1) {
        const sourceId = fallbackPath[idx];
        const targetId = fallbackPath[idx + 1];
        const edge = edgeByEndpoints(graph, sourceId, targetId);
        if (!edge) continue;
        edgeIds.push(edge.id);
        const sourceNode = graph.nodes.find((node) => node.id === sourceId);
        const targetNode = graph.nodes.find((node) => node.id === targetId);
        if (!sourceNode || !targetNode) continue;
        steps.push(`Step ${idx + 1}: ${sourceNode.label} ${edgeNarrative(edge)} ${targetNode.label}.`);
      }

      return {
        query,
        summary: `${left.label} and ${right.label} have no direct shared companies; nearest relationship path spans ${Math.max(
          0,
          fallbackPath.length - 1
        )} hops.`,
        highlightedNodeIds: fallbackPath,
        highlightedEdgeIds: edgeIds,
        steps,
        focusNodeId: left.id,
        explain: {
          intent: "companies_funded_by_both",
          entities: [left.label, right.label],
        },
      };
    }

    const adjacency = buildAdjacency(graph.edges);
    const neighborhood = collectHopNeighborhood(adjacency, [left.id, right.id], 1);
    const highlightedNodes = Array.from(neighborhood);
    const highlightedEdges = collectIncidentEdges(graph, new Set(highlightedNodes))
      .filter((edge) => neighborhood.has(edge.source) && neighborhood.has(edge.target))
      .map((edge) => edge.id);

    return {
      query,
      summary: `${left.label} and ${right.label} share 0 company bets. Showing immediate neighborhoods for both funds.`,
      highlightedNodeIds: highlightedNodes,
      highlightedEdgeIds: highlightedEdges,
      steps: [],
      focusNodeId: left.id,
      explain: {
        intent: "companies_funded_by_both",
        entities: [left.label, right.label],
      },
    };
  }

  return {
    query,
    summary: `${left.label} and ${right.label} share ${sharedCompanyIds.length} company bet${sharedCompanyIds.length === 1 ? "" : "s"}.`,
    highlightedNodeIds: Array.from(highlightedNodes),
    highlightedEdgeIds: highlightedEdges,
    steps: sharedCompanyNames.slice(0, 6).map((company, idx) => `Step ${idx + 1}: Shared portfolio company ${company}.`),
    focusNodeId: left.id,
    explain: {
      intent: "companies_funded_by_both",
      entities: [left.label, right.label],
    },
  };
}

function runGenericSearch(query: string, graph: GraphAnalyzerData, phrase: string): GraphAnalyzerQueryResult {
  const normalizedPhrase = normalizeToken(phrase);
  if (!normalizedPhrase) {
    return {
      query,
      summary: "Query is empty after normalization.",
      highlightedNodeIds: [],
      highlightedEdgeIds: [],
      steps: [],
      explain: {
        intent: "search",
        entities: [],
      },
    };
  }

  const tokens = uniqueQueryTokens(phrase);
  const scoredMatches = graph.nodes
    .map((node) => {
      const label = normalizeToken(node.label);
      if (!label) return null;

      let score = 0;
      if (label === normalizedPhrase) score += 140;
      if (label.startsWith(normalizedPhrase)) score += 90;
      if (label.includes(normalizedPhrase)) score += 70;

      const tokenHits = tokens.filter((token) => label.includes(token)).length;
      if (tokenHits > 0) {
        score += tokenHits * 18;
        if (tokenHits === tokens.length && tokens.length > 0) {
          score += 25;
        }
      }

      return score > 0 ? { node, score } : null;
    })
    .filter((entry): entry is { node: GraphAnalyzerNode; score: number } => Boolean(entry))
    .sort((left, right) => right.score - left.score || left.node.label.localeCompare(right.node.label));

  const matches = scoredMatches.slice(0, 28).map((entry) => entry.node);
  if (!matches.length) {
    const fallback = findBestNode(graph, phrase);
    if (fallback) {
      const fallbackNodes = new Set<string>([fallback.id]);
      const fallbackEdges = collectIncidentEdges(graph, fallbackNodes).slice(0, 36);
      for (const edge of fallbackEdges) {
        fallbackNodes.add(edge.source);
        fallbackNodes.add(edge.target);
      }
      return {
        query,
        summary: `No exact phrase match for "${phrase}". Showing closest entity: ${fallback.label}.`,
        highlightedNodeIds: Array.from(fallbackNodes),
        highlightedEdgeIds: fallbackEdges.map((edge) => edge.id),
        steps: [],
        focusNodeId: fallback.id,
        explain: {
          intent: "search",
          entities: [fallback.label],
        },
      };
    }
  }

  const topEntry = scoredMatches[0];
  const runnerUpEntry = scoredMatches[1];
  if (topEntry) {
    const topNode = topEntry.node;
    const topLabel = normalizeToken(topNode.label);
    const highConfidenceTopMatch =
      topLabel === normalizedPhrase ||
      matches.length === 1 ||
      !runnerUpEntry ||
      topEntry.score >= runnerUpEntry.score + 25;

    if (highConfidenceTopMatch) {
      const seedNodeIds = equivalentSeedNodeIdsForSearch(graph, topNode, phrase);
      const seedNodeIdSet = new Set(seedNodeIds);
      const adjacency = buildAdjacency(graph.edges);
      const oneHopNodeIds = collectHopNeighborhood(adjacency, seedNodeIds, 1);
      const oneHopEdges = graph.edges.filter(
        (edge) =>
          (seedNodeIdSet.has(edge.source) || seedNodeIdSet.has(edge.target)) &&
          oneHopNodeIds.has(edge.source) &&
          oneHopNodeIds.has(edge.target)
      );

      return {
        query,
        summary: `Showing 1-hop relationships connected to ${topNode.label}.`,
        highlightedNodeIds: Array.from(oneHopNodeIds),
        highlightedEdgeIds: oneHopEdges.map((edge) => edge.id),
        steps: [],
        focusNodeId: topNode.id,
        strictNodeOnly: true,
        explain: {
          intent: "search",
          entities: [topNode.label],
        },
      };
    }
  }

  const highlightedNodes = new Set(matches.map((node) => node.id));
  const edges = collectIncidentEdges(graph, highlightedNodes);

  for (const edge of edges) {
    highlightedNodes.add(edge.source);
    highlightedNodes.add(edge.target);
  }

  return {
    query,
    summary: `Matched ${matches.length} node${matches.length === 1 ? "" : "s"} for "${phrase}".`,
    highlightedNodeIds: Array.from(highlightedNodes),
    highlightedEdgeIds: edges.map((edge) => edge.id),
    steps: [],
    focusNodeId: matches[0]?.id,
    explain: {
      intent: "search",
      entities: matches.slice(0, 2).map((node) => node.label),
    },
  };
}

export function runGraphQuery(query: string, graph: GraphAnalyzerData): GraphAnalyzerQueryResult {
  const command = parseQuery(query, graph);

  if (command.kind === "path") {
    return runPathQuery(query, graph, command.left, command.right);
  }
  if (command.kind === "funds_in_theme") {
    return runFundsThemeQuery(query, graph, command.theme);
  }
  if (command.kind === "companies_linked") {
    return runCompaniesLinkedQuery(query, graph, command.entity);
  }
  if (command.kind === "companies_invested_by_fund") {
    return runFundPortfolioQuery(query, graph, command.fund);
  }
  if (command.kind === "founders_backed_by_fund") {
    return runFoundersBackedByFundQuery(query, graph, command.fund);
  }
  if (command.kind === "companies_funded_by_both") {
    return runFundedByBothQuery(query, graph, command.leftFund, command.rightFund);
  }
  return runGenericSearch(query, graph, command.phrase);
}

export function degreeByNode(graph: GraphAnalyzerData): Map<string, number> {
  const degree = new Map<string, number>();
  for (const node of graph.nodes) {
    degree.set(node.id, 0);
  }
  for (const edge of graph.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  return degree;
}

function nodePriorityScore(node: GraphAnalyzerNode, degree: Map<string, number>): number {
  const degreeScore = degree.get(node.id) ?? 0;
  const trend = asNumber(node.meta?.trendScore);
  const confidence = asNumber(node.meta?.confidence);
  const momentum = asNumber(node.meta?.momentumScore);
  const portfolioCount = asNumber(node.meta?.portfolioCount);
  const baseTypeBonus =
    node.type === "fund"
      ? 14
      : node.type === "company"
        ? 12
        : node.type === "theme"
          ? 9
          : node.type === "signal"
            ? 8
            : node.type === "person"
              ? 6
              : 4;
  return degreeScore * 8 + trend * 0.8 + confidence * 110 + momentum * 0.6 + portfolioCount * 0.8 + baseTypeBonus;
}

function edgeStrengthScore(edge: GraphAnalyzerEdge): number {
  const weight = asNumber(edge.weight) || 0.6;
  const sharedCount = asNumber(edge.meta?.sharedCount);
  const citationCount = asNumber(edge.meta?.citationCount);
  const verified = edge.meta?.verified ? 1 : 0;
  const typeBonus =
    edge.type === CO_INVESTED
      ? 9
      : edge.type === INVESTED_IN
        ? 8
        : edge.type === SUPPORTED_BY
          ? 6
          : edge.type === FOUNDED
            ? 5
            : edge.type === MENTIONS
              ? 4
              : 3;
  return weight * 14 + sharedCount * 2.2 + citationCount * 1.8 + verified * 2.5 + typeBonus;
}

function limitByScore(
  nodeIds: Set<string>,
  nodeById: Map<string, GraphAnalyzerNode>,
  degree: Map<string, number>,
  keepAtLeast: Set<string>,
  limit: number
): Set<string> {
  if (nodeIds.size <= limit) return nodeIds;
  const ranked = Array.from(nodeIds)
    .map((id) => nodeById.get(id))
    .filter((node): node is GraphAnalyzerNode => Boolean(node))
    .sort((left, right) => nodePriorityScore(right, degree) - nodePriorityScore(left, degree));

  const next = new Set<string>(Array.from(keepAtLeast).filter((id) => nodeIds.has(id)));
  for (const node of ranked) {
    if (next.size >= limit) break;
    next.add(node.id);
  }
  return next;
}

function presetSeedNodes(
  graph: GraphAnalyzerData,
  presetId: GraphAnalyzerPresetId,
  degree: Map<string, number>,
  maxNodes: number
): Set<string> {
  const byType = new Map<GraphAnalyzerNode["type"], GraphAnalyzerNode[]>();
  for (const node of graph.nodes) {
    const bucket = byType.get(node.type) ?? [];
    bucket.push(node);
    byType.set(node.type, bucket);
  }

  for (const [type, nodes] of byType.entries()) {
    nodes.sort((left, right) => nodePriorityScore(right, degree) - nodePriorityScore(left, degree));
    byType.set(type, nodes);
  }

  const seeds = new Set<string>();
  const take = (type: GraphAnalyzerNode["type"], count: number) => {
    for (const node of (byType.get(type) ?? []).slice(0, count)) {
      seeds.add(node.id);
      if (seeds.size >= maxNodes) break;
    }
  };

  if (presetId === "CO_INVESTMENT") {
    take("fund", 9);
    take("company", 8);
  } else if (presetId === "FOUNDER_NETWORK") {
    take("person", 7);
    take("company", 7);
    take("fund", 5);
  } else if (presetId === "THEME_MAP") {
    take("theme", 5);
    take("fund", 5);
    take("company", 4);
    take("signal", 4);
  } else if (presetId === "PORTFOLIO_OVERLAP") {
    take("fund", 2);
    take("company", maxNodes);
  } else {
    take("signal", 6);
    take("fund", 6);
    take("company", 6);
  }

  if (seeds.size < Math.min(6, maxNodes)) {
    const fallback = [...graph.nodes]
      .sort((left, right) => nodePriorityScore(right, degree) - nodePriorityScore(left, degree))
      .slice(0, maxNodes);
    for (const node of fallback) {
      seeds.add(node.id);
      if (seeds.size >= maxNodes) break;
    }
  }

  return seeds;
}

function aggregateOverviewSatellites(
  graph: GraphAnalyzerData,
  presetId: GraphAnalyzerPresetId,
  keptNodeIds: Set<string>,
  degree: Map<string, number>,
  maxEdges: number
): GraphDisplayResult {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const keptNodes = graph.nodes.filter((node) => keptNodeIds.has(node.id));
  const keptEdges = graph.edges
    .filter((edge) => keptNodeIds.has(edge.source) && keptNodeIds.has(edge.target))
    .sort((left, right) => edgeStrengthScore(right) - edgeStrengthScore(left))
    .slice(0, Math.max(8, maxEdges));

  if (!keptNodes.length) {
    return {
      graph: { nodes: [], edges: [] },
      labelNodeIds: [],
      aggregatedNodeIds: [],
    };
  }

  const anchorCandidates = keptNodes
    .filter((node) => node.type === "fund" || node.type === "theme" || node.type === "signal")
    .sort((left, right) => nodePriorityScore(right, degree) - nodePriorityScore(left, degree))
    .slice(0, presetId === "PORTFOLIO_OVERLAP" ? 2 : 4);

  const aggregateNodes: GraphAnalyzerNode[] = [];
  const aggregateEdges: GraphAnalyzerEdge[] = [];
  const aggregateNodeIds: string[] = [];
  const maxAggregateNodes = presetId === "SIGNAL_DIFFUSION" ? 6 : 5;

  for (const anchor of anchorCandidates) {
    if (aggregateNodes.length >= maxAggregateNodes) break;
    const omittedByType = new Map<GraphAnalyzerNode["type"], number>();
    for (const edge of graph.edges) {
      if (edge.source !== anchor.id && edge.target !== anchor.id) continue;
      const neighborId = edge.source === anchor.id ? edge.target : edge.source;
      if (keptNodeIds.has(neighborId)) continue;
      const neighbor = nodesById.get(neighborId);
      if (!neighbor) continue;
      omittedByType.set(neighbor.type, (omittedByType.get(neighbor.type) ?? 0) + 1);
    }

    for (const [type, count] of omittedByType.entries()) {
      if (aggregateNodes.length >= maxAggregateNodes) break;
      if (count < 3) continue;
      const aggregateId = `aggregate:${anchor.id}:${type}`;
      aggregateNodeIds.push(aggregateId);
      aggregateNodes.push({
        id: aggregateId,
        type,
        label: `+${count} ${type}${count === 1 ? "" : "s"}`,
        meta: {
          aggregate: true,
          aggregateCount: count,
          aggregateType: type,
          aggregateAnchorId: anchor.id,
        },
      });

      const edgeType =
        type === "company"
          ? INVESTED_IN
          : type === "fund"
            ? CO_INVESTED
            : type === "person"
              ? FOUNDED
              : MENTIONS;
      aggregateEdges.push({
        id: `aggregate-edge:${anchor.id}:${type}`,
        source: anchor.id,
        target: aggregateId,
        type: edgeType,
        weight: 0.45,
        meta: {
          aggregate: true,
          aggregateCount: count,
          metricEligible: false,
        },
      });
    }
  }

  const allNodes = [...keptNodes, ...aggregateNodes];
  const allEdges = [...keptEdges, ...aggregateEdges].slice(0, Math.max(10, maxEdges));
  const allDegree = degreeByNode({ nodes: allNodes, edges: allEdges });
  const labelNodeIds = allNodes
    .filter((node) => !node.meta?.aggregate)
    .sort((left, right) => nodePriorityScore(right, allDegree) - nodePriorityScore(left, allDegree))
    .slice(0, 16)
    .map((node) => node.id);

  return {
    graph: {
      nodes: allNodes,
      edges: allEdges,
    },
    labelNodeIds,
    aggregatedNodeIds: aggregateNodeIds,
  };
}

export function buildGraphDisplayResult(
  graph: GraphAnalyzerData,
  options: GraphDisplayOptions
): GraphDisplayResult {
  if (!graph.nodes.length) {
    return {
      graph,
      labelNodeIds: [],
      aggregatedNodeIds: [],
    };
  }

  const maxNodes =
    options.mode === "overview"
      ? options.maxOverviewNodes ?? 18
      : options.mode === "focus"
        ? 32
        : 46;
  const maxEdges =
    options.mode === "overview"
      ? options.maxOverviewEdges ?? 44
      : options.mode === "focus"
        ? 72
        : 110;

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const degree = degreeByNode(graph);
  const highlightedNodeIds = new Set(options.highlightedNodeIds ?? []);
  const highlightedEdgeIds = new Set(options.highlightedEdgeIds ?? []);
  const requiredNodeIds = new Set<string>();
  const selectedNode = options.selectedNodeId ? nodeById.get(options.selectedNodeId) : undefined;

  if (selectedNode) {
    requiredNodeIds.add(selectedNode.id);
  }
  if (selectedNode?.type === "company") {
    for (const edge of graph.edges) {
      if (edge.type !== FOUNDED) continue;
      if (edge.source !== selectedNode.id && edge.target !== selectedNode.id) continue;
      const personId = edge.source === selectedNode.id ? edge.target : edge.source;
      const personNode = nodeById.get(personId);
      if (personNode?.type !== "person") continue;
      requiredNodeIds.add(personId);
      highlightedEdgeIds.add(edge.id);
    }
  }
  for (const nodeId of highlightedNodeIds) {
    if (nodeById.has(nodeId)) requiredNodeIds.add(nodeId);
  }
  for (const edge of graph.edges) {
    if (!highlightedEdgeIds.has(edge.id)) continue;
    requiredNodeIds.add(edge.source);
    requiredNodeIds.add(edge.target);
  }

  const adjacency = buildAdjacency(graph.edges);
  let keptNodeIds = new Set<string>();

  if (options.mode === "overview") {
    keptNodeIds = presetSeedNodes(graph, options.presetId, degree, maxNodes);
    for (const nodeId of requiredNodeIds) {
      keptNodeIds.add(nodeId);
    }
  } else {
    const seeds = Array.from(requiredNodeIds);
    const fallbackSeed = seeds.length
      ? seeds
      : [graph.nodes.sort((left, right) => nodePriorityScore(right, degree) - nodePriorityScore(left, degree))[0]?.id].filter(Boolean) as string[];
    const configuredDepth = Math.max(1, Math.floor(options.hopDepth ?? 2));
    const depth = options.mode === "focus" ? Math.min(configuredDepth, 2) : configuredDepth;
    keptNodeIds = collectHopNeighborhood(adjacency, fallbackSeed, depth);
    for (const nodeId of requiredNodeIds) {
      keptNodeIds.add(nodeId);
    }
  }

  keptNodeIds = limitByScore(keptNodeIds, nodeById, degree, requiredNodeIds, maxNodes);

  const rankedEdges = [...graph.edges].sort((left, right) => edgeStrengthScore(right) - edgeStrengthScore(left));
  const forcedEdges = rankedEdges.filter((edge) => highlightedEdgeIds.has(edge.id)).slice(0, maxEdges);
  const keptEdges: GraphAnalyzerEdge[] = [];
  const seenEdgeIds = new Set<string>();

  for (const edge of forcedEdges) {
    if (!keptNodeIds.has(edge.source) || !keptNodeIds.has(edge.target)) continue;
    keptEdges.push(edge);
    seenEdgeIds.add(edge.id);
  }

  for (const edge of rankedEdges) {
    if (keptEdges.length >= maxEdges) break;
    if (seenEdgeIds.has(edge.id)) continue;
    if (!keptNodeIds.has(edge.source) || !keptNodeIds.has(edge.target)) continue;
    keptEdges.push(edge);
    seenEdgeIds.add(edge.id);
  }

  const trimmedNodeIds = new Set<string>(Array.from(requiredNodeIds));
  for (const edge of keptEdges) {
    trimmedNodeIds.add(edge.source);
    trimmedNodeIds.add(edge.target);
  }
  for (const nodeId of keptNodeIds) {
    if (trimmedNodeIds.size >= maxNodes) break;
    trimmedNodeIds.add(nodeId);
  }
  keptNodeIds = limitByScore(trimmedNodeIds, nodeById, degree, requiredNodeIds, maxNodes);

  if (options.mode === "overview") {
    return aggregateOverviewSatellites(graph, options.presetId, keptNodeIds, degree, maxEdges);
  }

  const keptNodes = graph.nodes.filter((node) => keptNodeIds.has(node.id));
  const filteredEdges = keptEdges.filter((edge) => keptNodeIds.has(edge.source) && keptNodeIds.has(edge.target));
  const degreeInView = degreeByNode({ nodes: keptNodes, edges: filteredEdges });
  const labelNodeIds = keptNodes
    .sort((left, right) => nodePriorityScore(right, degreeInView) - nodePriorityScore(left, degreeInView))
    .slice(0, options.mode === "focus" ? 18 : 24)
    .map((node) => node.id);

  return {
    graph: {
      nodes: keptNodes,
      edges: filteredEdges,
    },
    labelNodeIds,
    aggregatedNodeIds: [],
  };
}

export function focusOptions(graph: GraphAnalyzerData): Array<{ id: string; label: string; type: GraphAnalyzerNode["type"] }> {
  return [...graph.nodes]
    .sort((left, right) => left.label.localeCompare(right.label))
    .map((node) => ({
      id: node.id,
      label: node.label,
      type: node.type,
    }));
}

export function availableSectors(funds: Fund[]): string[] {
  return Array.from(new Set(funds.flatMap((fund) => fund.sectors))).sort((left, right) => left.localeCompare(right));
}

export function availableStages(funds: Fund[]): string[] {
  return Array.from(new Set(funds.flatMap((fund) => fund.stages))).sort((left, right) => left.localeCompare(right));
}
