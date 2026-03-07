import { Fund, Signal } from "@/lib/fundgraph/types";
import { signalTierAllowsSurface } from "@/lib/fundgraph/signalArticleQuality";
import {
  hasHardScrapeNoise,
  hasNavigationNoise,
  isLikelyBoilerplateScrapeText,
  normalizeFundgraphText,
} from "@/lib/fundgraph/textNormalization";

const NAVIGATION_TEXT_PATTERNS: RegExp[] = [
  /\b(about us|privacy policy|terms of use|accept decline|user menu|connect what we offer)\b/i,
  /\b(news\s*&\s*content|portfolio team|jobs connect)\b/i,
  /\|/,
];

const HARD_SCRAPE_NOISE_PATTERNS: RegExp[] = [
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
  /\bofficial\s+website\b/i,
  /\bfirm\s+profile\b/i,
];

const PLACEHOLDER_TEXT_PATTERNS: RegExp[] = [
  /\b(signal-first strategy|source-backed strategy profile|public evidence indicates|derived profile signal)\b/i,
  /\b(verification compatible|quality gate)\b/i,
];

const LOW_QUALITY_SIGNAL_PATTERNS: RegExp[] = [
  /\b(fund\s+\d+)\b/i,
  /\b(derived profile signal)\b/i,
  /\b(placeholder|synthetic fallback)\b/i,
  /\b(by the numbers|partner\s*\/\/|filter options|all locations|all expertises|firmwide assets under management)\b/i,
  /\b(no\s+items\s+found|what['’]?s\s+with\s+the\s+dog)\b/i,
];
const PROFILE_SOURCE_PATH_PATTERN =
  /^\/(?:$|about(?:-us)?(?:\/|$)|team(?:\/|$)|people(?:\/|$)|partners?(?:\/|$)|portfolio(?:\/|$)|investments?(?:\/|$)|careers?(?:\/|$)|jobs?(?:\/|$)|bio(?:\/|$)|company(?:\/|$)|companies(?:\/|$))/i;
const SIGNAL_EVENT_CONTEXT_PATTERN =
  /\b(raised|announced|launch(?:ed)?|acquired|acquisition|fundraise|fundraising|series\s+[a-f]|seed\s+round|led\s+by|co[-\s]?led|closed\s+on)\b/i;

const NOISY_META_TAGS = new Set([
  "other",
  "vc-enrich",
  "vc_enrich",
  "general",
  "misc",
  "update",
  "news",
  "signal",
  "meta",
  "unknown",
  "untagged",
]);

const DOMAIN_TAG_PATTERN = /\b(funding|fundraise|product|partnership|regulation|hiring|legal|market|infrastructure|research|m&a|acquisition|launch|investor|founder|governance|ai|fintech|security|cloud|defense|bio|health|semiconductor|crypto)\b/i;
const EVENT_STOPWORDS = new Set([
  "about",
  "after",
  "also",
  "because",
  "between",
  "could",
  "early",
  "from",
  "into",
  "just",
  "last",
  "later",
  "over",
  "their",
  "there",
  "these",
  "this",
  "through",
  "using",
  "with",
  "would",
]);

const BAD_GP_NAME_PATTERNS: RegExp[] = [
  /\b(about|portfolio|team|jobs|privacy|policy|terms|results|newsletters|accept|decline)\b/i,
  /\b(tech|blog|crunchbase|pitchbook|dealroom|startupnews|fundgraph)\b/i,
  /\b(venture|ventures|capital|partners|firm|content|sub|nav|skip)\b/i,
  /\b(legal|ai|bio|biotech|cloud|consumer|crypto|data|defense|developer|fintech|healthcare|marketplaces|vertical|philosophy|memos|software|infrastructure|enterprise|research|platform)\b/i,
  /\b(news|global|subscribe|story|investor|login|markets|executive|startups|management|operating|function|update|deck|network|partnership|program|events|building|customer|digital|business|strategy|edge|fund|funds|introducing|types|advisors|page|found)\b/i,
  /\d/,
];

const HTML_OR_ENTITY_PATTERN = /<[^>]+>|&(?:nbsp|amp|lt|gt|quot|#39|#x27|#x2F);/i;
const IMAGE_URL_PATTERN = /\.(?:png|jpe?g|gif|webp|svg)(?:[?#].*)?$/i;
const COMMON_FIRST_NAMES = new Set([
  "aaron",
  "adam",
  "alex",
  "alexander",
  "andrew",
  "anthony",
  "austin",
  "ben",
  "benjamin",
  "brian",
  "charles",
  "chris",
  "christopher",
  "dan",
  "daniel",
  "david",
  "edward",
  "elizabeth",
  "emily",
  "eric",
  "ethan",
  "george",
  "greg",
  "harry",
  "ian",
  "jack",
  "james",
  "jason",
  "jay",
  "jeff",
  "jeremy",
  "john",
  "jon",
  "jonathan",
  "jordan",
  "joseph",
  "josh",
  "joshua",
  "justin",
  "karen",
  "kate",
  "katherine",
  "katie",
  "kevin",
  "kim",
  "kristen",
  "laura",
  "lisa",
  "maria",
  "mark",
  "matt",
  "matthew",
  "max",
  "michael",
  "michelle",
  "mike",
  "nat",
  "nathan",
  "nicole",
  "oliver",
  "peter",
  "rachel",
  "raj",
  "ravi",
  "reed",
  "rob",
  "robert",
  "ryan",
  "sarah",
  "scott",
  "sean",
  "sheryl",
  "steph",
  "stephanie",
  "steve",
  "steven",
  "susan",
  "thomas",
  "tim",
  "timothy",
  "tom",
  "victoria",
  "vinod",
  "will",
  "william",
  "yann",
  "yuri",
  "aditya",
  "aileen",
  "alfred",
  "anand",
  "ann",
  "anu",
  "ashley",
  "bill",
  "bobby",
  "brad",
  "carl",
  "claire",
  "debra",
  "jennifer",
  "julia",
  "linda",
  "manu",
  "mary",
  "neil",
  "patrick",
  "sam",
  "sameer",
  "sandeep",
  "shahin",
  "sonia",
  "todd",
  "vincent",
]);

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/");
}

function hasBadEvidenceUrl(url: string | undefined): boolean {
  if (!url) return true;
  if (!/^https?:\/\//i.test(url)) return true;
  if (url.includes("fundgraph.local")) return true;
  if (url.includes("example.com")) return true;
  if (IMAGE_URL_PATTERN.test(url)) return true;
  return false;
}

function canonicalizeSignalUrl(url: string | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const removable = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid",
      "ref",
      "source",
    ];
    for (const key of removable) {
      parsed.searchParams.delete(key);
    }
    parsed.searchParams.sort();
    const canonical = parsed.toString();
    return canonical.endsWith("/") ? canonical.slice(0, -1) : canonical;
  } catch {
    return url.trim();
  }
}

function signalDomain(url: string | undefined): string {
  try {
    return url ? new URL(url).hostname.toLowerCase() : "";
  } catch {
    return "";
  }
}

function hasValidSourceHost(url: string | undefined): boolean {
  const host = signalDomain(url);
  if (!host) return false;
  if (!host.includes(".")) return false;
  if (host === "localhost" || host.endsWith(".local")) return false;
  if (host.endsWith("example.com")) return false;
  return true;
}

function normalizeSignalTitle(title: string): string {
  const cleaned = normalizeFundgraphText(title, 240)
    .replace(/^[^:]{2,60}:\s+/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned;
}

function normalizeSignalTag(tag: string): string {
  return normalizeWhitespace(stripHtml(tag)).toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function hasDomainTag(tags: string[]): boolean {
  return tags.some((tag) => DOMAIN_TAG_PATTERN.test(normalizeSignalTag(tag)));
}

function hasOnlyNoisyMetaTags(tags: string[]): boolean {
  const normalized = tags.map((tag) => normalizeSignalTag(tag)).filter(Boolean);
  if (!normalized.length) return false;
  return normalized.every((tag) => NOISY_META_TAGS.has(tag));
}

function hasDomainContextInText(signal: Signal): boolean {
  const text = `${signal.title} ${signal.summary} ${(signal.tags ?? []).join(" ")}`;
  return DOMAIN_TAG_PATTERN.test(normalizeWhitespace(stripHtml(text)).toLowerCase());
}

function hasMeaningfulEvidenceSnippet(signal: Signal): boolean {
  const snippet = normalizeFundgraphText(signal.evidenceSnippet || signal.evidence?.snippet || "", 400);
  if (snippet.length >= 24) {
    if (looksLikeNavigationText(snippet)) return false;
    if (isLikelyBoilerplateScrapeText(snippet)) return false;
    if (PLACEHOLDER_TEXT_PATTERNS.some((pattern) => pattern.test(snippet))) return false;
    return true;
  }
  const snapshotText = normalizeFundgraphText(
    [
      signal.articleSnapshot?.headline ?? "",
      signal.articleSnapshot?.excerpt ?? "",
      ...(signal.articleSnapshot?.bullets ?? []),
    ].join(" "),
    700
  );
  if (snapshotText.length < 80) return false;
  if (looksLikeNavigationText(snapshotText)) return false;
  if (isLikelyBoilerplateScrapeText(snapshotText)) return false;
  return true;
}

function hasMinimumEvidenceQuality(signal: Signal): boolean {
  const url = signal.evidenceUrl ?? signal.evidence?.url;
  if (!hasValidSourceHost(url)) return false;
  if (isLikelyProfileSourceSignal(signal)) return false;
  if (hasMeaningfulEvidenceSnippet(signal)) return true;
  const snapshotBullets = signal.articleSnapshot?.bullets?.length ?? 0;
  const snapshotFacts = signal.articleSnapshot?.keyFacts?.length ?? 0;
  if (signal.qualityTier === "ALIGNED") return snapshotBullets >= 2 || snapshotFacts >= 2;
  if (signal.qualityTier === "WARNING") return snapshotBullets >= 2;
  return false;
}

function eventFingerprintTokens(signal: Signal): string[] {
  const text = `${normalizeSignalTitle(signal.title)} ${normalizeSignalTitle(signal.summary)}`.trim();
  return text
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !EVENT_STOPWORDS.has(token))
    .slice(0, 26);
}

function eventFingerprint(signal: Signal): string {
  return eventFingerprintTokens(signal).join(" ");
}

function eventFingerprintOverlap(left: string, right: string): number {
  const leftTokens = new Set(left.split(" ").filter((token) => token.length >= 3));
  const rightTokens = new Set(right.split(" ").filter((token) => token.length >= 3));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1;
  }
  return shared / Math.max(leftTokens.size, rightTokens.size);
}

function signalOriginRank(signal: Signal): number {
  if (signal.dataOrigin === "fetched") return 3;
  if (signal.dataOrigin === "curated") return 2;
  return 1;
}

function signalFreshnessTs(signal: Signal): number {
  const ts = +new Date(signal.createdAt);
  return Number.isFinite(ts) ? ts : 0;
}

function signalRecencyScore(signal: Signal): number {
  const createdAtMs = signalFreshnessTs(signal);
  if (!createdAtMs) return 0;
  const ageHours = Math.max(0, (Date.now() - createdAtMs) / (1000 * 60 * 60));
  return clamp(1 - ageHours / (24 * 10), 0, 1);
}

function snapshotCompletenessScore(signal: Signal): number {
  const snapshot = signal.articleSnapshot;
  if (!snapshot) return 0;
  const bullets = Math.min(1, (snapshot.bullets?.length ?? 0) / 4);
  const facts = Math.min(1, (snapshot.keyFacts?.length ?? 0) / 4);
  const quotes = Math.min(1, (snapshot.evidenceQuotes?.length ?? 0) / 3);
  const extraction = snapshot.extraction?.sourceTextLength && snapshot.extraction.sourceTextLength > 200 ? 1 : 0.4;
  return Number((bullets * 0.35 + facts * 0.25 + quotes * 0.25 + extraction * 0.15).toFixed(3));
}

function formattingCleanlinessScore(signal: Signal): number {
  const text = normalizeFundgraphText(`${signal.title} ${signal.summary} ${signal.evidenceSnippet ?? signal.evidence?.snippet ?? ""}`, 1400);
  if (!text) return 0;
  if (HARD_SCRAPE_NOISE_PATTERNS.some((pattern) => pattern.test(text))) return 0;
  if (HTML_OR_ENTITY_PATTERN.test(text)) return 0.2;
  if (looksLikeNavigationText(text)) return 0.25;
  const longWordPenalty = /\S{45,}/.test(text) ? 0.2 : 0;
  return clamp(1 - longWordPenalty, 0, 1);
}

function signalQualityScore(signal: Signal): number {
  const summaryLength = normalizeFundgraphText(signal.summary || "", 500).length;
  const snippetLength = normalizeFundgraphText(signal.evidenceSnippet || signal.evidence?.snippet || "", 500).length;
  const evidenceBonus = hasMinimumEvidenceQuality(signal) ? 7 : signal.evidenceUrl || signal.evidence?.url ? 2 : 0;
  const advancedBonus = signal.advancedInsightStatus === "ready" && signal.advancedInsight ? 4 : 0;
  const citationMatch = clamp(signal.citationMatchScore ?? 0.4, 0, 1);
  const alignmentMatch = clamp(signal.alignmentScore ?? 0.4, 0, 1);
  const snapshotScore = snapshotCompletenessScore(signal);
  const formattingScore = formattingCleanlinessScore(signal);
  const recency = signalRecencyScore(signal);
  const tierBonus =
    signal.qualityTier === "ALIGNED"
      ? 34
      : signal.qualityTier === "WARNING"
        ? 20
        : signal.qualityTier === "FAILED"
          ? -10
          : 0;
  return (
    tierBonus +
    signalOriginRank(signal) * 14 +
    (signal.confidence ?? 0) * 10 +
    citationMatch * 18 +
    alignmentMatch * 16 +
    snapshotScore * 18 +
    formattingScore * 10 +
    recency * 6 +
    Math.min(summaryLength, 240) / 120 +
    Math.min(snippetLength, 220) / 220 +
    evidenceBonus +
    advancedBonus
  );
}

function pickBetterSignal(current: Signal | undefined, incoming: Signal): Signal {
  if (!current) return incoming;
  const currentScore = signalQualityScore(current);
  const incomingScore = signalQualityScore(incoming);
  if (incomingScore > currentScore) return incoming;
  if (incomingScore < currentScore) return current;
  return signalFreshnessTs(incoming) >= signalFreshnessTs(current) ? incoming : current;
}

function dedupeSignalsForFeed(signals: Signal[]): Signal[] {
  const byEventKey = new Map<string, Signal>();
  for (const signal of signals) {
    const canonicalUrl = canonicalizeSignalUrl(signal.evidenceUrl ?? signal.evidence?.url);
    const fingerprint = eventFingerprint(signal);
    if (!fingerprint) continue;
    const domain = signalDomain(signal.evidenceUrl ?? signal.evidence?.url);
    const created = signal.createdAt ? signal.createdAt.slice(0, 10) : "";
    const key = canonicalUrl
      ? `${signal.fundId}::${canonicalUrl}::${fingerprint}`
      : `${signal.fundId}::${fingerprint}::${domain}::${created}`;
    byEventKey.set(key, pickBetterSignal(byEventKey.get(key), signal));
  }

  const byNearEvent = new Map<string, Signal>();
  for (const signal of byEventKey.values()) {
    const signalFingerprint = eventFingerprint(signal);
    const signalUrl = canonicalizeSignalUrl(signal.evidenceUrl ?? signal.evidence?.url);
    const signalDomainName = signalDomain(signal.evidenceUrl ?? signal.evidence?.url);
    const signalDay = signal.createdAt ? signal.createdAt.slice(0, 10) : "";

    let matchedKey = "";
    for (const [key, existing] of byNearEvent.entries()) {
      if (existing.fundId !== signal.fundId) continue;
      const existingFingerprint = eventFingerprint(existing);
      const overlap = eventFingerprintOverlap(signalFingerprint, existingFingerprint);
      const existingUrl = canonicalizeSignalUrl(existing.evidenceUrl ?? existing.evidence?.url);
      if (signalUrl && existingUrl && signalUrl === existingUrl) {
        if (overlap < 0.55) continue;
        matchedKey = key;
        break;
      }

      if (overlap < 0.8) continue;
      const existingDomainName = signalDomain(existing.evidenceUrl ?? existing.evidence?.url);
      const existingDay = existing.createdAt ? existing.createdAt.slice(0, 10) : "";
      if (signalDomainName && signalDomainName === existingDomainName && signalDay && signalDay === existingDay) {
        matchedKey = key;
        break;
      }
    }

    if (matchedKey) {
      byNearEvent.set(matchedKey, pickBetterSignal(byNearEvent.get(matchedKey), signal));
      continue;
    }
    byNearEvent.set(signalFingerprint, signal);
  }

  const byFallbackKey = new Map<string, Signal>();
  for (const signal of byNearEvent.values()) {
    const fingerprint = eventFingerprint(signal);
    const domain = signalDomain(signal.evidenceUrl ?? signal.evidence?.url);
    const created = signal.createdAt ? signal.createdAt.slice(0, 10) : "";
    const fallbackKey = `${signal.fundId}::${fingerprint}::${domain}::${created}`;
    byFallbackKey.set(fallbackKey, pickBetterSignal(byFallbackKey.get(fallbackKey), signal));
  }

  return [...byFallbackKey.values()].sort((left, right) => {
    const leftQuality = signalQualityScore(left);
    const rightQuality = signalQualityScore(right);
    if (leftQuality !== rightQuality) return rightQuality - leftQuality;
    const leftTs = signalFreshnessTs(left);
    const rightTs = signalFreshnessTs(right);
    if (leftTs !== rightTs) return rightTs - leftTs;
    return (right.confidence ?? 0) - (left.confidence ?? 0);
  });
}

function diversifySignals(signals: Signal[], maxPerFund: number): Signal[] {
  if (!Number.isFinite(maxPerFund) || maxPerFund <= 0) return signals;
  const perFundCount = new Map<string, number>();
  const out: Signal[] = [];
  for (const signal of signals) {
    const current = perFundCount.get(signal.fundId) ?? 0;
    if (current >= maxPerFund) continue;
    perFundCount.set(signal.fundId, current + 1);
    out.push(signal);
  }
  return out;
}

function sourcePathname(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).pathname || "/";
  } catch {
    return "";
  }
}

function isLikelyProfileSourceSignal(signal: Signal): boolean {
  const pathname = sourcePathname(signal.evidenceUrl ?? signal.evidence?.url).toLowerCase();
  const text = normalizeFundgraphText(
    `${signal.title ?? ""} ${signal.summary ?? ""} ${signal.evidenceSnippet ?? signal.evidence?.snippet ?? ""}`,
    1200
  ).toLowerCase();
  const hasEventContext = SIGNAL_EVENT_CONTEXT_PATTERN.test(text);
  if (PROFILE_SOURCE_PATH_PATTERN.test(pathname) && !hasEventContext) return true;
  if (hasNavigationNoise(text) && !hasEventContext) return true;
  if (LOW_QUALITY_SIGNAL_PATTERNS.some((pattern) => pattern.test(text)) && !hasEventContext) return true;
  return false;
}

function looksLikeNavigationText(value: string): boolean {
  const text = normalizeWhitespace(value);
  if (!text) return true;
  if (isLikelyBoilerplateScrapeText(text)) return true;
  if (text.length > 300) return true;
  const uppercaseRatio =
    text.length > 0
      ? text.split("").filter((char) => /[A-Z]/.test(char)).length / text.length
      : 0;
  if (uppercaseRatio > 0.22 && text.length > 40) return true;
  return NAVIGATION_TEXT_PATTERNS.some((pattern) => pattern.test(text));
}

function cleanNarrativeText(value: string, fallback: string): string {
  const text = normalizeFundgraphText(value, 900);
  if (!text || looksLikeNavigationText(text)) return fallback;
  if (isLikelyBoilerplateScrapeText(text)) return fallback;
  if (PLACEHOLDER_TEXT_PATTERNS.some((pattern) => pattern.test(text))) return fallback;
  return text.length > 260 ? `${text.slice(0, 259)}...` : text;
}

function isLikelyPersonName(value: string): boolean {
  const name = normalizeWhitespace(stripHtml(value));
  if (!name) return false;
  const tokens = name.split(" ");
  if (tokens.length < 2 || tokens.length > 3) return false;
  if (name.length < 4 || name.length > 40) return false;
  if (!/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}$/.test(name)) return false;
  if (!COMMON_FIRST_NAMES.has(tokens[0]?.toLowerCase() ?? "")) return false;
  if (BAD_GP_NAME_PATTERNS.some((pattern) => pattern.test(name))) return false;
  return true;
}

