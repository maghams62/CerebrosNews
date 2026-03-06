import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { DATASET_VERSION } from "./dataset/constants";
import { clusterByTopic } from "./dataset/cluster";
import { DEFAULT_FETCH_OPTIONS, createLimiter, fetchText } from "./dataset/fetch";
import { ensureImagesDir, ensurePlaceholderImage, ImageStore, PLACEHOLDER_PUBLIC_PATH, storeImageForItem } from "./dataset/image";
import {
  classifyInvestingRelevance,
  generateArticleBundle,
  generateAudienceReaction,
  generateClusterImpact,
  generateClusterMissing,
  generateClusterTrustMeta,
  generateTitleOnlySummary,
} from "./dataset/llm";
import { dedupeByCanonicalUrl, normalizeRssToDatasetItem } from "./dataset/normalize";
import {
  ArticleOutput,
  ClusterOutput,
  writeArticles,
  writeClusters,
  writeEmbeddings,
  writeNeighbors,
  writeSources,
  writeSummaries,
  writeTrustDashboard,
} from "./dataset/output";
import { parseRss } from "./dataset/rss";
import { DatasetFile, DatasetItem, DatasetSource, SourceType } from "./dataset/schema";
import { tagItems } from "./dataset/tag";
import { TOPICS } from "./dataset/topics";
import { canonicalizeUrl, domainFromUrl, stableId } from "./dataset/url";
import { extractArticleFromUrl } from "./dataset/extract";

type DemoFeedSource = Omit<DatasetSource, "rss"> & { rss: string; type: SourceType };
type DemoFeedConfig = { sources: DemoFeedSource[] };

type CliOptions = {
  limit: number;
  since: Date;
  until: Date;
  dryRun: boolean;
  feedConfigPath: string;
  skipImages: boolean;
  skipLlm: boolean;
  disableClassifier: boolean;
};

type Candidate = {
  item: DatasetItem;
  canonicalUrl: string;
  rssImageUrl: string | null;
};

type HeuristicDecision = {
  decision: "include" | "exclude" | "uncertain";
  includeScore: number;
  excludeScore: number;
  includeMatches: string[];
  excludeMatches: string[];
};

type ClassifierResult = {
  related: boolean;
  confidence: "low" | "medium" | "high";
  reason: string;
};

type ArticleBundleCacheEntry = {
  summary: string[];
  bias: { vestedInterests: string[]; framingBias: string[]; confidence: "low" | "medium" | "high" };
  whatsMissing: string[];
  impact: { shortTerm: string[]; longTerm: string[] };
  audienceReaction?: string;
};

type LlmCache = {
  classifier: Record<string, ClassifierResult>;
  articleBundles: Record<string, ArticleBundleCacheEntry>;
};

type LlmArticleOutput = {
  summaryMarkdown: string;
  bulletSummary: string[];
  biasAnalysis?: { vestedInterests: string[]; framingBias: string[]; confidence: "low" | "medium" | "high" };
  bias: string;
  whatsMissing: string[];
  impact?: { shortTerm: string[]; longTerm: string[] };
  audienceReaction?: {
    summary: string;
    source: "inferred";
  };
};

const DEMO_TAG = "Demo:Investing";

const INCLUDE_RULES: Array<{ id: string; pattern: RegExp; weight: number }> = [
  { id: "funding_round", pattern: /\bfunding\b|\bfundraise(?:d|s|)\b|\braised\b|\braises\b/i, weight: 2 },
  { id: "series", pattern: /\bseries\s+[a-f]\b/i, weight: 2 },
  { id: "seed_round", pattern: /\bpre-seed\b|\bseed\b/i, weight: 2 },
  { id: "venture_vc", pattern: /\bventure\s+capital\b|\bvc\b/i, weight: 2 },
  { id: "lp_gp", pattern: /\blimited\s+partner\b|\bgeneral\s+partner\b|\blp\b|\bgp\b/i, weight: 2 },
  { id: "valuation", pattern: /\bvaluation\b|\bterm\s+sheet\b/i, weight: 1 },
  { id: "m_and_a", pattern: /\bm&a\b|\bmerger\b|\bacquisition\b|\bacquire(?:d|s)?\b|\bbuyout\b|\bexit\b/i, weight: 2 },
  { id: "ipo", pattern: /\bipo\b|\binitial public offering\b|\bgoing public\b|\blisting\b/i, weight: 2 },
  { id: "private_markets", pattern: /\bprivate market(?:s)?\b|\bprivate equity\b|\bgrowth equity\b/i, weight: 2 },
  { id: "unicorn", pattern: /\bunicorn\b/i, weight: 1 },
  { id: "funds", pattern: /\bfund\b|\bfunds\b/i, weight: 1 },
];

