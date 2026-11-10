import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  checkApply, checkEvidence, checkLong, checkTfng, findSentenceIndex, passageSentences, rubricReport, taskKey, validateReadingTasks, visibleTasks, wordCount
} from "../js/reading-tasks.js";
import { lintContent } from "../scripts/lint-content.mjs";

const content = JSON.parse(readFileSync(fileURLToPath(new URL("../content/sabina.json", import.meta.url)), "utf8"));
const block = content.readingTasks;
const passage = content.readingHtml;
const clone = () => structuredClone(block);
const byType = type => block.tasks.filter(task => task.type === type);

test("the shipped reading tasks are valid, cover all four types and stay drafts", () => {
  assert.deepEqual(validateReadingTasks(block, passage), []);
  assert.equal(block.status, "draft");
  assert.deepEqual(new Set(block.tasks.map(task => task.type)), new Set(["tfng", "find", "long", "apply"]));
  assert.equal(new Set(block.tasks.map(task => taskKey(task.id))).size, block.tasks.length);
  assert.ok(block.tasks.every(task => taskKey(task.id).length <= 64));
  assert.deepEqual(lintContent("sabina.json", content).errors, []);
});

test("passage is split into labelled sentences; headings are skipped", () => {
  const sentences = passageSentences(passage);
  assert.equal(sentences.length, 32);
  assert.deepEqual([...new Set(sentences.map(sentence => sentence.para))], ["A", "B", "C", "D", "E", "F"]);
  assert.ok(!sentences.some(sentence => /Great Flood|natural disaster/i.test(sentence.text)));
  assert.equal(findSentenceIndex(sentences, "on the THIRD day,  the river overflowed."), 4, "case and spacing do not matter");
  assert.equal(findSentenceIndex(sentences, "The river overflowed."), -1);
  assert.deepEqual(passageSentences("<p>One. Two!</p><p>Three</p>").map(sentence => sentence.text), ["One.", "Two!", "Three"]);
  assert.deepEqual(passageSentences(""), []);
});

test("validator reports every structural problem in plain words", () => {
  const broken = clone();
  broken.status = "live";
  broken.tasks[0].answer = "Maybe";
  broken.tasks[1].evidence = "A sentence that is not in the passage.";
  delete broken.tasks[2].explanation;
  broken.tasks[2].evidence = "The council provided free food and water.";
  broken.tasks[3].evidence = "";
  broken.tasks[4].evidence = "Nope.";
  broken.tasks[5].rubric = [{ criterion: "only one", keywords: [["x"]] }];
  broken.tasks[5].wordGuide = { min: 30, max: 10 };
  broken.tasks[6].pattern = "(unclosed";
  broken.tasks[6].minSentences = 9;
  delete broken.tasks[6].structureHint;
  broken.tasks[4].id = broken.tasks[3].id;
  const text = validateReadingTasks(broken, passage).join("\n");
  for (const fragment of [
    'status must be "draft" or "approved"', "answer must be True, False or Not Given", "evidence sentence is not a sentence of the passage", "explanation is required",
    "has no evidence sentence", "evidence (the exact sentence to find) is required", "duplicate id", "rubric needs at least 2 criteria", "wordGuide needs whole numbers",
    "pattern must be a valid regular expression", "minSentences must be 1, 2 or 3", "structureHint is required"
  ]) assert.ok(text.includes(fragment), `missing: ${fragment}\n${text}`);
  const noEvidence = clone();
  noEvidence.tasks[0].evidence = "";
  assert.match(validateReadingTasks(noEvidence, passage).join(), /evidence .* is required for True and False/);
  assert.deepEqual(validateReadingTasks(null, passage), ["readingTasks must be an object."]);
  assert.match(validateReadingTasks({ status: "draft", tasks: [] }, passage).join(), /at least one task/);
});

