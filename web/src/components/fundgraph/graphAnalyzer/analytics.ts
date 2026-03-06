import { GraphAnalyzerData, GraphAnalyzerEdge, GraphAnalyzerPresetId } from "@/components/fundgraph/graphAnalyzer/types";

export const DATA_RICHNESS_THRESHOLD = 0.7;

export interface DataReadinessSummary {
  presetId: GraphAnalyzerPresetId;
  eligibleCount: number;
  citedVerifiedCount: number;
  coverage: number;
  isRich: boolean;
  status: "ready" | "insufficient";
}

export interface VerifiedMetricCard {
  title: string;
  value: string;
  detail?: string;
  citationCount: number;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function edgeCitationCount(edge: GraphAnalyzerEdge): number {
  const fromMeta = asNumber(edge.meta?.citationCount);
  if (fromMeta > 0) return fromMeta;

  if (Array.isArray(edge.meta?.sourceRefs)) {
    return edge.meta?.sourceRefs.filter((entry): entry is { url?: string } => Boolean(entry && typeof entry === "object")).length;
  }

  return 0;
}

export function edgeIsCitedVerified(edge: GraphAnalyzerEdge): boolean {
  const explicitVerified = edge.meta?.verified === true;
  return explicitVerified && edgeCitationCount(edge) > 0;
}

function edgeIsMetricEligible(edge: GraphAnalyzerEdge): boolean {
  if (edge.meta?.metricEligible === true) return true;
  return edge.type === "INVESTED_IN" || edge.type === "CO_INVESTED" || edge.type === "SUPPORTED_BY";
}

function presetMetricTypes(presetId: GraphAnalyzerPresetId): Set<GraphAnalyzerEdge["type"]> {
  if (presetId === "CO_INVESTMENT") return new Set(["INVESTED_IN", "CO_INVESTED"]);
  if (presetId === "PORTFOLIO_OVERLAP") return new Set(["INVESTED_IN", "CO_INVESTED"]);
  if (presetId === "FOUNDER_NETWORK") return new Set(["FOUNDED", "INVESTED_IN"]);
  if (presetId === "THEME_MAP") return new Set(["SUPPORTED_BY", "MENTIONS", "INVESTED_IN"]);
  return new Set(["SUPPORTED_BY", "INVESTED_IN", "CO_INVESTED", "MENTIONS"]);
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatMoneyRange(minM?: number, maxM?: number): string {
  if (typeof minM !== "number" && typeof maxM !== "number") return "Hidden (citation required)";
  const min = typeof minM === "number" ? `$${minM.toFixed(1)}M` : "n/a";
  const max = typeof maxM === "number" ? `$${maxM.toFixed(1)}M` : "n/a";
  if (min === max) return min;
  return `${min} - ${max}`;
}

export function computeDataReadiness(graph: GraphAnalyzerData, presetId: GraphAnalyzerPresetId): DataReadinessSummary {
  const allowedTypes = presetMetricTypes(presetId);
  const eligibleEdges = graph.edges.filter((edge) => allowedTypes.has(edge.type) && edgeIsMetricEligible(edge));
  const citedVerifiedEdges = eligibleEdges.filter((edge) => edgeIsCitedVerified(edge));
  const coverage = eligibleEdges.length ? citedVerifiedEdges.length / eligibleEdges.length : 0;
  const isRich = eligibleEdges.length > 0 && coverage >= DATA_RICHNESS_THRESHOLD;

  return {
    presetId,
    eligibleCount: eligibleEdges.length,
    citedVerifiedCount: citedVerifiedEdges.length,
    coverage,
    isRich,
    status: isRich ? "ready" : "insufficient",
  };
}

function buildCoInvestmentMetrics(edges: GraphAnalyzerEdge[]): VerifiedMetricCard[] {
  const investmentEdges = edges.filter((edge) => edge.type === "INVESTED_IN");
  const coInvestEdges = edges.filter((edge) => edge.type === "CO_INVESTED");
  const stages = new Set<string>();
  let citationCount = 0;
  let amountSum = 0;
  let amountCount = 0;

  for (const edge of investmentEdges) {
    citationCount += edgeCitationCount(edge);
    const stage = asString(edge.meta?.roundStage);
    if (stage) stages.add(stage);

    const min = edge.meta?.amountMinM;
    const max = edge.meta?.amountMaxM;
    if (typeof min === "number" && typeof max === "number") {
      amountSum += (min + max) / 2;
      amountCount += 1;
    }
  }

  return [
    {
      title: "Verified Investment Links",
      value: String(investmentEdges.length),
      detail: `${stages.size || 0} stage bucket${stages.size === 1 ? "" : "s"}`,
      citationCount,
    },
    {
      title: "Verified Co-Invest Links",
      value: String(coInvestEdges.length),
      detail: coInvestEdges.length ? "Shared bets with cited overlap evidence" : "No cited overlap edges",
      citationCount: coInvestEdges.reduce((sum, edge) => sum + edgeCitationCount(edge), 0),
    },
    {
      title: "Average Verified Check Size",
      value: amountCount ? `$${(amountSum / amountCount).toFixed(2)}M` : "Hidden (citation required)",
      detail: `${amountCount} cited deals`,
      citationCount,
    },
  ];
}

function buildFounderMetrics(edges: GraphAnalyzerEdge[]): VerifiedMetricCard[] {
  const foundedEdges = edges.filter((edge) => edge.type === "FOUNDED");
  const investmentEdges = edges.filter((edge) => edge.type === "INVESTED_IN");
  const citedFounderLinks = foundedEdges.filter((edge) => edgeIsCitedVerified(edge));
  return [
    {
      title: "Founder Links",
      value: String(foundedEdges.length),
      detail: citedFounderLinks.length ? `${citedFounderLinks.length} cited founder links` : "No cited founder links yet",
      citationCount: citedFounderLinks.reduce((sum, edge) => sum + edgeCitationCount(edge), 0),
    },
    {
      title: "Verified Founder-Backed Deals",
      value: String(investmentEdges.length),
      detail: "Investment edges with citation-backed deal facts",
      citationCount: investmentEdges.reduce((sum, edge) => sum + edgeCitationCount(edge), 0),
    },
  ];
}

function buildThemeMetrics(edges: GraphAnalyzerEdge[]): VerifiedMetricCard[] {
  const supportEdges = edges.filter((edge) => edge.type === "SUPPORTED_BY");
  const mentionEdges = edges.filter((edge) => edge.type === "MENTIONS");

  return [
    {
      title: "Verified Evidence Links",
      value: String(supportEdges.length),
      detail: "Signal/source support edges with citations",
      citationCount: supportEdges.reduce((sum, edge) => sum + edgeCitationCount(edge), 0),
    },
    {
      title: "Theme Mentions (Cited Context)",
      value: String(mentionEdges.length),
      detail: mentionEdges.length ? "Theme/claim/company relationships in active subgraph" : "No mention edges",
      citationCount: mentionEdges.reduce((sum, edge) => sum + edgeCitationCount(edge), 0),
    },
  ];
}

function buildSignalDiffusionMetrics(edges: GraphAnalyzerEdge[]): VerifiedMetricCard[] {
  const supportEdges = edges.filter((edge) => edge.type === "SUPPORTED_BY");
  const investmentEdges = edges.filter((edge) => edge.type === "INVESTED_IN");
  return [
    {
      title: "Verified Diffusion Support",
      value: String(supportEdges.length),
      detail: "Signal/source citations driving spread",
      citationCount: supportEdges.reduce((sum, edge) => sum + edgeCitationCount(edge), 0),
    },
    {
      title: "Verified Investor Reach",
      value: String(investmentEdges.length),
      detail: "Investment links connected to diffusion context",
      citationCount: investmentEdges.reduce((sum, edge) => sum + edgeCitationCount(edge), 0),
    },
  ];
}

export function buildPresetVerifiedMetrics(
  graph: GraphAnalyzerData,
  presetId: GraphAnalyzerPresetId
): { readiness: DataReadinessSummary; cards: VerifiedMetricCard[]; hiddenMetricCount: number } {
  const readiness = computeDataReadiness(graph, presetId);
  const allowedTypes = presetMetricTypes(presetId);
  const eligibleEdges = graph.edges.filter((edge) => allowedTypes.has(edge.type) && edgeIsMetricEligible(edge));
  const verifiedEdges = eligibleEdges.filter((edge) => edgeIsCitedVerified(edge));
  const hiddenMetricCount = Math.max(0, eligibleEdges.length - verifiedEdges.length);

  let cards: VerifiedMetricCard[] = [];
  if (presetId === "CO_INVESTMENT" || presetId === "PORTFOLIO_OVERLAP") {
    cards = buildCoInvestmentMetrics(verifiedEdges);
  } else if (presetId === "FOUNDER_NETWORK") {
    cards = buildFounderMetrics(verifiedEdges);
  } else if (presetId === "THEME_MAP") {
    cards = buildThemeMetrics(verifiedEdges);
  } else {
    cards = buildSignalDiffusionMetrics(verifiedEdges);
  }

  const readinessCard: VerifiedMetricCard = {
    title: "Cited Coverage",
    value: formatPercent(readiness.coverage),
    detail: readiness.isRich ? "Ready for full analytics" : "Insufficient cited coverage",
    citationCount: readiness.citedVerifiedCount,
  };

  if (!readiness.isRich) {
    return {
      readiness,
      cards: [readinessCard, ...cards.slice(0, 1)],
      hiddenMetricCount,
    };
  }

  return {
    readiness,
    cards: [readinessCard, ...cards],
    hiddenMetricCount,
  };
}

export function formatVerifiedEdgeSummary(edge: GraphAnalyzerEdge): { heading: string; detail: string; citations: number } {
  const citations = edgeCitationCount(edge);
  const stage = asString(edge.meta?.roundStage);
  const amountMinM = typeof edge.meta?.amountMinM === "number" ? edge.meta.amountMinM : undefined;
  const amountMaxM = typeof edge.meta?.amountMaxM === "number" ? edge.meta.amountMaxM : undefined;
  const announcedAt = asString(edge.meta?.announcedAt);

  if (!edgeIsCitedVerified(edge)) {
    return {
      heading: edge.type,
      detail: "Hidden (citation required)",
      citations: 0,
    };
  }

  const details: string[] = [];
  if (stage) details.push(stage);
  details.push(formatMoneyRange(amountMinM, amountMaxM));
  if (announcedAt) details.push(new Date(announcedAt).toISOString().slice(0, 10));

  return {
    heading: edge.type,
    detail: details.join(" • "),
    citations,
  };
}
