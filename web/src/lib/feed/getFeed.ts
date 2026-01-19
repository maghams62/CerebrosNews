import Parser from "rss-parser";
import { FEED_SOURCES } from "./sources";
import { dedupeAndSort, normalizeRssItem } from "./normalize";
import { readCachedFeed, writeCachedFeed } from "./cache";
import { FeedItem } from "@/types/feed";

const parser = new Parser();

async function fetchText(url: string, timeoutMs = 10_000): Promise<string> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Some publishers reject empty/default UA.
        "user-agent": "TikTokNews/0.1 (feed-ingestion)",
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      },
    });
    if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(id);
  }
}

async function fetchAndParseSource(source: (typeof FEED_SOURCES)[number]): Promise<FeedItem[]> {
  const xml = await fetchText(source.feedUrl);
  const feed = await parser.parseString(xml);
  const items = (feed.items ?? []).map((item) => normalizeRssItem(source, item)).filter(Boolean) as FeedItem[];
  return items;
}

export async function getFeed(): Promise<FeedItem[]> {
  const cached = await readCachedFeed();
  if (cached) return cached.items;

  const settled = await Promise.allSettled(FEED_SOURCES.map((s) => fetchAndParseSource(s)));
  const merged: FeedItem[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") merged.push(...r.value);
  }

  const finalItems = dedupeAndSort(merged);
  await writeCachedFeed(finalItems);
  return finalItems;
}

export async function getFeedFresh(): Promise<FeedItem[]> {
  const settled = await Promise.allSettled(FEED_SOURCES.map((s) => fetchAndParseSource(s)));
  const merged: FeedItem[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") merged.push(...r.value);
  }
  const finalItems = dedupeAndSort(merged);
  await writeCachedFeed(finalItems);
  return finalItems;
}

