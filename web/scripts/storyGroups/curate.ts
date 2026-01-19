import { STOPWORDS } from "../dataset/stopwords";
import { stableId } from "../dataset/url";

export type StanceTag = "mainstream" | "balanced" | "skeptical";

export type CurateItem = {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceType: string;
  title: string;
  url: string;
  publishedAt: string;
  summary: string;
  tags: string[];
  imageUrl?: string | null;
};

export type StoryGroupSummary = {
  bullets: string[];
  implications: string[];
  risks: string[];
};

export type StoryGroupPerspective = {
  id: string;
  source: string;
  sourceType: string;
  url: string;
  title: string;
  stanceTag: StanceTag;
  framing: string;
  summary?: string;
  publishedAt?: string;
  imageUrl?: string | null;
};

export type StoryGroupCandidate = {
  id: string;
  canonicalTitle: string;
  canonicalUrl?: string;
  topicTags: string[];
  createdAt: string;
  perspectives: StoryGroupPerspective[];
  imageUrl?: string | null;
  items: CurateItem[];
};

export type StoryGroup = Omit<StoryGroupCandidate, "items"> & { summary: StoryGroupSummary };

export type ClusterOptions = {
  threshold?: number;
  minPerspectives?: number;
  minSources?: number;
  maxPerspectives?: number;
};

type ClusterState = {
  repTitle: string;
  repTokens: Set<string>;
  items: CurateItem[];
};

function stripBracketed(input: string): string {
  return input.replace(/\[[^\]]*]/g, " ").replace(/\([^)]*\)/g, " ");
}

function stripSourcePrefix(input: string): string {
  const idx = input.indexOf(":");
  if (idx > 0 && idx < 30) {
    return input.slice(idx + 1).trim();
  }
  return input;
}

function normalizeTitle(title: string): string {
  const cleaned = stripSourcePrefix(stripBracketed(title));
  return cleaned
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(title: string): Set<string> {
  const cleaned = normalizeTitle(title);
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

function stanceTagFromText(title: string, summary: string): StanceTag {
  const text = `${title} ${summary}`.toLowerCase();
  const skeptical = [
    "fails",
    "failure",
    "concern",
    "criticism",
    "critic",
    "lawsuit",
    "backlash",
    "risk",
    "ban",
    "warn",
    "probe",
    "investigation",
    "breach",
    "vulnerability",
    "exploit",
    "decline",
    "cut",
    "layoff",
    "miss",
  ];
  const optimistic = [
    "launch",
    "release",
    "breakthrough",
    "wins",
    "growth",
    "record",
    "raises",
    "funding",
    "approval",
    "clears",
    "acquires",
    "ships",
    "expands",
  ];
  if (skeptical.some((kw) => text.includes(kw))) return "skeptical";
  if (optimistic.some((kw) => text.includes(kw))) return "mainstream";
  return "balanced";
}

function framingFromStance(tag: StanceTag): string {
  if (tag === "skeptical") return "Emphasizes risks, caveats, or unresolved questions.";
  if (tag === "mainstream") return "Highlights the core announcement and immediate implications.";
  return "Balances key facts with context and constraints.";
}

function pickLatestBySource(items: CurateItem[], maxPerspectives: number): CurateItem[] {
  const bySource = new Map<string, CurateItem>();
  for (const item of items) {
    const existing = bySource.get(item.sourceId);
    if (!existing) {
      bySource.set(item.sourceId, item);
      continue;
    }
    const a = new Date(existing.publishedAt).getTime();
    const b = new Date(item.publishedAt).getTime();
    if (b > a) bySource.set(item.sourceId, item);
  }
  const selected = Array.from(bySource.values()).sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
  return selected.slice(0, Math.max(2, maxPerspectives));
}

export function clusterItemsByTitle(items: CurateItem[], threshold = 0.5): ClusterState[] {
  const clusters: ClusterState[] = [];
  for (const item of items) {
    const tokens = tokenize(item.title);
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < clusters.length; i++) {
      const score = jaccard(tokens, clusters[i].repTokens);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx !== -1 && bestScore >= threshold) {
      clusters[bestIdx].items.push(item);
      continue;
    }
    clusters.push({
      repTitle: item.title,
      repTokens: tokens,
      items: [item],
    });
  }
  return clusters;
}

export function buildStoryGroupCandidates(items: CurateItem[], opts: ClusterOptions = {}): StoryGroupCandidate[] {
  const threshold = opts.threshold ?? 0.5;
  const minPerspectives = opts.minPerspectives ?? 2;
  const minSources = opts.minSources ?? 2;
  const maxPerspectives = opts.maxPerspectives ?? 6;

  const clusters = clusterItemsByTitle(items, threshold);
  const candidates: StoryGroupCandidate[] = [];

  for (const cluster of clusters) {
    const sorted = [...cluster.items].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
    const chosen = pickLatestBySource(sorted, maxPerspectives);
    const sourceIds = new Set(chosen.map((i) => i.sourceId));
    if (chosen.length < minPerspectives || sourceIds.size < minSources) continue;

    const topicTags = Array.from(new Set(sorted.flatMap((i) => i.tags ?? []))).filter(Boolean);
    const createdAt = sorted.reduce((latest, item) => {
      return new Date(item.publishedAt) > new Date(latest) ? item.publishedAt : latest;
    }, sorted[0]?.publishedAt ?? new Date().toISOString());
    const imageUrl = chosen.find((i) => i.imageUrl)?.imageUrl ?? null;

    const perspectives = chosen.map((item) => {
      const stanceTag = stanceTagFromText(item.title, item.summary);
      return {
        id: stableId(["perspective", item.id]),
        source: item.sourceName,
        sourceType: item.sourceType,
        url: item.url,
        title: item.title,
        stanceTag,
        framing: framingFromStance(stanceTag),
        summary: item.summary,
        publishedAt: item.publishedAt,
        imageUrl: item.imageUrl ?? null,
      } satisfies StoryGroupPerspective;
    });

    const canonical = chosen[0];
    const groupId = stableId(["story", ...chosen.map((i) => i.id).sort()]);

    candidates.push({
      id: groupId,
      canonicalTitle: canonical.title,
      canonicalUrl: canonical.url,
      topicTags: topicTags.length ? topicTags : ["general"],
      createdAt: canonical.publishedAt,
      perspectives,
      imageUrl,
      items: chosen,
    });
  }

  return candidates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function coerceSummary(value: StoryGroupSummary | null | undefined): StoryGroupSummary {
  if (!value) {
    return { bullets: [], implications: [], risks: [] };
  }
  const uniq = (arr?: string[]) => Array.from(new Set((arr ?? []).map((s) => s.trim()).filter(Boolean)));
  return {
    bullets: uniq(value.bullets),
    implications: uniq(value.implications),
    risks: uniq(value.risks),
  };
}
