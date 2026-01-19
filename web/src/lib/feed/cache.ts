import fs from "fs/promises";
import path from "path";
import { FeedItem } from "@/types/feed";

export interface FeedCachePayload {
  fetchedAtMs: number;
  items: FeedItem[];
}

let memoryCache: FeedCachePayload | null = null;

function nowMs(): number {
  return Date.now();
}

export function getTtlMs(): number {
  const raw = process.env.FEED_CACHE_TTL_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 10 * 60 * 1000;
  return parsed;
}

function isFresh(payload: FeedCachePayload, ttlMs: number): boolean {
  return nowMs() - payload.fetchedAtMs < ttlMs;
}

function cacheFilePath(): string {
  // Place under the app's working directory; guarded by try/catch in callers.
  return path.join(process.cwd(), ".cache", "feed.json");
}

async function readFileCache(): Promise<FeedCachePayload | null> {
  try {
    const fp = cacheFilePath();
    const raw = await fs.readFile(fp, "utf8");
    const parsed = JSON.parse(raw) as FeedCachePayload;
    if (!parsed || typeof parsed.fetchedAtMs !== "number" || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeFileCache(payload: FeedCachePayload): Promise<void> {
  try {
    const fp = cacheFilePath();
    await fs.mkdir(path.dirname(fp), { recursive: true });
    await fs.writeFile(fp, JSON.stringify(payload), "utf8");
  } catch {
    // Ignore (serverless / readonly FS).
  }
}

export async function readCachedFeed(): Promise<FeedCachePayload | null> {
  const ttlMs = getTtlMs();
  if (memoryCache && isFresh(memoryCache, ttlMs)) return memoryCache;

  const filePayload = await readFileCache();
  if (filePayload && isFresh(filePayload, ttlMs)) {
    memoryCache = filePayload;
    return filePayload;
  }

  return null;
}

// Return the most recent cached payload even if stale (useful for SWR-style behavior).
export async function readAnyCachedFeed(): Promise<FeedCachePayload | null> {
  if (memoryCache) return memoryCache;
  const filePayload = await readFileCache();
  if (filePayload) {
    memoryCache = filePayload;
    return filePayload;
  }
  return null;
}

export async function writeCachedFeed(items: FeedItem[]): Promise<FeedCachePayload> {
  const payload: FeedCachePayload = { fetchedAtMs: nowMs(), items };
  memoryCache = payload;
  await writeFileCache(payload);
  return payload;
}

