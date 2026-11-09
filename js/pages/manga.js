import { safeLocal, safeSession } from "../safe-storage.js";
// Manga Reader: the chapters shelf and the reader (scroll, page flip, panel by panel), with a bottom sheet for each bubble,
// words to learn before and during reading, a small question after each page, chapter questions, a boss fight and a retell
// task for the teacher. It only opens for students whose teacher switched the mangaReader flag on.
import { firebaseConfig } from "../config.js";
import { bindStudentCode } from "../student-context.js";
import { loadProtectedContent } from "../protected-content.js";
import { appendBoundedRealtimeRecord } from "../bounded-realtime-list.js";
import { validateManga } from "../manga/schema.js";
import { migrateV1 } from "../manga/schema-v2.js";
import { chooseAdaptation, recentAccuracy } from "../manga/adaptation.js";
import { bossGame, chapterRecord, rewardResult, stars as starCount, wordKey, preReadingWords } from "../manga/learning.js";
import { DEFAULT_PREFS, FONT_SCALES, MODES, MODE_LABELS, defaultMode, effectiveDirection, keyDelta, loadPosition, loadPrefs, panelsOf, positionKey, savePosition, savePrefs, step } from "../manga/reader-state.js";
import { chapterShelf, earnedBadges, nextChapter, SHELF_BADGES } from "../manga/shelf.js";
import { bubbleNumber, button, createSheets, el, renderPage, renderPanel } from "../manga/reader-ui.js";
import { renderPreReading, renderQuestions, renderQuiz, renderRetell } from "../manga/learning-ui.js";
import { saveGameProgress, saveVocabularyWord } from "../games/progress.js";
import { moduleFor, playModular } from "../games/runtime.js";
import { createServices, loadSettings } from "../games/settings.js";
import { featureEnabled, revealMangaTab, showNotEnabled } from "../feature-gate.js";
import { localZone } from "../schedule.js";
import { mountBottomNav, mountOfflineBanner, showErrorPage, watchConnection } from "../shell.js";

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const OFFLINE_CACHE = "learning-studio-manga-v1";
mountOfflineBanner(); mountBottomNav("manga");

let db; let code = ""; let lessonId = ""; let lesson = null; let manga = null; let chapter = null; let chapterIndex = 0;
let prefs = { ...DEFAULT_PREFS }; let direction = "ltr"; let position = { page: 0, panel: 0, mode: "flip" };
let records = {}; let assignments = {}; let student = {};
let highestPage = 0; let endSeen = false; let sheets = null; let observer = null; let flushTimer = 0;
let activeSeconds = 0; let flushedSeconds = 0; let finished = false; let bossResult = null; let retellSent = false;
const answers = { quick: {}, questions: {} }; const savedWords = new Set(); const mistakes = [];
setInterval(() => { if (document.visibilityState === "visible" && chapter) activeSeconds += 1; }, 1000);

function rememberedCode() {
  const remember = safeLocal.getItem("nd_remember_student") === "true";
  const storage = remember ? safeLocal : safeSession;
  return String(params.get("code") || storage.getItem("nd_student_code") || "").trim().toUpperCase();
}
const say = (text, kind = "") => { const node = $("status"); node.hidden = !text; node.textContent = text; node.className = `mg-status${kind ? ` ${kind}` : ""}`; };
const hrefFor = (extra = {}) => { const query = new URLSearchParams({ code, ...(lessonId ? { lesson: lessonId } : {}), ...extra }); return `manga.html?${query}`; };

// ---- loading the story (with a copy kept for offline reading) ---------------------------------------------------------------------
function readyStory(content) {
  let story = validateManga(content);
  if (story.schemaVersion === 1) story = validateManga(migrateV1(story));
  return story;
}
const cacheKey = (mangaId) => new URL(`manga-data/${encodeURIComponent(code)}/${encodeURIComponent(mangaId)}.json`, location.href).href;
async function cacheStory(story) {
  if (!("caches" in window)) return false;
  try {
    const cache = await caches.open(OFFLINE_CACHE);
    await cache.put(cacheKey(story.id), new Response(JSON.stringify(story), { headers: { "Content-Type": "application/json" } }));
    const urls = [...new Set(story.chapters.flatMap(item => item.pages.map(page => page.image)))].filter(url => !/^https?:/i.test(url));
    await Promise.all(urls.map(url => cache.add(new URL(url, location.href).href).catch(() => null)));
    return true;
  } catch (error) { return false; }
}
async function cachedStory(mangaId) {
  if (!("caches" in window)) return null;
  try { const hit = await (await caches.open(OFFLINE_CACHE)).match(cacheKey(mangaId)); return hit ? readyStory(await hit.json()) : null; } catch (error) { return null; }
}
async function forgetStory(mangaId) { try { await (await caches.open(OFFLINE_CACHE)).delete(cacheKey(mangaId)); } catch (error) { /* nothing cached */ } }

