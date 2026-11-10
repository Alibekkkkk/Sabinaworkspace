// End-to-end check of the lesson sections (content schema v3) against the local demo stack:  npm run dev  then
// node scripts/lesson-sections-e2e.mjs
// 1. The student's lesson lists Vocabulary, Word Match, Reading Comprehension, Games, Listening Training, Grammar I…N
//    (named after the topics) and Test Your Knowledge, with no Close Reading.
// 2. A grammar section shows its rule once and both of its exercises; answers score; Previous / Next follow the list.
// 3. Games and Listening Training open inside the lesson without the page's own header; a finished game marks Games done.
// 4. The whiteboard is a labelled button on every section.
// 5. The teacher's preview opens Games and Listening read-only, and the dashboard can show a lesson in its preview frame.
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { DEMO_STUDENTS, DEMO_TEACHER, seedEmulator } from "./seed-emulator.mjs";
import { buildLessonPlan } from "../js/lesson-plan.js";

const BASE = process.env.SITE || "http://127.0.0.1:5050/";
const DB = process.env.DB_HOST || "127.0.0.1:9000";
const NS = "sabina-s-workspace-default-rtdb";
const anna = DEMO_STUDENTS[0];
const content = JSON.parse(readFileSync(new URL(`../content/${anna.lessonId}.json`, import.meta.url), "utf8"));
const plan = buildLessonPlan(content);
const lessonUrl = `${BASE}lesson.html?code=${anna.code}&lesson=${anna.lessonId}`;
const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(path => path && (() => { try { readFileSync(path); return true; } catch { return false; } })());
if (!executable) throw new Error("No Chrome/Edge found. Set CHROME_PATH.");

