import assert from "node:assert/strict";
import test from "node:test";
import { loadProtectedContent } from "../js/protected-content.js";

function databaseWith(record) {
  return {
    ref(path) {
      return {
        async once(event) {
          assert.equal(event, "value");
          assert.equal(path, "protectedContent/lesson-a/classwork");
          return {
            exists: () => record !== null,
            val: () => record
          };
        }
      };
    }
  };
}

test("loads a valid protected content record", async () => {
  const record = { sourceFile: "lesson-a.json", content: { title: "Lesson A" } };
  assert.equal(await loadProtectedContent(databaseWith(record), "lesson-a", "classwork"), record);
});

test("fails explicitly when protected content is missing", async () => {
  await assert.rejects(
    loadProtectedContent(databaseWith(null), "lesson-a", "classwork"),
    /has not been imported/
  );
});

test("rejects invalid lesson IDs and content kinds", async () => {
  await assert.rejects(loadProtectedContent(databaseWith(null), "../lesson", "classwork"), /valid lesson ID/);
  await assert.rejects(loadProtectedContent(databaseWith(null), "lesson-a", "answers"), /Invalid protected content type/);
});