function looksFundLikeName(name: string, fundName: string): boolean {
  const nameTokens = normalizeWhitespace(stripHtml(name))
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 1);
  const fundTokens = new Set(
    normalizeWhitespace(stripHtml(fundName))
      .toLowerCase()
      .split(/\s+/)
      .filter((token) => token.length > 2)
  );
  if (!nameTokens.length || !fundTokens.size) return false;
  const overlap = nameTokens.filter((token) => fundTokens.has(token)).length;
  return overlap >= Math.max(1, nameTokens.length - 1);
}

function isSyntheticSignal(signal: Signal): boolean {
  if (signal.tags?.includes("synthetic-fallback")) return true;
  const evidenceUrl = signal.evidenceUrl ?? signal.evidence?.url ?? "";
  if (evidenceUrl.includes("fundgraph.local")) return true;
  return false;
}

function isLowQualitySignal(signal: Signal): boolean {
  const hardNoiseText = `${signal.title ?? ""} ${signal.summary ?? ""} ${signal.evidenceSnippet ?? signal.evidence?.snippet ?? ""} ${signal.articleSnapshot?.headline ?? ""} ${signal.articleSnapshot?.excerpt ?? ""}`;
  if (hasHardScrapeNoise(hardNoiseText) || HARD_SCRAPE_NOISE_PATTERNS.some((pattern) => pattern.test(hardNoiseText))) return true;
  if (isLikelyBoilerplateScrapeText(hardNoiseText)) return true;
  if (isLikelyProfileSourceSignal(signal)) return true;
  if (signal.qualityTier === "FAILED") return true;
  const title = normalizeFundgraphText(signal.title, 220);
  const summary = normalizeFundgraphText(signal.summary, 360);
  const text = `${title} ${summary}`.trim();
  const tags = Array.isArray(signal.tags) ? signal.tags : [];
  if (text.length < 24) return true;
  if (LOW_QUALITY_SIGNAL_PATTERNS.some((pattern) => pattern.test(text))) return true;
  if (HTML_OR_ENTITY_PATTERN.test(text)) return true;
  if (PLACEHOLDER_TEXT_PATTERNS.some((pattern) => pattern.test(text))) return true;
  if (hasOnlyNoisyMetaTags(tags) && !hasDomainTag(tags) && !hasDomainContextInText(signal)) return true;
  if (!hasMinimumEvidenceQuality(signal)) return true;
  if (looksLikeNavigationText(text)) return true;
  return false;
}

