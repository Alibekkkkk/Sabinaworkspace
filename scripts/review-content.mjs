// Item-level consistency checks for classwork lessons, beyond the schema and the linter:   node scripts/review-content.mjs
// Reports problems a student would meet: answer keys that clash with time words, sentence builders whose words do not make the
// sentence the prompt asks for, multiple-choice answers missing from the options, duplicates, untranslated or empty fields.
// Exit code 1 when an error is found. It never edits content.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const plain = text => String(text || "").replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
const lower = text => plain(text).toLowerCase();
const GROUPS = ["pos", "neg", "q", "shuffled"];

// Time words that need a particular tense in the answer.
const FINISHED_TIME = /\b(yesterday|last (night|week|month|year|summer|winter|spring|autumn|august|monday|time)|\d+ (days?|weeks?|months?|years?) ago|ago\b|in (19|20)\d\d\b|when (she|he|i|we|they) (was|were) (young|a child|little))/i;
const UP_TO_NOW = /\b(since|so far|yet|ever|never|already|just|recently|lately|this (term|week|month|year))\b/i;
const HABIT = /\b(every (day|morning|evening|night|week|spring|summer|autumn|winter|year|monday)|usually|always|often|on (mondays|weekends))\b/i;
// An answer in the present perfect: has/have as an auxiliary ("has risen", "Has the city provided"), not "have to".
const PERFECT = /\b(has|have|hasn't|haven't)\b\s+(?!to\b)\S+/i;
const FUTURE = /\b(will|going to|'ll|shall)\b/i;

const IRREGULAR = Object.freeze({
  be: ["am", "is", "are", "was", "were", "been", "being"], have: ["has", "had", "having"], do: ["does", "did", "done"], go: ["went", "gone", "goes"],
  see: ["saw", "seen"], take: ["took", "taken"], make: ["made"], come: ["came"], get: ["got", "gotten"], give: ["gave", "given"], find: ["found"],
  think: ["thought"], tell: ["told"], become: ["became"], leave: ["left"], feel: ["felt"], bring: ["brought"], begin: ["began", "begun"], keep: ["kept"],
  hold: ["held"], write: ["wrote", "written"], stand: ["stood"], hear: ["heard"], meet: ["met"], run: ["ran"], pay: ["paid"], sit: ["sat"], speak: ["spoke", "spoken"],
  lose: ["lost"], buy: ["bought"], send: ["sent"], build: ["built"], fall: ["fell", "fallen"], cut: ["cut"], sell: ["sold"], rise: ["rose", "risen"], drive: ["drove", "driven"],
  break: ["broke", "broken"], eat: ["ate", "eaten"], teach: ["taught"], catch: ["caught"], fly: ["flew", "flown", "flies"], forget: ["forgot", "forgotten"], sleep: ["slept"],
  swim: ["swam", "swum"], win: ["won"], wear: ["wore", "worn"], choose: ["chose", "chosen"], grow: ["grew", "grown"], know: ["knew", "known"], throw: ["threw", "thrown"],
  understand: ["understood"], read: ["read"], put: ["put"], let: ["let"], set: ["set"], shut: ["shut"], hurt: ["hurt"], spend: ["spent"], lend: ["lent"], fight: ["fought"],
  steal: ["stole", "stolen"], wake: ["woke", "woken"], draw: ["drew", "drawn"], drink: ["drank", "drunk"], sing: ["sang", "sung"], ring: ["rang", "rung"], shine: ["shone"],
  lie: ["lying", "lay", "lain", "lies"], can: ["could", "cannot"], must: ["must"], will: ["will", "won't"], may: ["might"], "have to": ["have to"]
});
function answerUsesVerb(answer, verb) {
  const text = answer.toLowerCase();
  const stem = verb.replace(/(e|y)$/, "").slice(0, Math.max(3, verb.length - 2));
  return text.includes(stem) || (IRREGULAR[verb] || []).some(form => new RegExp(`\\b${form}\\b`).test(text));
}

export function reviewLesson(name, content) {
  const errors = []; const warnings = [];
  const where = (key, item, index) => `${key}${item && item.id ? ` ${item.id}` : `[${index}]`}`;

  // ids are unique across the lesson
  const seen = new Map();
  const visit = (key, item, index) => { if (!item || !item.id) return; if (seen.has(item.id)) errors.push(`duplicate id ${item.id} (${seen.get(item.id)} and ${key})`); else seen.set(item.id, key); };
  for (const key of ["readingQ", "contextQ", "testMcq", "testShort", "testTfng", "testComplete"]) (content[key] || []).forEach((item, index) => visit(key, item, index));
  for (const key of ["g6", "g7", "sbPp", "sbPs", "g10"]) for (const group of GROUPS) (content[key] && content[key][group] || []).forEach((item, index) => visit(`${key}.${group}`, item, index));

  // complete-the-sentence exercises
  for (const key of ["g6", "g7", "g10", "testComplete"]) {
    const items = key === "testComplete" ? (content[key] || []) : GROUPS.flatMap(group => (content[key] && content[key][group]) || []);
    const prompts = new Map();
    items.forEach((item, index) => {
      const label = where(key, item, index);
      const prompt = plain(item.p); const answer = plain(item.a);
      if (!prompt.includes("___")) errors.push(`${label}: the prompt has no ___ gap: "${prompt}"`);
      if (!answer) errors.push(`${label}: the answer is empty`);
      if (/___|\(|\)/.test(answer)) errors.push(`${label}: the answer contains a gap or brackets: "${answer}"`);
      const hint = (prompt.match(/\(([^)]+)\)/) || [])[1] || "";
      if (/\bnot\b/.test(hint) && !/\bnot\b|n't\b|never|cannot/i.test(answer)) errors.push(`${label}: the hint asks for a negative but the answer "${answer}" is not negative: "${prompt}"`);
      if (/\bnever\b/.test(hint) && !/\bnever\b/i.test(answer)) errors.push(`${label}: the hint has "never" but the answer "${answer}" does not`);
      // the answer uses the verb in brackets: "(experience)" → "has experienced"; irregular forms are listed
      const verb = hint.toLowerCase().split(/[\s/]+/).filter(word => word && !/^(not|never|just|already|ever|still|yet|always|often|usually|must|can|should|will|could|might|may|have to|ought|to)$/.test(word)).pop();
      if (verb && /^[a-z]+$/.test(verb) && !answerUsesVerb(answer, verb)) warnings.push(`${label}: the answer "${answer}" does not use the verb "${verb}" from the brackets: "${prompt}"`);
      const context = prompt.replace(/\([^)]*\)/g, " ");
      const finished = FINISHED_TIME.test(context) && !/\bsince\s+(last|yesterday|\d)/i.test(context);
      if (PERFECT.test(answer) && finished) errors.push(`${label}: present perfect "${answer}" with a finished time: "${prompt}"`);
      if (PERFECT.test(answer) && HABIT.test(context) && !UP_TO_NOW.test(context)) errors.push(`${label}: present perfect "${answer}" with a habit/routine time word: "${prompt}"`);
      if (!PERFECT.test(answer) && !/\b(was|were)\b.*\b(since|for)\b/i.test(context) && /\b(since \d{4}|so far)\b/i.test(context) && !FUTURE.test(answer) && !/\bhave been|has been\b/i.test(answer)) warnings.push(`${label}: "${answer}" with since/so far, which usually needs the present perfect: "${prompt}"`);
      const normal = prompt.toLowerCase();
      if (prompts.has(normal)) warnings.push(`${label}: the same prompt appears twice in ${key} (${prompts.get(normal)})`); else prompts.set(normal, label);
    });
  }

  // sentence builders: "Build: <sentence>" must be the sentence; every item ends with punctuation
  for (const key of ["sbPp", "sbPs"]) {
    const items = GROUPS.flatMap(group => (content[key] && content[key][group]) || []);
    const sentences = new Map();
    items.forEach((item, index) => {
      const label = where(key, item, index);
      if (!Array.isArray(item.correct) || item.correct.length < 3) { errors.push(`${label}: needs at least three words`); return; }
      const sentence = item.correct.join(" ");
      if (!/[.?!]$/.test(sentence)) warnings.push(`${label}: the sentence does not end with . ? or !: "${sentence}"`);
      // "Build: They have saved many." quotes the target sentence; "Build: a sentence about …" only describes it.
      const literal = plain(item.prompt).match(/Build:\s*(.+)$/i);
      const target = literal ? literal[1].trim() : "";
      const quoted = /^[A-Z]/.test(target) && !/^(A|An)\s/.test(target) && /[.?!]$/.test(target);
      if (quoted && target.toLowerCase() !== sentence.toLowerCase()) errors.push(`${label}: the prompt says "${literal[1].trim()}" but the words make "${sentence}"`);
      if (/<[a-z]/i.test(item.prompt || "") && /style=/.test(item.prompt)) warnings.push(`${label}: the prompt uses inline styles`);
      if (sentences.has(sentence.toLowerCase())) warnings.push(`${label}: the same sentence appears twice in ${key} (${sentences.get(sentence.toLowerCase())})`); else sentences.set(sentence.toLowerCase(), label);
    });
  }

  // multiple choice, true/false/not given, short answers
  const multipleChoice = [...(content.contextQ || []).map(item => ["contextQ", item]), ...(content.testMcq || []).map(item => ["testMcq", item]), ...(content.readingQ || []).filter(item => item.type === "mcq").map(item => ["readingQ", item])];
  multipleChoice.forEach(([key, item], index) => {
    const label = where(key, item, index);
    if (!Array.isArray(item.options) || item.options.length < 2) errors.push(`${label}: needs at least two options`);
    else {
      if (!item.options.includes(item.correct)) errors.push(`${label}: the correct answer "${item.correct}" is not one of the options`);
      if (new Set(item.options).size !== item.options.length) errors.push(`${label}: repeated options`);
    }
  });
  for (const [key, item] of [...(content.testTfng || []).map(item => ["testTfng", item]), ...(content.readingQ || []).filter(item => item.type === "tfng").map(item => ["readingQ", item])]) {
    if (!["True", "False", "Not Given"].includes(item.answer)) errors.push(`${where(key, item)}: answer must be True, False or Not Given (is "${item.answer}")`);
  }
  for (const [key, item] of [...(content.testShort || []).map(item => ["testShort", item]), ...(content.readingQ || []).filter(item => item.type === "short").map(item => ["readingQ", item])]) {
    if (!Array.isArray(item.answers) || !item.answers.length || item.answers.some(answer => !String(answer).trim())) errors.push(`${where(key, item)}: needs accepted answers`);
  }

  // vocabulary: meanings, translations, examples that use the word; match pairs come from the vocabulary
  const words = new Set((content.vocab || []).map(item => item.en.toLowerCase()));
  (content.vocab || []).forEach((item, index) => {
    const label = `vocab ${item.en || index}`;
    if (!Array.isArray(item.meanings) || !item.meanings.length) { errors.push(`${label}: no meanings`); return; }
    item.meanings.forEach((meaning, number) => {
      if (!meaning.ru) warnings.push(`${label} meaning ${number + 1}: no Russian translation`);
      if (!meaning.context) warnings.push(`${label} meaning ${number + 1}: no short definition`);
      // A meaning may show another form of the word (displayEn: "effect" for "to affect"). Related forms count
      // (eruption / erupt, equipment / equipped): compare the first five letters.
      const stem = String(meaning.displayEn || item.en).toLowerCase().replace(/^(to|the|a|an)\s+/, "").split(" ")[0].slice(0, 5);
      if (meaning.ex && !lower(meaning.ex).includes(stem)) warnings.push(`${label} meaning ${number + 1}: the example does not use the word: "${plain(meaning.ex)}"`);
    });
  });
  // A match pair may use another meaning of a word ("to rest", "the rest" for "rest").
  const base = word => String(word).toLowerCase().replace(/^(to|the|a|an)\s+/, "");
  const bases = new Set([...words].map(base));
  (content.matchData || []).forEach((pair, index) => { if (!bases.has(base(pair.word))) warnings.push(`matchData[${index}] "${pair.word}" is not a vocabulary word`); });
  const matchWords = (content.matchData || []).map(pair => String(pair.word).toLowerCase());
  if (new Set(matchWords).size !== matchWords.length) errors.push("matchData repeats a word");

  // sizes: every lesson should give a full lesson's worth of practice
  const size = key => GROUPS.reduce((sum, group) => sum + ((content[key] && content[key][group]) || []).length, 0);
  if ((content.vocab || []).length < 10) warnings.push(`only ${(content.vocab || []).length} vocabulary words (10 or more expected)`);
  if ((content.readingQ || []).length < 8) warnings.push(`only ${(content.readingQ || []).length} reading questions (8 or more expected)`);
  const tests = ["testMcq", "testShort", "testTfng", "testComplete"].reduce((sum, key) => sum + (content[key] || []).length, 0);
  if (tests < 20) warnings.push(`only ${tests} test questions (20 or more expected)`);
  for (const key of ["g6", "g7", "sbPp", "sbPs", "g10"]) if (content[key] && size(key) < 10) warnings.push(`${key} has only ${size(key)} items (10 or more expected)`);
  const passageWords = plain(content.readingHtml).split(" ").length;
  if (passageWords < 200) warnings.push(`the reading passage has only ${passageWords} words (200 or more expected)`);
  return { name, errors, warnings };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const directory = join(root, "content");
  const files = readdirSync(directory).filter(file => file.endsWith(".json") && file !== "manifest.json" && !file.startsWith("homework_"));
  let errorCount = 0;
  for (const file of files) {
    const result = reviewLesson(file, JSON.parse(readFileSync(join(directory, file), "utf8")));
    console.log(`${result.errors.length ? "FAIL" : result.warnings.length ? "warn" : "ok  "} ${file}`);
    for (const message of result.errors) console.log(`   error:   ${message}`);
    for (const message of result.warnings) console.log(`   warning: ${message}`);
    errorCount += result.errors.length;
  }
  process.exit(errorCount ? 1 : 0);
}
