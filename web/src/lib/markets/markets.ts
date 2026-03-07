import fs from "fs/promises";
import path from "path";
import { FeedItem, MarketMeta, MarketPlatform } from "@/types/feed";
import { canonicalizeTag, HIGH_SIGNAL_TAGS } from "@/lib/tags/highSignal";
import { looksSportsText } from "@/lib/filters/sports";

const POLY_BASE = "https://gamma-api.polymarket.com";
const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const LIVE_TTL_MS = 2 * 60 * 1000;

type MarketsMode = "auto" | "live" | "static";

let liveCache: { at: number; items: FeedItem[] } | null = null;

const TECH_TAGS = new Set<(typeof HIGH_SIGNAL_TAGS)[number]>(HIGH_SIGNAL_TAGS);
const MACRO_KEYWORDS = [
  "cpi",
  "inflation",
  "gdp",
  "fed",
  "interest rate",
  "rates",
  "unemployment",
  "treasury",
  "bond",
  "yield",
  "oil",
  "gas",
];

const TECH_KEYWORDS: Array<{ tag: (typeof HIGH_SIGNAL_TAGS)[number]; terms: string[] }> = [
  { tag: "AI", terms: ["ai", "openai", "gpt", "chatgpt", "llm", "model", "anthropic", "claude", "gemini", "deepmind"] },
  { tag: "Hardware", terms: ["nvidia", "gpu", "chip", "semiconductor", "tsmc", "intel", "amd", "arm", "qualcomm"] },
  { tag: "Cloud", terms: ["cloud", "aws", "azure", "gcp", "kubernetes", "datacenter", "infrastructure"] },
  { tag: "Security", terms: ["security", "breach", "ransomware", "vulnerability", "cve", "privacy"] },
  { tag: "Crypto", terms: ["crypto", "bitcoin", "ethereum", "solana", "stablecoin", "token", "web3"] },
  { tag: "Robotics", terms: ["robot", "robotics", "humanoid", "autonomous", "drone"] },
  { tag: "Space", terms: ["spacex", "starship", "nasa", "satellite", "launch"] },
  { tag: "Mobile", terms: ["iphone", "ios", "android", "mobile", "app store", "play store"] },
  { tag: "Media", terms: ["tiktok", "youtube", "instagram", "x ", "twitter", "streaming", "creator"] },
  { tag: "Startups", terms: ["startup", "funding", "seed round", "series a", "series b", "acquisition", "ipo"] },
  { tag: "Product", terms: ["product", "feature", "roadmap", "launch", "release"] },
  { tag: "Design", terms: ["design", "ux", "ui"] },
  { tag: "Data", terms: ["data", "analytics", "dataset", "warehouse"] },
  { tag: "Education", terms: ["education", "edtech", "learning platform"] },
  { tag: "Health", terms: ["health", "biotech", "clinical", "medicine"] },
  { tag: "Climate", terms: ["climate", "energy", "renewable", "battery", "solar"] },
  { tag: "Policy", terms: ["regulation", "antitrust", "ban", "policy", "law"] },
  { tag: "Finance", terms: ["fintech", "payments", "bank", "banking", "card", "wallet"] },
];

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isTechTag(tag: string): tag is (typeof HIGH_SIGNAL_TAGS)[number] {
  return TECH_TAGS.has(tag as (typeof HIGH_SIGNAL_TAGS)[number]);
}

function topKeywords(text: string, limit = 4): string[] {
  const stop = new Set([
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
    "then",
    "than",
    "they",
    "them",
    "their",
    "its",
    "you",
    "your",
    "our",
    "out",
  ]);
  const counts = new Map<string, number>();
  normalizeText(text)
    .split(" ")
    .filter((t) => t.length >= 4 && !stop.has(t))
    .forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1));
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([t]) => t);
}

