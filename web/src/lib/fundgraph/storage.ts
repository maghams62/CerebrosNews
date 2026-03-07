import fs from "fs/promises";
import path from "path";
import {
  getFoundersFromPortfolio,
  getFundLinkedinUrl,
  normalizePortfolioCompanyName,
} from "@/lib/fundgraph/fundEntityProfiles";
import { getFundOverview } from "@/lib/fundgraph/fundOverview";
import { dedupeSignals } from "@/lib/fundgraph/signalDedup";
import { Fund, GraphEdge, Signal } from "@/lib/fundgraph/types";

const FUNDGRAPH_DIR = path.join(process.cwd(), "public", "data", "fundgraph");
let seededInProcess = false;
let fundsCache: Fund[] | null = null;
let signalsCache: Signal[] | null = null;
let graphEdgesCache: GraphEdge[] | null = null;
let fundsCacheMtimeMs = 0;
let signalsCacheMtimeMs = 0;
let graphEdgesCacheMtimeMs = 0;
let seedFallbackPromise: Promise<{ funds: Fund[]; signals: Signal[]; graphEdges: GraphEdge[] }> | null = null;

const PORTFOLIO_TOPUP_COMPANIES = [
  "Scale AI",
  "OpenAI",
  "Anthropic",
  "Stripe",
  "Databricks",
  "Figma",
  "Notion",
  "Rippling",
  "Canva",
  "Perplexity",
  "Cohere",
  "Mistral",
  "ElevenLabs",
  "Cursor",
  "Glean",
  "Runway",
];
const PORTFOLIO_TOPUP_STEP = 3;

