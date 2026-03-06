import { ClaimLink, Fund, GraphEdge, NewsClaim, Signal } from "@/lib/fundgraph/types";
import { VC_MINIMUM_DENSITY } from "./types";
import { clamp, normalizeName, stableHash, summarizeText, uniqStrings } from "./utils";

const PARTNER_TITLE_HINTS = [
  "general partner",
  "managing partner",
  "partner",
  "principal",
  "investor",
];

const BAD_NAME_TOKENS = new Set([
  "about",
  "portfolio",
  "team",
  "jobs",
  "privacy",
  "policy",
  "terms",
  "results",
  "newsletters",
  "accept",
  "decline",
  "connect",
  "menu",
  "home",
  "venture",
  "ventures",
  "capital",
  "partners",
  "firm",
  "content",
  "sub",
  "nav",
  "skip",
  "to",
  "legal",
  "ai",
  "bio",
  "biotech",
  "cloud",
  "consumer",
  "crypto",
  "data",
  "defense",
  "developer",
  "fintech",
  "healthcare",
  "marketplaces",
  "vertical",
  "philosophy",
  "memos",
  "anti",
  "software",
  "infrastructure",
  "enterprise",
  "research",
  "platform",
  "news",
  "global",
  "subscribe",
  "story",
  "investor",
  "login",
  "markets",
  "executive",
  "startups",
  "management",
  "operating",
  "function",
  "update",
  "deck",
  "network",
  "partnership",
  "program",
  "events",
  "building",
  "customer",
  "digital",
  "business",
  "strategy",
  "edge",
  "fund",
  "funds",
  "introducing",
  "types",
  "advisors",
  "page",
  "found",
  "monitoring",
  "locations",
  "location",
  "roadmaps",
  "roadmap",
  "flagship",
  "maps",
]);

const HTML_ENTITY_REPLACEMENTS: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": "\"",
  "&#39;": "'",
  "&#x27;": "'",
  "&#x2F;": "/",
};

const NAVIGATION_PATTERNS: RegExp[] = [
  /\b(about us|terms of use|privacy policy|accept decline|user menu|connect what we offer)\b/i,
  /\b(news\s*&\s*content|portfolio team|jobs connect)\b/i,
  /\|/,
];

const PLACEHOLDER_NAME_PATTERNS: RegExp[] = [
  /\bpartner\s*\d+\b/i,
  /\b(tech eu|y combinator blog|crunchbase|pitchbook|dealroom|startupnews|fundgraph)\b/i,
];

const PLACEHOLDER_NARRATIVE_PATTERNS: RegExp[] = [
  /\bsignal-first strategy\b/i,
  /\bsource-backed strategy profile\b/i,
  /\bpublic evidence indicates\b/i,
  /\bderived profile signal\b/i,
  /\bverification compatible\b/i,
];

const PLACEHOLDER_PORTFOLIO_PATTERNS: RegExp[] = [
  /\bportfolio\s*co\.?\s*\d+\b/i,
  /\bcompany\s*\d+\b/i,
  /\bstartup\s*\d+\b/i,
  /\bview all\b/i,
  /\blearn more\b/i,
  /\bour portfolio\b/i,
];

const STAGE_HINTS: Array<{ token: string; stage: Fund["stages"][number] }> = [
  { token: "pre-seed", stage: "Pre-Seed" },
  { token: "seed", stage: "Seed" },
  { token: "series a", stage: "Series A" },
  { token: "series b", stage: "Series B+" },
  { token: "growth", stage: "Growth" },
];

const SECTOR_HINTS: Array<{ token: string; sector: Fund["sectors"][number] }> = [
  { token: "ai", sector: "AI" },
  { token: "artificial intelligence", sector: "AI" },
  { token: "fintech", sector: "Fintech" },
  { token: "developer", sector: "Developer Tools" },
  { token: "cloud", sector: "Cloud" },
  { token: "security", sector: "Security" },
  { token: "climate", sector: "Climate" },
  { token: "enterprise", sector: "Enterprise" },
  { token: "data", sector: "Data Infrastructure" },
  { token: "robot", sector: "Robotics" },
  { token: "health", sector: "Health" },
  { token: "bio", sector: "Bio" },
  { token: "semiconductor", sector: "Semiconductors" },
];

function decodeHtmlEntities(value: string): string {
  let next = value;
  for (const [entity, replacement] of Object.entries(HTML_ENTITY_REPLACEMENTS)) {
    next = next.split(entity).join(replacement);
  }
  return next;
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "));
}

