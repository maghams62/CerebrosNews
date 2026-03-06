import fs from "fs/promises";
import path from "path";
import { StoryGroup } from "@/types/storyGroup";
import { DEMO_INVESTING_TAG, getCerebrosDemoMode } from "@/lib/dataset/offlineDataset";

export async function readOfflineStoryGroups(opts?: { includeAll?: boolean }): Promise<StoryGroup[] | null> {
  const base = path.join(process.cwd(), "public", "data");
  const includeAll = Boolean(opts?.includeAll);
  const mode = getCerebrosDemoMode();
  const candidates = [
    path.join(base, "clusters.json"), // new format { clusters: [] }
    path.join(base, "storyGroups.json"),
  ];

  for (const fp of candidates) {
    try {
      const st = await fs.stat(fp);
      const raw = await fs.readFile(fp, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      const groups = Array.isArray(parsed)
        ? (parsed as StoryGroup[])
        : Array.isArray((parsed as { clusters?: StoryGroup[] })?.clusters)
          ? ((parsed as { clusters: StoryGroup[] }).clusters)
          : Array.isArray((parsed as { groups?: StoryGroup[] })?.groups)
            ? ((parsed as { groups: StoryGroup[] }).groups)
            : null;
      if (!groups) continue;
      if (includeAll || mode !== "investing") return groups;
      return groups.filter((group) => Array.isArray(group.topicTags) && group.topicTags.includes(DEMO_INVESTING_TAG));
    } catch {
      continue;
    }
  }

  return null;
}
