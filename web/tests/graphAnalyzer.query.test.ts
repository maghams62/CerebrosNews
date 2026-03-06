import assert from "node:assert/strict";
import test from "node:test";
import fundsSeed from "../public/data/fundgraph/funds.json";
import {
  applyGraphFilters,
  buildPresetGraph,
  buildQueryResultSubgraph,
  runGraphQuery,
} from "@/components/fundgraph/graphAnalyzer/graphModel";
import { DEFAULT_ENTITY_TYPE_ENABLED } from "@/components/fundgraph/graphAnalyzer/presets";
import { Fund } from "@/lib/fundgraph/types";

function buildQueryGraph() {
  const funds = ((fundsSeed as { funds?: Fund[] }).funds ?? (fundsSeed as Fund[])).slice();
  const graph = buildPresetGraph({
    presetId: "CO_INVESTMENT",
    funds,
    signals: [],
    contextGraph: {
      nodes: [],
      edges: [],
    },
    overlapConfig: {
      leftFundId: "",
      rightFundId: "",
    },
  });

  return applyGraphFilters(graph, {
    timeline: "ALL",
    hopDepth: 3,
    verifiedOnly: false,
    sector: "ALL",
    stage: "ALL",
    entityTypeEnabled: DEFAULT_ENTITY_TYPE_ENABLED,
    focusNodeId: "",
  });
}

function buildFounderQueryGraph() {
  const funds = ((fundsSeed as { funds?: Fund[] }).funds ?? (fundsSeed as Fund[])).slice();
  const graph = buildPresetGraph({
    presetId: "FOUNDER_NETWORK",
    funds,
    signals: [],
    contextGraph: {
      nodes: [],
      edges: [],
    },
    overlapConfig: {
      leftFundId: "",
      rightFundId: "",
    },
  });

  return applyGraphFilters(graph, {
    timeline: "ALL",
    hopDepth: 3,
    verifiedOnly: false,
    sector: "ALL",
    stage: "ALL",
    entityTypeEnabled: DEFAULT_ENTITY_TYPE_ENABLED,
    focusNodeId: "",
  });
}

function buildBaseCoInvestGraph() {
  const funds = ((fundsSeed as { funds?: Fund[] }).funds ?? (fundsSeed as Fund[])).slice();
  return buildPresetGraph({
    presetId: "CO_INVESTMENT",
    funds,
    signals: [],
    contextGraph: {
      nodes: [],
      edges: [],
    },
    overlapConfig: {
      leftFundId: "",
      rightFundId: "",
    },
  });
}

function pickNarrowSector(baseGraph: ReturnType<typeof buildBaseCoInvestGraph>): string | null {
  const funds = baseGraph.nodes.filter((node) => node.type === "fund");
  const totalFunds = funds.length;
  const counts = new Map<string, number>();

  for (const fundNode of funds) {
    const sectors = Array.isArray(fundNode.meta?.sectors) ? fundNode.meta?.sectors.map((value) => String(value)) : [];
    for (const sector of sectors) {
      counts.set(sector, (counts.get(sector) ?? 0) + 1);
    }
  }

  const candidate = [...counts.entries()]
    .filter(([, count]) => count > 0 && count < totalFunds)
    .sort((left, right) => left[1] - right[1])[0];
  return candidate?.[0] ?? null;
}

test("sector filter keeps only matching funds and meaningfully narrows graph", () => {
  const baseGraph = buildBaseCoInvestGraph();
  const targetSector = pickNarrowSector(baseGraph);
  assert.ok(targetSector, "expected at least one sector that narrows the graph");
  const allGraph = applyGraphFilters(baseGraph, {
    timeline: "ALL",
    hopDepth: 2,
    verifiedOnly: false,
    sector: "ALL",
    stage: "ALL",
    entityTypeEnabled: DEFAULT_ENTITY_TYPE_ENABLED,
    focusNodeId: "",
  });
  const bioGraph = applyGraphFilters(baseGraph, {
    timeline: "ALL",
    hopDepth: 2,
    verifiedOnly: false,
    sector: targetSector!,
    stage: "ALL",
    entityTypeEnabled: DEFAULT_ENTITY_TYPE_ENABLED,
    focusNodeId: "",
  });

  const allFundCount = allGraph.nodes.filter((node) => node.type === "fund").length;
  const bioFunds = bioGraph.nodes.filter((node) => node.type === "fund");

  assert.ok(bioFunds.length > 0, "expected sector filter to keep at least one fund");
  assert.ok(bioFunds.length < allFundCount, "expected sector filter to reduce visible fund count");
  assert.ok(bioGraph.nodes.length < allGraph.nodes.length, "expected sector filter to reduce total graph size");
  for (const fundNode of bioFunds) {
    const sectors = Array.isArray(fundNode.meta?.sectors) ? fundNode.meta?.sectors.map((value) => String(value)) : [];
    assert.ok(sectors.includes(targetSector!), `expected fund ${fundNode.label} to include ${targetSector} sector`);
  }
});

