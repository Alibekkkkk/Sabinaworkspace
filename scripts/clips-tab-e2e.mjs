// The Clips tab and the clip hooks, against the local demo stack:  npm run dev  then  npm run test:clips-tab-e2e
// A student with three clip lessons (one due soon, one finished, one locked until next week): the Clips page lists them with
// level, kind and grammar filters, due dates and stars; the lesson links to its clip; the teacher dashboard shows completion,
// time, saved words and the lines the student found hard. Also axe, a phone layout and a clean console.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import axeCore from "axe-core";
import { addProtectedClipAnswers, validateClip } from "../js/clips/schema.js";
import { DEMO_STUDENTS, DEMO_TEACHER, seedEmulator } from "./seed-emulator.mjs";

const BASE = process.env.SITE || "http://127.0.0.1:5050/";
const DB = process.env.DB_HOST || "127.0.0.1:9000";
const NS = "sabina-s-workspace-default-rtdb";
const anna = DEMO_STUDENTS[0];
const sample = JSON.parse(readFileSync(new URL("../docs/clips/sample-clip.json", import.meta.url), "utf8"));
const answers = JSON.parse(readFileSync(new URL("../docs/clips/sample-clip.answers.json", import.meta.url), "utf8"));
const SHOTS = new URL("../docs/screenshots/phase6/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
mkdirSync(SHOTS, { recursive: true });
const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(path => existsSync(path));
if (!executable) throw new Error("No Chrome/Edge found. Set CHROME_PATH.");
const failures = [];
const check = (condition, message) => { console.log(`${condition ? "ok  " : "FAIL"} ${message}`); if (!condition) failures.push(message); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, ms = 8000, step = 60) { const end = Date.now() + ms; while (Date.now() < end) { const value = await fn(); if (value) return value; await sleep(step); } return false; }
async function rest(path, method = "GET", body) {
  const response = await fetch(`http://${DB}/${path}.json?ns=${NS}&access_token=owner`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  return response.json();
}
const DAY = 86400000;
const variant = (id, title, level, genre, grammar) => addProtectedClipAnswers(validateClip({ ...sample, id, title, level, genre: [genre], grammarPoints: grammar }, { requireAnswers: false }), answers);
const clips = {
  sabina: { lesson: { title: "Floods lesson", clipId: "sample-flood-night", order: 1, dueAt: Date.now() + 2 * DAY }, clip: variant("sample-flood-night", "A flood night", "B1", "documentary", ["past simple"]) },
  "clip-routines": { lesson: { title: "Daily routines", clipId: "cartoon-routines", order: 2 }, clip: variant("cartoon-routines", "Daily routines cartoon", "A2", "cartoon", ["present simple"]) },
  "clip-film": { lesson: { title: "What if", clipId: "film-whatif", order: 3, availableFrom: Date.now() + 7 * DAY }, clip: variant("film-whatif", "A film scene", "B2", "film", ["conditionals"]) }
};

await seedEmulator({ log: () => {} });
for (const node of ["studentProgress", "sessions"]) await rest(`${node}/${anna.code}`, "DELETE");
for (const [lessonId, { lesson, clip }] of Object.entries(clips)) {
  await rest(`studentCurriculum/${anna.code}/${lessonId}`, "PATCH", { ...lesson, published: true, audience: "assigned", year: "2026", month: "November" });
  await rest(`curriculum/${lessonId}`, "PATCH", { ...lesson, published: true, audience: "assigned", assignedTo: [anna.code], year: "2026", month: "November" }); // the teacher's own copy, which the dashboard reads
  await rest(`protectedContent/${lessonId}/clip`, "PUT", { sourceFile: `clips/${clip.id}.json`, content: clip });
}

const browser = await puppeteer.launch({ executablePath: executable, headless: true, args: ["--no-sandbox", "--lang=en-US"] });
const problems = [];
const watch = (page, label) => {
  page.on("pageerror", error => { console.log(`pageerror: ${error.message}`); problems.push(`${label} pageerror: ${error.message}`); });
  page.on("console", message => { const text = message.text(); if (message.type() === "error" && !/favicon|Tracking Prevention|404|Failed to load resource/i.test(text)) problems.push(`${label}: ${text}`); });
};
try {
  const studentContext = await browser.createBrowserContext(); const student = await studentContext.newPage(); watch(student, "student");
  await student.setViewport({ width: 1440, height: 900 });
  await student.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await student.waitForSelector("#loginCode");
  await student.evaluate(code => { document.getElementById("rememberMe").checked = true; document.getElementById("loginCode").value = code; document.querySelector('[data-action="login"]').click(); }, anna.code);
  await student.waitForFunction(() => getComputedStyle(document.getElementById("lessonsScreen")).display !== "none", { timeout: 20000 });

  await student.goto(`${BASE}clips.html?code=${anna.code}`, { waitUntil: "networkidle2" });
  await student.waitForSelector(".cl-card", { timeout: 20000 });
  const titles = () => student.evaluate(() => [...document.querySelectorAll("#clList .cl-card h2")].map(h => h.textContent));
  await until(async () => (await titles()).length === 2);
  check(await student.evaluate(() => [...document.querySelectorAll(".ds-bottom-nav a")].some(a => /Clips/.test(a.textContent) && /clips\.html$/.test(a.getAttribute("href")) && a.getAttribute("aria-current") === "page")), "the Clips tab in the bottom bar opens this page and is marked as the current one");
  check(JSON.stringify(await titles()) === JSON.stringify(["A flood night", "Daily routines cartoon"]), `two clips are open, the one that is due first (${JSON.stringify(await titles())})`);
  check(await student.evaluate(() => /Due in 2 days/.test(document.querySelector("#clList .cl-card").textContent)), "the due date from the schedule is shown");
  check(await student.evaluate(() => !document.getElementById("clSoon").hidden && /What if/.test(document.getElementById("clSoonList").textContent) && /Locked until/.test(document.getElementById("clSoonList").textContent) && !document.querySelector("#clSoonList a")), "a clip that opens next week is listed as coming up, locked, without a start button");
  check(await student.evaluate(() => /Showing 2 of 2 clips/.test(document.getElementById("clCount").textContent)), "the count is announced");
  const options = id => student.evaluate(sel => [...document.querySelectorAll(`#${sel} option`)].map(o => o.textContent), id);
  check(JSON.stringify(await options("fLevel")) === JSON.stringify(["All levels", "A2", "B1"]), "the level filter offers only the levels that exist for this student");
  check((await options("fGenre")).includes("cartoon") && (await options("fGenre")).includes("documentary") && !(await options("fGenre")).includes("film"), "the kind filter offers cartoon and documentary (the locked film is not offered)");
  await student.select("#fLevel", "A2");
  check(JSON.stringify(await titles()) === JSON.stringify(["Daily routines cartoon"]), "choosing level A2 narrows the list");
  await student.select("#fLevel", ""); await student.select("#fGenre", "documentary");
  check(JSON.stringify(await titles()) === JSON.stringify(["A flood night"]), "choosing the kind documentary narrows the list");
  await student.select("#fGenre", ""); await student.select("#fGrammar", "present simple");
  check(JSON.stringify(await titles()) === JSON.stringify(["Daily routines cartoon"]), "the grammar filter works");
  await student.select("#fGrammar", "");
  await student.select("#fLevel", "A2"); await student.select("#fGenre", "documentary");
  check(await student.evaluate(() => /No clips match/.test(document.getElementById("status").textContent) && document.querySelectorAll("#clList .cl-card").length === 0), "filters that match nothing say so");
  await student.select("#fLevel", ""); await student.select("#fGenre", "");

  // finishing a clip shows stars; the filter for done and to do follows
  await rest(`studentProgress/${anna.code}/clips/cartoon-routines`, "PUT", { title: "Daily routines cartoon", completedAt: Date.now(), score: 9, total: 10, stars: 3, lastStars: 3, attempts: 1, seconds: 240, weakLines: ["l3"], interactive: true });
  check(await until(() => student.evaluate(() => /Done ★★★/.test(document.body.textContent))), "a finished clip shows its stars, live");
  check(JSON.stringify(await titles()) === JSON.stringify(["A flood night", "Daily routines cartoon"]), "finished clips sort after the ones still to do");
  await student.evaluate(() => document.querySelector('input[name="fStatus"][value="done"]').click());
  check(JSON.stringify(await titles()) === JSON.stringify(["Daily routines cartoon"]), "the Done filter shows only finished clips");
  await student.evaluate(() => document.querySelector('input[name="fStatus"][value="todo"]').click());
  check(JSON.stringify(await titles()) === JSON.stringify(["A flood night"]), "the To do filter shows only the rest");
  await student.evaluate(() => document.querySelector('input[name="fStatus"][value="all"]').click());

  await student.evaluate(axeCore.source);
  const violations = await student.evaluate(() => axe.run(document.querySelector("main"), { resultTypes: ["violations"] }).then(r => r.violations.map(v => `${v.impact}:${v.id}:${v.nodes.length}`)));
  check(violations.length === 0, `axe finds no problems on the Clips page (${violations.join(", ") || "none"})`);
  await student.screenshot({ path: `${SHOTS}clips-tab-desktop.png` });
  await student.setViewport({ width: 390, height: 844 }); await sleep(250);
  check(await student.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), "the Clips page fits a 390 px phone");
  await student.screenshot({ path: `${SHOTS}clips-tab-phone.png` });
  await student.setViewport({ width: 1440, height: 900 });

  // opening a clip from the list, and the lesson's own link
  await student.evaluate(() => document.querySelector("#clList .cl-card a").click());
  await student.waitForSelector(".transcript-line", { timeout: 20000 });
  check(await student.evaluate(() => /lesson=sabina/.test(location.search) && /All clips/.test(document.getElementById("clipsLink").textContent) && /clips\.html\?code=/.test(document.getElementById("clipsLink").getAttribute("href"))), "Start the clip opens it, with a link back to all clips");
  await student.goto(`${BASE}lesson.html?code=${anna.code}&lesson=sabina`, { waitUntil: "networkidle2" });
  await student.waitForSelector("#stageList .stage-sub-item", { timeout: 25000 });
  await student.evaluate(() => [...document.querySelectorAll("#stageList .stage-sub-item")].find(item => item.textContent.includes("Vocabulary")).click());
  check(await until(() => student.evaluate(() => { const link = document.querySelector(".gl-clip a"); return Boolean(link) && /clip\.html\?code=DEMOA001&lesson=sabina&from=lesson/.test(link.getAttribute("href")); })), "the lesson's vocabulary stage offers its clip");
  await student.goto(`${BASE}clip.html?code=${anna.code}&lesson=sabina&from=lesson`, { waitUntil: "networkidle2" });
  await student.waitForSelector(".transcript-line", { timeout: 20000 });
  check(await student.evaluate(() => /lesson\.html\?code=DEMOA001&lesson=sabina/.test(document.getElementById("backLink").getAttribute("href")) && /Back to the lesson/.test(document.getElementById("backLink").textContent)), "and the clip leads back to the lesson");

  // the teacher's view
  await rest(`studentProgress/${anna.code}/clips/sample-flood-night`, "PUT", { title: "A flood night", completedAt: Date.now(), score: 6, total: 10, stars: 1, lastStars: 1, attempts: 2, seconds: 600, weakLines: ["l3"], interactive: true });
  await rest(`studentProgress/${anna.code}/vocabulary`, "PATCH", { sandbags: { word: "sandbags", sourceClipId: "sample-flood-night" }, volunteers: { word: "volunteers", sourceClipId: "sample-flood-night" } });
  await seedEmulatorTeacher();
  const teacherContext = await browser.createBrowserContext(); const teacher = await teacherContext.newPage(); watch(teacher, "teacher");
  await teacher.setViewport({ width: 1440, height: 1000 });
  await teacher.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await teacher.evaluate(async credentials => { await firebase.auth().signInWithEmailAndPassword(credentials.email, credentials.password); }, DEMO_TEACHER);
  await teacher.goto(`${BASE}dashboard.html`, { waitUntil: "networkidle2" });
  await teacher.waitForSelector(".student-item", { timeout: 25000 });
  await teacher.evaluate(code => document.querySelector(`.student-item[data-code="${code}"]`).click(), anna.code);
  check(await until(() => teacher.evaluate(() => /2 of 2 clips finished|clips? finished/.test(document.getElementById("clipSummary").textContent)), 12000), "the dashboard's Clip Lab card shows how many clips are finished");
  const card = await teacher.evaluate(() => document.getElementById("clipSummary").innerText);
  check(/A flood night/.test(card) && /★☆☆ 6 of 10/.test(card) && /2 attempts/.test(card) && /10 min on the clip/.test(card) && /2 words saved/.test(card), `with stars, score, attempts, time on the clip and saved words (${card.replace(/\n/g, " | ").slice(0, 200)})`);
  check(await until(() => teacher.evaluate(() => /Yes, and the shops closed early\./.test(document.getElementById("clipSummary").textContent))), "and the transcript line the student found hard, in words");
  await teacher.evaluate(() => document.getElementById("clipCard").scrollIntoView());
  await teacher.screenshot({ path: `${SHOTS}clip-dashboard-card.png` });
  check(problems.length === 0, `no console errors (${problems.slice(0, 3).join(" | ") || "none"})`);
  await teacherContext.close(); await studentContext.close();
} finally {
  await browser.close();
  // leave the demo data as it was found, so the other end-to-end scripts see the same lessons
  for (const lessonId of ["clip-routines", "clip-film"]) for (const node of ["curriculum", `studentCurriculum/${anna.code}`, "protectedContent"]) await rest(`${node}/${lessonId}`, "DELETE");
  await rest(`curriculum/sabina/clipId`, "DELETE");
}
async function seedEmulatorTeacher() { /* the teacher account already exists from the first seed; a new browser context signs in again */ }
if (failures.length) { console.log(`\n${failures.length} check(s) failed.`); process.exit(1); }
console.log("\nAll Clips tab checks passed.");
