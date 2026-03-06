import assert from "node:assert/strict";
import test from "node:test";
import {
  ADVANCED_SIGNAL_INSIGHT_MAX_AGE_MS,
  ADVANCED_SIGNAL_INSIGHT_VERSION,
  buildAdvancedSignalInsight,
  computeRelatedSignalMatches,
  evaluateAdvancedInsightCache,
} from "@/lib/fundgraph/advancedSignalInsight";
import { GraphEdge, Signal } from "@/lib/fundgraph/types";

const FIXED_NOW = new Date("2026-03-05T15:00:00.000Z");

function makeSignal(id: string, overrides: Partial<Signal> = {}): Signal {
  return {
    id,
    fundId: "fund-a",
    title: "Nimbus AI launches workflow platform",
    summary: "nimbus ai expands finance workflow product",
    confidence: 0.72,
    createdAt: "2026-03-05T10:00:00.000Z",
    authorName: "demo",
    upvotes: 2,
    verifiedCount: 1,
    verifies: 1,
    disagrees: 0,
    commentsCount: 0,
    tags: ["ai", "workflow"],
    bullishCount: 2,
    neutralCount: 0,
    bearishCount: 0,
    ...overrides,
  };
}

const BASE_GRAPH: GraphEdge[] = [
  {
    id: "edge-signal-fund",
    fromType: "signal",
    fromId: "signal-main",
    toType: "fund",
    toId: "fund-a",
    relation: "MENTIONS",
    weight: 1,
  },
  {
    id: "edge-signal-company",
    fromType: "signal",
    fromId: "signal-main",
    toType: "company",
    toId: "company-1",
    relation: "MENTIONS",
    weight: 1,
  },
];

test("advanced insight generation returns complete schema-valid insight", async () => {
  const target = makeSignal("signal-main");
  const peers = [
    makeSignal("peer-1", {
      fundId: "fund-b",
      createdAt: "2026-03-04T10:00:00.000Z",
      title: "Nimbus AI secures strategic partnership",
      summary: "nimbus ai expands distribution channels",
      tags: [],
    }),
    makeSignal("peer-2", {
      fundId: "fund-c",
      createdAt: "2026-03-03T10:00:00.000Z",
      title: "workflow platform demand rises",
      summary: "workflow platform demand in finance tools rises",
      tags: ["ai"],
    }),
  ];

  const insight = await buildAdvancedSignalInsight({
    signal: target,
    allSignals: [target, ...peers],
    graphEdges: BASE_GRAPH,
    now: FIXED_NOW,
  });

  assert.equal(insight.generation_version, ADVANCED_SIGNAL_INSIGHT_VERSION);
  assert.equal(insight.generated_at, FIXED_NOW.toISOString());
  assert.ok(insight.materiality_score >= 0 && insight.materiality_score <= 100);
  assert.ok(insight.novelty_score >= 0 && insight.novelty_score <= 100);
  assert.ok(insight.risk_uncertainty_score >= 0 && insight.risk_uncertainty_score <= 100);
  assert.ok(insight.implication_summary.length >= 20);
  assert.ok(insight.bull_case.length >= 20);
  assert.ok(insight.base_case.length >= 20);
  assert.ok(insight.bear_case.length >= 20);
  assert.ok(insight.missing_evidence.length >= 2);
  assert.ok(insight.confidence_change_triggers.length >= 2);
  assert.ok(insight.next_questions.length >= 3);
  assert.ok(insight.analyst_note.bullets.length === 3);
});

