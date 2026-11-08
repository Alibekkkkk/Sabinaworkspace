import assert from "node:assert/strict";
import test from "node:test";
import { isTeacher } from "../js/auth.js";

test("teacher identity is granted only by the authenticated user's admin record", async () => {
  const reads = [];
  const values = new Map([["admins/teacher-1", true], ["admins/student-1", false]]);
  const database = {
    ref(path) {
      reads.push(path);
      return { once: async event => ({ val: () => event === "value" ? values.get(path) ?? null : null }) };
    }
  };

  assert.equal(await isTeacher({ uid: "teacher-1" }, database), true);
  assert.equal(await isTeacher({ uid: "student-1" }, database), false);
  assert.equal(await isTeacher(null, database), false);
  assert.equal(await isTeacher({ uid: "teacher-1" }, null), false);
  assert.deepEqual(reads, ["admins/teacher-1", "admins/student-1"]);
});
