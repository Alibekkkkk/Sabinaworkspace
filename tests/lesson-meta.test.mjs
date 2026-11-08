import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_STAGES, resolveMaxScore, stagesMaxScore } from "../js/lesson-meta.js";

test("default stages add up to the score the lesson player can actually award", () => {
  assert.equal(DEFAULT_STAGES.length, 9);
  assert.equal(stagesMaxScore(DEFAULT_STAGES), 110);
});

test("explicit maxScore wins, then stage points, then unknown", () => {
  assert.equal(resolveMaxScore({ maxScore: 42 }), 42);
  assert.equal(resolveMaxScore({ stages: [{ id: 1, points: 5 }, { id: 2, points: 7 }] }), 12);
  assert.equal(resolveMaxScore({}), 110);
  assert.equal(resolveMaxScore({ stages: [{ id: 1 }] }), 0);
  assert.equal(resolveMaxScore(null), 0);
  assert.equal(resolveMaxScore({ maxScore: "abc", stages: [{ points: 3 }] }), 3);
  assert.equal(resolveMaxScore({ maxScore: -5, stages: [{ points: 3 }] }), 3);
});
