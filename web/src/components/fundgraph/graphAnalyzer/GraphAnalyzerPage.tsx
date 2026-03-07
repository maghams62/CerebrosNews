"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GraphCanvas } from "@/components/fundgraph/graphAnalyzer/GraphCanvas";
import { GraphDetailsPanel } from "./GraphDetailsPanel";
import { GraphPresetsPanel } from "@/components/fundgraph/graphAnalyzer/GraphPresetsPanel";
import { GraphQueryBar } from "@/components/fundgraph/graphAnalyzer/GraphQueryBar";
import { DEFAULT_ENTITY_TYPE_ENABLED, getPresetById } from "@/components/fundgraph/graphAnalyzer/presets";
import {
  applyGraphFilters,
  availableSectors,
  availableStages,
  buildGraphDisplayResult,
  buildPresetGraph,
  buildQueryResultSubgraph,
  convertApiGraphToAnalyzerData,
  degreeByNode,
  focusOptions,
  runGraphQuery,
} from "@/components/fundgraph/graphAnalyzer/graphModel";
import {
  GraphAnalyzerData,
  GraphAnalyzerDisplayMode,
  GraphAnalyzerEdgeType,
  GraphAnalyzerNarrative,
  GraphQueryExplanationPacket,
  GraphAnalyzerPresetId,
  GraphAnalyzerQueryResult,
  GraphAnalyzerNodeType,
} from "@/components/fundgraph/graphAnalyzer/types";
import { useFundGraphState } from "@/fundgraph/state";
import { analyzeGraphQuery, getGraphData, interpretGraphQuery, listFunds, listSignals } from "@/lib/fundgraph/client";
import { Fund, Signal } from "@/lib/fundgraph/types";

const EMPTY_GRAPH: GraphAnalyzerData = {
  nodes: [],
  edges: [],
};

const DISAMBIGUATION_QUERY_LIBRARY = [
  "path between OpenAI and Andreessen Horowitz",
  "how is Stripe connected to Sequoia Capital",
  "find the relationship between Databricks and Benchmark",
  "companies Lightspeed Venture Partners invested in",
  "founders Sequoia Capital invested in",
  "founders of companies Andreessen Horowitz invested in",
  "show me the portfolio of General Catalyst",
  "what did YC invest in",
  "which companies does Accel back",
  "companies funded by both Sequoia Capital and Andreessen Horowitz",
  "common investments between Accel and Benchmark",
  "portfolio overlap between First Round Capital and Bessemer Venture Partners",
  "companies linked to ElevenLabs",
  "startups around Anthropic",
  "who co-invests with Sequoia Capital",
  "who co-invests with Andreessen Horowitz on AI startups",
  "funds investing in AI agents",
  "who is active in developer tools",
  "which investors are focused on fintech infrastructure",
  "funds investing in cloud security",
  "Andreessen Horowitz",
];

const EDGE_TYPE_OPTIONS: Array<{ id: "ALL" | GraphAnalyzerEdgeType; label: string }> = [
  { id: "ALL", label: "All relations" },
  { id: "INVESTED_IN", label: "Invested In" },
  { id: "CO_INVESTED", label: "Co-Invested" },
  { id: "FOUNDED", label: "Founded" },
  { id: "SUPPORTED_BY", label: "Supported By" },
  { id: "MENTIONS", label: "Mentions" },
  { id: "CONTRADICTS", label: "Contradicts" },
];

const MIN_CITATION_OPTIONS = [
  { value: 0, label: "Any evidence" },
  { value: 1, label: "1+ citations" },
  { value: 2, label: "2+ citations" },
  { value: 3, label: "3+ citations" },
] as const;

function defaultEnabledTypes(presetId: GraphAnalyzerPresetId): Record<GraphAnalyzerNodeType, boolean> {
  const preset = getPresetById(presetId);
  if (!preset) return { ...DEFAULT_ENTITY_TYPE_ENABLED };

  const enabled = { ...DEFAULT_ENTITY_TYPE_ENABLED };
  for (const type of Object.keys(enabled) as GraphAnalyzerNodeType[]) {
    enabled[type] = preset.nodeTypes.includes(type);
  }
  return enabled;
}

function formatNodeType(type: GraphAnalyzerNodeType): string {
  if (type === "fund") return "Funds";
  if (type === "company") return "Companies";
  if (type === "person") return "People";
  if (type === "claim") return "Claims";
  if (type === "source") return "Sources";
  if (type === "signal") return "Signals";
  return "Themes";
}

function formatIntent(intent: NonNullable<GraphAnalyzerQueryResult["explain"]>["intent"]): string {
  if (intent === "path") return "Path";
  if (intent === "funds_in_theme") return "Funds In Theme";
  if (intent === "companies_linked") return "Companies Linked";
  if (intent === "companies_invested_by_fund") return "Fund Portfolio";
  if (intent === "founders_backed_by_fund") return "Founder Links";
  if (intent === "companies_funded_by_both") return "Funded By Both";
  return "Search";
}

function mergeGraphData(primary: GraphAnalyzerData, secondary: GraphAnalyzerData): GraphAnalyzerData {
  const nodeById = new Map(primary.nodes.map((node) => [node.id, node]));
  for (const node of secondary.nodes) {
    const existing = nodeById.get(node.id);
    if (!existing) {
      nodeById.set(node.id, node);
      continue;
    }
    nodeById.set(node.id, {
      ...existing,
      label: existing.label || node.label,
      meta: {
        ...(existing.meta ?? {}),
        ...(node.meta ?? {}),
      },
    });
  }

  const edgeById = new Map(primary.edges.map((edge) => [edge.id, edge]));
  for (const edge of secondary.edges) {
    const key = edge.id || `${edge.source}|${edge.target}|${edge.type}`;
    const existing = edgeById.get(key);
    if (!existing) {
      edgeById.set(key, {
        ...edge,
        id: key,
      });
      continue;
    }
    edgeById.set(key, {
      ...existing,
      weight: Math.max(existing.weight ?? 0.4, edge.weight ?? 0.4),
      meta: {
        ...(existing.meta ?? {}),
        ...(edge.meta ?? {}),
      },
    });
  }

  return {
    nodes: Array.from(nodeById.values()),
    edges: Array.from(edgeById.values()),
  };
}

