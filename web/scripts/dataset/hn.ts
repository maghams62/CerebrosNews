import { fetchJson, FetchOptions } from "./fetch";
import { canonicalizeUrl, stableId } from "./url";
import { DatasetItem } from "./schema";

export interface HnItem {
  id: number;
  by?: string;
  time?: number; // unix seconds
  title?: string;
  url?: string;
  score?: number;
  descendants?: number; // comments
  type?: string;
  text?: string;
  kids?: number[];
}

export interface HnAlgoliaHit {
  objectID: string;
  title?: string | null;
  url?: string | null;
  author?: string | null;
  created_at?: string | null;
  points?: number | null;
  num_comments?: number | null;
  story_text?: string | null;
}

export interface HnAlgoliaResponse {
  hits: HnAlgoliaHit[];
}

export function extractHnIdFromUrl(url: string): number | null {
  try {
    const u = new URL(url);
    if (u.hostname !== "news.ycombinator.com") return null;
    const id = u.searchParams.get("id");
    if (!id) return null;
    const n = Number.parseInt(id, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function fetchHnItem(id: number, opts: FetchOptions): Promise<HnItem | null> {
  try {
    const url = `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
    const item = await fetchJson<HnItem>(url, opts);
    if (!item || typeof item !== "object") return null;
    return item;
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  const noTags = html.replace(/<\/?[^>]+>/g, " ");
  return noTags.replace(/\s+/g, " ").trim();
}

export async function fetchHnTopComments(
  id: number,
  opts: FetchOptions,
  limit = 3
): Promise<string[]> {
  const story = await fetchHnItem(id, opts);
  const kids = Array.isArray(story?.kids) ? story!.kids! : [];
  if (!kids.length) return [];
  const comments: string[] = [];
  for (const kid of kids) {
    if (comments.length >= limit) break;
    const item = await fetchHnItem(kid, opts);
    if (!item || item.type !== "comment") continue;
    if (typeof item.text !== "string") continue;
    const text = stripHtml(item.text);
    if (!text) continue;
    comments.push(text);
  }
  return comments;
}

export async function fetchHnAlgoliaStories(opts: FetchOptions, page = 0, hitsPerPage = 100): Promise<HnAlgoliaHit[]> {
  try {
    const url = `https://hn.algolia.com/api/v1/search_by_date?tags=story&page=${page}&hitsPerPage=${hitsPerPage}`;
    const res = await fetchJson<HnAlgoliaResponse>(url, opts);
    return Array.isArray(res?.hits) ? res.hits : [];
  } catch {
    return [];
  }
}

export async function fetchHnAlgoliaStoriesPaged(
  opts: FetchOptions,
  pages = 1,
  hitsPerPage = 100
): Promise<HnAlgoliaHit[]> {
  const all: HnAlgoliaHit[] = [];
  const totalPages = Math.max(1, Math.min(pages, 10));
  for (let page = 0; page < totalPages; page++) {
    const hits = await fetchHnAlgoliaStories(opts, page, hitsPerPage);
    all.push(...hits);
  }
  return all;
}

export function normalizeHnAlgoliaHit(hit: HnAlgoliaHit): { item: DatasetItem | null; canonicalUrl: string | null } {
  const url = typeof hit.url === "string" && hit.url ? canonicalizeUrl(hit.url) : null;
  const title = typeof hit.title === "string" ? hit.title.trim() : "";
  if (!url || !title) return { item: null, canonicalUrl: null };

  const publishedAt = hit.created_at ? new Date(hit.created_at).toISOString() : new Date().toISOString();
  const id = stableId(["hackernews", url]);

  const item: DatasetItem = {
    id,
    sourceId: "hackernews",
    sourceType: "community",
    title,
    url,
    publishedAt,
    author: hit.author ?? null,
    summary: hit.story_text ? String(hit.story_text).slice(0, 240) : "",
    media: { imageUrl: null },
    tags: [],
    entities: null,
    signals: {
      hn: {
        id: Number.parseInt(hit.objectID, 10) || 0,
        score: hit.points ?? undefined,
        comments: hit.num_comments ?? undefined,
      },
    },
    analysis: { speculation: null },
    raw: hit,
  };
  return { item, canonicalUrl: url };
}
