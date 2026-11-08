import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { isLessonVisibleTo } from "../js/audience.js";
import { barChart, sparkline } from "../js/charts.js";
import {
  createProgressTracker, IDLE_MS, ONLINE_MS, overdueHomework, presence, STUCK_AFTER_MS, studentStatus, todaySummary, trackProgress
} from "../js/dashboard-status.js";

const NOW = Date.UTC(2026, 0, 10, 12, 0, 0);

test("presence boundaries: online under 2 minutes, idle under 10, otherwise offline", () => {
  assert.equal(presence(NOW - 1000, NOW), "online");
  assert.equal(presence(NOW - ONLINE_MS + 1, NOW), "online");
  assert.equal(presence(NOW - ONLINE_MS, NOW), "idle");
  assert.equal(presence(NOW - IDLE_MS + 1, NOW), "idle");
  assert.equal(presence(NOW - IDLE_MS, NOW), "offline");
  assert.equal(presence(0, NOW), "offline");
  assert.equal(presence(undefined, NOW), "offline");
  assert.equal(presence(NOW + 5000, NOW), "online", "a slightly future timestamp (clock skew) counts as online");
});

test("stuck needs an online student whose stage, score and done count have not changed for 8 minutes", () => {
  const tracker = createProgressTracker();
  const meta = (extra = {}) => ({ stage: 3, score: 20, doneCount: 2, lastSeen: NOW, ...extra });
  trackProgress(tracker, "A", meta(), NOW - STUCK_AFTER_MS);
  assert.equal(studentStatus(tracker, "A", meta(), NOW), "stuck");
  assert.equal(studentStatus(tracker, "A", meta(), NOW - 1000), "online", "not yet 8 minutes");

  trackProgress(tracker, "A", meta({ score: 25 }), NOW);
  assert.equal(studentStatus(tracker, "A", meta({ score: 25 }), NOW), "online", "progress resets the clock");

  trackProgress(tracker, "B", meta(), NOW - STUCK_AFTER_MS * 2);
  assert.equal(studentStatus(tracker, "B", meta({ lastSeen: NOW - ONLINE_MS - 1000 }), NOW), "idle", "idle students are never labelled stuck");
  assert.equal(studentStatus(tracker, "B", meta({ lastSeen: NOW - IDLE_MS - 1000 }), NOW), "offline");
  assert.equal(studentStatus(tracker, "unknown", meta(), NOW), "online", "no history yet is not stuck");
});

test("trackProgress keeps the original timestamp while nothing changes", () => {
  const tracker = createProgressTracker();
  const first = trackProgress(tracker, "A", { stage: 1, score: 0, doneCount: 0 }, 1000);
  const second = trackProgress(tracker, "A", { stage: 1, score: 0, doneCount: 0 }, 9000);
  assert.equal(first.since, 1000);
  assert.equal(second.since, 1000);
  assert.equal(trackProgress(tracker, "A", { stage: 2, score: 0, doneCount: 0 }, 9500).since, 9500);
});

test("overdue homework: only visible, dated, past-due and unsubmitted items count", () => {
  const curriculum = {
    late: { homework: true, title: "Late task", dueAt: NOW - 1000, audience: "assigned", assignedTo: ["A"] },
    done: { homework: true, title: "Done task", dueAt: NOW - 1000, assignedTo: ["A"] },
    future: { homework: true, title: "Future", dueAt: NOW + 1000, assignedTo: ["A"] },
    undated: { homework: true, title: "Undated", assignedTo: ["A"] },
    other: { homework: true, title: "Someone else's", dueAt: NOW - 1000, assignedTo: ["B"] },
    classwork: { title: "Classwork", dueAt: NOW - 1000, assignedTo: ["A"] }
  };
  const result = overdueHomework(curriculum, "A", { done: { submitted: true } }, NOW, isLessonVisibleTo);
  assert.deepEqual(result.map(lesson => lesson.id), ["late"]);
});

test("today summary counts presence, stuck students and overdue homework, with reasons for the teacher", () => {
  const tracker = createProgressTracker();
  const metaByCode = {
    A: { stage: 3, score: 20, doneCount: 2, lastSeen: NOW - 5000 },
    B: { stage: 1, score: 0, doneCount: 0, lastSeen: NOW - 5 * 60 * 1000 },
    C: { stage: 2, score: 5, doneCount: 1, lastSeen: 0, homework: {} }
  };
  trackProgress(tracker, "A", metaByCode.A, NOW - STUCK_AFTER_MS - 1);
  const curriculum = { hw: { homework: true, title: "Essay", dueAt: NOW - 86400000, assignedTo: ["C"] } };
  const { counts, attention } = todaySummary({ codes: ["A", "B", "C"], metaByCode, tracker, curriculum, now: NOW, isVisible: isLessonVisibleTo });
  assert.deepEqual(counts, { online: 1, idle: 1, offline: 1, stuck: 1, overdue: 1 });
  assert.equal(attention.length, 2);
  assert.ok(attention.some(item => item.code === "A" && /need help/.test(item.reason)));
  assert.ok(attention.some(item => item.code === "C" && /Essay/.test(item.reason)));
});

function withDom(run) {
  const dom = new JSDOM("<!doctype html><body></body>");
  const previous = globalThis.document;
  Object.defineProperty(globalThis, "document", { value: dom.window.document, configurable: true });
  try { return run(); } finally { Object.defineProperty(globalThis, "document", { value: previous, configurable: true, writable: true }); }
}

test("bar chart: one labelled bar per item, clamped values, accessible title, text never parsed as markup", () => withDom(() => {
  const chart = barChart([{ label: "Past <b>simple</b>", value: 0.4 }, { label: "Modals", value: 7 }, { label: "Odd", value: -3 }], { title: "Topics" });
  assert.equal(chart.getAttribute("role"), "img");
  assert.equal(chart.getAttribute("aria-label"), "Topics");
  assert.equal(chart.querySelectorAll(".ds-chart__bar").length, 3);
  assert.equal(chart.querySelectorAll(".ds-chart__bar--low").length, 2);
  assert.deepEqual([...chart.querySelectorAll(".ds-chart__value")].map(node => node.textContent), ["40%", "100%", "0%"]);
  assert.equal(chart.querySelector("b"), null);
  assert.match(chart.querySelector(".ds-chart__label").textContent, /Past <b>simple/);
  assert.equal(barChart([], {}).querySelectorAll("rect").length, 0);
  assert.equal(barChart(undefined).querySelectorAll("rect").length, 0);
}));

test("sparkline: draws a line for two or more points, a single dot for one, nothing for none", () => withDom(() => {
  assert.equal(sparkline([0.2, 0.5, 0.9]).querySelectorAll("circle").length, 3);
  assert.ok(sparkline([0.2, 0.5, 0.9]).querySelector("polyline"));
  assert.equal(sparkline([0.5]).querySelector("polyline"), null);
  assert.equal(sparkline([0.5]).querySelectorAll("circle").length, 1);
  assert.equal(sparkline([]).querySelectorAll("circle").length, 0);
  assert.equal(sparkline([NaN, "x", 0.3]).querySelectorAll("circle").length, 1);
  assert.equal(sparkline(Array.from({ length: 80 }, () => 0.5)).querySelectorAll("circle").length, 30, "keeps the latest 30 points");
}));
