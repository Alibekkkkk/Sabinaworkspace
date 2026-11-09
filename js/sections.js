// Standard lesson sections (content schema v2): Vocabulary, Grammar, Reading Comprehension, plus the
// final test as its own closing stage. Pure helpers shared by the migration script, the content linter
// and the lesson UI.
export const SECTION_IDS = Object.freeze(["vocabulary", "grammar", "reading"]);

// Which content keys belong to which lesson stage (stage ids are the nine DEFAULT_STAGES).
export const STAGE_CONTENT_KEYS = Object.freeze({
  1: ["vocab"], 2: ["matchData"], 3: ["readingHtml", "readingQ", "contextQ"],
  4: ["g6"], 5: ["g7"], 6: ["sbPp"], 7: ["sbPs"], 8: ["g10"],
  9: ["testMcq", "testShort", "testTfng", "testComplete"]
});

export const DEFAULT_SECTIONS = Object.freeze([
  { id: "vocabulary", title: "Vocabulary", stages: ["vocab", "matchData"] },
  { id: "grammar", title: "Grammar", stages: ["g6", "g7", "sbPp", "sbPs", "g10"] },
  { id: "reading", title: "Reading Comprehension", stages: ["readingHtml", "readingQ", "contextQ"] }
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
  return {
    vocabulary: Math.min(25, Math.max(10, roundToFive(5 + words))),
    grammar: 20,
    reading: roundToFive(readingMinutes(content))
  };
}

export function buildSections(content) {
  const estimates = suggestedEstimates(content);
  return DEFAULT_SECTIONS.map(section => ({
    id: section.id,
    title: section.title,
    estimatedMinutes: estimates[section.id],
    stages: [...section.stages]
  }));
}

export function validateSections(content) {
  const errors = [];
  if (content.schemaVersion !== 2) errors.push("schemaVersion must be 2.");
  const sections = content.sections;
  if (!Array.isArray(sections)) return [...errors, "sections must be an array."];
  const seen = new Set();
  const covered = new Set();
  sections.forEach((section, index) => {
    const where = `sections[${index}]`;
    if (!section || typeof section !== "object") { errors.push(`${where}: must be an object.`); return; }
    if (typeof section.id !== "string" || !/^[a-z0-9_-]{1,32}$/.test(section.id)) errors.push(`${where}: id must be 1-32 characters of a-z, 0-9, - and _.`);
    else if (seen.has(section.id)) errors.push(`${where}: duplicate id "${section.id}".`);
    else seen.add(section.id);
    if (typeof section.title !== "string" || !section.title.trim()) errors.push(`${where}: title is required.`);
    if (!Number.isFinite(section.estimatedMinutes) || section.estimatedMinutes < 1 || section.estimatedMinutes > 120) errors.push(`${where}: estimatedMinutes must be a number from 1 to 120.`);
    if (!Array.isArray(section.stages) || !section.stages.length) errors.push(`${where}: stages must list at least one content key.`);
    else for (const key of section.stages) {
      if (!Object.values(STAGE_CONTENT_KEYS).flat().includes(key) || key.startsWith("test")) errors.push(`${where}: unknown or reserved stage key "${key}".`);
      else if (!(key in content)) errors.push(`${where}: content has no "${key}".`);
      else if (covered.has(key)) errors.push(`${where}: "${key}" is already in another section.`);
      else covered.add(key);
    }
    if (section.goals !== undefined && (!Array.isArray(section.goals) || section.goals.some(goal => typeof goal !== "string"))) errors.push(`${where}: goals must be a list of strings.`);
  });
  for (const id of SECTION_IDS) if (!seen.has(id)) errors.push(`The standard section "${id}" is missing.`);
  for (const key of DEFAULT_SECTIONS.flatMap(section => section.stages)) if (key in content && !covered.has(key)) errors.push(`Content "${key}" is not part of any section.`);
  return errors;
}

// Which section a lesson stage (1-9) belongs to; the final test (9) belongs to none.
export function sectionForStage(sections, stageId) {
  const keys = STAGE_CONTENT_KEYS[stageId] || [];
  if (stageId === 9) return null;
  return (sections || []).find(section => section.stages.some(key => keys.includes(key))) || null;
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
