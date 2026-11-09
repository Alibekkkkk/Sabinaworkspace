// Manga content format v2: pages with panels and speech bubbles, credits and rights, reading direction, pre-reading words,
// comprehension questions and a chapter boss. validateMangaV2 throws one helpful Error for the first thing that is wrong;
// mangaWarnings lists softer problems. Pure functions.
import { bboxInside, bboxWithin } from "./geometry.js";

export const RIGHTS = Object.freeze(["original", "CC-BY", "public-domain", "licensed-link"]);
export const DIRECTIONS = Object.freeze(["ltr", "rtl", "vertical"]);
export const BUBBLE_TYPES = Object.freeze(["speech", "thought", "narration", "sfx"]);
export const QUESTION_TYPES = Object.freeze(["gist", "detail", "inference", "vocab"]);
export const QUICK_TYPES = Object.freeze(["fill-bubble", "who-said", "predict"]);
// Images must be local files under assets/manga, unless the exact host is listed here (empty on purpose).
export const ALLOWED_IMAGE_HOSTS = Object.freeze([]);
export const MAX_PAGE_IMAGE_BYTES = 250 * 1024;
const LOCAL_IMAGE = /^assets\/manga\/[a-z0-9][a-z0-9-]*\.(svg|webp|avif|png|jpe?g)$/i;
const ID = /^[a-z0-9][a-z0-9_-]{0,59}$/i;
const CEFR = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);
const text = value => typeof value === "string" && value.trim().length > 0;
const fail = message => { throw new Error(message); };
const SECRET_QUESTION = ["gist", "vocab", "detail"];

export function imageAllowed(url) {
  if (LOCAL_IMAGE.test(String(url || ""))) return true;
  try { const parsed = new URL(url); return parsed.protocol === "https:" && ALLOWED_IMAGE_HOSTS.includes(parsed.hostname); } catch (error) { return false; }
}

function checkVocabulary(list, where) {
  if (!Array.isArray(list)) fail(`${where}: vocabulary must be a list.`);
  for (const item of list) if (!item || !text(item.word) || item.word.length > 100 || !text(item.meaning) || item.meaning.length > 300 || (item.translation !== undefined && (!text(item.translation) || item.translation.length > 200)) || (item.example !== undefined && (!text(item.example) || item.example.length > 300))) fail(`${where}: vocabulary entries need a short word and a meaning.`);
}

function checkBubble(bubble, panel, where, ids) {
  if (!bubble || !ID.test(String(bubble.id || "")) || ids.has(bubble.id)) fail(`${where}: bubbles need unique ids.`);
  ids.add(bubble.id);
  const label = `${where} bubble ${bubble.id}`;
  if (!BUBBLE_TYPES.includes(bubble.type)) fail(`${label}: type must be one of ${BUBBLE_TYPES.join(", ")}.`);
  if (!text(bubble.text) || bubble.text.length > 300) fail(`${label}: needs text (at most 300 characters).`);
  if (!text(bubble.simplified) || bubble.simplified.length > 300) fail(`${label}: needs a simplified English version.`);
  if (bubble.translation !== undefined && (!text(bubble.translation) || bubble.translation.length > 300)) fail(`${label}: translation must be text.`);
  if (bubble.speaker !== undefined && (!text(bubble.speaker) || bubble.speaker.length > 40)) fail(`${label}: speaker must be a short name.`);
  if (bubble.grammarNote !== undefined && (!text(bubble.grammarNote) || bubble.grammarNote.length > 300)) fail(`${label}: grammarNote must be text.`);
  if (bubble.audio !== undefined && !/^assets\/manga\/audio\/[a-z0-9-]+\.(mp3|ogg|m4a)$/i.test(String(bubble.audio))) fail(`${label}: audio must be a local file under assets/manga/audio.`);
  if (!bboxWithin(bubble.at, panel.bbox)) fail(`${label}: its position [x, y, width, height] must sit inside its panel.`);
  checkVocabulary(bubble.vocabulary || [], label);
}

