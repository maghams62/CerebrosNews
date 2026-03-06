import assert from "node:assert/strict";
import test from "node:test";
import fundsSeed from "../public/data/fundgraph/funds.json";
import {
  applyGraphFilters,
  buildGraphDisplayResult,
  buildPresetGraph,
  degreeByNode,
} from "@/components/fundgraph/graphAnalyzer/graphModel";
import { DEFAULT_ENTITY_TYPE_ENABLED } from "@/components/fundgraph/graphAnalyzer/presets";
import { Fund } from "@/lib/fundgraph/types";

function buildCoInvestFilteredGraph() {
  const funds = ((fundsSeed as { funds?: Fund[] }).funds ?? (fundsSeed as Fund[])).slice();
  const base = buildPresetGraph({
    presetId: "CO_INVESTMENT",
    funds,
    signals: [],
    contextGraph: { nodes: [], edges: [] },
    overlapConfig: { leftFundId: "", rightFundId: "" },
  });
  return applyGraphFilters(base, {
    timeline: "ALL",
    hopDepth: 2,
    verifiedOnly: false,
    sector: "ALL",
    stage: "ALL",
    entityTypeEnabled: DEFAULT_ENTITY_TYPE_ENABLED,
    focusNodeId: "",
  });
}

test("overview display mode caps node/edge density and prioritizes labels", () => {
  const graph = buildCoInvestFilteredGraph();
  const result = buildGraphDisplayResult(graph, {
    presetId: "CO_INVESTMENT",
    mode: "overview",
  });

  assert.ok(result.graph.nodes.length <= 26, `expected compact overview, got ${result.graph.nodes.length} nodes`);
  assert.ok(result.graph.edges.length <= 44, `expected compact overview edges, got ${result.graph.edges.length}`);
  assert.ok(result.labelNodeIds.length <= 16, `expected capped labels, got ${result.labelNodeIds.length}`);
});

test("focus and expanded modes progressively reveal neighborhood", () => {
  const graph = buildCoInvestFilteredGraph();
  const degree = degreeByNode(graph);
  const focusNode = [...graph.nodes]
    .sort((left, right) => (degree.get(right.id) ?? 0) - (degree.get(left.id) ?? 0))
    .find((node) => node.type === "fund");

  assert.ok(focusNode, "expected at least one fund node to use as focus anchor");

  const focus = buildGraphDisplayResult(graph, {
    presetId: "CO_INVESTMENT",
    mode: "focus",
    selectedNodeId: focusNode?.id,
  });
  const expanded = buildGraphDisplayResult(graph, {
    presetId: "CO_INVESTMENT",
    mode: "expanded",
    selectedNodeId: focusNode?.id,
  });

  assert.ok(focus.graph.nodes.some((node) => node.id === focusNode?.id), "focus result should include anchor node");
  assert.ok(focus.graph.nodes.length <= 32, `focus mode cap exceeded: ${focus.graph.nodes.length}`);
  assert.ok(expanded.graph.nodes.length <= 46, `expanded mode cap exceeded: ${expanded.graph.nodes.length}`);
  assert.ok(
    expanded.graph.nodes.length >= focus.graph.nodes.length,
    "expanded mode should reveal at least as many nodes as focus mode"
  );
});
