import assert from "node:assert/strict";
import test from "node:test";
import { buildClockCsv, classesInLastDays, classRows, CSV_COLUMNS, csvCell, lastClass, monthlyTotalSeconds } from "../js/clock-report.js";

const stopped = (totalMs, stoppedAt, extra = {}) => ({ state: "stopped", totalMs, startedAt: stoppedAt - totalMs, stoppedAt, sections: { vocabulary: { accumulatedMs: 600000 }, grammar: { accumulatedMs: 900000 }, reading: { accumulatedMs: totalMs - 1500000 } }, ...extra });
const NOW = Date.UTC(2026, 10, 15, 12);

test("only stopped clocks with a saved total become rows, newest first", () => {
  const rows = classRows("A1", {
    old: stopped(40 * 60000, Date.UTC(2026, 9, 31, 10)),
    recent: stopped(52 * 60000 + 8000, Date.UTC(2026, 10, 12, 10)),
    running: { state: "running", accumulatedMs: 5000 },
    broken: { state: "stopped" },
    nothing: null
  }, { recent: "Lesson 5" });
  assert.deepEqual(rows.map(row => row.lessonId), ["recent", "old"]);
  assert.equal(rows[0].durationSeconds, 52 * 60 + 8);
  assert.equal(rows[0].title, "Lesson 5");
  assert.equal(rows[1].title, "old", "falls back to the lesson id");
  assert.equal(lastClass(rows).lessonId, "recent");
  assert.equal(lastClass([]), null);
  assert.deepEqual(classRows("A1", undefined), []);
});

test("monthly total uses the calendar month of 'now' (UTC) and respects the boundaries", () => {
  const rows = classRows("A1", {
    a: stopped(30 * 60000, Date.UTC(2026, 10, 1, 0, 0, 0)),
    b: stopped(45 * 60000, Date.UTC(2026, 10, 14, 9)),
    c: stopped(50 * 60000, Date.UTC(2026, 9, 31, 23, 59, 59)),
    d: stopped(60 * 60000, Date.UTC(2026, 11, 1, 0, 0, 0))
  });
  assert.equal(monthlyTotalSeconds(rows, NOW), (30 + 45) * 60);
  assert.equal(monthlyTotalSeconds([], NOW), 0);
});

test("last-7-days window", () => {
  const rows = classRows("A1", { a: stopped(60000, NOW - 6 * 86400000), b: stopped(60000, NOW - 8 * 86400000), c: stopped(60000, NOW + 1000) });
  assert.deepEqual(classesInLastDays(rows, 7, NOW).map(row => row.lessonId), ["a"]);
});

test("CSV has a duration_seconds column, per-section seconds, quoting and ISO times", () => {
  const rows = classRows("A1", { lesson_1: stopped(52 * 60000 + 8000, Date.UTC(2026, 10, 12, 10)) }, { lesson_1: 'Weather, "storms" & floods' });
  const csv = buildClockCsv(rows);
  const [header, line] = csv.trim().split("\r\n");
  assert.equal(header, CSV_COLUMNS.join(","));
  assert.ok(header.split(",").includes("duration_seconds"));
  assert.match(line, /^A1,lesson_1,"Weather, ""storms"" & floods",3128,52:08,2026-11-12T09:07:52\.000Z,2026-11-12T10:00:00\.000Z,600,900,1628$/);
  assert.equal(buildClockCsv([]), `${CSV_COLUMNS.join(",")}\r\n`);
});

test("CSV cells that look like spreadsheet formulas are neutralised", () => {
  assert.equal(csvCell("=SUM(A1:A9)"), "'=SUM(A1:A9)");
  assert.equal(csvCell("+1"), "'+1");
  assert.equal(csvCell("-2"), "'-2");
  assert.equal(csvCell("@cmd"), "'@cmd");
  assert.equal(csvCell("normal"), "normal");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell("a\nb"), '"a\nb"');
  assert.equal(csvCell(0), "0");
});
