// The teacher's "Student data and privacy" card in a real browser:  npm run dev  then  npm run test:privacy-e2e
// Selects a student with data, downloads the export (and reads it back), checks the delete button waits for the typed code, then
// deletes and checks every path is gone from the database while another student's data is untouched.
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { DEMO_STUDENTS, DEMO_TEACHER, seedEmulator } from "./seed-emulator.mjs";

const BASE = process.env.SITE || "http://127.0.0.1:5050/";
const DB = process.env.DB_HOST || "127.0.0.1:9000";
const NS = "sabina-s-workspace-default-rtdb";
const [anna, ben] = DEMO_STUDENTS;
const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(path => existsSync(path));
if (!executable) throw new Error("No Chrome/Edge found. Set CHROME_PATH.");
const failures = [];
const check = (condition, message) => { console.log(`${condition ? "ok  " : "FAIL"} ${message}`); if (!condition) failures.push(message); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, ms = 12000, step = 80) { const end = Date.now() + ms; while (Date.now() < end) { const value = await fn(); if (value) return value; await sleep(step); } return false; }
async function rest(path, method = "GET", body) { const response = await fetch(`http://${DB}/${path}.json?ns=${NS}&access_token=owner`, { method, body: body === undefined ? undefined : JSON.stringify(body) }); return response.json(); }

await seedEmulator({ log: () => {} });
for (const code of [anna.code, ben.code]) await rest(`studentProgress/${code}`, "PUT", { xp: 40, level: 1, vocabulary: { cat: { word: "cat" } } });
await rest(`sessions/${anna.code}/state`, "PUT", { stage: 3 });
await rest(`studentFeatures/${anna.code}`, "PUT", { mangaReader: true });
await rest(`mangaAssignments/${anna.code}/gaziz-demo/first-seeds`, "PUT", { assignedAt: Date.now() });

const browser = await puppeteer.launch({ executablePath: executable, headless: true, args: ["--no-sandbox"] });
const problems = [];
try {
  const context = await browser.createBrowserContext(); const page = await context.newPage();
  page.on("pageerror", error => problems.push(error.message));
  page.on("console", message => { const text = message.text(); if (message.type() === "error" && !/favicon|Tracking Prevention|404|Failed to load resource|Framing 'http:\/\/127\.0\.0\.1/i.test(text)) problems.push(text); });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await page.evaluate(async credentials => { await firebase.auth().signInWithEmailAndPassword(credentials.email, credentials.password); }, DEMO_TEACHER);
  await page.goto(`${BASE}dashboard.html`, { waitUntil: "networkidle2" });
  await page.waitForSelector(".student-item", { timeout: 25000 });
  await page.evaluate(code => document.querySelector(`.student-item[data-code="${code}"]`).click(), anna.code);
  check(await until(() => page.evaluate(() => document.querySelectorAll("#privacyHost button").length === 2)), "the privacy card shows an export and a delete button");
  check(await page.evaluate(() => document.querySelector("#privacyHost .danger").disabled === true), "delete is disabled until the code is typed");
  await page.evaluate(() => { window.__blob = null; const make = URL.createObjectURL.bind(URL); URL.createObjectURL = blob => { window.__blob = blob; return make(blob); }; window.__download = null; const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__download = { name: this.download, url: this.href }; return; } return click.call(this); }; });
  await page.evaluate(() => document.querySelector("#privacyHost button").click());
  check(await until(() => page.evaluate(() => /Downloaded \d+ kinds of data/.test(document.querySelector("#privacyHost [role=status]").textContent))), "the export says what it collected");
  const exported = await page.evaluate(async () => { const file = window.__download; if (!file || !window.__blob) return null; return { name: file.name, json: JSON.parse(await window.__blob.text()) }; });
  check(Boolean(exported) && /^student-DEMOA001-export-\d{4}-\d{2}-\d{2}\.json$/.test(exported.name), `the file is named for the student and the date (${exported && exported.name})`);
  check(Boolean(exported) && exported.json.data.progress.xp === 40 && exported.json.data.session.state.stage === 3 && exported.json.data.features.mangaReader === true && exported.json.data.mangaAssignments["gaziz-demo"] && exported.json.data.profile.name, "it holds the profile, progress, session, features and manga assignments");
  check(Boolean(exported) && !JSON.stringify(exported.json).includes(ben.code), "and none of another student's data");
  await page.type("#eraseConfirm", "demoa00");
  check(await page.evaluate(() => document.querySelector("#privacyHost .danger").disabled === true), "a code that is not quite right keeps delete disabled");
  await page.type("#eraseConfirm", "1");
  check(await page.evaluate(() => document.querySelector("#privacyHost .danger").disabled === false), "the full code (any letter case) enables it");
  await page.evaluate(() => document.querySelector("#privacyHost .danger").click());
  check(await until(() => page.evaluate(() => /Deleted \d+ items?/.test(document.querySelector("#privacyHost [role=status]") ? document.querySelector("#privacyHost [role=status]").textContent : ""))), "deleting reports what it removed");
  for (const path of ["students", "studentProgress", "sessions", "studentFeatures", "mangaAssignments", "studentCurriculum"]) check((await rest(`${path}/${anna.code}`)) === null, `${path}/${anna.code} is gone from the database`);
  check((await rest(`students/${ben.code}`)) !== null, "another student's record is untouched");
  check((await rest(`studentProgress/${ben.code}/xp`)) === 40, "and so is their progress");
  check(problems.length === 0, `no console errors (${problems.slice(0, 2).join(" | ") || "none"})`);
  await context.close();
} finally { await browser.close(); await seedEmulator({ log: () => {} }); }
if (failures.length) { console.log(`\n${failures.length} check(s) failed.`); process.exit(1); }
console.log("\nAll privacy checks passed.");
