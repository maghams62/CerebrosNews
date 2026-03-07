export type FundGraphDataMode = "hybrid" | "real";
export type FundgraphDataMode = FundGraphDataMode;
export type DataOrigin = "fetched" | "curated" | "derived";

export type FundStage = "Pre-Seed" | "Seed" | "Series A" | "Series B+" | "Growth";
export type DealCheckType = "lead" | "follow" | "unknown";
export type CitationOrigin = "synthetic" | "scraped" | "manual";

export type FundCategory =
  | "AI"
  | "Developer Tools"
  | "Fintech"
  | "Cloud"
  | "Security"
  | "Climate"
  | "Bio"
  | "Consumer"
  | "Enterprise"
  | "Web3"
  | "Data Infrastructure"
  | "Robotics"
  | "Health"
  | "Semiconductors"
  | "Defense"
  | "Other";

export type RiskTolerance = "low" | "medium" | "high";
export type SignalSource = "community" | "system" | "user";
export type SignalStanceType = "bullish" | "neutral" | "bearish";
export type EntityType = "fund" | "gp" | "company" | "signal" | "claim" | "portfolio";

export type SourceType =
  | "NEWS_ARTICLE"
  | "PASTED_TEXT"
  | "URL"
  | "TWEET_THREAD_TEXT"
  | "PDF_TEXT"
  | "CSV_FUNDS";

export type ClaimCategory =
  | "Funding"
  | "Product"
  | "Regulation"
  | "Partnership"
  | "M&A"
  | "Hiring"
  | "Legal"
  | "Market"
  | "Infrastructure"
  | "Research"
  | "Other";

export type VerificationVerdict = "supported" | "unsupported" | "mixed";
export type CommunityVote = "verify" | "dispute";
export type CommunityVoteInput = CommunityVote | "disagree";
export type GamificationTier = "visitor" | "contributor" | "analyst" | "insider";
export type ContributionEventType =
  | "verify_claim"
  | "add_signal"
  | "add_source"
  | "add_comment"
  | "share_signal"
  | "upvote"
  | "memo_generate";
export type VerificationStatus = "UNVERIFIED" | "PARTIALLY_VERIFIED" | "VERIFIED" | "DISPUTED";
export type MembershipTier = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM" | "INTERNAL_ANALYST" | "VERIFIED_PARTNER";
export type ContributorRole =
  | "ANONYMOUS_FOUNDER"
  | "ANONYMOUS_SERIES_B_INVESTOR"
  | "ANONYMOUS_GP"
  | "ANONYMOUS_LP"
  | "OPERATOR"
  | "ANALYST"
  | "MEMBER"
  | "OTHER";
export type EvidenceVisibility = "PUBLIC" | "PRIVATE" | "ANONYMOUS";
export type EvidenceSourceType =
  | "PUBLIC_ARTICLE"
  | "TWEET_THREAD"
  | "PODCAST"
  | "YOUTUBE_VIDEO"
  | "PASTED_TEXT"
  | "PRIVATE_INTEL"
  | "FOUNDER_NOTE"
  | "LP_NOTE"
  | "GP_NOTE"
  | "FUND_DECK"
  | "OTHER";
export type EvidenceConfidenceTier = "LOW" | "MEDIUM" | "HIGH";
export type VerificationConfidenceTier = "LOW" | "MEDIUM" | "HIGH";

export type ClaimLinkTargetType = "FUND" | "COMPANY" | "GP";
export type TrustTier = "LOW" | "MEDIUM" | "HIGH";
export type CredBadgeTier = "NEW" | "CONTRIBUTOR" | "VERIFIER" | "HIGH_SIGNAL";

export interface TrustFields {
  trustScore: number;
  trustTier: TrustTier;
  trustExplanation: string;
}

export interface VerificationContributorProfile {
  label?: string;
  role?: ContributorRole;
  tier?: MembershipTier;
  isAnonymous?: boolean;
}

