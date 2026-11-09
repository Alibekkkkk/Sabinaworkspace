// Reading tasks beyond the classic questions: True/False/Not Given with an evidence sentence, find-the-sentence,
// long answer with a rubric and self-check, and an application question that must use the target grammar.
// Pure functions: validation against the passage, and grading. No DOM, no Firebase.
//
// content.readingTasks = {
//   status: "draft" | "approved",              students see approved tasks only (teacher preview sees drafts)
//   tasks: [
//     { id, type: "tfng", prompt, answer: "True"|"False"|"Not Given", evidence: "<exact sentence>" (not for Not Given), explanation },
//     { id, type: "find", prompt, evidence: "<exact sentence>", explanation },
//     { id, type: "long", prompt, rubric: [{ criterion, keywords: [[...synonyms], ...] }], modelAnswer, wordGuide: { min, max }, explanation },
//     { id, type: "apply", prompt, pattern: "<regex of the target structure>", minSentences: 1-3, modelAnswer, structureHint, explanation }
//   ]
// }
export const TASK_TYPES = Object.freeze(["tfng", "find", "long", "apply"]);
export const TFNG_ANSWERS = Object.freeze(["True", "False", "Not Given"]);
export const MAX_ANSWER_CHARS = 300; // the teacher review queue stores answers up to 300 characters
const ID_PATTERN = /^[A-Za-z0-9_.-]{3,64}$/;

export function taskKey(id) {
  return `rt_${String(id).replace(/[^A-Za-z0-9_-]/g, "_")}`.slice(0, 60);
}
export const taskOkKey = id => `${taskKey(id)}_ok`;

