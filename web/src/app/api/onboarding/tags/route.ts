import { NextResponse } from "next/server";
import { readOfflineStoryGroups } from "@/lib/dataset/offlineStoryGroups";
import { canonicalizeTag, HIGH_SIGNAL_TAGS } from "@/lib/tags/highSignal";
import { StoryGroup } from "@/types/storyGroup";

export const runtime = "nodejs";

const MAX_ONBOARDING_TAGS = 18;

function countTags(groups: StoryGroup[]) {
  const counts = new Map<string, number>();
  for (const g of groups) {
    const tags = Array.isArray(g.topicTags) ? g.topicTags : [];
    for (const raw of tags) {
      const tag = typeof raw === "string" ? raw.trim() : "";
      if (!tag) continue;
      const canonical = canonicalizeTag(tag);
      if (!canonical) continue;
      counts.set(canonical, (counts.get(canonical) ?? 0) + 1);
    }
  }
  return counts;
}

export async function GET() {
  const groups = (await readOfflineStoryGroups()) ?? [];
  const counts = countTags(groups);
  const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const tags = ranked.map(([tag]) => tag).slice(0, MAX_ONBOARDING_TAGS);
  const seen = new Set(tags);
  if (tags.length < MAX_ONBOARDING_TAGS) {
    for (const tag of HIGH_SIGNAL_TAGS) {
      if (seen.has(tag)) continue;
      tags.push(tag);
      seen.add(tag);
      if (tags.length >= MAX_ONBOARDING_TAGS) break;
    }
  }

  return NextResponse.json({ tags });
}

