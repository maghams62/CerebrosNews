import { StoryGroup, StoryGroupPerspective as GroupPerspective } from "@/types/storyGroup";
import { Story } from "@/types/story";
import { StoryPerspective, PerspectiveLabel } from "@/types/storyPerspective";
import { StoryWithInsights } from "@/types/storyWithInsights";
import { mockInsightBundle } from "@/lib/insights/mockInsightBundle";
import { FeedItem } from "@/types/feed";
import { bulletsToMarkdown, sanitizeSummaryBullets } from "@/lib/summaries/sanitize";

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

function labelFromPerspective(p: GroupPerspective): PerspectiveLabel {
  if (p.sourceType === "community") return "Community";
  if (p.sourceType === "primary") return "Primary";
  return "Media";
}

function extractBullets(markdown: string | undefined): string[] {
  if (!markdown) return [];
  return markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^-\\s+/, "").trim())
    .filter(Boolean);
}

function firstLine(text: string | undefined): string {
  if (!text) return "";
  const line = text.split("\n").map((l) => l.trim()).find(Boolean);
  return line ?? "";
}

function summaryLine(group: StoryGroup): string {
  const bullets = sanitizeSummaryBullets({
    title: group.canonicalTitle,
    markdown: group.analysis?.summary_markdown ?? "",
    sourceName: group.perspectives?.[0]?.source ?? null,
    publishedAt: group.createdAt,
    minBullets: 1,
  });
  return bullets[0] ?? group.canonicalTitle;
}

function isPlaceholderImage(url?: string | null): boolean {
  if (!url) return true;
  return url.includes("placeholder.svg");
}

function pickBestImage(group: StoryGroup): string {
  if (group.imageUrl && !isPlaceholderImage(group.imageUrl)) return group.imageUrl;
  const perspectiveImage = group.perspectives.find((p) => p.imageUrl && !isPlaceholderImage(p.imageUrl))?.imageUrl;
  if (perspectiveImage) return perspectiveImage;
  return group.imageUrl || group.perspectives.find((p) => p.imageUrl)?.imageUrl || "/globe.svg";
}

function pseudoFeedItemFromGroup(group: StoryGroup): FeedItem {
  const primary = group.perspectives[0];
  const rawSourceType = primary?.sourceType;
  const sourceType =
    rawSourceType === "community" || rawSourceType === "primary" || rawSourceType === "social"
      ? rawSourceType
      : "editorial";
  return {
    id: group.id,
    title: group.canonicalTitle,
    summary: summaryLine(group),
    url: group.canonicalUrl ?? primary?.url ?? "https://example.com/",
    imageUrl: group.imageUrl ?? primary?.imageUrl ?? undefined,
    publishedAt: group.createdAt,
    sourceName: primary?.source ?? "Multiple sources",
    sourceType,
    text: summaryLine(group),
    tags: group.topicTags ?? [],
  };
}

function perspectiveToStoryPerspective(group: StoryGroup, p: GroupPerspective): StoryPerspective {
  const coveredBy = uniqueStrings(group.perspectives.map((x) => x.source));
  const facts = uniqueStrings(extractBullets(group.analysis?.summary_markdown ?? "").slice(0, 4));
  const impact = uniqueStrings(extractBullets(group.analysis?.impact ?? "").slice(0, 4));
  const missing = uniqueStrings(extractBullets(group.analysis?.missing ?? "").slice(0, 4));

  return {
    id: p.id,
    label: labelFromPerspective(p),
    sourceName: p.source,
    title: p.title,
    url: p.url,
    summary: p.summary ?? summaryLine(group),
    framingLine: firstLine(p.bias) || "Coverage summary available.",
    tone: "Neutral",
    stance: "Neutral",
    coveredBy,
    facts: facts.length ? facts : [summaryLine(group)],
    bias: p.bias ? [p.bias] : [],
    missing: missing.length ? missing : ["Limited cross-source notes available."],
    impact: impact.length ? impact : ["Implications still forming across sources."],
    publishedAt: p.publishedAt,
    statusBadge: "Confirmed",
    stanceBadges: ["Neutral"],
  };
}

export function storyGroupToStory(group: StoryGroup): Story {
  const perspectives = group.perspectives.map((p) => perspectiveToStoryPerspective(group, p));
  const imageUrl = pickBestImage(group);
  const firstSource = group.perspectives[0];
  const rawSourceType = firstSource?.sourceType;
  const sourceType =
    rawSourceType === "community" || rawSourceType === "primary" || rawSourceType === "social"
      ? rawSourceType
      : "editorial";

  let summaryMarkdown = group.analysis?.summary_markdown ?? "";
  if (extractBullets(summaryMarkdown).length < 2) {
    const alt = group.perspectives
      .map((p) => p.summary ?? "")
      .find((s) => extractBullets(s).length >= 2);
    if (alt) summaryMarkdown = alt;
  }

  const cleanBullets = sanitizeSummaryBullets({
    title: group.canonicalTitle,
    markdown: summaryMarkdown,
    sourceName: firstSource?.source ?? null,
    publishedAt: group.createdAt,
    tags: group.topicTags ?? [],
    minBullets: 2,
  });
  const cleanSummaryMarkdown = bulletsToMarkdown(cleanBullets);

  // Allow remote images (http/https) or local paths; only fall back to globe when empty.
  const resolvedImage =
    imageUrl && (imageUrl.startsWith("/") || imageUrl.startsWith("http"))
      ? imageUrl
      : "/globe.svg";

  return {
    id: group.id,
    title: group.canonicalTitle,
    summary: cleanBullets[0] ?? summaryLine(group),
    url: group.canonicalUrl ?? firstSource?.url ?? "https://example.com/",
    imageUrl: resolvedImage,
    sourceName: firstSource?.source ?? "Multiple sources",
    sourceType,
    tags: group.topicTags ?? [],
    sources: uniqueStrings(group.perspectives.map((p) => p.source)),
    publishedAt: group.createdAt,
    fullText: summaryLine(group),
    // Preserve the rich summary markdown from the dataset for UI display.
    analysis: { ...group.analysis, summary_markdown: summaryMarkdown || cleanSummaryMarkdown },
    perspectives,
  };
}

export function storyGroupToStoryWithInsights(group: StoryGroup): StoryWithInsights {
  const story = storyGroupToStory(group);
  const insights = mockInsightBundle(pseudoFeedItemFromGroup(group));
  return { story, insights };
}

export function storyGroupsToStories(groups: StoryGroup[]): StoryWithInsights[] {
  return groups.map(storyGroupToStoryWithInsights);
}
