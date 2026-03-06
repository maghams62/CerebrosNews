import assert from "node:assert/strict";
import test from "node:test";
import { buildAdvancedSignalInsight } from "@/lib/fundgraph/advancedSignalInsight";
import {
  addSignal,
  addSignalSourceCitation,
  addSignalVote,
  getSignals,
  setSignalAdvancedInsight,
  setSignalStance,
} from "@/lib/fundgraph/store";
import { createId } from "@/lib/fundgraph/ids";
import { Signal } from "@/lib/fundgraph/types";

function makeSignal(signalId: string): Signal {
  return {
    id: signalId,
    fundId: "f-sequoia",
    title: `Advanced insight invalidation signal ${signalId}`,
    summary: `Signal used to validate advanced insight invalidation on source, verify/dispute, and stance updates. ${signalId}`,
    confidence: 0.64,
    createdAt: new Date().toISOString(),
    authorName: "test-user",
    upvotes: 0,
    verifiedCount: 0,
    verifies: 0,
    disagrees: 0,
    commentsCount: 0,
    tags: ["ai", "verification"],
    bullishCount: 0,
    neutralCount: 0,
    bearishCount: 0,
    source: "community",
  };
}

function uniqueSignalId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}

test("store invalidates advanced insight on source, verify/dispute, and stance mutations", async () => {
  const signalId = uniqueSignalId("advanced-invalidation");
  const created = await addSignal(makeSignal(signalId));
  const allSignals = await getSignals();
  const insight = await buildAdvancedSignalInsight({
    signal: created,
    allSignals,
    now: new Date(),
  });

  await setSignalAdvancedInsight({ signalId, insight });

  const afterSource = await addSignalSourceCitation({
    signalId,
    url: "https://example.com/new-source",
    snippet: "Source update should invalidate advanced insight.",
  });
  assert.ok(afterSource, "expected signal to exist after source update");
  assert.equal(afterSource?.advancedInsight, undefined);
  assert.equal(afterSource?.advancedInsightStatus, undefined);

  await setSignalAdvancedInsight({ signalId, insight });
  const afterVote = await addSignalVote({
    signalId,
    userId: `vote-user-${Date.now()}`,
    vote: "verify",
    verificationId: createId("fg-verification"),
  });
  assert.ok(afterVote, "expected signal to exist after vote update");
  assert.equal(afterVote?.advancedInsight, undefined);
  assert.equal(afterVote?.advancedInsightStatus, undefined);

  await setSignalAdvancedInsight({ signalId, insight });
  const afterStance = await setSignalStance({
    signalId,
    userId: `stance-user-${Date.now()}`,
    stanceType: "bullish",
    stanceId: createId("fg-signal-stance"),
  });
  assert.ok(afterStance, "expected signal to exist after stance update");
  assert.equal(afterStance?.advancedInsight, undefined);
  assert.equal(afterStance?.advancedInsightStatus, undefined);
});
