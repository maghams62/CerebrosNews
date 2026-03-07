import { Fund, NewsClaim, Signal, SignalArticleSnapshot, SignalQualityTier, Source } from "@/lib/fundgraph/types";
import {
  hasHardScrapeNoise as hasHardScrapeNoiseText,
  isLikelyBoilerplateScrapeText,
  normalizeFundgraphText,
} from "@/lib/fundgraph/textNormalization";

const QUALITY_EXTRACTOR_VERSION = "signal_article_v1";
const MAX_BULLETS = 5;
const MIN_BULLETS = 3;
const MAX_QUOTES = 3;
const STOPWORDS = new Set([
  "about",
  "after",
  "also",
  "been",
  "from",
  "into",
  "over",
  "this",
  "that",
  "their",
  "there",
  "these",
  "through",
  "with",
  "would",
]);

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
  /\binvestment\s+bank\b/i,
];
const PROFILE_SOURCE_PATH_PATTERN =
  /^\/(?:$|about(?:-us)?(?:\/|$)|team(?:\/|$)|people(?:\/|$)|partners?(?:\/|$)|portfolio(?:\/|$)|investments?(?:\/|$)|careers?(?:\/|$)|jobs?(?:\/|$)|bio(?:\/|$)|company(?:\/|$)|companies(?:\/|$))/i;
const VC_EVENT_CONTEXT_PATTERNS: RegExp[] = [
  /\braised\b/i,
  /\bannounced\b/i,
  /\blaunch(?:ed)?\b/i,
  /\bacquired\b/i,
  /\bacquisition\b/i,
  /\bfundrais(?:e|ing)\b/i,
  /\bseries\s+[a-f]\b/i,
  /\bseed\s+round\b/i,
  /\bled\s+by\b/i,
  /\bco[-\s]?led\b/i,
  /\bclosed\s+on\b/i,
];

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
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

function cleanText(value: string | undefined | null): string {
  if (!value) return "";
  return normalizeFundgraphText(String(value), 6000);
}

function shorten(value: string, maxLength: number): string {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeTokenText(value: string): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return normalizeTokenText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function tokenOverlapScore(left: string, right: string): number {
  const leftTokens = new Set(tokens(left));
  const rightTokens = new Set(tokens(right));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(leftTokens.size, rightTokens.size);
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

function sourcePathname(url: string): string {
  if (!url) return "";
  try {
    return new URL(url).pathname || "/";
  } catch {
    return "";
  }
}

function hasVcContext(text: string): boolean {
  return VC_CONTEXT_PATTERNS.some((pattern) => pattern.test(text));
}

function hasVcEventContext(text: string): boolean {
  return VC_EVENT_CONTEXT_PATTERNS.some((pattern) => pattern.test(text));
}

function hasMarketContext(text: string): boolean {
  return MARKET_CONTEXT_PATTERNS.some((pattern) => pattern.test(text));
}

function requiresExplicitVcContext(term: string): boolean {
  const normalized = normalizeTokenText(term);
  const tokensInTerm = normalized.split(" ").filter((token) => token.length >= 2);
  if (tokensInTerm.length !== 1) return false;
  const token = tokensInTerm[0] ?? "";
  if (token.length < 4) return false;
  if (FUND_NAME_KEYWORD_PATTERN.test(token)) return false;
  return true;
}

function isHttpUrl(url: string | undefined): boolean {
  if (!url) return false;
  return /^https?:\/\//i.test(url.trim());
}

export function canonicalizeSignalUrl(url: string | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url.trim());
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
    for (const key of removable) parsed.searchParams.delete(key);
    parsed.searchParams.sort();
    const canonical = parsed.toString();
    return canonical.endsWith("/") ? canonical.slice(0, -1) : canonical;
  } catch {
    return url.trim();
  }
}

function fundNameTerms(fund: Fund | undefined | null, signal: Signal): string[] {
  const candidates = new Set<string>();
  if (fund?.name) candidates.add(fund.name);
  for (const alias of fund?.aliases ?? []) {
    if (alias?.trim()) candidates.add(alias.trim());
  }
  const titlePrefix = cleanText(signal.title).split(":")[0]?.trim();
  if (titlePrefix && titlePrefix.length >= 3 && titlePrefix.length <= 80) {
    candidates.add(titlePrefix);
  }

  return Array.from(candidates)
    .map((entry) => cleanText(entry))
    .filter((entry) => entry.length >= 3)
    .sort((left, right) => right.length - left.length);
}

