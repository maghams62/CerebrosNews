import test from "node:test";
import assert from "node:assert/strict";
import { looksSportsText } from "../src/lib/filters/sports";

test("detects obvious sports phrasing", () => {
  assert.equal(looksSportsText("yes Dayton, yes Louisiana-Monroe"), true);
  assert.equal(looksSportsText("Lakers vs Celtics tonight"), true);
  assert.equal(looksSportsText("Over 219.5 points scored"), true);
});

test("does not flag tech headlines", () => {
  assert.equal(looksSportsText("Will OpenAI announce GPT-5 in 2026?"), false);
  assert.equal(looksSportsText("Nvidia unveils a new flagship GPU at GTC"), false);
});
