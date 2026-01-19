import { DatasetItem, SourceType, StoryCluster } from "./schema";
import { STOPWORDS } from "./stopwords";
import { stableId } from "./url";

function tokenize(title: string): Set<string> {
  const cleaned = title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = cleaned
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) {
    if (b.has(t)) inter++;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

type ClusterState = {
  id: string;
  repTitle: string;
  repTokens: Set<string>;
  repEmbedding: number[] | null;
  repDomain: string | null;
  count: number;
  repItemId: string;
  createdAt: string;
  updatedAt: string;
  itemIds: string[];
  tags: Set<string>;
  lenses: Record<SourceType, string[]>;
};

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function updateEmbeddingAverage(prev: number[] | null, next: number[], count: number): number[] {
  if (!prev) return [...next];
  const out = prev.slice(0, next.length);
  for (let i = 0; i < next.length; i++) {
    out[i] = (prev[i]! * count + next[i]!) / (count + 1);
  }
  return out;
}

function emptyLenses(): Record<SourceType, string[]> {
  return {
    editorial: [],
    community: [],
    primary: [],
    vc_blog: [],
    aggregator: [],
    social: [],
  };
}

export function clusterItems(
  items: DatasetItem[],
  tokenThreshold = 0.5,
  embeddingThreshold = 0.85
): StoryCluster[] {
  const clusters: ClusterState[] = [];

  for (const item of items) {
    const tokens = tokenize(item.title);
    let bestIdx = -1;
    let bestScore = 0;
    let bestUsedEmbedding = false;
    const embedding = Array.isArray(item.embedding) && item.embedding.length ? item.embedding : null;

    // Greedy assign to best existing cluster rep.
    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[i];
      let score = 0;
      let usedEmbedding = false;
      if (embedding && c.repEmbedding) {
        score = cosineSimilarity(embedding, c.repEmbedding);
        usedEmbedding = true;
      } else {
        score = jaccard(tokens, c.repTokens);
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
        bestUsedEmbedding = usedEmbedding;
      }
    }

    const threshold = bestUsedEmbedding ? embeddingThreshold : tokenThreshold;
    if (bestIdx !== -1 && bestScore >= threshold) {
      const c = clusters[bestIdx];
      c.itemIds.push(item.id);
      item.tags.forEach((t) => c.tags.add(t));
      c.lenses[item.sourceType]?.push(item.id);
      if (embedding) {
        c.repEmbedding = updateEmbeddingAverage(c.repEmbedding, embedding, c.count);
        c.count += 1;
      } else {
        c.count += 1;
      }
      if (new Date(item.publishedAt).getTime() > new Date(c.updatedAt).getTime()) {
        c.updatedAt = item.publishedAt;
      }
      continue;
    }

    const id = stableId(["cluster", item.id]);
    const st: ClusterState = {
      id,
      repTitle: item.title,
      repTokens: tokens,
      repEmbedding: embedding ? [...embedding] : null,
      repDomain: item.domain ?? null,
      count: 1,
      repItemId: item.id,
      createdAt: item.publishedAt,
      updatedAt: item.publishedAt,
      itemIds: [item.id],
      tags: new Set(item.tags),
      lenses: emptyLenses(),
    };
    st.lenses[item.sourceType].push(item.id);
    clusters.push(st);
  }

  // Convert to output schema.
  return clusters.map((c) => ({
    id: c.id,
    title: c.repTitle,
    tags: Array.from(c.tags),
    itemIds: c.itemIds,
    lenses: c.lenses,
    representativeItemId: c.repItemId,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    narrativeDiff: null,
    verify: { claims: [] },
    opposing: null,
  }));
}