test("advanced insight deterministic fallback remains complete when LLM is disabled", async () => {
  const prevFlag = process.env.FUNDGRAPH_ADVANCED_USE_LLM;
  const prevKey = process.env.OPENAI_API_KEY;
  process.env.FUNDGRAPH_ADVANCED_USE_LLM = "1";
  delete process.env.OPENAI_API_KEY;

  try {
    const signal = makeSignal("signal-fallback");
    const insight = await buildAdvancedSignalInsight({
      signal,
      allSignals: [signal],
      graphEdges: [],
      now: FIXED_NOW,
    });

    assert.ok(insight.implication_summary.length > 0);
    assert.ok(insight.missing_evidence.length >= 2);
    assert.ok(insight.confidence_change_triggers.length >= 2);
    assert.ok(insight.next_questions.length >= 3);
    assert.ok(insight.graph_insight_summary.length > 0);
  } finally {
    if (prevFlag === undefined) delete process.env.FUNDGRAPH_ADVANCED_USE_LLM;
    else process.env.FUNDGRAPH_ADVANCED_USE_LLM = prevFlag;
    if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevKey;
  }
});

test("related signal relation types follow precedence order", () => {
  const target = makeSignal("target", {
    title: "Nimbus AI launches workflow platform",
    summary: "nimbus ai expands finance workflow product",
    tags: ["ai", "workflow"],
  });

  const sameFund = makeSignal("same-fund", {
    fundId: "fund-a",
    title: "unrelated market note",
    summary: "misc update",
    tags: [],
  });

  const sameEntity = makeSignal("same-entity", {
    fundId: "fund-b",
    title: "Nimbus AI secures strategic partnership",
    summary: "partner expansion",
    tags: [],
  });

  const sameTheme = makeSignal("same-theme", {
    fundId: "fund-c",
    title: "tooling update for teams",
    summary: "broad market note",
    tags: ["ai"],
  });

  const similarPattern = makeSignal("similar-pattern", {
    fundId: "fund-d",
    title: "nimbus workflow platform finance shift",
    summary: "workflow product finance expansion",
    tags: [],
  });

  const related = computeRelatedSignalMatches({
    signal: target,
    allSignals: [target, sameFund, sameEntity, sameTheme, similarPattern],
  });

  const byId = new Map(related.map((item) => [item.signalId, item]));
  assert.equal(byId.get("same-fund")?.relationType, "same_fund");
  assert.equal(byId.get("same-entity")?.relationType, "same_entity");
  assert.equal(byId.get("same-theme")?.relationType, "same_theme");
  assert.equal(byId.get("similar-pattern")?.relationType, "similar_pattern");
});

test("related signal matching enforces diversity caps and keeps at least one non-same-fund candidate", () => {
  const target = makeSignal("target-diversity", {
    title: "Lio announces workflow finance update",
    summary: "lio expands workflow finance tooling",
    tags: ["ai", "workflow"],
    fundId: "fund-x",
  });

  const candidates = [
    makeSignal("sf-1", { fundId: "fund-x", title: "Lio update one", summary: "lio update one" }),
    makeSignal("sf-2", { fundId: "fund-x", title: "Lio update two", summary: "lio update two" }),
    makeSignal("sf-3", { fundId: "fund-x", title: "Lio update three", summary: "lio update three" }),
    makeSignal("se-1", { fundId: "fund-y", title: "Lio closes pilot", summary: "lio pilot closes" }),
    makeSignal("se-2", { fundId: "fund-z", title: "Lio grows users", summary: "lio users grow" }),
    makeSignal("se-3", { fundId: "fund-w", title: "Lio adds partner", summary: "lio adds partner" }),
  ];

  const related = computeRelatedSignalMatches({
    signal: target,
    allSignals: [target, ...candidates],
  });

  const sameFundCount = related.filter((item) => item.relationType === "same_fund").length;
  const sameEntityCount = related.filter((item) => item.relationType === "same_entity").length;
  const nonSameFundCount = related.filter((item) => item.relationType !== "same_fund").length;

  assert.ok(related.length <= 5);
  assert.ok(sameFundCount <= 2);
  assert.ok(sameEntityCount <= 2);
  assert.ok(nonSameFundCount >= 1);
});

