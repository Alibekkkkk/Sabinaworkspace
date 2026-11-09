import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAdjustment, applyTransition, canTransition, clockWarnings, elapsedMs, emptyClock, formatDuration, INACTIVITY_MS,
  LONG_RUNNING_MS, normalizeClock, sectionElapsedMs, sectionProgress, serverNowFrom
} from "../js/lesson-clock.js";

const T0 = 1_800_000_000_000;
const SEC = 1000;
const MIN = 60 * SEC;

function run(steps) {
  let clock = emptyClock();
  for (const [action, at, options] of steps) {
    const result = applyTransition(clock, action, at, options);
    assert.equal(result.ok, true, `${action} at ${at} should be legal from ${clock.state}`);
    clock = result.clock;
  }
  return clock;
}

test("legal transitions: idle->running->paused->running->stopped", () => {
  assert.equal(canTransition("idle", "start"), true);
  assert.equal(canTransition("running", "pause"), true);
  assert.equal(canTransition("paused", "resume"), true);
  assert.equal(canTransition("running", "stop"), true);
  assert.equal(canTransition("paused", "stop"), true);
});

test("illegal transitions are rejected (every other state/action pair)", () => {
  const legal = new Set(["idle:start", "running:pause", "paused:resume", "running:stop", "paused:stop"]);
  for (const state of ["idle", "running", "paused", "stopped"]) {
    for (const action of ["start", "pause", "resume", "stop"]) {
      assert.equal(canTransition(state, action), legal.has(`${state}:${action}`), `${state} + ${action}`);
    }
  }
  assert.equal(canTransition("idle", "explode"), false);
  const stopped = run([["start", T0], ["stop", T0 + MIN]]);
  assert.deepEqual(applyTransition(stopped, "start", T0 + 2 * MIN), { ok: false, reason: "illegal" });
  assert.deepEqual(applyTransition(emptyClock(), "pause", T0), { ok: false, reason: "illegal" });
  assert.deepEqual(applyTransition(emptyClock(), "section", T0, { section: "grammar" }).ok, true);
  assert.deepEqual(applyTransition(stopped, "section", T0, { section: "grammar" }), { ok: false, reason: "illegal" });
});

test("revision conflicts: a stale writer loses, the right revision wins and bumps rev", () => {
  const clock = run([["start", T0]]);
  assert.equal(clock.rev, 1);
  assert.deepEqual(applyTransition(clock, "pause", T0 + SEC, { expectedRev: 0 }), { ok: false, reason: "conflict" });
  const ok = applyTransition(clock, "pause", T0 + SEC, { expectedRev: 1 });
  assert.equal(ok.ok, true);
  assert.equal(ok.clock.rev, 2);
});

test("elapsed time: idle is zero, running counts from the server timestamp, paused freezes", () => {
  assert.equal(elapsedMs(emptyClock(), T0), 0);
  const running = run([["start", T0]]);
  assert.equal(elapsedMs(running, T0 + 5 * SEC), 5 * SEC);
  assert.equal(elapsedMs(running, T0 + 90 * MIN), 90 * MIN);
  const paused = run([["start", T0], ["pause", T0 + 10 * SEC]]);
  assert.equal(elapsedMs(paused, T0 + 10 * SEC), 10 * SEC);
  assert.equal(elapsedMs(paused, T0 + 60 * MIN), 10 * SEC, "a paused clock never advances");
});

test("pause and resume sums: only running segments count", () => {
  const clock = run([["start", T0], ["pause", T0 + 10 * MIN], ["resume", T0 + 25 * MIN], ["pause", T0 + 30 * MIN], ["resume", T0 + 31 * MIN]]);
  assert.equal(elapsedMs(clock, T0 + 33 * MIN), 10 * MIN + 5 * MIN + 2 * MIN);
});

test("stop freezes totalMs forever and records stoppedAt", () => {
  const stopped = run([["start", T0], ["pause", T0 + 20 * MIN], ["resume", T0 + 22 * MIN], ["stop", T0 + 49 * MIN + 12 * SEC]]);
  assert.equal(stopped.state, "stopped");
  assert.equal(stopped.totalMs, 20 * MIN + 27 * MIN + 12 * SEC);
  assert.equal(stopped.stoppedAt, T0 + 49 * MIN + 12 * SEC);
  assert.equal(elapsedMs(stopped, T0 + 10 * 24 * 60 * MIN), stopped.totalMs);
  const stoppedFromPaused = run([["start", T0], ["pause", T0 + 5 * MIN], ["stop", T0 + 99 * MIN]]);
  assert.equal(stoppedFromPaused.totalMs, 5 * MIN, "stopping a paused clock does not add the paused gap");
});

