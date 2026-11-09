// The game layer in the real lesson player:  npm run dev  then  npm run test:lesson-games-e2e
// Off, light and full mode on one student's lesson, set from the teacher dashboard: no change when off, mission lines and
// the card map when light, Error Hunt and the Boss Battle final test when full (same questions, same one attempt rule,
// same score), stage XP saved, axe on the new parts, and a clean console.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import axeCore from "axe-core";
import { DEMO_STUDENTS, DEMO_TEACHER, seedEmulator } from "./seed-emulator.mjs";

const BASE = process.env.SITE || "http://127.0.0.1:5050/";
const DB = process.env.DB_HOST || "127.0.0.1:9000";
const NS = "sabina-s-workspace-default-rtdb";
const anna = DEMO_STUDENTS[0];
const content = JSON.parse(readFileSync(new URL("../content/sabina.json", import.meta.url), "utf8"));
const sample = JSON.parse(readFileSync(new URL("../docs/games/sample-lesson.json", import.meta.url), "utf8"));
content.errorHunt = sample.errorHunt;
const SHOTS = new URL("../docs/screenshots/phase5/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
mkdirSync(SHOTS, { recursive: true });
const lessonUrl = `${BASE}lesson.html?code=${anna.code}&lesson=${anna.lessonId}`;
const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(path => existsSync(path));
if (!executable) throw new Error("No Chrome/Edge found. Set CHROME_PATH.");
const failures = [];
const check = (condition, message) => { console.log(`${condition ? "ok  " : "FAIL"} ${message}`); if (!condition) failures.push(message); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, ms = 8000, step = 80) { const end = Date.now() + ms; while (Date.now() < end) { const value = await fn(); if (value) return value; await sleep(step); } return false; }
async function rest(path, method = "GET", body) {
  const response = await fetch(`http://${DB}/${path}.json?ns=${NS}&access_token=owner`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  return response.json();
}

await seedEmulator({ log: () => {} });
await rest(`protectedContent/${anna.lessonId}/classwork`, "PUT", { sourceFile: "sabina.json", content });
for (const node of ["sessions", "studentProgress"]) await rest(`${node}/${anna.code}`, "DELETE");
await rest(`studentCurriculum/${anna.code}/${anna.lessonId}/gameMode`, "PUT", "off");

const browser = await puppeteer.launch({ executablePath: executable, headless: true, args: ["--no-sandbox"] });
const problems = [];
const watch = (page, label) => {
  page.on("pageerror", error => problems.push(`${label} pageerror: ${error.message}`));
  page.on("console", message => { const text = message.text(); if (message.type() === "error" && !/favicon|Tracking Prevention|404|Failed to load resource/i.test(text)) problems.push(`${label}: ${text}`); });
  page.on("dialog", dialog => dialog.accept());
};
try {
  // ---- the teacher's control on the dashboard
  const teacherContext = await browser.createBrowserContext();
  const teacher = await teacherContext.newPage(); watch(teacher, "teacher");
  await teacher.setViewport({ width: 1440, height: 1000 });
  await teacher.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await teacher.evaluate(async credentials => { await firebase.auth().signInWithEmailAndPassword(credentials.email, credentials.password); }, DEMO_TEACHER);
  await teacher.goto(`${BASE}dashboard.html`, { waitUntil: "networkidle2" });
  await teacher.waitForSelector(".student-item", { timeout: 25000 });
  await teacher.evaluate(code => document.querySelector(`.student-item[data-code="${code}"]`).click(), anna.code);
  await teacher.waitForSelector('#gameModeHost input[type="radio"]:not([disabled])', { timeout: 15000 });
  check(await teacher.evaluate(() => document.querySelector('#gameModeHost input[value="off"]').checked), "the dashboard shows the lesson's current game mode");
  const setMode = async mode => { await teacher.evaluate(value => document.querySelector(`#gameModeHost input[value="${value}"]`).click(), mode); return until(async () => (await rest(`studentCurriculum/${anna.code}/${anna.lessonId}/gameMode`)) === mode); };

  // ---- the student
  const studentContext = await browser.createBrowserContext();
  const student = await studentContext.newPage(); watch(student, "student");
  await student.setViewport({ width: 1440, height: 900 });
  await student.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await student.waitForSelector("#loginCode");
  await student.evaluate(code => { document.getElementById("rememberMe").checked = true; document.getElementById("loginCode").value = code; document.querySelector('[data-action="login"]').click(); }, anna.code);
  await student.waitForFunction(() => getComputedStyle(document.getElementById("lessonsScreen")).display !== "none", { timeout: 20000 });
  const openLesson = async () => { await student.goto(lessonUrl, { waitUntil: "networkidle2" }); await student.waitForSelector("#stageList .stage-sub-item", { timeout: 25000 }); await student.waitForSelector(".stage-view", { timeout: 15000 }); await sleep(400); };
  const openStage = async label => { await student.evaluate(text => [...document.querySelectorAll("#stageList .stage-sub-item")].find(item => item.textContent.includes(text)).click(), label); await sleep(500); };

  await openLesson();
  check(await student.evaluate(() => !document.querySelector(".gl-mission, .gl-extra, .gl-epic")), "mode OFF: the lesson shows no game layer at all");
  await openStage("Test Your Knowledge");
  check(await student.evaluate(() => /Start the test/.test(document.getElementById("testRoot").textContent) && !/Boss Battle/.test(document.getElementById("testRoot").textContent)), "mode OFF: the final test offers only the classic start");

  check(await setMode("light"), "the teacher can switch the lesson to light mode");
  await openLesson(); await openStage("Vocabulary");
  check(await student.evaluate(() => Boolean(document.querySelector(".gl-mission")) && /collect all the cards/i.test(document.querySelector(".gl-mission").textContent)), "mode LIGHT: stage 1 shows its mission");
  check(await student.evaluate(() => /Cards collected: 0 of 20/.test(document.querySelector(".gl-mission").textContent) && document.querySelectorAll(".gl-card").length === 20), "with a card map of all 20 words, none collected yet");
  check(await student.evaluate(() => [...document.querySelectorAll(".gl-card")].every(card => /collected|in progress|not started/.test(card.textContent))), "each card says its state in words, not only colour");
  check(await student.evaluate(() => Boolean(document.querySelector("#flashGrid .flash-card, #flashGrid > *"))), "the classic flashcards are still there under the mission");
  await student.evaluate(() => { document.querySelector(".gl-deckmap").open = true; });
  await student.screenshot({ path: `${SHOTS}lesson-light-stage1.png` });
  await openStage("Word Match");
  check(await student.evaluate(() => /link every word/i.test(document.querySelector(".gl-mission").textContent) && Boolean(document.getElementById("ddWords"))), "every stage gets its own mission and keeps its content (Word Match)");
  await openStage("Test Your Knowledge");
  check(await student.evaluate(() => !/Boss Battle/.test(document.getElementById("testRoot").textContent)), "mode LIGHT: no Boss Battle yet");
  await openStage("Interactive Video");
  check(await student.evaluate(() => !document.querySelector(".gl-extra")), "mode LIGHT: no extra games yet");

  check(await setMode("full"), "the teacher can switch the lesson to full game mode");
  await openLesson();
  await openStage("Interactive Video");
  check(await student.evaluate(() => Boolean(document.querySelector(".gl-extra")) && /Error Hunt/.test(document.querySelector(".gl-extra summary").textContent)), "mode FULL: the reading stage offers Error Hunt as extra practice");
  const stageBefore = await rest(`sessions/${anna.code}/state/scores`);
  await student.evaluate(() => { document.querySelector(".gl-extra").open = true; });
  await student.waitForSelector(".gl-extra .gm-token", { timeout: 10000 });
  for (const [key, fix] of [["2", "goes"], ["2", "have"], ["3", "see"]]) {
    await student.waitForFunction(() => document.querySelector(".gl-extra .gm-token:not([disabled])"));
    await student.evaluate(() => document.querySelector(".gl-extra .gm-token-focus-anchor, .gl-extra .gm-hint")?.focus?.());
    await student.keyboard.press(key);
    await student.waitForFunction(() => document.activeElement && document.activeElement.classList.contains("gm-input"));
    await student.keyboard.type(fix); await student.keyboard.press("Enter");
    await student.waitForFunction(() => /Next|Finish/.test(document.activeElement?.textContent || "")); await student.keyboard.press("Enter");
  }
  check(await until(() => student.evaluate(() => /You got 3 of 3 right/.test(document.querySelector(".gl-extra").textContent))), "Error Hunt plays inside the lesson with the keyboard (3 of 3)");
  check(JSON.stringify(await rest(`sessions/${anna.code}/state/scores`)) === JSON.stringify(stageBefore), "and it does not touch the stage score");
  check(await until(async () => { const p = await rest(`studentProgress/${anna.code}`); return p && p.stats && p.stats.hunts >= 3; }), "but the fixes count towards progress and badges");
  await student.evaluate(axeCore.source);
  const violations = await student.evaluate(() => axe.run(document.querySelector(".gl-mission").parentElement, { resultTypes: ["violations"] }).then(r => r.violations.filter(v => /gl-|gm-/.test(JSON.stringify(v.nodes.map(n => n.html)))).map(v => `${v.impact}:${v.id}`)));
  check(violations.length === 0, `axe finds no problems in the new game parts (${violations.join(", ") || "none"})`);

  // ---- the final test as a Boss Battle
  await openStage("Test Your Knowledge");
  check(await student.evaluate(() => /Boss Battle/.test(document.getElementById("testRoot").textContent) && /Start the test/.test(document.getElementById("testRoot").textContent)), "mode FULL: the final test offers both the classic start and a Boss Battle");
  await student.evaluate(() => [...document.querySelectorAll("#testRoot button")].find(b => /Boss Battle/.test(b.textContent)).click());
  await student.waitForSelector("#testRoot .gm-boss", { timeout: 10000 });
  check(await student.evaluate(() => /Time left: \d\d:\d\d/.test(document.getElementById("testRoot").textContent) && /one attempt/.test(document.getElementById("testRoot").textContent)), "the Boss Battle shows the test's own time limit and the one-attempt rule");
  const bank = new Map();
  for (const q of content.testMcq) bank.set(q.q, { kind: "choice", answer: q.correct });
  for (const q of content.testTfng) bank.set(q.q, { kind: "choice", answer: q.answer });
  for (const q of content.testShort) bank.set(q.q, { kind: "typed", answer: q.answers[0] });
  for (const q of content.testComplete) bank.set(q.p || q.prompt, { kind: "typed", answer: q.a || q.answer });
  const total = bank.size; let answered = 0; let missedOn = 0;
  while (answered < total) {
    await student.waitForFunction(() => document.querySelector("#testRoot .gm-prompt"), { timeout: 10000 });
    const prompt = await student.evaluate(() => document.querySelector("#testRoot .gm-prompt").textContent);
    const entry = bank.get(prompt); if (!entry) throw new Error(`Unknown question: ${prompt}`);
    const wrong = answered === 3 || answered === 17; // two deliberate mistakes
    if (wrong) missedOn += 1;
    if (entry.kind === "choice") {
      const index = await student.evaluate(({ answer, wrong }) => { const texts = [...document.querySelectorAll("#testRoot .gm-option")].map(b => b.textContent.replace(/^\d+\.\s*/, "")); const right = texts.indexOf(answer); return wrong ? (right === 0 ? 1 : 0) : right; }, { answer: entry.answer, wrong });
      await student.keyboard.press(String(index + 1));
    } else {
      await student.waitForFunction(() => document.activeElement && document.activeElement.classList.contains("gm-input"));
      await student.keyboard.type(wrong ? "zzz" : entry.answer); await student.keyboard.press("Enter");
    }
    await student.waitForFunction(() => /Next|See results/.test(document.activeElement?.textContent || ""), { timeout: 10000 });
    answered += 1;
    await student.keyboard.press("Enter");
    await sleep(60);
  }
  check(await until(() => student.evaluate(() => /test-result|Test complete/.test(document.getElementById("testRoot").innerHTML)), 10000), "the classic result screen appears when the Boss Battle ends");
  const resultText = await student.evaluate(() => document.getElementById("testRoot").innerText);
  const expectedCorrect = total - missedOn;
  check(new RegExp(`${expectedCorrect}\\s*/\\s*${total}`).test(resultText), `it reports ${expectedCorrect} of ${total}, counted from the same answers (${resultText.split("\n").filter(Boolean).slice(0, 3).join(" | ")})`);
  const session = await rest(`sessions/${anna.code}/state`);
  check(session.done && session.done[`${anna.lessonId}_9`] === true && session.scores[`${anna.lessonId}_9`] === Math.round((expectedCorrect / total) * 10), `the stage is marked done with the same scoring as the classic test (score ${session.scores && session.scores[`${anna.lessonId}_9`]})`);
  await openLesson(); await openStage("Test Your Knowledge");
  check(await student.evaluate(() => !/Start the test|Boss Battle/.test(document.getElementById("testRoot").textContent)), "after finishing, the test cannot be started again (one attempt)");
  const progress = await rest(`studentProgress/${anna.code}`);
  check(Object.values(progress.attempts || {}).some(a => a.gameId === "lesson-stage-9") && progress.xp > 0, `finishing the test paid stage XP (${progress.xp} XP)`);
  await student.screenshot({ path: `${SHOTS}lesson-full-test-done.png` });

  check(await setMode("off"), "the teacher can switch back to the classic lesson");
  await openLesson();
  check(await student.evaluate(() => !document.querySelector(".gl-mission, .gl-extra")), "and the game layer disappears again");
  check(problems.length === 0, `no console errors (${problems.slice(0, 3).join(" | ") || "none"})`);
  await teacherContext.close(); await studentContext.close();
} finally {
  await browser.close();
}
if (failures.length) { console.log(`\n${failures.length} check(s) failed.`); process.exit(1); }
console.log("\nAll lesson game checks passed.");
