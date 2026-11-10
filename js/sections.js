// Lesson clock sections (content schema v3): the timer cards at the top of a lesson. Each groups one or more lesson sections
// (see js/lesson-plan.js): Vocabulary (Vocabulary and Word Match), Reading Comprehension, Games, Listening Training,
// Grammar (all grammar topics) and the final test. Pure helpers shared by the migration script, the content linter,
// the lesson clock and the dashboard.
import { CLOCK_SECTION, grammarTopics, validateGrammar } from "./lesson-plan.js";

export const SCHEMA_VERSION = 3;
export const SECTION_IDS = Object.freeze(["vocabulary", "reading", "games", "listening", "grammar", "test"]);

export const DEFAULT_SECTIONS = Object.freeze([
  { id: "vocabulary", title: "Vocabulary", stages: ["vocab", "match"] },
  { id: "reading", title: "Reading Comprehension", stages: ["reading"] },
  { id: "games", title: "Games", stages: ["games"] },
  { id: "listening", title: "Listening Training", stages: ["listening"] },
  { id: "grammar", title: "Grammar", stages: ["grammar"] },
  { id: "test", title: "Test Your Knowledge", stages: ["test"] }
]);

const WORDS_PER_MINUTE = 120;
const MINUTES_PER_QUESTION = 1.5;

export function roundToFive(minutes) {
  return Math.max(5, Math.round(minutes / 5) * 5);
}

export function countWords(html) {
  return String(html || "").replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length;
}

// Reading time = words / 120 wpm + 1.5 minutes per question (the rule used by the linter too).
export function readingMinutes(content) {
  const questions = (Array.isArray(content.readingQ) ? content.readingQ.length : 0) + (Array.isArray(content.contextQ) ? content.contextQ.length : 0);
  return countWords(content.readingHtml) / WORDS_PER_MINUTE + questions * MINUTES_PER_QUESTION;
}

export function suggestedEstimates(content) {
  const words = Array.isArray(content.vocab) ? content.vocab.length : 0;
  const topics = grammarTopics(content).length || 1;
  return {
    vocabulary: Math.min(25, Math.max(10, roundToFive(5 + words))),
    reading: roundToFive(readingMinutes(content)),
    games: 10,
    listening: 10,
    grammar: Math.min(45, roundToFive(10 * topics)),
    test: 10
  };
}

export function buildSections(content) {
  const estimates = suggestedEstimates(content || {});
  return DEFAULT_SECTIONS.map(section => ({ id: section.id, title: section.title, estimatedMinutes: estimates[section.id], stages: [...section.stages] }));
}

export function validateSections(content) {
  const errors = [];
  if (!content || content.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be ${SCHEMA_VERSION}.`);
  const sections = content && content.sections;
  if (!Array.isArray(sections)) return [...errors, "sections must be an array."];
  const seen = new Set();
  sections.forEach((section, index) => {
    const where = `sections[${index}]`;
    if (!section || typeof section !== "object") { errors.push(`${where}: must be an object.`); return; }
    if (!SECTION_IDS.includes(section.id)) errors.push(`${where}: id must be one of ${SECTION_IDS.join(", ")}.`);
    else if (seen.has(section.id)) errors.push(`${where}: duplicate id "${section.id}".`);
    else seen.add(section.id);
    if (typeof section.title !== "string" || !section.title.trim()) errors.push(`${where}: title is required.`);
    if (!Number.isFinite(section.estimatedMinutes) || section.estimatedMinutes < 1 || section.estimatedMinutes > 120) errors.push(`${where}: estimatedMinutes must be a number from 1 to 120.`);
    const standard = DEFAULT_SECTIONS.find(item => item.id === section.id);
    if (standard && JSON.stringify(section.stages) !== JSON.stringify(standard.stages)) errors.push(`${where}: stages must be ${JSON.stringify(standard.stages)}.`);
    if (section.goals !== undefined && (!Array.isArray(section.goals) || section.goals.some(goal => typeof goal !== "string"))) errors.push(`${where}: goals must be a list of strings.`);
  });
  for (const id of SECTION_IDS) if (!seen.has(id)) errors.push(`The standard section "${id}" is missing.`);
  errors.push(...validateGrammar(content || {}));
  return errors;
}

// Which clock section a lesson section belongs to (by its key: vocab, match, reading, games, listening, grammar-N, test).
export function sectionForKey(sections, key) {
  const base = String(key || "").startsWith("grammar") ? "grammar" : key;
  const id = CLOCK_SECTION[base];
  return (sections || []).find(section => section.id === id) || null;
}

// Teacher overrides (estimated minutes and order) live in the student's curriculum, not in protected content.
export function applySectionOverrides(sections, overrides) {
  const base = (sections || []).map(section => ({ ...section }));
  if (!overrides || typeof overrides !== "object") return base;
  for (const section of base) {
    const minutes = Number(overrides.estimatedMinutes && overrides.estimatedMinutes[section.id]);
    if (Number.isFinite(minutes) && minutes >= 1 && minutes <= 120) section.estimatedMinutes = Math.round(minutes);
  }
  if (Array.isArray(overrides.order)) {
    const rank = id => { const index = overrides.order.indexOf(id); return index === -1 ? overrides.order.length : index; };
    base.sort((a, b) => rank(a.id) - rank(b.id));
  }
  return base;
}