function phraseMentionScore(term: string, text: string): number {
  const raw = cleanText(text);
  if (!raw || !term) return 0;
  const escaped = escapeRegExp(term);
  const regex = new RegExp(`\\b${escaped}\\b`, "i");
  if (regex.test(raw)) return 1;
  const normalized = normalizeTokenText(raw);
  const normalizedTerm = normalizeTokenText(term);
  if (!normalized || !normalizedTerm) return 0;
  if (normalized.includes(normalizedTerm)) return 0.85;
  return tokenOverlapScore(normalizedTerm, normalized);
}

function sentenceSplit(text: string): string[] {
  return cleanText(text)
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 30);
}

function chooseBullets(
  sourceText: string,
  signal: Signal,
  fund: Fund | undefined | null,
  fallbackSnippet: string
): string[] {
  const sentences = sentenceSplit(sourceText);
  const fundTerms = fundNameTerms(fund, signal);
  const prioritized = [...sentences].sort((left, right) => {
    const leftScore =
      tokenOverlapScore(left, `${signal.title} ${signal.summary}`) +
      Math.max(...fundTerms.map((term) => phraseMentionScore(term, left)), 0);
    const rightScore =
      tokenOverlapScore(right, `${signal.title} ${signal.summary}`) +
      Math.max(...fundTerms.map((term) => phraseMentionScore(term, right)), 0);
    return rightScore - leftScore;
  });

  const selected: string[] = [];
  for (const sentence of prioritized) {
    const value = shorten(sentence, 220);
    if (!value) continue;
    if (selected.some((existing) => normalizeTokenText(existing) === normalizeTokenText(value))) continue;
    selected.push(value);
    if (selected.length >= MAX_BULLETS) break;
  }

  if (selected.length < MIN_BULLETS) {
    const fallbacks = [
      shorten(fallbackSnippet, 220),
      shorten(signal.summary, 220),
      shorten(signal.title, 180),
    ].filter(Boolean);
    for (const fallback of fallbacks) {
      if (selected.some((existing) => normalizeTokenText(existing) === normalizeTokenText(fallback))) continue;
      selected.push(fallback);
      if (selected.length >= MIN_BULLETS) break;
    }
  }

  return selected.slice(0, MAX_BULLETS);
}

function chooseQuotes(
  sourceText: string,
  snippet: string,
  citationId: string,
  sourceUrl: string | undefined
): SignalArticleSnapshot["evidenceQuotes"] {
  const quotes: SignalArticleSnapshot["evidenceQuotes"] = [];
  const addQuote = (value: string) => {
    const text = shorten(value, 220);
    if (!text || text.length < 25) return;
    if (quotes.some((quote) => normalizeTokenText(quote.text) === normalizeTokenText(text))) return;
    quotes.push({
      citationId,
      text,
      url: sourceUrl,
    });
  };

  if (snippet) addQuote(snippet);
  for (const sentence of sentenceSplit(sourceText)) {
    addQuote(sentence);
    if (quotes.length >= MAX_QUOTES) break;
  }
  return quotes.slice(0, MAX_QUOTES);
}

type BuildSnapshotInput = {
  signal: Signal;
  source: Source | null;
  fund?: Fund | null;
  claims?: NewsClaim[];
  citationMatchScore: number;
  fundRelevanceScore: number;
  sourceJoinScore: number;
  snippetOverlapScore: number;
  extractedAt?: string;
};

