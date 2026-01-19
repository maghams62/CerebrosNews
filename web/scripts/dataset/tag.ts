import { DatasetItem, DatasetTopic } from "./schema";

function norm(s: string): string {
  return s.toLowerCase();
}

export function tagItems(items: DatasetItem[], topics: DatasetTopic[]): { items: DatasetItem[]; tagCounts: Map<string, number> } {
  const tagCounts = new Map<string, number>();
  const topicMatchers = topics
    .filter((t) => t.id !== "general")
    .map((t) => ({ id: t.id, keywords: t.keywords.map(norm) }));

  for (const item of items) {
    const haystack = norm(`${item.title} ${item.summary}`);
    const tags: string[] = [];

    for (const t of topicMatchers) {
      if (t.keywords.some((kw) => kw && haystack.includes(kw))) {
        tags.push(t.id);
      }
    }

    if (tags.length === 0) tags.push("general");
    item.tags = Array.from(new Set(tags));

    for (const tag of item.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  return { items, tagCounts };
}

