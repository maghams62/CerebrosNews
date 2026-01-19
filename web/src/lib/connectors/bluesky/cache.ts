import fs from "fs/promises";
import path from "path";
import { FeedItem } from "@/types/feed";

export interface BlueskyCachePayload {
  fetchedAtMs: number;
  items: FeedItem[];
  counts: {
    posts: number;
    timeline?: number;
    search?: number;
  };
  topicsKey: string;
}

let memoryCache: BlueskyCachePayload | null = null;

function nowMs(): number {
  return Date.now();
}

function cacheFilePath(): string {
  return path.join(process.cwd(), ".cache", "bluesky.json");
}

export function getBlueskyTtlMs(): number {
  const raw = process.env.BLUESKY_CACHE_TTL_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 5 * 60 * 1000;
  return parsed;
}

function isFresh(payload: BlueskyCachePayload, ttlMs: number): boolean {
  return nowMs() - payload.fetchedAtMs < ttlMs;
}

async function readFileCache(): Promise<BlueskyCachePayload | null> {
  try {
    const fp = cacheFilePath();
    const raw = await fs.readFile(fp, "utf8");
    const parsed = JSON.parse(raw) as BlueskyCachePayload;
    if (!parsed || typeof parsed.fetchedAtMs !== "number" || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeFileCache(payload: BlueskyCachePayload): Promise<void> {
  try {
    const fp = cacheFilePath();
    await fs.mkdir(path.dirname(fp), { recursive: true });
    await fs.writeFile(fp, JSON.stringify(payload), "utf8");
  } catch {
    // Ignore errors (read-only FS / serverless).
  }
}

export async function readCachedBluesky(topicsKey: string): Promise<BlueskyCachePayload | null> {
  const ttlMs = getBlueskyTtlMs();
  if (memoryCache && memoryCache.topicsKey === topicsKey && isFresh(memoryCache, ttlMs)) return memoryCache;

  const filePayload = await readFileCache();
  if (filePayload && filePayload.topicsKey === topicsKey && isFresh(filePayload, ttlMs)) {
    memoryCache = filePayload;
    return filePayload;
  }

  return null;
}

export async function writeCachedBluesky(payload: BlueskyCachePayload): Promise<BlueskyCachePayload> {
  memoryCache = payload;
  await writeFileCache(payload);
  return payload;
}
