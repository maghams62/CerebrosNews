import fs from "fs/promises";
import path from "path";
import {
  getFoundersFromPortfolio,
  getFundLinkedinUrl,
  normalizePortfolioCompanyName,
} from "@/lib/fundgraph/fundEntityProfiles";
import {
  CitationRef,
  DealFact,
  Fund,
  FundCategory,
  FundStage,
  GraphEdge,
  RiskTolerance,
  Signal,
  SyntheticFundgraphDataset,
} from "@/lib/fundgraph/types";
import { getFundOverview } from "@/lib/fundgraph/fundOverview";

type CanonicalArticle = {
  id: string;
  title: string;
  summary?: string;
  bulletSummary?: string[];
  url: string;
  canonicalUrl?: string;
  publishedAt?: string;
  sourceName?: string;
  sourceId?: string;
  sourceType?: string;
  tags?: string[];
};

type CanonicalStoryGroup = {
  id: string;
  canonicalTitle: string;
  topicTags?: string[];
  createdAt?: string;
  updatedAt?: string;
  analysis?: { summary_markdown?: string };
  perspectives?: Array<{
    id?: string;
    source?: string;
    url?: string;
    title?: string;
    summary?: string;
    publishedAt?: string;
  }>;
};

type FundContext = {
  fund: Fund;
  articleIds: string[];
  titles: string[];
  summaries: string[];
  urls: string[];
  tags: string[];
  publishedAt: string;
};

const DATA_DIR = path.join(process.cwd(), "public", "data");
const HQS = [
  "San Francisco, US",
  "New York, US",
  "Austin, US",
  "Boston, US",
  "Seattle, US",
  "London, UK",
  "Singapore, SG",
  "Bengaluru, IN",
];
const REAL_FUND_NAMES = [
  "Sequoia Capital",
  "Andreessen Horowitz",
  "Accel",
  "Benchmark",
  "Bessemer Venture Partners",
  "Lightspeed Venture Partners",
  "General Catalyst",
  "Greylock Partners",
  "Index Ventures",
  "Khosla Ventures",
  "Founders Fund",
  "First Round Capital",
  "Union Square Ventures",
  "Insight Partners",
  "Coatue",
  "Tiger Global",
  "NEA",
  "GV",
  "Kleiner Perkins",
  "Ribbit Capital",
  "a16z Crypto",
  "IVP",
  "Redpoint Ventures",
  "Craft Ventures",
  "Sapphire Ventures",
  "Madrona",
  "Menlo Ventures",
  "Battery Ventures",
  "Felicis",
  "Initialized Capital",
  "Y Combinator",
  "NFX",
  "Threshold Ventures",
  "Lux Capital",
  "DCVC",
  "TCV",
  "Altimeter Capital",
  "Spark Capital",
  "Scale Venture Partners",
  "GIC",
];
const RISK_LEVELS: RiskTolerance[] = ["low", "medium", "high"];
const STAGE_CYCLE: FundStage[] = ["Pre-Seed", "Seed", "Series A", "Series B+"];
const ENTITY_BREAK_WORDS = new Set([
  "raises",
  "raised",
  "raise",
  "acquires",
  "acquired",
  "acquire",
  "launches",
  "launch",
  "launched",
  "announces",
  "announced",
  "to",
  "for",
  "with",
  "amid",
  "after",
  "before",
]);

const TAG_TO_SECTOR: Array<{ token: string; sector: FundCategory }> = [
  { token: "ai", sector: "AI" },
  { token: "devtools", sector: "Developer Tools" },
  { token: "developer", sector: "Developer Tools" },
  { token: "fin", sector: "Fintech" },
  { token: "cloud", sector: "Cloud" },
  { token: "security", sector: "Security" },
  { token: "climate", sector: "Climate" },
  { token: "bio", sector: "Bio" },
  { token: "consumer", sector: "Consumer" },
  { token: "enterprise", sector: "Enterprise" },
  { token: "web3", sector: "Web3" },
  { token: "data", sector: "Data Infrastructure" },
  { token: "robot", sector: "Robotics" },
  { token: "health", sector: "Health" },
  { token: "chip", sector: "Semiconductors" },
  { token: "defense", sector: "Defense" },
];

const REAL_PORTFOLIO_COMPANIES = [
  "OpenAI",
  "Anthropic",
  "Perplexity",
  "Scale AI",
  "Databricks",
  "Stripe",
  "Rippling",
  "Mercury",
  "Figma",
  "Notion",
  "Canva",
  "Pinecone",
  "Cohere",
  "ElevenLabs",
  "Harvey",
  "Ramp",
  "Vercel",
  "Linear",
  "Datadog",
  "Snyk",
  "Mistral",
  "Runway",
];

