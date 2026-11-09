// End-to-end check of the grammar ladder against the local demo stack:  npm run dev  then  npm run test:ladder-e2e
// 1. A draft ladder is invisible to the student but visible (with a banner) to the teacher.
// 2. Once approved, the student walks all six steps; steps unlock in order; wrong answers explain; a refresh keeps progress;
//    the produced sentences arrive in the teacher's review queue.
import { existsSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { DEMO_STUDENTS, DEMO_TEACHER, seedEmulator } from "./seed-emulator.mjs";
import { assembleTiles, tokenizeSentence } from "../js/grammar-ladder.js";

const BASE = process.env.SITE || "http://127.0.0.1:5050/";
const DB = process.env.DB_HOST || "127.0.0.1:9000";
const NS = "sabina-s-workspace-default-rtdb";
const anna = DEMO_STUDENTS[0];
const ladder = JSON.parse(readFileSync(new URL("../content/sabina.json", import.meta.url), "utf8")).grammarLadder;
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

await seedEmulator({ log: () => {} });
await rest(`sessions/${anna.code}/draft`, "DELETE");
await rest(`sessions/${anna.code}/reviewQueue`, "DELETE");
await rest(`protectedContent/${anna.lessonId}/classwork/content/grammarLadder/status`, "PUT", "draft");

const browser = await puppeteer.launch({ executablePath: executable, headless: true, args: ["--no-sandbox"] });
const openStage = async (page, label) => {
  await page.waitForSelector("#stageList .stage-sub-item", { timeout: 25000 });
  await page.evaluate(text => { [...document.querySelectorAll("#stageList .stage-sub-item")].find(item => item.textContent.includes(text)).click(); }, label);
  await sleep(700);
};
try {
  // ---- teacher sees the draft
  const teacherContext = await browser.createBrowserContext();
  const teacher = await teacherContext.newPage();
  await teacher.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await teacher.evaluate(async credentials => { await firebase.auth().signInWithEmailAndPassword(credentials.email, credentials.password); }, DEMO_TEACHER);
  await teacher.goto(`${lessonUrl}&teacher=1`, { waitUntil: "networkidle2" });
  await openStage(teacher, "Completing Sentence 1");
  check(await teacher.evaluate(() => !!document.querySelector(".ladder-rule")), "teacher sees the rule card on the first grammar stage (draft)");
  await openStage(teacher, "Choose the Tense");
  check(await teacher.evaluate(() => !!document.querySelector(".ladder") && /Draft/.test(document.querySelector(".ladder .ds-banner").textContent)), "teacher sees the ladder with the draft banner");
  check(await teacher.evaluate(() => document.querySelectorAll(".ladder-step").length === 6), "all six steps are listed");
  check(await teacher.evaluate(() => [...document.querySelectorAll(".ladder-step__body")].every(body => !body.hidden)), "the teacher sees every step unlocked");

  // ---- student: draft is hidden
  const studentContext = await browser.createBrowserContext();
  const student = await studentContext.newPage();
  await student.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await student.waitForSelector("#loginCode");
  await student.evaluate(code => { document.getElementById("rememberMe").checked = true; document.getElementById("loginCode").value = code; document.querySelector('[data-action="login"]').click(); }, anna.code);
  await student.waitForFunction(() => getComputedStyle(document.getElementById("lessonsScreen")).display !== "none", { timeout: 20000 });
  await student.goto(lessonUrl, { waitUntil: "networkidle2" });
  await openStage(student, "Choose the Tense");
  check(await student.evaluate(() => !document.querySelector(".ladder")), "a draft ladder is NOT shown to the student");
  await openStage(student, "Completing Sentence 1");
  check(await student.evaluate(() => !document.querySelector(".ladder-rule")), "a draft rule card is NOT shown to the student");

  // ---- approve, then the student works through it
  await rest(`protectedContent/${anna.lessonId}/classwork/content/grammarLadder/status`, "PUT", "approved");
  await student.reload({ waitUntil: "networkidle2" });
  await openStage(student, "Completing Sentence 1");
  check(await student.evaluate(() => !!document.querySelector(".ladder-rule") && /has\/have|have\/has/.test(document.querySelector(".ladder-formula").textContent)), "approved: the student sees the rule card with the formula");
  check(await student.evaluate(() => document.querySelectorAll(".ladder-l1__entry").length === 2), "the rule card lists the common L1 mistakes");
  await openStage(student, "Choose the Tense");
  const state = () => student.evaluate(() => [...document.querySelectorAll(".ladder-step")].map(step => ({ state: step.dataset.state, hidden: step.querySelector(".ladder-step__body").hidden })));
  let steps = await state();
  check(steps[0].state === "open" && steps.slice(1).every(step => step.state === "locked" && step.hidden), "only step 1 is open; steps 2 to 6 are locked");

  // step 1: a wrong attempt explains, then the right words
  await student.evaluate(() => document.querySelector(".ladder-token").click());
  await student.evaluate(() => [...document.querySelectorAll(".ladder-step")][0].querySelector("button.ds-btn--primary").click());
  check(await student.evaluate(() => /Not quite/.test(document.querySelector(".ladder-step .ds-feedback").textContent)), "step 1: a wrong selection gets 'Not quite' with an explanation");
  const targetTokens = await student.evaluate(targets => {
    const wanted = new Set(targets.flatMap(phrase => phrase.split(/\s+/)));
    return [...document.querySelectorAll(".ladder-token")].map((token, index) => ({ index, text: token.textContent.replace(/[.,]/g, "").toLowerCase() })).filter(entry => wanted.has(entry.text)).map(entry => entry.index);
  }, ladder.notice.targets);
  await student.evaluate(indexes => { document.querySelectorAll(".ladder-token").forEach((token, index) => { const want = indexes.includes(index); if ((token.getAttribute("aria-pressed") === "true") !== want) token.click(); }); }, targetTokens);
  await student.evaluate(() => [...document.querySelectorAll(".ladder-step")][0].querySelector("button.ds-btn--primary").click());
  await sleep(300);
  steps = await state();
  check(steps[0].state === "done" && steps[1].state === "open", "step 1 complete unlocks step 2");

  // steps 2, 4, 5: typed answers (wrong first on the first item)
  const typed = async (stepIndex, items) => {
    for (const [index, item] of items.entries()) {
      if (stepIndex === 1 && index === 0) {
        await student.evaluate(position => { const row = document.querySelectorAll(".ladder-step")[1].querySelectorAll(".ladder-item")[0]; row.querySelector("input").value = "has visit"; row.querySelector("button.ds-btn--primary").click(); }, stepIndex);
        check(await student.evaluate(() => { const row = document.querySelectorAll(".ladder-step")[1].querySelectorAll(".ladder-item")[0]; return /Not quite/.test(row.textContent) && !row.querySelector("button.ds-btn--ghost").hidden; }), "step 2: a wrong answer shows the explanation and offers 'Show answer'");
      }
      await student.evaluate((position, itemIndex, answer) => { const row = document.querySelectorAll(".ladder-step")[position].querySelectorAll(".ladder-item")[itemIndex]; row.querySelector("input").value = answer; row.querySelector("button.ds-btn--primary").click(); }, stepIndex, index, item.answers[0]);
    }
    await sleep(300);
  };
  await typed(1, ladder.complete);
  steps = await state();
  check(steps[1].state === "done" && steps[2].state === "open", "step 2 complete unlocks step 3");

  // step 3: build, wrong order first
  for (const [index, item] of ladder.build.entries()) {
    const wanted = tokenizeSentence(item.answers[0]);
    if (index === 0) {
      await student.evaluate(() => { const row = document.querySelectorAll(".ladder-step")[2].querySelectorAll(".ladder-item")[0]; row.querySelector(".ladder-tiles:not(.ladder-tiles--answer) .ladder-tile").click(); row.querySelector("button.ds-btn--primary").click(); });
      check(await student.evaluate(() => /Not quite/.test(document.querySelectorAll(".ladder-step")[2].querySelectorAll(".ladder-item")[0].textContent)), "step 3: a wrong tile order is rejected with a reason");
      await student.evaluate(() => { document.querySelectorAll(".ladder-step")[2].querySelectorAll(".ladder-item")[0].querySelector("button.ds-btn--ghost").click(); });
    }
    for (const token of wanted) {
      await student.evaluate((itemIndex, tile) => { const row = document.querySelectorAll(".ladder-step")[2].querySelectorAll(".ladder-item")[itemIndex]; [...row.querySelectorAll(".ladder-tiles:not(.ladder-tiles--answer) .ladder-tile")].find(button => !button.disabled && button.textContent === tile).click(); }, index, token);
    }
    check(await student.evaluate(itemIndex => document.querySelectorAll(".ladder-step")[2].querySelectorAll(".ladder-item")[itemIndex].querySelector(".ladder-tiles--answer").textContent.length > 0, index) , `step 3 item ${index + 1}: tiles placed`);
    await student.evaluate(itemIndex => { document.querySelectorAll(".ladder-step")[2].querySelectorAll(".ladder-item")[itemIndex].querySelector("button.ds-btn--primary").click(); }, index);
  }
  await sleep(300);
  steps = await state();
  check(steps[2].state === "done" && steps[3].state === "open", "step 3 complete unlocks step 4");
  await typed(3, ladder.correct);
  await typed(4, ladder.transform);
  steps = await state();
  check(steps[3].state === "done" && steps[4].state === "done" && steps[5].state === "open", "steps 4 and 5 complete and unlock step 6");

  // step 6: produce - checklist is required
  await student.evaluate(() => { document.querySelector(".ladder-textarea").value = "The rain has caused damage. Many families have left their homes."; document.querySelector(".ladder-textarea").dispatchEvent(new Event("input", { bubbles: true })); });
  await student.evaluate(() => [...document.querySelectorAll(".ladder-step")][5].querySelector("button.ds-btn--primary").click());
  check(await student.evaluate(() => /Tick every item/.test(document.querySelectorAll(".ladder-step")[5].textContent)), "step 6: sending without the checklist is refused");
  await student.evaluate(() => { document.querySelectorAll(".ladder-check input").forEach(box => box.click()); document.querySelectorAll(".ladder-step")[5].querySelector("button.ds-btn--primary").click(); });
  await sleep(1500);
  steps = await state();
  check(steps.every(step => step.state === "done"), "all six steps are done");
  check(await student.evaluate(() => /6 of 6/.test(document.querySelector(".ladder__progress").textContent)), "progress reads 6 of 6");

  const queue = Object.values((await rest(`sessions/${anna.code}/reviewQueue`)) || {});
  check(queue.length === 1 && queue[0].questionId === ladder.produce.id && /families have left/.test(queue[0].studentAnswer) && queue[0].autoResult === true, `the produced sentences reached the teacher's review queue (${queue.length} entry)`);
  const draft = (await rest(`sessions/${anna.code}/draft/${anna.lessonId}`)) || {};
  check(Object.keys(draft).filter(key => key.startsWith("lad_") && key.endsWith("_ok")).length === 1 + ladder.complete.length + ladder.build.length + ladder.correct.length + ladder.transform.length + 1, "every finished item is saved in the lesson draft");

  // refresh keeps everything
  await student.reload({ waitUntil: "networkidle2" });
  await openStage(student, "Choose the Tense");
  steps = await state();
  check(steps.every(step => step.state === "done"), "after a refresh all six steps are still done");
  check(await student.evaluate(() => document.querySelector(".ladder-textarea").disabled), "the sent answer stays locked after a refresh");
} finally {
  await rest(`protectedContent/${anna.lessonId}/classwork/content/grammarLadder/status`, "PUT", "draft");
  await browser.close();
}
console.log(failures.length ? `\n${failures.length} check(s) failed.` : "\nAll ladder checks passed.");
process.exit(failures.length ? 1 : 0);
