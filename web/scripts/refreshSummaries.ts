import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { DatasetFile, DatasetItem, DatasetSource } from "./dataset/schema";
import { generateArticleBundle, generateTitleOnlySummary } from "./dataset/llm";

type ArticlesFile = {
  articles: Array<{
    id: string;
    title: string;
    url: string;
    summary?: string;
    bulletSummary?: string[];
    bias?: string;
  }>;
  sources?: DatasetSource[];
};

type StoryGroup = {
  id: string;
  canonicalTitle: string;
  canonicalUrl?: string;
  perspectives: Array<{ id: string; summary?: string }>;
  analysis: { summary_markdown: string };
};

function cleanSummaryBullets(bullets: string[]): string[] {
  const bad = /^(source|source domain|published|domain|topics|updated|author)\b/i;
  return bullets
    .map((b) => b.trim())
    .filter((b) => b && !bad.test(b));
}

async function main() {
  const publicDir = path.join(process.cwd(), "public");
  const feedPath = path.join(publicDir, "data", "feed.json");
  const articlesPath = path.join(publicDir, "data", "articles.json");
  const storyGroupsPath = path.join(publicDir, "data", "storyGroups.json");
  const summariesPath = path.join(publicDir, "data", "summaries.json");

  const feedRaw = await fs.readFile(feedPath, "utf8");
  const feed = JSON.parse(feedRaw) as DatasetFile;
  const itemsById = new Map(feed.items.map((i) => [i.id, i]));

  const artsRaw = await fs.readFile(articlesPath, "utf8");
  const arts = JSON.parse(artsRaw) as ArticlesFile;

  const summariesMap: Record<string, string> = {};
  const updatedArticles = await Promise.all(
    arts.articles.map(async (a) => {
      const item = itemsById.get(a.id) as DatasetItem | undefined;
      if (!item) return a;
      const metadata = [
        `Title: ${item.title}`,
        `Source: ${a.id}`,
        `URL: ${item.url}`,
        `Published: ${item.publishedAt}`,
        `Author: ${item.author ?? "Not specified"}`,
        `Domain: ${item.domain ?? "Not specified"}`,
      ].join("\n");
      const baseText = item.extractedText ?? item.description ?? item.summary ?? "";
      const text = baseText.trim()
        ? baseText
        : "Full text not available. Only metadata and brief description provided.";

      let bullets: string[] = [];
      try {
        if (!text || text.length < 500) {
          const inferred = await generateTitleOnlySummary({ metadata, title: item.title });
          bullets = inferred.summary.length ? inferred.summary : [item.title];
        } else {
          const bundle = await generateArticleBundle({ metadata, text });
          bullets = cleanSummaryBullets(bundle.summary);
          if (!bullets.length) {
            const inferred = await generateTitleOnlySummary({ metadata, title: item.title });
            bullets = inferred.summary.length ? inferred.summary : [item.title];
          }
        }
      } catch {
        try {
          const inferred = await generateTitleOnlySummary({ metadata, title: item.title });
          bullets = inferred.summary.length ? inferred.summary : [item.title];
        } catch {
          bullets = [item.title, "Context: Details are still emerging."];
        }
      }

      // Ensure 4–5 bullets by supplementing with title-based bullets and lightweight context.
      if (bullets.length < 4) {
        const supplemental = await generateTitleOnlySummary({ metadata, title: item.title });
        const merged = [...bullets, ...(supplemental.summary || [])];
        const uniq = Array.from(new Set(merged.map((b) => b.trim()).filter(Boolean)));
        bullets = uniq;
      }
      if (bullets.length < 4) {
        const context = item.tags?.length ? `Context: Related to ${item.tags.slice(0, 2).join(" / ")}` : `Context: Related to ${item.sourceId}`;
        bullets.push(context);
      }
      if (bullets.length < 4) {
        bullets.push("Context: Broader industry momentum may influence this story.");
      }
      bullets = bullets.slice(0, 5);

      const summary_markdown = bullets.map((b) => `- ${b}`).join("\n");
      summariesMap[item.id] = summary_markdown;
      return {
        ...a,
        summary: summary_markdown,
        bulletSummary: bullets,
      };
    })
  );

  const storyRaw = await fs.readFile(storyGroupsPath, "utf8");
  const parsedStories = JSON.parse(storyRaw) as StoryGroup[] | { stories?: StoryGroup[] };
  const storyGroups = Array.isArray(parsedStories)
    ? parsedStories
    : Array.isArray(parsedStories.stories)
      ? parsedStories.stories
      : [];
  const summaryById = new Map(updatedArticles.map((a) => [a.id, a.summary ?? ""]));
  const updatedStories = storyGroups.map((s) => {
    const repSummary =
      s.perspectives.map((p) => summaryById.get(p.id)).find((x) => x && x.length) ?? s.analysis.summary_markdown;
    const perspectives = s.perspectives.map((p) => ({
      ...p,
      summary: summaryById.get(p.id) ?? p.summary,
    }));
    return {
      ...s,
      perspectives,
      analysis: {
        ...s.analysis,
        summary_markdown: repSummary,
      },
    };
  });

  const sources = arts.sources ?? feed.sources ?? [];
  await fs.writeFile(articlesPath, JSON.stringify({ articles: updatedArticles, sources }, null, 2), "utf8");
  await fs.writeFile(storyGroupsPath, JSON.stringify(updatedStories, null, 2), "utf8");
  await fs.writeFile(summariesPath, JSON.stringify({ summaries: summariesMap }, null, 2), "utf8");

  console.log(`Updated summaries for ${updatedArticles.length} articles.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