function buildSentimentSummary(question: string, comments?: Array<{ text?: string }>): string[] {
  const baseText = [question, ...(comments ?? []).map((c) => c?.text ?? "")].join(" ");
  const normalized = normalizeText(baseText);
  const has = (terms: string[]) => terms.some((t) => normalized.includes(t));
  const lines: string[] = [];

  if (has(["confirm", "official", "statement", "announcement", "roadmap"])) {
    lines.push("Several comments mention the lack of official confirmation or a firm roadmap.");
  }
  if (has(["timeline", "deadline", "mid year", "late year", "q2", "q3", "q4", "by"])) {
    lines.push("Chatter repeatedly references timing and whether milestones can land within the window.");
  }
  if (has(["rumor", "leak", "headline", "reporting", "chatter"])) {
    lines.push("Some discussion attributes price moves to rumors or recent headlines.");
  }
  if (has(["odds", "price", "pricing", "volume", "liquidity"])) {
    lines.push("A few comments focus on market pricing and volume shifts rather than fundamentals.");
  }
  if (has(["risk", "uncertain", "skeptic", "doubt", "unlikely"])) {
    lines.push("Skeptical takes emphasize execution risk and uncertainty.");
  }
  if (has(["likely", "plausible", "momentum", "tailwind", "bullish"])) {
    lines.push("More optimistic comments cite momentum signals and upside catalysts.");
  }

  if (lines.length < 2) {
    const keywords = topKeywords(baseText, 4);
    const themes = keywords.length ? keywords.join(", ") : "key signals";
    lines.push(`Comments highlight ${themes} as the main drivers of discussion.`);
    lines.push("Overall chatter weighs signals versus risk without a clear consensus.");
  }

  return lines.slice(0, 3);
}

function textTokens(input: string): Set<string> {
  if (!input) return new Set();
  return new Set(normalizeText(input).split(" ").filter((t) => t.length >= 3));
}


function isNoisyQuestion(question: string): boolean {
  const commaCount = (question.match(/,/g) ?? []).length;
  const yesCount = (question.match(/\byes\b/gi) ?? []).length;
  if (question.length > 140) return true;
  if (commaCount >= 6) return true;
  if (yesCount >= 4) return true;
  return false;
}

function looksMacro(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  return MACRO_KEYWORDS.some((k) => normalized.includes(k));
}

function inferTagsFromText(text: string): string[] {
  const normalized = normalizeText(text);
  const tokens = textTokens(normalized);
  const tags: string[] = [];
  TECH_KEYWORDS.forEach(({ tag, terms }) => {
    if (terms.some((term) => normalized.includes(term) || tokens.has(term))) {
      tags.push(tag);
    }
  });
  return tags;
}

function normalizeMarketTags(question: string, rawTags?: string[], summary?: string): string[] {
  const tags = new Set<string>();
  rawTags?.forEach((t) => {
    const canonical = canonicalizeTag(t);
    if (canonical) tags.add(canonical);
  });
  inferTagsFromText(`${question} ${summary ?? ""}`).forEach((t) => {
    const canonical = canonicalizeTag(t);
    if (canonical) tags.add(canonical);
  });
  return Array.from(tags).filter(isTechTag);
}

function normalizeMarketItem(item: FeedItem): FeedItem | null {
  const question = item.market?.question?.trim() || item.title?.trim();
  if (!question) return null;
  if (isNoisyQuestion(question)) return null;
  const summary = item.summary?.trim() || `Crowd odds for: ${question}`;
  const tags = normalizeMarketTags(question, item.tags ?? [], summary);
  if (!tags.length) return null;
  const odds = ensureMarketOdds(item.market?.yes, item.market?.no);
  if (!odds) return null;
  const sentimentSummary =
    item.market?.sentimentSummary && item.market.sentimentSummary.length
      ? item.market.sentimentSummary
      : item.market?.comments?.length
        ? buildSentimentSummary(question, item.market.comments)
        : undefined;
  const marketUrl = normalizeMarketUrl(item.market?.marketUrl);
  return {
    ...item,
    title: item.title || question,
    summary,
    tags,
    market: {
      platform: item.market?.platform ?? "polymarket",
      ...(item.market ?? {}),
      question,
      yes: odds.yes,
      no: odds.no,
      marketUrl,
      sentimentSummary: sentimentSummary?.length ? sentimentSummary : undefined,
    },
  };
}