const GP_PRIOR_FIRMS = [
  "Sequoia Capital",
  "Accel",
  "Bessemer",
  "Lightspeed",
  "Andreessen Horowitz",
  "General Catalyst",
  "Index Ventures",
  "Greylock",
];

const PARTNER_NETWORK_COMPANIES = [
  "Google",
  "OpenAI",
  "Stripe",
  "Meta",
  "Nvidia",
  "Snowflake",
  "Databricks",
  "Microsoft",
];

const CO_INVESTORS = [
  "Sequoia",
  "Benchmark",
  "Lightspeed",
  "Index",
  "General Catalyst",
  "Greylock",
  "Coatue",
  "Founders Fund",
];

const FOUNDER_NAMES = [
  "Aarav Mehta",
  "Julia Chen",
  "Nadia Kim",
  "Daniel Ortiz",
  "Ravi Patel",
  "Chloe Park",
  "Mina Shah",
  "Ethan Cole",
];

const TOP_EXITS = [
  "Datadog",
  "Figma",
  "GitHub",
  "Snowflake",
  "Nubank",
  "Twilio",
  "MongoDB",
  "Cloudflare",
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function uniq(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pick<T>(list: T[], seed: string): T {
  return list[stableHash(seed) % list.length] as T;
}

function nowIsoMinusHours(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function parseDate(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const parsed = +new Date(value);
  if (!Number.isFinite(parsed)) return fallback;
  return new Date(parsed).toISOString();
}

function extractEntityFromTitle(title: string, fallback: string): string {
  const cleaned = title
    .replace(/['"`]/g, "")
    .replace(/[^a-zA-Z0-9&\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return fallback;
  const tokens = cleaned.split(" ");
  const breakAt = tokens.findIndex((token) => ENTITY_BREAK_WORDS.has(token.toLowerCase()));
  const candidate = (breakAt > 0 ? tokens.slice(0, breakAt) : tokens.slice(0, 3)).slice(0, 3).join(" ").trim();
  return candidate || fallback;
}

function firstSentence(text: string | undefined, fallback: string): string {
  const value = (text ?? "").replace(/\s+/g, " ").trim();
  if (!value) return fallback;
  const match = value.match(/^(.{40,260}?[.!?])(\s|$)/);
  if (match?.[1]) return match[1];
  return value.slice(0, 220);
}

function sectorsFromTags(tags: string[]): FundCategory[] {
  const lowered = tags.map((tag) => tag.toLowerCase());
  const mapped = TAG_TO_SECTOR.filter((entry) => lowered.some((tag) => tag.includes(entry.token))).map((entry) => entry.sector);
  const sectors = uniq(mapped);
  if (sectors.length >= 2) return sectors.slice(0, 3) as FundCategory[];
  if (sectors.length === 1) return [sectors[0], "Enterprise"] as FundCategory[];
  return ["AI", "Enterprise"];
}

function stagesFromTags(tags: string[], idx: number): FundStage[] {
  const lowered = tags.join(" ").toLowerCase();
  if (lowered.includes("pre-seed")) return ["Pre-Seed", "Seed"];
  if (lowered.includes("seed")) return ["Seed", "Series A"];
  if (lowered.includes("series a")) return ["Series A", "Series B+"];
  if (lowered.includes("series b") || lowered.includes("growth")) return ["Series B+", "Growth"];
  return [STAGE_CYCLE[idx % STAGE_CYCLE.length], STAGE_CYCLE[(idx + 1) % STAGE_CYCLE.length]];
}

function geographiesFromTags(tags: string[]): string[] {
  const joined = tags.join(" ").toLowerCase();
  const geos: string[] = [];
  if (joined.includes("india")) geos.push("India");
  if (joined.includes("europe") || joined.includes("eu")) geos.push("Europe");
  if (joined.includes("latam")) geos.push("LatAm");
  if (joined.includes("apac") || joined.includes("asia")) geos.push("APAC");
  if (joined.includes("uk")) geos.push("Europe");
  if (!geos.length) geos.push("US");
  if (!geos.includes("US")) geos.push("US");
  return uniq(geos).slice(0, 3);
}

function buildCitationRefsFromContext(context: {
  seedId: string;
  urls: string[];
  titles: string[];
  summaries: string[];
  publishedAt: string;
}): CitationRef[] {
  const refs: CitationRef[] = [];
  for (let idx = 0; idx < context.urls.length; idx += 1) {
    const url = context.urls[idx]?.trim();
    if (!url) continue;
    const title = context.titles[idx]?.trim() || context.titles[0]?.trim() || `Source ${idx + 1}`;
    refs.push({
      id: `citation-${slugify(context.seedId)}-${idx + 1}`,
      url,
      title,
      snippet: firstSentence(context.summaries[idx], context.summaries[0] ?? title),
      publishedAt: context.publishedAt,
      origin: "synthetic",
    });
    if (refs.length >= 2) break;
  }
  return refs;
}

function buildDealFactsForPortfolio(
  fundId: string,
  stages: FundStage[],
  checkSizeMinM: number,
  checkSizeMaxM: number,
  companyNames: string[],
  citationRefs: CitationRef[],
  publishedAt: string
): DealFact[] {
  return companyNames.map((companyName, idx) => {
    const stage = stages[idx % stages.length] as FundStage;
    const stageScale = stage === "Pre-Seed" ? 0.7 : stage === "Seed" ? 0.9 : stage === "Series A" ? 1.2 : stage === "Series B+" ? 1.5 : 1.9;
    const spread = Math.max(0.1, (checkSizeMaxM - checkSizeMinM) * 0.35);
    const midpoint = checkSizeMinM + (checkSizeMaxM - checkSizeMinM) * ((idx % 5) / 4);
    const amountMinM = Number(Math.max(0.1, midpoint * stageScale - spread).toFixed(2));
    const amountMaxM = Number((amountMinM + spread * 2.1).toFixed(2));

    const announcedAt = new Date(+new Date(publishedAt) - idx * 7 * 24 * 60 * 60 * 1000).toISOString();
    const sourceRefs = citationRefs.slice(0, citationRefs.length ? 1 + (idx % citationRefs.length) : 0);
    const citationCount = sourceRefs.length;
    return {
      id: `deal-${fundId}-${slugify(companyName)}-${idx + 1}`,
      fundId,
      companyName,
      roundStage: stage,
      announcedAt,
      amountMinM,
      amountMaxM,
      checkType: idx % 3 === 0 ? "lead" : "follow",
      confidence: Number((0.64 + ((idx % 5) * 0.06)).toFixed(2)),
      sourceRefs,
      verified: citationCount > 0,
      citationCount,
      dataOrigin: "derived",
    };
  });
}

function signalSummary(article: CanonicalArticle, fallback: string): string {
  const bullet = Array.isArray(article.bulletSummary) ? article.bulletSummary.find((item) => item.trim().length > 20) : undefined;
  return firstSentence(bullet || article.summary, fallback);
}

function isLikelyCompanyName(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.length > 36) return false;
  if (trimmed.split(" ").length > 4) return false;
  return /[A-Za-z]/.test(trimmed);
}

async function loadJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function readCanonicalArticles(): Promise<CanonicalArticle[]> {
  const raw = await loadJsonFile<{ articles?: CanonicalArticle[] } | CanonicalArticle[]>(path.join(DATA_DIR, "articles.json"));
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((item) => Boolean(item?.id && item?.title && item?.url));
  return (raw.articles ?? []).filter((item) => Boolean(item?.id && item?.title && item?.url));
}

async function readCanonicalStoryGroups(): Promise<CanonicalStoryGroup[]> {
  const candidates = [path.join(DATA_DIR, "clusters.json"), path.join(DATA_DIR, "storyGroups.json")];
  for (const candidate of candidates) {
    const raw = await loadJsonFile<CanonicalStoryGroup[] | { clusters?: CanonicalStoryGroup[] } | { groups?: CanonicalStoryGroup[] }>(
      candidate
    );
    if (!raw) continue;
    if (Array.isArray(raw)) return raw;
    if ("clusters" in raw && Array.isArray(raw.clusters)) return raw.clusters;
    if ("groups" in raw && Array.isArray(raw.groups)) return raw.groups;
  }
  return [];
}

function buildFundFromContext(context: {
  idx: number;
  seedId: string;
  title: string;
  description: string;
  tags: string[];
  sources: string[];
  relatedTitles: string[];
  relatedSummaries: string[];
  relatedUrls: string[];
  publishedAt: string;
}): Fund {
  const name = (REAL_FUND_NAMES[context.idx % REAL_FUND_NAMES.length] || extractEntityFromTitle(context.title, `Fund ${context.idx + 1}`)).slice(0, 70);
  const anchorEntity = extractEntityFromTitle(context.title, name);
  const slugBase = slugify(name || `fund-${context.idx + 1}`);
  const id = `fg-fund-${slugBase || `fund-${context.idx + 1}`}-${context.idx + 1}`;
  const sectors = sectorsFromTags(context.tags);
  const stages = stagesFromTags(context.tags, context.idx);
  const geographies = geographiesFromTags(context.tags);
  const checkSizeMinM = Number((0.5 + (context.idx % 4) * 0.5).toFixed(1));
  const checkSizeMaxM = Number((checkSizeMinM + 2 + (context.idx % 5) * 1.5).toFixed(1));
  const publishedMs = +new Date(context.publishedAt);
  const ageDays = Number.isFinite(publishedMs) ? Math.max(0, (Date.now() - publishedMs) / (1000 * 60 * 60 * 24)) : 20;
  const recencyScore = clamp(100 - ageDays * 2.4, 0, 100);
  const trendScore = Math.round(clamp(45 + recencyScore * 0.42 + context.tags.length * 1.8 + context.sources.length * 2, 40, 98));
  const momentumScore = Math.round(clamp(trendScore - 8 + (stableHash(id) % 16), 35, 97));
  const communityScore = Math.round(clamp(42 + (stableHash(`${id}:community`) % 44), 35, 90));

  const gpNames = uniq(
    context.sources.map((source, idx) => {
      const short = source.replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
      return short ? `${short} Partner ${idx + 1}` : `Partner ${idx + 1}`;
    })
  ).slice(0, 2);
  if (!gpNames.length) gpNames.push(`Partner ${(context.idx % 7) + 1}`);

  const portfolioCandidates = uniq(
    context.relatedTitles
      .map((title) => extractEntityFromTitle(title, ""))
      .filter((item) => item && item.toLowerCase() !== anchorEntity.toLowerCase() && isLikelyCompanyName(item))
  );
  const portfolio = uniq([
    ...portfolioCandidates,
    ...Array.from({ length: 8 }, (_, idx) => pick(REAL_PORTFOLIO_COMPANIES, `${id}:portfolio:${idx}`)),
  ])
    .map((company) => normalizePortfolioCompanyName(company))
    .slice(0, 5);
  const founders = getFoundersFromPortfolio(portfolio, 6);
  const citationRefs = buildCitationRefsFromContext({
    seedId: context.seedId,
    urls: context.relatedUrls,
    titles: context.relatedTitles,
    summaries: context.relatedSummaries,
    publishedAt: context.publishedAt,
  });
  const portfolioInvestments = buildDealFactsForPortfolio(
    id,
    stages,
    checkSizeMinM,
    checkSizeMaxM,
    portfolio,
    citationRefs,
    context.publishedAt
  );
  const leadInvestmentRate = 52 + (stableHash(`${id}:lead`) % 26);
  const followOnRate = 40 + (stableHash(`${id}:follow`) % 24);
  const gpName = gpNames[0] as string;
  const gpSlug = slugify(gpName || "partner");

  const fund: Fund = {
    id,
    slug: slugify(name),
    name,
    description: firstSentence(context.description, `${name} backs high-signal founders across resilient software categories.`),
    headquarters: HQS[context.idx % HQS.length] as string,
    geography: geographies,
    geographies,
    stages,
    sectors,
    checkSizeMinM,
    checkSizeMaxM,
    checkSizeKUsd: {
      min: Math.max(10, Math.round(checkSizeMinM * 1000)),
      max: Math.max(10, Math.round(checkSizeMaxM * 1000)),
    },
    aumM: 130 + (context.idx % 24) * 38,
    vintageYear: 2012 + (context.idx % 13),
    trendScore,
    momentumScore,
    communityScore,
    risk: RISK_LEVELS[context.idx % RISK_LEVELS.length] as RiskTolerance,
    fundType: `${sectors[0]} ${stages[0]} Fund`,
    gp: {
      name: gpName,
      title: "General Partner",
      bio: "Leads thesis-driven investments with an emphasis on measurable operating signal and evidence quality.",
      previousFirms: [pick(GP_PRIOR_FIRMS, `${id}:firm:1`), pick(GP_PRIOR_FIRMS, `${id}:firm:2`)],
      linkedinUrl: getFundLinkedinUrl({ slug: slugify(name), name }) ?? `https://www.linkedin.com/in/${gpSlug}`,
      photoUrl: `/data/fundgraph/fund-logos/${id}.png`,
      focusAreas: sectors.slice(0, 2),
      partnerNetwork: [pick(PARTNER_NETWORK_COMPANIES, `${id}:network:1`), pick(PARTNER_NETWORK_COMPANIES, `${id}:network:2`)],
    },
    gpNames,
    portfolio,
    portfolioInvestments,
    portfolioMetrics: {
      portfolioSize: 20 + (stableHash(`${id}:size`) % 24),
      leadInvestmentRate,
      followOnRate,
      topExits: [pick(TOP_EXITS, `${id}:exit:1`), pick(TOP_EXITS, `${id}:exit:2`)],
    },
    coInvestors: [
      pick(CO_INVESTORS, `${id}:coinvest:1`),
      pick(CO_INVESTORS, `${id}:coinvest:2`),
      pick(CO_INVESTORS, `${id}:coinvest:3`),
    ],
    founders: founders.length
      ? founders
      : [pick(FOUNDER_NAMES, `${id}:founder:1`), pick(FOUNDER_NAMES, `${id}:founder:2`), pick(FOUNDER_NAMES, `${id}:founder:3`)],
    strategy: "Signal-first strategy linking market claims, source evidence, and portfolio context for disciplined decision making.",
    dataOrigin: "curated",
  };

  return {
    ...fund,
    description: getFundOverview(fund).text,
  };
}

function buildSignals(contexts: FundContext[], articleById: Map<string, CanonicalArticle>, targetCount: number): Signal[] {
  const signals: Signal[] = [];
  if (!contexts.length) return signals;

  const cursorByFund = new Map<string, number>();
  let iterations = 0;
  while (signals.length < targetCount && iterations < targetCount * 5) {
    const context = contexts[iterations % contexts.length] as FundContext;
    const cursor = cursorByFund.get(context.fund.id) ?? 0;
    const articleId = context.articleIds[cursor % Math.max(1, context.articleIds.length)];
    const article = articleId ? articleById.get(articleId) : undefined;
    const confidenceBase = 0.56 + (stableHash(`${context.fund.id}:${signals.length}`) % 34) / 100;
    const confidence = Number(clamp(confidenceBase, 0.52, 0.93).toFixed(2));
    const summaryFallback = context.summaries[0] ?? `${context.fund.name} shows notable changes in recent intelligence signals.`;
    const summary = article ? signalSummary(article, summaryFallback) : firstSentence(summaryFallback, summaryFallback);
    const createdAt = parseDate(article?.publishedAt, nowIsoMinusHours(signals.length * 4 + 1));
    const titleSource = article?.title || context.titles[0] || `${context.fund.name} signal`;
    const title = `${context.fund.name}: ${firstSentence(titleSource, titleSource).slice(0, 84)}`;

    const verifies = stableHash(`${context.fund.id}:${createdAt}`) % 11;
    const disagrees = stableHash(`${context.fund.id}:disagree:${createdAt}`) % 4;

    signals.push({
      id: `fg-signal-${signals.length + 1}`,
      fundId: context.fund.id,
      title,
      summary,
      confidence,
      createdAt,
      authorName: article?.sourceName || "Dataset Pipeline",
      upvotes: 3 + (stableHash(title) % 37),
      verifiedCount: verifies,
      verifies,
      disagrees,
      commentsCount: stableHash(summary) % 7,
      tags: (article?.tags ?? context.tags).slice(0, 6),
      source: "system",
      evidenceUrl: article?.canonicalUrl || article?.url || context.urls[0],
      evidenceSnippet: summary,
      dataOrigin: "derived",
    });

    cursorByFund.set(context.fund.id, cursor + 1);
    iterations += 1;
  }

  return signals;
}

function buildGraphEdges(funds: Fund[], signals: Signal[]): GraphEdge[] {
  const edges: GraphEdge[] = [];

  for (const fund of funds) {
    fund.gpNames.forEach((gpName, idx) => {
      edges.push({
        id: `edge-${fund.id}-gp-${idx + 1}`,
        fromType: "fund",
        fromId: fund.id,
        toType: "gp",
        toId: `${fund.id}_gp_${idx + 1}`,
        relation: "managed_by",
        weight: 1,
      });
    });

    fund.portfolio.forEach((company, idx) => {
      edges.push({
        id: `edge-${fund.id}-pf-${idx + 1}`,
        fromType: "fund",
        fromId: fund.id,
        toType: "portfolio",
        toId: `${fund.id}_co_${idx + 1}`,
        relation: "invested_in",
        weight: 1,
      });
    });
  }

  for (const signal of signals) {
    edges.push({
      id: `edge-${signal.id}-fund`,
      fromType: "signal",
      fromId: signal.id,
      toType: "fund",
      toId: signal.fundId,
      relation: "signal_about",
      weight: Number(clamp(signal.confidence, 0.2, 1).toFixed(2)),
    });
  }

  return edges;
}

export async function buildFundgraphDatasetFromCanonicalData(options?: {
  fundCount?: number;
  signalCount?: number;
}): Promise<SyntheticFundgraphDataset | null> {
  const [articles, groups] = await Promise.all([readCanonicalArticles(), readCanonicalStoryGroups()]);
  if (!articles.length && !groups.length) return null;

  const articleById = new Map(articles.map((article) => [article.id, article]));
  const targetFunds = clamp(Math.floor(options?.fundCount ?? 90), 24, 140);
  const contexts: FundContext[] = [];
  const usedArticleIds = new Set<string>();

  for (const group of groups) {
    if (contexts.length >= targetFunds) break;

    const perspectives = Array.isArray(group.perspectives) ? group.perspectives : [];
    const articleIds = perspectives.map((item) => String(item.id ?? "")).filter(Boolean);
    articleIds.forEach((id) => usedArticleIds.add(id));
    const perspectiveTitles = perspectives.map((entry) => entry.title ?? "").filter(Boolean) as string[];
    const perspectiveSources = uniq(perspectives.map((entry) => entry.source ?? "").filter(Boolean) as string[]);
    const perspectiveSummaries = perspectives.map((entry) => entry.summary ?? "").filter(Boolean) as string[];
    const perspectiveUrls = perspectives.map((entry) => entry.url ?? "").filter(Boolean) as string[];
    const groupPublishedAt = parseDate(
      perspectives.map((entry) => entry.publishedAt).find(Boolean) || group.updatedAt || group.createdAt,
      nowIsoMinusHours(contexts.length * 6)
    );
    const title = group.canonicalTitle || perspectiveTitles[0] || `Story Group ${contexts.length + 1}`;
    const description = firstSentence(group.analysis?.summary_markdown || perspectiveSummaries[0], title);
    const tags = Array.isArray(group.topicTags) ? group.topicTags : [];
    const fund = buildFundFromContext({
      idx: contexts.length,
      seedId: group.id || title,
      title,
      description,
      tags,
      sources: perspectiveSources,
      relatedTitles: perspectiveTitles,
      relatedSummaries: perspectiveSummaries,
      relatedUrls: perspectiveUrls,
      publishedAt: groupPublishedAt,
    });

    contexts.push({
      fund,
      articleIds,
      titles: perspectiveTitles.length ? perspectiveTitles : [title],
      summaries: perspectiveSummaries.length ? perspectiveSummaries : [description],
      urls: perspectiveUrls,
      tags,
      publishedAt: groupPublishedAt,
    });
  }

  const remainingArticles = articles
    .filter((article) => !usedArticleIds.has(article.id))
    .sort((a, b) => +new Date(b.publishedAt ?? 0) - +new Date(a.publishedAt ?? 0));

  for (const article of remainingArticles) {
    if (contexts.length >= targetFunds) break;

    const title = article.title || `Article ${contexts.length + 1}`;
    const description = firstSentence(article.summary, title);
    const tags = Array.isArray(article.tags) ? article.tags : [];
    const publishedAt = parseDate(article.publishedAt, nowIsoMinusHours(contexts.length * 5));
    const fund = buildFundFromContext({
      idx: contexts.length,
      seedId: article.id,
      title,
      description,
      tags,
      sources: [article.sourceName || article.sourceId || "Feed"],
      relatedTitles: [title],
      relatedSummaries: [description],
      relatedUrls: [article.canonicalUrl || article.url],
      publishedAt,
    });

    contexts.push({
      fund,
      articleIds: [article.id],
      titles: [title],
      summaries: [description],
      urls: [article.canonicalUrl || article.url],
      tags,
      publishedAt,
    });
  }

  const funds = contexts.map((context) => context.fund);
  if (!funds.length) return null;

  const targetSignals = clamp(Math.floor(options?.signalCount ?? 260), funds.length, 500);
  const signals = buildSignals(contexts, articleById, targetSignals);
  const graphEdges = buildGraphEdges(funds, signals);

  return {
    generatedAt: new Date().toISOString(),
    version: "2.0.0-canonical",
    funds,
    signals,
    graphEdges,
  };
}
