import assert from "node:assert/strict";
import test from "node:test";
import { accuracyTrend, listeningAttempts, summarizeListening, weakSentences, weakWords } from "../js/listening-summary.js";

const attempt = (score, total, day, gameType = "listening") => ({ gameId: "listening-x", gameType, score, total, timeSpentSeconds: 120, completedAt: `2026-11-${String(day).padStart(2, "0")}T10:00:00.000Z` });
const miss = (answer, topic = "Listening", prompt = `Listen and type the missing word: The ____ rose.`) => ({ itemId: `i-${answer}`, prompt, answer, topic });

test("only listening rounds count, oldest to newest, from an array or an object", () => {
  const progress = { attempts: [attempt(5, 10, 5), attempt(3, 4, 1, "word-match"), attempt(8, 10, 2), { gameType: "listening", total: 0, score: 0 }, null] };
  assert.deepEqual(listeningAttempts(progress).map(entry => entry.score), [8, 5]);
  assert.equal(listeningAttempts({ attempts: { 0: attempt(1, 2, 3) } }).length, 1, "Realtime Database may return an object");
  assert.deepEqual(listeningAttempts({}), []);
  assert.deepEqual(listeningAttempts(null), []);
});

test("accuracy trend: values per round and a direction only when there is enough data", () => {
  const rising = { attempts: [attempt(4, 10, 1), attempt(5, 10, 2), attempt(7, 10, 3), attempt(9, 10, 4)] };
  assert.deepEqual(accuracyTrend(rising).values, [0.4, 0.5, 0.7, 0.9]);
  assert.equal(accuracyTrend(rising).direction, "up");
  const falling = { attempts: [attempt(9, 10, 1), attempt(8, 10, 2), attempt(5, 10, 3), attempt(4, 10, 4)] };
  assert.equal(accuracyTrend(falling).direction, "down");
  const steady = { attempts: [attempt(7, 10, 1), attempt(7, 10, 2), attempt(7, 10, 3), attempt(7, 10, 4)] };
  assert.equal(accuracyTrend(steady).direction, "flat");
  assert.equal(accuracyTrend({ attempts: [attempt(1, 10, 1), attempt(9, 10, 2)] }).direction, "flat", "two rounds are not a trend");
  assert.equal(accuracyTrend({ attempts: [attempt(12, 10, 1)] }).values[0], 1, "never above 100%");
  const many = { attempts: Array.from({ length: 20 }, (_, index) => attempt(5, 10, index + 1)) };
  assert.equal(accuracyTrend(many).values.length, 12, "only the latest rounds");
  assert.deepEqual(accuracyTrend({}).values, []);
});

test("weak words: most often missed first, case-insensitive, with the sentence they were missed in", () => {
  const progress = { reviewQueue: [miss("River"), miss("river"), miss("flood", "Listening", "Listen and type the missing word: A ____ closed the road."), miss("river"), miss("storm", "Vocabulary"), miss(""), { topic: "Listening" }, null, miss("alpha"), miss("alpha")] };
  const words = weakWords(progress);
  assert.deepEqual(words.map(entry => [entry.word, entry.count]), [["river", 3], ["alpha", 2], ["flood", 1]]);
  assert.equal(words[2].example, "A ____ closed the road.", "the prefix is removed");
  assert.equal(weakWords(progress, 1).length, 1);
  assert.deepEqual(weakWords({ reviewQueue: { 0: miss("river") } }).map(entry => entry.word), ["river"]);
  assert.deepEqual(weakWords({}), []);
});

test("weak sentences: below 70% best accuracy, weakest first, with text when known", () => {
  const progress = { listening: { a: { attempts: 3, bestAccuracy: 0.5, lastAt: 5 }, b: { attempts: 1, bestAccuracy: 0.9, lastAt: 6 }, c: { attempts: 2, bestAccuracy: 0.2, lastAt: 7 }, d: { attempts: 0, bestAccuracy: 0, lastAt: 0 }, e: { attempts: 4, bestAccuracy: 0.5, lastAt: 8 } } };
  const result = weakSentences(progress, new Map([["c", "The river has flooded."]]));
  assert.deepEqual(result.map(entry => entry.id), ["c", "e", "a"]);
  assert.equal(result[0].text, "The river has flooded.");
  assert.equal(result[1].text, "");
  assert.equal(weakSentences(progress, new Map(), 2).length, 2);
  assert.deepEqual(weakSentences({}), []);
});

test("summary combines rounds, accuracy, practised and mastered sentences", () => {
  const progress = {
    attempts: [attempt(6, 10, 1), attempt(9, 10, 2)],
    listening: { a: { attempts: 2, bestAccuracy: 1, lastAt: 1 }, b: { attempts: 1, bestAccuracy: 0.4, lastAt: 2 }, c: { attempts: 1, bestAccuracy: 0.9, lastAt: 3 } },
    reviewQueue: [miss("river")]
  };
  const summary = summarizeListening(progress);
  assert.equal(summary.rounds, 2);
  assert.equal(summary.accuracy, 0.75);
  assert.equal(summary.minutes, 4);
  assert.equal(summary.sentencesPracticed, 3);
  assert.equal(summary.sentencesMastered, 2);
  assert.equal(summary.lastAt, Date.parse("2026-11-02T10:00:00.000Z"));
  assert.equal(summary.weakWords[0].word, "river");
  assert.equal(summary.weakSentences[0].id, "b");
  const empty = summarizeListening({});
  assert.deepEqual([empty.rounds, empty.accuracy, empty.minutes, empty.lastAt, empty.sentencesPracticed], [0, 0, 0, 0, 0]);
  assert.equal(summarizeListening(null).rounds, 0);
});
