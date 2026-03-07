import {
  AdvancedInsightStatus,
  AdvancedSignalInsight,
  ClaimVerificationRecord,
  ContributorRole,
  EvidenceConfidenceTier,
  EvidenceSourceType,
  EvidenceVisibility,
  Fund,
  MachineVerificationBreakdown,
  Memo,
  MemoGenerationMode,
  MemoOptions,
  MemoTimeWindow,
  MemoType,
  MembershipTier,
  NewsClaim,
  Signal,
  SignalStanceType,
  Source,
  UserProfile,
  VerificationConfidenceTier,
} from "@/lib/fundgraph/types";
import { GraphApiResponse } from "@/lib/fundgraph/graphTypes";

type JsonMethod = "GET" | "POST" | "PATCH";
const SESSION_STORAGE_KEY = "fundgraph_session_v2";
const MEMO_GENERATION_TIMEOUT_MS = 120_000;
type RequestJsonOptions = { timeoutMs?: number };
const LOCAL_CACHE_KEY_PREFIX = "fundgraph_api_cache_v1:";
const CACHE_TTL_MS = 45_000;

type CacheEnvelope<T> = { expiresAt: number; payload: T };

const inMemoryCache = new Map<string, CacheEnvelope<unknown>>();
const inFlightGetRequests = new Map<string, Promise<unknown>>();

function makeCacheKey(path: string): string {
  return `${LOCAL_CACHE_KEY_PREFIX}${path}`;
}

function supportsLocalCache(path: string): boolean {
  if (path.includes("/api/fundgraph/signals/") && path.includes("/advanced")) {
    return false;
  }
  return (
    path.startsWith("/api/fundgraph/user") ||
    path.startsWith("/api/fundgraph/profile") ||
    path.startsWith("/api/fundgraph/recommendations") ||
    path.startsWith("/api/fundgraph/funds") ||
    path.startsWith("/api/fundgraph/signals") ||
    path.startsWith("/api/fundgraph/claims")
  );
}

function readLocalCache<T>(path: string): T | null {
  const now = Date.now();
  const key = makeCacheKey(path);
  const memory = inMemoryCache.get(key);
  if (memory && memory.expiresAt > now) {
    return memory.payload as T;
  }

  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed.expiresAt !== "number" || parsed.expiresAt <= now) {
      window.localStorage.removeItem(key);
      return null;
    }
    inMemoryCache.set(key, parsed as CacheEnvelope<unknown>);
    return parsed.payload;
  } catch {
    return null;
  }
}

function writeLocalCache<T>(path: string, payload: T): void {
  const key = makeCacheKey(path);
  const envelope: CacheEnvelope<T> = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  };
  inMemoryCache.set(key, envelope as CacheEnvelope<unknown>);

  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Ignore storage quota or private mode failures.
  }
}

function clearLocalCache(): void {
  inMemoryCache.clear();
  inFlightGetRequests.clear();
  if (typeof window === "undefined") return;
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(LOCAL_CACHE_KEY_PREFIX)) continue;
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage access failures.
  }
}

async function requestJson<T>(path: string, method: JsonMethod, body?: unknown, options?: RequestJsonOptions): Promise<T> {
  const isGet = method === "GET" && !body;
  const canUseCache = isGet && supportsLocalCache(path);
  if (canUseCache) {
    const cached = readLocalCache<T>(path);
    if (cached) return cached;

    const inflight = inFlightGetRequests.get(path);
    if (inflight) return inflight as Promise<T>;
  }

  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";
  const userId = resolveLocalUserId();
  if (userId) headers["x-fundgraph-user-id"] = userId;
  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 0;
  const timeoutId =
    timeoutMs > 0
      ? globalThis.setTimeout(() => {
          controller.abort();
        }, timeoutMs)
      : null;

  const networkRequest = (async () => {
    let res: Response;
    try {
      res = await fetch(path, {
        method,
        headers: Object.keys(headers).length ? headers : undefined,
        body: body ? JSON.stringify(body) : undefined,
        cache: canUseCache ? "default" : "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("request_timeout");
      }
      throw error;
    } finally {
      if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
    }

    const payload = (await res.json().catch(() => ({}))) as T & { error?: string; detail?: unknown };
    if (!res.ok) {
      const reason = typeof payload?.error === "string" ? payload.error : `request_failed:${res.status}`;
      throw new Error(reason);
    }

    if (canUseCache) writeLocalCache(path, payload as T);
    if (!isGet) clearLocalCache();
    return payload as T;
  })();

  if (!canUseCache) return networkRequest;

  inFlightGetRequests.set(path, networkRequest);
  try {
    return await networkRequest;
  } finally {
    inFlightGetRequests.delete(path);
  }
}

function resolveLocalUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: string };
    if (typeof parsed.userId === "string" && parsed.userId.trim()) {
      return parsed.userId.trim();
    }
  } catch {
    // Best-effort local user header.
  }
  return null;
}

