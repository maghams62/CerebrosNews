import { readOfflineDataset, OfflineDatasetItem } from "@/lib/dataset/offlineDataset";
import { readAnyCachedFeed } from "@/lib/feed/cache";
import { getFeed } from "@/lib/feed/getFeed";
import { NewsSource } from "@/lib/fundgraph/types";
import { FeedItem } from "@/types/feed";

function toNewsSource(item: OfflineDatasetItem, sourceName?: string): NewsSource {
  const contentParts = [
    item.extractedText,
    item.description,
    item.summary,
    Array.isArray(item.bulletSummary) ? item.bulletSummary.join("\n") : "",
  ]
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);

  return {
    id: item.id,
    title: item.title,
    url: item.url,
    sourceName: sourceName ?? item.sourceId,
    summary: item.summary,
    content: contentParts.join("\n\n"),
    publishedAt: item.publishedAt,
    tags: item.tags ?? [],
  };
}

function sourceNameById(datasetSources: Array<{ id: string; name: string }> | undefined, sourceId: string): string {
  return datasetSources?.find((source) => source.id === sourceId)?.name ?? sourceId;
}

function fromFeedItem(item: FeedItem): NewsSource | null {
  const url = item.url ?? item.postUrl;
  if (!url) return null;
  const contentParts = [
    item.text,
    item.summary,
    Array.isArray(item.bulletSummary) ? item.bulletSummary.join("\n") : "",
  ]
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);

  return {
    id: item.id,
    title: item.title,
    url,
    sourceName: item.sourceName,
    summary: item.summary,
    content: contentParts.join("\n\n"),
    publishedAt: item.publishedAt,
    tags: item.tags ?? [],
  };
}

async function findInFeedById(newsId: string): Promise<NewsSource | null> {
  const cached = await readAnyCachedFeed();
  const inCache = cached?.items?.find((entry) => entry.id === newsId);
  if (inCache) return fromFeedItem(inCache);

  try {
    const feed = await getFeed();
    const item = feed.find((entry) => entry.id === newsId);
    if (!item) return null;
    return fromFeedItem(item);
  } catch {
    return null;
  }
}

async function findInFeedByUrl(url: string): Promise<NewsSource | null> {
  const cached = await readAnyCachedFeed();
  const inCache = cached?.items?.find((entry) => entry.url === url || entry.postUrl === url);
  if (inCache) return fromFeedItem(inCache);

  try {
    const feed = await getFeed();
    const item = feed.find((entry) => entry.url === url || entry.postUrl === url);
    if (!item) return null;
    return fromFeedItem(item);
  } catch {
    return null;
  }
}

export async function getNewsSourceById(newsId: string): Promise<NewsSource | null> {
  const dataset = await readOfflineDataset();
  const item = dataset?.items?.find((entry) => entry.id === newsId);
  if (item && item.url) {
    return toNewsSource(item, sourceNameById(dataset?.sources, item.sourceId));
  }
  if ((dataset?.items?.length ?? 0) > 0) return null;
  return findInFeedById(newsId);
}

export async function getNewsSourceByUrl(url: string): Promise<NewsSource | null> {
  const dataset = await readOfflineDataset();
  const item = dataset?.items?.find((entry) => entry.url === url || entry.canonicalUrl === url);
  if (item && item.url) {
    return toNewsSource(item, sourceNameById(dataset?.sources, item.sourceId));
  }
  if ((dataset?.items?.length ?? 0) > 0) return null;
  return findInFeedByUrl(url);
}

export async function listNewsSources(limit = 50): Promise<NewsSource[]> {
  const dataset = await readOfflineDataset();
  const items = (dataset?.items ?? []).filter((item) => Boolean(item.url));
  if (items.length) {
    return items
      .sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt))
      .slice(0, limit)
      .map((item) => toNewsSource(item, sourceNameById(dataset?.sources, item.sourceId)));
  }

  const feed = await getFeed().catch(() => []);
  return feed
    .slice(0, Math.max(1, limit))
    .map(fromFeedItem)
    .filter((item): item is NewsSource => Boolean(item));
}
