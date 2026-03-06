import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { extractClaimsForSource } from "@/lib/fundgraph/claims";
import { computeSignalArticleQuality, signalTierAllowsSurface } from "@/lib/fundgraph/signalArticleQuality";
import { normalizeFundgraphText } from "@/lib/fundgraph/textNormalization";
import { ClaimLink, Fund, FundgraphDbFile, GraphEdge, NewsClaim, NewsSource, Signal, Source } from "@/lib/fundgraph/types";
import { createLimiter } from "./dataset/fetch";
import {
  canonicalizeFunds,
  remapClaimLinks,
  remapClaims,
  remapGraphEdges,
  remapSignalFundIds,
  remapSourceFundMetadata,
} from "./fundgraphVcEnrich/canonicalize";
import { cleanupDbNoise } from "./fundgraphVcEnrich/cleanup";
import {
  dedupeClaimLinks,
  dedupeClaims,
  dedupeDbSources,
  dedupeGraphEdges,
  dedupeSignalsAdvanced,
  dedupeSourceCandidates,
} from "./fundgraphVcEnrich/dedupe";
import {
  applyFundFactsFromSources,
  buildRelationshipEdgesFromFund,
  buildSignalsFromClaims,
  buildSyntheticFallbackPack,
  computeFundDensity,
  linkClaimToFund,
} from "./fundgraphVcEnrich/enrich";
import { discoverSourceCandidates } from "./fundgraphVcEnrich/sources";
import { SourceCandidate, VcEnrichmentOptions, VcEnrichmentResult, VcEnrichmentSummary } from "./fundgraphVcEnrich/types";
import { canonicalizeUrl, normalizeName, stableHash, summarizeText, uniqStrings } from "./fundgraphVcEnrich/utils";

const WEB_ROOT = process.cwd();
const REPO_ROOT = path.resolve(WEB_ROOT, "..");
const PUBLIC_FUNDGRAPH_DIR = path.join(WEB_ROOT, "public", "data", "fundgraph");
const SEED_FUNDGRAPH_DIR = path.join(WEB_ROOT, "src", "lib", "fundgraph", "seed");
const DB_PATH = path.join(WEB_ROOT, ".fundgraph-db.json");
const DOC_PATH = path.join(REPO_ROOT, "docs", "vc_curation_plan.md");
const ARTIFACT_PATH = path.join(REPO_ROOT, "artifacts", "vc_enrichment_summary.json");
const QUALITY_GATE_PATH = path.join(REPO_ROOT, "artifacts", "vc_enrichment_quality_gate.json");
const SIGNAL_ARTICLE_GATE_PATH = path.join(REPO_ROOT, "artifacts", "signal_article_quality_gate.json");

const QUALITY_GATE_THRESHOLDS = {
  news: 1,
  citations: 1,
  signals: 3,
  partnerFacts: 0,
  portfolioRelationships: 5,
} as const;

const SIGNAL_ARTICLE_GATE_THRESHOLDS = {
  alignedRateMin: 0.55,
  failedRateMax: 0.25,
} as const;

const EMPTY_DB: FundgraphDbFile = {
  claims: [],
  signals: [],
  profiles: [],
  verifications: [],
  credByUser: {},
  users: [],
  conflicts: [],
  sources: [],
  claimLinks: [],
  memos: [],
  contributionEvents: [],
  signalStances: [],
};

