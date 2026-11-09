// Grammar ladder: rule card + six steps that demand active production, not recognition.
//   1 notice    click the words that make up the target structure in a short text
//   2 complete  type the missing words (accepted-alternatives list)
//   3 build     put word tiles in order (1-3 distractors; capitals and punctuation count)
//   4 correct   a sentence contains an error: type the corrected sentence
//   5 transform rewrite a given sentence using the target structure
//   6 produce   write 2-3 original sentences, self-check against a checklist, goes to the teacher's review queue
// Pure functions: validation of the content block and grading of each step. No DOM, no Firebase.
import { isAnswerCorrect } from "./grading.js";

export const LADDER_STEPS = Object.freeze(["notice", "complete", "build", "correct", "transform", "produce"]);
export const STEP_TITLES = Object.freeze({
  notice: "Notice it", complete: "Complete the sentence", build: "Build the sentence",
  correct: "Correct the error", transform: "Transform", produce: "Use it yourself"
});
export const MIN_ITEMS = Object.freeze({ complete: 3, build: 2, correct: 2, transform: 2 });
export const MAX_PRODUCE_CHARS = 300; // the teacher review queue stores answers up to 300 characters

const ID_PATTERN = /^[A-Za-z0-9_.-]{3,64}$/;

// Realtime Database keys cannot contain ".", and draft keys are limited to 64 characters.
export function ladderKey(id) {
  return `lad_${String(id).replace(/[^A-Za-z0-9_-]/g, "_")}`.slice(0, 64);
}

const words = text => String(text || "").split(/\s+/).filter(Boolean);
const bare = token => token.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "");

// ---- validation ---------------------------------------------------------------------------------

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateItem(step, item, where, errors, seen) {
  if (!item || typeof item !== "object") { errors.push(`${where}: must be an object.`); return; }
  if (typeof item.id !== "string" || !ID_PATTERN.test(item.id)) errors.push(`${where}: id must be 3-64 characters of letters, digits, "-", "_" or ".".`);
  else if (seen.has(ladderKey(item.id))) errors.push(`${where}: duplicate id "${item.id}".`);
  else seen.add(ladderKey(item.id));
  if (!nonEmptyString(item.prompt)) errors.push(`${where}: prompt is required.`);
  if (!nonEmptyString(item.explanation)) errors.push(`${where}: explanation is required (shown when the answer is wrong).`);
  if (item.tags !== undefined && (!Array.isArray(item.tags) || item.tags.some(tag => typeof tag !== "string"))) errors.push(`${where}: tags must be a list of strings.`);
  if (!Array.isArray(item.answers) || !item.answers.length || item.answers.some(answer => !nonEmptyString(answer))) errors.push(`${where}: answers must list at least one accepted answer.`);
  if (step === "transform" && !nonEmptyString(item.given)) errors.push(`${where}: given (the sentence to rewrite) is required.`);
  if (step === "correct" && !nonEmptyString(item.sentence)) errors.push(`${where}: sentence (the sentence containing the error) is required.`);
  if (step === "correct" && nonEmptyString(item.sentence) && Array.isArray(item.answers) && item.answers.some(answer => isAnswerCorrect(item.sentence, [answer]))) errors.push(`${where}: the sentence with the error is also an accepted answer.`);
  if (step === "build") {
    if (!Array.isArray(item.tiles) || item.tiles.some(tile => !nonEmptyString(tile))) { errors.push(`${where}: tiles must be a list of words and punctuation marks.`); return; }
    const first = Array.isArray(item.answers) && nonEmptyString(item.answers[0]) ? item.answers[0] : "";
    const needed = tokenizeSentence(first);
    const pool = [...item.tiles];
    for (const token of needed) {
      const index = pool.indexOf(token);
      if (index === -1) { errors.push(`${where}: tiles are missing "${token}" from the first answer.`); break; }
      pool.splice(index, 1);
    }
    if (pool.length < 1 || pool.length > 3) errors.push(`${where}: use 1 to 3 distractor tiles (found ${pool.length}).`);
  }
}