async function loadStory(wantedLesson) {
  try {
    const record = await loadProtectedContent(db, wantedLesson, "manga");
    return readyStory(record.content);
  } catch (error) {
    if (/permission|denied/i.test(String(error.code || error.message))) { await forgetStory(lesson.mangaId); throw error; } // the flag was switched off: nothing is kept
    const offline = await cachedStory(lesson.mangaId);
    if (offline) return offline;
    throw error;
  }
}

// ---- saving ---------------------------------------------------------------------------------------------------------------------------------
async function saveWord(item) {
  const key = wordKey(item.word); if (!key) throw new Error("This word cannot be saved.");
  const entry = { word: item.word.slice(0, 100), definition: item.meaning.slice(0, 1000), sourceMangaId: manga.id.slice(0, 80), chapterId: chapter.id.slice(0, 80), savedAt: new Date().toISOString() };
  if (item.translation) entry.translation = item.translation.slice(0, 300);
  await saveVocabularyWord({ db, code, key, entry });
  savedWords.add(key); scheduleFlush();
}
async function saveSentence(bubble) {
  const key = `s-${manga.id}-${bubble.id}`.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 64);
  const entry = { word: bubble.text.slice(0, 100), definition: bubble.simplified.slice(0, 1000), sourceMangaId: manga.id.slice(0, 80), chapterId: chapter.id.slice(0, 80), savedAt: new Date().toISOString() };
  if (bubble.translation) entry.translation = bubble.translation.slice(0, 300);
  await saveVocabularyWord({ db, code, key, entry });
  savedWords.add(key); scheduleFlush();
}

function speak(bubble) {
  if (bubble.audio) { const audio = new Audio(bubble.audio); audio.play().catch(() => {}); return ""; }
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return "Reading aloud is not available in this browser. You can read it aloud yourself.";
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(bubble.text); utterance.lang = "en-US";
  utterance.addEventListener("error", event => { $("sheetStatus").textContent = `Reading aloud failed: ${event.error}.`; });
  window.speechSynthesis.speak(utterance);
  return "";
}

async function sendReview(question, text) {
  await appendBoundedRealtimeRecord(db.ref(`sessions/${code}/reviewQueue`), { stage: 3, questionId: `manga:${chapter.id}:${question.id}`.slice(0, 100), prompt: question.prompt.slice(0, 120), studentAnswer: text.slice(0, 300), autoResult: false, ts: Date.now(), extra: `Manga Reader: ${manga.title} (${chapter.title})`.slice(0, 300) });
}
async function sendRetell(text) {
  await sendReview({ id: "retell", prompt: `Retell: ${chapter.title}` }, text); retellSent = true; scheduleFlush();
}

const recordRef = () => db.ref(`studentProgress/${code}/manga/${manga.id}/${chapter.id}`);
function visit(extra = {}) {
  const quickEntries = Object.values(answers.quick).filter(item => item.correct !== null);
  const questionEntries = Object.values(answers.questions).filter(item => item.correct !== null);
  const seconds = Math.max(0, activeSeconds - flushedSeconds);
  return { pagesRead: highestPage + 1, seconds, mode: position.mode, words: savedWords.size, retell: retellSent,
    quick: { score: quickEntries.filter(item => item.correct).length, total: quickEntries.length },
    questions: { score: questionEntries.filter(item => item.correct).length, total: questionEntries.length },
    boss: bossResult, mistakes, finished: false, ...extra };
}
// Writes where the student has got to. Cheap and bounded: at most once every few seconds, and when the page is hidden.
async function flush(extra = {}) {
  if (!chapter || !db) return null;
  clearTimeout(flushTimer); flushTimer = 0;
  const made = visit(extra); flushedSeconds = activeSeconds;
  const next = chapterRecord(chapter, records[chapter.id], made);
  try { await recordRef().set(next); records[chapter.id] = next; } catch (error) { flushedSeconds -= made.seconds; throw error; }
  return next;
}
function scheduleFlush() { if (!flushTimer) flushTimer = setTimeout(() => { flush().catch(() => {}); }, 4000); }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && chapter && !finished) flush().catch(() => {}); });

