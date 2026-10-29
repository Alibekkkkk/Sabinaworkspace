import assert from "node:assert/strict";
import test from "node:test";
import { bindStudentCode } from "../js/student-context.js";

function createDatabase(initial = {}) {
  const records = new Map(Object.entries(initial));
  const transactions = [];
  return {
    records,
    transactions,
    ref(path) {
      return {
        async once() {
          const value = records.get(path) ?? null;
          return {
            exists: () => value !== null,
            val: () => value
          };
        },
        async transaction(update) {
          transactions.push(path);
          const current = records.get(path) ?? null;
          const next = update(current);
          if (next === undefined) {
            return {
              committed: false,
              snapshot: { exists: () => current !== null, val: () => current }
            };
          }
          if (next === null) records.delete(path);
          else records.set(path, next);
          return {
            committed: true,
            snapshot: {
              exists: () => next !== null,
              val: () => next
            }
          };
        }
      };
    }
  };
}

const auth = { currentUser: { uid: "student-a" } };

test("binds a student code and records the reverse UID mapping", async () => {
  const db = createDatabase({ "students/A111111": { name: "A" } });
  const bound = await bindStudentCode({ auth, db, code: "a111111" });
  assert.equal(bound.uid, "student-a");
  assert.equal(bound.student.uid, "student-a");
  assert.equal(db.records.get("studentByUid/student-a"), "A111111");
});

test("rejects a UID already linked to another student before mutating the requested student", async () => {
  const db = createDatabase({
    "students/A111111": { name: "A" },
    "studentByUid/student-a": "B222222"
  });
  await assert.rejects(
    bindStudentCode({ auth, db, code: "A111111" }),
    /already linked to another student code/
  );
  assert.equal(db.records.get("students/A111111").uid, undefined);
  assert.deepEqual(db.transactions, []);
});

test("rejects a student code already linked to another UID", async () => {
  const db = createDatabase({ "students/A111111": { name: "A", uid: "student-b" } });
  await assert.rejects(
    bindStudentCode({ auth, db, code: "A111111" }),
    /already linked to another account/
  );
  assert.equal(db.records.has("studentByUid/student-a"), false);
});
