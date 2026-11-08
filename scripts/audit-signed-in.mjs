// Lighthouse + axe for the pages that need a signed-in user, against the local demo site.
//   1. npm run dev            (emulators + demo data + site on :5050)
//   2. npm run audit:signed-in
// Writes docs/LIGHTHOUSE-SIGNED-IN.md. The student signs in with "remember me" so the session lives in
// IndexedDB and is visible to Lighthouse's own navigation; storage is not reset between runs.
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import axeCore from "axe-core";
import lighthouse, { desktopConfig } from "lighthouse";
import puppeteer from "puppeteer-core";
import { DEMO_STUDENTS, DEMO_TEACHER, seedEmulator } from "./seed-emulator.mjs";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const BASE = process.env.SITE || "http://127.0.0.1:5050/";
const anna = DEMO_STUDENTS[0];
const TARGETS = [
  { name: "Lesson", path: `lesson.html?code=${anna.code}&lesson=${anna.lessonId}`, role: "student", ready: "#stageList .stage-sub-item" },
  { name: "Homework", path: `homework.html?code=${anna.code}&lesson=${anna.homeworkId}`, role: "student", ready: ".q-card" },
  { name: "Teacher dashboard", path: "dashboard.html", role: "teacher", ready: ".student-item" }
];

function findBrowser() {
  const found = [process.env.CHROME_PATH, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(path => existsSync(path));
  if (!found) throw new Error("No Chrome/Edge found. Set CHROME_PATH.");
  return found;
}

async function signIn(page, role) {
  await page.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await page.evaluate(() => firebase.auth().signOut().catch(() => {}));
  if (role === "teacher") {
    await page.evaluate(async credentials => { await firebase.auth().signInWithEmailAndPassword(credentials.email, credentials.password); }, DEMO_TEACHER);
    return;
  }
  await page.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await page.waitForSelector("#loginCode");
  await page.evaluate(code => { document.getElementById("rememberMe").checked = true; document.getElementById("loginCode").value = code; document.querySelector('[data-action="login"]').click(); }, anna.code);
  await page.waitForFunction(() => getComputedStyle(document.getElementById("lessonsScreen")).display !== "none", { timeout: 20000 });
}

async function measure(url, port, formFactor) {
  const result = await lighthouse(url, { port, output: "json", logLevel: "error", disableStorageReset: true, onlyCategories: ["performance", "accessibility", "best-practices", "seo"] }, formFactor === "desktop" ? desktopConfig : undefined);
  const categories = result.lhr.categories;
  return { performance: categories.performance.score, accessibility: categories.accessibility.score, bestPractices: categories["best-practices"].score, seo: categories.seo.score, finalUrl: result.lhr.finalDisplayedUrl };
}

await seedEmulator({ log: () => {} });
const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true, args: ["--no-sandbox", "--remote-debugging-port=0"] });
const port = Number(new URL(browser.wsEndpoint()).port);
const rows = [];
try {
  for (const role of ["student", "teacher"]) {
    const page = await browser.newPage();
    await signIn(page, role);
    for (const target of TARGETS.filter(entry => entry.role === role)) {
      const url = BASE + target.path;
      console.log(`Auditing ${target.name} (${role}) ...`);
      const mobile = await measure(url, port, "mobile");
      const desktop = await measure(url, port, "desktop");
      await page.setViewport({ width: 390, height: 844 });
      await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
      await page.waitForSelector(target.ready, { timeout: 25000 });
      await page.evaluate(axeCore.source);
      const results = await page.evaluate(() => axe.run(document, { resultTypes: ["violations"] }));
      const violations = results.violations.map(violation => ({ id: violation.id, impact: violation.impact, help: violation.help, nodes: violation.nodes.length, sample: violation.nodes.slice(0, 2).map(node => node.target.join(" ")) }));
      const signedIn = await page.evaluate(() => !document.body.textContent.includes("Teacher sign-in required") && !document.body.textContent.includes("could not be opened") && !document.body.textContent.includes("We could not open"));
      rows.push({ ...target, mobile, desktop, violations, signedIn });
    }
    await page.close();
  }
} finally {
  await browser.close();
}

let commit = "unknown";
try { commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root }).toString().trim(); } catch (error) { /* not a git checkout */ }
const score = value => (value === null || value === undefined ? "-" : String(Math.round(value * 100)));
const lines = [
  "# Lighthouse and axe: signed-in pages", "",
  `Commit: \`${commit}\` + working tree · Generated: ${new Date().toISOString()} · Measured against the local demo site (\`npm run dev\`) as the seeded student / teacher, so performance numbers are indicative (no CDN, no compression).`, "",
  "Reproduce: `npm run dev`, then `npm run audit:signed-in`.", "",
  "| Page | Content loaded | Mobile P | A | BP | SEO | Desktop P | A | BP | SEO | axe serious/critical |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map(row => `| ${row.name} | ${row.signedIn ? "yes" : "**NO (not signed in)**"} | ${score(row.mobile.performance)} | ${score(row.mobile.accessibility)} | ${score(row.mobile.bestPractices)} | ${score(row.mobile.seo)} | ${score(row.desktop.performance)} | ${score(row.desktop.accessibility)} | ${score(row.desktop.bestPractices)} | ${score(row.desktop.seo)} | ${row.violations.filter(item => item.impact === "serious" || item.impact === "critical").length} |`),
  "", "## axe-core violations (390px wide, signed in)", ""
];
for (const row of rows) {
  lines.push(`### ${row.name}`, "");
  if (!row.violations.length) lines.push("No violations.", "");
  else { for (const item of row.violations) lines.push(`- **${item.impact}** \`${item.id}\` — ${item.help} (${item.nodes} element${item.nodes === 1 ? "" : "s"}; e.g. \`${item.sample.join("`, `")}\`)`); lines.push(""); }
}
lines.push("SEO is low on purpose: the pages carry `noindex, nofollow` because this is a private class portal.");
writeFileSync(join(root, "docs", "LIGHTHOUSE-SIGNED-IN.md"), lines.join("\n") + "\n");
console.log("Wrote docs/LIGHTHOUSE-SIGNED-IN.md");
