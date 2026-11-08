import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(fileURLToPath(new URL(path, root)), "utf8");

test("lesson and homework sanitize rich content before inserting HTML", () => {
  for (const [path, script] of [
    ["lesson.html", "js/pages/lesson.js"],
    ["homework.html", "js/pages/homework.js"]
  ]) {
    const page = read(path);
    const pageScript = read(script);
    assert.match(page, /src="js\/sanitize-html\.js"/, `${path} should load the sanitizer`);
    assert.match(page, /type="module" src=/, `${path} should load its page module`);
    assert.match(pageScript, /sanitizeRichHtml\(savedHtml\)/, `${path} should sanitize saved annotations`);
  }
  assert.match(read("js/pages/homework.js"), /sanitizeRichHtml\(m\.ex\)/);
  assert.equal((read("js/pages/lesson.js").match(/sanitizeRichHtml\(item\.ex\)/g) || []).length, 2);
});

test("sanitizer allowlists formatting and strips active content and unsafe URLs", () => {
  const sanitizer = read("js/sanitize-html.js");
  assert.match(sanitizer, /allowedTags = new Set/);
  assert.match(sanitizer, /contentlessTags = new Set/);
  assert.match(sanitizer, /removeAttribute/);
  assert.match(sanitizer, /url\.protocol === "https:"/);
  assert.match(read("sw.js"), /"js\/sanitize-html\.js"/);
});

test("dashboard encodes dynamic inline arguments and student codes", () => {
  const dashboard = read("js/pages/dashboard.js");
  assert.match(dashboard, /approvePendingStudent\(' \+ jsArg\(uid\)/);
  assert.match(dashboard, /undoTeacherAction\(\$\{jsArg\(item\.id\)\}, \$\{jsArg\(item\.undo\.type\)\}\)/);
  assert.match(dashboard, /value="' \+ escapeHtml\(code\) \+ '"'[\s\S]*escapeHtml\(studentsMap\[code\]\.name/);

  const htmlHelper = dashboard.match(/function escapeHtml\(s\) \{[\s\S]*?\r?\n\}/);
  const argumentHelper = dashboard.match(/function jsArg\(value\) \{[\s\S]*?\r?\n\}/);
  assert.ok(htmlHelper && argumentHelper, "dashboard should define HTML-safe JavaScript argument encoding");
  const payload = `');alert(1)//<img src=x onerror="alert(2)">&`;
  const encoded = runInNewContext(`${htmlHelper[0]}\n${argumentHelper[0]}\njsArg(${JSON.stringify(payload)})`);
  assert.doesNotMatch(encoded, /[<>"']/);
  const decoded = encoded
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
  assert.equal(JSON.parse(decoded), payload);
});

test("lesson and homework encode annotation IDs and teacher-review arguments", () => {
  const lesson = read("js/pages/lesson.js");
  const homework = read("js/pages/homework.js");
  assert.match(lesson, /openExistingNote\(\$\{jsArg\(targetNote\.dataset\.id\)\}\)/);
  assert.match(lesson, /deleteNoteById\(\$\{jsArg\(targetNote\.dataset\.id\)\}\)/);
  assert.match(lesson, /jsArg\(String\(prompt\)\.substring/);
  assert.match(homework, /openExistingNote\(\$\{jsArg\(targetNote\.dataset\.id\)\}\)/);
  assert.match(homework, /deleteNoteById\(\$\{jsArg\(targetNote\.dataset\.id\)\}\)/);
  assert.doesNotMatch(lesson, /onerror="this\.parentNode/);
  assert.match(lesson, /escapeHtml\(w\.emoji\|\|'📖'\)/);
  assert.match(lesson, /lEl\.innerHTML=.*escapeHtml\(title\)/);
  assert.match(lesson, /escapeHtml\(e\.message\)/);
  assert.match(lesson, /undoVocabWord\('\+jsArg\(quizWord\)/);
});

test("student portal escapes lesson content and coerces scores to numbers", () => {
  const portal = read("js/pages/portal.js");
  assert.match(portal, /escapeHtml\(lesson\.icon \|\| '📘'\)/);
  assert.match(portal, /escapeHtml\(lesson\.title \|\| 'Untitled lesson'\)/);
  assert.match(portal, /Number\(state\.progress\.scores\[/);
  assert.match(portal, /escapeHtml\(code\)/);
});
