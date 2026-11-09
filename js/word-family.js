// Vocabulary word families: validation of `vocab[].forms`, generation of the "Form the word" exercises and
// grading. Pure functions: no DOM, no Firebase.
//
// vocab[].forms = {
//   status: "draft" | "approved",          students only see approved families (teacher preview sees drafts)
//   review: ["adverb"],                    forms the author is unsure about: hidden from students, listed by the linter
//   noun | verb | adjective | adverb | negative: { w: "environmental", ex: "A sentence using it.", parts?: ["environ","mental"] },
//   other: { label: "person", w: "evacuee", ex: "..." },
//   affixes: [{ part: "-ation", type: "suffix", meaning: "the act of" }]
// }
// There is no bundled derivation dictionary (none with a clear open licence was available offline). Instead a form
// must either share a stem with the headword, be spelled out as morphemes in `parts`, or appear in an optional
// local list `content/wordlists/derivations.txt`; anything else is an error telling the author to put it under `review`.
import { isAnswerCorrect } from "./grading.js";

export const FORM_KEYS = Object.freeze(["noun", "verb", "adjective", "adverb", "negative"]);
export const FORM_LABELS = Object.freeze({ noun: "noun", verb: "verb", adjective: "adjective", adverb: "adverb", negative: "negative" });
export const EXERCISE_TYPES = Object.freeze(["choose", "type", "build"]);
const MIN_SHARED_STEM = 4;
const SINGLE_WORD = /^[A-Za-z][A-Za-z'-]{1,30}$/;

export const slug = text => String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

// Realtime Database keys: letters, digits, "_" and "-" only, at most 64 characters.
export function familyKey(id) {
  return `wf_${String(id).replace(/[^A-Za-z0-9_-]/g, "_")}`.slice(0, 60);
}
export const familyOkKey = id => `${familyKey(id)}_ok`;

const sharedPrefix = (a, b) => {
  const x = a.toLowerCase(); const y = b.toLowerCase();
  let index = 0;
  while (index < x.length && index < y.length && x[index] === y[index]) index++;
  return index;
};
const nonEmpty = value => typeof value === "string" && value.trim().length > 0;
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function parseDerivations(text) {
  return new Set(String(text || "").toLowerCase().split(/[\s,]+/).filter(Boolean));
}

function formEntries(forms) {
  const entries = FORM_KEYS.filter(key => forms[key] !== undefined).map(key => ({ key, entry: forms[key] }));
  if (forms.other !== undefined) entries.push({ key: "other", entry: forms.other });
  return entries;
}

// Returns { errors, warnings } for one vocabulary item.
export function validateForms(vocabItem, where = "vocab", { derivations = new Set() } = {}) {
  const errors = []; const warnings = [];
  const forms = vocabItem && vocabItem.forms;
  if (forms === undefined) return { errors, warnings };
  if (!forms || typeof forms !== "object" || Array.isArray(forms)) return { errors: [`${where}: forms must be an object.`], warnings };
  const head = String(vocabItem.en || "");
  const label = `${where} (${head})`;
  if (!["draft", "approved"].includes(forms.status)) errors.push(`${label}: forms.status must be "draft" or "approved".`);
  const review = forms.review === undefined ? [] : forms.review;
  if (!Array.isArray(review) || review.some(key => ![...FORM_KEYS, "other"].includes(key))) errors.push(`${label}: forms.review must list form names such as "adverb".`);
  const entries = formEntries(forms);
  if (!entries.length) errors.push(`${label}: forms needs at least one of ${FORM_KEYS.join(", ")} or other.`);
  const seen = new Set([head.toLowerCase()]);
  for (const { key, entry } of entries) {
    const at = `${label}.${key}`;
    if (!entry || typeof entry !== "object") { errors.push(`${at}: must be an object with w and ex.`); continue; }
    if (typeof entry.w !== "string" || !SINGLE_WORD.test(entry.w)) { errors.push(`${at}: w must be one word.`); continue; }
    if (key === "other" && !nonEmpty(entry.label)) errors.push(`${at}: label is required (for example "person").`);
    const word = entry.w.toLowerCase();
    if (seen.has(word)) errors.push(`${at}: "${entry.w}" is already used by another form or is the headword.`);
    seen.add(word);
    if (!nonEmpty(entry.ex)) errors.push(`${at}: one example sentence is required.`);
    else if (!new RegExp(`(^|[^A-Za-z])${escapeRegExp(entry.w)}([^A-Za-z]|$)`, "i").test(entry.ex.replace(/<[^>]*>/g, ""))) errors.push(`${at}: the example sentence must contain "${entry.w}".`);
    if (entry.parts !== undefined) {
      if (!Array.isArray(entry.parts) || entry.parts.length < 2 || entry.parts.length > 4 || entry.parts.some(part => !nonEmpty(part))) errors.push(`${at}: parts must list 2 to 4 pieces.`);
      else if (entry.parts.join("").toLowerCase() !== word) errors.push(`${at}: parts (${entry.parts.join(" + ")}) do not add up to "${entry.w}".`);
    }
    const flagged = Array.isArray(review) && review.includes(key);
    const confirmed = entry.parts !== undefined || sharedPrefix(head, entry.w) >= MIN_SHARED_STEM || derivations.has(word);
    if (flagged) warnings.push(`${at}: "${entry.w}" is marked for teacher review and is hidden from students.`);
    else if (!confirmed) errors.push(`${at}: cannot confirm "${entry.w}" is derived from "${head}". Spell out its morphemes in parts, add it to content/wordlists/derivations.txt, or list "${key}" under forms.review.`);
  }
  if (forms.affixes !== undefined) {
    if (!Array.isArray(forms.affixes)) errors.push(`${label}: affixes must be a list.`);
    else for (const [index, affix] of forms.affixes.entries()) {
      const at = `${label}.affixes[${index}]`;
      if (!affix || !nonEmpty(affix.part) || !["prefix", "suffix"].includes(affix.type) || !nonEmpty(affix.meaning)) { errors.push(`${at}: needs part, type ("prefix" or "suffix") and meaning.`); continue; }
      const part = affix.part.replace(/^-+|-+$/g, "").toLowerCase();
      const used = [head, ...entries.map(({ entry }) => entry && entry.w).filter(Boolean)].some(word => {
        const lower = String(word).toLowerCase();
        return affix.type === "prefix" ? lower.startsWith(part) : lower.endsWith(part);
      });
      if (!used) errors.push(`${at}: "${affix.part}" is not at the ${affix.type === "prefix" ? "start" : "end"} of any listed form.`);
    }
  }
  return { errors, warnings };
}

export function validateWordFamilies(vocab, options = {}) {
  const errors = []; const warnings = [];
  (Array.isArray(vocab) ? vocab : []).forEach((item, index) => {
    const result = validateForms(item, `vocab[${index}]`, options);
    errors.push(...result.errors); warnings.push(...result.warnings);
  });
  return { errors, warnings };
}

// ---- visibility ---------------------------------------------------------------------------------------

export function familyVisible(vocabItem, isTeacher) {
  const forms = vocabItem && vocabItem.forms;
  return Boolean(forms) && (forms.status === "approved" || Boolean(isTeacher));
}

// The forms a viewer may see: students never see forms listed under review.
export function visibleForms(vocabItem, isTeacher) {
  if (!familyVisible(vocabItem, isTeacher)) return [];
  const review = Array.isArray(vocabItem.forms.review) ? vocabItem.forms.review : [];
  return formEntries(vocabItem.forms)
    .filter(({ key, entry }) => entry && entry.w && (isTeacher || !review.includes(key)))
    .map(({ key, entry }) => ({ key, label: key === "other" ? entry.label : FORM_LABELS[key], w: entry.w, ex: entry.ex, parts: entry.parts, needsReview: review.includes(key) }));
}

// ---- exercises ----------------------------------------------------------------------------------------

const AFFIX_POOL = Object.freeze(["ion", "ation", "ment", "al", "ic", "ous", "ity", "ive", "ly", "ness", "ize", "ate", "un", "dis", "re"]);
const rank = (text, salt) => { let h = salt; for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) % 9973; return h; };

