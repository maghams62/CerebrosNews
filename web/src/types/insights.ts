export type BiasLabel = "Left" | "Center" | "Right" | "Mixed";

export type SpeculationStatus = "Confirmed" | "Developing" | "Speculative";

export type EvidenceStrength = "Weak" | "Medium" | "Strong";

export type SourceType = "editorial" | "community" | "primary" | "social";

export interface CoverageSource {
  name: string;
  url: string;
  /** ISO string */
  publishedAt: string;
  sourceType: SourceType;
}

export type Tone = "Optimistic" | "Skeptical" | "Neutral";

export interface NarrativeLens {
  id: string;
  label: string; // e.g. "Media framing"
  tone: Tone;
  summary: string; // 1–2 sentences
  keywords: string[]; // 3–6 chips
}

export type Stance = "Supportive" | "Skeptical" | "Neutral";

export interface OpposingArticle {
  id: string;
  title: string;
  sourceName: string;
  stance: Stance;
  snippet: string;
  url: string;
}

export type ClaimConfidence = "High" | "Med" | "Low";

export type EvidenceType = "Primary" | "Editorial" | "Social";

export type AgreementLevel = "Low" | "Medium" | "High";

export type SystemConfidence = "High" | "Medium" | "Low";

export interface TrustDashboard {
  // Section 1: Why you're seeing this (0–100 ints)
  selection: {
    relevance: number;
    freshness: number;
    trending: number;
    informationGain: number;
  };

  // Section 2: Framing meters (0–100; UI shows no numbers)
  framing: {
    political: number; // 0=Left, 100=Right
    techSentiment: number; // 0=Pessimistic, 100=Optimistic
    powerLens: number; // 0=User/Worker, 100=Corporate/Institutional
  };

  // Section 3: Coverage strength
  coverage: {
    independentSourceCount: number;
    mix: {
      media: number;
      community: number;
      official: number;
    };
    agreement: AgreementLevel;
  };

  // Section 4: System confidence + freshness
  confidence: {
    level: SystemConfidence;
    /** ISO string */
    updatedAtIso: string;
  };

  // Section 5: System humility
  missing: {
    bullets: [string, string, string];
  };

  // Footer
  provenance: {
    computedFromSources: number;
    updatedMinsAgo: number;
    models: {
      clustering: string;
      framing: string;
      coverage: string;
    };
  };

  // Optional tiny front-side hint
  vestedInterestHint?: boolean;
}

export interface ClaimEvidence {
  id: string;
  snippet: string;
  sourceName: string;
  url: string;
  /** ISO string */
  timestamp: string;
}

export interface VerifyClaim {
  id: string;
  claimText: string;
  confidence: ClaimConfidence;
  supportCount: number;
  evidenceType: EvidenceType;
  evidence: ClaimEvidence[];
}

export interface InsightBundle {
  whySeeingThis: string[]; // 2–3 bullets
  biasLabel: BiasLabel;
  biasNotes?: string;
  speculationStatus: SpeculationStatus;
  speculationReason: string;
  evidenceStrength: EvidenceStrength;
  missingSignals: string;
  sources: CoverageSource[];
  trustDashboard: TrustDashboard;
  trustFields?: import("@/lib/trust/schema").TrustFields;
  perspectives: {
    lenses: NarrativeLens[];
    opposingArticles: OpposingArticle[];
  };
  verify: {
    claims: VerifyClaim[];
  };
}