function isSeverelyLowQualitySignal(signal: Signal): boolean {
  const hardNoiseText = `${signal.title ?? ""} ${signal.summary ?? ""} ${signal.evidenceSnippet ?? signal.evidence?.snippet ?? ""} ${signal.articleSnapshot?.headline ?? ""} ${signal.articleSnapshot?.excerpt ?? ""}`;
  if (hasHardScrapeNoise(hardNoiseText) || HARD_SCRAPE_NOISE_PATTERNS.some((pattern) => pattern.test(hardNoiseText))) return true;
  if (isLikelyBoilerplateScrapeText(hardNoiseText)) return true;
  if (isLikelyProfileSourceSignal(signal)) return true;
  if (!hasValidSourceHost(signal.evidenceUrl ?? signal.evidence?.url)) return true;
  return false;
}

export function filterSignalsForDisplay(signals: Signal[]): Signal[] {
  return filterSignalsForDisplayWithSurface(signals, "global");
}

export function filterSignalsForGraph(signals: Signal[]): Signal[] {
  return signals
    .filter((signal) => {
      if (isSyntheticSignal(signal)) return false;
      return !isSeverelyLowQualitySignal(signal);
    })
    .map((signal) => ({
      ...signal,
      title: normalizeFundgraphText(signal.title, 220),
      summary: cleanNarrativeText(signal.summary, normalizeFundgraphText(signal.summary || signal.title, 280)),
      evidenceSnippet: signal.evidenceSnippet ? cleanNarrativeText(signal.evidenceSnippet, "") : signal.evidenceSnippet,
      evidence:
        signal.evidence || signal.evidenceSnippet
          ? {
              url: signal.evidence?.url ?? signal.evidenceUrl,
              snippet: signal.evidence?.snippet
                ? cleanNarrativeText(signal.evidence.snippet, "")
                : signal.evidenceSnippet
                  ? cleanNarrativeText(signal.evidenceSnippet, "")
                  : undefined,
            }
          : signal.evidence,
    }));
}