// ---- the shelf -----------------------------------------------------------------------------------------------------------------------
function creditText(credits) { return `Story by ${credits.author}. Art by ${credits.artist}. ${credits.licence}${credits.sourceUrl ? ` Source: ${credits.sourceUrl}` : ""}`; }

function paintCredits() {
  const list = $("creditList"); list.replaceChildren();
  for (const [label, value] of [["Author", manga.credits.author], ["Artist", manga.credits.artist], ["Licence", manga.credits.licence], ["Rights", manga.credits.rights === "original" ? "Original work made for this course" : manga.credits.rights], ["Source", manga.credits.sourceUrl || ""]]) {
    if (!value) continue; list.append(el("dt", "", label)); const dd = el("dd");
    if (label === "Source") { const link = el("a", "", value); link.href = value; link.rel = "noopener noreferrer"; link.target = "_blank"; dd.append(link); } else dd.textContent = value;
    list.append(dd);
  }
}

function adaptation() {
  const placement = student.placement || {};
  const mine = Object.values(records).filter(item => item && item.qTotal).map(item => ({ score: (item.qScore || 0) + (item.quickScore || 0), total: (item.qTotal || 0) + (item.quickTotal || 0) }));
  return chooseAdaptation({ storyLevel: manga.level, studentLevel: placement.teacherLevel || placement.cefr, accuracy: recentAccuracy(mine) });
}

function showShelf(otherStories) {
  say(""); $("reader").hidden = true; $("shelf").hidden = false; $("shelfLink").hidden = true;
  document.title = `${manga.title} | Manga Reader`;
  $("storyTitle").textContent = manga.title; $("storyLevel").textContent = manga.level;
  $("storyCredits").textContent = creditText(manga.credits);
  const plan = adaptation(); $("adaptNote").textContent = plan.reason;
  const shelf = chapterShelf(manga, records, assignments, Date.now(), localZone());
  const next = nextChapter(shelf);
  $("continueLink").href = hrefFor({ chapter: next ? next.id : manga.chapters[0].id });
  $("continueLink").textContent = next && next.state === "reading" ? "Continue reading" : next && next.state === "done" ? "Read again" : "Start reading";
  const list = $("chapterList"); list.replaceChildren();
  for (const item of shelf) {
    const card = el("li", "mg-chapter"); const heading = el("h3", "", item.title); heading.id = `ch-${item.id}`; card.setAttribute("aria-labelledby", heading.id);
    const chips = el("div", "mg-chips");
    chips.append(el("span", "mg-chip", `${item.pages} page${item.pages === 1 ? "" : "s"} · about ${item.minutes} min`));
    if (item.state === "reading") chips.append(el("span", "mg-chip", `${item.pagesRead} of ${item.pages} pages read`));
    if (item.state === "done") chips.append(el("span", "mg-chip mg-chip--done", `Finished ${"★".repeat(item.stars)}${"☆".repeat(3 - item.stars)} (${item.stars} of 3 stars)`));
    if (item.bossWon) chips.append(el("span", "mg-chip mg-chip--done", "Boss defeated"));
    if (item.due.label) chips.append(el("span", `mg-chip${["overdue", "due-today", "due-soon"].includes(item.due.state) ? " mg-chip--due" : ""}`, item.due.label));
    const link = el("a", "ds-btn ds-btn--primary", item.state === "done" ? "Read again" : item.state === "reading" ? "Continue" : "Read this chapter");
    link.href = hrefFor({ chapter: item.id }); link.setAttribute("aria-label", `${link.textContent}: ${item.title}`);
    card.append(heading, el("p", "", item.summary), chips, link); list.append(card);
  }
  const earned = new Set(earnedBadges(shelf).map(badge => badge.id)); const badges = $("badgeList"); badges.replaceChildren();
  for (const badge of SHELF_BADGES) {
    const got = earned.has(badge.id); const item = el("li", `mg-badge${got ? "" : " mg-badge--locked"}`);
    item.append(el("strong", "", `${badge.icon} ${badge.name}`), el("span", "mg-note", got ? "Earned" : badge.criteria)); badges.append(item);
  }
  $("storyPicker").hidden = !otherStories.length; const picks = $("pickerList"); picks.replaceChildren();
  for (const other of otherStories) { const row = el("li", "mg-chapter"); const link = el("a", "ds-btn ds-btn--secondary", other.title || other.id); link.href = `manga.html?${new URLSearchParams({ code, lesson: other.id })}`; row.append(link); picks.append(row); }
}

