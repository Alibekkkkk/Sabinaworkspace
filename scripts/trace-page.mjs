// A Chrome performance trace of a signed-in page against the demo site:  npm run dev  then
//   node scripts/trace-page.mjs lesson "lesson.html?code=DEMOA001&lesson=sabina"
// Signs in as the first demo student, loads the page with a 4x slower CPU, records a trace, and prints the heaviest kinds of
// work and the heaviest single tasks, plus long tasks over 50 ms. The raw trace goes to the scratch path you give as a third
// argument (open it in Chrome DevTools > Performance). A diagnostic for finding hot spots, not a gate.
import { existsSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { DEMO_STUDENTS, seedEmulator } from "./seed-emulator.mjs";

const BASE = process.env.SITE || "http://127.0.0.1:5050/";
const [label = "page", target = "portal.html", output] = process.argv.slice(2);
const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(path => existsSync(path));
await seedEmulator({ log: () => {} });
const browser = await puppeteer.launch({ executablePath: executable, headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage(); await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" }); await page.waitForSelector("#loginCode");
  await page.evaluate(code => { document.getElementById("rememberMe").checked = true; document.getElementById("loginCode").value = code; document.querySelector('[data-action="login"]').click(); }, DEMO_STUDENTS[0].code);
  await page.waitForFunction(() => getComputedStyle(document.getElementById("lessonsScreen")).display !== "none", { timeout: 20000 });
  const client = await page.createCDPSession(); await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "v8.execute", "blink.user_timing", "disabled-by-default-devtools.timeline.stack"] });
  await page.goto(BASE + target, { waitUntil: "networkidle2" }); await new Promise(resolve => setTimeout(resolve, 1500));
  const buffer = Buffer.from(await page.tracing.stop());
  if (output) writeFileSync(output, buffer);
  const events = JSON.parse(buffer.toString()).traceEvents.filter(event => event.ph === "X" && event.dur);
  const byName = new Map(); for (const event of events) byName.set(event.name, (byName.get(event.name) || 0) + event.dur / 1000);
  console.log(`== ${label}: heaviest kinds of work (ms, 4x CPU slowdown)`);
  for (const [name, ms] of [...byName].filter(([name]) => !/^(RunTask|ThreadControllerImpl|RunMicrotasks)/.test(name)).sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${name.padEnd(34)} ${ms.toFixed(0)}`);
  const tasks = events.filter(event => event.name === "RunTask").sort((a, b) => b.dur - a.dur);
  console.log(`long tasks over 50 ms: ${tasks.filter(task => task.dur > 50000).length}; longest ${tasks[0] ? (tasks[0].dur / 1000).toFixed(0) : 0} ms`);
  const styles = events.filter(event => ["UpdateLayoutTree", "RecalculateStyles"].includes(event.name)).sort((a, b) => b.dur - a.dur).slice(0, 4);
  for (const event of styles) console.log(`  ${event.name} ${(event.dur / 1000).toFixed(0)} ms, elements ${event.args && event.args.elementCount}`);
  for (const event of events.filter(item => item.name === "Layout").sort((x, y) => y.dur - x.dur).slice(0, 3)) {
    const data = (event.args && (event.args.beginData || event.args.data)) || {}; const frames = (data.stackTrace || []).slice(0, 3).map(frame => `${frame.functionName || "(anonymous)"} ${String(frame.url || "").split("/").slice(-1)[0]}:${frame.lineNumber}`).join(" < ");
    console.log(`  Layout ${(event.dur / 1000).toFixed(0)} ms, dirty ${data.dirtyObjects} of ${data.totalObjects}${frames ? `, from ${frames}` : ""}`);
  }
  const functions = events.filter(event => event.name === "FunctionCall" || event.name === "EvaluateScript").sort((a, b) => b.dur - a.dur).slice(0, 5);
  for (const event of functions) console.log(`  ${event.name} ${(event.dur / 1000).toFixed(0)} ms ${(event.args && event.args.data && (event.args.data.url || event.args.data.functionName) || "").split("/").slice(-2).join("/")}`);
} finally { await browser.close(); }
