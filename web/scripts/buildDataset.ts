import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { DEFAULT_FETCH_OPTIONS, createLimiter, fetchText } from "./dataset/fetch";
import { parseRss } from "./dataset/rss";
import { SOURCES, feedsToFetch, getSourceType } from "./dataset/sources";
import { TOPICS } from "./dataset/topics";
import {
  extractHnIdFromUrl,
  fetchHnAlgoliaStoriesPaged,
  fetchHnItem,
  fetchHnTopComments,
  normalizeHnAlgoliaHit,
} from "./dataset/hn";
import { fetchRedditTopComments } from "./dataset/reddit";
import { dedupeByCanonicalUrl, normalizeRssToDatasetItem } from "./dataset/normalize";
import { tagItems } from "./dataset/tag";
import { clusterByTopic } from "./dataset/cluster";
import { DATASET_VERSION, DEFAULT_MAX_ITEMS } from "./dataset/constants";
import { ensureImagesDir, ensurePlaceholderImage, ImageStore, storeImageForItem, PLACEHOLDER_PUBLIC_PATH } from "./dataset/image";
import { extractArticleFromUrl } from "./dataset/extract";
import { DatasetFile, DatasetItem, StoryCluster } from "./dataset/schema";
import { canonicalizeUrl, domainFromUrl, stableId } from "./dataset/url";
import { embedItems } from "./dataset/embedding";
import {
  generateArticleBundle,
  generateAudienceReaction,
  generateClusterImpact,
  generateClusterMissing,
  generateClusterTrustMeta,
  generateTitleOnlySummary,
} from "./dataset/llm";
import { auditDataset } from "./dataset/audit";
import {
  ArticleOutput,
  ClusterOutput,
  writeArticles,
  writeClusters,
  writeEmbeddings,
  writeSummaries,
  writeTrustDashboard,
  writeTrustFields,
  writeNeighbors,
  writeSources,
} from "./dataset/output";
import { buildTrustFieldsDatasetWithBackfill } from "./enrichTrustFields";
import type { TrustFieldsDataset } from "../src/lib/trust/schema";

type RssNormalized = {
  item: DatasetItem;
  canonicalUrl: string;
  rssImageUrl: string | null;
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  const v = raw.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "no", "n", "off"].includes(v)) return false;
  return fallback;
}

