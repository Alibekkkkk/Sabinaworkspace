// Listening dictation packs: schema validation and gap generation. Pure functions, no DOM, no Firebase.
//
// content/listening/<pack>.json
// { schemaVersion: 1, id, title, level: "A1".."C1",
//   voice: { id, provider: "azure"|"google"|"elevenlabs"|"browser", character: "nora"|"arthur" },
//   items: [{ id, text, audio?: { normal, slow? }, wordTimings?: [{i,start,end}], timingsEstimated?: bool,
//             gaps: { easy: [i...], medium: [i...], hard: "all"|[i...] },
//             alternatives?: { "<wordIndex>": ["answer", ...] }, glosses?: { "<word>": "meaning" },
//             translation?: { ru?, kk? }, lessonTags?: [string], credits }] }
// Word indices count the whitespace-separated words of `text`, starting at 0 (punctuation stays attached).
export const SCHEMA_VERSION = 1;
export const LEVELS_CEFR = Object.freeze(["A1", "A2", "B1", "B2", "C1"]);
export const PROVIDERS = Object.freeze(["azure", "google", "elevenlabs", "browser"]);
export const CHARACTERS = Object.freeze(["nora", "arthur"]);
export const MAX_WORDS = 25;
const ID_PATTERN = /^[A-Za-z0-9_-]{3,64}$/;
const AUDIO_PATH = /^audio\/[A-Za-z0-9_-]+(-slow)?\.mp3$/;
const CREDITS_PATTERN = /^(original|CC0|CC BY|public domain)/i;

// Words that carry little stress and are hardest to hear in connected speech.
export const FUNCTION_WORDS = Object.freeze(new Set([
  "a", "an", "the", "and", "but", "or", "so", "if", "of", "to", "in", "on", "at", "by", "for", "from", "with", "as", "than", "that", "this", "these", "those",
  "is", "am", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "can", "could", "shall", "should", "may", "might", "must",
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them", "my", "your", "his", "its", "our", "their", "not", "no", "there", "then", "who", "which", "what", "when", "where", "how", "why"
]));

export const tokenize = text => String(text || "").split(/\s+/).filter(Boolean);
export const bareWord = token => String(token || "").toLowerCase().replace(/[’‘]/g, "'").replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "");
const nonEmpty = value => typeof value === "string" && value.trim().length > 0;

// ---- gap generation -----------------------------------------------------------------------------------

function isTarget(word, targets) {
  return targets.some(target => word === target || word === `${target}s` || word === `${target}es` || word === `${target}ed` || word === `${target}d` || word === `${target}ing` || word.startsWith(target.slice(0, Math.max(4, target.length - 2))));
}

// Which words to hide for one difficulty. Content words first (lesson target words before the rest, longer
// words before shorter), function words only when the difficulty needs more gaps. Returns sorted indices or "all".
export function pickGaps(text, difficulty, { targets = [] } = {}) {
  const tokens = tokenize(text);
  const wanted = targets.map(target => bareWord(target)).filter(Boolean);
  const words = tokens.map(bareWord);
  const content = []; const functional = [];
  words.forEach((word, index) => {
    if (!/[a-z0-9]/.test(word)) return;
    if (FUNCTION_WORDS.has(word) || word.length < 3) functional.push(index); else content.push(index);
  });
  const byValue = (a, b) => (Number(isTarget(words[b], wanted)) - Number(isTarget(words[a], wanted))) || (words[b].length - words[a].length) || (a - b);
  content.sort(byValue);
  functional.sort((a, b) => a - b);
  if (difficulty === "hard" || difficulty === "expert") return "all";
  const total = content.length + functional.length;
  let count;
  if (difficulty === "easy") count = Math.min(content.length || total, total <= 6 ? 1 : 2);
  else count = Math.max(1, Math.round(total / 2));
  const order = [...content, ...functional];
  return order.slice(0, count).sort((a, b) => a - b);
}

export function generateGaps(text, { targets = [] } = {}) {
  return { easy: pickGaps(text, "easy", { targets }), medium: pickGaps(text, "medium", { targets }), hard: "all" };
}

// The gap indices used at a difficulty ("expert" hides everything like hard).
export function gapsForLevel(item, level) {
  const tokens = tokenize(item.text);
  const all = tokens.map((_, index) => index).filter(index => /[a-z0-9]/i.test(tokens[index]));
  if (level === "hard" || level === "expert") return all;
  const chosen = item.gaps && item.gaps[level];
  return Array.isArray(chosen) ? [...chosen].sort((a, b) => a - b) : all;
}

// ---- validation ---------------------------------------------------------------------------------------

function validateGapList(list, count, where, errors) {
  if (!Array.isArray(list) || !list.length) { errors.push(`${where}: must list at least one word index.`); return; }
  const seen = new Set();
  for (const index of list) {
    if (!Number.isInteger(index) || index < 0 || index >= count) errors.push(`${where}: index ${JSON.stringify(index)} is outside the sentence (0-${count - 1}).`);
    else if (seen.has(index)) errors.push(`${where}: index ${index} is listed twice.`);
    seen.add(index);
  }
}

