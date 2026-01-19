import fs from "fs/promises";
import path from "path";
import {
  StoryGroup,
  StoryGroupCandidate,
  StoryGroupSummary,
  buildStoryGroupCandidates,
  coerceSummary,
  CurateItem,
} from "./storyGroups/curate";
import { DatasetFile, DatasetItem } from "./dataset/schema";

type Args = {
  force: boolean;
};

function parseArgs(argv: string[]): Args {
  return { force: argv.includes("--force") };
}

async function readJson<T>(fp: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(fp, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson(fp: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(fp), { recursive: true });
  const tmp = `${fp}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, fp);
}

function datasetItemsToCurateItems(dataset: DatasetFile): CurateItem[] {
  const sourceById = new Map(dataset.sources.map((s) => [s.id, s]));
  return dataset.items.map((item) => ({
    id: item.id,
    sourceId: item.sourceId,
    sourceName: sourceById.get(item.sourceId)?.name ?? item.sourceId,
    sourceType: item.sourceType,
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt,
    summary: item.summary,
    tags: item.tags ?? [],
    imageUrl: item.media?.imageUrl ?? null,
  }));
}

function normalizeSummaryInput(item: CurateItem): string {
  const summary = item.summary?.replace(/\s+/g, " ").trim();
  return summary ? summary.slice(0, 260) : "";
}

function heuristicSummary(candidate: StoryGroupCandidate): StoryGroupSummary {
  const titles = candidate.items.map((i) => i.title).slice(0, 3);
  const bullets = titles.map((t) => `Coverage highlights: ${t}`);
  const implications = candidate.topicTags.slice(0, 3).map((t) => `Implication: attention grows in ${t}.`);
  const risks = ["Risk: details are still emerging across sources."];
  return { bullets, implications, risks };
}

async function summarizeWithOpenAI(
  candidate: StoryGroupCandidate,
  apiKey: string,
  model: string
): Promise<StoryGroupSummary> {
  const items = candidate.items.slice(0, 6).map((i) => ({
    source: i.sourceName,
    title: i.title,
    summary: normalizeSummaryInput(i),
  }));

  const prompt = {
    instruction:
      "Summarize the story group using only the provided sources. Return JSON with arrays: bullets (3), implications (2-3), risks (2-3). Keep each bullet short.",
    items,
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 350,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a precise news summarizer. Only use the given sources. Return strict JSON with keys bullets, implications, risks.",
        },
        { role: "user", content: JSON.stringify(prompt) },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI request failed (${res.status})`);
  }

  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content ?? "";
  try {
    const parsed = JSON.parse(content) as StoryGroupSummary;
    return coerceSummary(parsed);
  } catch {
    return heuristicSummary(candidate);
  }
}

async function buildSummaries(
  candidates: StoryGroupCandidate[],
  opts: { force: boolean; existing: Map<string, StoryGroupSummary> }
): Promise<StoryGroup[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const out: StoryGroup[] = [];

  for (const candidate of candidates) {
    let summary: StoryGroupSummary | null = null;
    if (!opts.force) {
      summary = opts.existing.get(candidate.id) ?? null;
    }
    if (!summary) {
      if (apiKey) {
        try {
          summary = await summarizeWithOpenAI(candidate, apiKey, model);
        } catch {
          summary = heuristicSummary(candidate);
        }
      } else {
        summary = heuristicSummary(candidate);
      }
    }
    out.push({ ...candidate, summary: coerceSummary(summary) });
  }

  return out;
}

function loadExistingSummaries(raw: unknown): Map<string, StoryGroupSummary> {
  const map = new Map<string, StoryGroupSummary>();
  if (Array.isArray(raw)) {
    for (const g of raw as StoryGroup[]) {
      if (g?.id && g.summary) map.set(g.id, g.summary);
    }
  } else if (raw && typeof raw === "object" && Array.isArray((raw as { groups?: unknown }).groups)) {
    for (const g of (raw as { groups: StoryGroup[] }).groups) {
      if (g?.id && g.summary) map.set(g.id, g.summary);
    }
  }
  return map;
}

function summarizeStats(groups: StoryGroup[]): string {
  const sourceSet = new Set<string>();
  for (const g of groups) g.perspectives.forEach((p) => sourceSet.add(p.source));
  const with3Plus = groups.filter((g) => g.perspectives.length >= 3).length;
  return `StoryGroups: ${groups.length} | Sources: ${sourceSet.size} | Groups>=3 perspectives: ${with3Plus}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const publicDir = path.join(process.cwd(), "public");
  const feedPath = path.join(publicDir, "data", "feed.json");
  const storyGroupsPath = path.join(publicDir, "data", "storyGroups.json");

  const dataset = await readJson<DatasetFile>(feedPath);
  if (!dataset || !Array.isArray(dataset.items)) {
    throw new Error(`Missing dataset at ${feedPath}. Run npm run build:dataset first.`);
  }

  const items = datasetItemsToCurateItems(dataset);
  const candidates = buildStoryGroupCandidates(items, {
    threshold: 0.25,
    minPerspectives: 2,
    minSources: 2,
    maxPerspectives: 10,
  });

  const existingRaw = await readJson<unknown>(storyGroupsPath);
  const existing = loadExistingSummaries(existingRaw);
  const groups = await buildSummaries(candidates, { force: args.force, existing });

  await writeJson(storyGroupsPath, groups);
  console.log(summarizeStats(groups));
  console.log(`Wrote ${storyGroupsPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
