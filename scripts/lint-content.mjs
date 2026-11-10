// Checks classwork content against the Phase 2 rules.   npm run lint:content
//   errors   (exit 1): invalid schema v3 / sections / grammar topics
//   warnings (exit 0): things a teacher should look at; lesson text is never edited by this tool
// Checks: target vocabulary appears in the reading passage; target grammar pattern appears >= 3 times
// (for the first grammar topic whose id or title names a pattern in GRAMMAR_PATTERNS); estimated reading time matches the text
// (words / 120 wpm + 1.5 min per question, warn if > 25% off); short answers can be found in the passage;
// optional CEFR word-list check when content/wordlists/ngsl.txt exists (NGSL is CC BY-SA 4.0; not bundled).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateLadder } from "../js/grammar-ladder.js";
import { validateReadingTasks } from "../js/reading-tasks.js";
import { parseDerivations, validateWordFamilies } from "../js/word-family.js";
import { countWords, readingMinutes, validateSections } from "../js/sections.js";

const root = fileURLToPath(new URL("../", import.meta.url));

// Add a pattern here to enable the structure-count check for grammar topics that name it (id or title).
export const GRAMMAR_PATTERNS = Object.freeze({
  "present perfect": /\b(has|have|had)\s+(not\s+|never\s+|already\s+|just\s+|also\s+)?[a-z]+(ed|en|wn|ne|t)\b/gi,
  "past simple": /\b[a-z]+ed\b/gi,
  "gerund and infinitive": /\b(enjoy|avoid|suggest|finish|mind|keep|decide|want|hope|plan|agree|refuse)\s+(to\s+)?[a-z]+(ing)?\b/gi,
  "passive voice": /\b(is|are|was|were|been|be)\s+[a-z]+(ed|en)\b/gi
});
// Topic wording that names a pattern above.
const PATTERN_ALIASES = Object.freeze({ "past passive": "passive voice", "gerunds and infinitives": "gerund and infinitive" });
export function patternForTopic(topic) {
  for (const text of [topic && topic.title, topic && topic.id]) {
    const name = String(text || "").toLowerCase().replace(/-/g, " ").trim();
    if (GRAMMAR_PATTERNS[name]) return name;
    if (PATTERN_ALIASES[name]) return PATTERN_ALIASES[name];
  }
  return "";
}

const plain = html => String(html || "").replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/gi, " ");
const normalise = text => plain(text).toLowerCase();

// Words of a vocabulary item's word family (vocab[].forms[kind].w), whatever their review state.
function formWords(item) {
  if (!item || !item.forms || typeof item.forms !== "object") return [];
  return Object.values(item.forms).filter(value => value && typeof value === "object" && !Array.isArray(value) && typeof value.w === "string").map(value => value.w);
}

function wordForms(word) {
  const base = word.toLowerCase().trim().replace(/^to\s+/, "");
  const stem = base.replace(/(e|y)$/, "");
  return [base, `${base}s`, `${base}es`, `${base}ed`, `${base}d`, `${base}ing`, `${stem}ies`, `${stem}ied`, `${stem}ing`, `${base}ly`];
}

