import type { Stance, Tone } from "@/types/insights";

export type PerspectiveLabel = "Media" | "Community" | "Primary" | "Skeptical" | "Optimistic";

export interface StoryPerspective {
  id: string;
  label: PerspectiveLabel;
  sourceName: string;
  title: string;
  url: string;
  summary: string;
  framingLine: string;
  tone: Tone;
  stance: Stance;
  coveredBy: string[];
  facts: string[];
  bias: string[];
  missing: string[];
  impact: string[];
  publishedAt?: string;
  statusBadge?: string;
  stanceBadges?: string[];
}