function envCsv(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function faviconUrl(homepage?: string | null): string | null {
  if (!homepage) return null;
  try {
    const u = new URL(homepage);
    const host = u.hostname;
    if (!host) return null;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=128`;
  } catch {
    return null;
  }
}

function topNTagCounts(tagCounts: Map<string, number>, n = 12): Array<[string, number]> {
  return Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function createProgress(label: string, total: number, steps = 20) {
  const stepSize = Math.max(1, Math.floor(total / steps));
  let done = 0;
  return () => {
    done += 1;
    if (done % stepSize === 0 || done === total) {
      console.log(`${label} progress: ${done}/${total}`);
    }
  };
}

async function readJsonIfExists<T>(fp: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(fp, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function main() {
  const maxItems = envInt("DATASET_MAX_ITEMS", DEFAULT_MAX_ITEMS);
  const concurrency = envInt("DATASET_CONCURRENCY", DEFAULT_FETCH_OPTIONS.concurrency);
  const opts = { ...DEFAULT_FETCH_OPTIONS, concurrency };
  const limiter = createLimiter(opts.concurrency);
  const publicDir = path.join(process.cwd(), "public");
  const sourceById = new Map(SOURCES.map((s) => [s.id, s]));
  const skipImages = envBool("SKIP_IMAGES", false);
  const skipEmbed = envBool("SKIP_EMBED", false);
  const skipCluster = envBool("SKIP_CLUSTER", false);
  const skipLlm = envBool("SKIP_LLM", false);
  const sinceDays = envInt("DATASET_SINCE_DAYS", 7);
  const blockedTerms = envCsv("DATASET_BLOCKED_TERMS", ["deal", "discount", "coupon", "sale"]);
  const buildTrustFields = envBool("BUILD_TRUST_FIELDS", false);
  const trustForce = envBool("TRUST_FIELDS_FORCE", false);

  const feeds = feedsToFetch();
  console.log(`Fetching ${feeds.length} feeds...`);

  const existingItems: DatasetItem[] = [];
  const existingByUrl = new Map<string, DatasetItem>();
  try {
    const existingPath = path.join(publicDir, "data", "feed.json");
    const raw = await fs.readFile(existingPath, "utf8");
    const parsed = JSON.parse(raw) as DatasetFile;
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    for (const item of items) {
      const url = item.canonicalUrl ?? item.url;
      if (!url) continue;
      existingItems.push(item);
      existingByUrl.set(url, item);
    }
  } catch {
    // No existing dataset.
  }

  const rssResults = await Promise.allSettled(
    feeds.map((f) =>
      limiter.run(async () => {
        if (f.kind === "hn_algolia") {
          const pages = envInt("HN_ALGOLIA_PAGES", 5);
          const hits = await fetchHnAlgoliaStoriesPaged(opts, pages, 100);
          return { feed: f, kind: f.kind, hits };
        }
        const xml = await fetchText(f.url, opts);
        const parsed = await parseRss(xml);
        return { feed: f, kind: f.kind, parsed };
      })
    )
  );

  const normalized: RssNormalized[] = [];
  let sourcesFetched = 0;
  for (const r of rssResults) {
    if (r.status !== "fulfilled") continue;
    sourcesFetched++;
    const { feed, kind } = r.value;
    const sourceType = getSourceType(feed.sourceId);

    if (kind === "hn_algolia") {
      const hits = r.value.hits ?? [];
      for (const hit of hits) {
        const { item: dsItem, canonicalUrl } = normalizeHnAlgoliaHit(hit);
        if (!dsItem || !canonicalUrl) continue;
        if (existingByUrl.has(canonicalUrl)) continue;
        normalized.push({ item: dsItem, canonicalUrl, rssImageUrl: null });
      }
      continue;
    }

    const parsed = r.value.parsed;
    for (const item of parsed.items) {
      const { item: dsItem, canonicalUrl, rssImageUrl } = normalizeRssToDatasetItem({
        sourceId: feed.sourceId,
        sourceType,
        rssItem: item,
      });
      if (!dsItem || !canonicalUrl) continue;
      if (existingByUrl.has(canonicalUrl)) continue;
      normalized.push({ item: dsItem, canonicalUrl, rssImageUrl });
    }
  }

  // HN enrichment: if an item points to HN item URL, pull score/comments/url when possible.
  const hnEnriched: RssNormalized[] = [];
  for (const n of normalized) {
    if (n.item.sourceId !== "hackernews") {
      hnEnriched.push(n);
      continue;
    }
    const hnId = extractHnIdFromUrl(n.item.url);
    if (!hnId) {
      hnEnriched.push(n);
      continue;
    }
    const hn = await limiter.run(() => fetchHnItem(hnId, opts));
    if (hn) {
      n.item.signals = { hn: { id: hnId, score: hn.score, comments: hn.descendants } };
      if (hn.by) n.item.author = hn.by;
      if (hn.time) {
        const d = new Date(hn.time * 1000);
        if (!Number.isNaN(d.getTime())) n.item.publishedAt = d.toISOString();
      }
      // Prefer the linked article URL, but keep HN URL if absent.
      if (hn.url) {
        const canon = canonicalizeUrl(hn.url);
        n.item.url = canon;
        n.canonicalUrl = canon;
        n.item.id = stableId([n.item.sourceId, canon]);
        n.item.canonicalUrl = canon;
        n.item.domain = domainFromUrl(canon);
      }
    }
    hnEnriched.push(n);
  }

  // Resolve canonical URLs + extract readable text (best-effort).
  console.log(`Extracting text/canonical for ${hnEnriched.length} items...`);
  const extractProgress = createProgress("Extracting", hnEnriched.length);
  await Promise.all(
    hnEnriched.map((n) =>
      limiter.run(async () => {
        const extracted = await extractArticleFromUrl(n.item.url, opts);
        if (extracted.canonicalUrl) n.canonicalUrl = extracted.canonicalUrl;
        n.item.canonicalUrl = extracted.canonicalUrl ?? n.canonicalUrl;
        n.item.extractedText = extracted.text;
        n.item.imageCandidates = Array.from(
          new Set(
            [extracted.ogImageUrl, extracted.firstImageUrl].filter(
              (x): x is string => typeof x === "string" && x.length > 0
            )
          )
        );
        extractProgress();
      })
    )
  );

  const dedupedNew = dedupeByCanonicalUrl(hnEnriched.map((x) => ({ item: x.item, canonicalUrl: x.canonicalUrl })));
  const combined = dedupeByCanonicalUrl(
    [
      ...existingItems.map((item) => ({ item, canonicalUrl: item.canonicalUrl ?? item.url })),
      ...dedupedNew.map((item) => ({ item, canonicalUrl: item.canonicalUrl ?? item.url })),
    ].filter((x) => x.canonicalUrl)
  );
  const sinceMs = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const recent = combined.filter((item) => new Date(item.publishedAt).getTime() >= sinceMs);
  const bounded = recent.slice(0, maxItems);

  // Tagging
  const { items: tagged, tagCounts } = tagItems(bounded, TOPICS);
  const filtered = tagged.filter((item) => {
    const hay = `${item.title} ${item.summary}`.toLowerCase();
    return !blockedTerms.some((term) => term && hay.includes(term.toLowerCase()));
  });

  // Images
  let store: ImageStore | null = null;

  if (skipImages) {
    console.log("Skipping images (SKIP_IMAGES=1)...");
  } else {
    const imagesDir = await ensureImagesDir(publicDir);
    await ensurePlaceholderImage(publicDir, imagesDir);
    store = { imagesDir, downloaded: new Map(), downloadedCount: 0 };

    // Map from itemId to rss image candidate
    const rssImageById = new Map<string, string | null>();
    for (const x of hnEnriched) rssImageById.set(x.item.id, x.rssImageUrl);

    console.log(`Resolving images for ${filtered.length} items (cap 4000, max 600KB each)...`);
    const imageProgress = createProgress("Images", filtered.length);
    await Promise.all(
      filtered.map((item) =>
        limiter.run(async () => {
          const rssImg = rssImageById.get(item.id) ?? null;
          const candidates = [...(item.imageCandidates ?? []), rssImg].filter(Boolean) as string[];
          const source = sourceById.get(item.sourceId);
          const fallbackImageUrl = source?.logoUrl ?? faviconUrl(source?.homepage);
          const localPath = await storeImageForItem({
            itemId: item.id,
            candidateImageUrls: candidates,
            articleUrl: item.url,
            opts,
            store: store!,
            fallbackImageUrl,
          });
          item.media.imageUrl = localPath;
        imageProgress();
      })
      )
    );
  }

  // Embeddings
  if (skipEmbed) {
    console.log("Skipping embeddings (SKIP_EMBED=1)...");
  } else {
    console.log(`Embedding ${filtered.length} items...`);
    const embedStart = Date.now();
    await embedItems(filtered, envInt("EMBED_BATCH_SIZE", 16));
    console.log(`Embedding done in ${Math.round((Date.now() - embedStart) / 1000)}s`);
  }

  // Nearest neighbors (for right-swipe similar articles)
  const neighborK = envInt("NEIGHBOR_K", 8);
  const neighborMinSim = envFloat("NEIGHBOR_MIN_SIM", 0.78);
  const neighborMaxPerSource = envInt("NEIGHBOR_MAX_PER_SOURCE", 3);
  const embeddable = filtered.filter((i) => Array.isArray(i.embedding) && i.embedding.length > 0);
  const neighbors: Record<string, string[]> = {};

  if (skipEmbed) {
    console.log("Skipping neighbor calc (SKIP_EMBED=1)...");
  } else {
    for (let i = 0; i < embeddable.length; i++) {
      const a = embeddable[i];
      const aTags = new Set(a.tags ?? []);
      const scores: Array<{ id: string; sim: number; sourceId: string }> = [];
      for (let j = 0; j < embeddable.length; j++) {
        if (i === j) continue;
        const b = embeddable[j];
        if (!Array.isArray(b.embedding)) continue;
        // Require some tag overlap to stay topical
        const overlap = (b.tags ?? []).some((t) => aTags.has(t));
        if (!overlap) continue;
        const sim = cosineSimilarity(a.embedding!, b.embedding!);
        if (sim < neighborMinSim) continue;
        // Avoid piling too many from same source
        scores.push({ id: b.id, sim, sourceId: b.sourceId });
      }
      scores.sort((x, y) => y.sim - x.sim);
      const sourceCounts = new Map<string, number>();
      const picked: string[] = [];
      for (const s of scores) {
        if (picked.length >= neighborK) break;
        const cnt = sourceCounts.get(s.sourceId) ?? 0;
        if (cnt >= neighborMaxPerSource) continue;
        sourceCounts.set(s.sourceId, cnt + 1);
        picked.push(s.id);
      }
      if (picked.length) neighbors[a.id] = picked;
    }
  }

  // Clustering (on newest-first items)
  // Demo defaults: avoid mega-clusters from generic tags like "ai".
  const tokenThreshold = envFloat("CLUSTER_TOKEN_THRESHOLD", 0.22);
  const embeddingThreshold = envFloat("CLUSTER_EMBED_THRESHOLD", 0.78);
  const tagWeight = envFloat("CLUSTER_TAG_WEIGHT", 0.25);
  const domainBonus = envFloat("CLUSTER_DOMAIN_BONUS", 0.05);
  const minTagOverlap = envInt("CLUSTER_MIN_TAG_OVERLAP", 2);
  const filteredStories = skipCluster
    ? []
    : clusterByTopic(filtered, tokenThreshold, embeddingThreshold, 2, {
        tagWeight,
        domainBonus,
        minTagOverlap,
      });

  const itemsById = new Map(filtered.map((item) => [item.id, item]));
  const llmEnabled = Boolean(process.env.OPENAI_API_KEY);
  const llmLimiter = createLimiter(envInt("LLM_CONCURRENCY", 2));
  const llmMaxItems = envInt("LLM_MAX_ITEMS", filtered.length);
  const llmEnableClusters = envBool("LLM_ENABLE_CLUSTERS", true);
  const llmBundleEnabled = envBool("LLM_BUNDLE_ENABLED", true);

  const articleOutputs = new Map<
    string,
    {
      summary_markdown: string;
      bias: string;
      citations: string[];
      bulletSummary?: string[];
      biasAnalysis?: { vestedInterests: string[]; framingBias: string[]; confidence: "low" | "medium" | "high" };
      whatsMissing?: string[];
      impact?: { shortTerm: string[]; longTerm: string[] };
    }
  >();
  const audienceReactions = new Map<string, DatasetItem["audienceReaction"]>();

  // Reuse previously generated LLM outputs to avoid re-running OpenAI when doing a demo re-cluster.
  // If you want to force regeneration, set SKIP_LLM=0 and delete public/data/articles.json.
  try {
    const existingPath = path.join(publicDir, "data", "articles.json");
    const raw = await fs.readFile(existingPath, "utf8");
    const parsed = JSON.parse(raw) as { articles?: Array<Record<string, unknown>> };
    const arts = Array.isArray(parsed.articles) ? parsed.articles : [];
    for (const a of arts) {
      const id = String(a.id ?? "");
      const url = String(a.url ?? "");
      if (!id) continue;
      const summary_markdown = String(a.summary ?? "");
      const bias = String(a.bias ?? "");
      const bulletSummary = Array.isArray(a.bulletSummary) ? (a.bulletSummary as string[]).map(String) : undefined;
      const biasAnalysis =
        a.biasAnalysis && typeof a.biasAnalysis === "object"
          ? (a.biasAnalysis as { vestedInterests: string[]; framingBias: string[]; confidence: "low" | "medium" | "high" })
          : undefined;
      const whatsMissing = Array.isArray(a.whatsMissing) ? (a.whatsMissing as string[]).map(String) : undefined;
      const impact =
        a.impact && typeof a.impact === "object"
          ? (a.impact as { shortTerm: string[]; longTerm: string[] })
          : undefined;
      const reaction =
        a.audienceReaction && typeof a.audienceReaction === "object"
          ? (a.audienceReaction as DatasetItem["audienceReaction"])
          : undefined;
      if (summary_markdown) {
        articleOutputs.set(id, {
          summary_markdown,
          bias,
          citations: url ? [url] : [],
          bulletSummary,
          biasAnalysis,
          whatsMissing,
          impact,
        });
        if (reaction) audienceReactions.set(id, reaction);
      }
    }
  } catch {
    // Ignore if file doesn't exist yet.
  }

  if (llmEnabled && llmBundleEnabled && !skipLlm) {
    console.log(`Generating unified LLM bundles for up to ${llmMaxItems} items...`);
    let completed = 0;
    const target = Math.min(llmMaxItems, filtered.length);
    const logEvery = Math.max(1, Math.floor(target / 20)); // ~5% increments

    await Promise.all(
      filtered.slice(0, llmMaxItems).map((item) =>
        llmLimiter.run(async () => {
          const sourceName = sourceById.get(item.sourceId)?.name ?? item.sourceId;
          const metadata = [
            `Title: ${item.title}`,
            `Source: ${sourceName}`,
            `URL: ${item.url}`,
            `Published: ${item.publishedAt}`,
            `Author: ${item.author ?? "Not specified"}`,
            `Domain: ${item.domain ?? "Not specified"}`,
          ].join("\n");
          const baseText = item.extractedText ?? item.description ?? item.summary ?? "";
          const text = baseText.trim()
            ? baseText
            : "Full text not available. Only metadata and brief description provided.";

          // For very short inputs, infer bullets from title to keep summaries populated.
          if (!text || text.length < 500) {
            const inferred = await generateTitleOnlySummary({ metadata, title: item.title });
            const bullets = inferred.summary.length
              ? inferred.summary
              : [item.summary || item.title].filter(Boolean).slice(0, 1);
            articleOutputs.set(item.id, {
              summary_markdown: bullets.map((b) => `- ${b}`).join("\n"),
              bias: "",
              citations: [item.url],
              bulletSummary: bullets,
            });
          } else {
            try {
              const bundle = await generateArticleBundle({ metadata, text });
              const clean = bundle.summary.filter(
                (b) => !/^(source|source domain|published|domain|topics)\b/i.test(b.trim())
              );
              const finalBullets = clean.length ? clean : bundle.summary;
              const summary_markdown = finalBullets.map((b) => `- ${b}`).join("\n");
              const biasText = [
                `Vested interests: ${bundle.bias.vestedInterests.join("; ") || "Not specified."}`,
                `Framing: ${bundle.bias.framingBias.join("; ") || "Not specified."}`,
                `Confidence: ${bundle.bias.confidence}`,
              ].join("\n");

              articleOutputs.set(item.id, {
                summary_markdown,
                bias: biasText,
                citations: [item.url],
                bulletSummary: finalBullets,
                biasAnalysis: bundle.bias,
                whatsMissing: bundle.whatsMissing,
                impact: bundle.impact,
              });
            } catch {
              articleOutputs.set(item.id, {
                summary_markdown: `- ${item.summary || item.title}`,
                bias: "",
                citations: [item.url],
              });
            }
          }

          if (!audienceReactions.has(item.id)) {
            let comments: string[] = [];
            let reactionSource: "hn" | "reddit" | "inferred" = "inferred";
            if (item.sourceId === "hackernews" && item.signals?.hn?.id) {
              comments = await fetchHnTopComments(item.signals.hn.id, opts, 3);
              if (comments.length) reactionSource = "hn";
            } else if (item.sourceId.startsWith("reddit_")) {
              comments = await fetchRedditTopComments(item.url, opts, 3);
              if (comments.length) reactionSource = "reddit";
            }

            let summary = "";
            if (llmEnabled && !skipLlm) {
              try {
                const reaction = await generateAudienceReaction({
                  metadata,
                  text,
                  comments,
                  inferred: comments.length === 0,
                });
                summary = reaction.summary;
              } catch {
                summary = comments[0] ? comments[0].slice(0, 200) : `Inferred reaction: mixed or unclear.`;
              }
            } else {
              summary = comments[0] ? comments[0].slice(0, 200) : `Inferred reaction: mixed or unclear.`;
            }

            const reaction = summary
              ? {
                  summary,
                  comments: comments.length ? comments : undefined,
                  source: reactionSource,
                }
              : null;
            audienceReactions.set(item.id, reaction);
            item.audienceReaction = reaction;
          }

          completed += 1;
          if (completed % logEvery === 0 || completed === target) {
            console.log(`LLM progress: ${completed}/${target}`);
          }
        })
      )
    );
  }

  // Fill audience reaction for items not covered by LLM (lightweight fallback).
  const missingReactions = filtered.filter((item) => !audienceReactions.has(item.id));
  if (missingReactions.length) {
    await Promise.all(
      missingReactions.map((item) =>
        limiter.run(async () => {
          let comments: string[] = [];
          let reactionSource: "hn" | "reddit" | "inferred" = "inferred";
          if (item.sourceId === "hackernews" && item.signals?.hn?.id) {
            comments = await fetchHnTopComments(item.signals.hn.id, opts, 3);
            if (comments.length) reactionSource = "hn";
          } else if (item.sourceId.startsWith("reddit_")) {
            comments = await fetchRedditTopComments(item.url, opts, 3);
            if (comments.length) reactionSource = "reddit";
          }
          const summary = comments[0]
            ? comments[0].slice(0, 200)
            : "Inferred reaction: mixed or unclear.";
          const reaction = {
            summary,
            comments: comments.length ? comments : undefined,
            source: reactionSource,
          };
          audienceReactions.set(item.id, reaction);
          item.audienceReaction = reaction;
        })
      )
    );
  }

  const clusterOutputs = new Map<
    string,
    { missing: string; impact: string; framing: string; sentiment: string; agreement: string; confidence: string; framingSpectrum: string; coverageMix: string; selectionSignals: string }
  >();
  if (llmEnabled && llmEnableClusters) {
    console.log("Generating LLM cluster analyses...");
    await Promise.all(
      filteredStories.map((cluster) =>
        llmLimiter.run(async () => {
          const items = cluster.itemIds.map((id) => itemsById.get(id)).filter(Boolean) as DatasetItem[];
          if (items.length < 2) return;
          const variants = items
            .map((item) => {
              const sourceName = sourceById.get(item.sourceId)?.name ?? item.sourceId;
              const excerpt = item.description ?? item.summary ?? "";
              return `Source: ${sourceName}\nTitle: ${item.title}\nExcerpt: ${excerpt}\nURL: ${item.url}`;
            })
            .join("\n---\n");
          const repId = cluster.representativeItemId ?? cluster.itemIds[0];
          const repItem = repId ? itemsById.get(repId) : null;
          const repSummary = repItem ? articleOutputs.get(repItem.id)?.summary_markdown ?? repItem.summary : "";

          try {
            const [missing, impact, trust] = await Promise.all([
              generateClusterMissing({ variants }),
              generateClusterImpact({ summary: repSummary, variants }),
              generateClusterTrustMeta({ variants }),
            ]);
            clusterOutputs.set(cluster.id, {
              missing: missing.missing,
              impact: impact.impact,
              framing: trust.framing,
              sentiment: trust.sentiment,
              agreement: trust.agreement,
              confidence: trust.confidence,
              framingSpectrum: trust.framingSpectrum,
              coverageMix: trust.coverageMix,
              selectionSignals: trust.selectionSignals,
            });
          } catch {
            clusterOutputs.set(cluster.id, {
              missing: "Common ground:\n- Not specified.\nDifferences in framing:\n- Not specified.\nWhat’s missing:\n- Not specified.\nQuestions to ask next:\n- Not specified.",
              impact: "Immediate impact:\n- Not specified.\nSecond-order effects:\n- Not specified.\nWho benefits / who loses:\n- Not specified.\nTimeline to watch:\n- Not specified.\nPractical takeaway: Not specified.",
              framing: "Not specified.",
              sentiment: "Not specified.",
              agreement: "Not specified.",
              confidence: "Low (not specified).",
              framingSpectrum: "Not specified.",
              coverageMix: "Not specified.",
              selectionSignals: "Not specified.",
            });
          }
        })
      )
    );
  }

  const pickClusterImage = (items: DatasetItem[]): string | null => {
    const real = items.find((i) => i.media?.imageUrl && i.media.imageUrl !== PLACEHOLDER_PUBLIC_PATH);
    return real?.media?.imageUrl ?? items[0]?.media?.imageUrl ?? null;
  };

  const storyGroups = filteredStories.map((cluster) => {
    const items = cluster.itemIds.map((id) => itemsById.get(id)).filter(Boolean) as DatasetItem[];
    const repId = cluster.representativeItemId ?? cluster.itemIds[0];
    const repItem = repId ? itemsById.get(repId) : items[0] ?? null;
    const imageUrl = pickClusterImage(items);
    const citations = items.map((i) => i.url).filter(Boolean);
    const repSummary = repItem ? articleOutputs.get(repItem.id)?.summary_markdown ?? repItem.summary : "";
    const repBias = repItem ? articleOutputs.get(repItem.id)?.bias ?? "" : "";
    const clusterLlm = clusterOutputs.get(cluster.id);

    return {
      id: cluster.id,
      canonicalTitle: cluster.title,
      canonicalUrl: repItem?.canonicalUrl ?? repItem?.url,
      topicTags: cluster.tags,
      createdAt: cluster.createdAt ?? repItem?.publishedAt ?? new Date().toISOString(),
      updatedAt: cluster.updatedAt ?? repItem?.publishedAt ?? new Date().toISOString(),
      imageUrl,
      perspectives: items.map((item) => {
        const sourceName = sourceById.get(item.sourceId)?.name ?? item.sourceId;
        const articleLlm = articleOutputs.get(item.id);
        return {
          id: item.id,
          source: sourceName,
          sourceType: item.sourceType,
          url: item.url,
          canonicalUrl: item.canonicalUrl ?? item.url,
          title: item.title,
          summary: articleLlm?.summary_markdown ?? item.summary,
          bias: articleLlm?.bias ?? "",
          publishedAt: item.publishedAt,
          imageUrl: item.media?.imageUrl ?? null,
          author: item.author ?? null,
        };
      }),
      analysis: {
        summary_markdown: repSummary,
        bias: repBias,
        missing: clusterLlm?.missing ?? "",
        impact: clusterLlm?.impact ?? "",
        framing: clusterLlm?.framing ?? "",
        sentiment: clusterLlm?.sentiment ?? "",
        agreement: clusterLlm?.agreement ?? "",
        confidence: clusterLlm?.confidence ?? "",
        framingSpectrum: clusterLlm?.framingSpectrum ?? "",
        coverageMix: clusterLlm?.coverageMix ?? "",
        selectionSignals: clusterLlm?.selectionSignals ?? "",
        citations,
      },
    };
  });

  const dataset: DatasetFile = {
    version: DATASET_VERSION,
    generatedAt: new Date().toISOString(),
    sources: SOURCES,
    topics: TOPICS,
    items: filtered,
    stories: filteredStories,
  };

  // Persist new split outputs
  const articlesOut: ArticleOutput[] = filtered.map((item) => {
    const sourceName = sourceById.get(item.sourceId)?.name ?? item.sourceId;
    const llm = articleOutputs.get(item.id);
    const audienceReaction = audienceReactions.get(item.id) ?? item.audienceReaction ?? null;
    return {
      id: item.id,
      sourceId: item.sourceId,
      sourceName,
      sourceType: item.sourceType,
      title: item.title,
      url: item.url,
      canonicalUrl: item.canonicalUrl ?? item.url,
      publishedAt: item.publishedAt,
      author: item.author ?? null,
      summary: llm?.summary_markdown ?? item.summary,
      bias: llm?.bias ?? "",
      bulletSummary: llm?.bulletSummary ?? [],
      biasAnalysis: llm?.biasAnalysis,
      whatsMissing: llm?.whatsMissing ?? [],
      impact: llm?.impact,
      audienceReaction: audienceReaction ?? undefined,
      imageUrl: item.media?.imageUrl ?? null,
      tags: item.tags ?? [],
    };
  });

  const clustersOut: ClusterOutput[] = storyGroups.map((sg) => ({
    id: sg.id,
    canonicalTitle: sg.canonicalTitle,
    canonicalUrl: sg.canonicalUrl,
    topicTags: sg.topicTags,
    createdAt: sg.createdAt,
    updatedAt: sg.updatedAt,
    perspectives: sg.perspectives,
    analysis: sg.analysis,
    imageUrl: sg.imageUrl,
  }));

  const embeddingsMap: Record<string, number[]> = {};
  for (const item of filtered) {
    if (Array.isArray(item.embedding)) embeddingsMap[item.id] = item.embedding;
  }

  const summariesMap: Record<string, string> = {};
  for (const item of filtered) {
    const llm = articleOutputs.get(item.id);
    if (llm?.summary_markdown) summariesMap[item.id] = llm.summary_markdown;
  }

  const trustDashboard = clustersOut.map((c) => ({
    clusterId: c.id,
    title: c.canonicalTitle,
    missing: c.analysis.missing,
    biasAndFraming: c.analysis.framing ?? c.analysis.bias,
    sentiment: c.analysis.sentiment ?? "",
    coverageAgreement: c.analysis.agreement ?? "",
    confidence: c.analysis.confidence ?? "",
    framingSpectrum: c.analysis.framingSpectrum ?? "",
    coverageMix: c.analysis.coverageMix ?? "",
    selectionSignals: c.analysis.selectionSignals ?? "",
  }));

  const outPath = path.join(publicDir, "data", "feed.json");
  await writeArticles(publicDir, articlesOut, dataset.sources);
  await writeClusters(publicDir, clustersOut);
  await writeEmbeddings(publicDir, process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small", embeddingsMap);
  await writeSummaries(publicDir, summariesMap);
  await writeSources(publicDir, dataset.sources);
  if (buildTrustFields) {
    const trustPath = path.join(publicDir, "data", "trustFields.json");
    const existingTrust = await readJsonIfExists<TrustFieldsDataset>(trustPath);
    const trustDataset = await buildTrustFieldsDatasetWithBackfill(articlesOut, summariesMap, existingTrust, {
      limit: envInt("TRUST_FIELDS_LIMIT", articlesOut.length),
      concurrency: envInt("TRUST_FIELDS_CONCURRENCY", 4),
      force: trustForce,
    });
    await writeTrustFields(publicDir, trustDataset);
  }
  await writeTrustDashboard(publicDir, trustDashboard);
  await writeNeighbors(publicDir, neighbors);
  await fs.mkdir(path.join(publicDir, "data"), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(dataset, null, 2), "utf8");

  const storyGroupsPath = path.join(publicDir, "data", "storyGroups.json");
  await fs.writeFile(storyGroupsPath, JSON.stringify(storyGroups, null, 2), "utf8");

  // Audit final dataset
  const audit = await auditDataset(dataset, publicDir);
  console.log("---- Audit ----");
  console.log(audit.metrics);
  if (audit.invalid) {
    console.warn("Dataset marked INVALID by audit thresholds.");
  }

  console.log("---- Dataset summary ----");
  console.log(`Sources fetched: ${sourcesFetched}/${feeds.length}`);
  console.log(`Items ingested: ${normalized.length}`);
  console.log(`Items deduped:  ${dedupedNew.length} (new) / ${combined.length} (total)`);
  console.log(`Items output:   ${filtered.length} (max ${maxItems})`);
  console.log(`Stories:        ${filteredStories.length}`);
  console.log(`Images stored:  ${store ? store.downloadedCount : 0} (cap 1000, max 150KB each)`);
  console.log("Top tags:", topNTagCounts(tagCounts, 12));
  console.log(`Wrote: ${outPath}`);
  console.log(`Wrote: ${storyGroupsPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