function filterSignalsForDisplayWithSurface(signals: Signal[], surface: "global" | "fund"): Signal[] {
  return signals
    .filter((signal) => {
      if (signal.qualityTier) {
        if (!signalTierAllowsSurface(signal.qualityTier, surface)) return false;
        return !isSeverelyLowQualitySignal(signal);
      }
      return !isSyntheticSignal(signal) && !isLowQualitySignal(signal);
    })
    .map((signal) => ({
      ...signal,
      title: normalizeFundgraphText(signal.title, 220),
      summary: cleanNarrativeText(signal.summary, normalizeFundgraphText(signal.summary || signal.title, 260)),
      evidenceSnippet: signal.evidenceSnippet ? cleanNarrativeText(signal.evidenceSnippet, "") : signal.evidenceSnippet,
      evidence:
        signal.evidence || signal.evidenceSnippet
          ? {
              url: signal.evidence?.url ?? signal.evidenceUrl,
              snippet: signal.evidence?.snippet
                ? cleanNarrativeText(signal.evidence.snippet, "")
                : signal.evidenceSnippet
                  ? cleanNarrativeText(signal.evidenceSnippet, "")
                  : undefined,
            }
          : signal.evidence,
    }));
}

export function curateSignalsForFeed(
  signals: Signal[],
  options?: {
    maxPerFund?: number;
    limit?: number;
    surface?: "global" | "fund";
  }
): Signal[] {
  const filtered = filterSignalsForDisplayWithSurface(signals, options?.surface ?? "global");
  const deduped = dedupeSignalsForFeed(filtered);
  const diversified = diversifySignals(deduped, options?.maxPerFund ?? 0);
  if (typeof options?.limit === "number" && options.limit > 0) {
    return diversified.slice(0, options.limit);
  }
  return diversified;
}

