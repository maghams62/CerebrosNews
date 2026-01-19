import { FeedItem } from "@/types/feed";
import { Story } from "@/types/story";
import { generateMockPerspectives } from "@/lib/feed/mockPerspectives";

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

export function feedItemToStory(item: FeedItem): Story {
  const fallbackUrl = "https://bsky.app";
  const canonicalUrl = item.url ?? item.postUrl ?? fallbackUrl;
  const text = item.text ?? item.summary;
  const isSocial = item.sourceType === "social";
  const base = {
    id: item.id,
    title: item.title,
    summary: item.summary,
    url: canonicalUrl,
    // Prefer local images (e.g. offline dataset `/data/images/...`). For remote images, keep a safe fallback
    // since `next.config.ts` may not allow the host yet.
    imageUrl: item.imageUrl && item.imageUrl.startsWith("/") ? item.imageUrl : "/globe.svg",
    sourceName: item.sourceName,
    sourceType: item.sourceType,
    postUrl: item.postUrl,
    author: item.author,
    authorHandle: item.authorHandle,
    tags: item.tags,
    metrics: item.metrics,
    publishedAt: relativeTimeFromIso(item.publishedAt),
    fullText: text,
  } satisfies Omit<Story, "perspectives">;

  return {
    ...base,
    perspectives: isSocial ? [] : generateMockPerspectives(base),
  };
}

export function feedToStories(items: FeedItem[]): Story[] {
  return items.map(feedItemToStory);
}