function buildSignalArticleSnapshot(input: BuildSnapshotInput): SignalArticleSnapshot {
  const { signal, source, fund } = input;
  const claims = input.claims ?? [];
  const citationId = source?.id || signal.sourceId || signal.id;
  const sourceUrl =
    canonicalizeSignalUrl(source?.url) ||
    canonicalizeSignalUrl(signal.evidenceUrl ?? signal.evidence?.url) ||
    undefined;
  const sourceNameFromMetadata = typeof source?.metadata?.sourceName === "string" ? source.metadata.sourceName : "";
  const sourceName = cleanText(sourceNameFromMetadata || source?.title || signal.sourceTitle || domainFromUrl(sourceUrl) || "Source");
  const headline = cleanText(source?.title || signal.sourceTitle || signal.title) || signal.title;
  const snippet =
    cleanText(signal.evidenceSnippet || signal.evidence?.snippet) ||
    cleanText(claims[0]?.citation?.snippet) ||
    cleanText(signal.summary);
  const sourceText = cleanText([source?.rawText, claims.map((claim) => claim.claimText).join(". "), snippet].filter(Boolean).join("\n"));
  const publishedAt =
    (typeof source?.metadata?.publishedAt === "string" && source.metadata.publishedAt) ||
    source?.createdAt ||
    claims[0]?.createdAt ||
    signal.createdAt;
  const bullets = chooseBullets(sourceText, signal, fund, snippet);
  const evidenceQuotes = chooseQuotes(sourceText, snippet, citationId, sourceUrl);
  const keyFacts: SignalArticleSnapshot["keyFacts"] = [
    {
      label: "Primary claim",
      value: shorten(signal.summary || signal.title, 200),
      citationId,
    },
    {
      label: "Source",
      value: headline,
      citationId,
    },
  ];

  const amountMatch = sourceText.match(/(?:USD\s*)?\$[0-9]+(?:\.[0-9]+)?\s?(?:billion|million|bn|m|k)?/i);
  if (amountMatch?.[0]) {
    keyFacts.push({
      label: "Mentioned amount",
      value: shorten(amountMatch[0], 80),
      citationId,
    });
  }
  const roundMatch = sourceText.match(/\b(?:pre-seed|seed|series\s+[a-f]|growth)\b/i);
  if (roundMatch?.[0]) {
    keyFacts.push({
      label: "Stage context",
      value: roundMatch[0],
      citationId,
    });
  }
  if (fund?.name) {
    keyFacts.push({
      label: "Linked fund",
      value: fund.name,
      citationId,
    });
  }

  return {
    headline: shorten(headline, 180),
    sourceName: shorten(sourceName, 120),
    sourceUrl,
    publishedAt,
    bullets: bullets.slice(0, MAX_BULLETS),
    keyFacts: keyFacts.slice(0, 6),
    evidenceQuotes,
    excerpt: shorten(sourceText || snippet || signal.summary, 360),
    extraction: {
      extractedAt: input.extractedAt || new Date().toISOString(),
      extractor: QUALITY_EXTRACTOR_VERSION,
      sourceTextLength: sourceText.length,
      snippetOverlapScore: Number(clamp(input.snippetOverlapScore, 0, 1).toFixed(3)),
      fundRelevanceScore: Number(clamp(input.fundRelevanceScore, 0, 1).toFixed(3)),
      sourceJoinScore: Number(clamp(input.sourceJoinScore, 0, 1).toFixed(3)),
      isSynthetic: Boolean(source?.metadata?.isSynthetic || signal.dataOrigin === "derived"),
    },
  };
}

export interface SignalArticleQualityChecks {
  hasValidEvidenceUrl: boolean;
  sourceJoin: boolean;
  sourceJoinScore: number;
  snippetOverlapScore: number;
  fundMentionScore: number;
  claimOverlapScore: number;
}

export interface SignalArticleQualityResult {
  qualityTier: SignalQualityTier;
  alignmentScore: number;
  citationMatchScore: number;
  qualityReasons: string[];
  articleSnapshot: SignalArticleSnapshot;
  checks: SignalArticleQualityChecks;
}

export interface ComputeSignalArticleQualityInput {
  signal: Signal;
  fund?: Fund | null;
  source?: Source | null;
  claims?: NewsClaim[];
  nowIso?: string;
}

