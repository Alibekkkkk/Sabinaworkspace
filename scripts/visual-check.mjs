// Visual regression and layout gate for lesson, homework and dashboard.
//   1. npm run dev                 (in one terminal: emulators + demo data + site on :5050)
//   2. npm run check:visual        (in another)
// For each page x theme x viewport (320, 390, 768, 1440 wide) it saves a screenshot to
// docs/screenshots/phase1/ and FAILS (exit 1) when the page has horizontal scroll, clipped text,
// or overlapping interactive elements (measured with getBoundingClientRect).
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { DEMO_STUDENTS, DEMO_TEACHER, seedEmulator } from "./seed-emulator.mjs";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const BASE = process.env.SITE || "http://127.0.0.1:5050/";
const OUT = join(root, "docs", "screenshots", "phase1");
const VIEWPORTS = [[320, 700], [390, 844], [768, 1024], [1440, 900]];
const THEMES = ["light", "dark"];
const anna = DEMO_STUDENTS[0];
const PAGES = [
  { name: "lesson", url: `lesson.html?code=${anna.code}&lesson=${anna.lessonId}`, role: "student", ready: "#stageList .stage-sub-item, #stageList .lesson-item" },
  { name: "homework", url: `homework.html?code=${anna.code}&lesson=${anna.homeworkId}`, role: "student", ready: ".q-card" },
  { name: "dashboard", url: "dashboard.html", role: "teacher", ready: ".student-item" }
];

function findBrowser() {
  const candidates = [process.env.CHROME_PATH, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean);
  const found = candidates.find(path => existsSync(path));
  if (!found) throw new Error("No Chrome/Edge found. Set CHROME_PATH.");
  return found;
}

// Runs in the page. Returns a list of human-readable problems.
function layoutProblems() {
  const problems = [];
  const root = document.documentElement;
  if (root.scrollWidth > root.clientWidth + 1) {
    problems.push(`horizontal scroll: page is ${root.scrollWidth}px wide in a ${root.clientWidth}px viewport`);
    const culprits = [...document.querySelectorAll("body *")]
      .map(element => ({ element, right: element.getBoundingClientRect().right }))
      .filter(entry => entry.right > root.clientWidth + 1)
      .sort((a, b) => b.right - a.right).slice(0, 4);
    for (const { element, right } of culprits) problems.push(`  wide element: <${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""} class="${String(element.className).slice(0, 40)}"> reaches ${Math.round(right)}px`);
  }

  const visible = element => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return style.visibility !== "hidden" && style.display !== "none" && box.width > 1 && box.height > 1 && Number(style.opacity) > 0;
  };
  const describe = element => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${element.className && typeof element.className === "string" ? `.${element.className.trim().split(/\s+/).slice(0, 2).join(".")}` : ""} "${(element.textContent || element.getAttribute("aria-label") || "").trim().slice(0, 24)}"`;

  // clipped text: a text-bearing box that hides its overflow while its content is wider/taller than the box
  for (const element of document.querySelectorAll("body *")) {
    if (!visible(element) || !element.childNodes.length) continue;
    const style = getComputedStyle(element);
    const hides = ["hidden", "clip"].includes(style.overflowX) || ["hidden", "clip"].includes(style.overflowY);
    if (!hides || style.textOverflow === "ellipsis") continue;
    const hasText = [...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim());
    if (hasText && (element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2) && element.clientHeight > 0) {
      problems.push(`clipped text: ${describe(element)} (content ${element.scrollWidth}x${element.scrollHeight} in ${element.clientWidth}x${element.clientHeight})`);
    }
  }

  // overlapping interactive elements (ignoring ancestors/descendants and elements covered by an open overlay)
  const controls = [...document.querySelectorAll("button, a[href], input, select, textarea, [role='button']")].filter(visible);
  // A scrolling or clipping ancestor hides part of a control: only the visible part can overlap something.
  const visibleBox = element => {
    let { left, right, top, bottom } = element.getBoundingClientRect();
    for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if ([style.overflowX, style.overflowY].every(value => value === "visible")) continue;
      const clip = parent.getBoundingClientRect();
      if (style.overflowX !== "visible") { left = Math.max(left, clip.left); right = Math.min(right, clip.right); }
      if (style.overflowY !== "visible") { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom); }
    }
    return { left, right, top, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  };
  const boxes = controls.map(element => ({ element, box: visibleBox(element) }));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.element.contains(b.element) || b.element.contains(a.element)) continue;
      const overlapWidth = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left);
      const overlapHeight = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top);
      if (overlapWidth > 4 && overlapHeight > 4) {
        const topA = document.elementFromPoint(a.box.left + a.box.width / 2, a.box.top + a.box.height / 2);
        const topB = document.elementFromPoint(b.box.left + b.box.width / 2, b.box.top + b.box.height / 2);
        if (a.element.contains(topA) && b.element.contains(topB)) problems.push(`overlap: ${describe(a.element)} and ${describe(b.element)} (${Math.round(overlapWidth)}x${Math.round(overlapHeight)}px)`);
      }
    }
  }
  return problems.slice(0, 20);
}

async function signIn(page, role) {
  await page.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  if (role === "teacher") {
    await page.evaluate(async credentials => { await firebase.auth().signInWithEmailAndPassword(credentials.email, credentials.password); }, DEMO_TEACHER);
  } else {
    await page.waitForSelector("#loginCode");
    await page.evaluate(code => { document.getElementById("loginCode").value = code; document.querySelector('[data-action="login"]').click(); }, anna.code);
    await page.waitForFunction(() => getComputedStyle(document.getElementById("lessonsScreen")).display !== "none", { timeout: 20000 });
  }
}

// Start from clean demo accounts: every run signs in as a brand-new anonymous student, so the demo codes must be unlinked.
await seedEmulator({ log: () => {} });
const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true, args: ["--no-sandbox", "--lang=en-US"] });
mkdirSync(OUT, { recursive: true });
let failures = 0;
try {
  for (const role of ["student", "teacher"]) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await signIn(page, role);
    for (const target of PAGES.filter(entry => entry.role === role)) {
      for (const [width, height] of VIEWPORTS) {
        for (const theme of THEMES) {
          await page.setViewport({ width, height });
          await page.evaluateOnNewDocument(mode => {
            try { localStorage.setItem("ls-theme", mode); localStorage.setItem("nd_homework_theme_v2", mode); localStorage.setItem("nd_lesson_theme", mode); } catch (error) { /* ignore */ }
          }, theme);
          await page.goto(BASE + target.url, { waitUntil: "networkidle2", timeout: 45000 });
          await page.waitForSelector(target.ready, { timeout: 25000 });
          await page.evaluate(mode => {
            document.documentElement.classList.toggle("dark", mode === "dark");
            document.documentElement.classList.toggle("light", mode === "light");
            document.documentElement.dataset.theme = mode;
          }, theme);
          await new Promise(resolveTimer => setTimeout(resolveTimer, 400));
          const problems = await page.evaluate(layoutProblems);
          const file = join(OUT, `${target.name}-${theme}-${width}.png`);
          await page.screenshot({ path: file, fullPage: false });
          const status = problems.length ? "FAIL" : "ok  ";
          console.log(`${status} ${target.name.padEnd(9)} ${theme.padEnd(5)} ${String(width).padStart(4)}px`);
          for (const problem of problems) console.log(`       - ${problem}`);
          failures += problems.length;
        }
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} layout problem(s). Screenshots are in docs/screenshots/phase1/` : "\nNo layout problems. Screenshots are in docs/screenshots/phase1/");
process.exit(failures ? 1 : 0);
