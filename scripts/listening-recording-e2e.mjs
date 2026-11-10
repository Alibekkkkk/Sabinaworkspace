// End-to-end check of listening sets made from a recording, against the local demo stack:  npm run dev  then
// node scripts/listening-recording-e2e.mjs
// 1. The teacher opens tools/listening-recording.html, pastes a link (a video link is refused with a reason), pastes a
//    transcript, gets sentences with times, edits one, and saves the set to the lesson.
// 2. The student's Listening Training uses that set and plays each sentence from the recording, not the device voice.
// 3. The teacher removes the set again.
// The speech-recognition path is not run here (it downloads a model); it is checked by hand with a public-domain clip.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { DEMO_STUDENTS, DEMO_TEACHER, seedEmulator } from "./seed-emulator.mjs";
import { validateListeningPack } from "../js/listening/schema.js";

const BASE = process.env.SITE || "http://127.0.0.1:5050/";
const DB = process.env.DB_HOST || "127.0.0.1:9000";
const NS = "sabina-s-workspace-default-rtdb";
const anna = DEMO_STUDENTS[0];
const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(path => path && existsSync(path));
if (!executable) throw new Error("No Chrome/Edge found. Set CHROME_PATH.");

const failures = [];
const check = (condition, message) => { console.log(`${condition ? "ok  " : "FAIL"} ${message}`); if (!condition) failures.push(message); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function rest(path, method = "GET", body) {
  const response = await fetch(`http://${DB}/${path}.json?ns=${NS}&access_token=owner`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  return response.json();
}

// A 6-second test recording: three short tones with silence between (16-bit PCM, 8 kHz). Written next to the test, not shipped.
function writeTones(path) {
  const rate = 8000, seconds = 6, samples = rate * seconds;
  const data = Buffer.alloc(44 + samples * 2);
  data.write("RIFF", 0); data.writeUInt32LE(36 + samples * 2, 4); data.write("WAVE", 8); data.write("fmt ", 12);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write("data", 36); data.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) { const t = i / rate; const on = (t % 2) < 1.4; data.writeInt16LE(on ? Math.round(Math.sin(2 * Math.PI * (330 + 110 * Math.floor(t / 2)) * t) * 8000) : 0, 44 + i * 2); }
  writeFileSync(path, data);
}
const fixtureDir = new URL("../tests/fixtures/", import.meta.url);
mkdirSync(fixtureDir, { recursive: true });
writeTones(new URL("tones.wav", fixtureDir));
const AUDIO = `${BASE}tests/fixtures/tones.wav`;

await seedEmulator({ log: () => {} });
await rest(`protectedContent/${anna.lessonId}/listening`, "DELETE");

const browser = await puppeteer.launch({ executablePath: executable, headless: true, args: ["--no-sandbox", "--lang=en-US", "--autoplay-policy=no-user-gesture-required"] });
const problems = [];
const watch = (page, label) => {
  page.on("pageerror", error => problems.push(`${label}: ${error.message}`));
  page.on("console", message => { const text = message.text(); if (message.type() === "error" && !/favicon|Tracking Prevention|404|Failed to load resource|Framing 'http:\/\/127\.0\.0\.1/i.test(text)) problems.push(`${label}: ${text}`); });
};
try {
  // ---- teacher makes the set
  const teacher = await (await browser.createBrowserContext()).newPage();
  watch(teacher, "tool");
  teacher.on("dialog", dialog => dialog.accept());
  await teacher.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await teacher.evaluate(async credentials => { await firebase.auth().signInWithEmailAndPassword(credentials.email, credentials.password); }, DEMO_TEACHER);
  await teacher.goto(`${BASE}tools/listening-recording.html?lesson=${anna.lessonId}`, { waitUntil: "networkidle2" });
  await teacher.waitForFunction(id => document.getElementById("lessonSelect").value === id, { timeout: 20000 }, anna.lessonId);
  check(true, "the tool lists the teacher's lessons and opens the one in the address");

  const setLink = async link => { await teacher.$eval("#audioLink", (input, value) => { input.value = value; input.dispatchEvent(new Event("change")); }, link); await sleep(200); return teacher.$eval("#linkNote", note => ({ text: note.textContent, kind: note.dataset.kind || "" })); };
  const video = await setLink("https://www.youtube.com/watch?v=abc");
  check(video.kind === "error" && /YouTube/.test(video.text), `a video link is refused with a reason ("${video.text.slice(0, 50)}…")`);
  check(await teacher.$eval("#makeButton", button => button.disabled), "nothing can be made without a usable recording");
  const good = await setLink(AUDIO);
  check(good.kind === "" && /audio file/.test(good.text), "a direct audio link is accepted");

  await teacher.select("#mode", "transcript");
  await teacher.$eval("#mode", select => select.dispatchEvent(new Event("change")));
  check(await teacher.$eval("#transcriptField", field => !field.hidden), "choosing to paste the transcript shows the transcript box");
  await teacher.type("#transcript", "The river rose quickly. People left their homes. Rescue teams helped every family.");
  await teacher.$eval("#rightsDetail", input => { input.value = "made for the test"; });
  await teacher.click("#makeButton");
  await teacher.waitForFunction(() => document.querySelectorAll("#sentenceList .lr-sentence").length > 0, { timeout: 15000 });
  const rows = await teacher.$$eval("#sentenceList .lr-sentence", items => items.map(item => ({ text: item.querySelector("textarea").value, times: [...item.querySelectorAll("input[type=number]")].map(input => Number(input.value)) })));
  check(rows.length === 3, `three sentences come out (${rows.map(row => row.text).join(" | ")})`);
  check(rows.every(row => row.times[1] > row.times[0] && row.times[1] <= 6) && rows[2].times[0] > rows[0].times[0], `each has a start and end inside the 6-second recording (${rows.map(row => row.times.join("-")).join(", ")})`);
  check(await teacher.$eval("#sentenceList .lr-gaps", line => Boolean(line.querySelector(".lr-gap-easy"))), "the hidden words are shown for each sentence");

  await teacher.$eval("#sentenceList .lr-sentence:nth-child(2) textarea", area => { area.value = "Many people left their homes."; area.dispatchEvent(new Event("input")); });
  const removeButtons = await teacher.$$("#sentenceList .lr-sentence button[aria-label^='Remove']");
  check(removeButtons.length === 3, "every sentence can be removed");
  await teacher.click("#saveButton");
  await teacher.waitForFunction(() => /Saved/.test(document.getElementById("saveStatus").textContent), { timeout: 15000 });
  const stored = await rest(`protectedContent/${anna.lessonId}/listening`);
  check(Boolean(stored && stored.content), "the set is saved to the lesson");
  if (stored && stored.content) {
    check(validateListeningPack(stored.content).length === 0, "the saved set passes the listening validator");
    check(stored.content.source.url === AUDIO && /^original: made for the test$/.test(stored.content.source.credits), `it names the recording and its rights ("${stored.content.source.credits}")`);
    check(stored.content.items[1].text === "Many people left their homes." && stored.content.items.every(item => item.clip && item.clip.end > item.clip.start), "the edit is kept and every sentence has its clip");
  }

  // ---- the student hears the recording
  const student = await (await browser.createBrowserContext()).newPage();
  watch(student, "student");
  await student.goto(`${BASE}listening.html?code=${anna.code}&lesson=${anna.lessonId}`, { waitUntil: "networkidle2" });
  await student.waitForSelector("#lsSetup:not([hidden]) button", { timeout: 25000 });
  await student.evaluate(() => [...document.querySelectorAll("#lsSetup button")].find(button => /Start round/.test(button.textContent)).click());
  await student.waitForSelector(".ls-gap", { timeout: 15000 });
  const shown = await student.evaluate(() => [...document.querySelectorAll(".ls-sentence > *")].map(node => node.classList.contains("ls-gap") ? "_" : node.textContent.trim()).join(" "));
  check(stored && stored.content.items.some(item => item.text.split(" ").length === shown.split(" ").length), `the round uses the teacher's sentences ("${shown}")`);
  await student.waitForFunction(() => /Recording/.test(document.querySelector(".ls-source")?.textContent || ""), { timeout: 8000 }).catch(() => {});
  const label = await student.$eval(".ls-source", node => node.textContent).catch(() => "");
  check(/Recording/.test(label), `the sentence plays from the recording, not the device voice ("${label}")`);

  // ---- the teacher removes it
  await teacher.click("#removeButton");
  await teacher.waitForFunction(() => /Removed/.test(document.getElementById("saveStatus").textContent), { timeout: 15000 });
  check((await rest(`protectedContent/${anna.lessonId}/listening`)) === null, "removing the set deletes it from the lesson");
  check(problems.length === 0, `no console errors (${problems.slice(0, 3).join(" | ") || "none"})`);
} finally {
  await browser.close();
}
if (failures.length) { console.log(`\n${failures.length} check(s) failed.`); process.exit(1); }
console.log("\nAll listening-from-recording checks passed.");