function bestDefaultFocus(graph: GraphAnalyzerData, type: GraphAnalyzerNodeType): string {
  const candidates = graph.nodes.filter((node) => node.type === type);
  if (!candidates.length) {
    return graph.nodes[0]?.id ?? "";
  }

  const degree = degreeByNode(graph);
  const top = [...candidates].sort((left, right) => {
    const trendLeft = typeof left.meta?.trendScore === "number" ? left.meta.trendScore : 0;
    const trendRight = typeof right.meta?.trendScore === "number" ? right.meta.trendScore : 0;
    const confLeft = typeof left.meta?.confidence === "number" ? left.meta.confidence : 0;
    const confRight = typeof right.meta?.confidence === "number" ? right.meta.confidence : 0;
    const scoreLeft = trendLeft + confLeft * 100 + (degree.get(left.id) ?? 0);
    const scoreRight = trendRight + confRight * 100 + (degree.get(right.id) ?? 0);
    return scoreRight - scoreLeft;
  });

  return top[0]?.id ?? "";
}

function bestOverlapFundPair(funds: Fund[]): { leftFundId: string; rightFundId: string } {
  if (!funds.length) return { leftFundId: "", rightFundId: "" };
  if (funds.length === 1) return { leftFundId: funds[0]?.id ?? "", rightFundId: funds[0]?.id ?? "" };

  let bestLeftId = funds[0]?.id ?? "";
  let bestRightId = funds[1]?.id ?? bestLeftId;
  let bestOverlap = -1;

  for (let leftIdx = 0; leftIdx < funds.length; leftIdx += 1) {
    const left = funds[leftIdx];
    const leftPortfolio = new Set((left.portfolio ?? []).map((company) => company.toLowerCase()));
    for (let rightIdx = leftIdx + 1; rightIdx < funds.length; rightIdx += 1) {
      const right = funds[rightIdx];
      let overlap = 0;
      for (const company of right.portfolio ?? []) {
        if (leftPortfolio.has(company.toLowerCase())) overlap += 1;
      }
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestLeftId = left.id;
        bestRightId = right.id;
      }
    }
  }

  return {
    leftFundId: bestLeftId,
    rightFundId: bestRightId || bestLeftId,
  };
}

function edgeCitationCount(edge: GraphAnalyzerData["edges"][number]): number {
  const fromMeta = typeof edge.meta?.citationCount === "number" ? edge.meta.citationCount : 0;
  if (fromMeta > 0) return fromMeta;
  if (Array.isArray(edge.meta?.sourceRefs)) return edge.meta.sourceRefs.length;
  return 0;
}

function edgeIsCited(edge: GraphAnalyzerData["edges"][number]): boolean {
  return edge.meta?.verified === true && edgeCitationCount(edge) > 0;
}

