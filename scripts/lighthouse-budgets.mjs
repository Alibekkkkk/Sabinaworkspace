// Mobile Lighthouse against the performance budgets:  npm run perf:budgets  (optionally  -- portal.html lesson.html)
// Serves the folder locally, runs Lighthouse (mobile emulation, simulated 4G and a 4x slower CPU) on each page and checks
//   LCP < 2.5 s, CLS < 0.1, TBT < 200 ms (the lab stand-in for INP), and the category scores listed in lighthouserc.json.
// Prints a table and writes docs/PERFORMANCE.md. Exit code 1 when a budget is missed. Pages are audited as an anonymous
// visitor sees them; the signed-in pages are covered by  npm run audit:signed-in.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import lighthouse from "lighthouse";
import puppeteer from "puppeteer-core";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const rc = JSON.parse(readFileSync(join(root, "lighthouserc.json"), "utf8"));
const MIN = { performance: 0.9, accessibility: 0.9, "best-practices": 0.9 };
const LIMITS = { lcp: 2500, cls: 0.1, tbt: 200 };
const PAGES = rc.ci.collect.url.map(url => new URL(url).pathname.replace(/^\//, ""));
const requested = process.argv.slice(2).filter(arg => !arg.startsWith("--"));
const pages = requested.length ? PAGES.filter(page => requested.includes(page)) : PAGES;
const browserPath = [process.env.CHROME_PATH, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(path => existsSync(path));
if (!browserPath) throw new Error("No Chrome/Edge found. Set CHROME_PATH.");

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg" };
const server = createServer((request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  const file = resolve(join(root, path || "index.html"));
  if (!file.startsWith(root + sep) || !existsSync(file) || /(^|[/\\])(node_modules|\.git)([/\\]|$)/.test(path)) { response.writeHead(404).end("Not found"); return; }
  const type = TYPES[extname(file)] || "application/octet-stream";
  const body = readFileSync(file);
  if (/^(text|application\/json|image\/svg|application\/manifest)/.test(type) && /gzip/.test(request.headers["accept-encoding"] || "")) response.writeHead(200, { "content-type": type, "content-encoding": "gzip", vary: "accept-encoding" }).end(gzipSync(body));
  else response.writeHead(200, { "content-type": type }).end(body);
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ["--no-sandbox"] });
const port = Number(new URL(browser.wsEndpoint()).port);
const rows = []; let failed = 0;
try {
  for (const page of pages) {
    const { lhr } = await lighthouse(base + page, { port, output: "json", logLevel: "error", onlyCategories: ["performance", "accessibility", "best-practices"] });
    const audit = id => lhr.audits[id].numericValue;
    const row = { page, performance: lhr.categories.performance.score, accessibility: lhr.categories.accessibility.score, bestPractices: lhr.categories["best-practices"].score, lcp: audit("largest-contentful-paint"), cls: audit("cumulative-layout-shift"), tbt: audit("total-blocking-time"), fcp: audit("first-contentful-paint") };
    row.misses = [];
    if (row.lcp >= LIMITS.lcp) row.misses.push(`LCP ${(row.lcp / 1000).toFixed(2)} s`);
    if (row.cls >= LIMITS.cls) row.misses.push(`CLS ${row.cls.toFixed(3)}`);
    if (row.tbt >= LIMITS.tbt) row.misses.push(`TBT ${Math.round(row.tbt)} ms`);
    for (const [key, name] of [["performance", "performance"], ["accessibility", "accessibility"], ["bestPractices", "best-practices"]]) if (row[key] < MIN[name]) row.misses.push(`${name} ${Math.round(row[key] * 100)}`);
    if (row.misses.length) failed += 1; rows.push(row);
    console.log(`${page.padEnd(18)} P${Math.round(row.performance * 100)} A${Math.round(row.accessibility * 100)} BP${Math.round(row.bestPractices * 100)}  LCP ${(row.lcp / 1000).toFixed(2)}s  CLS ${row.cls.toFixed(3)}  TBT ${Math.round(row.tbt)}ms${row.misses.length ? `   MISSES: ${row.misses.join(", ")}` : ""}`);
  }
} finally { await browser.close(); server.close(); }

const table = ["| Page | Performance | Accessibility | Best practices | FCP | LCP | CLS | TBT | Misses |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map(r => `| \`${r.page}\` | ${Math.round(r.performance * 100)} | ${Math.round(r.accessibility * 100)} | ${Math.round(r.bestPractices * 100)} | ${(r.fcp / 1000).toFixed(2)} s | ${(r.lcp / 1000).toFixed(2)} s | ${r.cls.toFixed(3)} | ${Math.round(r.tbt)} ms | ${r.misses.join(", ") || "none"} |`)].join("\n");
if (!requested.length) {
  writeFileSync(join(root, "docs", "PERFORMANCE.md"), `# Performance\n\nGenerated ${new Date().toISOString().slice(0, 10)} by \`npm run perf:budgets\`: Lighthouse, mobile emulation with simulated 4G and a 4x slower CPU, pages as an anonymous visitor sees them, served from a local static server (no CDN, gzip like GitHub Pages and Firebase Hosting, no HTTP caching), so absolute numbers are indicative. Budgets: LCP under 2.5 s, CLS under 0.1, TBT under 200 ms (the lab measure that stands in for INP), and scores of 90 or more for performance, accessibility and best practices. SEO is not asserted: every page carries \`noindex\` on purpose because this is a private class portal.\n\nScript sizes per page: \`npm run check:budgets\` (150 kB gzipped of our own JavaScript per page, excluding the Firebase SDK).\n\n${table}\n${existsSync(join(root, "docs", "PERFORMANCE-NOTES.md")) ? `\n${readFileSync(join(root, "docs", "PERFORMANCE-NOTES.md"), "utf8")}` : ""}`);
}
process.exit(failed ? 1 : 0);
