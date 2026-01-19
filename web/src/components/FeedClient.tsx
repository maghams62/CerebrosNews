"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FeedItem } from "@/types/feed";
import { StoryWithInsights } from "@/types/storyWithInsights";
import { FeedScroller } from "@/components/FeedScroller";
import { FocusedViewerFrame } from "@/components/FocusedViewerFrame";
import { ResetOnboardingButton } from "@/components/ResetOnboardingButton";
import { feedItemToStory } from "@/lib/feed/toStory";
import { mockInsightBundle } from "@/lib/insights/mockInsightBundle";
import { loadTrustFields } from "@/lib/trust/loadTrustFields";
import {
  APP_STATE_EVENT,
  APP_STATE_STORAGE_KEY,
  FEED_REFRESH_STORAGE_KEY,
  loadAppState,
  updateAppState,
} from "@/lib/appState/storage";
import { ConnectorId } from "@/types/appState";
import { StoryGroup } from "@/types/storyGroup";
import { canonicalizeTag } from "@/lib/tags/highSignal";
import { storyGroupsToStories } from "@/lib/storyGroups/toStories";

function relativeTimeFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const deltaMs = Date.now() - d.getTime();
  const mins = Math.max(0, Math.floor(deltaMs / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function isPlaceholderImage(url?: string | null): boolean {
  if (!url) return true;
  return url.includes("placeholder.svg") || url.includes("/globe.svg");
}

function extractBullets(markdown: string | undefined | null): string[] {
  if (!markdown) return [];
  return markdown
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.replace(/^-+\s*/, "").trim())
    .filter(Boolean);
}

function isGoodBulletSummary(markdown: string | undefined | null): boolean {
  if (!markdown) return false;
  const lower = markdown.toLowerCase();
  if (lower.includes("not specified")) return false;
  if (lower.includes("key points:")) return false;
  const bullets = extractBullets(markdown);
  if (bullets.length < 2) return false;
  if (bullets.length > 8) return false;
  if (bullets.some((b) => b.length > 140)) return false;
  return true;
}

function titleTokenSet(title: string | undefined | null): Set<string> {
  const t = (title ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return new Set();
  const toks = t
    .split(" ")
    .map((x) => x.trim())
    .filter((x) => x.length >= 3);
  return new Set(toks);
}

function tokenJaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

function normalizeTagList(tags: string[] | undefined | null): string[] {
  if (!tags?.length) return [];
  return tags.map((t) => t.toLowerCase().trim()).filter(Boolean);
}

function normalizeMatchText(text: string | undefined | null): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readRefreshSignal(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(FEED_REFRESH_STORAGE_KEY);
  } catch {
    return null;
  }
}

function latestIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (a && b) return a >= b ? a : b;
  return a ?? b ?? null;
}

function normalizeSourceName(name: string | undefined | null): string {
  return (name ?? "").toLowerCase().trim();
}

function buildSourceFilter(entries: Array<{ name: string; enabled: boolean }>): Map<string, boolean> {
  const map = new Map<string, boolean>();
  entries.forEach((entry) => {
    const key = normalizeSourceName(entry.name);
    if (key) map.set(key, entry.enabled);
  });
  return map;
}

function isSourceAllowed(name: string | undefined | null, enabledMap: Map<string, boolean>): boolean {
  const key = normalizeSourceName(name);
  if (!key) return true;
  if (!enabledMap.has(key)) return true;
  return enabledMap.get(key) ?? true;
}

function filterFeedItemsBySources(items: FeedItem[], enabledMap: Map<string, boolean>): FeedItem[] {
  if (!enabledMap.size) return items;
  return items.filter((item) => isSourceAllowed(item.sourceName, enabledMap));
}

function filterStoryGroupsBySources(groups: StoryGroup[], enabledMap: Map<string, boolean>): StoryGroup[] {
  if (!enabledMap.size) return groups;
  return groups
    .map((g) => {
      const perspectives = (g.perspectives ?? []).filter((p) => isSourceAllowed(p.source, enabledMap));
      if (!perspectives.length) return null;
      return { ...g, perspectives };
    })
    .filter(Boolean) as StoryGroup[];
}

