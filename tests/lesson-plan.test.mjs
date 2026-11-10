// The lesson's section list (js/lesson-plan.js): fixed order, grammar sections named after the content's topics.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildLessonPlan, exerciseKind, exerciseScoreId, grammarTopics, neighbours, planMaxScore, resolveSectionId, roman, scoreUnits, sectionDone, validateGrammar
} from "../js/lesson-plan.js";

const load = name => JSON.parse(readFileSync(new URL(`../content/${name}.json`, import.meta.url), "utf8"));
const STUDENTS = ["sabina", "gaziz", "abay", "araylim_1", "araylim_2", "araylim_3", "george"];

test("every lesson has the fixed section order, with no Close Reading", () => {
  for (const name of STUDENTS) {
    const plan = buildLessonPlan(load(name));
    const kinds = plan.map(section => section.kind);
    assert.deepEqual(kinds.slice(0, 5), ["vocab", "match", "reading", "games", "listening"], name);
    assert.equal(kinds.at(-1), "test", name);
    assert.ok(kinds.slice(5, -1).every(kind => kind === "grammar") && kinds.length >= 7, `${name}: grammar sections between listening and the test`);
    assert.deepEqual(plan.map(section => section.label).slice(0, 5), ["Vocabulary", "Word Match", "Reading Comprehension", "Games", "Listening Training"]);
    assert.equal(plan.at(-1).label, "Test Your Knowledge");
    assert.ok(!plan.some(section => /close reading/i.test(section.label)), name);
    assert.equal(new Set(plan.map(section => section.id)).size, plan.length, `${name}: unique ids`);
  }
});

test("grammar sections are numbered I, II, III … and named after the student's own topics", () => {
  const labels = name => buildLessonPlan(load(name)).filter(section => section.kind === "grammar").map(section => section.label);
  assert.deepEqual(labels("sabina"), ["Grammar I: Present Perfect", "Grammar II: Past Passive", "Grammar III: Present Perfect or Past Simple?"]);
  assert.deepEqual(labels("abay"), ["Grammar I: Gerunds and Infinitives", "Grammar II: Modal Verbs: Deduction and Obligation", "Grammar III: Mixed Review"]);
  assert.equal(labels("araylim_1").length, 5, "the number of grammar sections varies by student");
  assert.equal(labels("araylim_1")[4], "Grammar V: Present Perfect");
  assert.equal(roman(8), "IX");
});

test("each grammar section uses exercises of the right kind, scored on their own ids", () => {
  const content = load("sabina");
  const first = buildLessonPlan(content).find(section => section.kind === "grammar");
  assert.equal(first.id, 21);
  assert.deepEqual(first.exercises.map(exercise => [exercise.key, exercise.kind, exercise.scoreId]), [["g6", "complete", 210], ["sbPp", "build", 211]]);
  assert.equal(first.points, 20);
  assert.equal(exerciseKind(content.g6), "complete");
  assert.equal(exerciseKind(content.sbPs), "build");
  assert.equal(exerciseKind({ pos: [] }), null);
  assert.equal(exerciseScoreId(23, 0), 230);
});

test("scoring units, maximum score and done state", () => {
  const content = load("sabina");
  const plan = buildLessonPlan(content);
  const units = scoreUnits(plan);
  assert.ok(units.some(unit => unit.id === 210) && !units.some(unit => unit.id === 21), "grammar scores per exercise");
  assert.equal(planMaxScore(plan), 10 + 15 + 25 + 10 + 10 + 5 * 10 + 10);
  const grammar = plan.find(section => section.id === 21);
  assert.equal(sectionDone(grammar, "L", { L_210: true }), false);
  assert.equal(sectionDone(grammar, "L", { L_210: true, L_211: true }), true);
  assert.equal(sectionDone(plan.find(section => section.id === 10), "L", { L_10: true }), true);
});

test("navigation follows the plan order, and old stage numbers land somewhere sensible", () => {
  const plan = buildLessonPlan(load("george"));
  assert.equal(neighbours(plan, 3).next.kind, "games");
  assert.equal(neighbours(plan, 11).next.id, 21);
  assert.equal(neighbours(plan, 9).next, null);
  assert.equal(neighbours(plan, 1).previous, null);
  assert.equal(resolveSectionId(plan, 6), 21, "a v2 grammar stage opens the first grammar section");
  assert.equal(resolveSectionId(plan, 9), 9);
  assert.equal(resolveSectionId(plan, 99), 1);
  assert.equal(resolveSectionId(plan, 25), 1, "a grammar number the lesson does not have");
});

test("older content without topics still opens, and sections can be hidden", () => {
  const content = load("george"); delete content.grammar;
  assert.equal(grammarTopics(content).length, 5);
  const plan = buildLessonPlan(content, { listening: false, games: false });
  assert.ok(!plan.some(section => section.kind === "games" || section.kind === "listening"));
});

test("grammar topic validation", () => {
  const content = load("sabina");
  assert.deepEqual(validateGrammar(content), []);
  assert.match(validateGrammar({ ...content, grammar: [] }).join(), /at least one topic/);
  assert.match(validateGrammar({ ...content, grammar: [{ id: "Bad", title: "", exercises: [] }] }).join(" "), /id must be.*title is required.*rule.formula is required.*exercises must name/);
});
