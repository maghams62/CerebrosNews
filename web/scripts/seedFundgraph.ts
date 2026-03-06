import fs from "fs/promises";
import path from "path";
import { buildFundgraphDatasetFromCanonicalData } from "../src/lib/fundgraph/canonicalDataset";
import { readSeedFunds, readSeedGraphEdges, readSeedSignals } from "../src/lib/fundgraph/seed";

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const publicOutDir = path.join(process.cwd(), "public", "data", "fundgraph");
  const seedOutDir = path.join(process.cwd(), "src", "lib", "fundgraph", "seed");
  const dataset =
    (await buildFundgraphDatasetFromCanonicalData({
      fundCount: 90,
      signalCount: 260,
    })) ??
    {
      funds: await readSeedFunds(),
      signals: await readSeedSignals(),
      graphEdges: await readSeedGraphEdges(),
    };

  await Promise.all([
    writeJson(path.join(publicOutDir, "funds.json"), dataset.funds),
    writeJson(path.join(publicOutDir, "signals.json"), dataset.signals),
    writeJson(path.join(publicOutDir, "graph_edges.json"), dataset.graphEdges),
    writeJson(path.join(seedOutDir, "funds.json"), dataset.funds),
    writeJson(path.join(seedOutDir, "signals.json"), dataset.signals),
    writeJson(path.join(seedOutDir, "graph_edges.json"), dataset.graphEdges),
  ]);

  console.log(`[fundgraph] seeded ${dataset.funds.length} funds, ${dataset.signals.length} signals, ${dataset.graphEdges.length} edges`);
}

main().catch((error) => {
  console.error("[fundgraph] seed failed", error);
  process.exit(1);
});
