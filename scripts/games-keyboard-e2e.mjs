// Keyboard-only play of the eleven games that used to be old screens:  npm run dev  then  npm run test:games-keyboard-e2e
// Word Match, Memory Cards, Flashcards, Fill the Gap, Sentence Builder, Hangman, Word Scramble, Listening Dictation,
// Pronunciation, Crossword and Word Search, each played through with keys only from the sample lesson.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import axeCore from "axe-core";
import { DEMO_STUDENTS, seedEmulator } from "./seed-emulator.mjs";

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
async function until(fn, ms = 8000, step = 60) { const end = Date.now() + ms; while (Date.now() < end) { const value = await fn(); if (value) return value; await sleep(step); } return false; }
async function rest(path, method = "GET", body) {
  const response = await fetch(`http://${DB}/${path}.json?ns=${NS}&access_token=owner`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  return response.json();
}
const meaningOf = new Map(sample.matchData.map(pair => [pair.meaning, pair.word]));
const wordOf = new Map(sample.matchData.map(pair => [pair.word, pair.meaning]));

await seedEmulator({ log: () => {} });
await rest(`protectedContent/${anna.lessonId}/classwork`, "PUT", { sourceFile: "sabina.json", content: sample });
await rest(`studentProgress/${anna.code}`, "PUT", { xp: 0, level: 1, gems: 0, hearts: 5, streak: 0 });

const browser = await puppeteer.launch({ executablePath: executable, headless: true, args: ["--no-sandbox", "--lang=en-US"] });
const problems = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", error => { console.log(`pageerror: ${error.message}`); problems.push(`pageerror: ${error.message}`); });
  page.on("console", message => { const text = message.text(); if (message.type() === "error" && !/favicon|Tracking Prevention|404|Failed to load resource/i.test(text)) problems.push(text); });
  await page.evaluateOnNewDocument(() => { // a predictable voice so Listening Dictation can be tested without a speaker
    const spoken = []; window.__spoken = spoken;
    if (window.speechSynthesis) {
      window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
      window.speechSynthesis.getVoices = () => [{ name: "Test voice", lang: "en-GB", localService: true }];
      window.speechSynthesis.speak = utterance => { spoken.push(utterance.text); if (utterance.onend) setTimeout(() => utterance.onend(), 20); };
      window.speechSynthesis.cancel = () => {};
    }
  });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE}practice.html?code=${anna.code}&lesson=${anna.lessonId}`, { waitUntil: "networkidle2" });
  await page.waitForSelector(".game-card .button", { timeout: 20000 });
  const play = title => page.evaluate(name => { const card = [...document.querySelectorAll("#gameList .game-card")].find(c => c.querySelector("h2").textContent === name); if (!card) throw new Error(`No game called ${name}`); card.querySelector("button").click(); }, title);
  const summary = () => page.evaluate(() => document.querySelector(".gm-summary")?.innerText || "");
  const gotSummary = async (pattern, label) => check(await until(async () => pattern.test(await summary()), 10000), `${label} (page says: ${(await summary()).split("\n")[0]})`);
  const nextFocused = () => page.waitForFunction(() => /Next|See results/.test(document.activeElement?.textContent || ""), { timeout: 10000 });
  const inputFocused = () => page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains("gm-input"), { timeout: 10000 });
  const press = async (...keys) => { for (const key of keys) await page.keyboard.press(key); };
  const focusAndEnter = async selector => { await page.evaluate(sel => document.querySelector(sel).focus(), selector); await page.keyboard.press("Enter"); };
  const focusByText = async (scope, text) => { await page.evaluate(({ scope, text }) => [...document.querySelectorAll(scope)].find(node => node.textContent.trim().replace(/^\d+\.\s*/, "") === text).focus(), { scope, text }); await page.keyboard.press("Enter"); };
  const waitDone = async () => { await page.waitForFunction(() => /You got/.test(document.querySelector(".gm-summary")?.innerText || ""), { timeout: 15000 }); };

  // Hangman first: one hint, so the XP shows the cost (a perfect round pays 69; one hint takes 3 off)
  await play("Vocabulary Hangman"); await page.waitForSelector(".gm-mask");
  for (let i = 0; i < 6; i++) {
    await page.waitForSelector(".gm-mask");
    const hintText = await page.evaluate(() => document.querySelector(".gm-prompt").textContent.replace(/^Hint:\s*/, ""));
    const word = meaningOf.get(hintText); if (!word) throw new Error(`Unknown hint ${hintText}`);
    if (i === 0) { await page.evaluate(() => [...document.querySelectorAll("#gameView button")].find(b => /Hint: reveal/.test(b.textContent)).focus()); await press("Enter"); }
    for (const letter of new Set(word)) await page.keyboard.press(letter);
    await nextFocused(); await press("Enter");
  }
  await waitDone(); await gotSummary(/You got 6 of 6 correct/, "Hangman is played with the keys: letters typed on the keyboard, one hint used");
  await until(async () => /\+\d+ XP/.test(await summary()));
  check(/\+66 XP/.test(await summary()), `a hint takes 3 XP off a perfect round (69 minus 3: ${(await summary()).split("\n").find(line => /XP/.test(line))})`);

  // Word Match
  await play("Word Match"); await page.waitForSelector(".gm-columns");
  for (const pair of sample.matchData) {
    await focusByText("#gameView .gm-col:nth-child(1) button", pair.word);
    await focusByText("#gameView .gm-col:nth-child(2) button", pair.meaning);
  }
  await waitDone(); await gotSummary(/You got 6 of 6 correct/, "Word Match: choose a word, then its meaning, with Tab and Enter");
  // a wrong meaning first is forgiven but costs the point
  await play("Word Match"); await page.waitForSelector(".gm-columns");
  await focusByText("#gameView .gm-col:nth-child(1) button", sample.matchData[0].word);
  await focusByText("#gameView .gm-col:nth-child(2) button", sample.matchData[1].meaning);
  check(await until(() => page.evaluate(() => /Not that one/.test(document.querySelector(".gm-feedback").textContent))), "a wrong meaning gets a gentle message and the word stays picked");
  for (const pair of sample.matchData) { await focusByText("#gameView .gm-col:nth-child(1) button:not([disabled])", pair.word); await focusByText("#gameView .gm-col:nth-child(2) button:not([disabled])", pair.meaning); }
  await waitDone(); await gotSummary(/You got 5 of 6 correct/, "the first wrong guess costs that word's point");

  // Memory Cards (remembers what it has seen, like a player would)
  await play("Memory Cards"); await page.waitForSelector(".memory-card");
  const total = await page.evaluate(() => document.querySelectorAll(".memory-card").length);
  const known = new Map(); const done = new Set();
  const flipIndex = async i => { await page.evaluate(n => document.querySelectorAll(".memory-card")[n].focus(), i); await page.keyboard.press("Enter"); await sleep(40); return page.evaluate(n => document.querySelectorAll(".memory-card")[n].textContent, i); };
  const partnerText = text => wordOf.get(text) || meaningOf.get(text);
  let guard = 0;
  while (done.size < total && guard++ < 80) {
    await page.waitForFunction(() => ![...document.querySelectorAll(".memory-card")].some(c => c.classList.contains("is-flipped") && !c.classList.contains("matched")), { timeout: 5000 });
    const pairIndex = [...known].find(([i, text]) => !done.has(i) && [...known].some(([j, other]) => j !== i && !done.has(j) && other === partnerText(text)));
    let a; let b;
    if (pairIndex) { a = pairIndex[0]; b = [...known].find(([j, other]) => j !== a && !done.has(j) && other === partnerText(pairIndex[1]))[0]; await flipIndex(a); await flipIndex(b); done.add(a); done.add(b); continue; }
    a = [...Array(total).keys()].find(i => !known.has(i) && !done.has(i)); known.set(a, await flipIndex(a));
    const partner = [...known].find(([j, text]) => j !== a && !done.has(j) && text === partnerText(known.get(a)));
    if (partner) { await flipIndex(partner[0]); done.add(a); done.add(partner[0]); continue; }
    b = [...Array(total).keys()].find(i => !known.has(i) && !done.has(i) && i !== a); known.set(b, await flipIndex(b));
    if (partnerText(known.get(a)) === known.get(b)) { done.add(a); done.add(b); }
  }
  await waitDone(); await gotSummary(/You got \d+ of 6 correct/, "Memory Cards: cards are turned with Enter and every pair is found");
  check(await page.evaluate(() => /Moves: \d+/.test(document.getElementById("gameView").textContent)), "the moves count is shown");

  // Flashcards
  await play("Vocabulary Flashcards"); await page.waitForSelector(".gm-answerline");
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => [...document.querySelectorAll("#gameView button")].find(b => /Turn the card over/.test(b.textContent)).focus()); await press("Enter");
    await page.waitForFunction(() => document.activeElement?.textContent === "I knew it"); await press("Enter");
    await nextFocused(); await press("Enter");
  }
  await waitDone(); await gotSummary(/You got 6 of 6 correct/, "Flashcards: reveal, mark as known, next, all with Enter");

  // Fill the Gap (with the word bank)
  await play("Fill the Gap"); await page.waitForSelector(".gm-input");
  await page.evaluate(() => [...document.querySelectorAll("#gameView button")].find(b => /Show word bank/.test(b.textContent)).focus()); await press("Enter");
  check(await page.evaluate(() => !document.querySelector(".gm-bank").hidden && document.querySelectorAll(".gm-bank button").length === 2), "the word bank can be switched on and lists the answers");
  await page.evaluate(() => [...document.querySelectorAll(".gm-bank button")].find(b => b.textContent === "has flooded").focus()); await press("Enter");
  await page.evaluate(() => document.querySelector(".gm-input").focus()); await press("Enter"); await nextFocused(); await press("Enter");
  await inputFocused(); await page.keyboard.type("arrived"); await press("Enter"); await nextFocused(); await press("Enter");
  await waitDone(); await gotSummary(/You got 2 of 2 correct/, "Fill the Gap: a word from the bank and a typed word, 2 of 2");

  // Sentence Builder
  await play("Sentence Builder"); await page.waitForSelector(".tile-bank");
  for (const word of ["The", "river", "has", "risen."]) await focusByText(".tile-bank button", word);
  check(await page.evaluate(() => document.querySelector(".gm-built").textContent === "The river has risen."), "tiles are placed with Enter and shown as a sentence");
  await page.evaluate(() => [...document.querySelectorAll("#gameView button")].find(b => b.textContent === "Check").focus()); await press("Enter"); await nextFocused(); await press("Enter");
  await waitDone(); await gotSummary(/You got 1 of 1 correct/, "Sentence Builder: build with keys, check, done");

  // Word Scramble
  await play("Word Scramble"); await page.waitForSelector(".gm-input");
  for (let i = 0; i < 6; i++) {
    await inputFocused();
    const clue = await page.evaluate(() => document.querySelector(".gm-hint:not(:first-child), #gameView .gm-hint:nth-of-type(2)")?.textContent || "");
    const meaning = await page.evaluate(() => [...document.querySelectorAll("#gameView p")].map(p => p.textContent).find(t => /^Clue: /.test(t)).replace(/^Clue:\s*/, ""));
    void clue;
    await page.keyboard.type(meaningOf.get(meaning)); await press("Enter"); await nextFocused(); await press("Enter");
  }
  await waitDone(); await gotSummary(/You got 6 of 6 correct/, "Word Scramble: the letters are put in order by typing the word");

  // Listening Dictation
  await play("Listening Dictation"); await page.waitForSelector(".gm-input");
  for (let i = 0; i < 6; i++) {
    await page.waitForSelector(".gm-input:not([disabled])");
    await page.evaluate(() => [...document.querySelectorAll("#gameView button")].find(b => b.textContent === "Play").focus()); await press("Enter");
    await page.waitForFunction(count => window.__spoken.length > count, { timeout: 8000 }, i);
    const spoken = await page.evaluate(() => window.__spoken[window.__spoken.length - 1]);
    await page.evaluate(() => document.querySelector(".gm-input").focus()); await page.keyboard.type(spoken); await press("Enter"); await nextFocused(); await press("Enter");
  }
  await waitDone(); await gotSummary(/You got 6 of 6 correct/, "Listening Dictation: play with Enter, type what was heard");

  // Pronunciation (typing is the fallback; coaching, so misses are not queued)
  const queueBefore = Object.values((await rest(`studentProgress/${anna.code}/reviewQueue`)) || {}).length;
  await play("Pronunciation Challenge"); await page.waitForSelector(".gm-input");
  for (let i = 0; i < 6; i++) {
    await page.waitForSelector(".gm-input:not([disabled])"); await page.evaluate(() => document.querySelector(".gm-input").focus());
    const target = await page.evaluate(() => document.querySelector(".gm-prompt").textContent.replace(/^Say:\s*/, ""));
    if (i === 5) { for (let t = 0; t < 3; t++) { await page.waitForSelector(".gm-input:not([disabled])"); await page.evaluate(() => document.querySelector(".gm-input").focus()); await page.keyboard.type("zzz"); await press("Enter"); if (t < 2) await sleep(150); } }
    else { await page.keyboard.type(target); await press("Enter"); }
    await nextFocused(); await press("Enter");
  }
  await waitDone(); await gotSummary(/You got 5 of 6 correct/, "Pronunciation: typing works as the fallback; three tries then the round moves on");
  await until(async () => /\+\d+ XP/.test(await summary()));
  const queueAfter = Object.values((await rest(`studentProgress/${anna.code}/reviewQueue`)) || {}).length;
  check(queueAfter === queueBefore, `a missed word in Pronunciation is coaching only: nothing was added to review (${queueBefore} before, ${queueAfter} after)`);

  // Crossword
  await play("Vocabulary Crossword"); await page.waitForSelector(".puzzle-grid input");
  const clueList = await page.evaluate(() => [...document.querySelectorAll(".puzzle-words li button")].map(b => b.textContent));
  await page.evaluate(() => document.querySelector(".puzzle-grid input").focus());
  const firstClue = await page.evaluate(() => document.querySelector(".puzzle-words li.is-active").textContent);
  const answerFor = clueText => { const meaning = clueText.replace(/^\d+ (across|down): /, "").replace(/ \(\d+\)$/, ""); return meaningOf.get(meaning).toUpperCase(); };
  await page.evaluate(() => document.querySelector(".puzzle-words li button").click());
  for (let i = 0; i < clueList.length; i++) {
    const clueText = await page.evaluate(() => document.querySelector(".puzzle-words li.is-active").textContent);
    await page.evaluate(() => document.activeElement && document.activeElement.tagName === "INPUT" ? 0 : document.querySelector(".puzzle-words li.is-active button").click());
    await page.keyboard.type(answerFor(clueText), { delay: 15 });
    await page.keyboard.press("Tab");
  }
  void firstClue;
  check(await page.evaluate(() => [...document.querySelectorAll(".puzzle-grid input")].filter(input => input.tabIndex === 0).length === 1), "the grid is one tab stop (arrow keys move inside it)");
  await page.evaluate(() => [...document.querySelectorAll("#gameView button")].find(b => /Check the crossword/.test(b.textContent)).focus()); await press("Enter");
  await waitDone(); await gotSummary(/You got (\d+) of \1 correct/, "Crossword: letters typed along each word, Tab to the next clue, every word right");

  // Word Search: the page reads the grid from its own labels and plays it with Enter
  await play("Vocabulary Word Search"); await page.waitForSelector("button.puzzle-cell");
  const cells = await page.evaluate(() => [...document.querySelectorAll("button.puzzle-cell")].map(b => b.textContent));
  const size = Math.sqrt(cells.length); const targets = await page.evaluate(() => [...document.querySelectorAll(".puzzle-words li")].map(li => li.textContent));
  const dirs = [[0, 1], [1, 0], [1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1], [-1, 1]];
  const locate = word => { for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) for (const [dr, dc] of dirs) { let ok = true; for (let k = 0; k < word.length && ok; k++) { const rr = r + dr * k; const cc = c + dc * k; ok = rr >= 0 && rr < size && cc >= 0 && cc < size && cells[rr * size + cc] === word[k]; } if (ok) return [...word].map((_, k) => (r + dr * k) * size + c + dc * k); } return null; };
  for (const text of targets) {
    const word = meaningOf.get(text).toUpperCase(); const path = locate(word); if (!path) throw new Error(`Word ${word} not in the grid`);
    for (const index of path) { await page.evaluate(i => document.querySelectorAll("button.puzzle-cell")[i].focus(), index); await press("Enter"); }
  }
  await waitDone(); await gotSummary(/You got (\d+) of \1 correct/, "Word Search: every word found with focus and Enter, forwards or backwards");
  check(await page.evaluate(() => document.querySelectorAll("button.puzzle-cell[tabindex='0']").length <= 1), "the letter grid is one tab stop");

  // accessibility: the two grids, plus the memory board and the tile builder
  await page.evaluate(axeCore.source);
  for (const [title, selector] of [["Vocabulary Word Search", "button.puzzle-cell"], ["Memory Cards", ".memory-card"], ["Sentence Builder", ".tile-bank"], ["Vocabulary Crossword", ".puzzle-grid input"]]) {
    await play(title); await page.waitForSelector(selector);
    const violations = await page.evaluate(() => axe.run(document.querySelector("#gameView"), { resultTypes: ["violations"] }).then(r => r.violations.map(v => `${v.impact}:${v.id}:${v.nodes.length}`)));
    check(violations.length === 0, `axe finds no problems on ${title} (${violations.join(", ") || "none"})`);
  }
  await page.screenshot({ path: `${SHOTS}crossword-desktop.png` });
  await page.setViewport({ width: 390, height: 844 }); await sleep(200);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), "the crossword fits a 390 px phone without sideways page scroll");
  await page.screenshot({ path: `${SHOTS}crossword-phone.png` });
  check(problems.length === 0, `no console errors (${problems.slice(0, 3).join(" | ") || "none"})`);
} finally {
  await browser.close();
}
if (failures.length) { console.log(`\n${failures.length} check(s) failed.`); process.exit(1); }
console.log("\nAll keyboard game checks passed.");