// One item per (headword, form) for the forms in `exercise` (the five main kinds, never "other").
// Type rotates choose -> type -> build; build is used only when the form spells out its parts.
export function familyItems(vocab, { isTeacher = false } = {}) {
  const base = [];
  for (const item of Array.isArray(vocab) ? vocab : []) {
    for (const form of visibleForms(item, isTeacher)) {
      if (form.key === "other") continue;
      base.push({ id: `${slug(item.en)}.${form.key}`, word: item.en, pos: form.key, answer: form.w, ex: form.ex, parts: form.parts, needsReview: form.needsReview });
    }
  }
  const answers = base.map(item => item.answer);
  return base.map((item, index) => {
    let type = EXERCISE_TYPES[index % EXERCISE_TYPES.length];
    if (type === "build" && !item.parts) type = "type";
    const others = answers.filter(answer => answer.toLowerCase() !== item.answer.toLowerCase());
    if (type === "choose" && others.length < 2) type = "type";
    const prompt = `${item.word.charAt(0).toUpperCase()}${item.word.slice(1)} → (${FORM_LABELS[item.pos]}) ______`;
    const out = { ...item, type, prompt };
    if (type === "choose") {
      const unique = [...new Set(others.map(answer => answer.toLowerCase()))];
      const distractors = unique.map(lower => others.find(answer => answer.toLowerCase() === lower)).sort((a, b) => rank(a, index) - rank(b, index)).slice(0, 3);
      out.options = [item.answer, ...distractors].sort((a, b) => rank(a, index + 7) - rank(b, index + 7));
    }
    if (type === "build") {
      const real = item.parts.map(part => part.toLowerCase());
      const extras = AFFIX_POOL.filter(part => !real.includes(part)).sort((a, b) => rank(a, index) - rank(b, index)).slice(0, 2);
      out.tiles = [...real, ...extras].sort((a, b) => rank(a, index + 3) - rank(b, index + 3));
    }
    return out;
  });
}