// Curated demo portfolios keep the graph diverse while preserving intentional overlap.
const DEMO_PORTFOLIO_BY_FUND_SLUG: Record<string, string[]> = {
  "sequoia-capital": ["OpenAI", "Stripe", "Databricks", "Notion", "Linear", "Mistral"],
  "andreessen-horowitz": ["Anthropic", "Scale AI", "Mistral", "Datadog", "Figma", "Harvey"],
  accel: ["Scale AI", "Cohere", "Monzo", "Snyk", "Linear", "ElevenLabs"],
  benchmark: ["OpenAI", "Scale AI", "ElevenLabs", "Mercury", "Vercel", "Cohere"],
  "bessemer-venture-partners": ["Datadog", "Snyk", "Canva", "Ramp", "Anthropic", "Pinecone"],
  "lightspeed-venture-partners": ["Mistral", "Anthropic", "ElevenLabs", "Notion", "Scale AI", "Cohere"],
  "general-catalyst": ["OpenAI", "Anthropic", "Ramp", "Harvey", "Databricks", "Runway"],
  "greylock-partners": ["Figma", "Notion", "Datadog", "Scale AI", "Cohere", "Vercel"],
  "index-ventures": ["Datadog", "Snyk", "Cohere", "Anthropic", "Vercel", "Linear"],
  "khosla-ventures": ["OpenAI", "Scale AI", "Anthropic", "Mistral", "Pinecone", "Databricks"],
  "founders-fund": ["OpenAI", "Cohere", "Notion", "Ramp", "SpaceX", "Perplexity"],
  "first-round-capital": ["Notion", "Rippling", "Canva", "Mercury", "ElevenLabs", "Figma"],
  "union-square-ventures": ["Stripe", "Datadog", "Snyk", "Ramp", "Linear", "Pinecone"],
  "insight-partners": ["Datadog", "Snyk", "Pinecone", "Harvey", "Anthropic", "Mistral"],
  coatue: ["OpenAI", "Databricks", "Scale AI", "Perplexity", "Cohere", "Runway"],
  "tiger-global": ["Stripe", "Databricks", "Figma", "Canva", "Rippling", "Perplexity"],
  nea: ["Anthropic", "Runway", "Databricks", "Notion", "Science Corp", "Cohere"],
  gv: ["OpenAI", "Anthropic", "Pasqal", "Datadog", "Scale AI", "Science Corp"],
  "kleiner-perkins": ["Databricks", "Figma", "Mercury", "Linear", "Harvey", "Scale AI"],
  "ribbit-capital": ["Stripe", "Mercury", "Ramp", "Monzo", "Rippling", "OpenAI"],
  "a16z-crypto": ["OpenAI", "Anthropic", "Scale AI", "Mistral", "Cohere", "Runway"],
  ivp: ["Datadog", "Stripe", "Databricks", "Scale AI", "OpenAI", "Anthropic"],
  "redpoint-ventures": ["Stripe", "Cohere", "Mistral", "ElevenLabs", "Linear", "Notion"],
  "craft-ventures": ["Ramp", "Mercury", "Notion", "Anthropic", "Scale AI", "OpenAI"],
  "sapphire-ventures": ["Datadog", "Snyk", "Pinecone", "Cohere", "Mistral", "Runway"],
  madrona: ["Databricks", "Anthropic", "Mistral", "Scale AI", "Vercel", "Cohere"],
  "menlo-ventures": ["OpenAI", "Anthropic", "Pinecone", "Perplexity", "Runway", "Datadog"],
  "battery-ventures": ["Datadog", "Snyk", "Vercel", "Cohere", "Anthropic", "Ramp"],
  felicis: ["Scale AI", "Notion", "Canva", "Runway", "ElevenLabs", "Mercury"],
  "initialized-capital": ["Rippling", "Mercury", "Ramp", "Perplexity", "Cohere", "Notion"],
  "y-combinator": ["OpenAI", "Cohere", "Perplexity", "Stripe", "Scale AI", "ElevenLabs"],
  nfx: ["Mistral", "Runway", "ElevenLabs", "Harvey", "Linear", "Notion"],
  "threshold-ventures": ["Datadog", "Snyk", "Pinecone", "Anthropic", "Scale AI", "Cohere"],
  "lux-capital": ["Anthropic", "Pasqal", "Science Corp", "Runway", "Mistral", "OpenAI"],
  dcvc: ["Anthropic", "Pasqal", "Science Corp", "Scale AI", "OpenAI", "Mistral"],
  tcv: ["Datadog", "Stripe", "OpenAI", "Anthropic", "Perplexity", "Canva"],
  "altimeter-capital": ["ElevenLabs", "OpenAI", "Databricks", "Figma", "Scale AI", "Perplexity"],
  "spark-capital": ["Runway", "Anthropic", "Cohere", "ElevenLabs", "Notion", "Mistral"],
  "scale-venture-partners": ["Scale AI", "Datadog", "Snyk", "Pinecone", "Cohere", "Mistral"],
  gic: ["Stripe", "Databricks", "OpenAI", "Anthropic", "Scale AI", "Canva"],
};

function stableHash(input: string): number {
  let hash = 0;
  for (let idx = 0; idx < input.length; idx += 1) {
    hash = (hash * 31 + input.charCodeAt(idx)) >>> 0;
  }
  return hash;
}

function curatedPortfolioForFund(fund: Fund): string[] {
  const curated = DEMO_PORTFOLIO_BY_FUND_SLUG[fund.slug] ?? [];
  return Array.from(new Set(curated.map((company) => normalizePortfolioCompanyName(company.trim())).filter(Boolean))).slice(0, 8);
}

function topupPortfolioCompanies(fund: Fund, current: string[]): string[] {
  const curated = curatedPortfolioForFund(fund);
  if (curated.length) return curated;

  const unique = Array.from(new Set(current.map((company) => normalizePortfolioCompanyName(company.trim())).filter(Boolean)));
  if (unique.length >= 3) return unique;

  const normalizedName = normalizePortfolioCompanyName(fund.name);
  const seed = stableHash(`${fund.id}:${fund.slug}:${fund.name}`);
  const start = seed % PORTFOLIO_TOPUP_COMPANIES.length;

  for (let offset = 0; offset < PORTFOLIO_TOPUP_COMPANIES.length && unique.length < 5; offset += 1) {
    const company =
      PORTFOLIO_TOPUP_COMPANIES[(start + offset * PORTFOLIO_TOPUP_STEP) % PORTFOLIO_TOPUP_COMPANIES.length];
    const normalized = normalizePortfolioCompanyName(company);
    if (!normalized || normalized === normalizedName) continue;
    if (!unique.includes(normalized)) unique.push(normalized);
  }

  return unique.slice(0, 8);
}

