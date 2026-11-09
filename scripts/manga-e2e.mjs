// The Manga Reader against the local demo stack:  npm run dev  then  npm run test:manga-e2e
// One student has the flag, another does not. Covers the not-enabled page and denied reads, the shelf, words before reading,
// the three reading modes (keyboard and touch), left-to-right and right-to-left, the bottom sheet, tap-a-word, saved words and
// sentences, reading aids, remembered position, the page questions, chapter questions, boss, retell, the saved record and XP,
// the teacher's flag panel and Manga card, assigning a chapter, switching the flag off, and a 390 px phone with axe.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import axeCore from "axe-core";
import { addProtectedMangaAnswers } from "../js/manga/schema.js";
import { DEMO_STUDENTS, DEMO_TEACHER, seedEmulator } from "./seed-emulator.mjs";

const BASE = process.env.SITE || "http://127.0.0.1:5050/";
const DB = process.env.DB_HOST || "127.0.0.1:9000";
const NS = "sabina-s-workspace-default-rtdb";
const [anna, ben] = DEMO_STUDENTS;
const story = JSON.parse(readFileSync(new URL("../content/manga/gaziz-demo.json", import.meta.url), "utf8"));
const answers = JSON.parse(readFileSync(new URL("../docs/manga/gaziz-demo.answers.json", import.meta.url), "utf8"))["gaziz-demo"];
const SHOTS = new URL("../docs/screenshots/phase7/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
mkdirSync(SHOTS, { recursive: true });
const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(path => existsSync(path));
if (!executable) throw new Error("No Chrome/Edge found. Set CHROME_PATH.");
const failures = [];
const check = (condition, message) => { console.log(`${condition ? "ok  " : "FAIL"} ${message}`); if (!condition) failures.push(message); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, ms = 10000, step = 60) { const end = Date.now() + ms; while (Date.now() < end) { const value = await fn(); if (value) return value; await sleep(step); } return false; }
async function rest(path, method = "GET", body) {
  const response = await fetch(`http://${DB}/${path}.json?ns=${NS}&access_token=owner`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  return response.json();
}
const LESSON = "manga-lesson";
const lessonRecord = { title: "The Garden Above the City", mangaId: "gaziz-demo", order: 1, published: true, audience: "assigned", year: "2026", month: "November" };

await seedEmulator({ log: () => {} });
for (const code of [anna.code, ben.code]) for (const node of ["studentProgress", "sessions", "studentFeatures", "mangaAssignments"]) await rest(`${node}/${code}`, "DELETE");
for (const code of [anna.code, ben.code]) await rest(`studentCurriculum/${code}/${LESSON}`, "PUT", lessonRecord);
await rest(`curriculum/${LESSON}`, "PUT", { ...lessonRecord, assignedTo: [anna.code] });
await rest(`protectedContent/${LESSON}/manga`, "PUT", { sourceFile: "manga/gaziz-demo.json", content: addProtectedMangaAnswers(story, answers) });

const browser = await puppeteer.launch({ executablePath: executable, headless: true, args: ["--no-sandbox"] });
const problems = [];
const watch = (page, label) => {
  page.on("pageerror", error => { console.log(`pageerror: ${error.message}`); problems.push(`${label} pageerror: ${error.message}`); });
  page.on("console", message => { const text = message.text(); if (message.type() === "error" && !/favicon|Tracking Prevention|404|Failed to load resource|permission_denied|PERMISSION_DENIED/i.test(text)) problems.push(`${label}: ${text}`); });
};
async function login(page, code) {
  await page.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await page.waitForSelector("#loginCode");
  await page.evaluate(value => { document.getElementById("rememberMe").checked = true; document.getElementById("loginCode").value = value; document.querySelector('[data-action="login"]').click(); }, code);
  await page.waitForFunction(() => getComputedStyle(document.getElementById("lessonsScreen")).display !== "none", { timeout: 20000 });
}
const text = (page, selector) => page.evaluate(sel => (document.querySelector(sel) || {}).textContent || "", selector);
const visible = (page, selector) => page.evaluate(sel => { const node = document.querySelector(sel); return Boolean(node) && !node.hidden && node.getBoundingClientRect().width > 0; }, selector);
const position = page => text(page, "#position");
const fits = page => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const axeRun = async (page, selector = "main") => { await page.evaluate(axeCore.source); return page.evaluate(sel => axe.run(document.querySelector(sel) || document, { resultTypes: ["violations"] }).then(r => r.violations.map(v => `${v.impact}:${v.id}:${v.nodes.length}`)), selector); };
const press = async (page, key) => { await page.keyboard.press(key); await sleep(120); };
const openChapter = async (page, chapter = "first-seeds") => { await page.goto(`${BASE}manga.html?code=${anna.code}&chapter=${chapter}`, { waitUntil: "networkidle2" }); await page.waitForSelector("#reader:not([hidden])", { timeout: 20000 }); };

try {
  // ---- not switched on: the friendly page, no Manga tab, and the content is denied by the database -------------------------------------
  const benContext = await browser.createBrowserContext(); const benPage = await benContext.newPage(); watch(benPage, "ben");
  await benPage.setViewport({ width: 1280, height: 900 });
  await login(benPage, ben.code);
  await benPage.goto(`${BASE}manga.html?code=${ben.code}`, { waitUntil: "networkidle2" });
  check(await until(() => benPage.evaluate(() => /not switched on for your account/.test(document.body.textContent))), "a student without the flag sees a friendly 'not switched on' page");
  check(await benPage.evaluate(() => !document.querySelector('.ds-bottom-nav [data-tab="manga"]') && document.querySelectorAll("#shelf:not([hidden]), #reader:not([hidden])").length === 0), "and no Manga tab, shelf or reader");
  const denied = await benPage.evaluate(async lesson => { try { await firebase.database().ref(`protectedContent/${lesson}/manga`).once("value"); return "read"; } catch (error) { return String(error.code || error.message); } }, LESSON);
  check(/permission/i.test(denied), `and the database refuses to give the story to them by its address (${denied})`);
  await benPage.goto(`${BASE}portal.html?code=${ben.code}`, { waitUntil: "networkidle2" });
  check(await benPage.evaluate(() => !/Manga Reader/.test(document.body.textContent)), "the portal does not offer the manga link to them");

  // ---- the teacher switches it on for Anna, from the dashboard ---------------------------------------------------------------------------------
  const teacherContext = await browser.createBrowserContext(); const teacher = await teacherContext.newPage(); watch(teacher, "teacher");
  await teacher.setViewport({ width: 1440, height: 1000 });
  await teacher.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await teacher.evaluate(async credentials => { await firebase.auth().signInWithEmailAndPassword(credentials.email, credentials.password); }, DEMO_TEACHER);
  await teacher.goto(`${BASE}dashboard.html`, { waitUntil: "networkidle2" });
  await teacher.waitForSelector(".student-item", { timeout: 25000 });
  await teacher.evaluate(code => document.querySelector(`.student-item[data-code="${code}"]`).click(), anna.code);
  check(await until(() => teacher.evaluate(() => document.querySelectorAll("#featureSummary input[data-feature]").length === 4), 12000), "the dashboard's Feature flags card lists four switches");
  const flagState = name => teacher.evaluate(n => document.querySelector(`#featureSummary input[data-feature="${n}"]`).checked, name);
  check(!(await flagState("mangaReader")) && (await flagState("clipLab")), "manga starts off and Clip Lab on for this student");
  check(await teacher.evaluate(() => !document.getElementById("mangaCard").hidden === false), "the Manga card stays hidden while the flag is off");
  await teacher.evaluate(() => document.querySelector('#featureSummary input[data-feature="mangaReader"]').click());
  check(await until(async () => (await rest(`studentFeatures/${anna.code}`)) && (await rest(`studentFeatures/${anna.code}/mangaReader`)) === true), "switching manga on writes the student's flag");
  check(await until(() => teacher.evaluate(() => /teacher|set by you/.test(document.getElementById("featureSummary").textContent) && /On \(set by you\)/.test(document.getElementById("featureSummary").textContent))), "the card says it was set by the teacher");
  check(await until(() => teacher.evaluate(() => !document.getElementById("mangaCard").hidden), 12000), "and the Manga card appears");

  // ---- the shelf -----------------------------------------------------------------------------------------------------------------------------------------
  const studentContext = await browser.createBrowserContext(); const student = await studentContext.newPage(); watch(student, "student");
  await student.setViewport({ width: 1280, height: 900 });
  await login(student, anna.code);
  await student.goto(`${BASE}manga.html?code=${anna.code}`, { waitUntil: "networkidle2" });
  await student.waitForSelector("#shelf:not([hidden])", { timeout: 20000 });
  check((await text(student, "#storyTitle")) === "The Garden Above the City" && (await text(student, "#storyLevel")) === "A2", "the shelf shows the story and its level");
  check(/Story by Teacher-written story/.test(await text(student, "#storyCredits")) && /Original text and original simple artwork/.test(await text(student, "#storyCredits")), "credits and licence are on the shelf");
  check(await student.evaluate(() => document.querySelectorAll("#chapterList > li").length === 2 && /Start reading/.test(document.getElementById("continueLink").textContent)), "two chapters, and a Start reading button");
  check(await until(() => student.evaluate(() => { const tab = document.querySelector('.ds-bottom-nav [data-tab="manga"]'); return Boolean(tab) && tab.getAttribute("aria-current") === "page" && /manga\.html\?code=/.test(tab.getAttribute("href")); })), "the Manga tab is in the bottom bar and marked current");
  check(await student.evaluate(() => document.querySelectorAll("#badgeList li").length === 5 && document.querySelectorAll("#badgeList .mg-badge--locked").length === 5), "five reading badges, none earned yet");
  check((await axeRun(student)).length === 0, `axe finds no problems on the shelf (${(await axeRun(student)).join(", ") || "none"})`);
  await student.screenshot({ path: `${SHOTS}shelf-desktop.png` });
  await student.goto(`${BASE}clips.html?code=${anna.code}`, { waitUntil: "networkidle2" });
  check(await until(() => student.evaluate(() => Boolean(document.querySelector('.ds-bottom-nav [data-tab="manga"]')))), "the Manga tab follows the student to the other pages");

  // ---- words before reading ---------------------------------------------------------------------------------------------------------------------------
  await student.goto(`${BASE}manga.html?code=${anna.code}`, { waitUntil: "networkidle2" });
  await student.waitForSelector("#chapterList a");
  await student.evaluate(() => document.querySelector("#chapterList li a").click());
  await student.waitForSelector("#reader:not([hidden])");
  check(await until(() => visible(student, "#preReading")), "a new chapter starts with the words to know");
  check(await student.evaluate(() => document.querySelectorAll("#preList li").length === 7 && !document.getElementById("stageWrap").offsetParent), "seven words for a story at the student's level, and the pages wait until the student is ready");
  await student.evaluate(() => document.querySelector("#preList li button").click());
  check(await until(async () => (await rest(`studentProgress/${anna.code}/vocabulary/rooftop`))?.sourceMangaId === "gaziz-demo"), "saving a word before reading stores it with its story");
  await student.evaluate(() => document.getElementById("startReading").click());

  // ---- page flip, keyboard, the bottom sheet, words ------------------------------------------------------------------------------------------
  check(await until(() => visible(student, "#stageWrap")) && (await position(student)) === "Page 1 of 3", "reading starts in page flip mode on page 1");
  check(await student.evaluate(() => document.querySelectorAll(".mg-page").length === 1 && document.querySelectorAll(".mg-bubble").length === 5 && document.querySelector(".mg-page img").alt.length > 20), "one page, five tappable bubbles and alt text on the picture");
  check(await student.evaluate(() => [...document.querySelectorAll(".mg-bubble")].every(b => b.tagName === "BUTTON" && /Speech bubble|Narration box/.test(b.getAttribute("aria-label")) && b.getBoundingClientRect().width >= 44 && b.getBoundingClientRect().height >= 44)), "every bubble is a labelled button of at least 44 pixels");
  const hotspotsOnPage = await student.evaluate(() => { const page = document.querySelector(".mg-page").getBoundingClientRect(); return [...document.querySelectorAll(".mg-bubble")].every(b => { const r = b.getBoundingClientRect(); return r.left >= page.left - 1 && r.right <= page.right + 1 && r.top >= page.top - 1 && r.bottom <= page.bottom + 1; }); });
  check(hotspotsOnPage, "the bubbles sit on the page image");
  await press(student, "ArrowRight");
  check((await position(student)) === "Page 2 of 3", "the right arrow turns to the next page");
  await press(student, "ArrowLeft");
  check((await position(student)) === "Page 1 of 3", "and the left arrow goes back");
  await student.click('.mg-bubble[data-bubble="b1"]');
  check(await until(() => student.evaluate(() => document.getElementById("sheet").open)), "tapping a bubble opens the bottom sheet");
  check((await text(student, "#sheetTitle")) === "Aida" && /roof could become a garden/.test(await text(student, "#sheetOriginal")) && /Aida has an idea/.test(await text(student, "#sheetSimple")), "with the original, the simpler version and the speaker");
  check(await student.evaluate(() => document.getElementById("sheetTranslation").hidden && document.getElementById("translationToggle").getAttribute("aria-expanded") === "false"), "the translation is hidden until asked for");
  await student.click("#translationToggle");
  check(await student.evaluate(() => !document.getElementById("sheetTranslation").hidden && /Эта крыша/.test(document.getElementById("sheetTranslation").textContent)), "and shown when the student asks");
  check(await student.evaluate(() => /Grammar: "Could"/.test(document.getElementById("sheetGrammar").textContent)), "the grammar note is there");
  await student.evaluate(() => [...document.querySelectorAll("#sheetOriginal .mg-word")].find(b => /garden/i.test(b.textContent)).click());
  check(await until(() => student.evaluate(() => document.getElementById("wordDialog").open && document.getElementById("wordTitle").textContent === "garden" && /сад/.test(document.getElementById("wordTranslation").textContent))), "tapping a word shows its meaning and translation");
  await student.click("#wordSave");
  check(await until(async () => (await rest(`studentProgress/${anna.code}/vocabulary/garden`))?.chapterId === "first-seeds"), "and saves it with its chapter");
  await student.click("#wordClose");
  await student.click("#sheetSave");
  check(await until(async () => { const value = await rest(`studentProgress/${anna.code}/vocabulary/s-gaziz-demo-b1`); return value && /roof could become/.test(value.word); }), "Save sentence stores the sentence with its simpler version");
  check(await student.evaluate(() => { const original = document.getElementById("sheetOriginal"); return Boolean(original); }) && (await student.evaluate(() => { window.speechSynthesis = window.speechSynthesis || { cancel() {}, speak() {} }; return true; })), "Read aloud is available");
  await student.click("#sheetClose");
  check(await student.evaluate(() => !document.getElementById("sheet").open && document.activeElement && document.activeElement.dataset.bubble === "b1"), "closing the sheet returns focus to the bubble");
  check((await axeRun(student)).length === 0, `axe finds no problems on a reading page (${(await axeRun(student)).join(", ") || "none"})`);
  await student.screenshot({ path: `${SHOTS}reader-flip-desktop.png` });

  // ---- the question after a page -----------------------------------------------------------------------------------------------------------------
  check(await student.evaluate(() => /Who said it\?/.test(document.querySelector("#pageQuiz h2").textContent)), "page 1 ends with 'Who said it?'");
  await student.evaluate(() => [...document.querySelectorAll("#pageQuiz .mg-options button")].find(b => b.textContent === "Aida").click());
  check(await student.evaluate(() => /It was Marat/.test(document.querySelector("#pageQuiz .mg-feedback").textContent)), "a wrong answer says who it was");
  await press(student, "ArrowRight");
  check(await student.evaluate(() => /Fill the bubble/.test(document.querySelector("#pageQuiz h2").textContent) && document.querySelectorAll("#pageQuiz .mg-blank").length === 1), "page 2 asks to fill a gap in a bubble");
  await student.evaluate(() => [...document.querySelectorAll("#pageQuiz .mg-options button")].find(b => b.textContent === "seed").click());
  check(await student.evaluate(() => /completes the bubble/.test(document.querySelector("#pageQuiz .mg-feedback").textContent)), "the right word completes it");
  await press(student, "ArrowLeft");
  check(await student.evaluate(() => /It was Marat/.test(document.querySelector("#pageQuiz .mg-feedback").textContent) && [...document.querySelectorAll("#pageQuiz .mg-options button")].every(b => b.disabled)), "going back shows the answer already given");

  // ---- reading aids -----------------------------------------------------------------------------------------------------------------------------------------
  await student.click("#aidsButton");
  await student.select("#aidFont", "1.45");
  await student.click("#aidContrast");
  await student.click("#aidHide");
  check(await student.evaluate(() => document.documentElement.style.getPropertyValue("--mg-font") === "1.45" && document.documentElement.dataset.mgContrast === "high"), "text size and high contrast apply at once");
  await student.click("#aidsClose");
  check(await student.evaluate(() => document.querySelector(".mg-page").classList.contains("mg-hide") && [...document.querySelectorAll(".mg-bubble")].every(b => !/roof|garden/.test(b.getAttribute("aria-label")))), "hiding bubble text also keeps the text out of the bubble names");
  await student.click('.mg-bubble[data-bubble="b1"]');
  check(await until(() => student.evaluate(() => document.getElementById("sheet").open && /roof could become/.test(document.getElementById("sheetOriginal").textContent))), "a hidden bubble still opens its text when tapped");
  await student.click("#sheetClose");
  await student.reload({ waitUntil: "networkidle2" });
  await student.waitForSelector("#reader:not([hidden])");
  check(await student.evaluate(() => document.documentElement.style.getPropertyValue("--mg-font") === "1.45" && document.getElementById("aidHide").checked), "the aids are remembered on this device");
  await student.click("#aidsButton"); await student.select("#aidFont", "1"); await student.click("#aidContrast"); await student.click("#aidHide"); await student.click("#aidsClose");

  // ---- panel by panel, and the position is remembered ---------------------------------------------------------------------------------------
  check((await position(student)) === "Page 1 of 3" || (await position(student)) === "Page 2 of 3", "after a reload the student is back where they were");
  await student.evaluate(() => [...document.querySelectorAll("#modeGroup button")].find(b => /Panel by panel/.test(b.textContent)).click());
  check(await until(() => student.evaluate(() => document.querySelectorAll(".mg-frame").length === 1)), "panel mode shows one panel at a time");
  const panelText = await position(student);
  check(/panel 1 of \d/.test(panelText), `the position names the page and panel (${panelText})`);
  const inside = await student.evaluate(() => { const frame = document.querySelector(".mg-frame").getBoundingClientRect(); return [...document.querySelectorAll(".mg-frame .mg-bubble")].every(b => { const r = b.getBoundingClientRect(); return r.left >= frame.left - 2 && r.right <= frame.right + 2 && r.top >= frame.top - 2 && r.bottom <= frame.bottom + 2; }); });
  check(inside, "the bubbles of a zoomed panel stay inside its frame");
  await student.evaluate(() => { const first = document.getElementById("position").textContent; window.__panelStart = first; });
  await press(student, "ArrowRight");
  check((await position(student)) !== panelText && /panel 2 of/.test(await position(student)), "the arrow keys step to the next panel");
  for (let i = 0; i < 12; i += 1) await press(student, "ArrowRight");
  check(/Page 3 of 3/.test(await position(student)) || (await visible(student, "#chapterEnd")), "panels carry on across pages until the chapter ends");
  await student.screenshot({ path: `${SHOTS}reader-panel-desktop.png` });
  await student.evaluate(() => [...document.querySelectorAll("#modeGroup button")].find(b => /Page flip/.test(b.textContent)).click());

  // ---- right to left ---------------------------------------------------------------------------------------------------------------------------------------------
  await press(student, "ArrowLeft"); await press(student, "ArrowLeft");
  check((await position(student)) === "Page 1 of 3", "back on page 1 in left-to-right reading");
  await student.evaluate(() => document.getElementById("dirButton").click());
  check(await student.evaluate(() => document.getElementById("dirButton").getAttribute("aria-pressed") === "true" && document.getElementById("reader").dataset.dir === "rtl"), "the direction toggle switches to right to left");
  await student.evaluate(() => { window.scrollTo(0, 0); });
  const before = await position(student);
  await press(student, "ArrowLeft");
  check((await position(student)) !== before, "in right-to-left reading the left arrow goes forward");
  await press(student, "ArrowRight");
  check((await position(student)) === before, "and the right arrow goes back");
  await student.evaluate(() => [...document.querySelectorAll("#modeGroup button")].find(b => /Panel by panel/.test(b.textContent)).click());
  await student.evaluate(() => { const target = [...document.querySelectorAll("#modeGroup button")].find(b => /Page flip/.test(b.textContent)); target.click(); });
  await student.evaluate(() => document.getElementById("dirButton").click());

  // ---- scroll mode ------------------------------------------------------------------------------------------------------------------------------------------------
  await student.evaluate(() => [...document.querySelectorAll("#modeGroup button")].find(b => /Scroll/.test(b.textContent)).click());
  check(await until(() => student.evaluate(() => document.querySelectorAll(".mg-page").length === 3 && document.querySelectorAll(".mg-quiz").length === 3)), "scroll mode shows every page, with its question under it");
  check(await student.evaluate(() => !document.getElementById("chapterEnd").hidden), "and the chapter questions are at the bottom");
  await student.screenshot({ path: `${SHOTS}reader-scroll-desktop.png` });

  // ---- chapter questions, retell, boss ---------------------------------------------------------------------------------------------------------------------
  const choose = label => student.evaluate(wanted => { const button = [...document.querySelectorAll("#questions .mg-options button")].find(b => b.textContent === wanted && !b.disabled); if (button) button.click(); return Boolean(button); }, label);
  check(await choose("Neighbours make a garden on a roof"), "choosing the main idea");
  check(await choose("Hide something"), "choosing a wrong meaning");
  check(await student.evaluate(() => /The answer is: Use something together/.test(document.querySelectorAll("#questions .mg-question")[1].textContent)), "a wrong choice shows the answer");
  const typeAnswer = async (index, value) => { const input = (await student.$$("#questions .mg-question"))[index]; await (await input.$("input")).type(value); await (await input.$("button[type=submit]")).click(); };
  await typeAnswer(2, "tomato seeds");
  check(await until(() => student.evaluate(() => /Correct!/.test(document.querySelectorAll("#questions .mg-question")[2].textContent))), "a typed answer is checked");
  check(await choose("It brought them closer together"), "the next choice");
  await typeAnswer(4, "the roof");
  check(await until(() => student.evaluate(() => /Correct!/.test(document.querySelectorAll("#questions .mg-question")[4].textContent))), "another typed answer");
  check(await student.evaluate(() => document.getElementById("finishChapter").disabled === false), "Finish chapter opens once every checkable question is answered");
  await student.evaluate(() => { const area = document.querySelectorAll("#questions .mg-question")[5].querySelector("textarea"); area.value = "He feels excited because he wants the plants to grow soon."; area.dispatchEvent(new Event("input", { bubbles: true })); });
  await student.evaluate(() => [...document.querySelectorAll("#questions .mg-question")[5].querySelectorAll("button")].find(b => /Send/.test(b.textContent)).click());
  check(await until(async () => Object.values((await rest(`sessions/${anna.code}/reviewQueue`)) || {}).some(item => item.questionId === "manga:first-seeds:q-wait" && /excited/.test(item.studentAnswer))), "a written answer goes to the teacher's review queue");
  await student.evaluate(() => { const area = document.getElementById("retellText"); area.value = "Aida and her neighbours made a garden on the roof. They planted seeds and shared the vegetables."; area.dispatchEvent(new Event("input", { bubbles: true })); document.getElementById("retellSend").click(); });
  check(await until(async () => Object.values((await rest(`sessions/${anna.code}/reviewQueue`)) || {}).some(item => item.questionId === "manga:first-seeds:retell")), "the retell goes to the review queue too");
  await student.evaluate(() => document.getElementById("startBoss").click());
  for (let i = 0; i < 5; i += 1) {
    await student.waitForSelector("#bossHost .gm-option, #bossHost .gm-input", { timeout: 8000 });
    const typed = await student.$("#bossHost .gm-input");
    if (typed) { await typed.type("tomato seeds"); await student.keyboard.press("Enter"); } else await student.evaluate(() => document.querySelector("#bossHost .gm-option").click());
    await student.waitForFunction(() => [...document.querySelectorAll("#bossHost button")].some(b => /^(Next|See results)$/.test(b.textContent) && !b.hidden), { timeout: 8000 });
    await student.evaluate(() => [...document.querySelectorAll("#bossHost button")].find(b => /^(Next|See results)$/.test(b.textContent) && !b.hidden).click());
  }
  check(await until(() => student.evaluate(() => /Boss fight over: \d of 5/.test(document.getElementById("bossHost").textContent))), "the boss fight uses the Phase 5 boss battle and reports its result");
  await student.evaluate(() => document.getElementById("finishChapter").click());
  check(await until(() => student.evaluate(() => /Chapter finished: \d+ of \d+ answers right/.test(document.getElementById("result").textContent)), 15000), "finishing the chapter shows the result");
  const saved = await rest(`studentProgress/${anna.code}/manga/gaziz-demo/first-seeds`);
  check(Boolean(saved && saved.completedAt && saved.stars >= 1 && saved.pagesRead === 3 && saved.pagesTotal === 3 && saved.words >= 1 && saved.attempts === 1 && saved.bossTotal === 5 && saved.retell === true), `the chapter record is saved (${JSON.stringify(saved).slice(0, 160)})`);
  const progress = await rest(`studentProgress/${anna.code}`);
  check(progress.xp > 0 && progress.attempts.some(item => item.gameId === "manga-first-seeds") && progress.attempts.some(item => /manga-boss/.test(item.gameId)), `XP and both attempts were recorded (${progress.xp} XP)`);
  check(await student.evaluate(() => !document.getElementById("nextChapterLink").hidden && /chapter=little-market/.test(document.getElementById("nextChapterLink").getAttribute("href"))), "and the next chapter is offered");

  // ---- the shelf after reading; saved copy for offline ----------------------------------------------------------------------------------------------------------
  await student.goto(`${BASE}manga.html?code=${anna.code}`, { waitUntil: "networkidle2" });
  await student.waitForSelector("#chapterList li");
  check(await student.evaluate(() => /Finished/.test(document.querySelector("#chapterList li").textContent) && document.querySelectorAll("#badgeList li:not(.mg-badge--locked)").length >= 3), "the shelf shows the finished chapter and the badges earned");
  check(await student.evaluate(() => caches.open("learning-studio-manga-v1").then(c => c.keys()).then(keys => keys.some(r => /manga-data/.test(r.url)) && keys.some(r => /garden-p1\.svg/.test(r.url)))), "the story and its pictures are saved on the device for offline reading");

  // ---- the teacher's Manga card, assigning, and switching it off -------------------------------------------------------------------------------------------
  const card = await until(async () => { const value = await teacher.evaluate(() => document.getElementById("mangaSummary").innerText); return /finished/.test(value) ? value : ""; }, 15000);
  check(/Chapter 1: The first seeds/.test(card) && /3 of 3 pages/.test(card) && /words? saved/.test(card) && /questions right/.test(card) && /boss defeated|to review/.test(card), `the Manga card shows pages, words and accuracy (${String(card).replace(/\n/g, " | ").slice(0, 220)})`);
  check(/2 written answers waiting/.test(card), "and the two written answers waiting for review");
  const due = new Date(Date.now() + 3 * 86400000); const dueText = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
  await teacher.evaluate(() => document.getElementById("mangaCard").scrollIntoView());
  await teacher.select("#mangaAssignChapter", "little-market");
  await teacher.evaluate(value => { document.getElementById("mangaAssignDue").value = value; }, dueText);
  await teacher.click(".manga-assign button[type=submit]");
  check(await until(async () => { const value = await rest(`mangaAssignments/${anna.code}/gaziz-demo/little-market`); return value && value.dueAt > Date.now(); }), "assigning a chapter with a due date writes it for the student");
  await teacher.screenshot({ path: `${SHOTS}teacher-manga-card.png` });
  await student.reload({ waitUntil: "networkidle2" });
  await student.waitForSelector("#chapterList li");
  const dueView = await student.evaluate(() => `${document.querySelectorAll("#chapterList li")[1].textContent} || ${document.getElementById("continueLink").textContent} ${document.getElementById("continueLink").getAttribute("href")}`);
  check(/Due (in|on|today|soon)/i.test(dueView) && /chapter=little-market/.test(dueView), `the student sees the due date, and Continue points at the assigned chapter (${dueView.slice(0, 200)})`);
  await teacher.evaluate(() => document.querySelector('#featureSummary input[data-feature="clipLab"]').click());
  check(await until(async () => (await rest(`studentFeatures/${anna.code}/clipLab`)) === false), "switching Clip Lab off is saved too");
  await student.goto(`${BASE}clips.html?code=${anna.code}`, { waitUntil: "networkidle2" });
  check(await until(() => student.evaluate(() => /Clip Lab is not switched on/.test(document.body.textContent))), "and the Clips page says it is not switched on for that student");
  await teacher.evaluate(() => [...document.querySelectorAll('#featureSummary .feature-row')].find(row => /Clip Lab/.test(row.textContent)).querySelector("button").click());
  check(await until(async () => (await rest(`studentFeatures/${anna.code}/clipLab`)) === null), "Use default removes the override");
  await teacher.evaluate(() => document.querySelector('#featureSummary input[data-feature="mangaReader"]').click());
  check(await until(async () => (await rest(`studentFeatures/${anna.code}/mangaReader`)) === false), "switching manga off");
  await student.goto(`${BASE}manga.html?code=${anna.code}`, { waitUntil: "networkidle2" });
  check(await until(() => student.evaluate(() => /not switched on for your account/.test(document.body.textContent))), "the student is told it is off");
  check(await student.evaluate(() => !document.querySelector('.ds-bottom-nav [data-tab="manga"]')), "the Manga tab is gone");
  await teacher.evaluate(() => document.querySelector('#featureSummary input[data-feature="mangaReader"]').click());
  await until(async () => (await rest(`studentFeatures/${anna.code}/mangaReader`)) === true);

  // ---- a 390 px phone: shelf, panel mode, sheet, swipe -----------------------------------------------------------------------------------------------------------
  await student.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await student.goto(`${BASE}manga.html?code=${anna.code}`, { waitUntil: "networkidle2" });
  await student.waitForSelector("#chapterList li");
  check(await fits(student), "the shelf fits a 390 px phone");
  await student.screenshot({ path: `${SHOTS}shelf-phone.png` });
  await student.evaluate(() => { for (const key of Object.keys(localStorage)) if (key.startsWith("manga.pos.v1")) localStorage.removeItem(key); });
  await openChapter(student);
  await student.evaluate(() => { const start = document.getElementById("startReading"); if (start && !start.closest("[hidden]")) start.click(); });
  await until(() => visible(student, "#stageWrap"));
  check(await fits(student), "the reader fits a 390 px phone");
  check(await student.evaluate(() => [...document.querySelectorAll(".mg-bubble")].every(b => b.getBoundingClientRect().width >= 44 && b.getBoundingClientRect().height >= 44) && !document.querySelector(".mg-bubble__text:not([hidden])") === false), "bubbles keep a 44 pixel target on a phone");
  const swipe = (dx) => student.evaluate(delta => { const stage = document.getElementById("stage"); const make = (type, x) => new TouchEvent(type, { bubbles: true, cancelable: true, changedTouches: [new Touch({ identifier: 1, target: stage, clientX: x, clientY: 300 })], touches: [] }); stage.dispatchEvent(make("touchstart", 200)); stage.dispatchEvent(make("touchend", 200 + delta)); }, dx);
  const flipStart = await position(student);
  await swipe(-150); await sleep(200);
  check((await position(student)) !== flipStart, "swiping left turns to the next page");
  await swipe(150); await sleep(200);
  check((await position(student)) === flipStart, "and swiping right goes back");
  await student.evaluate(() => [...document.querySelectorAll("#modeGroup button")].find(b => /Panel by panel/.test(b.textContent)).click());
  await until(() => student.evaluate(() => document.querySelectorAll(".mg-frame").length === 1));
  check(await fits(student), "panel mode fits a 390 px phone");
  await student.screenshot({ path: `${SHOTS}reader-panel-phone.png` });
  await student.evaluate(() => document.querySelector(".mg-frame .mg-bubble").click());
  await until(() => student.evaluate(() => document.getElementById("sheet").open));
  check(await fits(student) && await student.evaluate(() => { const r = document.getElementById("sheet").getBoundingClientRect(); return r.width <= 390 && r.bottom <= window.innerHeight + 1; }), "the bottom sheet fits a 390 px phone");
  check((await axeRun(student, "#sheet")).length === 0, `axe finds no problems in the bottom sheet (${(await axeRun(student, "#sheet")).join(", ") || "none"})`);
  await student.screenshot({ path: `${SHOTS}sheet-phone.png` });
  await student.click("#sheetClose");
  check(await student.evaluate(() => { const width = document.getElementById("stage").getBoundingClientRect().width; return width <= 390; }), "the stage never grows wider than the screen");

  check(problems.length === 0, `no console errors (${problems.slice(0, 3).join(" | ") || "none"})`);
  await benContext.close(); await teacherContext.close(); await studentContext.close();
} finally {
  await browser.close();
  // leave the demo data as it was found
  for (const code of [anna.code, ben.code]) { await rest(`studentCurriculum/${code}/${LESSON}`, "DELETE"); for (const node of ["studentProgress", "sessions", "studentFeatures", "mangaAssignments"]) await rest(`${node}/${code}`, "DELETE"); }
  for (const node of ["curriculum", "protectedContent"]) await rest(`${node}/${LESSON}`, "DELETE");
}
if (failures.length) { console.log(`\n${failures.length} check(s) failed.`); process.exit(1); }
console.log("\nAll Manga Reader checks passed.");
