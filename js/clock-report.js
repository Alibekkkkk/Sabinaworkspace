// Reporting helpers for saved class durations: rows for history tables, the CSV export (with a
// duration_seconds column), "last class" and "total class time this month" figures, and the weekly list.
import { formatDuration } from "./lesson-clock.js";

// clocks: { [lessonId]: clock record }, titles: { [lessonId]: title }. Only stopped clocks have a saved duration.
export function classRows(code, clocks, titles = {}) {
  return Object.entries(clocks || {})
    .filter(([, clock]) => clock && clock.state === "stopped" && Number.isFinite(Number(clock.totalMs)))
    .map(([lessonId, clock]) => ({
      code, lessonId, title: titles[lessonId] || lessonId,
      durationSeconds: Math.round(Number(clock.totalMs) / 1000),
      startedAt: Number(clock.startedAt) || null,
      stoppedAt: Number(clock.stoppedAt) || null,
      sections: Object.fromEntries(Object.entries(clock.sections || {}).map(([id, section]) => [id, Math.round((Number(section && section.accumulatedMs) || 0) / 1000)]))
    }))
    .sort((a, b) => (b.stoppedAt || 0) - (a.stoppedAt || 0));
}

export function lastClass(rows) {
  return rows.length ? rows[0] : null;
}

// Total class time for the calendar month (UTC) containing `now`.
export function monthlyTotalSeconds(rows, now = Date.now()) {
  const date = new Date(now);
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  return rows.filter(row => row.stoppedAt && row.stoppedAt >= start && row.stoppedAt < end).reduce((sum, row) => sum + row.durationSeconds, 0);
}

export function classesInLastDays(rows, days, now = Date.now()) {
  const since = now - days * 86400000;
  return rows.filter(row => row.stoppedAt && row.stoppedAt >= since && row.stoppedAt <= now);
}

// Spreadsheet programs run cells that start with = + - @ as formulas; prefix them so exported text stays text.
export function csvCell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const CSV_COLUMNS = ["student_code", "lesson_id", "lesson_title", "duration_seconds", "duration", "started_at", "stopped_at", "vocabulary_seconds", "grammar_seconds", "reading_seconds"];

export function buildClockCsv(rows) {
  const iso = value => (value ? new Date(value).toISOString() : "");
  const lines = [CSV_COLUMNS.join(",")];
  for (const row of rows) {
    lines.push([
      row.code, row.lessonId, row.title, row.durationSeconds, formatDuration(row.durationSeconds * 1000), iso(row.startedAt), iso(row.stoppedAt),
      row.sections.vocabulary ?? 0, row.sections.grammar ?? 0, row.sections.reading ?? 0
    ].map(csvCell).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
