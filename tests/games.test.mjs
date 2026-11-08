import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyGamification,
  createPracticeGames,
  createReviewGame,
  createVocabMatchGame,
  evaluateGame,
  normalizeAnswer,
  updateReviewQueue,
  validateGame
} from "../js/games/engine.js";
import {
  progressPath,
  saveGameProgress,
  saveVocabularyWord
} from "../js/games/progress.js";
import { appendBoundedRealtimeRecord } from "../js/bounded-realtime-list.js";

const content = {
  matchData: [
    { word: "flood", meaning: "water covering dry land" },
    { word: "drought", meaning: "a long period without rain" }
  ],
  testMcq: [
    { id: "quiz-1", q: "Which word means a storm?", correct: "hurricane", options: ["flood", "hurricane"] }
  ],
  testComplete: [{ id: "gap-1", p: "The city ___ (grow).", a: "has grown" }]
};

test("creates reusable games from the current lesson content format", () => {
  const games = createPracticeGames(content);
  assert.deepEqual(games.map(game => game.type), [
    "word-match",
    "memory-cards",
    "flashcards",
    "crossword",
    "word-search",
    "hangman",
    "word-scramble",
    "listening-dictation",
    "pronunciation",
    "speed-quiz",
    "boss-battle",
    "fill-gap"
  ]);
  assert.equal(games[0].pairs[0].prompt, "flood");
  games.forEach(validateGame);
  for (const type of ["crossword", "word-search"]) {
    const game = games.find(item => item.type === type);
    for (const question of game.questions) {
      const puzzleWord = question.cells.map(cell => game.grid[cell.row][cell.col]).join("");
      assert.equal(puzzleWord, question.answer);
    }
  }
});

test("builds sentence and story games from optional teacher-authored data", () => {
  const games = createPracticeGames({
    sbPp: { positive: [{ id: "sentence-1", prompt: "Build a sentence", correct: ["We", "learn", "English."] }] },
    storyChoices: [{
      id: "story-1",
      scene: "The bus is late. What should the student do?",
      choices: ["Check the timetable.", "Ignore the lesson.", "Break the bus."],
      correctChoice: "Check the timetable."
    }]
  });
  assert.deepEqual(games.map(game => game.type), ["sentence-builder", "story-choice"]);
  games.forEach(validateGame);
});

test("generated games validate across every current student lesson format", () => {
  const files = [
    "abay.json",
    "araylim_1.json",
    "araylim_2.json",
    "araylim_3.json",
    "gaziz.json",
    "george.json",
    "sabina.json"
  ];
  for (const file of files) {
    const lesson = JSON.parse(readFileSync(new URL(`../content/${file}`, import.meta.url), "utf8"));
    for (const game of createPracticeGames(lesson)) {
      assert.doesNotThrow(() => validateGame(game), `${file}: ${game.id}`);
    }
  }
});

test("validates game IDs, items, and answer options", () => {
  assert.throws(() => validateGame({ type: "unknown", id: "demo", questions: [] }), /Unsupported/);
  assert.throws(() => validateGame({
    type: "speed-quiz",
    id: "demo",
    questions: [{ id: "q", prompt: "Choose", answer: "A", options: ["B", "C"] }]
  }), /options/);
  assert.throws(() => createVocabMatchGame([{ word: "alone" }]), /at least one item/);
  assert.throws(() => validateGame({
    id: "crossword",
    type: "crossword",
    grid: [["A"], ["B", "C"]],
    questions: [{ id: "one", prompt: "Clue", answer: "A", cells: [{ row: 0, col: 0 }] }]
  }), /rectangular/);
});

test("normalizes punctuation and scores responses with review mistakes", () => {
  assert.equal(normalizeAnswer("  Hello,  World! "), "hello world");
  const result = evaluateGame(createVocabMatchGame(content.matchData), {
    "match-1": "Water covering dry land!",
    "match-2": "no rain"
  });
  assert.equal(result.score, 1);
  assert.equal(result.total, 2);
  assert.equal(result.mistakes[0].itemId, "match-2");
});

