// Adaptation selector: how much help a story gets for a student, from the story's level, the student's level and how the
// last chapters went. Pure and documented in docs/MANGA.md, so the rules can be tested and changed in one place.
export const CEFR = Object.freeze(["A1", "A2", "B1", "B2", "C1", "C2"]);
const rank = level => { const index = CEFR.indexOf(String(level || "").toUpperCase()); return index < 0 ? -1 : index; };

// Input: { storyLevel, studentLevel, accuracy (0..1 over the last chapters, or null), fullWords (0..1 of pre-reading words already known, or null) }
// Output: what the reader should do by default. The student can always change the aids themselves.
export function chooseAdaptation({ storyLevel, studentLevel, accuracy = null, fullWords = null } = {}) {
  const gap = rank(storyLevel) >= 0 && rank(studentLevel) >= 0 ? rank(storyLevel) - rank(studentLevel) : 0; // above zero: the story is harder
  const weak = typeof accuracy === "number" && accuracy < 0.6;
  const strong = typeof accuracy === "number" && accuracy >= 0.85;
  const unknownWords = typeof fullWords === "number" && fullWords < 0.5;
  // Simplified text first when the story is above the student or the last chapters went badly.
  const simplifiedFirst = gap >= 1 || (gap === 0 && weak) || (gap === 0 && unknownWords);
  const preReadingWords = gap >= 1 || weak || unknownWords ? 8 : gap === 0 ? 7 : 6;
  const showTranslationButton = gap >= 0 || weak; // the translation is still off until the student asks
  const hintsAfterWrong = gap >= 1 || weak ? 1 : 2; // wrong tries before a hint is offered
  let next = "same";
  if (strong && gap <= 0) next = "harder";
  else if (weak && gap >= 0) next = "easier";
  const reason = gap >= 1 ? "This story is above the student's level, so the simpler wording comes first."
    : weak ? "The last chapters were hard, so the simpler wording comes first."
    : unknownWords ? "Many of the new words are unfamiliar, so the simpler wording comes first."
    : gap < 0 ? "This story is below the student's level, so the original wording comes first and help is lighter."
    : "This story matches the student's level, so the original wording comes first.";
  return { simplifiedFirst, preReadingWords, showTranslationButton, hintsAfterWrong, next, reason, gap };
}

// Accuracy over the last few finished chapters: { score, total } records, newest last. Null when there is nothing yet.
export function recentAccuracy(records, count = 3) {
  const used = (Array.isArray(records) ? records : []).filter(record => record && Number(record.total) > 0).slice(-count);
  if (!used.length) return null;
  const total = used.reduce((sum, record) => sum + record.total, 0);
  return used.reduce((sum, record) => sum + Math.min(record.score, record.total), 0) / total;
}
