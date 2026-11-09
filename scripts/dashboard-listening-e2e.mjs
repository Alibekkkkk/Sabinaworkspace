// Teacher dashboard "Listening practice" card against the local demo stack:  npm run dev  then  npm run test:dashboard-listening-e2e
// Seeds a student's listening progress (rounds, missed words, per-sentence accuracy), signs in as the teacher,
// opens the student and checks the card; also checks the empty state, accessibility basics and the phone layout.
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import axeCore from "axe-core";
import { DEMO_STUDENTS, DEMO_TEACHER, seedEmulator } from "./seed-emulator.mjs";

const BASE = process.env.SITE || "http://127.0.0.1:5050/";
const DB = process.env.DB_HOST || "127.0.0.1:9000";
const NS = "sabina-s-workspace-default-rtdb";
const [anna, boris] = DEMO_STUDENTS;
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
const day = offset => new Date(Date.UTC(2026, 10, 1 + offset, 10)).toISOString();
const rounds = [[4, 10], [5, 10], [7, 10], [9, 10]].map(([score, total], index) => ({ gameId: "listening-sabina-natural-disasters", gameType: "listening", score, total, timeSpentSeconds: 150, completedAt: day(index) }));
const prompt = word => `Listen and type the missing word: The ____ has ${word}.`;
await rest(`studentProgress/${anna.code}`, "PUT", {
  xp: 120, level: 2, gems: 1, hearts: 5, streak: 2, lastActivityDate: "2026-11-04",
  attempts: [{ gameId: "word-match", gameType: "word-match", score: 3, total: 4, timeSpentSeconds: 60, completedAt: day(0) }, ...rounds],
  reviewQueue: [
    { itemId: "sabina-l-001-1", prompt: prompt("flooded"), answer: "river", topic: "Listening" },
    { itemId: "sabina-l-004-1", prompt: prompt("left"), answer: "river", topic: "Listening" },
    { itemId: "sabina-l-005-2", prompt: prompt("damaged"), answer: "drought", topic: "Listening" },
    { itemId: "other-1", prompt: "Pick the word", answer: "ignored", topic: "Vocabulary" }
  ],
  listening: {
    "sabina-l-001": { attempts: 3, bestAccuracy: 0.5, lastAt: 1790000000000 },
    "sabina-l-002": { attempts: 1, bestAccuracy: 1, lastAt: 1790000000000 },
    "sabina-l-005": { attempts: 2, bestAccuracy: 0.25, lastAt: 1790000000000 }
  }
});

const browser = await puppeteer.launch({ executablePath: executable, headless: true, args: ["--no-sandbox"] });
const problems = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  page.on("console", message => { const text = message.text(); if (message.type() === "error" && !/favicon|Tracking Prevention|404|Failed to load resource/i.test(text)) problems.push(text); });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await page.evaluate(async credentials => { await firebase.auth().signInWithEmailAndPassword(credentials.email, credentials.password); }, DEMO_TEACHER);
  await page.goto(`${BASE}dashboard.html`, { waitUntil: "networkidle2" });
  await page.waitForSelector(".student-item", { timeout: 25000 });
  const open = code => page.evaluate(target => { document.querySelector(`.student-item[data-code="${target}"]`).click(); }, code);

  await open(anna.code);
  await page.waitForFunction(() => /rounds?/.test(document.getElementById("listeningSummary").textContent), { timeout: 15000 });
  const text = () => page.evaluate(() => document.getElementById("listeningSummary").innerText);
  let content = await text();
  check(/4 rounds/.test(content) && /63% of words correct/.test(content), "the card shows 4 listening rounds and 63% of words correct (other games are not counted)");
  check(/3 sentences practised, 1 at 90% or better/.test(content), "it counts practised and mastered sentences");
  check(/Improving/.test(content), "the accuracy trend says Improving for 40% to 90%");
  check(await page.evaluate(() => !!document.querySelector("#listeningSummary svg[role='img']") && /40%, 50%, 70%, 90%/.test(document.querySelector("#listeningSummary svg").getAttribute("aria-label"))), "the trend chart has a text alternative listing every round");
  check(/river · missed 2 times/.test(content) && /drought · missed 1 time/.test(content) && !/ignored/.test(content), "missed words are counted, most missed first, and other topics are left out");
  check(/The ____ has flooded\./.test(content), "a missed word shows the sentence it was missed in");
  await page.waitForFunction(() => /The river has flooded the main road again\./.test(document.getElementById("listeningSummary").innerText), { timeout: 8000 }).catch(() => {});
  content = await text();
  check(/The river has flooded the main road again\. · best 50% · 3 attempts/.test(content) && /A long drought has damaged the crops this summer\. · best 25%/.test(content), "weak sentences show their text, best accuracy and attempts, weakest last-first order");
  check(content.indexOf("best 25%") < content.indexOf("best 50%"), "the weakest sentence is listed first");
  check(!/best 100%/.test(content), "a sentence at 100% is not listed as weak");

  await page.evaluate(axeCore.source);
  const violations = await page.evaluate(() => axe.run(document.getElementById("listeningCard"), { resultTypes: ["violations"] }).then(result => result.violations.map(v => `${v.impact}:${v.id}`)));
  check(violations.length === 0, `axe finds no problems in the card (${violations.join(", ") || "none"})`);

  await open(boris.code);
  await page.waitForFunction(code => document.getElementById("selectedCode").textContent === code, {}, boris.code);
  await sleep(800);
  content = await text();
  check(/No listening practice yet/.test(content), "a student without listening data sees a clear empty state");

  await page.setViewport({ width: 390, height: 844 });
  await open(anna.code);
  await page.waitForFunction(() => /rounds?/.test(document.getElementById("listeningSummary").textContent), { timeout: 15000 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), "no horizontal scroll at 390px wide");
  check(problems.length === 0, `no console errors (${problems.length}${problems.length ? ": " + problems.slice(0, 2).join(" | ") : ""})`);
} finally {
  await browser.close();
}
if (failures.length) { console.log(`\n${failures.length} check(s) failed.`); process.exit(1); }
console.log("\nAll dashboard listening checks passed.");
