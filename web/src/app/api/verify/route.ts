import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const runtime = "nodejs";

type VerifyStatus = "verified" | "unverified" | "disputed";

function extractJson(text: string): any {
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

async function ddgSearch(query: string, limit = 3, timeoutMs = 1200): Promise<string[]> {
  const params = new URLSearchParams({ q: query, kl: "us-en" });
  const fetchHtml = async (url: string) => {
    try {
      const res = await withTimeout(fetch(url, { method: "GET" }), timeoutMs);
      if (!res.ok) return "";
      return res.text();
    } catch {
      return "";
    }
  };
  const finalHtml = await fetchHtml(`https://r.jina.ai/http://duckduckgo.com/html/?${params.toString()}`);
  if (!finalHtml) return [];
  const decodeDdg = (href: string): string | null => {
    if (href.startsWith("/l/?")) {
      const qs = href.split("?")[1] ?? "";
      const uddg = new URLSearchParams(qs).get("uddg");
      if (!uddg) return null;
      try {
        return decodeURIComponent(uddg);
      } catch {
        return uddg;
      }
    }
    return href;
  };
  const extractFromText = (text: string) => {
    const urls = Array.from(text.matchAll(/https?:\/\/[^\s)\]]+/g)).map((m) => m[0]);
    return urls
      .filter((u) => !u.includes("duckduckgo.com/html"))
      .filter((u) => !u.includes("external-content.duckduckgo.com"))
      .map((u) => {
        const decoded = decodeDdg(u);
        return decoded ?? u;
      });
  };

  const urls = extractFromText(finalHtml);
  if (urls.length) return Array.from(new Set(urls)).slice(0, limit);

  const $ = cheerio.load(finalHtml);
  const out: string[] = [];
  $(".results .result__a").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const decoded = decodeDdg(href);
    if (!decoded) return;
    out.push(decoded);
  });
  return out.slice(0, limit);
}

async function validateCitation(url: string, disallowUrl: string | null): Promise<string | null> {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;
  if (disallowUrl && normalized === disallowUrl) return null;
  try {
    const res = await fetch(normalized, { method: "HEAD" });
    if (res.ok) return normalized;
    if ([401, 403, 405].includes(res.status)) return normalized;
  } catch {
    // fallback to GET below
  }
  try {
    const res = await fetch(normalized, { method: "GET" });
    if (res.ok) return normalized;
    if ([401, 403, 405].includes(res.status)) return normalized;
  } catch {
    // ignore
  }
  return null;
}

function softCitations(urls: string[], disallowUrl: string | null): string[] {
  return urls
    .map((u) => normalizeUrl(u))
    .filter((u): u is string => Boolean(u))
    .filter((u) => !disallowUrl || u !== disallowUrl);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const articleId = typeof body?.articleId === "string" ? body.articleId : "";
  const articleTitle = typeof body?.articleTitle === "string" ? body.articleTitle : "";
  const articleSummary = typeof body?.articleSummary === "string" ? body.articleSummary : "";
  const articleUrl = typeof body?.articleUrl === "string" ? body.articleUrl : "";
  const source = typeof body?.source === "string" ? body.source : "";

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
    const rawClaims = Array.isArray(parsed?.claims) ? parsed.claims : [];
    const articleDomain = domainFromUrl(articleUrl ?? "");
    const disallowUrl = normalizeUrl(articleUrl ?? "");
    const startedAt = Date.now();
    const budgetMs = 7000;
    const perSearchMs = 1600;

    const remainingForSearch = Math.max(300, budgetMs - (Date.now() - startedAt));
    const titleQuery = articleTitle ? `"${articleTitle}"` : "";
    const fallbackUrls =
      titleQuery && remainingForSearch > 600
        ? await ddgSearch(
            `${titleQuery} ${source}`.trim(),
            4,
            Math.min(perSearchMs, remainingForSearch)
          )
        : [];
    const fallbackCitations = uniqueByDomain(
      softCitations(fallbackUrls, disallowUrl).filter((u) => domainFromUrl(u) !== articleDomain)
    ).slice(0, 2);

    const claims = await Promise.all(
      rawClaims.slice(0, 3).map(async (c: any) => {
        const elapsed = Date.now() - startedAt;
        const remaining = Math.max(300, budgetMs - elapsed);
        const query = String(c?.claim ?? "").trim();
        const modelStatus = normalizeStatus(c?.status);
        const modelCitations = uniqueByDomain(
          softCitations(Array.isArray(c?.citations) ? c.citations : [], disallowUrl).filter(
            (u) => domainFromUrl(u) !== articleDomain
          )
        ).slice(0, 2);

        let citations = modelCitations;
        if (query && citations.length === 0 && remaining > 600) {
          const searchUrls = await ddgSearch(
            `${query} ${articleTitle || source}`.trim(),
            3,
            Math.min(perSearchMs, remaining)
          );
          citations = uniqueByDomain(
            softCitations(searchUrls, disallowUrl).filter((u) => domainFromUrl(u) !== articleDomain)
          ).slice(0, 2);
        }
        if (citations.length === 0 && fallbackCitations.length) {
          citations = fallbackCitations.slice(0, 2);
        }

        const status = modelStatus === "disputed" ? "disputed" : citations.length ? "verified" : modelStatus;
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