function isTechMarket(item: FeedItem): boolean {
  const question = item.market?.question ?? item.title ?? "";
  const text = `${question} ${item.summary ?? ""} ${item.tags?.join(" ") ?? ""}`;
  if (!question) return false;
  if (looksSportsText(text)) return false;
  if (isNoisyQuestion(question)) return false;
  const tags = normalizeMarketTags(question, item.tags ?? [], item.summary ?? "");
  if (!tags.length) return false;
  const hardTags = tags.filter((t) => t !== "Finance" && t !== "Policy");
  if (hardTags.length) return true;
  if (looksMacro(text)) return false;
  return true;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function ensureMarketOdds(yes?: number, no?: number): { yes: number; no: number } | null {
  const hasYes = typeof yes === "number" && Number.isFinite(yes);
  const hasNo = typeof no === "number" && Number.isFinite(no);
  if (hasYes && hasNo && (yes !== 0 || no !== 0)) {
    return { yes: Math.max(0, Math.min(100, yes as number)), no: Math.max(0, Math.min(100, no as number)) };
  }
  if (hasYes && !hasNo) {
    const y = Math.max(0, Math.min(100, yes as number));
    return { yes: y, no: Math.max(0, Math.min(100, 100 - y)) };
  }
  if (!hasYes && hasNo) {
    const n = Math.max(0, Math.min(100, no as number));
    return { yes: Math.max(0, Math.min(100, 100 - n)), no: n };
  }
  return null;
}

function normalizePercent(value: number | null): number | null {
  if (value === null) return null;
  if (value <= 1.05) return value * 100;
  if (value >= 0 && value <= 100) return value;
  return null;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function buildPolymarketUrl(params: { eventSlug?: string | null; marketSlug?: string | null }): string | null {
  const eventSlug = params.eventSlug?.trim() || "";
  if (eventSlug) return `https://polymarket.com/event/${eventSlug}`;
  const marketSlug = params.marketSlug?.trim() || "";
  if (marketSlug) return `https://polymarket.com/market/${marketSlug}`;
  return null;
}

function normalizeMarketUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (
      !parsed.pathname ||
      parsed.pathname === "/" ||
      parsed.pathname === "/markets" ||
      parsed.pathname === "/market" ||
      parsed.pathname === "/events"
    ) {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}




async function fetchJson(url: string, timeoutMs = 9_000): Promise<unknown> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "CerebrosNews/0.1 (market-fetcher)",
      },
    });
    if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

function buildMarketItem(params: {
  platform: MarketPlatform;
  question: string;
  yes: number;
  no: number;
  summary: string;
  tags?: string[];
  volume24h?: number | null;
  liquidity?: number | null;
  updatedAt?: string | null;
  marketUrl?: string | null;
  publishedAt?: string | null;
  idHint?: string | null;
  sentimentSummary?: string[] | null;
  eventSlug?: string | null;
  marketSlug?: string | null;
  eventTicker?: string | null;
  ticker?: string | null;
}): FeedItem {
  const idBase = params.idHint?.trim() || params.question;
  const id = `market-${params.platform}-${slugify(idBase) || "unknown"}`;
  const publishedAt = params.publishedAt ?? params.updatedAt ?? new Date().toISOString();
  const fallbackUrl =
    params.platform === "polymarket"
      ? buildPolymarketUrl({ eventSlug: params.eventSlug, marketSlug: params.marketSlug })
      : null;
  const normalizedUrl = normalizeMarketUrl(params.marketUrl ?? fallbackUrl);
  const market: MarketMeta = {
    platform: params.platform,
    question: params.question,
    yes: Math.max(0, Math.min(100, params.yes)),
    no: Math.max(0, Math.min(100, params.no)),
    volume24h: params.volume24h ?? undefined,
    liquidity: params.liquidity ?? undefined,
    updatedAt: params.updatedAt ?? undefined,
    marketUrl: normalizedUrl,
    marketTicker: params.ticker ?? undefined,
    eventTicker: params.eventTicker ?? undefined,
    sentimentSummary: params.sentimentSummary && params.sentimentSummary.length ? params.sentimentSummary : undefined,
  };
  return {
    id,
    title: params.question,
    summary: params.summary,
    publishedAt,
    sourceName: params.platform === "polymarket" ? "Polymarket" : "Kalshi",
    sourceType: "community",
    tags: params.tags ?? [],
    dataOrigin: "fetched",
    market,
  };
}

