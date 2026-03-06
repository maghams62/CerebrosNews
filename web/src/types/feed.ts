export type SourceType = "editorial" | "community" | "social" | "primary";
export type DataOrigin = "fetched" | "curated" | "derived";

export type FeedItemMetrics = {
  likes?: number;
  reposts?: number;
  replies?: number;
};

export type MarketPlatform = "polymarket" | "kalshi";

export type MarketComment = {
  author: string;
  text: string;
  likes?: number;
};

export type MarketMeta = {
  platform: MarketPlatform;
  question: string;
  yes: number;
  no: number;
  volume24h?: number;
  liquidity?: number;
  updatedAt?: string;
  marketUrl?: string;
  marketTicker?: string;
  eventTicker?: string;
  comments?: MarketComment[];
  sentimentSummary?: string[];
  demo?: boolean;
};

export interface FeedItem {
  /** Stable hash of source + canonicalUrl */
  id: string;
  title: string;
  summary: string;
  bulletSummary?: string[];
  biasAnalysis?: { vestedInterests: string[]; framingBias: string[]; confidence: "low" | "medium" | "high" };
  whatsMissing?: string[];
  impact?: { shortTerm: string[]; longTerm: string[] };
  /** Canonical link when present; may be missing for social posts */
  url?: string;
  /** Post permalink (e.g., Bluesky) */
  postUrl?: string;
  text?: string;
  author?: string;
  authorHandle?: string;
  imageUrl?: string;
  /** ISO string */
  publishedAt: string;
  sourceName: string;
  sourceType: SourceType;
  tags: string[];
  metrics?: FeedItemMetrics;
  market?: MarketMeta;
  dataOrigin?: DataOrigin;
}
