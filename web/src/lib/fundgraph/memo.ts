import { readGraphEdges, readFunds } from "@/lib/fundgraph/storage";
import { generateFundMemoWithLlm, generateWatchlistBriefWithLlm } from "@/lib/fundgraph/llm";
import { getClaimLinks, getClaims, getOpenConflicts, getProfile, getSignals } from "@/lib/fundgraph/store";
import {
  ClaimLink,
  Fund,
  GraphEdge,
  MemoCitation,
  MemoGenerationMode,
  MemoOptions,
  MemoSection,
  MemoTimeWindow,
  MemoType,
  NewsClaim,
  Signal,
  UserProfile,
} from "@/lib/fundgraph/types";

export interface GenerateFundMemoInput {
  userId?: string;
  fundId: string;
  memoType?: MemoType;
  includeSignals?: boolean;
  includeClaims?: boolean;
  includePortfolio?: boolean;
  includeGraphContext?: boolean;
  includeCommunityDiscussion?: boolean;
  timeWindow?: MemoTimeWindow;
}

export interface GenerateWatchlistBriefInput {
  userId?: string;
  fundIds: string[];
  memoType?: MemoType;
  includeSignals?: boolean;
  includeClaims?: boolean;
  includePortfolio?: boolean;
  includeGraphContext?: boolean;
  includeCommunityDiscussion?: boolean;
  timeWindow?: MemoTimeWindow;
}

export interface GenerateMemoOutput {
  memoMarkdown: string;
  sections: MemoSection[];
  citations: MemoCitation[];
  options: MemoOptions;
  fundIds: string[];
  primaryFundId?: string;
  generationMode: MemoGenerationMode;
}

const DEFAULT_OPTIONS: MemoOptions = {
  memoType: "investment_memo",
  includeSignals: true,
  includePortfolio: true,
  includeGraphContext: true,
  includeCommunityDiscussion: true,
  timeWindow: "90d",
};

const MEMO_LLM_TIMEOUT_MS = 20_000;

const MEMO_DEPTH: Record<MemoType, { signalLimit: number; claimLimit: number; questionLimit: number }> = {
  quick_brief: {
    signalLimit: 4,
    claimLimit: 4,
    questionLimit: 5,
  },
  investment_memo: {
    signalLimit: 8,
    claimLimit: 8,
    questionLimit: 7,
  },
  deep_diligence: {
    signalLimit: 14,
    claimLimit: 14,
    questionLimit: 10,
  },
};

interface FundMemoContext {
  fund: Fund;
  allFunds: Fund[];
  signals: Signal[];
  claims: NewsClaim[];
  profile: UserProfile | null;
  conflictClaimPairs: Array<{ claimIdA: string; claimIdB: string }>;
  graphEdges: GraphEdge[];
}

function normalizeMemoOptions(input: {
  memoType?: MemoType;
  includeSignals?: boolean;
  includePortfolio?: boolean;
  includeGraphContext?: boolean;
  includeCommunityDiscussion?: boolean;
  timeWindow?: MemoTimeWindow;
}): MemoOptions {
  return {
    memoType: input.memoType ?? DEFAULT_OPTIONS.memoType,
    includeSignals: input.includeSignals ?? DEFAULT_OPTIONS.includeSignals,
    includePortfolio: input.includePortfolio ?? DEFAULT_OPTIONS.includePortfolio,
    includeGraphContext: input.includeGraphContext ?? DEFAULT_OPTIONS.includeGraphContext,
    includeCommunityDiscussion: input.includeCommunityDiscussion ?? DEFAULT_OPTIONS.includeCommunityDiscussion,
    timeWindow: input.timeWindow ?? DEFAULT_OPTIONS.timeWindow,
  };
}

function safeNum(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function signalVerifies(signal: Signal): number {
  return safeNum(signal.verifyCount ?? signal.verifiedCount ?? signal.verifies);
}

function signalDisagrees(signal: Signal): number {
  return safeNum(signal.disagreeCount ?? signal.disputedCount ?? signal.disagrees);
}

function claimVerifies(claim: NewsClaim): number {
  return safeNum(claim.community.verifyCount ?? claim.community.verifiedCount ?? claim.community.verifies);
}

function claimDisagrees(claim: NewsClaim): number {
  return safeNum(claim.community.disagreeCount ?? claim.community.disputedCount ?? claim.community.disagrees);
}

function citationTagFromId(id: string | undefined): string {
  return id ? `[${id}]` : "";
}

function toIsoDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().slice(0, 10);
}

