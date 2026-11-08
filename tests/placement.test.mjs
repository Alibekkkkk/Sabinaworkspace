import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  assessPlacement, canRetake, checkPlacementAnswer, createPlacementSession, MAX_ITEMS, MIN_ITEMS, nextPlacementItem,
  nextRetakeAt, PLACEMENT_LEVELS, recordPlacementAnswer, RETAKE_WAIT_MS, shouldStopPlacement, validatePlacementItems
} from "../js/placement.js";

const read = path => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const bank = JSON.parse(read("../content/placement/items.json"));
const items = bank.items;

function simulate(isCorrect) {
  let session = createPlacementSession();
  while (!shouldStopPlacement(session, items)) {
    const item = nextPlacementItem(session, items);
    session = recordPlacementAnswer(session, item, isCorrect(item));
  }
  return { session, assessment: assessPlacement(session.answered) };
}

test("the shipped item bank passes the schema validator and covers A1-C1 and all item types", () => {
  const result = validatePlacementItems(bank);
  assert.deepEqual(result.errors, []);
  assert.ok(items.length >= 36);
  assert.deepEqual([...new Set(items.map(item => item.cefr))].sort(), [...PLACEMENT_LEVELS]);
  assert.deepEqual([...new Set(items.map(item => item.type))].sort(), ["gap", "listening", "mcq", "order"]);
});

test("validator reports helpful errors", () => {
  assert.equal(validatePlacementItems(null).valid, false);
  const broken = { items: [
    { id: "x", cefr: "Z9", tag: "", prompt: "", type: "mcq", options: ["a"], answer: 5 },
    { id: "dup-one", cefr: "A1", tag: "t", prompt: "p", type: "gap", accepted: [] },
    { id: "dup-one", cefr: "A1", tag: "t", prompt: "p", type: "order", words: ["a", "b", "c"], answer: "a b d" },
    { id: "listen-one", cefr: "A1", tag: "t", prompt: "p", type: "listening", options: ["a", "b"], answer: 0 },
    { id: "wrong-type", cefr: "A1", tag: "t", prompt: "p", type: "essay" }
  ] };
  const { errors, valid } = validatePlacementItems(broken);
  assert.equal(valid, false);
  for (const fragment of ["id must be", "cefr must be", "tag is required", "options must be", "accepted must list", "duplicate id", "exactly the listed words", "audioText", "type must be", "Level C1 needs"]) {
    assert.ok(errors.some(error => error.includes(fragment)), `missing error about: ${fragment}`);
  }
});

test("every bank answer is accepted by its own checker and a wrong response is rejected", () => {
  for (const item of items) {
    if (item.type === "mcq" || item.type === "listening") {
      assert.equal(checkPlacementAnswer(item, item.answer), true, item.id);
      assert.equal(checkPlacementAnswer(item, (item.answer + 1) % item.options.length), false, item.id);
      assert.equal(checkPlacementAnswer(item, null), false);
    } else if (item.type === "gap") {
      for (const accepted of item.accepted) assert.equal(checkPlacementAnswer(item, accepted), true, item.id);
      assert.equal(checkPlacementAnswer(item, "zzz"), false);
      assert.equal(checkPlacementAnswer(item, ""), false);
    } else {
      assert.equal(checkPlacementAnswer(item, item.answer.split(" ")), true, item.id);
      assert.equal(checkPlacementAnswer(item, [...item.words].reverse()), false, item.id);
    }
  }
});

test("the session starts at A2 and moves one level per answer", () => {
  const session = createPlacementSession();
  assert.equal(PLACEMENT_LEVELS[session.levelIndex], "A2");
  const first = nextPlacementItem(session, items);
  assert.equal(first.cefr, "A2");
  assert.equal(PLACEMENT_LEVELS[recordPlacementAnswer(session, first, true).levelIndex], "B1");
  assert.equal(PLACEMENT_LEVELS[recordPlacementAnswer(session, first, false).levelIndex], "A1");
  assert.equal(recordPlacementAnswer({ levelIndex: 0, answered: [] }, items[0], false).levelIndex, 0);
  assert.equal(recordPlacementAnswer({ levelIndex: 4, answered: [] }, items[0], true).levelIndex, 4);
});

