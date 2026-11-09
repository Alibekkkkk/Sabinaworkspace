import assert from "node:assert/strict";
import test from "node:test";
import { accuracyBySkill, accuracyByTopic, classMostMissed, masteryCsv, recentPoints, skillOf, summarizeMastery, weakestItems } from "../js/games/mastery-summary.js";

const day = (offset, now = Date.parse("2026-11-09T12:00:00Z")) => new Date(now - offset * 86400000).toISOString();
const attempt = (gameType, score, total, offset = 0) => ({ gameType, gameId: gameType, score, total, timeSpentSeconds: 60, completedAt: day(offset) });
const miss = (id, prompt, topic = "Grammar") => ({ itemId: id, prompt, answer: "x", topic });

test("games are grouped into skills, with listening rounds counted as listening", () => {
  assert.equal(skillOf("error-hunt"), "grammar"); assert.equal(skillOf("listening"), "listening"); assert.equal(skillOf("mystery"), "other");
  const rows = accuracyBySkill({ attempts: [attempt("error-hunt", 2, 3), attempt("fill-gap", 4, 5), attempt("listening", 5, 10), { gameType: "fill-gap", total: 0 }, null] });
  assert.deepEqual(rows.map(row => [row.skill, row.games, row.score, row.total]), [["grammar", 2, 6, 8], ["listening", 1, 5, 10]]);
  assert.equal(rows[0].accuracy, 0.75);
  assert.deepEqual(accuracyBySkill({}), []);
  assert.deepEqual(accuracyBySkill({ attempts: { 0: attempt("hangman", 1, 2) } }).map(row => row.skill), ["spelling"], "an object from the database works too");
});

test("topics come back weakest first and empty ones are ignored", () => {
  const rows = accuracyByTopic({ topics: { a: { label: "Vocabulary", score: 9, total: 10, attempts: 2 }, b: { label: "Grammar", score: 3, total: 10, attempts: 1 }, c: { label: "Empty", score: 0, total: 0 } } });
  assert.deepEqual(rows.map(row => row.label), ["Grammar", "Vocabulary"]);
});

test("weakest items count repeats, cap at ten and cope with junk", () => {
  const queue = [miss("a", "Alpha?"), miss("a", "Alpha?"), miss("a", "Alpha?"), miss("b", "Beta?"), { prompt: 5 }, null, miss("", "No id")];
  const rows = weakestItems({ reviewQueue: queue });
  assert.deepEqual(rows.slice(0, 2).map(row => [row.itemId, row.misses]), [["a", 3], ["b", 1]]);
  assert.equal(weakestItems({ reviewQueue: Array.from({ length: 30 }, (_, i) => miss(`i${i}`, `Q${i}`)) }).length, 10);
  assert.deepEqual(weakestItems(null), []);
});

test("the seven day trend lines up days, includes empty days and ignores older games", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  const trend = recentPoints({ attempts: [attempt("fill-gap", 4, 5, 0), attempt("fill-gap", 3, 5, 0), attempt("fill-gap", 5, 5, 2), attempt("fill-gap", 9, 9, 20)] }, now);
  assert.equal(trend.length, 7);
  assert.equal(trend[6].day, "2026-11-09"); assert.equal(trend[6].score, 7); assert.equal(trend[6].games, 2);
  assert.equal(trend[4].score, 5);
  assert.equal(trend.reduce((sum, item) => sum + item.score, 0), 12);
});

test("the summary combines the pieces and never fails on an empty student", () => {
  const empty = summarizeMastery({});
  assert.equal(empty.games, 0); assert.equal(empty.accuracy, 0); assert.equal(empty.level, 1); assert.equal(summarizeMastery(null).games, 0);
  const full = summarizeMastery({ xp: 250, streak: 3, badges: ["first-game", "perfect-round"], attempts: [attempt("fill-gap", 3, 4), attempt("hangman", 1, 4)], reviewQueue: [miss("a", "A?")] }, Date.parse("2026-11-09T12:00:00Z"));
  assert.equal(full.games, 2); assert.equal(full.accuracy, 0.5); assert.equal(full.seconds, 120); assert.equal(full.level, 3); assert.equal(full.badges, 2); assert.ok(full.badgeTotal >= 20);
});

test("class view: items missed by more students come first, and the CSV quotes awkward text", () => {
  const one = { reviewQueue: [miss("a", "Alpha?"), miss("a", "Alpha?"), miss("b", "Beta, with a comma")] };
  const two = { reviewQueue: [miss("b", "Beta, with a comma")] };
  const three = { reviewQueue: [miss("b", "Beta, with a comma")] };
  assert.deepEqual(classMostMissed([one, two, three]).map(row => [row.itemId, row.students, row.misses]), [["b", 3, 3], ["a", 1, 2]]);
  const csv = masteryCsv([{ name: 'Anna "A"', code: "DEMOA001", summary: summarizeMastery({ xp: 10, attempts: [attempt("fill-gap", 1, 2)], reviewQueue: one.reviewQueue }) }]);
  const lines = csv.split("\n");
  assert.equal(lines[0].split(",")[0], "Student");
  assert.ok(lines[1].startsWith('"Anna ""A""",DEMOA001,1,50,1,10,'));
  assert.ok(lines[1].includes('"Alpha? | Beta, with a comma"') || lines[1].includes("Alpha?"));
});
