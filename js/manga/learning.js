// The learning loop around a chapter: words before reading, the small questions on each page, the chapter questions, the
// boss fight (the Phase 5 Boss Battle module) and the record that is saved. Pure functions: no DOM and no Firebase.
import { isAnswerCorrect, normalizeAnswer } from "../grading.js";

export const wordKey = word => String(word).toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
export const bareWord = token => String(token).toLocaleLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "");
export const wordCount = text => String(text || "").trim().split(/\s+/).filter(Boolean).length;
const hash = text => { let h = 5381; for (let i = 0; i < text.length; i += 1) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0; return h; };

// Deterministic shuffle so the same question looks the same on every device (and in tests).
export function shuffled(list, seed) {
  const out = [...list]; let state = hash(String(seed)) || 1;
  for (let i = out.length - 1; i > 0; i -= 1) { state = (state * 1664525 + 1013904223) >>> 0; const j = state % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

// ---- before reading ------------------------------------------------------------------------------------------------------
export function preReadingWords(chapter, limit = 8, known = new Set()) {
  return (chapter.vocabulary || []).filter(item => !known.has(wordKey(item.word))).slice(0, Math.max(1, limit));
}

// ---- page questions ----------------------------------------------------------------------------------------------------
const findBubble = (page, id) => page.panels.flatMap(panel => panel.bubbles).find(bubble => bubble.id === id) || null;
export const speakersOf = chapter => [...new Set(chapter.pages.flatMap(page => page.panels.flatMap(panel => panel.bubbles.map(bubble => bubble.speaker).filter(Boolean))))];

// Fill the bubble: the bubble text with some words hidden, and the choices (the hidden words plus words from the chapter).
export function fillBubble(page, quick, chapter) {
  const bubble = findBubble(page, quick.bubbleId); const tokens = bubble.text.split(/\s+/);
  const hidden = new Set(quick.hide); const answers = quick.hide.map(index => bareWord(tokens[index]));
  const inBubble = new Set(tokens.map(bareWord));
  const spare = (chapter.vocabulary || []).map(item => bareWord(item.word)).filter(word => word && !inBubble.has(word));
  const distractors = shuffled([...new Set(spare)], `${quick.id}-d`).slice(0, Math.max(2, 4 - answers.length));
  return { speaker: bubble.speaker || "", tokens: tokens.map((text, index) => ({ text, hidden: hidden.has(index) })), answers, options: shuffled([...new Set([...answers, ...distractors])], quick.id) };
}

export function whoSaid(page, quick) {
  const bubble = findBubble(page, quick.bubbleId);
  return { text: bubble.text, answer: bubble.speaker, options: shuffled(quick.speakers, quick.id) };
}

// Returns true or false, or null for a prediction (nothing to get wrong).
export function checkQuick(quick, page, chapter, given) {
  if (quick.type === "predict") return null;
  if (quick.type === "who-said") return normalizeAnswer(given) === normalizeAnswer(whoSaid(page, quick).answer);
  const answers = fillBubble(page, quick, chapter).answers;
  const list = Array.isArray(given) ? given : [given];
  return answers.length === list.length && answers.every((word, index) => bareWord(list[index]) === word);
}

// ---- chapter questions ---------------------------------------------------------------------------------------------------
export const isTextAnswer = question => question.type === "detail";
export const isReviewed = question => question.type === "inference";

// Right, wrong, or null for a question the teacher reviews.
export function checkQuestion(question, given) {
  if (isReviewed(question)) return null;
  if (question.type === "detail") return isAnswerCorrect(String(given || ""), question.answers || [], { mode: "fuzzy" });
  return normalizeAnswer(given) === normalizeAnswer(question.answer);
}

// How well a long answer covers the rubric. Never blocks sending: it only says whether to nudge the student to write a little more.
export function rubricFeedback(text, rubric) {
  const words = wordCount(text); const lower = String(text || "").toLocaleLowerCase();
  const covered = rubric.groups.map(group => group.some(word => lower.includes(word.toLocaleLowerCase())));
  return { words, enough: words >= rubric.minWords, covered, missing: covered.filter(item => !item).length };
}

// ---- boss ------------------------------------------------------------------------------------------------------------------------
export const bossGameId = chapterId => `manga-boss-${String(chapterId).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`.slice(0, 60);

// The chapter's boss questions as a Phase 5 boss-battle game: multiple choice for gist and vocabulary, typed for detail.
export function bossGame(chapter) {
  const ids = chapter.boss ? chapter.boss.questionIds : [];
  const questions = ids.map(id => chapter.questions.find(question => question.id === id)).filter(Boolean).map(question => (question.type === "detail"
    ? { id: question.id, prompt: question.prompt, answer: question.answers[0], alternatives: question.answers.slice(1), kind: "typed", typed: true, mode: "fuzzy", topic: `Manga: ${chapter.title}` }
    : { id: question.id, prompt: question.prompt, answer: question.answer, options: question.options, kind: "choice", topic: `Manga: ${chapter.title}` }));
  return questions.length ? { id: bossGameId(chapter.id), type: "boss-battle", title: `Manga boss: ${chapter.title}`.slice(0, 80), questions } : null;
}

// ---- the saved record -----------------------------------------------------------------------------------------------------------
export const stars = accuracy => (accuracy >= 0.9 ? 3 : accuracy >= 0.7 ? 2 : 1);
const clamp = (value, max, min = 0) => Math.max(min, Math.min(max, Math.round(Number(value) || 0)));

// Combines this visit with the saved record. Pages and time only ever go up; a finished chapter keeps its best stars.
// `visit`: { pagesRead, pagesTotal, seconds, mode, words, quick:{score,total}, questions:{score,total}, boss:{score,total,won}|null, retell, finished }
export function chapterRecord(chapter, previous, visit, now = Date.now()) {
  const old = previous && typeof previous === "object" ? previous : {};
  const record = {
    title: chapter.title.slice(0, 80), lastAt: now, pagesTotal: chapter.pages.length,
    pagesRead: clamp(Math.max(visit.pagesRead, Number(old.pagesRead) || 0), chapter.pages.length),
    seconds: clamp((Number(old.seconds) || 0) + visit.seconds, 8640000), words: clamp(Math.max(visit.words || 0, Number(old.words) || 0), 500)
  };
  if (visit.mode) record.mode = visit.mode;
  if (old.completedAt) record.completedAt = old.completedAt;
  for (const key of ["quickScore", "quickTotal", "qScore", "qTotal", "bossScore", "bossTotal", "stars", "attempts"]) if (old[key] !== undefined) record[key] = old[key];
  if (old.bossWon !== undefined) record.bossWon = old.bossWon;
  if (old.retell !== undefined) record.retell = old.retell;
  if (visit.finished) {
    const score = visit.quick.score + visit.questions.score + (visit.boss ? visit.boss.score : 0);
    const total = visit.quick.total + visit.questions.total + (visit.boss ? visit.boss.total : 0);
    record.completedAt = now; record.attempts = clamp((Number(old.attempts) || 0) + 1, 100000, 1);
    record.quickScore = clamp(visit.quick.score, 500); record.quickTotal = clamp(visit.quick.total, 500);
    record.qScore = clamp(visit.questions.score, 500); record.qTotal = clamp(visit.questions.total, 500);
    record.stars = Math.max(Number(old.stars) || 0, stars(total ? score / total : 1));
  }
  if (visit.boss) { record.bossScore = clamp(visit.boss.score, 500); record.bossTotal = clamp(visit.boss.total, 500); record.bossWon = visit.boss.won === true || old.bossWon === true; }
  if (visit.retell) record.retell = true;
  return record;
}

// What goes to the shared reward loop when a chapter is finished: one "game" of every answer that has a right and a wrong.
export function rewardResult(visit, seconds) {
  const score = visit.quick.score + visit.questions.score; const total = visit.quick.total + visit.questions.total;
  return { score, total, seconds, mistakes: visit.mistakes || [] };
}
