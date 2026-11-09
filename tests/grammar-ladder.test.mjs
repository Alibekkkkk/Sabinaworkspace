import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  assembleTiles, checkBuild, checkNotice, checkProduce, checkTyped, countSentences, ladderKey, ladderProgress, LADDER_STEPS,
  noticeTargetIndexes, noticeTokens, tokenizeSentence, validateLadder
} from "../js/grammar-ladder.js";
import { lintContent } from "../scripts/lint-content.mjs";

const content = JSON.parse(readFileSync(fileURLToPath(new URL("../content/sabina.json", import.meta.url)), "utf8"));
const ladder = content.grammarLadder;
const clone = () => structuredClone(ladder);

test("the shipped ladder is valid and has all six steps", () => {
  assert.deepEqual(validateLadder(ladder), []);
  assert.ok(["draft", "approved"].includes(ladder.status));
  assert.deepEqual(LADDER_STEPS, ["notice", "complete", "build", "correct", "transform", "produce"]);
  const ids = [ladder.notice.id, ...["complete", "build", "correct", "transform"].flatMap(step => ladder[step].map(item => item.id)), ladder.produce.id];
  assert.equal(new Set(ids.map(ladderKey)).size, ids.length, "ids stay unique after mapping to database keys");
  for (const id of ids) assert.ok(ladderKey(id).length <= 64 && /^[A-Za-z0-9_-]+$/.test(ladderKey(id)), id);
});

test("validator: every structural problem is reported in plain words", () => {
  const broken = clone();
  broken.status = "live";
  delete broken.rule.l1Errors;
  broken.rule.examples = [{ en: "one only" }];
  broken.notice.targets = ["has never happened"];
  broken.complete = broken.complete.slice(0, 2);
  broken.build[0].tiles = ["The", "river", "has", "flooded", "two", "streets", "."];
  broken.build[1].tiles = ["Have", "you", "ever", "seen", "a", "tornado", "?", "a", "b", "c", "d"];
  broken.correct[0].answers = ["She has went to the shelter."];
  delete broken.correct[1].explanation;
  broken.transform[0].given = "";
  broken.transform[1].id = broken.transform[0].id;
  broken.produce.minSentences = 7;
  broken.produce.checklist = ["only one"];
  broken.produce.pattern = "(unclosed";
  const text = validateLadder(broken).join("\n");
  for (const fragment of [
    'status must be "draft" or "approved"', "rule.l1Errors needs", "rule.examples needs at least 2", 'target "has never happened" does not appear',
    "complete: needs at least 3 items", "use 1 to 3 distractor tiles (found 0)", "use 1 to 3 distractor tiles (found 4)", "also an accepted answer",
    "explanation is required", "given (the sentence to rewrite) is required", "duplicate id", "minSentences must be 1, 2 or 3", "checklist needs at least 2", "pattern must be a valid regular expression"
  ]) assert.ok(text.includes(fragment), `missing: ${fragment}\n${text}`);
  assert.deepEqual(validateLadder(null), ["grammarLadder must be an object."]);
  const missingTile = clone();
  missingTile.build[0].tiles = missingTile.build[0].tiles.filter(tile => tile !== "flooded");
  assert.match(validateLadder(missingTile).join(), /tiles are missing "flooded"/);
});

test("notice: whole structure must be tapped, missing and extra words are reported", () => {
  const { notice } = ladder;
  const target = [...noticeTargetIndexes(notice.text, notice.targets)].sort((a, b) => a - b);
  const tokens = noticeTokens(notice.text);
  assert.deepEqual(target.map(index => tokens[index].replace(/[.,]/g, "")), ["has", "fallen", "has", "flooded", "has", "been", "hurt"]);
  assert.equal(checkNotice(notice, target).ok, true);
  assert.equal(checkNotice(notice, [...target].reverse()).ok, true, "tap order does not matter");
  const missing = checkNotice(notice, target.slice(1));
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.missed, [target[0]]);
  const extra = checkNotice(notice, [...target, tokens.indexOf("destroyed")]);
  assert.equal(extra.ok, false);
  assert.equal(extra.extra.length, 1);
  assert.equal(checkNotice(notice, []).ok, false);
  assert.equal(noticeTargetIndexes("a b c", ["zzz"]).size, 0);
  assert.equal(noticeTargetIndexes("It has rained. It has rained!", ["has rained"]).size, 4, "every occurrence counts, punctuation is ignored");
});

test("typed steps: every accepted answer passes, the wrong forms learners really write fail", () => {
  for (const step of ["complete", "correct", "transform"]) {
    for (const item of ladder[step]) {
      for (const answer of item.answers) assert.equal(checkTyped(item, answer), true, `${item.id}: ${answer}`);
      assert.equal(checkTyped(item, ""), false);
      assert.equal(checkTyped(item, "   "), false);
    }
  }
  const complete = Object.fromEntries(ladder.complete.map(item => [item.id, item]));
  assert.equal(checkTyped(complete["sabina.ladder.complete.001"], "has visit"), false);
  assert.equal(checkTyped(complete["sabina.ladder.complete.001"], "have visited"), false, "wrong auxiliary");
  assert.equal(checkTyped(complete["sabina.ladder.complete.001"], "visited"), false, "no auxiliary");
  assert.equal(checkTyped(complete["sabina.ladder.complete.002"], "have not left"), true);
  assert.equal(checkTyped(complete["sabina.ladder.complete.002"], "haven't left"), true);
  assert.equal(checkTyped(complete["sabina.ladder.complete.002"], "have left"), false, "dropped negation");
  assert.equal(checkTyped(complete["sabina.ladder.complete.003"], "have you ever seen"), true, "capitals do not matter when typing");
  assert.equal(checkTyped(complete["sabina.ladder.complete.003"], "Have you ever saw"), false);
});

