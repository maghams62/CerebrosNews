import { ClaimLink, Fund, FundgraphDbFile, GraphEdge, NewsClaim, Signal, Source } from "@/lib/fundgraph/types";

export interface CanonicalizationResult {
  funds: Fund[];
  aliasByFundId: Map<string, string>;
  mergedFundCount: number;
}

export type DiscoveredSourceType =
  | "dataset_article"
  | "official_site"
  | "investing_rss"
  | "social_hn"
  | "social_reddit"
  | "synthetic_fallback";

export interface SourceCandidate {
  id: string;
  title: string;
  url?: string;
  sourceName: string;
  sourceType: DiscoveredSourceType;
  summary: string;
  content: string;
  publishedAt: string;
  tags: string[];
  fundIds: string[];
  isSynthetic?: boolean;
}

export interface VcEnrichmentSummary {
  total_vc_funds_processed: number;
  total_new_citations_fetched: number;
  total_new_news_items_fetched: number;
  total_new_portfolio_relationships_added: number;
  total_new_partner_gp_facts_added: number;
  total_deduped_items_merged: number;
  total_aligned_signals: number;
  total_warning_signals: number;
  total_failed_signals: number;
  total_global_feed_eligible_signals: number;
  top_funds_by_news_volume: Array<{ fund_id: string; fund_name: string; count: number }>;
  top_funds_by_citation_count: Array<{ fund_id: string; fund_name: string; count: number }>;
}

export interface VcEnrichmentResult {
  funds: Fund[];
  signals: Signal[];
  graphEdges: GraphEdge[];
  db: FundgraphDbFile;
  summary: VcEnrichmentSummary;
}

export interface VcEnrichmentOptions {
  fundLimit?: number;
  maxFeedItemsPerSource?: number;
  maxClaimSources?: number;
  maxOfficialPagesPerFund?: number;
  hnPages?: number;
  dryRun?: boolean;
  offlineOnly?: boolean;
  useLlmExtraction?: boolean;
  allowSyntheticFallback?: boolean;
}

export interface ClaimEnrichmentState {
  claims: NewsClaim[];
  claimLinks: ClaimLink[];
  sources: Source[];
}

export const VC_MINIMUM_DENSITY = {
  newsItems: 6,
  citations: 12,
  signals: 8,
  partnerFacts: 4,
  portfolioRelationships: 8,
} as const;
