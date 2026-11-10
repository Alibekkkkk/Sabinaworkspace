// "Check for lesson updates" in the import tool: comparing a file with its stored copy, and finding a lesson's files.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canonical, compareCopy, lessonFiles, sameContent } from "../js/content-sync.js";

test("the stored copy matches its file even though the database sorts keys and drops empty values", () => {
  const file = { title: "A", items: [{ b: 2, a: 1 }], notes: [], extra: {}, gone: null, text: "" };
  const stored = { items: [{ a: 1, b: 2 }], text: "", title: "A" };
  assert.ok(sameContent(file, stored));
  assert.deepEqual(canonical({ x: [], y: {}, z: null }), undefined);
  assert.ok(!sameContent({ title: "A" }, { title: "B" }));
  const lesson = JSON.parse(readFileSync(new URL("../content/george.json", import.meta.url), "utf8"));
  assert.ok(sameContent(lesson, JSON.parse(JSON.stringify(lesson))));
  const edited = structuredClone(lesson); edited.readingQ[0].prompt = "Changed by the teacher";
  assert.ok(!sameContent(lesson, edited), "an Edit question change is a difference");
});

test("a lesson's files come from its curriculum links first, then the manifest", () => {
  assert.deepEqual(lessonFiles({ classworkFile: "gaziz.json", homeworkFile: "homework_gaziz.json" }, {}), { classwork: "gaziz.json", homework: "homework_gaziz.json" });
  assert.deepEqual(lessonFiles({ classworkFile: "gaziz.json" }, { classworkContentUrl: "content/george.json" }), { classwork: "george.json", homework: null });
  assert.deepEqual(lessonFiles({}, { contentUrl: "content/homework_george.json" }), { classwork: null, homework: "homework_george.json" });
  assert.deepEqual(lessonFiles({ classworkFile: "../secret.json" }, {}), { classwork: null, homework: null }, "only plain file names");
});

test("each copy is new, changed or the same", () => {
  assert.equal(compareCopy("l1", "classwork", "a.json", { a: 1 }, null).status, "new");
  assert.equal(compareCopy("l1", "classwork", "a.json", { a: 1 }, { content: { a: 2 } }).status, "changed");
  assert.equal(compareCopy("l1", "classwork", "a.json", { a: 1, b: [] }, { content: { a: 1 } }).status, "same");
});

test("the import tool wires every update button on its own (the manga button used to wait for the clip button)", () => {
  const page = readFileSync(new URL("../js/pages/tools-import-content.js", import.meta.url), "utf8");
  const clip = page.indexOf('updateClipsButton.addEventListener("click"');
  const manga = page.indexOf('updateMangaButton.addEventListener("click"');
  const clipEnd = page.indexOf("\n    });", clip);
  assert.ok(manga > clipEnd, "the manga handler is not inside the clip handler");
  assert.match(page, /checkLessonsButton\.addEventListener\("click"/);
  assert.match(page, /updateLessonsButton\.addEventListener\("click"/);
});