export function computeSignalArticleQuality(input: ComputeSignalArticleQualityInput): SignalArticleQualityResult {
  const signal = input.signal;
  const source = input.source ?? null;
  const claims = input.claims ?? [];
  const evidenceUrl = canonicalizeSignalUrl(signal.evidenceUrl ?? signal.evidence?.url);
  const sourceUrl = canonicalizeSignalUrl(source?.url);
  const sourceText = cleanText(
    [
      source?.title,
      source?.rawText,
      claims.map((claim) => claim.claimText).join(". "),
      claims.map((claim) => claim.citation?.snippet).join(". "),
    ]
      .filter(Boolean)
      .join("\n")
  );
  const snippet = cleanText(
    signal.evidenceSnippet || signal.evidence?.snippet || claims[0]?.citation?.snippet || signal.summary
  );
  const signalText = cleanText(`${signal.title} ${signal.summary}`);
  const contextText = cleanText([source?.title, sourceText, snippet, signalText].filter(Boolean).join("\n"));
  const hardNoiseText = `${signal.title} ${signal.summary} ${snippet} ${sourceText}`;

  const sourceIdMatch = Boolean(source && signal.sourceId && source.id === signal.sourceId);
  const claimSourceMatch = Boolean(source && claims.some((claim) => claim.sourceId === source.id));
  const urlMatch = Boolean(evidenceUrl && sourceUrl && evidenceUrl === sourceUrl);
  const sourceJoin = sourceIdMatch || claimSourceMatch || urlMatch;
  const sourceJoinScore = sourceIdMatch || claimSourceMatch ? 1 : urlMatch ? 0.88 : source ? 0.45 : 0;

  const snippetOverlapScore = snippet && sourceText ? tokenOverlapScore(snippet, sourceText) : 0;
  const claimOverlapScore = sourceText ? tokenOverlapScore(signalText, sourceText) : tokenOverlapScore(signalText, snippet);

  const fundTerms = fundNameTerms(input.fund, signal);
  const sourceDomain = domainFromUrl(sourceUrl || evidenceUrl);
  const fundDomain = domainFromUrl(input.fund?.officialUrl);
  const domainAligned = domainsLikelySame(sourceDomain, fundDomain);
  const evidencePath = sourcePathname(sourceUrl || evidenceUrl);
  const vcContext = hasVcContext(contextText);
  const vcEventContext = hasVcEventContext(contextText);
  const marketContext = hasMarketContext(contextText);
  const ambiguousFundTermDetected = fundTerms.some((term) => requiresExplicitVcContext(term));
  const ambiguousFundMismatch = ambiguousFundTermDetected && !domainAligned && !vcContext;
  const likelyProfileSource = PROFILE_SOURCE_PATH_PATTERN.test(evidencePath) && !vcEventContext;
  let fundMentionScore = fundTerms.length
    ? Math.max(...fundTerms.map((term) => phraseMentionScore(term, sourceText || snippet || signalText)), 0)
    : tokenOverlapScore(signalText, sourceText || snippet);
  if (ambiguousFundMismatch) {
    fundMentionScore = Math.min(fundMentionScore, 0.12);
  }

  const hasValidEvidenceUrl = isHttpUrl(evidenceUrl) && !evidenceUrl.includes("fundgraph.local") && !evidenceUrl.includes("example.com");
  const citationMatchScore = clamp(
    sourceJoinScore * 0.45 + snippetOverlapScore * 0.4 + (hasValidEvidenceUrl ? 1 : 0) * 0.15,
    0,
    1
  );
  const alignmentScore = clamp(fundMentionScore * 0.65 + claimOverlapScore * 0.35, 0, 1);

  const qualityReasons: string[] = [];
  const hasHardScrapeNoise =
    hasHardScrapeNoiseText(hardNoiseText) || HARD_SCRAPE_NOISE_PATTERNS.some((pattern) => pattern.test(hardNoiseText));
  const isBoilerplate = isLikelyBoilerplateScrapeText(hardNoiseText);
  if (hasHardScrapeNoise) qualityReasons.push("navigation_or_404_scrape");
  if (isBoilerplate) qualityReasons.push("boilerplate_nav_or_address_scrape");
  if (!hasValidEvidenceUrl) qualityReasons.push("invalid_evidence_url");
  if (!sourceJoin) qualityReasons.push("source_join_missing");
  if (snippet && sourceText && snippetOverlapScore < 0.12) qualityReasons.push("snippet_not_grounded");
  if (fundMentionScore < 0.2) qualityReasons.push("fund_not_clearly_mentioned");
  if (ambiguousFundMismatch) qualityReasons.push("fund_mention_ambiguous");
  if (ambiguousFundMismatch && marketContext) qualityReasons.push("fund_context_mismatch");
  if (likelyProfileSource) qualityReasons.push("profile_page_not_news_evidence");
  if (claimOverlapScore < 0.18) qualityReasons.push("claim_not_supported_by_article_text");

  let qualityTier: SignalQualityTier = "FAILED";
  if (hasHardScrapeNoise || ambiguousFundMismatch || isBoilerplate || likelyProfileSource) {
    qualityTier = "FAILED";
  } else if (citationMatchScore >= 0.68 && alignmentScore >= 0.58 && !qualityReasons.includes("invalid_evidence_url")) {
    qualityTier = "ALIGNED";
  } else if (citationMatchScore >= 0.4 && alignmentScore >= 0.35 && !qualityReasons.includes("invalid_evidence_url")) {
    qualityTier = "WARNING";
  }

  const articleSnapshot = buildSignalArticleSnapshot({
    signal,
    source,
    fund: input.fund ?? undefined,
    claims,
    citationMatchScore,
    fundRelevanceScore: alignmentScore,
    sourceJoinScore,
    snippetOverlapScore,
    extractedAt: input.nowIso,
  });

  return {
    qualityTier,
    alignmentScore: Number(alignmentScore.toFixed(3)),
    citationMatchScore: Number(citationMatchScore.toFixed(3)),
    qualityReasons,
    articleSnapshot,
    checks: {
      hasValidEvidenceUrl,
      sourceJoin,
      sourceJoinScore: Number(sourceJoinScore.toFixed(3)),
      snippetOverlapScore: Number(snippetOverlapScore.toFixed(3)),
      fundMentionScore: Number(fundMentionScore.toFixed(3)),
      claimOverlapScore: Number(claimOverlapScore.toFixed(3)),
    },
  };
}

export function signalTierAllowsSurface(
  tier: SignalQualityTier | undefined,
  surface: "global" | "fund"
): boolean {
  if (tier === "FAILED") return false;
  if (surface === "global") return tier === "ALIGNED" || tier === "WARNING";
  return tier === "ALIGNED" || tier === "WARNING";
}
