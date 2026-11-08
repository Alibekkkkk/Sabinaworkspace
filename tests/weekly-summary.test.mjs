import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import test from "node:test";

const source = readFileSync(fileURLToPath(new URL("../js/weekly-summary.js", import.meta.url)), "utf8");
const dashboard = readFileSync(fileURLToPath(new URL("../dashboard.html", import.meta.url)), "utf8");
const dashboardScript = readFileSync(fileURLToPath(new URL("../js/pages/dashboard.js", import.meta.url)), "utf8");
const serviceWorker = readFileSync(fileURLToPath(new URL("../sw.js", import.meta.url)), "utf8");

function createSummary(data) {
  const window = {};
  runInNewContext(source, { window, Date, Number, Object, Array, String });
  return window.createWeeklyProgressSummary(data);
}

test("weekly summary includes only recent practice and student activity", () => {
  const now = Date.parse("2026-11-04T12:00:00Z");
  const report = createSummary({
    studentName: "Sabina",
    studentCode: "SABINA",
    now,
    attempts: [
      { completedAt: new Date(now - 1000).toISOString(), score: 8, total: 10, timeSpentSeconds: 120 },
      { completedAt: new Date(now - 8 * 86400000).toISOString(), score: 1, total: 10, timeSpentSeconds: 60 },
      { completedAt: new Date(now + 1000).toISOString(), score: 0, total: 10, timeSpentSeconds: 10 }
    ],
    history: [
      { actor: "student", ts: now - 2000, detail: "Finished reading" },
      { actor: "teacher", ts: now - 3000, detail: "Reset progress" },
      { actor: "student", ts: now - 8 * 86400000, detail: "Old activity" }
    ],
    topics: {
      "Word order": { score: 2, total: 5 },
      "Vocabulary": { score: 9, total: 10 }
    },
    homework: { lesson1: { submitted: true, score: 14, total: 16 } },
    streak: 3
  });

  assert.match(report, /1 games completed, 80% average accuracy, 2 minutes tracked/);
  assert.match(report, /Current streak: 3 days/);
  assert.match(report, /Current homework status \(all assignments\):/);
  assert.match(report, /lesson1: submitted \(14\/16\)/);
  assert.match(report, /Topics to revisit \(based on all recorded practice\): Word order \(40%\)/);
  assert.match(report, /Finished reading/);
  assert.doesNotMatch(report, /Old activity|Reset progress/);
});

test("weekly summary handles empty records and requires a student code", () => {
  const now = Date.parse("2026-11-04T12:00:00Z");
  const report = createSummary({ studentCode: "S123", attempts: [], history: [], now });
  assert.match(report, /0 games completed/);
  assert.match(report, /No homework activity recorded/);
  assert.match(report, /No student activity recorded/);
  assert.throws(() => createSummary({ studentCode: "", now }), /Select a student/);
});

test("weekly summary strips control characters from user-authored activity", () => {
  const now = Date.now();
  const report = createSummary({
    studentCode: "S123",
    now,
    history: [{ actor: "student", ts: now, detail: "Done\nHomework\u0000Check" }]
  });
  assert.match(report, /Done Homework Check/);
});

test("teacher dashboard exposes and caches the private report workflow", () => {
  assert.match(dashboard, /js\/weekly-summary\.js/);
  assert.match(dashboard, /id="generateWeeklySummary"/);
  assert.match(dashboard, /id="downloadWeeklySummary"/);
  assert.match(dashboardScript, /window\.createWeeklyProgressSummary/);
  assert.match(serviceWorker, /"js\/weekly-summary\.js"/);
});