export interface ClaimEvidence {
  id: string;
  claimId: string;
  sourceType: EvidenceSourceType;
  visibility: EvidenceVisibility;
  title?: string;
  url?: string;
  snippet?: string;
  note?: string;
  submittedAt: string;
  contributor?: VerificationContributorProfile;
  confidence?: EvidenceConfidenceTier;
  isSynthetic?: boolean;
  metadata?: Record<string, unknown>;
}

export interface MachineVerificationBreakdown {
  citationSupport: "NONE" | "WEAK" | "MEDIUM" | "STRONG";
  sourceRelevance: "LOW" | "MEDIUM" | "HIGH";
  freshness: "STALE" | "RECENT" | "TIMELY";
  conflictDetected: boolean;
  reasoningSummary: string;
  machineConfidence: number;
}

export interface CommunityVerificationSummary {
  verifyCount: number;
  disputeCount: number;
  weightedVerifyScore: number;
  weightedDisputeScore: number;
  topVerifierTiers: MembershipTier[];
  breakdown?: Array<{
    label: string;
    count: number;
    vote: CommunityVote;
    tier?: MembershipTier;
    role?: ContributorRole;
    weightedScore: number;
  }>;
}

export interface VerificationScoreBreakdown {
  machineScore: number;
  publicEvidenceScore: number;
  privateEvidenceScore: number;
  communityScore: number;
  reputationScore: number;
  finalScore: number;
  confidenceTier: VerificationConfidenceTier;
}

export interface ClaimVerificationRecord {
  claimId: string;
  status: VerificationStatus;
  machine: MachineVerificationBreakdown;
  community: CommunityVerificationSummary;
  score: VerificationScoreBreakdown;
  evidence: ClaimEvidence[];
  updatedAt: string;
}

export interface Evidence {
  url?: string;
  snippet?: string;
}

export interface CitationRef {
  id: string;
  url: string;
  title: string;
  snippet?: string;
  publishedAt?: string;
  origin: CitationOrigin;
}

export interface DealFact {
  id: string;
  fundId: string;
  companyName: string;
  companyId?: string;
  roundStage?: FundStage;
  announcedAt?: string;
  amountMinM?: number;
  amountMaxM?: number;
  checkType?: DealCheckType;
  confidence?: number;
  sourceRefs: CitationRef[];
  verified?: boolean;
  citationCount?: number;
  dataOrigin?: DataOrigin;
}

export interface FundGP {
  name: string;
  title: string;
  bio: string;
  photoUrl?: string;
  previousFirms?: string[];
  linkedinUrl?: string;
  focusAreas?: string[];
  partnerNetwork?: string[];
}

export interface FundPortfolioMetrics {
  portfolioSize: number;
  leadInvestmentRate: number;
  followOnRate: number;
  topExits?: string[];
}

export interface GeneralPartner {
  id: string;
  name: string;
  title: string;
  yearsInvesting: number;
  priorFirms: string[];
  focusSectors: string[];
}

export interface PortfolioCompany {
  id: string;
  name: string;
  sector: string;
  stage: string;
  hq: string;
  status: "active" | "exited" | "watch";
  latestRound?: string;
}

export interface FundMetrics {
  signalCount: number;
  signalVelocity: number;
  communityTrust: number;
  trendScore: number;
}

export interface Fund {
  id: string;
  name: string;
  slug: string;
  officialUrl?: string;
  entityType?: "VC_FIRM" | "FUND_VEHICLE";
  aliases?: string[];
  description: string;
  headquarters: string;
  geography: string[];
  geographies: string[];
  stages: FundStage[];
  sectors: FundCategory[];
  checkSizeMinM: number;
  checkSizeMaxM: number;
  checkSizeKUsd: { min: number; max: number };
  aumM: number;
  vintageYear: number;
  trendScore: number;
  momentumScore: number;
  communityScore: number;
  risk: RiskTolerance;
  gp: FundGP;
  gpNames: string[];
  portfolio: string[];
  portfolioInvestments?: DealFact[];
  strategy: string;
  fundType?: string;
  portfolioMetrics?: FundPortfolioMetrics;
  coInvestors?: string[];
  founders?: string[];

