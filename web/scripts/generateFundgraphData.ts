import fs from "fs/promises";
import path from "path";
import { buildFundgraphDatasetFromCanonicalData } from "../src/lib/fundgraph/canonicalDataset";
import { readSeedFunds, readSeedGraphEdges, readSeedSignals } from "../src/lib/fundgraph/seed";

function parseNumber(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.floor(parsed);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const fundCount = Math.max(50, Math.min(150, parseNumber(process.env.FUNDGRAPH_FUND_COUNT, 90)));
  const signalsPerFund = Math.max(2, parseNumber(process.env.FUNDGRAPH_SIGNALS_PER_FUND, 3));
  const signalCount = Math.max(200, fundCount * signalsPerFund);

  const dataset =
    (await buildFundgraphDatasetFromCanonicalData({
      fundCount,
      signalCount,
    })) ??
    {
      funds: await readSeedFunds(),
      signals: await readSeedSignals(),
      graphEdges: await readSeedGraphEdges(),
    };

  const publicOutDir = path.join(process.cwd(), "public", "data", "fundgraph");
  const seedOutDir = path.join(process.cwd(), "src", "lib", "fundgraph", "seed");
  await Promise.all([
    writeJson(path.join(publicOutDir, "funds.json"), dataset.funds),
    writeJson(path.join(publicOutDir, "signals.json"), dataset.signals),
    writeJson(path.join(publicOutDir, "graph_edges.json"), dataset.graphEdges),
    writeJson(path.join(seedOutDir, "funds.json"), dataset.funds),
    writeJson(path.join(seedOutDir, "signals.json"), dataset.signals),
    writeJson(path.join(seedOutDir, "graph_edges.json"), dataset.graphEdges),
  ]);

  console.log(`[fundgraph] generated ${dataset.funds.length} funds, ${dataset.signals.length} signals, ${dataset.graphEdges.length} graph edges`);
}

main().catch((error) => {
  console.error("[fundgraph] generation failed", error);
  process.exit(1);
});