function normalizeKeyPart(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function signalSignature(signal: Signal): string {
  return [
    normalizeKeyPart(signal.fundId),
    normalizeKeyPart(signal.title),
    normalizeKeyPart(signal.summary),
    normalizeKeyPart(signal.evidence?.url ?? signal.evidenceUrl),
    normalizeKeyPart(signal.evidence?.snippet ?? signal.evidenceSnippet),
  ].join("|");
}

function claimSignature(claim: NewsClaim): string {
  return [
    normalizeKeyPart(claim.claimText),
    normalizeKeyPart(claim.citation?.url),
    normalizeKeyPart(claim.citation?.snippet),
  ].join("|");
}

function dedupeSignals(signals: Signal[]): Signal[] {
  const bySignature = new Map<string, Signal>();
  for (const signal of signals) {
    const key = signalSignature(signal);
    const existing = bySignature.get(key);
    if (!existing) {
      bySignature.set(key, signal);
      continue;
    }

    const existingScore = existing.confidence * 100 + signalVerifies(existing) - signalDisagrees(existing);
    const nextScore = signal.confidence * 100 + signalVerifies(signal) - signalDisagrees(signal);
    const keepNext = nextScore > existingScore || +new Date(signal.createdAt) > +new Date(existing.createdAt);
    if (keepNext) {
      bySignature.set(key, signal);
    }
  }

  return [...bySignature.values()].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

function dedupeClaims(claims: NewsClaim[]): NewsClaim[] {
  const bySignature = new Map<string, NewsClaim>();
  for (const claim of claims) {
    const key = claimSignature(claim);
    const existing = bySignature.get(key);
    if (!existing) {
      bySignature.set(key, claim);
      continue;
    }

    const existingScore = claimVerifies(existing) - claimDisagrees(existing) + existing.llmConfidence * 10;
    const nextScore = claimVerifies(claim) - claimDisagrees(claim) + claim.llmConfidence * 10;
    const keepNext = nextScore > existingScore || +new Date(claim.createdAt) > +new Date(existing.createdAt);
    if (keepNext) {
      bySignature.set(key, claim);
    }
  }

  return [...bySignature.values()].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

function interpolateCheckRange(fund: Fund): string {
  return `$${fund.checkSizeMinM.toFixed(1)}M-$${fund.checkSizeMaxM.toFixed(1)}M`;
}

function computeReferenceTimestamp(signals: Signal[], claims: NewsClaim[]): number {
  let maxTs = 0;
  for (const signal of signals) {
    const ts = +new Date(signal.createdAt);
    if (Number.isFinite(ts) && ts > maxTs) maxTs = ts;
  }
  for (const claim of claims) {
    const ts = +new Date(claim.createdAt);
    if (Number.isFinite(ts) && ts > maxTs) maxTs = ts;
  }
  return maxTs || Date.now();
}

function windowStart(window: MemoTimeWindow, referenceTs: number): number | null {
  if (window === "all_time") return null;
  const days = window === "30d" ? 30 : 90;
  return referenceTs - days * 24 * 60 * 60 * 1000;
}

function inWindow(iso: string, startTs: number | null): boolean {
  if (startTs === null) return true;
  const ts = +new Date(iso);
  return Number.isFinite(ts) ? ts >= startTs : false;
}

function intersects(values: string[], other: Set<string>): boolean {
  return values.some((value) => other.has(value));
}

function claimMatchesFund(claim: NewsClaim, fundIdSet: Set<string>, linksByClaimId: Map<string, ClaimLink[]>): boolean {
  if (intersects(claim.linkedFundIds ?? [], fundIdSet)) return true;
  const links = linksByClaimId.get(claim.id) ?? [];
  return links.some((link) => link.targetType === "FUND" && fundIdSet.has(link.targetId));
}

function buildCitations(claims: NewsClaim[], signals: Signal[]): {
  citations: MemoCitation[];
  citationByClaimId: Map<string, string>;
  citationBySignalId: Map<string, string>;
} {
  const citations: MemoCitation[] = [];
  const citationByClaimId = new Map<string, string>();
  const citationBySignalId = new Map<string, string>();

  claims.forEach((claim, idx) => {
    const id = `C${idx + 1}`;
    citations.push({
      id,
      type: "claim",
      claimId: claim.id,
      sourceId: claim.sourceId,
      title: claim.citation.title,
      url: claim.citation.url,
      snippet: claim.citation.snippet,
    });
    citationByClaimId.set(claim.id, id);
  });

  signals.forEach((signal, idx) => {
    const id = `S${idx + 1}`;
    citations.push({
      id,
      type: "signal",
      signalId: signal.id,
      fundId: signal.fundId,
      title: signal.title,
      url: signal.evidence?.url ?? signal.evidenceUrl,
      snippet: signal.evidence?.snippet ?? signal.evidenceSnippet ?? signal.summary,
    });
    citationBySignalId.set(signal.id, id);
  });

  return {
    citations,
    citationByClaimId,
    citationBySignalId,
  };
}

async function collectFundMemoContext(input: GenerateFundMemoInput, options: MemoOptions): Promise<FundMemoContext> {
  const fundIdSet = new Set([input.fundId]);
  const [allFunds, allSignals, allClaims, allClaimLinks, allConflicts, profile, allEdges] = await Promise.all([
    readFunds(),
    getSignals(),
    getClaims(),
    getClaimLinks(),
    getOpenConflicts(),
    input.userId ? getProfile(input.userId) : Promise.resolve(null),
    options.includeGraphContext ? readGraphEdges() : Promise.resolve([]),
  ]);

  const fund = allFunds.find((item) => item.id === input.fundId || item.slug === input.fundId);
  if (!fund) {
    throw new Error("fund_not_found");
  }

  const linksByClaimId = new Map<string, ClaimLink[]>();
  for (const link of allClaimLinks) {
    const bucket = linksByClaimId.get(link.claimId) ?? [];
    bucket.push(link);
    linksByClaimId.set(link.claimId, bucket);
  }

  const rawSignals = allSignals.filter((signal) => signal.fundId === fund.id);
  const rawClaims = allClaims.filter((claim) => claimMatchesFund(claim, fundIdSet, linksByClaimId));
  const referenceTs = computeReferenceTimestamp(rawSignals, rawClaims);
  const startTs = windowStart(options.timeWindow, referenceTs);

  const signals = options.includeSignals
    ? dedupeSignals(
        rawSignals
          .filter((signal) => inWindow(signal.createdAt, startTs))
          .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      )
    : [];

  const includeClaims = input.includeClaims ?? true;
  const claims = includeClaims
    ? dedupeClaims(
        rawClaims
          .filter((claim) => inWindow(claim.createdAt, startTs))
          .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      )
    : [];

  const claimIdSet = new Set(claims.map((claim) => claim.id));
  const conflictClaimPairs = allConflicts
    .filter((conflict) => claimIdSet.has(conflict.claimIdA) || claimIdSet.has(conflict.claimIdB))
    .map((conflict) => ({ claimIdA: conflict.claimIdA, claimIdB: conflict.claimIdB }));

  const graphEdges = options.includeGraphContext
    ? allEdges
        .filter((edge) => edge.fromId === fund.id || edge.toId === fund.id)
        .slice(0, options.memoType === "deep_diligence" ? 80 : 40)
    : [];

  return {
    fund,
    allFunds,
    signals,
    claims,
    profile,
    conflictClaimPairs,
    graphEdges,
  };
}

function confidenceLabel(score: number): "High" | "Medium" | "Low" {
  if (score >= 0.72) return "High";
  if (score >= 0.52) return "Medium";
  return "Low";
}

function memoTitleForType(memoType: MemoType): string {
  if (memoType === "quick_brief") return "Quick Brief";
  if (memoType === "deep_diligence") return "Deep Diligence Memo";
  return "Investment Memo";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutError = "timeout"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(timeoutError)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

function whyNowLine(fund: Fund, signals: Signal[]): string {
  const newest = signals[0];
  const recency = newest ? `Most recent signal is dated ${toIsoDate(newest.createdAt)}.` : "Recent signal coverage is thin.";
  const momentum = fund.trendScore >= 75 ? "Momentum is strong." : fund.trendScore >= 55 ? "Momentum is improving." : "Momentum is mixed.";
  return `${momentum} ${recency}`;
}

function sortedTopRelations(
  edges: Array<{ relation: string; fromType: string; toType: string }>
): Array<{ relation: string; count: number }> {
  const counts = new Map<string, number>();
  for (const edge of edges) {
    const key = edge.relation || `${edge.fromType}_${edge.toType}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([relation, count]) => ({ relation, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

type GraphAnalyzerInsightSummary = {
  relationshipMotifs: string[];
  centralEntities: string[];
  bridgingPaths: string[];
  suggestedNextActions: string[];
  traceability: string;
};

function normalizeCompanyKey(name: string): string {
  return normalizeKeyPart(name);
}

function companyInvestorMap(funds: Fund[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const fund of funds) {
    for (const company of fund.portfolio ?? []) {
      const key = normalizeCompanyKey(company);
      if (!key) continue;
      const investors = map.get(key) ?? new Set<string>();
      investors.add(fund.name);
      map.set(key, investors);
    }
  }
  return map;
}

function sharedPortfolioCount(left: Fund, right: Fund): { count: number; sharedCompanies: string[] } {
  const rightSet = new Set((right.portfolio ?? []).map((company) => normalizeCompanyKey(company)));
  const sharedCompanies = (left.portfolio ?? []).filter((company) => rightSet.has(normalizeCompanyKey(company)));
  return { count: sharedCompanies.length, sharedCompanies };
}

function escapeSvgText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function svgDataUri(svg: string): string {
  const encoded = encodeURIComponent(svg).replaceAll("(", "%28").replaceAll(")", "%29");
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

function polarPosition(centerX: number, centerY: number, radius: number, idx: number, count: number): { x: number; y: number } {
  if (count <= 1) return { x: centerX + radius, y: centerY };
  const angleStart = -Math.PI * 0.85;
  const angleEnd = Math.PI * 0.85;
  const angle = angleStart + (idx / (count - 1)) * (angleEnd - angleStart);
  return {
    x: centerX + Math.cos(angle) * radius,
    y: centerY + Math.sin(angle) * radius,
  };
}

function trimLabel(value: string, maxLen: number): string {
  const clean = value.trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, Math.max(0, maxLen - 1)).trim()}…`;
}

function buildFundGraphSnapshot(input: { fund: Fund; allFunds: Fund[] }): {
  dataUri: string;
  companies: string[];
  overlapFunds: string[];
} {
  const companies = Array.from(new Set(input.fund.portfolio ?? [])).slice(0, 10);
  const overlapFunds = input.allFunds
    .filter((fund) => fund.id !== input.fund.id)
    .map((fund) => {
      const overlap = sharedPortfolioCount(input.fund, fund);
      return {
        name: fund.name,
        sharedCount: overlap.count,
      };
    })
    .filter((entry) => entry.sharedCount > 0)
    .sort((left, right) => right.sharedCount - left.sharedCount)
    .slice(0, 5)
    .map((entry) => entry.name);

  const width = 1080;
  const height = 620;
  const centerX = 340;
  const centerY = 310;
  const overlapAnchorX = 800;
  const overlapAnchorY = 310;

  const companyNodes = companies.map((name, idx) => ({
    name,
    ...polarPosition(centerX, centerY, 220, idx, Math.max(1, companies.length)),
  }));
  const overlapNodes = overlapFunds.map((name, idx) => ({
    name,
    ...polarPosition(overlapAnchorX, overlapAnchorY, 175, idx, Math.max(1, overlapFunds.length)),
  }));

  const companyLines = companyNodes
    .map((node) => `<line x1="${centerX}" y1="${centerY}" x2="${node.x}" y2="${node.y}" stroke="#64748b" stroke-opacity="0.35" stroke-width="2" />`)
    .join("");

  const overlapLines = overlapNodes
    .map((node, idx) => {
      const bridge = companyNodes[idx % Math.max(1, companyNodes.length)];
      if (!bridge) return "";
      return `<line x1="${bridge.x}" y1="${bridge.y}" x2="${node.x}" y2="${node.y}" stroke="#2563eb" stroke-opacity="0.3" stroke-width="1.8" />`;
    })
    .join("");

  const companyCircles = companyNodes
    .map((node) => {
      return [
        `<circle cx="${node.x}" cy="${node.y}" r="19" fill="#7c3aed" fill-opacity="0.88" />`,
        `<text x="${node.x}" y="${node.y + 34}" text-anchor="middle" font-size="12" fill="#0f172a">${escapeSvgText(trimLabel(node.name, 20))}</text>`,
      ].join("");
    })
    .join("");

  const overlapCircles = overlapNodes
    .map((node) => {
      return [
        `<circle cx="${node.x}" cy="${node.y}" r="16" fill="#2563eb" fill-opacity="0.82" />`,
        `<text x="${node.x}" y="${node.y + 30}" text-anchor="middle" font-size="11" fill="#0f172a">${escapeSvgText(trimLabel(node.name, 18))}</text>`,
      ].join("");
    })
    .join("");

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="memoGraphBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="100%" stop-color="#eef2ff"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" rx="18" fill="url(#memoGraphBg)" />
  <text x="32" y="44" font-size="20" font-weight="700" fill="#0f172a">Graph Snapshot: ${escapeSvgText(input.fund.name)}</text>
  <text x="32" y="70" font-size="13" fill="#334155">Blue nodes: co-investor funds · Purple nodes: portfolio companies</text>
  ${companyLines}
  ${overlapLines}
  <circle cx="${centerX}" cy="${centerY}" r="38" fill="#0f172a" />
  <text x="${centerX}" y="${centerY + 5}" text-anchor="middle" font-size="13" font-weight="700" fill="#ffffff">${escapeSvgText(
    trimLabel(input.fund.name, 18)
  )}</text>
  ${companyCircles}
  ${overlapCircles}
</svg>`.trim();

  return {
    dataUri: svgDataUri(svg),
    companies,
    overlapFunds,
  };
}

function buildWatchlistGraphSnapshot(funds: Fund[]): {
  dataUri: string;
  sharedCompanies: string[];
  focusFunds: string[];
} {
  const orderedFunds: Fund[] = [];
  const seenFundIds = new Set<string>();
  for (const fund of funds) {
    if (seenFundIds.has(fund.id)) continue;
    seenFundIds.add(fund.id);
    orderedFunds.push(fund);
  }

  if (orderedFunds.length < 2) {
    return {
      dataUri: "",
      sharedCompanies: [],
      focusFunds: [],
    };
  }

  const companyFundIds = new Map<string, Set<string>>();
  const companyLabelByKey = new Map<string, string>();
  for (const fund of orderedFunds) {
    for (const company of fund.portfolio ?? []) {
      const key = normalizeCompanyKey(company);
      if (!key) continue;
      if (!companyLabelByKey.has(key)) {
        companyLabelByKey.set(key, company.trim() || company);
      }
      const bucket = companyFundIds.get(key) ?? new Set<string>();
      bucket.add(fund.id);
      companyFundIds.set(key, bucket);
    }
  }

  const sharedCompanyEntries = [...companyFundIds.entries()]
    .filter(([, fundIds]) => fundIds.size >= 2)
    .map(([companyKey, fundIds]) => ({
      company: companyLabelByKey.get(companyKey) ?? companyKey,
      fundIds: [...fundIds],
      investorCount: fundIds.size,
    }))
    .sort((left, right) => right.investorCount - left.investorCount || left.company.localeCompare(right.company))
    .slice(0, 18);

  const sharedCompanies = sharedCompanyEntries.map((entry) => entry.company);
  const width = 1120;
  const height = 680;
  const companyColumns = Math.max(3, Math.min(6, Math.ceil(Math.sqrt(Math.max(1, sharedCompanyEntries.length)))));
  const companyRowGap = 92;
  const companyTopY = 160;
  const companyRows = Math.max(1, Math.ceil(sharedCompanyEntries.length / companyColumns));
  const companyNodes = sharedCompanyEntries.map((entry, idx) => {
    const row = Math.floor(idx / companyColumns);
    const col = idx % companyColumns;
    const x = 130 + ((col + 0.5) * (width - 260)) / companyColumns;
    const y = companyTopY + row * companyRowGap;
    return {
      ...entry,
      x,
      y,
    };
  });

  const firstRowCount = orderedFunds.length <= 6 ? orderedFunds.length : Math.ceil(orderedFunds.length / 2);
  const secondRowCount = orderedFunds.length > 6 ? orderedFunds.length - firstRowCount : 0;
  const fundBaseY = Math.min(height - 92, companyTopY + companyRows * companyRowGap + 130);
  const fundNodes = orderedFunds.map((fund, idx) => {
    const firstRow = idx < firstRowCount;
    const row = secondRowCount ? (firstRow ? 0 : 1) : 0;
    const rowCount = row === 0 ? firstRowCount : secondRowCount;
    const column = firstRow ? idx : idx - firstRowCount;
    const x = 120 + ((column + 0.5) * (width - 240)) / Math.max(1, rowCount);
    const y = secondRowCount ? (row === 0 ? fundBaseY - 84 : fundBaseY) : fundBaseY;
    return {
      fund,
      x,
      y,
    };
  });
  const fundNodeById = new Map(fundNodes.map((node) => [node.fund.id, node] as const));

  const companyLines = companyNodes
    .map((node) =>
      node.fundIds
        .map((fundId) => {
          const fundNode = fundNodeById.get(fundId);
          if (!fundNode) return "";
          return `<line x1="${fundNode.x}" y1="${fundNode.y}" x2="${node.x}" y2="${node.y}" stroke="#475569" stroke-opacity="0.28" stroke-width="1.6" />`;
        })
        .join("")
    )
    .join("");

  const companyNodeSvg = companyNodes
    .map((node) => {
      const radius = 15 + Math.min(4, Math.max(0, node.investorCount - 2));
      return [
        `<circle cx="${node.x}" cy="${node.y}" r="${radius}" fill="#7c3aed" fill-opacity="0.88" />`,
        `<text x="${node.x}" y="${node.y + 30}" text-anchor="middle" font-size="11.5" fill="#0f172a">${escapeSvgText(trimLabel(node.company, 20))}</text>`,
        `<text x="${node.x}" y="${node.y + 46}" text-anchor="middle" font-size="10" fill="#475569">${node.investorCount} funds</text>`,
      ].join("");
    })
    .join("");

  const fundNodeSvg = fundNodes
    .map((node) => {
      return [
        `<circle cx="${node.x}" cy="${node.y}" r="26" fill="#0f172a" />`,
        `<text x="${node.x}" y="${node.y + 4}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#ffffff">${escapeSvgText(
          trimLabel(node.fund.name, 16)
        )}</text>`,
      ].join("");
    })
    .join("");

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="memoWatchlistBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="100%" stop-color="#eff6ff"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" rx="18" fill="url(#memoWatchlistBg)" />
  <text x="32" y="44" font-size="20" font-weight="700" fill="#0f172a">Watchlist Graph Snapshot</text>
  <text x="32" y="70" font-size="13" fill="#334155">Shared company bridges across selected watchlist funds</text>
  ${companyLines}
  ${fundNodeSvg}
  ${companyNodeSvg}
</svg>`.trim();

  return {
    dataUri: svgDataUri(svg),
    sharedCompanies,
    focusFunds: orderedFunds.map((fund) => fund.name),
  };
}

function upsertSection(sections: MemoSection[], section: MemoSection, afterKey?: string): MemoSection[] {
  const existingIdx = sections.findIndex((entry) => entry.key === section.key);
  if (existingIdx >= 0) {
    const next = [...sections];
    next[existingIdx] = section;
    return next;
  }

  if (!afterKey) return [...sections, section];
  const afterIdx = sections.findIndex((entry) => entry.key === afterKey);
  if (afterIdx < 0) return [...sections, section];
  const next = [...sections];
  next.splice(afterIdx + 1, 0, section);
  return next;
}

function buildFundGraphAnalyzerInsights(input: {
  fund: Fund;
  allFunds: Fund[];
  graphEdges: GraphEdge[];
}): GraphAnalyzerInsightSummary {
  const investorMap = companyInvestorMap(input.allFunds);
  const overlapFunds = input.allFunds
    .filter((fund) => fund.id !== input.fund.id)
    .map((fund) => {
      const overlap = sharedPortfolioCount(input.fund, fund);
      return {
        fund,
        sharedCount: overlap.count,
        sharedCompanies: overlap.sharedCompanies,
      };
    })
    .filter((entry) => entry.sharedCount > 0)
    .sort((left, right) => right.sharedCount - left.sharedCount)
    .slice(0, 6);

  const hubCompanies = (input.fund.portfolio ?? [])
    .map((company) => {
      const investors = investorMap.get(normalizeCompanyKey(company)) ?? new Set<string>();
      return {
        company,
        investorCount: investors.size,
        investorNames: Array.from(investors).filter((name) => name !== input.fund.name),
      };
    })
    .sort((left, right) => right.investorCount - left.investorCount || left.company.localeCompare(right.company))
    .slice(0, 6);

  const relationTop = sortedTopRelations(input.graphEdges).slice(0, 3);
  const relationshipMotifs: string[] = [];
  if (overlapFunds[0]) {
    relationshipMotifs.push(
      `Top co-invest motif: ${input.fund.name} overlaps most with ${overlapFunds[0].fund.name} (${overlapFunds[0].sharedCount} shared companies).`
    );
  }
  if (hubCompanies[0]) {
    relationshipMotifs.push(
      `Portfolio hub concentration: ${hubCompanies[0].company} is connected to ${hubCompanies[0].investorCount} investor networks in this dataset.`
    );
  }
  if (relationTop.length) {
    relationshipMotifs.push(
      `Dominant graph relations around this fund: ${relationTop.map((item) => `${item.relation} (${item.count})`).join(", ")}.`
    );
  }
  if (!relationshipMotifs.length) {
    relationshipMotifs.push("Graph motifs are sparse; no strong co-invest pattern surfaced in the current snapshot.");
  }

  const centralEntities = [
    ...overlapFunds.slice(0, 4).map((entry) => `${entry.fund.name} (co-invest overlap ${entry.sharedCount})`),
    ...hubCompanies
      .filter((entry) => entry.investorCount > 1)
      .slice(0, 4)
      .map((entry) => `${entry.company} (${entry.investorCount} linked investors)`),
  ].slice(0, 8);

  const bridgingPaths = hubCompanies
    .filter((entry) => entry.investorNames.length > 0)
    .slice(0, 4)
    .map((entry) => {
      const bridgeFund = entry.investorNames[0];
      return `${input.fund.name} -> ${entry.company} <- ${bridgeFund}`;
    });
  if (!bridgingPaths.length && overlapFunds[0]?.sharedCompanies[0]) {
    bridgingPaths.push(`${input.fund.name} -> ${overlapFunds[0].sharedCompanies[0]} <- ${overlapFunds[0].fund.name}`);
  }

  const suggestedNextActions = [
    overlapFunds[0]
      ? `Compare overlap concentration against ${overlapFunds[0].fund.name} to isolate differentiated sourcing.`
      : "Expand one hop from the highest-confidence fund node to discover comparable co-invest paths.",
    hubCompanies[0]
      ? `Investigate whether ${hubCompanies[0].company} is a conviction anchor or a crowded consensus bet.`
      : "Open one portfolio node and inspect the strongest neighboring edge cluster.",
    "Run a path query between this fund and a top overlap fund to validate bridge quality before memo finalization.",
  ];

  return {
    relationshipMotifs,
    centralEntities,
    bridgingPaths,
    suggestedNextActions,
    traceability:
      input.graphEdges.length > 0
        ? "Traceability: graph motifs are derived from current fundgraph topology and portfolio overlap (heuristic; edge-level citations may be limited)."
        : "Traceability: no graph edges available; insights are portfolio-overlap heuristics only.",
  };
}

function buildWatchlistGraphInsights(input: {
  funds: Fund[];
  graphEdges: GraphEdge[];
}): GraphAnalyzerInsightSummary {
  const fundIdSet = new Set(input.funds.map((fund) => fund.id));
  const pairOverlaps: Array<{ left: Fund; right: Fund; count: number; sharedCompanies: string[] }> = [];
  for (let leftIdx = 0; leftIdx < input.funds.length; leftIdx += 1) {
    for (let rightIdx = leftIdx + 1; rightIdx < input.funds.length; rightIdx += 1) {
      const left = input.funds[leftIdx];
      const right = input.funds[rightIdx];
      const overlap = sharedPortfolioCount(left, right);
      pairOverlaps.push({ left, right, count: overlap.count, sharedCompanies: overlap.sharedCompanies });
    }
  }
  pairOverlaps.sort((a, b) => b.count - a.count);

  const investorMap = companyInvestorMap(input.funds);
  const sharedCompanies = Array.from(investorMap.entries())
    .filter(([, investors]) => investors.size >= 2)
    .map(([company, investors]) => ({ company, investors: Array.from(investors), count: investors.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const watchlistGraphEdges = input.graphEdges.filter((edge) => {
    const fromFund = edge.fromType === "fund" && fundIdSet.has(edge.fromId);
    const toFund = edge.toType === "fund" && fundIdSet.has(edge.toId);
    return fromFund || toFund;
  });
  const relationTop = sortedTopRelations(watchlistGraphEdges).slice(0, 3);

  const relationshipMotifs = [
    pairOverlaps[0]
      ? `Notable shared exposure: ${pairOverlaps[0].left.name} and ${pairOverlaps[0].right.name} share ${pairOverlaps[0].count} companies.`
      : "No strong pairwise overlap detected across selected funds.",
    sharedCompanies[0]
      ? `Most connected shared company: ${sharedCompanies[0].company} (${sharedCompanies[0].count} selected funds linked).`
      : "No multi-fund company hubs in this watchlist snapshot.",
  ];
  if (relationTop.length) {
    relationshipMotifs.push(`Dominant graph relations across selected funds: ${relationTop.map((item) => `${item.relation} (${item.count})`).join(", ")}.`);
  }

  const centralEntities = [
    ...pairOverlaps
      .filter((pair) => pair.count > 0)
      .slice(0, 4)
      .map((pair) => `${pair.left.name} + ${pair.right.name} (${pair.count} shared companies)`),
    ...sharedCompanies.slice(0, 4).map((entry) => `${entry.company} (${entry.count} connected funds)`),
  ].slice(0, 8);

  const bridgingPaths = pairOverlaps
    .filter((pair) => pair.sharedCompanies.length > 0)
    .slice(0, 4)
    .map((pair) => `${pair.left.name} -> ${pair.sharedCompanies[0]} <- ${pair.right.name}`);

  const suggestedNextActions = [
    pairOverlaps[0]
      ? `Review shared-company coverage between ${pairOverlaps[0].left.name} and ${pairOverlaps[0].right.name}.`
      : "Use a path query between two selected funds to identify latent bridges.",
    sharedCompanies[0]
      ? `Validate whether ${sharedCompanies[0].company} is a durable shared conviction within this watchlist.`
      : "Expand one selected fund neighborhood to find potential bridging companies.",
    "Prioritize diligence on entities that recur across overlap and path analyses.",
  ];

  return {
    relationshipMotifs,
    centralEntities,
    bridgingPaths,
    suggestedNextActions,
    traceability:
      watchlistGraphEdges.length > 0
        ? "Traceability: insights combine watchlist overlap structure with current graph topology (heuristic; direct edge citations may be limited)."
        : "Traceability: insights are derived from watchlist portfolio overlap heuristics only.",
  };
}

function draftOpenQuestions(input: {
  fund: Fund;
  options: MemoOptions;
  claims: NewsClaim[];
  signals: Signal[];
  conflictCount: number;
  missingDataGaps: string[];
}): string[] {
  const questions = new Set<string>();

  questions.add(`What are the next 2 milestones for ${input.fund.name} over the next 6-12 months that would increase conviction?`);
  questions.add(`Which portfolio companies drive most of ${input.fund.name}'s upside, and what is the concentration risk if they slow down?`);
  questions.add("Which claims in this memo can be validated with primary sources (filings, investor letters, or portfolio disclosures)?");
  questions.add("What would have to be true for this fund to outperform peer managers in the same stage and geography?");

  if (!input.signals.length && input.options.includeSignals) {
    questions.add("Which channel checks should be run to replace missing recent signal coverage?");
  }
  if (!input.claims.length) {
    questions.add("Which third-party sources can independently validate strategy execution and portfolio momentum?");
  }
  if (input.conflictCount > 0) {
    questions.add("Which disputed claims have the highest impact on the allocation decision, and what evidence would resolve them quickly?");
  }
  for (const gap of input.missingDataGaps) {
    if (gap.includes("AUM")) questions.add("Can we verify current AUM and reserve policy from a recent manager update?");
    if (gap.includes("GP")) questions.add("Can we validate GP track records and attribution from prior funds?");
  }

  return [...questions].slice(0, MEMO_DEPTH[input.options.memoType].questionLimit);
}

function toSectionMarkdown(title: string, content: string): string[] {
  return [`## ${title}`, content, ""];
}

function memoLlmEnabled(): boolean {
  return process.env.FUNDGRAPH_MEMO_USE_LLM === "1" && Boolean(process.env.OPENAI_API_KEY);
}

function slugifyKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function normalizeLlmSections(
  sections: Array<{ key: string; title: string; content: string }>
): MemoSection[] {
  const out: MemoSection[] = [];
  const seen = new Set<string>();

  for (const section of sections) {
    const title = (section.title ?? "").trim();
    const content = (section.content ?? "").trim();
    if (!title || !content) continue;
    const key = slugifyKey(section.key || title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, title, content });
  }

  return out;
}

export async function generateFundMemo(input: GenerateFundMemoInput): Promise<GenerateMemoOutput> {
  const options = normalizeMemoOptions(input);
  const depth = MEMO_DEPTH[options.memoType];
  const context = await collectFundMemoContext(input, options);

  const allSignals = context.signals;
  const allClaims = context.claims;
  const topSignals = allSignals.slice(0, depth.signalLimit);
  const topClaims = allClaims.slice(0, depth.claimLimit);
  const { citations, citationByClaimId, citationBySignalId } = buildCitations(allClaims, allSignals);

  const positiveSignals = allSignals
    .filter((signal) => signal.confidence >= 0.65 && signalVerifies(signal) >= signalDisagrees(signal))
    .slice(0, depth.signalLimit * 2);
  const negativeSignals = allSignals
    .filter((signal) => signal.confidence < 0.55 || signalDisagrees(signal) > signalVerifies(signal))
    .slice(0, depth.signalLimit * 2);

  const positiveClaims = allClaims
    .filter((claim) => {
      const trustScore = safeNum(claim.community.trustScore > 1 ? claim.community.trustScore / 100 : claim.community.trustScore);
      return trustScore >= 0.6 || claim.llmConfidence >= 0.75;
    })
    .slice(0, depth.claimLimit * 2);

  const contestedClaims = allClaims
    .filter((claim) => claimDisagrees(claim) > claimVerifies(claim) || claim.llmVerification?.verdict === "unsupported")
    .slice(0, depth.claimLimit * 2);

  const missingDataGaps: string[] = [];
  if (!Number.isFinite(context.fund.aumM) || context.fund.aumM <= 0) missingDataGaps.push("AUM not available");
  if (!context.fund.gp?.name?.trim()) missingDataGaps.push("GP profile is incomplete");
  if (!context.fund.portfolio?.length) missingDataGaps.push("Portfolio coverage is thin");

  const positiveScore = positiveSignals.length * 2 + positiveClaims.length + (context.fund.trendScore >= 70 ? 2 : 0);
  const riskScore = negativeSignals.length * 2 + contestedClaims.length + context.conflictClaimPairs.length + missingDataGaps.length;

  let recommendation: "Pursue" | "Monitor" | "Pass" = "Monitor";
  if (positiveScore >= riskScore + 3) recommendation = "Pursue";
  if (positiveScore + 1 < riskScore) recommendation = "Pass";

  const confidence = confidenceLabel(Math.min(1, (citations.length * 0.08 + Math.max(0, positiveScore - riskScore) * 0.05 + 0.45)));

  const executiveSummaryLines = [
    `- Subject: ${context.fund.name}`,
    "- Decision question: Should we spend more diligence time on this fund now?",
    `- Preliminary view: ${recommendation} (${confidence} confidence).`,
    `- Why now: ${whyNowLine(context.fund, topSignals)}`,
    `- Evidence packet: ${allSignals.length} unique signals, ${allClaims.length} unique claims, ${citations.length} citations.`,
  ];

  const fundOverviewLines = [
    `- Fund type: ${context.fund.fundType ?? "Unknown"}`,
    `- AUM: ${context.fund.aumM ? `$${context.fund.aumM}M` : "Unknown"}`,
    `- Vintage: ${context.fund.vintageYear || "Unknown"}`,
    `- Stage focus: ${(context.fund.stages ?? []).join(", ") || "Unknown"}`,
    `- Geography: ${(context.fund.geographies ?? context.fund.geography ?? []).join(", ") || "Unknown"}`,
    `- Sector focus: ${(context.fund.sectors ?? []).join(", ") || "Unknown"}`,
    `- Check size: ${interpolateCheckRange(context.fund)}`,
  ];

  const teamLines = [
    `- GP lead: ${context.fund.gp?.name ?? "Unknown"} (${context.fund.gp?.title ?? "Unknown role"})`,
    `- Prior firms: ${(context.fund.gp?.previousFirms ?? []).join(", ") || "Unknown"}`,
    `- Focus areas: ${(context.fund.gp?.focusAreas ?? []).join(", ") || "Unknown"}`,
    `- Reputation signals: ${context.fund.gp?.bio ? context.fund.gp.bio : "Unknown; biography details are limited."}`,
  ];

  const strategyLines = [
    `- Stated strategy: ${context.fund.strategy || context.fund.description || "Unknown"}`,
    `- Differentiation hypothesis: ${(context.fund.sectors ?? []).slice(0, 3).join(", ") || "Unknown"} coverage with ${(context.fund.stages ?? []).join("/") || "Unknown"} stage focus.`,
  ];
  if (context.profile) {
    const overlap = (context.fund.sectors ?? []).filter((sector) => context.profile?.sectorFocus.includes(sector));
    strategyLines.push(`- LP profile fit: ${overlap.length ? `Sector overlap in ${overlap.slice(0, 3).join(", ")}.` : "Low direct overlap from saved profile."}`);
  }

  const portfolioLines = options.includePortfolio
    ? [
        `- Notable portfolio companies: ${(context.fund.portfolio ?? []).slice(0, 10).join(", ") || "Unknown"}`,
        `- Portfolio size: ${context.fund.portfolioMetrics?.portfolioSize ?? context.fund.portfolio?.length ?? "Unknown"}`,
        `- Lead investment rate: ${typeof context.fund.portfolioMetrics?.leadInvestmentRate === "number" ? `${context.fund.portfolioMetrics.leadInvestmentRate}%` : "Unknown"}`,
        `- Follow-on rate: ${typeof context.fund.portfolioMetrics?.followOnRate === "number" ? `${context.fund.portfolioMetrics.followOnRate}%` : "Unknown"}`,
        `- Co-invest behavior: ${(context.fund.coInvestors ?? []).slice(0, 6).join(", ") || "Unknown"}`,
      ]
    : ["- Portfolio section excluded by memo options."];

  const signalLines = options.includeSignals
    ? topSignals.length
      ? topSignals.map((signal) => {
          const verifies = signalVerifies(signal);
          const disagrees = signalDisagrees(signal);
          const marker = citationTagFromId(citationBySignalId.get(signal.id));
          return `- ${signal.title} (${Math.round(signal.confidence * 100)}% confidence, ${verifies} verify / ${disagrees} dispute, ${toIsoDate(signal.createdAt)}). ${marker}`;
        })
      : ["- No linked signals in the selected time window."]
    : ["- Signals excluded by memo options."];
  if (options.includeSignals && allSignals.length > topSignals.length) {
    signalLines.push(`- Showing top ${topSignals.length} of ${allSignals.length} unique signals; full evidence is listed in Citations.`);
  }

  const networkLines = options.includeGraphContext
    ? (() => {
        const relations = sortedTopRelations(context.graphEdges);
        const relationText = relations.length
          ? relations.map((item) => `${item.relation} (${item.count})`).join(", ")
          : "Unknown";
        return [
          `- Connected edges in graph: ${context.graphEdges.length}`,
          `- Dominant relationship paths: ${relationText}`,
          `- Co-investor adjacency: ${(context.fund.coInvestors ?? []).slice(0, 8).join(", ") || "Unknown"}`,
          `- Founder adjacency: ${(context.fund.founders ?? []).slice(0, 6).join(", ") || "Unknown"}`,
        ];
      })()
    : ["- Graph/network context excluded by memo options."];

  const graphAnalyzerInsights = options.includeGraphContext
    ? buildFundGraphAnalyzerInsights({
        fund: context.fund,
        allFunds: context.allFunds,
        graphEdges: context.graphEdges,
      })
    : null;

  const graphAnalyzerInsightLines = options.includeGraphContext
    ? [
        "- Relationship motifs:",
        ...graphAnalyzerInsights!.relationshipMotifs.map((line) => `  - ${line}`),
        "- Central entities:",
        ...graphAnalyzerInsights!.centralEntities.map((line) => `  - ${line}`),
        "- Strongest bridging paths:",
        ...(graphAnalyzerInsights!.bridgingPaths.length
          ? graphAnalyzerInsights!.bridgingPaths.map((line) => `  - ${line}`)
          : ["  - No clear bridge path surfaced in current snapshot."]),
        "- Suggested next actions:",
        ...graphAnalyzerInsights!.suggestedNextActions.map((line) => `  - ${line}`),
        `- ${graphAnalyzerInsights!.traceability}`,
      ]
    : ["- Graph Analyzer Insights excluded by memo options."];

  const graphSnapshot = options.includeGraphContext
    ? buildFundGraphSnapshot({
        fund: context.fund,
        allFunds: context.allFunds,
      })
    : null;

  const graphSnapshotLines = options.includeGraphContext
    ? [
        `![Graph snapshot for ${context.fund.name}](${graphSnapshot!.dataUri})`,
        `- Snapshot focus: ${context.fund.name}.`,
        `- Visible portfolio nodes: ${graphSnapshot!.companies.length}.`,
        `- Visible co-investor hubs: ${graphSnapshot!.overlapFunds.length}.`,
      ]
    : ["- Graph snapshot excluded by memo options."];

  const bullCaseLines: string[] = [];
  if (context.fund.trendScore >= 65) {
    bullCaseLines.push(`- Trend score is elevated at ${context.fund.trendScore}, indicating positive momentum.`);
  }
  bullCaseLines.push(
    ...positiveSignals.slice(0, depth.signalLimit).map((signal) => {
      const marker = citationTagFromId(citationBySignalId.get(signal.id));
      return `- Positive signal: ${signal.title}. ${marker}`;
    })
  );
  bullCaseLines.push(
    ...positiveClaims.slice(0, depth.claimLimit).map((claim) => {
      const marker = citationTagFromId(citationByClaimId.get(claim.id));
      return `- Supporting claim: ${claim.claimText}. ${marker}`;
    })
  );
  if (!bullCaseLines.length) {
    bullCaseLines.push("- Bull case is currently weak due to limited high-confidence support.");
  }

  const riskLines: string[] = [];
  riskLines.push(
    ...negativeSignals.slice(0, depth.signalLimit).map((signal) => {
      const marker = citationTagFromId(citationBySignalId.get(signal.id));
      return `- Signal risk: ${signal.title}. ${marker}`;
    })
  );
  riskLines.push(
    ...contestedClaims.slice(0, depth.claimLimit).map((claim) => {
      const marker = citationTagFromId(citationByClaimId.get(claim.id));
      return `- Contested claim: ${claim.claimText}. ${marker}`;
    })
  );
  if (context.conflictClaimPairs.length) {
    riskLines.push(`- Open conflicts linked to this fund: ${context.conflictClaimPairs.length}.`);
  }
  if (missingDataGaps.length) {
    riskLines.push(...missingDataGaps.map((gap) => `- Data gap: ${gap}.`));
  }
  if (!riskLines.length) {
    riskLines.push("- No major red flags surfaced in current evidence; keep monitoring for hidden downside.");
  }

  if (options.includeCommunityDiscussion) {
    const topCommunityClaims = allClaims
      .filter((claim) => claimVerifies(claim) + claimDisagrees(claim) > 0)
      .slice(0, Math.min(4, depth.claimLimit));
    if (topCommunityClaims.length) {
      signalLines.push("", "Community debate highlights:");
      for (const claim of topCommunityClaims) {
        const marker = citationTagFromId(citationByClaimId.get(claim.id));
        signalLines.push(`- ${claimVerifies(claim)} verify / ${claimDisagrees(claim)} dispute: ${claim.claimText}. ${marker}`);
      }
    }
  }

  const openQuestions = draftOpenQuestions({
    fund: context.fund,
    options,
    claims: topClaims,
    signals: topSignals,
    conflictCount: context.conflictClaimPairs.length,
    missingDataGaps,
  });

  const finalViewLines = [
    `- Recommendation: ${recommendation}`,
    `- Confidence level: ${confidence}`,
    `- Evidence balance: ${positiveScore} positive points vs ${riskScore} risk points.`,
    `- Next action: ${recommendation === "Pursue" ? "Run full diligence sprint" : recommendation === "Monitor" ? "Track for another signal cycle" : "De-prioritize and revisit if evidence improves"}.`,
  ];

  const fallbackSections: MemoSection[] = [
    {
      key: "executive_summary",
      title: "Executive Summary",
      content: executiveSummaryLines.join("\n"),
    },
    {
      key: "fund_overview",
      title: "Fund Overview",
      content: fundOverviewLines.join("\n"),
    },
    {
      key: "team_gp_assessment",
      title: "Team / GP Assessment",
      content: teamLines.join("\n"),
    },
    {
      key: "strategy",
      title: "Strategy",
      content: strategyLines.join("\n"),
    },
    {
      key: "portfolio_snapshot",
      title: "Portfolio Snapshot",
      content: portfolioLines.join("\n"),
    },
    {
      key: "key_signals_recent_activity",
      title: "Key Signals & Recent Activity",
      content: signalLines.join("\n"),
    },
    {
      key: "network_position",
      title: "Network Position",
      content: networkLines.join("\n"),
    },
    {
      key: "graph_snapshot",
      title: "Graph Snapshot",
      content: graphSnapshotLines.join("\n"),
    },
    {
      key: "graph_analyzer_insights",
      title: "Graph Analyzer Insights",
      content: graphAnalyzerInsightLines.join("\n"),
    },
    {
      key: "bull_case",
      title: "Bull Case",
      content: bullCaseLines.join("\n"),
    },
    {
      key: "risks_concerns",
      title: "Risks / Concerns",
      content: riskLines.join("\n"),
    },
    {
      key: "open_questions",
      title: "Open Questions / What to Verify Next",
      content: openQuestions.map((question, idx) => `${idx + 1}. ${question}`).join("\n"),
    },
    {
      key: "final_view",
      title: "Final View",
      content: finalViewLines.join("\n"),
    },
  ];

  let sections: MemoSection[] = fallbackSections;
  let generationMode: MemoGenerationMode = "deterministic";
  if (memoLlmEnabled()) {
    try {
      const llm = await withTimeout(
        generateFundMemoWithLlm({
          subject: {
            fundId: context.fund.id,
            fundName: context.fund.name,
          },
          options: {
            memoType: options.memoType,
            includeSignals: options.includeSignals,
            includePortfolio: options.includePortfolio,
            includeGraphContext: options.includeGraphContext,
            includeCommunityDiscussion: options.includeCommunityDiscussion,
            timeWindow: options.timeWindow,
          },
          packet: {
            fund: {
              id: context.fund.id,
              name: context.fund.name,
              description: context.fund.description,
              aumM: context.fund.aumM,
              vintageYear: context.fund.vintageYear,
              stages: context.fund.stages,
              sectors: context.fund.sectors,
              geographies: context.fund.geographies,
              strategy: context.fund.strategy,
              gp: context.fund.gp,
              portfolio: context.fund.portfolio,
              coInvestors: context.fund.coInvestors,
              founders: context.fund.founders,
            },
            signals: allSignals.map((signal) => ({
              id: signal.id,
              citationId: citationBySignalId.get(signal.id),
              title: signal.title,
              summary: signal.summary,
              confidence: signal.confidence,
              createdAt: signal.createdAt,
              verifies: signalVerifies(signal),
              disputes: signalDisagrees(signal),
              evidenceUrl: signal.evidence?.url ?? signal.evidenceUrl,
              evidenceSnippet: signal.evidence?.snippet ?? signal.evidenceSnippet,
            })),
            claims: allClaims.map((claim) => ({
              id: claim.id,
              citationId: citationByClaimId.get(claim.id),
              claimText: claim.claimText,
              category: claim.category,
              entities: claim.entities,
              llmConfidence: claim.llmConfidence,
              createdAt: claim.createdAt,
              verifies: claimVerifies(claim),
              disputes: claimDisagrees(claim),
              citation: claim.citation,
            })),
            graph: {
              edgeCount: context.graphEdges.length,
              dominantRelations: sortedTopRelations(context.graphEdges),
              analyzerInsights: graphAnalyzerInsights,
            },
            conflicts: context.conflictClaimPairs,
            riskFlags: {
              missingDataGaps,
              negativeSignalCount: negativeSignals.length,
              contestedClaimCount: contestedClaims.length,
            },
            scoring: {
              recommendation,
              confidence,
              positiveScore,
              riskScore,
            },
          },
        }),
        MEMO_LLM_TIMEOUT_MS,
        "memo_llm_timeout"
      );
      const llmSections = normalizeLlmSections(llm.sections);
      if (llmSections.length >= 8) {
        sections = llmSections;
        generationMode = "llm";
      }
    } catch {
      // Fallback to deterministic memo when LLM call fails or is unavailable.
    }
  }

  const graphSnapshotSection: MemoSection = {
    key: "graph_snapshot",
    title: "Graph Snapshot",
    content: graphSnapshotLines.join("\n"),
  };
  const graphInsightsSection: MemoSection = {
    key: "graph_analyzer_insights",
    title: "Graph Analyzer Insights",
    content: graphAnalyzerInsightLines.join("\n"),
  };
  sections = upsertSection(sections, graphSnapshotSection, "network_position");
  sections = upsertSection(sections, graphInsightsSection, "graph_snapshot");

  const markdownLines = [
    `# ${memoTitleForType(options.memoType)}: ${context.fund.name}`,
    "",
    ...sections.flatMap((section) => toSectionMarkdown(section.title, section.content)),
    "## Citations",
    ...citations.map((citation) => {
      const urlPart = citation.url ? ` (${citation.url})` : "";
      return `- [${citation.id}] ${citation.title}${urlPart}: ${citation.snippet}`;
    }),
  ];

  return {
    memoMarkdown: markdownLines.join("\n"),
    sections,
    citations,
    options,
    fundIds: [context.fund.id],
    primaryFundId: context.fund.id,
    generationMode,
  };
}

export async function generateWatchlistBrief(input: GenerateWatchlistBriefInput): Promise<GenerateMemoOutput> {
  const uniqueFundIds = Array.from(new Set(input.fundIds.map((id) => id.trim()).filter(Boolean)));
  if (uniqueFundIds.length < 2) {
    throw new Error("watchlist_requires_multiple_funds");
  }

  const options = normalizeMemoOptions({
    ...input,
    memoType: input.memoType ?? "quick_brief",
    timeWindow: input.timeWindow ?? "30d",
  });
  const includeClaims = input.includeClaims ?? true;

  const [allFunds, allSignals, allClaims, allClaimLinks, allGraphEdges] = await Promise.all([
    readFunds(),
    getSignals(),
    getClaims(),
    getClaimLinks(),
    options.includeGraphContext ? readGraphEdges() : Promise.resolve([] as GraphEdge[]),
  ]);
  const fundIdSet = new Set(uniqueFundIds);

  const linksByClaimId = new Map<string, ClaimLink[]>();
  for (const link of allClaimLinks) {
    const bucket = linksByClaimId.get(link.claimId) ?? [];
    bucket.push(link);
    linksByClaimId.set(link.claimId, bucket);
  }

  const selectedFunds = uniqueFundIds
    .map((id) => allFunds.find((fund) => fund.id === id || fund.slug === id))
    .filter((fund): fund is Fund => Boolean(fund));

  if (selectedFunds.length < 2) {
    throw new Error("fund_not_found");
  }

  const referenceSignals = options.includeSignals ? allSignals.filter((signal) => fundIdSet.has(signal.fundId)) : [];
  const referenceClaims = includeClaims ? allClaims.filter((claim) => claimMatchesFund(claim, fundIdSet, linksByClaimId)) : [];
  const referenceTs = computeReferenceTimestamp(
    referenceSignals,
    referenceClaims
  );
  const startTs = windowStart(options.timeWindow, referenceTs);

  const watchlistEntries = selectedFunds.map((fund) => {
    const signals = options.includeSignals
      ? dedupeSignals(
          allSignals
            .filter((signal) => signal.fundId === fund.id)
            .filter((signal) => inWindow(signal.createdAt, startTs))
        )
      : [];

    const claims = includeClaims
      ? dedupeClaims(
          allClaims
            .filter((claim) => claimMatchesFund(claim, new Set([fund.id]), linksByClaimId))
            .filter((claim) => inWindow(claim.createdAt, startTs))
        )
      : [];

    const highSignals = signals.filter((signal) => signal.confidence >= 0.65 && signalVerifies(signal) >= signalDisagrees(signal)).length;
    const riskSignals = signals.filter((signal) => signal.confidence < 0.55 || signalDisagrees(signal) > signalVerifies(signal)).length;
    const contestedClaims = claims.filter((claim) => claimDisagrees(claim) > claimVerifies(claim)).length;

    return {
      fund,
      signals,
      claims,
      highSignals,
      riskSignals,
      contestedClaims,
    };
  });

  const allWatchlistSignals = options.includeSignals ? dedupeSignals(watchlistEntries.flatMap((entry) => entry.signals)) : [];
  const topSignals = (() => {
    const bySignature = new Map<string, { signal: Signal; fund: Fund }>();
    for (const entry of watchlistEntries) {
      for (const signal of entry.signals) {
        const key = signalSignature(signal);
        const existing = bySignature.get(key);
        if (!existing || signal.confidence > existing.signal.confidence) {
          bySignature.set(key, { signal, fund: entry.fund });
        }
      }
    }
    return [...bySignature.values()].sort((a, b) => b.signal.confidence - a.signal.confidence).slice(0, 8);
  })();
  const allWatchlistClaims = includeClaims ? dedupeClaims(watchlistEntries.flatMap((entry) => entry.claims)) : [];

  const { citations, citationBySignalId, citationByClaimId } = buildCitations(allWatchlistClaims, allWatchlistSignals);
  const fundNameById = new Map(watchlistEntries.map((entry) => [entry.fund.id, entry.fund.name] as const));
  const todayStartTs = referenceTs - 24 * 60 * 60 * 1000;
  const todaySignals = allWatchlistSignals
    .filter((signal) => inWindow(signal.createdAt, todayStartTs))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 6);
  const todayClaims = allWatchlistClaims
    .filter((claim) => inWindow(claim.createdAt, todayStartTs))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 4);

  function claimFundLabel(claim: NewsClaim): string {
    const direct = (claim.linkedFundIds ?? []).find((id) => fundNameById.has(id));
    if (direct) return fundNameById.get(direct)!;
    const link = (linksByClaimId.get(claim.id) ?? []).find((item) => item.targetType === "FUND" && fundNameById.has(item.targetId));
    if (link) return fundNameById.get(link.targetId)!;
    return "Watchlist";
  }

  const sharedThemeCounts = new Map<string, number>();
  for (const signal of allWatchlistSignals) {
    for (const tag of signal.tags ?? []) {
      const cleanTag = tag.trim();
      if (!cleanTag) continue;
      sharedThemeCounts.set(cleanTag, (sharedThemeCounts.get(cleanTag) ?? 0) + 1);
    }
  }
  const topSharedThemes = [...sharedThemeCounts.entries()]
    .map(([theme, count]) => ({ theme, count }))
    .sort((left, right) => right.count - left.count || left.theme.localeCompare(right.theme))
    .slice(0, 6);

  const watchlistGraphInsights = options.includeGraphContext
    ? buildWatchlistGraphInsights({
        funds: watchlistEntries.map((entry) => entry.fund),
        graphEdges: allGraphEdges,
      })
    : null;

  const watchlistSnapshot = options.includeGraphContext
    ? buildWatchlistGraphSnapshot(watchlistEntries.map((entry) => entry.fund))
    : null;

  const snapshotSection: MemoSection = {
    key: "watchlist_snapshot",
    title: "Watchlist Snapshot",
    content: [
      `- Funds in scope: ${watchlistEntries.map((entry) => entry.fund.name).join(", ")}`,
      `- Time window: ${options.timeWindow}`,
      `- Brief date: ${toIsoDate(new Date(referenceTs).toISOString())}`,
      `- Coverage: ${allWatchlistSignals.length} unique signals, ${allWatchlistClaims.length} unique claims, ${citations.length} citations.`,
      "- Purpose: Consolidated research dossier to revisit selected funds and track shared signals over time.",
    ].join("\n"),
  };

  const todayHighlightsSection: MemoSection = {
    key: "today_highlights",
    title: "Today Highlights",
    content:
      todaySignals.length || todayClaims.length
        ? [
            ...todaySignals.map((signal) => {
              const marker = citationTagFromId(citationBySignalId.get(signal.id));
              const fundName = fundNameById.get(signal.fundId) ?? signal.fundId;
              return `- ${fundName}: ${signal.title} (${Math.round(signal.confidence * 100)}% confidence, ${toIsoDate(signal.createdAt)}). ${marker}`;
            }),
            ...todayClaims.map((claim) => {
              const marker = citationTagFromId(citationByClaimId.get(claim.id));
              return `- ${claimFundLabel(claim)} claim update: ${claim.claimText}. ${marker}`;
            }),
          ].join("\n")
        : "- No major watchlist updates detected in the most recent 24-hour window.",
  };

  const rankingSection: MemoSection = {
    key: "watchlist_ranking",
    title: "Selected Funds Research Notes",
    content: watchlistEntries
      .map((entry) => {
        const signalCoverage = options.includeSignals
          ? `${entry.signals.length} signals (${entry.highSignals} positive / ${entry.riskSignals} risk)`
          : "signals excluded by options";
        const claimCoverage = includeClaims
          ? `${entry.claims.length} claims (${entry.contestedClaims} contested)`
          : "claims excluded by options";
        return `- ${entry.fund.name}: ${signalCoverage}; ${claimCoverage}; trend index ${entry.fund.trendScore}.`;
      })
      .join("\n"),
  };

  const signalSection: MemoSection = {
    key: "watchlist_key_signals",
    title: "Combined Signal Synthesis",
    content: !options.includeSignals
      ? "- Signals were excluded by options."
      : [
          topSharedThemes.length
            ? `- Shared themes across selected funds: ${topSharedThemes.map((item) => `${item.theme} (${item.count})`).join(", ")}.`
            : "- Shared themes across selected funds: Data gap.",
          ...(topSignals.length
            ? topSignals.map((item) => {
                const marker = citationTagFromId(citationBySignalId.get(item.signal.id));
                return `- ${item.fund.name}: ${item.signal.title} (${Math.round(item.signal.confidence * 100)}% confidence). ${marker}`;
              })
            : ["- No linked signals were found in the selected window."]),
        ].join("\n"),
  };

  const crossFundNetworkSection: MemoSection = {
    key: "cross_fund_network_signals",
    title: "Shared Network Context",
    content: options.includeGraphContext
      ? [
          "- Relationship motifs:",
          ...watchlistGraphInsights!.relationshipMotifs.map((line) => `  - ${line}`),
          "- Central entities:",
          ...watchlistGraphInsights!.centralEntities.map((line) => `  - ${line}`),
          "- Bridging paths:",
          ...(watchlistGraphInsights!.bridgingPaths.length
            ? watchlistGraphInsights!.bridgingPaths.map((line) => `  - ${line}`)
            : ["  - No explicit bridge path surfaced in this snapshot."]),
          "- Suggested next actions:",
          ...watchlistGraphInsights!.suggestedNextActions.map((line) => `  - ${line}`),
          `- ${watchlistGraphInsights!.traceability}`,
        ].join("\n")
      : "- Shared network context excluded by memo options.",
  };

  const graphSnapshotSection: MemoSection = {
    key: "graph_snapshot",
    title: "Graph Snapshot",
    content: options.includeGraphContext
      ? [
          `![Watchlist graph snapshot](${watchlistSnapshot!.dataUri})`,
          `- Focus funds: ${watchlistSnapshot!.focusFunds.join(", ") || "Watchlist anchors"}.`,
          `- Shared company bridges shown: ${watchlistSnapshot!.sharedCompanies.length}.`,
        ].join("\n")
      : "- Graph snapshot excluded by memo options.",
  };

  const riskSection: MemoSection = {
    key: "watchlist_risks",
    title: "Watchlist Risk Signals",
    content: watchlistEntries
      .filter((entry) => entry.riskSignals > 0 || entry.contestedClaims > 0)
      .map((entry) => `- ${entry.fund.name}: ${entry.riskSignals} risk signals and ${entry.contestedClaims} contested claims.`)
      .join("\n") || "- No concentrated watchlist risk pattern detected in current data.",
  };

  const nextStepsSection: MemoSection = {
    key: "watchlist_next_steps",
    title: "Recommended Next Steps",
    content: [
      "1. Generate or refresh full Investment Memos for selected funds with unresolved evidence gaps.",
      "2. Validate disputed claims with primary-source evidence before committing more diligence time.",
      "3. Revisit this watchlist after the next signal cycle (30-90 days) and update confidence notes.",
    ].join("\n"),
  };

  const fallbackSections = [
    snapshotSection,
    todayHighlightsSection,
    rankingSection,
    signalSection,
    graphSnapshotSection,
    crossFundNetworkSection,
    riskSection,
    nextStepsSection,
  ];
  let sections = fallbackSections;
  let generationMode: MemoGenerationMode = "deterministic";
  if (memoLlmEnabled()) {
    try {
      const llm = await withTimeout(
        generateWatchlistBriefWithLlm({
          subject: {
            fundIds: watchlistEntries.map((entry) => entry.fund.id),
            fundNames: watchlistEntries.map((entry) => entry.fund.name),
            briefDate: toIsoDate(new Date(referenceTs).toISOString()),
          },
          options: {
            memoType: options.memoType,
            includeSignals: options.includeSignals,
            includeClaims,
            includePortfolio: options.includePortfolio,
            includeGraphContext: options.includeGraphContext,
            includeCommunityDiscussion: options.includeCommunityDiscussion,
            timeWindow: options.timeWindow,
          },
          packet: {
            fundResearch: watchlistEntries.map((entry) => ({
              fundId: entry.fund.id,
              fundName: entry.fund.name,
              trendScore: entry.fund.trendScore,
              totalSignals: entry.signals.length,
              totalClaims: entry.claims.length,
              highSignals: entry.highSignals,
              riskSignals: entry.riskSignals,
              contestedClaims: entry.contestedClaims,
            })),
            today: {
              signals: todaySignals.map((signal) => ({
                id: signal.id,
                citationId: citationBySignalId.get(signal.id),
                fundId: signal.fundId,
                fundName: fundNameById.get(signal.fundId) ?? signal.fundId,
                title: signal.title,
                summary: signal.summary,
                confidence: signal.confidence,
                createdAt: signal.createdAt,
              })),
              claims: todayClaims.map((claim) => ({
                id: claim.id,
                citationId: citationByClaimId.get(claim.id),
                fundName: claimFundLabel(claim),
                claimText: claim.claimText,
                category: claim.category,
                createdAt: claim.createdAt,
                verifies: claimVerifies(claim),
                disputes: claimDisagrees(claim),
              })),
            },
            signals: allWatchlistSignals.slice(0, 120).map((signal) => ({
              id: signal.id,
              citationId: citationBySignalId.get(signal.id),
              fundName: fundNameById.get(signal.fundId) ?? signal.fundId,
              title: signal.title,
              summary: signal.summary,
              confidence: signal.confidence,
              createdAt: signal.createdAt,
              verifies: signalVerifies(signal),
              disputes: signalDisagrees(signal),
            })),
            claims: allWatchlistClaims.slice(0, 120).map((claim) => ({
              id: claim.id,
              citationId: citationByClaimId.get(claim.id),
              fundName: claimFundLabel(claim),
              claimText: claim.claimText,
              category: claim.category,
              createdAt: claim.createdAt,
              verifies: claimVerifies(claim),
              disputes: claimDisagrees(claim),
            })),
            graph: {
              edgeCount: allGraphEdges.length,
              dominantRelations: sortedTopRelations(allGraphEdges),
              analyzerInsights: watchlistGraphInsights,
            },
            citations: citations.map((citation) => ({
              id: citation.id,
              type: citation.type,
              title: citation.title,
              url: citation.url,
              snippet: citation.snippet,
            })),
          },
        }),
        MEMO_LLM_TIMEOUT_MS,
        "memo_llm_timeout"
      );
      const llmSections = normalizeLlmSections(llm.sections);
      if (llmSections.length >= 5) {
        sections = llmSections;
        generationMode = "llm";
      }
    } catch {
      // Fallback to deterministic watchlist brief when LLM synthesis fails or is unavailable.
    }
  }

  sections = upsertSection(sections, graphSnapshotSection, "watchlist_key_signals");
  sections = upsertSection(sections, crossFundNetworkSection, "graph_snapshot");

  const markdownLines = [
    `# Watchlist Brief (${memoTitleForType(options.memoType)})`,
    "",
    ...sections.flatMap((section) => toSectionMarkdown(section.title, section.content)),
    "## Citations",
    ...citations.map((citation) => {
      const urlPart = citation.url ? ` (${citation.url})` : "";
      return `- [${citation.id}] ${citation.title}${urlPart}: ${citation.snippet}`;
    }),
  ];

  return {
    memoMarkdown: markdownLines.join("\n"),
    sections,
    citations,
    options,
    fundIds: watchlistEntries.map((entry) => entry.fund.id),
    generationMode,
  };
}

// Backward-compatible wrapper for legacy callers.
export async function generateAllocationMemo(input: {
  userId?: string;
  fundIds: string[];
  includeSignals?: boolean;
  includeClaims?: boolean;
  memoType?: MemoType;
  includePortfolio?: boolean;
  includeGraphContext?: boolean;
  includeCommunityDiscussion?: boolean;
  timeWindow?: MemoTimeWindow;
}): Promise<GenerateMemoOutput> {
  const fundId = input.fundIds[0];
  if (!fundId) throw new Error("fund_not_found");
  return generateFundMemo({
    userId: input.userId,
    fundId,
    includeSignals: input.includeSignals,
    includeClaims: input.includeClaims,
    memoType: input.memoType,
    includePortfolio: input.includePortfolio,
    includeGraphContext: input.includeGraphContext,
    includeCommunityDiscussion: input.includeCommunityDiscussion,
    timeWindow: input.timeWindow,
  });
}
