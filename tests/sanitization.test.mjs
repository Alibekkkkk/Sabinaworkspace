import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(fileURLToPath(new URL(path, root)), "utf8");

test("lesson and homework sanitize rich content before inserting HTML", () => {
  for (const path of ["lesson.html", "homework.html"]) {
    const page = read(path);
    assert.match(page, /src="js\/sanitize-html\.js"/, `${path} should load the sanitizer`);
    assert.match(page, /sanitizeRichHtml\(savedHtml\)/, `${path} should sanitize saved annotations`);
  }
  assert.match(read("homework.html"), /sanitizeRichHtml\(m\.ex\)/);
  assert.equal((read("lesson.html").match(/sanitizeRichHtml\(item\.ex\)/g) || []).length, 2);
});

test("sanitizer allowlists formatting and strips active content and unsafe URLs", () => {
  const sanitizer = read("js/sanitize-html.js");
  assert.match(sanitizer, /allowedTags = new Set/);
  assert.match(sanitizer, /contentlessTags = new Set/);
  assert.match(sanitizer, /removeAttribute/);
  assert.match(sanitizer, /url\.protocol === "https:"/);
  assert.match(read("sw.js"), /"js\/sanitize-html\.js"/);
});
