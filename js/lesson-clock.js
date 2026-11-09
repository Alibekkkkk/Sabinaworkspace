// Lesson clock: a teacher-controlled stopwatch shared by teacher and student, stored in
// lessonClock/<code>/<lessonId>. Pure functions only (no Firebase) so the rules and the maths can be
// tested exhaustively. Time is always computed from server timestamps plus the client's measured
// offset to the server clock, never from the local clock alone.
export const CLOCK_STATES = Object.freeze(["idle", "running", "paused", "stopped"]);
export const DEFAULT_SECTIONS = Object.freeze(["vocabulary", "grammar", "reading"]);

const TRANSITIONS = Object.freeze({
  start: { from: ["idle"], to: "running" },
  pause: { from: ["running"], to: "paused" },
  resume: { from: ["paused"], to: "running" },
  stop: { from: ["running", "paused"], to: "stopped" }
});

export function emptyClock(currentSection = "vocabulary") {
  return { state: "idle", accumulatedMs: 0, runningSince: null, startedAt: null, stoppedAt: null, totalMs: null, currentSection, sections: {}, rev: 0 };
}

export function normalizeClock(value) {
  const clock = value && typeof value === "object" ? value : {};
  const base = emptyClock(typeof clock.currentSection === "string" ? clock.currentSection : "vocabulary");
  return {
    ...base,
    state: CLOCK_STATES.includes(clock.state) ? clock.state : "idle",
    accumulatedMs: Math.max(0, Number(clock.accumulatedMs) || 0),
    runningSince: Number.isFinite(Number(clock.runningSince)) && clock.runningSince !== null ? Number(clock.runningSince) : null,
    startedAt: Number.isFinite(Number(clock.startedAt)) && clock.startedAt !== null ? Number(clock.startedAt) : null,
    stoppedAt: Number.isFinite(Number(clock.stoppedAt)) && clock.stoppedAt !== null ? Number(clock.stoppedAt) : null,
    totalMs: Number.isFinite(Number(clock.totalMs)) && clock.totalMs !== null ? Number(clock.totalMs) : null,
    sections: clock.sections && typeof clock.sections === "object" ? clock.sections : {},
    rev: Math.max(0, Math.floor(Number(clock.rev) || 0))
  };
}

// Elapsed milliseconds right now. `serverNow` should be Date.now() + serverTimeOffset.
export function elapsedMs(clockValue, serverNow) {
  const clock = normalizeClock(clockValue);
  if (clock.state === "stopped" && clock.totalMs !== null) return clock.totalMs;
  if (clock.state === "running" && clock.runningSince !== null) return clock.accumulatedMs + Math.max(0, serverNow - clock.runningSince);
  return clock.accumulatedMs;
}

export function sectionElapsedMs(clockValue, sectionId, serverNow) {
  const clock = normalizeClock(clockValue);
  const section = clock.sections[sectionId] || {};
  let total = Math.max(0, Number(section.accumulatedMs) || 0);
  if (clock.state === "running" && clock.currentSection === sectionId && clock.runningSince !== null) {
    total += Math.max(0, serverNow - Math.max(clock.runningSince, Number(section.runningSince) || clock.runningSince));
  }
  return total;
}

export function canTransition(state, action) {
  const rule = TRANSITIONS[action];
  return Boolean(rule) && rule.from.includes(state);
}

// Returns { ok, clock } or { ok: false, reason }. `now` is the server time of the transition.
// `expectedRev` implements optimistic concurrency: the caller read revision N and wants to write N+1.
export function applyTransition(clockValue, action, now, { expectedRev, section } = {}) {
  const clock = normalizeClock(clockValue);
  if (expectedRev !== undefined && expectedRev !== clock.rev) return { ok: false, reason: "conflict" };
  if (action === "section") {
    if (clock.state === "stopped") return { ok: false, reason: "illegal" };
    if (typeof section !== "string" || !/^[a-z0-9_-]{1,32}$/.test(section)) return { ok: false, reason: "invalid-section" };
    if (section === clock.currentSection) return { ok: false, reason: "unchanged" };
    return { ok: true, clock: switchSection(clock, section, now) };
  }
  if (!canTransition(clock.state, action)) return { ok: false, reason: "illegal" };
  const rule = TRANSITIONS[action];
  const next = { ...clock, sections: { ...clock.sections }, state: rule.to, rev: clock.rev + 1 };
  const running = clock.state === "running";
  const segment = running && clock.runningSince !== null ? Math.max(0, now - clock.runningSince) : 0;

  if (action === "start") {
    next.startedAt = now;
    next.runningSince = now;
    next.sections[next.currentSection] = { accumulatedMs: bank(next.sections[next.currentSection], 0), runningSince: now };
  } else if (action === "resume") {
    next.runningSince = now;
    next.sections[next.currentSection] = { accumulatedMs: bank(next.sections[next.currentSection], 0), runningSince: now };
  } else {
    // pause and stop both end the current run segment
    next.accumulatedMs = clock.accumulatedMs + segment;
    next.runningSince = null;
    if (running) next.sections[next.currentSection] = { accumulatedMs: bank(next.sections[next.currentSection], segmentFor(clock, now)), runningSince: null };
    if (action === "stop") {
      next.stoppedAt = now;
      next.totalMs = next.accumulatedMs;
    }
  }
  return { ok: true, clock: next };
}

