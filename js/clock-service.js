// Firebase glue for the lesson clock. The UI never assumes a transition succeeded: it always renders
// whatever the listener reports. Transitions run as transactions on lessonClock/<code>/<lessonId>
// (compare the revision, apply the legal state machine from js/lesson-clock.js) and are then appended
// to lessonClockLog. Server timestamps are written as server values so devices with wrong clocks agree.
import { applyAdjustment, applyTransition, emptyClock, normalizeClock, serverNowFrom } from "./lesson-clock.js";

const SERVER_TIMESTAMP = { ".sv": "timestamp" };

export function clockPath(code, lessonId) {
  return `lessonClock/${code}/${lessonId}`;
}

// Replace the timestamps that equal `now` with the server's own value.
export function withServerTimestamps(clock, now) {
  const stamp = value => (value === now ? SERVER_TIMESTAMP : value);
  const next = { ...clock };
  for (const key of ["runningSince", "startedAt", "stoppedAt"]) if (next[key] !== null && next[key] !== undefined) next[key] = stamp(next[key]);
  next.sections = Object.fromEntries(Object.entries(clock.sections || {}).map(([id, section]) => [id, section && section.runningSince !== null && section.runningSince !== undefined ? { ...section, runningSince: stamp(section.runningSince) } : { accumulatedMs: section.accumulatedMs }]));
  if (next.lastAdjust && next.lastAdjust.at === now) next.lastAdjust = { ...next.lastAdjust, at: SERVER_TIMESTAMP };
  // RTDB stores absent values as missing keys, never as null properties
  for (const key of Object.keys(next)) if (next[key] === null || next[key] === undefined) delete next[key];
  return next;
}

// Listen to one clock. Calls back with { clock, offset, connected }. Returns an unsubscribe function.
export function subscribeClock(db, code, lessonId, callback) {
  let clock = emptyClock();
  let offset = 0;
  let connected = true;
  const emit = () => callback({ clock, offset, connected });
  const clockRef = db.ref(clockPath(code, lessonId));
  const offsetRef = db.ref(".info/serverTimeOffset");
  const connectedRef = db.ref(".info/connected");
  const handleClock = snapshot => { clock = normalizeClock(snapshot.val()); emit(); };
  const handleOffset = snapshot => { offset = Number(snapshot.val()) || 0; emit(); };
  const handleConnected = snapshot => { connected = snapshot.val() === true; emit(); };
  clockRef.on("value", handleClock, error => console.error("Lesson clock listener failed", error));
  offsetRef.on("value", handleOffset);
  connectedRef.on("value", handleConnected);
  emit();
  return () => { clockRef.off("value", handleClock); offsetRef.off("value", handleOffset); connectedRef.off("value", handleConnected); };
}

async function appendLog(db, code, lessonId, event) {
  const ref = db.ref(`lessonClockLog/${code}/${lessonId}`).push();
  await ref.set({ ...event, at: SERVER_TIMESTAMP });
}

// action: start | pause | resume | stop | section | adjust. `clock` is the latest listener snapshot.
// The write is a plain set() carrying true server timestamps ({".sv":"timestamp"}), not a transaction:
// the SDK resolves server values inside transactions with its own estimate, which can run slightly ahead
// of the server and be refused by the "runningSince <= now" rule. Concurrency is still safe because the
// rules only accept a write whose rev is exactly the stored rev + 1; a second device acting on a stale
// snapshot is rejected and told to refresh. Resolves { ok, reason?, clock? }.
export async function runClockAction({ db, auth, code, lessonId, action, clock: current, offset = 0, section, deltaMs, note }) {
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: "not-signed-in" };
  const now = serverNowFrom(Date.now(), offset);
  const clock = normalizeClock(current);
  let outcome;
  if (action === "adjust") {
    const adjusted = applyAdjustment(clock, deltaMs, now);
    if (!adjusted.ok) return adjusted;
    adjusted.clock.lastAdjust = { previousMs: adjusted.previousMs, at: now, ...(note ? { reason: String(note).slice(0, 200) } : {}) };
    outcome = { ok: true, clock: adjusted.clock, previousMs: adjusted.previousMs, nextMs: adjusted.nextMs };
  } else {
    const transition = applyTransition(clock, action, now, { section });
    if (!transition.ok) return transition;
    outcome = { ok: true, clock: transition.clock };
  }
  try {
    await db.ref(clockPath(code, lessonId)).set(withServerTimestamps(outcome.clock, now));
  } catch (error) {
    if (error && /permission_denied/i.test(String(error.code || error.message))) { console.warn("Lesson clock write refused", action, JSON.stringify(withServerTimestamps(outcome.clock, now))); return { ok: false, reason: "conflict" }; }
    throw error;
  }
  const event = { type: action, by: user.uid, fromState: clock.state, toState: outcome.clock.state };
  if (action === "section") event.section = section;
  if (action === "adjust") { event.deltaMs = Math.trunc(deltaMs); event.previousMs = outcome.previousMs; if (note) event.note = String(note).slice(0, 200); }
  try { await appendLog(db, code, lessonId, event); } catch (error) { console.error("Clock log entry failed", error); }
  return outcome;
}