export interface FundgraphUserResponse {
  userId: string;
  credits: number;
  contributions: number;
  tier: "visitor" | "contributor" | "analyst" | "insider";
  daily: {
    date: string;
    creditsEarned: number;
    actions: { verify: number; signal: number; source: number; comment?: number; share?: number; upvote?: number };
  };
  reputation: { credScore: number; badge?: string };
  limits: {
    maxClaimsVisible: number;
    maxSignalsVisible: number;
    graphDepth: number;
    memoAllowed: boolean;
    fullAccess: boolean;
    earlySignals: boolean;
  };
}

export interface FundsResponse {
  mode: string;
  count: number;
  funds: Fund[];
}

export interface FundDetailResponse {
  mode: string;
  fund: Fund;
  signals: Signal[];
  claims: NewsClaim[];
}

export interface FundDiscussionItemResponse {
  id: string;
  user: string;
  comment: string;
  timestamp: string;
  votes: number;
  seeded?: boolean;
  signalId?: string;
}

export interface FundDiscussionResponse {
  mode: string;
  fundId: string;
  count: number;
  items: FundDiscussionItemResponse[];
}

export interface ClaimsResponse {
  mode: string;
  count: number;
  claims: Array<NewsClaim & { links?: unknown[] }>;
}

export interface ExtractClaimsResponse {
  mode: string;
  source: { id: string; title?: string; url?: string } | unknown;
  claims: Array<NewsClaim & { links?: unknown[] }>;
  cached: boolean;
  realModePlaceholder?: boolean;
}

export interface VerifyClaimResponse {
  mode: string;
  claim: NewsClaim;
  verificationRecord?: ClaimVerificationRecord;
  verificationSummary?: {
    status: "UNVERIFIED" | "PARTIALLY_VERIFIED" | "VERIFIED" | "DISPUTED";
    finalScore: number;
    confidenceTier: VerificationConfidenceTier;
    publicEvidenceCount: number;
    privateEvidenceCount: number;
    verifyCount: number;
    disputeCount: number;
  };
  verifiedCount: number;
  disputedCount: number;
  trustScore?: number;
  trustTier?: string;
  trustExplanation?: string;
  machineVerification?: MachineVerificationBreakdown;
  llmVerification?: {
    verdict: "supported" | "unsupported" | "mixed";
    confidence: number;
    rationale: string;
    verifiedAt: string;
  };
  contributor: {
    userId: string;
    credScore: number;
    badgeTier: string;
  };
  gamification?: FundgraphUserResponse;
}

export interface ClaimVerificationRecordResponse extends ClaimVerificationRecord {
  mode: string;
  realModePlaceholder?: boolean;
}

export interface AddClaimSourceResponse {
  mode: string;
  claim: NewsClaim;
  verificationRecord?: ClaimVerificationRecord;
  gamification?: FundgraphUserResponse;
  verificationSummary?: {
    status: "UNVERIFIED" | "PARTIALLY_VERIFIED" | "VERIFIED" | "DISPUTED";
    finalScore: number;
    confidenceTier: VerificationConfidenceTier;
    publicEvidenceCount: number;
    privateEvidenceCount: number;
    verifyCount: number;
    disputeCount: number;
  };
}

export interface AddSignalSourceResponse {
  mode: string;
  signal: Signal;
  source: {
    id: string;
    type: string;
    title: string;
    url?: string;
    rawText: string;
    createdAt: string;
  };
  gamification?: FundgraphUserResponse;
}

export interface SignalSourcesResponse {
  mode: string;
  signalId: string;
  count: number;
  sources: Source[];
  signal?: Signal | null;
}

export interface SignalsResponse {
  mode: string;
  count: number;
  signals: Signal[];
}

