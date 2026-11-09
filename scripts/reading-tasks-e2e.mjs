// End-to-end check of the reading tasks against the local demo stack:  npm run dev  then  npm run test:reading-e2e
// 1. Draft tasks are invisible to the student, visible (with a banner) to the teacher.
// 2. Once approved, the student solves all four types: true/false/not given with evidence, find-the-sentence,
//    long answer with rubric self-check, application question. Wrong answers explain; long and application
//    answers reach the teacher's review queue; a refresh keeps progress.
import { existsSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { DEMO_STUDENTS, DEMO_TEACHER, seedEmulator } from "./seed-emulator.mjs";

const BASE = process.env.SITE || "http://127.0.0.1:5050/";
const DB = process.env.DB_HOST || "127.0.0.1:9000";
const NS = "sabina-s-workspace-default-rtdb";
const anna = DEMO_STUDENTS[0];
const block = JSON.parse(readFileSync(new URL("../content/sabina.json", import.meta.url), "utf8")).readingTasks;
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
const setStatus = status => rest(`protectedContent/${anna.lessonId}/classwork/content/readingTasks/status`, "PUT", status);

await seedEmulator({ log: () => {} });
await rest(`sessions/${anna.code}/draft`, "DELETE");
await rest(`sessions/${anna.code}/reviewQueue`, "DELETE");
await setStatus("draft");

const browser = await puppeteer.launch({ executablePath: executable, headless: true, args: ["--no-sandbox"] });
const openReading = async page => {
  await page.waitForSelector("#stageList .stage-sub-item", { timeout: 25000 });
  await page.evaluate(() => { [...document.querySelectorAll("#stageList .stage-sub-item")].find(item => item.textContent.includes("Interactive Video")).click(); });
  await page.waitForSelector("#readingQ .q-card", { timeout: 15000 });
  await sleep(500);
};
const task = id => block.tasks.find(entry => entry.id === id);
const taskIndex = id => block.tasks.findIndex(entry => entry.id === id);
const clickSentence = (page, index, text) => page.evaluate(({ index, text }) => {
  const card = document.querySelectorAll(".rt .rt-task")[index];
  [...card.querySelectorAll(".rt-sentence")].find(pick => pick.textContent.includes(text)).click();
}, { index, text });
const clickButton = (page, index, label) => page.evaluate(({ index, label }) => {
  const card = document.querySelectorAll(".rt .rt-task")[index];
  [...card.querySelectorAll("button:not(.rt-sentence)")].find(b => b.textContent === label).click();
}, { index, label });
const feedbackOf = (page, index) => page.evaluate(i => document.querySelectorAll(".rt .rt-task")[i].querySelector(".ds-feedback").textContent, index);
const type = (page, index, text) => page.evaluate(({ index, text }) => {
  const area = document.querySelectorAll(".rt .rt-task")[index].querySelector("textarea");
  area.value = text; area.dispatchEvent(new Event("input", { bubbles: true }));
}, { index, text });
try {
  // ---- teacher sees the drafts
  const teacherContext = await browser.createBrowserContext();
  const teacher = await teacherContext.newPage();
  await teacher.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await teacher.evaluate(async credentials => { await firebase.auth().signInWithEmailAndPassword(credentials.email, credentials.password); }, DEMO_TEACHER);
  await teacher.goto(`${lessonUrl}&teacher=1`, { waitUntil: "networkidle2" });
  await openReading(teacher);
  check(await teacher.evaluate(() => !!document.querySelector(".rt") && /Draft/.test(document.querySelector(".rt .ds-banner").textContent)), "teacher sees Part C with a draft banner");
  check(await teacher.evaluate(count => document.querySelectorAll(".rt .rt-task").length === count, block.tasks.length), "teacher sees every task");

  // ---- student: drafts hidden
  const studentContext = await browser.createBrowserContext();
  const student = await studentContext.newPage();
  await student.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await student.waitForSelector("#loginCode");
  await student.evaluate(code => { document.getElementById("rememberMe").checked = true; document.getElementById("loginCode").value = code; document.querySelector('[data-action="login"]').click(); }, anna.code);
  await student.waitForFunction(() => getComputedStyle(document.getElementById("lessonsScreen")).display !== "none", { timeout: 20000 });
  await student.goto(lessonUrl, { waitUntil: "networkidle2" });
  await openReading(student);
  check(await student.evaluate(() => !document.querySelector(".rt")), "draft tasks are NOT shown to the student");

  // ---- approve, then solve
  await setStatus("approved");
  await student.reload({ waitUntil: "networkidle2" });
  await openReading(student);
  check(await student.evaluate(count => document.querySelectorAll(".rt .rt-task").length === count, block.tasks.length), `approved: ${block.tasks.length} tasks are shown`);
  check(await student.evaluate(() => document.querySelector(".rt__progress").textContent === "0 of 7 done"), "progress starts at zero");

  // true / false / not given with evidence
  const t1 = taskIndex("sabina.rt.tfng.001");
  await clickButton(student, t1, "False");
  check(/Not quite/.test(await feedbackOf(student, t1)), "a wrong True/False answer is explained");
  await clickButton(student, t1, "True");
  check(await student.evaluate(i => !document.querySelectorAll(".rt .rt-task")[i].querySelector(".rt-proof").hidden, t1), "a correct answer asks for the evidence sentence");
  await clickSentence(student, t1, "The river in the town centre was usually calm");
  check(/does not prove/.test(await feedbackOf(student, t1)), "a wrong evidence sentence is rejected");
  await clickSentence(student, t1, task("sabina.rt.tfng.001").evidence);
  check(/Correct/.test(await feedbackOf(student, t1)), "the right evidence sentence completes the task");
  const t2 = taskIndex("sabina.rt.tfng.002");
  await clickButton(student, t2, "False");
  await clickSentence(student, t2, task("sabina.rt.tfng.002").evidence);
  const t3 = taskIndex("sabina.rt.tfng.003");
  await clickButton(student, t3, "Not Given");
  check(/does not say/.test(await feedbackOf(student, t3)), "Not Given completes without evidence");

  // find the sentence
  for (const id of ["sabina.rt.find.001", "sabina.rt.find.002"]) {
    const at = taskIndex(id);
    await clickSentence(student, at, "heavy rain fell");
    const wrong = await feedbackOf(student, at);
    await clickSentence(student, at, task(id).evidence);
    check(/Not that sentence/.test(wrong) && /Correct/.test(await feedbackOf(student, at)), `find the sentence: wrong tap explained, right tap accepted (${id.split(".").pop()})`);
  }

  // long answer with rubric
  const longAt = taskIndex("sabina.rt.long.001");
  await type(student, longAt, "The council helped.");
  await clickButton(student, longAt, "Send to my teacher");
  check(/at least 15 words/.test(await feedbackOf(student, longAt)), "a too-short long answer cannot be sent");
  await type(student, longAt, "The council told everyone to evacuate.");
  await clickButton(student, longAt, "Check against the rubric");
  check(await student.evaluate(i => document.querySelectorAll(".rt .rt-task")[i].querySelectorAll('.rt-rubric__item[data-met="true"]').length === 1 && document.querySelectorAll(".rt .rt-task")[i].querySelectorAll('.rt-rubric__item[data-met="false"]').length === 2, longAt), "the self-check shows which rubric points are found and which are not");
  await type(student, longAt, task("sabina.rt.long.001").modelAnswer);
  await clickButton(student, longAt, "Send to my teacher");
  check(/Sent to your teacher/.test(await feedbackOf(student, longAt)), "a complete long answer is sent and the model answer is shown");

  // application question
  const applyAt = taskIndex("sabina.rt.apply.001");
  await type(student, applyAt, "It rained a lot. We stayed inside.");
  await clickButton(student, applyAt, "Send to my teacher");
  check(/present perfect/i.test(await feedbackOf(student, applyAt)), "an answer without the target grammar is not sent and the structure is explained");
  await type(student, applyAt, task("sabina.rt.apply.001").modelAnswer);
  await clickButton(student, applyAt, "Send to my teacher");
  await sleep(500);
  check(await student.evaluate(() => document.querySelector(".rt__progress").textContent === "7 of 7 done"), "all seven tasks done");

  const queue = Object.values((await rest(`sessions/${anna.code}/reviewQueue`)) || {});
  check(queue.length === 2 && queue.every(entry => entry.stage === 3), "exactly the long and application answers reached the review queue (stage 3)");
  check(queue.some(entry => entry.extra === "reading-long" && entry.questionId === "sabina.rt.long.001") && queue.some(entry => entry.extra === "reading-apply"), "queue entries carry the task id and type");

  await sleep(2500);
  check(JSON.stringify((await rest(`sessions/${anna.code}/draft`)) || {}).includes("rt_"), "finished tasks are saved in the lesson draft");
  await student.reload({ waitUntil: "networkidle2" });
  await openReading(student);
  check(await student.evaluate(() => document.querySelector(".rt__progress").textContent === "7 of 7 done"), "after a refresh all tasks are still done");
  check(await student.evaluate(i => document.querySelectorAll(".rt .rt-task")[i].querySelector("textarea").disabled, longAt), "a sent answer stays locked after a refresh");
} finally {
  await setStatus("draft").catch(() => {});
  await browser.close();
}
if (failures.length) { console.log(`\n${failures.length} check(s) failed.`); process.exit(1); }
console.log("\nAll reading task checks passed.");