test("validator checks that the model answers satisfy their own rubric and structure", () => {
  const broken = clone();
  const long = broken.tasks.find(task => task.type === "long");
  long.modelAnswer = "The council did many things for the town in the spring of that year, which was good.";
  const apply = broken.tasks.find(task => task.type === "apply");
  apply.modelAnswer = "It rained a lot last year. We stayed inside.";
  const text = validateReadingTasks(broken, passage).join("\n");
  assert.match(text, /does not meet its own criterion "The council told people to evacuate"/);
  assert.match(text, /model answer does not use the target structure/);
});

test("true/false/not given: the answer and then the evidence sentence are both graded", () => {
  const sentences = passageSentences(passage);
  const [first, second, notGiven] = byType("tfng");
  assert.equal(checkTfng(first, "True"), true);
  assert.equal(checkTfng(first, "False"), false);
  assert.equal(checkTfng(notGiven, "Not Given"), true);
  assert.equal(notGiven.evidence, undefined, "Not Given has nothing to quote");
  const proof = findSentenceIndex(sentences, second.evidence);
  assert.equal(checkEvidence(second, sentences, proof), true);
  assert.equal(checkEvidence(second, sentences, proof + 1), false, "a neighbouring sentence is not the proof");
  assert.equal(checkEvidence(second, sentences, 99), false);
});

test("find the sentence: only the exact sentence passes", () => {
  const sentences = passageSentences(passage);
  for (const task of byType("find")) {
    const right = findSentenceIndex(sentences, task.evidence);
    assert.ok(right >= 0);
    assert.equal(checkEvidence(task, sentences, right), true);
    assert.equal(sentences.filter(sentence => checkEvidence(task, sentences, sentence.index)).length, 1, "exactly one sentence is correct");
  }
});

test("long answer: rubric is advisory feedback, length and size gate sending", () => {
  const task = byType("long")[0];
  const model = checkLong(task, task.modelAnswer);
  assert.equal(model.ok, true);
  assert.equal(model.rubric.allMet, true);
  const partial = rubricReport(task, "The council told everyone to evacuate.");
  assert.deepEqual(partial.criteria.map(entry => entry.met), [true, false, false]);
  assert.equal(partial.metCount, 1);
  assert.equal(rubricReport(task, "They had free FOOD.").criteria[1].met, true, "case does not matter");
  assert.equal(rubricReport(task, "Foods are good.").criteria[1].met, true, "simple plurals count");
  assert.equal(rubricReport(task, "").metCount, 0);
  const short = checkLong(task, "The council helped.");
  assert.equal(short.ok, false);
  assert.match(short.problems.join(), /at least 15 words/);
  assert.match(checkLong(task, "word ".repeat(70)).problems.join(), /300 characters/);
  assert.equal(wordCount("It's a well-known fact."), 4);
  const phrase = { rubric: [{ criterion: "c", keywords: [["free food"]] }] };
  assert.equal(rubricReport(phrase, "They gave free food.").allMet, true);
  assert.equal(rubricReport(phrase, "They gave food that was free.").allMet, false, "a phrase must appear together");
});

test("application question: the target structure is required and its absence is explained", () => {
  const task = byType("apply")[0];
  assert.equal(checkApply(task, task.modelAnswer).ok, true);
  const missing = checkApply(task, "It rained a lot. We stayed inside.");
  assert.equal(missing.ok, false);
  assert.equal(missing.structureFound, false);
  assert.ok(missing.problems.includes(task.structureHint));
  assert.match(checkApply(task, "Floods have damaged many villages.").problems.join(), /at least 2 sentences/);
  assert.match(checkApply(task, `${task.modelAnswer} ${"x".repeat(300)}.`).problems.join(), /300 characters/);
  assert.equal(checkApply(task, "She has never visited. They have just left.").ok, true);
  assert.equal(checkApply(task, "").ok, false);
});

test("students see approved tasks only; the teacher sees drafts", () => {
  assert.deepEqual(visibleTasks(block, false), []);
  assert.equal(visibleTasks(block, true).length, block.tasks.length);
  const approved = { ...block, status: "approved" };
  assert.equal(visibleTasks(approved, false).length, block.tasks.length);
  assert.deepEqual(visibleTasks(null, true), []);
});
