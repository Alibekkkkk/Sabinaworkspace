import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_MODE, GAME_MODES, allStagesDone, deckSummary, missionFor, modeAllows, resolveGameMode, stageResult } from "../js/games/game-mode.js";
import { DEFAULT_STAGES } from "../js/lesson-meta.js";
import { applyRewards, DAILY_XP_CAP } from "../js/games/rewards.js";

test("the mode comes from the teacher's choice, then the lesson file, then light", () => {
  assert.equal(resolveGameMode("off", "full"), "off");
  assert.equal(resolveGameMode(null, "full"), "full");
  assert.equal(resolveGameMode(undefined, undefined), DEFAULT_MODE);
  assert.equal(resolveGameMode("turbo", "also-wrong"), "light", "junk never switches anything on or off");
  assert.deepEqual([...GAME_MODES], ["full", "light", "off"]);
});

test("off adds nothing, light adds framing, only full adds the extra games", () => {
  assert.equal(modeAllows("off", "mission"), false);
  assert.equal(modeAllows("off", "extras"), false);
  assert.equal(modeAllows("light", "mission"), true);
  assert.equal(modeAllows("light", "extras"), false);
  assert.equal(modeAllows("full", "extras"), true);
});

test("every default stage has a mission line", () => {
  for (const stage of DEFAULT_STAGES) assert.match(missionFor(stage.id), /^(Mission|Boss):/, `stage ${stage.id}`);
  assert.match(missionFor(99), /^Mission:/);
});

test("finishing every stage pays a sensible amount of XP and the daily cap still holds", () => {
  let total = 0; let state = {};
  const now = Date.parse("2026-11-09T10:00:00Z");
  for (const stage of DEFAULT_STAGES) {
    const result = stageResult(stage.points);
    assert.ok(result.score === result.total && result.score >= 1);
    state = applyRewards(state, result, now, { hearts: false });
    total = state.xp;
  }
  assert.ok(total > 150 && total <= DAILY_XP_CAP, `a whole lesson pays ${total} XP`);
  assert.equal(stageResult(0).score, 1, "a stage with no points still counts as one step");
  assert.equal(state.hearts, 5, "lessons never cost hearts");
});

test("the card map says collected, in progress or not started in words", () => {
  const status = word => (word === "flood" ? "learned" : "learning");
  const deck = deckSummary(["flood", "drought", "storm"], status, word => word !== "storm");
  assert.deepEqual(deck.cards.map(card => card.state), ["collected", "in progress", "not started"]);
  assert.equal(deck.collected, 1); assert.equal(deck.total, 3);
  assert.deepEqual(deckSummary([], status, () => false), { cards: [], collected: 0, total: 0 });
});

test("a lesson is complete only when every stage is done", () => {
  const done = Object.fromEntries(DEFAULT_STAGES.map(stage => [`lesson_${stage.id}`, true]));
  assert.equal(allStagesDone(DEFAULT_STAGES, "lesson", done), true);
  delete done.lesson_5;
  assert.equal(allStagesDone(DEFAULT_STAGES, "lesson", done), false);
  assert.equal(allStagesDone([], "lesson", {}), false);
});
