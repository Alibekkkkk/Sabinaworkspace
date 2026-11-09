// Robustness and languages in a real browser:  npm run dev  then  npm run test:robustness-e2e
// Language picker (Russian and Kazakh, remembered, page language attribute), the error boundary (copyable code, one report in the
// database, shown to the teacher), storage that throws, the same lesson open in two tabs, and a device clock that is far off.
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { DEMO_STUDENTS, DEMO_TEACHER, seedEmulator } from "./seed-emulator.mjs";

const BASE = process.env.SITE || "http://127.0.0.1:5050/";
const DB = process.env.DB_HOST || "127.0.0.1:9000";
const NS = "sabina-s-workspace-default-rtdb";
const [anna] = DEMO_STUDENTS;
const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(path => existsSync(path));
if (!executable) throw new Error("No Chrome/Edge found. Set CHROME_PATH.");
const failures = [];
const check = (condition, message) => { console.log(`${condition ? "ok  " : "FAIL"} ${message}`); if (!condition) failures.push(message); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, ms = 12000, step = 80) { const end = Date.now() + ms; while (Date.now() < end) { const value = await fn(); if (value) return value; await sleep(step); } return false; }
async function rest(path, method = "GET", body) { const response = await fetch(`http://${DB}/${path}.json?ns=${NS}&access_token=owner`, { method, body: body === undefined ? undefined : JSON.stringify(body) }); return response.json(); }
const IGNORE = /favicon|Tracking Prevention|404|Failed to load resource|Framing 'http:\/\/127\.0\.0\.1|robustness-test/i;

await seedEmulator({ log: () => {} });
await rest(`clientErrors/${anna.code}`, "DELETE");
const browser = await puppeteer.launch({ executablePath: executable, headless: true, args: ["--no-sandbox", "--lang=en-US"] });
const problems = [];
const watch = (page, label) => { page.on("pageerror", error => { if (!IGNORE.test(error.message)) problems.push(`${label}: ${error.message}`); }); page.on("console", message => { const text = message.text(); if (message.type() === "error" && !IGNORE.test(text)) problems.push(`${label}: ${text}`); }); };
async function login(page, code) {
  await page.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" }); await page.waitForSelector("#loginCode");
  await page.evaluate(value => { document.getElementById("rememberMe").checked = true; document.getElementById("loginCode").value = value; document.querySelector('[data-action="login"]').click(); }, code);
  await page.waitForFunction(() => getComputedStyle(document.getElementById("lessonsScreen")).display !== "none", { timeout: 20000 });
}

