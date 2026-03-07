import { createHash } from "crypto";
import { fundCompanyRecords, fundGpRecords } from "@/lib/fundgraph/fundEntities";
import { sanitizePortfolioCompanyName } from "@/lib/fundgraph/fundEntityProfiles";
import {
  filterClaimLinksByClaims,
  filterClaimsForDemoMode,
  filterSignalsForDemoMode,
  filterSourcesForDemoMode,
} from "@/lib/fundgraph/demoModeFilter";
import { getFundgraphDataMode } from "@/lib/fundgraph/mode";
import { readFunds } from "@/lib/fundgraph/storage";
import { getClaimLinks, getClaims, getSources, readFundgraphDb } from "@/lib/fundgraph/store";
import { normalizeFundgraphText } from "@/lib/fundgraph/textNormalization";
import { ClaimLink, Fund, NewsClaim, Signal, Source } from "@/lib/fundgraph/types";
import {
  GraphApiResponse,
  GraphData,
  GraphLink,
  GraphNode,
  GraphNodeType,
  claimNodeId,
  companyNodeId,
  fundNodeId,
  personNodeId,
  signalNodeId,
  sourceNodeId,
} from "@/lib/fundgraph/graphTypes";

const DEFAULT_DEPTH = 2;
const DEFAULT_LIMIT = 600;
const ENTITY_STOPWORDS = new Set([
  "ai",
  "a",
  "an",
  "and",
  "announcement",
  "article",
  "capital",
  "claim",
  "company",
  "fund",
  "funding",
  "general",
  "global",
  "growth",
  "insights",
  "investors",
  "market",
  "news",
  "partner",
  "partners",
  "series",
  "source",
  "startup",
  "strategy",
  "ventures",
]);
const BAD_ENTITY_TOKENS = new Set([
  "all",
  "about",
  "accept",
  "announcements",
  "articles",
  "cli",
  "close",
  "contact",
  "decline",
  "episodes",
  "founder",
  "founders",
  "global",
  "home",
  "immersive",
  "insights",
  "jobs",
  "listen",
  "maps",
  "made",
  "market",
  "markets",
  "menu",
  "mission",
  "news",
  "newsroom",
  "next",
  "no",
  "ops",
  "other",
  "open",
  "play",
  "previous",
  "privacy",
  "series",
  "software",
  "stories",
  "story",
  "read",
  "results",
  "scenarios",
  "search",
  "skip",
  "stay",
  "team",
  "tech",
  "their",
  "themes",
  "this",
  "today",
  "topics",
  "terms",
  "thank",
  "toggle",
  "we",
  "why",
  "year",
  "yes",
  "webflow",
]);

const TYPE_SCORE: Record<GraphNodeType, number> = {
  fund: 140,
  company: 110,
  person: 90,
  claim: 80,
  signal: 70,
  source: 60,
};

export interface BuildGraphDataInput {
  fundId?: string;
  slug?: string;
  claimId?: string;
  depth?: number;
  limit?: number;
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function hashId(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 12);
}

function normalizeText(input: string | undefined | null): string {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeEntityLabel(value: string): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[|•·]+/g, " ")
    .trim();
}

function isLikelyPersonEntity(label: string): boolean {
  const normalized = normalizeEntityLabel(label);
  if (!normalized) return false;
  if (normalized.length < 4 || normalized.length > 48) return false;
  if (!/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}$/.test(normalized)) return false;
  const tokens = normalized.toLowerCase().split(" ").filter(Boolean);
  if (tokens.length < 2 || tokens.length > 3) return false;
  if (tokens.some((token) => BAD_ENTITY_TOKENS.has(token))) return false;
  if (tokens.some((token) => token.length < 2)) return false;
  return true;
}

function isLikelyCompanyEntity(label: string): boolean {
  const normalized = normalizeEntityLabel(label);
  if (!normalized) return false;
  if (normalized.length < 2 || normalized.length > 64) return false;
  if (/\d{3,}/.test(normalized)) return false;
  if (/^(series|seed|round|funding|investor|announcement|article|news|tech|software|ops|other)$/i.test(normalized)) return false;
  if (/\bseries\s+[a-z0-9+.-]+\b/i.test(normalized)) return false;
  if (/\b(ai[-\s]?(assisted|powered|driven|generated))\b/i.test(normalized)) return false;
  const tokenized = normalizeText(normalized).replace(/-/g, " ").split(" ").filter(Boolean);
  if (!tokenized.length) return false;
  if (tokenized.some((token) => BAD_ENTITY_TOKENS.has(token))) return false;
  if (tokenized.every((token) => ENTITY_STOPWORDS.has(token))) return false;
  if (tokenized.filter((token) => ENTITY_STOPWORDS.has(token) || BAD_ENTITY_TOKENS.has(token)).length / tokenized.length >= 0.5) {
    return false;
  }
  return true;
}

