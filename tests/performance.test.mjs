import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { CSS_BUDGET, JS_BUDGET, pageReport, pages } from "../scripts/check-budgets.mjs";
import { apply } from "../scripts/build-preload.mjs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8").replace(/\r\n/g, "\n");

test("every page's own JavaScript and CSS stay inside the budget (gzipped, Firebase SDK excluded)", () => {
  for (const page of pages()) {
    const report = pageReport(page);
    assert.ok(report.js <= JS_BUDGET, `${page}: ${(report.js / 1024).toFixed(1)} kB of JavaScript is over ${JS_BUDGET / 1024} kB`);
    assert.ok(report.css <= CSS_BUDGET, `${page}: ${(report.css / 1024).toFixed(1)} kB of CSS is over ${CSS_BUDGET / 1024} kB`);
  }
});

test("the modulepreload hints in each page are generated and up to date", () => {
  for (const page of pages()) assert.equal(apply(read(page)), read(page), `${page}: run node scripts/build-preload.mjs`);
  assert.match(read("lesson.html"), /rel="modulepreload" href="js\/games\/progress\.js"|rel="modulepreload" href="js\/shell\.js"/);
});

test("the Firebase SDK never blocks rendering and its host is connected early", () => {
  for (const page of readdirSync(root).filter(name => name.endsWith(".html"))) {
    const html = read(page);
    const tags = html.match(/<script src="https:\/\/www\.gstatic\.com\/firebasejs[^>]*>/g) || [];
    if (!tags.length) continue;
    for (const tag of tags) assert.match(tag, /\bdefer\b/, `${page}: ${tag} must be deferred`);
    assert.match(html, /<link rel="preconnect" href="https:\/\/www\.gstatic\.com" crossorigin>/, `${page} should preconnect to the SDK host`);
    assert.ok(html.indexOf("rel=\"preconnect\"") < html.indexOf("firebasejs"), `${page}: preconnect comes before the SDK scripts`);
    const moduleAt = html.search(/<script type="module"/);
    assert.ok(moduleAt < 0 || moduleAt > html.lastIndexOf("firebasejs"), `${page}: deferred SDK scripts must come before module scripts so they run first`);
  }
});

test("the Lighthouse config asserts the agreed budgets", () => {
  const rc = JSON.parse(read("lighthouserc.json")).ci.assert.assertions;
  assert.equal(rc["largest-contentful-paint"][1].maxNumericValue, 2500); assert.equal(rc["cumulative-layout-shift"][1].maxNumericValue, 0.1); assert.equal(rc["total-blocking-time"][1].maxNumericValue, 200);
  for (const key of ["categories:performance", "categories:accessibility", "categories:best-practices"]) assert.equal(rc[key][1].minScore, 0.9);
});
