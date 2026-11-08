// Assignment scheduling helpers. All times are stored as UTC milliseconds and only converted to
// wall-clock time for display. "Days" are calendar days in the viewer's time zone, so a due date
// stays "tomorrow" across a daylight-saving change instead of drifting by an hour.

export const SCHEDULE_FIELDS = ["availableFrom", "dueAt", "closesAt"];
const DAY_MS = 86400000;

function finite(value) {
  const number = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isFinite(number) ? number : null;
}

export function localZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (error) { return "UTC"; }
}

// Wall-clock parts of an instant in a zone.
export function zonedParts(timestamp, timeZone = "UTC") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).formatToParts(new Date(timestamp));
  const get = type => Number(parts.find(part => part.type === type).value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

function utcFromWallClock(parts, timeZone) {
  // Start from the wall clock read as UTC, then correct by the zone offset (twice, to settle DST edges).
  let guess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  for (let attempt = 0; attempt < 2; attempt++) {
    const seen = zonedParts(guess, timeZone);
    const seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second);
    guess += Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - seenAsUtc;
  }
  return guess;
}

function calendarDayNumber(timestamp, timeZone) {
  const parts = zonedParts(timestamp, timeZone);
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS);
}

export function formatInZone(timestamp, timeZone = localZone(), locale) {
  const text = new Intl.DateTimeFormat(locale, {
    timeZone, weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false
  }).format(new Date(timestamp));
  return `${text} (${timeZone})`;
}

export function isPublished(item) {
  return Boolean(item) && item.published !== false;
}

export function isAvailable(item, now = Date.now()) {
  if (!isPublished(item)) return false;
  const from = finite(item.availableFrom);
  return from === null || now >= from;
}

export function isClosed(item, now = Date.now()) {
  const closes = finite(item && item.closesAt);
  return closes !== null && now > closes;
}

// Returns { state, label, days } where state is one of:
// hidden | locked | closed | overdue | due-today | due-soon | open | none
export function dueState(item, now = Date.now(), timeZone = localZone()) {
  if (!isPublished(item)) return { state: "hidden", label: "Not published", days: null };
  if (!isAvailable(item, now)) {
    return { state: "locked", label: `Locked until ${formatInZone(item.availableFrom, timeZone)}`, days: null };
  }
  const due = finite(item.dueAt);
  if (isClosed(item, now)) return { state: "closed", label: "Closed", days: null };
  if (due === null) return { state: "none", label: "", days: null };
  const days = calendarDayNumber(due, timeZone) - calendarDayNumber(now, timeZone);
  if (now > due) {
    const late = Math.max(1, -days);
    return days === 0
      ? { state: "overdue", label: "Overdue (was due earlier today)", days }
      : { state: "overdue", label: `Overdue by ${late} day${late === 1 ? "" : "s"}`, days };
  }
  if (days === 0) return { state: "due-today", label: "Due today", days };
  if (days === 1) return { state: "due-soon", label: "Due tomorrow", days };
  return { state: days <= 3 ? "due-soon" : "open", label: `Due in ${days} days`, days };
}

export function validateSchedule(schedule) {
  const errors = [];
  const from = finite(schedule && schedule.availableFrom);
  const due = finite(schedule && schedule.dueAt);
  const closes = finite(schedule && schedule.closesAt);
  if (from !== null && due !== null && due < from) errors.push("The due date is before the available date.");
  if (due !== null && closes !== null && closes < due) errors.push("The closing date is before the due date.");
  if (from !== null && closes !== null && closes < from) errors.push("The closing date is before the available date.");
  return { valid: errors.length === 0, errors };
}

// Moves an instant by whole calendar days keeping the same wall-clock time in the zone
// (so "Friday 17:00" stays 17:00 after a DST change).
export function shiftByCalendarDays(timestamp, days, timeZone = localZone()) {
  const parts = zonedParts(timestamp, timeZone);
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, parts.hour, parts.minute, parts.second));
  return utcFromWallClock({
    year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate(),
    hour: parts.hour, minute: parts.minute, second: parts.second
  }, timeZone);
}

export function duplicateScheduleToNextWeek(schedule, timeZone = localZone()) {
  const next = {};
  for (const field of SCHEDULE_FIELDS) {
    const value = finite(schedule && schedule[field]);
    if (value !== null) next[field] = shiftByCalendarDays(value, 7, timeZone);
  }
  return next;
}

// <input type="datetime-local"> value ("2026-03-29T09:30") <-> UTC milliseconds in a zone.
export function localInputToTimestamp(value, timeZone = localZone()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  return utcFromWallClock({ year, month, day, hour, minute, second: 0 }, timeZone);
}

export function timestampToLocalInput(timestamp, timeZone = localZone()) {
  const value = finite(timestamp);
  if (value === null) return "";
  const parts = zonedParts(value, timeZone);
  const pad = number => String(number).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

// Sort key for the teacher's schedule list: dated items first by due date, undated last.
export function compareByDue(a, b) {
  const dueA = finite(a && a.dueAt);
  const dueB = finite(b && b.dueAt);
  if (dueA === null && dueB === null) return 0;
  if (dueA === null) return 1;
  if (dueB === null) return -1;
  return dueA - dueB;
}