function buildMatchers(topics: string[]) {
  const seen = new Set<string>();
  const out: Array<{ canonical: string | null; token: string }> = [];
  for (const raw of topics) {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) continue;
    const canonical = canonicalizeTag(trimmed);
    const token = normalizeMatchText(canonical ?? trimmed);
    if (!token) continue;
    const key = `${canonical ?? ""}::${token}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ canonical: canonical ? canonical.toLowerCase() : null, token });
  }
  return out;
}

function softOrderByPreferences<T>(
  items: T[],
  preferredTopics: string[],
  blockedKeywords: string[],
  getTags: (item: T) => string[] | undefined | null,
  getText: (item: T) => string | undefined | null,
  getDateIso: (item: T) => string | undefined | null
): T[] {
  const preferredMatchers = buildMatchers(preferredTopics);
  const blockedMatchers = buildMatchers(blockedKeywords);
  if (!preferredMatchers.length && !blockedMatchers.length) return items;

  const decorated = items.map((item, index) => {
    const tags = normalizeTagList(getTags(item));
    const tagCanonical = new Set(
      tags.map((t) => canonicalizeTag(t)?.toLowerCase()).filter(Boolean) as string[]
    );
    const tagText = tags.join(" ");
    const text = normalizeMatchText(getText(item));

    let score = 0;
    for (const pref of preferredMatchers) {
      if (pref.canonical && tagCanonical.has(pref.canonical)) score += 3;
      if (pref.token && tagText.includes(pref.token)) score += 2;
      if (pref.token && text.includes(pref.token)) score += 1;
    }

    let blocked = false;
    for (const blk of blockedMatchers) {
      if (blk.canonical && tagCanonical.has(blk.canonical)) {
        blocked = true;
        break;
      }
      if (blk.token && tagText.includes(blk.token)) {
        blocked = true;
        break;
      }
    }

    const dateIso = getDateIso(item);
    const date = dateIso ? new Date(dateIso).getTime() : 0;
    return { item, index, score, blocked, date: Number.isFinite(date) ? date : 0 };
  });

  decorated.sort((a, b) => {
    if (a.blocked !== b.blocked) return a.blocked ? 1 : -1;
    if (a.score !== b.score) return b.score - a.score;
    if (a.date !== b.date) return b.date - a.date;
    return a.index - b.index;
  });

  return decorated.map((d) => d.item);
}

function curatedDemoGroups(input: StoryGroup[], target: number | null, preferredTopics: string[]): StoryGroup[] {
  // Show everything, but rank by source quality, topic relevance, and recency.
  const out: StoryGroup[] = [];

  const boosts = (process.env.NEXT_PUBLIC_DEMO_SOURCE_BOOST ??
    "reuters,associated press,ap,bloomberg,financial times,ft,wall street journal,wsj,the verge,techcrunch,engadget,wired,bbc,guardian,nytimes,new york times,a16z,andreessen,accel,sequoia,greylock,bessemer,usv,union square ventures,lightspeed,index ventures,insight partners,coatue,redpoint,benchmark,khosla,first round,signal,founders fund,nfx,y combinator,yc")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const sourceBoostScore = (g: StoryGroup): number => {
    const sources = (g.perspectives ?? []).map((p) => (p.source ?? "").toLowerCase());
    let score = 0;
    for (const s of sources) {
      if (!s) continue;
      if (boosts.some((b) => s.includes(b))) score = Math.max(score, 3);
    }
    return score;
  };

  const preferred = new Set(preferredTopics.map((t) => t.toLowerCase()).filter(Boolean));
  const topicScore = (g: StoryGroup): number => {
    if (!preferred.size) return 0;
    return (g.topicTags ?? []).filter((t) => preferred.has(t.toLowerCase())).length;
  };

  const sortedGroups = [...input].sort((a, b) => {
    const aBoost = sourceBoostScore(a);
    const bBoost = sourceBoostScore(b);
    if (aBoost !== bBoost) return bBoost - aBoost;

    const aTopic = topicScore(a);
    const bTopic = topicScore(b);
    if (aTopic !== bTopic) return bTopic - aTopic;

    const ap = a.perspectives?.length ?? 0;
    const bp = b.perspectives?.length ?? 0;
    if (ap !== bp) return bp - ap;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  if (!target || target <= 0) return sortedGroups;

  for (const g of sortedGroups) {
    if (out.length >= target) break;
    const perspectives = [...(g.perspectives ?? [])].sort(
      (a, b) => new Date(b.publishedAt ?? "").getTime() - new Date(a.publishedAt ?? "").getTime()
    );

    // Keep small groups as-is.
    if (perspectives.length <= 5) {
      out.push(g);
      continue;
    }

    // Greedy pack perspectives into subgroups with source diversity AND title similarity.
    const used = new Set<string>();
    let subgroupIdx = 0;
    while (out.length < target) {
      // Pick a seed that has a good bullet summary (otherwise the card will look broken).
      const seed = perspectives.find((p) => !used.has(p.id) && isGoodBulletSummary(p.summary)) ?? null;
      if (!seed) break;

      const seedTokens = titleTokenSet(seed.title);
      const scored = perspectives
        .filter((p) => !used.has(p.id) && p.id !== seed.id)
        .map((p) => ({
          p,
          sim: tokenJaccard(seedTokens, titleTokenSet(p.title)),
        }))
        .sort((a, b) => b.sim - a.sim);

      const chosen: typeof perspectives = [seed];
      const chosenSources = new Set<string>([(seed.source ?? "").toLowerCase()]);
      for (const s of scored) {
        if (chosen.length >= 3) break;
        // Avoid unrelated right-swipe: require at least a tiny token overlap.
        if (s.sim < 0.06) continue;
        const src = (s.p.source ?? "").toLowerCase();
        if (!src) continue;
        if (chosenSources.has(src)) continue;
        chosen.push(s.p);
        chosenSources.add(src);
      }

      if (chosen.length < 2) {
        used.add(seed.id);
        continue;
      }

      chosen.forEach((p) => used.add(p.id));
      const imageUrl =
        chosen.find((p) => p.imageUrl && !isPlaceholderImage(p.imageUrl))?.imageUrl ??
        (g.imageUrl && !isPlaceholderImage(g.imageUrl) ? g.imageUrl : null) ??
        chosen.find((p) => p.imageUrl)?.imageUrl ??
        g.imageUrl ??
        null;

      const createdAt = seed.publishedAt ?? g.createdAt;
      const updatedAt =
        chosen.reduce((max, p) => {
          const t = new Date(p.publishedAt ?? "").getTime();
          return Number.isFinite(t) ? Math.max(max, t) : max;
        }, new Date(createdAt).getTime()) || new Date(createdAt).getTime();

      const subgroup: StoryGroup = {
        id: `${g.id}::${subgroupIdx++}`,
        canonicalTitle: seed.title || g.canonicalTitle,
        canonicalUrl: seed.canonicalUrl ?? seed.url ?? g.canonicalUrl,
        topicTags: g.topicTags ?? [],
        createdAt,
        updatedAt: new Date(updatedAt).toISOString(),
        imageUrl,
        perspectives: chosen,
        analysis: {
          // Per-card summary should be the seed article's bullet summary if present.
          summary_markdown: seed.summary ?? "",
          bias: g.analysis?.bias ?? "",
          missing: g.analysis?.missing ?? "",
          impact: g.analysis?.impact ?? "",
          framing: g.analysis?.framing ?? "",
          sentiment: g.analysis?.sentiment ?? "",
          agreement: g.analysis?.agreement ?? "",
          confidence: g.analysis?.confidence ?? "",
          framingSpectrum: g.analysis?.framingSpectrum ?? "",
          coverageMix: g.analysis?.coverageMix ?? "",
          selectionSignals: g.analysis?.selectionSignals ?? "",
          citations: chosen.map((p) => p.url).filter(Boolean) as string[],
        },
      };

      out.push(subgroup);
    }
  }

  // Curate ordering: prioritize cards that (a) have bullets, (b) have real images, (c) have ≥2 perspectives.
  const scored = out
    .map((g) => {
      const bullets = isGoodBulletSummary(g.analysis?.summary_markdown);
      const imgOk = !isPlaceholderImage(g.imageUrl);
      const pCount = g.perspectives?.length ?? 0;
      const uniqueSources = new Set((g.perspectives ?? []).map((p) => (p.source ?? "").toLowerCase())).size;
      const score =
        (bullets ? 6 : 0) +
        (imgOk ? 3 : 0) +
        Math.min(2, pCount - 1) +
        Math.min(2, uniqueSources - 1) +
        sourceBoostScore(g);
      return { g, score };
    })
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return new Date(b.g.createdAt).getTime() - new Date(a.g.createdAt).getTime();
    })
    .map((x) => x.g);

  return scored;
}

function mergeConnectorItems(items: FeedItem[], connectorItems: Record<string, FeedItem[]>, enabled: Record<ConnectorId, boolean>) {
  const merged = [...items];
  Object.entries(connectorItems).forEach(([id, arr]) => {
    if (!enabled[id as ConnectorId]) return;
    merged.push(...arr);
  });
  const byKey = new Map<string, FeedItem>();
  merged.forEach((item) => {
    const key = item.url ?? item.postUrl ?? item.id;
    if (!byKey.has(key)) byKey.set(key, item);
  });
  const sorted = Array.from(byKey.values()).sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
  if (!enabled.bluesky) return sorted;
  return mixInSocialItems(sorted, 5);
}

function mixInSocialItems(items: FeedItem[], interval: number) {
  const social = items.filter((item) => item.sourceType === "social");
  if (!social.length) return items;
  const nonSocial = items.filter((item) => item.sourceType !== "social");
  const mixed: FeedItem[] = [];
  let socialIndex = 0;
  nonSocial.forEach((item, index) => {
    mixed.push(item);
    const shouldInsert = (index + 1) % interval === 0 && socialIndex < social.length;
    if (shouldInsert) {
      mixed.push(social[socialIndex]);
      socialIndex += 1;
    }
  });
  while (socialIndex < social.length) {
    mixed.push(social[socialIndex]);
    socialIndex += 1;
  }
  return mixed;
}

export function FeedClient({
  initialFeedItems,
  initialStoryGroups,
}: {
  initialFeedItems?: FeedItem[] | null;
  initialStoryGroups?: StoryGroup[] | null;
}) {
  const [stories, setStories] = useState<StoryWithInsights[]>([]);
  const [lastUpdatedIso, setLastUpdatedIso] = useState(new Date().toISOString());
  const [sourcesCount, setSourcesCount] = useState(0);
  const [itemsCount, setItemsCount] = useState(0);
  const [trustFieldIndex, setTrustFieldIndex] = useState<Record<string, { trust: import("@/lib/trust/schema").TrustFields }>>({});
  const syncingBlueskyRef = useRef(false);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);

  const [liveItems, setLiveItems] = useState<FeedItem[]>(initialFeedItems ?? []);
  const [liveGroups, setLiveGroups] = useState<StoryGroup[]>(initialStoryGroups ?? []);

  function storyGroupFromItem(item: FeedItem): StoryGroup {
    const resolvedUrl = item.url ?? item.postUrl ?? "";
    const publishedAt = item.publishedAt ?? new Date().toISOString();
    const summaryBullets = item.bulletSummary ?? [];
    return {
      id: `solo:${item.id}`,
      canonicalTitle: item.title,
      canonicalUrl: item.url ?? item.postUrl ?? undefined,
      topicTags: item.tags ?? [],
      createdAt: publishedAt,
      updatedAt: publishedAt,
      imageUrl: item.imageUrl ?? null,
      perspectives: [
        {
          id: item.id,
          source: item.sourceName,
          sourceType: item.sourceType,
          url: resolvedUrl,
          canonicalUrl: item.url ?? item.postUrl ?? undefined,
          title: item.title,
          summary: item.summary,
          bias: "",
          publishedAt,
          imageUrl: item.imageUrl ?? null,
        },
      ],
      analysis: {
        summary_markdown: summaryBullets.length
          ? summaryBullets.map((b) => `- ${b}`).join("\n")
          : item.summary
            ? `- ${item.summary}`
            : "- Summary not available.",
        bias: item.biasAnalysis
          ? `Vested interests: ${(item.biasAnalysis.vestedInterests ?? []).join("; ") || "Not specified."}\n` +
            `Framing: ${(item.biasAnalysis.framingBias ?? []).join("; ") || "Not specified."}\n` +
            `Confidence: ${item.biasAnalysis.confidence}`
          : "",
        missing: item.whatsMissing?.length ? item.whatsMissing.map((m) => `- ${m}`).join("\n") : "",
        impact: item.impact
          ? [
              ...(item.impact.shortTerm ?? []).map((s) => `- ${s}`),
              ...(item.impact.longTerm ?? []).map((s) => `- ${s}`),
            ].join("\n")
          : "",
        framing: "",
        sentiment: "",
        agreement: "",
        confidence: "",
        framingSpectrum: "",
        coverageMix: "",
        selectionSignals: "",
        citations: item.url ? [item.url] : [],
      },
    };
  }

  function mixInFeedGroups(groups: StoryGroup[], items: FeedItem[]): StoryGroup[] {
    if (groups.length >= MIN_GROUPS) return groups;
    if (!items.length) return groups;
    const seen = new Set<string>();
    groups.forEach((g) => g.perspectives.forEach((p) => seen.add(p.url)));
    const needed = Math.max(0, TARGET_GROUPS - groups.length);
    const extras = items
      .filter((i) => isGoodBulletSummary(i.summary))
      .filter((i) => i.url && !seen.has(i.url))
      .slice(0, needed)
      .map((i) => storyGroupFromItem(i));
    return groups.concat(extras);
  }

  async function syncBlueskyIfNeeded(appState: ReturnType<typeof loadAppState>) {
    if (!appState?.connectors.bluesky.enabled) return;
    const cached = appState.cache.connectorItems?.bluesky;
    if (cached && cached.length) return;
    syncingBlueskyRef.current = true;
    try {
      const topicSeed = [...(appState.preferences?.topics ?? []), ...appState.connectors.bluesky.topics];
      const topics = Array.from(new Set(topicSeed.map((t) => t.trim()).filter(Boolean)));
      const res = await fetch("/api/connectors/bluesky", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topics }),
      });
      const data = (await res.json()) as { items?: unknown; counts?: Record<string, number> };
      const items = Array.isArray(data.items) ? (data.items as FeedItem[]) : [];
      updateAppState((state) => ({
        ...state,
        connectors: {
          ...state.connectors,
          bluesky: {
            ...state.connectors.bluesky,
            lastSyncAt: new Date().toISOString(),
            lastFetchedCounts: data.counts ?? { posts: items.length },
          },
        },
        cache: {
          ...state.cache,
          connectorItems: { ...state.cache.connectorItems, bluesky: items },
        },
      }));
    } catch {
      // Ignore errors; keep existing cached state.
    } finally {
      syncingBlueskyRef.current = false;
    }
  }

  useEffect(() => {
    let active = true;
    loadTrustFields()
      .then((index) => {
        if (!active) return;
        setTrustFieldIndex(index);
      })
      .catch(() => {
        if (!active) return;
        setTrustFieldIndex({});
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    // Clear legacy persisted state (session-only prefs are stored elsewhere).
    try {
      localStorage.removeItem(APP_STATE_STORAGE_KEY);
    } catch {
      // ignore
    }

    const applyState = () => {
      const appState = loadAppState();
      const refreshSignal = latestIso(appState?.feedRefreshAt ?? null, readRefreshSignal());
      setRefreshToken(refreshSignal);
      const enabledSources = buildSourceFilter(appState?.sources ?? []);
      if (liveGroups.length) {
        const preferredTopics = appState?.preferences?.topics ?? [];
        const blockedKeywords = appState?.preferences?.blockedKeywords ?? [];
        const filteredGroups = filterStoryGroupsBySources(liveGroups, enabledSources);
        const groups = curatedDemoGroups(filteredGroups, null, preferredTopics);

        // Mix in raw feed items as additional cards (no rebuild) to boost volume.
        const seenUrls = new Set<string>();
        groups.forEach((g) => g.perspectives.forEach((p) => seenUrls.add(p.url)));
        const extraGroups = filterFeedItemsBySources(liveItems, enabledSources)
          .filter((i) => i.url && !seenUrls.has(i.url))
          .filter((i) => {
            const bullets = (i.bulletSummary ?? []).filter(Boolean);
            return bullets.length >= 4;
          })
          .map((i) => storyGroupFromItem(i));
        const allGroups = [...groups, ...extraGroups];
        const orderedGroups = softOrderByPreferences(
          allGroups,
          preferredTopics,
          blockedKeywords,
          (g) => g.topicTags,
          (g) => `${g.canonicalTitle} ${g.analysis?.summary_markdown ?? ""}`,
          (g) => g.updatedAt ?? g.createdAt
        );

        const nextStories = storyGroupsToStories(orderedGroups).map((item) => {
          const primaryPerspectiveId = item.story.perspectives[0]?.id;
          const trustFields = primaryPerspectiveId ? trustFieldIndex[primaryPerspectiveId]?.trust : undefined;
          return {
            ...item,
            insights: {
              ...item.insights,
              ...(trustFields ? { trustFields } : {}),
            },
          };
        });
        setStories(nextStories);
        setItemsCount(nextStories.length);
        setLastUpdatedIso(orderedGroups[0]?.createdAt ?? new Date().toISOString());
        const uniqueSources = new Set(orderedGroups.flatMap((g) => g.perspectives.map((p) => p.source)));
        setSourcesCount(uniqueSources.size);
        return;
      }

      let items = filterFeedItemsBySources(liveItems, enabledSources);

      if (appState) {
        items = mergeConnectorItems(
          items,
          appState.cache.connectorItems ?? {},
          {
            hn: appState.connectors.hn.enabled,
            bluesky: appState.connectors.bluesky.enabled,
            github: appState.connectors.github.enabled,
          }
        );
        if (!syncingBlueskyRef.current) void syncBlueskyIfNeeded(appState);
      }

      // If we're using the offline dataset, most items will point to `/data/images/placeholder.svg`
      // (due to strict download limits in dataset generation). Surface items with a real downloaded
      // image first so the UI visibly shows local assets.
      const PLACEHOLDER = "/data/images/placeholder.svg";
      const isOfflineLike = items.some((it) => it.imageUrl === PLACEHOLDER);
      if (isOfflineLike) {
        items = [...items].sort((a, b) => {
          const aHasReal = Boolean(a.imageUrl && a.imageUrl !== PLACEHOLDER);
          const bHasReal = Boolean(b.imageUrl && b.imageUrl !== PLACEHOLDER);
          if (aHasReal === bHasReal) return 0;
          return aHasReal ? -1 : 1;
        });
      }

      const orderedItems = softOrderByPreferences(
        items,
        appState?.preferences?.topics ?? [],
        appState?.preferences?.blockedKeywords ?? [],
        (item) => item.tags,
        (item) => `${item.title} ${item.summary ?? ""} ${item.text ?? ""}`,
        (item) => item.publishedAt
      );

      const nextStories = orderedItems.map((item) => {
        const trustFields = trustFieldIndex[item.id]?.trust;
        return {
        story: feedItemToStory(item),
          insights: {
            ...mockInsightBundle(item),
            ...(trustFields ? { trustFields } : {}),
          },
        };
      });
      setStories(nextStories);
      setItemsCount(nextStories.length);
      setLastUpdatedIso(orderedItems[0]?.publishedAt ?? new Date().toISOString());
      setSourcesCount(new Set(orderedItems.map((i) => i.sourceName)).size);
    };

    applyState();
    const handler = () => applyState();
    const storageHandler = (e: StorageEvent) => {
      if (!e.key || e.key === APP_STATE_STORAGE_KEY || e.key === FEED_REFRESH_STORAGE_KEY) handler();
    };
    window.addEventListener(APP_STATE_EVENT, handler);
    window.addEventListener("storage", storageHandler);
    return () => {
      window.removeEventListener(APP_STATE_EVENT, handler);
      window.removeEventListener("storage", storageHandler);
    };
  }, [liveItems, liveGroups, trustFieldIndex]);

  useEffect(() => {
    let active = true;
    const loadLatest = async () => {
      try {
        const res = await fetch(`/data/storyGroups.json?ts=${Date.now()}`);
        if (res.ok) {
          const parsed = await res.json();
          const groups = Array.isArray(parsed)
            ? (parsed as StoryGroup[])
            : Array.isArray(parsed?.clusters)
              ? (parsed.clusters as StoryGroup[])
              : Array.isArray(parsed?.groups)
                ? (parsed.groups as StoryGroup[])
                : [];
          if (active && groups.length) setLiveGroups(groups);
        }
      } catch {
        // ignore
      }
      try {
        const res = await fetch(`/data/articles.json?ts=${Date.now()}`);
        if (res.ok) {
          const parsed = await res.json();
          const items = Array.isArray(parsed?.articles) ? (parsed.articles as FeedItem[]) : [];
          if (active && items.length) setLiveItems(items);
        }
      } catch {
        // ignore
      }
    };
    void loadLatest();
    return () => {
      active = false;
    };
  }, [refreshToken]);

  return (
    <FocusedViewerFrame>
      <header className="border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">Today</span> • Updated {relativeTimeFromIso(lastUpdatedIso)} •{" "}
            {sourcesCount} sources • {itemsCount} stories •{" "}
            <span className="font-semibold text-slate-700">↑ ↓</span> stories •{" "}
            <span className="font-semibold text-slate-700">← →</span> sources
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/profile"
              className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
            >
              Profile
            </Link>
            <ResetOnboardingButton />
          </div>
        </div>
      </header>
      <div className="h-[calc(100%-48px)]">
        <FeedScroller stories={stories} />
      </div>
    </FocusedViewerFrame>
  );
}