// ---- the reader ---------------------------------------------------------------------------------------------------------------------
function applyPrefs() {
  document.documentElement.style.setProperty("--mg-font", String(prefs.fontScale));
  if (prefs.highContrast) document.documentElement.dataset.mgContrast = "high"; else delete document.documentElement.dataset.mgContrast;
  $("aidFont").value = String(prefs.fontScale); $("aidContrast").checked = prefs.highContrast; $("aidHide").checked = prefs.hideText; $("aidTranslate").checked = prefs.translation;
  const vertical = manga && manga.readingDirection === "vertical";
  $("dirButton").hidden = vertical; $("dirButton").setAttribute("aria-pressed", String(direction === "rtl"));
  $("dirButton").textContent = direction === "rtl" ? "Reading right to left" : "Reading left to right";
  $("reader").dataset.dir = direction;
}
function paintModes() {
  const group = $("modeGroup"); group.replaceChildren();
  for (const mode of MODES) group.append(button(MODE_LABELS[mode], "", () => { setMode(mode); }, { "aria-pressed": String(position.mode === mode) }));
}
function setMode(mode) { position = { ...position, mode }; if (mode === "panel") position.panel = Math.min(position.panel, panelsOf(chapter.pages[position.page], direction).length - 1); paintModes(); render({ focusStage: true }); }

const ctxFor = () => ({ chapter, prefs, direction, number: bubble => bubbleNumber(chapter, bubble), whenBubble: (bubble, from) => sheets.openBubble(bubble, from) });
const quizCtx = () => ({ chapter, answers, record(quick, given, correct) { answers.quick[quick.id] = { given, correct }; if (correct === false) mistakes.push({ itemId: `${manga.id}-${quick.id}`.slice(0, 100), prompt: quick.prompt.slice(0, 300), answer: "See the page again", topic: `Manga: ${chapter.title}`.slice(0, 80) }); scheduleFlush(); } });

function lastStepReached() {
  const lastPage = chapter.pages.length - 1;
  if (position.page !== lastPage) return false;
  return position.mode !== "panel" || position.panel >= panelsOf(chapter.pages[lastPage], direction).length - 1;
}

function render({ focusStage = false } = {}) {
  const stage = $("stage"); const quizHost = $("pageQuiz");
  if (observer) { observer.disconnect(); observer = null; }
  stage.replaceChildren(); quizHost.replaceChildren();
  const ctx = ctxFor();
  if (position.mode === "scroll") {
    chapter.pages.forEach((page, index) => { stage.append(renderPage(page, index, { ...ctx, eager: index < 2 })); const quiz = renderQuiz(page, quizCtx()); if (quiz) { quiz.dataset.forPage = String(index); stage.append(quiz); } });
    if (typeof IntersectionObserver === "function") {
      observer = new IntersectionObserver(entries => {
        const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) { position.page = Number(visible.target.dataset.page); position.panel = 0; reached(); paintPosition(); savePosition(safeLocal, positionKey(code, manga.id, chapter.id), position); }
      }, { threshold: [0.4, 0.7] });
      stage.querySelectorAll(".mg-page").forEach(node => observer.observe(node));
    }
    const target = stage.querySelector(`.mg-page[data-page="${position.page}"]`);
    if (target && position.page > 0 && focusStage) target.scrollIntoView({ block: "start" });
  } else if (position.mode === "flip") {
    stage.append(renderPage(chapter.pages[position.page], position.page, { ...ctx, eager: true }));
    const quiz = renderQuiz(chapter.pages[position.page], quizCtx()); if (quiz) quizHost.append(quiz);
  } else {
    const page = chapter.pages[position.page]; const panel = panelsOf(page, direction)[position.panel];
    stage.append(renderPanel(page, position.page, panel, ctx));
    if (position.panel === panelsOf(page, direction).length - 1) { const quiz = renderQuiz(page, quizCtx()); if (quiz) quizHost.append(quiz); }
  }
  reached(); paintPosition();
  if (focusStage && position.mode !== "scroll") stage.focus({ preventScroll: true });
  savePosition(safeLocal, positionKey(code, manga.id, chapter.id), position);
}

