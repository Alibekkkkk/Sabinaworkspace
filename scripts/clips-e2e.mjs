// Clip Lab end to end against the local demo stack:  npm run dev  then  npm run test:clips-e2e
// Uses a fake YouTube player (no network needed) to drive the real page: line highlighting, seeking, looping, speed, keys,
// subtitle modes, the nine exercise types, saving words, XP and the review queue; then the failure paths (player blocked,
// video refuses to play) and an unverified clip. Also axe, a phone layout and a clean console.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import axeCore from "axe-core";
import { addProtectedClipAnswers, validateClip } from "../js/clips/schema.js";
import { DEMO_STUDENTS, DEMO_TEACHER, seedEmulator } from "./seed-emulator.mjs";

const BASE = process.env.SITE || "http://127.0.0.1:5050/";
const DB = process.env.DB_HOST || "127.0.0.1:9000";
const NS = "sabina-s-workspace-default-rtdb";
const anna = DEMO_STUDENTS[0];
const sample = JSON.parse(readFileSync(new URL("../docs/clips/sample-clip.json", import.meta.url), "utf8"));
const answers = JSON.parse(readFileSync(new URL("../docs/clips/sample-clip.answers.json", import.meta.url), "utf8"));
const protectedSample = addProtectedClipAnswers(validateClip(sample, { requireAnswers: false }), answers);
const shipped = JSON.parse(readFileSync(new URL("../content/clips/sabina-floods.json", import.meta.url), "utf8"));
const SHOTS = new URL("../docs/screenshots/phase6/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
mkdirSync(SHOTS, { recursive: true });
const clipUrl = `${BASE}clip.html?code=${anna.code}&lesson=${anna.lessonId}`;
const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(path => existsSync(path));
if (!executable) throw new Error("No Chrome/Edge found. Set CHROME_PATH.");
const failures = [];
const check = (condition, message) => { console.log(`${condition ? "ok  " : "FAIL"} ${message}`); if (!condition) failures.push(message); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, ms = 8000, step = 60) { const end = Date.now() + ms; while (Date.now() < end) { const value = await fn(); if (value) return value; await sleep(step); } return false; }
async function rest(path, method = "GET", body) {
  const response = await fetch(`http://${DB}/${path}.json?ns=${NS}&access_token=owner`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  return response.json();
}
const useClip = async (content, id = content.id) => {
  await rest(`protectedContent/${anna.lessonId}/clip`, "PUT", { sourceFile: `clips/${id}.json`, content });
  await rest(`studentCurriculum/${anna.code}/${anna.lessonId}/clipId`, "PUT", id);
};

await seedEmulator({ log: () => {} });
for (const node of ["studentProgress", "sessions"]) await rest(`${node}/${anna.code}`, "DELETE");

const FAKE_YT = () => {
  // A stand-in for the official player: it keeps time itself, so the page logic can be tested without video or network.
  const registry = { calls: [], time: 0, rate: 1, state: -1, options: null, errorOnReady: false };
  window.__yt = registry; let timer = 0;
  window.YT = { Player: class {
    constructor(target, options) {
      registry.options = options; registry.time = options.playerVars.start; this.options = options;
      setTimeout(() => { if (registry.errorOnReady) options.events.onError({ data: 101 }); else options.events.onReady(); }, 20);
    }
    getCurrentTime() { return registry.time; } getPlayerState() { return registry.state; }
    playVideo() { registry.calls.push("play"); registry.state = 1; this.options.events.onStateChange({ data: 1 }); clearInterval(timer); timer = setInterval(() => { registry.time += 0.1 * registry.rate; }, 100); }
    pauseVideo() { registry.calls.push("pause"); registry.state = 2; clearInterval(timer); this.options.events.onStateChange({ data: 2 }); }
    seekTo(seconds) { registry.calls.push(`seek:${seconds}`); registry.time = seconds; }
    setPlaybackRate(rate) { registry.rate = rate; registry.calls.push(`rate:${rate}`); }
    destroy() { clearInterval(timer); }
  } };
};

const browser = await puppeteer.launch({ executablePath: executable, headless: true, args: ["--no-sandbox", "--lang=en-US"] });
const problems = [];
const watch = (page, label, ignore = /^$/) => {
  page.on("pageerror", error => { console.log(`pageerror: ${error.message}`); problems.push(`${label} pageerror: ${error.message}`); });
  page.on("console", message => { const text = message.text(); if (message.type() === "error" && !/favicon|Tracking Prevention|404|Failed to load resource/i.test(text) && !ignore.test(text)) problems.push(`${label}: ${text}`); });
};
async function login(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await page.waitForSelector("#loginCode");
  await page.evaluate(code => { document.getElementById("rememberMe").checked = true; document.getElementById("loginCode").value = code; document.querySelector('[data-action="login"]').click(); }, anna.code);
  await page.waitForFunction(() => getComputedStyle(document.getElementById("lessonsScreen")).display !== "none", { timeout: 20000 });
  return page;
}
const yt = (page, fn, arg) => page.evaluate(fn, arg);
let currentClip = null;
// Every new browser context is a new anonymous sign-in, and a student code binds to the first one, so seed again first.
async function freshStudent(content) {
  await seedEmulator({ log: () => {} }); await useClip(content);
  return login(await browser.createBrowserContext());
}

try {
  // ============================ a verified clip with the fake player ============================
  await useClip(protectedSample);
  const page = await login(await browser.createBrowserContext()); watch(page, "clip");
  await page.evaluateOnNewDocument(FAKE_YT);
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(clipUrl, { waitUntil: "networkidle2" });
  await page.waitForSelector(".transcript-line", { timeout: 20000 });
  check(await page.evaluate(() => document.querySelectorAll(".transcript-line").length === 8), "the transcript shows all eight lines");
  check(await page.evaluate(() => document.getElementById("warnings").hidden), "a verified clip shows no timing warning");
  check(await page.evaluate(() => /Floods 101, National Geographic/.test(document.getElementById("rights").textContent)), "the source and attribution are shown");
  check(await page.evaluate(() => document.getElementById("openVideo").href === "https://www.youtube.com/watch?v=4PXj7bOD7IY"), "there is always an Open the video link");
  check(await page.evaluate(() => document.getElementById("playPause").disabled), "the controls wait until the video is loaded");
  await page.click("#loadVideo");
  check(await until(() => page.evaluate(() => !document.getElementById("playPause").disabled)), "loading the video enables the controls");
  const options = await yt(page, () => window.__yt.options);
  check(options.host === "https://www.youtube-nocookie.com" && options.playerVars.autoplay === 0 && options.playerVars.start === 10 && options.playerVars.end === 70, "the player uses the privacy-enhanced domain, no autoplay, and exactly the clip window");

  await page.keyboard.press("Space");
  check(await until(() => yt(page, () => window.__yt.calls.includes("play"))), "Space starts the video");
  await yt(page, () => { window.__yt.time = 19; });
  check(await until(() => page.evaluate(() => document.querySelector(".transcript-line.is-active")?.dataset.index === "1")), "the line being spoken is highlighted as the video plays (time 19 s is line 2)");
  check(await page.evaluate(() => document.querySelector(".transcript-line.is-active").getAttribute("aria-current") === "true"), "and marked for screen readers");
  await page.keyboard.press("ArrowRight");
  check(await yt(page, () => window.__yt.calls.includes("seek:22")), "Right arrow jumps to the next line");
  await yt(page, () => { window.__yt.time = 31; });
  await page.keyboard.press("ArrowLeft");
  check(await yt(page, () => window.__yt.calls.includes("seek:28")), "Left arrow restarts the current line when you are well into it");
  await page.keyboard.press("l");
  check(await until(() => page.evaluate(() => document.getElementById("loopLine").getAttribute("aria-pressed") === "true")), "L loops the current line");
  const before = await yt(page, () => window.__yt.calls.filter(c => c.startsWith("seek:28")).length);
  await yt(page, () => { window.__yt.time = 33.98; });
  check(await until(async () => (await yt(page, () => window.__yt.calls.filter(c => c.startsWith("seek:28")).length)) > before), "at the end of the looped line the video jumps back to its start");
  await page.keyboard.press("l");
  await page.select("#speed", "0.5");
  check(await yt(page, () => window.__yt.rate === 0.5), "the speed control sets 0.5 times");
  await page.evaluate(() => document.querySelectorAll("button.line-time")[4].click());
  check(await yt(page, () => window.__yt.calls.includes("seek:34")), "clicking a line's time seeks to it");
  await yt(page, () => { window.__yt.time = 69.95; });
  check(await until(() => page.evaluate(() => /ended/.test(document.getElementById("playerStatus").textContent))), "playback stops by itself at the end of the window");
  check(await yt(page, () => window.__yt.time === 10), "and returns to the start of the clip");

  // subtitle modes
  const lineText = index => page.evaluate(i => document.querySelectorAll(".transcript-line .line-text")[i].textContent, index);
  await page.click('[data-track="native"]'); check((await lineText(0)) === "(translation)", "the translation mode shows the translation");
  await page.click('[data-track="none"]'); check(/hidden/.test(await lineText(2)), "the hide mode hides the study text");
  await page.click('[data-track="reveal"]');
  check(await page.evaluate(() => [...document.querySelectorAll(".transcript-line .line-text")].filter(node => node.querySelector("button")).length >= 7), "reveal mode hides every line behind a Reveal button");
  await page.evaluate(() => document.querySelectorAll(".transcript-line .line-text button")[2].click());
  check(/Then the volunteers|They worked|Everyone waited|Yes, and/.test(await page.evaluate(() => document.querySelector(".transcript").textContent)), "a revealed line shows its text");
  await page.click('[data-track="en"]');

  // vocabulary
  await page.evaluate(() => [...document.querySelectorAll(".word")].find(node => node.textContent === "sandbags").click());
  check(await page.evaluate(() => document.getElementById("vocabularyDialog").open && /bags filled with sand/.test(document.getElementById("vocabularyDefinition").textContent)), "a vocabulary word opens its card");
  await page.click("#saveWord");
  check(await until(async () => { const words = await rest(`studentProgress/${anna.code}/vocabulary`); return words && Object.values(words).some(w => w.sourceClipId === "sample-flood-night"); }), "Save word puts it in the student's deck with the clip it came from");
  await page.click("#closeDialog");

  // exercises
  const box = id => `#cx-${id}`;
  await page.evaluate(() => document.querySelector("#cx-bw button").scrollIntoView());
  await page.type("#cx-bw textarea", "The water comes into the town"); await page.click("#cx-bw .button");
  await page.evaluate(() => [...document.querySelectorAll("#cx-g1 button")][0].click());
  check(await page.evaluate(() => /Correct/.test(document.querySelector("#cx-g1 .cx__feedback").textContent)), "Gist: a correct answer is marked correct");
  await page.evaluate(() => { const inputs = document.querySelectorAll("#cx-gap .cx__gap"); inputs[0].value = "river"; inputs[1].value = "quickly"; });
  await page.evaluate(() => [...document.querySelectorAll("#cx-gap button")].find(b => b.textContent === "Check").click());
  check(await page.evaluate(() => /All the words are right/.test(document.querySelector("#cx-gap .cx__feedback").textContent)), "Gap fill on a subtitle line");
  await page.click("#cx-gap .secondary");
  check(await yt(page, () => window.__yt.calls.includes("seek:10")), "Play this line uses the video, because the timing is verified");
  await page.type("#cx-dic textarea", "yes and the shops closed early");
  await page.evaluate(() => [...document.querySelectorAll("#cx-dic button")].find(b => b.textContent === "Check").click());
  check(await page.evaluate(() => /Perfect/.test(document.querySelector("#cx-dic .cx__feedback").textContent)), "What did they say? (dictation of one line)");
  // order the lines with the keyboard buttons only
  const orderTexts = () => page.evaluate(() => [...document.querySelectorAll("#cx-ord li .cx__ordertext")].map(n => n.textContent));
  const want = ["The river rose quickly last night.", "Did the water reach the road?", "Yes, and the shops closed early.", "Everyone waited for the rain to stop."];
  for (let target = 0; target < want.length; target++) {
    let current = await orderTexts(); let from = current.indexOf(want[target]);
    while (from > target) { await page.evaluate(i => [...document.querySelectorAll("#cx-ord li")][i].querySelector("button").click(), from); from -= 1; }
  }
  check(JSON.stringify(await orderTexts()) === JSON.stringify(want), "Order the lines works with Move up buttons (no dragging needed)");
  await page.evaluate(() => [...document.querySelectorAll("#cx-ord button")].find(b => b.textContent === "Check the order").click());
  check(await page.evaluate(() => /right order/.test(document.querySelector("#cx-ord .cx__feedback").textContent)), "and the order is graded");
  await page.evaluate(() => { const selects = [...document.querySelectorAll("#cx-who select")]; ["Anna", "Ben", "Anna", "Ben"].forEach((name, i) => { selects[i].value = name; selects[i].dispatchEvent(new Event("change", { bubbles: true })); }); [...document.querySelectorAll("#cx-who button")].find(b => b.textContent === "Check").click(); });
  check(await page.evaluate(() => /All correct/.test(document.querySelector("#cx-who .cx__feedback").textContent)), "Who said it? matches lines to speakers");
  await page.evaluate(() => [...document.querySelectorAll("#cx-sh button")].find(b => /said it aloud/.test(b.textContent)).click());
  check(await page.evaluate(() => /not marked/.test(document.querySelector("#cx-sh .cx__feedback").textContent)), "Shadowing is practice, not marked (microphone coaching is optional)");
  await page.evaluate(() => { const want = new Set(["l1:2", "l3:4", "l6:1", "l6:5"]); const lines = { l1: 0, l3: 1, l6: 2 }; const paras = document.querySelectorAll("#cx-gs .cx__spotline"); for (const key of want) { const [id, i] = key.split(":"); paras[lines[id]].querySelectorAll("button")[Number(i)].click(); } [...document.querySelectorAll("#cx-gs button")].find(b => b.textContent === "Check").click(); });
  check(await page.evaluate(() => /found them all/.test(document.querySelector("#cx-gs .cx__feedback").textContent)), "Grammar spotter: tap every past simple verb");
  await page.type("#cx-pr textarea", "The river came up and the town closed its shops while people worked all night.");
  await page.evaluate(() => document.querySelector("#cx-pr .button").click());
  check(await until(async () => { const queue = await rest(`sessions/${anna.code}/reviewQueue`); return queue && Object.values(queue).some(item => /Clip Lab/.test(item.extra || "") && /river came up/.test(item.studentAnswer)); }), "the written answer goes to the teacher's review queue");
  await page.screenshot({ path: `${SHOTS}clip-desktop.png` });
  check(await page.evaluate(() => !document.getElementById("complete").disabled), "when every activity is done the lesson can be completed");
  await page.evaluate(() => document.getElementById("complete").click());
  check(await until(() => page.evaluate(() => /Clip complete/.test(document.getElementById("result").textContent))), "completing shows a result with stars");
  const resultText = await page.evaluate(() => document.getElementById("result").textContent);
  check(/★★★/.test(resultText) && /mastered/.test(resultText), `a perfect clip is a mastered scene (${resultText})`);
  const progress = await rest(`studentProgress/${anna.code}`);
  check(progress && progress.xp > 0 && Object.values(progress.attempts || {}).some(a => a.gameId === "sample-flood-night"), `XP and the attempt are saved (${progress && progress.xp} XP)`);
  const record = progress.clips && progress.clips["sample-flood-night"];
  check(record && record.stars === 3 && record.attempts === 1 && Number.isFinite(record.seconds) && (record.weakLines || []).length === 0 && record.interactive === true, `the clip's own completion record is saved for the Clips tab and the teacher (${JSON.stringify(record)})`);
  check(progress.vocabulary && Object.keys(progress.vocabulary).length >= 1, "saving the clip lesson kept the saved word");

  // axe and phone
  await page.evaluate(axeCore.source);
  const violations = await page.evaluate(() => axe.run(document.querySelector("main"), { resultTypes: ["violations"] }).then(r => r.violations.map(v => `${v.impact}:${v.id}:${v.nodes.length}`)));
  check(violations.length === 0, `axe finds no problems on the clip page (${violations.join(", ") || "none"})`);
  await page.setViewport({ width: 390, height: 844 }); await sleep(250);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), "no sideways scroll at 390 px");
  check(await page.evaluate(() => getComputedStyle(document.querySelector(".video-panel")).position === "sticky"), "on a phone the player stays pinned while you read the transcript");
  await page.screenshot({ path: `${SHOTS}clip-phone.png` });
  await page.setViewport({ width: 1440, height: 900 });
  await page.close();

  // ============================ the video refuses to play ============================
  await rest(`studentProgress/${anna.code}`, "DELETE");
  const refusing = await freshStudent(protectedSample); watch(refusing, "refusing");
  await refusing.evaluateOnNewDocument(FAKE_YT); await refusing.evaluateOnNewDocument(() => { window.addEventListener("DOMContentLoaded", () => { window.__yt.errorOnReady = true; }); });
  await refusing.goto(clipUrl, { waitUntil: "networkidle2" });
  await refusing.waitForSelector(".transcript-line");
  await refusing.evaluate(() => { window.__yt.errorOnReady = true; document.getElementById("loadVideo").click(); });
  check(await until(() => refusing.evaluate(() => /does not allow this video/.test(document.getElementById("playerStatus").textContent))), "a video the owner blocks gives a clear message");
  check(await refusing.evaluate(() => /study text and the activities/.test(document.getElementById("playerStatus").textContent) && !document.getElementById("openVideo").hidden), "with the lesson still usable and a link to open the video");
  check(await refusing.evaluate(() => document.querySelectorAll(".transcript-line").length === 8 && document.getElementById("playPause").disabled), "the transcript stays, the player controls stay off");
  await refusing.evaluate(() => [...document.querySelectorAll("#cx-g1 button")][1].click());
  check(await refusing.evaluate(() => /Not quite/.test(document.querySelector("#cx-g1 .cx__feedback").textContent)), "the activities still work, and a wrong answer shows the right one");
  await refusing.close();

  // ============================ the player script is blocked ============================
  const blocked = await freshStudent(protectedSample); watch(blocked, "blocked", /youtube|ERR_|Refused|iframe_api/i);
  await blocked.setRequestInterception(true);
  blocked.on("request", request => { if (/youtube\.com\/iframe_api|youtube-nocookie|youtube\.com\/s\//.test(request.url())) request.abort("blockedbyclient"); else request.continue(); });
  await blocked.goto(clipUrl, { waitUntil: "domcontentloaded" });
  await blocked.waitForSelector(".transcript-line", { timeout: 20000 });
  await blocked.click("#loadVideo");
  check(await until(() => blocked.evaluate(() => /could not be loaded|did not load/.test(document.getElementById("playerStatus").textContent)), 15000), "when the official player script is blocked the page says so");
  check(await blocked.evaluate(() => document.querySelectorAll(".transcript-line").length === 8 && document.querySelector("#cx-g1 button") !== null), "and the transcript and activities remain");
  await blocked.close();

  // ============================ an unverified clip (the shipped ones) ============================
  const shippedProtected = addProtectedClipAnswers(shipped, { "flood-pick": "land" });
  const oldPage = await freshStudent(shippedProtected); watch(oldPage, "unverified");
  await oldPage.evaluateOnNewDocument(FAKE_YT);
  await oldPage.goto(clipUrl, { waitUntil: "networkidle2" });
  await oldPage.waitForSelector(".transcript-line");
  check(await oldPage.evaluate(() => !document.getElementById("warnings").hidden && /still checking the timing/.test(document.getElementById("warnings").textContent)), "a clip whose timing is unchecked shows a plain warning");
  check(await oldPage.evaluate(() => document.querySelectorAll(".transcript-line .line-time").length === 1 && document.querySelector("button.line-time") === null && ![...document.querySelectorAll(".line-actions button")].some(b => /Loop/.test(b.textContent))), "with no time links and no loop buttons");
  await oldPage.click("#loadVideo");
  await until(() => oldPage.evaluate(() => !document.getElementById("playPause").disabled));
  check(await oldPage.evaluate(() => document.getElementById("loopLine").disabled), "and the loop control stays off");
  await oldPage.close();


  // ============================ the clip maker, used by a teacher ============================
  await seedEmulator({ log: () => {} });
  const teacherContext = await browser.createBrowserContext(); const teacher = await teacherContext.newPage(); watch(teacher, "tool", /youtube|ERR_/i);
  const jsClick = id => teacher.evaluate(target => document.getElementById(target).click(), id); // the page scrolls while the player loads, so click by script
  await teacher.setViewport({ width: 1440, height: 1000 });
  await teacher.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  await teacher.evaluate(async credentials => { await firebase.auth().signInWithEmailAndPassword(credentials.email, credentials.password); }, DEMO_TEACHER);
  await teacher.evaluateOnNewDocument(FAKE_YT);
  await teacher.evaluateOnNewDocument(() => { window.__blobs = []; const original = URL.createObjectURL; URL.createObjectURL = blob => { window.__blobs.push(blob); return original.call(URL, blob); }; });
  await teacher.setRequestInterception(true);
  teacher.on("request", request => {
    if (/youtube\.com\/oembed/.test(request.url())) request.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ title: "Floods 101 | National Geographic", author_name: "National Geographic" }) });
    else request.continue();
  });
  await teacher.goto(`${BASE}tools/import-content.html`, { waitUntil: "networkidle2" });
  await teacher.waitForSelector("#cmUrl");
  await teacher.type("#cmUrl", "https://youtu.be/4PXj7bOD7IY?si=abc");
  await jsClick("cmLookup");
  check(await until(() => teacher.evaluate(() => /Embedding is allowed/.test(document.getElementById("cmLookupStatus").textContent) && document.getElementById("cmChannel").value === "National Geographic")), "the clip maker looks up the channel and title from the video address");
  check(await until(() => teacher.evaluate(() => !document.getElementById("cmMarkStart").disabled)), "the official player loads so the window and lines can be stamped");
  const at = seconds => teacher.evaluate(s => { window.__yt.time = s; }, seconds);
  await at(10); await jsClick("cmMarkStart"); await at(70); await jsClick("cmMarkEnd");
  check(await teacher.evaluate(() => /Start 0:10.0 · End 1:10.0 \(60 seconds\)/.test(document.getElementById("cmWindow").textContent)), "Mark start and Mark end set a 60 second window");
  const sayings = [["The river rose quickly last night.", "Anna"], ["Did the water reach the road?", "Ben"], ["Yes, and the shops closed early.", "Anna"], ["Everyone waited for the rain to stop.", "Ben"], ["Then the volunteers brought sandbags.", "Anna"], ["They worked until the morning came.", "Ben"], ["By noon the water had gone down.", "Anna"], ["The town was safe again.", "Ben"]];
  for (const [index, [text, speaker]] of sayings.entries()) {
    await teacher.$eval("#cmLineText", node => { node.value = ""; }); await teacher.$eval("#cmLineSpeaker", node => { node.value = ""; });
    await teacher.type("#cmLineText", text); await teacher.type("#cmLineSpeaker", speaker);
    await at(10 + index * 6); await jsClick("cmStampStart"); await at(16 + index * 6); await jsClick("cmStampEnd");
  }
  check(await teacher.evaluate(() => document.querySelectorAll("#cmLines tbody tr").length === 8 && /8 lines, no timing problems/.test(document.getElementById("cmLineProblems").textContent)), `eight lines are stamped while the video plays, and the timing is checked live (${await teacher.evaluate(() => document.querySelectorAll("#cmLines tbody tr").length + " rows; " + document.getElementById("cmLineProblems").textContent)})`);
  await at(15); await teacher.type("#cmLineText", "A line that overlaps."); await jsClick("cmStampEnd");
  check(await teacher.evaluate(() => /overlaps|outside|before it starts/.test(document.getElementById("cmLineProblems").textContent)), "a line that overlaps another is flagged in plain words");
  await teacher.evaluate(() => [...document.querySelectorAll("#cmLines tbody tr")].pop().querySelector("button").click());
  await teacher.type("#cmGrammar", "past simple"); await teacher.type("#cmVocab", "sandbags = bags filled with sand");
  await teacher.type("#cmGist", "What is the clip about?"); await teacher.type("#cmGistOptions", "a flood in a town\na birthday party\na football match");
  await jsClick("cmTiming"); await teacher.$eval("#cmId", node => { node.value = "tool-made-clip"; });
  await jsClick("cmBuild");
  check(await until(() => teacher.evaluate(() => /The clip is valid/.test(document.getElementById("cmMessages").textContent) && !document.getElementById("cmDownload").disabled)), `the maker checks the clip and says it is valid (${await teacher.evaluate(() => document.getElementById("cmMessages").textContent)})`);
  await jsClick("cmDownload");
  const blobs = await teacher.evaluate(async () => Promise.all(window.__blobs.map(blob => blob.text())));
  const made = JSON.parse(blobs[0]); const keys = JSON.parse(blobs[1]);
  check(made.schemaVersion === 2 && made.id === "tool-made-clip" && made.transcript.length === 8 && made.timingVerified === true, "the downloaded clip is version 2 with the stamped lines");
  check(made.exercises.every(exercise => !("answer" in exercise)) && keys["tool-made-clip"]["gist-1"] === "a flood in a town", "the public file has no answers; the answer keys come in their own file");
  check(new Set(made.exercises.map(exercise => exercise.type)).size >= 5, `exercises of ${new Set(made.exercises.map(exercise => exercise.type)).size} different types were suggested from the lines`);
  const dir = new URL("../docs/clips/", import.meta.url);
  void dir;
  await teacher.screenshot({ path: `${SHOTS}clip-maker.png`, fullPage: false });
  await teacherContext.close();
  check(problems.length === 0, `no console errors (${problems.slice(0, 3).join(" | ") || "none"})`);
} finally {
  await browser.close();
}
if (failures.length) { console.log(`\n${failures.length} check(s) failed.`); process.exit(1); }
console.log("\nAll Clip Lab checks passed.");
