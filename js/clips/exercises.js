// Clip exercise logic: build what a student sees from a line, and grade what they did with the shared grader.
// Pure functions. Types: before-watch, gist, line-gap, dictation, order-lines, who-said, shadowing, grammar-spotter, production.
import { isAnswerCorrect } from "../grading.js";
import { seededShuffle } from "../games/seed.js";
import { bareWord, wordsOf } from "./lines.js";

const lineOf = (clip, id) => clip.transcript.find(line => line.id === id);

// ---- gap-fill on subtitles and dictation ----------------------------------------------------------------------------
// Words of the line with the hidden ones replaced by null (the screen draws a box there).
export function gapView(clip, exercise) {
  const words = wordsOf(lineOf(clip, exercise.lineId).text); const hide = new Set(exercise.hide || []);
  return words.map((word, index) => (hide.has(index) ? { gap: true, index, length: bareWord(word).length } : { gap: false, word }));
}
export const gapAnswers = (clip, exercise) => { const words = wordsOf(lineOf(clip, exercise.lineId).text); return (exercise.hide || []).map(i => bareWord(words[i])); };

export function gradeGaps(clip, exercise, typed) {
  const answers = gapAnswers(clip, exercise);
  const results = answers.map((answer, index) => isAnswerCorrect(String(typed[index] || ""), [answer], { mode: "exact" }));
  return { correct: results.every(Boolean), score: results.filter(Boolean).length, total: answers.length, results };
}

export function gradeDictation(clip, exercise, typed) {
  const line = lineOf(clip, exercise.lineId);
  const target = wordsOf(line.text).map(bareWord); const said = wordsOf(typed).map(bareWord);
  const results = target.map((word, index) => said[index] === word);
  const hits = results.filter(Boolean).length;
  return { correct: hits === target.length && said.length === target.length, score: hits, total: target.length, results, extra: Math.max(0, said.length - target.length) };
}

// ---- order the lines ---------------------------------------------------------------------------------------------------
export function orderView(exercise, seed) {
  const shuffled = seededShuffle(exercise.lineIds, `${seed}:${exercise.id}`);
  if (shuffled.every((id, i) => id === exercise.lineIds[i]) && shuffled.length > 1) shuffled.push(shuffled.shift()); // never start solved
  return shuffled;
}
export function gradeOrder(exercise, order) {
  const answer = exercise.answer || exercise.lineIds;
  const inPlace = answer.filter((id, i) => order[i] === id).length;
  return { correct: inPlace === answer.length && order.length === answer.length, score: inPlace, total: answer.length };
}
export function moveItem(list, from, to) { const next = [...list]; if (from < 0 || from >= next.length || to < 0 || to >= next.length) return next; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; }

// ---- who said it ---------------------------------------------------------------------------------------------------------
export function gradeWhoSaid(clip, exercise, choices) {
  const results = exercise.lineIds.map(id => (choices[id] || "") === lineOf(clip, id).speaker);
  return { correct: results.every(Boolean), score: results.filter(Boolean).length, total: results.length, results };
}

// ---- grammar spotter --------------------------------------------------------------------------------------------------------
export const spotKey = (lineId, wordIndex) => `${lineId}:${wordIndex}`;
export function gradeSpotter(exercise, picked) {
  const answer = new Set(exercise.answer || []); const chosen = new Set(picked);
  const hits = [...chosen].filter(key => answer.has(key)).length; const wrong = [...chosen].filter(key => !answer.has(key)).length;
  const missed = [...answer].filter(key => !chosen.has(key));
  return { correct: wrong === 0 && missed.length === 0, score: Math.max(0, hits - wrong), total: answer.size, hits, wrong, missed };
}

// ---- gist and before-you-watch ---------------------------------------------------------------------------------------------
export function gradeGist(exercise, option) { const ok = (exercise.answer || "") === option; return { correct: ok, score: ok ? 1 : 0, total: 1 }; }

// ---- production (written, reviewed by the teacher) ---------------------------------------------------------------------------
export function gradeProduction(exercise, response) {
  const count = wordsOf(response).length; const need = exercise.minWords || 10;
  return { correct: null, score: 0, total: 0, scored: false, words: count, enough: count >= need, needed: need };
}

// ---- one entry point -----------------------------------------------------------------------------------------------------------
// `response` shapes: gist: option; line-gap: string[]; dictation: string; order-lines: id[]; who-said: { lineId: speaker };
// grammar-spotter: string[] of lineId:wordIndex; production: string; shadowing: { heard, score } (coaching, never scored).
export function gradeExercise(clip, exercise, response) {
  switch (exercise.type) {
    case "gist": case "check-understanding": case "listen-pick": return gradeGist(exercise, response);
    case "gap-fill": { const ok = isAnswerCorrect(String(response || ""), [exercise.answer || ""], { mode: "fuzzy" }); return { correct: ok, score: ok ? 1 : 0, total: 1 }; }
    case "line-gap": return gradeGaps(clip, exercise, response || []);
    case "dictation": return gradeDictation(clip, exercise, response || "");
    case "order-lines": return gradeOrder(exercise, response || []);
    case "who-said": return gradeWhoSaid(clip, exercise, response || {});
    case "grammar-spotter": return gradeSpotter(exercise, response || []);
    case "production": return gradeProduction(exercise, response || "");
    case "shadowing": return { correct: null, score: 0, total: 0, scored: false };
    case "before-watch": return { correct: null, score: 0, total: 0, scored: false };
    default: return { correct: false, score: 0, total: 1 };
  }
}

