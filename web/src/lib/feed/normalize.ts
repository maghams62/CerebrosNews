import crypto from "crypto";
import { FeedItem } from "@/types/feed";
import { FeedSource } from "./sources";

type RssItemLike = {
  title?: string;
  link?: string;
  guid?: string;
  isoDate?: string;
  pubDate?: string;
  contentSnippet?: string;
  content?: string;
  summary?: string;
  enclosure?: { url?: string };
  itunes?: { image?: string };
  [k: string]: unknown;
};

function decodeBasicHtmlEntities(s: string): string {
  // Minimal decoding to keep summaries readable without extra deps.
  return s
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function stripHtml(html: string): string {
  // Remove script/style first, then tags.
  const noScripts = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  const noStyles = noScripts.replace(/<style[\s\S]*?<\/style>/gi, "");
  const text = noStyles.replace(/<\/?[^>]+>/g, " ");
  return decodeBasicHtmlEntities(text).replace(/\s+/g, " ").trim();
}

function canonicalizeUrl(input: string): string {
  try {
    const u = new URL(input);
    u.hash = "";

    const toDeleteExact = new Set([
      "ref",
      "source",
      "feature",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "utm_id",
      "utm_name",
      "utm_reader",
    ]);

    for (const key of Array.from(u.searchParams.keys())) {
      if (toDeleteExact.has(key)) u.searchParams.delete(key);
      if (key.toLowerCase().startsWith("utm_")) u.searchParams.delete(key);
    }

    // Normalize trailing slash (but keep root slash).
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return input;
  }
}

function stableId(sourceKey: string, canonicalUrl: string): string {
  return crypto.createHash("sha256").update(`${sourceKey}|${canonicalUrl}`).digest("hex").slice(0, 24);
}

function firstImageFromHtml(html?: string): string | undefined {
  if (!html) return undefined;
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1];
}

function coerceDateToIso(item: RssItemLike): string {
  const candidate = item.isoDate ?? item.pubDate;
  if (candidate) {
    const d = new Date(candidate);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

function pickSummary(item: RssItemLike): string {
  const raw = item.contentSnippet ?? item.summary ?? item.content ?? "";
  return stripHtml(String(raw));
}

function pickUrl(item: RssItemLike): string | undefined {
  const raw = item.link ?? item.guid;
  if (!raw) return undefined;
  return canonicalizeUrl(String(raw));
}

function pickImageUrl(item: RssItemLike): string | undefined {
  const enclosureUrl = item.enclosure?.url;
  if (enclosureUrl) return String(enclosureUrl);

  const itunesImage = item.itunes?.image;
  if (itunesImage) return String(itunesImage);

  // Common RSS media fields: "media:content", "media:thumbnail"
  function extractMediaUrl(v: unknown): string | undefined {
    if (!v || typeof v !== "object") return undefined;
    const obj = v as Record<string, unknown>;
    const directUrl = obj.url;
    if (typeof directUrl === "string") return directUrl;
    const dollar = obj["$"];
    if (!dollar || typeof dollar !== "object") return undefined;
    const d = dollar as Record<string, unknown>;
    const nestedUrl = d.url;
    if (typeof nestedUrl === "string") return nestedUrl;
    return undefined;
  }

  const mediaContent = extractMediaUrl(item["media:content"]);
  if (mediaContent) return mediaContent;
  const mediaThumb = extractMediaUrl(item["media:thumbnail"]);
  if (mediaThumb) return mediaThumb;

  // Fallback: first <img> in HTML content.
  const fromHtml = firstImageFromHtml(
    typeof item.content === "string" ? item.content : typeof item.summary === "string" ? item.summary : undefined
  );
  return fromHtml;
}

export function normalizeRssItem(source: FeedSource, item: unknown): FeedItem | null {
  const parsed = (typeof item === "object" && item !== null ? (item as RssItemLike) : {}) as RssItemLike;

  const url = pickUrl(parsed);
  if (!url) return null;

  const title = (parsed.title ?? "").toString().trim();
  if (!title) return null;

  const publishedAt = coerceDateToIso(parsed);
  const summary = pickSummary(parsed);
  const imageUrl = pickImageUrl(parsed);

  const id = stableId(source.key, url);

  return {
    id,
    title,
    summary,
    url,
    imageUrl: imageUrl ? String(imageUrl) : undefined,
    publishedAt,
    sourceName: source.sourceName,
    sourceType: source.sourceType,
    text: summary,
    tags: [],
  };
}

export function dedupeAndSort(items: FeedItem[]): FeedItem[] {
  const byKey = new Map<string, FeedItem>();
  for (const item of items) {
    const key = item.url ?? item.postUrl ?? item.id;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      continue;
    }
    const a = new Date(existing.publishedAt).getTime();
    const b = new Date(item.publishedAt).getTime();
    if (b > a) byKey.set(key, item);
  }
  return Array.from(byKey.values()).sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

