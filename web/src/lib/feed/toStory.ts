import { FeedItem } from "@/types/feed";
import { Story } from "@/types/story";
import { StoryPerspective } from "@/types/storyPerspective";

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
  const canonicalUrl = item.url ?? item.postUrl ?? "";
  const text = item.text ?? item.summary;
  const isSocial = item.sourceType === "social";
  const isMarket = Boolean(item.market);
  const sourceLabel =
    item.sourceType === "primary" ? "Primary" : item.sourceType === "community" ? "Community" : "Media";
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
    market: item.market,
    dataOrigin: item.dataOrigin,
    publishedAt: relativeTimeFromIso(item.publishedAt),
    fullText: text,
  } satisfies Omit<Story, "perspectives">;

  const perspectives: StoryPerspective[] =
    isSocial || isMarket
      ? []
      : [
          {
            id: `${item.id}:source`,
            label: sourceLabel,
            sourceName: item.sourceName,
            title: item.title,
            url: canonicalUrl,
            summary: item.summary,
            framingLine: item.biasAnalysis?.framingBias?.[0] ?? "",
            tone: "Neutral",
            stance: "Neutral",
            coveredBy: [item.sourceName],
            facts: (item.bulletSummary ?? []).slice(0, 4),
            bias: item.biasAnalysis?.framingBias ?? [],
            missing: item.whatsMissing ?? [],
            impact: [...(item.impact?.shortTerm ?? []), ...(item.impact?.longTerm ?? [])].slice(0, 4),
            publishedAt: item.publishedAt,
            statusBadge: "Confirmed",
            stanceBadges: ["Neutral"],
          },
        ];

  return {
    ...base,
    perspectives,
  };
}

export function feedToStories(items: FeedItem[]): Story[] {
  return items.map(feedItemToStory);
}