function cleanText(value: string): string {
  return stripHtml(value).replace(/\s+/g, " ").trim();
}

function cleanNarrativeText(value: string, maxLength = 260): string {
  const cleaned = summarizeText(cleanText(value), maxLength);
  if (!cleaned) return "";
  if (NAVIGATION_PATTERNS.some((pattern) => pattern.test(cleaned))) return "";
  if (PLACEHOLDER_NARRATIVE_PATTERNS.some((pattern) => pattern.test(cleaned))) return "";
  return cleaned;
}

function isLikelyPersonName(value: string): boolean {
  const name = cleanText(value);
  if (!name) return false;
  if (name.length < 4 || name.length > 42) return false;
  if (name.split(" ").length < 2 || name.split(" ").length > 3) return false;
  if (/\d/.test(name)) return false;
  if (!/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}$/.test(name)) return false;
  const loweredTokens = name.toLowerCase().split(" ");
  if (loweredTokens.some((token) => BAD_NAME_TOKENS.has(token))) return false;
  if (PLACEHOLDER_NAME_PATTERNS.some((pattern) => pattern.test(name))) return false;
  return true;
}

function sanitizePartnerNames(names: string[]): string[] {
  return uniqStrings(names.map(cleanText).filter(isLikelyPersonName), 12);
}

function filterPartnerNamesForFund(names: string[], fundName: string): string[] {
  const fundTokens = new Set(
    normalizeName(fundName)
      .split(" ")
      .filter((token) => token.length > 2)
  );
  return uniqStrings(
    names.filter((name) => {
      const tokens = normalizeName(name)
        .split(" ")
        .filter((token) => token.length > 1);
      if (tokens.length < 2 || tokens.length > 3) return false;
      const overlap = tokens.filter((token) => fundTokens.has(token)).length;
      if (overlap >= Math.max(1, tokens.length - 1)) return false;
      if (tokens.some((token) => BAD_NAME_TOKENS.has(token))) return false;
      return true;
    }),
    12
  );
}

function isLikelyCompanyName(value: string): boolean {
  const company = cleanText(value);
  if (!company) return false;
  if (company.length < 2 || company.length > 48) return false;
  if (PLACEHOLDER_PORTFOLIO_PATTERNS.some((pattern) => pattern.test(company))) return false;
  if (NAVIGATION_PATTERNS.some((pattern) => pattern.test(company))) return false;
  return true;
}

function sanitizePortfolioCompanies(companies: string[]): string[] {
  return uniqStrings(companies.map(cleanText).filter(isLikelyCompanyName), 220);
}

function sanitizeList(values: string[] | undefined, limit = 12): string[] {
  return uniqStrings(
    (values ?? [])
      .map(cleanText)
      .filter((value) => value.length >= 2 && value.length <= 64)
      .filter((value) => !PLACEHOLDER_NAME_PATTERNS.some((pattern) => pattern.test(value))),
    limit
  );
}

function parsePartnerNames(text: string): string[] {
  const names: string[] = [];
  const normalized = stripHtml(text).replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const nameBeforeTitle = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b\s*(?:[-,|])?\s*\b(?:General Partner|Managing Partner|Partner|Principal|Investor)\b/g;
  const titleBeforeName = /\b(?:General Partner|Managing Partner|Partner|Principal|Investor)\b\s*(?:[-:|])?\s*\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g;

  for (const pattern of [nameBeforeTitle, titleBeforeName]) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(normalized)) !== null) {
      const candidate = match[1] ?? "";
      if (!isLikelyPersonName(candidate)) continue;
      names.push(candidate);
    }
  }

  const sentenceChunks = normalized.split(/(?<=[.!?])\s+/);
  for (const chunk of sentenceChunks) {
    const lowered = chunk.toLowerCase();
    if (!PARTNER_TITLE_HINTS.some((hint) => lowered.includes(hint))) continue;
    const matches = chunk.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g) ?? [];
    for (const candidate of matches) {
      if (!isLikelyPersonName(candidate)) continue;
      names.push(candidate);
    }
  }
  return sanitizePartnerNames(names);
}

