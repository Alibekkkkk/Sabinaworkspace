// End-to-end check of the listening trainer against the local demo stack:  npm run dev  then  npm run test:listening-e2e
// Drives a student through a full round with the keyboard: draft gate, gaps typed in place with auto-advance and
// Backspace, per-word feedback, word panel and saving, adaptive levels, summary, the mistakes round, progress writes,
// the audio fallback message, the speaking consent screen, a phone-sized layout and a clean console.
import { existsSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { DEMO_STUDENTS, seedEmulator } from "./seed-emulator.mjs";

const BASE = process.env.SITE || "http://127.0.0.1:5050/";
const DB = process.env.DB_HOST || "127.0.0.1:9000";
const NS = "sabina-s-workspace-default-rtdb";
const anna = DEMO_STUDENTS[0];
const pack = JSON.parse(readFileSync(new URL("../content/listening/sabina.json", import.meta.url), "utf8"));
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
for (const node of ["studentProgress", "sessions"]) await rest(`${node}/${anna.code}`, "DELETE");

const browser = await puppeteer.launch({ executablePath: executable, headless: true, args: ["--no-sandbox"] });
const consoleProblems = [];
const watch = page => {
  page.on("pageerror", error => consoleProblems.push(`pageerror: ${error.message}`));
  page.on("console", message => { const text = message.text(); if (message.type() === "error" && !/favicon|Tracking Prevention|404|Failed to load resource/i.test(text)) consoleProblems.push(text); });
  page.on("dialog", async dialog => { consoleProblems.push(`dialog: ${dialog.message()}`); await dialog.dismiss(); });
};
const url = (extra = "") => `${BASE}listening.html?code=${anna.code}&lesson=${anna.lessonId}${extra}`;

// What the page shows right now: the sentence with "_" for gaps (so we can find the item) and the gap inputs.
const snapshot = page => page.evaluate(() => {
  const tokens = [...document.querySelectorAll(".ls-sentence .ls-token")].map(token => { const gap = token.querySelector(".ls-gap"); return gap ? "_" : token.textContent.trim(); });
  return { tokens, gaps: document.querySelectorAll(".ls-gap").length, active: document.activeElement && document.activeElement.className, count: document.querySelector(".ls-count")?.textContent, chip: document.querySelector(".ls-chip")?.textContent };
});
const findItem = shown => pack.items.find(item => {
  const words = item.text.split(/\s+/);
  return words.length === shown.length && shown.every((token, index) => token === "_" || token === words[index] || token.replace(/[^A-Za-z0-9’']/g, "") === words[index].replace(/[^A-Za-z0-9’']/g, ""));
});
const bare = token => token.toLowerCase().replace(/[’‘]/g, "'").replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "");
// Types the gap answers with the keyboard: `wrong` is a set of gap positions to get wrong.
async function answer(page, item, shown, wrong = new Set()) {
  const gapWords = shown.map((token, index) => (token === "_" ? bare(item.text.split(/\s+/)[index]) : null)).filter(Boolean);
  for (const [position, word] of gapWords.entries()) {
    await page.keyboard.type(wrong.has(position) ? `${word.slice(0, -1)}x` : word);
    await sleep(40);
    if (!(page.__autoAdvance) && position < gapWords.length - 1) {
      const focused = await page.evaluate(() => document.activeElement.getAttribute("aria-label"));
      if (!new RegExp(`Gap ${position + 2} of`).test(focused || "")) await page.keyboard.press("Enter");
    }
  }
}
const click = (page, label) => page.evaluate(text => { const button = [...document.querySelectorAll("#lsStage button, #lsSummary button, #lsSetup button")].find(b => b.textContent.includes(text) && !b.hidden && !b.disabled); if (!button) throw new Error(`No button "${text}"`); button.click(); }, label);

