import crypto from "crypto";
import { BskyAgent } from "@atproto/api";
import { FeedItem } from "@/types/feed";
import { buildTopicQueries, matchTopics, topicKey } from "./queryMap";
import { BlueskyCachePayload, readCachedBluesky, writeCachedBluesky } from "./cache";

type FetchOptions = {
  topics: string[];
  limit?: number;
  includeTimeline?: boolean;
};

type RawPost = {
  uri: string;
  cid: string;
  author: {
    displayName?: string;
    handle: string;
  };
  record: {
    text?: string;
    createdAt?: string;
    embed?: unknown;
  };
  indexedAt?: string;
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  embed?: unknown;
};

function stableId(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 24);
}

function extractFirstUrl(text: string): string | null {
  const match = text.match(/\bhttps?:\/\/[^\s)]+/i);
  return match ? match[0] : null;
}

function extractExternalUrl(embed: unknown): string | null {
  if (!embed || typeof embed !== "object") return null;
  const obj = embed as Record<string, unknown>;
  const type = obj["$type"];
  if (type === "app.bsky.embed.external") {
    const external = obj.external as Record<string, unknown> | undefined;
    const uri = external?.uri;
    return typeof uri === "string" ? uri : null;
  }
  if (type === "app.bsky.embed.recordWithMedia") {
    const media = obj.media as Record<string, unknown> | undefined;
    return extractExternalUrl(media);
  }
  if (type === "app.bsky.embed.record") {
    const record = obj.record as Record<string, unknown> | undefined;
    return extractExternalUrl(record);
  }
  return null;
}

function postUrl(handle: string, uri: string): string {
  const rkey = uri.split("/").pop() ?? uri;
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

function titleFromPost(text: string, embed: unknown, handle: string): string {
  if (embed && typeof embed === "object") {
    const obj = embed as Record<string, unknown>;
    const type = obj["$type"];
    if (type === "app.bsky.embed.external") {
      const external = obj.external as Record<string, unknown> | undefined;
      const title = external?.title;
      if (typeof title === "string" && title.trim()) return title.trim();
    }
  }
  if (text.trim().length >= 8) return text.trim().slice(0, 90);
  return `Post from @${handle}`;
}

function scorePost(item: FeedItem, hasUrl: boolean, hasTopicMatch: boolean): number {
  const metrics = item.metrics ?? {};
  const likes = metrics.likes ?? 0;
  const reposts = metrics.reposts ?? 0;
  const replies = metrics.replies ?? 0;
  const base = hasUrl ? 5 : 0;
  const topicBoost = hasTopicMatch ? 3 : 0;
  return base + topicBoost + likes + reposts * 2 + replies * 0.5;
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function dedupePosts(items: FeedItem[]): FeedItem[] {
  const byKey = new Set<string>();
  const seenText = new Set<string>();
  const out: FeedItem[] = [];
  for (const item of items) {
    const key = item.url ?? item.postUrl ?? item.id;
    if (byKey.has(key)) continue;
    const text = normalizeText(item.text ?? item.summary);
    if (text && seenText.has(text)) continue;
    byKey.add(key);
    if (text) seenText.add(text);
    out.push(item);
  }
  return out;
}

function buildAgent(): BskyAgent {
  return new BskyAgent({ service: process.env.BLUESKY_SERVICE ?? "https://bsky.social" });
}

function credentials() {
  const identifier = process.env.BLUESKY_EMAIL ?? process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_PASSWORD;
  return { identifier, password };
}

function sanitizeTopics(topics: string[]): string[] {
  return Array.from(new Set(topics.map((t) => t.trim()).filter(Boolean)));
}

export async function fetchBlueskyItems(options: FetchOptions): Promise<BlueskyCachePayload> {
  const topics = sanitizeTopics(options.topics);
  const key = topicKey(topics);
  const cached = await readCachedBluesky(key);
  if (cached) return cached;

  const { identifier, password } = credentials();
  if (!identifier || !password) {
    return { fetchedAtMs: Date.now(), items: [], counts: { posts: 0 }, topicsKey: key };
  }

  const agent = buildAgent();
  await agent.login({ identifier, password });

  const limit = Math.max(20, Math.min(options.limit ?? 80, 120));
  const includeTimeline = options.includeTimeline !== false;

  const timelinePosts: RawPost[] = [];
  if (includeTimeline) {
    const timeline = await agent.getTimeline({ limit: Math.min(50, limit) });
    timelinePosts.push(...timeline.data.feed.map((f) => f.post as RawPost));
  }

  const queries = buildTopicQueries(topics).slice(0, 6);
  const searchPosts: RawPost[] = [];
  for (const q of queries) {
    const res = await agent.app.bsky.feed.searchPosts({ q: q.query, limit: 25 });
    searchPosts.push(...res.data.posts.map((p) => p as RawPost));
  }

  const combined = [...timelinePosts, ...searchPosts];
  const items: Array<{ item: FeedItem; hasUrl: boolean; hasTopicMatch: boolean }> = [];

  for (const post of combined) {
    const text = post.record?.text?.trim() ?? "";
    if (!text) continue;
    const embed = post.embed ?? post.record?.embed;
    const linkUrl = extractExternalUrl(embed) ?? extractFirstUrl(text);
    const handle = post.author.handle;
    const createdAt = post.record?.createdAt ?? post.indexedAt ?? new Date().toISOString();
    const postLink = postUrl(handle, post.uri);
    const tags = matchTopics(`${text} ${linkUrl ?? ""}`, topics);
    const hasUrl = Boolean(linkUrl);
    const hasTopicMatch = tags.length > 0;

    const item: FeedItem = {
      id: stableId(post.uri),
      title: titleFromPost(text, embed, handle),
      summary: text,
      text,
      url: linkUrl ?? postLink,
      postUrl: postLink,
      publishedAt: createdAt,
      sourceName: "Bluesky",
      sourceType: "social",
      author: post.author.displayName ?? handle,
      authorHandle: handle,
      tags,
      metrics: {
        likes: post.likeCount ?? 0,
        reposts: post.repostCount ?? 0,
        replies: post.replyCount ?? 0,
      },
    };

    items.push({ item, hasUrl, hasTopicMatch });
  }

  const strict = items.filter((i) => i.hasUrl || i.hasTopicMatch);
  const relaxed = items.filter((i) => i.hasUrl || (i.item.metrics?.likes ?? 0) > 0 || (i.item.metrics?.reposts ?? 0) > 0);
  const picked = strict.length >= 12 || !topics.length ? strict : relaxed;
  const usable = picked.length ? picked : relaxed;

  const scored = usable
    .map((i) => ({ item: i.item, score: scorePost(i.item, i.hasUrl, i.hasTopicMatch) }))
    .sort((a, b) => b.score - a.score)
    .map((i) => i.item);

  const deduped = dedupePosts(scored).slice(0, limit);

  const payload: BlueskyCachePayload = {
    fetchedAtMs: Date.now(),
    items: deduped,
    counts: { posts: deduped.length, timeline: timelinePosts.length, search: searchPosts.length },
    topicsKey: key,
  };
  await writeCachedBluesky(payload);
  return payload;
}
