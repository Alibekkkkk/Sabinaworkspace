// Transcript timing helpers. Pure functions: no DOM, no player. Times are seconds (numbers).
export const SPEEDS = Object.freeze([0.5, 0.75, 1]);
export const END_TOLERANCE = 0.15; // stop this close to the end of the window

// Index of the line playing at `time`, or -1. A gap between lines belongs to the line that just finished (so the
// highlight does not flicker), but not before the first line starts.
export function activeLineIndex(lines, time) {
  if (!Array.isArray(lines) || !lines.length || !Number.isFinite(time) || time < lines[0].start) return -1;
  let found = -1;
  for (let i = 0; i < lines.length; i++) { if (time >= lines[i].start) found = i; else break; }
  return found;
}

export const nextLineIndex = (lines, index) => Math.min(lines.length - 1, index + 1);
export const previousLineIndex = (lines, index) => Math.max(0, index - 1);

// Where "previous line" should go: the start of this line, unless we are already near its start, then the one before.
export function previousTarget(lines, time) {
  const active = activeLineIndex(lines, time);
  if (active < 0) return 0;
  return time - lines[active].start > 1.2 ? active : previousLineIndex(lines, active);
}

// One tick of the 4 Hz watcher. Returns what the player should do: { action: "none"|"seek"|"stop"|"line", ... }.
export function tick({ lines, time, start, end, loopLine = -1 }) {
  if (loopLine >= 0 && lines[loopLine] && time >= lines[loopLine].end - 0.05) return { action: "seek", to: lines[loopLine].start, index: loopLine };
  if (time >= end - END_TOLERANCE) return { action: "stop", to: end };
  return { action: "line", index: activeLineIndex(lines, time) };
}

export function formatTime(seconds) {
  const total = Math.max(0, Number(seconds) || 0); const m = Math.floor(total / 60); const s = total - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}
export function parseTime(value) {
  const textValue = String(value).trim(); if (!textValue) return null;
  const parts = textValue.split(":").map(Number);
  if (parts.some(part => !Number.isFinite(part) || part < 0) || parts.length > 2) return null;
  return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
}

export const round1 = value => Math.round(value * 10) / 10;

// Problems with a line list while authoring, in plain words, without throwing (the editor shows them live).
export function lineProblems(lines, start, end) {
  const out = []; let previous = start;
  lines.forEach((line, index) => {
    const label = `Line ${index + 1}`;
    if (line.start < start || line.end > end) out.push(`${label} is outside the clip window.`);
    if (line.end <= line.start) out.push(`${label} ends before it starts.`);
    if (line.start < previous - 1e-6) out.push(`${label} overlaps the line before it.`);
    previous = Math.max(previous, line.end);
  });
  return out;
}

// Make a new line from a stamp: it starts where the last one ended (or at the window start) unless told otherwise.
export function nextStampStart(lines, start) { return lines.length ? lines[lines.length - 1].end : start; }

export function wordsOf(textValue) { return String(textValue).split(/\s+/).filter(Boolean); }
export const bareWord = word => String(word).toLowerCase().replace(/[’‘]/g, "'").replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "");
