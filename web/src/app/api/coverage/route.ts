import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const runtime = "nodejs";

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "are",
  "was",
  "were",
  "been",
  "have",
  "has",
  "had",
  "will",
  "would",
  "could",
  "should",
  "about",
  "into",
  "over",
  "under",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "how",
  "not",
  "but",
  "than",
  "then",
  "them",
  "they",
  "their",
  "its",
  "it's",
  "you",
  "your",
  "our",
  "out",
  "new",
  "next",
  "gen",
]);

const ENTITY_STOP = new Set([
  "Will",
  "Would",
  "Could",
  "Should",
  "Can",
  "Is",
  "Are",
  "Do",
  "Does",
  "Did",
  "The",
  "A",
  "An",
  "In",
  "On",
  "At",
  "By",
  "From",
  "To",
  "For",
  "With",
  "Next",
  "Gen",
  "New",
  "Market",
  "Markets",
]);

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    promise
      .then((val) => {
        clearTimeout(id);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(id);
        reject(err);
      });
  });
}

function normalizeUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function domainFromUrl(input: string): string | null {
  try {
    const url = new URL(input);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

const PLACEHOLDER_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "example.edu",
  "example.test",
  "example.invalid",
  "example.local",
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
]);

function isDisallowedDomain(input: string): boolean {
  const domain = domainFromUrl(input) ?? "";
  if (!domain) return true;
  if (PLACEHOLDER_DOMAINS.has(domain)) return true;
  for (const placeholder of PLACEHOLDER_DOMAINS) {
    if (placeholder.includes(".")) {
      if (domain.endsWith(`.${placeholder}`)) return true;
    }
  }
  return domain === "duckduckgo.com" || domain === "r.jina.ai";
}

