import "dotenv/config";
import { addSignal, getSignals } from "../src/lib/fundgraph/store";
import { readFunds } from "../src/lib/fundgraph/storage";
import { extractClaimsFromNewsSource } from "../src/lib/fundgraph/actions/extractClaims";
import { NewsSource, Signal } from "../src/lib/fundgraph/types";
import {
  DEMO_INVESTING_TAG,
  OfflineDatasetItem,
  readOfflineDataset,
} from "../src/lib/dataset/offlineDataset";
import { createId } from "../src/lib/fundgraph/ids";

type Args = {
  limit: number;
  tag: string;
  force: boolean;
  synthSignalsPerArticle: number;
};

function parseArgs(argv: string[]): Args {
  let limit = 50;
  let tag = DEMO_INVESTING_TAG;
  let force = false;
  let synthSignalsPerArticle = 1;

  for (const arg of argv) {
    if (arg === "--force") {
      force = true;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      const value = Number.parseInt(arg.slice("--limit=".length), 10);
      if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid --limit: ${arg}`);
      limit = value;
      continue;
    }
    if (arg.startsWith("--tag=")) {
      tag = arg.slice("--tag=".length).trim();
      if (!tag) throw new Error(`Invalid --tag: ${arg}`);
      continue;
    }
    if (arg.startsWith("--signals-per-article=")) {
      const value = Number.parseInt(arg.slice("--signals-per-article=".length), 10);
      if (!Number.isFinite(value) || value < 0 || value > 3) throw new Error(`Invalid --signals-per-article: ${arg}`);
      synthSignalsPerArticle = value;
      continue;
    }
    throw new Error(`Unknown arg: ${arg}`);
  }

  return { limit, tag, force, synthSignalsPerArticle };
}

function stableNumber(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function toNewsSource(item: OfflineDatasetItem, sourceName: string): NewsSource {
  const content = [
    item.extractedText,
    item.description,
    Array.isArray(item.bulletSummary) ? item.bulletSummary.join("\n") : "",
    item.summary,
  ]
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean)
    .join("\n\n");

  return {
    id: item.id,
    title: item.title,
    url: item.url,
    sourceName,
    summary: item.summary,
    content,
    publishedAt: item.publishedAt,
    tags: item.tags ?? [],
  };
}

function firstSnippetFromClaims(claims: Array<{ citation?: { snippet?: string } }>): string | undefined {
  for (const claim of claims) {
    const snippet = claim.citation?.snippet?.trim();
    if (snippet) return snippet.slice(0, 260);
  }
  return undefined;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataset = await readOfflineDataset({ includeAll: true });
  if (!dataset?.items?.length) {
    throw new Error("No canonical dataset found in public/data. Build dataset first.");
  }

  const sourceNameById = new Map((dataset.sources ?? []).map((source) => [source.id, source.name]));
  const candidates = dataset.items
    .filter((item) => Boolean(item.url))
    .filter((item) => Array.isArray(item.tags) && item.tags.includes(args.tag))
    .sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt))
    .slice(0, args.limit);

  if (!candidates.length) {
    throw new Error(`No dataset items found with tag "${args.tag}".`);
  }

  const funds = await readFunds();
  const fundIds = funds.map((fund) => fund.id);
  const existingSignals = await getSignals();
  const existingSignalKeys = new Set(
    existingSignals
      .map((signal) => `${signal.fundId}|${signal.evidenceUrl ?? ""}|${signal.title.trim().toLowerCase()}`)
      .filter((key) => key !== "||")
  );

  let extractedSources = 0;
  let extractedClaims = 0;
  let cachedHits = 0;
  let failedSources = 0;
  let syntheticSignalsAdded = 0;

  for (const item of candidates) {
    const sourceName = sourceNameById.get(item.sourceId) ?? item.sourceId;
    const source = toNewsSource(item, sourceName);
    try {
      const result = await extractClaimsFromNewsSource(source, args.force);
      extractedSources += 1;
      extractedClaims += result.claims.length;
      if (result.cached) cachedHits += 1;

      if (!args.synthSignalsPerArticle || !fundIds.length) continue;

      const linkedFundCandidates = result.claims
        .flatMap((claim) => claim.linkedFundIds ?? [])
        .filter((fundId, idx, arr) => fundId && arr.indexOf(fundId) === idx)
        .filter((fundId) => fundIds.includes(fundId));

      const fallbackFundId = fundIds[stableNumber(source.id) % fundIds.length];
      const fundIdsForSignals =
        linkedFundCandidates.length > 0
          ? linkedFundCandidates.slice(0, args.synthSignalsPerArticle)
          : [fallbackFundId].slice(0, args.synthSignalsPerArticle);

      for (const fundId of fundIdsForSignals) {
        const title = `Demo claim signal: ${source.title}`.slice(0, 160);
        const signalKey = `${fundId}|${source.url}|${title.trim().toLowerCase()}`;
        if (existingSignalKeys.has(signalKey)) continue;

        const summary =
          result.claims[0]?.claimText?.trim() ||
          source.summary ||
          `${source.title} references investing-related developments.`;

        const signal: Signal = {
          id: createId("fg-signal"),
          fundId,
          title,
          summary: summary.slice(0, 320),
          confidence: 0.62,
          createdAt: source.publishedAt || new Date().toISOString(),
          authorName: "Demo Enrichment",
          upvotes: 0,
          verifiedCount: 0,
          verifies: 0,
          disagrees: 0,
          commentsCount: 0,
          source: "system",
          tags: Array.from(new Set([args.tag, "System Enriched", ...(source.tags ?? [])])).slice(0, 8),
          evidenceUrl: source.url,
          evidenceSnippet: firstSnippetFromClaims(result.claims) ?? source.summary.slice(0, 260),
          userId: "demo-system",
          authorUserId: "demo-system",
        };

        await addSignal(signal);
        existingSignalKeys.add(signalKey);
        syntheticSignalsAdded += 1;
      }
    } catch {
      failedSources += 1;
    }
  }

  console.log("---- FundGraph Demo Claims Extraction ----");
  console.log(`Selected articles: ${candidates.length}`);
  console.log(`Sources processed: ${extractedSources}`);
  console.log(`Claims stored: ${extractedClaims}`);
  console.log(`Cached hits: ${cachedHits}`);
  console.log(`Failed sources: ${failedSources}`);
  console.log(`Synthetic signals added: ${syntheticSignalsAdded}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
