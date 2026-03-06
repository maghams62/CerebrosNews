import assert from "node:assert/strict";
import test from "node:test";
import {
  DATA_RICHNESS_THRESHOLD,
  buildPresetVerifiedMetrics,
  computeDataReadiness,
  formatVerifiedEdgeSummary,
} from "@/components/fundgraph/graphAnalyzer/analytics";
import { GraphAnalyzerData } from "@/components/fundgraph/graphAnalyzer/types";

function graphWithCoverage(citedVerifiedCount: number, totalEligibleCount: number): GraphAnalyzerData {
  const nodes: GraphAnalyzerData["nodes"] = [{ id: "fund:a", label: "Fund A", type: "fund" }];
  nodes.push(
    ...Array.from({ length: totalEligibleCount }, (_, idx) => ({
      id: `company:${idx + 1}`,
      label: `Company ${idx + 1}`,
      type: "company" as const,
    }))
  );

  const edges = Array.from({ length: totalEligibleCount }, (_, idx) => ({
    id: `edge-${idx + 1}`,
    source: "fund:a",
    target: `company:${idx + 1}`,
    type: "INVESTED_IN" as const,
    meta: {
      metricEligible: true,
      verified: idx < citedVerifiedCount,
      citationCount: idx < citedVerifiedCount ? 1 : 0,
      sourceRefs: idx < citedVerifiedCount ? [{ url: `https://example.com/${idx + 1}` }] : [],
    },
  }));

  return { nodes, edges };
}

test("computeDataReadiness is insufficient below 70% cited coverage", () => {
  const graph = graphWithCoverage(2, 5);
  const readiness = computeDataReadiness(graph, "CO_INVESTMENT");

  assert.equal(readiness.eligibleCount, 5);
  assert.equal(readiness.citedVerifiedCount, 2);
  assert.equal(readiness.isRich, false);
  assert.equal(readiness.status, "insufficient");
  assert.ok(readiness.coverage < DATA_RICHNESS_THRESHOLD);

  const metrics = buildPresetVerifiedMetrics(graph, "CO_INVESTMENT");
  assert.equal(metrics.hiddenMetricCount, 3);
  assert.equal(metrics.cards[0]?.title, "Cited Coverage");
  assert.equal(metrics.cards.length, 2);
});

test("computeDataReadiness unlocks full analytics at or above 70% cited coverage", () => {
  const graph = graphWithCoverage(7, 10);
  const readiness = computeDataReadiness(graph, "CO_INVESTMENT");

  assert.equal(readiness.isRich, true);
  assert.equal(readiness.status, "ready");
  assert.ok(readiness.coverage >= DATA_RICHNESS_THRESHOLD);

  const metrics = buildPresetVerifiedMetrics(graph, "CO_INVESTMENT");
  assert.equal(metrics.cards[0]?.title, "Cited Coverage");
  assert.ok(metrics.cards.length >= 4);
});

test("formatVerifiedEdgeSummary hides uncited numeric edge values", () => {
  const uncited = formatVerifiedEdgeSummary({
    id: "edge-hidden",
    source: "fund:a",
    target: "company:x",
    type: "INVESTED_IN",
    meta: {
      amountMinM: 5,
      amountMaxM: 9,
      roundStage: "Series A",
      verified: false,
      citationCount: 0,
    },
  });

  assert.equal(uncited.detail, "Hidden (citation required)");
  assert.equal(uncited.citations, 0);

  const cited = formatVerifiedEdgeSummary({
    id: "edge-cited",
    source: "fund:a",
    target: "company:y",
    type: "INVESTED_IN",
    meta: {
      amountMinM: 5,
      amountMaxM: 9,
      roundStage: "Series A",
      announcedAt: "2025-04-15T00:00:00.000Z",
      verified: true,
      citationCount: 2,
    },
  });

  assert.match(cited.detail, /Series A/);
  assert.match(cited.detail, /\$5\.0M - \$9\.0M/);
  assert.equal(cited.citations, 2);
});

test("preset analytics cards count only cited and verified edges", () => {
  const founderGraph: GraphAnalyzerData = {
    nodes: [
      { id: "person:p1", label: "Founder A", type: "person" },
      { id: "company:c1", label: "Company A", type: "company" },
      { id: "fund:f1", label: "Fund A", type: "fund" },
    ],
    edges: [
      {
        id: "founded-verified",
        source: "person:p1",
        target: "company:c1",
        type: "FOUNDED",
        meta: { metricEligible: true, verified: true, citationCount: 1 },
      },
      {
        id: "founded-unverified",
        source: "person:p1",
        target: "company:c1",
        type: "FOUNDED",
        meta: { metricEligible: true, verified: false, citationCount: 0 },
      },
      {
        id: "invested-verified-1",
        source: "fund:f1",
        target: "company:c1",
        type: "INVESTED_IN",
        meta: { metricEligible: true, verified: true, citationCount: 1 },
      },
      {
        id: "invested-verified-2",
        source: "fund:f1",
        target: "company:c1",
        type: "INVESTED_IN",
        meta: { metricEligible: true, verified: true, citationCount: 1 },
      },
    ],
  };

  const founderMetrics = buildPresetVerifiedMetrics(founderGraph, "FOUNDER_NETWORK");
  const founderLinks = founderMetrics.cards.find((card) => card.title === "Founder Links");
  const founderDeals = founderMetrics.cards.find((card) => card.title === "Verified Founder-Backed Deals");
  assert.equal(founderMetrics.readiness.isRich, true);
  assert.equal(founderLinks?.value, "1");
  assert.equal(founderDeals?.value, "2");

  const themeGraph: GraphAnalyzerData = {
    nodes: [
      { id: "theme:t1", label: "Theme A", type: "theme" },
      { id: "signal:s1", label: "Signal A", type: "signal" },
      { id: "source:so1", label: "Source A", type: "source" },
      { id: "company:c1", label: "Company A", type: "company" },
    ],
    edges: [
      {
        id: "support-verified-1",
        source: "signal:s1",
        target: "source:so1",
        type: "SUPPORTED_BY",
        meta: { metricEligible: true, verified: true, citationCount: 1 },
      },
      {
        id: "support-verified-2",
        source: "signal:s1",
        target: "source:so1",
        type: "SUPPORTED_BY",
        meta: { metricEligible: true, verified: true, citationCount: 1 },
      },
      {
        id: "support-unverified",
        source: "signal:s1",
        target: "source:so1",
        type: "SUPPORTED_BY",
        meta: { metricEligible: true, verified: false, citationCount: 0 },
      },
      {
        id: "mention-verified",
        source: "theme:t1",
        target: "company:c1",
        type: "MENTIONS",
        meta: { metricEligible: true, verified: true, citationCount: 1 },
      },
    ],
  };

  const themeMetrics = buildPresetVerifiedMetrics(themeGraph, "THEME_MAP");
  const evidenceLinks = themeMetrics.cards.find((card) => card.title === "Verified Evidence Links");
  const mentionLinks = themeMetrics.cards.find((card) => card.title === "Theme Mentions (Cited Context)");
  assert.equal(themeMetrics.readiness.isRich, true);
  assert.equal(evidenceLinks?.value, "2");
  assert.equal(mentionLinks?.value, "1");
});
