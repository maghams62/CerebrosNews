import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { FetchOptions, fetchWithRetry } from "./fetch";
import { canonicalizeUrl } from "./url";

type ExtractedArticle = {
  canonicalUrl: string | null;
  text: string | null;
  firstImageUrl: string | null;
  ogImageUrl: string | null;
};

function stripHtml(html: string): string {
  const noScripts = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  const noStyles = noScripts.replace(/<style[\s\S]*?<\/style>/gi, "");
  const text = noStyles.replace(/<\/?[^>]+>/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

function extractCanonicalFromHtml(html: string): string | null {
  const lower = html.toLowerCase();
  const idx = lower.indexOf('rel="canonical"');
  if (idx === -1) return null;
  const snippet = html.slice(Math.max(0, idx - 400), idx + 400);
  const match = snippet.match(/href=["']([^"']+)["']/i);
  return match?.[1] ? canonicalizeUrl(match[1]) : null;
}

function extractMetaImage(html: string, key: "og:image" | "twitter:image"): string | null {
  const lower = html.toLowerCase();
  const idx = lower.indexOf(key === "og:image" ? 'property="og:image"' : 'name="twitter:image"');
  if (idx === -1) return null;
  const snippet = html.slice(Math.max(0, idx - 400), idx + 400);
  const match = snippet.match(/content=["']([^"']+)["']/i);
  return match?.[1] ?? null;
}

function extractFirstImage(html: string): string | null {
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] ?? null;
}

function readabilityExtract(html: string, url: string): { text: string | null; image: string | null } {
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const parsed = reader.parse();
    if (!parsed) return { text: null, image: null };
    const parsedWithImage = parsed as typeof parsed & { image?: string };
    const text = parsed.textContent?.replace(/\s+/g, " ").trim() ?? null;
    const image = parsedWithImage.image || null;
    return { text: text && text.length ? text : null, image };
  } catch {
    return { text: null, image: null };
  }
}

export async function fetchArticleHtml(url: string, opts: FetchOptions): Promise<string | null> {
  try {
    const res = await fetchWithRetry(
      url,
      {
        method: "GET",
        redirect: "follow",
        headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      },
      opts
    );
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function extractArticleFromUrl(url: string, opts: FetchOptions): Promise<ExtractedArticle> {
  const html = await fetchArticleHtml(url, opts);
  if (!html) {
    return { canonicalUrl: null, text: null, firstImageUrl: null, ogImageUrl: null };
  }

  const canonicalUrl = extractCanonicalFromHtml(html);
  const ogImageUrl = extractMetaImage(html, "og:image") ?? extractMetaImage(html, "twitter:image");

  const readability = readabilityExtract(html, url);
  const fallbackText = stripHtml(html);
  const text = readability.text ?? fallbackText;
  const firstImageUrl = readability.image ?? extractFirstImage(html);
  const trimmed = text && text.length ? text.slice(0, 8000) : "";

  return {
    canonicalUrl,
    text: trimmed || null,
    firstImageUrl: firstImageUrl ? firstImageUrl.trim() : null,
    ogImageUrl: ogImageUrl ? ogImageUrl.trim() : null,
  };
}
