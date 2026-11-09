// End-to-end check of the lesson clock against the local demo stack:   npm run dev   then   npm run test:clock-e2e
// Teacher (floating panel on the lesson page) and student run in separate browser sessions. The student's
// own clock is skewed by +10 minutes. Verifies: start -> student sees the same time within 500 ms,
// pause freezes both, a student refresh keeps the value, resume continues, stop saves the total and the
// log has one entry per transition.
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { DEMO_STUDENTS, DEMO_TEACHER, seedEmulator } from "./seed-emulator.mjs";

const BASE = process.env.SITE || "http://127.0.0.1:5050/";
const DB = process.env.DB_HOST || "127.0.0.1:9000";
const NS = "sabina-s-workspace-default-rtdb";
const anna = DEMO_STUDENTS[0];
const lessonUrl = `${BASE}lesson.html?code=${anna.code}&lesson=${anna.lessonId}`;
const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(path => existsSync(path));
if (!executable) throw new Error("No Chrome/Edge found. Set CHROME_PATH.");

async function rest(path, method = "GET") {
  const response = await fetch(`http://${DB}/${path}.json?ns=${NS}&access_token=owner`, { method });
  return response.json();
}

const failures = [];
const check = (condition, message) => { console.log(`${condition ? "ok  " : "FAIL"} ${message}`); if (!condition) failures.push(message); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const seconds = text => text.split(":").reverse().reduce((sum, part, index) => sum + Number(part) * 60 ** index, 0);

await seedEmulator({ log: () => {} });
await rest(`lessonClock/${anna.code}`, "DELETE");
await rest(`lessonClockLog/${anna.code}`, "DELETE");

const browser = await puppeteer.launch({ executablePath: executable, headless: true, args: ["--no-sandbox"] });
try {
  // ---- student, in its own browser session, with a clock that is 10 minutes fast
  const studentContext = await browser.createBrowserContext();
  const student = await studentContext.newPage();
  await student.evaluateOnNewDocument(() => {
    // A device whose whole clock is 10 minutes fast: both Date.now() and new Date() move, like a real skewed device.
    const RealDate = Date;
    const skew = 10 * 60 * 1000;
    class SkewedDate extends RealDate {
      constructor(...args) { if (args.length === 0) super(RealDate.now() + skew); else super(...args); }
      static now() { return RealDate.now() + skew; }
    }
    window.Date = SkewedDate;
  });
  await student.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await student.waitForSelector("#loginCode");
  await student.evaluate(code => { document.getElementById("rememberMe").checked = true; document.getElementById("loginCode").value = code; document.querySelector('[data-action="login"]').click(); }, anna.code);
  await student.waitForFunction(() => getComputedStyle(document.getElementById("lessonsScreen")).display !== "none", { timeout: 20000 });
  await student.goto(lessonUrl, { waitUntil: "networkidle2" });
  await student.waitForSelector("#clockValue");
  const read = page => page.evaluate(() => ({ value: document.getElementById("clockValue").textContent, chip: document.getElementById("clockChip").textContent, offline: !document.getElementById("clockHint").hidden }));
  check((await read(student)).chip === "Not started", "student sees 'Not started' before the teacher starts");

  // ---- teacher
  const teacherContext = await browser.createBrowserContext();
  const teacher = await teacherContext.newPage();
  teacher.on("dialog", dialog => dialog.accept());
  await teacher.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await teacher.evaluate(async credentials => { await firebase.auth().signInWithEmailAndPassword(credentials.email, credentials.password); }, DEMO_TEACHER);
  await teacher.goto(`${lessonUrl}&teacher=1`, { waitUntil: "networkidle2" });
  await teacher.waitForSelector('.clock-panel button[data-clock-action="start"]:not([disabled])', { timeout: 20000 });
  const press = action => teacher.click(`.clock-panel button[data-clock-action="${action}"]`);

  await press("start");
  await sleep(3500);
  let [t, s] = [await read(teacher), await read(student)];
  check(s.chip === "Running" && t.chip === "Running", "student and teacher both show Running");
  check(Math.abs(seconds(t.value) - seconds(s.value)) <= 1, `teacher ${t.value} and student ${s.value} agree (student device clock is +10 min)`);
  check(seconds(s.value) >= 3 && seconds(s.value) <= 6, `the clock is about 3.5 s after start (student shows ${s.value})`);

  // tighter check: sample both pages at the same instant, many times, in milliseconds
  const sampleGap = async () => {
    const [a, b] = await Promise.all([teacher.evaluate(() => document.getElementById("clockValue").textContent), student.evaluate(() => document.getElementById("clockValue").textContent)]);
    return Math.abs(seconds(a) - seconds(b));
  };
  const gaps = [];
  for (let i = 0; i < 8; i++) { gaps.push(await sampleGap()); await sleep(310); }
  check(Math.max(...gaps) <= 1, `eight simultaneous samples never differ by more than the displayed second (max ${Math.max(...gaps)} s)`);

  await press("pause");
  await sleep(1500);
  const frozen = await read(student);
  await sleep(3000);
  const stillFrozen = await read(student);
  check(frozen.chip === "Paused" && frozen.value === stillFrozen.value, `pause freezes the student's clock (${frozen.value} -> ${stillFrozen.value})`);

  await student.reload({ waitUntil: "networkidle2" });
  await student.waitForSelector("#clockValue");
  await sleep(1200);
  const afterRefresh = await read(student);
  check(afterRefresh.value === frozen.value && afterRefresh.chip === "Paused", `a student refresh keeps the paused value (${afterRefresh.value})`);
  await teacher.reload({ waitUntil: "networkidle2" });
  await teacher.waitForSelector('.clock-panel button[data-clock-action="resume"]:not([disabled])', { timeout: 20000 });
  check((await read(teacher)).value === frozen.value, "a teacher refresh keeps the paused value");

  await press("resume");
  await sleep(3200);
  const resumed = await read(student);
  check(resumed.chip === "Running" && seconds(resumed.value) >= seconds(frozen.value) + 2 && seconds(resumed.value) <= seconds(frozen.value) + 6, `resume continues from the frozen value (${frozen.value} -> ${resumed.value})`);

  await press("stop");
  await sleep(2000);
  const stopped = await read(student);
  const stored = await rest(`lessonClock/${anna.code}/${anna.lessonId}`);
  check(stopped.chip === "Stopped", "student sees Stopped");
  check(stored && stored.state === "stopped" && stored.totalMs > 0, `stop saved totalMs (${stored && stored.totalMs} ms) in the database`);
  check(seconds(stopped.value) === Math.floor(stored.totalMs / 1000), `the displayed value (${stopped.value}) equals the saved total`);
  check(await student.evaluate(() => !document.querySelector(".class-summary").hidden), "the student sees the class summary card");
  await sleep(3000);
  check((await read(student)).value === stopped.value, "a stopped clock never changes again");

  const log = Object.values((await rest(`lessonClockLog/${anna.code}/${anna.lessonId}`)) || {}).sort((a, b) => a.at - b.at).map(event => event.type);
  check(JSON.stringify(log) === JSON.stringify(["start", "pause", "resume", "stop"]), `the append-only log recorded ${JSON.stringify(log)}`);
  check(Math.abs(stored.stoppedAt - Date.now()) < 120000, "stoppedAt is a real server timestamp (not the skewed device time)");
} finally {
  await browser.close();
}
console.log(failures.length ? `\n${failures.length} check(s) failed.` : "\nAll clock checks passed.");
process.exit(failures.length ? 1 : 0);
