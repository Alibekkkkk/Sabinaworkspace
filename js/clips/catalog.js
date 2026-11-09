// The student's list of clips: join assigned lessons, clip details and completion records, then filter and sort.
// Pure functions: no DOM and no Firebase.
import { dueState, isAvailable, isPublished } from "../schedule.js";

export const LEVEL_ORDER = Object.freeze(["A1", "A2", "B1", "B2", "C1", "C2"]);
export const STATUS_FILTERS = Object.freeze(["all", "todo", "done"]);
const URGENCY = { overdue: 0, "due-today": 1, "due-soon": 2, open: 3, none: 4, closed: 6, locked: 7, hidden: 8 };

export function clipSummary(clip) {
  const seconds = Math.round(clip.endSeconds - clip.startSeconds);
  return {
    id: clip.id, title: clip.title, level: clip.level, genre: [...(clip.genre || [])], grammar: [...(clip.grammarPoints || [])],
    seconds, channel: clip.source && clip.source.channel, interactive: clip.timingVerified === true,
    exercises: (clip.exercises || []).length, lines: (clip.transcript || []).length
  };
}

// lessons: { lessonId: record }, details: { clipId: summary }, progress: { clipId: completion record }
export function buildEntries(lessons, details = {}, progress = {}, now = Date.now(), timeZone = "UTC") {
  const out = [];
  for (const [lessonId, lesson] of Object.entries(lessons || {})) {
    if (!lesson || !lesson.clipId || !isPublished(lesson)) continue;
    const due = dueState(lesson, now, timeZone);
    const detail = details[lesson.clipId] || null; const record = progress[lesson.clipId] || null;
    const available = isAvailable(lesson, now);
    out.push({
      lessonId, clipId: lesson.clipId, lessonTitle: lesson.title || lesson.clipId, order: Number(lesson.order) || 0,
      title: detail ? detail.title : lesson.title || lesson.clipId, detail, available, due,
      done: Boolean(record && record.completedAt), stars: record ? Number(record.stars) || 0 : 0, score: record ? record.score : null, total: record ? record.total : null,
      attempts: record ? Number(record.attempts) || 0 : 0,
      status: !available ? "locked" : record && record.completedAt ? "done" : "todo"
    });
  }
  return out;
}

export function facets(entries) {
  const levels = new Set(); const genres = new Set(); const grammar = new Set();
  for (const entry of entries) { if (!entry.detail || !entry.available) continue; levels.add(entry.detail.level); entry.detail.genre.forEach(g => genres.add(g)); entry.detail.grammar.forEach(g => grammar.add(g)); }
  return { levels: [...levels].sort((a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b)), genres: [...genres].sort(), grammar: [...grammar].sort() };
}

// Locked clips ignore the filters (their details are not available yet); they are listed separately as "coming up".
export function filterEntries(entries, { level = "", genre = "", grammar = "", status = "all" } = {}) {
  return entries.filter(entry => {
    if (!entry.available) return false;
    if (status === "todo" && entry.done) return false;
    if (status === "done" && !entry.done) return false;
    if (!entry.detail) return !level && !genre && !grammar;
    if (level && entry.detail.level !== level) return false;
    if (genre && !entry.detail.genre.includes(genre)) return false;
    if (grammar && !entry.detail.grammar.includes(grammar)) return false;
    return true;
  });
}

export function sortEntries(entries) {
  return [...entries].sort((a, b) => Number(a.done) - Number(b.done) || (URGENCY[a.due.state] ?? 5) - (URGENCY[b.due.state] ?? 5) || (a.due.days ?? 999) - (b.due.days ?? 999) || a.order - b.order || a.title.localeCompare(b.title));
}

export const comingUp = entries => sortEntries(entries.filter(entry => !entry.available));

export function starsText(count) { const n = Math.max(0, Math.min(3, Math.round(Number(count) || 0))); return `${"★".repeat(n)}${"☆".repeat(3 - n)}`; }

export function describe(entry) {
  const parts = [];
  if (entry.detail) parts.push(entry.detail.level, entry.detail.genre.join(", "), `${entry.detail.seconds} seconds`);
  if (entry.due.label) parts.push(entry.due.label);
  if (entry.done) parts.push(`done ${starsText(entry.stars)}`);
  return parts.filter(Boolean).join(" · ");
}

// ---- teacher view ---------------------------------------------------------------------------------------------------
// One row per clip assigned to the student: status, stars, time, weak lines and the words they saved from it.
export function teacherRows(lessons, clipProgress = {}, vocabulary = {}, now = Date.now(), timeZone = "UTC") {
  const saved = new Map();
  for (const entry of Object.values(vocabulary || {})) if (entry && entry.sourceClipId) saved.set(entry.sourceClipId, (saved.get(entry.sourceClipId) || 0) + 1);
  return buildEntries(lessons, {}, clipProgress, now, timeZone).map(entry => {
    const record = clipProgress[entry.clipId] || {};
    return { lessonId: entry.lessonId, clipId: entry.clipId, title: record.title || entry.lessonTitle, status: entry.status, due: entry.due.label, done: entry.done, stars: entry.stars, score: entry.score, total: entry.total, attempts: entry.attempts, minutes: Math.round((Number(record.seconds) || 0) / 60), weakLines: Array.isArray(record.weakLines) ? record.weakLines : (record.weakLines ? Object.values(record.weakLines) : []), words: saved.get(entry.clipId) || 0, interactive: record.interactive === true };
  }).sort((a, b) => Number(a.done) - Number(b.done) || a.title.localeCompare(b.title));
}
