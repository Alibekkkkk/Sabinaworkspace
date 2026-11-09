import assert from "node:assert/strict";
import test from "node:test";
import { buildEntries, clipSummary, comingUp, describe, facets, filterEntries, sortEntries, starsText, teacherRows } from "../js/clips/catalog.js";
import { completionRecord, linesOf, summarise } from "../js/clips/exercises.js";

const NOW = Date.parse("2026-11-09T10:00:00Z"); const DAY = 86400000;
const clip = (id, level, genre, grammar, extra = {}) => ({ id, title: `Clip ${id}`, level, genre, grammarPoints: grammar, startSeconds: 0, endSeconds: 45, source: { channel: "Chan" }, transcript: [{ id: "l1" }], exercises: [{ id: "e" }], timingVerified: false, ...extra });
const details = { a: clipSummary(clip("a", "B1", ["documentary"], ["past simple"])), b: clipSummary(clip("b", "A2", ["cartoon"], ["present simple", "past simple"], { timingVerified: true })), c: clipSummary(clip("c", "B2", ["film"], ["conditionals"])) };
const lessons = {
  l1: { title: "Lesson one", clipId: "a", order: 1, dueAt: NOW + 2 * DAY },
  l2: { title: "Lesson two", clipId: "b", order: 2 },
  l3: { title: "Lesson three", clipId: "c", order: 3, availableFrom: NOW + 7 * DAY },
  l4: { title: "No clip here", order: 4 },
  l5: { title: "Hidden", clipId: "a", order: 5, published: false }
};
const progress = { b: { completedAt: NOW - DAY, stars: 3, score: 9, total: 10, attempts: 2 } };

test("entries cover published clip lessons only, with status, due date and stars", () => {
  const entries = buildEntries(lessons, details, progress, NOW);
  assert.deepEqual(entries.map(entry => entry.lessonId).sort(), ["l1", "l2", "l3"]);
  const byId = Object.fromEntries(entries.map(entry => [entry.lessonId, entry]));
  assert.equal(byId.l1.status, "todo"); assert.equal(byId.l1.due.state, "due-soon"); assert.match(byId.l1.due.label, /Due in 2 days/);
  assert.equal(byId.l2.status, "done"); assert.equal(byId.l2.stars, 3); assert.equal(byId.l2.attempts, 2);
  assert.equal(byId.l3.status, "locked"); assert.equal(byId.l3.available, false);
  assert.deepEqual(buildEntries(null, details, progress, NOW), []);
});

test("a clip whose details could not be loaded still appears, under its lesson title", () => {
  const entries = buildEntries({ l1: lessons.l1 }, {}, {}, NOW);
  assert.equal(entries[0].detail, null); assert.equal(entries[0].title, "Lesson one");
  assert.equal(filterEntries(entries, {}).length, 1, "shown when no filter is set");
  assert.equal(filterEntries(entries, { level: "B1" }).length, 0, "hidden by a filter it cannot satisfy");
});

test("facets list the levels in CEFR order and the kinds and grammar points that exist", () => {
  const found = facets(buildEntries(lessons, details, progress, NOW));
  assert.deepEqual(found.levels, ["A2", "B1"], "the locked B2 clip is not offered as a filter");
  assert.deepEqual(found.genres, ["cartoon", "documentary"]); assert.deepEqual(found.grammar, ["past simple", "present simple"]);
  assert.deepEqual(facets([]), { levels: [], genres: [], grammar: [] });
});

test("filters combine, the status filter works, and locked clips never appear in the main list", () => {
  const entries = buildEntries(lessons, details, progress, NOW);
  const ids = filter => filterEntries(entries, filter).map(entry => entry.clipId).sort();
  assert.deepEqual(ids({}), ["a", "b"]);
  assert.deepEqual(ids({ level: "A2" }), ["b"]); assert.deepEqual(ids({ genre: "documentary" }), ["a"]); assert.deepEqual(ids({ grammar: "past simple" }), ["a", "b"]);
  assert.deepEqual(ids({ grammar: "past simple", level: "B1" }), ["a"]); assert.deepEqual(ids({ level: "C1" }), []);
  assert.deepEqual(ids({ status: "todo" }), ["a"]); assert.deepEqual(ids({ status: "done" }), ["b"]);
  assert.deepEqual(comingUp(entries).map(entry => entry.clipId), ["c"]);
});