function bank(section, extra) {
  return Math.max(0, (Number(section && section.accumulatedMs) || 0) + extra);
}

function segmentFor(clock, now) {
  const section = clock.sections[clock.currentSection] || {};
  const since = Number(section.runningSince) || clock.runningSince;
  return since === null || since === undefined ? 0 : Math.max(0, now - since);
}

function switchSection(clock, section, now) {
  const next = { ...clock, sections: { ...clock.sections }, currentSection: section, rev: clock.rev + 1 };
  if (clock.state === "running") {
    next.sections[clock.currentSection] = { accumulatedMs: bank(clock.sections[clock.currentSection], segmentFor(clock, now)), runningSince: null };
    next.sections[section] = { accumulatedMs: bank(clock.sections[section], 0), runningSince: now };
  }
  return next;
}

// Teacher correction after the fact. Logs the previous value; never negative.
export function applyAdjustment(clockValue, deltaMs, now) {
  const clock = normalizeClock(clockValue);
  const delta = Math.trunc(Number(deltaMs));
  if (!Number.isFinite(delta) || delta === 0) return { ok: false, reason: "invalid-delta" };
  const previous = elapsedMs(clock, now);
  const nextTotal = Math.max(0, previous + delta);
  const next = { ...clock, rev: clock.rev + 1 };
  if (clock.state === "stopped") {
    next.totalMs = nextTotal;
    next.accumulatedMs = nextTotal;
  } else if (delta >= 0 || clock.state !== "running" || clock.runningSince === null) {
    next.accumulatedMs = Math.max(0, clock.accumulatedMs + delta);
  } else {
    // Removing time from a running clock: take it from the current run segment first (by moving its
    // start later), then from banked time, so the stored values stay non-negative.
    const cut = -delta;
    const segment = Math.max(0, now - clock.runningSince);
    const fromSegment = Math.min(cut, segment);
    next.runningSince = clock.runningSince + fromSegment;
    next.accumulatedMs = Math.max(0, clock.accumulatedMs - (cut - fromSegment));
  }
  return { ok: true, clock: next, previousMs: previous, nextMs: Math.max(0, previous + delta) };
}

// ---- display ---------------------------------------------------------------------------------

export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const two = value => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`;
}

export const STATE_LABELS = Object.freeze({ idle: "Not started", running: "Running", paused: "Paused", stopped: "Stopped" });

// ---- section progress and safety nets ------------------------------------------------------------

// Colour band for a section: "ok" up to the estimate, "over" from 100%, "late" beyond 120%.
export function sectionProgress(elapsed, estimatedMinutes) {
  const estimateMs = Math.max(0, Number(estimatedMinutes) || 0) * 60000;
  if (!estimateMs) return { ratio: 0, remainingMs: 0, band: "ok" };
  const ratio = elapsed / estimateMs;
  return { ratio, remainingMs: Math.max(0, estimateMs - elapsed), band: ratio > 1.2 ? "late" : ratio >= 1 ? "over" : "ok" };
}

export const LONG_RUNNING_MS = 2 * 60 * 60 * 1000;
export const INACTIVITY_MS = 15 * 60 * 1000;

// Warnings for the teacher while the clock is running.
export function clockWarnings(clockValue, serverNow, lastStudentActivityAt) {
  const clock = normalizeClock(clockValue);
  if (clock.state !== "running") return [];
  const warnings = [];
  if (elapsedMs(clock, serverNow) > LONG_RUNNING_MS) warnings.push({ id: "long", text: "The clock has been running for more than 2 hours. Did you forget to stop it?" });
  const last = Number(lastStudentActivityAt) || 0;
  const reference = last || clock.runningSince || serverNow;
  if (serverNow - reference > INACTIVITY_MS) warnings.push({ id: "inactive", text: "No student activity for 15 minutes while the clock is running." });
  return warnings;
}

// Server-time offset helpers: serverNow = clientNow + offset. Smooths nothing; callers pass the SDK's offset.
export function serverNowFrom(clientNow, offset) {
  return clientNow + (Number(offset) || 0);
}
