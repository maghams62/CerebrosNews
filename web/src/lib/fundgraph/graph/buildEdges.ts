import { Fund, GraphEdge, NewsClaim, Signal } from "@/lib/fundgraph/types";
import { createId } from "@/lib/fundgraph/ids";
import { fundCompanyRecords, fundGpRecords } from "@/lib/fundgraph/fundEntities";

export function buildFundEdges(fund: Fund, signals: Signal[], linkedClaims: NewsClaim[]): GraphEdge[] {
  const edges: GraphEdge[] = [];

  for (const gp of fundGpRecords(fund)) {
    edges.push({
      id: createId("fg-edge"),
      fromType: "fund",
      fromId: fund.id,
      toType: "gp",
      toId: gp.id,
      relation: "managed_by",
      weight: 1,
    });
  }

  for (const company of fundCompanyRecords(fund)) {
    edges.push({
      id: createId("fg-edge"),
      fromType: "fund",
      fromId: fund.id,
      toType: "portfolio",
      toId: company.id,
      relation: "invested_in",
      weight: 1,
    });
  }

  for (const signal of signals) {
    edges.push({
      id: createId("fg-edge"),
      fromType: "fund",
      fromId: fund.id,
      toType: "signal",
      toId: signal.id,
      relation: "has_signal",
      weight: Math.max(0.2, Math.min(1, signal.confidence)),
    });
  }

  for (const claim of linkedClaims) {
    edges.push({
      id: createId("fg-edge"),
      fromType: "fund",
      fromId: fund.id,
      toType: "claim",
      toId: claim.id,
      relation: "linked_claim",
      weight: claim.community.trustScore,
    });
  }

  return edges;
}
