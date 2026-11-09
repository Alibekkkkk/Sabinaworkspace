import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NODES, buildExport, confirmationMatches, eraseAll, exportFileName, planFor, readAll } from "../js/privacy/student-data.js";

const root = new URL("../", import.meta.url);
const rules = JSON.parse(readFileSync(new URL("database.rules.json", root), "utf8")).rules;
const inventory = readFileSync(new URL("docs/PRIVACY.md", root), "utf8");

// A tiny in-memory stand-in for the parts of the database the module uses.
function fakeDb(data) {
  const get = path => path.split("/").reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), data);
  const writes = [];
  return { writes, ref: path => (path === undefined ? { update: async updates => { writes.push(updates); } } : { once: async () => ({ val: () => (get(path) === undefined ? null : get(path)) }) }) };
}

test("every node that holds student data is in the privacy inventory, and the inventory is the rules' view of the database", () => {
  const studentKeyed = ["students", "studentByUid", "pendingStudents", "sessions", "sessionSummary", "studentProgress", "studentCurriculum", "studentFeatures", "mangaAssignments", "whiteboards", "lessonClock", "lessonClockLog", "leaderboard"];
  const notStudentData = ["curriculum", "protectedContent", "admins"];
  for (const name of Object.keys(rules).filter(key => !key.startsWith("."))) {
    assert.ok(studentKeyed.includes(name) || notStudentData.includes(name), `${name} is a new top-level node: decide whether it holds student data and add it to docs/PRIVACY.md and js/privacy/student-data.js`);
    assert.match(inventory, new RegExp("`" + name + "[`/<]"), `${name} must be listed in docs/PRIVACY.md`);
  }
  for (const node of NODES) assert.match(inventory, new RegExp("`" + node.path("<code>").split("/")[0]), `${node.key} is in the inventory`);
});

test("the plan covers every student-keyed path, plus the sign-in link and leaderboard entry when they are known", () => {
  const plan = planFor("ANNA1", { uid: "u-1", classId: "main" });
  assert.deepEqual(plan.map(item => item.path), ["students/ANNA1", "sessions/ANNA1", "studentProgress/ANNA1", "sessionSummary/ANNA1", "studentCurriculum/ANNA1", "studentFeatures/ANNA1", "mangaAssignments/ANNA1", "whiteboards/ANNA1", "lessonClock/ANNA1", "lessonClockLog/ANNA1", "studentByUid/u-1", "leaderboard/main/members/u-1"]);
  assert.equal(plan.find(item => item.key === "lessonClockLog").deletable, false);
  assert.equal(planFor("ANNA1", {}).length, NODES.length, "no uid, no identity or leaderboard path");
  assert.throws(() => planFor("a/b"), /valid student code/); assert.throws(() => planFor("../x"), /valid student code/);
  assert.equal(planFor("ANNA1", { uid: "bad uid/../x" }).length, NODES.length, "an odd uid never becomes a path");
});

test("deleting needs the code typed in, in any letter case", () => {
  assert.ok(confirmationMatches("anna1", "ANNA1")); assert.ok(confirmationMatches(" ANNA1 ", "ANNA1"));
  assert.ok(!confirmationMatches("", "ANNA1")); assert.ok(!confirmationMatches("ANNA", "ANNA1")); assert.ok(!confirmationMatches("anna1", "a/b"));
});

test("the export has every kind of data that exists and says when and for whom", () => {
  const file = buildExport("ANNA1", [{ key: "profile", value: { name: "Anna" } }, { key: "session", value: null }, { key: "progress", value: { xp: 5 } }], Date.parse("2026-11-09T10:00:00Z"));
  assert.deepEqual(Object.keys(file.data), ["profile", "progress"]); assert.equal(file.studentCode, "ANNA1"); assert.equal(file.exportedAt, "2026-11-09T10:00:00.000Z"); assert.equal(file.format, 1);
  assert.equal(exportFileName("ANNA1", Date.parse("2026-11-09T10:00:00Z")), "student-ANNA1-export-2026-11-09.json");
});

test("erasing removes every path that holds data in one update, leaves the clock log, and refuses a wrong confirmation", async () => {
  const data = { students: { ANNA1: { uid: "u-1", classId: "main", name: "Anna" } }, studentByUid: { "u-1": "ANNA1" }, studentProgress: { ANNA1: { xp: 5 } }, sessions: { ANNA1: { state: { stage: 2 } } }, lessonClockLog: { ANNA1: { l: { e: { type: "start" } } } }, leaderboard: { main: { members: { "u-1": { nickname: "Ann" } }, weeks: { "2026-W45": { "u-1": { weeklyXp: 3 }, "u-2": { weeklyXp: 9 } } } } } };
  const db = fakeDb(data);
  await assert.rejects(eraseAll(db, "ANNA1", "nope"), /does not match/);
  assert.equal(db.writes.length, 0, "nothing is deleted without the confirmation");
  const result = await eraseAll(db, "ANNA1", "anna1");
  assert.equal(db.writes.length, 1, "one atomic update");
  assert.deepEqual(Object.keys(db.writes[0]).sort(), ["leaderboard/main/members/u-1", "leaderboard/main/weeks/2026-W45/u-1", "sessions/ANNA1", "studentByUid/u-1", "studentProgress/ANNA1", "students/ANNA1"].sort());
  assert.ok(Object.values(db.writes[0]).every(value => value === null));
  assert.ok(!Object.keys(db.writes[0]).some(path => path.includes("u-2")), "another student's weekly total is untouched");
  assert.deepEqual(result.kept.map(item => item.path), ["lessonClockLog/ANNA1"]);
  assert.ok((await readAll(fakeDb({}), "ANNA1")).results.every(item => item.value === null));
});
