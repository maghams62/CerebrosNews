export type SignalReportConfidence = "high" | "medium" | "low";
export type SignalReportStatus = "verified" | "contested" | "unverified";
export type SignalReportActivityType = "verify" | "challenge" | "stance";
export type SignalReportEdgeLabel = "SUPPORTED_BY" | "MENTIONS" | "CONTRADICTS";

export interface SignalReport {
  signal: {
    id: string;
    title: string;
    claim: string;
    signal_type: string;
    created_at: string;
    author: {
      id: string;
      name: string;
      is_anonymous: boolean;
      tier: string;
    };
  };
  entities: {
    companies: string[];
    funds: string[];
    people: string[];
    themes: string[];
  };
  context: {
    stage?: string;
    sector_tags: string[];
    location?: string;
    investors?: string[];
    headcount_trend?: string;
  };
  verification: {
    verified_count: number;
    challenged_count: number;
    bullish_count: number;
    neutral_count: number;
    bearish_count: number;
    saves: number;
    activity_log: Array<{
      type: SignalReportActivityType;
      user_display: string;
      ts: string;
    }>;
  };
  evidence: Array<{
    id: string;
    source_type: string;
    title: string;
    url: string;
    published_at: string;
    snippet: string;
    why_used: string;
    extracted_facts?: Array<{ field: string; value: string }>;
  }>;
  score: {
    signal_strength: number;
    confidence: SignalReportConfidence;
    components: Array<{
      key: string;
      label: string;
      value_0_1: number;
      weight: number;
      contribution: number;
    }>;
    penalties: Array<{
      key: string;
      label: string;
      amount: number;
    }>;
    formula_text: string;
  };
  ai_summary: {
    summary_paragraph: string;
    bullet_justifications: string[];
    reasoning_trace: Array<{
      step_num: number;
      action: string;
      detail: string;
      citations: string[];
    }>;
    conclusion: {
      verdict: string;
      confidence: SignalReportConfidence;
      notes?: string;
    };
  };
  challenges: Array<{
    id: string;
    challenger_display: string;
    claim: string;
    citations: string[];
    impact: {
      score_delta: number;
      confidence_change?: string;
    };
  }>;
  graph: {
    nodes: Array<{
      id: string;
      label: string;
      type: "signal" | "evidence" | "entity";
      evidence_id?: string;
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      label: SignalReportEdgeLabel;
    }>;
  };
}

export function deriveSignalReportStatus(verification: SignalReport["verification"]): SignalReportStatus {
  if (verification.verified_count <= 0 && verification.challenged_count <= 0) return "unverified";
  if (verification.challenged_count > 0 && verification.challenged_count >= verification.verified_count) return "contested";
  return "verified";
}

export function signalReportStatusLabel(status: SignalReportStatus): string {
  if (status === "verified") return "Verified";
  if (status === "contested") return "Contested";
  return "Unverified";
}

export function signalConfidenceLabel(confidence: SignalReportConfidence): string {
  if (confidence === "high") return "High";
  if (confidence === "medium") return "Medium";
  return "Low";
}