  // Compatibility extras for existing in-progress modules.
  thesis?: string;
  hq?: string;
  aumUsdM?: number;
  dryPowderUsdM?: number;
  stageFocus?: string[];
  sectorFocus?: string[];
  geoFocus?: string[];
  riskBand?: RiskTolerance;
  gps?: GeneralPartner[];
  metrics?: FundMetrics;
  dataOrigin?: DataOrigin;
}

export type SignalQualityTier = "ALIGNED" | "WARNING" | "FAILED";

export interface SignalArticleSnapshotFact {
  label: string;
  value: string;
  citationId?: string;
}

export interface SignalArticleSnapshotQuote {
  citationId: string;
  text: string;
  url?: string;
}

export interface SignalArticleSnapshot {
  headline: string;
  sourceName: string;
  sourceUrl?: string;
  publishedAt?: string;
  bullets: string[];
  keyFacts: SignalArticleSnapshotFact[];
  evidenceQuotes: SignalArticleSnapshotQuote[];
  excerpt?: string;
  extraction: {
    extractedAt: string;
    extractor: string;
    sourceTextLength: number;
    snippetOverlapScore: number;
    fundRelevanceScore: number;
    sourceJoinScore: number;
    isSynthetic?: boolean;
  };
}

export interface Signal {
  id: string;
  fundId: string;
  title: string;
  summary: string;
  confidence: number;
  createdAt: string;
  authorName: string;
  upvotes: number;
  verifiedCount: number;
  verifies: number;
  disagrees: number;
  commentsCount: number;
  bullishCount?: number;
  neutralCount?: number;
  bearishCount?: number;
  userStance?: SignalStanceType;

  // Compatibility fields across API/UI variants.
  tags?: string[];
  source?: SignalSource;
  evidence?: Evidence;
  evidenceUrl?: string;
  evidenceSnippet?: string;
  userId?: string;
  author?: string;
  authorUserId?: string;
  verifyCount?: number;
  disagreeCount?: number;
  disputedCount?: number;
  verificationVerdict?: VerificationVerdict;
  verificationConfidence?: number;
  trustScore?: number;
  trustTier?: TrustTier;
  trustExplanation?: string;
  verifyBonusApplied?: boolean;
  disputePenaltyApplied?: boolean;
  advancedInsight?: AdvancedSignalInsight;
  advancedInsightStatus?: AdvancedInsightStatus;
  advancedInsightError?: string;
  advancedInsightUpdatedAt?: string;
  sourceId?: string;
  sourceTitle?: string;
  claimIds?: string[];
  qualityTier?: SignalQualityTier;
  alignmentScore?: number;
  citationMatchScore?: number;
  qualityReasons?: string[];
  articleSnapshot?: SignalArticleSnapshot;
  dataOrigin?: DataOrigin;
}

export type AdvancedInsightStatus = "preparing" | "ready" | "failed";

export type AdvancedSignalRelatedType = "same_theme" | "same_entity" | "similar_pattern" | "same_fund";

export interface AdvancedSignalInsight {
  materiality_score: number;
  materiality_label: "low" | "medium" | "high";
  novelty_score: number;
  risk_uncertainty_score: number;
  implication_summary: string;
  bull_case: string;
  base_case: string;
  bear_case: string;
  missing_evidence: string[];
  confidence_change_triggers: string[];
  entity_impact: Array<{
    entity_id: string;
    entity_name: string;
    entity_type: string;
    impact_summary: string;
    relevance_score?: number;
  }>;
  related_signals: Array<{
    signal_id: string;
    title: string;
    relation_type: AdvancedSignalRelatedType;
    similarity_score?: number;
  }>;
  next_questions: string[];
  graph_insight_summary: string;
  historical_context: string;
  analyst_note: {
    summary: string;
    bullets: string[];
  };
  generated_at: string;
  generation_version: string;
}

