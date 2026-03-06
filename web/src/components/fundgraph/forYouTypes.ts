import { Fund, NewsClaim, Signal } from "@/fundgraph/types";

export type SignalConfidenceLevel = "High" | "Medium" | "Low";
export type ShiftDirection = "up" | "down";
export type ForYouWindow = "24h" | "72h" | "7d";

export interface SignalBriefItem {
  id: string;
  rank: number;
  title: string;
  signal: Signal;
  fund: Fund;
  chips: string[];
  strengthScore: number;
  delta: number;
  direction: ShiftDirection;
  confidence: SignalConfidenceLevel;
  why: string;
  attentionScore: number;
}

export interface WatchlistAlertItem {
  id: string;
  title: string;
  detail: string;
  tone: "positive" | "neutral" | "warning";
  href: string;
}

export interface NarrativeTrendItem {
  slug: string;
  title: string;
  direction: ShiftDirection;
  delta: number;
  supportCount: number;
  summary: string;
  href: string;
}

export interface ConfidenceShiftItem {
  id: string;
  title: string;
  delta: number;
  confidence: SignalConfidenceLevel;
  href: string;
}

export interface TrendingFundDriver {
  id: string;
  text: string;
  href: string;
}

export interface TrendingFundItem {
  fund: Fund;
  trendDelta: number;
  topDrivers: TrendingFundDriver[];
  tags: string[];
  hiddenTagCount: number;
  relatedClaims: NewsClaim[];
}

export interface MarketDriverItem {
  slug: string;
  title: string;
  direction: ShiftDirection;
  delta: number;
  supportCount: number;
  contestedCount: number;
  avgConfidence: number;
  driverScore: number;
  href: string;
}

export interface ConfidenceMoverRow {
  id: string;
  title: string;
  fundName: string;
  delta: number;
  direction: ShiftDirection;
  confidence: SignalConfidenceLevel;
  href: string;
}

export interface RiskRadarItem {
  id: string;
  title: string;
  detail: string;
  severity: number;
  href: string;
}

export interface TrendingNewsItem {
  id: string;
  title: string;
  sourceTitle: string;
  snippet: string;
  createdAt: string;
  score: number;
  trustWeight: number;
  watchlistOverlapWeight: number;
  href: string;
}

export interface NetworkPulseEdgeSnippet {
  id: string;
  text: string;
  href: string;
  tone: "positive" | "warning" | "neutral";
}

export interface NetworkPulseSnapshot {
  newStrongLinks24h: number;
  contestedLinks72h: number;
  bridgeDriver: string;
  topEdgeSnippets: NetworkPulseEdgeSnippet[];
  expandHref: string;
}

export interface SignalMomentumPoint {
  label: string;
  value: number;
}

export interface SignalMomentumTheme {
  slug: string;
  theme: string;
  signalCount: number;
  trendDelta: number;
  confidence: number;
  samples: SignalMomentumPoint[];
  href: string;
}

export interface TodaysSignalItem {
  id: string;
  title: string;
  fundName: string;
  confidence: SignalConfidenceLevel;
  confidenceScore: number;
  sourceCount: number;
  sourceLabel: string;
  impactScore: number;
  recencyScore: number;
  networkProximity: number;
  priorityScore: number;
  rationale: string;
  createdAt: string;
  href: string;
}

export interface ThemeDriverRow {
  slug: string;
  theme: string;
  supportCount: number;
  contestedCount: number;
  trendDelta: number;
  confidence: number;
  score: number;
  href: string;
  graphQuery: string;
  graphHref: string;
}

export interface TrendingFundPanelItem {
  fundId: string;
  fundName: string;
  imageUrl?: string;
  trendScore: number;
  trendDelta: number;
  trendDrivers: string[];
  aumM: number;
  stage: string;
  href: string;
  graphQuery: string;
  graphHref: string;
}

export interface ClaimDebateItem {
  id: string;
  claim: string;
  supportCount: number;
  contestedCount: number;
  confidence: number;
  createdAt: string;
  href: string;
  addCitationHref: string;
  graphQuery: string;
}

export interface GraphEventItem {
  id: string;
  text: string;
  kind: "co-investment" | "founder-movement" | "network-change";
  href: string;
  graphQuery: string;
}

export interface EmergingOpportunityItem {
  id: string;
  label: string;
  impactScore: number;
  trendDelta: number;
  supportCount: number;
  contestedCount: number;
  confidence: number;
  x: number;
  y: number;
  size: number;
  href: string;
  graphQuery: string;
}

export interface GraphQuerySnapshotItem {
  id: string;
  title: string;
  subtitle: string;
  sourceLabel: string;
  href: string;
  query: string;
}
