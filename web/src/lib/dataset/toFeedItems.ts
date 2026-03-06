import { FeedItem } from "@/types/feed";
import { OfflineDatasetFile, OfflineDatasetItem } from "./offlineDataset";

function sourceNameFor(dataset: OfflineDatasetFile, sourceId: string): string {
  const s = dataset.sources?.find((x) => x.id === sourceId);
  return s?.name ?? sourceId;
}

function coerceSourceType(t: string): "editorial" | "community" | "social" | "primary" {
  if (t === "community") return "community";
  if (t === "social") return "social";
  if (t === "primary") return "primary";
  return "editorial";
}

export function offlineItemToFeedItem(dataset: OfflineDatasetFile, item: OfflineDatasetItem): FeedItem {
  const text =
    item.extractedText && item.extractedText.trim().length
      ? item.extractedText
      : item.description && item.description.trim().length
        ? item.description
        : item.summary;
  return {
    id: item.id,
    title: item.title,
    summary: item.summary,
    bulletSummary: item.bulletSummary,
    biasAnalysis: item.biasAnalysis,
    whatsMissing: item.whatsMissing,
    impact: item.impact,
    url: item.url,
    text,
    imageUrl: item.media?.imageUrl ?? undefined,
    publishedAt: item.publishedAt,
    sourceName: sourceNameFor(dataset, item.sourceId),
    sourceType: coerceSourceType(item.sourceType),
    tags: item.tags ?? [],
    dataOrigin: "curated",
  };
}

export function offlineDatasetToFeedItems(dataset: OfflineDatasetFile): FeedItem[] {
  const items = dataset.items ?? [];
  const hasRealUrl = (value?: string | null) => {
    if (!value) return false;
    try {
      const u = new URL(value);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  };
  return items.filter((it) => hasRealUrl(it.url)).map((it) => offlineItemToFeedItem(dataset, it));
}