export interface SignalStance {
  id: string;
  signalId: string;
  userId: string;
  stanceType: SignalStanceType;
  createdAt: string;
  seeded?: boolean;
  dataOrigin?: DataOrigin;
  seedVersion?: string;
  trustWeight?: number;
}

export interface GraphEdge {
  id: string;
  fromType: EntityType;
  fromId: string;
  toType: EntityType;
  toId: string;
  relation: string;
  weight: number;
}

export interface GraphNode {
  id: string;
  type: EntityType;
  label: string;
  meta?: Record<string, unknown>;
}

export interface FundGraphView {
  fundId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ClaimCitation {
  sourceId: string;
  url: string;
  title: string;
  snippet: string;
  startOffset?: number;
  endOffset?: number;
}

export interface ClaimLLMVerification {
  verdict: VerificationVerdict;
  rationale: string;
  confidence: number;
  verifiedAt: string;
}

export interface ClaimNormalization {
  entity: string;
  attribute: string;
  value: string;
  polarity: "positive" | "negative" | "neutral";
}

export interface ClaimLink {
  id: string;
  claimId: string;
  targetType: ClaimLinkTargetType;
  targetId: string;
  targetName: string;
  score: number;
  matchedText?: string;
  createdAt: string;
}

export interface NewsClaim {
  id: string;
  sourceId: string;
  claimText: string;
  category: ClaimCategory;
  entities: string[];
  llmConfidence: number;
  citation: ClaimCitation;
  verification?: {
    verdict: VerificationVerdict;
    rationale: string;
    confidence: number;
  };
  llmVerification?: ClaimLLMVerification;
  verificationVerdict?: VerificationVerdict;
  verificationConfidence?: number;
  verificationRecord?: ClaimVerificationRecord;
  community: {
    verifyCount: number;
    disagreeCount: number;
    commentCount: number;
    verifies: number;
    disagrees: number;
    trustScore: number;
    verifiedCount?: number;
    disputedCount?: number;
  };
  linkedFundIds: string[];
  links?: ClaimLink[];
  authorUserId?: string;
  authorCredScore?: number;
  citationCount?: number;
  trustScore?: number;
  trustTier?: TrustTier;
  trustExplanation?: string;
  normalized?: ClaimNormalization;
  disputePenaltyApplied?: boolean;
  dataOrigin?: DataOrigin;
  createdAt: string;
  updatedAt: string;
}

export interface Verification {
  id: string;
  targetType?: "claim" | "signal";
  claimId?: string;
  signalId?: string;
  userId: string;
  vote: CommunityVote;
  note?: string;
  comment?: string;
  contributor?: VerificationContributorProfile;
  createdAt: string;
  seeded?: boolean;
  dataOrigin?: DataOrigin;
  seedVersion?: string;
  trustWeight?: number;
  qualityChecked?: boolean;
}

export interface Source {
  id: string;
  type: SourceType;
  title: string;
  url?: string;
  rawText: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface NewsSource {
  id: string;
  title: string;
  url: string;
  sourceName: string;
  summary: string;
  content: string;
  publishedAt: string;
  tags: string[];
}

export type ConflictStatus = "open" | "resolved";

export interface Conflict {
  id: string;
  claimIdA: string;
  claimIdB: string;
  status: ConflictStatus;
  resolutionNote?: string;
  resolutionHint?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoCitation {
  id: string;
  type: "claim" | "signal" | "source";
  claimId?: string;
  signalId?: string;
  sourceId?: string;
  fundId?: string;
  title: string;
  url?: string;
  snippet: string;
}

export type MemoArtifactType = "fund_memo" | "watchlist_brief";
export type MemoType = "quick_brief" | "investment_memo" | "deep_diligence";
export type MemoTimeWindow = "30d" | "90d" | "all_time";
export type MemoGenerationMode = "llm" | "deterministic";

export interface MemoOptions {
  memoType: MemoType;
  includeSignals: boolean;
  includePortfolio: boolean;
  includeGraphContext: boolean;
  includeCommunityDiscussion: boolean;
  timeWindow: MemoTimeWindow;
}

export interface MemoSection {
  key: string;
  title: string;
  content: string;
}

export interface Memo {
  id: string;
  userId?: string;
  artifactType?: MemoArtifactType;
  memoType?: MemoType;
  generationMode?: MemoGenerationMode;
  primaryFundId?: string;
  options?: MemoOptions;
  fundIds: string[];
  memoMarkdown: string;
  editorHtml?: string;
  isEdited?: boolean;
  lastEditedAt?: string;
  sections: MemoSection[];
  citations: MemoCitation[];
  createdAt: string;
}

export interface FundgraphDailyStats {
  date: string;
  creditsEarned: number;
  actions: {
    verify: number;
    signal: number;
    source: number;
    comment?: number;
    share?: number;
    upvote?: number;
  };
}

export interface FundgraphReputation {
  credScore: number;
  badge?: string;
}

export interface FundgraphUser {
  id: string;
  userId?: string;
  name: string;
  credScore: number;
  badgeTier: CredBadgeTier;
  credits?: number;
  contributions?: number;
  tier?: GamificationTier;
  daily?: FundgraphDailyStats;
  reputation?: FundgraphReputation;
  createdAt: string;
  updatedAt: string;
}

export interface ContributionEvent {
  id: string;
  userId: string;
  type: ContributionEventType;
  targetId?: string;
  deltaCredits: number;
  createdAt: string;
}

export interface UserProfile {
  id?: string;
  userId?: string;
  sectorFocus: string[];
  stageFocus: string[];
  geographyFocus: string[];
  geographies: string[];
  riskTolerance: RiskTolerance;
  checkSizeMinM: number;
  checkSizeMaxM: number;
  typicalCheckSizeM: number;
  typicalCheckSizeKUsd: number;
  thesisKeywords?: string[];
  updatedAt?: string;
  weights?: Partial<RecommendationWeights>;
}

export interface RecommendationWeights {
  sector: number;
  stage: number;
  geography: number;
  risk: number;
  checkSize: number;
  momentum: number;
}

export interface RecommendationResult {
  fundId: string;
  score: number;
  reasons: string[];
  explanation: string;
}

export interface FundRecommendation {
  fundId: string;
  score: number;
  reason: string;
  reasons?: string[];
  explanation?: string;
}

export interface FundGraphDashboardData {
  mode: FundGraphDataMode;
  trendingFunds: Fund[];
  recentSignals: Signal[];
  recentClaims: NewsClaim[];
  recommendations: Array<FundRecommendation & { fund: Fund }>;
}

export interface FundFilters {
  q?: string;
  sector?: string;
  stage?: string;
  geo?: string;
  sort?: "trending" | "aum" | "recent";
  limit?: number;
}

export interface SignalFilters {
  fundId?: string;
  q?: string;
  limit?: number;
}

export interface SyntheticFundgraphDataset {
  generatedAt: string;
  version: string;
  funds: Fund[];
  signals: Signal[];
  graphEdges: GraphEdge[];
}

export interface FundgraphDbFile {
  claims: NewsClaim[];
  signals: Signal[];
  profiles: UserProfile[];
  verifications: Verification[];
  credByUser: Record<string, number>;
  users: FundgraphUser[];
  conflicts: Conflict[];
  sources?: Source[];
  claimLinks?: ClaimLink[];
  memos?: Memo[];
  contributionEvents?: ContributionEvent[];
  signalStances?: SignalStance[];
}
