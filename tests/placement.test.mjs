import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assessPlacement, PLACEMENT_QUESTIONS } from "../js/placement.js";

const read = path => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

test("placement questions use valid option indexes and produce stable score bands", () => {
  assert.equal(PLACEMENT_QUESTIONS.length, 12);
  for (const question of PLACEMENT_QUESTIONS) {
    assert.ok(question.options.length >= 2);
    assert.ok(question.answer >= 0 && question.answer < question.options.length);
  }

  assert.equal(assessPlacement({}).level, "A1");
  const scoreAnswers = correctCount => Object.fromEntries(
    PLACEMENT_QUESTIONS.map((question, index) => [
      `question-${index}`,
      index < correctCount ? question.answer : (question.answer + 1) % question.options.length
    ])
  );
  assert.equal(assessPlacement(scoreAnswers(3)).level, "A1");
  assert.equal(assessPlacement(scoreAnswers(4)).level, "A2");
  assert.equal(assessPlacement(scoreAnswers(7)).level, "B1");
  assert.equal(assessPlacement(scoreAnswers(10)).level, "B2");
  const correct = Object.fromEntries(PLACEMENT_QUESTIONS.map((question, index) => [`question-${index}`, question.answer]));
  assert.deepEqual(assessPlacement(correct), {
    score: 12,
    total: 12,
    level: "B2",
    title: "Upper-intermediate challenge",
    guidance: "Work on precision, complex sentence patterns, and nuanced vocabulary."
  });
});

test("placement check is self-contained, accessible, and does not persist responses", () => {
  const page = read("../placement.html");
  const renderer = read("../js/placement-page.js");
  assert.match(page, /Content-Security-Policy/);
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /placement\.css/);
  assert.match(renderer, /form\.reportValidity\(\)/);
  assert.doesNotMatch(renderer, /localStorage|sessionStorage|firebase/i);
  assert.match(page, /<script src="js\/pwa\.js" defer><\/script>/);
});