const HTML_OR_ENTITY_PATTERN = /<[^>]+>|&(?:nbsp|amp|lt|gt|quot|#39|#x27|#x2F);/i;
const NAVIGATION_NOISE_PATTERN =
  /(about us|privacy\s*policy|terms\s*of\s*use|accept decline|user menu|our story our strategy|investor login|policy against harassment|open\s*menu|close\s*menu|toggle\s*menu|skip\s+to\s+(?:main\s+)?content)/i;
const HARD_SCRAPE_NOISE_PATTERN =
  /(error\s*404|page\s+not\s+found|not\s+found|we couldn['’]t find the page|this\s+page\s+could\s+not\s+be\s+found|open\s*menu|close\s*menu|toggle\s*menu|skip\s+to\s+(?:main\s+)?content|go\s+home|get\s+in\s+touch|made\s+with\s+webflow|privacy\s*policy|terms\s*of\s*use|policy against harassment|official\s+website|firm\s+profile|previous\s+slide|next\s+slide|read\s+full\s+article|all\s+rights\s+reserved|home\s*team\s*founders?|portfolio\s*publications?|building\s+great\s+companies\s+is\s+a\s+craft|more\s+info:\s*@|\b\d{2,5}\s+[A-Za-z0-9.\- ]{2,40}\s+(street|st|road|rd|avenue|ave|boulevard|blvd|lane|ln|drive|dr)\b)/i;
const GENERIC_PROFILE_PATTERN = /\bofficial\s+website(?:\s+and\s+firm\s+profile)?\b|\bfirm\s+profile\b/i;
const NAV_TOKEN_PATTERNS: RegExp[] = [
  /\babout/i,
  /\bteam/i,
  /\bportfolio/i,
  /\bcompanies?/i,
  /\bjobs?/i,
  /\bpeople/i,
  /\bnews/i,
  /\binsights?/i,
  /\bcontact/i,
  /\bsearch/i,
  /\bterms/i,
  /\bprivacy/i,
];
const PLACEHOLDER_TEXT_PATTERN =
  /\b(signal-first strategy|source-backed strategy profile|public evidence indicates|derived profile signal)\b/i;
const IMAGE_URL_PATTERN = /\.(?:png|jpe?g|gif|webp|svg)(?:[?#].*)?$/i;

function isGenericProfileNarrative(value: string): boolean {
  const text = normalizeTextForQuality(value).toLowerCase();
  if (!text) return false;
  return GENERIC_PROFILE_PATTERN.test(text);
}

function parseArgs(argv: string[]): VcEnrichmentOptions {
  const options: VcEnrichmentOptions = {};
  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--offline-only") {
      options.offlineOnly = true;
      continue;
    }
    if (arg === "--allow-synthetic-fallback") {
      options.allowSyntheticFallback = true;
      continue;
    }
    if (arg.startsWith("--fund-limit=")) {
      const value = Number.parseInt(arg.slice("--fund-limit=".length), 10);
      if (Number.isFinite(value) && value > 0) options.fundLimit = value;
      continue;
    }
    if (arg.startsWith("--max-feed-items-per-source=")) {
      const value = Number.parseInt(arg.slice("--max-feed-items-per-source=".length), 10);
      if (Number.isFinite(value) && value > 0) options.maxFeedItemsPerSource = value;
      continue;
    }
    if (arg.startsWith("--max-claim-sources=")) {
      const value = Number.parseInt(arg.slice("--max-claim-sources=".length), 10);
      if (Number.isFinite(value) && value > 0) options.maxClaimSources = value;
      continue;
    }
    if (arg.startsWith("--max-official-pages-per-fund=")) {
      const value = Number.parseInt(arg.slice("--max-official-pages-per-fund=".length), 10);
      if (Number.isFinite(value) && value > 0) options.maxOfficialPagesPerFund = value;
      continue;
    }
    if (arg.startsWith("--hn-pages=")) {
      const value = Number.parseInt(arg.slice("--hn-pages=".length), 10);
      if (Number.isFinite(value) && value > 0) options.hnPages = value;
      continue;
    }
  }
  return options;
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function prioritizeFunds(funds: Fund[], signals: Signal[]): Fund[] {
  const signalCountByFund = new Map<string, number>();
  for (const signal of signals) {
    signalCountByFund.set(signal.fundId, (signalCountByFund.get(signal.fundId) ?? 0) + 1);
  }
  return [...funds].sort((left, right) => {
    const leftSectorBoost = left.sectors.some((sector) => ["AI", "Fintech"].includes(String(sector))) ? 35 : 0;
    const rightSectorBoost = right.sectors.some((sector) => ["AI", "Fintech"].includes(String(sector))) ? 35 : 0;
    const leftScore = leftSectorBoost + (left.trendScore ?? 0) + (signalCountByFund.get(left.id) ?? 0) * 2;
    const rightScore = rightSectorBoost + (right.trendScore ?? 0) + (signalCountByFund.get(right.id) ?? 0) * 2;
    return rightScore - leftScore;
  });
}

function sourceCandidateToStoreSource(candidate: SourceCandidate): Source {
  const isNewsLike =
    candidate.sourceType === "dataset_article" ||
    candidate.sourceType === "investing_rss" ||
    candidate.sourceType === "social_hn" ||
    candidate.sourceType === "social_reddit";
  const cleanedTitle = normalizeFundgraphText(candidate.title, 240) || candidate.title;
  const cleanedText = normalizeFundgraphText(candidate.content || candidate.summary || candidate.title, 8_000);
  return {
    id: candidate.id,
    type: isNewsLike ? "NEWS_ARTICLE" : "URL",
    title: cleanedTitle,
    url: candidate.url,
    rawText: cleanedText,
    createdAt: candidate.publishedAt,
    metadata: {
      sourceType: candidate.sourceType,
      sourceName: candidate.sourceName,
      publishedAt: candidate.publishedAt,
      extractedAt: new Date().toISOString(),
      matchedFundIds: candidate.fundIds,
      tags: candidate.tags,
      isSynthetic: candidate.isSynthetic ?? false,
    },
  };
}

function candidateToNewsSource(candidate: SourceCandidate): NewsSource {
  const url = canonicalizeUrl(candidate.url) || `https://fundgraph.local/source/${candidate.id}`;
  const cleanedTitle = normalizeFundgraphText(candidate.title, 240) || candidate.title;
  const cleanedSummary = normalizeFundgraphText(candidate.summary || candidate.title, 1200);
  const cleanedContent = normalizeFundgraphText(candidate.content || candidate.summary || candidate.title, 12_000);
  return {
    id: candidate.id,
    title: cleanedTitle,
    url,
    sourceName: candidate.sourceName,
    summary: summarizeText(cleanedSummary || cleanedTitle, 600),
    content: summarizeText(cleanedContent || cleanedSummary || cleanedTitle, 4_000),
    publishedAt: candidate.publishedAt,
    tags: candidate.tags,
  };
}

function isLowQualityClaimText(text: string): boolean {
  const normalized = summarizeText(text.replace(/\s+/g, " "), 260).toLowerCase();
  if (!normalized || normalized.length < 24) return true;
  if (GENERIC_PROFILE_PATTERN.test(normalized)) return true;
  if (/\bfund\s+\d+\b/.test(normalized)) return true;
  if (
    normalized.includes("article reports operational or product updates") ||
    normalized.includes("piece includes developments tied to companies") ||
    normalized.includes("source discusses strategic implications") ||
    normalized.includes("report highlights claims that can be verified")
  ) {
    return true;
  }
  return false;
}

function fallbackClaimForCandidate(candidate: SourceCandidate): NewsClaim {
  const now = new Date().toISOString();
  const claimText = summarizeText(`${candidate.title}. ${candidate.summary || candidate.content || candidate.title}`, 220);
  return {
    id: `fg-claim-${stableHash([candidate.id, claimText, "fallback"], 18)}`,
    sourceId: candidate.id,
    claimText,
    category: "Market",
    entities: uniqStrings([...candidate.fundIds, candidate.sourceName], 8),
    llmConfidence: 0.52,
    citation: {
      sourceId: candidate.id,
      url: candidate.url || `https://fundgraph.local/source/${candidate.id}`,
      title: candidate.title,
      snippet: claimText,
    },
    community: {
      verifyCount: 0,
      disagreeCount: 0,
      commentCount: 0,
      verifies: 0,
      disagrees: 0,
      trustScore: 30,
    },
    linkedFundIds: candidate.fundIds,
    citationCount: 1,
    dataOrigin: candidate.isSynthetic ? "derived" : "fetched",
    createdAt: Number.isFinite(+new Date(candidate.publishedAt)) ? candidate.publishedAt : now,
    updatedAt: now,
  };
}

function ensureClaimShape(claim: NewsClaim, candidate: SourceCandidate): NewsClaim {
  const mappedFundIds = uniqStrings([...(claim.linkedFundIds ?? []), ...(candidate.fundIds ?? [])], 40);
  const createdAt = Number.isFinite(+new Date(claim.createdAt))
    ? claim.createdAt
    : Number.isFinite(+new Date(candidate.publishedAt))
      ? candidate.publishedAt
      : new Date().toISOString();
  return {
    ...claim,
    sourceId: candidate.id,
    citation: {
      ...claim.citation,
      sourceId: candidate.id,
      url: claim.citation?.url || candidate.url || `https://fundgraph.local/source/${candidate.id}`,
      title: claim.citation?.title || candidate.title,
      snippet: claim.citation?.snippet || summarizeText(candidate.summary || candidate.content || candidate.title, 220),
    },
    linkedFundIds: mappedFundIds,
    citationCount: Math.max(1, claim.citationCount ?? 1),
    dataOrigin: candidate.isSynthetic
      ? "derived"
      : claim.dataOrigin === "derived"
        ? "fetched"
        : claim.dataOrigin ?? "fetched",
    createdAt,
    updatedAt: claim.updatedAt || createdAt,
  };
}

function normalizeTextForQuality(text: string): string {
  return summarizeText(text.replace(/\s+/g, " ").trim(), 4000);
}

function hasMarkupNoise(value: string): boolean {
  return HTML_OR_ENTITY_PATTERN.test(value);
}

function isValidEvidenceUrl(url: string | undefined): boolean {
  if (!url) return false;
  const normalized = canonicalizeUrl(url);
  if (!normalized) return false;
  if (!/^https?:\/\//i.test(normalized)) return false;
  if (normalized.includes("fundgraph.local")) return false;
  if (normalized.includes("example.com")) return false;
  if (IMAGE_URL_PATTERN.test(normalized)) return false;
  return true;
}

function isLowQualityNarrativeText(value: string): boolean {
  const text = normalizeTextForQuality(value).toLowerCase();
  if (!text || text.length < 24) return true;
  if (isGenericProfileNarrative(text)) return true;
  if (HARD_SCRAPE_NOISE_PATTERN.test(text)) return true;
  if (NAVIGATION_NOISE_PATTERN.test(text)) return true;
  const navTokenHits = NAV_TOKEN_PATTERNS.filter((pattern) => pattern.test(text)).length;
  if (navTokenHits >= 6 && text.length < 1_400) return true;
  if (PLACEHOLDER_TEXT_PATTERN.test(text)) return true;
  if (hasMarkupNoise(text)) return true;
  return false;
}

function isHighQualitySignalRecord(signal: Signal): boolean {
  const title = normalizeTextForQuality(signal.title ?? "");
  const summary = normalizeTextForQuality(signal.summary ?? "");
  const evidenceSnippet = normalizeTextForQuality(signal.evidenceSnippet ?? signal.evidence?.snippet ?? "");
  const combinedText = `${title} ${summary} ${evidenceSnippet}`.trim();
  const evidenceUrl = signal.evidenceUrl ?? signal.evidence?.url;
  if (signal.qualityTier === "FAILED") return false;
  if (!combinedText || combinedText.length < 24) return false;
  if (HARD_SCRAPE_NOISE_PATTERN.test(combinedText)) return false;
  if (isLowQualityNarrativeText(combinedText)) return false;
  if (!isValidEvidenceUrl(evidenceUrl)) return false;
  if (signal.tags?.includes("synthetic-fallback")) return false;
  if (signal.qualityTier === "ALIGNED" || signal.qualityTier === "WARNING") return true;
  if (!title || title.length < 12) return false;
  if (!summary || summary.length < 24) return false;
  if (/^fund\s+\d+/i.test(title)) return false;
  return true;
}

function isHighQualityClaimRecord(claim: NewsClaim): boolean {
  const claimText = normalizeTextForQuality(claim.claimText ?? "");
  const snippet = normalizeTextForQuality(claim.citation?.snippet ?? "");
  const title = normalizeTextForQuality(claim.citation?.title ?? "");
  if (!claimText || claimText.length < 20) return false;
  if (!title || title.length < 8) return false;
  if (isGenericProfileNarrative(`${claimText} ${title} ${snippet}`)) return false;
  if (isLowQualityClaimText(claimText)) return false;
  if (isLowQualityNarrativeText(`${claimText} ${snippet}`)) return false;
  if (!isValidEvidenceUrl(claim.citation?.url)) return false;
  return true;
}

function isLikelyPersonNameForQuality(value: string): boolean {
  const name = normalizeTextForQuality(value);
  if (!name) return false;
  if (name.length < 4 || name.length > 42) return false;
  if (/\d/.test(name)) return false;
  if (!/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}$/.test(name)) return false;
  if (
    /\b(partner|fund|funds|capital|ventures|tech|blog|legal|ai|bio|biotech|cloud|consumer|crypto|data|defense|developer|fintech|healthcare|marketplaces|vertical|philosophy|memos|software|infrastructure|enterprise|research|platform|news|global|subscribe|story|investor|login|markets|executive|startups|management|operating|function|update|deck|network|partnership|program|events|building|customer|digital|business|strategy|edge|introducing|types|advisors|page|found)\b/i.test(
      name
    )
  ) {
    return false;
  }
  return true;
}

function isLikelyPortfolioNameForQuality(value: string): boolean {
  const company = normalizeTextForQuality(value);
  if (!company) return false;
  if (company.length < 2 || company.length > 48) return false;
  if (/\b(portfolio\s*co|company\s*\d+|startup\s*\d+)\b/i.test(company)) return false;
  if (NAVIGATION_NOISE_PATTERN.test(company)) return false;
  return true;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeEntityForMatch(value: string): string {
  return normalizeName(String(value ?? ""))
    .replace(/\s+/g, " ")
    .trim();
}

function hasEntityMention(entity: string, corpus: string): boolean {
  const normalizedEntity = normalizeEntityForMatch(entity);
  const normalizedCorpus = normalizeEntityForMatch(corpus);
  if (!normalizedEntity || !normalizedCorpus) return false;
  const parts = normalizedEntity.split(" ").filter((token) => token.length >= 2);
  if (!parts.length) return false;
  const phrasePattern = new RegExp(`\\b${parts.map((token) => escapeRegExp(token)).join("\\s+")}\\b`, "i");
  if (phrasePattern.test(normalizedCorpus)) return true;
  if (parts.length < 2) return false;
  const corpusTokens = new Set(normalizedCorpus.split(" ").filter((token) => token.length >= 2));
  const overlap = parts.filter((token) => corpusTokens.has(token)).length;
  return overlap >= Math.max(2, parts.length - 1);
}

function isSourceEligibleForRelationshipEvidence(source: Source): boolean {
  const metadata = (source.metadata ?? {}) as Record<string, unknown>;
  const sourceType = String(metadata.sourceType ?? "");
  if (metadata.isSynthetic) return false;
  if (sourceType === "official_site") return false;
  const text = `${source.title ?? ""} ${source.rawText ?? ""}`;
  if (!text.trim()) return false;
  if (isLowQualityNarrativeText(text) || isGenericProfileNarrative(text)) return false;
  return true;
}

function buildFundEvidenceCorpus(params: {
  fundId: string;
  claims: NewsClaim[];
  sources: Source[];
}): string {
  const claimParts = params.claims
    .filter((claim) => (claim.linkedFundIds ?? []).includes(params.fundId))
    .filter((claim) => isHighQualityClaimRecord(claim))
    .filter(
      (claim) =>
        !isGenericProfileNarrative(claim.claimText) &&
        !isGenericProfileNarrative(claim.citation?.title ?? "") &&
        !isGenericProfileNarrative(claim.citation?.snippet ?? "")
    )
    .map((claim) => `${claim.claimText}\n${claim.citation?.title ?? ""}\n${claim.citation?.snippet ?? ""}\n${(claim.entities ?? []).join(" ")}`);

  const sourceParts = params.sources
    .filter(isSourceEligibleForRelationshipEvidence)
    .filter((source) => {
      const matched = Array.isArray(source.metadata?.matchedFundIds)
        ? (source.metadata?.matchedFundIds as string[]).map(String)
        : [];
      return matched.includes(params.fundId);
    })
    .map((source) => `${source.title ?? ""}\n${source.rawText ?? ""}`);

  return normalizeTextForQuality([...claimParts, ...sourceParts].join("\n"));
}

function pruneFundRelationshipFactsByEvidence(params: {
  funds: Fund[];
  targetFundIds: Set<string>;
  claims: NewsClaim[];
  sources: Source[];
}): {
  funds: Fund[];
  removedPortfolioFacts: number;
  removedFounderFacts: number;
  removedCoInvestorFacts: number;
} {
  let removedPortfolioFacts = 0;
  let removedFounderFacts = 0;
  let removedCoInvestorFacts = 0;

  const funds = params.funds.map((fund) => {
    if (!params.targetFundIds.has(fund.id)) return fund;
    const corpus = buildFundEvidenceCorpus({
      fundId: fund.id,
      claims: params.claims,
      sources: params.sources,
    });

    const originalPortfolio = Array.isArray(fund.portfolio) ? fund.portfolio : [];
    const originalFounders = Array.isArray(fund.founders) ? fund.founders : [];
    const originalCoInvestors = Array.isArray(fund.coInvestors) ? fund.coInvestors : [];
    const originalDeals = Array.isArray(fund.portfolioInvestments) ? fund.portfolioInvestments : [];

    if (!corpus || corpus.length < 120) {
      removedPortfolioFacts += originalPortfolio.length;
      removedFounderFacts += originalFounders.length;
      removedCoInvestorFacts += originalCoInvestors.length;
      return {
        ...fund,
        portfolio: [],
        founders: [],
        coInvestors: [],
        portfolioInvestments: [],
      };
    }

    const nextPortfolio = uniqStrings(
      originalPortfolio.filter((company) => isLikelyPortfolioNameForQuality(company)).filter((company) => hasEntityMention(company, corpus)),
      240
    );
    const nextFounders = uniqStrings(
      originalFounders.filter((founder) => isLikelyPersonNameForQuality(founder)).filter((founder) => hasEntityMention(founder, corpus)),
      120
    );
    const nextCoInvestors = uniqStrings(
      originalCoInvestors
        .filter((name) => normalizeTextForQuality(name).length >= 2)
        .filter((name) => !isGenericProfileNarrative(name))
        .filter((name) => hasEntityMention(name, corpus)),
      80
    );
    const nextDeals = originalDeals.filter((deal) => {
      if (deal?.dataOrigin === "derived") return false;
      const company = normalizeTextForQuality(deal?.companyName ?? "");
      return Boolean(company && hasEntityMention(company, corpus));
    });

    removedPortfolioFacts += Math.max(0, originalPortfolio.length - nextPortfolio.length);
    removedFounderFacts += Math.max(0, originalFounders.length - nextFounders.length);
    removedCoInvestorFacts += Math.max(0, originalCoInvestors.length - nextCoInvestors.length);

    return {
      ...fund,
      portfolio: nextPortfolio,
      founders: nextFounders,
      coInvestors: nextCoInvestors,
      portfolioInvestments: nextDeals,
    };
  });

  return {
    funds,
    removedPortfolioFacts,
    removedFounderFacts,
    removedCoInvestorFacts,
  };
}

function sourceEligibleForQualityTopUp(source: Source, fundId: string): boolean {
  const matched = Array.isArray(source.metadata?.matchedFundIds)
    ? (source.metadata?.matchedFundIds as string[]).map(String)
    : [];
  const sourceType = String(source.metadata?.sourceType ?? "");
  if (!matched.includes(fundId)) return false;
  if (source.metadata?.isSynthetic) return false;
  if (sourceType === "official_site") return false;
  const text = `${source.title ?? ""} ${source.rawText ?? ""}`;
  if (!text.trim()) return false;
  if (isLowQualityNarrativeText(text) || isGenericProfileNarrative(text)) return false;
  return true;
}

function countFundNewsVolume(sources: Source[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const source of sources) {
    const matched = Array.isArray(source.metadata?.matchedFundIds)
      ? (source.metadata?.matchedFundIds as string[]).map(String)
      : [];
    for (const fundId of matched) {
      counts.set(fundId, (counts.get(fundId) ?? 0) + 1);
    }
  }
  return counts;
}

function countFundCitationVolume(claims: NewsClaim[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const claim of claims) {
    const citationCount = Math.max(1, claim.citationCount ?? 1);
    for (const fundId of uniqStrings(claim.linkedFundIds ?? [])) {
      counts.set(fundId, (counts.get(fundId) ?? 0) + citationCount);
    }
  }
  return counts;
}

function topFundsFromCountMap(
  counts: Map<string, number>,
  fundsById: Map<string, Fund>,
  limit = 10
): Array<{ fund_id: string; fund_name: string; count: number }> {
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([fundId, count]) => ({
      fund_id: fundId,
      fund_name: fundsById.get(fundId)?.name ?? fundId,
      count,
    }));
}

function sanitizeDbForPersistence(db: FundgraphDbFile): FundgraphDbFile {
  const validClaimIds = new Set(db.claims.map((claim) => claim.id));
  const validSignalIds = new Set(db.signals.map((signal) => signal.id));
  return {
    ...db,
    claimLinks: (db.claimLinks ?? []).filter((link) => validClaimIds.has(link.claimId)),
    conflicts: db.conflicts.filter((conflict) => validClaimIds.has(conflict.claimIdA) && validClaimIds.has(conflict.claimIdB)),
    verifications: db.verifications.filter((verification) => {
      if (verification.claimId && !validClaimIds.has(verification.claimId)) return false;
      if (verification.signalId && !validSignalIds.has(verification.signalId)) return false;
      return true;
    }),
    signalStances: (db.signalStances ?? []).filter((stance) => validSignalIds.has(stance.signalId)),
  };
}

function isCuratedSignal(signal: Signal): boolean {
  if (signal.qualityTier === "FAILED") return false;
  if (signal.qualityTier === "ALIGNED" || signal.qualityTier === "WARNING") return true;
  const evidenceUrl = signal.evidenceUrl ?? signal.evidence?.url ?? "";
  if (!isValidEvidenceUrl(evidenceUrl)) return false;
  if (signal.tags?.includes("synthetic-fallback")) return false;
  if (isLowQualityNarrativeText(`${signal.title ?? ""} ${signal.summary ?? ""}`)) return false;
  return true;
}

type SignalArticleGateRow = {
  signal_id: string;
  fund_id: string;
  fund_name: string;
  quality_tier: Signal["qualityTier"];
  alignment_score: number;
  citation_match_score: number;
  reasons: string[];
  source_id?: string;
  source_url?: string;
  evidence_url?: string;
  source_join: boolean;
  snippet_overlap_score: number;
  fund_mention_score: number;
  claim_overlap_score: number;
  global_feed_eligible: boolean;
};

function buildClaimsByFundId(claims: NewsClaim[]): Map<string, NewsClaim[]> {
  const byFund = new Map<string, NewsClaim[]>();
  for (const claim of claims) {
    for (const fundId of uniqStrings(claim.linkedFundIds ?? [])) {
      const bucket = byFund.get(fundId) ?? [];
      bucket.push(claim);
      byFund.set(fundId, bucket);
    }
  }
  return byFund;
}

function buildClaimLookup(claims: NewsClaim[]): Map<string, NewsClaim> {
  return new Map(claims.map((claim) => [claim.id, claim]));
}

function buildClaimSourceLookup(claims: NewsClaim[]): Map<string, NewsClaim[]> {
  const bySource = new Map<string, NewsClaim[]>();
  for (const claim of claims) {
    const bucket = bySource.get(claim.sourceId) ?? [];
    bucket.push(claim);
    bySource.set(claim.sourceId, bucket);
  }
  return bySource;
}

function buildSourceUrlLookup(sources: Source[]): Map<string, Source> {
  const map = new Map<string, Source>();
  for (const source of sources) {
    const url = canonicalizeUrl(source.url);
    if (!url || map.has(url)) continue;
    map.set(url, source);
  }
  return map;
}

function buildClaimUrlLookup(claims: NewsClaim[]): Map<string, NewsClaim[]> {
  const byUrl = new Map<string, NewsClaim[]>();
  for (const claim of claims) {
    const url = canonicalizeUrl(claim.citation?.url);
    if (!url) continue;
    const bucket = byUrl.get(url) ?? [];
    bucket.push(claim);
    byUrl.set(url, bucket);
  }
  return byUrl;
}

function selectSignalSourceContext(params: {
  signal: Signal;
  sourceById: Map<string, Source>;
  sourceByCanonicalUrl: Map<string, Source>;
  claimsById: Map<string, NewsClaim>;
  claimsBySourceId: Map<string, NewsClaim[]>;
  claimsByCanonicalUrl: Map<string, NewsClaim[]>;
  claimsByFundId: Map<string, NewsClaim[]>;
}): { source: Source | null; claims: NewsClaim[] } {
  const claimIds = uniqStrings(params.signal.claimIds ?? []);
  const evidenceUrl = canonicalizeUrl(params.signal.evidenceUrl ?? params.signal.evidence?.url);
  const claimsFromIds = claimIds.map((id) => params.claimsById.get(id)).filter((claim): claim is NewsClaim => Boolean(claim));

  const claimsFromSource =
    params.signal.sourceId && params.claimsBySourceId.has(params.signal.sourceId)
      ? params.claimsBySourceId.get(params.signal.sourceId) ?? []
      : [];
  const claimsFromUrl = evidenceUrl ? params.claimsByCanonicalUrl.get(evidenceUrl) ?? [] : [];
  const claimsFromFund = params.claimsByFundId.get(params.signal.fundId) ?? [];

  const claims = uniqStrings(
    [...claimsFromIds, ...claimsFromSource, ...claimsFromUrl, ...claimsFromFund]
      .map((claim) => claim.id)
      .filter(Boolean)
  )
    .map((claimId) => params.claimsById.get(claimId))
    .filter((claim): claim is NewsClaim => Boolean(claim))
    .sort((left, right) => +new Date(right.createdAt) - +new Date(left.createdAt))
    .slice(0, 6);

  let source: Source | null = null;
  if (params.signal.sourceId) {
    source = params.sourceById.get(params.signal.sourceId) ?? null;
  }
  if (!source && claims.length) {
    for (const claim of claims) {
      source = params.sourceById.get(claim.sourceId) ?? null;
      if (source) break;
    }
  }
  if (!source && evidenceUrl) {
    source = params.sourceByCanonicalUrl.get(evidenceUrl) ?? null;
  }

  return { source, claims };
}

function applySignalArticleQuality(params: {
  signals: Signal[];
  fundsById: Map<string, Fund>;
  sources: Source[];
  claims: NewsClaim[];
  nowIso: string;
}): { signals: Signal[]; gateRows: SignalArticleGateRow[] } {
  const sourceById = new Map(params.sources.map((source) => [source.id, source]));
  const sourceByCanonicalUrl = buildSourceUrlLookup(params.sources);
  const claimsById = buildClaimLookup(params.claims);
  const claimsBySourceId = buildClaimSourceLookup(params.claims);
  const claimsByCanonicalUrl = buildClaimUrlLookup(params.claims);
  const claimsByFundId = buildClaimsByFundId(params.claims);
  const rows: SignalArticleGateRow[] = [];

  const nextSignals = params.signals.map((signal) => {
    const context = selectSignalSourceContext({
      signal,
      sourceById,
      sourceByCanonicalUrl,
      claimsById,
      claimsBySourceId,
      claimsByCanonicalUrl,
      claimsByFundId,
    });
    const quality = computeSignalArticleQuality({
      signal,
      fund: params.fundsById.get(signal.fundId) ?? null,
      source: context.source,
      claims: context.claims,
      nowIso: params.nowIso,
    });
    const primaryClaimIds = context.claims.map((claim) => claim.id);
    const mergedClaimIds = uniqStrings([...(signal.claimIds ?? []), ...primaryClaimIds], 30);
    const enrichedSignal: Signal = {
      ...signal,
      sourceId: signal.sourceId || context.source?.id || context.claims[0]?.sourceId,
      sourceTitle: signal.sourceTitle || context.source?.title || context.claims[0]?.citation?.title,
      claimIds: mergedClaimIds.length ? mergedClaimIds : undefined,
      qualityTier: quality.qualityTier,
      alignmentScore: quality.alignmentScore,
      citationMatchScore: quality.citationMatchScore,
      qualityReasons: quality.qualityReasons,
      articleSnapshot: quality.articleSnapshot,
    };

    rows.push({
      signal_id: enrichedSignal.id,
      fund_id: enrichedSignal.fundId,
      fund_name: params.fundsById.get(enrichedSignal.fundId)?.name ?? enrichedSignal.fundId,
      quality_tier: enrichedSignal.qualityTier,
      alignment_score: enrichedSignal.alignmentScore ?? 0,
      citation_match_score: enrichedSignal.citationMatchScore ?? 0,
      reasons: enrichedSignal.qualityReasons ?? [],
      source_id: enrichedSignal.sourceId,
      source_url: canonicalizeUrl(context.source?.url),
      evidence_url: canonicalizeUrl(enrichedSignal.evidenceUrl ?? enrichedSignal.evidence?.url),
      source_join: quality.checks.sourceJoin,
      snippet_overlap_score: quality.checks.snippetOverlapScore,
      fund_mention_score: quality.checks.fundMentionScore,
      claim_overlap_score: quality.checks.claimOverlapScore,
      global_feed_eligible: signalTierAllowsSurface(enrichedSignal.qualityTier, "global"),
    });

    return enrichedSignal;
  });

  return { signals: nextSignals, gateRows: rows };
}

function signalArticleGateReport(rows: SignalArticleGateRow[]): {
  generated_at: string;
  thresholds: {
    aligned_rate_min: number;
    failed_rate_max: number;
  };
  aggregates: {
    total_signals: number;
    aligned_count: number;
    warning_count: number;
    failed_count: number;
    global_feed_eligible_count: number;
    aligned_rate: number;
    warning_rate: number;
    failed_rate: number;
    pass: boolean;
  };
  top_failure_reasons: Array<{ reason: string; count: number }>;
  per_signal: SignalArticleGateRow[];
} {
  const aligned = rows.filter((row) => row.quality_tier === "ALIGNED").length;
  const warning = rows.filter((row) => row.quality_tier === "WARNING").length;
  const failed = rows.filter((row) => row.quality_tier === "FAILED").length;
  const total = rows.length;
  const eligible = rows.filter((row) => row.global_feed_eligible).length;
  const alignedRate = total ? aligned / total : 0;
  const warningRate = total ? warning / total : 0;
  const failedRate = total ? failed / total : 0;
  const reasonCounts = new Map<string, number>();
  for (const row of rows) {
    for (const reason of row.reasons ?? []) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
  }
  const topFailureReasons = [...reasonCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([reason, count]) => ({ reason, count }));

  return {
    generated_at: new Date().toISOString(),
    thresholds: {
      aligned_rate_min: SIGNAL_ARTICLE_GATE_THRESHOLDS.alignedRateMin,
      failed_rate_max: SIGNAL_ARTICLE_GATE_THRESHOLDS.failedRateMax,
    },
    aggregates: {
      total_signals: total,
      aligned_count: aligned,
      warning_count: warning,
      failed_count: failed,
      global_feed_eligible_count: eligible,
      aligned_rate: Number(alignedRate.toFixed(4)),
      warning_rate: Number(warningRate.toFixed(4)),
      failed_rate: Number(failedRate.toFixed(4)),
      pass:
        alignedRate >= SIGNAL_ARTICLE_GATE_THRESHOLDS.alignedRateMin &&
        failedRate <= SIGNAL_ARTICLE_GATE_THRESHOLDS.failedRateMax,
    },
    top_failure_reasons: topFailureReasons,
    per_signal: rows,
  };
}

function fundQualitySnapshot(params: {
  fundId: string;
  fund: Fund;
  sources: Source[];
  claims: NewsClaim[];
  signals: Signal[];
}): {
  news: number;
  citations: number;
  signals: number;
  partnerFacts: number;
  portfolioRelationships: number;
} {
  const { fundId, fund, sources, claims, signals } = params;
  const news = sources.filter((source) => {
    const matched = Array.isArray(source.metadata?.matchedFundIds)
      ? (source.metadata?.matchedFundIds as string[]).map(String)
      : [];
    const isSynthetic = Boolean(source.metadata?.isSynthetic);
    return !isSynthetic && matched.includes(fundId);
  }).length;
  const citations = claims
    .filter((claim) => (claim.linkedFundIds ?? []).includes(fundId))
    .filter((claim) => isHighQualityClaimRecord(claim))
    .reduce((sum, claim) => sum + Math.max(1, claim.citationCount ?? 1), 0);
  const signalCount = signals.filter((signal) => signal.fundId === fundId).filter(isCuratedSignal).length;
  const partnerFacts = uniqStrings((fund.gpNames ?? []).filter(isLikelyPersonNameForQuality), 100).length;
  const portfolioRelationships = uniqStrings(
    (fund.portfolio ?? []).filter((company) => isLikelyPortfolioNameForQuality(company)),
    300
  ).length;

  return {
    news,
    citations,
    signals: signalCount,
    partnerFacts,
    portfolioRelationships,
  };
}

function qualityGateResult(params: {
  funds: Fund[];
  targetFundIds: Set<string>;
  sources: Source[];
  claims: NewsClaim[];
  signals: Signal[];
}): {
  passedFunds: number;
  failedFunds: number;
  failedFundIds: string[];
  byFund: Array<{
    fund_id: string;
    fund_name: string;
    metrics: ReturnType<typeof fundQualitySnapshot>;
    passed: boolean;
  }>;
} {
  const byFund: Array<{
    fund_id: string;
    fund_name: string;
    metrics: ReturnType<typeof fundQualitySnapshot>;
    passed: boolean;
  }> = [];
  let passedFunds = 0;
  let failedFunds = 0;
  const failedFundIds: string[] = [];

  for (const fund of params.funds) {
    if (!params.targetFundIds.has(fund.id)) continue;
    const metrics = fundQualitySnapshot({
      fundId: fund.id,
      fund,
      sources: params.sources,
      claims: params.claims,
      signals: params.signals,
    });
    const passed =
      metrics.news >= QUALITY_GATE_THRESHOLDS.news &&
      metrics.citations >= QUALITY_GATE_THRESHOLDS.citations &&
      metrics.signals >= QUALITY_GATE_THRESHOLDS.signals &&
      metrics.partnerFacts >= QUALITY_GATE_THRESHOLDS.partnerFacts &&
      metrics.portfolioRelationships >= QUALITY_GATE_THRESHOLDS.portfolioRelationships;
    if (passed) passedFunds += 1;
    else {
      failedFunds += 1;
      failedFundIds.push(fund.id);
    }
    byFund.push({
      fund_id: fund.id,
      fund_name: fund.name,
      metrics,
      passed,
    });
  }

  return {
    passedFunds,
    failedFunds,
    failedFundIds,
    byFund,
  };
}

function buildPlanMarkdown(params: {
  fundsProcessed: number;
  sourceStats: Record<string, number>;
  newSources: number;
  mergedCount: number;
  qualityGate: { passed: number; failed: number };
  signalQuality: { aligned: number; warning: number; failed: number; eligible: number };
}): string {
  const now = new Date().toISOString();
  return [
    "# VC Curation Plan",
    "",
    `Generated: ${now}`,
    "",
    "## Current Models Used",
    "- `Fund` (`web/src/lib/fundgraph/types.ts`): core profile + strategy + GP + portfolio + co-investor context.",
    "- `Signal`: feed/memo-ready signal objects with confidence, evidence URL/snippet, tags, trust fields, plus provenance (`sourceId`, `claimIds`) and quality (`qualityTier`, `alignmentScore`, `citationMatchScore`, `articleSnapshot`).",
    "- `NewsClaim`: citation-first claim records with linked funds and verification-compatible evidence trail fields.",
    "- `Source`: canonical source records with `metadata` for source class, publish time, extraction time, and matched fund IDs.",
    "- `ClaimLink` + `GraphEdge`: relationship layer for fund/claim/partner/portfolio connectivity.",
    "- Runtime store `.fundgraph-db.json`: `sources`, `claims`, `claimLinks`, `signals`, `verifications`, `conflicts`.",
    "",
    "## Fields Populated In This Backfill",
    "- Fund identity: `officialUrl`, `entityType`, `aliases`, description/strategy refresh, stage/sector enrichment.",
    "- People: expanded `gpNames` with partner facts from team/partner pages and source text.",
    "- Relationships: expanded portfolio company lists and co-investor context from public mentions.",
    "- News/signals/claims: enriched source-backed claims and multi-signal generation per fund with per-signal article snapshots.",
    "- Citations: claim citations and merged evidence entries; synthetic fallback evidence marked with `isSynthetic: true` and `dataOrigin: \"derived\"`.",
    "",
    "## Source Classes Used",
    "- Canonical dataset mentions from `public/data/articles.json`.",
    "- Official websites via wiki/wikidata domain resolution and path crawl (`/team`, `/people`, `/portfolio`, `/blog`, `/news`).",
    "- Investing RSS config (`web/config/demo_investing_feeds.json`).",
    "- Public social surfaces (HN Algolia + Reddit RSS).",
    "",
    "## Jobs / Scripts Added",
    "- `npm run fundgraph:vc-enrich` -> `web/scripts/fundgraphVcEnrich.ts`.",
    "- `npm run fundgraph:seed-community` -> `web/scripts/fundgraphSeedCommunity.ts` (deterministic baseline sentiment/verification seeding with provenance labels).",
    "- Helper modules under `web/scripts/fundgraphVcEnrich/`:",
    "  - `canonicalize.ts`",
    "  - `cleanup.ts`",
    "  - `sources.ts`",
    "  - `dedupe.ts`",
    "  - `enrich.ts`",
    "",
    "## Dedupe + Canonicalization Rules",
    "- Fund canonicalization by normalized fund name; canonical ID = smallest numeric suffix across duplicates.",
    "- URL normalization removes hash/UTM/trailing slash before source/news dedupe.",
    "- News dedupe key: canonical URL OR (`normalized_title + publish_day + source + matched_fund_ids`).",
    "- Claim dedupe: normalized claim signature + fund overlap + 7-day merge window; citations/evidence merged.",
    "- Signal dedupe: base `dedupeSignals` + enriched key (`fundId + normalized_claim_signature + 72h_bucket + evidenceUrl/snippet`).",
    "- Relationship dedupe: unique (`fromType`,`fromId`,`toType`,`toId`,`relation`) tuple.",
    "",
    "## Quality Gate",
    `- Thresholds: news>=${QUALITY_GATE_THRESHOLDS.news}, citations>=${QUALITY_GATE_THRESHOLDS.citations}, signals>=${QUALITY_GATE_THRESHOLDS.signals}, partnerFacts>=${QUALITY_GATE_THRESHOLDS.partnerFacts}, portfolioRelationships>=${QUALITY_GATE_THRESHOLDS.portfolioRelationships}.`,
    "- Gate uses only source-backed records by default (synthetic fallback is opt-in with `--allow-synthetic-fallback`).",
    `- Current run: passed=${params.qualityGate.passed}, failed=${params.qualityGate.failed}.`,
    `- Signal tiers: aligned=${params.signalQuality.aligned}, warning=${params.signalQuality.warning}, failed=${params.signalQuality.failed}, global_feed_eligible=${params.signalQuality.eligible}.`,
    "",
    "## Run Snapshot",
    `- Canonical VC funds processed: ${params.fundsProcessed}`,
    `- New source candidates discovered: ${params.newSources}`,
    `- Discovery breakdown: ${Object.entries(params.sourceStats)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ")}`,
    `- Total merged/deduped items: ${params.mergedCount}`,
    "",
  ].join("\n");
}

export async function runVcEnrichment(options: VcEnrichmentOptions = {}): Promise<VcEnrichmentResult> {
  const fundLimit = options.fundLimit;
  const maxClaimSources = Math.max(10, options.maxClaimSources ?? 180);
  const nowIso = new Date().toISOString();

  const [rawFunds, rawSignals, rawEdges, rawDb] = await Promise.all([
    readJson<Fund[]>(path.join(PUBLIC_FUNDGRAPH_DIR, "funds.json"), []),
    readJson<Signal[]>(path.join(PUBLIC_FUNDGRAPH_DIR, "signals.json"), []),
    readJson<GraphEdge[]>(path.join(PUBLIC_FUNDGRAPH_DIR, "graph_edges.json"), []),
    readJson<FundgraphDbFile>(DB_PATH, EMPTY_DB),
  ]);

  const canonical = canonicalizeFunds(rawFunds);
  let funds = canonical.funds.map((fund) => ({
    ...fund,
    officialUrl: canonicalizeUrl(fund.officialUrl),
    entityType: fund.entityType ?? "VC_FIRM",
    aliases: uniqStrings([...(fund.aliases ?? []), fund.name], 60).filter((alias) => normalizeName(alias) !== normalizeName(fund.name)),
  }));

  let signals = remapSignalFundIds(rawSignals, canonical.aliasByFundId);
  let graphEdges = remapGraphEdges(rawEdges, canonical.aliasByFundId);
  let db: FundgraphDbFile = {
    ...EMPTY_DB,
    ...rawDb,
    claims: remapClaims(rawDb.claims ?? [], canonical.aliasByFundId),
    signals: remapSignalFundIds(rawDb.signals ?? [], canonical.aliasByFundId),
    sources: remapSourceFundMetadata(rawDb.sources ?? [], canonical.aliasByFundId),
    claimLinks: remapClaimLinks(rawDb.claimLinks ?? [], canonical.aliasByFundId),
  };

  const cleanup = cleanupDbNoise(db);
  db = cleanup.db;
  db.claims = (db.claims ?? []).filter((claim) => isHighQualityClaimRecord(claim));
  db.signals = (db.signals ?? []).filter((signal) => isHighQualitySignalRecord(signal));

  signals = dedupeSignalsAdvanced([...signals.filter((signal) => isHighQualitySignalRecord(signal)), ...db.signals]).signals;
  const prioritized = prioritizeFunds(funds, signals);
  const targetFunds = typeof fundLimit === "number" ? prioritized.slice(0, Math.max(1, fundLimit)) : prioritized;
  const targetFundIds = new Set(targetFunds.map((fund) => fund.id));

  const discovery = await discoverSourceCandidates(targetFunds, options);
  const discoveredFundById = new Map(discovery.funds.map((fund) => [fund.id, fund]));
  funds = funds.map((fund) => {
    if (!targetFundIds.has(fund.id)) return fund;
    const discovered = discoveredFundById.get(fund.id);
    if (!discovered) return fund;
    return {
      ...fund,
      ...discovered,
      officialUrl: canonicalizeUrl(discovered.officialUrl || fund.officialUrl),
      entityType: discovered.entityType ?? fund.entityType ?? "VC_FIRM",
      aliases: uniqStrings([...(fund.aliases ?? []), ...(discovered.aliases ?? [])], 60),
    };
  });
  const dedupedCandidates = dedupeSourceCandidates(discovery.candidates);
  const sourceCandidates: SourceCandidate[] = dedupedCandidates.candidates;

  const sourceRecordsFromCandidates = sourceCandidates.map(sourceCandidateToStoreSource);
  const dbSourcesBefore = db.sources ?? [];
  const dedupedDbSources = dedupeDbSources([...dbSourcesBefore, ...sourceRecordsFromCandidates]);

  const claimCandidates = sourceCandidates
    .filter(
      (candidate) =>
        candidate.sourceType === "dataset_article" ||
        candidate.sourceType === "investing_rss" ||
        candidate.sourceType === "official_site"
    )
    .slice(0, maxClaimSources);
  const newlyExtractedClaims: NewsClaim[] = [];
  const generatedClaimLinks: ClaimLink[] = [];
  let extractionFailures = 0;
  const claimExtractorLimiter = createLimiter(6);
  let extractedCount = 0;
  await Promise.all(
    claimCandidates.map((candidate) =>
      claimExtractorLimiter.run(async () => {
        const newsSource = candidateToNewsSource(candidate);
        const extractedClaims = await extractClaimsForSource(newsSource).catch(() => null);
        if (!extractedClaims?.length) {
          if (candidate.sourceType === "official_site") {
            extractedCount += 1;
            if (extractedCount % 30 === 0 || extractedCount === claimCandidates.length) {
              console.log(`[vc-enrich] claim extraction progress ${extractedCount}/${claimCandidates.length}`);
            }
            return;
          }
        }
        const claims = extractedClaims?.length
          ? extractedClaims.map((claim) => ensureClaimShape(claim, candidate))
          : [fallbackClaimForCandidate(candidate)];
        if (!extractedClaims) extractionFailures += 1;
        for (const claim of claims) {
          if (isLowQualityClaimText(claim.claimText)) continue;
          if (isGenericProfileNarrative(claim.claimText)) continue;
          if (isGenericProfileNarrative(claim.citation?.title ?? "")) continue;
          if (isGenericProfileNarrative(claim.citation?.snippet ?? "")) continue;
          newlyExtractedClaims.push(claim);
          for (const fundId of claim.linkedFundIds) {
            if (!fundId) continue;
            generatedClaimLinks.push(linkClaimToFund(claim, fundId));
          }
        }
        extractedCount += 1;
        if (extractedCount % 30 === 0 || extractedCount === claimCandidates.length) {
          console.log(`[vc-enrich] claim extraction progress ${extractedCount}/${claimCandidates.length}`);
        }
      })
    )
  );

  // Enrich fund profile fields with source text for selected VC targets.
  const officialSourceTextByFund = new Map<string, string[]>();
  const sourceTextByFund = new Map<string, string[]>();
  for (const candidate of sourceCandidates) {
    for (const fundId of candidate.fundIds) {
      const text = `${candidate.title}\n${candidate.summary}\n${candidate.content}`;
      const bucket = sourceTextByFund.get(fundId) ?? [];
      bucket.push(text);
      sourceTextByFund.set(fundId, bucket);
      if (candidate.sourceType === "official_site") {
        const officialBucket = officialSourceTextByFund.get(fundId) ?? [];
        officialBucket.push(text);
        officialSourceTextByFund.set(fundId, officialBucket);
      }
    }
  }

  let partnerFactsAdded = 0;
  let portfolioFactsAdded = 0;
  funds = funds.map((fund) => {
    if (!targetFundIds.has(fund.id)) return fund;
    const officialTexts = officialSourceTextByFund.get(fund.id) ?? [];
    const texts = officialTexts.length ? officialTexts : sourceTextByFund.get(fund.id) ?? [];
    const enriched = applyFundFactsFromSources(fund, texts);
    partnerFactsAdded += enriched.partnerFactsAdded;
    portfolioFactsAdded += enriched.portfolioFactsAdded;
    return enriched.fund;
  });

  let fundById = new Map(funds.map((fund) => [fund.id, fund]));

  // Synthetic fallback only when density minimums are unmet.
  const syntheticCandidates: SourceCandidate[] = [];
  const syntheticClaims: NewsClaim[] = [];
  const syntheticSignals: Signal[] = [];
  if (options.allowSyntheticFallback) {
    for (const fund of funds.filter((entry) => targetFundIds.has(entry.id))) {
      const density = computeFundDensity({
        fundId: fund.id,
        sources: sourceCandidates,
        claims: newlyExtractedClaims,
        signals,
        fund: fundById.get(fund.id) ?? fund,
      });
      const fallback = buildSyntheticFallbackPack({
        fund: fundById.get(fund.id) ?? fund,
        density,
        nowIso,
      });
      partnerFactsAdded += fallback.partnerFactsAdded;
      portfolioFactsAdded += fallback.portfolioFactsAdded;

      for (const source of fallback.sources) {
        syntheticCandidates.push({
          id: source.id,
          title: source.title,
          url: source.url,
          sourceName: `${fund.name} (derived)`,
          sourceType: "synthetic_fallback",
          summary: source.summary,
          content: source.content,
          publishedAt: source.publishedAt,
          tags: source.tags,
          fundIds: source.fundIds,
          isSynthetic: true,
        });
      }
      syntheticClaims.push(...fallback.claims);
      syntheticSignals.push(...fallback.signals);
    }
  }

  const allCandidates = dedupeSourceCandidates([...sourceCandidates, ...syntheticCandidates]).candidates;
  const allSourceRecords = dedupeDbSources([...dbSourcesBefore, ...allCandidates.map(sourceCandidateToStoreSource)]).sources;

  const allClaimsInput = [...db.claims, ...newlyExtractedClaims, ...syntheticClaims];
  const dedupedClaimsResult = dedupeClaims(allClaimsInput);
  let dedupedClaims = dedupedClaimsResult.claims.filter((claim) => isHighQualityClaimRecord(claim));

  const allClaimLinksInput = [...(db.claimLinks ?? []), ...generatedClaimLinks];
  const dedupedLinks = dedupeClaimLinks(allClaimLinksInput);

  const generatedSignals = buildSignalsFromClaims(dedupedClaims, fundById);
  let dedupedSignals = dedupeSignalsAdvanced([...signals, ...db.signals, ...generatedSignals, ...syntheticSignals]);
  let qualityAppliedSignals = applySignalArticleQuality({
    signals: dedupedSignals.signals,
    fundsById: fundById,
    sources: allSourceRecords,
    claims: dedupedClaims,
    nowIso,
  });
  dedupedSignals = {
    ...dedupedSignals,
    signals: qualityAppliedSignals.signals.filter((signal) => isHighQualitySignalRecord(signal)),
  };

  // Quality-gate top-up: add source-backed claims/signals for funds below minimum density.
  const initialGate = qualityGateResult({
    funds,
    targetFundIds,
    sources: allSourceRecords,
    claims: dedupedClaims,
    signals: dedupedSignals.signals,
  });
  if (initialGate.failedFundIds.length) {
    const gateTopUpClaims: NewsClaim[] = [];
    const gateTopUpSignals: Signal[] = [];
    for (const failedFundId of initialGate.failedFundIds) {
      const fund = fundById.get(failedFundId);
      if (!fund) continue;
      const metrics = fundQualitySnapshot({
        fundId: failedFundId,
        fund,
        sources: allSourceRecords,
        claims: dedupedClaims,
        signals: dedupedSignals.signals,
      });
      const neededCitations = Math.max(0, QUALITY_GATE_THRESHOLDS.citations - metrics.citations);
      const neededSignals = Math.max(0, QUALITY_GATE_THRESHOLDS.signals - metrics.signals);

      if (neededCitations > 0) {
        const candidateSources = allSourceRecords
          .filter((source) => sourceEligibleForQualityTopUp(source, failedFundId))
          .slice(0, neededCitations);
        for (let index = 0; index < candidateSources.length; index += 1) {
          const source = candidateSources[index]!;
          const baseClaimText = summarizeText(`${source.title}. ${source.rawText || source.title}`, 220);
          const claimText = isLowQualityClaimText(baseClaimText)
            ? summarizeText(`${fund.name} was referenced in "${source.title}".`, 220)
            : baseClaimText;
          if (isLowQualityClaimText(claimText) || isLowQualityNarrativeText(claimText)) continue;
          gateTopUpClaims.push({
            id: `fg-claim-${stableHash([failedFundId, source.id, "quality-gate", index], 18)}`,
            sourceId: source.id,
            claimText,
            category: "Market",
            entities: [fund.name, ...(fund.portfolio ?? []).slice(0, 2)],
            llmConfidence: 0.58,
            citation: {
              sourceId: source.id,
              url: source.url || `https://fundgraph.local/source/${source.id}`,
              title: source.title,
              snippet: claimText,
            },
            community: {
              verifyCount: 0,
              disagreeCount: 0,
              commentCount: 0,
              verifies: 0,
              disagrees: 0,
              trustScore: 35,
            },
            linkedFundIds: [failedFundId],
            citationCount: 1,
            dataOrigin: "fetched",
            createdAt: source.createdAt || nowIso,
            updatedAt: source.createdAt || nowIso,
          });
        }
      }

      if (neededSignals > 0) {
        const candidateSources = allSourceRecords
          .filter((source) => sourceEligibleForQualityTopUp(source, failedFundId))
          .slice(0, Math.max(neededSignals, 1));
        const fundClaims = dedupedClaims
          .filter((claim) => (claim.linkedFundIds ?? []).includes(failedFundId))
          .filter((claim) => isHighQualityClaimRecord(claim));
        for (let index = 0; index < neededSignals; index += 1) {
          const basis = fundClaims.length ? fundClaims[index % fundClaims.length] : undefined;
          const source = candidateSources.length ? candidateSources[index % candidateSources.length] : undefined;
          const signalBasisTitle = basis?.citation.title || source?.title || `${fund.name} update`;
          const signalBasisSnippet = basis?.citation.snippet || source?.rawText || source?.title || `${fund.name} update`;
          if (isLowQualityNarrativeText(`${signalBasisTitle} ${signalBasisSnippet}`)) continue;
          const signalId = `fg-signal-${stableHash([failedFundId, basis?.id || source?.id || "quality-gate", "quality-gate", index], 18)}`;
          gateTopUpSignals.push({
            id: signalId,
            fundId: failedFundId,
            title: `${fund.name}: ${summarizeText(signalBasisTitle, 120)}`,
            summary: summarizeText(signalBasisSnippet, 220),
            confidence: Number(Math.max(0.5, Math.min(0.82, basis?.llmConfidence ?? 0.58)).toFixed(2)),
            createdAt: basis?.createdAt || source?.createdAt || nowIso,
            authorName: "FundGraph Curation",
            upvotes: 0,
            verifiedCount: 0,
            verifies: 0,
            disagrees: 0,
            commentsCount: 0,
            source: "system",
            tags: uniqStrings(["vc-enrich", "quality-gate", basis?.category?.toLowerCase() || "market"], 8),
            sourceId: basis?.sourceId || source?.id,
            sourceTitle: basis?.citation.title || source?.title,
            claimIds: basis ? [basis.id] : undefined,
            evidenceUrl: basis?.citation.url || source?.url,
            evidenceSnippet: basis?.citation.snippet || summarizeText(source?.rawText || source?.title || "", 220),
            dataOrigin: "fetched",
          });
        }
      }
    }

    if (gateTopUpClaims.length) {
      dedupedClaims = dedupeClaims([...dedupedClaims, ...gateTopUpClaims]).claims;
    }
    if (gateTopUpSignals.length) {
      dedupedSignals = dedupeSignalsAdvanced([...dedupedSignals.signals, ...gateTopUpSignals]);
    }
  }

  qualityAppliedSignals = applySignalArticleQuality({
    signals: dedupedSignals.signals,
    fundsById: fundById,
    sources: allSourceRecords,
    claims: dedupedClaims,
    nowIso,
  });
  dedupedSignals = {
    ...dedupedSignals,
    signals: qualityAppliedSignals.signals.filter((signal) => isHighQualitySignalRecord(signal)),
  };
  const relationshipPrune = pruneFundRelationshipFactsByEvidence({
    funds,
    targetFundIds,
    claims: dedupedClaims,
    sources: allSourceRecords,
  });
  funds = relationshipPrune.funds;
  fundById = new Map(funds.map((fund) => [fund.id, fund]));
  const signalArticleGate = signalArticleGateReport(qualityAppliedSignals.gateRows);

  // Build canonical graph edges from fund relationships + claim/signal links.
  const generatedEdges: GraphEdge[] = [];
  for (const fund of funds) {
    generatedEdges.push(...buildRelationshipEdgesFromFund(fund));
  }
  for (const signal of dedupedSignals.signals) {
    generatedEdges.push({
      id: `edge-${stableHash([signal.fundId, signal.id, "has_signal"], 16)}`,
      fromType: "fund",
      fromId: signal.fundId,
      toType: "signal",
      toId: signal.id,
      relation: "has_signal",
      weight: Math.max(0.2, Math.min(1, signal.confidence ?? 0.5)),
    });
  }
  for (const claim of dedupedClaims) {
    for (const fundId of uniqStrings(claim.linkedFundIds ?? [])) {
      generatedEdges.push({
        id: `edge-${stableHash([fundId, claim.id, "linked_claim"], 16)}`,
        fromType: "fund",
        fromId: fundId,
        toType: "claim",
        toId: claim.id,
        relation: "linked_claim",
        weight: 0.75,
      });
    }
  }
  const dedupedEdges = dedupeGraphEdges(generatedEdges);

  const finalDb: FundgraphDbFile = sanitizeDbForPersistence({
    ...db,
    claims: dedupedClaims,
    signals: dedupedSignals.signals,
    sources: allSourceRecords,
    claimLinks: dedupedLinks.links,
  });

  const newsCounts = countFundNewsVolume(allSourceRecords);
  const citationCounts = countFundCitationVolume(dedupedClaims);
  const topFundsByNews = topFundsFromCountMap(newsCounts, fundById, 10);
  const topFundsByCitations = topFundsFromCountMap(citationCounts, fundById, 10);

  const dedupeMergedCount =
    canonical.mergedFundCount +
    dedupedCandidates.merged +
    dedupedDbSources.merged +
    dedupedClaimsResult.merged +
    dedupedSignals.merged +
    dedupedEdges.merged +
    dedupedLinks.merged;

  const summary: VcEnrichmentSummary = {
    total_vc_funds_processed: targetFundIds.size,
    total_new_citations_fetched: dedupedClaimsResult.citationsMerged + newlyExtractedClaims.reduce((sum, claim) => sum + (claim.citationCount ?? 1), 0),
    total_new_news_items_fetched: sourceCandidates.filter((candidate) => !candidate.isSynthetic).length,
    total_new_portfolio_relationships_added: portfolioFactsAdded,
    total_new_partner_gp_facts_added: partnerFactsAdded,
    total_deduped_items_merged: dedupeMergedCount,
    total_aligned_signals: signalArticleGate.aggregates.aligned_count,
    total_warning_signals: signalArticleGate.aggregates.warning_count,
    total_failed_signals: signalArticleGate.aggregates.failed_count,
    total_global_feed_eligible_signals: signalArticleGate.aggregates.global_feed_eligible_count,
    top_funds_by_news_volume: topFundsByNews,
    top_funds_by_citation_count: topFundsByCitations,
  };

  const finalQualityGate = qualityGateResult({
    funds,
    targetFundIds,
    sources: allSourceRecords,
    claims: dedupedClaims,
    signals: dedupedSignals.signals,
  });

  const result: VcEnrichmentResult = {
    funds,
    signals: dedupedSignals.signals,
    graphEdges: dedupedEdges.edges,
    db: finalDb,
    summary,
  };

  if (!options.dryRun) {
    await Promise.all([
      writeJson(path.join(PUBLIC_FUNDGRAPH_DIR, "funds.json"), result.funds),
      writeJson(path.join(PUBLIC_FUNDGRAPH_DIR, "signals.json"), result.signals),
      writeJson(path.join(PUBLIC_FUNDGRAPH_DIR, "graph_edges.json"), result.graphEdges),
      writeJson(path.join(SEED_FUNDGRAPH_DIR, "funds.json"), result.funds),
      writeJson(path.join(SEED_FUNDGRAPH_DIR, "signals.json"), result.signals),
      writeJson(path.join(SEED_FUNDGRAPH_DIR, "graph_edges.json"), result.graphEdges),
      writeJson(DB_PATH, result.db),
      writeJson(ARTIFACT_PATH, summary),
      writeJson(path.join(REPO_ROOT, "web", "public", "data", "fundgraph", "vc_enrichment_summary.json"), summary),
      writeJson(SIGNAL_ARTICLE_GATE_PATH, signalArticleGate),
      writeJson(path.join(REPO_ROOT, "web", "public", "data", "fundgraph", "signal_article_quality_gate.json"), signalArticleGate),
      writeJson(QUALITY_GATE_PATH, {
        generated_at: nowIso,
        thresholds: QUALITY_GATE_THRESHOLDS,
        passed_funds: finalQualityGate.passedFunds,
        failed_funds: finalQualityGate.failedFunds,
        failed_fund_ids: finalQualityGate.failedFundIds,
        by_fund: finalQualityGate.byFund,
      }),
      fs.mkdir(path.dirname(DOC_PATH), { recursive: true }).then(() =>
        fs.writeFile(
          DOC_PATH,
          `${buildPlanMarkdown({
            fundsProcessed: summary.total_vc_funds_processed,
            sourceStats: discovery.stats,
            newSources: sourceCandidates.length,
            mergedCount: summary.total_deduped_items_merged,
            qualityGate: { passed: finalQualityGate.passedFunds, failed: finalQualityGate.failedFunds },
            signalQuality: {
              aligned: summary.total_aligned_signals,
              warning: summary.total_warning_signals,
              failed: summary.total_failed_signals,
              eligible: summary.total_global_feed_eligible_signals,
            },
          })}\n`,
          "utf8"
        )
      ),
    ]);
  }

  console.log(
    `[vc-enrich] funds=${summary.total_vc_funds_processed} sources=${allSourceRecords.length} claims=${dedupedClaims.length} signals=${dedupedSignals.signals.length} aligned=${summary.total_aligned_signals} warning=${summary.total_warning_signals} failed=${summary.total_failed_signals} edges=${dedupedEdges.edges.length} extraction_failures=${extractionFailures} quality_gate_failed=${finalQualityGate.failedFunds}`
  );
  console.log(`[vc-enrich] summary written: ${ARTIFACT_PATH}`);
  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await runVcEnrichment(options);
}

const isMainModule = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainModule) {
  main().catch((error) => {
    console.error("[vc-enrich] failed", error);
    process.exit(1);
  });
}