const failures = [];
const check = (condition, message) => { console.log(`${condition ? "ok  " : "FAIL"} ${message}`); if (!condition) failures.push(message); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function rest(path, method = "GET", body) {
  const response = await fetch(`http://${DB}/${path}.json?ns=${NS}&access_token=owner`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  return response.json();
}
const sidebar = page => page.$$eval("#stageList .stage-sub-item", items => items.map(item => ({ label: item.textContent.replace(/^\S+\s+/, "").trim(), state: item.dataset.state })));
async function openSection(page, label) {
  await page.evaluate(text => { [...document.querySelectorAll("#stageList .stage-sub-item")].find(item => item.textContent.trim().endsWith(text)).click(); }, label);
  await sleep(800);
}
async function embeddedFrame(page, file) {
  await page.waitForSelector("#main iframe.embed-frame", { timeout: 15000 });
  for (let i = 0; i < 40; i++) {
    const frame = page.frames().find(item => item.url().includes(file));
    if (frame) { try { await frame.waitForFunction(() => document.getElementById("status") && !/^Loading/.test(document.getElementById("status").textContent), { timeout: 20000 }); return frame; } catch { /* retry */ } }
    await sleep(300);
  }
  return null;
}

await seedEmulator({ log: () => {} });
await rest(`sessions/${anna.code}/draft`, "DELETE");
await rest(`sessions/${anna.code}/state`, "DELETE");

const browser = await puppeteer.launch({ executablePath: executable, headless: true, args: ["--no-sandbox", "--lang=en-US"] });
try {
  // ---- student
  const student = await (await browser.createBrowserContext()).newPage();
  await student.setViewport({ width: 1280, height: 900 });
  student.on("dialog", dialog => dialog.accept());
  await student.goto(lessonUrl, { waitUntil: "networkidle2" });
  await student.waitForSelector("#stageList .stage-sub-item", { timeout: 30000 });
  const items = await sidebar(student);
  check(JSON.stringify(items.map(item => item.label)) === JSON.stringify(plan.map(section => section.label)), `the sidebar lists the plan in order (${items.map(item => item.label).join(" | ")})`);
  check(!items.some(item => /close reading/i.test(item.label)), "there is no Close Reading section");
  check(items.findIndex(item => item.label === "Listening Training") === 4 && items.at(-1).label === "Test Your Knowledge", "Listening Training is fifth and the test is last");

  // grammar section
  const grammar = plan.find(section => section.kind === "grammar");
  await openSection(student, grammar.label);
  const view = await student.evaluate(() => ({
    title: document.querySelector("#main h2")?.textContent, rules: document.querySelectorAll("#main .g-box").length,
    exercises: [...document.querySelectorAll("#main .grammar-exercise__title")].map(item => item.textContent),
    footer: [...document.querySelectorAll("#main .stage-footer button")].map(button => Number(button.dataset.stage))
  }));
  check(view.title === grammar.topic.title, `the grammar section is titled after its topic ("${view.title}")`);
  check(view.rules === 1, "the rule box appears once");
  check(view.exercises.length === grammar.exercises.length, `it shows its ${grammar.exercises.length} exercises (${view.exercises.join(", ")})`);
  const listening = plan.find(section => section.kind === "listening");
  const next = plan[plan.indexOf(grammar) + 1];
  check(view.footer[0] === listening.id && view.footer[1] === next.id, `Previous goes to Listening Training and Next to ${next.label}`);
  const first = content[grammar.exercises[0].key].pos[0];
  const firstInput = await student.$(`#p${grammar.exercises[0].scoreId}body .q-input`);
  await firstInput.type(first.a);
  await student.keyboard.press("Enter");
  await sleep(500);
  const live = await student.$eval(`#p${grammar.exercises[0].scoreId}live`, element => element.textContent);
  check(live === "1", `a correct answer scores in the first exercise (score ${live})`);

  // whiteboard button
  const whiteboard = await student.$eval("#wbToggle", button => ({ text: button.textContent.trim(), visible: button.getBoundingClientRect().width > 0 }));
  check(whiteboard.visible && /Whiteboard/.test(whiteboard.text), `the whiteboard is a labelled button ("${whiteboard.text}")`);

  // games inside the lesson
  await openSection(student, "Games");
  const games = await embeddedFrame(student, "practice.html");
  check(Boolean(games), "Games opens the practice page inside the lesson");
  if (games) {
    const inside = await games.evaluate(() => ({ embedded: document.documentElement.classList.contains("is-embedded"), cards: document.querySelectorAll(".game-card").length, back: getComputedStyle(document.querySelector(".practice-header > a")).display }));
    check(inside.embedded && inside.back === "none", "the embedded page hides its own header link");
    check(inside.cards > 0, `the lesson's games are listed (${inside.cards})`);
    await games.evaluate(() => window.parent.postMessage({ source: "learning-studio", type: "section-complete", section: "games", score: 4, total: 5 }, location.origin));
    await sleep(800);
    const after = (await sidebar(student)).find(item => item.label === "Games");
    check(after && (after.state === "done" || after.state === "mastered"), `a finished game marks Games done (${after && after.state})`);
    const height = await student.$eval("#main iframe.embed-frame", frame => frame.getBoundingClientRect().height);
    await sleep(2000);
    const again = await student.$eval("#main iframe.embed-frame", frame => frame.getBoundingClientRect().height);
    check(height >= 560 && Math.abs(again - height) <= 4, `the frame fits its content and does not keep growing (${Math.round(height)} → ${Math.round(again)} px)`);
  }
  // a message from another site is ignored
  await student.evaluate(() => window.dispatchEvent(new MessageEvent("message", { origin: "https://evil.example", data: { source: "learning-studio", type: "section-complete", section: "listening", score: 1, total: 1 } })));
  await sleep(300);
  const listeningState = (await sidebar(student)).find(item => item.label === "Listening Training");
  check(listeningState && listeningState.state !== "done", "a completion message from another site is ignored");

  await openSection(student, "Listening Training");
  const listen = await embeddedFrame(student, "listening.html");
  check(Boolean(listen), "Listening Training opens the listening page inside the lesson");

  // ---- teacher
  const teacher = await (await browser.createBrowserContext()).newPage();
  await teacher.setViewport({ width: 1280, height: 900 });
  await teacher.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await teacher.evaluate(async credentials => { await firebase.auth().signInWithEmailAndPassword(credentials.email, credentials.password); }, DEMO_TEACHER);
  await teacher.goto(`${lessonUrl}&teacher=1`, { waitUntil: "networkidle2" });
  await teacher.waitForSelector("#stageList .stage-sub-item", { timeout: 30000 });
  check((await sidebar(teacher)).length === plan.length, "the teacher preview lists the same sections");
  await openSection(teacher, "Games");
  const previewGames = await embeddedFrame(teacher, "practice.html");
  const previewSrc = await teacher.$eval("#main iframe.embed-frame", frame => frame.getAttribute("src"));
  check(/teacher=1/.test(previewSrc), "the teacher's Games frame opens as a preview");
  check(previewGames && (await previewGames.evaluate(() => document.querySelectorAll(".game-card").length)) > 0, "the teacher can see the student's games");
  await openSection(teacher, "Listening Training");
  const previewListening = await embeddedFrame(teacher, "listening.html");
  check(previewListening && (await previewListening.evaluate(() => !document.getElementById("lsSetup").hidden)), "the teacher can open the listening set, even as a draft");

  // dashboard preview frame
  await teacher.goto(`${BASE}dashboard.html`, { waitUntil: "networkidle2" });
  await teacher.evaluate(url => { document.getElementById("classworkFrame").src = url; }, `lesson.html?lesson=${anna.lessonId}&teacher=1&code=${anna.code}`);
  await sleep(6000);
  const framed = await teacher.evaluate(() => { const doc = document.getElementById("classworkFrame").contentDocument; return doc ? doc.querySelectorAll("#stageList .stage-sub-item").length : -1; });
  check(framed === plan.length, `the dashboard's preview frame shows the lesson (${framed} sections)`);
} finally {
  await browser.close();
}
if (failures.length) { console.log(`\n${failures.length} check(s) failed.`); process.exit(1); }
console.log("\nAll lesson section checks passed.");