test("edge type filter isolates selected relationship type", () => {
  const baseGraph = buildBaseCoInvestGraph();
  const coInvestOnly = applyGraphFilters(baseGraph, {
    timeline: "ALL",
    hopDepth: 2,
    verifiedOnly: false,
    sector: "ALL",
    stage: "ALL",
    edgeType: "CO_INVESTED",
    entityTypeEnabled: DEFAULT_ENTITY_TYPE_ENABLED,
    focusNodeId: "",
  });

  assert.ok(coInvestOnly.edges.length > 0, "expected at least one co-invest edge in filtered graph");
  assert.ok(
    coInvestOnly.edges.every((edge) => edge.type === "CO_INVESTED"),
    "expected edge type filter to keep only selected relationship type"
  );
});

test("minimum citation filter keeps only citation-backed edges", () => {
  const baseGraph = buildBaseCoInvestGraph();
  const unfiltered = applyGraphFilters(baseGraph, {
    timeline: "ALL",
    hopDepth: 2,
    verifiedOnly: false,
    sector: "ALL",
    stage: "ALL",
    entityTypeEnabled: DEFAULT_ENTITY_TYPE_ENABLED,
    focusNodeId: "",
  });
  const citedOnly = applyGraphFilters(baseGraph, {
    timeline: "ALL",
    hopDepth: 2,
    verifiedOnly: false,
    sector: "ALL",
    stage: "ALL",
    minCitationCount: 1,
    entityTypeEnabled: DEFAULT_ENTITY_TYPE_ENABLED,
    focusNodeId: "",
  });

  assert.ok(citedOnly.edges.length > 0, "expected citation filter to preserve at least one edge");
  assert.ok(citedOnly.edges.length < unfiltered.edges.length, "expected citation filter to narrow visible edge set");
  for (const edge of citedOnly.edges) {
    const citationCount = typeof edge.meta?.citationCount === "number" ? edge.meta.citationCount : 0;
    const sourceRefs = Array.isArray(edge.meta?.sourceRefs) ? edge.meta.sourceRefs.length : 0;
    assert.ok(citationCount >= 1 || sourceRefs >= 1, "expected remaining edges to have citation evidence");
  }
});

test("sector filter still applies when only companies are visible", () => {
  const baseGraph = buildBaseCoInvestGraph();
  const targetSector = pickNarrowSector(baseGraph);
  assert.ok(targetSector, "expected at least one sector that narrows the graph");
  const companiesOnly = {
    fund: false,
    company: true,
    person: false,
    claim: false,
    source: false,
    signal: false,
    theme: false,
  } as const;

  const allCompanies = applyGraphFilters(baseGraph, {
    timeline: "ALL",
    hopDepth: 2,
    verifiedOnly: false,
    sector: "ALL",
    stage: "ALL",
    entityTypeEnabled: companiesOnly,
    focusNodeId: "",
  });
  const bioCompanies = applyGraphFilters(baseGraph, {
    timeline: "ALL",
    hopDepth: 2,
    verifiedOnly: false,
    sector: targetSector!,
    stage: "ALL",
    entityTypeEnabled: companiesOnly,
    focusNodeId: "",
  });

  assert.ok(allCompanies.nodes.length > 0, "expected baseline companies-only graph to have nodes");
  assert.ok(
    bioCompanies.nodes.length < allCompanies.nodes.length,
    "expected sector filter to narrow company nodes even when funds are hidden"
  );
});

