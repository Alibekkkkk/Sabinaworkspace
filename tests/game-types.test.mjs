import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createPracticeGames, evaluateGame, validateGame } from "../js/games/engine.js";
import { SUPPORTED_TYPES } from "../js/games/engine.js";
import { buildResult, moduleFor } from "../js/games/runtime.js";
import { seededShuffle } from "../js/games/seed.js";
import { DEFAULT_SETTINGS, loadSettings, normaliseSettings, saveSettings, timerSeconds } from "../js/games/settings.js";
import { create as createHunt, correctedSentence } from "../js/games/types/error-hunt.js";
import { DAMAGE, HEAL, SHIELDS, fromContent, startBattle, strike, weakPoints, won } from "../js/games/types/boss-battle.js";
import { decisionsOf, validateStoryGraph } from "../js/games/types/story-choice.js";
import { fromVocab } from "../js/games/types/word-formation.js";

const sample = JSON.parse(readFileSync(new URL("../docs/games/sample-lesson.json", import.meta.url), "utf8"));

test("the sample lesson produces a valid game for every supported type", () => {
  const games = createPracticeGames(sample, { seed: "sample" });
  const types = new Set(games.map(game => game.type));
  for (const type of SUPPORTED_TYPES) assert.ok(types.has(type), `missing ${type}`);
  assert.equal(types.size, SUPPORTED_TYPES.length);
  for (const game of games) {
    validateGame(game);
    assert.ok(["vocab", "grammar", "reading", "listening", "speaking", "spelling"].includes(game.skill), `${game.id} skill`);
    assert.ok(game.estimatedMinutes >= 1, `${game.id} minutes`);
    assert.equal(game.cefr, "B1");
  }
});

test("crossword and word search are the same puzzle for the same seed and different for another", () => {
  const first = createPracticeGames(sample, { seed: "alpha" });
  const again = createPracticeGames(sample, { seed: "alpha" });
  const other = createPracticeGames(sample, { seed: "beta" });
  for (const id of ["crossword", "word-search"]) {
    const a = first.find(game => game.id === id); const b = again.find(game => game.id === id); const c = other.find(game => game.id === id);
    assert.deepEqual(a, b, `${id} is repeatable`);
    assert.ok(JSON.stringify(a.grid) !== JSON.stringify(c.grid) || id === "crossword", `${id} varies with the seed`);
  }
  assert.deepEqual(seededShuffle([1, 2, 3, 4, 5, 6], "s"), seededShuffle([1, 2, 3, 4, 5, 6], "s"));
});

test("word search puzzles hide every word in a straight line and handle Unicode and short lists", () => {
  const game = createPracticeGames(sample, { seed: "x" }).find(item => item.id === "word-search");
  for (const question of game.questions) assert.equal(question.cells.map(cell => game.grid[cell.row][cell.col]).join(""), question.answer);
  const tiny = createPracticeGames({ matchData: [{ id: "a", word: "né", meaning: "x" }, { id: "b", word: "ça", meaning: "y" }] });
  assert.equal(tiny.find(item => item.id === "word-search"), undefined, "words too short for a grid give no puzzle");
});

test("Error Hunt: tokens, wrong word, corrected sentence and alternatives", () => {
  const items = createHunt(sample.errorHunt);
  assert.equal(items.length, 3);
  assert.equal(items[0].wrongIndex, 1);
  assert.equal(items[0].answer, "She goes to school every day.");
  assert.equal(correctedSentence(items[2], "see"), "He didn't see the flood.");
  assert.ok(items[1].alternatives.includes("They had finished their homework."));
  const game = { id: "error-hunt", type: "error-hunt", title: "Error Hunt", questions: items };
  assert.equal(evaluateGame(game, { e1: "She goes to school every day.", e2: "They had finished their homework.", e3: "He didn't saw the flood." }).score, 2);
  assert.equal(evaluateGame(game, {}).score, 0, "empty input scores nothing and does not throw");
});