export interface CreateSignalResponse {
  mode: string;
  signal: Signal;
  contributor: {
    userId: string;
    cred: number;
    badge: string;
  };
  gamification?: FundgraphUserResponse;
}

export interface VerifySignalResponse {
  mode: string;
  signal: Signal;
  verifiedCount: number;
  disputedCount: number;
  trustScore?: number;
  trustTier?: string;
  trustExplanation?: string;
  contributor: {
    userId: string;
    credScore: number;
    badgeTier: string;
  };
  gamification?: FundgraphUserResponse;
}

export interface SetSignalStanceResponse {
  mode: string;
  signal: Signal;
  stance: SignalStanceType;
  stanceCounts: {
    bullish: number;
    neutral: number;
    bearish: number;
  };
  contributor: {
    userId: string;
    credScore: number;
    badgeTier: string;
  };
  gamification?: FundgraphUserResponse;
}

export interface AdvancedSignalInsightResponse {
  mode: string;
  signalId: string;
  status: AdvancedInsightStatus;
  insight?: AdvancedSignalInsight;
  cached: boolean;
  generationVersion: string;
  message?: string;
}

export interface ProfileResponse {
  mode: string;
  userId: string;
  profile: UserProfile | null;
  cred: number;
  user: { id: string; name: string; credScore: number; badgeTier: string } | null;
  recommendations?: Array<{ fund: Fund; score: number; reason: string; reasons?: string[]; explanation?: string }>;
}

export interface SaveProfileResponse {
  mode: string;
  profile: UserProfile;
  user: { id: string; name: string; credScore: number; badgeTier: string } | null;
  recommendations: Array<{ fund: Fund; score: number; reason: string; reasons?: string[]; explanation?: string }>;
}

export interface RecommendationsResponse {
  mode: string;
  userId: string;
  profile: UserProfile;
  recommendations: Array<{ fund: Fund; score: number; reason: string; reasons?: string[]; explanation?: string }>;
}

export interface ProfileActivityResponse {
  mode: string;
  userId: string;
  summary: {
    memosCreated: number;
    signalsPublished: number;
    contributionEvents: number;
    citationsAdded: number;
    verificationActions: number;
    disputesSubmitted: number;
    commentsAdded: number;
    sharesSubmitted: number;
    stancesSubmitted: number;
  };
  recent: {
    memos: Array<{
      id: string;
      title: string;
      memoType: MemoType;
      artifactType: "fund_memo" | "watchlist_brief";
      createdAt: string;
      primaryFundId: string | null;
      primaryFundName: string | null;
    }>;
    publishedSignals: Array<{
      id: string;
      title: string;
      fundId: string;
      fundName: string;
      createdAt: string;
      confidence: number;
      verifies: number;
      disagrees: number;
    }>;
    contributionEvents: Array<{
      id: string;
      type: string;
      targetId: string | null;
      href?: string | null;
      targetLabel?: string | null;
      deltaCredits: number;
      createdAt: string;
    }>;
    verifications: Array<{
      id: string;
      vote: "verify" | "dispute";
      claimId: string | null;
      signalId: string | null;
      targetType: "claim" | "signal" | null;
      createdAt: string;
    }>;
  };
}

export interface FundsByIdsResponse {
  count: number;
  funds: Fund[];
}

export interface MemoResponse {
  mode: string;
  memoId: string;
  memoMarkdown: string;
  artifactType?: "fund_memo" | "watchlist_brief";
  memoType?: MemoType;
  generationMode?: MemoGenerationMode;
  primaryFundId?: string;
  fundId?: string;
  options?: MemoOptions;
  fundIds?: string[];
  createdAt?: string;
  editorHtml?: string;
  isEdited?: boolean;
  lastEditedAt?: string;
  sections: Array<{ key: string; title: string; content: string }>;
  citations: Array<{ id: string; title: string; snippet: string; url?: string }>;
  gamification?: FundgraphUserResponse;
}

