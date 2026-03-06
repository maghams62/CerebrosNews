import fs from "fs/promises";
import path from "path";
import * as cheerio from "cheerio";
import { Fund } from "@/lib/fundgraph/types";
import { fetchHnAlgoliaStoriesPaged } from "../dataset/hn";
import { DEFAULT_FETCH_OPTIONS, fetchJson, fetchText } from "../dataset/fetch";
import { parseRss } from "../dataset/rss";
import { SourceCandidate, VcEnrichmentOptions } from "./types";
import { canonicalizeUrl, normalizeName, stableHash, summarizeText, uniqStrings } from "./utils";

type CanonicalArticle = {
  id: string;
  title: string;
  url: string;
  canonicalUrl?: string;
  sourceName?: string;
  sourceId?: string;
  summary?: string;
  bulletSummary?: string[];
  publishedAt?: string;
  tags?: string[];
};

type FeedSource = {
  id: string;
  name: string;
  rss: string;
};

type WikiPageInfo = {
  title?: string;
  missing?: unknown;
  pageprops?: {
    wikibase_item?: string;
  };
};

type WikiSearchRow = {
  title?: string;
};

type WikidataWebsiteClaim = {
  mainsnak?: {
    datavalue?: {
      value?: string;
    };
  };
};

const USER_AGENT = "CerebrosFundGraph/1.0 (vc-enrich)";
const FETCH_OPTIONS = {
  ...DEFAULT_FETCH_OPTIONS,
  timeoutMs: 6_000,
  retries: 0,
  userAgent: USER_AGENT,
};

const DOMAIN_OVERRIDES: Record<string, string> = {
  Accel: "accel.com",
  Benchmark: "benchmark.com",
  Coatue: "coatue.com",
  "Tiger Global": "tigerglobal.com",
  "Kleiner Perkins": "kleinerperkins.com",
  "a16z Crypto": "a16z.com",
  "Redpoint Ventures": "redpoint.com",
  Madrona: "madrona.com",
  Felicis: "felicis.com",
  "Threshold Ventures": "threshold.vc",
  "Altimeter Capital": "altimeter.com",
  GV: "gv.com",
  TCV: "tcv.com",
  IVP: "ivp.com",
  GIC: "gic.com.sg",
  NFX: "nfx.com",
  DCVC: "dcvc.com",
  NEA: "nea.com",
};

