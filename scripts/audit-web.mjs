// Repeatable Lighthouse + axe-core baseline.
//   npm run audit:web                    (all pages, mobile + desktop)
//   npm run audit:web -- portal.html     (only the pages named)
// Needs a Chromium-based browser: set CHROME_PATH, or Chrome / Edge in their default Windows/macOS/Linux locations.
// Writes docs/LIGHTHOUSE.md and docs/audit/axe.json. Pages that need a signed-in student or teacher are
// audited in the state an anonymous visitor sees (sign-in / "access required"); `npm run dev` seeds data
// for manual testing of the signed-in views.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import axeCore from "axe-core";
import lighthouse, { desktopConfig } from "lighthouse";
import puppeteer from "puppeteer-core";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const PAGES = [
  ["Login / portal", "portal.html"], ["Placement", "placement.html"], ["Practice", "practice.html"], ["Clip Lab", "clip.html"],
  ["Manga reader", "manga.html"], ["Lesson", "lesson.html"], ["Homework", "homework.html"], ["Teacher dashboard", "dashboard.html"],
  ["Import tool", "tools/import-content.html"]
];
const requested = process.argv.slice(2);
const pages = requested.length ? PAGES.filter(([, path]) => requested.includes(path)) : PAGES;

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"
  ].filter(Boolean);
  const found = candidates.find(path => existsSync(path));
  if (!found) throw new Error("No Chrome/Edge found. Set CHROME_PATH to a Chromium-based browser.");
  return found;
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg" };
function serve() {
  const server = createServer((request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url, "http://x").pathname)).replace(/^([/\\])+/, "");
    const file = resolve(join(root, path || "index.html"));
    if (!file.startsWith(root + sep) || !existsSync(file) || /(^|[/\\])(node_modules|\.git)([/\\]|$)/.test(path)) { response.writeHead(404).end("Not found"); return; }
    response.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(readFileSync(file));
  });
  return new Promise(done => server.listen(0, "127.0.0.1", () => done(server)));
}

const percent = value => (value === null || value === undefined ? "–" : String(Math.round(value * 100)));

async function runLighthouse(url, port, formFactor) {
  const result = await lighthouse(url, { port, output: "json", logLevel: "error", onlyCategories: ["performance", "accessibility", "best-practices", "seo"] }, formFactor === "desktop" ? desktopConfig : undefined);
  const categories = result.lhr.categories;
  return { performance: categories.performance.score, accessibility: categories.accessibility.score, bestPractices: categories["best-practices"].score, seo: categories.seo.score };
}

async function runAxe(browser, url) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 390, height: 844 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
    await page.evaluate(axeCore.source);
    const results = await page.evaluate(() => axe.run(document, { resultTypes: ["violations"] }));
    return results.violations.map(violation => ({
      id: violation.id, impact: violation.impact, help: violation.help, nodes: violation.nodes.length,
      sample: violation.nodes.slice(0, 2).map(node => node.target.join(" "))
    }));
  } finally {
    await page.close();
  }
}

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true, args: ["--no-sandbox", "--remote-debugging-port=0"] });
const port = Number(new URL(browser.wsEndpoint()).port);

const rows = [];
const axeReport = {};
try {
  for (const [name, path] of pages) {
    const url = base + path;
    console.log(`Auditing ${path} ...`);
    const mobile = await runLighthouse(url, port, "mobile");
    const desktop = await runLighthouse(url, port, "desktop");
    const violations = await runAxe(browser, url);
    axeReport[path] = violations;
    rows.push({ name, path, mobile, desktop, violations });
  }
} finally {
  await browser.close();
  server.close();
}

let commit = "unknown";
try { commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root }).toString().trim(); } catch (error) { /* not a git checkout */ }
const browserVersion = (() => { try { return findBrowser(); } catch (error) { return "unknown"; } })();

const lines = [
  "# Lighthouse and axe baseline", "",
  `Commit: \`${commit}\` · Generated: ${new Date().toISOString()} · Browser: \`${browserVersion}\` · Served from a local static server (no CDN, no HTTP caching headers, no compression), so performance numbers are indicative, not production numbers.`, "",
  "Reproduce with `npm run audit:web` (optionally `-- portal.html placement.html`).", "",
  "Scores are Lighthouse 0-100. P = Performance, A = Accessibility, BP = Best Practices, SEO.", "",
  "| Page | Mobile P | A | BP | SEO | Desktop P | A | BP | SEO | axe serious/critical |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
];
for (const row of rows) {
  const serious = row.violations.filter(item => item.impact === "serious" || item.impact === "critical").length;
  lines.push(`| ${row.name} (\`${row.path}\`) | ${percent(row.mobile.performance)} | ${percent(row.mobile.accessibility)} | ${percent(row.mobile.bestPractices)} | ${percent(row.mobile.seo)} | ${percent(row.desktop.performance)} | ${percent(row.desktop.accessibility)} | ${percent(row.desktop.bestPractices)} | ${percent(row.desktop.seo)} | ${serious} |`);
}
lines.push("", "## axe-core violations (390px wide, anonymous visitor)", "");
for (const row of rows) {
  lines.push(`### ${row.name} (\`${row.path}\`)`, "");
  if (!row.violations.length) lines.push("No violations.", "");
  else {
    for (const item of row.violations) lines.push(`- **${item.impact}** \`${item.id}\` — ${item.help} (${item.nodes} element${item.nodes === 1 ? "" : "s"}; e.g. \`${item.sample.join("`, `")}\`)`);
    lines.push("");
  }
}
lines.push("## Scope and limits", "",
  "- `lesson.html`, `homework.html`, `dashboard.html` and the import tool need a signed-in student or teacher. Here they are measured in the state an anonymous visitor sees. Use `npm run dev` (Firebase emulators + seed data) to inspect the signed-in views by hand.",
  "- Lighthouse runs in a throttled simulated environment; re-run on the deployed site for production numbers.");
mkdirSync(join(root, "docs", "audit"), { recursive: true });
writeFileSync(join(root, "docs", "LIGHTHOUSE.md"), lines.join("\n") + "\n");
writeFileSync(join(root, "docs", "audit", "axe.json"), JSON.stringify(axeReport, null, 2) + "\n");
console.log("Wrote docs/LIGHTHOUSE.md and docs/audit/axe.json");