export interface MemoGenerationPayload {
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

export interface WatchlistBriefPayload {
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

export interface MemoByIdResponse {
  mode: string;
  memo: Memo;
}

export interface UpdateMemoPayload {
  userId?: string;
  memoMarkdown?: string;
  editorHtml?: string;
}

export type UpdateMemoResponse = MemoByIdResponse;

export interface GraphQueryInterpretationResponse {
  mode: "llm" | "fallback";
  canonicalQuery: string;
  intent?:
    | "path"
    | "funds_in_theme"
    | "companies_linked"
    | "companies_invested_by_fund"
    | "companies_funded_by_both"
    | "search";
  confidence?: number;
  rationale?: string;
}

export interface GraphQueryExplanationPacket {
  preset: string;
  query_label: string;
  query_text?: string;
  query_intent?: string;
  display_mode?: "overview" | "focus" | "expanded";
  focus_entity?: {
    id: string;
    name: string;
    type: string;
  };
  result_summary: {
    node_count: number;
    edge_count: number;
    visible_nodes: Array<{ id: string; name: string; type: string; degree?: number }>;
    visible_edges: Array<{
      source: string;
      target: string;
      type: string;
      cited: boolean;
      citation_count?: number;
    }>;
  };
  query_paths: Array<{
    path_label: string;
    steps: Array<{
      source: string;
      edge_type: string;
      target: string;
      cited: boolean;
    }>;
  }>;
  evidence_stats: {
    cited_coverage_pct: number;
    verified_edges: number;
    unverified_edges: number;
    hidden_metric_slots?: number;
  };
  selected_node?: {
    name: string;
    type: string;
    cited_links?: number;
    top_connections?: Array<{ name: string; edge_type: string; cited: boolean }>;
  };
  selected_edge?: {
    source: string;
    target: string;
    type: string;
    cited: boolean;
  };
}

export interface GraphQueryAnalysisPayload {
  packet: GraphQueryExplanationPacket;
}

export interface GraphQueryAnalysisResponse {
  mode: "llm" | "fallback";
  answer: string;
  derivationSummary: string;
  pathExplanations: string[];
  evidenceQuality: {
    answerConfidence: "low" | "medium" | "high";
    explanation: string;
    verifiedEdges: number;
    unverifiedEdges: number;
    citationCoveragePct: number;
  };
  keyTakeaways: string[];
  nextActions: string[];
}

export async function listFunds(params?: URLSearchParams): Promise<FundsResponse> {
  const query = params?.toString();
  return requestJson<FundsResponse>(`/api/fundgraph/funds${query ? `?${query}` : ""}`, "GET");
}

export async function getFund(idOrSlug: string): Promise<FundDetailResponse> {
  return requestJson<FundDetailResponse>(`/api/fundgraph/funds/${encodeURIComponent(idOrSlug)}`, "GET");
}

export async function getFundDiscussion(idOrSlug: string, limit = 24): Promise<FundDiscussionResponse> {
  return requestJson<FundDiscussionResponse>(
    `/api/fundgraph/funds/${encodeURIComponent(idOrSlug)}/discussion?limit=${Math.max(1, Math.min(100, Math.floor(limit)))}`,
    "GET"
  );
}

export async function listClaims(params?: URLSearchParams): Promise<ClaimsResponse> {
  const query = params?.toString();
  return requestJson<ClaimsResponse>(`/api/fundgraph/claims${query ? `?${query}` : ""}`, "GET");
}

export async function extractClaims(payload: { newsId?: string; sourceId?: string; force?: boolean }): Promise<ExtractClaimsResponse> {
  if (payload.sourceId) {
    return requestJson<ExtractClaimsResponse>("/api/fundgraph/extract_claims_from_source", "POST", {
      sourceId: payload.sourceId,
      force: payload.force,
    });
  }
  return requestJson<ExtractClaimsResponse>("/api/fundgraph/extract_claims", "POST", {
    newsId: payload.newsId,
    force: payload.force,
  });
}

export async function verifyClaim(
  claimId: string,
  payload: {
    userId: string;
    userName?: string;
    vote: "verify" | "dispute";
    note?: string;
    contributor?: {
      label?: string;
      role?: ContributorRole;
      tier?: MembershipTier;
      isAnonymous?: boolean;
    };
  }
): Promise<VerifyClaimResponse> {
  return requestJson<VerifyClaimResponse>(`/api/fundgraph/claims/${encodeURIComponent(claimId)}/verify`, "POST", payload);
}

export async function getClaimVerificationRecord(claimId: string): Promise<ClaimVerificationRecordResponse> {
  return requestJson<ClaimVerificationRecordResponse>(`/api/fundgraph/claims/${encodeURIComponent(claimId)}/verification`, "GET");
}

export async function addClaimSource(
  claimId: string,
  payload: {
    userId?: string;
    sourceType: EvidenceSourceType;
    visibility: EvidenceVisibility;
    title?: string;
    url?: string;
    snippet?: string;
    note?: string;
    confidence?: EvidenceConfidenceTier;
    contributor?: {
      label?: string;
      role?: ContributorRole;
      tier?: MembershipTier;
      isAnonymous?: boolean;
    };
  }
): Promise<AddClaimSourceResponse> {
  return requestJson<AddClaimSourceResponse>(`/api/fundgraph/claims/${encodeURIComponent(claimId)}/sources`, "POST", payload);
}

export async function addSignalSource(
  signalId: string,
  payload: {
    userId?: string;
    sourceType: EvidenceSourceType;
    visibility: EvidenceVisibility;
    title?: string;
    url?: string;
    snippet?: string;
    note?: string;
  }
): Promise<AddSignalSourceResponse> {
  return requestJson<AddSignalSourceResponse>(`/api/fundgraph/signals/${encodeURIComponent(signalId)}/sources`, "POST", payload);
}

export async function getSignalSources(signalId: string): Promise<SignalSourcesResponse> {
  return requestJson<SignalSourcesResponse>(`/api/fundgraph/signals/${encodeURIComponent(signalId)}/sources`, "GET");
}

export async function listSignals(params?: URLSearchParams): Promise<SignalsResponse> {
  const query = params?.toString();
  return requestJson<SignalsResponse>(`/api/fundgraph/signals${query ? `?${query}` : ""}`, "GET");
}

export async function createSignal(payload: {
  fundId: string;
  title: string;
  summary: string;
  confidence: number;
  tags?: string[];
  evidenceUrl?: string;
  evidenceSnippet?: string;
  userId: string;
  userName?: string;
}): Promise<CreateSignalResponse> {
  return requestJson<CreateSignalResponse>("/api/fundgraph/signals", "POST", payload);
}

export async function verifySignal(
  signalId: string,
  payload: { userId: string; userName?: string; vote: "verify" | "dispute"; note?: string }
): Promise<VerifySignalResponse> {
  return requestJson<VerifySignalResponse>(`/api/fundgraph/signals/${encodeURIComponent(signalId)}/verify`, "POST", payload);
}

export async function setSignalStance(
  signalId: string,
  payload: { userId?: string; userName?: string; stance: SignalStanceType }
): Promise<SetSignalStanceResponse> {
  return requestJson<SetSignalStanceResponse>(`/api/fundgraph/signals/${encodeURIComponent(signalId)}/stance`, "POST", payload);
}

export async function getSignalAdvancedInsight(signalId: string): Promise<AdvancedSignalInsightResponse> {
  return requestJson<AdvancedSignalInsightResponse>(`/api/fundgraph/signals/${encodeURIComponent(signalId)}/advanced`, "GET");
}

export async function refreshSignalAdvancedInsight(signalId: string): Promise<AdvancedSignalInsightResponse> {
  return requestJson<AdvancedSignalInsightResponse>(`/api/fundgraph/signals/${encodeURIComponent(signalId)}/advanced/refresh`, "POST");
}

export async function getProfile(userId: string, limit = 6, includeRecommendations = true): Promise<ProfileResponse> {
  const query = new URLSearchParams();
  query.set("userId", userId);
  query.set("limit", String(limit));
  query.set("includeRecommendations", includeRecommendations ? "1" : "0");
  return requestJson<ProfileResponse>(`/api/fundgraph/profile?${query.toString()}`, "GET");
}

export async function getUser(userId?: string): Promise<FundgraphUserResponse> {
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  return requestJson<FundgraphUserResponse>(`/api/fundgraph/user${query}`, "GET");
}

export async function contribute(
  type: "verify_claim" | "add_signal" | "add_source" | "add_comment" | "share_signal" | "upvote",
  targetId?: string,
  userId?: string
): Promise<FundgraphUserResponse> {
  return requestJson<FundgraphUserResponse>("/api/fundgraph/user/contribute", "POST", {
    type,
    targetId,
    userId,
  });
}

export async function spend(
  amount: number,
  reason: string,
  targetId?: string,
  userId?: string
): Promise<FundgraphUserResponse> {
  return requestJson<FundgraphUserResponse>("/api/fundgraph/user/spend", "POST", {
    amount,
    reason,
    targetId,
    userId,
  });
}

export async function resetUserCredits(userId?: string): Promise<FundgraphUserResponse> {
  return requestJson<FundgraphUserResponse>("/api/fundgraph/user/reset", "POST", { userId });
}

export async function saveProfile(payload: {
  userId: string;
  sectorFocus: string[];
  stageFocus: string[];
  geographies: string[];
  riskTolerance: "low" | "medium" | "high";
  typicalCheckSizeM: number;
  checkSizeMinM?: number;
  checkSizeMaxM?: number;
  thesisKeywords?: string[];
}): Promise<SaveProfileResponse> {
  return requestJson<SaveProfileResponse>("/api/fundgraph/profile", "POST", payload);
}

export async function getRecommendations(userId: string, limit = 6): Promise<RecommendationsResponse> {
  return requestJson<RecommendationsResponse>(
    `/api/fundgraph/recommendations?userId=${encodeURIComponent(userId)}&limit=${limit}`,
    "GET"
  );
}

export async function getProfileActivity(userId: string, limit = 8): Promise<ProfileActivityResponse> {
  return requestJson<ProfileActivityResponse>(
    `/api/fundgraph/profile/activity?userId=${encodeURIComponent(userId)}&limit=${Math.max(1, Math.min(30, Math.floor(limit)))}`,
    "GET"
  );
}

export async function getFundsByIds(ids: string[]): Promise<FundsByIdsResponse> {
  const cleaned = Array.from(new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))).slice(0, 150);
  if (!cleaned.length) {
    return { count: 0, funds: [] };
  }
  const query = new URLSearchParams();
  query.set("ids", cleaned.join(","));
  return requestJson<FundsByIdsResponse>(`/api/fundgraph/funds/by-ids?${query.toString()}`, "GET");
}

