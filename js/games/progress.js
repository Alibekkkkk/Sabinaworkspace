import { updateReviewQueue } from "./engine.js";
import { applyRewards } from "./rewards.js";

const STUDENT_CODE_PATTERN = /^[A-Z0-9]{4,12}$/;
const MAP_KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_VOCABULARY_ENTRIES = 500;
const MAX_TOPIC_ENTRIES = 100;

function mapKey(value) {
  const key = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return MAP_KEY_PATTERN.test(key) ? key : "topic";
}

export function progressPath(code) {
  const normalizedCode = String(code || "").trim().toUpperCase();
  if (!STUDENT_CODE_PATTERN.test(normalizedCode)) {
    throw new Error("A verified student code is required to save game progress.");
  }
  return `studentProgress/${normalizedCode}`;
}

export async function saveGameProgress({ db, code, game, result, now = Date.now(), options = {} }) {
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
  let info = null;
  const transaction = await reference.transaction(current => {
    const state = current && typeof current === "object" ? current : {};
    const { _info, ...next } = applyRewards(state, { ...result, kind: result.kind || (game.id === "review-queue" ? "review" : (game.type === "listening-dictation" || game.type === "listening") ? "listening" : "game") }, now, options);
    info = _info;
    const attempts = [...(Array.isArray(state.attempts) ? state.attempts : []), attempt].slice(-50);
    const queuedMistakes = game.id === "review-queue"
      ? updateReviewQueue(state.reviewQueue, result, now)
      : [...(Array.isArray(state.reviewQueue) ? state.reviewQueue : []), ...result.mistakes]
        .slice(-100);
    const topicLabel = String(game.title || game.type).slice(0, 80);
    const topic = mapKey(topicLabel);
    const topicStats = {};
    for (const [oldKey, oldStats] of Object.entries(
      state.topics && typeof state.topics === "object" ? state.topics : {}
    )) {
      const safeStats = oldStats && typeof oldStats === "object" ? oldStats : {};
      const oldLabel = String(safeStats.label || oldKey).slice(0, 80);
      const safeKey = mapKey(oldLabel);
      const current = topicStats[safeKey] || {
        label: oldLabel,
        attempts: 0,
        score: 0,
        total: 0,
        timeSpentSeconds: 0,
        updatedAt: 0
      };
      topicStats[safeKey] = {
        label: oldLabel,
        attempts: current.attempts + (Number(safeStats.attempts) || 0),
        score: current.score + (Number(safeStats.score) || 0),
        total: current.total + (Number(safeStats.total) || 0),
        timeSpentSeconds: current.timeSpentSeconds + (Number(safeStats.timeSpentSeconds) || 0),
        updatedAt: Math.max(current.updatedAt, Number(safeStats.updatedAt) || 0)
      };
    }
    const oldTopic = topicStats[topic] || {
      label: topicLabel,
      attempts: 0,
      score: 0,
      total: 0,
      timeSpentSeconds: 0,
      updatedAt: 0
    };
    topicStats[topic] = {
      label: topicLabel,
      attempts: oldTopic.attempts + 1,
      score: oldTopic.score + result.score,
      total: oldTopic.total + result.total,
      timeSpentSeconds: oldTopic.timeSpentSeconds + attempt.timeSpentSeconds,
      updatedAt: now
    };
    const boundedTopics = Object.fromEntries(
      Object.entries(topicStats)
        .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
        .slice(0, MAX_TOPIC_ENTRIES)
    );
    return {
      ...state, // keep what other pages own (vocabulary, listening, avatar, placement)
      ...next,
      // The placement result is owned by the placement page and teacher; never drop it here.
      ...(state.placement ? { placement: state.placement } : {}),
      reviewQueue: queuedMistakes,
      attempts,
      topics: boundedTopics
    };
  });
  if (!transaction.committed) throw new Error("Could not save game progress.");
  return Object.assign(transaction.snapshot.val(), { _info: info });
}

export async function saveVocabularyWord({ db, code, key, entry }) {
  if (!db) throw new Error("Firebase Database is required.");
  const normalizedCode = String(code || "").trim().toUpperCase();
  if (!STUDENT_CODE_PATTERN.test(normalizedCode)) {
    throw new Error("A verified student code is required to save vocabulary.");
  }
  if (!MAP_KEY_PATTERN.test(String(key || ""))) {
    throw new Error("A valid vocabulary key is required.");
  }
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error("A vocabulary record is required.");
  }

  const vocabularyRef = db.ref(`studentProgress/${normalizedCode}/vocabulary`);
  const transaction = await vocabularyRef.transaction(current => {
    const words = current && typeof current === "object" && !Array.isArray(current)
      ? current
      : {};
    if (words[key]) return words;
    if (Object.keys(words).length >= MAX_VOCABULARY_ENTRIES) return;
    return { ...words, [key]: entry };
  });
  if (!transaction.committed) {
    throw new Error("Your vocabulary deck is full; remove a saved word before adding another.");
  }
  return transaction.snapshot.val();
}

// Gems buy looks. The purchase is a transaction so two tabs cannot spend the same gems twice.
export async function shopAction({ db, code, itemId, action }) {
  const { buyItem, equipItem } = await import("./rewards.js");
  const reference = db.ref(progressPath(code));
  let outcome = { ok: false, reason: "unknown" };
  const transaction = await reference.transaction(current => {
    const state = current && typeof current === "object" ? current : null;
    if (!state) return current;
    const result = action === "equip" ? equipItem(state, itemId) : buyItem(state, itemId);
    outcome = result;
    return result.ok ? result.state : undefined;
  });
  if (!transaction.committed) return outcome.ok ? { ok: false, reason: "retry" } : outcome;
  return { ok: true, state: transaction.snapshot.val() };
}
