import assert from "node:assert/strict";
import test from "node:test";
import {
  compareByDue, dueState, duplicateScheduleToNextWeek, formatInZone, isAvailable, isClosed, localInputToTimestamp,
  shiftByCalendarDays, timestampToLocalInput, validateSchedule, zonedParts
} from "../js/schedule.js";

const UTC = Date.UTC;
const ALMATY = "Asia/Almaty"; // UTC+5, no DST
const NEW_YORK = "America/New_York"; // DST: 2026-03-08 and 2026-11-01
const LONDON = "Europe/London"; // DST: 2026-03-29 and 2026-10-25

test("isAvailable: respects published, availableFrom and the exact boundary", () => {
  const from = UTC(2026, 0, 10, 9, 0);
  assert.equal(isAvailable({}, from), true);
  assert.equal(isAvailable({ published: false }, from), false);
  assert.equal(isAvailable({ availableFrom: from }, from - 1), false);
  assert.equal(isAvailable({ availableFrom: from }, from), true);
  assert.equal(isAvailable({ availableFrom: from, published: false }, from + 1), false);
  assert.equal(isAvailable({ availableFrom: "" }, 0), true);
  assert.equal(isAvailable(null, 0), false);
});

test("isClosed only applies after closesAt", () => {
  assert.equal(isClosed({}, 5), false);
  assert.equal(isClosed({ closesAt: 100 }, 100), false);
  assert.equal(isClosed({ closesAt: 100 }, 101), true);
});

test("dueState: locked, due in N days, due today, overdue, closed", () => {
  const now = UTC(2026, 0, 10, 10, 0); // 15:00 in Almaty
  const state = (item, zone = ALMATY) => dueState(item, now, zone);

  assert.equal(state({ published: false }).state, "hidden");
  const locked = state({ availableFrom: UTC(2026, 0, 12, 4, 0) });
  assert.equal(locked.state, "locked");
  assert.match(locked.label, /Locked until .*\(Asia\/Almaty\)/);

  assert.equal(state({}).state, "none");
  assert.equal(state({ dueAt: UTC(2026, 0, 12, 12, 0) }).label, "Due in 2 days");
  assert.equal(state({ dueAt: UTC(2026, 0, 11, 12, 0) }).label, "Due tomorrow");
  assert.equal(state({ dueAt: UTC(2026, 0, 10, 15, 0) }).label, "Due today");
  assert.equal(state({ dueAt: UTC(2026, 0, 20, 12, 0) }).state, "open");
  assert.equal(state({ dueAt: UTC(2026, 0, 12, 12, 0) }).state, "due-soon");

  assert.equal(state({ dueAt: UTC(2026, 0, 8, 12, 0) }).label, "Overdue by 2 days");
  assert.equal(state({ dueAt: UTC(2026, 0, 9, 12, 0) }).label, "Overdue by 1 day");
  assert.match(state({ dueAt: UTC(2026, 0, 10, 8, 0) }).label, /earlier today/);
  assert.equal(state({ dueAt: UTC(2026, 0, 8, 12, 0), closesAt: UTC(2026, 0, 9, 0, 0) }).state, "closed");
});

test("dueState counts calendar days in the viewer's zone, not 24-hour blocks", () => {
  // 23:30 Almaty on Jan 10 is 18:30 UTC; the next local midnight is only 30 minutes away.
  const now = UTC(2026, 0, 10, 18, 30);
  const dueAt = UTC(2026, 0, 11, 5, 0); // 10:00 Jan 11 in Almaty, 11.5 hours later
  assert.equal(dueState({ dueAt }, now, ALMATY).label, "Due tomorrow");
  // The same two instants fall on the same calendar day in UTC.
  assert.equal(dueState({ dueAt }, now, "UTC").label, "Due tomorrow");
  assert.equal(dueState({ dueAt: UTC(2026, 0, 10, 23, 0) }, now, "UTC").label, "Due today");
  // Across the New York spring-forward (2026-03-08) the day count is still calendar based.
  const beforeDst = UTC(2026, 2, 7, 15, 0); // Mar 7 10:00 EST
  const afterDst = UTC(2026, 2, 9, 14, 0); // Mar 9 10:00 EDT, only 47 hours later
  assert.equal(dueState({ dueAt: afterDst }, beforeDst, NEW_YORK).label, "Due in 2 days");
});

test("the same instant reads differently per zone, with the zone shown", () => {
  const instant = UTC(2026, 6, 1, 20, 0);
  assert.equal(zonedParts(instant, ALMATY).hour, 1);
  assert.equal(zonedParts(instant, ALMATY).day, 2);
  assert.equal(zonedParts(instant, "UTC").hour, 20);
  assert.match(formatInZone(instant, NEW_YORK, "en-US"), /16:00 \(America\/New_York\)|04:00 PM \(America\/New_York\)|16:00/);
  assert.match(formatInZone(instant, LONDON, "en-GB"), /\(Europe\/London\)/);
});