try {
  // ---- languages ------------------------------------------------------------------------------------------------------------------------------
  const context = await browser.createBrowserContext(); const page = await context.newPage(); watch(page, "student"); await page.setViewport({ width: 1100, height: 900 });
  await login(page, anna.code);
  await page.goto(`${BASE}clips.html?code=${anna.code}`, { waitUntil: "networkidle2" });
  check(await page.evaluate(() => document.documentElement.lang === "en" && [...document.querySelectorAll(".ds-bottom-nav a")].map(a => a.textContent.trim()).join("|").includes("Home")), "the page starts in English");
  check(await page.evaluate(() => { const select = document.getElementById("languageSwitch"); return Boolean(select) && select.options.length === 3 && select.getAttribute("aria-label") === "Language" && select.previousElementSibling === document.querySelector("[data-theme-toggle]"); }), "a language picker sits next to the theme button");
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.select("#languageSwitch", "ru")]);
  check(await page.evaluate(() => document.documentElement.lang === "ru" && /Главная/.test(document.querySelector(".ds-bottom-nav").textContent) && document.querySelector(".ds-bottom-nav").getAttribute("aria-label") === "Навигация ученика"), "choosing Russian reloads the page in Russian, with the page language set");
  check(await page.evaluate(() => document.getElementById("languageSwitch").value === "ru" && localStorage.getItem("nd_language") === "ru"), "and the choice is remembered on the device");
  await page.goto(`${BASE}manga.html?code=${anna.code}`, { waitUntil: "networkidle2" });
  check(await until(() => page.evaluate(() => /Пока не включено|Раздел «Чтение манги»/.test(document.body.textContent))), "another page, still in Russian (the not-switched-on page for a student without manga)");
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.select("#languageSwitch", "kk")]);
  check(await page.evaluate(() => document.documentElement.lang === "kk" && /Басты бет/.test(document.querySelector(".ds-bottom-nav").textContent)), "Kazakh works the same way");
  await page.screenshot({ path: new URL("../docs/screenshots/phase8/language-kk.png", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") }).catch(() => {});
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.select("#languageSwitch", "en")]);

  // ---- the error boundary -------------------------------------------------------------------------------------------------------------------
  await page.goto(`${BASE}clips.html?code=${anna.code}`, { waitUntil: "networkidle2" });
  await page.waitForSelector(".ds-bottom-nav"); await sleep(1500);
  await page.evaluate(() => { const script = document.createElement("script"); script.src = `tests/fixtures/throw-error.js?${Date.now()}`; document.body.append(script); });
  check(await until(() => page.evaluate(() => /Something went wrong\. Code: E-[0-9A-Z]{6}/.test((document.querySelector("#noticeHost [role=alert]") || {}).textContent || ""))), "an uncaught error shows a short message with a code");
  const diag = await page.evaluate(() => ((document.querySelector("#noticeHost [role=alert]") || { textContent: "" }).textContent.match(/E-[0-9A-Z]{6}/) || [""])[0]);
  check(await until(async () => { const all = await rest(`clientErrors/${anna.code}`); return all && Object.values(all).some(item => item.diag === diag && /robustness-test boom/.test(item.message) && item.page === "clips.html"); }), `one report with that code reached the database (${diag})`);
  await page.evaluate(() => { const script = document.createElement("script"); script.src = `tests/fixtures/throw-error.js?${Date.now()}`; document.body.append(script); }); await sleep(600);
  check(Object.keys((await rest(`clientErrors/${anna.code}`)) || {}).length === 1, "the same error is not reported twice");
  await page.evaluate(() => { Promise.reject(new Error("robustness-test rejection")); }); await sleep(4000);
  await page.evaluate(() => { Promise.reject(new Error("robustness-test rejection two")); }); await sleep(1200);
  check(Object.keys((await rest(`clientErrors/${anna.code}`)) || {}).length >= 2 && Object.keys((await rest(`clientErrors/${anna.code}`))).length <= 3, "an unhandled rejection is reported too, with a gap between reports");
  check(await page.evaluate(async () => { const box = document.querySelector("#noticeHost [role=alert]"); const button = [...box.querySelectorAll("button")].find(b => b.textContent === "Copy code"); return Boolean(button) && button.offsetHeight >= 44; }), "the copy button is a full-size touch target");
  const teacherContext = await browser.createBrowserContext(); const teacher = await teacherContext.newPage(); watch(teacher, "teacher"); await teacher.setViewport({ width: 1440, height: 1000 });
  await teacher.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await teacher.evaluate(async credentials => { await firebase.auth().signInWithEmailAndPassword(credentials.email, credentials.password); }, DEMO_TEACHER);
  await teacher.goto(`${BASE}dashboard.html`, { waitUntil: "networkidle2" }); await teacher.waitForSelector(".student-item", { timeout: 25000 });
  await teacher.evaluate(code => document.querySelector(`.student-item[data-code="${code}"]`).click(), anna.code);
  check(await until(() => teacher.evaluate(d => document.getElementById("errorsHost").textContent.includes(d), diag)), "the teacher sees the error and its code on the dashboard");
  await teacher.evaluate(() => [...document.querySelectorAll("#errorsHost button")].find(b => /Clear/.test(b.textContent)).click());
  check(await until(async () => (await rest(`clientErrors/${anna.code}`)) === null), "and can clear the reports");
  await teacherContext.close();

  // ---- storage that throws, two tabs, a wrong clock -------------------------------------------------------------------------------------------
  const blockedContext = await browser.createBrowserContext(); const blocked = await blockedContext.newPage(); watch(blocked, "blocked"); await blocked.setViewport({ width: 1100, height: 900 });
  await blocked.evaluateOnNewDocument(() => { for (const name of ["localStorage", "sessionStorage"]) Object.defineProperty(window, name, { configurable: true, get() { throw new DOMException("The operation is insecure.", "SecurityError"); } }); });
  await blocked.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  check(await until(() => blocked.evaluate(() => Boolean(document.getElementById("loginCode")))), "with storage blocked the sign-in page still opens");
  check(await until(() => blocked.evaluate(() => /not letting the portal save on your device/.test(document.body.textContent))), "and says plainly that nothing can be saved on the device");
  await blocked.evaluate(code => { document.getElementById("loginCode").value = code; document.querySelector('[data-action="login"]').click(); }, anna.code);
  check(await until(() => blocked.evaluate(() => getComputedStyle(document.getElementById("lessonsScreen")).display !== "none"), 20000), "a student can still sign in and see their lessons");
  await blockedContext.close();

  const lessonUrl = `${BASE}lesson.html?code=${anna.code}&lesson=sabina`;
  const second = await context.newPage(); watch(second, "tab2"); await page.goto(lessonUrl, { waitUntil: "networkidle2" });
  check(await page.evaluate(() => !document.getElementById("notice-second-tab")), "one tab on a lesson shows no warning");
  await second.goto(lessonUrl, { waitUntil: "networkidle2" });
  check(await until(() => page.evaluate(() => /open in another tab/.test((document.getElementById("notice-second-tab") || {}).textContent || ""))) && await until(() => second.evaluate(() => /open in another tab/.test((document.getElementById("notice-second-tab") || {}).textContent || ""))), "a second tab on the same lesson warns both tabs");
  await second.close();

  const skewContext = await browser.createBrowserContext(); const skew = await skewContext.newPage(); watch(skew, "skew"); await skew.setViewport({ width: 1100, height: 900 });
  await skew.evaluateOnNewDocument(() => { const real = Date.now.bind(Date); Date.now = () => real() + 10 * 60 * 1000; });
  await login(skew, anna.code);
  check(await until(() => skew.evaluate(() => /about \d+ minutes ahead/.test(document.body.textContent)), 15000), "a device clock ten minutes fast is reported");
  await skewContext.close();

  check(problems.length === 0, `no unexpected console errors (${problems.slice(0, 3).join(" | ") || "none"})`);
  await context.close();
} finally { await browser.close(); await rest(`clientErrors/${anna.code}`, "DELETE"); }
if (failures.length) { console.log(`\n${failures.length} check(s) failed.`); process.exit(1); }
console.log("\nAll robustness checks passed.");