const EXCLUDE_RULES: Array<{ id: string; pattern: RegExp; weight: number }> = [
  { id: "product_launch", pattern: /\blaunch(?:ed|es|ing)?\b|\bunveil(?:ed|s|ing)?\b|\bnew feature\b/i, weight: 2 },
  { id: "howto_review", pattern: /\bhow to\b|\breview\b|\bhands-?on\b|\btutorial\b/i, weight: 2 },
  { id: "opinion_generic", pattern: /\bopinion\b|\beditorial\b|\bnewsletter\b|\banalysis\b/i, weight: 1 },
];

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseDateInput(raw: string, endOfDay: boolean): Date {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const iso = endOfDay ? `${trimmed}T23:59:59.999Z` : `${trimmed}T00:00:00.000Z`;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${raw}`);
    return d;
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${raw}`);
  return d;
}

function parseArgs(argv: string[]): CliOptions {
  const now = new Date();
  const defaultSince = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  let limit = 150;
  let since = defaultSince;
  let until = now;
  let dryRun = false;
  let feedConfigPath = path.join(process.cwd(), "config", "demo_investing_feeds.json");
  let skipImages = false;
  let skipLlm = false;
  let disableClassifier = false;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--skip-images") {
      skipImages = true;
      continue;
    }
    if (arg === "--skip-llm") {
      skipLlm = true;
      continue;
    }
    if (arg === "--disable-classifier") {
      disableClassifier = true;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      const val = Number.parseInt(arg.slice("--limit=".length), 10);
      if (!Number.isFinite(val) || val <= 0) throw new Error(`Invalid --limit value: ${arg}`);
      limit = val;
      continue;
    }
    if (arg.startsWith("--since=")) {
      since = parseDateInput(arg.slice("--since=".length), false);
      continue;
    }
    if (arg.startsWith("--until=")) {
      until = parseDateInput(arg.slice("--until=".length), true);
      continue;
    }
    if (arg.startsWith("--feeds=")) {
      const val = arg.slice("--feeds=".length).trim();
      if (!val) throw new Error("Invalid --feeds value.");
      feedConfigPath = path.isAbsolute(val) ? val : path.join(process.cwd(), val);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (until.getTime() < since.getTime()) {
    throw new Error(`Invalid date range: --until must be on or after --since.`);
  }

  return {
    limit,
    since,
    until,
    dryRun,
    feedConfigPath,
    skipImages,
    skipLlm,
    disableClassifier,
  };
}

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function loadFeedConfig(filePath: string): Promise<DemoFeedConfig> {
  const parsed = await readJsonIfExists<DemoFeedConfig>(filePath);
  if (!parsed?.sources?.length) {
    throw new Error(`Feed config missing or empty: ${filePath}`);
  }
  const valid = parsed.sources.filter(
    (s): s is DemoFeedSource =>
      Boolean(s?.id && s?.name && s?.homepage && s?.rss && s?.type && typeof s.id === "string")
  );
  if (!valid.length) {
    throw new Error(`Feed config has no valid sources: ${filePath}`);
  }
  return { sources: valid };
}

function sortByPublishedDesc(items: DatasetItem[]): DatasetItem[] {
  return [...items].sort((a, b) => {
    const dt = new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    if (dt !== 0) return dt;
    return (a.canonicalUrl ?? a.url).localeCompare(b.canonicalUrl ?? b.url);
  });
}