test("shiftByCalendarDays keeps wall-clock time across daylight saving changes", () => {
  const friday5pm = UTC(2026, 2, 6, 22, 0); // Mar 6 17:00 EST
  const next = shiftByCalendarDays(friday5pm, 7, NEW_YORK); // Mar 13 17:00 EDT = 21:00 UTC
  assert.equal(next, UTC(2026, 2, 13, 21, 0));
  assert.deepEqual([zonedParts(next, NEW_YORK).hour, zonedParts(next, NEW_YORK).minute], [17, 0]);

  const ukBefore = UTC(2026, 2, 27, 18, 0); // Mar 27 18:00 GMT
  assert.equal(shiftByCalendarDays(ukBefore, 7, LONDON), UTC(2026, 3, 3, 17, 0)); // Apr 3 18:00 BST
  assert.equal(shiftByCalendarDays(UTC(2026, 9, 23, 17, 0), 7, LONDON), UTC(2026, 9, 30, 18, 0)); // back to GMT
  assert.equal(shiftByCalendarDays(UTC(2026, 0, 31, 12, 0), 1, "UTC"), UTC(2026, 1, 1, 12, 0));
  assert.equal(shiftByCalendarDays(UTC(2026, 11, 28, 12, 0), 7, "UTC"), UTC(2027, 0, 4, 12, 0));
  assert.equal(shiftByCalendarDays(friday5pm, -7, NEW_YORK), UTC(2026, 1, 27, 22, 0));
});

test("a wall-clock time that does not exist (spring forward gap) lands after the gap, never before", () => {
  const sunday = UTC(2026, 2, 1, 7, 30); // Mar 1 02:30 EST
  const shifted = shiftByCalendarDays(sunday, 7, NEW_YORK); // Mar 8 02:30 does not exist in New York
  const parts = zonedParts(shifted, NEW_YORK);
  assert.equal(parts.day, 8);
  assert.ok(parts.hour === 3 || parts.hour === 1 || parts.hour === 2, `hour ${parts.hour}`);
});

test("duplicateScheduleToNextWeek shifts every set field and leaves missing ones out", () => {
  const schedule = { availableFrom: UTC(2026, 2, 6, 14, 0), dueAt: UTC(2026, 2, 8, 2, 0) };
  const next = duplicateScheduleToNextWeek(schedule, NEW_YORK);
  assert.deepEqual(Object.keys(next).sort(), ["availableFrom", "dueAt"]);
  assert.equal(next.availableFrom, UTC(2026, 2, 13, 13, 0)); // 09:00 EDT
  assert.deepEqual(duplicateScheduleToNextWeek({}, "UTC"), {});
});

test("datetime-local round trip is zone aware", () => {
  const stamp = localInputToTimestamp("2026-03-29T09:30", LONDON); // BST, UTC+1
  assert.equal(stamp, UTC(2026, 2, 29, 8, 30));
  assert.equal(timestampToLocalInput(stamp, LONDON), "2026-03-29T09:30");
  assert.equal(localInputToTimestamp("2026-01-10T09:30", ALMATY), UTC(2026, 0, 10, 4, 30));
  assert.equal(timestampToLocalInput(localInputToTimestamp("2026-11-01T01:30", NEW_YORK), NEW_YORK).slice(0, 10), "2026-11-01");
  assert.equal(localInputToTimestamp("", "UTC"), null);
  assert.equal(localInputToTimestamp("not a date", "UTC"), null);
  assert.equal(timestampToLocalInput(undefined, "UTC"), "");
});

test("validateSchedule enforces available <= due <= closes", () => {
  assert.equal(validateSchedule({}).valid, true);
  assert.equal(validateSchedule({ availableFrom: 1, dueAt: 2, closesAt: 3 }).valid, true);
  assert.equal(validateSchedule({ availableFrom: 5, dueAt: 2 }).valid, false);
  assert.equal(validateSchedule({ dueAt: 5, closesAt: 2 }).valid, false);
  assert.equal(validateSchedule({ availableFrom: 5, closesAt: 2 }).valid, false);
  assert.equal(validateSchedule({ availableFrom: 5, dueAt: 5, closesAt: 5 }).valid, true);
});

test("compareByDue sorts dated items first", () => {
  const rows = [{ id: "c" }, { id: "b", dueAt: 20 }, { id: "a", dueAt: 10 }];
  assert.deepEqual(rows.sort(compareByDue).map(row => row.id), ["a", "b", "c"]);
});
