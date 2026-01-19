export type BiasMode = "balanced" | "skeptical-first" | "optimistic-first" | "neutral-only";
export type DepthMode = "fast-scan" | "explain-things" | "deep-dive";

export type Preferences = {
  topics: string[];
  blockedKeywords: string[];
  role: string;
  biasMode: BiasMode;
  depthMode: DepthMode;
};

export const DEFAULT_PREFERENCES: Preferences = {
  topics: [],
  blockedKeywords: [],
  role: "",
  biasMode: "balanced",
  depthMode: "fast-scan",
};

