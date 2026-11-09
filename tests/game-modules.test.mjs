import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createPracticeGames, createReviewGame, evaluateGame, validateGame } from "../js/games/engine.js";
import { HINT_XP_COST, applyRewards, xpForResult } from "../js/games/rewards.js";
import { MODULES, buildResult, moduleFor } from "../js/games/runtime.js";
import { closeMismatch, flipCard, memoryBoard, memoryPairCorrect } from "../js/games/types/pairs.js";
import { selectCell } from "../js/games/types/puzzles.js";
import { makeTiles, place, placedText, sentenceCorrect, takeBack } from "../js/games/types/tiles.js";
import { HANGMAN_LIVES, guessLetter, hangmanMask, hangmanState, hintLetter } from "../js/games/types/typed.js";

const sample = JSON.parse(readFileSync(new URL("../docs/games/sample-lesson.json", import.meta.url), "utf8"));
const games = createPracticeGames(sample, { seed: "t" });
const game = type => games.find(item => item.type === type);

test("all sixteen game types have an interactive module and the registry has no duplicates", () => {
  assert.equal(MODULES.length, 16);
  assert.equal(new Set(MODULES.map(module => module.TYPE || module.supports.toString())).size, 16);
  for (const item of games) assert.ok(moduleFor(item), item.type);
  assert.ok(moduleFor(createReviewGame([{ itemId: "a", prompt: "p", answer: "a", topic: "t" }])), "the review game too");
});

test("memory board: a match, a mismatch that closes again, moves and misses", () => {
  const pairs = [{ id: "a", prompt: "flood", answer: "water" }, { id: "b", prompt: "storm", answer: "wind" }];
  let state = memoryBoard(pairs); // order: flood, water, storm, wind
  let out = flipCard(state, 0); assert.equal(out.event, "first"); state = out.state;
  out = flipCard(state, 0); assert.equal(out.event, "ignored", "the same card twice does nothing");
  out = flipCard(state, 2); assert.equal(out.event, "mismatch"); state = out.state;
  assert.equal(state.moves, 1); assert.deepEqual(state.misses, { a: 1, b: 1 });
  assert.equal(flipCard(state, 3).event, "ignored", "a third card waits until the pair closes");
  state = closeMismatch(state); assert.equal(state.open.length, 0);
  state = flipCard(state, 0).state; out = flipCard(state, 1); assert.equal(out.event, "match"); state = out.state;
  assert.equal(state.matched, 1); assert.equal(flipCard(state, 0).event, "ignored", "matched cards stay put");
  assert.equal(memoryPairCorrect(state, "a"), true, "one wrong flip is forgiven");
  state = flipCard(state, 2).state; state = flipCard(state, 3).state;
  assert.equal(state.matched, 2); assert.equal(state.moves, 3);
  const careless = { ...state, misses: { a: 2 } }; assert.equal(memoryPairCorrect(careless, "a"), false, "two wrong flips send the pair to review");
  assert.equal(flipCard(state, 99).event, "ignored");
});

test("hangman: lives, repeats, mask, win, loss and hints", () => {
  const state = hangmanState("Flood");
  assert.equal(hangmanMask(state), "_ _ _ _ _");
  assert.equal(guessLetter(state, "o").event, "hit"); assert.equal(hangmanMask(state), "_ _ o o _");
  assert.equal(guessLetter(state, "o").event, "repeat");
  assert.equal(hintLetter(state), "f");
  for (const letter of "flod") guessLetter(state, letter);
  assert.equal(guessLetter(hangmanState("ab"), "a").event, "hit");
  const win = hangmanState("ab"); guessLetter(win, "a"); assert.equal(guessLetter(win, "b").event, "solved");
  const lose = hangmanState("ab"); let event = "";
  for (const letter of "cdefgh") event = guessLetter(lose, letter).event;
  assert.equal(lose.wrong, HANGMAN_LIVES); assert.equal(event, "lost");
  const spaced = hangmanState("ice cream"); assert.equal(hangmanMask(spaced), "_ _ _   _ _ _ _ _", "spaces and punctuation are shown, not guessed");
  assert.equal(hangmanState("").letters.length, 0);
});

test("a hint costs XP but never makes it negative", () => {
  assert.equal(xpForResult({ score: 3, total: 4, hints: 1 }), 30 - HINT_XP_COST);
  assert.equal(xpForResult({ score: 0, total: 4, hints: 5 }), 0);
  const withHints = applyRewards({}, { score: 2, total: 2, hints: 2 }, Date.parse("2026-11-09T10:00:00Z"));
  assert.equal(withHints.xp, 25 - 2 * HINT_XP_COST);
  const built = buildResult(game("hangman"), { answers: {}, hints: 3, noQueue: false }, 0, 1000);
  assert.equal(built.hints, 3);
  assert.equal(buildResult(game("hangman"), { answers: {}, hints: 999 }, 0, 1).hints, 50, "hints are bounded");
});

