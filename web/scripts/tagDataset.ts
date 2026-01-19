import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { createLimiter } from "./dataset/fetch";
import { generateTechTags } from "./dataset/llm";
import { DatasetFile } from "./dataset/schema";
import { atomicWriteJson } from "./dataset/output";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  const v = raw.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "no", "n", "off"].includes(v)) return false;
  return fallback;
}

type TagCache = Record<string, string[]>;

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function rankTags(tags: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const t of tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag)
    .slice(0, limit);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("502") || msg.includes("429") || msg.toLowerCase().includes("timeout");
}

async function main() {
  const publicDir = path.join(process.cwd(), "public");
  const datasetPath = path.join(publicDir, "data", "feed.json");
  const storyGroupsPath = path.join(publicDir, "data", "storyGroups.json");
  const clustersPath = path.join(publicDir, "data", "clusters.json");
  const articlesPath = path.join(publicDir, "data", "articles.json");

  const dataset = await readJson<DatasetFile>(datasetPath);
  if (!dataset) throw new Error(`Missing dataset at ${datasetPath}`);

  const concurrency = envInt("LLM_TAG_CONCURRENCY", 3);
  const limit = envInt("LLM_TAG_LIMIT", dataset.items.length);
  const overwrite = envBool("LLM_TAG_OVERWRITE", true);
  const dryRun = envBool("LLM_TAG_DRY_RUN", false);
  const cachePath = process.env.LLM_TAG_CACHE ?? path.join(process.cwd(), ".cache", "llm-tags.json");
  const cacheDir = path.dirname(cachePath);
  const tagsPerStory = envInt("LLM_TAGS_PER_STORY", 6);
  const maxRetries = envInt("LLM_TAG_MAX_RETRIES", 3);
  const flushEvery = envInt("LLM_TAG_FLUSH_EVERY", 50);

  const cache = (await readJson<TagCache>(cachePath)) ?? {};
  const limiter = createLimiter(concurrency);

  console.log(`Tagging ${Math.min(limit, dataset.items.length)} items (concurrency=${concurrency})...`);
  let done = 0;

  const items = dataset.items.slice(0, limit);
  await Promise.all(
    items.map((item) =>
      limiter.run(async () => {
        if (!overwrite && item.tags?.length) {
          done += 1;
          if (done % 25 === 0 || done === items.length) console.log(`Progress: ${done}/${items.length}`);
          return;
        }
        const cached = cache[item.id];
        if (!overwrite && cached?.length) {
          item.tags = cached;
          done += 1;
          if (done % 25 === 0 || done === items.length) console.log(`Progress: ${done}/${items.length}`);
          return;
        }
        let tags: string[] = [];
        let attempt = 0;
        while (attempt <= maxRetries) {
          try {
            const res = await generateTechTags({
              title: item.title,
              summary: item.summary,
              text: item.extractedText ?? null,
            });
            tags = res.tags.length ? res.tags : [];
            break;
          } catch (err) {
            attempt += 1;
            if (attempt > maxRetries || !shouldRetry(err)) {
              console.warn(`Tagging failed for ${item.id}:`, err);
              break;
            }
            await sleep(600 * attempt);
          }
        }
        if (!tags.length && item.tags?.length) tags = item.tags;
        item.tags = tags;
        if (tags.length) cache[item.id] = tags;
        done += 1;
        if (done % 25 === 0 || done === items.length) console.log(`Progress: ${done}/${items.length}`);
        if (!dryRun && flushEvery > 0 && done % flushEvery === 0) {
          await fs.mkdir(cacheDir, { recursive: true });
          await atomicWriteJson(cachePath, cache);
        }
      })
    )
  );

  const itemById = new Map(dataset.items.map((item) => [item.id, item]));
  for (const story of dataset.stories ?? []) {
    const allTags = story.itemIds
      .flatMap((id) => itemById.get(id)?.tags ?? [])
      .filter(Boolean);
    story.tags = rankTags(allTags, tagsPerStory);
  }

  const clusters = await readJson<{ clusters?: Array<{ id: string; topicTags?: string[] }> }>(clustersPath);
  if (clusters?.clusters?.length) {
    const tagsById = new Map(dataset.stories.map((s) => [s.id, s.tags]));
    clusters.clusters.forEach((c) => {
      const tags = tagsById.get(c.id);
      if (tags?.length) c.topicTags = tags;
    });
  }

  const storyGroups = await readJson<Array<{ id: string; topicTags?: string[] }>>(storyGroupsPath);
  if (storyGroups?.length) {
    const tagsById = new Map(dataset.stories.map((s) => [s.id, s.tags]));
    storyGroups.forEach((g) => {
      const tags = tagsById.get(g.id);
      if (tags?.length) g.topicTags = tags;
    });
  }

  const articles = await readJson<{ articles?: Array<{ id: string; tags?: string[] }> }>(articlesPath);
  if (articles?.articles?.length) {
    const tagsById = new Map(dataset.items.map((i) => [i.id, i.tags]));
    articles.articles.forEach((a) => {
      const tags = tagsById.get(a.id);
      if (tags?.length) a.tags = tags;
    });
  }

  if (dryRun) {
    console.log("Dry run enabled; no files written.");
    return;
  }

  await fs.mkdir(cacheDir, { recursive: true });
  await atomicWriteJson(cachePath, cache);
  await atomicWriteJson(datasetPath, dataset);
  if (clusters) await atomicWriteJson(clustersPath, clusters);
  if (storyGroups) await atomicWriteJson(storyGroupsPath, storyGroups);
  if (articles) await atomicWriteJson(articlesPath, articles);

  console.log("Tagging complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
