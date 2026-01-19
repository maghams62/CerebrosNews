import { DatasetItem, SourceType } from "./schema";
import { canonicalizeUrl, domainFromUrl, stableId } from "./url";

type RssItemLike = {
  title?: unknown;
  link?: unknown;
  guid?: unknown;
  isoDate?: unknown;
  pubDate?: unknown;
  author?: unknown;
  creator?: unknown;
  contentSnippet?: unknown;
  content?: unknown;
  summary?: unknown;
  enclosure?: { url?: unknown };
  itunes?: { image?: unknown };
  [k: string]: unknown;
};

function decodeBasicHtmlEntities(s: string): string {
  return s
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function stripHtml(html: string): string {
  const noScripts = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  const noStyles = noScripts.replace(/<style[\s\S]*?<\/style>/gi, "");
  const text = noStyles.replace(/<\/?[^>]+>/g, " ");
  return decodeBasicHtmlEntities(text).replace(/\s+/g, " ").trim();
}

function firstImageFromHtml(html?: string): string | undefined {
  if (!html) return undefined;
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1];
}

function coerceIsoDate(item: RssItemLike): string {
  const raw = (item.isoDate ?? item.pubDate) as unknown;
  if (typeof raw === "string" && raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

function pickUrl(item: RssItemLike): string | null {
  const raw = item.link ?? item.guid;
  if (typeof raw !== "string" || !raw) return null;
  return canonicalizeUrl(raw);
}

function pickTitle(item: RssItemLike): string | null {
  const t = item.title;
  if (typeof t !== "string") return null;
  const trimmed = t.trim();
  return trimmed ? trimmed : null;
}

function pickSummary(item: RssItemLike): string {
  const raw = item.contentSnippet ?? item.summary ?? item.content ?? "";
  if (typeof raw === "string") return stripHtml(raw);
  return stripHtml(String(raw));
}

function pickAuthor(item: RssItemLike): string | null {
  const a = item.author ?? item.creator;
  if (typeof a !== "string") return null;
  const trimmed = a.trim();
  return trimmed ? trimmed : null;
}

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

export function pickRssImageUrl(item: RssItemLike): string | null {
  const enclosureUrl = item.enclosure?.url;
  if (typeof enclosureUrl === "string" && enclosureUrl) return enclosureUrl;
  const itunesImage = item.itunes?.image;
  if (typeof itunesImage === "string" && itunesImage) return itunesImage;

  const mediaContent = extractMediaUrl(item["media:content"]);
  if (mediaContent) return mediaContent;
  const mediaThumb = extractMediaUrl(item["media:thumbnail"]);
  if (mediaThumb) return mediaThumb;

  const fromHtml = firstImageFromHtml(
    typeof item.content === "string" ? item.content : typeof item.summary === "string" ? item.summary : undefined
  );
  return fromHtml ?? null;
}

export function normalizeRssToDatasetItem(params: {
  sourceId: string;
  sourceType: SourceType;
  rssItem: Record<string, unknown>;
  defaultUrl?: string;
}): { item: DatasetItem | null; canonicalUrl: string | null; rssImageUrl: string | null } {
  const parsed = params.rssItem as RssItemLike;
  const url = pickUrl(parsed) ?? (params.defaultUrl ? canonicalizeUrl(params.defaultUrl) : null);
  if (!url) return { item: null, canonicalUrl: null, rssImageUrl: null };

  const title = pickTitle(parsed);
  if (!title) return { item: null, canonicalUrl: url, rssImageUrl: null };

  const publishedAt = coerceIsoDate(parsed);
  const author = pickAuthor(parsed);
  const summary = pickSummary(parsed);
  const rssImageUrl = pickRssImageUrl(parsed);
  const domain = url ? domainFromUrl(url) : null;

  const id = stableId([params.sourceId, url]);

  const item: DatasetItem = {
    id,
    sourceId: params.sourceId,
    sourceType: params.sourceType,
    title,
    url,
    canonicalUrl: url,
    publishedAt,
    author,
    summary,
    description: summary,
    extractedText: null,
    domain,
    imageCandidates: [],
    media: { imageUrl: null }, // filled later
    tags: [],
    entities: null,
    signals: null,
    analysis: { speculation: null },
    raw: params.rssItem,
  };
  return { item, canonicalUrl: url, rssImageUrl };
}

export function dedupeByCanonicalUrl(items: Array<{ item: DatasetItem; canonicalUrl: string }>): DatasetItem[] {
  const byUrl = new Map<string, DatasetItem>();
  for (const { item, canonicalUrl } of items) {
    const existing = byUrl.get(canonicalUrl);
    if (!existing) {
      byUrl.set(canonicalUrl, item);
      continue;
    }
    const a = new Date(existing.publishedAt).getTime();
    const b = new Date(item.publishedAt).getTime();
    if (b > a) byUrl.set(canonicalUrl, item);
  }
  return Array.from(byUrl.values()).sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