test("sorting puts overdue and due-soon clips first, finished ones last", () => {
  const more = { ...lessons, l6: { title: "Late", clipId: "a", order: 6, dueAt: NOW - 2 * DAY }, l7: { title: "Today", clipId: "a", order: 7, dueAt: NOW + 3600000 } };
  const order = sortEntries(buildEntries(more, details, progress, NOW)).filter(entry => entry.available).map(entry => entry.lessonId);
  assert.deepEqual(order, ["l6", "l7", "l1", "l2"], "overdue, due today, due soon, then the finished one");
});

test("descriptions and stars are readable without colour", () => {
  assert.equal(starsText(3), "★★★"); assert.equal(starsText(1), "★☆☆"); assert.equal(starsText(9), "★★★"); assert.equal(starsText(-2), "☆☆☆"); assert.equal(starsText("x"), "☆☆☆");
  const entries = buildEntries(lessons, details, progress, NOW);
  assert.match(describe(entries.find(entry => entry.lessonId === "l2")), /A2 · cartoon · 45 seconds · done ★★★/);
});

test("the completion record is bounded, keeps the best stars and adds up attempts and time", () => {
  const c = clip("a", "B1", ["film"], ["x"], { timingVerified: true });
  const summary = { score: 7, total: 10, missedLines: ["l1", "l2", "l3", "l4", "l5", "l6", "l7", "l8", "l9", "l10"] };
  const first = completionRecord(c, summary, null, NOW, 120);
  assert.deepEqual([first.stars, first.lastStars, first.attempts, first.seconds, first.interactive], [2, 2, 1, 120, true]);
  assert.equal(first.weakLines.length, 8, "at most eight weak lines are stored");
  const again = completionRecord(c, { score: 10, total: 10, missedLines: [] }, first, NOW + 1, 60);
  assert.deepEqual([again.stars, again.lastStars, again.attempts, again.seconds], [3, 3, 2, 180]);
  const worse = completionRecord(c, { score: 1, total: 10, missedLines: ["l1"] }, again, NOW + 2, 30);
  assert.equal(worse.stars, 3, "a bad second try never takes stars away"); assert.equal(worse.lastStars, 1);
  const unscored = completionRecord(c, { score: 0, total: 0, missedLines: [] }, null, NOW, 5);
  assert.deepEqual([unscored.score, unscored.total, unscored.stars], [1, 1, 3], "a clip with only unscored activities still counts as done");
  assert.equal(completionRecord({ ...c, title: "x".repeat(200) }, summary, null, NOW, 1).title.length, 80);
  assert.equal(completionRecord(c, summary, null, NOW, 9e9).seconds, 86400, "time is capped at a day");
});

test("a missed exercise points at its lines", () => {
  assert.deepEqual(linesOf({ lineId: "a" }), ["a"]); assert.deepEqual(linesOf({ lineIds: ["a", "b"] }), ["a", "b"]); assert.deepEqual(linesOf({}), []);
  const c = { id: "x", title: "T", transcript: [{ id: "a", start: 0, end: 5, text: "Hello there friend." }, { id: "b", start: 5, end: 10, text: "Bye now." }], exercises: [{ id: "d", type: "dictation", prompt: "p", lineId: "a" }, { id: "o", type: "order-lines", prompt: "p", lineIds: ["a", "b", "a2"], answer: ["a", "b", "a2"] }] };
  assert.deepEqual(summarise(c, { d: "wrong", o: ["a", "b", "a2"] }).missedLines, ["a"]);
});

test("teacher rows show completion, weak lines, time and the words saved from each clip", () => {
  const record = { title: "Clip b", completedAt: NOW, stars: 2, score: 7, total: 10, attempts: 3, seconds: 400, weakLines: ["l1", "l3"], interactive: true };
  const rows = teacherRows(lessons, { b: record }, { w1: { word: "x", sourceClipId: "b" }, w2: { word: "y", sourceClipId: "b" }, w3: { word: "z", sourceClipId: "other" }, w4: { word: "q" } }, NOW);
  const b = rows.find(row => row.clipId === "b");
  assert.deepEqual([b.done, b.stars, b.score, b.total, b.attempts, b.minutes, b.words], [true, 2, 7, 10, 3, 7, 2]);
  assert.deepEqual(b.weakLines, ["l1", "l3"]);
  assert.equal(rows[rows.length - 1].clipId, "b", "finished clips sort last");
  assert.deepEqual(teacherRows({ l: { title: "t", clipId: "a" } }, {}, null, NOW)[0].weakLines, []);
  assert.deepEqual(teacherRows({ l: { title: "t", clipId: "a" } }, { a: { completedAt: 1, stars: 1, score: 1, total: 1, attempts: 1, weakLines: { 0: "x" } } }, {}, NOW)[0].weakLines, ["x"], "an object from the database works too");
});
