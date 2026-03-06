import test from "node:test";
import assert from "node:assert/strict";
import {
  WINDOW_MS,
  computeDriverScore,
  computeTrendingNewsScore,
  selectConfidenceMovers,
} from "../src/components/fundgraph/forYouMath";

test("window map uses expected durations", () => {
  assert.equal(WINDOW_MS["24h"], 24 * 60 * 60 * 1000);
  assert.equal(WINDOW_MS["72h"], 72 * 60 * 60 * 1000);
  assert.equal(WINDOW_MS["7d"], 7 * 24 * 60 * 60 * 1000);
});

test("driver score penalizes contested ratio", () => {
  const lowContested = computeDriverScore({
    supportCount: 20,
    maxSupport: 24,
    momentumDelta: 6,
    minMomentum: -4,
    maxMomentum: 8,
    avgConfidence: 0.78,
    contestedRatio: 0.1,
  });

  const highContested = computeDriverScore({
    supportCount: 20,
    maxSupport: 24,
    momentumDelta: 6,
    minMomentum: -4,
    maxMomentum: 8,
    avgConfidence: 0.78,
    contestedRatio: 0.7,
  });

  assert.ok(lowContested > highContested, "expected higher contested ratio to reduce driver score");
});

test("trending news score weighs recency highest", () => {
  const fresher = computeTrendingNewsScore({
    recencyWeight: 0.95,
    trustWeight: 0.5,
    watchlistOverlapWeight: 0.2,
  });

  const stalerButTrusted = computeTrendingNewsScore({
    recencyWeight: 0.3,
    trustWeight: 0.9,
    watchlistOverlapWeight: 0.8,
  });

  assert.ok(fresher > stalerButTrusted, "expected recency to dominate combined score");
});

test("confidence mover toggle filtering", () => {
  const rows = [
    { delta: 12, id: "a" },
    { delta: -9, id: "b" },
    { delta: 0, id: "c" },
    { delta: 6, id: "d" },
  ];

  const all = selectConfidenceMovers(rows, "all");
  const up = selectConfidenceMovers(rows, "up");
  const down = selectConfidenceMovers(rows, "down");

  assert.equal(all.length, 4);
  assert.deepEqual(
    up.map((row) => row.id),
    ["a", "d"]
  );
  assert.deepEqual(
    down.map((row) => row.id),
    ["b"]
  );
});