test("awards levels, streak freezes, quests, badges, and review queue", () => {
  const previous = {
    xp: 95,
    gems: 2,
    hearts: 3,
    streak: 4,
    streakFreezes: 1,
    lastActivityDate: "2026-11-02",
    badges: [],
    reviewQueue: []
  };
  const next = applyGamification(previous, {
    score: 2,
    total: 3,
    mistakes: [{ itemId: "q1", prompt: "Question", answer: "Answer", topic: "Grammar" }]
  }, Date.parse("2026-11-04T12:00:00Z"));
  assert.equal(next.xp, 115);
  assert.equal(next.level, 2);
  assert.equal(next.streak, 4);
  assert.equal(next.streakFreezes, 0);
  assert.equal(next.hearts, 2);
  assert.equal(next.daily.games, 1);
  assert.equal(next.daily.questComplete, true);
  assert.equal(next.reviewQueue.length, 1);
  assert.ok(next.badges.includes("first-level-up"));
});

test("rejects progress paths that are not student codes", () => {
  assert.equal(progressPath("a1234"), "studentProgress/A1234");
  assert.throws(() => progressPath("../other"), /verified student code/);
});

test("review games only include due items and reschedule by spaced intervals", () => {
  const now = Date.parse("2026-11-04T12:00:00Z");
  const queue = [
    { itemId: "due", prompt: "A question", answer: "An answer", dueAt: "2026-11-04T00:00:00Z" },
    { itemId: "later", prompt: "Later question", answer: "Later answer", dueAt: "2026-11-06T00:00:00Z" }
  ];
  const game = createReviewGame(queue, now);
  assert.equal(game.questions.length, 1);
  assert.equal(game.questions[0].reviewId, "due");
  const result = evaluateGame(game, { "review-1": "An answer" });
  const next = updateReviewQueue(queue, result, now);
  assert.equal(next.find(item => item.itemId === "due").intervalDays, 1);
  assert.equal(next.find(item => item.itemId === "later").intervalDays, undefined);
});

test("game progress bounds attempts, review items, and topic keys in the client write path", async () => {
  const values = new Map();
  const db = {
    ref(path) {
      return {
        async transaction(updateCurrent) {
          const current = values.get(path) || null;
          const next = updateCurrent(current);
          if (next === undefined) {
            return { committed: false, snapshot: { val: () => current } };
          }
          values.set(path, next);
          return { committed: true, snapshot: { val: () => next } };
        }
      };
    }
  };
  for (let index = 0; index < 105; index += 1) {
    await saveGameProgress({
      db,
      code: "A111111",
      game: { id: `game-${index}`, type: "fill-gap", title: `Topic ${index}` },
      result: {
        score: 0,
        total: 1,
        timeSpentSeconds: 1,
        mistakes: [{ itemId: `q-${index}`, prompt: "Prompt", answer: "Answer", topic: "Topic" }]
      },
      now: Date.UTC(2026, 0, index + 1)
    });
  }
  const progress = values.get("studentProgress/A111111");
  assert.equal(progress.attempts.length, 50);
  assert.equal(progress.reviewQueue.length, 100);
  assert.equal(Object.keys(progress.topics).length, 100);
});

test("saved vocabulary is capped at 500 entries in the client write path", async () => {
  const values = new Map();
  const db = {
    ref(path) {
      return {
        async transaction(updateCurrent) {
          const current = values.get(path) || null;
          const next = updateCurrent(current);
          if (next === undefined) return { committed: false, snapshot: { val: () => current } };
          values.set(path, next);
          return { committed: true, snapshot: { val: () => next } };
        }
      };
    }
  };
  for (let index = 0; index < 500; index += 1) {
    await saveVocabularyWord({
      db,
      code: "A111111",
      key: `word-${index}`,
      entry: { word: `word ${index}` }
    });
  }
  await assert.rejects(saveVocabularyWord({
    db,
    code: "A111111",
    key: "word-500",
    entry: { word: "word 500" }
  }), /deck is full/);
  assert.equal(Object.keys(values.get("studentProgress/A111111/vocabulary")).length, 500);
});

test("bounded activity append retains no more than the requested entries", async () => {
  let stored = {};
  let nextKey = 0;
  const reference = {
    push: () => ({ key: `record-${++nextKey}` }),
    async transaction(updateCurrent) {
      const next = updateCurrent(stored);
      if (next === undefined) return { committed: false, snapshot: { val: () => stored } };
      stored = next;
      return { committed: true, snapshot: { val: () => stored } };
    }
  };
  for (let index = 0; index < 5; index += 1) {
    await appendBoundedRealtimeRecord(reference, { ts: index + 1, type: "test" }, 3);
  }
  assert.deepEqual(Object.keys(stored), ["record-3", "record-4", "record-5"]);
  await assert.rejects(appendBoundedRealtimeRecord(reference, { ts: 6 }, 101), /between 1 and 100/);
});
