// Accessibility sweep of the main pages in both themes (Lime Night, Lime Light) with axe-core, against the local demo
// stack:  npm run dev  then  node scripts/a11y-sweep.mjs
// It signs in as the demo teacher (dashboard, previews, tools) and as a demo student (portal after sign-in, practice,
// listening, clips), and reports every WCAG 2.2 A/AA violation axe finds. Exit 1 when any are found.
import { existsSync } from "node:fs";
import axeCore from "axe-core";
import puppeteer from "puppeteer-core";
import { DEMO_STUDENTS, DEMO_TEACHER, seedEmulator } from "./seed-emulator.mjs";

const BASE = process.env.SITE || "http://127.0.0.1:5050/";
const anna = DEMO_STUDENTS[0];
const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(path => path && existsSync(path));
if (!executable) throw new Error("No Chrome/Edge found. Set CHROME_PATH.");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const TEACHER_PAGES = [
  ["dashboard", "dashboard.html"],
  ["lesson (teacher preview)", `lesson.html?lesson=${anna.lessonId}&teacher=1&code=${anna.code}`],
  ["import tool", "tools/import-content.html"],
  ["listening from a recording", `tools/listening-recording.html?lesson=${anna.lessonId}`]
];
const STUDENT_PAGES = [
  ["portal (signed in)", "portal.html"],
  ["lesson", `lesson.html?code=${anna.code}&lesson=${anna.lessonId}`],
  ["homework", `homework.html?code=${anna.code}&lesson=${anna.homeworkId}`],
  ["practice", `practice.html?code=${anna.code}&lesson=${anna.lessonId}`],
  ["listening", `listening.html?code=${anna.code}&lesson=${anna.lessonId}`],
  ["clips", `clips.html?code=${anna.code}`]
];

async function scan(page, label, path, theme) {
  await page.evaluate(mode => { try { localStorage.setItem("ls-theme", mode); } catch (error) { /* ignore */ } }, theme).catch(() => {});
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2" });
  await page.evaluate(mode => { if (window.LSTheme) window.LSTheme.set(mode); }, theme);
  await sleep(2500);
  await page.evaluate(axeCore.source);
  const result = await page.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }, resultTypes: ["violations"] }));
  return result.violations.map(violation => ({ page: label, theme, id: violation.id, impact: violation.impact, count: violation.nodes.length, example: violation.nodes[0] && (violation.nodes[0].target.join(" ") + " — " + (violation.nodes[0].failureSummary || "").replace(/\s+/g, " ").slice(0, 160)) }));
}

await seedEmulator({ log: () => {} });
const browser = await puppeteer.launch({ executablePath: executable, headless: true, args: ["--no-sandbox", "--lang=en-US"] });
const findings = [];
try {
  const teacher = await (await browser.createBrowserContext()).newPage();
  await teacher.setViewport({ width: 1280, height: 900 });
  await teacher.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await teacher.evaluate(async credentials => { await firebase.auth().signInWithEmailAndPassword(credentials.email, credentials.password); }, DEMO_TEACHER);
  for (const theme of ["dark", "light"]) for (const [label, path] of TEACHER_PAGES) findings.push(...await scan(teacher, label, path, theme));

  const student = await (await browser.createBrowserContext()).newPage();
  await student.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await student.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await student.evaluate(code => { document.getElementById("loginCode").value = code; document.querySelector('[data-action="login"]').click(); }, anna.code);
  await student.waitForFunction(() => getComputedStyle(document.getElementById("lessonsScreen")).display !== "none", { timeout: 20000 });
  for (const theme of ["dark", "light"]) for (const [label, path] of STUDENT_PAGES) findings.push(...await scan(student, label, path, theme));
} finally {
  await browser.close();
}
for (const finding of findings) console.log(`FAIL ${finding.page} [${finding.theme}] ${finding.id} (${finding.impact}, ${finding.count}): ${finding.example}`);
console.log(findings.length ? `\n${findings.length} violation type(s) found.` : "\nNo accessibility violations found on any page in either theme.");
process.exit(findings.length ? 1 : 0);