// Topic-similarity clustering: looser thresholds to group related coverage, not only near-duplicates.
export function clusterByTopic(
  items: DatasetItem[],
  tokenThreshold = 0.25,
  embeddingThreshold = 0.78,
  minSize = 2,
  opts?: { tagWeight?: number; domainBonus?: number; minTagOverlap?: number }
): StoryCluster[] {
  const clusters: ClusterState[] = [];
  const tagWeight = Math.max(0, Math.min(1, opts?.tagWeight ?? 0.65));
  const domainBonus = Math.max(0, Math.min(0.4, opts?.domainBonus ?? 0.08));
  const minTagOverlap = Math.max(1, opts?.minTagOverlap ?? 1);
  const stopTags = new Set(
    (process.env.CLUSTER_STOP_TAGS ?? "ai,general,frontend,devtools,data")
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
  );

  for (const item of items) {
    const tokens = tokenize(item.title);
    const embedding = Array.isArray(item.embedding) && item.embedding.length ? item.embedding : null;
    const itemTags = new Set((item.tags ?? []).map((t) => t.toLowerCase()));
    const informativeItemTags = new Set(Array.from(itemTags).filter((t) => !stopTags.has(t)));

    let bestIdx = -1;
    let bestScore = 0;
    let bestUsedEmbedding = false;

    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[i];
      let score = 0;
      let usedEmbedding = false;
      if (embedding && c.repEmbedding) {
        score = cosineSimilarity(embedding, c.repEmbedding);
        usedEmbedding = true;
      } else {
        score = jaccard(tokens, c.repTokens);
      }

      // Tag overlap is a strong signal for demo clustering.
      if (informativeItemTags.size && c.tags.size) {
        const informativeClusterTags = new Set(Array.from(c.tags).map((t) => t.toLowerCase()).filter((t) => !stopTags.has(t)));
        let overlap = 0;
        for (const t of informativeItemTags) {
          if (informativeClusterTags.has(t)) overlap++;
        }
        if (overlap >= minTagOverlap) {
          const denom = Math.max(1, Math.min(informativeItemTags.size, informativeClusterTags.size));
          const tagScore = (overlap / denom) * tagWeight;
          // Important: treat tags as a bonus signal, not a replacement. Otherwise a single generic tag
          // (like "ai") can collapse the entire dataset into a handful of mega-clusters.
          score = Math.min(1, score + tagScore);
        }
      }

      if (item.domain && c.repDomain && item.domain === c.repDomain) {
        score = Math.min(1, score + domainBonus);
      }

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
        bestUsedEmbedding = usedEmbedding;
      }
    }

    const threshold = bestUsedEmbedding ? embeddingThreshold : tokenThreshold;
    if (bestIdx !== -1 && bestScore >= threshold) {
      const c = clusters[bestIdx];
      c.itemIds.push(item.id);
      item.tags.forEach((t) => c.tags.add(t));
      c.lenses[item.sourceType]?.push(item.id);
      if (embedding) {
        c.repEmbedding = updateEmbeddingAverage(c.repEmbedding, embedding, c.count);
        c.count += 1;
      } else {
        c.count += 1;
      }
      if (new Date(item.publishedAt).getTime() > new Date(c.updatedAt).getTime()) {
        c.updatedAt = item.publishedAt;
      }
      continue;
    }

    const id = stableId(["topic", item.id]);
    const st: ClusterState = {
      id,
      repTitle: item.title,
      repTokens: tokens,
      repEmbedding: embedding ? [...embedding] : null,
      repDomain: item.domain ?? null,
      count: 1,
      repItemId: item.id,
      createdAt: item.publishedAt,
      updatedAt: item.publishedAt,
      itemIds: [item.id],
      tags: new Set(item.tags),
      lenses: emptyLenses(),
    };
    st.lenses[item.sourceType].push(item.id);
    clusters.push(st);
  }

  return clusters
    .filter((c) => c.itemIds.length >= minSize)
    .map((c) => ({
      id: c.id,
      title: c.repTitle,
      tags: Array.from(c.tags),
      itemIds: c.itemIds,
      lenses: c.lenses,
      representativeItemId: c.repItemId,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      narrativeDiff: null,
      verify: { claims: [] },
      opposing: null,
    }));
}