function parsePolymarketMarket(raw: Record<string, unknown>): FeedItem | null {
  const question = typeof raw.question === "string" ? raw.question.trim() : "";
  if (!question) return null;
  const events = Array.isArray(raw.events) ? raw.events : [];
  const eventSlug =
    events.length && events[0] && typeof events[0] === "object" && typeof (events[0] as Record<string, unknown>).slug === "string"
      ? String((events[0] as Record<string, unknown>).slug)
      : null;
  const outcomes = Array.isArray(raw.outcomes) ? raw.outcomes : [];
  const prices = Array.isArray(raw.outcomePrices) ? raw.outcomePrices : [];

  let yes: number | null = null;
  let no: number | null = null;
  outcomes.forEach((o, idx) => {
    if (typeof o !== "string") return;
    const key = o.toLowerCase();
    const price = normalizePercent(toNumber(prices[idx]));
    if (price === null) return;
    if (key === "yes") yes = price;
    if (key === "no") no = price;
  });
  if (yes === null && prices.length >= 2) yes = normalizePercent(toNumber(prices[0]));
  if (no === null && prices.length >= 2) no = normalizePercent(toNumber(prices[1]));
  if (yes === null || no === null) return null;

  const summary =
    (typeof raw.description === "string" && raw.description.trim()) ||
    (typeof raw.rules === "string" && raw.rules.trim()) ||
    `Crowd odds for: ${question}`;
  const rawTags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is string => typeof t === "string")
    : typeof raw.category === "string"
      ? [raw.category]
      : [];
  const volume24h =
    toNumber(raw.volume24hr) ??
    toNumber(raw.volume24h) ??
    toNumber(raw.volume);
  const liquidity = toNumber(raw.liquidity);
  const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : null;
  const idHint = typeof raw.slug === "string" ? raw.slug : typeof raw.id === "string" ? raw.id : null;
  const marketSlug = typeof raw.slug === "string" ? raw.slug : null;
  const marketUrl =
    buildPolymarketUrl({ eventSlug, marketSlug }) ??
    (typeof raw.url === "string" ? raw.url : null);

  return buildMarketItem({
    platform: "polymarket",
    question,
    yes,
    no,
    summary,
    tags: normalizeMarketTags(question, rawTags, summary),
    volume24h,
    liquidity,
    updatedAt,
    marketUrl,
    idHint,
    eventSlug,
    marketSlug,
  });
}

function parseKalshiMarket(raw: Record<string, unknown>): FeedItem | null {
  const question = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!question) return null;
  const yesRaw =
    toNumber(raw.yes_price) ??
    toNumber(raw.yes_bid) ??
    toNumber(raw.last_price) ??
    toNumber(raw.yes_price_cents);
  const noRaw = toNumber(raw.no_price) ?? toNumber(raw.no_bid) ?? toNumber(raw.no_price_cents);
  const yes = normalizePercent(yesRaw);
  const no = normalizePercent(noRaw ?? (yes !== null ? 100 - yes : null));
  if (yes === null || no === null) return null;

  const summary =
    (typeof raw.subtitle === "string" && raw.subtitle.trim()) ||
    (typeof raw.description === "string" && raw.description.trim()) ||
    `Crowd odds for: ${question}`;
  const rawTags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is string => typeof t === "string")
    : [];
  const volume24h = toNumber(raw.volume_24h) ?? toNumber(raw.volume24h) ?? toNumber(raw.volume);
  const liquidity = toNumber(raw.open_interest) ?? toNumber(raw.liquidity);
  const updatedAt = typeof raw.last_updated === "string" ? raw.last_updated : null;
  const ticker = typeof raw.ticker === "string" ? raw.ticker : null;
  const eventTicker = typeof raw.event_ticker === "string" ? raw.event_ticker : null;
  const idHint = ticker ?? eventTicker ?? (typeof raw.id === "string" ? raw.id : null);
  const marketUrl =
    typeof raw.market_url === "string"
      ? raw.market_url
      : typeof raw.url === "string"
        ? raw.url
        : null;

  return buildMarketItem({
    platform: "kalshi",
    question,
    yes,
    no,
    summary,
    tags: normalizeMarketTags(question, rawTags, summary),
    volume24h,
    liquidity,
    updatedAt,
    marketUrl,
    idHint,
    eventTicker,
    ticker,
  });
}

