// Teacher dashboard status logic (pure): who is online, idle, offline or stuck, and the "Today" counts.
//
// Status words: "online" = the student's lesson reported progress in the last 2 minutes; "idle" = last
// report between 2 and 10 minutes ago; "offline" = older, or never; "stuck" = online, but neither stage
// nor score has changed for STUCK_AFTER_MS while updates keep arriving (so they are on the page, not just
// gone). The dashboard remembers this in memory only; reloading restarts the clock rather than guessing.
export const ONLINE_MS = 2 * 60 * 1000;
export const IDLE_MS = 10 * 60 * 1000;
export const STUCK_AFTER_MS = 8 * 60 * 1000;

export function presence(lastSeen, now = Date.now()) {
  const seen = Number(lastSeen);
  if (!Number.isFinite(seen) || seen <= 0) return "offline";
  const age = now - seen;
  if (age < 0 || age < ONLINE_MS) return "online";
  return age < IDLE_MS ? "idle" : "offline";
}

export const STATUS_LABELS = Object.freeze({ online: "Online", idle: "Idle", offline: "Offline", stuck: "Might need help" });

export function createProgressTracker() {
  return new Map();
}

// Call every time a student's summary arrives. Returns the tracker entry.
export function trackProgress(tracker, code, meta, now = Date.now()) {
  const signature = `${Number(meta && meta.stage) || 0}:${Number(meta && meta.score) || 0}:${Number(meta && meta.doneCount) || 0}`;
  const entry = tracker.get(code);
  if (!entry || entry.signature !== signature) {
    const fresh = { signature, since: now };
    tracker.set(code, fresh);
    return fresh;
  }
  return entry;
}

export function studentStatus(tracker, code, meta, now = Date.now()) {
  const state = presence(meta && meta.lastSeen, now);
  if (state === "offline") return "offline";
  const entry = tracker.get(code);
  if (state === "online" && entry && now - entry.since >= STUCK_AFTER_MS) return "stuck";
  return state;
}

// Overdue homework for one student: curriculum items visible to them that have a due date in the past
// and no submission yet. `isVisible(lesson, code)` is js/audience.js's isLessonVisibleTo.
export function overdueHomework(curriculum, code, homeworkProgress, now, isVisible) {
  return Object.keys(curriculum || {})
    .map(id => ({ id, ...curriculum[id] }))
    .filter(lesson => lesson.homework && isVisible(lesson, code) && Number(lesson.dueAt) > 0 && now > Number(lesson.dueAt))
    .filter(lesson => !(homeworkProgress && homeworkProgress[lesson.id] && homeworkProgress[lesson.id].submitted));
}

export function todaySummary({ codes, metaByCode, tracker, curriculum, now = Date.now(), isVisible }) {
  const counts = { online: 0, idle: 0, offline: 0, stuck: 0, overdue: 0 };
  const attention = [];
  for (const code of codes) {
    const meta = metaByCode[code] || {};
    const status = studentStatus(tracker, code, meta, now);
    if (status === "stuck") { counts.online += 1; counts.stuck += 1; } else counts[status] += 1;
    if (status === "stuck") attention.push({ code, reason: "No progress for a while; they may need help." });
    const overdue = overdueHomework(curriculum, code, meta.homework, now, isVisible);
    if (overdue.length) {
      counts.overdue += overdue.length;
      attention.push({ code, reason: `${overdue.length} overdue: ${overdue.map(lesson => lesson.title || lesson.id).join(", ")}` });
    }
  }
  return { counts, attention };
}