const OFFICIAL_PAGE_HARD_NOISE_PATTERNS: RegExp[] = [
  /\berror\s*404\b/i,
  /\b404\s*:\s*not[_\s-]?found\b/i,
  /\bcode\s*:\s*deployment[_\s-]?not[_\s-]?found\b/i,
  /\bdeployment[_\s-]?not[_\s-]?found\b/i,
  /\bthis\s+deployment\s+cannot\s+be\s+found\b/i,
  /\bpage\s+not\s+found/i,
  /\bnot\s+found\b/i,
  /\bthis\s+page\s+could\s+not\s+be\s+found/i,
  /\bwe couldn['’]t find the page\b/i,
  /\bsorry,\s*this page could not be found\b/i,
  /\bfor\s+more\s+information\s+and\s+troubleshooting,\s+see\s+our\s+documentation\b/i,
  /\bno\s+items\s+found\b/i,
  /\bwhat['’]?s\s+with\s+the\s+dog\b/i,
  /\bskip\s+to\s+content/i,
  /\bskip\s+to\s+main\s+content/i,
  /\bclose\s*menu/i,
  /\bopen\s*menu/i,
  /\btoggle\s*menu/i,
  /\bgo\s+home\b/i,
  /\bget\s+in\s+touch\b/i,
  /\bmade\s+with\s+webflow\b/i,
  /privacy\s*policy/i,
  /terms\s*of\s*use/i,
  /policy\s+against\s+harassment/i,
  /\bprevious\s+slide\b/i,
  /\bnext\s+slide\b/i,
  /\bread\s+full\s+article\b/i,
  /\ball\s+rights\s+reserved\b/i,
  /\bhome\s*team\s*founders?\b/i,
  /\bportfolio\s*publications?\b/i,
  /\bbuilding\s+great\s+companies\s+is\s+a\s+craft\b/i,
  /\bmore\s+info:\s*@/i,
  /\b\d{2,5}\s+[A-Za-z0-9.\- ]{2,40}\s+(street|st|road|rd|avenue|ave|boulevard|blvd|lane|ln|drive|dr)\b/i,
];

const OFFICIAL_PAGE_NAV_TOKEN_PATTERNS: RegExp[] = [
  /\babout/i,
  /\bteam/i,
  /\bcompanies?/i,
  /\bcareers?/i,
  /\bnews/i,
  /\binsights?/i,
  /\bprivacy/i,
  /\bterms/i,
  /\bsearch/i,
  /\bcontact/i,
];

const FUND_NAME_KEYWORD_PATTERN = /\b(capital|ventures?|partners?|vc|fund|equity|investments?)\b/i;
const VC_CONTEXT_PATTERNS: RegExp[] = [
  /\bventure\b/i,
  /\bventure\s+capital\b/i,
  /\bvc\b/i,
  /\bfund(?:ing|raise|raises|raised)?\b/i,
  /\bportfolio\b/i,
  /\bstartup(s)?\b/i,
  /\bseries\s+[a-f]\b/i,
  /\bseed\b/i,
  /\bround\b/i,
  /\bco[-\s]?(?:led|investor)\b/i,
  /\bbacked\b/i,
  /\bled\s+by\b/i,
  /\bfinancing\s+round\b/i,
  /\bgeneral\s+partner\b/i,
  /\bportfolio\s+company\b/i,
];
const MARKET_CONTEXT_PATTERNS: RegExp[] = [
  /\bftse\b/i,
  /\bs&p\b/i,
  /\bdow\b/i,
  /\bnasdaq\b/i,
  /\boil\b/i,
  /\bbrent\b/i,
  /\bwti\b/i,
  /\bfutures?\b/i,
  /\bbond(s)?\b/i,
  /\btreasury\b/i,
  /\bforex\b/i,
  /\binflation\b/i,
  /\bbenchmark\s+rate\b/i,
  /\bcommodit(y|ies)\b/i,
];

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeForLookup(value: string): string {
  return normalizeName(value);
}

function domainFromUrl(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function domainsLikelySame(left: string, right: string): boolean {
  if (!left || !right) return false;
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

function hasVcContext(text: string): boolean {
  return VC_CONTEXT_PATTERNS.some((pattern) => pattern.test(text));
}

function hasMarketContext(text: string): boolean {
  return MARKET_CONTEXT_PATTERNS.some((pattern) => pattern.test(text));
}

function requiresExplicitVcContext(term: string): boolean {
  const normalized = normalizeForLookup(term);
  const tokens = normalized.split(" ").filter((token) => token.length >= 2);
  if (tokens.length !== 1) return false;
  const token = tokens[0] ?? "";
  if (token.length < 4) return false;
  if (FUND_NAME_KEYWORD_PATTERN.test(token)) return false;
  return true;
}

function tokenSet(value: string): Set<string> {
  return new Set(
    normalizeForLookup(value)
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
  );
}

function tokenOverlapRatio(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap / Math.max(left.size, right.size);
}

export function titleMatchesFund(titleOrText: string, fund: Fund, sourceUrl?: string): boolean {
  const haystack = normalizeForLookup(titleOrText);
  const haystackTokens = tokenSet(titleOrText);
  const vcContext = hasVcContext(titleOrText);
  const marketContext = hasMarketContext(titleOrText);
  const fundDomain = domainFromUrl(fund.officialUrl);
  const sourceDomain = domainFromUrl(sourceUrl);
  const domainAligned = domainsLikelySame(sourceDomain, fundDomain);
  const terms = uniqStrings([fund.name, ...(fund.aliases ?? [])])
    .map((value) => normalizeForLookup(value))
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  for (const term of terms) {
    const tokens = term.split(" ").filter((token) => token.length >= 2);
    if (!tokens.length) continue;
    if (tokens.length === 1 && tokens[0]!.length < 3) continue;
    const regex = new RegExp(`\\b${tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+")}\\b`, "i");
    const regexMatch = regex.test(haystack);
    if (regexMatch) {
      if (requiresExplicitVcContext(term) && !domainAligned) {
        if (!vcContext) continue;
        if (marketContext && !vcContext) continue;
      }
      return true;
    }
    const overlap = tokenOverlapRatio(new Set(tokens), haystackTokens);
    if (tokens.length >= 2 && overlap >= 0.72) {
      return true;
    }
  }
  return false;
}

function matchedFundIdsForText(text: string, funds: Fund[], sourceUrl?: string): string[] {
  const matched: string[] = [];
  for (const fund of funds) {
    if (titleMatchesFund(text, fund, sourceUrl)) matched.push(fund.id);
  }
  return uniqStrings(matched);
}

function sourceCandidateId(parts: Array<string | undefined>): string {
  return `vc-src-${stableHash(parts, 24)}`;
}

function articleToCandidate(article: CanonicalArticle, fundIds: string[]): SourceCandidate {
  const summaryLines = [
    article.summary ?? "",
    ...(Array.isArray(article.bulletSummary) ? article.bulletSummary : []),
  ].filter(Boolean);
  const content = summarizeText(summaryLines.join("\n"), 2_000);
  return {
    id: sourceCandidateId([article.canonicalUrl ?? article.url, article.title, article.publishedAt, "dataset_article"]),
    title: article.title,
    url: canonicalizeUrl(article.canonicalUrl ?? article.url),
    sourceName: article.sourceName || article.sourceId || "Canonical Article",
    sourceType: "dataset_article",
    summary: summarizeText(article.summary || article.title, 420),
    content: content || article.title,
    publishedAt: article.publishedAt || nowIso(),
    tags: uniqStrings([...(article.tags ?? []), "vc-enrich", "dataset-article"], 20),
    fundIds,
  };
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function readCanonicalArticles(): Promise<CanonicalArticle[]> {
  const dataPath = path.join(process.cwd(), "public", "data", "articles.json");
  const parsed = await readJson<CanonicalArticle[] | { articles?: CanonicalArticle[]; items?: CanonicalArticle[] }>(dataPath);
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.articles)) return parsed.articles;
  if (Array.isArray(parsed.items)) return parsed.items;
  return [];
}

async function discoverFromCanonicalArticles(funds: Fund[], maxPerFund = 24): Promise<SourceCandidate[]> {
  const articles = await readCanonicalArticles();
  const byFund = new Map<string, SourceCandidate[]>();

  for (const article of articles) {
    const scanText = `${article.title}\n${article.summary ?? ""}\n${(article.bulletSummary ?? []).join("\n")}`;
    const matchedFundIds = matchedFundIdsForText(scanText, funds, article.canonicalUrl ?? article.url);
    if (!matchedFundIds.length) continue;

    const candidate = articleToCandidate(article, matchedFundIds);
    for (const fundId of matchedFundIds) {
      const bucket = byFund.get(fundId) ?? [];
      bucket.push(candidate);
      byFund.set(fundId, bucket);
    }
  }

  const selected: SourceCandidate[] = [];
  for (const fund of funds) {
    const bucket = byFund.get(fund.id) ?? [];
    selected.push(...bucket.sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt)).slice(0, maxPerFund));
  }
  return selected;
}

function overlapScore(left: string, right: string): number {
  const a = new Set(normalizeForLookup(left).split(" ").filter((token) => token.length > 2));
  const b = new Set(normalizeForLookup(right).split(" ").filter((token) => token.length > 2));
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }
  return overlap / Math.max(a.size, b.size);
}

