import test from "node:test";
import assert from "node:assert/strict";
import { buildStoryGroupCandidates } from "../scripts/storyGroups/curate";
import type { CurateItem } from "../scripts/storyGroups/curate";
import fixtureA from "./fixtures/fixtureA.json";
import fixtureB from "./fixtures/fixtureB.json";
import fixtureC from "./fixtures/fixtureC.json";

function asItems(data: unknown): CurateItem[] {
  return data as CurateItem[];
}

test("clusters fixture A into one StoryGroup with 3 perspectives", () => {
  const groups = buildStoryGroupCandidates(asItems(fixtureA), {
    threshold: 0.4,
    minPerspectives: 2,
    minSources: 2,
  });
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.perspectives.length, 3);
});

test("does not merge distinct events in fixture B", () => {
  const groups = buildStoryGroupCandidates(asItems(fixtureB), {
    threshold: 0.45,
    minPerspectives: 2,
    minSources: 2,
  });
  assert.equal(groups.length, 2);
});

test("filters out single-source story in fixture C", () => {
  const groups = buildStoryGroupCandidates(asItems(fixtureC), {
    threshold: 0.4,
    minPerspectives: 2,
    minSources: 2,
  });
  assert.equal(groups.length, 0);
});