test("items are never repeated and the session ends within the item limits", () => {
  const { session } = simulate(() => true);
  assert.equal(new Set(session.answered.map(entry => entry.id)).size, session.answered.length);
  assert.ok(session.answered.length >= MIN_ITEMS && session.answered.length <= MAX_ITEMS, `asked ${session.answered.length}`);
});

test("all right gives C1, all wrong gives A1 (boundary cases)", () => {
  const right = simulate(() => true).assessment;
  assert.equal(right.cefr, "C1");
  assert.equal(right.weaknesses.length, 0);
  const wrong = simulate(() => false).assessment;
  assert.equal(wrong.cefr, "A1");
  assert.equal(wrong.strengths.length, 0);
  assert.ok(wrong.weaknesses.length > 0);
  assert.equal(assessPlacement([]).cefr, "A1");
  assert.equal(assessPlacement([]).confidence, 0);
  assert.equal(assessPlacement(undefined).cefr, "A1");
});

test("a learner who knows exactly level L is placed at L", () => {
  PLACEMENT_LEVELS.forEach((level, index) => {
    const { assessment, session } = simulate(item => PLACEMENT_LEVELS.indexOf(item.cefr) <= index);
    assert.equal(assessment.cefr, level, `ability ${level} placed at ${assessment.cefr} after ${session.answered.length} items`);
    assert.ok(assessment.confidence >= 0.5, `confidence ${assessment.confidence} for ${level}`);
  });
});

test("one slip at a lower level does not drag the estimate down, and exactly 60% passes a level", () => {
  let counter = 0;
  const row = (cefr, correct, tag = "t") => ({ id: `row-${counter++}`, cefr, tag, correct });
  const base = [row("A1", true), row("A1", true), row("A2", true), row("A2", false), row("A2", true), row("B1", true), row("B1", true), row("B1", false), row("B2", false), row("B2", false)];
  assert.equal(assessPlacement(base).cefr, "B1");
  const boundary = [row("B2", true), row("B2", true), row("B2", true), row("B2", false), row("B2", false)];
  assert.equal(assessPlacement(boundary).cefr, "B2");
  const justBelow = [row("B2", true), row("B2", true), row("B2", false), row("B2", false), row("B2", false)];
  assert.notEqual(assessPlacement(justBelow).cefr, "B2");
});

test("strengths, weaknesses and a suggested path come from the answered tags", () => {
  const rows = [
    { id: "1", cefr: "B1", tag: "passive", correct: false }, { id: "2", cefr: "A2", tag: "past-simple", correct: true },
    { id: "3", cefr: "B1", tag: "conditionals", correct: true }, { id: "4", cefr: "B1", tag: "conditionals", correct: true },
    { id: "5", cefr: "B2", tag: "inversion", correct: false }, { id: "6", cefr: "A2", tag: "modals", correct: true },
    { id: "7", cefr: "B1", tag: "relative-clauses", correct: true }
  ];
  const result = assessPlacement(rows);
  assert.equal(result.cefr, "B1");
  assert.deepEqual(result.weaknesses, ["passive"]);
  assert.ok(result.strengths.includes("conditionals"));
  assert.equal(result.suggestedPath[0].topic, "passive");
  assert.ok(result.suggestedPath.some(step => step.topic === "inversion" && step.level === "B2"));
  assert.equal(result.suggestedPath[result.suggestedPath.length - 1].kind, "lesson");
  assert.ok(result.suggestedPath.length <= 6);
});

test("retake window is seven days unless there is no previous result", () => {
  const takenAt = Date.UTC(2026, 0, 10, 12);
  assert.equal(nextRetakeAt(takenAt), takenAt + RETAKE_WAIT_MS);
  assert.equal(canRetake(takenAt, takenAt + RETAKE_WAIT_MS - 1), false);
  assert.equal(canRetake(takenAt, takenAt + RETAKE_WAIT_MS), true);
  assert.equal(canRetake(undefined), true);
  assert.equal(canRetake(null), true);
});
