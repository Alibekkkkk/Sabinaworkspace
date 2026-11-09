// Teacher view of a student's listening practice, built from data the trainer already saves:
//   studentProgress/<code>/attempts      (rounds, gameType "listening": score, total, time, completedAt)
//   studentProgress/<code>/reviewQueue   (missed words, topic "Listening", prompt = masked sentence, answer = the word)
//   studentProgress/<code>/listening     ({ sentenceId: { attempts, bestAccuracy, lastAt } })
// Pure functions: no DOM, no Firebase.
export const LISTENING_TOPIC = "Listening";
export const WEAK_BELOW = 0.7; // a sentence whose best accuracy is below this still needs work
export const TREND_ROUNDS = 12;

const list = value => (Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : []);
const finite = value => (Number.isFinite(Number(value)) ? Number(value) : 0);

export function listeningAttempts(progress) {
  return list(progress && progress.attempts)
    .filter(attempt => attempt && attempt.gameType === "listening" && finite(attempt.total) > 0)
    .sort((a, b) => Date.parse(a.completedAt || 0) - Date.parse(b.completedAt || 0));
}

// Accuracy of the most recent rounds, oldest to newest, and whether the student is improving.
export function accuracyTrend(progress, rounds = TREND_ROUNDS) {
  const recent = listeningAttempts(progress).slice(-rounds);
  const values = recent.map(attempt => Math.min(1, finite(attempt.score) / finite(attempt.total)));
  let direction = "flat";
  if (values.length >= 4) {
    const half = Math.floor(values.length / 2);
    const mean = part => part.reduce((sum, value) => sum + value, 0) / part.length;
    const change = mean(values.slice(-half)) - mean(values.slice(0, half));
    direction = change >= 0.05 ? "up" : change <= -0.05 ? "down" : "flat";
  }
  return { values, direction };
}

// Missed words, most often missed first, each with the masked sentence it was missed in.
export function weakWords(progress, limit = 8) {
  const counts = new Map();
  for (const entry of list(progress && progress.reviewQueue)) {
    if (!entry || entry.topic !== LISTENING_TOPIC || typeof entry.answer !== "string") continue;
    const word = entry.answer.trim().toLowerCase();
    if (!word) continue;
    const known = counts.get(word) || { word, count: 0, example: "" };
    known.count += 1;
    if (!known.example && typeof entry.prompt === "string") known.example = entry.prompt.replace(/^Listen and type the missing word:\s*/i, "");
    counts.set(word, known);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word)).slice(0, limit);
}

// Sentences below WEAK_BELOW best accuracy, weakest first. texts: Map(sentenceId -> sentence) when known.
export function weakSentences(progress, texts = new Map(), limit = 5) {
  return Object.entries((progress && progress.listening) || {})
    .filter(([, entry]) => entry && finite(entry.attempts) > 0 && finite(entry.bestAccuracy) < WEAK_BELOW)
    .map(([id, entry]) => ({ id, text: texts.get(id) || "", attempts: finite(entry.attempts), bestAccuracy: finite(entry.bestAccuracy), lastAt: finite(entry.lastAt) }))
    .sort((a, b) => a.bestAccuracy - b.bestAccuracy || b.attempts - a.attempts || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export function summarizeListening(progress, texts = new Map()) {
  const attempts = listeningAttempts(progress);
  const totalScore = attempts.reduce((sum, attempt) => sum + finite(attempt.score), 0);
  const totalWords = attempts.reduce((sum, attempt) => sum + finite(attempt.total), 0);
  const seconds = attempts.reduce((sum, attempt) => sum + finite(attempt.timeSpentSeconds), 0);
  const sentences = Object.values((progress && progress.listening) || {}).filter(entry => entry && finite(entry.attempts) > 0);
  const last = attempts.length ? Date.parse(attempts[attempts.length - 1].completedAt) : 0;
  return {
    rounds: attempts.length,
    accuracy: totalWords ? totalScore / totalWords : 0,
    minutes: Math.round(seconds / 60),
    lastAt: Number.isFinite(last) ? last : 0,
    sentencesPracticed: sentences.length,
    sentencesMastered: sentences.filter(entry => finite(entry.bestAccuracy) >= 0.9).length,
    trend: accuracyTrend(progress),
    weakWords: weakWords(progress),
    weakSentences: weakSentences(progress, texts)
  };
}

export const TREND_TEXT = Object.freeze({ up: "Improving", down: "Slipping", flat: "Steady" });
