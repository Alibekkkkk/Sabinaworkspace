import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const pages = [
  "index.html",
  "legacy/index.html",
  "portal.html",
  "dashboard.html",
  "lesson.html",
  "lesson_abay.html",
  "lesson_gaziz.html",
  "homework.html",
  "practice.html",
  "clip.html",
  "manga.html",
  "tools/import-content.html"
];

test("application pages apply the shared CSP baseline", () => {
  for (const path of pages) {
    const html = readFileSync(fileURLToPath(new URL(path, root)), "utf8");
    assert.match(html, /http-equiv="Content-Security-Policy"/, `${path} should set a CSP`);
    assert.match(html, /object-src 'none'/, `${path} should block plugin content`);
    assert.match(html, /base-uri 'self'/, `${path} should restrict base URLs`);
    assert.match(html, /https:\/\/www\.gstatic\.com/, `${path} should allow Firebase SDK assets`);
    assert.match(html, /https:\/\/\*\.firebasedatabase\.app/, `${path} should allow regional Realtime Database connections`);
  }
});