export function sanitizeFundForDisplay(fund: Fund): Fund {
  const cleanDescription = cleanNarrativeText(fund.description || "", `${fund.name} venture capital profile.`);
  const strategyFallback = cleanDescription || `${fund.name} strategy is being enriched from public citations.`;
  const gpBioFallback = `${fund.name} partner team focuses on ${fund.sectors.slice(0, 2).join(", ") || "venture investing"}.`;

  const gpNames = (fund.gpNames ?? [])
    .map((name) => normalizeWhitespace(stripHtml(name)))
    .filter(isLikelyPersonName)
    .filter((name) => !looksFundLikeName(name, fund.name));
  const safeGpName = isLikelyPersonName(fund.gp.name)
    ? normalizeWhitespace(stripHtml(fund.gp.name))
    : gpNames[0] ?? "Partner Team";
  const finalGpName = looksFundLikeName(safeGpName, fund.name) ? gpNames[0] ?? "Partner Team" : safeGpName;
  const previousFirms = (fund.gp.previousFirms ?? [])
    .map((item) => normalizeWhitespace(stripHtml(item)))
    .filter((item) => item.length >= 2 && item.length <= 40)
    .filter((item) => !BAD_GP_NAME_PATTERNS.some((pattern) => pattern.test(item)));
  const partnerNetwork = (fund.gp.partnerNetwork ?? [])
    .map((item) => normalizeWhitespace(stripHtml(item)))
    .filter((item) => item.length >= 2 && item.length <= 40)
    .filter((item) => !BAD_GP_NAME_PATTERNS.some((pattern) => pattern.test(item)));

  return {
    ...fund,
    officialUrl: hasBadEvidenceUrl(fund.officialUrl) ? undefined : fund.officialUrl,
    description: cleanDescription,
    strategy: cleanNarrativeText(fund.strategy, strategyFallback),
    gp: {
      ...fund.gp,
      name: finalGpName,
      bio: cleanNarrativeText(fund.gp.bio, gpBioFallback),
      previousFirms,
      partnerNetwork,
    },
    gpNames: gpNames.length ? gpNames : [finalGpName],
  };
}
