import assert from "node:assert/strict";
import test from "node:test";
import {
  __testEnsureReadableNote,
  __testSeededStanceRows,
  __testSeededVerificationRows,
  __testStancePlan,
  __testVerificationPlan,
} from "../scripts/fundgraphSeedCommunity";
import { Signal } from "@/lib/fundgraph/types";

function mockSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "fg-signal-seed-1",
    fundId: "fg-fund-1",
    title: "Accel: partner commentary on AI Consumer and Fintech",
    summary: "Partner commentary highlights AI Consumer and Fintech investment focus.",
    confidence: 0.78,
    createdAt: "2026-03-06T07:26:23.000Z",
    authorName: "FundGraph Enrichment",
    upvotes: 0,
    verifiedCount: 0,
    verifies: 0,
    disagrees: 0,
    commentsCount: 0,
    qualityTier: "ALIGNED",
    qualityReasons: [],
    articleSnapshot: {
      headline: "Accel partner focus update",
      sourceName: "Accel",
      sourceUrl: "https://www.accel.com/people",
      publishedAt: "2026-03-06T07:00:00.000Z",
      bullets: ["Subrata Mitra focuses on AI Consumer and Fintech."],
      keyFacts: [{ label: "Partner", value: "Subrata Mitra", citationId: "c1" }],
      evidenceQuotes: [{ citationId: "c1", text: "Subrata Mitra focuses on AI Consumer and Fintech.", url: "https://www.accel.com/people" }],
      excerpt: "Subrata Mitra focuses on AI Consumer and Fintech.",
      extraction: {
        extractedAt: "2026-03-06T07:26:23.000Z",
        extractor: "signal_article_v1",
        sourceTextLength: 420,
        snippetOverlapScore: 0.72,
        fundRelevanceScore: 0.81,
        sourceJoinScore: 1,
      },
    },
    ...overrides,
  };
}

test("seed plans are deterministic and provide baseline coverage", () => {
  const signal = mockSignal();
  const stanceA = __testStancePlan(signal);
  const stanceB = __testStancePlan(signal);
  assert.deepEqual(stanceA, stanceB);
  assert.ok(stanceA.bullish >= 1 && stanceA.neutral >= 1 && stanceA.bearish >= 1);

  const verification = __testVerificationPlan(signal);
  assert.ok(verification.verifies >= 1);
  assert.ok(verification.disputes >= 0);
});

test("seeded rows carry provenance metadata", () => {
  const signal = mockSignal({ qualityTier: "WARNING", qualityReasons: ["source_join_missing"] });
  const verifications = __testSeededVerificationRows(signal, signal.createdAt);
  const stances = __testSeededStanceRows(signal, signal.createdAt);

  assert.ok(verifications.length >= 2);
  assert.ok(stances.length >= 3);
  assert.ok(verifications.every((entry) => entry.seeded && entry.dataOrigin === "derived"));
  assert.ok(stances.every((entry) => entry.seeded && entry.dataOrigin === "derived"));
});

test("seed notes are readable after quality guard", () => {
  const note = __testEnsureReadableNote("SubrataMitraBasedInBangaloreSpecialtyFocusAI");
  assert.ok(note.length >= 24);
  assert.ok(/[.!?]/.test(note));
});