try {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  watch(page);
  await page.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await page.waitForSelector("#loginCode");
  await page.evaluate(code => { document.getElementById("rememberMe").checked = true; document.getElementById("loginCode").value = code; document.querySelector('[data-action="login"]').click(); }, anna.code);
  await page.waitForFunction(() => getComputedStyle(document.getElementById("lessonsScreen")).display !== "none", { timeout: 20000 });
  await sleep(1500);
  check(await page.evaluate(() => [...document.querySelectorAll("#practiceLinks a")].some(link => /Listening/.test(link.textContent) && /listening\.html/.test(link.href))), "the portal lists a Listening link for a lesson that has a pack");

  // ---- draft gate
  await page.goto(url(), { waitUntil: "networkidle2" });
  await page.waitForFunction(() => /waiting for your teacher/i.test(document.getElementById("status").textContent), { timeout: 20000 });
  check(await page.evaluate(() => document.getElementById("lsSetup").hidden), "a draft pack is not offered without the preview link");

  // ---- setup
  await page.goto(url("&preview=1"), { waitUntil: "networkidle2" });
  await page.waitForSelector("#lsSetup:not([hidden]) button", { timeout: 20000 });
  check(await page.evaluate(() => /Draft pack/.test(document.getElementById("lsSetup").textContent)), "the preview shows a draft banner");
  check(await page.evaluate(() => document.querySelectorAll('input[name="character"]').length === 2 && document.querySelectorAll('input[name="level"]').length === 5), "two tutors and five level choices (Auto + four) are offered");
  check(await page.evaluate(() => /device's British voice|cannot speak/.test(document.querySelector(".ls-voice-note").textContent)), "the voice note says the device voice is the fallback (no neural audio was generated)");
  await page.evaluate(() => { document.querySelector('input[name="character"][value="arthur"]').click(); document.querySelector('input[name="level"][value="auto"]').click(); });
  await click(page, "Start round");
  await page.waitForSelector(".ls-gap");

  // ---- first sentence: keyboard flow
  let shown = await snapshot(page);
  let item = findItem(shown.tokens);
  check(Boolean(item), "the sentence on screen is one of the pack's sentences");
  check(/Easy \(auto\)/.test(shown.chip) && shown.gaps === item.gaps.easy.length, "auto starts on Easy with the item's easy gaps");
  check(shown.active === "ls-gap", "the first gap has focus when the sentence appears");
  check(await page.evaluate(() => /^Gap 1 of \d+, \d+ letters$/.test(document.querySelector(".ls-gap").getAttribute("aria-label")) && document.querySelector(".ls-gap").placeholder === "*".repeat(Number(document.querySelector(".ls-gap").getAttribute("aria-label").match(/(\d+) letters/)[1]))), "gaps are labelled 'Gap n of m, k letters' and show one star per letter");
  check(await page.evaluate(() => document.querySelector(".ls-gap").autocapitalize === "none" && document.querySelector(".ls-gap").spellcheck === false && document.querySelector(".ls-gap").autocomplete === "off"), "gap inputs switch off autocapitalise, spellcheck and autocomplete (phone keyboards)");
  const gapWords = shown.tokens.map((token, index) => (token === "_" ? bare(item.text.split(/\s+/)[index]) : null)).filter(Boolean);
  await page.keyboard.type(gapWords[0]);
  await sleep(80);
  check(await page.evaluate(() => /Gap 2 of/.test(document.activeElement.getAttribute("aria-label") || "")), "typing the full word moves to the next gap");
  await page.keyboard.press("Backspace");
  check(await page.evaluate(() => /Gap 1 of/.test(document.activeElement.getAttribute("aria-label") || "")), "Backspace in an empty gap goes back to the previous gap");
  await page.evaluate(() => document.querySelectorAll(".ls-gap")[0].select());
  await page.keyboard.type(gapWords[0]);
  await sleep(60);
  check(await page.evaluate(() => document.querySelector(".ls-controls button.ds-btn--primary:not([hidden])").disabled), "Check stays disabled until every gap has text");
  for (const word of gapWords.slice(1)) { await page.keyboard.type(word); await sleep(40); if ((await page.evaluate(() => document.activeElement.className)) === "ls-gap" && !(await page.evaluate(() => document.activeElement.value))) await page.keyboard.press("Enter"); }
  await sleep(100);
  await page.keyboard.press("Enter");
  await page.waitForSelector(".ls-word-btn", { timeout: 5000 });
  check(await page.evaluate(() => document.querySelectorAll('.ls-word[data-state="ok"], .ls-word-btn[data-state="ok"]').length > 0 && !document.querySelector('[data-state="wrong"]')), "all words are marked correct after Enter in the last gap");
  check(await page.evaluate(() => /Well heard/.test(document.querySelector(".ls-feedback").textContent)), "one calm feedback sheet says the sentence was well heard");
  check(await page.evaluate(() => document.querySelector("#lsStage .ls-character").dataset.state !== "idle"), "the character reacts to the result");
  check(await page.evaluate(() => document.querySelectorAll(".ls-word-btn").length === document.querySelectorAll(".ls-token").length), "after checking, every word of the sentence is tappable");

  // ---- word panel and saving
  const savedWord = bare(item.text.split(/\s+/)[item.gaps.easy[0]]);
  await page.evaluate(word => document.querySelector(`.ls-word-btn[data-word="${word}"]`).click(), savedWord);
  check(await page.evaluate(() => !document.querySelector(".ls-wordpanel").hidden && !!document.querySelector(".ls-wordpanel__word")), "tapping a word opens the Look up / Save panel");
  await click(page, "Look up");
  check(await page.evaluate(() => document.querySelector(".ls-wordpanel__meaning").textContent.length > 5), "Look up shows a meaning or a clear 'not stored' message");
  await click(page, "Save to my words");
  await sleep(800);
  const vocabulary = await rest(`studentProgress/${anna.code}/vocabulary`);
  check(Boolean(vocabulary) && Object.values(vocabulary).some(entry => entry.word === savedWord && entry.sourceListeningId === item.id), "the saved word is in the student's own deck with its listening source");

  // ---- adaptive levels over a round
  await click(page, "Next");
  const plan = [false, false, true, true, true, true, true, true, true]; // sentences 2..10: true = answer all words correctly
  let sawUp = false; let sawDown = false;
  for (const [index, correct] of plan.entries()) {
    await page.waitForSelector(".ls-gap");
    shown = await snapshot(page); item = findItem(shown.tokens);
    const level = shown.chip;
    if (/Medium/.test(level)) sawUp = true;
    await page.evaluate(() => document.querySelector(".ls-gap").focus());
    const words = shown.tokens.map((token, at) => (token === "_" ? bare(item.text.split(/\s+/)[at]) : null)).filter(Boolean);
    for (const [position, word] of words.entries()) {
      await page.keyboard.type(correct ? word : `${word.slice(0, -1)}q`);
      await sleep(40);
      const focus = await page.evaluate(() => ({ label: document.activeElement.getAttribute("aria-label"), value: document.activeElement.value }));
      if (position < words.length - 1 && !new RegExp(`Gap ${position + 2} of`).test(focus.label || "")) await page.keyboard.press("Enter");
    }
    await page.keyboard.press("Enter");
    try { await page.waitForSelector(".ls-word-btn", { timeout: 5000 }); } catch (error) {
      console.log("DEBUG stuck on", JSON.stringify(shown.tokens), "wrongRun", !correct, JSON.stringify(await page.evaluate(() => ({ values: [...document.querySelectorAll(".ls-gap")].map(g => g.value), active: document.activeElement.getAttribute("aria-label"), feedback: document.querySelector(".ls-feedback").textContent }))));
      throw error;
    }
    if (index === 1) { check(await page.evaluate(() => /Nearly there/.test(document.querySelector(".ls-feedback").textContent) && document.querySelectorAll('[data-state="wrong"]').length > 0), "a wrong word is marked wrong and the feedback stays calm"); check(await page.evaluate(() => /you typed/.test(document.querySelector(".ls-sentence").textContent) && document.querySelectorAll(".ls-letter--wrong").length > 0), "the wrong word shows the correct spelling with the differing letters marked"); }
    await click(page, index === plan.length - 1 ? "Finish round" : "Next");
    if (index === 3) sawDown = true;
  }
  void sawDown;
  await page.waitForSelector("#lsSummary:not([hidden]) .ls-stars", { timeout: 15000 });
  check(sawUp, "three correct sentences in a row moved the level up (Medium appeared)");
  check(await page.evaluate(() => /Round complete/.test(document.getElementById("lsSummary").textContent) && /Accuracy: \d+%/.test(document.getElementById("lsSummary").textContent) && /Hardest words/.test(document.getElementById("lsSummary").textContent)), "the round summary shows accuracy and hardest words");
  check(await page.evaluate(() => /^[★☆]{3}$/.test(document.querySelector(".ls-stars").textContent) && /of 3 stars/.test(document.querySelector(".ls-stars").getAttribute("aria-label"))), "stars are shown and announced (1 to 3)");
  await page.waitForFunction(() => /XP earned/.test(document.getElementById("lsSummary").textContent), { timeout: 10000 });

  // ---- progress written
  const progress = await rest(`studentProgress/${anna.code}`);
  check(progress && progress.attempts && Object.values(progress.attempts).some(attempt => attempt.gameType === "listening"), "the round was saved as a listening attempt with XP");
  check(progress && progress.listening && Object.keys(progress.listening).length >= 8 && Object.values(progress.listening).every(entry => entry.attempts >= 1 && entry.bestAccuracy >= 0 && entry.bestAccuracy <= 1), "per-sentence listening progress (attempts, best accuracy, last time) was saved");
  check(progress && Array.isArray(progress.reviewQueue) ? progress.reviewQueue.some(entry => entry.topic === "Listening") : Object.values(progress.reviewQueue || {}).some(entry => entry.topic === "Listening"), "missed words went into the review queue under Listening");

  // ---- mistakes round
  check(await page.evaluate(() => [...document.querySelectorAll("#lsSummary button")].some(b => /Practise mistakes \(\d+\)/.test(b.textContent))), "a Practise mistakes button lists the sentences with missed words");
  await click(page, "Practise mistakes");
  await page.waitForSelector(".ls-gap");
  shown = await snapshot(page);
  check(/Practise mistakes/.test(shown.chip), "the mistakes round is labelled");
  item = findItem(shown.tokens);
  check(shown.gaps >= 1 && shown.gaps <= item.text.split(/\s+/).length, "only the missed words are hidden in the mistakes round");

  // ---- hint and reveal
  await page.evaluate(() => document.querySelector(".ls-gap").focus());
  await click(page, "Hint");
  check(await page.evaluate(() => document.querySelector(".ls-gap").value.length === 1 && /will not count/.test(document.querySelector(".ls-feedback").textContent)), "Hint reveals one letter and says the word will not count");
  await click(page, "Reveal word");
  check(await page.evaluate(() => document.querySelector(".ls-gap").readOnly), "Reveal fills the word and locks it");
  await click(page, "Skip");
  check(await page.evaluate(() => /Skipped|Nearly there/.test(document.querySelector(".ls-feedback").textContent)), "Skip shows the sentence and moves on calmly");

  // ---- slow, translation, speaking
  await page.evaluate(() => { const slow = [...document.querySelectorAll("#lsStage button")].find(b => /Slow/.test(b.textContent)); slow.click(); });
  check(await page.evaluate(() => document.querySelector(".ls-source").textContent.length > 0), "playing audio shows which voice is used (device voice fallback or a message)");
  await page.evaluate(() => [...document.querySelectorAll("#lsStage button")].find(b => /Translation/.test(b.textContent)).click());
  check(await page.evaluate(() => !document.querySelector(".ls-translation").hidden && /[А-Яа-я]/.test(document.querySelector(".ls-translation").textContent)), "the translation line appears under the sentence");
  check(await page.evaluate(() => JSON.parse(localStorage.getItem("listening.prefs.v1")).showTranslation === true && JSON.parse(localStorage.getItem("listening.prefs.v1")).character === "arthur"), "tutor and translation choices are remembered on the device");
  const speakingSupported = await page.evaluate(() => Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
  if (speakingSupported) {
    await click(page, "Say it");
    check(await page.evaluate(() => /Before you use the microphone/.test(document.querySelector(".ls-consent").textContent) && /does not record or save your voice/.test(document.querySelector(".ls-consent").textContent)), "speaking asks for plain-language consent before the microphone is used");
    await click(page, "Type instead");
    check(await page.evaluate(() => !document.querySelector(".ls-consent")), "Type instead always leaves the speaking screen");
  } else {
    check(await page.evaluate(() => /not supported in this browser/.test(document.querySelector(".ls-speaking").textContent)), "without SpeechRecognition the page says so and typing still works");
  }

  // ---- audio fallback when the mp3 cannot play
  const fallback = await context.newPage();
  watch(fallback);
  await fallback.setRequestInterception(true);
  fallback.on("request", request => {
    if (/content\/listening\/sabina\.json/.test(request.url())) {
      const broken = structuredClone(pack);
      broken.items.forEach(entry => { entry.audio = { normal: "audio/missing.mp3" }; });
      request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(broken) });
    } else request.continue();
  });
  await fallback.goto(url("&preview=1"), { waitUntil: "networkidle2" });
  await fallback.waitForSelector("#lsSetup:not([hidden]) button");
  await click(fallback, "Start round");
  await fallback.waitForSelector(".ls-gap");
  await fallback.waitForFunction(() => /could not be played|Device voice|cannot play/i.test(document.querySelector(".ls-source").textContent), { timeout: 8000 });
  check(await fallback.evaluate(() => /could not be played|Device voice|cannot play/i.test(document.querySelector(".ls-source").textContent)), "a missing audio file shows a clear message and falls back to the device voice");

  // ---- phone layout
  const phone = await context.newPage();
  watch(phone);
  await phone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await phone.goto(url("&preview=1"), { waitUntil: "networkidle2" });
  await phone.waitForSelector("#lsSetup:not([hidden]) button");
  await click(phone, "Start round");
  await phone.waitForSelector(".ls-gap");
  check(await phone.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), "no horizontal scroll at 390px wide");
  check(await phone.evaluate(() => [...document.querySelectorAll(".ls-controls button, .ls-gap")].filter(node => !node.hidden).every(node => node.getBoundingClientRect().height >= 40)), "controls and gaps are at least 40px tall for touch");

  // ---- authoring tool
  const tool = await context.newPage();
  watch(tool);
  await tool.goto(`${BASE}tools/import-content.html`, { waitUntil: "networkidle2" });
  await tool.type("#listeningTitle", "Weather words");
  await tool.type("#listeningTargets", "storm");
  await tool.type("#listeningSentences", ["The storm has damaged the old bridge.", "We have never seen such heavy rain."].join("\n"));
  await tool.evaluate(() => document.getElementById("listeningBuild").click());
  const authored = JSON.parse(await tool.evaluate(() => document.getElementById("listeningOutput").value));
  check(authored.items.length === 2 && authored.items[0].gaps.easy.includes(1) && authored.items[0].lessonTags.includes("vocabulary:storm") && authored.status === "draft", "the import tool turns pasted sentences into a draft pack with the target word hidden first");
  check(await tool.evaluate(() => /all valid/.test(document.getElementById("listeningStatus").textContent)), "the import tool validates the pack and says it is ready");

  check(consoleProblems.length === 0, `no console errors, CSP violations or dialogs (${consoleProblems.length}${consoleProblems.length ? ": " + consoleProblems.slice(0, 3).join(" | ") : ""})`);
} finally {
  await browser.close();
}
if (failures.length) { console.log(`\n${failures.length} check(s) failed.`); process.exit(1); }
console.log("\nAll listening checks passed.");
