// End-to-end check of word families against the local demo stack:  npm run dev  then  npm run test:wordfamily-e2e
// 1. Draft families are invisible to the student, visible (with a banner) to the teacher.
// 2. Once approved, the student sees the "Word family" panel on a flashcard and solves every "Form the word" item
//    (choose, type, build from morphemes); wrong answers explain; a refresh keeps the finished items.
import { existsSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { DEMO_STUDENTS, DEMO_TEACHER, seedEmulator } from "./seed-emulator.mjs";
import { familyItems } from "../js/word-family.js";

const BASE = process.env.SITE || "http://127.0.0.1:5050/";
const DB = process.env.DB_HOST || "127.0.0.1:9000";
const NS = "sabina-s-workspace-default-rtdb";
const anna = DEMO_STUDENTS[0];
const vocab = JSON.parse(readFileSync(new URL("../content/sabina.json", import.meta.url), "utf8")).vocab;
const withForms = vocab.map((item, index) => ({ item, index })).filter(({ item }) => item.forms);
const approvedVocab = vocab.map(item => (item.forms ? { ...item, forms: { ...item.forms, status: "approved" } } : item));
const items = familyItems(approvedVocab, { isTeacher: false });
const lessonUrl = `${BASE}lesson.html?code=${anna.code}&lesson=${anna.lessonId}`;
const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(path => existsSync(path));
if (!executable) throw new Error("No Chrome/Edge found. Set CHROME_PATH.");

const failures = [];
const check = (condition, message) => { console.log(`${condition ? "ok  " : "FAIL"} ${message}`); if (!condition) failures.push(message); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function rest(path, method = "GET", body) {
  const response = await fetch(`http://${DB}/${path}.json?ns=${NS}&access_token=owner`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  return response.json();
}
const setStatus = status => Promise.all(withForms.map(({ index }) => rest(`protectedContent/${anna.lessonId}/classwork/content/vocab/${index}/forms/status`, "PUT", status)));

await seedEmulator({ log: () => {} });
await rest(`sessions/${anna.code}/draft`, "DELETE");
await setStatus("draft");

const browser = await puppeteer.launch({ executablePath: executable, headless: true, args: ["--no-sandbox"] });
const openVocabulary = async page => {
  await page.waitForSelector("#stageList .stage-sub-item", { timeout: 25000 });
  await page.evaluate(() => { [...document.querySelectorAll("#stageList .stage-sub-item")].find(item => /Vocabulary/.test(item.textContent)).click(); });
  await page.waitForSelector("#flashGrid .flashcard", { timeout: 15000 });
  await sleep(400);
};
const openCard = async (page, word) => {
  await page.evaluate(text => { [...document.querySelectorAll("#flashGrid .flashcard")].find(card => card.textContent.includes(text)).click(); }, word);
  await page.waitForSelector("#fcModal.open", { timeout: 5000 });
  await sleep(300);
};
try {
  // ---- teacher sees the drafts
  const teacherContext = await browser.createBrowserContext();
  const teacher = await teacherContext.newPage();
  await teacher.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await teacher.evaluate(async credentials => { await firebase.auth().signInWithEmailAndPassword(credentials.email, credentials.password); }, DEMO_TEACHER);
  await teacher.goto(`${lessonUrl}&teacher=1`, { waitUntil: "networkidle2" });
  await openVocabulary(teacher);
  check(await teacher.evaluate(() => !!document.querySelector(".wf") && /Draft/.test(document.querySelector(".wf .ds-banner").textContent)), "teacher sees the Form the word exercise with a draft banner");
  await openCard(teacher, "humid");
  check(await teacher.evaluate(() => !!document.querySelector('[data-action="show-word-family"]')), "teacher sees the Word family button on the card");
  await teacher.evaluate(() => document.querySelector('[data-action="show-word-family"]').click());
  check(await teacher.evaluate(() => /humidity/.test(document.querySelector(".wf-panel").textContent) && /dehumidify/.test(document.querySelector(".wf-panel").textContent) && document.querySelectorAll(".wf-affix").length === 3), "the panel lists the forms, the opposite verb and the three word parts");

  // ---- student: drafts hidden
  const studentContext = await browser.createBrowserContext();
  const student = await studentContext.newPage();
  await student.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await student.waitForSelector("#loginCode");
  await student.evaluate(code => { document.getElementById("rememberMe").checked = true; document.getElementById("loginCode").value = code; document.querySelector('[data-action="login"]').click(); }, anna.code);
  await student.waitForFunction(() => getComputedStyle(document.getElementById("lessonsScreen")).display !== "none", { timeout: 20000 });
  await student.goto(lessonUrl, { waitUntil: "networkidle2" });
  await openVocabulary(student);
  check(await student.evaluate(() => !document.querySelector(".wf")), "a draft family exercise is NOT shown to the student");
  await openCard(student, "humid");
  check(await student.evaluate(() => !document.querySelector('[data-action="show-word-family"]')), "no Word family button for the student while drafts");

  // ---- approve, then work through the exercise
  await setStatus("approved");
  await student.reload({ waitUntil: "networkidle2" });
  await openVocabulary(student);
  check(await student.evaluate(count => document.querySelectorAll(".wf .wf-item").length === count, items.length), `approved: ${items.length} Form the word items are shown`);
  check(await student.evaluate(() => /^0 of \d+ done$/.test(document.querySelector(".wf__progress").textContent)), "progress starts at zero");
  await openCard(student, "humid");
  await student.evaluate(() => document.querySelector('[data-action="show-word-family"]').click());
  check(await student.evaluate(() => /humidity/.test(document.querySelector(".wf-panel").textContent)), "student sees the Word family panel on the flashcard");
  await student.evaluate(() => [...document.querySelectorAll("#fcRevealArea button")].find(b => /Back/.test(b.textContent)).click());
  check(await student.evaluate(() => !!document.querySelector("#fcRevealArea .quiz-options")), "Back returns to the translation quiz");
  await student.reload({ waitUntil: "networkidle2" });
  await openVocabulary(student);

  // one deliberately wrong answer first
  const first = items[0];
  const wrongFirst = await student.evaluate(({ type, answer }) => {
    const node = document.querySelectorAll(".wf .wf-item")[0];
    const buttons = () => [...node.querySelectorAll("button")];
    if (type === "choose") buttons().find(b => b.textContent !== answer).click();
    else if (type === "type") { node.querySelector("input").value = "zzz"; buttons().find(b => b.textContent === "Check").click(); }
    else buttons().find(b => b.textContent === "Check").click();
    return node.querySelector(".ds-feedback").textContent;
  }, { type: first.type, answer: first.answer });
  check(/Not quite/.test(wrongFirst) && wrongFirst.includes(first.answer), "a wrong answer explains and names the right word");

  for (const [index, item] of items.entries()) {
    await student.evaluate(({ item, index }) => {
      const node = document.querySelectorAll(".wf .wf-item")[index];
      const buttons = () => [...node.querySelectorAll("button")];
      if (item.type === "choose") buttons().find(b => b.textContent === item.answer).click();
      else if (item.type === "type") { node.querySelector("input").value = item.answer; buttons().find(b => b.textContent === "Check").click(); }
      else {
        for (const part of item.parts) [...node.querySelectorAll(".ladder-tiles:not(.ladder-tiles--answer) button")].find(b => b.textContent === part.toLowerCase()).click();
        buttons().find(b => b.textContent === "Check").click();
      }
    }, { item, index });
  }
  await sleep(300);
  check(await student.evaluate(count => document.querySelector(".wf__progress").textContent === `${count} of ${count} done`, items.length), "every item solved: progress shows all done");
  check(await student.evaluate(() => document.querySelectorAll(".wf .ds-feedback--correct").length > 0), "correct answers show positive feedback with the example sentence");
  const types = new Set(items.map(item => item.type));
  check(types.has("choose") && types.has("type") && types.has("build"), "all three exercise types were used");

  await sleep(2500); // draft autosave debounce
  const saved = await rest(`sessions/${anna.code}/draft`);
  check(JSON.stringify(saved || {}).includes("wf_"), "finished items are saved in the lesson draft");
  await student.reload({ waitUntil: "networkidle2" });
  await openVocabulary(student);
  check(await student.evaluate(count => document.querySelector(".wf__progress").textContent === `${count} of ${count} done`, items.length), "after a refresh the finished items are still done");
} finally {
  await setStatus("draft").catch(() => {});
  await browser.close();
}
if (failures.length) { console.log(`\n${failures.length} check(s) failed.`); process.exit(1); }
console.log("\nAll word family checks passed.");