test("pronunciation is coaching: nothing is queued for review", () => {
  const built = buildResult(game("pronunciation"), { answers: {}, noQueue: true }, 0, 1000);
  assert.deepEqual(built.mistakes, []); assert.equal(built.coaching, true);
  assert.ok(buildResult(game("pronunciation"), { answers: {} }, 0, 1000).mistakes.length > 0, "the same game without the flag would queue its misses");
});

test("word search selection: finds words forwards and backwards, restarts, ignores nonsense", () => {
  const grid = [["F", "L", "O", "O", "D"], ["X", "X", "X", "X", "X"], ["S", "T", "O", "R", "M"]];
  const items = [{ id: "a", answer: "FLOOD" }, { id: "b", answer: "STORM" }];
  const found = new Set();
  let selected = []; let out;
  for (let col = 0; col < 5; col++) { out = selectCell(grid, items, found, selected, { row: 0, col }); selected = out.selected; if (col < 4) assert.equal(out.event, "growing"); }
  assert.equal(out.event, "found"); assert.equal(out.item.id, "a"); found.add("a"); assert.deepEqual(selected, []);
  selected = [];
  for (let col = 4; col >= 0; col--) { out = selectCell(grid, items, found, selected, { row: 2, col }); selected = out.selected; }
  assert.equal(out.event, "found"); assert.equal(out.item.id, "b", "a word spelled backwards counts");
  assert.equal(selectCell(grid, items, new Set(["a", "b"]), [], { row: 1, col: 1 }).event, "nothing");
  const fresh = new Set();
  const first = selectCell(grid, items, fresh, [], { row: 0, col: 0 }); assert.equal(first.event, "growing");
  const jump = selectCell(grid, items, fresh, first.selected, { row: 2, col: 4 });
  assert.equal(jump.event, "growing"); assert.equal(jump.selected.length, 1, "a cell that is not next to the last one starts a new selection");
  const restart = selectCell(grid, items, fresh, [{ row: 0, col: 0 }, { row: 0, col: 1 }], { row: 0, col: 3 });
  assert.equal(restart.event, "nothing", "a letter that cannot begin any word clears the selection");
  const bent = selectCell(grid, items, fresh, [{ row: 2, col: 0 }, { row: 2, col: 1 }], { row: 1, col: 2 });
  assert.notEqual(bent.event, "growing", "a bend breaks the line");
});

test("sentence builder: tiles, distractors, placing, taking back and checking", () => {
  const item = { id: "s", prompt: "p", answer: "The river has risen.", words: ["The", "river", "has", "risen."], distractors: ["have", "rise"] };
  const tiles = makeTiles(item, "seed");
  assert.equal(tiles.length, 6); assert.deepEqual(makeTiles(item, "seed"), tiles, "same seed, same order");
  const ids = word => tiles.find(tile => tile.text === word).id;
  let placed = [];
  for (const word of ["The", "river", "has", "risen."]) placed = place(placed, ids(word));
  assert.equal(placedText(tiles, placed), "The river has risen."); assert.equal(sentenceCorrect(item, tiles, placed), true);
  assert.deepEqual(place(placed, ids("The")), placed, "a tile cannot be placed twice");
  placed = takeBack(placed, ids("has")); assert.equal(sentenceCorrect(item, tiles, placed), false);
  placed = [ids("The"), ids("river"), ids("have"), ids("risen.")]; assert.equal(sentenceCorrect(item, tiles, placed), false, "a distractor in the sentence is wrong");
  assert.equal(sentenceCorrect({ ...item, answer: "the river has risen" }, tiles, [ids("The"), ids("river"), ids("has"), ids("risen.")]), true, "case and final punctuation are forgiven");
  validateGame(game("sentence-builder"));
});

test("typed games grade with the shared grader, including alternatives and typos in short answers", () => {
  const gap = game("fill-gap");
  assert.equal(evaluateGame(gap, { c1: "Has Flooded", c2: "arrived." }).score, 2);
  assert.equal(evaluateGame(gap, { c1: "has flood", c2: "" }).score, 0);
  assert.equal(evaluateGame(gap, {}).score, 0);
  const scramble = game("word-scramble");
  assert.ok(scramble.questions.every(item => item.scrambled !== item.answer && [...item.scrambled].sort().join("") === [...item.answer].sort().join("")), "scrambles are real anagrams");
  const hang = game("hangman"); assert.equal(evaluateGame(hang, Object.fromEntries(hang.questions.map(item => [item.id, item.answer]))).score, hang.questions.length);
});

test("review games grade typed answers and keep their review ids", () => {
  const review = createReviewGame([{ itemId: "q1", prompt: "Past of go?", answer: "went", topic: "Grammar" }]);
  const result = evaluateGame(review, { "review-1": "Went" });
  assert.equal(result.score, 1); assert.deepEqual(result.correctItemIds, ["q1"]);
});

test("a flashcards game scores what the learner said they knew", () => {
  const cards = game("flashcards");
  const answers = Object.fromEntries(cards.questions.map((item, i) => [item.id, i % 2 ? "" : item.answer]));
  assert.equal(evaluateGame(cards, answers).score, Math.ceil(cards.questions.length / 2));
});
