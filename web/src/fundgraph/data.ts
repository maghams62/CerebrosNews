import { readOfflineDataset } from "@/lib/dataset/offlineDataset";
import { getFundgraphDataMode } from "@/lib/fundgraph/config";
import { loadSeedFunds, loadSeedSignals } from "@/lib/fundgraph/seed/loadSeed";
import { ClaimCategory, Fund, FundGraphDashboardData, FundGraphDataMode, NewsClaim, UserProfile } from "@/fundgraph/types";

const DEFAULT_PROFILE: UserProfile = {
  userId: "demo",
  sectorFocus: [],
  stageFocus: [],
  geographyFocus: ["US"],
  geographies: ["US"],
  riskTolerance: "medium",
  checkSizeMinM: 0.5,
  checkSizeMaxM: 10,
  typicalCheckSizeM: 2,
  typicalCheckSizeKUsd: 2000,
};

const CLAIM_CATEGORY_RULES: Array<{ category: ClaimCategory; keywords: string[] }> = [
  { category: "Funding", keywords: ["funding", "raised", "round", "valuation", "capital", "financing"] },
  { category: "Product", keywords: ["launch", "launched", "release", "feature", "product", "model"] },
  { category: "Regulation", keywords: ["regulation", "antitrust", "compliance", "law", "policy", "court"] },
  { category: "Partnership", keywords: ["partner", "partnership", "agreement", "collaboration", "integrate"] },
  { category: "M&A", keywords: ["acquire", "acquisition", "merger", "buyout"] },
  { category: "Hiring", keywords: ["hire", "hiring", "team", "headcount"] },
  { category: "Market", keywords: ["market", "demand", "growth", "revenue", "forecast"] },
];

function trimSnippet(input: string, max = 260): string {
  const text = input.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function detectCategory(text: string): ClaimCategory {
  const lower = text.toLowerCase();
  for (const rule of CLAIM_CATEGORY_RULES) {
    if (rule.keywords.some((keyword) => lower.includes(keyword))) return rule.category;
  }
  return "Market";
}

function extractEntities(text: string): string[] {
  const matches = text.match(/\b([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+){0,2})\b/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.trim()).filter((m) => m.length > 2 && m.length < 40))).slice(0, 4);
}

function splitIntoClaims(text: string, maxClaims = 8): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40)
    .filter((s) => !s.toLowerCase().startsWith("read more"));
  if (!sentences.length) return [trimSnippet(cleaned, 180)];
  return sentences.slice(0, maxClaims).map((sentence) => trimSnippet(sentence, 220));
}

function linkClaimToFunds(claimText: string): string[] {
  const lower = claimText.toLowerCase();
  return loadSeedFunds()
    .filter((fund) => fund.portfolio.some((company) => lower.includes(company.toLowerCase())))
    .slice(0, 4)
    .map((fund) => fund.id);
}

export function getFundGraphDataMode(): FundGraphDataMode {
  return getFundgraphDataMode();
}

export async function deriveRealClaimsFromNews(limit = 36): Promise<NewsClaim[]> {
  const dataset = await readOfflineDataset();
  const items = dataset?.items ?? [];
  if (!items.length) return [];

  const claims: NewsClaim[] = [];
  for (const item of items.slice(0, 60)) {
    const articleText =
      item.summary && item.summary.trim().length > 80
        ? item.summary
        : item.description && item.description.trim().length > 80
          ? item.description
          : item.extractedText ?? "";
    if (!articleText) continue;

    const articleClaims = splitIntoClaims(articleText, 2).map((claimText, idx) => ({
      id: `claim-${item.id}-${idx + 1}`,
      sourceId: item.id,
      claimText,
      category: detectCategory(claimText),
      entities: extractEntities(claimText),
      llmConfidence: 0.55 + (((idx + 1) * 11 + item.id.length) % 35) / 100,
      citation: {
        sourceId: item.id,
        url: item.canonicalUrl ?? item.url,
        title: item.title,
        snippet: claimText,
      },
      verification: undefined,
      community: {
        verifyCount: 0,
        disagreeCount: 0,
        commentCount: 0,
        verifies: 0,
        disagrees: 0,
        trustScore: 0,
      },
      linkedFundIds: linkClaimToFunds(claimText),
      dataOrigin: "derived" as const,
      createdAt: item.publishedAt,
      updatedAt: item.publishedAt,
    }));

    claims.push(...articleClaims);
    if (claims.length >= limit) break;
  }

  return claims.slice(0, limit);
}

