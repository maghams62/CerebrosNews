import fs from "fs/promises";
import path from "path";

export type OfflineSourceType = "editorial" | "community" | "primary" | "vc_blog" | "aggregator" | "social";
export type CerebrosDemoMode = "off" | "investing";
export const DEMO_INVESTING_TAG = "Demo:Investing";

export interface OfflineDatasetSource {
  id: string;
  name: string;
  type: OfflineSourceType;
}

export interface OfflineDatasetItem {
  id: string;
  sourceId: string;
  sourceType: OfflineSourceType;
  title: string;
  url: string;
  canonicalUrl?: string | null;
  publishedAt: string;
  summary: string;
  bulletSummary?: string[];
  biasAnalysis?: { vestedInterests: string[]; framingBias: string[]; confidence: "low" | "medium" | "high" };
  whatsMissing?: string[];
  impact?: { shortTerm: string[]; longTerm: string[] };
  description?: string;
  extractedText?: string | null;
  author?: string | null;
  domain?: string | null;
  media?: { imageUrl?: string | null } | null;
  tags?: string[];
  signals?: unknown;
}

export interface OfflineDatasetFile {
  version?: string;
  generatedAt?: string;
  sources?: OfflineDatasetSource[];
  items?: OfflineDatasetItem[];
}

export function getCerebrosDemoMode(): CerebrosDemoMode {
  const raw = String(process.env.CEREBROS_DEMO_MODE ?? "off").toLowerCase().trim();
  return raw === "investing" ? "investing" : "off";
}

function isDemoInvestingItem(item: OfflineDatasetItem): boolean {
  return Array.isArray(item.tags) && item.tags.includes(DEMO_INVESTING_TAG);
}

export function filterDatasetForDemoMode(
  dataset: OfflineDatasetFile,
  mode: CerebrosDemoMode = getCerebrosDemoMode()
): OfflineDatasetFile {
  if (mode !== "investing") return dataset;
  const filteredItems = (dataset.items ?? []).filter(isDemoInvestingItem);
  return {
    ...dataset,
    items: filteredItems,
  };
}

export async function readOfflineDataset(opts?: {
  mode?: CerebrosDemoMode;
  includeAll?: boolean;
}): Promise<OfflineDatasetFile | null> {
  const base = path.join(process.cwd(), "public", "data");
  const feedPath = path.join(base, "feed.json");
  const articlesPath = path.join(base, "articles.json");
  const mode = opts?.mode ?? getCerebrosDemoMode();
  const includeAll = Boolean(opts?.includeAll);

  // Prefer `articles.json` when present so we use LLM summaries in the feed.
  try {
    const st = await fs.stat(articlesPath);
    const raw = await fs.readFile(articlesPath, "utf8");
    const parsed = JSON.parse(raw) as { articles?: OfflineDatasetItem[]; sources?: OfflineDatasetSource[] };
    if (!Array.isArray(parsed.articles)) throw new Error("articles missing");
    const dataset: OfflineDatasetFile = {
      version: "0.1",
      generatedAt: new Date().toISOString(),
      sources: parsed.sources ?? [],
      items: parsed.articles,
    };
    return includeAll ? dataset : filterDatasetForDemoMode(dataset, mode);
  } catch {
    // fall through
  }

  try {
    const st = await fs.stat(feedPath);
    const raw = await fs.readFile(feedPath, "utf8");
    const parsed = JSON.parse(raw) as OfflineDatasetFile;
    return includeAll ? parsed : filterDatasetForDemoMode(parsed, mode);
  } catch {
    return null;
  }
}