test("correct: the sentence containing the error is never accepted as the answer", () => {
  for (const item of ladder.correct) assert.equal(checkTyped(item, item.sentence), false, item.id);
  assert.equal(checkTyped(ladder.correct[0], "She has gone to the shelter"), true, "a missing final full stop is forgiven");
  assert.equal(checkTyped(ladder.correct[0], "She went to the shelter."), false, "changing the tense instead of fixing it is not the target");
});

test("build: tiles must form an accepted answer exactly, including capitals and punctuation", () => {
  for (const item of ladder.build) {
    const tokens = tokenizeSentence(item.answers[0]);
    assert.equal(checkBuild(item, tokens), true, item.id);
    assert.equal(assembleTiles(tokens), item.answers[0]);
    assert.equal(checkBuild(item, [...tokens].reverse()), false);
    assert.equal(checkBuild(item, tokens.slice(0, -1)), false, "missing the final punctuation tile");
    assert.equal(checkBuild(item, []), false);
  }
  const first = ladder.build[0];
  const lower = tokenizeSentence(first.answers[0]).map((token, index) => (index === 0 ? token.toLowerCase() : token));
  assert.equal(checkBuild(first, lower), false, "a missing capital letter is wrong here");
  const withDistractor = tokenizeSentence(first.answers[0]);
  withDistractor.splice(3, 0, "have");
  assert.equal(checkBuild(first, withDistractor), false, "using a distractor tile is wrong");
  assert.equal(assembleTiles(["Hi", ",", "you", "?"]), "Hi, you?");
  assert.deepEqual(tokenizeSentence("We haven't heard."), ["We", "haven't", "heard", "."]);
});

test("produce: counts sentences, enforces the checklist and length, and only warns about the target structure", () => {
  const item = ladder.produce;
  const good = "The rain has caused a lot of damage. Many families have left their homes.";
  assert.equal(countSentences(good), 2);
  assert.equal(countSentences("no end punctuation here"), 0);
  assert.equal(countSentences("One. Two! Three?"), 3);
  assert.equal(countSentences("... ?!"), 0);
  assert.deepEqual(checkProduce(item, good, 3), { ok: true, problems: [], sentences: 2, patternFound: true });
  assert.match(checkProduce(item, "Only one sentence.", 3).problems.join(), /at least 2 sentences/);
  assert.match(checkProduce(item, good, 2).problems.join(), /Tick every item/);
  assert.match(checkProduce(item, `${good} ${"x".repeat(300)}.`, 3).problems.join(), /300 characters/);
  const noStructure = checkProduce(item, "It rained a lot. We stayed inside.", 3);
  assert.equal(noStructure.ok, true, "a missing structure is a hint, not a block");
  assert.equal(noStructure.patternFound, false);
  assert.equal(checkProduce({ ...item, pattern: undefined }, good, 3).patternFound, true);
});

test("progress: steps unlock one after another and complete only when every item is done", () => {
  const all = {};
  const first = ladderProgress(ladder, all);
  assert.deepEqual(first.steps.map(step => step.unlocked), [true, false, false, false, false, false]);
  assert.equal(first.completeSteps, 0);
  all[ladder.notice.id] = true;
  const second = ladderProgress(ladder, all);
  assert.deepEqual(second.steps.map(step => step.unlocked), [true, true, false, false, false, false]);
  ladder.complete.slice(0, 2).forEach(item => { all[item.id] = true; });
  assert.equal(ladderProgress(ladder, all).steps[1].complete, false, "2 of 5 is not complete");
  assert.equal(ladderProgress(ladder, all).steps[2].unlocked, false);
  for (const step of ["complete", "build", "correct", "transform"]) ladder[step].forEach(item => { all[item.id] = true; });
  all[ladder.produce.id] = true;
  const done = ladderProgress(ladder, all);
  assert.equal(done.complete, true);
  assert.equal(done.completeSteps, 6);
  assert.equal(ladderProgress(ladder, undefined).completeSteps, 0);
});

test("the content linter validates the ladder and ignores lessons without one", () => {
  const result = lintContent("sabina.json", content);
  assert.deepEqual(result.errors, []);
  const broken = structuredClone(content);
  broken.grammarLadder.complete = [];
  assert.ok(lintContent("sabina.json", broken).errors.some(message => /complete: needs at least 3 items/.test(message)));
  const without = structuredClone(content);
  delete without.grammarLadder;
  assert.deepEqual(lintContent("x.json", without).errors, []);
});