async function fetchPolymarket(limit: number): Promise<FeedItem[]> {
  const url = `${POLY_BASE}/markets?limit=${Math.max(1, Math.min(limit, 200))}`;
  const data = await fetchJson(url);
  const markets =
    Array.isArray(data)
      ? data
      : (() => {
          if (!data || typeof data !== "object") return [];
          const obj = data as { markets?: unknown };
          return Array.isArray(obj.markets) ? obj.markets : [];
        })();
  const base = markets
    .map((m) => (m && typeof m === "object" ? parsePolymarketMarket(m as Record<string, unknown>) : null))
    .filter(Boolean) as FeedItem[];
  return base;
}

async function fetchKalshi(limit: number): Promise<FeedItem[]> {
  const url = `${KALSHI_BASE}/markets?limit=${Math.max(1, Math.min(limit, 200))}`;
  const data = await fetchJson(url);
  const markets =
    data && typeof data === "object"
      ? (() => {
          const obj = data as { markets?: unknown };
          return Array.isArray(obj.markets) ? obj.markets : [];
        })()
      : [];
  return markets
    .map((m) => (m && typeof m === "object" ? parseKalshiMarket(m as Record<string, unknown>) : null))
    .filter(Boolean) as FeedItem[];
}

function mergeMarkets(...lists: FeedItem[][]): FeedItem[] {
  const seen = new Set<string>();
  const merged: FeedItem[] = [];
  for (const list of lists) {
    for (const item of list) {
      const key = item.id || `${item.sourceName}:${item.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

export async function fetchLiveMarkets(limit = 50): Promise<FeedItem[]> {
  const now = Date.now();
  if (liveCache && now - liveCache.at < LIVE_TTL_MS) return liveCache.items;

  const perSource = Math.max(10, Math.floor(limit / 2));
  const [poly, kalshi] = await Promise.allSettled([fetchPolymarket(perSource), fetchKalshi(perSource)]);
  const items: FeedItem[] = [];
  if (poly.status === "fulfilled") items.push(...poly.value);
  if (kalshi.status === "fulfilled") items.push(...kalshi.value);
  const filtered = items
    .map((item) => normalizeMarketItem(item))
    .filter((item): item is FeedItem => Boolean(item))
    .filter(isTechMarket);
  const withUrls = filtered.filter((item) => item.market?.marketUrl);
  const sorted = withUrls.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  liveCache = { at: now, items: sorted };
  return sorted;
}

export async function readStaticMarkets(): Promise<FeedItem[]> {
  const candidates = [
    path.join(process.cwd(), "public", "data", "markets.json"),
    path.join(process.cwd(), "web", "public", "data", "markets.json"),
  ];
  for (const file of candidates) {
    try {
      const raw = await fs.readFile(file, "utf8");
      const parsed = JSON.parse(raw) as { markets?: FeedItem[] };
      const items = Array.isArray(parsed?.markets) ? parsed.markets : [];
      const normalized = items
        .map((item) => normalizeMarketItem(item))
        .filter((item): item is FeedItem => Boolean(item))
        .filter(isTechMarket)
        .map((item) => ({ ...item, dataOrigin: "curated" as const }));
      return normalized;
    } catch {
      // try next candidate
    }
  }
  return [];
}

export async function getMarkets(options?: { mode?: MarketsMode; limit?: number }): Promise<{ items: FeedItem[]; source: "live" | "static" }> {
  const mode = options?.mode ?? (process.env.MARKETS_MODE as MarketsMode | undefined) ?? "static";
  const limit = Math.max(1, options?.limit ?? 50);

  if (mode === "static") {
    const items = await readStaticMarkets();
    return { items: items.slice(0, limit), source: "static" };
  }

  if (mode === "live") {
    const items = await fetchLiveMarkets(limit);
    return { items: items.slice(0, limit), source: "live" };
  }

  const live = await fetchLiveMarkets(limit).catch(() => []);
  const staticItems = await readStaticMarkets();
  const combined = mergeMarkets(live, staticItems);
  const source: "live" | "static" = live.length ? "live" : "static";
  return { items: combined.slice(0, limit), source };
}
