// Whiteboard on tablets and phones, accessibility, speed and the teacher dashboard card:  npm run dev  then  npm run test:whiteboard-devices-e2e
// Touch drawing and pinch with real touch events, stylus pressure and palm rejection, axe at desktop/phone in both themes,
// frame times with 2000 strokes, and the dashboard's live thumbnail, Take/Give control and end-of-class snapshot.
import { existsSync, mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";
import axeCore from "axe-core";
import { DEMO_STUDENTS, DEMO_TEACHER, seedEmulator } from "./seed-emulator.mjs";

const BASE = process.env.SITE || "http://127.0.0.1:5050/";
const DB = process.env.DB_HOST || "127.0.0.1:9000";
const NS = "sabina-s-workspace-default-rtdb";
const anna = DEMO_STUDENTS[0];
const SHOTS = new URL("../docs/screenshots/phase4/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
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
await rest("whiteboards", "DELETE");
const browser = await puppeteer.launch({ executablePath: executable, headless: true, args: ["--no-sandbox", "--lang=en-US"] });
const problems = [];
const watch = (page, label) => {
  page.on("pageerror", error => problems.push(`${label} pageerror: ${error.message}`));
  page.on("console", message => { const text = message.text(); if (message.type() === "error" && !/favicon|Tracking Prevention|404|Failed to load resource/i.test(text)) problems.push(`${label}: ${text}`); });
  page.on("dialog", async dialog => { await dialog.accept(); });
};
const url = (extra = "") => `${BASE}whiteboard.html?code=${anna.code}&lesson=${anna.lessonId}&board=personal${extra}`;
const count = page => page.evaluate(() => window.__whiteboard.objects.size);
const tool = (page, id) => page.evaluate(name => document.querySelector(`.wb-rail [data-tool="${name}"]`).click(), id);

try {
  // ---- tablet with real touch input --------------------------------------------------------------------
  const tablet = await browser.newPage(); watch(tablet, "tablet");
  await tablet.setViewport({ width: 1024, height: 768, hasTouch: true, isMobile: true });
  await tablet.goto(url(), { waitUntil: "networkidle2" });
  await tablet.waitForSelector(".wb-canvas");
  await until(() => tablet.evaluate(() => window.__whiteboard.state.canDraw && document.querySelectorAll(".wb-page").length >= 1));
  const cdp = await tablet.createCDPSession();
  const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 0.5 })) });
  const box = await (await tablet.$(".wb-canvas")).boundingBox();
  const at = (x, y) => [box.x + x, box.y + y];
  await tool(tablet, "pen");
  await touch("touchStart", [at(200, 200)]);
  for (let i = 1; i <= 8; i++) await touch("touchMove", [at(200 + i * 30, 200 + i * 8)]);
  await touch("touchEnd", []);
  check(await until(async () => (await count(tablet)) === 1), "a finger draws a stroke on a tablet-sized screen");
  check(await tablet.evaluate(() => getComputedStyle(document.querySelector(".wb-canvas")).touchAction === "none"), "the canvas uses touch-action: none so the page does not scroll while drawing");
  const zoom0 = await tablet.evaluate(() => window.__whiteboard.renderer.view.zoom);
  await touch("touchStart", [at(300, 300), at(400, 300)]);
  for (let i = 1; i <= 8; i++) await touch("touchMove", [at(300 - i * 15, 300), at(400 + i * 15, 300)]);
  await touch("touchEnd", []);
  await sleep(300);
  check(await tablet.evaluate(z => window.__whiteboard.renderer.view.zoom > z * 1.3, zoom0), "two fingers pinch to zoom");
  check((await count(tablet)) === 1, "and the pinch does not leave a stray stroke");
  const tx0 = await tablet.evaluate(() => window.__whiteboard.renderer.view.tx);
  await touch("touchStart", [at(300, 300), at(400, 300)]);
  for (let i = 1; i <= 8; i++) await touch("touchMove", [at(300 + i * 12, 300), at(400 + i * 12, 300)]);
  await touch("touchEnd", []);
  check(await tablet.evaluate(start => Math.abs(window.__whiteboard.renderer.view.tx - start) > 40, tx0), "two fingers moving together pan the board");
  const small = await tablet.evaluate(() => [...document.querySelectorAll(".wb-rail button, .wb-bottom button, .wb-swatch")].filter(b => !b.hidden && b.offsetParent).map(b => b.getBoundingClientRect()).filter(r => r.width < 43.5 || r.height < 43.5).length);
  check(small === 0, `every tool, colour and action button is at least 44 px (${small} are smaller)`);
  await tablet.screenshot({ path: `${SHOTS}tablet-1024-dark.png` });

  // ---- stylus pressure and palm rejection (synthetic pointer events) ---------------------------------------------
  await tablet.setViewport({ width: 1440, height: 900 });
  await sleep(300);
  const pen = await tablet.evaluate(async () => {
    const canvas = document.querySelector(".wb-canvas"); const rect = canvas.getBoundingClientRect(); const board = window.__whiteboard;
    const fire = (type, x, y, init) => canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: rect.left + x, clientY: rect.top + y, button: 0, buttons: type === "pointerup" ? 0 : 1, isPrimary: true, ...init }));
    board.setTool("pen"); const before = board.objects.size;
    fire("pointerdown", 100, 500, { pointerId: 7, pointerType: "pen", pressure: 0.1 });
    for (let i = 1; i <= 12; i++) fire("pointermove", 100 + i * 20, 500 + (i % 3) * 3, { pointerId: 7, pointerType: "pen", pressure: 0.1 + i * 0.07 });
    fire("pointerup", 340, 500, { pointerId: 7, pointerType: "pen", pressure: 0 });
    fire("pointerdown", 100, 600, { pointerId: 9, pointerType: "touch", pressure: 0.5 }); // a palm right after the pen
    fire("pointermove", 200, 620, { pointerId: 9, pointerType: "touch", pressure: 0.5 });
    fire("pointerup", 200, 620, { pointerId: 9, pointerType: "touch", pressure: 0 });
    await new Promise(resolve => setTimeout(resolve, 600));
    return { added: board.objects.size - before, strokes: [...board.objects.values()].filter(o => o.t === "stroke").map(o => o.p) };
  });
  check(pen.added === 1, `a stylus stroke is drawn and a palm touching right after it is ignored (${pen.added} new object)`);
  const pressures = new Set((pen.strokes.at(-1) || "").split(" ").map(token => token.split(",")[2]));
  check(pressures.size >= 4, `pen pressure is stored per point (${pressures.size} different levels)`);

  // ---- accessibility -------------------------------------------------------------------------------------------------------
  const axeRun = async label => {
    await tablet.evaluate(axeCore.source);
    const violations = await tablet.evaluate(() => axe.run(document.querySelector(".wb"), { resultTypes: ["violations"] }).then(r => r.violations.map(v => `${v.impact}:${v.id}:${v.nodes.length}`)));
    check(violations.length === 0, `axe finds no problems in the whiteboard, ${label} (${violations.join(", ") || "none"})`);
  };
  for (const [width, height, name] of [[1440, 900, "desktop"], [390, 844, "phone"]]) {
    await tablet.setViewport({ width, height, hasTouch: width < 800, isMobile: width < 800 });
    for (const theme of ["dark", "light"]) {
      await tablet.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }]);
      await tablet.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await sleep(250);
      await axeRun(`${name} ${theme}`);
      const wide = await tablet.evaluate(() => { const limit = document.documentElement.clientWidth; return document.documentElement.scrollWidth <= limit + 1 ? '' : [...document.querySelectorAll('body *')].filter(n => n.getBoundingClientRect().right > limit + 1 && !n.closest('.wb-rail, .wb-style, .wb-bottom')).slice(0, 4).map(n => n.className || n.tagName).join(','); });
      check(!wide, `no sideways page scroll at ${width} px, ${theme} ${wide}`);
      await tablet.screenshot({ path: `${SHOTS}whiteboard-${name}-${theme}.png` });
    }
  }
  await tablet.setViewport({ width: 1440, height: 900 });
  const focusable = await tablet.evaluate(() => { const first = document.querySelector(".wb-rail button:not([disabled])"); if (!first) return `no enabled tool (${document.querySelectorAll('.wb-rail button').length} buttons)`; first.focus(); return getComputedStyle(first).outlineStyle !== "none"; });
  check(focusable, "keyboard focus on a toolbar button has a visible outline");
  await tablet.close();

  // ---- speed with 2000 strokes ------------------------------------------------------------------------------------------------
  const perf = await browser.newPage(); watch(perf, "perf");
  await perf.setViewport({ width: 1440, height: 900 });
  await perf.goto(url(), { waitUntil: "networkidle2" });
  await perf.waitForSelector(".wb-canvas");
  await until(() => perf.evaluate(() => window.__whiteboard.state.canDraw));
  const result = await perf.evaluate(async () => {
    const board = window.__whiteboard; const map = new Map();
    const { encodePoints } = await import("/js/whiteboard/geometry.js");
    for (let i = 0; i < 2000; i++) {
      const x = (i % 50) * 150 + 20; const y = Math.floor(i / 50) * 140 + 20;
      const pts = Array.from({ length: 30 }, (_, k) => [k * 4, Math.sin(k / 3 + i) * 25 + 30, 0.5 + 0.3 * Math.sin(k)]);
      map.set(`bench${i}`, { id: `bench${i}`, t: "stroke", k: "pen", z: i, x, y, w: 116, h: 60, p: encodePoints(pts), s: { c: i % 3 ? "auto" : "#e03131", w: 4, o: 1, fs: 24 }, by: "x", at: i });
    }
    board.renderer.setObjects(map); board.renderer.setView({ zoom: 0.5, tx: 40, ty: 40 });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const timed = async (label, step, frames) => {
      const times = []; let last = performance.now();
      for (let i = 0; i < frames; i++) { step(i); await new Promise(resolve => requestAnimationFrame(resolve)); const now = performance.now(); times.push(now - last); last = now; }
      times.sort((a, b) => a - b);
      return { label, avg: times.reduce((s, v) => s + v, 0) / times.length, p95: times[Math.floor(times.length * 0.95)], fps: 1000 / (times.reduce((s, v) => s + v, 0) / times.length) };
    };
    const view = board.renderer.view;
    const pan = await timed("pan", i => board.renderer.setView({ tx: 40 - i * 6, ty: 40 - i * 3 }), 120);
    const zoom = await timed("zoom", i => board.renderer.setView({ zoom: 0.5 + (i % 40) * 0.02, tx: view.tx, ty: view.ty }, { zooming: true }), 80);
    const rebuilds = board.renderer.stats.rebuilds;
    return { pan, zoom, rebuilds, drawMs: board.renderer.stats.lastDrawMs };
  });
  console.log(`speed with 2000 strokes (headless Edge on this PC, not a phone): pan avg ${result.pan.avg.toFixed(1)} ms/frame (${result.pan.fps.toFixed(0)} fps, p95 ${result.pan.p95.toFixed(1)} ms); zoom avg ${result.zoom.avg.toFixed(1)} ms (${result.zoom.fps.toFixed(0)} fps); ${result.rebuilds} cache rebuilds`);
  check(result.pan.fps >= 50, `panning a board of 2000 strokes holds ${result.pan.fps.toFixed(0)} frames a second`);
  await perf.close();

  // ---- dashboard card and end-of-class snapshot ---------------------------------------------------------------------------------
  await seedEmulator({ log: () => {} });
  await rest("whiteboards", "DELETE");
  for (const node of ["lessonClock", "lessonClockLog"]) await rest(`${node}/${anna.code}`, "DELETE");
  const teacherContext = await browser.createBrowserContext(); const studentContext = await browser.createBrowserContext();
  const teacher = await teacherContext.newPage(); watch(teacher, "dashboard"); const student = await studentContext.newPage(); watch(student, "student");
  await teacher.setViewport({ width: 1440, height: 1000 }); await student.setViewport({ width: 1440, height: 900 });
  await teacher.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await teacher.evaluate(async credentials => { await firebase.auth().signInWithEmailAndPassword(credentials.email, credentials.password); }, DEMO_TEACHER);
  await student.goto(`${BASE}whiteboard.html?code=${anna.code}&lesson=${anna.lessonId}`, { waitUntil: "networkidle2" });
  await student.waitForSelector(".wb-canvas");
  await teacher.goto(`${BASE}dashboard.html`, { waitUntil: "networkidle2" });
  await teacher.waitForSelector(".student-item", { timeout: 25000 });
  await teacher.evaluate(code => document.querySelector(`.student-item[data-code="${code}"]`).click(), anna.code);
  await teacher.waitForSelector("#whiteboardCardHost select", { timeout: 15000 });
  check(await until(() => teacher.evaluate(() => /watch/.test(document.querySelector("#whiteboardCardHost .wb-dash__mode").textContent))), "the dashboard card shows who can draw");
  await teacher.evaluate(() => [...document.querySelectorAll("#whiteboardCardHost button")].find(b => /Give control/.test(b.textContent)).click());
  check(await until(async () => (await rest(`whiteboards/${anna.code}/${anna.lessonId}/mode`)) === "draw"), "Give control sets the board to draw for the student");
  check(await until(() => student.evaluate(() => window.__whiteboard.state.canDraw === true)), "and the student's board switches on");
  await student.evaluate(() => document.querySelector('.wb-rail [data-tool="pen"]').click());
  await until(() => student.evaluate(() => document.querySelectorAll(".wb-page").length >= 1));
  const sbox = await (await student.$(".wb-canvas")).boundingBox();
  await student.mouse.move(sbox.x + 200, sbox.y + 200); await student.mouse.down();
  for (let i = 1; i <= 10; i++) await student.mouse.move(sbox.x + 200 + i * 30, sbox.y + 200 + Math.sin(i) * 40);
  await student.mouse.up();
  check(await until(() => teacher.evaluate(() => { const img = document.querySelector("#whiteboardCardHost img.wb-dash__thumb"); return Boolean(img && !img.hidden && /^data:image\/jpeg/.test(img.getAttribute("src") || "")); }), 8000), "the dashboard shows a live picture of what the student drew");
  await teacher.evaluate(() => document.getElementById("whiteboardCard").scrollIntoView());
  await teacher.screenshot({ path: `${SHOTS}dashboard-card-desktop-dark.png` });
  await teacher.evaluate(() => [...document.querySelectorAll("#whiteboardCardHost button")].find(b => /Take control/.test(b.textContent)).click());
  check(await until(async () => (await rest(`whiteboards/${anna.code}/${anna.lessonId}/mode`)) === "view"), "Take control returns the board to watch-only");

  await teacher.evaluate(() => document.getElementById("lessonClockCard").scrollIntoView());
  await sleep(1500);
  await teacher.waitForSelector('#lessonClockHost button[data-clock-action="start"]:not([disabled])', { timeout: 20000 });
  await teacher.click('#lessonClockHost button[data-clock-action="start"]');
  await sleep(1500);
  await teacher.click('#lessonClockHost button[data-clock-action="stop"]');
  const snap = await until(async () => { const value = await rest(`whiteboards/${anna.code}/${anna.lessonId}/snapshots`); return value && Object.values(value)[0]; }, 12000);
  check(Boolean(snap) && Object.values(snap.pages).every(page => /^data:image\/jpeg;base64,/.test(page)), "stopping the lesson clock saves a snapshot of the class board");
  check(problems.length === 0, `no console errors on any page (${problems.slice(0, 3).join(" | ") || "none"})`);
  await teacherContext.close(); await studentContext.close();
} finally {
  await browser.close();
}
if (failures.length) { console.log(`\n${failures.length} check(s) failed.`); process.exit(1); }
console.log("\nAll whiteboard device checks passed.");