export function checkChoose(item, option) {
  return typeof option === "string" && option.toLowerCase() === item.answer.toLowerCase();
}
export function checkTypedForm(item, response) {
  return isAnswerCorrect(String(response ?? ""), [item.answer], { mode: "exact" });
}
export function checkMorphemes(item, tiles) {
  return Array.isArray(tiles) && tiles.join("").toLowerCase() === item.answer.toLowerCase();
}

// Short explanation shown after a wrong answer: where the word comes from, never just "wrong".
export function explainForm(item, forms) {
  const parts = item.parts ? ` Built from ${item.parts.join(" + ")}.` : "";
  return `The ${FORM_LABELS[item.pos]} form of "${item.word}" is "${item.answer}".${parts} Example: ${String(item.ex).replace(/<[^>]*>/g, "")}`;
}

// ---- authoring suggestions ---------------------------------------------------------------------------------
// Rule-of-thumb candidates only. They are NOT checked against a dictionary: the teacher approves each one.
const SUFFIX_RULES = [
  { pos: "noun", from: /(ate)$/, add: "ation", drop: 3, note: "-ation: the act of" },
  { pos: "noun", from: /(ion)$/, add: "", drop: 0, note: "" },
  { pos: "adjective", from: /(ion)$/, add: "al", drop: 0, note: "-al: relating to" },
  { pos: "verb", from: /(ion)$/, add: "", drop: 3, note: "" },
  { pos: "adjective", from: /(e)$/, add: "ic", drop: 1, note: "-ic: relating to" },
  { pos: "adjective", from: /(o)$/, add: "ic", drop: 1, note: "-ic: relating to" },
  { pos: "noun", from: /(id)$/, add: "ity", drop: 0, note: "-ity: state of being" },
  { pos: "noun", from: /(l|r|t|d|k|w|g|p|s)$/, add: "ing", drop: 0, note: "-ing: the action" },
  { pos: "adjective", from: /(l|r|t|d|k|w|g|p|s)$/, add: "ed", drop: 0, note: "-ed: affected by" },
  { pos: "adverb", from: /(al)$/, add: "ly", drop: 0, note: "-ly: in a way" },
  { pos: "adjective", from: /(.)$/, add: "ous", drop: 0, note: "-ous: full of" },
  { pos: "adjective", from: /(.)$/, add: "al", drop: 0, note: "-al: relating to" }
];
export function suggestForms(word) {
  const base = String(word || "").trim().toLowerCase();
  if (!SINGLE_WORD.test(base)) return [];
  const out = []; const seen = new Set([base]);
  for (const rule of SUFFIX_RULES) {
    if (!rule.from.test(base)) continue;
    const candidate = base.slice(0, base.length - rule.drop) + rule.add;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    out.push({ pos: rule.pos, w: candidate, note: rule.note });
  }
  for (const prefix of ["un", "dis", "in", "im", "re", "de"]) out.push({ pos: "negative", w: `${prefix}${base}`, note: `${prefix}-: ${prefix === "re" ? "again" : "not / opposite"}` });
  return out;
}