function sanitizeCompanyEntityLabel(rawLabel: string): string | null {
  const normalized = normalizeEntityLabel(rawLabel);
  if (!normalized) return null;
  if (!isLikelyCompanyEntity(normalized)) return null;
  return sanitizePortfolioCompanyName(normalized);
}

function buildFundNameLookup(funds: Fund[]): Set<string> {
  const out = new Set<string>();
  for (const fund of funds) {
    const values = [fund.name, ...(fund.aliases ?? [])];
    for (const value of values) {
      const key = normalizeText(value).replace(/-/g, " ").trim();
      if (!key) continue;
      out.add(key);
    }
  }
  return out;
}

function entityLooksLikeFund(label: string, fundNameLookup: Set<string>): boolean {
  const key = normalizeText(label).replace(/-/g, " ").trim();
  if (!key) return false;
  if (fundNameLookup.has(key)) return true;
  if (/\b(ventures?|capital|partners?|vc|fund)\b/i.test(label) && key.split(" ").length <= 6) return true;
  return false;
}

function extractEntityPhrases(text: string): string[] {
  const matches = text.match(/\b[A-Z][A-Za-z0-9&.-]*(?:\s+[A-Z][A-Za-z0-9&.-]*){0,3}\b/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of matches) {
    const label = normalizeEntityLabel(raw);
    if (!label || label.length < 2) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    const tokenized = normalizeText(label).replace(/-/g, " ").split(" ").filter(Boolean);
    if (!tokenized.length) continue;
    if (tokenized.every((token) => ENTITY_STOPWORDS.has(token) || BAD_ENTITY_TOKENS.has(token))) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= 16) break;
  }
  return out;
}

function companyKeyFromName(name: string): string {
  const normalized = normalizeText(name);
  if (normalized) return normalized;
  return `name-${hashId(name)}`;
}

function sourceKeyFromUrl(url: string): string {
  return `url-${hashId(url.toLowerCase())}`;
}

function nodeRecencyBoost(meta: Record<string, unknown> | undefined): number {
  const raw = typeof meta?.createdAt === "string" ? meta.createdAt : undefined;
  if (!raw) return 0;
  const ageMs = Date.now() - +new Date(raw);
  if (!Number.isFinite(ageMs) || ageMs < 0) return 8;
  const ageHours = ageMs / (1000 * 60 * 60);
  return Math.max(0, 8 - ageHours / 24);
}

class GraphBuilder {
  private readonly nodes = new Map<string, GraphNode>();
  private readonly links = new Map<string, GraphLink>();
  private readonly companyMentions = new Map<string, Set<string>>();

  addNode(node: GraphNode): void {
    const existing = this.nodes.get(node.id);
    if (!existing) {
      this.nodes.set(node.id, node);
      return;
    }

    this.nodes.set(node.id, {
      ...existing,
      label: existing.label || node.label,
      meta: {
        ...(existing.meta ?? {}),
        ...(node.meta ?? {}),
      },
    });
  }

  addLink(link: GraphLink): void {
    if (link.source === link.target) return;
    const key = `${link.source}|${link.target}|${link.type}`;
    const existing = this.links.get(key);
    if (!existing) {
      this.links.set(key, link);
      return;
    }

    this.links.set(key, {
      ...existing,
      weight: Math.max(existing.weight ?? 1, link.weight ?? 1),
    });
  }

  addCompanyMention(companyId: string, sourceId: string): void {
    const bucket = this.companyMentions.get(companyId) ?? new Set<string>();
    bucket.add(sourceId);
    this.companyMentions.set(companyId, bucket);
  }

  materialize(): GraphData {
    for (const [companyId, sourceIds] of this.companyMentions.entries()) {
      for (const sourceId of sourceIds) {
        this.addLink({
          source: companyId,
          target: sourceId,
          type: "MENTIONED_IN",
          weight: 0.4,
        });
      }
    }

    return {
      nodes: Array.from(this.nodes.values()),
      links: Array.from(this.links.values()),
    };
  }
}

