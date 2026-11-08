import assert from "node:assert/strict";
import test from "node:test";
import { isLessonVisibleTo } from "../js/audience.js";

test("lessons with an empty or missing assignedTo are visible to nobody", () => {
  assert.equal(isLessonVisibleTo({ assignedTo: [] }, "ABC"), false);
  assert.equal(isLessonVisibleTo({}, "ABC"), false);
  assert.equal(isLessonVisibleTo({ audience: "assigned", assignedTo: [] }, "ABC"), false);
});

test("explicit audience all is visible to every student", () => {
  assert.equal(isLessonVisibleTo({ audience: "all" }, "ABC"), true);
  assert.equal(isLessonVisibleTo({ audience: "all", assignedTo: [] }, "XYZ"), true);
});

test("assigned lessons are visible only to listed students", () => {
  const lesson = { audience: "assigned", assignedTo: ["ABC"] };
  assert.equal(isLessonVisibleTo(lesson, "ABC"), true);
  assert.equal(isLessonVisibleTo(lesson, "XYZ"), false);
  assert.equal(isLessonVisibleTo(lesson, ""), false);
  assert.equal(isLessonVisibleTo(lesson, undefined), false);
});

test("malformed lessons are hidden", () => {
  assert.equal(isLessonVisibleTo(null, "ABC"), false);
  assert.equal(isLessonVisibleTo({ assignedTo: "ABC" }, "ABC"), false);
  assert.equal(isLessonVisibleTo({ audience: "ALL" }, "ABC"), false);
});