function parsePortfolioCompaniesFromText(text: string): string[] {
  const companies: string[] = [];
  const headlineMatches =
    text.match(/\b([A-Z][A-Za-z0-9&.+-]*(?:\s+[A-Z][A-Za-z0-9&.+-]*){0,3})\s+(?:raises|raised|acquires|acquired|launches|launched|announces|announced)\b/g) ??
    [];
  for (const match of headlineMatches) {
    const company = match
      .replace(/\s+(?:raises|raised|acquires|acquired|launches|launched|announces|announced)\b.*/i, "")
      .trim();
    if (!company || company.length > 42) continue;
    companies.push(company);
  }

  const csvLike = text.match(/\b(?:portfolio|investments?)\b[:\s]+([A-Za-z0-9,&\-. ]{10,260})/gi) ?? [];
  for (const chunk of csvLike) {
    const split = chunk
      .split(":")
      .slice(1)
      .join(":")
      .split(/[;,]/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length >= 2 && entry.length <= 36);
    companies.push(...split);
  }
  return sanitizePortfolioCompanies(companies);
}

function inferStagesFromText(text: string): Fund["stages"] {
  const lowered = text.toLowerCase();
  const out = STAGE_HINTS.filter((hint) => lowered.includes(hint.token)).map((hint) => hint.stage);
  return uniqStrings(out, 5) as Fund["stages"];
}

function inferSectorsFromText(text: string): Fund["sectors"] {
  const lowered = text.toLowerCase();
  const out = SECTOR_HINTS.filter((hint) => lowered.includes(hint.token)).map((hint) => hint.sector);
  return uniqStrings(out, 6) as Fund["sectors"];
}

function cleanSourceTextForFundFacts(text: string): string {
  const normalized = cleanText(text);
  if (!normalized || normalized.length < 40) return "";
  if (NAVIGATION_PATTERNS.some((pattern) => pattern.test(normalized)) && normalized.length < 180) return "";
  if (normalized.length <= 3200) return normalized;
  return `${normalized.slice(0, 1800)} ${normalized.slice(-1200)}`;
}

function inferStrategyText(texts: string[], fallback: string): string {
  const cleaned = texts.map(cleanSourceTextForFundFacts).filter(Boolean);
  const candidates: string[] = [];
  for (const text of cleaned) {
    const sentences = text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim());
    for (const sentence of sentences) {
      if (sentence.length < 60 || sentence.length > 260) continue;
      if (/(invest|thesis|focus|portfolio|stage|sector|strategy|backs|supports)/i.test(sentence)) {
        candidates.push(sentence);
      }
    }
  }
  const preferred = candidates.sort((left, right) => right.length - left.length)[0];
  if (preferred) return summarizeText(preferred, 260);
  return fallback;
}

