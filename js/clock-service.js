// Firebase glue for the lesson clock. The UI never assumes a transition succeeded: it always renders
// whatever the listener reports. Transitions run as transactions on lesshandleClock/<code>/<lessonId>
// (compare the revision, apply the legal state machine from js/lesson-clock.js) and are then appended
// to lesshandleClockLog. Server timestamps are written as server values so devices with wrong clocks agree.
import { applyAdjustment, applyTransition, emptyClock, normalizeClock, serverNowFrom } from "./lesson-clock.js";

const SERVER_TIMESTAMP = { ".sv": "timestamp" };

export function clockPath(code, lessonId) {
  return `lesshandleClock/${code}/${lessonId}`;
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
  const ref = db.ref(`lesshandleClockLog/${code}/${lessonId}`).push();
  await ref.set({ ...event, at: SERVER_TIMESTAMP });
}

// action: start | pause | resume | stop | section | adjust. Resolves { ok, reason?, clock? }.
export async function runClockAction({ db, auth, code, lessonId, action, expectedRev, offset = 0, section, deltaMs, note }) {
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: "not-signed-in" };
  let outcome = { ok: false, reason: "aborted" };
  let fromState = "idle";
  const result = await db.ref(clockPath(code, lessonId)).transaction(current => {
    const now = serverNowFrom(Date.now(), offset);
    const clock = normalizeClock(current);
    fromState = clock.state;
    if (action === "adjust") {
      const adjusted = applyAdjustment(clock, deltaMs, now);
      if (!adjusted.ok) { outcome = adjusted; return undefined; }
      adjusted.clock.lastAdjust = { previousMs: adjusted.previousMs, at: now, ...(note ? { reason: String(note).slice(0, 200) } : {}) };
      outcome = { ok: true, clock: adjusted.clock, previousMs: adjusted.previousMs, nextMs: adjusted.nextMs };
      return withServerTimestamps(adjusted.clock, now);
    }
    // The first run of a transaction may see an empty local cache; only enforce the revision on real data.
    const check = current === null ? undefined : expectedRev;
    const transition = applyTransition(clock, action, now, { expectedRev: check, section });
    if (!transition.ok) { outcome = transition; return undefined; }
    outcome = { ok: true, clock: transition.clock };
    return withServerTimestamps(transition.clock, now);
  });
  if (!result.committed) return outcome.ok ? { ok: false, reason: "conflict" } : outcome;
  const event = { type: action, by: user.uid, fromState, toState: outcome.clock.state };
  if (action === "section") event.section = section;
  if (action === "adjust") { event.deltaMs = Math.trunc(deltaMs); event.previousMs = outcome.previousMs; if (note) event.note = String(note).slice(0, 200); }
  try { await appendLog(db, code, lessonId, event); } catch (error) { console.error("Clock log entry failed", error); }
  return outcome;
}