function reached() {
  highestPage = Math.max(highestPage, position.page);
  if (position.mode === "scroll" ? position.page === chapter.pages.length - 1 : lastStepReached()) endSeen = true;
  $("chapterEnd").hidden = !(endSeen || position.mode === "scroll");
  scheduleFlush();
}
function paintPosition() {
  const pages = chapter.pages.length; const panels = panelsOf(chapter.pages[position.page], direction).length;
  $("position").textContent = position.mode === "panel" ? `Page ${position.page + 1} of ${pages}, panel ${position.panel + 1} of ${panels}` : `Page ${position.page + 1} of ${pages}`;
  const first = position.page === 0 && (position.mode !== "panel" || position.panel === 0);
  $("prevBtn").disabled = first;
  $("nextBtn").textContent = lastStepReached() || (position.mode === "scroll" && position.page === pages - 1) ? "Go to the questions" : "Next";
  $("prevBtn").textContent = "Previous";
}

function go(delta) {
  if (position.mode === "scroll") {
    const page = Math.min(chapter.pages.length - 1, Math.max(0, position.page + delta));
    if (delta > 0 && position.page === chapter.pages.length - 1) { focusEnd(); return; }
    const target = $("stage").querySelector(`.mg-page[data-page="${page}"]`); if (target) { target.scrollIntoView({ block: "start" }); position.page = page; paintPosition(); }
    return;
  }
  const moved = step(chapter, position, delta, direction);
  if (moved.edge === "end") { endSeen = true; $("chapterEnd").hidden = false; paintPosition(); focusEnd(); return; }
  if (moved.edge === "start") { $("position").textContent = "This is the first page."; return; }
  position = moved.position; render({ focusStage: true });
}
function focusEnd() { $("chapterEnd").hidden = false; const heading = $("endTitle"); heading.tabIndex = -1; heading.focus(); heading.scrollIntoView({ block: "start" }); }

function startReading() {
  $("preReading").hidden = true; $("stageWrap").hidden = false; render({ focusStage: true });
}

function wireReader() {
  $("prevBtn").addEventListener("click", () => go(-1));
  $("nextBtn").addEventListener("click", () => go(1));
  $("startReading").addEventListener("click", startReading);
  $("dirButton").addEventListener("click", () => {
    const before = panelsOf(chapter.pages[position.page], direction)[position.panel];
    direction = direction === "rtl" ? "ltr" : "rtl"; prefs = { ...prefs, direction }; savePrefs(prefs);
    position.panel = Math.max(0, panelsOf(chapter.pages[position.page], direction).indexOf(before));
    applyPrefs(); if (!$("stageWrap").hidden) render();
  });
  $("aidsButton").addEventListener("click", () => $("aidsDialog").showModal());
  $("aidsClose").addEventListener("click", () => $("aidsDialog").close());
  $("aidsDialog").addEventListener("close", () => $("aidsButton").focus());
  const changed = () => { prefs = { ...prefs, fontScale: Number($("aidFont").value) || 1, highContrast: $("aidContrast").checked, hideText: $("aidHide").checked, translation: $("aidTranslate").checked }; if (!FONT_SCALES.includes(prefs.fontScale)) prefs.fontScale = 1; savePrefs(prefs); applyPrefs(); if (!$("stageWrap").hidden) render(); };
  for (const id of ["aidFont", "aidContrast", "aidHide", "aidTranslate"]) $(id).addEventListener("change", changed);
  document.addEventListener("keydown", event => {
    if ($("reader").hidden || $("stageWrap").hidden || event.ctrlKey || event.metaKey || event.altKey) return;
    if (document.querySelector("dialog[open]")) return;
    if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable='true'], .gm-arena-host")) return;
    const delta = keyDelta(event.key, direction, position.mode);
    if (delta) { event.preventDefault(); go(delta); }
  });
  let startX = 0; let startY = 0;
  const stage = $("stage");
  stage.addEventListener("touchstart", event => { const touch = event.changedTouches[0]; startX = touch.clientX; startY = touch.clientY; }, { passive: true });
  stage.addEventListener("touchend", event => {
    if (position.mode === "scroll") return;
    const touch = event.changedTouches[0]; const dx = touch.clientX - startX; const dy = touch.clientY - startY;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    go((dx < 0 ? 1 : -1) * (direction === "rtl" ? -1 : 1));
  }, { passive: true });
  $("startBoss").addEventListener("click", startBoss);
  $("finishChapter").addEventListener("click", () => finishChapter().catch(error => { $("result").textContent = `Could not save your progress: ${error.message}`; $("result").className = "mg-status error"; $("finishChapter").disabled = false; }));
}