async function fetchWikipediaTitleExists(title: string): Promise<string | null> {
  const payload = await fetchJson<{ query?: { pages?: Record<string, WikiPageInfo> } }>(
    `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=info&titles=${encodeURIComponent(title)}`,
    FETCH_OPTIONS
  ).catch(() => null);
  const pages = payload?.query?.pages;
  const page = pages ? Object.values(pages)[0] : null;
  if (!page || page.missing !== undefined) return null;
  return typeof page.title === "string" ? page.title : title;
}

async function searchWikipediaTitle(fundName: string): Promise<string | null> {
  const directAttempts = [
    fundName,
    `${fundName} (venture capital firm)`,
    `${fundName} Capital`,
    `${fundName} Ventures`,
  ];
  for (const attempt of directAttempts) {
    const found = await fetchWikipediaTitleExists(attempt);
    if (found) return found;
  }

  const payload = await fetchJson<{ query?: { search?: WikiSearchRow[] } }>(
    `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&list=search&srlimit=10&srsearch=${encodeURIComponent(
      `${fundName} venture capital`
    )}`,
    FETCH_OPTIONS
  ).catch(() => null);
  const rows = Array.isArray(payload?.query?.search) ? payload.query?.search ?? [] : [];
  if (!rows.length) return null;
  const ranked = rows
    .map((row) => ({ title: String(row.title ?? ""), score: overlapScore(fundName, String(row.title ?? "")) }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best || best.score < 0.25) return null;
  return best.title;
}

async function resolveWebsiteFromWikidata(fundName: string): Promise<string | null> {
  const overrideDomain = DOMAIN_OVERRIDES[fundName];
  if (overrideDomain) return `https://${overrideDomain}`;

  const title = await searchWikipediaTitle(fundName);
  if (!title) return null;
  const pageProps = await fetchJson<{ query?: { pages?: Record<string, WikiPageInfo> } }>(
    `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageprops&titles=${encodeURIComponent(title)}`,
    FETCH_OPTIONS
  ).catch(() => null);
  const pages = pageProps?.query?.pages;
  const page = pages ? Object.values(pages)[0] : null;
  const wikibaseItem = page?.pageprops?.wikibase_item;
  if (!wikibaseItem) return null;

  const wikidataPayload = await fetchJson<{ entities?: Record<string, { claims?: { P856?: WikidataWebsiteClaim[] } }> }>(
    `https://www.wikidata.org/wiki/Special:EntityData/${wikibaseItem}.json`,
    FETCH_OPTIONS
  ).catch(() => null);
  const claims = wikidataPayload?.entities?.[wikibaseItem]?.claims?.P856;
  if (!Array.isArray(claims) || !claims.length) return null;
  for (const claim of claims) {
    const website = claim?.mainsnak?.datavalue?.value;
    if (typeof website !== "string") continue;
    const normalized = canonicalizeUrl(website);
    if (normalized) return normalized;
  }
  return null;
}

function makeOfficialPageUrl(baseUrl: string, candidatePath: string): string {
  try {
    const base = new URL(baseUrl);
    const pathname = candidatePath.startsWith("/") ? candidatePath : `/${candidatePath}`;
    return canonicalizeUrl(new URL(pathname, `${base.protocol}//${base.host}`).toString());
  } catch {
    return canonicalizeUrl(baseUrl);
  }
}

function extractHtmlText(html: string): { title: string; text: string } {
  const $ = cheerio.load(html);
  $("script,style,noscript,iframe,svg").remove();
  const title = $("title").first().text().trim();
  const text = $("body")
    .text()
    .replace(/\s+/g, " ")
    .trim();
  return {
    title,
    text: summarizeText(text, 3_400),
  };
}

function looksLikeOfficialPageNoise(title: string, text: string): boolean {
  const combined = `${title} ${text}`.replace(/\s+/g, " ").trim();
  if (!combined) return true;
  if (OFFICIAL_PAGE_HARD_NOISE_PATTERNS.some((pattern) => pattern.test(combined))) return true;
  const navHits = OFFICIAL_PAGE_NAV_TOKEN_PATTERNS.filter((pattern) => pattern.test(combined)).length;
  if (navHits >= 4 && combined.length < 1_200) return true;
  return false;
}

function officialCandidateFromHtml(params: {
  fundId: string;
  fundName: string;
  url: string;
  pageHint: string;
  html: string;
}): SourceCandidate | null {
  const parsed = extractHtmlText(params.html);
  if (!parsed.text || parsed.text.length < 60) return null;
  if (looksLikeOfficialPageNoise(parsed.title, parsed.text)) return null;
  const title = parsed.title || `${params.fundName} ${params.pageHint}`;
  const now = nowIso();
  const tags = uniqStrings(["official", "vc-enrich", params.pageHint.replace(/^\//, "")], 12);
  return {
    id: sourceCandidateId([params.url, title, params.pageHint, params.fundId, "official_site"]),
    title,
    url: params.url,
    sourceName: params.fundName,
    sourceType: "official_site",
    summary: summarizeText(parsed.text, 420),
    content: parsed.text,
    publishedAt: now,
    tags,
    fundIds: [params.fundId],
  };
}

async function discoverFromOfficialPages(
  funds: Fund[],
  options: VcEnrichmentOptions
): Promise<{ candidates: SourceCandidate[]; funds: Fund[] }> {
  const maxPagesPerFund = Math.max(1, options.maxOfficialPagesPerFund ?? 3);
  const secondaryPageHints = ["/team", "/people", "/partners", "/portfolio", "/investments", "/blog", "/news"];
  const candidates: SourceCandidate[] = [];
  const enrichedFunds = [...funds];
  const websiteCache = new Map<string, string | null>();

  for (let index = 0; index < enrichedFunds.length; index += 1) {
    const fund = enrichedFunds[index]!;
    const overrideDomain = DOMAIN_OVERRIDES[fund.name];
    let officialUrl = overrideDomain ? canonicalizeUrl(`https://${overrideDomain}`) : canonicalizeUrl(fund.officialUrl);
    if (!officialUrl) {
      const cached = websiteCache.get(fund.name);
      if (cached !== undefined) {
        officialUrl = cached ?? "";
      } else {
        const resolved = await resolveWebsiteFromWikidata(fund.name).catch(() => null);
        websiteCache.set(fund.name, resolved);
        officialUrl = resolved ?? "";
      }
    }
    if (!officialUrl) continue;
    enrichedFunds[index] = {
      ...fund,
      officialUrl,
      entityType: fund.entityType ?? "VC_FIRM",
    };

    const rootUrl = makeOfficialPageUrl(officialUrl, "/");
    const rootHtml = await fetchText(rootUrl, FETCH_OPTIONS).catch(() => "");
    if (!rootHtml) continue;

    const rootCandidate = officialCandidateFromHtml({
      fundId: fund.id,
      fundName: fund.name,
      url: rootUrl,
      pageHint: "/",
      html: rootHtml,
    });
    if (rootCandidate) {
      candidates.push(rootCandidate);
    }

    const selectedSecondaryHints = secondaryPageHints.slice(0, Math.max(0, maxPagesPerFund - 1));
    for (const hint of selectedSecondaryHints) {
      const url = makeOfficialPageUrl(officialUrl, hint);
      const html = await fetchText(url, FETCH_OPTIONS).catch(() => "");
      if (!html) continue;
      const candidate = officialCandidateFromHtml({
        fundId: fund.id,
        fundName: fund.name,
        url,
        pageHint: hint,
        html,
      });
      if (candidate) candidates.push(candidate);
    }
  }

  return {
    candidates,
    funds: enrichedFunds,
  };
}

async function readInvestingRssConfig(): Promise<FeedSource[]> {
  const configPath = path.join(process.cwd(), "config", "demo_investing_feeds.json");
  const parsed = await readJson<{ sources?: FeedSource[] }>(configPath);
  if (!Array.isArray(parsed?.sources)) return [];
  return parsed.sources.filter((source) => Boolean(source?.rss && source?.name));
}

type RssItemLike = Record<string, unknown> & {
  title?: string;
  link?: string;
  isoDate?: string;
  pubDate?: string;
  contentSnippet?: string;
  content?: string;
};

function rssItemToCandidate(
  item: RssItemLike,
  source: FeedSource,
  matchedFundIds: string[]
): SourceCandidate | null {
  const title = String(item.title ?? "").trim();
  const url = canonicalizeUrl(String(item.link ?? "").trim());
  if (!title || !url) return null;
  const publishedAt = String(item.isoDate ?? item.pubDate ?? nowIso());
  const content = summarizeText(
    String(item.contentSnippet ?? item.content ?? title).replace(/\s+/g, " "),
    2_200
  );
  return {
    id: sourceCandidateId([source.id, url, title, publishedAt, "investing_rss"]),
    title,
    url,
    sourceName: source.name,
    sourceType: "investing_rss",
    summary: summarizeText(content || title, 420),
    content: content || title,
    publishedAt: Number.isFinite(+new Date(publishedAt)) ? new Date(publishedAt).toISOString() : nowIso(),
    tags: ["vc-enrich", "rss", source.id],
    fundIds: matchedFundIds,
  };
}

async function discoverFromInvestingRss(
  funds: Fund[],
  options: VcEnrichmentOptions
): Promise<SourceCandidate[]> {
  const sources = await readInvestingRssConfig();
  if (!sources.length) return [];
  const maxPerSource = Math.max(1, options.maxFeedItemsPerSource ?? 8);
  const candidates: SourceCandidate[] = [];

  for (const source of sources) {
    const xml = await fetchText(source.rss, FETCH_OPTIONS).catch(() => "");
    if (!xml) continue;
    const parsed = await parseRss(xml).catch(() => null);
    const items = (parsed?.items ?? []) as RssItemLike[];
    if (!items.length) continue;

    let accepted = 0;
    for (const item of items) {
      if (accepted >= maxPerSource) break;
      const scanText = `${String(item.title ?? "")}\n${String(item.contentSnippet ?? item.content ?? "")}`;
      const matchedFundIds = matchedFundIdsForText(scanText, funds, String(item.link ?? ""));
      if (!matchedFundIds.length) continue;
      const candidate = rssItemToCandidate(item, source, matchedFundIds);
      if (!candidate) continue;
      candidates.push(candidate);
      accepted += 1;
    }
  }

  return candidates;
}

async function discoverFromHn(funds: Fund[], options: VcEnrichmentOptions): Promise<SourceCandidate[]> {
  const pages = Math.max(1, options.hnPages ?? 2);
  const hits = await fetchHnAlgoliaStoriesPaged(FETCH_OPTIONS, pages, 100).catch(() => []);
  const candidates: SourceCandidate[] = [];
  for (const hit of hits) {
    const title = String(hit.title ?? "").trim();
    if (!title) continue;
    const url = canonicalizeUrl(String(hit.url ?? ""));
    if (!url) continue;
    const text = `${title}\n${String(hit.story_text ?? "")}`;
    const matchedFundIds = matchedFundIdsForText(text, funds, url);
    if (!matchedFundIds.length) continue;
    const publishedAt = hit.created_at ? new Date(hit.created_at).toISOString() : nowIso();
    candidates.push({
      id: sourceCandidateId([url, title, publishedAt, "social_hn"]),
      title,
      url,
      sourceName: "Hacker News",
      sourceType: "social_hn",
      summary: summarizeText(String(hit.story_text ?? title), 420),
      content: summarizeText(String(hit.story_text ?? title), 1_800),
      publishedAt,
      tags: uniqStrings(["hn", "social", "vc-enrich"], 10),
      fundIds: matchedFundIds,
    });
  }
  return candidates;
}

async function discoverFromRedditRss(funds: Fund[]): Promise<SourceCandidate[]> {
  const feeds = [
    { name: "Reddit r/venturecapital", url: "https://www.reddit.com/r/venturecapital/.rss" },
    { name: "Reddit r/startups", url: "https://www.reddit.com/r/startups/.rss" },
    { name: "Reddit r/technology", url: "https://www.reddit.com/r/technology/.rss" },
  ];
  const candidates: SourceCandidate[] = [];
  for (const feed of feeds) {
    const xml = await fetchText(feed.url, FETCH_OPTIONS).catch(() => "");
    if (!xml) continue;
    const parsed = await parseRss(xml).catch(() => null);
    const items = (parsed?.items ?? []) as RssItemLike[];
    for (const item of items.slice(0, 120)) {
      const title = String(item.title ?? "").trim();
      const url = canonicalizeUrl(String(item.link ?? ""));
      if (!title || !url) continue;
      const summary = String(item.contentSnippet ?? item.content ?? title);
      const matchedFundIds = matchedFundIdsForText(`${title}\n${summary}`, funds, url);
      if (!matchedFundIds.length) continue;
      const publishedAt = String(item.isoDate ?? item.pubDate ?? nowIso());
      candidates.push({
        id: sourceCandidateId([url, title, publishedAt, "social_reddit"]),
        title,
        url,
        sourceName: feed.name,
        sourceType: "social_reddit",
        summary: summarizeText(summary, 420),
        content: summarizeText(summary, 1_800),
        publishedAt: Number.isFinite(+new Date(publishedAt)) ? new Date(publishedAt).toISOString() : nowIso(),
        tags: ["reddit", "social", "vc-enrich"],
        fundIds: matchedFundIds,
      });
    }
  }
  return candidates;
}

export async function discoverSourceCandidates(
  funds: Fund[],
  options: VcEnrichmentOptions
): Promise<{
  funds: Fund[];
  candidates: SourceCandidate[];
  stats: {
    from_articles: number;
    from_official: number;
    from_rss: number;
    from_hn: number;
    from_reddit: number;
  };
}> {
  const fromArticles = await discoverFromCanonicalArticles(funds, 18);
  const official = options.offlineOnly
    ? { candidates: [] as SourceCandidate[], funds }
    : await discoverFromOfficialPages(funds, options);
  const fromRss = options.offlineOnly ? [] : await discoverFromInvestingRss(official.funds, options);
  const fromHn = options.offlineOnly ? [] : await discoverFromHn(official.funds, options);
  const fromReddit = options.offlineOnly ? [] : await discoverFromRedditRss(official.funds);

  return {
    funds: official.funds,
    candidates: [
      ...fromArticles,
      ...official.candidates,
      ...fromRss,
      ...fromHn,
      ...fromReddit,
    ],
    stats: {
      from_articles: fromArticles.length,
      from_official: official.candidates.length,
      from_rss: fromRss.length,
      from_hn: fromHn.length,
      from_reddit: fromReddit.length,
    },
  };
}
