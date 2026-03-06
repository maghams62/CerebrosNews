import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GraphDetailsPanel } from "@/components/fundgraph/graphAnalyzer/GraphDetailsPanel";
import { GraphAnalyzerData } from "@/components/fundgraph/graphAnalyzer/types";

const BASE_GRAPH: GraphAnalyzerData = {
  nodes: [
    { id: "fund:a", label: "Fund A", type: "fund" },
    { id: "company:openai", label: "OpenAI", type: "company" },
  ],
  edges: [
    {
      id: "edge-uncited",
      source: "fund:a",
      target: "company:openai",
      type: "INVESTED_IN",
      meta: {
        metricEligible: true,
        verified: false,
        citationCount: 0,
        roundStage: "Series A",
        amountMinM: 5,
        amountMaxM: 9,
      },
    },
  ],
};

test("edge detail view hides uncited numeric metrics", () => {
  const html = renderToStaticMarkup(
    <GraphDetailsPanel
      graph={BASE_GRAPH}
      presetId="CO_INVESTMENT"
      displayMode="overview"
      aggregatedNodeCount={0}
      selectedNodeId=""
      selectedEdgeId="edge-uncited"
      queryResult={null}
    />
  );

  assert.match(html, /Selected edge/);
  assert.match(html, /Hidden \(citation required\)/);
  assert.doesNotMatch(html, /\$5\.0M/);
  assert.doesNotMatch(html, /\$9\.0M/);
});

test("node detail view marks uncited connected metrics as hidden", () => {
  const html = renderToStaticMarkup(
    <GraphDetailsPanel
      graph={BASE_GRAPH}
      presetId="CO_INVESTMENT"
      displayMode="focus"
      aggregatedNodeCount={0}
      selectedNodeId="fund:a"
      selectedEdgeId=""
      queryResult={null}
    />
  );

  assert.match(html, /Selected node/);
  assert.match(html, /Metric hidden/);
  assert.doesNotMatch(html, /\$5\.0M/);
  assert.doesNotMatch(html, /\$9\.0M/);
});
