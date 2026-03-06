import assert from "node:assert/strict";
import test from "node:test";
import { curateSignalsForFeed } from "@/lib/fundgraph/quality";
import { Signal } from "@/lib/fundgraph/types";

function baseSignal(id: string, overrides: Partial<Signal> = {}): Signal {
  return {
    id,
    fundId: "fund-a",
    title: "Insight Partners: Lio raised $30 million in a Series A funding round",
    summary: "Lio raised $30 million in a Series A funding round led by Insight Partners.",
    confidence: 0.78,
    createdAt: "2026-03-05T10:00:00.000Z",
    authorName: "demo",
    upvotes: 2,
    verifiedCount: 1,
    verifies: 1,
    disagrees: 0,
    commentsCount: 0,
    tags: ["funding", "ai"],
    source: "system",
    evidenceUrl: "https://techcrunch.com/2026/03/05/lio-series-a/",
    evidenceSnippet: "Lio announced a $30 million Series A funding round led by Insight Partners with participation from existing investors.",
    bullishCount: 2,
    neutralCount: 0,
    bearishCount: 0,
    ...overrides,
  };
}

test("quality filter removes noisy meta-tag-only signals", () => {
  const noisyOnly = baseSignal("noisy-only", {
    tags: ["vc-enrich", "other"],
    title: "Accel: Michael Seibel has also been a Group Partner at YC",
    summary: "He has been a Group Partner and CEO of YC accelerator.",
  });

  const curated = curateSignalsForFeed([noisyOnly]);
  assert.equal(curated.length, 0);
});

test("feed curation keeps same event when linked to different funds", () => {
  const sourceUrl = "https://techcrunch.com/2026/03/05/lio-series-a/?utm_source=feed";
  const duplicateA = baseSignal("dup-a", {
    fundId: "fund-a",
    evidenceUrl: sourceUrl,
    title: "Insight Partners: Lio raised $30 million in Series A funding",
  });
  const duplicateB = baseSignal("dup-b", {
    fundId: "fund-b",
    evidenceUrl: sourceUrl,
    title: "Andreessen Horowitz: Lio raised $30 million in a Series A funding round",
    summary: "Lio raised $30 million in a Series A round according to TechCrunch.",
  });

  const curated = curateSignalsForFeed([duplicateA, duplicateB], { maxPerFund: 5 });
  assert.equal(curated.length, 2);
});

test("high-quality domain-tagged signals are preserved", () => {
  const highQuality = baseSignal("hq-signal", {
    tags: ["partnership", "enterprise"],
    title: "Databricks and OpenAI announce enterprise partnership expansion",
    summary: "The expanded partnership focuses on enterprise deployment of AI agents across analytics workflows.",
    evidenceUrl: "https://www.reuters.com/world/us/databricks-openai-partnership-2026-03-04/",
    evidenceSnippet: "Databricks and OpenAI expanded their enterprise partnership with new deployment and distribution commitments.",
  });

  const curated = curateSignalsForFeed([highQuality]);
  assert.equal(curated.length, 1);
  assert.equal(curated[0]?.id, "hq-signal");
});

test("global and fund surfaces both show quality-passing tiers (ALIGNED + WARNING)", () => {
  const aligned = baseSignal("aligned", { qualityTier: "ALIGNED", evidenceUrl: "https://example.org/aligned" });
  const warning = baseSignal("warning", {
    qualityTier: "WARNING",
    title: "Insight Partners: partner interview discusses AI platform strategy",
    summary: "A partner interview outlined strategy views but did not directly confirm a specific transaction.",
    evidenceUrl: "https://example.org/warning",
  });
  const failed = baseSignal("failed", { qualityTier: "FAILED", evidenceUrl: "https://example.org/failed" });

  const globalSignals = curateSignalsForFeed([aligned, warning, failed], { maxPerFund: 0, surface: "global" });
  const fundSignals = curateSignalsForFeed([aligned, warning, failed], { maxPerFund: 0, surface: "fund" });

  assert.deepEqual(
    globalSignals.map((signal) => signal.id),
    ["aligned", "warning"]
  );
  assert.deepEqual(
    fundSignals.map((signal) => signal.id).sort(),
    ["aligned", "warning"]
  );
});

test("curation removes profile/about-page style signals even if tier is WARNING", () => {
  const profileSignal = baseSignal("profile-warning", {
    qualityTier: "WARNING",
    title: "Lightspeed Venture Partners: team includes Venture and Operating Partners",
    summary:
      "Filter options Expertise filter All expertises Investors Specialists Venture and Operating Partners Location filter All locations",
    evidenceUrl: "https://www.lsvp.com/team",
    evidenceSnippet: "Filter options Expertise filter All expertises Investors Specialists Venture and Operating Partners",
  });
  const eventSignal = baseSignal("event-warning", {
    qualityTier: "WARNING",
    title: "Lightspeed Venture Partners: portfolio company announced a new Series B round",
    summary: "A portfolio company announced a $45M Series B round led by Lightspeed and two co-investors.",
    evidenceUrl: "https://www.reuters.com/world/us/startup-raises-series-b-2026-03-06/",
  });

  const curated = curateSignalsForFeed([profileSignal, eventSignal], { maxPerFund: 0, surface: "global" });
  assert.deepEqual(
    curated.map((signal) => signal.id),
    ["event-warning"]
  );
});
