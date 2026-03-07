import { Fund, GraphEdge, Signal } from "@/lib/fundgraph/types";
import { loadSeedFunds, loadSeedGraphEdges, loadSeedSignals } from "@/lib/fundgraph/seed/loadSeed";

export async function readSeedFunds(): Promise<Fund[]> {
  return loadSeedFunds();
}

export async function readSeedSignals(): Promise<Signal[]> {
  return loadSeedSignals();
}

export async function readSeedGraphEdges(): Promise<GraphEdge[]> {
  return loadSeedGraphEdges();
}