function topNTagCounts(tagCounts: Map<string, number>, n = 12): Array<[string, number]> {
  return Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function sanitizeBullets(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const clean = line.replace(/^[-•\s]+/, "").trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function ensureMinimumBullets(item: DatasetItem, bullets: string[], min = 4): string[] {
  const base = sanitizeBullets(bullets);
  const fallbacks = [
    item.summary || item.title,
    `Investing context: ${item.title}`,
    "Deal details may evolve as filings and terms update.",
    "Investors are tracking valuation, structure, and timing signals.",
    "Follow-on effects may include hiring, market competition, and exit pathways.",
  ];
  for (const f of fallbacks) {
    if (base.length >= min) break;
    const clean = f.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    if (!base.some((x) => x.toLowerCase() === clean.toLowerCase())) base.push(clean);
  }
  return base.slice(0, 6);
}

function markdownFromBullets(bullets: string[]): string {
  return bullets.map((b) => `- ${b}`).join("\n");
}

function buildBiasText(
  bias:
    | {
        vestedInterests: string[];
        framingBias: string[];
        confidence: "low" | "medium" | "high";
      }
    | undefined
): string {
  if (!bias) return "";
  return [
    `Vested interests: ${bias.vestedInterests.join("; ") || "Not specified."}`,
    `Framing: ${bias.framingBias.join("; ") || "Not specified."}`,
    `Confidence: ${bias.confidence}`,
  ].join("\n");
}

function relevanceHeuristic(item: DatasetItem): HeuristicDecision {
  const haystack = `${item.title} ${item.summary} ${item.description ?? ""} ${item.url}`.toLowerCase();
  const includeMatches: string[] = [];
  const excludeMatches: string[] = [];
  let includeScore = 0;
  let excludeScore = 0;

  for (const rule of INCLUDE_RULES) {
    if (rule.pattern.test(haystack)) {
      includeMatches.push(rule.id);
      includeScore += rule.weight;
    }
  }
  for (const rule of EXCLUDE_RULES) {
    if (rule.pattern.test(haystack)) {
      excludeMatches.push(rule.id);
      excludeScore += rule.weight;
    }
  }

  if (includeScore >= 4) return { decision: "include", includeScore, excludeScore, includeMatches, excludeMatches };
  if (includeScore === 0) return { decision: "exclude", includeScore, excludeScore, includeMatches, excludeMatches };
  if (excludeScore >= 3 && includeScore <= 2) {
    return { decision: "exclude", includeScore, excludeScore, includeMatches, excludeMatches };
  }
  if (includeScore <= 2 || excludeScore > 0) {
    return { decision: "uncertain", includeScore, excludeScore, includeMatches, excludeMatches };
  }
  return { decision: "include", includeScore, excludeScore, includeMatches, excludeMatches };
}

function investingTagsFor(item: DatasetItem): string[] {
  const tags = new Set(item.tags ?? []);
  const text = `${item.title} ${item.summary} ${item.description ?? ""}`.toLowerCase();

  if (/\bventure\s+capital\b|\bvc\b/.test(text)) tags.add("VC");
  if (/\bseries\s+[a-f]\b|\bseed\b|\bpre-seed\b|\bfunding\b|\braised\b|\bfundraise(?:d|s)?\b/.test(text)) {
    tags.add("Funding Round");
    tags.add("Fundraise");
  }
  if (/\blimited\s+partner\b|\bgeneral\s+partner\b|\blp\b|\bgp\b/.test(text)) tags.add("LP/GP");
  if (/\bm&a\b|\bmerger\b|\bacquisition\b|\bacquire(?:d|s)?\b|\bbuyout\b|\bexit\b/.test(text)) tags.add("M&A");
  if (/\bipo\b|\binitial public offering\b|\bgoing public\b|\blisting\b/.test(text)) tags.add("IPO");
  if (/\bprivate market(?:s)?\b|\bprivate equity\b|\bgrowth equity\b/.test(text)) tags.add("Private Markets");
  if (/\bstartup\b|\bfounder\b|\bearly-stage\b|\bearly stage\b/.test(text)) tags.add("Startup Finance");
  if (/\bfintech\b|\bpayments\b|\bbanking\b|\bbank\b/.test(text)) tags.add("Fintech");
  if ((/\bai\b|\bartificial intelligence\b|\bllm\b/.test(text)) && /\bfunding\b|\bseries\b|\bventure\b|\bfund\b/.test(text)) {
    tags.add("AI Funding");
  }

  tags.add(DEMO_TAG);
  tags.add("Finance");
  tags.add("Startups");
  return Array.from(tags);
}

function faviconUrl(homepage: string): string | null {
  try {
    const host = new URL(homepage).hostname;
    return host ? `https://www.google.com/s2/favicons?domain=${host}&sz=128` : null;
  } catch {
    return null;
  }
}

function buildClusterFallback() {
  return {
    missing:
      "Common ground:\n- Coverage centers on a concrete financing or deal event.\nDifferences in framing:\n- Sources vary on risk, valuation, and timeline emphasis.\nWhat’s missing:\n- Deal terms, downside risks, and counterparty incentives may be underexplained.\nQuestions to ask next:\n- What milestones or filings confirm this narrative?",
    impact:
      "Immediate impact:\n- Investors and operators may recalibrate near-term expectations.\nSecond-order effects:\n- Competitor fundraising and pricing behavior may shift.\nWho benefits / who loses:\n- Capital-rich players may benefit while constrained peers may lose flexibility.\nTimeline to watch:\n- Key disclosures, follow-on rounds, or regulatory milestones.\nPractical takeaway: Track verifiable filings and concrete operating metrics.",
    framing: "Not specified.",
    sentiment: "Not specified.",
    agreement: "Not specified.",
    confidence: "Low (fallback).",
    framingSpectrum: "Not specified.",
    coverageMix: "Not specified.",
    selectionSignals: "Not specified.",
  };
}

function llmCachePath(): string {
  return path.join(process.cwd(), ".cache", "demo-investing-news-llm.json");
}

async function loadLlmCache(): Promise<LlmCache> {
  const fallback: LlmCache = { classifier: {}, articleBundles: {} };
  const parsed = await readJsonIfExists<Partial<LlmCache>>(llmCachePath());
  if (!parsed) return fallback;
  return {
    classifier: parsed.classifier ?? {},
    articleBundles: parsed.articleBundles ?? {},
  };
}

async function saveLlmCache(cache: LlmCache): Promise<void> {
  const target = llmCachePath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(cache, null, 2), "utf8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const config = await loadFeedConfig(options.feedConfigPath);
  const fetchOptions = {
    ...DEFAULT_FETCH_OPTIONS,
    concurrency: envInt("DEMO_INVESTING_CONCURRENCY", DEFAULT_FETCH_OPTIONS.concurrency),
  };
  const limiter = createLimiter(fetchOptions.concurrency);

  const llmEnabled = Boolean(process.env.OPENAI_API_KEY) && !options.skipLlm;
  const classifierEnabled = llmEnabled && !options.disableClassifier;
  const llmLimiter = createLimiter(envInt("DEMO_INVESTING_LLM_CONCURRENCY", 2));
  const llmMaxItems = envInt("DEMO_INVESTING_LLM_MAX_ITEMS", options.limit);
  const llmCache = llmEnabled ? await loadLlmCache() : { classifier: {}, articleBundles: {} };
  let llmCacheDirty = false;
  let llmRuntimeEnabled = llmEnabled;
  let classifierRuntimeEnabled = classifierEnabled;
  let llmFailureStreak = 0;
  let classifierFailureStreak = 0;

  const counts = {
    feedsConfigured: config.sources.length,
    feedsFetched: 0,
    feedFailures: 0,
    fetchedRaw: 0,
    normalized: 0,
    filteredDate: 0,
    filteredHeuristic: 0,
    filteredClassifier: 0,
    uncertainRoutedToClassifier: 0,
    acceptedBeforeExtract: 0,
    deduped: 0,
    ingested: 0,
    promptFailures: 0,
  };

  console.log(
    `Building investing demo dataset (since=${options.since.toISOString()}, until=${options.until.toISOString()}, limit=${options.limit}, dryRun=${options.dryRun})`
  );
  console.log(`Using feed config: ${options.feedConfigPath}`);

  const feedResults = await Promise.allSettled(
    config.sources.map((source) =>
      limiter.run(async () => {
        const xml = await fetchText(source.rss, fetchOptions);
        const parsed = await parseRss(xml);
        return { source, parsed };
      })
    )
  );

  const candidates: Candidate[] = [];
  for (const result of feedResults) {
    if (result.status !== "fulfilled") {
      counts.feedFailures += 1;
      continue;
    }
    counts.feedsFetched += 1;
    const { source, parsed } = result.value;
    counts.fetchedRaw += parsed.items.length;

    for (const rssItem of parsed.items) {
      const normalized = normalizeRssToDatasetItem({
        sourceId: source.id,
        sourceType: source.type,
        rssItem,
      });
      if (!normalized.item || !normalized.canonicalUrl) continue;
      candidates.push({
        item: normalized.item,
        canonicalUrl: normalized.canonicalUrl,
        rssImageUrl: normalized.rssImageUrl,
      });
    }
  }
  counts.normalized = candidates.length;

  const dedupedInitialItems = dedupeByCanonicalUrl(
    candidates.map((c) => ({ item: c.item, canonicalUrl: c.canonicalUrl }))
  );
  counts.deduped += counts.normalized - dedupedInitialItems.length;

  const candidateById = new Map(candidates.map((c) => [c.item.id, c]));
  const inRange = sortByPublishedDesc(
    dedupedInitialItems.filter((item) => {
      const ts = new Date(item.publishedAt).getTime();
      if (Number.isNaN(ts)) return false;
      return ts >= options.since.getTime() && ts <= options.until.getTime();
    })
  );
  counts.filteredDate = dedupedInitialItems.length - inRange.length;

  const accepted: Candidate[] = [];
  const extractionBudget = Math.max(options.limit * 3, options.limit + 20);
  for (const item of inRange) {
    if (accepted.length >= extractionBudget) break;
    const decision = relevanceHeuristic(item);
    const originalCandidate = candidateById.get(item.id) ?? {
      item,
      canonicalUrl: item.canonicalUrl ?? item.url,
      rssImageUrl: null,
    };

    if (decision.decision === "exclude") {
      counts.filteredHeuristic += 1;
      continue;
    }
    if (decision.decision === "include") {
      accepted.push(originalCandidate);
      continue;
    }

    if (!classifierRuntimeEnabled) {
      if (decision.includeScore >= 2 && decision.excludeScore === 0) {
        accepted.push(originalCandidate);
      } else {
        counts.filteredHeuristic += 1;
      }
      continue;
    }

    counts.uncertainRoutedToClassifier += 1;
    const classifierKey = stableId([item.title, item.url, item.summary]);
    const cached = llmCache.classifier[classifierKey];
    if (cached) {
      if (cached.related) accepted.push(originalCandidate);
      else counts.filteredClassifier += 1;
      continue;
    }

    try {
      const result = await llmLimiter.run(() =>
        classifyInvestingRelevance({
          title: item.title,
          url: item.url,
          summary: item.summary,
          text: item.description ?? null,
        })
      );
      llmCache.classifier[classifierKey] = result;
      llmCacheDirty = true;
      classifierFailureStreak = 0;
      if (result.related) accepted.push(originalCandidate);
      else counts.filteredClassifier += 1;
    } catch {
      counts.promptFailures += 1;
      counts.filteredClassifier += 1;
      classifierFailureStreak += 1;
      if (classifierFailureStreak >= 5) {
        classifierRuntimeEnabled = false;
        console.warn("Classifier disabled for this run after repeated failures.");
      }
    }
  }
  counts.acceptedBeforeExtract = accepted.length;

  console.log(`Accepted ${accepted.length} candidates. Extracting article text for refinement...`);
  await Promise.all(
    accepted.map((candidate) =>
      limiter.run(async () => {
        const extracted = await extractArticleFromUrl(candidate.item.url, fetchOptions);
        if (extracted.canonicalUrl) {
          const canonical = canonicalizeUrl(extracted.canonicalUrl);
          candidate.canonicalUrl = canonical;
          candidate.item.canonicalUrl = canonical;
        }
        candidate.item.extractedText = extracted.text;
        candidate.item.domain = domainFromUrl(candidate.item.canonicalUrl ?? candidate.item.url);
        candidate.item.imageCandidates = Array.from(
          new Set(
            [extracted.ogImageUrl, extracted.firstImageUrl].filter(
              (x): x is string => typeof x === "string" && x.length > 0
            )
          )
        );
      })
    )
  );

  const postExtractDedupe = dedupeByCanonicalUrl(
    accepted.map((candidate) => ({
      item: candidate.item,
      canonicalUrl: candidate.item.canonicalUrl ?? candidate.canonicalUrl ?? candidate.item.url,
    }))
  );
  counts.deduped += accepted.length - postExtractDedupe.length;
  const selected = sortByPublishedDesc(postExtractDedupe).slice(0, options.limit);

  const taggedResult = tagItems(selected, TOPICS);
  const taggedItems = taggedResult.items;
  for (const item of taggedItems) {
    item.tags = investingTagsFor(item);
  }

  const publicDir = path.join(process.cwd(), "public");
  const sourceById = new Map(config.sources.map((s) => [s.id, s]));
  let store: ImageStore | null = null;

  if (!options.skipImages && !options.dryRun) {
    const imagesDir = await ensureImagesDir(publicDir);
    await ensurePlaceholderImage(publicDir, imagesDir);
    store = { imagesDir, downloaded: new Map(), downloadedCount: 0 };
    const rssImageById = new Map(accepted.map((c) => [c.item.id, c.rssImageUrl]));

    await Promise.all(
      taggedItems.map((item) =>
        limiter.run(async () => {
          const rss = rssImageById.get(item.id) ?? null;
          const source = sourceById.get(item.sourceId);
          const fallbackImageUrl = source ? faviconUrl(source.homepage) : null;
          const localPath = await storeImageForItem({
            itemId: item.id,
            candidateImageUrls: [...(item.imageCandidates ?? []), ...(rss ? [rss] : [])],
            articleUrl: item.url,
            opts: fetchOptions,
            store: store!,
            fallbackImageUrl,
          });
          item.media.imageUrl = localPath;
        })
      )
    );
  } else {
    for (const item of taggedItems) {
      if (!item.media?.imageUrl) item.media.imageUrl = PLACEHOLDER_PUBLIC_PATH;
    }
  }

  const articleOutputs = new Map<string, LlmArticleOutput>();
  let articleIndex = 0;
  for (const item of taggedItems) {
    articleIndex += 1;
    const sourceName = sourceById.get(item.sourceId)?.name ?? item.sourceId;
    const metadata = [
      `Title: ${item.title}`,
      `Source: ${sourceName}`,
      `URL: ${item.url}`,
      `Published: ${item.publishedAt}`,
      `Author: ${item.author ?? "Not specified"}`,
      `Domain: ${item.domain ?? "Not specified"}`,
    ].join("\n");
    const baseText = item.extractedText ?? item.description ?? item.summary ?? "";
    const cacheKey = stableId([item.canonicalUrl ?? item.url, item.title]);
    const cached = llmEnabled ? llmCache.articleBundles[cacheKey] : undefined;

    if (cached) {
      const bullets = ensureMinimumBullets(item, cached.summary, 4);
      articleOutputs.set(item.id, {
        summaryMarkdown: markdownFromBullets(bullets),
        bulletSummary: bullets,
        biasAnalysis: cached.bias,
        bias: buildBiasText(cached.bias),
        whatsMissing: cached.whatsMissing ?? [],
        impact: cached.impact,
        audienceReaction: cached.audienceReaction
          ? {
              summary: cached.audienceReaction,
              source: "inferred",
            }
          : undefined,
      });
      continue;
    }

    const llmAllowedForItem = llmRuntimeEnabled && articleIndex <= llmMaxItems;
    if (!llmAllowedForItem) {
      const fallback = ensureMinimumBullets(item, [item.summary, item.title], 4);
      articleOutputs.set(item.id, {
        summaryMarkdown: markdownFromBullets(fallback),
        bulletSummary: fallback,
        bias: "",
        whatsMissing: [],
        impact: { shortTerm: [], longTerm: [] },
        audienceReaction: {
          summary: "Inferred reaction: investors may react as more deal details become public.",
          source: "inferred",
        },
      });
      continue;
    }

    try {
      const output = await llmLimiter.run(async () => {
        if (!baseText || baseText.length < 450) {
          const titleSummary = await generateTitleOnlySummary({ metadata, title: item.title });
          const bullets = ensureMinimumBullets(item, titleSummary.summary, 4);
          const reaction = await generateAudienceReaction({
            metadata,
            text: item.summary || item.title,
            inferred: true,
          });
          return {
            summary: bullets,
            bias: {
              vestedInterests: ["Not specified."],
              framingBias: [],
              confidence: "low" as const,
            },
            whatsMissing: [],
            impact: { shortTerm: [], longTerm: [] },
            reaction: reaction.summary,
          };
        }

        const [bundle, reaction] = await Promise.all([
          generateArticleBundle({ metadata, text: baseText }),
          generateAudienceReaction({
            metadata,
            text: baseText,
            inferred: true,
          }),
        ]);
        const bullets = ensureMinimumBullets(item, bundle.summary, 4);
        return {
          summary: bullets,
          bias: bundle.bias,
          whatsMissing: bundle.whatsMissing,
          impact: bundle.impact,
          reaction: reaction.summary,
        };
      });

      articleOutputs.set(item.id, {
        summaryMarkdown: markdownFromBullets(output.summary),
        bulletSummary: output.summary,
        biasAnalysis: output.bias,
        bias: buildBiasText(output.bias),
        whatsMissing: output.whatsMissing ?? [],
        impact: output.impact,
        audienceReaction: output.reaction
          ? {
              summary: output.reaction,
              source: "inferred",
            }
          : undefined,
      });

      llmCache.articleBundles[cacheKey] = {
        summary: output.summary,
        bias: output.bias,
        whatsMissing: output.whatsMissing,
        impact: output.impact,
        audienceReaction: output.reaction,
      };
      llmCacheDirty = true;
      llmFailureStreak = 0;
    } catch {
      counts.promptFailures += 1;
      llmFailureStreak += 1;
      if (llmFailureStreak >= 5) {
        llmRuntimeEnabled = false;
        classifierRuntimeEnabled = false;
        console.warn("LLM enrichment disabled for this run after repeated failures.");
      }
      const fallback = ensureMinimumBullets(item, [item.summary, item.title], 4);
      articleOutputs.set(item.id, {
        summaryMarkdown: markdownFromBullets(fallback),
        bulletSummary: fallback,
        bias: "",
        whatsMissing: [],
        impact: { shortTerm: [], longTerm: [] },
        audienceReaction: {
          summary: "Inferred reaction: investors may react as more deal details become public.",
          source: "inferred",
        },
      });
    }
  }

  const clustered = clusterByTopic(taggedItems, 0.32, 0.82, 1, {
    tagWeight: 0.08,
    domainBonus: 0.02,
    minTagOverlap: 2,
  });
  const itemsById = new Map(taggedItems.map((item) => [item.id, item]));

  const clusterMeta = new Map<
    string,
    {
      missing: string;
      impact: string;
      framing: string;
      sentiment: string;
      agreement: string;
      confidence: string;
      framingSpectrum: string;
      coverageMix: string;
      selectionSignals: string;
    }
  >();

  for (const cluster of clustered) {
    if (!llmRuntimeEnabled) {
      clusterMeta.set(cluster.id, buildClusterFallback());
      continue;
    }

    try {
      const variants = cluster.itemIds
        .slice(0, 8)
        .map((id) => itemsById.get(id))
        .filter((item): item is DatasetItem => Boolean(item))
        .map((item) => {
          const sourceName = sourceById.get(item.sourceId)?.name ?? item.sourceId;
          const excerpt = (item.extractedText ?? item.description ?? item.summary ?? "").slice(0, 420);
          return `Source: ${sourceName}\nTitle: ${item.title}\nExcerpt: ${excerpt}\nURL: ${item.url}`;
        })
        .join("\n---\n");

      const repId = cluster.representativeItemId ?? cluster.itemIds[0];
      const repSummary = repId ? articleOutputs.get(repId)?.summaryMarkdown ?? "" : "";
      const [missing, impact, trust] = await llmLimiter.run(async () =>
        Promise.all([
          generateClusterMissing({ variants }),
          generateClusterImpact({ summary: repSummary, variants }),
          generateClusterTrustMeta({ variants }),
        ])
      );
      clusterMeta.set(cluster.id, {
        missing: missing.missing,
        impact: impact.impact,
        framing: trust.framing,
        sentiment: trust.sentiment,
        agreement: trust.agreement,
        confidence: trust.confidence,
        framingSpectrum: trust.framingSpectrum,
        coverageMix: trust.coverageMix,
        selectionSignals: trust.selectionSignals,
      });
    } catch {
      counts.promptFailures += 1;
      llmFailureStreak += 1;
      if (llmFailureStreak >= 5) {
        llmRuntimeEnabled = false;
        classifierRuntimeEnabled = false;
        console.warn("Cluster LLM enrichment disabled for this run after repeated failures.");
      }
      clusterMeta.set(cluster.id, buildClusterFallback());
    }
  }

  const pickClusterImage = (items: DatasetItem[]): string | null => {
    const real = items.find((i) => i.media?.imageUrl && i.media.imageUrl !== PLACEHOLDER_PUBLIC_PATH);
    return real?.media?.imageUrl ?? items[0]?.media?.imageUrl ?? null;
  };

  const storyGroups = clustered.map((cluster) => {
    const clusterItems = cluster.itemIds.map((id) => itemsById.get(id)).filter((item): item is DatasetItem => Boolean(item));
    const repId = cluster.representativeItemId ?? cluster.itemIds[0];
    const repItem = repId ? itemsById.get(repId) : clusterItems[0];
    const repOutput = repItem ? articleOutputs.get(repItem.id) : undefined;
    const meta = clusterMeta.get(cluster.id) ?? buildClusterFallback();

    return {
      id: cluster.id,
      canonicalTitle: cluster.title,
      canonicalUrl: repItem?.canonicalUrl ?? repItem?.url,
      topicTags: cluster.tags,
      createdAt: cluster.createdAt ?? repItem?.publishedAt ?? new Date().toISOString(),
      updatedAt: cluster.updatedAt ?? repItem?.publishedAt ?? new Date().toISOString(),
      imageUrl: pickClusterImage(clusterItems),
      perspectives: clusterItems.map((item) => {
        const output = articleOutputs.get(item.id);
        return {
          id: item.id,
          source: sourceById.get(item.sourceId)?.name ?? item.sourceId,
          sourceType: item.sourceType,
          url: item.url,
          canonicalUrl: item.canonicalUrl ?? item.url,
          title: item.title,
          summary: output?.summaryMarkdown ?? item.summary,
          bias: output?.bias ?? "",
          publishedAt: item.publishedAt,
          imageUrl: item.media?.imageUrl ?? null,
          author: item.author ?? null,
        };
      }),
      analysis: {
        summary_markdown: repOutput?.summaryMarkdown ?? repItem?.summary ?? "",
        bias: repOutput?.bias ?? "",
        missing: meta.missing,
        impact: meta.impact,
        framing: meta.framing,
        sentiment: meta.sentiment,
        agreement: meta.agreement,
        confidence: meta.confidence,
        framingSpectrum: meta.framingSpectrum,
        coverageMix: meta.coverageMix,
        selectionSignals: meta.selectionSignals,
        citations: clusterItems.map((item) => item.url),
      },
    };
  });

  const dataset: DatasetFile = {
    version: DATASET_VERSION,
    generatedAt: new Date().toISOString(),
    sources: config.sources,
    topics: TOPICS,
    items: taggedItems,
    stories: clustered,
  };

  const articlesOut: ArticleOutput[] = taggedItems.map((item) => {
    const output = articleOutputs.get(item.id);
    return {
      id: item.id,
      sourceId: item.sourceId,
      sourceName: sourceById.get(item.sourceId)?.name ?? item.sourceId,
      sourceType: item.sourceType,
      title: item.title,
      url: item.url,
      canonicalUrl: item.canonicalUrl ?? item.url,
      publishedAt: item.publishedAt,
      author: item.author ?? null,
      summary: output?.summaryMarkdown ?? item.summary,
      bias: output?.bias ?? "",
      bulletSummary: output?.bulletSummary ?? ensureMinimumBullets(item, [item.summary, item.title], 4),
      biasAnalysis: output?.biasAnalysis,
      whatsMissing: output?.whatsMissing ?? [],
      impact: output?.impact,
      audienceReaction: output?.audienceReaction,
      imageUrl: item.media?.imageUrl ?? null,
      tags: item.tags ?? [],
    };
  });

  const clustersOut: ClusterOutput[] = storyGroups.map((group) => ({
    id: group.id,
    canonicalTitle: group.canonicalTitle,
    canonicalUrl: group.canonicalUrl,
    topicTags: group.topicTags,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    perspectives: group.perspectives,
    analysis: group.analysis,
    imageUrl: group.imageUrl,
  }));

  const summariesMap: Record<string, string> = {};
  for (const item of taggedItems) {
    const output = articleOutputs.get(item.id);
    if (output?.summaryMarkdown) summariesMap[item.id] = output.summaryMarkdown;
  }

  const trustDashboard = clustersOut.map((cluster) => ({
    clusterId: cluster.id,
    title: cluster.canonicalTitle,
    missing: cluster.analysis.missing,
    biasAndFraming: cluster.analysis.framing ?? cluster.analysis.bias ?? "",
    sentiment: cluster.analysis.sentiment ?? "",
    coverageAgreement: cluster.analysis.agreement ?? "",
    confidence: cluster.analysis.confidence ?? "",
    framingSpectrum: cluster.analysis.framingSpectrum ?? "",
    coverageMix: cluster.analysis.coverageMix ?? "",
    selectionSignals: cluster.analysis.selectionSignals ?? "",
  }));

  counts.ingested = taggedItems.length;

  if (!options.dryRun) {
    await writeArticles(publicDir, articlesOut, dataset.sources);
    await writeClusters(publicDir, clustersOut);
    await writeSources(publicDir, dataset.sources);
    await writeSummaries(publicDir, summariesMap);
    await writeEmbeddings(publicDir, process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small", {});
    await writeTrustDashboard(publicDir, trustDashboard);
    await writeNeighbors(publicDir, {});
    await fs.mkdir(path.join(publicDir, "data"), { recursive: true });
    await fs.writeFile(path.join(publicDir, "data", "feed.json"), JSON.stringify(dataset, null, 2), "utf8");
    await fs.writeFile(path.join(publicDir, "data", "storyGroups.json"), JSON.stringify(storyGroups, null, 2), "utf8");
  }

  if (llmEnabled && llmCacheDirty && !options.dryRun) {
    await saveLlmCache(llmCache);
  }

  const filteredOutTotal = counts.filteredDate + counts.filteredHeuristic + counts.filteredClassifier;
  console.log("---- Demo Investing Dataset Summary ----");
  console.log(`Feeds configured: ${counts.feedsConfigured}`);
  console.log(`Feeds fetched: ${counts.feedsFetched}`);
  console.log(`Feed failures: ${counts.feedFailures}`);
  console.log(`Fetched: ${counts.fetchedRaw}`);
  console.log(`Filtered out: ${filteredOutTotal}`);
  console.log(`Deduped: ${counts.deduped}`);
  console.log(`Ingested: ${counts.ingested}`);
  console.log(`Prompt failures: ${counts.promptFailures}`);
  console.log(`Classifier uncertain checks: ${counts.uncertainRoutedToClassifier}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log(`Top tags: ${JSON.stringify(topNTagCounts(taggedResult.tagCounts, 12))}`);
  if (store) console.log(`Images stored: ${store.downloadedCount}`);
  if (counts.ingested < 50) {
    console.warn(`Only ${counts.ingested} items ingested. Widen --since range or raise --limit.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
