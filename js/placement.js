// Informal adaptive placement check. Pure functions only: the page supplies the item bank and
// renders the UI. The result is a rough study guide, not a CEFR certificate.
import { isAnswerCorrect } from "./grading.js";

export const PLACEMENT_LEVELS = ["A1", "A2", "B1", "B2", "C1"];
export const START_LEVEL_INDEX = 1; // A2
export const MIN_ITEMS = 18;
export const MAX_ITEMS = 30;
export const CONFIDENCE_TO_STOP = 0.8;
export const RETAKE_WAIT_MS = 7 * 24 * 60 * 60 * 1000;
const PASS_ACCURACY = 0.6;

const LEVEL_GUIDANCE = {
  A1: "Start with everyday words, basic sentence patterns and present-tense practice.",
  A2: "Build confidence with common situations, past events and practical vocabulary.",
  B1: "Practise longer explanations, connected ideas and a wider range of grammar.",
  B2: "Work on precision, complex sentence patterns and natural vocabulary.",
  C1: "Refine nuance, register and advanced structures such as inversion and participle clauses."
};

const TAG_LABELS = {
  greetings: "Greetings", "be-verbs": "The verb be", "present-simple": "Present simple", "there-is-are": "There is / there are",
  "word-order": "Word order", listening: "Listening", articles: "Articles", "past-simple": "Past simple", comparatives: "Comparatives",
  prepositions: "Prepositions", "future-forms": "Future forms", quantifiers: "Much / many", "present-continuous": "Present continuous",
  modals: "Modal verbs", "present-perfect": "Present perfect", conditionals: "Conditionals", passive: "Passive voice",
  questions: "Question forms", "relative-clauses": "Relative clauses", "phrasal-verbs": "Phrasal verbs", "used-to": "Used to",
  "reported-speech": "Reported speech", "past-perfect": "Past perfect", "gerunds-infinitives": "Gerunds and infinitives",
  inversion: "Inversion", "word-formation": "Word formation", "wish-and-subjunctive": "Wish and subjunctive",
  "participle-clauses": "Participle clauses", "cleft-sentences": "Cleft sentences", vocabulary: "Vocabulary"
};

export function tagLabel(tag) {
  return TAG_LABELS[tag] || String(tag).replace(/-/g, " ");
}

// ---- item bank validation -------------------------------------------------------------------

function validateChoice(item, where, errors) {
  if (!Array.isArray(item.options) || item.options.length < 2 || item.options.length > 4 ||
      item.options.some(option => typeof option !== "string" || !option)) {
    errors.push(`${where}: options must be 2-4 non-empty strings.`);
  } else if (!Number.isInteger(item.answer) || item.answer < 0 || item.answer >= item.options.length) {
    errors.push(`${where}: answer must be a valid option index.`);
  }
}