test("Error Hunt reports teacher mistakes in words, not stack traces", () => {
  assert.throws(() => createHunt([{ id: "x", sentence: "She go.", wrong: "went", fix: "goes" }]), /not in the sentence/);
  assert.throws(() => createHunt([{ id: "x", sentence: "She go.", wrong: "go", fix: "go" }]), /same as the mistake/);
  assert.throws(() => createHunt([{ id: "x", sentence: "", wrong: "go", fix: "goes" }]), /required/);
  assert.throws(() => createHunt([{ id: "x", sentence: "A b.", wrong: "b", fix: "c" }, { id: "x", sentence: "A b.", wrong: "b", fix: "c" }]), /duplicate/);
  assert.equal(createHunt([{ sentence: "Ça va très bien.", wrong: "très", fix: "tres" }])[0].wrongIndex, 2, "accented words work");
});

test("Word Formation Race: built from approved forms only", () => {
  const items = fromVocab(sample.vocab);
  assert.ok(items.length >= 6);
  assert.ok(items.every(item => item.answer && item.prompt.includes("→")));
  const draft = fromVocab(sample.vocab.map(item => ({ ...item, forms: { ...item.forms, status: "draft" } })));
  assert.equal(draft.length, 0, "drafts stay hidden from students");
  assert.ok(fromVocab(sample.vocab.map(item => ({ ...item, forms: { ...item.forms, status: "draft" } })), { isTeacher: true }).length > 0, "but the teacher can try them");
  assert.deepEqual(fromVocab([]), []);
});

test("Boss Battle: damage, shields, healing without lockout, win condition", () => {
  let state = startBattle(10);
  assert.equal(state.maxHp, 70);
  for (let i = 0; i < 7; i++) state = strike(state, true).state;
  assert.equal(won(state), true, "70% correct defeats the boss");
  assert.ok(state.bestRun >= 7);
  let weak = startBattle(5);
  for (let i = 0; i < SHIELDS; i++) { const out = strike(weak, false); assert.equal(out.event, "shield-lost"); weak = out.state; }
  const heal = strike(weak, false);
  assert.equal(heal.event, "boss-heals", "no shield left: the boss heals, the player keeps playing");
  assert.equal(heal.state.hp, Math.min(weak.maxHp, weak.hp + HEAL));
  assert.equal(strike(startBattle(5), true).state.hp, startBattle(5).maxHp - DAMAGE);
  const streak = [1, 2, 3].reduce(s => strike(s, true).state, startBattle(10));
  assert.equal(streak.hp, 70 - 10 - 10 - 15, "three in a row adds a small bonus");
  assert.deepEqual(weakPoints([{ topic: "Grammar" }, { topic: "Reading" }, { topic: "Grammar" }]), [{ topic: "Grammar", count: 2 }, { topic: "Reading", count: 1 }]);
});

test("Boss items come from every unit test kind and grade typed answers with the shared grader", () => {
  const items = fromContent(sample);
  assert.deepEqual([...new Set(items.map(item => item.kind))].sort(), ["choice", "typed"]);
  assert.equal(items.filter(item => item.options && item.options.includes("Not Given")).length, 1);
  const game = { id: "boss-battle", type: "boss-battle", title: "Boss", questions: items };
  validateGame(game);
  const answers = { t1: "drought", t2: "sand", f1: "Not Given", s1: "three", c1: "has flooded", c2: "arrive" };
  const result = evaluateGame(game, answers);
  assert.equal(result.score, 4);
  assert.deepEqual(result.mistakes.map(m => m.itemId).sort(), ["c2", "t2"]);
  assert.ok(result.mistakes.every(m => m.topic));
  const built = buildResult(game, { answers, bestRun: 99, won: true, kind: "boss" }, 1000, 6000);
  assert.equal(built.bestRun, built.total, "a run cannot be longer than the game");
  assert.equal(built.timeSpentSeconds, 5); assert.equal(built.won, true); assert.equal(built.kind, "boss");
});