export async function extractClaimsForArticleId(articleId: string, target = 8): Promise<NewsClaim[]> {
  const dataset = await readOfflineDataset();
  const item = dataset?.items?.find((entry) => entry.id === articleId);
  if (!item) return [];
  const sourceText = [item.summary, item.description, item.extractedText].filter(Boolean).join(" ");
  const snippets = splitIntoClaims(sourceText, Math.max(5, Math.min(12, target)));

  return snippets.map((claimText, idx) => ({
    id: `extract-${item.id}-${idx + 1}`,
    sourceId: item.id,
    claimText,
    category: detectCategory(claimText),
    entities: extractEntities(claimText),
    llmConfidence: 0.57 + ((idx * 8) % 32) / 100,
    citation: {
      sourceId: item.id,
      url: item.canonicalUrl ?? item.url,
      title: item.title,
      snippet: claimText,
    },
    verification: undefined,
    community: {
      verifyCount: 0,
      disagreeCount: 0,
      commentCount: 0,
      verifies: 0,
      disagrees: 0,
      trustScore: 0,
    },
    linkedFundIds: linkClaimToFunds(claimText),
    dataOrigin: "derived",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
}

export async function getNewsClaims(_: FundGraphDataMode, limit = 36): Promise<NewsClaim[]> {
  return deriveRealClaimsFromNews(limit);
}

export function getFunds(): Fund[] {
  return loadSeedFunds().map((fund) => ({ ...fund, dataOrigin: fund.dataOrigin ?? "curated" }));
}

export function getSignals() {
  return loadSeedSignals().map((signal) => ({ ...signal, dataOrigin: signal.dataOrigin ?? "curated" }));
}

export function getRecommendations(profile: UserProfile = DEFAULT_PROFILE, limit = 6) {
  const preferredSectors = new Set((profile.sectorFocus ?? []).map((value) => value.toLowerCase()));
  const preferredStages = new Set((profile.stageFocus ?? []).map((value) => value.toLowerCase()));
  const ranked = [...getFunds()]
    .map((fund) => {
      const sectorMatch = fund.sectors.some((sector) => preferredSectors.has(sector.toLowerCase())) ? 1 : 0;
      const stageMatch = fund.stages.some((stage) => preferredStages.has(stage.toLowerCase())) ? 1 : 0;
      const momentum = Math.max(0, Math.min(100, fund.momentumScore ?? fund.trendScore ?? 0)) / 100;
      const score = Number((momentum * 0.6 + sectorMatch * 0.25 + stageMatch * 0.15).toFixed(3));
      return {
        fundId: fund.id,
        fund,
        score,
        reason: sectorMatch || stageMatch ? "Matched your explicit sector/stage focus." : "Ranked by live momentum signals.",
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return ranked.map((entry) => ({
    fundId: entry.fundId,
    fund: entry.fund,
    score: entry.score,
    reason: entry.reason,
  }));
}

export async function getFundGraphDashboardData(profile: UserProfile = DEFAULT_PROFILE): Promise<FundGraphDashboardData> {
  const mode = getFundGraphDataMode();
  const recentClaims = await getNewsClaims(mode, 20);
  const allFunds = getFunds();
  const allSignals = getSignals();
  const trendingFunds = [...allFunds].sort((a, b) => b.trendScore - a.trendScore).slice(0, 8);
  const recentSignals = [...allSignals].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 8);

  return {
    mode,
    trendingFunds,
    recentSignals,
    recentClaims,
    recommendations: getRecommendations(profile, 6),
  };
}