export function validatePlacementItems(bank) {
  const errors = [];
  const items = bank && Array.isArray(bank.items) ? bank.items : null;
  if (!items) return { valid: false, errors: ["The bank must be an object with an `items` array."] };
  const seen = new Set();
  items.forEach((item, index) => {
    const where = `item ${index + 1}${item && item.id ? ` (${item.id})` : ""}`;
    if (!item || typeof item !== "object") { errors.push(`${where}: must be an object.`); return; }
    if (typeof item.id !== "string" || !/^[a-z0-9-]{3,40}$/.test(item.id)) errors.push(`${where}: id must be 3-40 characters of a-z, 0-9 and "-".`);
    else if (seen.has(item.id)) errors.push(`${where}: duplicate id.`);
    else seen.add(item.id);
    if (!PLACEMENT_LEVELS.includes(item.cefr)) errors.push(`${where}: cefr must be one of ${PLACEMENT_LEVELS.join(", ")}.`);
    if (typeof item.tag !== "string" || !item.tag) errors.push(`${where}: tag is required.`);
    if (typeof item.prompt !== "string" || !item.prompt.trim()) errors.push(`${where}: prompt is required.`);
    if (item.type === "mcq") {
      validateChoice(item, where, errors);
    } else if (item.type === "listening") {
      if (typeof item.audioText !== "string" || !item.audioText.trim()) errors.push(`${where}: listening items need audioText.`);
      validateChoice(item, where, errors);
    } else if (item.type === "gap") {
      if (!Array.isArray(item.accepted) || !item.accepted.length ||
          item.accepted.some(answer => typeof answer !== "string" || !answer.trim())) {
        errors.push(`${where}: accepted must list at least one answer.`);
      }
    } else if (item.type === "order") {
      if (!Array.isArray(item.words) || item.words.length < 3 || item.words.length > 14) {
        errors.push(`${where}: words must list 3-14 words.`);
      } else if (typeof item.answer !== "string" ||
                 item.answer.split(/\s+/).sort().join(" ") !== [...item.words].sort().join(" ")) {
        errors.push(`${where}: answer must use exactly the listed words.`);
      }
    } else {
      errors.push(`${where}: type must be mcq, gap, order or listening.`);
    }
  });
  PLACEMENT_LEVELS.forEach(level => {
    if (items.filter(item => item && item.cefr === level).length < 4) {
      errors.push(`Level ${level} needs at least 4 items for the adaptive test.`);
    }
  });
  return { valid: errors.length === 0, errors };
}

// ---- answer checking -----------------------------------------------------------------------

// `response` is an option index (mcq/listening), typed text (gap) or an array of words (order).
export function checkPlacementAnswer(item, response) {
  if (item.type === "mcq" || item.type === "listening") {
    return response !== null && response !== undefined && response !== "" && Number(response) === item.answer;
  }
  if (item.type === "gap") return isAnswerCorrect(String(response ?? ""), item.accepted, { mode: "exact" });
  if (item.type === "order") {
    return Array.isArray(response) && isAnswerCorrect(response.join(" "), [item.answer], { mode: "exact" });
  }
  return false;
}

// ---- adaptive session ----------------------------------------------------------------------

export function createPlacementSession() {
  return { levelIndex: START_LEVEL_INDEX, answered: [] };
}

export function nextPlacementItem(session, items) {
  const used = new Set(session.answered.map(entry => entry.id));
  const lastType = session.answered.length ? session.answered[session.answered.length - 1].type : null;
  for (let distance = 0; distance < PLACEMENT_LEVELS.length; distance++) {
    const indexes = distance === 0 ? [session.levelIndex] : [session.levelIndex - distance, session.levelIndex + distance];
    for (const index of indexes) {
      const level = PLACEMENT_LEVELS[index];
      if (!level) continue;
      const pool = items.filter(item => item.cefr === level && !used.has(item.id));
      if (pool.length) return pool.find(item => item.type !== lastType) || pool[0];
    }
  }
  return null;
}

export function recordPlacementAnswer(session, item, correct) {
  const answered = [...session.answered, {
    id: item.id, cefr: item.cefr, tag: item.tag, type: item.type, correct: Boolean(correct)
  }];
  const levelIndex = Math.max(0, Math.min(PLACEMENT_LEVELS.length - 1, session.levelIndex + (correct ? 1 : -1)));
  return { levelIndex, answered };
}

export function shouldStopPlacement(session, items) {
  const count = session.answered.length;
  if (count >= MAX_ITEMS || !nextPlacementItem(session, items)) return true;
  return count >= MIN_ITEMS && assessPlacement(session.answered).confidence >= CONFIDENCE_TO_STOP;
}

// ---- assessment ----------------------------------------------------------------------------

function levelStats(answered) {
  return PLACEMENT_LEVELS.map(level => {
    const rows = answered.filter(entry => entry.cefr === level);
    const correct = rows.filter(entry => entry.correct).length;
    return { level, total: rows.length, correct, accuracy: rows.length ? correct / rows.length : null };
  });
}

