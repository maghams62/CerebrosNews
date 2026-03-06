import assert from "node:assert/strict";
import test from "node:test";
import { POST as analyzeGraphQueryRoute } from "@/app/api/fundgraph/query/analysis/route";

const SAMPLE_PAYLOAD = {
  packet: {
    preset: "CO_INVESTMENT",
    query_label: "Companies Linked",
    query_text: "companies linked to ElevenLabs",
    query_intent: "companies_linked",
    display_mode: "expanded" as const,
    focus_entity: {
      id: "company:elevenlabs",
      name: "ElevenLabs",
      type: "company",
    },
    result_summary: {
      node_count: 3,
      edge_count: 2,
      visible_nodes: [
        { id: "company:elevenlabs", name: "ElevenLabs", type: "company", degree: 1 },
        { id: "fund:benchmark", name: "Benchmark", type: "fund", degree: 2 },
        { id: "company:cohere", name: "Cohere", type: "company", degree: 1 },
      ],
      visible_edges: [
        {
          source: "Benchmark",
          target: "ElevenLabs",
          type: "INVESTED_IN",
          cited: true,
          citation_count: 1,
        },
        {
          source: "Benchmark",
          target: "Cohere",
          type: "INVESTED_IN",
          cited: true,
          citation_count: 1,
        },
      ],
    },
    query_paths: [
      {
        path_label: "Highlighted query path",
        steps: [
          {
            source: "Benchmark",
            edge_type: "INVESTED_IN",
            target: "ElevenLabs",
            cited: true,
          },
        ],
      },
    ],
    evidence_stats: {
      cited_coverage_pct: 100,
      verified_edges: 2,
      unverified_edges: 0,
      hidden_metric_slots: 0,
    },
  },
};

test("POST /api/fundgraph/query/analysis returns 400 for malformed payload", async () => {
  const res = await analyzeGraphQueryRoute(
    new Request("http://localhost/api/fundgraph/query/analysis", {
      method: "POST",
      body: JSON.stringify({ query: "" }),
    })
  );

  assert.equal(res.status, 400);
  const payload = (await res.json()) as { error?: string };
  assert.equal(payload.error, "invalid_request");
});

test("POST /api/fundgraph/query/analysis returns deterministic fallback without OpenAI key", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const res = await analyzeGraphQueryRoute(
      new Request("http://localhost/api/fundgraph/query/analysis", {
        method: "POST",
        body: JSON.stringify(SAMPLE_PAYLOAD),
      })
    );

    assert.equal(res.status, 200);
    const payload = (await res.json()) as {
      mode?: "llm" | "fallback";
      answer?: string;
      derivationSummary?: string;
      pathExplanations?: string[];
      evidenceQuality?: { answerConfidence?: string };
      nextActions?: string[];
    };
    assert.equal(payload.mode, "fallback");
    assert.match(payload.answer ?? "", /ElevenLabs|linked to ElevenLabs|connected to ElevenLabs/i);
    assert.match(payload.derivationSummary ?? "", /derived|highlighted|graph/i);
    assert.ok(Array.isArray(payload.pathExplanations), "expected fallback path explanations");
    assert.ok(Array.isArray(payload.nextActions), "expected fallback follow-up actions");
    assert.ok((payload.nextActions?.length ?? 0) >= 1, "expected at least one follow-up action");
    assert.ok(payload.evidenceQuality?.answerConfidence, "expected deterministic confidence bucket");
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});
