import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { createLimiter } from "./dataset/fetch";
import { generateTrustFields } from "./dataset/llm";
import { ArticleOutput, writeTrustFields } from "./dataset/output";
import type { TrustFieldsDataset, TrustFieldsRecord } from "../src/lib/trust/schema";

type SummariesFile = { summaries?: Record<string, string> };
type ArticlesFile = { articles?: ArticleOutput[] };
type FeedSource = { id: string; name: string; type: string };
type FeedItem = {
  id: string;
  sourceId?: string;
  sourceType?: string;
  title?: string;
  url?: string;
  canonicalUrl?: string | null;
  publishedAt?: string;
  author?: string | null;
  summary?: string;
  tags?: string[];
  media?: { imageUrl?: string | null };
};
type FeedFile = { items?: FeedItem[]; sources?: FeedSource[] };

type BuildOptions = {
  limit?: number;
  concurrency?: number;
  force?: boolean;
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function readModelName(): string {
  return process.env.OPENAI_SUMMARY_MODEL ?? "gpt-4o-mini";
}

function truncate(text: string, maxChars = 2000): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}…`;
}

function buildMetadata(article: ArticleOutput): string {
  const tags = article.tags?.length ? article.tags.join(", ") : "Not specified";
  return [
    `Title: ${article.title}`,
    `Source: ${article.sourceName} (${article.sourceType})`,
    `PublishedAt: ${article.publishedAt}`,
    `URL: ${article.canonicalUrl ?? article.url}`,
    `Tags: ${tags}`,
  ].join("\n");
}

function fallbackTrustFields(article: ArticleOutput): TrustFieldsRecord["trust"] {
  return {
    whats_missing: ["More detail and stakeholder context are not provided in the summary."],
    so_what: {
      near_term: ["Near-term implications are unclear from the limited text."],
      long_term: ["Long-term implications are unclear from the limited text."],
    },
    framing: {
      lens: "opinion/analysis",
      emphasis: ["Focuses on headline without depth."],
      downplays: ["Tradeoffs, risks, and stakeholder impacts."],
      language_notes: ["Neutral or generic tone."],
    },
  };
}

const PLACEHOLDER_WHATS_MISSING = new Set([
  "More detail and stakeholder context are not provided in the summary.",
  "Missing details and stakeholders until enrichment runs.",
]);
const PLACEHOLDER_NEAR_TERM = new Set([
  "Near-term implications are unclear from the limited text.",
  "Implications not yet assessed.",
]);
const PLACEHOLDER_LONG_TERM = new Set([
  "Long-term implications are unclear from the limited text.",
  "Long-term effects not yet assessed.",
]);
const PLACEHOLDER_EMPHASIS = new Set(["Focuses on headline without depth.", "Focuses on headline claims."]);
const PLACEHOLDER_DOWNPLAYS = new Set([
  "Tradeoffs, risks, and stakeholder impacts.",
  "Tradeoffs and limitations not covered.",
]);
const PLACEHOLDER_LANGUAGE_NOTES = new Set(["Neutral or generic tone.", "Neutral tone."]);

function hasPlaceholder(items: string[] | undefined | null, placeholders: Set<string>): boolean {
  if (!Array.isArray(items) || !items.length) return false;
  return items.some((item) => placeholders.has(item));
}

function isPlaceholderTrust(trust: TrustFieldsRecord["trust"] | undefined | null): boolean {
  if (!trust) return true;
  if (!Array.isArray(trust.whats_missing) || trust.whats_missing.length === 0) return true;
  if (!Array.isArray(trust.so_what?.near_term) || trust.so_what.near_term.length === 0) return true;
  if (!trust.framing?.lens) return true;
  if (hasPlaceholder(trust.whats_missing, PLACEHOLDER_WHATS_MISSING)) return true;
  if (hasPlaceholder(trust.so_what?.near_term, PLACEHOLDER_NEAR_TERM)) return true;
  if (hasPlaceholder(trust.so_what?.long_term, PLACEHOLDER_LONG_TERM)) return true;
  if (
    trust.framing?.lens === "opinion/analysis" &&
    (hasPlaceholder(trust.framing.emphasis, PLACEHOLDER_EMPHASIS) ||
      hasPlaceholder(trust.framing.downplays, PLACEHOLDER_DOWNPLAYS) ||
      hasPlaceholder(trust.framing.language_notes, PLACEHOLDER_LANGUAGE_NOTES))
  ) {
    return true;
  }
  return false;
}

export async function buildTrustFieldsDataset(
  articles: ArticleOutput[],
  summaries: Record<string, string>,
  opts: BuildOptions = {}
): Promise<TrustFieldsDataset> {
  const limit = opts.limit ?? articles.length;
  const concurrency = opts.concurrency ?? 4;
  const limiter = createLimiter(concurrency);
  const model = readModelName();
  const total = Math.min(limit, articles.length);
  const startMs = Date.now();
  let done = 0;
  let failed = 0;
  const logEvery = Math.max(10, Math.floor(total / 20));

  const targets = articles.slice(0, total);
  const entries = await Promise.all(
    targets.map((article) =>
      limiter.run(async () => {
        const summary = summaries[article.id] ?? article.summary ?? "";
        const text = truncate(summary || article.title || "");
        const metadata = buildMetadata(article);
        let trust = fallbackTrustFields(article);
        if (text) {
          try {
            trust = await generateTrustFields({ metadata, text });
          } catch {
            failed += 1;
            trust = fallbackTrustFields(article);
          }
        }
        done += 1;
        if (done % logEvery === 0 || done === total) {
          const elapsed = Math.max(1, Math.round((Date.now() - startMs) / 1000));
          const rate = (done / elapsed).toFixed(2);
          console.log(`Trust fields progress: ${done}/${total} (${rate}/s) | failed: ${failed}`);
        }
        return {
          articleId: article.id,
          generatedAt: new Date().toISOString(),
          model,
          input: {
            title: article.title,
            summary: summary || undefined,
            text: text || undefined,
            sourceName: article.sourceName,
            url: article.canonicalUrl ?? article.url,
            publishedAt: article.publishedAt,
          },
          trust,
        } satisfies TrustFieldsRecord;
      })
    )
  );

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    model,
    entries,
  };
}

export async function buildTrustFieldsDatasetWithBackfill(
  articles: ArticleOutput[],
  summaries: Record<string, string>,
  existing: TrustFieldsDataset | null,
  opts: BuildOptions = {}
): Promise<TrustFieldsDataset> {
  const articleIds = new Set(articles.map((article) => article.id));
  const existingMap = new Map<string, TrustFieldsRecord>();
  if (existing?.entries?.length) {
    for (const entry of existing.entries) {
      if (!articleIds.has(entry.articleId)) continue;
      existingMap.set(entry.articleId, entry);
    }
  }

  const candidates = opts.force
    ? articles
    : articles.filter((article) => {
        const existingEntry = existingMap.get(article.id);
        if (!existingEntry) return true;
        return isPlaceholderTrust(existingEntry.trust);
      });

  const dataset = await buildTrustFieldsDataset(candidates, summaries, {
    limit: opts.limit ?? candidates.length,
    concurrency: opts.concurrency,
    force: opts.force,
  });

  const candidateIds = new Set(candidates.map((article) => article.id));
  const mergedEntries = opts.force
    ? dataset.entries
    : [
        ...[...existingMap.values()].filter((entry) => !candidateIds.has(entry.articleId)),
        ...dataset.entries,
      ];

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    model: dataset.model,
    entries: mergedEntries,
  };
}

async function readJson<T>(fp: string): Promise<T> {
  const raw = await fs.readFile(fp, "utf8");
  return JSON.parse(raw) as T;
}

async function readJsonIfExists<T>(fp: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(fp, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function main() {
  const limit = envInt("TRUST_FIELDS_LIMIT", 0);
  const concurrency = envInt("TRUST_FIELDS_CONCURRENCY", 4);
  const force = process.env.TRUST_FIELDS_FORCE === "1" || process.env.TRUST_FIELDS_FORCE === "true";
  const publicDir = path.join(process.cwd(), "public");
  const articlesPath = path.join(publicDir, "data", "articles.json");
  const summariesPath = path.join(publicDir, "data", "summaries.json");
  const trustPath = path.join(publicDir, "data", "trustFields.json");
  const feedPath = path.join(publicDir, "data", "feed.json");

  const articlesFile = await readJson<ArticlesFile>(articlesPath);
  const summariesFile = await readJson<SummariesFile>(summariesPath);
  const existing = await readJsonIfExists<TrustFieldsDataset>(trustPath);
  const feedFile = await readJsonIfExists<FeedFile>(feedPath);

  const articles = Array.isArray(articlesFile.articles) ? articlesFile.articles : [];
  const summaries = summariesFile.summaries ?? {};

  if (!articles.length) {
    throw new Error(`No articles found at ${articlesPath}`);
  }

  const mergedArticles = [...articles];
  const articlesById = new Map(articles.map((article) => [article.id, article]));
  const sourceById = new Map((feedFile?.sources ?? []).map((source) => [source.id, source]));
  let addedFromFeed = 0;
  if (Array.isArray(feedFile?.items)) {
    for (const item of feedFile.items) {
      if (!item?.id || articlesById.has(item.id)) continue;
      const sourceMeta = item.sourceId ? sourceById.get(item.sourceId) : undefined;
      const article: ArticleOutput = {
        id: item.id,
        sourceId: item.sourceId ?? "unknown",
        sourceName: sourceMeta?.name ?? item.sourceId ?? "Unknown",
        sourceType: item.sourceType ?? sourceMeta?.type ?? "unknown",
        title: item.title ?? "Untitled",
        url: item.url ?? "",
        canonicalUrl: item.canonicalUrl ?? null,
        publishedAt: item.publishedAt ?? new Date().toISOString(),
        author: item.author ?? null,
        summary: item.summary ?? "",
        imageUrl: item.media?.imageUrl ?? null,
        tags: Array.isArray(item.tags) ? item.tags : [],
      };
      mergedArticles.push(article);
      articlesById.set(item.id, article);
      addedFromFeed += 1;
    }
  }
  if (addedFromFeed) {
    console.log(`Added ${addedFromFeed} feed items not present in articles.json.`);
  }

  const dataset = await buildTrustFieldsDatasetWithBackfill(mergedArticles, summaries, existing, {
    limit: limit > 0 ? limit : mergedArticles.length,
    concurrency,
    force,
  });

  const finalDataset: TrustFieldsDataset = {
    version: 1,
    generatedAt: new Date().toISOString(),
    model: dataset.model,
    entries: dataset.entries,
  };
  await writeTrustFields(publicDir, finalDataset);
  console.log(`Wrote trustFields.json with ${finalDataset.entries.length} entries.`);
}

const isCli = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isCli) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