export function validateLadder(ladder) {
  const errors = [];
  if (!ladder || typeof ladder !== "object") return ["grammarLadder must be an object."];
  if (!nonEmptyString(ladder.topic)) errors.push("topic is required.");
  if (!["draft", "approved"].includes(ladder.status)) errors.push('status must be "draft" or "approved".');
  const rule = ladder.rule;
  if (!rule || typeof rule !== "object") errors.push("rule is required.");
  else {
    if (!nonEmptyString(rule.formula)) errors.push("rule.formula is required.");
    if (!Array.isArray(rule.examples) || rule.examples.length < 2 || rule.examples.some(example => !example || !nonEmptyString(example.en))) errors.push("rule.examples needs at least 2 contrasting examples with an `en` sentence.");
    if (!Array.isArray(rule.l1Errors) || !rule.l1Errors.length || rule.l1Errors.some(entry => !entry || !nonEmptyString(entry.wrong) || !nonEmptyString(entry.right) || !nonEmptyString(entry.why))) errors.push("rule.l1Errors needs at least 1 entry with wrong, right and why (common errors for Kazakh and Russian speakers).");
  }
  const seen = new Set();
  const notice = ladder.notice;
  if (!notice || typeof notice !== "object") errors.push("notice is required.");
  else {
    if (typeof notice.id !== "string" || !ID_PATTERN.test(notice.id)) errors.push("notice: id must be 3-64 characters of letters, digits, \"-\", \"_\" or \".\".");
    else seen.add(ladderKey(notice.id));
    if (!nonEmptyString(notice.prompt)) errors.push("notice: prompt is required.");
    if (!nonEmptyString(notice.text)) errors.push("notice: text is required.");
    if (!nonEmptyString(notice.explanation)) errors.push("notice: explanation is required.");
    if (!Array.isArray(notice.targets) || !notice.targets.length) errors.push("notice: targets must list at least one phrase from the text.");
    else if (nonEmptyString(notice.text)) for (const phrase of notice.targets) if (!noticeTargetIndexes(notice.text, [phrase]).size) errors.push(`notice: target "${phrase}" does not appear in the text.`);
  }
  for (const step of ["complete", "build", "correct", "transform"]) {
    const items = ladder[step];
    if (!Array.isArray(items) || items.length < MIN_ITEMS[step]) { errors.push(`${step}: needs at least ${MIN_ITEMS[step]} items.`); continue; }
    items.forEach((item, index) => validateItem(step, item, `${step}[${index}]`, errors, seen));
  }
  const produce = ladder.produce;
  if (!produce || typeof produce !== "object") errors.push("produce is required.");
  else {
    if (typeof produce.id !== "string" || !ID_PATTERN.test(produce.id)) errors.push("produce: id must be 3-64 characters of letters, digits, \"-\", \"_\" or \".\".");
    else if (seen.has(ladderKey(produce.id))) errors.push(`produce: duplicate id "${produce.id}".`);
    if (!nonEmptyString(produce.prompt)) errors.push("produce: prompt is required.");
    if (!Number.isInteger(produce.minSentences) || produce.minSentences < 1 || produce.minSentences > 3) errors.push("produce: minSentences must be 1, 2 or 3.");
    if (!Array.isArray(produce.checklist) || produce.checklist.length < 2 || produce.checklist.some(entry => !nonEmptyString(entry))) errors.push("produce: checklist needs at least 2 self-check statements.");
    if (produce.pattern !== undefined) {
      try { if (!nonEmptyString(produce.pattern) || produce.pattern.length > 200) throw new Error("bad length"); new RegExp(produce.pattern, "i"); } catch (error) { errors.push("produce: pattern must be a valid regular expression of at most 200 characters."); }
    }
  }
  return errors;
}

// ---- step 1: notice ------------------------------------------------------------------------------

export function noticeTokens(text) {
  return words(text);
}

// Indexes of the tokens that belong to any of the target phrases (every occurrence).
export function noticeTargetIndexes(text, targets) {
  const tokens = words(text).map(bare);
  const indexes = new Set();
  for (const phrase of targets || []) {
    const parts = words(phrase).map(bare);
    if (!parts.length) continue;
    for (let start = 0; start + parts.length <= tokens.length; start++) {
      if (parts.every((part, offset) => tokens[start + offset] === part)) parts.forEach((_, offset) => indexes.add(start + offset));
    }
  }
  return indexes;
}

export function checkNotice(notice, selectedIndexes) {
  const target = noticeTargetIndexes(notice.text, notice.targets);
  const selected = new Set(selectedIndexes);
  const missed = [...target].filter(index => !selected.has(index));
  const extra = [...selected].filter(index => !target.has(index));
  return { ok: missed.length === 0 && extra.length === 0, missed, extra };
}

// ---- steps 2, 4, 5: typed answers --------------------------------------------------------------------

export function checkTyped(item, response) {
  return isAnswerCorrect(String(response ?? ""), item.answers, { mode: "exact" });
}

// ---- step 3: build ------------------------------------------------------------------------------------

// "she", "has", "gone", "." -> "she has gone."  (no space before punctuation)
export function assembleTiles(tiles) {
  return tiles.join(" ").replace(/\s+([.,!?;:])/g, "$1").trim();
}

export function tokenizeSentence(sentence) {
  return String(sentence || "").match(/[A-Za-z0-9'’-]+|[.,!?;:]/g) || [];
}

// Capitals and punctuation matter here, unlike typed answers.
export function checkBuild(item, tiles) {
  const built = assembleTiles(tiles);
  return item.answers.some(answer => answer.trim() === built);
}

// ---- step 6: produce ---------------------------------------------------------------------------------------

export function countSentences(text) {
  return (String(text || "").match(/[^.!?]*[A-Za-z0-9][^.!?]*[.!?]+/g) || []).length;
}

export function checkProduce(item, text, checkedCount) {
  const trimmed = String(text || "").trim();
  const sentences = countSentences(trimmed);
  const problems = [];
  if (sentences < item.minSentences) problems.push(`Write at least ${item.minSentences} sentence${item.minSentences === 1 ? "" : "s"} (each ends with . ! or ?).`);
  if (trimmed.length > MAX_PRODUCE_CHARS) problems.push(`Keep it to ${MAX_PRODUCE_CHARS} characters so your teacher can read it.`);
  if (checkedCount < item.checklist.length) problems.push("Tick every item on the checklist after you have checked your sentences.");
  const patternFound = item.pattern ? new RegExp(item.pattern, "i").test(trimmed) : true;
  return { ok: problems.length === 0, problems, sentences, patternFound };
}

// ---- progress ----------------------------------------------------------------------------------------------

export function stepItemIds(ladder, step) {
  if (step === "notice") return [ladder.notice.id];
  if (step === "produce") return [ladder.produce.id];
  return ladder[step].map(item => item.id);
}

// done: { [itemId]: true }. A step is complete when every item in it is done; steps unlock one after another.
export function ladderProgress(ladder, done) {
  let previousComplete = true;
  const steps = LADDER_STEPS.map(step => {
    const ids = stepItemIds(ladder, step);
    const completed = ids.filter(id => done && done[id]).length;
    const complete = completed === ids.length;
    const unlocked = previousComplete;
    previousComplete = previousComplete && complete;
    return { step, total: ids.length, completed, complete, unlocked };
  });
  return { steps, completeSteps: steps.filter(entry => entry.complete).length, complete: steps.every(entry => entry.complete) };
}