test("section switching banks the active section in the same step", () => {
  const clock = run([["start", T0], ["section", T0 + 12 * MIN, { section: "grammar" }], ["section", T0 + 30 * MIN, { section: "reading" }], ["stop", T0 + 50 * MIN]]);
  assert.equal(clock.sections.vocabulary.accumulatedMs, 12 * MIN);
  assert.equal(clock.sections.grammar.accumulatedMs, 18 * MIN);
  assert.equal(clock.sections.reading.accumulatedMs, 20 * MIN);
  assert.equal(clock.totalMs, 50 * MIN);
  assert.equal(clock.currentSection, "reading");
});

test("section clocks pause with the lesson clock and resume on the same section", () => {
  const clock = run([["start", T0], ["pause", T0 + 4 * MIN], ["section", T0 + 6 * MIN, { section: "grammar" }], ["resume", T0 + 10 * MIN]]);
  assert.equal(sectionElapsedMs(clock, "vocabulary", T0 + 11 * MIN), 4 * MIN);
  assert.equal(sectionElapsedMs(clock, "grammar", T0 + 11 * MIN), 1 * MIN);
  assert.equal(elapsedMs(clock, T0 + 11 * MIN), 5 * MIN);
});

test("switching to the same section, an unknown shape or after stop is refused", () => {
  const clock = run([["start", T0]]);
  assert.equal(applyTransition(clock, "section", T0, { section: "vocabulary" }).reason, "unchanged");
  assert.equal(applyTransition(clock, "section", T0, { section: "Bad Section!" }).reason, "invalid-section");
  assert.equal(applyTransition(clock, "section", T0, { section: 42 }).reason, "invalid-section");
});

test("property: for 300 random legal histories the section times always add up to the total", () => {
  let seed = 12345;
  const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const sections = ["vocabulary", "grammar", "reading"];
  for (let trial = 0; trial < 300; trial++) {
    let clock = emptyClock();
    let now = T0;
    clock = applyTransition(clock, "start", now).clock;
    for (let step = 0; step < 12; step++) {
      now += Math.floor(random() * 9 * MIN) + 1;
      const options = ["pause", "resume", "section"].filter(action => action === "section" || canTransition(clock.state, action));
      const action = options[Math.floor(random() * options.length)];
      const result = applyTransition(clock, action, now, { section: sections[Math.floor(random() * 3)] });
      if (result.ok) clock = result.clock;
    }
    now += Math.floor(random() * 5 * MIN);
    const total = elapsedMs(clock, now);
    const bySection = sections.reduce((sum, id) => sum + sectionElapsedMs(clock, id, now), 0);
    assert.equal(bySection, total, `trial ${trial}`);
    const stopped = applyTransition(clock, "stop", now).clock;
    assert.equal(stopped.totalMs, total);
    assert.equal(sections.reduce((sum, id) => sum + (stopped.sections[id] ? stopped.sections[id].accumulatedMs : 0), 0), total);
  }
});

test("clock skew: the display is identical on devices whose own clocks are +-10 minutes off", () => {
  const trueNow = T0 + 25 * MIN;
  const clock = run([["start", T0 + 5 * MIN]]);
  const teacherDevice = { local: trueNow + 10 * MIN, offset: -10 * MIN };
  const studentDevice = { local: trueNow - 10 * MIN, offset: 10 * MIN };
  const a = elapsedMs(clock, serverNowFrom(teacherDevice.local, teacherDevice.offset));
  const b = elapsedMs(clock, serverNowFrom(studentDevice.local, studentDevice.offset));
  assert.equal(a, 20 * MIN);
  assert.ok(Math.abs(a - b) < 500);
});

test("tab sleep and refresh: the value depends only on server timestamps, so it jumps correctly", () => {
  const clock = run([["start", T0]]);
  const before = elapsedMs(clock, T0 + 10 * SEC);
  const afterSleep = elapsedMs(clock, T0 + 15 * MIN);
  assert.equal(before, 10 * SEC);
  assert.equal(afterSleep, 15 * MIN);
  assert.equal(elapsedMs(normalizeClock(JSON.parse(JSON.stringify(clock))), T0 + 15 * MIN), afterSleep, "survives serialisation (a refresh)");
});

