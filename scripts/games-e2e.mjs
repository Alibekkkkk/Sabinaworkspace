// Games end to end against the local demo stack:  npm run dev  then  npm run test:games-e2e
// Loads docs/games/sample-lesson.json as the lesson, then plays the interactive games with the keyboard only
// (Speed Quiz untimed, Boss Battle, Error Hunt, Word Formation, Story Choice), checks rewards, settings, saved progress,
// axe at desktop and phone width, and that nothing logs a console error.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import axeCore from "axe-core";
import { DEMO_STUDENTS, DEMO_TEACHER, seedEmulator } from "./seed-emulator.mjs";

const BASE = process.env.SITE || "http://127.0.0.1:5050/";
const DB = process.env.DB_HOST || "127.0.0.1:9000";
const NS = "sabina-s-workspace-default-rtdb";
const anna = DEMO_STUDENTS[0];
const sample = JSON.parse(readFileSync(new URL("../docs/games/sample-lesson.json", import.meta.url), "utf8"));
const SHOTS = new URL("../docs/screenshots/phase5/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
mkdirSync(SHOTS, { recursive: true });
const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(path => existsSync(path));
if (!executable) throw new Error("No Chrome/Edge found. Set CHROME_PATH.");
const failures = [];
const check = (condition, message) => { console.log(`${condition ? "ok  " : "FAIL"} ${message}`); if (!condition) failures.push(message); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, ms = 6000, step = 60) { const end = Date.now() + ms; while (Date.now() < end) { const value = await fn(); if (value) return value; await sleep(step); } return false; }
async function rest(path, method = "GET", body) {
  const response = await fetch(`http://${DB}/${path}.json?ns=${NS}&access_token=owner`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  return response.json();
}

await seedEmulator({ log: () => {} });
await rest(`protectedContent/${anna.lessonId}/classwork`, "PUT", { sourceFile: "sabina.json", content: sample });
await rest(`studentProgress/${anna.code}`, "PUT", { xp: 0, level: 1, gems: 12, hearts: 5, streak: 0, listening: { "keep-me": { attempts: 1, bestAccuracy: 1, lastAt: 1 } }, vocabulary: { verb: { word: "verb" } } });

const browser = await puppeteer.launch({ executablePath: executable, headless: true, args: ["--no-sandbox"] });
const problems = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  page.on("console", message => { const text = message.text(); if (message.type() === "error" && !/favicon|Tracking Prevention|404|Failed to load resource/i.test(text)) problems.push(text); });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE}practice.html?code=${anna.code}&lesson=${anna.lessonId}`, { waitUntil: "networkidle2" });
  await page.waitForSelector(".game-card .button", { timeout: 20000 });
  const cards = await page.evaluate(() => [...document.querySelectorAll("#gameList .game-card")].map(card => card.textContent));
  check(cards.length >= 17, `the practice page lists every game plus the review card (${cards.length} cards)`);
  check(cards.some(text => /Boss Battle/.test(text) && /reading/.test(text) && /B1/.test(text) && /min/.test(text)), "each game card shows its skill, level and time");
  check(cards.some(text => /You're done for today/.test(text)), "with nothing to review the page says so clearly");
  const play = title => page.evaluate(name => { const card = [...document.querySelectorAll("#gameList .game-card")].find(c => c.querySelector("h2").textContent === name); card.querySelector("button").click(); }, title);
  const summary = () => page.evaluate(() => document.querySelector(".gm-summary")?.innerText || "");
  const focusedIsNext = () => page.evaluate(() => /Next|Finish|results/i.test(document.activeElement?.textContent || ""));

  // settings
  await page.evaluate(() => [...document.querySelectorAll(".gm-panel")].find(d => /Play settings/.test(d.textContent)).open = true);
  await page.evaluate(() => { for (const box of document.querySelectorAll(".gm-panel input[type=checkbox]")) { const label = box.parentElement.textContent; if (/No timers/.test(label) || /Reduce animation/.test(label)) box.click(); } });
  check(await page.evaluate(() => document.documentElement.dataset.calm === "true"), "Reduce animation switches the calm mode on");
  check(await page.evaluate(() => JSON.parse(localStorage.getItem("games.settings.v1")).noTimers === true), "the choices are remembered on this device");

  // Speed Quiz (untimed because of the setting)
  await play("Speed Quiz");
  await page.waitForSelector(".gm-option");
  check(await page.evaluate(() => /Untimed/.test(document.querySelector("#gameView .gm-hint").textContent) && !document.querySelector("#gameView .gm-timer").textContent), "with no timers the Speed Quiz is untimed and shows no countdown");
  await page.keyboard.press("2"); await until(focusedIsNext); await page.keyboard.press("Enter");
  await page.waitForSelector(".gm-option:not([disabled])");
  await page.keyboard.press("1"); await until(focusedIsNext); await page.keyboard.press("Enter");
  check(await until(async () => /You got 2 of 2 correct/.test(await summary()), 8000), "the Speed Quiz is played with number keys and Enter only, 2 of 2");
  await until(async () => /\+\d+ XP/.test(await summary()), 8000);
  check(/\+\d+ XP/.test(await summary()), `and the summary says how much XP it paid (${(await summary()).split("\n").join(" | ")} / status: ${await page.evaluate(() => document.getElementById("status").textContent)})`);
  let progress = await rest(`studentProgress/${anna.code}`);
  check(progress.xp >= 25 && progress.stats && progress.stats.games === 1 && progress.badges.includes("first-game"), `progress is saved: ${progress.xp} XP, first-game badge, ${JSON.stringify(progress.stats)}`);
  check(progress.listening && progress.listening["keep-me"] && progress.vocabulary && progress.vocabulary.verb, "saving a game keeps listening and vocabulary progress that other pages own");

  // Boss Battle
  await play("Unit Boss Battle");
  await page.waitForSelector(".gm-boss");
  await page.keyboard.press("2"); await until(focusedIsNext); await page.keyboard.press("Enter");     // drought
  await page.waitForSelector(".gm-option:not([disabled])"); await page.keyboard.press("1"); await until(focusedIsNext); await page.keyboard.press("Enter"); // lava
  await page.waitForSelector(".gm-option:not([disabled])"); await page.keyboard.press("3"); await until(focusedIsNext); await page.keyboard.press("Enter"); // Not Given
  for (const typed of ["three", "has flooded", "arrive"]) {
    await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains("gm-input")); await page.keyboard.type(typed); await page.keyboard.press("Enter");
    await until(focusedIsNext); await page.keyboard.press("Enter");
  }
  check(await until(async () => /You got 5 of 6 correct/.test(await summary()), 8000), `Boss Battle takes choice, True/False/Not Given and typed answers, keyboard only (5 of 6; page says: ${(await summary()).split("\n")[0]})`);
  const bossText = await page.evaluate(() => document.querySelector(".gm-stage")?.innerText || "");
  check(/Boss defeated/.test(bossText), "five of six correct defeats the boss");
  check(/Grammar/.test(bossText), "the summary names where to practise (the missed grammar gap)");
  await until(async () => /\+\d+ XP/.test(await summary()), 8000);
  progress = await rest(`studentProgress/${anna.code}`);
  check(progress.stats.boss === 1 && progress.badges.includes("boss-slayer"), "the win is recorded and earns the Boss slayer badge");
  check(Array.isArray(progress.reviewQueue) && progress.reviewQueue.some(item => item.answer === "arrived"), "the missed question is queued for spaced review");

  // Error Hunt
  await play("Error Hunt");
  await page.waitForSelector(".gm-token");
  for (const [key, fix] of [["2", "goes"], ["2", "have"], ["3", "see"]]) {
    await page.waitForSelector(".gm-token:not([disabled])"); await page.keyboard.press(key);
    await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains("gm-input")); await page.keyboard.type(fix); await page.keyboard.press("Enter");
    await until(focusedIsNext); await page.keyboard.press("Enter");
  }
  check(await until(async () => /You got 3 of 3 correct/.test(await summary()), 8000), "Error Hunt: pick the wrong word with a number key, type the fix, 3 of 3");
  await until(async () => /\+\d+ XP/.test(await summary()), 8000);
  progress = await rest(`studentProgress/${anna.code}`);
  check(progress.stats.hunts >= 3, `fixes are counted for the Eagle eye badge (${progress.stats.hunts})`);

  // Error Hunt: a wrong word first shows a hint, two wrong picks reveal the answer and the round continues
  await play("Error Hunt");
  await page.waitForSelector(".gm-token");
  await page.keyboard.press("1"); await page.keyboard.press("3");
  check(await until(() => page.evaluate(() => /Correct sentence/.test(document.querySelector(".gm-feedback").textContent) && /Next/.test(document.activeElement.textContent))), "two wrong word picks reveal the answer and let the learner move on, nobody gets stuck");

  // Word Formation
  const forms = new Map(sample.vocab.flatMap(item => Object.entries(item.forms).filter(([key]) => key !== "status").map(([key, value]) => [`${item.en.charAt(0).toUpperCase()}${item.en.slice(1)} → (${key}) ______`, value.w])));
  await play("Word Formation Race");
  await page.waitForSelector(".gm-prompt");
  check(await page.evaluate(() => /Untimed/.test(document.querySelector("#gameView .gm-hint").textContent)), "the race is untimed when no timers is on");
  for (let i = 0; i < 12; i++) {
    const prompt = await page.evaluate(() => document.querySelector(".gm-prompt")?.textContent);
    if (!prompt) break;
    const answer = forms.get(prompt);
    const hasOptions = await page.evaluate(() => Boolean(document.querySelector(".gm-option")));
    if (hasOptions) {
      const index = await page.evaluate(wanted => [...document.querySelectorAll(".gm-option")].findIndex(node => node.dataset.value === undefined ? node.textContent.replace(/^\d+\.\s*/, "") === wanted : node.dataset.value === wanted), answer);
      await page.keyboard.press(String(index + 1));
    } else { await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains("gm-input")); await page.keyboard.type(answer || "x"); await page.keyboard.press("Enter"); }
    await until(focusedIsNext); await page.keyboard.press("Enter");
    if (/You got/.test(await summary())) break;
    await sleep(80);
  }
  check(await until(async () => /You got (\d+) of \1 correct/.test(await summary()), 8000), "Word Formation Race: every form answered correctly with the keyboard");

  // Story Choice
  await play("The storm night");
  await page.waitForSelector(".gm-story");
  await page.keyboard.press("2");
  check(await until(() => page.evaluate(() => /Last night is finished/.test(document.querySelector(".gm-feedback").textContent))), "a wrong choice explains itself and the story waits");
  await page.keyboard.press("1");
  await page.waitForFunction(() => /power went out/.test(document.querySelector(".gm-story")?.textContent || ""));
  await page.keyboard.press("1");
  check(await until(async () => /You got 1 of 2 correct/.test(await summary()), 8000), "the story ends and counts the first wrong try (1 of 2)");

  // panels
  const panels = await page.evaluate(() => ({ text: document.getElementById("gamePanels").innerText, badges: document.querySelectorAll(".gm-badge").length, earned: document.querySelectorAll(".gm-badge.is-earned").length }));
  check(panels.badges >= 20 && panels.earned >= 3, `the badge wall lists ${panels.badges} badges, ${panels.earned} earned, each labelled in words`);
  check(/Level \d/.test(panels.text) && /Learn 15 words/.test(panels.text) && /Streak freezes/.test(panels.text), "the level, weekly goals and streak freeze are shown");
  await page.evaluate(() => [...document.querySelectorAll(".gm-panel")].find(d => /Avatar shop/.test(d.textContent)).open = true);
  const gemsBefore = (await rest(`studentProgress/${anna.code}`)).gems;
  await page.evaluate(() => [...document.querySelectorAll(".gm-shopitem button")].find(b => /Buy Sun frame/.test(b.textContent)).click());
  check(await until(async () => { const p = await rest(`studentProgress/${anna.code}`); return p.avatar && p.avatar.owned && p.avatar.owned.includes("frame-sun") && p.gems === gemsBefore - 5; }), "buying a frame spends gems and saves the item");
  progress = await rest(`studentProgress/${anna.code}`);
  check(progress.listening && progress.listening["keep-me"], "the shop also leaves other progress alone");

  // accessibility and layout
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await page.setViewport({ width, height });
    await sleep(250);
    await page.evaluate(axeCore.source);
    const violations = await page.evaluate(() => axe.run(document.querySelector("main"), { resultTypes: ["violations"] }).then(r => r.violations.map(v => `${v.impact}:${v.id}:${v.nodes.length}`)));
    check(violations.length === 0, `axe finds no problems on the practice page at ${width} px (${violations.join(", ") || "none"})`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `no sideways scroll at ${width} px`);
  }
  await page.setViewport({ width: 390, height: 844 });
  await play("Unit Boss Battle"); await page.waitForSelector(".gm-boss");
  await page.screenshot({ path: `${SHOTS}boss-battle-phone.png` });
  await page.setViewport({ width: 1440, height: 900 });
  await page.screenshot({ path: `${SHOTS}practice-desktop.png` });

  // teacher view
  const teacherContext = await browser.createBrowserContext();
  const teacher = await teacherContext.newPage();
  teacher.on("pageerror", error => problems.push(`teacher pageerror: ${error.message}`));
  await teacher.setViewport({ width: 1440, height: 1000 });
  await teacher.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await teacher.evaluate(async credentials => { await firebase.auth().signInWithEmailAndPassword(credentials.email, credentials.password); }, DEMO_TEACHER);
  await teacher.goto(`${BASE}dashboard.html`, { waitUntil: "networkidle2" });
  await teacher.waitForSelector(".student-item", { timeout: 25000 });
  await teacher.evaluate(code => document.querySelector(`.student-item[data-code="${code}"]`).click(), anna.code);
  check(await until(() => teacher.evaluate(() => /games · \d+% correct/.test(document.getElementById("masterySummary").innerText)), 10000), "the dashboard's Games & mastery card shows games, accuracy, level and streak");
  const masteryText = await teacher.evaluate(() => document.getElementById("masterySummary").innerText);
  check(/Accuracy by skill/.test(masteryText) && /grammar|vocab|reading/.test(masteryText) && /Items missed most often/.test(masteryText) && /badges/.test(masteryText), "with accuracy by skill, missed items and badges");
  await teacher.evaluate(() => [...document.querySelectorAll("#masterySummary button")].find(b => /class view/.test(b.textContent)).click());
  check(await until(() => teacher.evaluate(() => Boolean(document.querySelector("#masterySummary a[download]")))), "the class view offers a CSV download");
  await teacher.evaluate(() => document.getElementById("masteryCard").scrollIntoView());
  await teacher.screenshot({ path: `${SHOTS}dashboard-mastery-desktop.png` });
  await teacherContext.close();
  check(problems.length === 0, `no console errors (${problems.slice(0, 3).join(" | ") || "none"})`);
} finally {
  await browser.close();
}
if (failures.length) { console.log(`\n${failures.length} check(s) failed.`); process.exit(1); }
console.log("\nAll game checks passed.");
