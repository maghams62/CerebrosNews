import { FeedItem } from "@/types/feed";
import { ConnectorId } from "@/types/appState";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function seededNumber(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function buildItems(connector: ConnectorId, topics: string[], countPerTopic = 3): FeedItem[] {
  const now = Date.now();
  const sourceName = connector === "hn" ? "Hacker News" : connector === "bluesky" ? "Bluesky" : "GitHub";
  const baseUrl = connector === "hn" ? "https://news.ycombinator.com/item?id=" : connector === "bluesky" ? "https://bsky.app/profile/" : "https://github.com/search?q=";

  const items: FeedItem[] = [];
  topics.forEach((topic, tIndex) => {
    for (let i = 0; i < countPerTopic; i += 1) {
      const seed = `${connector}-${topic}-${i}`;
      const hash = seededNumber(seed);
      const publishedAt = new Date(now - (tIndex * 5 + i) * 60_000).toISOString();
      const urlSuffix = connector === "hn" ? String(1_000_000 + (hash % 900_000)) : slugify(topic);
      items.push({
        id: `${connector}-${hash.toString(16)}`,
        title: `${topic} ${connector === "github" ? "repo update" : connector === "bluesky" ? "post" : "story"} #${i + 1}`,
        summary: `Sample ${connector} item about ${topic}. Generated for testing and local caching.`,
        url: `${baseUrl}${urlSuffix}`,
        publishedAt,
        sourceName,
        sourceType: connector === "bluesky" ? "social" : "community",
        text: `Sample ${connector} item about ${topic}. Generated for testing and local caching.`,
        author: connector === "bluesky" ? "Bluesky Author" : undefined,
        authorHandle: connector === "bluesky" ? "mock.bsky.social" : undefined,
        postUrl: connector === "bluesky" ? `${baseUrl}${urlSuffix}` : undefined,
        tags: [topic],
        metrics: connector === "bluesky" ? { likes: hash % 120, reposts: hash % 40, replies: hash % 20 } : undefined,
      });
    }
  });
  return items;
}

export function mockFetchConnector(connector: ConnectorId, topics: string[]) {
  const normalized = topics.length ? topics : ["AI", "Startups"];
  const items = buildItems(connector, normalized, 3);

  if (connector === "github") {
    const repos = Math.max(4, Math.floor(items.length * 0.6));
    const releases = Math.max(2, items.length - repos);
    return { items, counts: { repos, releases } };
  }

  if (connector === "bluesky") {
    return { items, counts: { posts: items.length } };
  }

  return { items, counts: { stories: items.length } };
}
