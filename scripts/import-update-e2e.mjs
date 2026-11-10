// End-to-end check of "Update existing lessons" in tools/import-content.html, against the local demo stack:
// npm run dev  then  node scripts/import-update-e2e.mjs
// A fresh import matches its files; a copy that differs is listed, backed up (a download) and replaced; then it matches again.
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { DEMO_STUDENTS, DEMO_TEACHER, seedEmulator } from "./seed-emulator.mjs";

const BASE = process.env.SITE || "http://127.0.0.1:5050/";
const DB = process.env.DB_HOST || "127.0.0.1:9000";
const NS = "sabina-s-workspace-default-rtdb";
const anna = DEMO_STUDENTS[0];
const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(path => path && existsSync(path));
if (!executable) throw new Error("No Chrome/Edge found. Set CHROME_PATH.");
const failures = [];
const check = (condition, message) => { console.log(`${condition ? "ok  " : "FAIL"} ${message}`); if (!condition) failures.push(message); };
async function rest(path, method = "GET", body) {
  const response = await fetch(`http://${DB}/${path}.json?ns=${NS}&access_token=owner`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  return response.json();
}

await seedEmulator({ log: () => {} });
const browser = await puppeteer.launch({ executablePath: executable, headless: true, args: ["--no-sandbox", "--lang=en-US"] });
try {
  const page = await (await browser.createBrowserContext()).newPage();
  page.on("dialog", dialog => dialog.accept());
  const problems = [];
  page.on("pageerror", error => problems.push(error.message));
  await page.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await page.evaluate(async credentials => { await firebase.auth().signInWithEmailAndPassword(credentials.email, credentials.password); }, DEMO_TEACHER);
  await page.goto(`${BASE}tools/import-content.html`, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => !document.getElementById("checkLessonsButton").disabled, { timeout: 20000 });
  const status = () => page.$eval("#status", node => node.textContent);

  await page.click("#checkLessonsButton");
  await page.waitForFunction(() => /matches|differ/.test(document.getElementById("status").textContent), { timeout: 20000 });
  check(/Every protected lesson copy matches/.test(await status()), `freshly imported copies match their files ("${(await status()).slice(0, 60)}")`);
  check(await page.$eval("#updateLessonsButton", button => button.disabled), "there is nothing to update");

  await rest(`protectedContent/${anna.lessonId}/classwork/content/readingQ/0/prompt`, "PUT", "An old question");
  await page.click("#checkLessonsButton");
  await page.waitForFunction(() => /differ/.test(document.getElementById("status").textContent), { timeout: 20000 });
  const rows = await page.$$eval("#lessonUpdateList li", items => items.map(item => item.textContent));
  check(rows.some(row => /^Will update: .*\(classwork, sabina\.json\)/.test(row)), `the changed copy is listed (${rows.filter(row => /Will update/.test(row)).join(" | ")})`);
  check(/Nothing has been changed yet/.test(await status()), "checking changes nothing");
  check(await page.$eval("#updateLessonsButton", button => !button.disabled && /Update 1 lesson copy/.test(button.textContent)), "the update button says how many copies it will replace");

  const client = await page.createCDPSession();
  await client.send("Browser.setDownloadBehavior", { behavior: "deny" }).catch(() => {});
  await page.click("#updateLessonsButton");
  await page.waitForFunction(() => /Updated 1 lesson copy/.test(document.getElementById("status").textContent), { timeout: 20000 });
  const stored = await rest(`protectedContent/${anna.lessonId}/classwork`);
  check(stored && stored.content.readingQ[0].prompt !== "An old question" && stored.updatedAt && stored.sourceFile === "sabina.json", "the copy is replaced by the file and marked with the update time");
  await page.click("#checkLessonsButton");
  await page.waitForFunction(() => /matches|differ/.test(document.getElementById("status").textContent), { timeout: 20000 });
  check(/Every protected lesson copy matches/.test(await status()), "after the update every copy matches again");
  check(problems.length === 0, `no page errors (${problems.join(" | ") || "none"})`);
} finally {
  await browser.close();
}
if (failures.length) { console.log(`\n${failures.length} check(s) failed.`); process.exit(1); }
console.log("\nAll lesson update checks passed.");