// fileExists(relativePath) is optional: when given, every audio path must exist.
export function validateListeningPack(pack, { fileExists = null } = {}) {
  const errors = [];
  if (!pack || typeof pack !== "object") return ["The pack must be an object."];
  if (pack.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be ${SCHEMA_VERSION}.`);
  if (typeof pack.id !== "string" || !ID_PATTERN.test(pack.id)) errors.push("id must be 3-64 characters of letters, digits, \"-\" or \"_\".");
  if (!nonEmpty(pack.title)) errors.push("title is required.");
  if (!LEVELS_CEFR.includes(pack.level)) errors.push(`level must be one of ${LEVELS_CEFR.join(", ")}.`);
  const voice = pack.voice;
  if (!voice || typeof voice !== "object") errors.push("voice is required (id, provider, character).");
  else {
    if (!nonEmpty(voice.id)) errors.push("voice.id is required.");
    if (!PROVIDERS.includes(voice.provider)) errors.push(`voice.provider must be one of ${PROVIDERS.join(", ")}.`);
    if (!CHARACTERS.includes(voice.character)) errors.push(`voice.character must be one of ${CHARACTERS.join(", ")}.`);
  }
  if (!Array.isArray(pack.items) || !pack.items.length) { errors.push("items must be a list with at least one sentence."); return errors; }
  const seen = new Set();
  pack.items.forEach((item, position) => {
    const where = `items[${position}]`;
    if (!item || typeof item !== "object") { errors.push(`${where}: must be an object.`); return; }
    if (typeof item.id !== "string" || !ID_PATTERN.test(item.id)) errors.push(`${where}: id must be 3-64 characters of letters, digits, "-" or "_".`);
    else if (seen.has(item.id)) errors.push(`${where}: duplicate id "${item.id}".`);
    else seen.add(item.id);
    if (!nonEmpty(item.text)) { errors.push(`${where}: text is required.`); return; }
    const tokens = tokenize(item.text);
    if (tokens.length > MAX_WORDS) errors.push(`${where}: text has ${tokens.length} words; the limit is ${MAX_WORDS}.`);
    if (!nonEmpty(item.credits) || !CREDITS_PATTERN.test(item.credits.trim())) errors.push(`${where}: credits must start with "original", "CC0", "CC BY" or "public domain" (record the source and licence; never copy copyrighted text).`);
    const gaps = item.gaps;
    if (!gaps || typeof gaps !== "object") errors.push(`${where}: gaps is required (easy, medium, hard).`);
    else {
      validateGapList(gaps.easy, tokens.length, `${where}.gaps.easy`, errors);
      validateGapList(gaps.medium, tokens.length, `${where}.gaps.medium`, errors);
      if (gaps.hard !== "all") validateGapList(gaps.hard, tokens.length, `${where}.gaps.hard`, errors);
    }
    if (item.audio !== undefined) {
      const audio = item.audio;
      if (!audio || typeof audio !== "object") errors.push(`${where}: audio must be an object with normal and optional slow.`);
      else for (const kind of ["normal", "slow"]) {
        if (audio[kind] === undefined) { if (kind === "normal") errors.push(`${where}: audio.normal is required when audio is present.`); continue; }
        if (typeof audio[kind] !== "string" || !AUDIO_PATH.test(audio[kind])) errors.push(`${where}: audio.${kind} must be a path like audio/${item.id}.mp3.`);
        else if (fileExists && !fileExists(audio[kind])) errors.push(`${where}: audio file ${audio[kind]} does not exist.`);
      }
    }
    if (item.wordTimings !== undefined) {
      if (!Array.isArray(item.wordTimings)) errors.push(`${where}: wordTimings must be a list.`);
      else {
        let previous = -1;
        for (const timing of item.wordTimings) {
          if (!timing || !Number.isInteger(timing.i) || timing.i < 0 || timing.i >= tokens.length || typeof timing.start !== "number" || typeof timing.end !== "number" || timing.end <= timing.start || timing.start < previous) { errors.push(`${where}: wordTimings must be { i, start, end } in order with end after start.`); break; }
          previous = timing.start;
        }
      }
    }
    if (item.translation !== undefined) {
      const translation = item.translation;
      if (!translation || typeof translation !== "object" || Object.entries(translation).some(([language, value]) => !/^[a-z]{2}$/.test(language) || !nonEmpty(value) || value.length > 300)) errors.push(`${where}: translation must map two-letter language codes (ru, kk) to text of at most 300 characters.`);
    }
    if (item.alternatives !== undefined) {
      const alternatives = item.alternatives;
      if (!alternatives || typeof alternatives !== "object" || Object.entries(alternatives).some(([index, list]) => !/^\d+$/.test(index) || Number(index) >= tokens.length || !Array.isArray(list) || !list.length || list.some(entry => !nonEmpty(entry)))) errors.push(`${where}: alternatives must map a word index to a list of accepted spellings.`);
    }
    if (item.glosses !== undefined && (!item.glosses || typeof item.glosses !== "object" || Object.values(item.glosses).some(value => !nonEmpty(value) || value.length > 300))) errors.push(`${where}: glosses must map words to short meanings.`);
    if (item.lessonTags !== undefined && (!Array.isArray(item.lessonTags) || item.lessonTags.some(tag => !nonEmpty(tag)))) errors.push(`${where}: lessonTags must be a list of strings.`);
  });
  return errors;
}

// "vocabulary:grasp" -> "grasp": the lesson target words named in an item's tags.
export function targetWordsFromTags(tags) {
  return (Array.isArray(tags) ? tags : []).filter(tag => /^vocabulary:/i.test(tag)).map(tag => tag.slice(tag.indexOf(":") + 1).trim()).filter(Boolean);
}

// Pasted sentences -> draft items for the authoring tool (teacher reviews and exports).
export function draftItemsFromSentences(sentences, { prefix = "item", targets = [], credits = "original" } = {}) {
  return sentences.map(sentence => String(sentence || "").trim()).filter(Boolean).map((text, index) => ({
    id: `${prefix}-${String(index + 1).padStart(3, "0")}`,
    text,
    gaps: generateGaps(text, { targets }),
    lessonTags: targets.filter(target => new RegExp(`\\b${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(text)).map(target => `vocabulary:${target}`),
    credits
  }));
}
