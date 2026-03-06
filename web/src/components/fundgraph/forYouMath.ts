import { ForYouWindow } from "@/components/fundgraph/forYouTypes";

export const WINDOW_MS: Record<ForYouWindow, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "72h": 72 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeByMax(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return clamp(value / max, 0, 1);
}

export function normalizeByRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) return 0;
  if (Math.abs(max - min) < 1e-6) return 0.5;
  return clamp((value - min) / (max - min), 0, 1);
}

export function computeDriverScore(params: {
  supportCount: number;
  maxSupport: number;
  momentumDelta: number;
  minMomentum: number;
  maxMomentum: number;
  avgConfidence: number;
  contestedRatio: number;
}): number {
  const normSupport = normalizeByMax(params.supportCount, params.maxSupport);
  const normMomentum = normalizeByRange(params.momentumDelta, params.minMomentum, params.maxMomentum);
  const avgConfidence = clamp(params.avgConfidence, 0, 1);
  const contestedRatio = clamp(params.contestedRatio, 0, 1);
  const score = 0.45 * normSupport + 0.35 * normMomentum + 0.2 * avgConfidence - 0.35 * contestedRatio;
  return clamp(score, -1, 1);
}

export function computeTrendingNewsScore(params: {
  recencyWeight: number;
  trustWeight: number;
  watchlistOverlapWeight: number;
}): number {
  const recencyWeight = clamp(params.recencyWeight, 0, 1);
  const trustWeight = clamp(params.trustWeight, 0, 1);
  const watchlistOverlapWeight = clamp(params.watchlistOverlapWeight, 0, 1);
  return 0.5 * recencyWeight + 0.3 * trustWeight + 0.2 * watchlistOverlapWeight;
}

export type ConfidenceMoverLike = {
  delta: number;
};

export function selectConfidenceMovers<T extends ConfidenceMoverLike>(
  rows: T[],
  mode: "all" | "up" | "down"
): T[] {
  if (mode === "up") return rows.filter((row) => row.delta > 0);
  if (mode === "down") return rows.filter((row) => row.delta < 0);
  return rows;
}