test("graph query path returns visible subgraph for OpenAI and Andreessen Horowitz", () => {
  const queryGraph = buildQueryGraph();
  const result = runGraphQuery("path between OpenAI and Andreessen Horowitz", queryGraph);

  assert.ok(result.highlightedNodeIds.length >= 2, "expected at least two highlighted nodes");
  assert.ok(result.highlightedEdgeIds.length >= 1, "expected at least one highlighted edge");
  assert.match(result.summary, /Shortest path spans/i);
  assert.equal(result.explain?.intent, "path");
  assert.ok((result.explain?.entities.length ?? 0) >= 2);
});

test("query result subgraph honors hop depth expansion", () => {
  const queryGraph = buildQueryGraph();
  const result = runGraphQuery("companies linked to ElevenLabs", queryGraph);

  const oneHop = buildQueryResultSubgraph(queryGraph, result, 1);
  const threeHop = buildQueryResultSubgraph(queryGraph, result, 3);

  assert.ok(oneHop && threeHop, "expected query subgraph builder to return graph views");
  assert.ok(threeHop.nodes.length >= oneHop.nodes.length, "expected deeper hop depth to include at least as many nodes");
  assert.ok(threeHop.edges.length >= oneHop.edges.length, "expected deeper hop depth to include at least as many edges");
  assert.ok(
    threeHop.nodes.length > oneHop.nodes.length || threeHop.edges.length > oneHop.edges.length,
    "expected deeper hop depth to add neighborhood context for linked-company query"
  );
});

test("graph query parser handles conversational path phrasing", () => {
  const queryGraph = buildQueryGraph();
  const result = runGraphQuery(
    "i ran path between OpenAI and Andreessen Horowitz in the run query",
    queryGraph
  );

  assert.ok(
    result.highlightedNodeIds.some((nodeId) => nodeId.includes("openai")),
    "expected OpenAI to be part of highlighted nodes"
  );
  assert.ok(result.highlightedNodeIds.length >= 2, "expected the conversational query to resolve to path-like highlights");
});

test("generic search fallback is token-aware for long phrases", () => {
  const queryGraph = buildQueryGraph();
  const result = runGraphQuery(
    "please show me where OpenAI and Andreessen Horowitz connect in this graph",
    queryGraph
  );

  assert.ok(result.highlightedNodeIds.length > 0, "expected token-aware search fallback to highlight nodes");
});

test("parser handles conversational relationship wording for path intent", () => {
  const queryGraph = buildQueryGraph();
  const result = runGraphQuery(
    "Can you help me understand how OpenAI is connected to Andreessen Horowitz in this view?",
    queryGraph
  );

  assert.match(result.summary, /Shortest path spans/i);
  assert.ok(result.highlightedNodeIds.length >= 2, "expected path-like highlight for conversational wording");
  assert.ok(result.highlightedEdgeIds.length >= 1, "expected at least one edge for path result");
});

test("parser handles overlap phrasing for common investments", () => {
  const queryGraph = buildQueryGraph();
  const result = runGraphQuery(
    "What are the common investments between Sequoia Capital and Andreessen Horowitz?",
    queryGraph
  );

  assert.ok(result.highlightedNodeIds.length >= 2, "expected overlap query to highlight entities");
  assert.match(
    result.summary,
    /(share|nearest relationship path|Showing immediate neighborhoods)/i,
    "expected overlap or nearest-relationship summary"
  );
});

test("parser handles conversational funds-for-theme query", () => {
  const queryGraph = buildQueryGraph();
  const result = runGraphQuery(
    "I am researching AI infrastructure right now, which investors should I look at?",
    queryGraph
  );

  assert.ok(result.highlightedNodeIds.length > 0, "expected funds/theme query to produce highlights");
  assert.match(result.summary, /fund/i);
});

test("companies-linked query is typo-tolerant for entity names", () => {
  const queryGraph = buildQueryGraph();
  const result = runGraphQuery("companies linked to elvennalabs", queryGraph);

  assert.match(result.summary, /linked to ElevenLabs/i);
  assert.ok(result.highlightedNodeIds.length > 0, "expected typo-tolerant resolution to return linked companies");
  assert.ok(result.highlightedEdgeIds.length > 0, "expected linked-company query to include bridge edges");
});

