const CEFR_LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);
const PANEL_IMAGE_PATTERN = /^assets\/manga\/[a-z0-9-]+\.svg$/i;

function isText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function getChecks(manga) {
  return manga.chapters.flatMap(chapter => chapter.checks);
}

export function validateManga(manga, { requireAnswers = true } = {}) {
  if (!manga || typeof manga !== "object" || Array.isArray(manga)) {
    throw new Error("Manga content must be a JSON object.");
  }
  if (manga.schemaVersion !== 1) throw new Error("Unsupported manga schema version.");
  if (!/^[a-z0-9][a-z0-9-]{1,59}$/i.test(String(manga.id || ""))) {
    throw new Error("Manga content needs a valid ID.");
  }
  if (!isText(manga.title) || !CEFR_LEVELS.has(manga.level)) {
    throw new Error("Manga content needs a title and CEFR level.");
  }
  if (!Array.isArray(manga.chapters) || manga.chapters.length === 0) {
    throw new Error("Manga content needs at least one chapter.");
  }

  const chapterIds = new Set();
  const allCheckIds = new Set();
  for (const chapter of manga.chapters) {
    if (!chapter || !/^[a-z0-9][a-z0-9-]{1,59}$/i.test(String(chapter.id || "")) ||
        chapterIds.has(chapter.id) || !isText(chapter.title) ||
        !Array.isArray(chapter.panels) || chapter.panels.length === 0 ||
        !Array.isArray(chapter.checks) || chapter.checks.length === 0) {
      throw new Error("Each manga chapter needs a unique ID, title, panels, and checks.");
    }
    chapterIds.add(chapter.id);
    const panelIds = new Set();
    for (const panel of chapter.panels) {
      if (!panel || !/^[a-z0-9][a-z0-9-]{1,59}$/i.test(String(panel.id || "")) ||
          panelIds.has(panel.id) || !PANEL_IMAGE_PATTERN.test(String(panel.imageUrl || "")) ||
          !isText(panel.alt) || !isText(panel.bubbleText) ||
          !isText(panel.simplifiedExplanation) || !Array.isArray(panel.vocabulary)) {
        throw new Error("Manga panels need unique IDs, local SVG art, alt text, and bubble text.");
      }
      panelIds.add(panel.id);
      for (const item of panel.vocabulary) {
        if (!item || !isText(item.word) || !isText(item.translation) ||
            !isText(item.definition) || item.word.length > 100 ||
            item.translation.length > 200 || item.definition.length > 300) {
          throw new Error("Manga vocabulary needs short words, translations, and definitions.");
        }
      }
    }
    const checkIds = new Set();
    for (const check of chapter.checks) {
      if (!check || !/^[a-z0-9][a-z0-9_-]{1,59}$/i.test(String(check.id || "")) ||
          checkIds.has(check.id) || allCheckIds.has(check.id) ||
          !["comprehension", "fill-bubble", "boss-quiz"].includes(check.type) ||
          !isText(check.prompt) || !Array.isArray(check.options) ||
          check.options.length < 2 ||
          check.options.some(option => !isText(option) || option.length > 160)) {
        throw new Error("Manga checks need unique IDs, a supported type, prompt, and answer options.");
      }
      if (!requireAnswers && Object.prototype.hasOwnProperty.call(check, "answer")) {
        throw new Error("Public manga drafts must not contain answer keys.");
      }
      if (requireAnswers && !isText(check.answer)) {
        throw new Error("Protected manga checks need a correct answer.");
      }
      if (isText(check.answer) && !check.options.includes(check.answer)) {
        throw new Error("Manga check options must include the correct answer.");
      }
      checkIds.add(check.id);
      allCheckIds.add(check.id);
    }
  }
  return manga;
}

export function addProtectedMangaAnswers(manga, answers) {
  validateManga(manga, { requireAnswers: false });
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    throw new Error(`Private answer keys are required for manga ${manga.id}.`);
  }
  const checks = getChecks(manga);
  const expectedIds = new Set(checks.map(check => check.id));
  const suppliedIds = Object.keys(answers);
  if (suppliedIds.length !== expectedIds.size ||
      suppliedIds.some(id => !expectedIds.has(id))) {
    throw new Error(`Private answer keys must match the checks in manga ${manga.id}.`);
  }
  const protectedManga = {
    ...manga,
    chapters: manga.chapters.map(chapter => ({
      ...chapter,
      checks: chapter.checks.map(check => ({
        ...check,
        answer: answers[check.id]
      }))
    }))
  };
  return validateManga(protectedManga);
}
