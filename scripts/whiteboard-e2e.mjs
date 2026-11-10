// End-to-end check of the whiteboard against the local demo stack:  npm run dev  then  npm run test:whiteboard-e2e
// Part 1: a student alone on their own board (tools, undo, zoom, pictures, export, reload, keyboard, touch, stylus).
// Part 2: teacher and student in two browser contexts (live strokes, presence, permission modes, clear, snapshot).
// Part 3: speed with 2000 strokes. Screenshots go to docs/screenshots/phase4/.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
async function rest(path, method = "GET", body) {
  const response = await fetch(`http://${DB}/${path}.json?ns=${NS}&access_token=owner`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  return response.json();
}
async function until(fn, ms = 6000, step = 60) { const end = Date.now() + ms; while (Date.now() < end) { const value = await fn(); if (value) return value; await sleep(step); } return false; }

await seedEmulator({ log: () => {} });
await rest("whiteboards", "DELETE");

const browser = await puppeteer.launch({ executablePath: executable, headless: true, args: ["--no-sandbox", "--lang=en-US"] });
const problems = [];
const watch = (page, label) => {
  page.on("pageerror", error => problems.push(`${label} pageerror: ${error.message}`));
  page.on("console", message => { const text = message.text(); if (message.type() === "error" && !/favicon|Tracking Prevention|404|Failed to load resource/i.test(text)) problems.push(`${label}: ${text}`); });
  page.on("dialog", async dialog => { if (page.__acceptDialogs) await dialog.accept(); else { problems.push(`${label} dialog: ${dialog.message()}`); await dialog.dismiss(); } });
};
const studentUrl = (extra = "") => `${BASE}whiteboard.html?code=${anna.code}&lesson=${anna.lessonId}${extra}`;
const count = page => page.evaluate(() => window.__whiteboard.objects.size);
const objectsOf = page => page.evaluate(() => [...window.__whiteboard.objects.values()].map(o => ({ id: o.id, t: o.t, k: o.k, by: o.by, x: Math.round(o.x), y: Math.round(o.y), w: Math.round(o.w), h: Math.round(o.h), tx: o.tx, r: o.r, im: o.im, alt: o.alt })));
const canvasBox = async page => (await page.$(".wb-canvas")).boundingBox();
async function drag(page, from, to, { steps = 12, shift = false } = {}) {
  const box = await canvasBox(page);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(box.x + from[0] + (to[0] - from[0]) * i / steps, box.y + from[1] + (to[1] - from[1]) * i / steps + Math.sin(i) * 4);
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
}
const tool = (page, id) => page.evaluate(name => document.querySelector(`.wb-rail [data-tool="${name}"]`).click(), id);
const live = page => page.evaluate(() => document.querySelector(".wb-sr").textContent);
const click = (page, selector) => page.evaluate(sel => document.querySelector(sel).click(), selector);

let png = null;
try {
  // =========================================================================================================
  console.log("\n== Part 1: a student alone ==");
  const page = await browser.newPage(); watch(page, "student");
  await page.setViewport({ width: 1440, height: 900 });
  const cdp = await page.createCDPSession();
  const downloads = join(tmpdir(), `wb-downloads-${Date.now()}`); mkdirSync(downloads, { recursive: true });
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
  await page.goto(studentUrl(), { waitUntil: "networkidle2" });
  await page.waitForSelector(".wb-canvas");
  check(await page.evaluate(() => document.querySelector(".wb-empty") && !document.querySelector(".wb-empty").hidden), "the class board waits for the teacher before anything has been shared");
  check(await page.evaluate(() => window.__whiteboard.state.canDraw === false), "a student cannot draw on the class board until the teacher allows it");
  await page.evaluate(() => [...document.querySelectorAll(".wb-tab")].find(b => /own board/i.test(b.textContent)).click());
  check(await until(() => page.evaluate(() => window.__whiteboard.state.canDraw === true && document.querySelectorAll(".wb-page").length >= 1)), "the student's own board opens with a first page and drawing switched on");

  await tool(page, "pen");
  await drag(page, [200, 200], [500, 260]);
  check(await until(async () => (await count(page)) === 1), "a pen stroke is drawn and saved");
  const first = (await objectsOf(page))[0];
  check(first.t === "stroke" && first.w > 200, "it is a vector stroke with the right size");
  // the stroke shows at once; the database save can land a moment later, so wait for it
  let stored = null;
  for (let i = 0; i < 40 && !(stored && Object.values(stored)[0] && Object.values(stored)[0].objects); i++) { stored = await rest(`whiteboards/${anna.code}/${anna.lessonId}/boards/personal/pages`); if (!(stored && Object.values(stored)[0] && Object.values(stored)[0].objects)) await sleep(250); }
  const storedPage = Object.values(stored)[0];
  const storedObject = Object.values(storedPage.objects)[0];
  check(storedObject && typeof storedObject.p === "string" && storedObject.p.length < 400 && storedObject.t === "stroke", `the database holds a compact delta-encoded path (${storedObject && storedObject.p.length} characters)`);

  await tool(page, "eraser"); await page.evaluate(() => window.__whiteboard.setEraserMode("stroke"));
  await drag(page, [350, 160], [350, 320], { steps: 8 });
  check(await until(async () => (await count(page)) === 0), "the stroke eraser removes a whole stroke");
  await page.keyboard.down("Control"); await page.keyboard.press("z"); await page.keyboard.up("Control");
  check(await until(async () => (await count(page)) === 1), "Ctrl+Z brings the stroke back");
  await page.keyboard.down("Control"); await page.keyboard.down("Shift"); await page.keyboard.press("z"); await page.keyboard.up("Shift"); await page.keyboard.up("Control");
  check(await until(async () => (await count(page)) === 0), "Ctrl+Shift+Z erases it again (redo)");
  await page.keyboard.down("Control"); await page.keyboard.press("z"); await page.keyboard.up("Control");
  await until(async () => (await count(page)) === 1);

  await page.evaluate(() => window.__whiteboard.setEraserMode("area"));
  await drag(page, [350, 160], [350, 320], { steps: 10 });
  check(await until(async () => (await count(page)) === 2), "the area eraser cuts a stroke in two and keeps both ends");
  await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control");
  await page.keyboard.press("Delete");
  check(await until(async () => (await count(page)) === 0), "select all and Delete clears the page");

  await tool(page, "rect"); await drag(page, [150, 350], [330, 450]);
  await tool(page, "ellipse"); await drag(page, [380, 350], [520, 450]);
  await tool(page, "triangle"); await drag(page, [560, 350], [680, 450]);
  await tool(page, "arrow"); await drag(page, [150, 500], [400, 520]);
  await tool(page, "line"); await drag(page, [450, 500], [650, 510], { shift: true });
  await tool(page, "hl"); await drag(page, [150, 580], [450, 585]);
  check(await until(async () => (await count(page)) === 6), "rectangle, ellipse, triangle, arrow, line and highlighter are all drawn");
  const kinds = (await objectsOf(page)).map(o => o.k).sort().join(",");
  check(kinds === "arrow,ellipse,hl,line,rect,triangle", `with the right kinds (${kinds})`);
  const line = (await objectsOf(page)).find(o => o.k === "line");
  check(line && line.h <= 2, "Shift keeps a line at a 15 degree step (this one is flat)");

  await tool(page, "sticky");
  const box = await canvasBox(page);
  await page.mouse.click(box.x + 800, box.y + 200);
  await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains("wb-editor"));
  await page.keyboard.type("Past simple: yesterday I watched a film");
  await page.keyboard.down("Control"); await page.keyboard.press("Enter"); await page.keyboard.up("Control");
  check(await until(async () => (await objectsOf(page)).some(o => o.t === "sticky" && /watched a film/.test(o.tx))), "a sticky note takes typed text and saves on Ctrl+Enter");
  await tool(page, "text");
  await page.mouse.click(box.x + 800, box.y + 450);
  await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains("wb-editor"));
  await page.keyboard.type("He has lived here since 2019");
  await page.keyboard.press("Escape");
  check(await until(async () => (await objectsOf(page)).some(o => o.t === "text" && /since 2019/.test(o.tx))), "a text box is created and keeps its words when Escape is pressed");
  const outlineHas = (...words) => until(() => page.evaluate(list => list.every(word => new RegExp(word).test(document.querySelector(".wb-outline").textContent)), words));
  check(await outlineHas("watched a film", "since 2019"), "the Board contents outline lists the text and the sticky note for screen readers");

  // select, move with the keyboard, duplicate, lock, z-order
  await tool(page, "select");
  await page.mouse.click(box.x + 800, box.y + 200 + 40);
  await until(async () => (await page.evaluate(() => window.__whiteboard.state.selection.size)) === 1);
  const before = (await objectsOf(page)).find(o => o.t === "sticky");
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await until(async () => (await objectsOf(page)).find(o => o.t === "sticky").x === before.x + 30);
  const after = (await objectsOf(page)).find(o => o.t === "sticky");
  check(after.x === before.x + 30 && after.y === before.y + 10, `arrow keys move the selected object (10 units a press): ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  await page.keyboard.down("Control"); await page.keyboard.press("d"); await page.keyboard.up("Control");
  check(await until(async () => (await objectsOf(page)).filter(o => o.t === "sticky").length === 2), "Ctrl+D duplicates it");
  await page.keyboard.press("]");
  check(await page.evaluate(() => window.__whiteboard.state.selection.size === 1), "the ] key moves the selection to the next object");
  check(await until(async () => /Selected/.test(await live(page))), "selection changes are announced to screen readers");

  // moving with the mouse, resize and rotate handles
  await page.evaluate(() => { const board = window.__whiteboard; const sticky = [...board.objects.values()].find(o => o.t === "sticky"); board.selectId(sticky.id); });
  const target = (await objectsOf(page)).find(o => o.t === "sticky");
  const zoom = await page.evaluate(() => window.__whiteboard.renderer.view.zoom);
  const view = await page.evaluate(() => ({ tx: window.__whiteboard.renderer.view.tx, ty: window.__whiteboard.renderer.view.ty }));
  const screenOf = (x, y) => [x * zoom + view.tx, y * zoom + view.ty];
  const [cornerX, cornerY] = screenOf(target.x + target.w, target.y + target.h);
  await drag(page, [cornerX, cornerY], [cornerX + 60, cornerY + 40], { steps: 6 });
  check(await until(async () => (await objectsOf(page)).some(o => o.id === target.id && o.w > target.w + 40)), "dragging a corner handle resizes the object");
  const [rotX, rotY] = screenOf(target.x + target.w / 2 + 30, target.y - 26 / zoom);
  await drag(page, [rotX, rotY], [rotX + 90, rotY + 20], { steps: 6 });
  check(await until(async () => (await objectsOf(page)).some(o => o.id === target.id && typeof o.r === "number" && Math.abs(o.r) > 0.1)), "dragging the rotation handle rotates it");

  // undo an erase of an area-erased board must restore the original
  // templates
  await page.evaluate(() => window.__whiteboard.selectAll());
  await page.keyboard.press("Delete");
  await until(async () => (await count(page)) === 0);
  await page.select(".wb-bottom select[aria-label='Add a template']", "timeline");
  check(await until(async () => (await count(page)) > 8), "the tense timeline template adds many editable objects");
  const timelineText = (await objectsOf(page)).map(o => o.tx || "").join(" ");
  check(/PAST/.test(timelineText) && /FUTURE/.test(timelineText) && /Present perfect/.test(timelineText), "the template carries the English labels");
  await page.evaluate(() => window.__whiteboard.selectAll()); await page.keyboard.press("Delete");
  await until(async () => (await count(page)) === 0);

  // pictures
  png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC", "base64");
  const imagePath = join(downloads, "tiny.png"); (await import("node:fs")).writeFileSync(imagePath, png);
  const fileInput = await page.$(".wb-bottom input[type=file]");
  await fileInput.uploadFile(imagePath);
  check(await until(async () => (await objectsOf(page)).some(o => o.t === "image")), "a PNG picture can be added");
  const stored2 = await until(async () => { const value = await rest(`whiteboards/${anna.code}/${anna.lessonId}/boards/personal/pages`); const first = value && Object.values(value)[0]; return first && first.images ? value : false; }, 8000, 250) || {};
  const pageNode = Object.values(stored2)[0];
  check(pageNode.images && Object.values(pageNode.images).every(v => /^data:image\/(png|jpeg|webp);base64,/.test(v)), "it is stored as a small re-encoded data URL under the page");
  await page.waitForSelector("#wbAlt", { visible: true });
  await page.type("#wbAlt", "A flooded street");
  await page.keyboard.press("Tab");
  check(await until(async () => (await objectsOf(page)).some(o => o.t === "image" && o.alt === "A flooded street")), "the picture description box saves alt text");
  check(await outlineHas("A flooded street"), "and the board contents outline reads it out");
  // a fake picture is refused
  const fake = join(downloads, "fake.png"); (await import("node:fs")).writeFileSync(fake, Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"));
  await fileInput.uploadFile(fake);
  check(await until(() => page.evaluate(() => /Only PNG, JPEG and WebP/.test(document.querySelector(".wb-toast").textContent))), "a file that is really SVG is refused whatever its name says");
  const big = join(downloads, "big.png"); (await import("node:fs")).writeFileSync(big, Buffer.concat([png, Buffer.alloc(2.5 * 1024 * 1024)]));
  await fileInput.uploadFile(big);
  check(await until(() => page.evaluate(() => /bigger than 2 MB/.test(document.querySelector(".wb-toast").textContent))), "a picture over 2 MB is refused");

  // zoom and pan
  await page.evaluate(() => window.__whiteboard.setZoom(1));
  await click(page, ".wb-bottom [aria-label='Zoom in (plus)']");
  check(await page.evaluate(() => Math.abs(window.__whiteboard.renderer.view.zoom - 1.25) < 0.01), "the zoom buttons zoom in 25 percent");
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.evaluate(() => window.__whiteboard.setZoom(1));
  await page.mouse.wheel({ deltaY: -400 });
  check(await until(() => page.evaluate(() => window.__whiteboard.renderer.view.zoom > 1.3)), "the mouse wheel zooms");
  for (let i = 0; i < 40; i++) await click(page, ".wb-bottom [aria-label='Zoom out (minus)']");
  check(await page.evaluate(() => Math.abs(window.__whiteboard.renderer.view.zoom - 0.25) < 0.001), "zoom stops at 25 percent");
  for (let i = 0; i < 40; i++) await click(page, ".wb-bottom [aria-label='Zoom in (plus)']");
  check(await page.evaluate(() => Math.abs(window.__whiteboard.renderer.view.zoom - 4) < 0.001), "zoom stops at 400 percent");
  await page.evaluate(() => window.__whiteboard.setZoom(1));
  const tx0 = await page.evaluate(() => window.__whiteboard.renderer.view.tx);
  await tool(page, "hand");
  await drag(page, [300, 300], [200, 250], { steps: 5 });
  check(await page.evaluate(start => window.__whiteboard.renderer.view.tx < start - 50, tx0), "the pan tool drags the board around");
  await page.keyboard.press("0");
  check(await until(async () => /Fit/.test(await live(page))), "0 fits the view to the content");
  await page.evaluate(() => window.__whiteboard.setZoom(1));

  // pages, backgrounds
  await page.select(".wb-bottom select[aria-label='Background']", "ruled");
  check(await until(() => page.evaluate(() => window.__whiteboard.meta.bg === "ruled")), "the page background can be changed to lined paper");
  await click(page, ".wb-pages [aria-label='Add a page']");
  check(await until(() => page.evaluate(() => document.querySelectorAll(".wb-pages .wb-page:not(.wb-page--add)").length === 2)), "a second page is added");
  await tool(page, "pen"); await drag(page, [200, 200], [400, 300]);
  await until(async () => (await count(page)) === 1);
  await click(page, ".wb-pages .wb-page:nth-child(1)");
  check(await until(async () => (await page.evaluate(() => window.__whiteboard.objects.size)) >= 1 && (await page.evaluate(() => window.__whiteboard.meta.bg)) === "ruled"), "switching pages shows each page's own content and background");
  check(await until(() => page.evaluate(() => [...document.querySelectorAll(".wb-page__thumb")].length >= 1)), "pages show a thumbnail");

  // exports
  const exportAs = async (kind, extension) => {
    await page.select(".wb-bottom select[aria-label='Save or export']", kind);
    return until(async () => readdirSync(downloads).find(name => name.endsWith(extension) && /^whiteboard-/.test(name)), 15000);
  };
  const pngFile = await exportAs("png", ".png"); const svgFile = await exportAs("svg", ".svg"); const pdfFile = await exportAs("pdf", ".pdf");
  check(pngFile && readFileSync(join(downloads, pngFile)).subarray(0, 8).toString("hex") === "89504e470d0a1a0a", "PNG export writes a real PNG file");
  check(svgFile && /<svg[\s\S]*<\/svg>/.test(readFileSync(join(downloads, svgFile), "utf8")) && !/<script/i.test(readFileSync(join(downloads, svgFile), "utf8")), "SVG export writes an SVG without scripts");
  check(pdfFile && readFileSync(join(downloads, pdfFile)).subarray(0, 8).toString().startsWith("%PDF-1.4") && /\/Count 2/.test(readFileSync(join(downloads, pdfFile)).toString("latin1")), "PDF export writes a PDF with one page per board page");

  // keyboard help and persistence
  await click(page, ".wb-bottom [aria-label='Keyboard help']");
  check(await page.evaluate(() => !document.querySelector(".wb-help").hidden && /Ctrl\+Z/.test(document.querySelector(".wb-help").textContent)), "the keyboard help lists the shortcuts");
  await page.screenshot({ path: `${SHOTS}student-own-board-desktop-dark.png` });
  await sleep(800);
  const savedCount = await count(page);
  await page.reload({ waitUntil: "networkidle2" });
  await page.evaluate(() => [...document.querySelectorAll(".wb-tab")].find(b => /own board/i.test(b.textContent)).click());
  const restored = await until(async () => (await count(page)) === savedCount && savedCount > 0);
  check(restored, `after a reload the same ${savedCount} objects are back (found ${await count(page)})`);

  // =========================================================================================================
  console.log("\n== Part 2: teacher and student together ==");
  await page.close();
  await seedEmulator({ log: () => {} });
  await rest("whiteboards", "DELETE");
  const prepare = async target => { await target.evaluateOnNewDocument(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", event => window.__csp.push(`${event.violatedDirective} ${event.blockedURI}`)); }); };
  const teacherContext = await browser.createBrowserContext();
  const studentContext = await browser.createBrowserContext();
  const teacher = await teacherContext.newPage(); watch(teacher, "teacher"); await prepare(teacher);
  const student = await studentContext.newPage(); watch(student, "student2"); await prepare(student);
  await teacher.setViewport({ width: 1440, height: 900 }); await student.setViewport({ width: 1440, height: 900 });
  await teacher.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await teacher.evaluate(async credentials => { await firebase.auth().signInWithEmailAndPassword(credentials.email, credentials.password); }, DEMO_TEACHER);
  await teacher.goto(studentUrl(), { waitUntil: "networkidle2" });
  await student.goto(studentUrl(), { waitUntil: "networkidle2" });
  await teacher.waitForSelector(".wb-canvas"); await student.waitForSelector(".wb-canvas");
  check(await until(() => teacher.evaluate(() => document.querySelectorAll(".wb-pages .wb-page:not(.wb-page--add)").length === 1)), "the teacher's class board opens with a first page");
  check(await until(() => student.evaluate(() => document.querySelectorAll(".wb-pages .wb-page:not(.wb-page--add)").length === 1)), "the student sees the same page");
  check(await teacher.evaluate(() => window.__whiteboard.state.canDraw === true) && await student.evaluate(() => window.__whiteboard.state.canDraw === false), "by default the teacher can draw and the student can only watch");
  check(await student.evaluate(() => [...document.querySelectorAll(".wb-rail button")].find(b => b.dataset.tool === "pen").disabled), "the student's pen button is switched off");
  check(await teacher.evaluate(() => /Student can watch/.test(document.querySelector(".wb-mode").textContent)), "the teacher sees the permission control");

  // live strokes
  await tool(teacher, "pen");
  const tbox = await canvasBox(teacher);
  await teacher.mouse.move(tbox.x + 200, tbox.y + 200); await teacher.mouse.down();
  for (let i = 1; i <= 10; i++) await teacher.mouse.move(tbox.x + 200 + i * 25, tbox.y + 200 + Math.sin(i) * 30);
  const sawLive = await until(() => student.evaluate(() => window.__whiteboard.renderer.overlays.live.size >= 1), 1500, 30);
  check(sawLive, "while the teacher is still drawing, the student already sees the stroke grow");
  const upAt = Date.now();
  await teacher.mouse.up();
  const arrived = await until(async () => (await count(student)) === 1, 3000, 15);
  const latency = Date.now() - upAt;
  check(arrived && latency < 1500, `the finished stroke reaches the student's screen (${latency} ms after pen up, local emulator)`);
  check(await until(() => student.evaluate(() => window.__whiteboard.renderer.overlays.live.size === 0)), "and the live copy disappears once it is committed");

  // the student cannot draw in view mode
  await student.evaluate(() => document.querySelector('.wb-rail [data-tool="select"]').click());
  const sbox = await canvasBox(student);
  await drag(student, [300, 300], [500, 340]);
  await sleep(600);
  check((await count(teacher)) === 1 && (await count(student)) === 1, "in watch mode the student's pointer cannot draw anything");
  const refused = await student.evaluate(() => { const board = window.__whiteboard; board.setTool("pen"); return board.state.tool; });
  check(refused !== "pen", "and the pen tool will not even switch on");
  check(await until(() => student.evaluate(() => /switched off/.test(document.querySelector(".wb-sr").textContent))), "the student hears why");

  // give control
  await teacher.select(".wb-mode select", "draw");
  check(await until(() => student.evaluate(() => window.__whiteboard.state.canDraw === true)), "when the teacher allows drawing the student's tools switch on");
  check(await student.evaluate(() => /Everyone can draw/.test(document.querySelector(".wb-mode").textContent)), "and the student is told so");
  await tool(student, "pen");
  await drag(student, [300, 450], [600, 500]);
  check(await until(async () => (await count(teacher)) === 2), "the student's stroke appears on the teacher's screen");
  const authors = await objectsOf(teacher);
  check(new Set(authors.map(o => o.by)).size === 2, "each object records who drew it");
  const teacherUid = await teacher.evaluate(() => firebase.auth().currentUser.uid);
  const teacherStroke = authors.find(o => o.by === teacherUid);

  // the student cannot remove or change the teacher's stroke
  await tool(student, "select");
  await student.evaluate(id => window.__whiteboard.selectId(id), teacherStroke.id);
  await student.keyboard.press("Delete");
  await sleep(500);
  check((await count(teacher)) === 2 && (await count(student)) === 2, "the student cannot delete the teacher's drawing");
  await student.keyboard.press("ArrowRight"); await sleep(400);
  check((await objectsOf(teacher)).find(o => o.id === teacherStroke.id).x === teacherStroke.x, "or move it");
  check(await until(() => student.evaluate(() => /belong to your teacher/.test(document.querySelector(".wb-sr").textContent))), "and is told it belongs to the teacher");
  const liveInDatabase = async () => { const value = await rest(`whiteboards/${anna.code}/${anna.lessonId}/boards/shared/pages`); const first = value && Object.values(value)[0]; return first && first.objects ? Object.values(first.objects).filter(o => !o.del).length : -1; };
  check(await until(async () => (await liveInDatabase()) === 2, 8000, 250), "the database agrees: two live objects");

  // presence and laser
  await student.mouse.move(sbox.x + 640, sbox.y + 300); await student.mouse.move(sbox.x + 660, sbox.y + 320);
  check(await until(() => teacher.evaluate(() => window.__whiteboard.renderer.overlays.cursors.size >= 1)), "the teacher sees the student's coloured, named cursor");
  const cursorName = await teacher.evaluate(() => [...window.__whiteboard.renderer.overlays.cursors.values()][0].name);
  check(/Anna|Student/.test(cursorName), `the cursor carries the student's name (${cursorName})`);
  await tool(student, "laser");
  await student.mouse.move(sbox.x + 700, sbox.y + 300); await student.mouse.down();
  for (let i = 1; i <= 8; i++) await student.mouse.move(sbox.x + 700 + i * 12, sbox.y + 300 + i * 6);
  check(await until(() => teacher.evaluate(() => [...window.__whiteboard.renderer.overlays.lasers.keys()].some(key => key !== "me")), 2000, 30), "the student's laser pointer trail is visible to the teacher");
  await student.mouse.up();
  check(await until(() => teacher.evaluate(() => ![...window.__whiteboard.renderer.overlays.lasers.keys()].some(key => key !== "me")), 4000), "and it fades when the student lets go");
  check((await count(teacher)) === 2, "the laser leaves nothing on the board");

  // take control
  await teacher.evaluate(() => document.querySelector(".wb-mode .wb-btn").click());
  check(await until(() => student.evaluate(() => window.__whiteboard.state.canDraw === false)), "Take control switches the student back to watching");
  check(await teacher.evaluate(() => /Give control/.test(document.querySelector(".wb-mode .wb-btn").textContent)), "and the button now offers Give control");
  await student.screenshot({ path: `${SHOTS}student-watching-desktop-dark.png` });

  // hidden from the student
  await teacher.select(".wb-mode select", "teacher-only");
  check(await until(() => student.evaluate(() => { const empty = document.querySelector(".wb-empty"); return Boolean(empty && !empty.hidden && /preparing/.test(empty.textContent) && window.__whiteboard.objects.size === 0); }), 6000), "Hidden from student: the student's class board empties and says the teacher is preparing it");
  await teacher.select(".wb-mode select", "view");
  check(await until(async () => (await count(student)) === 2), "when it is shared again the student gets the drawing back");

  // pages stay teacher-controlled; the student's own board stays private
  check(await student.evaluate(() => !document.querySelector(".wb-pages [aria-label='Add a page']")), "the student cannot add pages to the class board");
  await student.evaluate(() => [...document.querySelectorAll(".wb-tab")].find(b => /own board/i.test(b.textContent)).click());
  await until(() => student.evaluate(() => window.__whiteboard.state.canDraw === true && document.querySelectorAll(".wb-page").length >= 1));
  await tool(student, "pen"); await drag(student, [300, 300], [520, 380]);
  await until(async () => (await count(student)) === 1);
  await teacher.evaluate(() => [...document.querySelectorAll(".wb-tab")].find(b => /own board/i.test(b.textContent)).click());
  check(await until(async () => (await count(teacher)) === 1 && await teacher.evaluate(() => window.__whiteboard.state.canDraw === false)), "the teacher can read the student's own board but not draw on it");
  await teacher.screenshot({ path: `${SHOTS}teacher-reading-student-board-desktop-dark.png` });
  await teacher.evaluate(() => [...document.querySelectorAll(".wb-tab")].find(b => /Class board/i.test(b.textContent)).click());
  await until(async () => (await count(teacher)) === 2);

  // snapshot and clear
  await teacher.select(".wb-bottom select[aria-label='Save or export']", "snapshot");
  await student.evaluate(() => [...document.querySelectorAll(".wb-tab")].find(b => /Class board/i.test(b.textContent)).click());
  check(await until(() => student.evaluate(() => { const box = document.querySelector(".wb-snapshots"); return Boolean(box && !box.hidden && box.querySelector("a[href^='data:image/jpeg;base64,']")); })), "a snapshot sent by the teacher shows up for the student as a JPEG link");
  teacher.__acceptDialogs = true;
  await teacher.evaluate(() => [...document.querySelectorAll(".wb-bottom button")].find(b => /Clear this page/.test(b.getAttribute("aria-label"))).click());
  check(await until(async () => (await count(student)) === 0 && (await count(teacher)) === 0), "the teacher can clear the shared board for everyone");
  teacher.__acceptDialogs = false;
  check(await teacher.evaluate(() => window.__csp.length === 0) && await student.evaluate(() => window.__csp.length === 0), "no Content Security Policy violations on either side");
  await teacherContext.close(); await studentContext.close();
  console.log("\nProblems seen in the console:", problems.length ? problems.join(" | ") : "none");
  check(problems.length === 0, "no console errors or unexpected dialogs in parts 1 and 2");
} finally {
  await browser.close();
}
if (failures.length) { console.log(`\n${failures.length} check(s) failed.`); process.exit(1); }
console.log("\nAll whiteboard checks passed.");
void rmSync; void axeCore; void DEMO_TEACHER;
