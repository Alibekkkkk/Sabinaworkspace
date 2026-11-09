import { addProtectedAnswersV2, validateClipV2 } from "./schema-v2.js";

const CEFR_LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const TAG_PATTERN = /^[a-z0-9][a-z0-9 -]{0,59}$/i;

function isString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function assertTags(value, name) {
  if (!Array.isArray(value) || value.length === 0 ||
      value.some(tag => !isString(tag) || !TAG_PATTERN.test(tag))) {
    throw new Error(`${name} must be a non-empty list of short text tags.`);
  }
}

export function validateClip(clip, { requireAnswers = true } = {}) {
  if (!clip || typeof clip !== "object" || Array.isArray(clip)) {
    throw new Error("Clip must be a JSON object.");
  }
  if (clip.schemaVersion === 2) return validateClipV2(clip, { requireAnswers });
  if (clip.schemaVersion !== 1) throw new Error("Unsupported clip schema version.");
  if (!/^[a-z0-9][a-z0-9-]{1,59}$/i.test(String(clip.id || ""))) {
    throw new Error("Clip needs a valid ID.");
  }
  if (!isString(clip.title)) throw new Error("Clip needs a title.");
  if (!CEFR_LEVELS.has(clip.level)) throw new Error("Clip level must be a CEFR level.");
  assertTags(clip.genre, "Genre");
  assertTags(clip.grammarPoints, "Grammar points");
  assertTags(clip.vocabularyThemes, "Vocabulary themes");

  const source = clip.source;
  if (!source || source.provider !== "youtube" ||
      !YOUTUBE_ID_PATTERN.test(String(source.videoId || ""))) {
    throw new Error("Clip source must use an official YouTube video ID.");
  }
  if (!isString(source.channel) || !isString(source.videoTitle) ||
      source.rights !== "official-embed" ||
      source.sourceUrl !== `https://www.youtube.com/watch?v=${source.videoId}`) {
    throw new Error("Clip source needs attribution and the official-embed rights marker.");
  }

  const start = clip.startSeconds;
  const end = clip.endSeconds;
  if (!Number.isInteger(start) || !Number.isInteger(end) ||
      start < 0 || end <= start || end - start < 10 || end - start > 60) {
    throw new Error("Clip segment must be between 10 and 60 seconds.");
  }

  if (!["verified", "teacher-created"].includes(clip.transcriptType) ||
      !isString(clip.transcriptNote)) {
    throw new Error("Clip needs a transcript type and learner-facing transcript note.");
  }
  if (!Array.isArray(clip.transcript) || clip.transcript.length === 0) {
    throw new Error("Clip needs at least one transcript line.");
  }
  const lineIds = new Set();
  for (const line of clip.transcript) {
    if (!line || !/^[a-z0-9][a-z0-9_-]{0,59}$/i.test(String(line.id || "")) ||
        lineIds.has(line.id) || !isString(line.text) || !isString(line.translation)) {
      throw new Error("Transcript lines need unique IDs, text, and translations.");
    }
    lineIds.add(line.id);
    if (!Number.isInteger(line.startSeconds) || !Number.isInteger(line.endSeconds) ||
        line.startSeconds < start || line.endSeconds > end ||
        line.endSeconds <= line.startSeconds) {
      throw new Error("Transcript line timing must stay within the clip segment.");
    }
  }

  if (!Array.isArray(clip.vocabulary || [])) throw new Error("Clip vocabulary must be a list.");
  for (const item of clip.vocabulary || []) {
    if (!item || !isString(item.word) || !isString(item.translation) ||
        !isString(item.definition) || item.word.length > 100 ||
        item.translation.length > 200 || item.definition.length > 300) {
      throw new Error("Clip vocabulary entries need short words, translations, and definitions.");
    }
  }

  if (!Array.isArray(clip.exercises || [])) throw new Error("Clip exercises must be a list.");
  for (const exercise of clip.exercises || []) {
    if (!exercise || !/^[a-z0-9][a-z0-9_-]{0,59}$/i.test(String(exercise.id || "")) ||
        !["gap-fill", "listen-pick", "check-understanding"].includes(exercise.type) ||
        !isString(exercise.prompt)) {
      throw new Error("Clip exercise has an invalid ID, type, or prompt.");
    }
    if (!requireAnswers && Object.prototype.hasOwnProperty.call(exercise, "answer")) {
      throw new Error("Public clip drafts must not contain answer keys.");
    }
    if (requireAnswers && !isString(exercise.answer)) {
      throw new Error("Clip quiz exercises need an answer.");
    }
    if (["listen-pick", "check-understanding"].includes(exercise.type) &&
        (!Array.isArray(exercise.options) || exercise.options.length < 2 ||
         exercise.options.some(option => !isString(option) || option.length > 160) ||
         (isString(exercise.answer) && !exercise.options.includes(exercise.answer)))) {
      throw new Error("Multiple-choice options must include the answer.");
    }
    if (exercise.type === "gap-fill" && !exercise.prompt.includes("____")) {
      throw new Error("Gap-fill prompts must include a ____ blank.");
    }
  }
  return clip;
}

export function addProtectedClipAnswers(clip, answers) {
  if (clip && clip.schemaVersion === 2) return addProtectedAnswersV2(clip, answers);
  validateClip(clip, { requireAnswers: false });
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    throw new Error(`Private answer keys are required for clip ${clip.id}.`);
  }
  const expectedIds = new Set(clip.exercises.map(exercise => exercise.id));
  const suppliedIds = Object.keys(answers);
  if (suppliedIds.length !== expectedIds.size ||
      suppliedIds.some(id => !expectedIds.has(id))) {
    throw new Error(`Private answer keys must match the exercises in clip ${clip.id}.`);
  }
  const protectedClip = {
    ...clip,
    exercises: clip.exercises.map(exercise => ({
      ...exercise,
      answer: answers[exercise.id]
    }))
  };
  return validateClip(protectedClip);
}

export function clipEmbedUrl(clip) {
  const source = clip && clip.source;
  if (!source || source.provider !== "youtube") throw new Error("Only YouTube clips can be embedded.");
  if (!YOUTUBE_ID_PATTERN.test(String(source.videoId || ""))) throw new Error("Clip source must use an official YouTube video ID.");
  if (!Number.isFinite(clip.startSeconds) || !Number.isFinite(clip.endSeconds) || clip.endSeconds <= clip.startSeconds) throw new Error("Clip needs a valid time window.");
  const url = new URL(`https://www.youtube-nocookie.com/embed/${source.videoId}`);
  url.searchParams.set("start", String(Math.floor(clip.startSeconds)));
  url.searchParams.set("end", String(Math.ceil(clip.endSeconds)));
  url.searchParams.set("rel", "0");
  url.searchParams.set("enablejsapi", "1");
  return url.href;
}