export async function generateMemo(payload: MemoGenerationPayload): Promise<MemoResponse> {
  return requestJson<MemoResponse>("/api/fundgraph/memo", "POST", payload, { timeoutMs: MEMO_GENERATION_TIMEOUT_MS });
}

export async function generateWatchlistBrief(payload: WatchlistBriefPayload): Promise<MemoResponse> {
  return requestJson<MemoResponse>("/api/fundgraph/watchlist-brief", "POST", payload, { timeoutMs: MEMO_GENERATION_TIMEOUT_MS });
}

export async function getMemo(memoId: string): Promise<MemoByIdResponse> {
  return requestJson<MemoByIdResponse>(`/api/fundgraph/memos/${encodeURIComponent(memoId)}`, "GET", undefined, { timeoutMs: 20_000 });
}

export async function updateMemo(memoId: string, payload: UpdateMemoPayload): Promise<UpdateMemoResponse> {
  return requestJson<UpdateMemoResponse>(`/api/fundgraph/memos/${encodeURIComponent(memoId)}`, "PATCH", payload, {
    timeoutMs: 20_000,
  });
}

export async function getGraphData(params?: {
  fundId?: string;
  slug?: string;
  claimId?: string;
  depth?: number;
  limit?: number;
}): Promise<GraphApiResponse> {
  const query = new URLSearchParams();
  if (params?.fundId) query.set("fundId", params.fundId);
  if (params?.slug) query.set("slug", params.slug);
  if (params?.claimId) query.set("claimId", params.claimId);
  if (typeof params?.depth === "number") query.set("depth", String(params.depth));
  if (typeof params?.limit === "number") query.set("limit", String(params.limit));

  return requestJson<GraphApiResponse>(`/api/fundgraph/graph${query.size ? `?${query.toString()}` : ""}`, "GET");
}

export async function interpretGraphQuery(payload: {
  query: string;
  presetId?: string;
  nodeLabels?: string[];
  exampleQueries?: string[];
}): Promise<GraphQueryInterpretationResponse> {
  return requestJson<GraphQueryInterpretationResponse>("/api/fundgraph/query", "POST", payload);
}

export async function analyzeGraphQuery(payload: GraphQueryAnalysisPayload): Promise<GraphQueryAnalysisResponse> {
  return requestJson<GraphQueryAnalysisResponse>("/api/fundgraph/query/analysis", "POST", payload);
}