// `answered` is [{ id, cefr, tag, correct }]. Returns an estimate, not a grade.
export function assessPlacement(answered) {
  const rows = Array.isArray(answered) ? answered.filter(entry => entry && PLACEMENT_LEVELS.includes(entry.cefr)) : [];
  const stats = levelStats(rows);
  let estimate = 0;
  for (let index = stats.length - 1; index >= 0; index--) {
    if (stats[index].total >= 2 && stats[index].accuracy >= PASS_ACCURACY) { estimate = index; break; }
  }

  const boundary = (stats[estimate] ? stats[estimate].total : 0) + (stats[estimate + 1] ? stats[estimate + 1].total : 0);
  const surprises = rows.filter(entry => {
    const index = PLACEMENT_LEVELS.indexOf(entry.cefr);
    return (!entry.correct && index <= estimate - 1) || (entry.correct && index >= estimate + 2);
  }).length;
  const consistency = rows.length ? 1 - surprises / rows.length : 0;
  const confidence = rows.length
    ? Math.round(Math.max(0, Math.min(1, 0.35 * Math.min(1, rows.length / 20) + 0.35 * Math.min(1, boundary / 6) + 0.3 * consistency)) * 100) / 100
    : 0;

  const byTag = new Map();
  rows.forEach(entry => {
    const record = byTag.get(entry.tag) || { tag: entry.tag, missedAtOrBelow: 0, missedAbove: 0, rightAtOrAbove: 0 };
    const index = PLACEMENT_LEVELS.indexOf(entry.cefr);
    if (!entry.correct && index <= estimate) record.missedAtOrBelow++;
    if (!entry.correct && index > estimate) record.missedAbove++;
    if (entry.correct && index >= estimate) record.rightAtOrAbove++;
    byTag.set(entry.tag, record);
  });
  const records = [...byTag.values()];
  const weaknesses = records.filter(record => record.missedAtOrBelow > 0).map(record => record.tag);
  const strengths = records.filter(record => record.rightAtOrAbove > 0 && record.missedAtOrBelow === 0).map(record => record.tag);
  const nextGoals = records.filter(record => record.missedAbove > 0 && record.missedAtOrBelow === 0).map(record => record.tag);

  const cefr = PLACEMENT_LEVELS[estimate];
  const nextLevel = PLACEMENT_LEVELS[Math.min(estimate + 1, PLACEMENT_LEVELS.length - 1)];
  const suggestedPath = [
    ...weaknesses.map(tag => ({ kind: "practice", topic: tag, label: `Review: ${tagLabel(tag)}`, level: cefr })),
    ...nextGoals.map(tag => ({ kind: "practice", topic: tag, label: `Next step: ${tagLabel(tag)}`, level: nextLevel })),
    { kind: "lesson", topic: "classwork", label: `Keep going with your ${cefr} lessons`, level: cefr }
  ].slice(0, 6);

  return {
    cefr, confidence, strengths, weaknesses, suggestedPath,
    guidance: LEVEL_GUIDANCE[cefr],
    answered: rows.length,
    correct: rows.filter(entry => entry.correct).length
  };
}

// ---- retake window ---------------------------------------------------------------------------

export function nextRetakeAt(takenAt) {
  return Number.isFinite(takenAt) ? takenAt + RETAKE_WAIT_MS : 0;
}

export function canRetake(takenAt, now = Date.now()) {
  return !Number.isFinite(takenAt) || now >= nextRetakeAt(takenAt);
}

// Shape stored at studentProgress/<code>/placement (matches database.rules.json; takenAt is added
// as a server timestamp by the page).
export function buildPlacementRecord(assessment, answered, durationMs) {
  return {
    cefr: assessment.cefr,
    confidence: assessment.confidence,
    durationMs: Math.max(0, Math.min(7200000, Math.round(durationMs))),
    answers: answered.slice(0, 40).map(entry => ({ id: entry.id, correct: entry.correct }))
  };
}