function sanitizeQuery(query: string): string {
  const cleaned = query.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.replace(/["“”]/g, "");
}

function normalizeQueryText(text: string): string {
  return text
    .replace(/[^\w\s-]/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(input: string): string[] {
  return normalizeQueryText(input)
    .toLowerCase()
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function tokenSet(input: string): Set<string> {
  return new Set(tokenize(input));
}

function scoreOverlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / Math.sqrt(a.size * b.size);
}

function expandAbbreviations(text: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/\bAG\b/gi, "Attorney General"],
    [/\bDA\b/gi, "District Attorney"],
    [/\bDOJ\b/gi, "Justice Department"],
    [/\bFTC\b/gi, "Federal Trade Commission"],
    [/\bSEC\b/gi, "Securities and Exchange Commission"],
    [/\bEU\b/gi, "European Union"],
    [/\bUK\b/gi, "United Kingdom"],
    [/\bU\.S\.\b/gi, "United States"],
    [/\bUS\b/gi, "United States"],
  ];
  let out = text;
  for (const [regex, value] of replacements) {
    out = out.replace(regex, value);
  }
  return out;
}

function keywordQuery(text: string, maxTerms = 8): string {
  const parts = tokenize(text);
  return parts.slice(0, maxTerms).join(" ");
}

function extractEntities(text: string): string[] {
  if (!text) return [];
  const cleaned = text.replace(/[^\w\s-]/g, " ");
  const tokens = cleaned.split(/\s+/g).filter(Boolean);
  const out = new Set<string>();
  for (const token of tokens) {
    if (token.length < 2) continue;
    if (ENTITY_STOP.has(token)) continue;
    if (!/[A-Z]/.test(token)) continue;
    out.add(token);
  }
  return Array.from(out);
}

function buildCoverageQueries(input: {
  question: string;
  summary: string;
  tags: string[];
  entities: string[];
}): string[] {
  const queries: string[] = [];
  const seen = new Set<string>();
  const add = (q: string) => {
    const cleaned = sanitizeQuery(q);
    if (!cleaned || cleaned.length < 4) return;
    if (seen.has(cleaned)) return;
    seen.add(cleaned);
    queries.push(cleaned);
  };
  const question = expandAbbreviations(input.question || "");
  const summary = expandAbbreviations(input.summary || "");
  const tags = (input.tags ?? []).filter(Boolean);
  const baseKeywords = keywordQuery(`${question} ${summary} ${tags.join(" ")}`, 10);
  if (question) add(question);
  if (summary) add(keywordQuery(summary, 10));
  if (baseKeywords) add(baseKeywords);
  input.entities.forEach((ent) => {
    add(`${ent} ${baseKeywords}`.trim());
    add(`${ent} ${keywordQuery(question || summary || ent, 6)}`.trim());
    tags.slice(0, 2).forEach((t) => add(`${ent} ${t}`.trim()));
  });
  return queries.slice(0, 6);
}

async function fetchDdgHtml(query: string, timeoutMs: number): Promise<string> {
  const params = new URLSearchParams({ q: sanitizeQuery(query), kl: "us-en", ia: "web" });
  const headers = {
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "accept-language": "en-US,en;q=0.9",
  };
  const fetchHtml = async (url: string, withHeaders: boolean) => {
    try {
      const res = await withTimeout(
        fetch(url, { method: "GET", ...(withHeaders ? { headers } : {}) }),
        timeoutMs
      );
      if (!res.ok) return "";
      if (res.status === 202) return "";
      return res.text();
    } catch {
      return "";
    }
  };
  const looksLikeResults = (html: string) =>
    html.includes("/l/?") || html.includes("result__a") || html.includes("result-title-a");

  const direct = await fetchHtml(`https://duckduckgo.com/html/?${params.toString()}`, true);
  if (direct && looksLikeResults(direct)) return direct;
  const fallback = await fetchHtml(`https://r.jina.ai/http://duckduckgo.com/html/?${params.toString()}`, false);
  if (fallback && looksLikeResults(fallback)) return fallback;
  return fallback || direct || "";
}

async function ddgSearch(query: string, limit = 8, timeoutMs = 2000): Promise<string[]> {
  const cleanedQuery = sanitizeQuery(query);
  if (!cleanedQuery) return [];
  const finalHtml = await fetchDdgHtml(cleanedQuery, timeoutMs);
  if (!finalHtml) return [];
  const extractUddg = (href: string): string | null => {
    const match = href.match(/uddg=([^&\s)\]]+)/);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  };
  const decodeDdg = (href: string): string | null => {
    if (href.startsWith("/l/?")) return extractUddg(href);
    if (href.startsWith("http://duckduckgo.com/l/?") || href.startsWith("https://duckduckgo.com/l/?")) {
      return extractUddg(href);
    }
    return href;
  };
  const extractFromText = (text: string) => {
    const uddgLinks = Array.from(
      text.matchAll(/(?:https?:\/\/duckduckgo\.com)?\/l\/\?[^"'<>\\)\]]+/g)
    ).map((m) => m[0]);
    return uddgLinks
      .map((u) => {
        const decoded = decodeDdg(u.startsWith("http") ? u : `https://duckduckgo.com${u}`);
        return decoded ?? "";
      })
      .filter(Boolean);
  };

  const $ = cheerio.load(finalHtml);
  const domUrls: string[] = [];
  $(".results .result__a, .result__a, a[data-testid='result-title-a']").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const decoded = decodeDdg(href);
    if (!decoded) return;
    domUrls.push(decoded);
  });
  const textUrls = extractFromText(finalHtml);
  const combined = Array.from(new Set([...domUrls, ...textUrls]));
  return combined.slice(0, limit);
}

function isHtmlContentType(contentType: string): boolean {
  const lowered = contentType.toLowerCase();
  return lowered.includes("text/html") || lowered.includes("application/xhtml+xml");
}

function isTextLikeContentType(contentType: string): boolean {
  const lowered = contentType.toLowerCase();
  return isHtmlContentType(lowered) || lowered.startsWith("text/") || lowered.includes("xml") || lowered.includes("+xml");
}

function looksLikeHtml(text: string): boolean {
  return /<\s*(html|head|body|article|main)[\s>]|<!doctype/i.test(text);
}

function hasAttachmentDisposition(contentDisposition: string): boolean {
  return contentDisposition.toLowerCase().includes("attachment");
}

function looksLikeSoft404(text: string): boolean {
  const sample = text.toLowerCase();
  return (
    sample.includes("page not found") ||
    sample.includes("404 not found") ||
    sample.includes("error 404") ||
    sample.includes("not found on this server")
  );
}