// ---- questions, boss and finishing ----------------------------------------------------------------------------------------------------
const scoredQuestions = () => chapter.questions.filter(question => question.type !== "inference");
function updateFinish() {
  const all = scoredQuestions().every(question => answers.questions[question.id]);
  $("finishChapter").disabled = finished || !all;
}
function paintQuestions() {
  renderQuestions($("questions"), { chapter, answers, record(question, given, correct) {
    answers.questions[question.id] = { given, correct };
    if (correct === false) mistakes.push({ itemId: `${manga.id}-${question.id}`.slice(0, 100), prompt: question.prompt.slice(0, 300), answer: String(question.answer || (question.answers && question.answers[0]) || "").slice(0, 300), topic: `Manga: ${chapter.title}`.slice(0, 80) });
    updateFinish(); scheduleFlush();
  }, sendReview, changed: updateFinish });
  const game = bossGame(chapter); $("bossArea").hidden = !game || !moduleFor(game);
  renderRetell(chapter, { area: $("retellArea"), prompt: $("retellPrompt"), text: $("retellText"), hint: $("retellHint"), send: $("retellSend") }, { sendRetell });
  updateFinish();
}

function startBoss() {
  const game = bossGame(chapter); if (!game) return;
  $("startBoss").hidden = true;
  const settings = loadSettings(); const host = $("bossHost"); host.replaceChildren();
  playModular({ container: host, game, settings, announce: () => {}, onFinish: async result => {
    bossResult = { score: result.score, total: result.total, won: result.won === true };
    try {
      const saved = await saveGameProgress({ db, code, game, result });
      const info = saved._info || {}; host.append(el("p", "mg-feedback good", `Boss fight over: ${result.score} of ${result.total}. +${info.xpEarned || 0} XP.`));
    } catch (error) { host.append(el("p", "mg-feedback bad", `Your boss result could not be saved: ${error.message}`)); }
    scheduleFlush();
  } });
}