const ENTITIES = { "&amp;": "&", "&nbsp;": " ", "&quot;": '"', "&#39;": "'", "&rsquo;": "’", "&lsquo;": "‘", "&ldquo;": "“", "&rdquo;": "”", "&lt;": "<", "&gt;": ">" };
const decode = text => text.replace(/&(amp|nbsp|quot|#39|rsquo|lsquo|ldquo|rdquo|lt|gt);/g, match => ENTITIES[match] || match);
export const squash = text => String(text || "").replace(/\s+/g, " ").trim();
const key = text => squash(text).toLowerCase().replace(/[’‘]/g, "'");
const nonEmpty = value => typeof value === "string" && value.trim().length > 0;
export const wordCount = text => (String(text || "").match(/[A-Za-z0-9’'-]+/g) || []).length;

// The passage as clickable sentences: [{ index, para: "A", text }]. Headings are skipped; only <p> text counts.
export function passageSentences(html) {
  const out = [];
  for (const block of String(html || "").matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const label = (block[1].match(/<span[^>]*para-label[^>]*>([\s\S]*?)<\/span>/i) || [])[1];
    const body = squash(decode(block[1].replace(/<span[^>]*para-label[^>]*>[\s\S]*?<\/span>/i, "").replace(/<[^>]*>/g, " ")));
    for (const sentence of body.match(/[^.!?]*[A-Za-z0-9][^.!?]*[.!?]+["”’)]*|[^.!?]*[A-Za-z0-9][^.!?]*$/g) || []) {
      const text = squash(sentence);
      if (text) out.push({ index: out.length, para: label ? squash(label.replace(/[^A-Za-z0-9]/g, "")) : "", text });
    }
  }
  return out;
}

export function findSentenceIndex(sentences, evidence) {
  const wanted = key(evidence);
  return sentences.findIndex(sentence => key(sentence.text) === wanted);
}

// ---- rubric -------------------------------------------------------------------------------------------

const wordsOf = text => (String(text || "").toLowerCase().replace(/[’‘]/g, "'").match(/[a-z0-9']+/g) || []);
function groupMet(group, words) {
  return group.some(entry => {
    const parts = wordsOf(entry);
    if (!parts.length) return false;
    if (parts.length === 1) return words.some(word => word === parts[0] || word === `${parts[0]}s` || word === `${parts[0]}es` || word === `${parts[0]}d` || word === `${parts[0]}ed` || word === `${parts[0]}ing`);
    return words.some((_, start) => parts.every((part, offset) => words[start + offset] === part));
  });
}

// One entry per rubric criterion: met when ANY of its keyword groups is found (groups are alternatives:
// ["boat","boats"] or a phrase such as "free food"). Advisory feedback, never a grade.
export function rubricReport(task, text) {
  const words = wordsOf(text);
  const criteria = task.rubric.map(entry => ({ criterion: entry.criterion, met: entry.keywords.some(group => groupMet(Array.isArray(group) ? group : [group], words)) }));
  return { criteria, metCount: criteria.filter(entry => entry.met).length, allMet: criteria.every(entry => entry.met) };
}

// ---- validation ---------------------------------------------------------------------------------------

export function validateReadingTasks(block, passageHtml) {
  const errors = [];
  if (!block || typeof block !== "object") return ["readingTasks must be an object."];
  if (!["draft", "approved"].includes(block.status)) errors.push('status must be "draft" or "approved".');
  if (!Array.isArray(block.tasks) || !block.tasks.length) { errors.push("tasks must be a list with at least one task."); return errors; }
  const sentences = passageSentences(passageHtml);
  const seen = new Set();
  block.tasks.forEach((task, index) => {
    const where = `tasks[${index}]`;
    if (!task || typeof task !== "object") { errors.push(`${where}: must be an object.`); return; }
    if (typeof task.id !== "string" || !ID_PATTERN.test(task.id)) errors.push(`${where}: id must be 3-64 characters of letters, digits, "-", "_" or ".".`);
    else if (seen.has(taskKey(task.id))) errors.push(`${where}: duplicate id "${task.id}".`);
    else seen.add(taskKey(task.id));
    if (!TASK_TYPES.includes(task.type)) { errors.push(`${where}: type must be one of ${TASK_TYPES.join(", ")}.`); return; }
    if (!nonEmpty(task.prompt)) errors.push(`${where}: prompt is required.`);
    if (!nonEmpty(task.explanation)) errors.push(`${where}: explanation is required (shown after a wrong answer).`);
    if (task.type === "tfng") {
      if (!TFNG_ANSWERS.includes(task.answer)) errors.push(`${where}: answer must be True, False or Not Given.`);
      else if (task.answer === "Not Given") { if (task.evidence !== undefined) errors.push(`${where}: a Not Given statement has no evidence sentence; remove evidence.`); }
      else if (!nonEmpty(task.evidence)) errors.push(`${where}: evidence (the exact sentence from the passage) is required for True and False.`);
      else if (findSentenceIndex(sentences, task.evidence) === -1) errors.push(`${where}: the evidence sentence is not a sentence of the passage.`);
    }
    if (task.type === "find") {
      if (!nonEmpty(task.evidence)) errors.push(`${where}: evidence (the exact sentence to find) is required.`);
      else if (findSentenceIndex(sentences, task.evidence) === -1) errors.push(`${where}: the sentence to find is not a sentence of the passage.`);
    }
    if (task.type === "long") {
      const guide = task.wordGuide;
      if (!guide || !Number.isInteger(guide.min) || !Number.isInteger(guide.max) || guide.min < 1 || guide.min >= guide.max) errors.push(`${where}: wordGuide needs whole numbers min and max with min below max.`);
      else if (guide.max * 4 > MAX_ANSWER_CHARS * 1.4) errors.push(`${where}: wordGuide.max is too long for a ${MAX_ANSWER_CHARS}-character answer.`);
      const rubric = task.rubric;
      if (!Array.isArray(rubric) || rubric.length < 2 || rubric.some(entry => !entry || !nonEmpty(entry.criterion) || !Array.isArray(entry.keywords) || !entry.keywords.length || entry.keywords.some(group => (Array.isArray(group) ? !group.length || group.some(word => !nonEmpty(word)) : !nonEmpty(group))))) errors.push(`${where}: rubric needs at least 2 criteria, each with a criterion and keyword groups.`);
      if (!nonEmpty(task.modelAnswer)) errors.push(`${where}: modelAnswer is required.`);
      else {
        if (guide && Number.isInteger(guide.min) && wordCount(task.modelAnswer) < guide.min) errors.push(`${where}: the model answer is shorter than the word guide minimum.`);
        if (task.modelAnswer.length > MAX_ANSWER_CHARS) errors.push(`${where}: the model answer is longer than ${MAX_ANSWER_CHARS} characters.`);
        if (Array.isArray(rubric) && rubric.length && rubric.every(entry => entry && Array.isArray(entry.keywords))) {
          const report = rubricReport(task, task.modelAnswer);
          for (const entry of report.criteria) if (!entry.met) errors.push(`${where}: the model answer does not meet its own criterion "${entry.criterion}".`);
        }
      }
    }
    if (task.type === "apply") {
      let regex = null;
      try { if (!nonEmpty(task.pattern) || task.pattern.length > 200) throw new Error("bad"); regex = new RegExp(task.pattern, "i"); } catch (error) { errors.push(`${where}: pattern must be a valid regular expression of at most 200 characters.`); }
      if (!Number.isInteger(task.minSentences) || task.minSentences < 1 || task.minSentences > 3) errors.push(`${where}: minSentences must be 1, 2 or 3.`);
      if (!nonEmpty(task.structureHint)) errors.push(`${where}: structureHint is required (shown when the structure is missing).`);
      if (!nonEmpty(task.modelAnswer)) errors.push(`${where}: modelAnswer is required.`);
      else if (regex && !regex.test(task.modelAnswer)) errors.push(`${where}: the model answer does not use the target structure.`);
      else if (task.modelAnswer.length > MAX_ANSWER_CHARS) errors.push(`${where}: the model answer is longer than ${MAX_ANSWER_CHARS} characters.`);
    }
  });
  return errors;
}

// ---- grading ------------------------------------------------------------------------------------------

export function checkTfng(task, answer) {
  return answer === task.answer;
}
export function checkEvidence(task, sentences, pickedIndex) {
  const picked = sentences[pickedIndex];
  return Boolean(picked) && key(picked.text) === key(task.evidence);
}

export function countSentences(text) {
  return (String(text || "").match(/[^.!?]*[A-Za-z0-9][^.!?]*[.!?]+/g) || []).length;
}

// Long answer: can be sent when it is long enough and fits the review queue. The rubric never blocks sending.
export function checkLong(task, text) {
  const trimmed = String(text || "").trim();
  const words = wordCount(trimmed);
  const problems = [];
  if (words < task.wordGuide.min) problems.push(`Write at least ${task.wordGuide.min} words (you have ${words}).`);
  if (trimmed.length > MAX_ANSWER_CHARS) problems.push(`Keep it to ${MAX_ANSWER_CHARS} characters so your teacher can read it.`);
  return { ok: problems.length === 0, problems, words, rubric: rubricReport(task, trimmed) };
}

// Application question: the target structure is required, a missing one is explained with the hint.
export function checkApply(task, text) {
  const trimmed = String(text || "").trim();
  const sentences = countSentences(trimmed);
  const structureFound = new RegExp(task.pattern, "i").test(trimmed);
  const problems = [];
  if (sentences < task.minSentences) problems.push(`Write at least ${task.minSentences} sentence${task.minSentences === 1 ? "" : "s"} (each ends with . ! or ?).`);
  if (!structureFound) problems.push(task.structureHint);
  if (trimmed.length > MAX_ANSWER_CHARS) problems.push(`Keep it to ${MAX_ANSWER_CHARS} characters so your teacher can read it.`);
  return { ok: problems.length === 0, problems, sentences, structureFound };
}

export function visibleTasks(block, isTeacher) {
  if (!block || !Array.isArray(block.tasks)) return [];
  return block.status === "approved" || isTeacher ? block.tasks : [];
}
