import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { graph, pages } from "../scripts/check-budgets.mjs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const hosting = JSON.parse(read("firebase.json")).hosting;
const rule = source => hosting.headers.find(entry => entry.source === source);
const header = (entry, key) => (entry.headers.find(item => item.key.toLowerCase() === key.toLowerCase()) || {}).value;
const global = rule("**");
const parse = policy => Object.fromEntries(policy.split(";").map(part => part.trim()).filter(Boolean).map(part => { const [name, ...values] = part.split(/\s+/); return [name, values]; }));
const UNUSED_FONT_HOSTS = new Set(["https://fonts.googleapis.com", "https://fonts.gstatic.com"]); // allowed by some page policies, never loaded by any page

test("every response carries the security headers", () => {
  assert.ok(hosting && global, "firebase.json has a hosting block with a rule for every path");
  const csp = parse(header(global, "Content-Security-Policy"));
  assert.deepEqual(csp["frame-ancestors"], ["'self'"], "the dashboard previews lessons in a same-site iframe");
  assert.deepEqual(csp["object-src"], ["'none'"]); assert.deepEqual(csp["base-uri"], ["'self'"]); assert.deepEqual(csp["default-src"], ["'self'"]);
  assert.doesNotMatch(header(global, "Content-Security-Policy"), /unsafe-inline|unsafe-eval/);
  assert.equal(header(global, "X-Content-Type-Options"), "nosniff"); assert.equal(header(global, "X-Frame-Options"), "SAMEORIGIN");
  assert.equal(header(global, "Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(header(global, "Cross-Origin-Opener-Policy"), "same-origin-allow-popups", "same-origin would break the Google sign-in popup");
  assert.match(header(global, "Strict-Transport-Security"), /max-age=(\d{8,})/); assert.ok(Number(header(global, "Strict-Transport-Security").match(/max-age=(\d+)/)[1]) >= 31536000);
});

test("the header policy allows everything each page's own policy asks for, except fonts nobody loads", () => {
  const allowed = parse(header(global, "Content-Security-Policy"));
  for (const page of [...readdirSync(root).filter(name => name.endsWith(".html")), "tools/import-content.html"]) {
    const meta = (read(page).match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1]; if (!meta) continue;
    for (const [name, sources] of Object.entries(parse(meta))) for (const source of sources) {
      if (UNUSED_FONT_HOSTS.has(source)) continue;
      assert.ok((allowed[name] || allowed["default-src"]).includes(source), `${page}: ${name} ${source} is not allowed by the header policy, so the page would break once it is deployed`);
    }
  }
});

test("the microphone is blocked everywhere except the pages that can use speech recognition", () => {
  assert.match(header(global, "Permissions-Policy"), /microphone=\(\)/); assert.match(header(global, "Permissions-Policy"), /camera=\(\)/); assert.match(header(global, "Permissions-Policy"), /geolocation=\(\)/);
  const exception = hosting.headers.find(entry => /microphone=\(self\)/.test(header(entry, "Permissions-Policy") || "") && entry !== global);
  assert.ok(exception, "one rule allows the microphone for the pages that need it");
  const listed = exception.source.match(/@\(([^)]+)\)/)[1].split("|").map(name => `${name}.html`).sort();
  const needing = pages().filter(page => { const html = read(page); return [...html.matchAll(/<script type="module" src="([^"]+)"/g)].some(match => { const found = graph(match[1]); return [...found.eager, ...found.lazy].includes("js/listening/speaking.js"); }); }).sort();
  assert.deepEqual(listed, needing, "the pages named in firebase.json are exactly the pages whose code can ask for the microphone");
});

test("the service worker is never cached by the browser, and development files are not published", () => {
  assert.match(header(rule("/sw.js"), "Cache-Control"), /no-cache/);
  for (const pattern of ["**/node_modules/**", "tests/**", "scripts/**", "docs/**", "database.rules.json", "package.json", "**/.*", "*.log"]) assert.ok(hosting.ignore.includes(pattern), `${pattern} is not published`);
  assert.ok(!hosting.ignore.some(pattern => pattern !== "content/_snapshots/**" && /^(tools|content|js|css|assets)\//.test(pattern)), "the files the site needs are published (old content snapshots are the one exception)");
});