async function finishChapter() {
  $("finishChapter").disabled = true; finished = true;
  const seconds = Math.max(0, activeSeconds - flushedSeconds);
  const made = visit({ finished: true, retell: retellSent });
  const total = made.quick.total + made.questions.total; const score = made.quick.score + made.questions.score;
  const game = { id: `manga-${chapter.id}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 60), type: "manga-chapter", title: `Manga: ${chapter.title}`.slice(0, 80) };
  let info = {};
  if (total > 0) { const saved = await saveGameProgress({ db, code, game, result: { ...rewardResult(made, seconds), score, total, mistakes, timeSpentSeconds: seconds, kind: "game" }, options: { hearts: false } }); info = saved._info || {}; }
  await flush({ finished: true, retell: retellSent });
  const earned = starCount(total ? score / total : 1);
  $("result").textContent = `Chapter finished: ${score} of ${total} answers right. ${"★".repeat(earned)}${"☆".repeat(3 - earned)} +${info.xpEarned || 0} XP.${Object.keys(answers.questions).some(id => chapter.questions.find(q => q.id === id && q.type === "inference")) ? " Your written answer was sent to your teacher." : ""}`;
  $("result").className = "mg-status success"; createServices(loadSettings()).celebrate(earned === 3 ? "big" : "small");
  const nextIndex = chapterIndex + 1;
  if (manga.chapters[nextIndex]) { const link = $("nextChapterLink"); link.href = hrefFor({ chapter: manga.chapters[nextIndex].id }); link.hidden = false; }
  else { const link = $("nextChapterLink"); link.href = hrefFor(); link.textContent = "Back to all chapters"; link.hidden = false; }
}

function showReader(chapterId) {
  chapterIndex = manga.chapters.findIndex(item => item.id === chapterId);
  if (chapterIndex < 0) { say("That chapter does not exist.", "error"); return; }
  chapter = manga.chapters[chapterIndex]; say(""); $("shelf").hidden = true; $("reader").hidden = false; $("shelfLink").hidden = false; $("shelfLink").href = hrefFor();
  document.title = `${chapter.title} | Manga Reader`;
  $("readerStory").textContent = manga.title; $("chapterTitle").textContent = chapter.title;
  paintCredits(); applyPrefs();
  const saved = loadPosition(safeLocal, positionKey(code, manga.id, chapter.id), chapter, direction);
  const mode = (saved && saved.mode) || defaultMode(manga, prefs);
  position = { page: saved ? saved.page : 0, panel: saved ? saved.panel : 0, mode: MODES.includes(mode) ? mode : "flip" };
  if (manga.readingDirection === "vertical") position.mode = saved && saved.mode ? saved.mode : "scroll";
  highestPage = Math.max(position.page, (records[chapter.id] && records[chapter.id].pagesRead ? records[chapter.id].pagesRead - 1 : 0));
  paintModes(); paintQuestions();
  sheets = createSheets({ $, chapter, getPrefs: () => prefs, saveSentence, saveWord, speak });
  wireReader();
  const plan = adaptation(); const fresh = !(records[chapter.id] && records[chapter.id].pagesRead > 0) && !saved;
  const words = preReadingWords(chapter, plan.preReadingWords);
  if (fresh && words.length) {
    renderPreReading($("preList"), words, savedWords, saveWord); $("preReading").hidden = false; $("stageWrap").hidden = true;
    $("preTitle").tabIndex = -1; $("preTitle").focus({ preventScroll: true });
  } else startReading();
  cacheStory(manga);
}

// ---- start ----------------------------------------------------------------------------------------------------------------------------------
async function start() {
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  db = firebase.database(); watchConnection(db);
  const bound = await bindStudentCode({ auth: firebase.auth(), db, code: rememberedCode() });
  code = bound.code;
  $("backLink").href = `portal.html?code=${encodeURIComponent(code)}`;
  const curriculum = (await db.ref(`studentCurriculum/${code}`).once("value")).val() || {};
  const stories = Object.entries(curriculum).filter(([, item]) => item && item.mangaId && item.published !== false).map(([id, item]) => ({ id, ...item })).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  const wanted = params.get("lesson");
  lesson = stories.find(item => item.id === wanted) || stories[0] || null;
  const allowed = await featureEnabled(db, code, "mangaReader", lesson ? lesson.features : null);
  if (!allowed) { showNotEnabled($("status"), "mangaReader", { backHref: $("backLink").href }); return; }
  revealMangaTab(db, code, lesson ? lesson.features : null).then(() => { const tab = document.querySelector('.ds-bottom-nav [data-tab="manga"]'); if (tab) tab.setAttribute("aria-current", "page"); });
  if (!lesson) { say("No story has been assigned to you yet. Your teacher will add one."); return; }
  lessonId = lesson.id;
  $("practiceLink").href = `practice.html?code=${encodeURIComponent(code)}&lesson=${encodeURIComponent(lessonId)}`;
  prefs = loadPrefs();
  try { manga = await loadStory(lessonId); } catch (error) {
    if (/permission|denied/i.test(String(error.code || error.message))) { showNotEnabled($("status"), "mangaReader", { backHref: $("backLink").href }); return; }
    throw error;
  }
  if (lesson.mangaId !== manga.id) throw new Error("This story is not assigned to your account.");
  direction = effectiveDirection(manga, prefs);
  const [recordSnap, assignSnap, studentSnap] = await Promise.all([
    db.ref(`studentProgress/${code}/manga/${manga.id}`).once("value"), db.ref(`mangaAssignments/${code}/${manga.id}`).once("value"), db.ref(`studentProgress/${code}/placement`).once("value")
  ]);
  records = recordSnap.val() || {}; assignments = assignSnap.val() || {}; student = { placement: studentSnap.val() || {} };
  const chapterId = params.get("chapter");
  if (chapterId) showReader(chapterId); else showShelf(stories.filter(item => item.id !== lessonId));
}

start().catch(error => showErrorPage($("status"), error, { title: "The manga could not load" }));
