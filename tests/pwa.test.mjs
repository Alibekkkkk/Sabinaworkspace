import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("PWA shell caches app pages and public dependencies only", () => {
  const worker = read("sw.js");
  const urls = JSON.parse(worker.match(/const SHELL_URLS = (\[[\s\S]*?\]);/)[1]);
  assert.ok(urls.includes("portal.html"));
  assert.ok(urls.includes("offline.html"));
  assert.ok(urls.includes("js/protected-content.js"));
  assert.ok(!urls.some(path => /protectedContent|studentProgress|sessions\//i.test(path)));
  assert.match(worker, /url\.origin !== scope\.origin/);
  assert.match(worker, /request\.method !== "GET"/);
  assert.match(read("manifest.webmanifest"), /"display": "standalone"/);
  for (const path of urls) {
    assert.ok(existsSync(fileURLToPath(new URL(path, root))), `${path} should be available to precache`);
  }
});

test("PWA manifest assets and offline page exist", () => {
  for (const path of [
    "manifest.webmanifest",
    "offline.html",
    "assets/pwa/icon.svg",
    "sw.js",
    "js/pwa.js"
  ]) {
    assert.ok(existsSync(fileURLToPath(new URL(path, root))), `${path} should exist`);
  }
  assert.match(read("offline.html"), /protected lesson data need an internet connection/);
  for (const path of [
    "index.html",
    "portal.html",
    "dashboard.html",
    "lesson.html",
    "lesson_abay.html",
    "lesson_gaziz.html",
    "homework.html",
    "practice.html",
    "clip.html",
    "manga.html"
  ]) {
    const page = read(path);
    assert.match(page, /rel="manifest" href="manifest\.webmanifest"/, `${path} should link the PWA manifest`);
    assert.match(page, /src="js\/pwa\.js"/, `${path} should register the service worker`);
  }
});