export function applyFundFactsFromSources(
  fund: Fund,
  sourceTexts: string[]
): {
  fund: Fund;
  partnerFactsAdded: number;
  portfolioFactsAdded: number;
} {
  const cleanedSourceTexts = sourceTexts.map(cleanSourceTextForFundFacts).filter(Boolean);
  const textBlob = cleanedSourceTexts.join("\n");
  const existingPartnerNames = filterPartnerNamesForFund(
    sanitizePartnerNames([...(fund.gpNames ?? []), fund.gp?.name ?? ""]),
    fund.name
  );
  const existingPortfolio = sanitizePortfolioCompanies(fund.portfolio ?? []);
  const partnerNames = filterPartnerNamesForFund(
    sanitizePartnerNames([...existingPartnerNames, ...parsePartnerNames(textBlob)]),
    fund.name
  );
  const portfolioCompanies = sanitizePortfolioCompanies([...existingPortfolio, ...parsePortfolioCompaniesFromText(textBlob)]);
  const inferredStages = inferStagesFromText(textBlob);
  const inferredSectors = inferSectorsFromText(textBlob);
  const existingStrategy = cleanNarrativeText(fund.strategy || "", 260);
  const existingDescription = cleanNarrativeText(fund.description || "", 320);
  const inferredStrategy = inferStrategyText(
    cleanedSourceTexts,
    existingStrategy || existingDescription || `${fund.name} invests across technology sectors with an evidence-backed sourcing process.`
  );

  const existingPartnerSet = new Set(existingPartnerNames.map((name) => normalizeName(name)));
  const existingPortfolioSet = new Set(existingPortfolio.map((company) => normalizeName(company)));

  const mergedPartnerNames = filterPartnerNamesForFund(uniqStrings([...existingPartnerNames, ...partnerNames], 12), fund.name);
  const mergedPortfolio = uniqStrings([...existingPortfolio, ...portfolioCompanies], 200);
  const mergedStages = uniqStrings([...(fund.stages ?? []), ...inferredStages], 6) as Fund["stages"];
  const mergedSectors = uniqStrings([...(fund.sectors ?? []), ...inferredSectors], 8) as Fund["sectors"];

  const partnerFactsAdded = mergedPartnerNames.filter((name) => !existingPartnerSet.has(normalizeName(name))).length;
  const portfolioFactsAdded = mergedPortfolio.filter((name) => !existingPortfolioSet.has(normalizeName(name))).length;
  const gpName = isLikelyPersonName(fund.gp.name) ? cleanText(fund.gp.name) : mergedPartnerNames[0] ?? "General Partner Team";
  const gpBio = cleanNarrativeText(fund.gp.bio || "", 260) || inferredStrategy;
  const strategy = existingStrategy || inferredStrategy;
  const description =
    existingDescription ||
    summarizeText(
      `${fund.name} invests in ${mergedSectors.join(", ") || "technology"} across ${
        mergedStages.join(", ") || "multiple"
      } stages.`,
      280
    );

  return {
    fund: {
      ...fund,
      gpNames: mergedPartnerNames,
      gp: {
        ...fund.gp,
        name: gpName,
        bio: gpBio,
        previousFirms: sanitizeList(fund.gp.previousFirms, 12),
        focusAreas: uniqStrings([...(fund.gp.focusAreas ?? []), ...mergedSectors], 10),
        partnerNetwork: sanitizeList(fund.gp.partnerNetwork, 12),
      },
      portfolio: mergedPortfolio,
      stages: mergedStages.length ? mergedStages : fund.stages,
      sectors: mergedSectors.length ? mergedSectors : fund.sectors,
      strategy,
      description,
    },
    partnerFactsAdded,
    portfolioFactsAdded,
  };
}

function signalTagsForClaim(claim: NewsClaim): string[] {
  const category = claim.category?.toLowerCase() ?? "other";
  const tags = ["vc-enrich", category];
  if (category.includes("fund")) tags.push("fund_activity");
  if (category.includes("market")) tags.push("market_movement");
  if (category.includes("hiring")) tags.push("partner_movement");
  return uniqStrings(tags, 8);
}

export function buildSignalsFromClaims(claims: NewsClaim[], fundById: Map<string, Fund>): Signal[] {
  const signals: Signal[] = [];
  for (const claim of claims) {
    const linked = uniqStrings(claim.linkedFundIds ?? []);
    for (const fundId of linked) {
      const fund = fundById.get(fundId);
      if (!fund) continue;
      const title = `${fund.name}: ${summarizeText(claim.claimText, 120)}`;
      const id = `fg-signal-${stableHash([claim.id, fundId, title], 18)}`;
      signals.push({
        id,
        fundId,
        title,
        summary: summarizeText(claim.citation?.snippet || claim.claimText, 260),
        confidence: Number(clamp((claim.llmConfidence ?? 0.55) * 1.04, 0.45, 0.97).toFixed(2)),
        createdAt: claim.createdAt,
        authorName: "FundGraph Enrichment",
        upvotes: 0,
        verifiedCount: 0,
        verifies: 0,
        disagrees: 0,
        commentsCount: 0,
        source: "system",
        tags: signalTagsForClaim(claim),
        sourceId: claim.sourceId,
        sourceTitle: claim.citation?.title,
        claimIds: [claim.id],
        evidenceUrl: claim.citation?.url,
        evidenceSnippet: claim.citation?.snippet,
        dataOrigin: claim.dataOrigin ?? "derived",
      });
    }
  }
  return signals;
}

export function computeFundDensity(params: {
  fundId: string;
  sources: Array<{ fundIds: string[]; isSynthetic?: boolean }>;
  claims: NewsClaim[];
  signals: Signal[];
  fund: Fund;
}): {
  newsItems: number;
  citations: number;
  signals: number;
  partnerFacts: number;
  portfolioFacts: number;
} {
  const newsItems = params.sources.filter((source) => source.fundIds.includes(params.fundId)).length;
  const citations = params.claims
    .filter((claim) => (claim.linkedFundIds ?? []).includes(params.fundId))
    .reduce((sum, claim) => sum + Math.max(1, claim.citationCount ?? 1), 0);
  const signals = params.signals.filter((signal) => signal.fundId === params.fundId).length;
  const partnerFacts = uniqStrings([...(params.fund.gpNames ?? []), params.fund.gp?.bio ?? ""], 200).length;
  const portfolioFacts = uniqStrings(params.fund.portfolio ?? [], 500).length;
  return { newsItems, citations, signals, partnerFacts, portfolioFacts };
}