test("fund portfolio query resolves to strict fund-to-company links", () => {
  const queryGraph = buildQueryGraph();
  const result = runGraphQuery("companies Andreessen Horowitz invested in", queryGraph);

  assert.match(result.summary, /portfolio companies funded by Andreessen Horowitz/i);
  assert.equal(result.explain?.intent, "companies_invested_by_fund");
  assert.equal(result.strictNodeOnly, true, "expected strict node-only rendering for portfolio query");
  assert.ok(result.highlightedNodeIds.length > 1, "expected fund plus portfolio companies");
  assert.ok(result.highlightedEdgeIds.length > 0, "expected direct investment links");
});

test("founder query resolves to founder-person links for a fund", () => {
  const founderGraph = buildFounderQueryGraph();
  const result = runGraphQuery("founders Sequoia Capital invested in", founderGraph);

  assert.equal(result.explain?.intent, "founders_backed_by_fund");
  assert.equal(result.strictNodeOnly, true, "expected strict node-only rendering for founder query");
  assert.match(result.summary, /(founder-linked|founder-person links)/i);
  assert.ok(result.highlightedNodeIds.some((nodeId) => nodeId.startsWith("person:")), "expected person nodes in highlight");
  assert.ok(result.highlightedEdgeIds.length > 0, "expected founder query to include link edges");
});

test("disambiguates diverse conversational prompts into expected intents", () => {
  const queryGraph = buildQueryGraph();

  const cases: Array<{ query: string; expectedIntent: string }> = [
    { query: "how is OpenAI connected to Andreessen Horowitz", expectedIntent: "path" },
    { query: "find connection from Databricks to Benchmark", expectedIntent: "path" },
    { query: "show me the portfolio of Sequoia Capital", expectedIntent: "companies_invested_by_fund" },
    { query: "which companies does Benchmark back", expectedIntent: "companies_invested_by_fund" },
    { query: "what did YC invest in", expectedIntent: "companies_invested_by_fund" },
    {
      query: "what companies did both Sequoia Capital and Andreessen Horowitz invest in",
      expectedIntent: "companies_funded_by_both",
    },
    { query: "startups around ElevenLabs", expectedIntent: "companies_linked" },
    { query: "who co-invests with Sequoia Capital", expectedIntent: "companies_linked" },
    { query: "who is active in AI infrastructure", expectedIntent: "funds_in_theme" },
    { query: "which investors are focused on fintech infrastructure", expectedIntent: "funds_in_theme" },
  ];

  for (const item of cases) {
    const result = runGraphQuery(item.query, queryGraph);
    assert.equal(result.explain?.intent, item.expectedIntent, `expected intent ${item.expectedIntent} for query: ${item.query}`);
    assert.ok(
      result.highlightedNodeIds.length > 0 || result.highlightedEdgeIds.length > 0,
      `expected non-empty highlight result for query: ${item.query}`
    );
  }
});

test("diverse conversational queries resolve without empty graph results", () => {
  const queryGraph = buildQueryGraph();
  const queries = [
    "Okay, can you map the relationship between OpenAI and Sequoia Capital for me?",
    "Could you find the path from Databricks to Benchmark in this graph?",
    "I am comparing funds: what are shared investments between Accel and First Round Capital?",
    "Can you show startups around Anthropic, maybe first/second hop?",
    "I am focused on fintech this quarter, which investors should I look at?",
    "We are discussing cloud security, what funds are active there?",
    "Please help me understand how Stripe is connected to Andreessen Horowitz.",
    "Common portfolio overlap between NEA and Bessemer Venture Partners please.",
    "Show me companies connected to OpenAI and keep it concise.",
    "Show me the portfolio of Lightspeed Venture Partners.",
    "Which companies did Benchmark invest in?",
    "Who co-invests with Sequoia Capital?",
    "Who invests alongside Andreessen Horowitz?",
    "Research mode: AI infrastructure investors for this week.",
    "Which investors are focused on fintech infrastructure right now?",
    "Find connection from Databricks to Benchmark.",
  ];

  for (const query of queries) {
    const result = runGraphQuery(query, queryGraph);
    assert.ok(
      result.highlightedNodeIds.length > 0 || result.highlightedEdgeIds.length > 0,
      `expected non-empty result for query: ${query}`
    );
  }
});
