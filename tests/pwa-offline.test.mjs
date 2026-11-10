import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { JSDOM } from "jsdom";
import { EXCLUDED, collectPrecache, generatedBlock, referencedFiles, versionOf } from "../scripts/build-sw-manifest.mjs";
import { DISCONNECTED_TEXT, OFFLINE_TEXT, SYNCED_TEXT, watchConnection } from "../js/shell.js";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const worker = read("sw.js").replace(/\r\n/g, "\n");
const shell = JSON.parse(worker.match(/const SHELL_URLS = (\[[\s\S]*?\]);/)[1]);

test("the precache list in sw.js is generated from the file tree and is up to date", () => {
  const block = worker.slice(worker.indexOf("// BEGIN GENERATED"), worker.indexOf("// END GENERATED") + "// END GENERATED".length);
  assert.equal(block, generatedBlock(), "run: node scripts/build-sw-manifest.mjs");
  assert.match(worker, /const CACHE_VERSION = "[0-9a-f]{10}"/);
  assert.equal(JSON.stringify(shell), JSON.stringify(collectPrecache()));
  assert.equal(versionOf(shell).length, 10);
});

test("every file a page or script points at is either precached or deliberately left out", () => {
  const cached = new Set(shell);
  const runtime = path => /^content\//.test(path); // lesson, clip and listening data and audio are cached as they are used
  const missing = referencedFiles().filter(path => !cached.has(path) && !runtime(path) && !EXCLUDED.some(pattern => pattern.test(path)));
  assert.deepEqual(missing, [], "add the file to the tree the generator walks, or to EXCLUDED with a reason");
  for (const path of shell) assert.ok(existsSync(fileURLToPath(new URL(path, root))), `${path} should exist`);
  for (const must of ["portal.html", "offline.html", "js/pwa.js", "js/shell.js", "manifest.webmanifest", "content/manifest.json", "assets/pwa/icon-192.png", "js/manga/reader-ui.js", "js/whiteboard/app.js"]) assert.ok(cached.has(must), `${must} must be precached`);
  assert.ok(!shell.some(path => /^(tests|docs|scripts|tools|legacy|node_modules)\//.test(path)), "development files are never precached");
  assert.ok(!shell.some(path => /protectedContent|studentProgress|sessions\//i.test(path)));
});

test("the service worker has versioned caches, the right strategy for each kind, and never touches sign-in or partial media", () => {
  for (const name of ["SHELL_CACHE", "CONTENT_CACHE", "AUDIO_CACHE", "IMAGE_CACHE"]) assert.match(worker, new RegExp(`const ${name} = `));
  assert.match(worker, /SHELL_CACHE = `\$\{CACHE_PREFIX\}shell-\$\{CACHE_VERSION\}`/, "the shell cache name carries the version");
  assert.match(worker, /shellFirst\(request, key\.href, isDocument, scope\)/); assert.doesNotMatch(worker, /staleWhileRevalidate/, "pages and scripts never mix versions"); assert.match(worker, /networkFirst\(request, CONTENT_CACHE\)/); assert.match(worker, /cacheFirst\(request, AUDIO_CACHE, MAX_AUDIO\)/); assert.match(worker, /cacheFirst\(request, IMAGE_CACHE, MAX_IMAGES\)/);
  assert.match(worker, /const MAX_AUDIO = \d+/); assert.match(worker, /const MAX_IMAGES = \d+/); assert.match(worker, /async function trim/);
  assert.match(worker, /request\.method !== "GET"/); assert.match(worker, /url\.origin !== scope\.origin/);
  assert.match(worker, /relativePath\.startsWith\("__\/"\)/); assert.match(worker, /request\.headers\.has\("range"\)/);
  assert.match(worker, /offline\.html/);
  assert.doesNotMatch(worker.slice(worker.indexOf('addEventListener("install"'), worker.indexOf('addEventListener("message"')), /skipWaiting/, "an update waits for the student's go-ahead");
  assert.match(worker, /type === "SKIP_WAITING"/);
  assert.match(worker, /key\.startsWith\(`\$\{CACHE_PREFIX\}shell-`\) && key !== SHELL_CACHE/, "old shell caches are removed on activate");
  assert.doesNotMatch(worker.replace(/\/\/.*$/gm, ""), /protectedContent|identitytoolkit|firebaseio/i, "no rule touches protected content or Firebase");
});

test("the manifest has PNG and maskable icons of the right size, and shortcuts that exist", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(manifest.display, "standalone"); assert.ok(manifest.start_url && manifest.id && manifest.theme_color && manifest.background_color);
  const size = path => { const bytes = readFileSync(new URL(path, root)); assert.equal(bytes.subarray(1, 4).toString(), "PNG", `${path} is a PNG`); return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]; };
  const byPurpose = (purpose, sizes) => manifest.icons.find(icon => icon.purpose === purpose && icon.sizes === sizes && icon.type === "image/png");
  assert.deepEqual(size(byPurpose("any", "192x192").src), [192, 192]); assert.deepEqual(size(byPurpose("any", "512x512").src), [512, 512]); assert.deepEqual(size(byPurpose("maskable", "512x512").src), [512, 512]);
  assert.deepEqual(size("assets/pwa/apple-touch-icon.png"), [180, 180]);
  assert.deepEqual(manifest.shortcuts.map(item => item.name), ["Lesson", "Practice", "Whiteboard"]);
  for (const item of manifest.shortcuts) assert.ok(existsSync(fileURLToPath(new URL(item.url.split("#")[0], root))), `${item.url} exists`);
  for (const icon of manifest.icons) assert.ok(existsSync(fileURLToPath(new URL(icon.src, root))), `${icon.src} exists`);
});

// ---- the connection banner ---------------------------------------------------------------------------------------------------------------------------------
function withDom(run) {
  const dom = new JSDOM("<!doctype html><body><main></main></body>", { url: "https://example.test/", pretendToBeVisual: true, runScripts: "outside-only" });
  const previous = { document: globalThis.document, window: globalThis.window, navigator: globalThis.navigator };
  Object.defineProperty(globalThis, "document", { value: dom.window.document, configurable: true });
  Object.defineProperty(globalThis, "window", { value: dom.window, configurable: true });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  const done = () => { for (const [key, value] of Object.entries(previous)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }); };
  return Promise.resolve(run(dom)).finally(done);
}
const fakeDb = () => { const listeners = {}; return { ref: path => ({ on: (event, callback) => { listeners[path] = callback; } }), set: value => listeners[".info/connected"]({ val: () => value }), offset: value => listeners[".info/serverTimeOffset"]({ val: () => value }) }; };

test("the banner follows the database connection: warning on a drop, 'saved' on return, then gone", () => withDom(async () => {
  const db = fakeDb(); watchConnection(db, { hideAfter: 20 });
  const banner = document.getElementById("offlineBanner"); const text = () => banner.querySelector("p").textContent;
  assert.equal(banner.hidden, true, "hidden while the browser says it is online");
  db.set(false); assert.equal(banner.hidden, true, "a first 'not connected' before any connection is just the page starting up");
  db.set(true); assert.equal(banner.hidden, true);
  db.set(false); assert.equal(banner.hidden, false); assert.equal(text(), DISCONNECTED_TEXT);
  db.set(true); assert.equal(banner.hidden, false); assert.equal(text(), SYNCED_TEXT);
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(banner.hidden, true); assert.equal(text(), OFFLINE_TEXT);
  assert.match(OFFLINE_TEXT, /do not close this page/i, "the offline message does not promise more than the page can keep");
}));

// ---- the update flow ------------------------------------------------------------------------------------------------------------------------------------------
test("a waiting version shows 'New version available' and Reload asks it to take over", () => withDom(async dom => {
  const posted = []; const listeners = {};
  const waiting = { postMessage: message => posted.push(message) };
  const registration = { waiting, installing: null, addEventListener() {} };
  Object.defineProperty(dom.window.navigator, "serviceWorker", { configurable: true, value: { controller: {}, register: () => Promise.resolve(registration), addEventListener: (name, callback) => { listeners[name] = callback; } } });
  dom.window.eval(read("js/pwa.js"));
  dom.window.dispatchEvent(new dom.window.Event("load"));
  await new Promise(resolve => setTimeout(resolve, 20));
  const banner = document.getElementById("updateBanner");
  assert.ok(banner, "the banner appears"); assert.match(banner.textContent, /New version available/);
  assert.equal(banner.getAttribute("role"), "status");
  [...banner.querySelectorAll("button")].find(button => button.textContent === "Reload").click();
  assert.equal(JSON.stringify(posted), JSON.stringify([{ type: "SKIP_WAITING" }]));
  assert.equal(typeof listeners.controllerchange, "function", "the page reloads once the new version has taken over");
}));

test("the first install shows no banner", () => withDom(async dom => {
  const registration = { waiting: { postMessage() {} }, installing: null, addEventListener() {} };
  Object.defineProperty(dom.window.navigator, "serviceWorker", { configurable: true, value: { controller: null, register: () => Promise.resolve(registration), addEventListener() {} } });
  dom.window.eval(read("js/pwa.js"));
  dom.window.dispatchEvent(new dom.window.Event("load"));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(document.getElementById("updateBanner"), null);
}));
