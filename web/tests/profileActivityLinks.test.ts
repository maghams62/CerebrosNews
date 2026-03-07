import assert from "node:assert/strict";
import test from "node:test";
import { resolveProfileActivityLink } from "@/fundgraph/profileActivityLinks";

const baseContext = {
  fundNameById: { "fund-1": "Acme Ventures" },
  signalTitleById: new Map([["signal-1", "Acme: New diligence signal"]]),
  claimTextById: new Map([["claim-1", "Acme raised a new round with strategic investors."]]),
  memoIdSet: new Set(["memo-1"]),
};

test("links add_comment events to the scoped fund discussion", () => {
  const result = resolveProfileActivityLink("add_comment", "fund:fund-1:comment:comment-1", baseContext);
  assert.equal(result.href, "/cerebrosfund/funds/fund-1#fund-discussion");
  assert.equal(result.targetLabel, "Fund discussion: Acme Ventures");
});

test("links signal events to the signal card anchor", () => {
  const result = resolveProfileActivityLink("share_signal", "signal-1", baseContext);
  assert.equal(result.href, "/cerebrosfund/signals?signalId=signal-1#signal-signal-1");
  assert.equal(result.targetLabel, "Acme: New diligence signal");
});

test("opens add_source signal links with add-citation composer", () => {
  const result = resolveProfileActivityLink("add_source", "signal:signal-1:source:source-1", baseContext);
  assert.equal(result.href, "/cerebrosfund/signals?signalId=signal-1&quickAction=addCitation#signal-signal-1");
});

test("links memo_generate events to memo detail page", () => {
  const result = resolveProfileActivityLink("memo_generate", "memo-1", baseContext);
  assert.equal(result.href, "/cerebrosfund/memos/memo-1");
  assert.equal(result.targetLabel, "Open memo");
});

test("routes verify_claim signal ids to the signals surface", () => {
  const result = resolveProfileActivityLink("verify_claim", "signal-99", {
    ...baseContext,
    signalTitleById: new Map(),
  });
  assert.equal(result.href, "/cerebrosfund/signals?signalId=signal-99#signal-signal-99");
});

test("routes verify_claim claim ids to claim graph", () => {
  const result = resolveProfileActivityLink("verify_claim", "claim-88", {
    ...baseContext,
    claimTextById: new Map(),
  });
  assert.equal(result.href, "/cerebrosfund/graph?claimId=claim-88");
});

test("falls back to a navigable page when target is unavailable", () => {
  const result = resolveProfileActivityLink("add_comment", null, baseContext);
  assert.equal(result.href, "/cerebrosfund/funds");
  assert.equal(result.targetLabel, "Open funds");
});
