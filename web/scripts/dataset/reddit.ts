import { FetchOptions, fetchJson } from "./fetch";

type RedditListing = {
  data?: {
    children?: Array<{ data?: { body?: string } }>;
  };
};

export function extractRedditPostId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "redd.it") {
      const id = u.pathname.replaceAll("/", "").trim();
      return id || null;
    }
    const parts = u.pathname.split("/").filter(Boolean);
    const commentsIdx = parts.indexOf("comments");
    if (commentsIdx === -1 || commentsIdx + 1 >= parts.length) return null;
    return parts[commentsIdx + 1] ?? null;
  } catch {
    return null;
  }
}

export async function fetchRedditTopComments(
  url: string,
  opts: FetchOptions,
  limit = 3
): Promise<string[]> {
  const id = extractRedditPostId(url);
  if (!id) return [];
  const apiUrl = `https://www.reddit.com/comments/${id}.json?limit=8&sort=top`;
  try {
    const json = await fetchJson<unknown>(apiUrl, opts);
    if (!Array.isArray(json) || json.length < 2) return [];
    const listing = json[1] as RedditListing;
    const children = listing?.data?.children ?? [];
    const comments: string[] = [];
    for (const child of children) {
      const body = child?.data?.body;
      if (typeof body !== "string") continue;
      const trimmed = body.trim();
      if (!trimmed || trimmed === "[deleted]" || trimmed === "[removed]") continue;
      comments.push(trimmed);
      if (comments.length >= limit) break;
    }
    return comments;
  } catch {
    return [];
  }
}
