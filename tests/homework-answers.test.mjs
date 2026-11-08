import assert from "node:assert/strict";
import test from "node:test";
import { answerKey, migrateLegacyAnswerKeys } from "../js/homework-answers.js";

const questions = [
  { id: "homework_sabina.questions.001", type: "short" },
  { id: "homework_sabina.questions.002", type: "mcq" },
  { type: "tfng" }
];

test("answers are keyed by stable question id, mapped into the rules' key alphabet", () => {
  assert.equal(answerKey(questions[0], 0), "homework_sabina_questions_001");
  assert.match(answerKey(questions[1], 1), /^[A-Za-z0-9_-]{1,64}$/);
  assert.equal(answerKey(questions[2], 2), "q2");
  assert.equal(answerKey({ id: "x".repeat(200) }, 0).length, 64);
  assert.equal(answerKey({ id: "../../etc/passwd" }, 0), "______etc_passwd");
});

test("reordering questions keeps each answer attached to its own question", () => {
  const stored = { homework_sabina_questions_001: "first", homework_sabina_questions_002: "second" };
  const reordered = [questions[1], questions[0]];
  const migrated = migrateLegacyAnswerKeys(stored, reordered);
  assert.equal(migrated[answerKey(reordered[0], 0)], "second");
  assert.equal(migrated[answerKey(reordered[1], 1)], "first");
});

test("legacy index-keyed answers migrate to id keys without overwriting newer ones", () => {
  const stored = { 0: "old first", 1: "old second", homework_sabina_questions_002: "newer second" };
  const migrated = migrateLegacyAnswerKeys(stored, questions);
  assert.equal(migrated.homework_sabina_questions_001, "old first");
  assert.equal(migrated.homework_sabina_questions_002, "newer second");
  assert.equal(migrated[0], undefined);
  assert.equal(migrated[1], undefined);
  assert.deepEqual(stored, { 0: "old first", 1: "old second", homework_sabina_questions_002: "newer second" });
});

test("missing stored answers migrate to an empty record", () => {
  assert.deepEqual(migrateLegacyAnswerKeys(undefined, questions), {});
});