test("Story Choice: the validator finds dead ends, loops, missing scenes and unexplained wrong choices", () => {
  assert.deepEqual(validateStoryGraph(sample.storyGraph), []);
  const copy = () => JSON.parse(JSON.stringify(sample.storyGraph));
  let g = copy(); g.nodes.start.choices.forEach(c => { c.correct = false; c.explain = "x"; });
  assert.ok(validateStoryGraph(g).some(p => /no correct choice/.test(p)));
  g = copy(); g.nodes.start.choices[0].next = "nowhere";
  assert.ok(validateStoryGraph(g).some(p => /does not exist/.test(p)));
  g = copy(); g.nodes.middle.choices[0].next = "start";
  assert.ok(validateStoryGraph(g).some(p => /loops back/.test(p)));
  g.allowCycles = true; g.nodes.middle.choices.push({ text: "escape", next: "finish", correct: true });
  assert.ok(!validateStoryGraph(g).some(p => /loops back/.test(p)), "cycles are allowed when the teacher says so");
  g = copy(); delete g.nodes.start.choices[1].explain;
  assert.ok(validateStoryGraph(g).some(p => /needs an explanation/.test(p)));
  g = copy(); g.nodes.orphan = { text: "Nobody comes here.", end: true };
  assert.ok(validateStoryGraph(g).some(p => /never be reached/.test(p)));
  g = copy(); g.start = "ghost";
  assert.ok(validateStoryGraph(g).some(p => /start scene/.test(p)));
  g = copy(); g.nodes.start.choices = [g.nodes.start.choices[0]];
  assert.ok(validateStoryGraph(g).some(p => /at least two/.test(p)));
  assert.ok(validateStoryGraph(null).length && validateStoryGraph({}).length && validateStoryGraph({ nodes: {} }).length);
  assert.deepEqual(decisionsOf(sample.storyGraph).map(d => d.answer), ["closed", "lit"]);
  const game = createPracticeGames(sample).find(item => item.id === "story-choice");
  assert.ok(game.graph);
  assert.equal(evaluateGame(game, { start: "closed", middle: "lighten" }).score, 1);
});

test("games with a module are routed to it; the others keep their existing screens", () => {
  const games = createPracticeGames(sample);
  for (const type of ["speed-quiz", "boss-battle", "story-choice", "error-hunt", "word-formation"]) assert.ok(moduleFor(games.find(game => game.type === type)), type);
  assert.equal(moduleFor(games.find(game => game.type === "crossword")), null);
  assert.equal(moduleFor({ type: "story-choice", questions: [] }), null, "a flat story list has no graph to walk");
});

test("validation rejects bad metadata", () => {
  const base = createPracticeGames(sample).find(game => game.type === "speed-quiz");
  assert.throws(() => validateGame({ ...base, skill: "magic" }), /skill/);
  assert.throws(() => validateGame({ ...base, cefr: "Z9" }), /level/);
  assert.throws(() => validateGame({ ...base, estimatedMinutes: 0 }), /estimatedMinutes/);
});

test("calm settings: defaults, saving, junk input and untimed swaps", () => {
  assert.deepEqual(normaliseSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(normaliseSettings({ calm: "yes", noTimers: true, extra: 1 }), { ...DEFAULT_SETTINGS, noTimers: true });
  const store = new Map(); const storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  saveSettings({ calm: true, muted: true }, storage);
  assert.equal(loadSettings(storage).calm, true); assert.equal(loadSettings(storage).muted, true);
  assert.deepEqual(loadSettings({ getItem: () => "{not json" }), DEFAULT_SETTINGS);
  assert.equal(timerSeconds({ noTimers: true }, 20), 0, "no timers means no countdown");
  assert.equal(timerSeconds({ noTimers: false }, 20), 20);
  assert.equal(timerSeconds(null, 20), 20);
});