function graphForAnalysisPacket({
  presetId,
  displayMode,
  queryResult,
  graph,
  selectedNodeId,
  selectedEdgeId,
}: {
  presetId: GraphAnalyzerPresetId;
  displayMode: GraphAnalyzerDisplayMode;
  queryResult: GraphAnalyzerQueryResult;
  graph: GraphAnalyzerData;
  selectedNodeId: string;
  selectedEdgeId: string;
}): GraphQueryExplanationPacket {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const degree = degreeByNode(graph);
  const highlightedEdgeSet = new Set(queryResult.highlightedEdgeIds);
  const focusNode = selectedNodeId ? nodeById.get(selectedNodeId) : undefined;
  const selectedEdge = selectedEdgeId ? graph.edges.find((edge) => edge.id === selectedEdgeId) : undefined;
  const visibleEdges = graph.edges.slice(0, 180);
  const verifiedEdges = visibleEdges.filter((edge) => edgeIsCited(edge));
  const coveragePct = visibleEdges.length ? (verifiedEdges.length / visibleEdges.length) * 100 : 0;

  const pathEdges = visibleEdges.filter((edge) => highlightedEdgeSet.has(edge.id));
  const queryPaths = pathEdges.length
    ? [
        {
          path_label: "Highlighted query path",
          steps: pathEdges.slice(0, 12).map((edge) => ({
            source: nodeById.get(edge.source)?.label ?? edge.source,
            edge_type: edge.type,
            target: nodeById.get(edge.target)?.label ?? edge.target,
            cited: edgeIsCited(edge),
          })),
        },
      ]
    : queryResult.steps.length
      ? [
          {
            path_label: "Query steps",
            steps: queryResult.steps.slice(0, 8).map((step) => ({
              source: queryResult.focusNodeId ? nodeById.get(queryResult.focusNodeId)?.label ?? "Focus node" : "Focus node",
              edge_type: "MENTIONS" as GraphAnalyzerEdgeType,
              target: step.replace(/^Step\\s+\\d+:\\s*/i, "").replace(/\\.$/, ""),
              cited: false,
            })),
          },
        ]
      : [];

  const selectedNodeEdges = focusNode
    ? graph.edges.filter((edge) => edge.source === focusNode.id || edge.target === focusNode.id)
    : [];

  return {
    preset: presetId,
    query_label: queryResult.explain ? formatIntent(queryResult.explain.intent) : "Graph Search",
    query_text: queryResult.query,
    query_intent: queryResult.explain?.intent ?? "search",
    display_mode: displayMode,
    focus_entity: focusNode
      ? {
          id: focusNode.id,
          name: focusNode.label,
          type: focusNode.type,
        }
      : undefined,
    result_summary: {
      node_count: graph.nodes.length,
      edge_count: graph.edges.length,
      visible_nodes: graph.nodes.slice(0, 120).map((node) => ({
        id: node.id,
        name: node.label,
        type: node.type,
        degree: degree.get(node.id) ?? 0,
      })),
      visible_edges: visibleEdges.map((edge) => ({
        source: nodeById.get(edge.source)?.label ?? edge.source,
        target: nodeById.get(edge.target)?.label ?? edge.target,
        type: edge.type,
        cited: edgeIsCited(edge),
        citation_count: edgeCitationCount(edge),
      })),
    },
    query_paths: queryPaths,
    evidence_stats: {
      cited_coverage_pct: Math.round(coveragePct * 10) / 10,
      verified_edges: verifiedEdges.length,
      unverified_edges: Math.max(0, visibleEdges.length - verifiedEdges.length),
      hidden_metric_slots: Math.max(0, visibleEdges.length - verifiedEdges.length),
    },
    selected_node: focusNode
      ? {
          name: focusNode.label,
          type: focusNode.type,
          cited_links: selectedNodeEdges.filter((edge) => edgeIsCited(edge)).length,
          top_connections: selectedNodeEdges.slice(0, 8).map((edge) => ({
            name:
              nodeById.get(edge.source === focusNode.id ? edge.target : edge.source)?.label ??
              (edge.source === focusNode.id ? edge.target : edge.source),
            edge_type: edge.type,
            cited: edgeIsCited(edge),
          })),
        }
      : undefined,
    selected_edge: selectedEdge
      ? {
          source: nodeById.get(selectedEdge.source)?.label ?? selectedEdge.source,
          target: nodeById.get(selectedEdge.target)?.label ?? selectedEdge.target,
          type: selectedEdge.type,
          cited: edgeIsCited(selectedEdge),
        }
      : undefined,
  };
}