export function lintContent(name, content, { wordlist = null, derivations = new Set() } = {}) {
  const errors = validateSections(content).map(message => `${message}`);
  if (content.grammarLadder !== undefined) errors.push(...validateLadder(content.grammarLadder).map(message => `grammarLadder: ${message}`));
  if (content.readingTasks !== undefined) errors.push(...validateReadingTasks(content.readingTasks, content.readingHtml).map(message => `readingTasks: ${message}`));
  const warnings = [];
  const families = validateWordFamilies(content.vocab, { derivations });
  errors.push(...families.errors);
  warnings.push(...families.warnings);
  const passage = normalise(content.readingHtml);

  // 1. target vocabulary in the passage
  const missing = [];
  for (const item of Array.isArray(content.vocab) ? content.vocab : []) {
    const forms = new Set([item.en, ...formWords(item)].filter(Boolean).flatMap(wordForms));
    const found = [...forms].some(form => new RegExp(`(^|[^a-z])${form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(passage));
    if (!found) missing.push(item.en);
  }
  if (missing.length) warnings.push(`${missing.length} target word(s) never appear in the reading passage: ${missing.join(", ")}.`);

  // 2. grammar structure: the passage should use the structure of the lesson's main (first) grammar topic
  const topics = Array.isArray(content.grammar) ? content.grammar : [];
  const main = topics.find(topic => patternForTopic(topic));
  if (!topics.length) warnings.push('The lesson has no "grammar" topics, so the reading passage cannot be checked for the target structure.');
  else if (!main) warnings.push(`No pattern is defined for the grammar topics (${topics.map(topic => topic.title).join(", ")}). Add one to GRAMMAR_PATTERNS in scripts/lint-content.mjs.`);
  else {
    const name = patternForTopic(main);
    const hits = (passage.match(GRAMMAR_PATTERNS[name]) || []).length;
    if (hits < 3) warnings.push(`The passage contains the "${main.title}" structure ${hits} time(s); at least 3 are expected.`);
  }

  // 3. reading time estimate
  const reading = (content.sections || []).find(section => section.id === "reading");
  if (reading && Number.isFinite(reading.estimatedMinutes)) {
    const expected = readingMinutes(content);
    if (Math.abs(reading.estimatedMinutes - expected) / expected > 0.25) {
      warnings.push(`Reading estimate is ${reading.estimatedMinutes} min but ${countWords(content.readingHtml)} words plus ${(content.readingQ || []).length + (content.contextQ || []).length} questions suggest about ${Math.round(expected)} min (more than 25% apart).`);
    }
  }

  // 4. short answers should be findable in the text
  const unanswerable = (Array.isArray(content.readingQ) ? content.readingQ : [])
    .filter(question => question.type === "short" && Array.isArray(question.answers) && question.answers.length && !question.answers.some(answer => passage.includes(String(answer).toLowerCase())))
    .map(question => question.id || question.prompt);
  if (unanswerable.length) warnings.push(`${unanswerable.length} short-answer question(s) have no accepted answer written in the passage (may be fine if paraphrased): ${unanswerable.slice(0, 6).join(", ")}${unanswerable.length > 6 ? ", ..." : ""}.`);

  // 5. words above the lesson level (only with an openly licensed list supplied by the teacher)
  if (wordlist) {
    const allowed = new Set([...wordlist, ...(Array.isArray(content.vocab) ? content.vocab.flatMap(item => [item.en, ...formWords(item)].flatMap(wordForms)) : []), ...(content.allowWords || []).map(word => String(word).toLowerCase())]);
    const unknown = [...new Set(passage.match(/[a-z]{3,}/g) || [])].filter(word => !allowed.has(word) && !allowed.has(word.replace(/(ing|ed|es|s)$/, "")));
    if (unknown.length > 8) warnings.push(`${unknown.length} passage words are not in the word list (first: ${unknown.slice(0, 12).join(", ")}). Proper nouns can go in "allowWords".`);
  }
  return { name, errors, warnings };
}

export function lintAll(directory = join(root, "content")) {
  const listPath = join(directory, "wordlists", "ngsl.txt");
  const wordlist = existsSync(listPath) ? new Set(readFileSync(listPath, "utf8").split(/\s+/).map(word => word.toLowerCase()).filter(Boolean)) : null;
  const derivationsPath = join(directory, "wordlists", "derivations.txt");
  const derivations = existsSync(derivationsPath) ? parseDerivations(readFileSync(derivationsPath, "utf8")) : new Set();
  return readdirSync(directory)
    .filter(file => file.endsWith(".json") && file !== "manifest.json" && !file.startsWith("homework_"))
    .map(file => lintContent(file, JSON.parse(readFileSync(join(directory, file), "utf8")), { wordlist, derivations }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const results = lintAll();
  let errorCount = 0;
  let warningCount = 0;
  for (const result of results) {
    console.log(`${result.errors.length ? "FAIL" : result.warnings.length ? "warn" : "ok  "} ${result.name}`);
    for (const message of result.errors) console.log(`   error:   ${message}`);
    for (const message of result.warnings) console.log(`   warning: ${message}`);
    errorCount += result.errors.length;
    warningCount += result.warnings.length;
  }
  console.log(`\n${results.length} file(s): ${errorCount} error(s), ${warningCount} warning(s). Lesson text is never changed by this tool.`);
  if (!existsSync(join(root, "content", "wordlists", "ngsl.txt"))) console.log("CEFR word-list check skipped: add content/wordlists/ngsl.txt (New General Service List, CC BY-SA 4.0) to enable it.");
  process.exit(errorCount ? 1 : 0);
}
