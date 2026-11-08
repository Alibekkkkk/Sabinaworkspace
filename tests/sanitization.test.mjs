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

test("dashboard uses delegated actions and validates dynamic parameters", () => {
  const dashboard = read("js/pages/dashboard.js");
  assert.match(dashboard, /data-action="approve-pending-student" data-uid=/);
  assert.match(dashboard, /data-action="undo-teacher-action" data-id=/);
  assert.match(dashboard, /readActionParam\(element, "uid", \/\^\[A-Za-z0-9_-\]\{1,128\}\$\/\)/);
  assert.match(dashboard, /data-action="select-student" data-code="' \+ escapeHtml\(code\)/);

  const htmlHelper = dashboard.match(/function escapeHtml\(s\) \{[\s\S]*?\r?\n\}/);
  assert.ok(htmlHelper, "dashboard should define HTML-safe attribute encoding");
  const payload = `');alert(1)//<img src=x onerror="alert(2)">&`;
  const encoded = runInNewContext(`${htmlHelper[0]}\nescapeHtml(${JSON.stringify(payload)})`);
  assert.doesNotMatch(encoded, /[<>"']/);
  assert.match(encoded, /&#39;/);
});

test("lesson and homework use delegated actions for annotations and review", () => {
  const lesson = read("js/pages/lesson.js");
  const homework = read("js/pages/homework.js");
  assert.match(lesson, /data-action="edit-note" data-note-id=/);
  assert.match(lesson, /data-action="delete-note" data-note-id=/);
  assert.match(lesson, /data-action="flag-for-review"/);
  assert.match(homework, /data-action="edit-note" data-note-id=/);
  assert.match(homework, /data-action="delete-note" data-note-id=/);
  assert.match(lesson, /readActionParam\(element, "noteId", \/\^note_/);
  assert.match(homework, /readActionParam\(element, "noteId", \/\^note_/);
  assert.doesNotMatch(lesson, /onerror="this\.parentNode/);
  assert.match(lesson, /escapeHtml\(w\.emoji\|\|'📖'\)/);
  assert.match(lesson, /lEl\.innerHTML=.*escapeHtml\(title\)/);
  assert.match(lesson, /escapeHtml\(e\.message\)/);
});

test("student portal escapes lesson content and coerces scores to numbers", () => {
  const portal = read("js/pages/portal.js");
  assert.match(portal, /escapeHtml\(lesson\.icon \|\| '📘'\)/);
  assert.match(portal, /escapeHtml\(lesson\.title \|\| 'Untitled lesson'\)/);
  assert.match(portal, /Number\(state\.progress\.scores\[/);
  assert.match(portal, /escapeHtml\(code\)/);
});
