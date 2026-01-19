import fs from "fs/promises";
import path from "path";
import { DatasetSource } from "./schema";

export async function atomicWriteJson(targetPath: string, obj: unknown): Promise<void> {
  const dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${targetPath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(obj, null, 2), "utf8");
  await fs.rename(tmp, targetPath);
}

export interface ArticleOutput {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceType: string;
  title: string;
  url: string;
  canonicalUrl?: string | null;
  publishedAt: string;
  author?: string | null;
  summary: string;
  bias?: string;
  bulletSummary?: string[];
  biasAnalysis?: { vestedInterests: string[]; framingBias: string[]; confidence: "low" | "medium" | "high" };
  whatsMissing?: string[];
  impact?: { shortTerm: string[]; longTerm: string[] };
  audienceReaction?: {
    summary: string;
    comments?: string[];
    source?: string;
  };
  imageUrl?: string | null;
  tags: string[];
}

export interface ClusterPerspectiveOutput {
  id: string;
  source: string;
  sourceType: string;
  url: string;
  canonicalUrl?: string | null;
  title: string;
  summary?: string;
  bias?: string;
  publishedAt?: string;
  imageUrl?: string | null;
  author?: string | null;
}

export interface ClusterAnalysisOutput {
  summary_markdown: string;
  bias: string;
  missing: string;
  impact: string;
  framing?: string;
  sentiment?: string;
  agreement?: string;
  confidence?: string;
  framingSpectrum?: string;
  coverageMix?: string;
  selectionSignals?: string;
  citations: string[];
}

export interface ClusterOutput {
  id: string;
  canonicalTitle: string;
  canonicalUrl?: string;
  topicTags: string[];
  createdAt: string;
  updatedAt?: string;
  perspectives: ClusterPerspectiveOutput[];
  analysis: ClusterAnalysisOutput;
  imageUrl?: string | null;
}

export interface TrustDashboardEntry {
  clusterId: string;
  title: string;
  missing: string;
  biasAndFraming: string;
  sentiment: string;
  coverageAgreement: string;
  confidence: string;
  framingSpectrum: string;
  coverageMix: string;
  selectionSignals: string;
}

export async function writeArticles(
  baseDir: string,
  articles: ArticleOutput[],
  sources: DatasetSource[]
): Promise<void> {
  const target = path.join(baseDir, "data", "articles.json");
  await atomicWriteJson(target, { articles, sources });
}

export async function writeSources(baseDir: string, sources: DatasetSource[]): Promise<void> {
  const target = path.join(baseDir, "data", "sources.json");
  await atomicWriteJson(target, { sources });
}

export async function writeClusters(baseDir: string, clusters: ClusterOutput[]): Promise<void> {
  const target = path.join(baseDir, "data", "clusters.json");
  await atomicWriteJson(target, { clusters });
}

export async function writeEmbeddings(baseDir: string, model: string, vectors: Record<string, number[]>): Promise<void> {
  const target = path.join(baseDir, "data", "embeddings.json");
  await atomicWriteJson(target, { model, vectors });
}

export async function writeSummaries(baseDir: string, summaries: Record<string, string>): Promise<void> {
  const target = path.join(baseDir, "data", "summaries.json");
  await atomicWriteJson(target, { summaries });
}

export async function writeTrustDashboard(baseDir: string, entries: TrustDashboardEntry[]): Promise<void> {
  const target = path.join(baseDir, "data", "trust_dashboard.json");
  await atomicWriteJson(target, { entries });
}

export async function writeTrustFields(baseDir: string, dataset: unknown): Promise<void> {
  const target = path.join(baseDir, "data", "trustFields.json");
  await atomicWriteJson(target, dataset);
}

export async function writeNeighbors(baseDir: string, neighbors: Record<string, string[]>): Promise<void> {
  const target = path.join(baseDir, "data", "neighbors.json");
  await atomicWriteJson(target, { neighbors });
}
