import fs from "fs/promises";
import path from "path";
import { StoryGroup } from "@/types/storyGroup";

export async function readOfflineStoryGroups(): Promise<StoryGroup[] | null> {
  const base = path.join(process.cwd(), "public", "data");
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
      return groups;
    } catch {
      continue;
    }
  }

  return null;
}
