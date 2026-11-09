// Clip Lab student page: official embedded video (privacy-enhanced), an interactive transcript that follows the video,
// and nine kinds of exercise. The video is never downloaded or re-hosted; if it cannot play, the lesson still works.
import { firebaseConfig } from "../config.js";
import { resolveStudentContext } from "../student-context.js";
import { loadProtectedContent } from "../protected-content.js";
import { appendBoundedRealtimeRecord } from "../bounded-realtime-list.js";
import { clipEmbedUrl, validateClip } from "../clips/schema.js";
import { clipWarnings, migrateV1 } from "../clips/schema-v2.js";
import { completionRecord, summarise } from "../clips/exercises.js";
import { mountBottomNav, mountOfflineBanner } from "../shell.js";
import { renderExercise } from "../clips/exercise-ui.js";
import { createClipPlayer, loadYouTubeApi } from "../clips/player.js";
import { wordsOf } from "../clips/lines.js";
import { saveGameProgress, saveVocabularyWord } from "../games/progress.js";
import { createServices, loadSettings } from "../games/settings.js";

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const lessonId = params.get("lesson");
const status = $("status");
let context; let clip; let player = null; let activeLine = -1; let mode = "en"; let selectedWord = null;
const responses = {}; const savedWords = new Set(); const lineNodes = [];
let activeSeconds = 0; // seconds with this page in view, so time on the clip is honest
setInterval(() => { if (document.visibilityState === "visible") activeSeconds += 1; }, 1000);
mountOfflineBanner(); mountBottomNav("clips");
let exerciseCount = 0;

const showError = error => { status.textContent = `Clip Lab could not load: ${error.message}`; status.classList.add("error"); };
const wordKey = word => word.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };

// ---- transcript ---------------------------------------------------------------------------------------------------
function vocabularyPattern() {
  const terms = (clip.vocabulary || []).map(item => item.word).sort((a, b) => b.length - a.length);
  return terms.length ? new RegExp(`(${terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi") : null;
}

function paintLine(content, line, index) {
  content.replaceChildren();
  const revealed = content.dataset.revealed === "true";
  if (mode === "none") { content.textContent = "Study text hidden."; return; }
  if (mode === "reveal" && !revealed && index !== activeLine) { content.append(button("Reveal this line", "word", () => { content.dataset.revealed = "true"; paintLine(content, line, index); })); return; }
  const value = mode === "native" ? line.translation : line.text;
  if (!value) { content.textContent = "Translation not provided."; return; }
  const pattern = vocabularyPattern();
  if (!pattern) { content.textContent = value; return; }
  value.split(pattern).forEach(part => {
    const item = (clip.vocabulary || []).find(entry => entry.word.toLocaleLowerCase() === part.toLocaleLowerCase());
    if (!item) { content.append(document.createTextNode(part)); return; }
    content.append(button(part, "word", () => openVocabulary(item), { "aria-label": `Meaning of ${part}` }));
  });
}

function button(label, className, handler, attributes = {}) {
  const node = document.createElement("button"); node.type = "button"; node.textContent = label; if (className) node.className = className;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (handler) node.addEventListener("click", handler); return node;
}

function buildTranscript() {
  const list = $("transcript"); list.replaceChildren(); lineNodes.length = 0;
  clip.transcript.forEach((line, index) => {
    const item = el("li", "transcript-line"); item.dataset.index = String(index);
    const verified = clip.timingVerified;
    const header = el("div", "line-head");
    if (verified) header.append(button(`Play from ${Math.floor(line.start)}s`, "line-time", () => seekTo(index)));
    else header.append(el("span", "line-time", `Line ${index + 1}`));
    if (line.speaker) header.append(el("span", "line-speaker", line.speaker));
    const content = el("div", "line-text"); content.dataset.lineId = line.id;
    const actions = el("div", "line-actions");
    if (verified) actions.append(button("Loop this line", "", () => loopLine(index), { "aria-pressed": "false" }));
    actions.append(button("Read aloud", "", () => { if (!window.speechSynthesis) return; window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(line.text); u.lang = "en-GB"; window.speechSynthesis.speak(u); }));
    item.append(header, content, actions); list.append(item); lineNodes.push({ item, content, line });
    paintLine(content, line, index);
  });
}

function highlight(index) {
  activeLine = index;
  lineNodes.forEach((node, i) => { node.item.classList.toggle("is-active", i === index); if (i === index) node.item.setAttribute("aria-current", "true"); else node.item.removeAttribute("aria-current"); if (mode === "reveal") paintLine(node.content, node.line, i); });
  const node = lineNodes[index]; if (node && typeof node.item.scrollIntoView === "function") node.item.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function seekTo(index) { if (player && player.ready) player.seekToLine(index, { play: true }); else $("playerStatus").textContent = "Load the video first."; }
function loopLine(index) {
  if (!player || !player.ready) { $("playerStatus").textContent = "Load the video first."; return; }
  const on = player.loop(index);
  document.querySelectorAll(".line-actions button[aria-pressed]").forEach((node, i) => { node.setAttribute("aria-pressed", String(on && i === index)); node.textContent = on && i === index ? "Stop looping" : "Loop this line"; });
  $("loopLine").setAttribute("aria-pressed", String(on)); $("playerStatus").textContent = on ? `Looping line ${index + 1}.` : "Loop stopped.";
}

// ---- vocabulary ------------------------------------------------------------------------------------------------------
function openVocabulary(item) {
  selectedWord = item; $("vocabularyWord").textContent = item.word; $("vocabularyTranslation").textContent = item.translation || ""; $("vocabularyDefinition").textContent = item.meaning;
  $("vocabularyStatus").textContent = ""; $("saveWord").disabled = savedWords.has(item.word); $("saveWord").textContent = savedWords.has(item.word) ? "Saved" : "Save word";
  $("vocabularyDialog").showModal();
}
async function saveVocabulary() {
  if (!selectedWord) return; const key = wordKey(selectedWord.word); if (!key) throw new Error("This word cannot be saved.");
  await saveVocabularyWord({ db: firebase.database(), code: context.code, key: key.slice(0, 64), entry: { word: selectedWord.word.slice(0, 100), translation: (selectedWord.translation || "").slice(0, 300), definition: selectedWord.meaning.slice(0, 1000), savedAt: new Date().toISOString(), sourceClipId: clip.id.slice(0, 80) } });
  savedWords.add(selectedWord.word); $("saveWord").disabled = true; $("saveWord").textContent = "Saved"; $("vocabularyStatus").textContent = "Saved to your vocabulary deck.";
}

// ---- video ----------------------------------------------------------------------------------------------------------------
function linkOut() { const link = $("openVideo"); link.href = clip.source.provider === "youtube" ? clip.source.sourceUrl : clip.source.url; link.textContent = clip.source.provider === "youtube" ? "Open the video on YouTube" : "Open the video"; }

function fallbackFrame() {
  if (clip.source.provider !== "youtube") return;
  const iframe = document.createElement("iframe"); const source = new URL(clipEmbedUrl(clip)); source.searchParams.set("origin", location.origin);
  iframe.src = source.href; iframe.title = `Official video: ${clip.source.videoTitle}`; iframe.loading = "lazy"; iframe.referrerPolicy = "strict-origin-when-cross-origin"; iframe.allowFullscreen = true;
  iframe.allow = "encrypted-media; picture-in-picture; web-share"; $("media").replaceChildren(iframe);
}

function enableControls(on) { for (const id of ["playPause", "prevLine", "nextLine"]) $(id).disabled = !on; $("loopLine").disabled = !(on && clip.timingVerified); }

async function startVideo() {
  $("loadVideo").disabled = true; $("playerStatus").textContent = "Loading the official video player…";
  try {
    const YT = await loadYouTubeApi();
    const target = document.createElement("div"); target.id = "youtubePlayer"; $("media").replaceChildren(target);
    player = createClipPlayer({
      clip, target: "youtubePlayer", YT, origin: location.origin,
      whenLine: index => { if (index >= 0) highlight(index); },
      whenState: state => { $("playPause").textContent = state === "playing" || state === "looping" ? "Pause" : "Play"; if (state === "ready") { enableControls(true); $("playerStatus").textContent = clip.timingVerified ? "Video ready. The line being spoken is highlighted." : "Video ready. The line timing is not checked yet, so lines are not highlighted."; } if (state === "ended") $("playerStatus").textContent = "The clip has ended. Press Play to watch it again."; },
      whenError: error => { $("playerStatus").textContent = `${error.message} You can still use the study text and the activities.`; enableControls(false); }
    });
  } catch (error) { $("playerStatus").textContent = `${error.message} The study text and activities still work.`; fallbackFrame(); }
}

function wireControls() {
  $("loadVideo").addEventListener("click", startVideo);
  $("playPause").addEventListener("click", () => player && player.toggle());
  $("prevLine").addEventListener("click", () => player && player.previousLine());
  $("nextLine").addEventListener("click", () => player && player.nextLine());
  $("loopLine").addEventListener("click", () => loopLine(activeLine >= 0 ? activeLine : 0));
  $("speed").addEventListener("change", () => { if (player) player.setSpeed(Number($("speed").value)); });
  document.addEventListener("keydown", event => {
    if (!player || !player.ready || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, dialog, [contenteditable='true']")) return;
    if (event.key === " " && !(event.target instanceof HTMLElement && event.target.closest("button, a, summary"))) { event.preventDefault(); player.toggle(); }
    else if (event.key === "ArrowRight" && clip.timingVerified) { event.preventDefault(); player.nextLine(); }
    else if (event.key === "ArrowLeft" && clip.timingVerified) { event.preventDefault(); player.previousLine(); }
    else if ((event.key === "l" || event.key === "L") && clip.timingVerified) { event.preventDefault(); loopLine(activeLine >= 0 ? activeLine : 0); }
  });
  document.querySelectorAll("[data-track]").forEach(node => node.addEventListener("click", () => {
    mode = node.dataset.track; document.querySelectorAll("[data-track]").forEach(item => item.setAttribute("aria-pressed", String(item === node)));
    lineNodes.forEach((entry, i) => { entry.content.dataset.revealed = "false"; paintLine(entry.content, entry.line, i); });
  }));
  $("saveWord").addEventListener("click", () => saveVocabulary().catch(error => { $("vocabularyStatus").textContent = `Could not save word: ${error.message}`; }));
  $("closeDialog").addEventListener("click", () => $("vocabularyDialog").close());
  $("complete").addEventListener("click", () => completeLesson().catch(error => { $("result").textContent = `Could not save progress: ${error.message}`; $("result").classList.add("error"); }));
}

// ---- exercises ---------------------------------------------------------------------------------------------------------------
async function sendForReview(exercise, text) {
  await appendBoundedRealtimeRecord(firebase.database().ref(`sessions/${context.code}/reviewQueue`), { stage: 3, questionId: `${clip.id}:${exercise.id}`.slice(0, 100), prompt: exercise.prompt.slice(0, 120), studentAnswer: text.slice(0, 300), autoResult: false, ts: Date.now(), extra: `Clip Lab: ${clip.title}`.slice(0, 300) });
}

function renderExercises() {
  const root = $("exercises"); root.replaceChildren(); const exercises = clip.exercises || []; exerciseCount = exercises.length;
  const ctx = { clip, get player() { return player; }, sendForReview };
  exercises.forEach((exercise, index) => {
    root.append(renderExercise(ctx, exercise, index + 1, response => { responses[exercise.id] = response; $("complete").disabled = Object.keys(responses).length < exerciseCount; }));
  });
  $("complete").disabled = exerciseCount === 0;
}

const stars = accuracy => (accuracy >= 0.9 ? 3 : accuracy >= 0.7 ? 2 : 1);

async function completeLesson() {
  $("complete").disabled = true;
  const summary = summarise(clip, responses); const total = Math.max(1, summary.total); const score = summary.total ? summary.score : 1;
  const game = { id: clip.id.slice(0, 60), type: "clip-lab", title: `Clip Lab: ${clip.title}`.slice(0, 80) };
  const result = { score, total, mistakes: summary.mistakes, timeSpentSeconds: activeSeconds, kind: "game" };
  const saved = await saveGameProgress({ db: firebase.database(), code: context.code, game, result, options: { hearts: false } });
  const recordRef = firebase.database().ref(`studentProgress/${context.code}/clips/${clip.id}`);
  const previous = (await recordRef.once("value")).val();
  await recordRef.set(completionRecord(clip, summary, previous, Date.now(), activeSeconds));
  const earned = stars(score / total); const info = saved._info || {};
  $("result").textContent = `Clip complete: ${summary.total ? `${summary.score} of ${summary.total} correct. ` : ""}${"★".repeat(earned)}${"☆".repeat(3 - earned)} scene ${earned === 3 ? "mastered" : "practised"}. +${info.xpEarned || 0} XP.${summary.pending ? " Your writing was sent to your teacher." : ""}`;
  $("result").classList.add("success"); createServices(loadSettings()).celebrate(earned === 3 ? "big" : "small");
}

// ---- start ---------------------------------------------------------------------------------------------------------------------
async function initialize() {
  if (!lessonId || !/^[A-Za-z0-9_-]+$/.test(lessonId)) throw new Error("A valid lesson is required.");
  firebase.initializeApp(firebaseConfig);
  const db = firebase.database();
  context = await resolveStudentContext({ auth: firebase.auth(), db, lessonId });
  const [record, lessonSnapshot] = await Promise.all([loadProtectedContent(db, context.lessonId, "clip"), db.ref(`studentCurriculum/${context.code}/${context.lessonId}`).once("value")]);
  const stored = record.content;
  clip = validateClip(stored); if (clip.schemaVersion === 1) clip = migrateV1(clip);
  const lesson = lessonSnapshot.val();
  if (!lesson || lesson.published === false || lesson.clipId !== clip.id) throw new Error("This clip is not assigned to your account.");
  $("backLink").href = params.get("from") === "lesson" ? `lesson.html?code=${encodeURIComponent(context.code)}&lesson=${encodeURIComponent(context.lessonId)}` : `portal.html?code=${encodeURIComponent(context.code)}`;
  if (params.get("from") === "lesson") $("backLink").textContent = "← Back to the lesson";
  $("clipsLink").href = `clips.html?code=${encodeURIComponent(context.code)}`;
  $("practiceLink").href = `practice.html?code=${encodeURIComponent(context.code)}&lesson=${encodeURIComponent(context.lessonId)}`;
  $("title").textContent = clip.title; $("level").textContent = clip.level;
  $("description").textContent = `${clip.source.channel} · ${clip.source.videoTitle}`;
  $("rights").textContent = `${clip.source.attribution}. ${clip.source.provider === "youtube" ? "Played with YouTube's official player; nothing is copied or saved." : "This video opens on its own site."}`;
  $("transcriptNote").textContent = clip.transcriptNote;
  for (const value of [...clip.genre, ...(clip.grammarPoints || []), ...(clip.vocabularyThemes || [])]) $("tags").append(el("span", "tag", value));
  const warnings = clipWarnings(clip).filter(text => /not been checked/.test(text));
  if (warnings.length) { $("warnings").hidden = false; $("warnings").textContent = "Your teacher is still checking the timing of this clip, so the lines are not highlighted and cannot be looped. The activities work as normal."; }
  linkOut();
  if (clip.source.provider !== "youtube") { $("media").replaceChildren(el("p", "", `This video cannot be played here. ${clip.source.where || ""}`)); }
  buildTranscript(); renderExercises(); wireControls();
  status.hidden = true; $("clipContent").hidden = false;
  void wordsOf;
}

initialize().catch(showError);