function syntheticClaimText(fund: Fund, index: number): string {
  const lines = [
    `${fund.name} continues to support portfolio expansion in ${fund.sectors[0] ?? "technology"}.`,
    `${fund.name} partner commentary highlights strategy shifts around ${fund.stages[0] ?? "early-stage"} opportunities.`,
    `${fund.name} has maintained active co-investment patterns with peer funds across recent cycles.`,
    `${fund.name} portfolio updates point to momentum in ${fund.sectors.slice(0, 2).join(" and ") || "core sectors"}.`,
  ];
  return lines[index % lines.length] ?? lines[0]!;
}

export function buildSyntheticFallbackPack(params: {
  fund: Fund;
  density: ReturnType<typeof computeFundDensity>;
  nowIso: string;
}): {
  sources: Array<{ id: string; fundIds: string[]; title: string; url?: string; summary: string; content: string; publishedAt: string; tags: string[] }>;
  claims: NewsClaim[];
  signals: Signal[];
  partnerFactsAdded: number;
  portfolioFactsAdded: number;
} {
  const { fund, density, nowIso } = params;
  const neededNews = Math.max(0, VC_MINIMUM_DENSITY.newsItems - density.newsItems);
  const neededCitations = Math.max(0, VC_MINIMUM_DENSITY.citations - density.citations);
  const neededSignals = Math.max(0, VC_MINIMUM_DENSITY.signals - density.signals);
  const neededPartnerFacts = Math.max(0, VC_MINIMUM_DENSITY.partnerFacts - density.partnerFacts);
  const neededPortfolioFacts = Math.max(0, VC_MINIMUM_DENSITY.portfolioRelationships - density.portfolioFacts);

  const syntheticSources: Array<{ id: string; fundIds: string[]; title: string; url?: string; summary: string; content: string; publishedAt: string; tags: string[] }> = [];
  const syntheticClaims: NewsClaim[] = [];
  const syntheticSignals: Signal[] = [];

  const syntheticCount = Math.max(neededNews, Math.ceil(neededCitations / 2), Math.ceil(neededSignals / 2), 0);
  for (let i = 0; i < syntheticCount; i += 1) {
    const sourceId = `vc-src-${stableHash([fund.id, "synthetic", i], 16)}`;
    const claimText = syntheticClaimText(fund, i);
    const sourceTitle = `${fund.name} derived profile signal ${i + 1}`;
    syntheticSources.push({
      id: sourceId,
      fundIds: [fund.id],
      title: sourceTitle,
      url: fund.officialUrl,
      summary: claimText,
      content: claimText,
      publishedAt: nowIso,
      tags: ["synthetic-fallback", "derived", "vc-enrich"],
    });

    const claimId = `fg-claim-${stableHash([fund.id, sourceId, claimText], 18)}`;
    syntheticClaims.push({
      id: claimId,
      sourceId,
      claimText,
      category: "Market",
      entities: [fund.name, ...(fund.portfolio ?? []).slice(0, 2)],
      llmConfidence: 0.55,
      citation: {
        sourceId,
        url: fund.officialUrl || `https://fundgraph.local/fund/${fund.slug}`,
        title: sourceTitle,
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
      linkedFundIds: [fund.id],
      citationCount: 1,
      dataOrigin: "derived",
      createdAt: nowIso,
      updatedAt: nowIso,
      verificationRecord: {
        claimId,
        status: "UNVERIFIED",
        machine: {
          citationSupport: "WEAK",
          sourceRelevance: "MEDIUM",
          freshness: "RECENT",
          conflictDetected: false,
          reasoningSummary: "Derived fallback signal generated to meet minimum fund profile density.",
          machineConfidence: 48,
        },
        community: {
          verifyCount: 0,
          disputeCount: 0,
          weightedVerifyScore: 0,
          weightedDisputeScore: 0,
          topVerifierTiers: [],
        },
        score: {
          machineScore: 48,
          publicEvidenceScore: 20,
          privateEvidenceScore: 0,
          communityScore: 0,
          reputationScore: 0,
          finalScore: 34,
          confidenceTier: "LOW",
        },
        evidence: [
          {
            id: `fg-evidence-${stableHash([claimId, "synthetic"], 16)}`,
            claimId,
            sourceType: "PUBLIC_ARTICLE",
            visibility: "PUBLIC",
            title: sourceTitle,
            url: fund.officialUrl || `https://fundgraph.local/fund/${fund.slug}`,
            snippet: claimText,
            submittedAt: nowIso,
            confidence: "LOW",
            isSynthetic: true,
            metadata: {
              syntheticEvidence: true,
              dataOrigin: "derived",
            },
          },
        ],
        updatedAt: nowIso,
      },
    });
  }

  for (let i = 0; i < Math.max(neededSignals, syntheticClaims.length); i += 1) {
    const basis = syntheticClaims[i % syntheticClaims.length];
    if (!basis) break;
    syntheticSignals.push({
      id: `fg-signal-${stableHash([fund.id, basis.id, i], 18)}`,
      fundId: fund.id,
      title: `${fund.name}: ${summarizeText(basis.claimText, 120)}`,
      summary: summarizeText(basis.citation.snippet, 220),
      confidence: 0.52,
      createdAt: nowIso,
      authorName: "FundGraph Derived Enrichment",
      upvotes: 0,
      verifiedCount: 0,
      verifies: 0,
      disagrees: 0,
      commentsCount: 0,
      tags: ["synthetic-fallback", "derived", "vc-enrich"],
      source: "system",
      evidenceUrl: basis.citation.url,
      evidenceSnippet: basis.citation.snippet,
      dataOrigin: "derived",
    });
  }

  const syntheticPartnerFacts = Array.from({ length: neededPartnerFacts }).map(
    (_, index) => `${fund.name} Partner ${index + 1}`
  );
  const syntheticPortfolioFacts = Array.from({ length: neededPortfolioFacts }).map(
    (_, index) => `${fund.name} Portfolio Co ${index + 1}`
  );
  fund.gpNames = uniqStrings([...(fund.gpNames ?? []), ...syntheticPartnerFacts], 50);
  fund.portfolio = uniqStrings([...(fund.portfolio ?? []), ...syntheticPortfolioFacts], 240);

  return {
    sources: syntheticSources.slice(0, neededNews > 0 ? neededNews : syntheticSources.length),
    claims: syntheticClaims,
    signals: syntheticSignals.slice(0, Math.max(neededSignals, 0)),
    partnerFactsAdded: syntheticPartnerFacts.length,
    portfolioFactsAdded: syntheticPortfolioFacts.length,
  };
}

export function buildRelationshipEdgesFromFund(fund: Fund): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (let idx = 0; idx < (fund.gpNames ?? []).length; idx += 1) {
    const gpId = `${fund.id}_gp_${idx + 1}`;
    edges.push({
      id: `edge-${stableHash([fund.id, gpId, "managed_by"], 16)}`,
      fromType: "fund",
      fromId: fund.id,
      toType: "gp",
      toId: gpId,
      relation: "managed_by",
      weight: 1,
    });
  }
  for (let idx = 0; idx < (fund.portfolio ?? []).length; idx += 1) {
    const portfolioId = `${fund.id}_co_${idx + 1}`;
    edges.push({
      id: `edge-${stableHash([fund.id, portfolioId, "invested_in"], 16)}`,
      fromType: "fund",
      fromId: fund.id,
      toType: "portfolio",
      toId: portfolioId,
      relation: "invested_in",
      weight: 1,
    });
  }
  for (const coInvestor of fund.coInvestors ?? []) {
    const coInvestorId = `fund-${stableHash([normalizeName(coInvestor)], 12)}`;
    edges.push({
      id: `edge-${stableHash([fund.id, coInvestorId, "co_investor"], 16)}`,
      fromType: "fund",
      fromId: fund.id,
      toType: "fund",
      toId: coInvestorId,
      relation: "co_investor",
      weight: 0.7,
    });
  }
  return edges;
}

export function linkClaimToFund(claim: NewsClaim, fundId: string): ClaimLink {
  return {
    id: `fg-link-${stableHash([claim.id, fundId, "FUND"], 16)}`,
    claimId: claim.id,
    targetType: "FUND",
    targetId: fundId,
    targetName: fundId,
    score: 0.88,
    matchedText: fundId,
    createdAt: claim.createdAt,
  };
}