function sourceMeta(source: Source): Record<string, unknown> {
  return {
    sourceId: source.id,
    title: source.title,
    url: source.url,
    articleId: source.id,
    createdAt: source.createdAt,
  };
}

function signalTrustMeta(signal: Signal): Record<string, unknown> {
  return {
    verifiedCount: signal.verifiedCount ?? signal.verifyCount ?? signal.verifies ?? 0,
    disputedCount: signal.disputedCount ?? signal.disagreeCount ?? signal.disagrees ?? 0,
    bullishCount: signal.bullishCount ?? signal.upvotes ?? 0,
    neutralCount: signal.neutralCount ?? 0,
    bearishCount: signal.bearishCount ?? 0,
    upvotes: signal.bullishCount ?? signal.upvotes ?? 0,
    trustScore: signal.trustScore ?? 0,
    trustTier: signal.trustTier,
  };
}

function claimTrustMeta(claim: NewsClaim): Record<string, unknown> {
  const verifiedCount = claim.community.verifiedCount ?? claim.community.verifyCount ?? claim.community.verifies ?? 0;
  const disputedCount = claim.community.disputedCount ?? claim.community.disagreeCount ?? claim.community.disagrees ?? 0;

  return {
    verifiedCount,
    disputedCount,
    trustScore: claim.trustScore ?? claim.community.trustScore ?? 0,
    trustTier: claim.trustTier,
    createdAt: claim.createdAt,
  };
}

function resolveFundFocusId(funds: Fund[], fundId?: string, slug?: string): string | undefined {
  if (fundId) {
    const found = funds.find((fund) => fund.id === fundId || fund.slug === fundId);
    if (found) return fundNodeId(found.id);
  }
  if (slug) {
    const found = funds.find((fund) => fund.slug === slug);
    if (found) return fundNodeId(found.id);
  }
  return undefined;
}