async function fetchMeta(
  url: string,
  timeoutMs: number
): Promise<{ url: string; title: string; sourceName: string } | null> {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;
  if (isDisallowedDomain(normalized)) return null;
  const hostname = domainFromUrl(normalized) ?? "Source";
  try {
    const res = await withTimeout(
      fetch(normalized, {
        method: "GET",
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
          "accept-language": "en-US,en;q=0.9",
        },
      }),
      timeoutMs
    );
    if (!res.ok) {
      if ([401, 403, 405, 429, 503].includes(res.status)) {
        const contentDisposition = res.headers.get("content-disposition") ?? "";
        if (hasAttachmentDisposition(contentDisposition)) return null;
        return { url: normalized, title: hostname, sourceName: hostname };
      }
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "";
    const contentDisposition = res.headers.get("content-disposition") ?? "";
    if (hasAttachmentDisposition(contentDisposition)) return null;
    let bodyText = "";
    if (!contentType) {
      bodyText = await res.text();
      if (!looksLikeHtml(bodyText) && bodyText.length < 120) return null;
    } else if (isTextLikeContentType(contentType)) {
      bodyText = await res.text();
    } else {
      return null;
    }
    if (bodyText && looksLikeSoft404(bodyText)) return null;
    const $ = cheerio.load(bodyText);
    const ogTitle = $('meta[property="og:title"]').attr("content");
    const pageTitle = $("title").first().text();
    const ogSite = $('meta[property="og:site_name"]').attr("content");
    const appName = $('meta[name="application-name"]').attr("content");
    const title = (ogTitle || pageTitle || hostname).trim();
    const sourceName = (ogSite || appName || hostname).trim();
    return { url: normalized, title: title || hostname, sourceName: sourceName || hostname };
  } catch {
    return null;
  }
}

function limitByDomain(urls: string[], maxPerDomain = 2): string[] {
  const counts = new Map<string, number>();
  const out: string[] = [];
  for (const url of urls) {
    const domain = domainFromUrl(url);
    if (!domain) continue;
    const count = counts.get(domain) ?? 0;
    if (count >= maxPerDomain) continue;
    counts.set(domain, count + 1);
    out.push(url);
  }
  return out;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const question = typeof body?.question === "string" ? body.question : "";
  const summary = typeof body?.summary === "string" ? body.summary : "";
  const tags = Array.isArray(body?.tags) ? body.tags.map(String).filter(Boolean) : [];
  const limit = Number.isFinite(Number(body?.limit)) ? Math.max(1, Math.min(12, Number(body.limit))) : 6;

  if (!question && !summary) {
    return NextResponse.json({ error: "missing_query" }, { status: 400 });
  }

  const entities = extractEntities(`${question} ${summary}`);
  const queries = buildCoverageQueries({ question, summary, tags, entities });

  const maxResults = 18;
  const perSearchMs = 2000;
  const perFetchMs = 2000;

  const allUrls: string[] = [];
  for (const q of queries) {
    if (allUrls.length >= maxResults) break;
    const urls = await ddgSearch(q, 10, perSearchMs);
    allUrls.push(...urls);
  }

  const candidates = limitByDomain(
    Array.from(new Set(allUrls.map((u) => normalizeUrl(u)).filter((u): u is string => Boolean(u))))
  ).slice(0, maxResults);

  if (!candidates.length) {
    return NextResponse.json({ query: queries[0] ?? question, results: [] });
  }

  const metaResults = await Promise.all(candidates.map((u) => fetchMeta(u, perFetchMs)));
  const cleaned = metaResults.filter((m): m is { url: string; title: string; sourceName: string } => Boolean(m));
  const queryTokens = tokenSet(`${question} ${summary} ${tags.join(" ")}`);
  const entityTokens = new Set(entities.map((e) => e.toLowerCase()));

  const scored = cleaned
    .map((m) => {
      const titleTokens = tokenSet(`${m.title} ${m.url}`);
      const score = scoreOverlap(queryTokens, titleTokens);
      const hasEntity = entityTokens.size
        ? Array.from(entityTokens).some((e) => m.title.toLowerCase().includes(e) || m.url.toLowerCase().includes(e))
        : false;
      return { ...m, score, hasEntity };
    })
    .filter((m) => (entityTokens.size ? m.hasEntity || m.score >= 0.05 : m.score >= 0.05))
    .sort((a, b) => b.score - a.score);

  const results = (scored.length ? scored : cleaned)
    .slice(0, limit)
    .map((m) => ({ title: m.title, url: m.url, sourceName: m.sourceName }));

  return NextResponse.json({
    query: queries[0] ?? question,
    results,
  });
}
