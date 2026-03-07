export type GraphNodeType = "fund" | "company" | "claim" | "signal" | "source" | "person";

export interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  meta?: Record<string, unknown>;
}

export interface GraphLink {
  source: string;
  target: string;
  type: string;
  weight?: number;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface GraphApiResponse extends GraphData {
  mode: string;
  focusNodeId?: string;
  depth?: number;
  gamification?: {
    userId: string;
    credits: number;
    contributions: number;
    tier: "visitor" | "contributor" | "analyst" | "insider";
    limits: {
      maxClaimsVisible: number;
      maxSignalsVisible: number;
      graphDepth: number;
      memoAllowed: boolean;
      fullAccess: boolean;
      earlySignals: boolean;
    };
  };
  realModePlaceholder?: boolean;
}

export const GRAPH_NODE_COLORS: Record<GraphNodeType, string> = {
  fund: "#2563eb",
  company: "#7c3aed",
  claim: "#eab308",
  signal: "#16a34a",
  source: "#6b7280",
  person: "#f97316",
};

export function fundNodeId(fundId: string): string {
  return `fund:${fundId}`;
}

export function companyNodeId(companyId: string): string {
  return `company:${companyId}`;
}

export function claimNodeId(claimId: string): string {
  return `claim:${claimId}`;
}

export function signalNodeId(signalId: string): string {
  return `signal:${signalId}`;
}

export function sourceNodeId(sourceId: string): string {
  return `source:${sourceId}`;
}

export function personNodeId(personId: string): string {
  return `person:${personId}`;
}
