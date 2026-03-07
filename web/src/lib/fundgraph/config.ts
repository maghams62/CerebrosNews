import { FundGraphDataMode } from "@/lib/fundgraph/types";

const VALID_MODES = new Set<FundGraphDataMode>(["hybrid", "real"]);

export function getFundgraphDataMode(): FundGraphDataMode {
  const raw = String(process.env.FUNDGRAPH_DATA_MODE ?? "hybrid").toLowerCase().trim() as FundGraphDataMode;
  if (VALID_MODES.has(raw)) return raw;
  return "hybrid";
}

export function isFundgraphHybridLikeMode(mode = getFundgraphDataMode()): boolean {
  return mode === "hybrid" || mode === "real";
}
