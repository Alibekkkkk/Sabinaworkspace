// Difficulty levels, auto-adaptation, round summary and the speaking (shadowing) comparison. Pure functions.
import { align, canonicalWord } from "./answers.js";
import { bareWord, tokenize } from "./schema.js";

export const LEVELS = Object.freeze(["easy", "medium", "hard", "expert"]);
export const LEVEL_LABELS = Object.freeze({ easy: "Easy", medium: "Medium", hard: "Hard", expert: "Expert" });
export const LEVEL_HELP = Object.freeze({
  easy: "1 or 2 words are hidden.", medium: "About half of the words are hidden.",
  hard: "Every word is typed from the audio.", expert: "Every word is typed, with no letter counts and no slow replay."
});
export const ROUND_SIZE = 10;
export const UP_AFTER = 3; // correct sentences in a row
export const DOWN_AFTER = 2; // wrong sentences in a row

export const canSlow = level => level !== "expert";
export const showLetterCount = level => level !== "expert";

// state: { level, correctRun, wrongRun }; sentenceCorrect: every hidden word right without help.
export function adaptLevel(state, sentenceCorrect) {
  let { level, correctRun, wrongRun } = state;
  correctRun = sentenceCorrect ? correctRun + 1 : 0;
  wrongRun = sentenceCorrect ? 0 : wrongRun + 1;
  let changed = null;
  let at = LEVELS.indexOf(level);
  if (correctRun >= UP_AFTER && at < LEVELS.length - 1) { at += 1; changed = "up"; correctRun = 0; wrongRun = 0; }
  else if (wrongRun >= DOWN_AFTER && at > 0) { at -= 1; changed = "down"; correctRun = 0; wrongRun = 0; }
  return { level: LEVELS[at], correctRun, wrongRun, changed };
}

// results: [{ itemId, level, gaps: [{ index, expected, ok, assisted }] }]
// A word counts only when it was right and no hint or reveal was used.
export function summarizeRound(results) {
  let gapsTotal = 0; let gapsCorrect = 0; let combo = 0; let bestCombo = 0;
  const missed = new Map();
  for (const result of results) {
    for (const gap of result.gaps) {
      gapsTotal += 1;
      if (gap.ok && !gap.assisted) { gapsCorrect += 1; combo += 1; bestCombo = Math.max(bestCombo, combo); }
      else { combo = 0; missed.set(gap.expected, (missed.get(gap.expected) || 0) + 1); }
    }
  }
  const accuracy = gapsTotal ? gapsCorrect / gapsTotal : 0;
  const stars = !gapsTotal ? 0 : accuracy >= 0.9 ? 3 : accuracy >= 0.7 ? 2 : 1;
  const hardestWords = [...missed.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([word]) => word);
  return { gapsTotal, gapsCorrect, accuracy, stars, hardestWords, bestCombo };
}

export const sentenceCorrect = result => result.gaps.length > 0 && result.gaps.every(gap => gap.ok && !gap.assisted);

// Practise-mistakes round: the sentences with a missed word, hiding only the missed words.
export function mistakeItems(results) {
  return results.filter(result => result.gaps.some(gap => !gap.ok || gap.assisted)).map(result => ({
    itemId: result.itemId,
    onlyGaps: result.gaps.filter(gap => !gap.ok || gap.assisted).map(gap => gap.index)
  }));
}

// ---- speaking (shadowing) ---------------------------------------------------------------------------------
// Coaching only: which words of the target were heard, which were missed. Never a grade.
export function compareSpoken(targetText, spokenText) {
  const target = tokenize(targetText).map(token => ({ shown: token, word: canonicalWord(bareWord(token)) })).filter(entry => entry.word);
  const spoken = tokenize(spokenText).map(token => canonicalWord(bareWord(token))).filter(Boolean);
  const ops = align(target.map(entry => entry.word), spoken);
  const words = []; const extra = [];
  let at = 0;
  for (const entry of ops) {
    if (entry.op === "extra") { extra.push(entry.b); continue; }
    words.push({ word: target[at].shown, status: entry.op === "match" ? "hit" : "miss" });
    at += 1;
  }
  const hits = words.filter(word => word.status === "hit").length;
  return { words, extra, hits, total: words.length, score: words.length ? Math.round((hits / words.length) * 100) : 0 };
}