test("related signal matching dedupes near-identical event variants", () => {
  const target = makeSignal("target-fingerprint", {
    fundId: "fund-main",
    title: "Insight Partners: Lio raised $30 million in Series A",
    summary: "Lio raised $30 million in a Series A funding round led by Insight Partners",
    tags: ["funding", "ai"],
  });

  const duplicateA = makeSignal("dup-a", {
    fundId: "fund-main",
    title: "Insight Partners: Lio raised $30M in Series A funding",
    summary: "Lio raised $30 million in Series A funding",
  });
  const duplicateB = makeSignal("dup-b", {
    fundId: "fund-main",
    title: "Insight Partners: Lio raised $30 million in a Series A funding round",
    summary: "Lio raised $30 million in a Series A round",
  });
  const distinct = makeSignal("distinct-candidate", {
    fundId: "fund-alt",
    title: "Andreessen Horowitz: Lio expands to Europe",
    summary: "Lio opened a European office with new enterprise partnerships",
    tags: ["expansion"],
  });

  const related = computeRelatedSignalMatches({
    signal: target,
    allSignals: [target, duplicateA, duplicateB, distinct],
  });

  const duplicateEntries = related.filter((item) => item.signalId === "dup-a" || item.signalId === "dup-b");
  assert.ok(duplicateEntries.length <= 1);
  assert.ok(related.some((item) => item.signalId === "distinct-candidate"));
});

test("advanced cache evaluation handles fresh, version mismatch, expiry, and related drift", async () => {
  const signal = makeSignal("cache-signal");
  const relatedA = makeSignal("related-a", {
    fundId: "fund-b",
    title: "Nimbus AI closes customer pilot",
    summary: "nimbus ai expands enterprise workflow pilot",
    createdAt: "2026-03-04T10:00:00.000Z",
  });
  const relatedB = makeSignal("related-b", {
    fundId: "fund-c",
    title: "workflow automation sees finance uptake",
    summary: "finance workflow automation trend gains speed",
    tags: ["workflow"],
    createdAt: "2026-03-03T10:00:00.000Z",
  });
  const allSignals = [signal, relatedA, relatedB];

  const freshInsight = await buildAdvancedSignalInsight({
    signal,
    allSignals,
    now: FIXED_NOW,
  });

  const freshEval = evaluateAdvancedInsightCache({
    signal: { ...signal, advancedInsight: freshInsight },
    allSignals,
    now: new Date(FIXED_NOW.getTime() + 5 * 60 * 1000),
  });
  assert.equal(freshEval.shouldRefresh, false);
  assert.equal(freshEval.reason, "fresh");

  const versionEval = evaluateAdvancedInsightCache({
    signal: {
      ...signal,
      advancedInsight: {
        ...freshInsight,
        generation_version: "advanced_old",
      },
    },
    allSignals,
    now: FIXED_NOW,
  });
  assert.equal(versionEval.shouldRefresh, true);
  assert.equal(versionEval.reason, "version_mismatch");

  const expiredEval = evaluateAdvancedInsightCache({
    signal: {
      ...signal,
      advancedInsight: {
        ...freshInsight,
        generated_at: new Date(FIXED_NOW.getTime() - ADVANCED_SIGNAL_INSIGHT_MAX_AGE_MS - 1_000).toISOString(),
      },
    },
    allSignals,
    now: FIXED_NOW,
  });
  assert.equal(expiredEval.shouldRefresh, true);
  assert.equal(expiredEval.reason, "expired");

  const driftEval = evaluateAdvancedInsightCache({
    signal: {
      ...signal,
      advancedInsight: {
        ...freshInsight,
        related_signals: [
          {
            signal_id: "totally-unrelated",
            title: "Unrelated",
            relation_type: "similar_pattern",
            similarity_score: 0.11,
          },
        ],
      },
    },
    allSignals,
    now: FIXED_NOW,
  });
  assert.equal(driftEval.shouldRefresh, true);
  assert.equal(driftEval.reason, "related_drift");

  const missingEval = evaluateAdvancedInsightCache({
    signal,
    allSignals,
    now: FIXED_NOW,
  });
  assert.equal(missingEval.shouldRefresh, true);
  assert.equal(missingEval.reason, "missing");
});