function fundsPath(): string {
  return path.join(FUNDGRAPH_DIR, "funds.json");
}

function signalsPath(): string {
  return path.join(FUNDGRAPH_DIR, "signals.json");
}

function graphEdgesPath(): string {
  return path.join(FUNDGRAPH_DIR, "graph_edges.json");
}

export function fundgraphDataDir(): string {
  return FUNDGRAPH_DIR;
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function fileMtimeMs(filePath: string): Promise<number> {
  try {
    const stats = await fs.stat(filePath);
    return Number.isFinite(stats.mtimeMs) ? stats.mtimeMs : 0;
  } catch {
    return 0;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function persistFundgraphDataset(dataset: { funds: Fund[]; signals: Signal[]; graphEdges: GraphEdge[] }): Promise<void> {
  await Promise.all([
    writeJsonFile(fundsPath(), dataset.funds),
    writeJsonFile(signalsPath(), dataset.signals),
    writeJsonFile(graphEdgesPath(), dataset.graphEdges),
  ]);
}

function normalizeFunds(funds: Fund[]): Fund[] {
  return funds.map((fund) => {
    const basePortfolio = Array.isArray(fund.portfolio) ? fund.portfolio : [];
    const normalizedPortfolio = topupPortfolioCompanies(fund, basePortfolio);
    const foundersFromPortfolio = getFoundersFromPortfolio(normalizedPortfolio, 8);
    const normalizedFounders = Array.from(
      new Set([...(fund.founders ?? []).map((name) => String(name ?? "").trim()), ...foundersFromPortfolio].filter(Boolean))
    ).slice(0, 16);
    const normalizedCoInvestors = Array.from(
      new Set(
        (fund.coInvestors ?? [])
          .map((name) => String(name ?? "").trim())
          .filter((name) => Boolean(name) && normalizePortfolioCompanyName(name) !== normalizePortfolioCompanyName(fund.name))
      )
    ).slice(0, 16);
    const linkedinUrl = getFundLinkedinUrl(fund);

    return {
      ...fund,
      description: getFundOverview(fund).text,
      portfolio: normalizedPortfolio.length ? normalizedPortfolio : fund.portfolio,
      founders: normalizedFounders,
      coInvestors: normalizedCoInvestors,
      gp: {
        ...fund.gp,
        linkedinUrl: linkedinUrl ?? fund.gp.linkedinUrl,
      },
    };
  });
}

async function loadSeedFallback(): Promise<{ funds: Fund[]; signals: Signal[]; graphEdges: GraphEdge[] }> {
  if (!seedFallbackPromise) {
    seedFallbackPromise = (async () => {
      const { readSeedFunds, readSeedSignals, readSeedGraphEdges } = await import("@/lib/fundgraph/seed");
      return {
        funds: await readSeedFunds(),
        signals: dedupeSignals(await readSeedSignals()),
        graphEdges: await readSeedGraphEdges(),
      };
    })();
  }
  return seedFallbackPromise;
}

export async function ensureFundgraphSeedData(options?: {
  force?: boolean;
  fundCount?: number;
  signalCount?: number;
}): Promise<void> {
  const force = Boolean(options?.force);
  const wantsCustomSize = typeof options?.fundCount === "number" || typeof options?.signalCount === "number";
  if (!force && seededInProcess) return;
  if (!force && !wantsCustomSize) {
    const [fundsExists, signalsExists, edgesExists] = await Promise.all([
      fileExists(fundsPath()),
      fileExists(signalsPath()),
      fileExists(graphEdgesPath()),
    ]);
    if (fundsExists && signalsExists && edgesExists) {
      seededInProcess = true;
      return;
    }
  }

  const { buildFundgraphDatasetFromCanonicalData } = await import("@/lib/fundgraph/canonicalDataset");
  const canonical = await buildFundgraphDatasetFromCanonicalData({
    fundCount: options?.fundCount,
    signalCount: options?.signalCount,
  });
  const dataset = canonical
    ? canonical
    : await (async () => {
        const seedFallback = await loadSeedFallback();
        return {
          funds: seedFallback.funds.map((fund) => ({ ...fund, dataOrigin: fund.dataOrigin ?? "curated" })),
          signals: seedFallback.signals.map((signal) => ({ ...signal, dataOrigin: signal.dataOrigin ?? "curated" })),
          graphEdges: seedFallback.graphEdges,
        };
      })();
  const normalizedFunds = normalizeFunds(dataset.funds);
  const normalizedSignals = dedupeSignals(dataset.signals);
  await persistFundgraphDataset({
    ...dataset,
    funds: normalizedFunds,
    signals: normalizedSignals,
  });
  fundsCache = normalizedFunds;
  signalsCache = normalizedSignals;
  graphEdgesCache = dataset.graphEdges;
  seededInProcess = true;
}

export async function readFunds(): Promise<Fund[]> {
  const fundsFilePath = fundsPath();
  const mtime = await fileMtimeMs(fundsFilePath);
  if (fundsCache && mtime > 0 && mtime === fundsCacheMtimeMs) return fundsCache;
  await ensureFundgraphSeedData();
  const funds = await readJsonFile<Fund[] | null>(fundsFilePath, null);
  if (Array.isArray(funds)) {
    const normalized = normalizeFunds(funds);
    fundsCache = normalized;
    fundsCacheMtimeMs = await fileMtimeMs(fundsFilePath);
    return normalized;
  }
  const fallback = normalizeFunds((await loadSeedFallback()).funds);
  fundsCache = fallback;
  fundsCacheMtimeMs = 0;
  return fallback;
}

export async function writeFunds(funds: Fund[]): Promise<void> {
  const normalized = normalizeFunds(funds);
  const fundsFilePath = fundsPath();
  await writeJsonFile(fundsFilePath, normalized);
  fundsCache = normalized;
  fundsCacheMtimeMs = await fileMtimeMs(fundsFilePath);
}

export async function readSignals(): Promise<Signal[]> {
  const signalsFilePath = signalsPath();
  const mtime = await fileMtimeMs(signalsFilePath);
  if (signalsCache && mtime > 0 && mtime === signalsCacheMtimeMs) return signalsCache;
  await ensureFundgraphSeedData();
  const signals = await readJsonFile<Signal[] | null>(signalsFilePath, null);
  if (Array.isArray(signals)) {
    const normalized = dedupeSignals(signals);
    signalsCache = normalized;
    signalsCacheMtimeMs = await fileMtimeMs(signalsFilePath);
    return normalized;
  }
  const fallback = (await loadSeedFallback()).signals;
  signalsCache = fallback;
  signalsCacheMtimeMs = 0;
  return fallback;
}

export async function writeSignals(signals: Signal[]): Promise<void> {
  const normalized = dedupeSignals(signals);
  const signalsFilePath = signalsPath();
  await writeJsonFile(signalsFilePath, normalized);
  signalsCache = normalized;
  signalsCacheMtimeMs = await fileMtimeMs(signalsFilePath);
}

export async function readGraphEdges(): Promise<GraphEdge[]> {
  const graphEdgesFilePath = graphEdgesPath();
  const mtime = await fileMtimeMs(graphEdgesFilePath);
  if (graphEdgesCache && mtime > 0 && mtime === graphEdgesCacheMtimeMs) return graphEdgesCache;
  await ensureFundgraphSeedData();
  const edges = await readJsonFile<GraphEdge[] | null>(graphEdgesFilePath, null);
  if (Array.isArray(edges)) {
    graphEdgesCache = edges;
    graphEdgesCacheMtimeMs = await fileMtimeMs(graphEdgesFilePath);
    return edges;
  }
  const fallback = (await loadSeedFallback()).graphEdges;
  graphEdgesCache = fallback;
  graphEdgesCacheMtimeMs = 0;
  return fallback;
}

export async function writeGraphEdges(edges: GraphEdge[]): Promise<void> {
  const graphEdgesFilePath = graphEdgesPath();
  await writeJsonFile(graphEdgesFilePath, edges);
  graphEdgesCache = edges;
  graphEdgesCacheMtimeMs = await fileMtimeMs(graphEdgesFilePath);
}
