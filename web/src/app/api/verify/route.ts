import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const runtime = "nodejs";

type VerifyStatus = "verified" | "unverified" | "disputed";

function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("No JSON found");
    }
    const slice = text.slice(start, end + 1);
    return JSON.parse(slice);
  }
}

function normalizeStatus(value: unknown): VerifyStatus {
  const text = typeof value === "string" ? value.toLowerCase().trim() : "";
  if (text === "verified") return "verified";
  if (text === "disputed" || text === "incorrect") return "disputed";
  return "unverified";
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

function domainFromUrl(input: string): string | null {
  try {
    const url = new URL(input);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function uniqueByDomain(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    const domain = domainFromUrl(url);
    if (!domain) continue;
    if (seen.has(domain)) continue;
    seen.add(domain);
    out.push(url);
  }
  return out;
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

function sanitizeQuery(query: string): string {
  const cleaned = query.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.replace(/["“”]/g, "");
}

function isHtmlContentType(contentType: string): boolean {
  const lowered = contentType.toLowerCase();
  return lowered.includes("text/html") || lowered.includes("application/xhtml+xml");
}

function isTextLikeContentType(contentType: string): boolean {
  const lowered = contentType.toLowerCase();
  return (
    isHtmlContentType(lowered) ||
    lowered.startsWith("text/") ||
    lowered.includes("xml") ||
    lowered.includes("+xml")
  );
}

function looksLikeHtml(text: string): boolean {
  return /<\s*(html|head|body|article|main)[\s>]|<!doctype/i.test(text);
}

function hasAttachmentDisposition(contentDisposition: string): boolean {
  return contentDisposition.toLowerCase().includes("attachment");
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

async function ddgSearch(query: string, limit = 3, timeoutMs = 1200): Promise<string[]> {
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
    if (href.startsWith("/l/?")) {
      return extractUddg(href);
    }
    if (href.startsWith("http://duckduckgo.com/l/?") || href.startsWith("https://duckduckgo.com/l/?")) {
      return extractUddg(href);
    }
    return href;
  };
  const extractFromText = (text: string) => {
    const uddgLinks = Array.from(
      text.matchAll(/(?:https?:\/\/duckduckgo\.com)?\/l\/\?[^"'\s<>\)\]]+/g)
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

function looksLikeSoft404(text: string): boolean {
  const sample = text.toLowerCase();
  return (
    sample.includes("page not found") ||
    sample.includes("404 not found") ||
    sample.includes("error 404") ||
    sample.includes("not found on this server")
  );
}

async function validateCitation(url: string, disallowUrl: string | null, timeoutMs = 1400): Promise<string | null> {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;
  if (disallowUrl && normalized === disallowUrl) return null;
  if (isDisallowedDomain(normalized)) return null;
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
        return normalized;
      }
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "";
    const contentDisposition = res.headers.get("content-disposition") ?? "";
    if (hasAttachmentDisposition(contentDisposition)) return null;
    let bodyText = "";
    if (!contentType) {
      try {
        bodyText = await res.text();
        const looksHtml = looksLikeHtml(bodyText);
        if (!looksHtml && bodyText.length < 120) return null;
      } catch {
        return null;
      }
    } else if (isTextLikeContentType(contentType)) {
      try {
        bodyText = await res.text();
      } catch {
        return null;
      }
    } else {
      return null;
    }
    if (bodyText && looksLikeSoft404(bodyText)) return null;
    return normalized;
  } catch {
    // ignore
  }
  return null;
}

function softCitations(urls: string[], disallowUrl: string | null): string[] {
  return urls
    .map((u) => normalizeUrl(u))
    .filter((u): u is string => Boolean(u))
    .filter((u) => !disallowUrl || u !== disallowUrl)
    .filter((u) => !isDisallowedDomain(u));
}

async function filterValidCitations(
  urls: string[],
  disallowUrl: string | null,
  limit = 2,
  timeoutMs = 1400
): Promise<string[]> {
  const candidates = limitByDomain(urls, 2);
  if (!candidates.length) return [];
  const checked = await Promise.all(candidates.map((u) => validateCitation(u, disallowUrl, timeoutMs)));
  return uniqueByDomain(checked.filter((u): u is string => Boolean(u))).slice(0, limit);
}

function prioritizeExternal(urls: string[], articleDomain: string | null): string[] {
  if (!articleDomain) return urls;
  const external: string[] = [];
  const same: string[] = [];
  for (const url of urls) {
    const domain = domainFromUrl(url);
    if (domain && domain === articleDomain) same.push(url);
    else external.push(url);
  }
  return [...external, ...same];
}

function normalizeQueryText(text: string): string {
  return text
    .replace(/[^\w\s-]/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function keywordQuery(text: string, maxTerms = 6): string {
  const stop = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "to",
    "of",
    "in",
    "on",
    "for",
    "with",
    "by",
    "as",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "this",
    "that",
    "these",
    "those",
    "it",
    "its",
    "their",
    "his",
    "her",
    "they",
    "he",
    "she",
    "we",
    "you",
    "your",
    "our",
    "new",
    "about",
    "after",
    "before",
    "over",
    "under",
    "into",
    "than",
    "then",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
  ]);
  const parts = normalizeQueryText(text)
    .split(" ")
    .map((p) => p.trim())
    .filter((p) => p.length > 2 && !stop.has(p.toLowerCase()));
  return parts.slice(0, maxTerms).join(" ");
}

function cleanSourceName(source: string): string {
  return source.replace(/\s*\(.*?\)\s*/g, "").trim();
}

function buildSearchQueries(input: {
  claim: string;
  title: string;
  summary: string;
  source: string;
  domain?: string | null;
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
  const source = cleanSourceName(input.source || "");
  const claim = expandAbbreviations(input.claim || "");
  const title = expandAbbreviations(input.title || "");
  const summary = expandAbbreviations(input.summary || "");
  if (claim) {
    add(`${claim} ${source}`.trim());
    add(claim);
    add(claim.split(" ").slice(0, 8).join(" "));
  }
  if (title) {
    add(`${title} ${source}`.trim());
    add(title);
  }
  if (summary) {
    add(keywordQuery(summary, 8));
  }
  add(keywordQuery(`${claim} ${title}`));
  if (input.domain && (claim || title)) {
    const domainQuery = keywordQuery(`${claim} ${title}`, 8);
    add(domainQuery ? `site:${input.domain} ${domainQuery}` : `site:${input.domain} ${title || claim}`.trim());
  }
  return queries.slice(0, 6);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const articleId = typeof body?.articleId === "string" ? body.articleId : "";
  const articleTitle = typeof body?.articleTitle === "string" ? body.articleTitle : "";
  const articleSummary = typeof body?.articleSummary === "string" ? body.articleSummary : "";
  const articleUrl = typeof body?.articleUrl === "string" ? body.articleUrl : "";
  const source = typeof body?.source === "string" ? body.source : "";
  const candidateUrls = Array.isArray(body?.candidateUrls)
    ? (body.candidateUrls as unknown[])
        .map((u) => (typeof u === "string" ? u.trim() : ""))
        .filter(Boolean)
    : [];

  if (!articleId || (!articleTitle && !articleSummary)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "missing_openai_key" }, { status: 500 });
  }

  const systemPrompt =
    "You are a claim verifier. Do not invent sources or URLs. Prefer citations, but still return a best-guess status if citations are unavailable.";

  const userPrompt = `Extract up to 3 factual claims from the article summary and title, then verify them. Citations are preferred.

Rules:

* Max 3 claims
* Each claim ≤ 14 words
* Status must be exactly: Verified | Unverified | Disputed
* Each claim must include 0–2 citations (URLs to reliable sources, if available)
* If no reliable citation URL is available → leave citations empty, keep best-guess status
* Do not cite the article itself as verification
* Return JSON only, with shape: { "claims": [ { "claim": string, "status": string, "citations": string[] } ] }

Context:
- articleUrl: ${articleUrl || "n/a"}
- source: ${source || "n/a"}

Title:
${articleTitle}

Summary:
${articleSummary}`;

  try {
    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      return NextResponse.json({ error: "verify_failed", detail: message }, { status: 500 });
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return NextResponse.json({ error: "verify_failed" }, { status: 500 });
    }

    const parsed = extractJson(content);
    const parsedObj = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const rawClaims = Array.isArray(parsedObj.claims) ? parsedObj.claims : [];
    const articleDomain = domainFromUrl(articleUrl ?? "");
    const disallowUrl = normalizeUrl(articleUrl ?? "");
    const startedAt = Date.now();
    const budgetMs = 10000 + rawClaims.length * 700;
    const perSearchMs = 2200;
    const perValidateMs = 2000;

    const remainingForSearch = Math.max(300, budgetMs - (Date.now() - startedAt));
    const candidateCandidates = uniqueByDomain(
      prioritizeExternal(softCitations(candidateUrls, disallowUrl), articleDomain)
    ).slice(0, 8);
    const candidateCitations = await filterValidCitations(candidateCandidates, disallowUrl, 2, perValidateMs);

    const fallbackQueries = buildSearchQueries({
      claim: "",
      title: articleTitle,
      summary: articleSummary,
      source,
      domain: articleDomain,
    });
    const fallbackUrls: string[] = [];
    for (const q of fallbackQueries) {
      if (!q || remainingForSearch <= 600) break;
      const urls = await ddgSearch(q, 10, Math.min(perSearchMs, remainingForSearch));
      fallbackUrls.push(...urls);
      if (fallbackUrls.length >= 14) break;
    }
    const fallbackCandidates = uniqueByDomain(
      prioritizeExternal(softCitations(fallbackUrls, disallowUrl), articleDomain)
    ).slice(0, 8);
    const fallbackCitations = await filterValidCitations(fallbackCandidates, disallowUrl, 2, perValidateMs);
    const globalFallbackCitations = uniqueByDomain([
      ...candidateCitations,
      ...fallbackCitations,
    ]).slice(0, 2);

    const claims = await Promise.all(
      rawClaims.slice(0, 3).map(async (claim) => {
        const c = claim && typeof claim === "object" ? (claim as Record<string, unknown>) : {};
        const elapsed = Date.now() - startedAt;
        const query = String(c.claim ?? "").trim();
        const modelStatus = normalizeStatus(c.status);
        const modelCandidates = uniqueByDomain(
          prioritizeExternal(
            softCitations(Array.isArray(c.citations) ? (c.citations as string[]) : [], disallowUrl),
            articleDomain
          )
        ).slice(0, 3);
        const modelCitations = await filterValidCitations(modelCandidates, disallowUrl, 2, perValidateMs);

        let citations = modelCitations;
        if (citations.length === 0 && candidateCitations.length) {
          citations = candidateCitations.slice(0, 2);
        }
        if (query && citations.length === 0) {
          const queries = buildSearchQueries({
            claim: query,
            title: articleTitle,
            summary: articleSummary,
            source,
            domain: articleDomain,
          });
          for (const q of queries) {
            const loopElapsed = Date.now() - startedAt;
            const loopRemaining = Math.max(300, budgetMs - loopElapsed);
            if (loopRemaining <= 600) break;
            const searchUrls = await ddgSearch(q, 10, Math.min(perSearchMs, loopRemaining));
            const searchCandidates = uniqueByDomain(
              prioritizeExternal(softCitations(searchUrls, disallowUrl), articleDomain)
            ).slice(0, 8);
            citations = await filterValidCitations(searchCandidates, disallowUrl, 2, perValidateMs);
            if (citations.length) break;
          }
        }
        if (citations.length === 0 && globalFallbackCitations.length) {
          citations = globalFallbackCitations.slice(0, 2);
        }

        const status = citations.length ? (modelStatus === "disputed" ? "disputed" : "verified") : "unverified";
        return {
          claim: query,
          status,
          citations,
        };
      })
    );

    return NextResponse.json({ claims });
  } catch (err) {
    return NextResponse.json({ error: "verify_failed" }, { status: 500 });
  }
}