function titleFromIdentifier(input: string): string {
  const cleaned = input
    .trim()
    .replace(/^fund:/, "")
    .replace(/^fund-/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Unknown Fund";
  return cleaned.replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function scoreNode(node: GraphNode, degree: number): number {
  const base = TYPE_SCORE[node.type] ?? 0;
  const boundedDegree =
    node.type === "source" ? Math.min(6, Math.max(0, degree)) : Math.min(16, Math.max(0, degree));
  const trust = typeof node.meta?.trustScore === "number" ? Number(node.meta.trustScore) : 0;
  const weightedTrust = Math.max(0, Math.min(100, trust));
  return base + boundedDegree * 3 + weightedTrust / 12 + nodeRecencyBoost(node.meta);
}

function buildAdjacency(links: GraphLink[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();

  for (const link of links) {
    const left = adjacency.get(link.source) ?? new Set<string>();
    left.add(link.target);
    adjacency.set(link.source, left);

    const right = adjacency.get(link.target) ?? new Set<string>();
    right.add(link.source);
    adjacency.set(link.target, right);
  }

  return adjacency;
}

function filterByFocus(graph: GraphData, focusNodeId: string, depth: number): GraphData {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  if (!nodeById.has(focusNodeId)) return graph;

  const adjacency = buildAdjacency(graph.links);
  const keep = new Set<string>([focusNodeId]);
  let frontier = new Set<string>([focusNodeId]);

  for (let step = 0; step < depth; step += 1) {
    const next = new Set<string>();
    for (const nodeId of frontier) {
      for (const neighbor of adjacency.get(nodeId) ?? []) {
        if (keep.has(neighbor)) continue;
        keep.add(neighbor);
        next.add(neighbor);
      }
    }
    if (!next.size) break;
    frontier = next;
  }

  return {
    nodes: graph.nodes.filter((node) => keep.has(node.id)),
    links: graph.links.filter((link) => keep.has(link.source) && keep.has(link.target)),
  };
}

function applyNodeLimit(graph: GraphData, limit: number, focusNodeId?: string): GraphData {
  if (graph.nodes.length <= limit) return graph;

  const degree = new Map<string, number>();
  for (const link of graph.links) {
    degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
    degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
  }

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const scoreById = new Map<string, number>();
  for (const node of graph.nodes) {
    scoreById.set(node.id, scoreNode(node, degree.get(node.id) ?? 0));
  }

  const typeOrder: GraphNodeType[] = ["fund", "company", "person", "claim", "signal", "source"];
  const buckets = new Map<GraphNodeType, GraphNode[]>();
  for (const type of typeOrder) {
    buckets.set(
      type,
      graph.nodes
        .filter((node) => node.type === type)
        .sort((a, b) => (scoreById.get(b.id) ?? 0) - (scoreById.get(a.id) ?? 0))
    );
  }

  const prioritizedNodes: GraphNode[] = [];
  let appended = true;
  while (appended) {
    appended = false;
    for (const type of typeOrder) {
      const bucket = buckets.get(type);
      const next = bucket?.shift();
      if (!next) continue;
      prioritizedNodes.push(next);
      appended = true;
    }
  }

  if (focusNodeId) {
    prioritizedNodes.sort((a, b) => {
      if (a.id === focusNodeId) return -1;
      if (b.id === focusNodeId) return 1;
      return 0;
    });
  }

  const linksByNode = new Map<string, GraphLink[]>();
  for (const link of graph.links) {
    const left = linksByNode.get(link.source) ?? [];
    left.push(link);
    linksByNode.set(link.source, left);

    const right = linksByNode.get(link.target) ?? [];
    right.push(link);
    linksByNode.set(link.target, right);
  }

  const rankedLinks = [...graph.links].sort((a, b) => {
    const scoreA = (scoreById.get(a.source) ?? 0) + (scoreById.get(a.target) ?? 0) + (a.weight ?? 0) * 20;
    const scoreB = (scoreById.get(b.source) ?? 0) + (scoreById.get(b.target) ?? 0) + (b.weight ?? 0) * 20;
    const focusBoostA = focusNodeId && (a.source === focusNodeId || a.target === focusNodeId) ? 40 : 0;
    const focusBoostB = focusNodeId && (b.source === focusNodeId || b.target === focusNodeId) ? 40 : 0;
    return scoreB + focusBoostB - (scoreA + focusBoostA);
  });

  const keep = new Set<string>();
  const addNode = (nodeId: string): boolean => {
    if (keep.has(nodeId)) return true;
    if (!nodeById.has(nodeId)) return false;
    if (keep.size >= limit) return false;
    keep.add(nodeId);
    return true;
  };

  if (focusNodeId) {
    addNode(focusNodeId);
  }

  // Grow from high-priority seeds while preserving their immediate structure.
  for (const node of prioritizedNodes) {
    if (keep.size >= limit) break;
    if (!addNode(node.id)) continue;
    const incident = [...(linksByNode.get(node.id) ?? [])].sort((a, b) => {
      const scoreA = (a.weight ?? 0) * 12 + (scoreById.get(a.source) ?? 0) + (scoreById.get(a.target) ?? 0);
      const scoreB = (b.weight ?? 0) * 12 + (scoreById.get(b.source) ?? 0) + (scoreById.get(b.target) ?? 0);
      return scoreB - scoreA;
    });

    let addedNeighbors = 0;
    const maxNeighborsForSeed = focusNodeId ? 12 : 5;
    for (const link of incident) {
      if (keep.size >= limit) break;
      if (addedNeighbors >= maxNeighborsForSeed) break;
      const sourceKept = keep.has(link.source);
      const targetKept = keep.has(link.target);
      if (!sourceKept && !targetKept && keep.size > limit - 2) continue;
      const addedSource = addNode(link.source);
      const addedTarget = addNode(link.target);
      if (addedSource || addedTarget) {
        addedNeighbors += 1;
      }
    }
  }

  // Ensure we keep at least a meaningful connected backbone.
  for (const link of rankedLinks) {
    if (keep.size >= limit) break;
    const sourceKept = keep.has(link.source);
    const targetKept = keep.has(link.target);
    if (!sourceKept && !targetKept && keep.size > limit - 2) continue;
    addNode(link.source);
    addNode(link.target);
  }

  const nodes = graph.nodes.filter((node) => keep.has(node.id));
  const links = graph.links.filter((link) => keep.has(link.source) && keep.has(link.target));

  if (!links.length && graph.links.length > 0) {
    const fallbackKeep = new Set<string>();
    if (focusNodeId) fallbackKeep.add(focusNodeId);
    for (const link of rankedLinks) {
      if (fallbackKeep.size >= limit) break;
      if (fallbackKeep.size <= limit - 2) {
        fallbackKeep.add(link.source);
        fallbackKeep.add(link.target);
      } else if (fallbackKeep.has(link.source) || fallbackKeep.has(link.target)) {
        fallbackKeep.add(link.source);
        fallbackKeep.add(link.target);
      }
    }
    for (const node of prioritizedNodes) {
      if (fallbackKeep.size >= limit) break;
      fallbackKeep.add(node.id);
    }

    return {
      nodes: graph.nodes.filter((node) => fallbackKeep.has(node.id)),
      links: graph.links.filter((link) => fallbackKeep.has(link.source) && fallbackKeep.has(link.target)),
    };
  }

  return { nodes, links };
}

export async function buildGraphData(input: BuildGraphDataInput): Promise<GraphApiResponse> {
  const depth = clampInt(input.depth, DEFAULT_DEPTH, 1, 4);
  const limit = clampInt(input.limit, DEFAULT_LIMIT, 10, 1200);
  const mode = getFundgraphDataMode();

  const [funds, db, rawClaims, rawSources, rawClaimLinks] = await Promise.all([
    readFunds(),
    readFundgraphDb(),
    getClaims(),
    getSources(800),
    getClaimLinks(),
  ]);
  const signals = filterSignalsForDemoMode(db.signals ?? []);
  const claims = await filterClaimsForDemoMode(rawClaims);
  const sources = await filterSourcesForDemoMode(rawSources);
  const claimLinks = filterClaimLinksByClaims(rawClaimLinks, claims);
  const fundNameLookup = buildFundNameLookup(funds);

  const builder = new GraphBuilder();
  const fundById = new Map(funds.map((fund) => [fund.id, fund]));
  const fundBySlug = new Map(funds.map((fund) => [fund.slug, fund]));
  const fundByLegacyRef = new Map<string, Fund>();
  for (const fund of funds) {
    const ordinalMatch = fund.id.match(/-(\d+)$/);
    if (ordinalMatch?.[1]) {
      fundByLegacyRef.set(`fund-${ordinalMatch[1]}`, fund);
    }
  }

  const resolveFundRef = (fundRef?: string): Fund | undefined => {
    const key = fundRef?.trim();
    if (!key) return undefined;
    return fundById.get(key) ?? fundBySlug.get(key) ?? fundByLegacyRef.get(key);
  };

  const ensureFundNodeId = (fundRef?: string): string | undefined => {
    const raw = fundRef?.trim();
    if (!raw) return undefined;
    const resolved = resolveFundRef(raw);
    if (resolved) {
      return fundNodeId(resolved.id);
    }

    const syntheticId = fundNodeId(raw);
    builder.addNode({
      id: syntheticId,
      type: "fund",
      label: titleFromIdentifier(raw),
      meta: {
        fundId: raw,
        synthetic: true,
      },
    });
    return syntheticId;
  };

  const claimLinksById = new Map<string, ClaimLink[]>();
  for (const link of claimLinks) {
    const bucket = claimLinksById.get(link.claimId) ?? [];
    bucket.push(link);
    claimLinksById.set(link.claimId, bucket);
  }

  const companyNameById = new Map<string, string>();
  const sourceFundIds = new Map<string, Set<string>>();

  for (const claim of claims) {
    const linked = new Set((claim.linkedFundIds ?? []).map((id) => id.trim()).filter(Boolean));
    if (!linked.size) continue;
    const sourceCandidates = [claim.sourceId, claim.citation?.sourceId].map((value) => String(value ?? "").trim()).filter(Boolean);
    for (const sourceCandidate of sourceCandidates) {
      const bucket = sourceFundIds.get(sourceCandidate) ?? new Set<string>();
      for (const fundId of linked) bucket.add(fundId);
      sourceFundIds.set(sourceCandidate, bucket);
    }
  }

  for (const fund of funds) {
    const fundId = fundNodeId(fund.id);
    builder.addNode({
      id: fundId,
      type: "fund",
      label: fund.name,
      meta: {
        fundId: fund.id,
        slug: fund.slug,
        aumM: fund.aumM,
        trendScore: fund.trendScore,
        momentumScore: fund.momentumScore,
        sectors: fund.sectors,
        stages: fund.stages,
        geography: fund.geographies,
        portfolioCount: fund.portfolio.length,
      },
    });

    for (const gp of fundGpRecords(fund)) {
      const gpId = personNodeId(gp.id || hashId(`${fund.id}:${gp.name}`));
      builder.addNode({
        id: gpId,
        type: "person",
        label: gp.name,
        meta: {
          personId: gp.id,
          relatedFundId: fund.id,
          relatedFundSlug: fund.slug,
          relatedFundName: fund.name,
        },
      });
      builder.addLink({
        source: gpId,
        target: fundId,
        type: "MANAGES",
        weight: 0.8,
      });
    }

    for (const company of fundCompanyRecords(fund)) {
      const rawCompanyId = company.id?.trim() || companyKeyFromName(company.name);
      const companyId = companyNodeId(rawCompanyId);
      companyNameById.set(companyId, company.name);

      builder.addNode({
        id: companyId,
        type: "company",
        label: company.name,
        meta: {
          companyId: rawCompanyId,
          relatedFundId: fund.id,
          relatedFundSlug: fund.slug,
          relatedFundName: fund.name,
        },
      });
      builder.addLink({
        source: fundId,
        target: companyId,
        type: "PORTFOLIO",
        weight: 0.9,
      });
    }
  }

  for (const source of sources) {
    const id = sourceNodeId(source.id);
    builder.addNode({
      id,
      type: "source",
      label: source.title,
      meta: sourceMeta(source),
    });

    const metadataFundIds = Array.isArray(source.metadata?.matchedFundIds)
      ? (source.metadata?.matchedFundIds as string[]).map((entry) => String(entry).trim()).filter(Boolean)
      : [];
    const claimFundIds = Array.from(sourceFundIds.get(source.id) ?? []);
    const relatedFundIds = Array.from(new Set([...metadataFundIds, ...claimFundIds]));
    const cleanedSourceText = normalizeFundgraphText(`${source.title}. ${source.rawText ?? ""}`, 4000);
    const sourceEntities = extractEntityPhrases(cleanedSourceText).slice(0, 18);
    for (const entity of sourceEntities) {
      const entityLabel = normalizeEntityLabel(entity);
      if (!entityLabel) continue;
      if (entityLooksLikeFund(entityLabel, fundNameLookup)) continue;

      const cleanedCompany = sanitizeCompanyEntityLabel(entityLabel);
      if (!cleanedCompany) continue;
      const companyId = companyNodeId(companyKeyFromName(cleanedCompany));
      builder.addNode({
        id: companyId,
        type: "company",
        label: cleanedCompany,
        meta: {
          companyId: companyId.replace(/^company:/, ""),
          sourceId: source.id,
          derivedFrom: "source_text",
        },
      });
      builder.addLink({
        source: id,
        target: companyId,
        type: "MENTIONS",
        weight: 0.28,
      });
      builder.addCompanyMention(companyId, id);
      for (const relatedFundId of relatedFundIds) {
        const fundNode = ensureFundNodeId(relatedFundId);
        if (!fundNode) continue;
        builder.addLink({
          source: fundNode,
          target: companyId,
          type: "PORTFOLIO_MENTION",
          weight: 0.24,
        });
      }
    }
  }

  const sortedClaims = [...claims].sort((a, b) => {
    const trustA = a.trustScore ?? a.community.trustScore ?? 0;
    const trustB = b.trustScore ?? b.community.trustScore ?? 0;
    if (trustA !== trustB) return trustB - trustA;
    return +new Date(b.createdAt) - +new Date(a.createdAt);
  });

  const sortedSignals = [...signals].sort((a, b) => {
    const trustA = a.trustScore ?? 0;
    const trustB = b.trustScore ?? 0;
    if (trustA !== trustB) return trustB - trustA;
    return +new Date(b.createdAt) - +new Date(a.createdAt);
  });

  for (const signal of sortedSignals) {
    const signalId = signalNodeId(signal.id);
    const fundId = ensureFundNodeId(signal.fundId);

    builder.addNode({
      id: signalId,
      type: "signal",
      label: signal.title,
      meta: {
        signalId: signal.id,
        summary: signal.summary,
        confidence: signal.confidence,
        createdAt: signal.createdAt,
        fundId: signal.fundId,
        evidenceUrl: signal.evidenceUrl,
        evidenceSnippet: signal.evidenceSnippet,
        ...signalTrustMeta(signal),
      },
    });

    builder.addLink({
      source: signalId,
      target: fundId ?? fundNodeId(signal.fundId),
      type: "SIGNAL_FOR",
      weight: signal.confidence,
    });

    if (signal.evidenceUrl) {
      const sourceId = sourceNodeId(sourceKeyFromUrl(signal.evidenceUrl));
      builder.addNode({
        id: sourceId,
        type: "source",
        label: signal.evidenceUrl,
        meta: {
          sourceId: sourceId.replace(/^source:/, ""),
          title: signal.evidenceUrl,
          url: signal.evidenceUrl,
        },
      });
      builder.addLink({
        source: signalId,
        target: sourceId,
        type: "CITES",
        weight: 0.55,
      });
    }

    const signalEntities = extractEntityPhrases(`${signal.title}. ${signal.summary}`);
    const seenSignalEntities = new Set<string>();
    for (const entity of signalEntities) {
      const entityLabel = normalizeEntityLabel(entity);
      if (!entityLabel || seenSignalEntities.has(entityLabel.toLowerCase())) continue;
      seenSignalEntities.add(entityLabel.toLowerCase());
      if (entityLooksLikeFund(entityLabel, fundNameLookup)) continue;

      if (isLikelyPersonEntity(entityLabel)) {
        const personId = personNodeId(hashId(`signal:${signal.id}:${entityLabel.toLowerCase()}`));
        builder.addNode({
          id: personId,
          type: "person",
          label: entityLabel,
          meta: {
            personId: personId.replace(/^person:/, ""),
            relatedFundId: signal.fundId,
            relatedFundName: fundById.get(signal.fundId)?.name,
            derivedFrom: "signal_text",
          },
        });
        builder.addLink({
          source: signalId,
          target: personId,
          type: "ABOUT",
          weight: 0.38,
        });
        if (fundId) {
          builder.addLink({
            source: personId,
            target: fundId,
            type: "MENTIONS",
            weight: 0.32,
          });
        }
        continue;
      }

      const cleanedCompany = sanitizeCompanyEntityLabel(entityLabel);
      if (!cleanedCompany) continue;
      const companyId = companyNodeId(companyKeyFromName(cleanedCompany));
      builder.addNode({
        id: companyId,
        type: "company",
        label: cleanedCompany,
        meta: {
          companyId: companyId.replace(/^company:/, ""),
          relatedFundId: signal.fundId,
          relatedFundName: fundById.get(signal.fundId)?.name,
          derivedFrom: "signal_text",
        },
      });
      builder.addLink({
        source: signalId,
        target: companyId,
        type: "ABOUT",
        weight: 0.42,
      });
      if (fundId) {
        builder.addLink({
          source: fundId,
          target: companyId,
          type: "PORTFOLIO_MENTION",
          weight: 0.35,
        });
      }
    }
  }

  for (const claim of sortedClaims) {
    const claimId = claimNodeId(claim.id);
    builder.addNode({
      id: claimId,
      type: "claim",
      label: claim.claimText,
      meta: {
        claimId: claim.id,
        category: claim.category,
        snippet: claim.citation.snippet,
        sourceId: claim.sourceId,
        citationUrl: claim.citation.url,
        citationTitle: claim.citation.title,
        linkedFundIds: claim.linkedFundIds,
        createdAt: claim.createdAt,
        ...claimTrustMeta(claim),
      },
    });

    const citationSourceRaw =
      claim.citation.sourceId?.trim() ||
      claim.sourceId?.trim() ||
      (claim.citation.url ? sourceKeyFromUrl(claim.citation.url) : `claim-${hashId(claim.id)}`);
    const citationSourceId = sourceNodeId(citationSourceRaw);

    builder.addNode({
      id: citationSourceId,
      type: "source",
      label: claim.citation.title || claim.sourceId,
      meta: {
        sourceId: citationSourceRaw,
        title: claim.citation.title,
        url: claim.citation.url,
        snippet: claim.citation.snippet,
        articleId: claim.sourceId,
      },
    });

    builder.addLink({
      source: claimId,
      target: citationSourceId,
      type: "CITES",
      weight: 0.8,
    });

    for (const linkedFundId of claim.linkedFundIds ?? []) {
      const linkedFundNodeId = ensureFundNodeId(linkedFundId);
      if (!linkedFundNodeId) continue;
      builder.addLink({
        source: claimId,
        target: linkedFundNodeId,
        type: "ABOUT",
        weight: 0.75,
      });
    }

    for (const link of claim.links ?? claimLinksById.get(claim.id) ?? []) {
      if (link.targetType === "FUND") {
        const linkedFundNodeId = ensureFundNodeId(link.targetId);
        if (!linkedFundNodeId) continue;
        builder.addLink({
          source: claimId,
          target: linkedFundNodeId,
          type: "ABOUT",
          weight: link.score,
        });
        continue;
      }

      if (link.targetType === "GP") {
        const gpId = personNodeId(link.targetId || hashId(link.targetName));
        builder.addNode({
          id: gpId,
          type: "person",
          label: link.targetName,
          meta: {
            personId: link.targetId,
            relatedFundId: claim.linkedFundIds?.[0],
          },
        });
        builder.addLink({
          source: claimId,
          target: gpId,
          type: "ABOUT",
          weight: link.score,
        });
        continue;
      }

      const cleanedCompany = sanitizeCompanyEntityLabel(link.targetName);
      if (!cleanedCompany) continue;
      const companyId = companyNodeId(companyKeyFromName(cleanedCompany));
      if (!companyNameById.has(companyId)) {
        companyNameById.set(companyId, cleanedCompany);
      }
      builder.addNode({
        id: companyId,
        type: "company",
        label: companyNameById.get(companyId) ?? cleanedCompany,
        meta: {
          companyId: link.targetId,
          relatedFundId: claim.linkedFundIds?.[0],
          relatedFundName: claim.linkedFundIds?.[0],
        },
      });
      builder.addLink({
        source: claimId,
        target: companyId,
        type: "ABOUT",
        weight: link.score,
      });
      builder.addCompanyMention(companyId, citationSourceId);
    }

    const claimEntityLabels = Array.from(
      new Set((claim.entities ?? []).map((entry) => normalizeEntityLabel(entry)).filter(Boolean))
    ).slice(0, 20);
    for (const entityLabel of claimEntityLabels) {
      if (entityLooksLikeFund(entityLabel, fundNameLookup)) continue;

      if (isLikelyPersonEntity(entityLabel)) {
        const personId = personNodeId(hashId(`claim:${claim.id}:${entityLabel.toLowerCase()}`));
        builder.addNode({
          id: personId,
          type: "person",
          label: entityLabel,
          meta: {
            personId: personId.replace(/^person:/, ""),
            relatedFundIds: claim.linkedFundIds,
            derivedFrom: "claim_entities",
          },
        });
        builder.addLink({
          source: claimId,
          target: personId,
          type: "ABOUT",
          weight: 0.45,
        });
        for (const linkedFundId of claim.linkedFundIds ?? []) {
          const linkedFundNodeId = ensureFundNodeId(linkedFundId);
          if (!linkedFundNodeId) continue;
          builder.addLink({
            source: personId,
            target: linkedFundNodeId,
            type: "MENTIONS",
            weight: 0.34,
          });
        }
        continue;
      }

      const cleanedCompany = sanitizeCompanyEntityLabel(entityLabel);
      if (!cleanedCompany) continue;
      const companyId = companyNodeId(companyKeyFromName(cleanedCompany));
      builder.addNode({
        id: companyId,
        type: "company",
        label: cleanedCompany,
        meta: {
          companyId: companyId.replace(/^company:/, ""),
          relatedFundIds: claim.linkedFundIds,
          derivedFrom: "claim_entities",
        },
      });
      builder.addLink({
        source: claimId,
        target: companyId,
        type: "ABOUT",
        weight: 0.55,
      });
      builder.addCompanyMention(companyId, citationSourceId);
      for (const linkedFundId of claim.linkedFundIds ?? []) {
        const linkedFundNodeId = ensureFundNodeId(linkedFundId);
        if (!linkedFundNodeId) continue;
        builder.addLink({
          source: linkedFundNodeId,
          target: companyId,
          type: "PORTFOLIO_MENTION",
          weight: 0.4,
        });
      }
    }
  }

  let graph = builder.materialize();

  const focusByFund = resolveFundFocusId(funds, input.fundId, input.slug);
  const focusByClaim = input.claimId ? claimNodeId(input.claimId) : undefined;
  const focusNodeId = focusByFund ?? focusByClaim;

  if (focusNodeId) {
    graph = filterByFocus(graph, focusNodeId, depth);
  }

  graph = applyNodeLimit(graph, limit, focusNodeId);

  return {
    mode,
    focusNodeId,
    nodes: graph.nodes,
    links: graph.links,
    realModePlaceholder: mode === "real",
  };
}
