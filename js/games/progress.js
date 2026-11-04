import { applyGamification, updateReviewQueue } from "./engine.js";

const STUDENT_CODE_PATTERN = /^[A-Z0-9]{4,12}$/;

export function progressPath(code) {
  const normalizedCode = String(code || "").trim().toUpperCase();
  if (!STUDENT_CODE_PATTERN.test(normalizedCode)) {
    throw new Error("A verified student code is required to save game progress.");
  }
  return `studentProgress/${normalizedCode}`;
}

export async function saveGameProgress({ db, code, game, result, now = Date.now() }) {
  if (!db) throw new Error("Firebase Database is required.");
  const path = progressPath(code);
  const reference = db.ref(path);
  const attempt = {
    gameId: String(game.id),
    gameType: String(game.type),
    score: result.score,
    total: result.total,
    timeSpentSeconds: Math.max(0, Math.round(Number(result.timeSpentSeconds) || 0)),
    completedAt: new Date(now).toISOString()
  };
  const transaction = await reference.transaction(current => {
    const state = current && typeof current === "object" ? current : {};
    const next = applyGamification(state, result, now);
    const attempts = [...(Array.isArray(state.attempts) ? state.attempts : []), attempt].slice(-50);
    const queuedMistakes = game.id === "review-queue"
      ? updateReviewQueue(state.reviewQueue, result, now)
      : [...(Array.isArray(state.reviewQueue) ? state.reviewQueue : []), ...result.mistakes]
        .slice(-100);
    const topic = String(game.title || game.type);
    const topicStats = state.topics && typeof state.topics === "object" ? state.topics : {};
    const oldTopic = topicStats[topic] || { attempts: 0, score: 0, total: 0, timeSpentSeconds: 0 };
    return {
      ...next,
      reviewQueue: queuedMistakes,
      attempts,
      topics: {
        ...topicStats,
        [topic]: {
          attempts: (Number(oldTopic.attempts) || 0) + 1,
          score: (Number(oldTopic.score) || 0) + result.score,
          total: (Number(oldTopic.total) || 0) + result.total,
          timeSpentSeconds: (Number(oldTopic.timeSpentSeconds) || 0) + attempt.timeSpentSeconds
        }
      }
    };
  });
  if (!transaction.committed) throw new Error("Could not save game progress.");
  return transaction.snapshot.val();
}