test("a clock whose runningSince is in the future never shows negative time", () => {
  const clock = { ...emptyClock(), state: "running", runningSince: T0 + 5000, accumulatedMs: 1000 };
  assert.equal(elapsedMs(clock, T0), 1000);
});

test("adjustments change the total, never go below zero, and report the previous value", () => {
  const stopped = run([["start", T0], ["stop", T0 + 47 * MIN + 12 * SEC]]);
  const plus = applyAdjustment(stopped, 3 * MIN, T0 + 99 * MIN);
  assert.equal(plus.ok, true);
  assert.equal(plus.previousMs, 47 * MIN + 12 * SEC);
  assert.equal(plus.clock.totalMs, 50 * MIN + 12 * SEC);
  assert.equal(plus.clock.rev, stopped.rev + 1);
  assert.equal(applyAdjustment(stopped, -999 * MIN, T0).clock.totalMs, 0);
  assert.equal(applyAdjustment(stopped, 0, T0).reason, "invalid-delta");
  assert.equal(applyAdjustment(stopped, "x", T0).reason, "invalid-delta");
  const running = run([["start", T0]]);
  assert.equal(elapsedMs(applyAdjustment(running, -2 * MIN, T0 + 10 * MIN).clock, T0 + 10 * MIN), 8 * MIN);
});

test("duration formatting switches to h:mm:ss after an hour", () => {
  assert.equal(formatDuration(0), "00:00");
  assert.equal(formatDuration(59 * SEC + 999), "00:59");
  assert.equal(formatDuration(47 * MIN + 12 * SEC), "47:12");
  assert.equal(formatDuration(60 * MIN), "1:00:00");
  assert.equal(formatDuration(3 * 3600 * SEC + 5 * MIN + 9 * SEC), "3:05:09");
  assert.equal(formatDuration(-5), "00:00");
  assert.equal(formatDuration(undefined), "00:00");
});

test("section progress bands: ok, over at 100%, late beyond 120%", () => {
  assert.equal(sectionProgress(7 * MIN, 15).band, "ok");
  assert.equal(sectionProgress(15 * MIN, 15).band, "over");
  assert.equal(sectionProgress(17 * MIN, 15).band, "over");
  assert.equal(sectionProgress(18 * MIN + 1, 15).band, "late");
  assert.equal(sectionProgress(7 * MIN, 15).remainingMs, 8 * MIN);
  assert.equal(sectionProgress(20 * MIN, 15).remainingMs, 0);
  assert.equal(sectionProgress(5, 0).band, "ok");
});

test("teacher warnings: more than two hours, and fifteen quiet minutes, only while running", () => {
  const clock = run([["start", T0]]);
  assert.deepEqual(clockWarnings(clock, T0 + 10 * MIN, T0 + 9 * MIN), []);
  assert.deepEqual(clockWarnings(clock, T0 + LONG_RUNNING_MS + 1, T0 + LONG_RUNNING_MS).map(w => w.id), ["long"]);
  assert.deepEqual(clockWarnings(clock, T0 + 30 * MIN, T0 + 5 * MIN).map(w => w.id), ["inactive"]);
  assert.deepEqual(clockWarnings(clock, T0 + INACTIVITY_MS + 1, 0).map(w => w.id), ["inactive"], "no activity at all counts from the start");
  assert.deepEqual(clockWarnings(run([["start", T0], ["pause", T0 + MIN]]), T0 + 5 * LONG_RUNNING_MS, 0), []);
  assert.deepEqual(clockWarnings(emptyClock(), T0, 0), []);
});

test("normalizeClock repairs hostile or partial data", () => {
  assert.deepEqual(normalizeClock(undefined), emptyClock());
  const repaired = normalizeClock({ state: "exploded", accumulatedMs: -5, rev: "7", sections: "x", runningSince: "abc" });
  assert.equal(repaired.state, "idle");
  assert.equal(repaired.accumulatedMs, 0);
  assert.equal(repaired.rev, 7);
  assert.deepEqual(repaired.sections, {});
  assert.equal(repaired.runningSince, null);
});
