import { GraphApiResponse } from "@/lib/fundgraph/graphTypes";
import { Fund, Signal } from "@/lib/fundgraph/types";

export type GraphAnalyzerPresetId =
  | "CO_INVESTMENT"
  | "FOUNDER_NETWORK"
  | "THEME_MAP"
  | "PORTFOLIO_OVERLAP"
  | "SIGNAL_DIFFUSION";

export type GraphTimelineRange = "6M" | "12M" | "ALL";

export type GraphAnalyzerNodeType = "fund" | "company" | "person" | "claim" | "source" | "signal" | "theme";

export type GraphAnalyzerEdgeType =
  | "INVESTED_IN"
  | "FOUNDED"
  | "MENTIONS"
  | "SUPPORTED_BY"
  | "CO_INVESTED"
  | "CONTRADICTS";

export type GraphAnalyzerQueryIntent =
  | "path"
  | "funds_in_theme"
  | "companies_linked"
  | "companies_invested_by_fund"
  | "founders_backed_by_fund"
  | "companies_funded_by_both"
  | "search";

export interface GraphAnalyzerNode {
  id: string;
  label: string;
  type: GraphAnalyzerNodeType;
  meta?: Record<string, unknown>;
}

export interface GraphAnalyzerEdge {
  id: string;
  source: string;
  target: string;
  type: GraphAnalyzerEdgeType;
  weight?: number;
  meta?: Record<string, unknown>;
}

export interface GraphAnalyzerData {
  nodes: GraphAnalyzerNode[];
  edges: GraphAnalyzerEdge[];
}

export type GraphAnalyzerDisplayMode = "overview" | "focus" | "expanded";

export interface GraphLayoutConfig {
  linkDistance: number;
  chargeStrength: number;
  cooldownTicks: number;
}

export interface GraphPresetDefinition {
  id: GraphAnalyzerPresetId;
  title: string;
  description: string;
  nodeTypes: GraphAnalyzerNodeType[];
  edgeTypes: GraphAnalyzerEdgeType[];
  defaultFocusType: GraphAnalyzerNodeType;
  defaultHopDepth: number;
  layoutConfig: GraphLayoutConfig;
}

export interface GraphAnalyzerFilters {
  timeline: GraphTimelineRange;
  hopDepth: number;
  verifiedOnly: boolean;
  sector: string;
  stage: string;
  edgeType?: GraphAnalyzerEdgeType | "ALL";
  minCitationCount?: number;
  entityTypeEnabled: Record<GraphAnalyzerNodeType, boolean>;
  focusNodeId: string;
}

export interface GraphAnalyzerQueryResult {
  query: string;
  summary: string;
  highlightedNodeIds: string[];
  highlightedEdgeIds: string[];
  steps: string[];
  focusNodeId?: string;
  strictNodeOnly?: boolean;
  explain?: {
    intent: GraphAnalyzerQueryIntent;
    entities: string[];
  };
}

export type GraphAnswerConfidence = "low" | "medium" | "high";

export interface GraphQueryExplanationPacket {
  preset: string;
  query_label: string;
  query_text?: string;
  query_intent?: GraphAnalyzerQueryIntent;
  display_mode?: GraphAnalyzerDisplayMode;
  focus_entity?: {
    id: string;
    name: string;
    type: GraphAnalyzerNodeType;
  };
  result_summary: {
    node_count: number;
    edge_count: number;
    visible_nodes: Array<{ id: string; name: string; type: GraphAnalyzerNodeType; degree?: number }>;
    visible_edges: Array<{
      source: string;
      target: string;
      type: GraphAnalyzerEdgeType;
      cited: boolean;
      citation_count?: number;
    }>;
  };
  query_paths: Array<{
    path_label: string;
    steps: Array<{
      source: string;
      edge_type: GraphAnalyzerEdgeType;
      target: string;
      cited: boolean;
    }>;
  }>;
  evidence_stats: {
    cited_coverage_pct: number;
    verified_edges: number;
    unverified_edges: number;
    hidden_metric_slots?: number;
  };
  selected_node?: {
    name: string;
    type: GraphAnalyzerNodeType;
    cited_links?: number;
    top_connections?: Array<{ name: string; edge_type: GraphAnalyzerEdgeType; cited: boolean }>;
  };
  selected_edge?: {
    source: string;
    target: string;
    type: GraphAnalyzerEdgeType;
    cited: boolean;
  };
}

export interface GraphQueryExplanation {
  answer: string;
  derivationSummary: string;
  pathExplanations: string[];
  evidenceQuality: {
    answerConfidence: GraphAnswerConfidence;
    explanation: string;
    verifiedEdges: number;
    unverifiedEdges: number;
    citationCoveragePct: number;
  };
  keyTakeaways: string[];
  nextActions: string[];
}

export interface GraphAnalyzerLoadResult {
  funds: Fund[];
  signals: Signal[];
  contextGraph: GraphApiResponse;
}

export interface GraphDisplayOptions {
  presetId: GraphAnalyzerPresetId;
  mode: GraphAnalyzerDisplayMode;
  hopDepth?: number;
  selectedNodeId?: string;
  highlightedNodeIds?: string[];
  highlightedEdgeIds?: string[];
  maxOverviewNodes?: number;
  maxOverviewEdges?: number;
}

export interface GraphDisplayResult {
  graph: GraphAnalyzerData;
  labelNodeIds: string[];
  aggregatedNodeIds: string[];
}

export interface PortfolioOverlapConfig {
  leftFundId: string;
  rightFundId: string;
}

export interface GraphAnalyzerNarrative extends GraphQueryExplanation {
  mode: "llm" | "fallback";
}
