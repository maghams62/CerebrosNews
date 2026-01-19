export type SourceType = "editorial" | "community" | "primary" | "vc_blog" | "aggregator" | "social";

export interface DatasetSource {
  id: string;
  name: string;
  homepage: string;
  type: SourceType;
  rss?: string | null;
  logoUrl?: string | null;
  bias?: string | null;
}

export interface DatasetTopic {
  id: string;
  label: string;
  keywords: string[];
}

export interface DatasetItem {
  id: string;
  sourceId: string;
  sourceType: SourceType;
  title: string;
  url: string;
  canonicalUrl?: string | null;
  publishedAt: string; // ISO
  author?: string | null;
  summary: string;
  description?: string;
  extractedText?: string | null;
  domain?: string | null;
  imageCandidates?: string[];
  embedding?: number[] | null;
  media: {
    imageUrl: string | null; // local path, e.g. /data/images/<id>.jpg
  };
  tags: string[];
  entities?: Record<string, unknown> | null;
  audienceReaction?: {
    summary: string;
    comments?: string[];
    source: "hn" | "reddit" | "inferred";
  } | null;
  signals?: {
    hn?: {
      id: number;
      score?: number;
      comments?: number;
    };
  } | null;
  analysis: {
    speculation: string | null;
  };
  raw: unknown;
}

export interface StoryCluster {
  id: string;
  title: string;
  tags: string[];
  itemIds: string[];
  lenses: Record<SourceType, string[]>;
  representativeItemId?: string;
  createdAt?: string;
  updatedAt?: string;
  narrativeDiff: unknown | null;
  verify: { claims: unknown[] };
  opposing: unknown | null;
}

export interface DatasetFile {
  version: "0.1";
  generatedAt: string; // ISO
  sources: DatasetSource[];
  topics: DatasetTopic[];
  items: DatasetItem[];
  stories: StoryCluster[];
}

export type LLMOutputScope = "article" | "cluster";

export interface LLMOutput {
  scope: LLMOutputScope;
  scopeId: string;
  summary_markdown?: string;
  bias?: string;
  missing?: string;
  impact?: string;
  citations: string[];
  createdAt: string;
  modelInfo?: string;
}
