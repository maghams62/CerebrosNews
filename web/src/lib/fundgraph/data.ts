import { getFundgraphDataMode } from "@/lib/fundgraph/config";
import { readFunds } from "@/lib/fundgraph/storage";
import { getClaims, getSignals } from "@/lib/fundgraph/store";
import { Fund, FundGraphDataMode, NewsClaim, Signal } from "@/lib/fundgraph/types";

export interface FundGraphDataSnapshot {
  mode: FundGraphDataMode;
  funds: Fund[];
  signals: Signal[];
  claims: NewsClaim[];
}

export async function getFundGraphData(): Promise<FundGraphDataSnapshot> {
  const [funds, signals, claims] = await Promise.all([readFunds(), getSignals(), getClaims()]);
  return {
    mode: getFundgraphDataMode(),
    funds,
    signals,
    claims,
  };
}