// What a whole clip lesson was worth: only scored exercises count, each exercise's items sum.
export function summarise(clip, responses) {
  let score = 0; let total = 0; const mistakes = []; let pending = 0; const missedLines = new Set();
  for (const exercise of clip.exercises || []) {
    if (!(exercise.id in responses)) continue;
    const result = gradeExercise(clip, exercise, responses[exercise.id]);
    if (result.scored === false) { if (exercise.type === "production") pending += 1; continue; }
    score += result.score; total += result.total;
    if (!result.correct) for (const id of linesOf(exercise)) missedLines.add(id);
    if (!result.correct) mistakes.push({ itemId: `${clip.id}:${exercise.id}`, prompt: exercise.prompt.slice(0, 300), answer: describeAnswer(clip, exercise).slice(0, 300), topic: `Clip: ${clip.title}`.slice(0, 80) });
  }
  return { score, total, mistakes, pending, missedLines: [...missedLines] };
}

// The transcript lines an exercise was about (so the teacher can see which lines a student struggled with).
export function linesOf(exercise) {
  if (exercise.lineId) return [exercise.lineId];
  if (Array.isArray(exercise.lineIds)) return exercise.lineIds;
  return [];
}

// What the student's record of a clip holds: bounded and safe to store.
export function completionRecord(clip, summary, previous, now, seconds) {
  const total = Math.max(1, summary.total); const score = summary.total ? summary.score : 1;
  const accuracy = score / total; const stars = accuracy >= 0.9 ? 3 : accuracy >= 0.7 ? 2 : 1;
  const best = previous && Number.isFinite(previous.stars) ? Math.max(previous.stars, stars) : stars;
  return { title: String(clip.title).slice(0, 80), completedAt: now, score, total, stars: best, lastStars: stars, attempts: (previous && previous.attempts ? previous.attempts : 0) + 1, seconds: Math.max(0, Math.min(86400, Math.round(seconds + (previous && previous.seconds ? previous.seconds : 0)))), weakLines: summary.missedLines.slice(0, 8), interactive: clip.timingVerified === true };
}

export function describeAnswer(clip, exercise) {
  if (exercise.type === "gist" || exercise.type === "gap-fill" || exercise.type === "listen-pick") return String(exercise.answer || "");
  if (exercise.type === "line-gap") return gapAnswers(clip, exercise).join(", ");
  if (exercise.type === "dictation") return lineOf(clip, exercise.lineId).text;
  if (exercise.type === "order-lines") return (exercise.answer || exercise.lineIds).map(id => lineOf(clip, id).text).join(" / ");
  if (exercise.type === "who-said") return exercise.lineIds.map(id => `${lineOf(clip, id).speaker}`).join(", ");
  if (exercise.type === "grammar-spotter") return (exercise.answer || []).join(", ");
  return String(exercise.answer || "");
}

// Authoring helpers: exercises made straight from the lines, so a teacher does not write them by hand.
export function suggestHide(text) { // blank out the longer content words, at most three
  const words = wordsOf(text); const stop = new Set(["the", "a", "an", "and", "but", "or", "of", "to", "in", "on", "at", "is", "are", "was", "were", "it", "he", "she", "they", "we", "you", "i", "that", "this", "with", "for", "as", "be", "have", "has", "had", "do", "does", "did"]);
  const scored = words.map((word, index) => ({ index, size: bareWord(word).length, keep: stop.has(bareWord(word)) })).filter(entry => !entry.keep && entry.size >= 4);
  return scored.sort((a, b) => b.size - a.size).slice(0, 3).map(entry => entry.index).sort((a, b) => a - b);
}
export function autoExercises(clip) {
  const out = []; const lines = clip.transcript;
  if (lines.length) { const first = lines.find(line => suggestHide(line.text).length) || lines[0]; out.push({ id: "gap-1", type: "line-gap", prompt: "Type the missing words from this line.", lineId: first.id, hide: suggestHide(first.text) }); }
  if (lines.length > 1) { const line = lines[Math.floor(lines.length / 2)]; out.push({ id: "dictation-1", type: "dictation", prompt: "Listen to the line and type what you hear.", lineId: line.id }); }
  if (lines.length >= 3) { const ids = lines.slice(0, Math.min(5, lines.length)).map(line => line.id); out.push({ id: "order-1", type: "order-lines", prompt: "Put these lines in the order you hear them.", lineIds: ids, answer: ids }); }
  const speakers = [...new Set(lines.map(line => line.speaker).filter(Boolean))];
  if (speakers.length >= 2) out.push({ id: "who-1", type: "who-said", prompt: "Who said each line?", lineIds: lines.filter(line => line.speaker).slice(0, 4).map(line => line.id), speakers });
  if (lines.length) out.push({ id: "shadow-1", type: "shadowing", prompt: "Say this line after the video.", lineId: lines[0].id });
  out.push({ id: "produce-1", type: "production", prompt: "Write two or three sentences about the clip.", minWords: 20 });
  return out;
}