export function GraphAnalyzerPage({
  fundId,
  slug,
  claimId,
  initialQuery,
}: {
  fundId?: string;
  slug?: string;
  claimId?: string;
  initialQuery?: string;
}) {
  const { limits, tier } = useFundGraphState();
  const [funds, setFunds] = useState<Fund[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [contextGraph, setContextGraph] = useState<GraphAnalyzerData>(EMPTY_GRAPH);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [presetId, setPresetId] = useState<GraphAnalyzerPresetId>("CO_INVESTMENT");
  const [timeline, setTimeline] = useState<"6M" | "12M" | "ALL">("ALL");
  const [hopDepth, setHopDepth] = useState(2);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sector, setSector] = useState("ALL");
  const [stage, setStage] = useState("ALL");
  const [edgeTypeFilter, setEdgeTypeFilter] = useState<"ALL" | GraphAnalyzerEdgeType>("ALL");
  const [minCitationCount, setMinCitationCount] = useState(0);
  const [entityTypeEnabled, setEntityTypeEnabled] = useState<Record<GraphAnalyzerNodeType, boolean>>({
    ...DEFAULT_ENTITY_TYPE_ENABLED,
  });
  const [focusNodeId, setFocusNodeId] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedEdgeId, setSelectedEdgeId] = useState("");
  const [hoveredEdgeId, setHoveredEdgeId] = useState("");
  const [displayMode, setDisplayMode] = useState<GraphAnalyzerDisplayMode>("overview");
  const [query, setQuery] = useState("");
  const [queryResult, setQueryResult] = useState<GraphAnalyzerQueryResult | null>(null);
  const [queryResolving, setQueryResolving] = useState(false);
  const [analysis, setAnalysis] = useState<GraphAnalyzerNarrative | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [leftOverlapFundId, setLeftOverlapFundId] = useState("");
  const [rightOverlapFundId, setRightOverlapFundId] = useState("");
  const queryRequestSeqRef = useRef(0);
  const analysisRequestSeqRef = useRef(0);
  const bootstrappedQueryRef = useRef(false);

  useEffect(() => {
    bootstrappedQueryRef.current = false;
  }, [fundId, slug, initialQuery]);

  const activePreset = getPresetById(presetId) ?? getPresetById("CO_INVESTMENT");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [fundsResponse, signalsResponse, graphResponse] = await Promise.all([
          listFunds(new URLSearchParams({ limit: "1000" })),
          listSignals(new URLSearchParams({ limit: "1000", scope: "graph" })),
          getGraphData({
            fundId,
            slug,
            claimId,
            depth: limits.graphDepth,
            limit: 1000,
          }),
        ]);

        if (cancelled) return;
        setFunds(fundsResponse.funds);
        setSignals(signalsResponse.signals);
        setContextGraph(convertApiGraphToAnalyzerData(graphResponse));

        const bestOverlapPair = bestOverlapFundPair(fundsResponse.funds);
        setLeftOverlapFundId(bestOverlapPair.leftFundId);
        setRightOverlapFundId(bestOverlapPair.rightFundId);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load graph analyzer data.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [claimId, fundId, limits.graphDepth, slug]);

  useEffect(() => {
    if (!presetId) return;
    const preset = getPresetById(presetId);
    if (!preset) return;

    setHopDepth(Math.max(1, Math.min(limits.graphDepth, preset.defaultHopDepth)));
    setEntityTypeEnabled(defaultEnabledTypes(presetId));
    setQueryResult(null);
    setQuery("");
    setSelectedNodeId("");
    setSelectedEdgeId("");
    setHoveredEdgeId("");
    setFocusNodeId("");
    setDisplayMode("overview");
    setSector("ALL");
    setStage("ALL");
    setEdgeTypeFilter("ALL");
    setMinCitationCount(0);
    setAnalysis(null);
    setAnalysisLoading(false);
  }, [limits.graphDepth, presetId]);

  const baseGraph = useMemo(() => {
    if (!activePreset) return EMPTY_GRAPH;
    return buildPresetGraph({
      presetId: activePreset.id,
      funds,
      signals,
      contextGraph,
      overlapConfig: {
        leftFundId: leftOverlapFundId,
        rightFundId: rightOverlapFundId,
      },
    });
  }, [activePreset, contextGraph, funds, leftOverlapFundId, rightOverlapFundId, signals]);

  useEffect(() => {
    if (!activePreset) return;
    if (!baseGraph.nodes.length) return;

    const currentExists = baseGraph.nodes.some((node) => node.id === focusNodeId);
    if (currentExists) return;

    const defaultFocusId = bestDefaultFocus(baseGraph, activePreset.defaultFocusType);
    setFocusNodeId(defaultFocusId);
  }, [activePreset, baseGraph, focusNodeId]);

  const filteredGraph = useMemo(() => {
    if (!activePreset) return EMPTY_GRAPH;
    return applyGraphFilters(baseGraph, {
      timeline,
      hopDepth,
      verifiedOnly,
      sector,
      stage,
      edgeType: edgeTypeFilter,
      minCitationCount,
      entityTypeEnabled,
      focusNodeId,
    });
  }, [
    activePreset,
    baseGraph,
    edgeTypeFilter,
    entityTypeEnabled,
    focusNodeId,
    hopDepth,
    minCitationCount,
    sector,
    stage,
    timeline,
    verifiedOnly,
  ]);

  const queryGraph = useMemo(() => {
    if (!activePreset) return EMPTY_GRAPH;
    const queryEntityTypes = {
      ...entityTypeEnabled,
    };
    queryEntityTypes.fund = true;
    queryEntityTypes.company = true;
    queryEntityTypes.person = true;

    const primaryQueryGraph = applyGraphFilters(baseGraph, {
      timeline,
      hopDepth,
      verifiedOnly,
      sector,
      stage,
      edgeType: edgeTypeFilter,
      minCitationCount,
      entityTypeEnabled: queryEntityTypes,
      focusNodeId: "",
    });

    const founderGraph = buildPresetGraph({
      presetId: "FOUNDER_NETWORK",
      funds,
      signals,
      contextGraph,
      overlapConfig: {
        leftFundId: "",
        rightFundId: "",
      },
    });
    const founderQueryGraph = applyGraphFilters(founderGraph, {
      timeline,
      hopDepth,
      verifiedOnly,
      sector,
      stage,
      edgeType: edgeTypeFilter,
      minCitationCount,
      entityTypeEnabled: queryEntityTypes,
      focusNodeId: "",
    });

    return mergeGraphData(primaryQueryGraph, founderQueryGraph);
  }, [
    activePreset,
    baseGraph,
    contextGraph,
    edgeTypeFilter,
    entityTypeEnabled,
    funds,
    hopDepth,
    minCitationCount,
    sector,
    signals,
    stage,
    timeline,
    verifiedOnly,
  ]);

  useEffect(() => {
    if (!queryResult?.focusNodeId) return;
    setSelectedNodeId(queryResult.focusNodeId);
    setDisplayMode("focus");
  }, [queryResult]);

  const exampleLibrary = useMemo(() => {
    const topFunds = [...funds].slice(0, 3).map((fund) => fund.name);
    const topCompanies = Array.from(new Set(funds.flatMap((fund) => fund.portfolio))).slice(0, 3);

    let overlapLeft = topFunds[0] ?? "Sequoia Capital";
    let overlapRight = topFunds[1] ?? "Andreessen Horowitz";
    let maxOverlap = -1;
    for (let leftIdx = 0; leftIdx < funds.length; leftIdx += 1) {
      const leftSet = new Set(funds[leftIdx].portfolio.map((company) => company.toLowerCase()));
      for (let rightIdx = leftIdx + 1; rightIdx < funds.length; rightIdx += 1) {
        let overlap = 0;
        for (const company of funds[rightIdx].portfolio) {
          if (leftSet.has(company.toLowerCase())) overlap += 1;
        }
        if (overlap > maxOverlap) {
          maxOverlap = overlap;
          overlapLeft = funds[leftIdx].name;
          overlapRight = funds[rightIdx].name;
        }
      }
    }

    const pathLeft = topCompanies[0] ?? "Stripe";
    const pathRight = topFunds[0] ?? "Sequoia Capital";
    const linkedEntity = topCompanies[1] ?? "Anthropic";
    const secondPathLeft = topCompanies[2] ?? pathLeft;
    const portfolioFund = topFunds[0] ?? "Sequoia Capital";
    const secondPortfolioFund = topFunds[1] ?? "Andreessen Horowitz";
    const themeQuery = "AI infrastructure";
    const pinnedExamples = [
      "who co-invests with Alexandr Wang",
      "funds linked to ElevenLabs",
      "founders of companies Andreessen Horowitz invested in",
      `companies ${portfolioFund} invested in`,
      `companies funded by both ${overlapLeft} and ${overlapRight}`,
      `path between ${pathLeft} and ${pathRight}`,
      `funds investing in ${themeQuery}`,
    ];
    const dynamicCandidates = [
      `show me the portfolio of ${portfolioFund}`,
      `what did ${portfolioFund} invest in`,
      `which companies does ${portfolioFund} back`,
      "path between OpenAI and Andreessen Horowitz",
      "how is OpenAI connected to Andreessen Horowitz",
      `path between ${pathLeft} and ${pathRight}`,
      `path between ${secondPathLeft} and ${overlapLeft}`,
      `companies linked to ${linkedEntity}`,
      `companies funded by both ${overlapLeft} and ${overlapRight}`,
      `common investments between ${overlapLeft} and ${overlapRight}`,
      `who co-invests with ${portfolioFund}`,
      `funds investing in ${themeQuery}`,
      `who is active in ${themeQuery}`,
      `portfolio overlap between ${portfolioFund} and ${secondPortfolioFund}`,
      `startups around ${linkedEntity}`,
    ];

    const dedupeCaseInsensitive = (values: string[]): string[] => {
      const out: string[] = [];
      const seen = new Set<string>();
      for (const value of values) {
        const normalized = value.trim();
        if (!normalized) continue;
        const key = normalized.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(normalized);
      }
      return out;
    };

    const uniqueCandidates = dedupeCaseInsensitive([...pinnedExamples, ...dynamicCandidates, ...DISAMBIGUATION_QUERY_LIBRARY]);

    const viable = uniqueCandidates.filter((candidate) => {
      const result = runGraphQuery(candidate, queryGraph);
      return result.highlightedNodeIds.length > 0 || result.highlightedEdgeIds.length > 0;
    });

    const ranked = viable.length ? viable : uniqueCandidates;
    const intentBucket = (queryText: string): string => {
      const text = queryText.toLowerCase();
      if (/\bco[\s-]?invest|linked to|around\b/.test(text)) return "linked";
      if (/\bfounders?\b/.test(text)) return "founders";
      if (/\bpath|connected|relationship\b/.test(text)) return "path";
      if (/\bboth|common|overlap\b/.test(text)) return "overlap";
      if (/\binvesting in|active in|focused\b/.test(text)) return "theme";
      if (/\bportfolio|invested in|what did\b/.test(text)) return "portfolio";
      return "search";
    };

    const chipExamples: string[] = [];
    const bucketCounts = new Map<string, number>();
    for (const candidate of dedupeCaseInsensitive([...pinnedExamples, ...ranked])) {
      const bucket = intentBucket(candidate);
      const count = bucketCounts.get(bucket) ?? 0;
      const isPinned = pinnedExamples.some((item) => item.toLowerCase() === candidate.toLowerCase());
      if (!isPinned && count >= 2) continue;
      chipExamples.push(candidate);
      bucketCounts.set(bucket, count + 1);
      if (chipExamples.length >= 12) break;
    }

    return {
      chipExamples,
      llmExamples: ranked.slice(0, 24),
    };
  }, [funds, queryGraph]);

  const demoExamples = exampleLibrary.chipExamples;
  const llmExamples = exampleLibrary.llmExamples;

  const executeQuery = useCallback(async (rawQuery: string) => {
    const requestSeq = queryRequestSeqRef.current + 1;
    queryRequestSeqRef.current = requestSeq;
    const trimmed = rawQuery.trim();
    setAnalysis(null);
    setAnalysisLoading(false);
    if (!trimmed) {
      setQueryResolving(false);
      setQueryResult(null);
      setSelectedNodeId("");
      setSelectedEdgeId("");
      setHoveredEdgeId("");
      setDisplayMode("overview");
      return;
    }

    const directResult = runGraphQuery(trimmed, queryGraph);
    const directHasHighlight = directResult.highlightedNodeIds.length > 0 || directResult.highlightedEdgeIds.length > 0;
    if (directHasHighlight) {
      if (requestSeq !== queryRequestSeqRef.current) return;
      setQueryResolving(false);
      setQueryResult(directResult);
      setQuery(trimmed);
      if (directResult.focusNodeId) {
        setFocusNodeId(directResult.focusNodeId);
      }
      setSelectedNodeId(directResult.focusNodeId ?? "");
      setSelectedEdgeId(directResult.highlightedEdgeIds[0] ?? "");
      setHoveredEdgeId("");
      setDisplayMode(directResult.focusNodeId ? "focus" : "overview");
      if (directResult.steps.length > hopDepth) {
        setHopDepth(Math.min(limits.graphDepth, directResult.steps.length));
      }
      return;
    }

    let canonicalQuery = trimmed;
    if (queryGraph.nodes.length) {
      setQueryResolving(true);
      try {
        const interpreted = await interpretGraphQuery({
          query: trimmed,
          presetId,
          nodeLabels: queryGraph.nodes.map((node) => node.label).filter(Boolean).slice(0, 260),
          exampleQueries: llmExamples,
        });
        if (requestSeq !== queryRequestSeqRef.current) return;
        if (interpreted.canonicalQuery?.trim()) {
          canonicalQuery = interpreted.canonicalQuery.trim();
        }
      } catch {
        if (requestSeq !== queryRequestSeqRef.current) return;
        canonicalQuery = trimmed;
      } finally {
        if (requestSeq === queryRequestSeqRef.current) {
          setQueryResolving(false);
        }
      }
    }

    let result = runGraphQuery(canonicalQuery, queryGraph);
    const hasHighlight = result.highlightedNodeIds.length > 0 || result.highlightedEdgeIds.length > 0;
    if (!hasHighlight && canonicalQuery !== trimmed) {
      const fallback = runGraphQuery(trimmed, queryGraph);
      const fallbackHasHighlight = fallback.highlightedNodeIds.length > 0 || fallback.highlightedEdgeIds.length > 0;
      if (fallbackHasHighlight) {
        result = fallback;
        canonicalQuery = trimmed;
      }
    }

    if (requestSeq !== queryRequestSeqRef.current) return;
    setQueryResult(result);
    setQuery(canonicalQuery);
    if (result.focusNodeId) {
      setFocusNodeId(result.focusNodeId);
    }
    setSelectedNodeId(result.focusNodeId ?? "");
    setSelectedEdgeId(result.highlightedEdgeIds[0] ?? "");
    setHoveredEdgeId("");
    setDisplayMode(result.focusNodeId ? "focus" : "overview");
    if (result.steps.length > hopDepth) {
      setHopDepth(Math.min(limits.graphDepth, result.steps.length));
    }
  }, [hopDepth, limits.graphDepth, llmExamples, presetId, queryGraph]);

  useEffect(() => {
    if (bootstrappedQueryRef.current) return;
    if (loading) return;
    if (!queryGraph.nodes.length) return;

    const seededQuery = initialQuery?.trim();
    if (seededQuery) {
      bootstrappedQueryRef.current = true;
      setQuery(seededQuery);
      void executeQuery(seededQuery);
      return;
    }

    const entryFund = funds.find((fund) => fund.id === fundId || fund.slug === slug || fund.id === slug);
    if (!entryFund) return;
    if (presetId !== "CO_INVESTMENT") {
      setPresetId("CO_INVESTMENT");
      return;
    }

    const nextQuery = `companies ${entryFund.name} invested in`;
    bootstrappedQueryRef.current = true;
    setQuery(nextQuery);
    setFocusNodeId(`fund:${entryFund.id}`);
    void executeQuery(nextQuery);
  }, [executeQuery, loading, queryGraph.nodes.length, initialQuery, funds, fundId, slug, presetId]);

  const runQuery = useCallback(() => {
    void executeQuery(query);
  }, [executeQuery, query]);

  const focusCandidates = useMemo(() => focusOptions(baseGraph), [baseGraph]);
  const sectors = useMemo(() => availableSectors(funds), [funds]);
  const stages = useMemo(() => availableStages(funds), [funds]);
  const availableEntityTypes = useMemo(() => {
    const available = new Set(baseGraph.nodes.map((node) => node.type));
    return (Object.keys(entityTypeEnabled) as GraphAnalyzerNodeType[]).filter((type) => available.has(type));
  }, [baseGraph.nodes, entityTypeEnabled]);

  const highlightedNodeIds = useMemo(() => queryResult?.highlightedNodeIds ?? [], [queryResult]);
  const highlightedEdgeIds = useMemo(() => queryResult?.highlightedEdgeIds ?? [], [queryResult]);
  const activeSelectedNodeId = selectedNodeId || queryResult?.focusNodeId || "";
  const highlightedNodeLabels = useMemo(() => {
    if (!queryResult) return [];
    const byId = new Map(queryGraph.nodes.map((node) => [node.id, node.label]));
    return queryResult.highlightedNodeIds
      .map((id) => byId.get(id))
      .filter((label): label is string => Boolean(label))
      .slice(0, 8);
  }, [queryGraph.nodes, queryResult]);

  const displaySourceGraph = useMemo(() => {
    const fromQuery = buildQueryResultSubgraph(queryGraph, queryResult, hopDepth);
    if (fromQuery && fromQuery.nodes.length) {
      return fromQuery;
    }
    return filteredGraph;
  }, [filteredGraph, hopDepth, queryGraph, queryResult]);

  const displayPayload = useMemo(
    () =>
      buildGraphDisplayResult(displaySourceGraph, {
        presetId,
        mode: displayMode,
        hopDepth,
        selectedNodeId: activeSelectedNodeId,
        highlightedNodeIds,
        highlightedEdgeIds,
      }),
    [activeSelectedNodeId, displayMode, displaySourceGraph, highlightedEdgeIds, highlightedNodeIds, hopDepth, presetId]
  );

  const displayGraph = displayPayload.graph;

  useEffect(() => {
    const requestSeq = analysisRequestSeqRef.current + 1;
    analysisRequestSeqRef.current = requestSeq;

    if (!queryResult || !queryResult.query.trim() || !displaySourceGraph.nodes.length) {
      setAnalysis(null);
      setAnalysisLoading(false);
      return;
    }

    const packet = graphForAnalysisPacket({
      presetId,
      displayMode,
      queryResult,
      graph: displaySourceGraph,
      selectedNodeId: activeSelectedNodeId,
      selectedEdgeId: selectedEdgeId || hoveredEdgeId,
    });

    setAnalysisLoading(true);
    void analyzeGraphQuery({ packet })
      .then((nextAnalysis) => {
        if (requestSeq !== analysisRequestSeqRef.current) return;
        setAnalysis(nextAnalysis);
      })
      .catch(() => {
        if (requestSeq !== analysisRequestSeqRef.current) return;
        const coveragePct = Math.round(packet.evidence_stats.cited_coverage_pct);
        const confidence: "low" | "medium" | "high" =
          coveragePct >= 70
            ? "high"
            : coveragePct >= 30
              ? "medium"
              : "low";
        setAnalysis({
          mode: "fallback",
          answer: queryResult.summary,
          derivationSummary:
            "This explanation is generated from highlighted nodes and edges in the active graph result with citation gating applied.",
          pathExplanations: packet.query_paths
            .flatMap((path) =>
              path.steps.slice(0, 3).map((step) => `${step.source} -> ${step.edge_type} -> ${step.target}${step.cited ? "" : " (uncited)"}`)
            )
            .slice(0, 5),
          evidenceQuality: {
            answerConfidence: confidence,
            explanation:
              confidence === "high"
                ? "Coverage is strong and most visible edges are verified."
                : confidence === "medium"
                  ? "Coverage is mixed and the result combines verified and candidate edges."
                  : "Coverage is low, so this result should be treated as exploratory until more citations are attached.",
            verifiedEdges: packet.evidence_stats.verified_edges,
            unverifiedEdges: packet.evidence_stats.unverified_edges,
            citationCoveragePct: coveragePct,
          },
          keyTakeaways: [
            packet.evidence_stats.unverified_edges > packet.evidence_stats.verified_edges
              ? "Unverified candidate edges outnumber verified edges in this view."
              : "Verified edges provide a usable foundation for interpretation.",
          ],
          nextActions: queryResult.steps.slice(0, 3),
        });
      })
      .finally(() => {
        if (requestSeq !== analysisRequestSeqRef.current) return;
        setAnalysisLoading(false);
      });
  }, [activeSelectedNodeId, displayMode, displaySourceGraph, hoveredEdgeId, presetId, queryResult, selectedEdgeId]);

  const runFollowUpQuery = useCallback(
    (nextQuery: string) => {
      const trimmed = nextQuery.trim();
      if (!trimmed) return;
      setQuery(trimmed);
      void executeQuery(trimmed);
    },
    [executeQuery]
  );

  const expandNeighborhood = useCallback(() => {
    setDisplayMode("expanded");
    setHopDepth((previous) => Math.min(limits.graphDepth, previous + 1));
  }, [limits.graphDepth]);

  const enforceVerifiedOnly = useCallback(() => {
    setVerifiedOnly(true);
  }, []);

  const openCitationWorkflow = useCallback(() => {
    if (typeof window === "undefined") return;
    window.location.assign("/cerebrosfund/signals?quickAction=addCitation");
  }, []);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-base font-semibold text-slate-900">Graph Analyzer</h1>
          <span className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[10px] font-bold tracking-[0.08em] text-amber-700 uppercase">
            Beta
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-600">Experimental surface. Results may change as data quality and graph coverage improve.</p>
      </section>

      <GraphPresetsPanel
        selectedPresetId={presetId}
        onSelectPreset={setPresetId}
        timeline={timeline}
        onTimelineChange={setTimeline}
      />

      <>
          <GraphQueryBar
            value={query}
            onChange={setQuery}
            onRun={runQuery}
            examples={demoExamples}
            onUseExample={(value) => {
              setQuery(value);
              void executeQuery(value);
            }}
            disabled={loading || queryResolving || !queryGraph.nodes.length}
          />

          {queryResult ? (
            <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Query Result</p>
              <p className="mt-1 text-sm text-slate-700">{queryResult.summary}</p>
              {queryResult.explain ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold tracking-[0.05em] uppercase">
                    {formatIntent(queryResult.explain.intent)}
                  </span>
                  {queryResult.explain.entities.length ? <span>{queryResult.explain.entities.slice(0, 3).join(" · ")}</span> : null}
                </div>
              ) : null}
              {queryResult.steps.length ? (
                <ul className="mt-2 space-y-1 text-xs text-slate-700">
                  {queryResult.steps.slice(0, 4).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              ) : null}
              {highlightedNodeLabels.length ? (
                <p className="mt-2 text-xs text-slate-600">
                  Key entities: {highlightedNodeLabels.join(", ")}
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_auto_auto_auto] lg:items-end">
              <label className="block">
                <span className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Focus Entity</span>
                <select
                  value={focusNodeId}
                  onChange={(event) => {
                    const nextFocusId = event.target.value;
                    setFocusNodeId(nextFocusId);
                    setSelectedEdgeId("");
                    setHoveredEdgeId("");

                    // If no query is active, treat focus as a neighborhood view trigger.
                    if (!query.trim()) {
                      setQueryResult(null);
                      setSelectedNodeId(nextFocusId);
                      setDisplayMode(nextFocusId ? "focus" : "overview");
                    }
                  }}
                  className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none"
                >
                  <option value="">None</option>
                  {focusCandidates.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label} ({option.type})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Sector</span>
                <select
                  value={sector}
                  onChange={(event) => setSector(event.target.value)}
                  className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none"
                >
                  <option value="ALL">All sectors</option>
                  {sectors.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Stage</span>
                <select
                  value={stage}
                  onChange={(event) => setStage(event.target.value)}
                  className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none"
                >
                  <option value="ALL">All stages</option>
                  {stages.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Relationship</span>
                <select
                  value={edgeTypeFilter}
                  onChange={(event) => setEdgeTypeFilter(event.target.value as "ALL" | GraphAnalyzerEdgeType)}
                  className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none"
                >
                  {EDGE_TYPE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Hop Depth</span>
                <select
                  value={hopDepth}
                  onChange={(event) => setHopDepth(Math.max(1, Math.min(limits.graphDepth, Number(event.target.value))))}
                  className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none"
                >
                  {Array.from({ length: limits.graphDepth }, (_, idx) => idx + 1).map((depthValue) => (
                    <option key={depthValue} value={depthValue}>
                      {depthValue}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Min citations</span>
                <select
                  value={minCitationCount}
                  onChange={(event) => setMinCitationCount(Math.max(0, Number(event.target.value) || 0))}
                  className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none"
                >
                  {MIN_CITATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => setVerifiedOnly((prev) => !prev)}
                className={`h-9 rounded-xl border px-3 text-xs font-semibold uppercase ${
                  verifiedOnly ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                Verified Only
              </button>

              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setQueryResult(null);
                  setSelectedEdgeId("");
                  setHoveredEdgeId("");
                  if (focusNodeId) {
                    setSelectedNodeId(focusNodeId);
                    setDisplayMode("focus");
                  } else {
                    setSelectedNodeId("");
                    setDisplayMode("overview");
                  }
                }}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
              >
                Clear Highlight
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {(["overview", "focus", "expanded"] as GraphAnalyzerDisplayMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    if (mode !== "overview" && !activeSelectedNodeId) return;
                    setDisplayMode(mode);
                  }}
                  disabled={mode !== "overview" && !activeSelectedNodeId}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize ${
                    displayMode === mode
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-slate-50 text-slate-700 disabled:opacity-50"
                  }`}
                >
                  {mode}
                </button>
              ))}
              {activeSelectedNodeId && displayMode !== "expanded" ? (
                <button
                  type="button"
                  onClick={() => {
                    setDisplayMode("expanded");
                    setHopDepth((previous) => Math.min(limits.graphDepth, previous + 1));
                  }}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Expand Neighborhood (+1 hop)
                </button>
              ) : null}
              {displayMode !== "overview" ? (
                <button
                  type="button"
                  onClick={() => {
                    setDisplayMode("overview");
                    if (!queryResult) {
                      setSelectedNodeId("");
                      setSelectedEdgeId("");
                    }
                  }}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Return to Overview
                </button>
              ) : null}
              {displayPayload.aggregatedNodeIds.length ? (
                <span className="text-xs text-slate-500">
                  Overview aggregation active: {displayPayload.aggregatedNodeIds.length} collapsed groups
                </span>
              ) : null}
            </div>

            {presetId === "PORTFOLIO_OVERLAP" ? (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Fund A</span>
                  <select
                    value={leftOverlapFundId}
                    onChange={(event) => setLeftOverlapFundId(event.target.value)}
                    className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none"
                  >
                    {funds.map((fund) => (
                      <option key={fund.id} value={fund.id}>
                        {fund.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Fund B</span>
                  <select
                    value={rightOverlapFundId}
                    onChange={(event) => setRightOverlapFundId(event.target.value)}
                    className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none"
                  >
                    {funds.map((fund) => (
                      <option key={fund.id} value={fund.id}>
                        {fund.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              {availableEntityTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setEntityTypeEnabled((prev) => ({ ...prev, [type]: !prev[type] }))}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    entityTypeEnabled[type]
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-slate-50 text-slate-700"
                  }`}
                >
                  {formatNodeType(type)}
                </button>
              ))}
            </div>
            {!availableEntityTypes.length ? (
              <p className="mt-2 text-xs text-slate-500">No entity-type filters are available for this preset and data snapshot.</p>
            ) : null}

            <p className="mt-3 text-xs text-slate-600">
              Depth cap for tier <span className="font-semibold">{tier}</span>: {limits.graphDepth} hops.
            </p>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
            <GraphCanvas
              graph={displayGraph}
              layout={activePreset?.layoutConfig ?? { linkDistance: 132, chargeStrength: -300, cooldownTicks: 180 }}
              presetId={presetId}
              displayMode={displayMode}
              labelNodeIds={displayPayload.labelNodeIds}
              selectedNodeId={activeSelectedNodeId}
              selectedEdgeId={hoveredEdgeId || selectedEdgeId}
              onSelectNode={(nodeId) => {
                if (!nodeId) {
                  setSelectedNodeId("");
                  setSelectedEdgeId("");
                  setHoveredEdgeId("");
                  setQueryResult(null);
                  setDisplayMode("overview");
                  return;
                }
                const selectedNode = displayGraph.nodes.find((node) => node.id === nodeId);
                const aggregateAnchorId =
                  typeof selectedNode?.meta?.aggregateAnchorId === "string" ? String(selectedNode.meta.aggregateAnchorId) : "";
                const resolvedNodeId = aggregateAnchorId || nodeId;
                const resolvedNode = queryGraph.nodes.find((node) => node.id === resolvedNodeId) ?? selectedNode;
                if (resolvedNode?.type === "fund" && !aggregateAnchorId) {
                  const nextQuery = `companies ${resolvedNode.label} invested in`;
                  setQuery(nextQuery);
                  setFocusNodeId(resolvedNodeId);
                  void executeQuery(nextQuery);
                  return;
                }
                setSelectedNodeId(resolvedNodeId);
                setSelectedEdgeId("");
                setHoveredEdgeId("");
                setDisplayMode(aggregateAnchorId ? "expanded" : "focus");
                setFocusNodeId(resolvedNodeId);
              }}
              onSelectEdge={(edgeId) => {
                setSelectedEdgeId(edgeId);
                setHoveredEdgeId("");
              }}
              onHoverEdge={setHoveredEdgeId}
              highlightedNodeIds={highlightedNodeIds}
              highlightedEdgeIds={highlightedEdgeIds}
              loading={loading}
              error={error}
            />

            <GraphDetailsPanel
              graph={displaySourceGraph}
              presetId={presetId}
              displayMode={displayMode}
              aggregatedNodeCount={displayPayload.aggregatedNodeIds.length}
              selectedNodeId={activeSelectedNodeId}
              selectedEdgeId={hoveredEdgeId || selectedEdgeId}
              queryResult={queryResult}
              analysis={analysis}
              analysisLoading={analysisLoading}
              onExpandNeighborhood={activeSelectedNodeId ? expandNeighborhood : undefined}
              onShowVerifiedOnly={verifiedOnly ? undefined : enforceVerifiedOnly}
              onRunFollowUpQuery={runFollowUpQuery}
              onAttachCitations={openCitationWorkflow}
            />
          </section>
      </>
    </div>
  );
}
