// Export and erase everything held for one student. The paths come from docs/PRIVACY.md (the data inventory); a test keeps the
// two in step. DOM-free: the dashboard card passes in the database. The teacher can read every path and delete every path except
// the lesson clock log, which the database rules keep append-only (it holds only timing events, no student writing).
export const CODE_PATTERN = /^[A-Z0-9]{4,12}$/;

export const NODES = Object.freeze([
  { key: "profile", path: code => `students/${code}`, label: "Name, code and sign-in link" },
  { key: "session", path: code => `sessions/${code}`, label: "Live lesson state, answers, notes and history" },
  { key: "progress", path: code => `studentProgress/${code}`, label: "XP, badges, attempts, saved words, clip, manga and listening records, placement result" },
  { key: "summary", path: code => `sessionSummary/${code}`, label: "Compact summary of the current lesson" },
  { key: "curriculum", path: code => `studentCurriculum/${code}`, label: "Lessons assigned to the student" },
  { key: "features", path: code => `studentFeatures/${code}`, label: "Feature switches" },
  { key: "mangaAssignments", path: code => `mangaAssignments/${code}`, label: "Manga chapters assigned with due dates" },
  { key: "whiteboards", path: code => `whiteboards/${code}`, label: "Whiteboard drawings and snapshots" },
  { key: "lessonClock", path: code => `lessonClock/${code}`, label: "Lesson clock totals" },
  { key: "lessonClockLog", path: code => `lessonClockLog/${code}`, label: "Lesson clock event log", deletable: false, reason: "The log is append-only by design (timing events only, no student writing). Remove it in the Firebase console if you must." }
]);

// What to read and what to delete for this student. `profile` is students/<code> (it holds the uid and class).
export function planFor(code, profile = {}) {
  if (!CODE_PATTERN.test(String(code))) throw new Error("A valid student code is required.");
  const items = NODES.map(node => ({ key: node.key, label: node.label, path: node.path(code), deletable: node.deletable !== false, reason: node.reason || "" }));
  if (profile && typeof profile.uid === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(profile.uid)) {
    items.push({ key: "identity", label: "Link from the sign-in account to the code", path: `studentByUid/${profile.uid}`, deletable: true, reason: "" });
    if (profile.classId && /^[A-Za-z0-9_-]{1,32}$/.test(String(profile.classId))) items.push({ key: "leaderboard", label: "Leaderboard nickname", path: `leaderboard/${profile.classId}/members/${profile.uid}`, deletable: true, reason: "" });
  }
  return items;
}

export const confirmationMatches = (typed, code) => String(typed || "").trim().toUpperCase() === String(code).toUpperCase() && CODE_PATTERN.test(String(code));

export function buildExport(code, results, now = Date.now()) {
  const data = {};
  for (const item of results) if (item.value !== null && item.value !== undefined) data[item.key] = item.value;
  const unreadable = results.filter(item => item.unreadable).map(item => ({ path: item.path, error: item.unreadable }));
  return { format: 1, exportedAt: new Date(now).toISOString(), studentCode: code, ...(unreadable.length ? { unreadable } : {}), note: "Everything the portal holds for this student, read from the database. Lesson content and answer keys are not student data and are not included.", data };
}

export const exportFileName = (code, now = Date.now()) => `student-${code}-export-${new Date(now).toISOString().slice(0, 10)}.json`;

export async function readAll(db, code) {
  const profile = (await db.ref(`students/${code}`).once("value")).val() || {};
  const plan = planFor(code, profile);
  // One unreadable path must not stop the rest: it is listed as `unreadable` so the teacher can see what is missing.
  const results = await Promise.all(plan.map(async item => { try { return { ...item, value: (await db.ref(item.path).once("value")).val() }; } catch (error) { return { ...item, value: null, unreadable: String((error && error.message) || error) }; } }));
  // Weekly leaderboard totals are keyed by week and then by account, so they have to be found.
  if (profile.uid && profile.classId) {
    const weeks = (await db.ref(`leaderboard/${profile.classId}/weeks`).once("value")).val() || {};
    const found = Object.keys(weeks).filter(week => weeks[week] && weeks[week][profile.uid] !== undefined);
    for (const week of found) results.push({ key: `leaderboard-week-${week}`, label: "Leaderboard weekly total", path: `leaderboard/${profile.classId}/weeks/${week}/${profile.uid}`, deletable: true, reason: "", value: weeks[week][profile.uid] });
  }
  return { profile, results };
}

// Deletes every deletable path in one atomic update, the student record last-written so a half-finished erase cannot leave data
// without its owner. Returns what was removed and what had to be left.
export async function eraseAll(db, code, typedConfirmation) {
  if (!confirmationMatches(typedConfirmation, code)) throw new Error("The confirmation does not match the student code.");
  const { results } = await readAll(db, code);
  const updates = {}; const removed = []; const kept = [];
  for (const item of results) {
    if (!item.deletable) { if (item.value !== null && item.value !== undefined) kept.push({ path: item.path, reason: item.reason }); continue; }
    if (item.value !== null && item.value !== undefined) { updates[item.path] = null; removed.push(item.path); }
  }
  if (Object.keys(updates).length) await db.ref().update(updates);
  return { removed, kept };
}