export function validateMangaV2(manga, { requireAnswers = true } = {}) {
  if (!manga || typeof manga !== "object" || Array.isArray(manga)) fail("Manga content must be a JSON object.");
  if (manga.schemaVersion !== 2) fail("This is not a version 2 manga file (schemaVersion must be 2).");
  if (!ID.test(String(manga.id || ""))) fail("Manga needs a valid id.");
  if (!text(manga.title) || manga.title.length > 100) fail("Manga needs a title.");
  if (!CEFR.has(manga.level)) fail("Manga level must be a CEFR level.");
  if (!Array.isArray(manga.genre) || !manga.genre.length || manga.genre.some(g => !text(g))) fail("Manga needs at least one genre.");
  const credits = manga.credits;
  if (!credits || typeof credits !== "object") fail("Manga needs a credits block (author, artist, licence, rights).");
  if (!text(credits.author) || !text(credits.artist) || !text(credits.licence)) fail("Credits need an author, an artist and a licence.");
  if (!RIGHTS.includes(credits.rights)) fail(`Credits rights must be one of: ${RIGHTS.join(", ")}.`);
  if (credits.rights !== "original" && !/^https:\/\//.test(String(credits.sourceUrl || ""))) fail("Anything that is not original needs the https address of its source in credits.sourceUrl.");
  if (!DIRECTIONS.includes(manga.readingDirection)) fail(`readingDirection must be one of: ${DIRECTIONS.join(", ")}.`);
  if (!Array.isArray(manga.chapters) || !manga.chapters.length) fail("Manga needs at least one chapter.");
  const chapterIds = new Set(); const allBubbles = new Set(); const allQuestions = new Set();
  for (const chapter of manga.chapters) {
    if (!chapter || !ID.test(String(chapter.id || "")) || chapterIds.has(chapter.id)) fail("Chapters need unique ids.");
    chapterIds.add(chapter.id);
    const where = `Chapter ${chapter.id}`;
    if (!text(chapter.title) || !text(chapter.summary)) fail(`${where}: needs a title and a summary.`);
    if (!Number.isInteger(chapter.estimatedMinutes) || chapter.estimatedMinutes < 1 || chapter.estimatedMinutes > 120) fail(`${where}: estimatedMinutes must be 1 to 120.`);
    checkVocabulary(chapter.vocabulary || [], where);
    if (!Array.isArray(chapter.pages) || !chapter.pages.length) fail(`${where}: needs at least one page.`);
    const pageIds = new Set(); const panelIds = new Set(); const bubbleIds = new Set(); const bubbleSpeakers = new Map();
    for (const page of chapter.pages) {
      if (!page || !ID.test(String(page.id || "")) || pageIds.has(page.id)) fail(`${where}: pages need unique ids.`);
      pageIds.add(page.id); const pageWhere = `${where} page ${page.id}`;
      if (!imageAllowed(page.image)) fail(`${pageWhere}: the image must be a local file under assets/manga (svg, webp, avif, png or jpg), or come from an allowed host.`);
      if (!text(page.alt) || page.alt.length > 300) fail(`${pageWhere}: needs alt text that describes the page.`);
      if (!Number.isInteger(page.width) || !Number.isInteger(page.height) || page.width < 100 || page.height < 100 || page.width > 8000 || page.height > 12000) fail(`${pageWhere}: needs the image width and height in pixels.`);
      if (!Array.isArray(page.panels) || !page.panels.length) fail(`${pageWhere}: needs at least one panel.`);
      for (const panel of page.panels) {
        if (!panel || !ID.test(String(panel.id || "")) || panelIds.has(panel.id)) fail(`${pageWhere}: panels need unique ids.`);
        panelIds.add(panel.id); const panelWhere = `${pageWhere} panel ${panel.id}`;
        if (!bboxInside(panel.bbox, page.width, page.height)) fail(`${panelWhere}: the panel box [x, y, width, height] must sit inside the image (${page.width} x ${page.height}).`);
        if (!text(panel.summary) || panel.summary.length > 300) fail(`${panelWhere}: needs a summary for screen readers.`);
        if (!Array.isArray(panel.bubbles)) fail(`${panelWhere}: bubbles must be a list.`);
        for (const bubble of panel.bubbles) { checkBubble(bubble, panel, panelWhere, bubbleIds); bubbleSpeakers.set(bubble.id, bubble.speaker); allBubbles.add(`${chapter.id}/${bubble.id}`); }
      }
      if (page.quick !== undefined) {
        const quick = page.quick; const quickWhere = `${pageWhere} quick question`;
        if (!quick || !ID.test(String(quick.id || "")) || !QUICK_TYPES.includes(quick.type) || !text(quick.prompt)) fail(`${quickWhere} needs an id, a type (${QUICK_TYPES.join(", ")}) and a prompt.`);
        if (quick.type === "fill-bubble") {
          const bubble = page.panels.flatMap(panel => panel.bubbles).find(item => item.id === quick.bubbleId);
          if (!bubble) fail(`${quickWhere}: bubbleId "${quick.bubbleId}" is not a bubble on this page.`);
          const words = bubble.text.split(/\s+/);
          if (!Array.isArray(quick.hide) || !quick.hide.length || quick.hide.some(i => !Number.isInteger(i) || i < 0 || i >= words.length)) fail(`${quickWhere}: hide must list word positions inside the bubble.`);
        } else if (quick.type === "who-said") {
          const bubble = page.panels.flatMap(panel => panel.bubbles).find(item => item.id === quick.bubbleId);
          if (!bubble || !bubble.speaker) fail(`${quickWhere}: bubbleId must be a bubble on this page that has a speaker.`);
          if (!Array.isArray(quick.speakers) || quick.speakers.length < 2 || !quick.speakers.includes(bubble.speaker)) fail(`${quickWhere}: speakers must list at least two names, including the real speaker.`);
        } else if (!Array.isArray(quick.options) || quick.options.length < 2 || quick.options.some(option => !text(option))) fail(`${quickWhere}: predictions need at least two options.`);
      }
    }
    if (!Array.isArray(chapter.questions) || !chapter.questions.length) fail(`${where}: needs comprehension questions.`);
    const questionIds = new Set();
    for (const question of chapter.questions) {
      if (!question || !ID.test(String(question.id || "")) || questionIds.has(question.id) || allQuestions.has(question.id)) fail(`${where}: questions need unique ids.`);
      questionIds.add(question.id); allQuestions.add(question.id); const qWhere = `${where} question ${question.id}`;
      if (!QUESTION_TYPES.includes(question.type)) fail(`${qWhere}: type must be one of ${QUESTION_TYPES.join(", ")}.`);
      if (!text(question.prompt)) fail(`${qWhere}: needs a prompt.`);
      if (question.bubbleId !== undefined && !bubbleIds.has(question.bubbleId)) fail(`${qWhere}: bubbleId "${question.bubbleId}" is not a bubble of this chapter.`);
      if (question.panelId !== undefined && !panelIds.has(question.panelId)) fail(`${qWhere}: panelId "${question.panelId}" is not a panel of this chapter.`);
      if (!requireAnswers && (Object.hasOwn(question, "answer") || Object.hasOwn(question, "answers") || Object.hasOwn(question, "sample"))) fail(`${qWhere}: public drafts must not contain answer keys.`);
      if (question.type === "gist" || question.type === "vocab") {
        if (!Array.isArray(question.options) || question.options.length < 2 || question.options.some(option => !text(option) || option.length > 160)) fail(`${qWhere}: needs at least two options.`);
        if (question.answer !== undefined && !question.options.includes(question.answer)) fail(`${qWhere}: the answer must be one of the options.`);
      }
      if (question.type === "inference") {
        const rubric = question.rubric;
        if (!rubric || !Number.isInteger(rubric.minWords) || rubric.minWords < 3 || rubric.minWords > 200 || !Array.isArray(rubric.groups) || !rubric.groups.length || rubric.groups.some(group => !Array.isArray(group) || !group.length || group.some(word => !text(word)))) fail(`${qWhere}: an inference question needs a rubric with minWords and keyword groups.`);
      }
      const secret = SECRET_QUESTION.includes(question.type);
      const keyField = question.type === "detail" ? "answers" : "answer";
      if (requireAnswers && secret && question[keyField] === undefined) fail(`${qWhere} needs its answer key.`);
      if (question.type === "detail" && question.answers !== undefined && (!Array.isArray(question.answers) || !question.answers.length || question.answers.some(answer => !text(answer)))) fail(`${qWhere}: answers must be a list of accepted answers.`);
    }
    if (chapter.boss !== undefined) {
      const ids = chapter.boss && chapter.boss.questionIds;
      if (!Array.isArray(ids) || ids.length < 3 || ids.some(id => !questionIds.has(id) || ["inference"].includes(chapter.questions.find(q => q.id === id).type))) fail(`${where}: the boss needs at least three questionIds that exist and are not inference questions.`);
    }
    if (chapter.retell !== undefined && (!text(chapter.retell.prompt) || !Number.isInteger(chapter.retell.minWords) || chapter.retell.minWords < 5 || chapter.retell.minWords > 200)) fail(`${where}: retell needs a prompt and minWords from 5 to 200.`);
  }
  return manga;
}

export function secretQuestions(manga) { return manga.chapters.flatMap(chapter => chapter.questions.filter(question => SECRET_QUESTION.includes(question.type))); }

export function addProtectedAnswersV2(manga, answers) {
  validateMangaV2(manga, { requireAnswers: false });
  const secret = secretQuestions(manga); const expected = new Set(secret.map(question => question.id));
  if ((!answers || typeof answers !== "object" || Array.isArray(answers)) && expected.size) fail(`Private answer keys are required for manga ${manga.id}.`);
  const supplied = Object.keys(answers || {});
  if (supplied.length !== expected.size || supplied.some(id => !expected.has(id))) fail(`Private answer keys must match the questions that need one in manga ${manga.id}: ${[...expected].join(", ") || "none"}.`);
  return validateMangaV2({ ...manga, chapters: manga.chapters.map(chapter => ({ ...chapter, questions: chapter.questions.map(question => (expected.has(question.id) ? { ...question, [question.type === "detail" ? "answers" : "answer"]: answers[question.id] } : question)) })) });
}

export function stripAnswers(manga) {
  return { ...manga, chapters: manga.chapters.map(chapter => ({ ...chapter, questions: chapter.questions.map(({ answer, answers, sample, ...rest }) => { void answer; void answers; void sample; return rest; }) })) };
}

export function mangaWarnings(manga) {
  const warnings = [];
  for (const chapter of manga.chapters) {
    const words = (chapter.vocabulary || []).length;
    if (words < 6 || words > 8) warnings.push(`Chapter "${chapter.title}": pre-reading works best with 6 to 8 words (it has ${words}).`);
    const types = new Set(chapter.questions.map(question => question.type));
    if (types.size < 3) warnings.push(`Chapter "${chapter.title}": use at least three kinds of question (gist, detail, inference, vocabulary).`);
    if (!chapter.boss) warnings.push(`Chapter "${chapter.title}": add a boss quiz.`);
    if (!chapter.retell) warnings.push(`Chapter "${chapter.title}": add a retell task for the teacher to review.`);
  }
  if (manga.credits.rights === "original" && !/original|teacher|written/i.test(manga.credits.licence)) warnings.push("Say in the licence that the story and art are original.");
  return warnings;
}

// Convert a version 1 story (one image and one bubble per panel) to version 2: each old panel becomes a page.
export function migrateV1(manga) {
  return {
    schemaVersion: 2, id: manga.id, title: manga.title, level: manga.level, genre: ["slice-of-life"],
    credits: { author: "Teacher", artist: "Placeholder art made for this demo", licence: "Original teacher-written text with simple placeholder artwork", rights: "original" },
    readingDirection: "ltr",
    chapters: manga.chapters.map(chapter => ({
      id: chapter.id, title: chapter.title, summary: chapter.title, estimatedMinutes: 5,
      vocabulary: chapter.panels.flatMap(panel => panel.vocabulary.map(item => ({ word: item.word, meaning: item.definition, translation: item.translation }))).slice(0, 8),
      pages: chapter.panels.map(panel => ({ id: panel.id, image: panel.imageUrl, width: 900, height: 600, alt: panel.alt, panels: [{ id: `${panel.id}-panel`, bbox: [0, 0, 900, 600], summary: panel.alt, bubbles: [{ id: `${panel.id}-bubble`, type: "speech", text: panel.bubbleText, simplified: panel.simplifiedExplanation, at: [40, 30, 560, 130], vocabulary: panel.vocabulary.map(item => ({ word: item.word, meaning: item.definition, translation: item.translation })) }] }] })),
      questions: chapter.checks.map(check => (check.type === "boss-quiz" || check.type === "comprehension" ? { id: check.id, type: "gist", prompt: check.prompt, options: check.options, ...(check.answer ? { answer: check.answer } : {}) } : { id: check.id, type: "vocab", prompt: check.prompt, options: check.options, ...(check.answer ? { answer: check.answer } : {}) }))
    }))
  };
}
