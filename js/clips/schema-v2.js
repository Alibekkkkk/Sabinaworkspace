// Clip schema v2: source rights, original transcripts, line timing, vocabulary and nine exercise types.
// validateClipV2 throws one helpful Error for the first thing that is wrong; clipWarnings lists softer problems
// (old review date, too few lines, timing not checked) so the teacher is told without blocking the lesson.
export const GENRES = Object.freeze(["anime", "cartoon", "film", "series", "documentary", "science explainer", "language lesson", "news"]);
export const RIGHTS = Object.freeze(["official-embed", "owned", "CC-BY", "public-domain"]);
export const TRANSCRIPT_TYPES = Object.freeze(["original", "excerpt", "licensed"]);
export const EXERCISE_TYPES = Object.freeze(["before-watch", "gist", "line-gap", "dictation", "order-lines", "who-said", "shadowing", "grammar-spotter", "production"]);
export const LEGACY_EXERCISE_TYPES = Object.freeze(["gap-fill", "listen-pick", "check-understanding"]);
export const MIN_WINDOW = 10;
export const MAX_WINDOW = 90;
export const SECRET_TYPES = Object.freeze(["gist", "order-lines", "grammar-spotter", "gap-fill", "listen-pick"]); // exercises whose answer key stays private
export const MIN_LINES_PER_MINUTE = 8; // a 60 second clip should carry at least eight lines

const CEFR = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);
const ID = /^[a-z0-9][a-z0-9_-]{0,59}$/i;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = value => typeof value === "string" && value.trim().length > 0;
const num = value => typeof value === "number" && Number.isFinite(value);
const fail = message => { throw new Error(message); };

export function validateSource(source, start, end) {
  if (!source || typeof source !== "object") fail("Clip needs a source.");
  if (!["youtube", "link"].includes(source.provider)) fail("Source provider must be youtube (official embed) or link (open the video elsewhere).");
  if (!RIGHTS.includes(source.rights)) fail(`Source rights must be one of: ${RIGHTS.join(", ")}.`);
  if (!text(source.channel) || !text(source.videoTitle) || !text(source.attribution)) fail("Source needs the channel, the video title and an attribution line.");
  if (!DATE.test(String(source.reviewedAt || ""))) fail("Source needs reviewedAt as YYYY-MM-DD.");
  if (["CC-BY", "public-domain"].includes(source.rights) && !text(source.licence)) fail("Openly licensed clips need a licence field with the licence name and URL.");
  if (source.provider === "youtube") {
    if (!YOUTUBE_ID.test(String(source.videoId || ""))) fail("A YouTube source needs an 11-character videoId.");
    if (source.sourceUrl !== `https://www.youtube.com/watch?v=${source.videoId}`) fail("sourceUrl must be the video's own YouTube address.");
  } else {
    let url; try { url = new URL(String(source.url || "")); } catch (error) { fail("A link source needs a valid url."); }
    if (url.protocol !== "https:") fail("A link source must use https.");
    if (!text(source.where)) fail('A link source needs a "where" note, for example "Scene at 12:30 to 13:10 on the studio channel".');
  }
  void start; void end;
}

export function validateLines(lines, start, end) {
  if (!Array.isArray(lines) || !lines.length) fail("Clip needs at least one transcript line.");
  const ids = new Set(); let previousEnd = start;
  lines.forEach((line, index) => {
    const where = `Line ${index + 1}`;
    if (!line || !ID.test(String(line.id || "")) || ids.has(line.id)) fail(`${where} needs a unique id.`);
    ids.add(line.id);
    if (!text(line.text) || line.text.length > 400) fail(`${where} needs text (at most 400 characters).`);
    if (line.translation !== undefined && (!text(line.translation) || line.translation.length > 400)) fail(`${where} has an empty or too long translation.`);
    if (line.speaker !== undefined && (!text(line.speaker) || line.speaker.length > 40)) fail(`${where} has an invalid speaker name.`);
    if (!num(line.start) || !num(line.end)) fail(`${where} needs numeric start and end times.`);
    if (line.start < start || line.end > end) fail(`${where} (${line.start}s to ${line.end}s) is outside the clip window ${start}s to ${end}s.`);
    if (line.end <= line.start) fail(`${where} must end after it starts.`);
    if (line.start < previousEnd - 1e-6) fail(`${where} overlaps or comes before the previous line (it starts at ${line.start}s, the previous ends at ${previousEnd}s).`);
    previousEnd = line.end;
  });
  return ids;
}

function validateVocabulary(vocabulary, lineIds) {
  if (vocabulary === undefined) return;
  if (!Array.isArray(vocabulary)) fail("Clip vocabulary must be a list.");
  for (const item of vocabulary) {
    if (!item || !text(item.word) || item.word.length > 100 || !text(item.meaning) || item.meaning.length > 300) fail("Vocabulary entries need a short word and a meaning.");
    if (item.translation !== undefined && (!text(item.translation) || item.translation.length > 200)) fail(`Vocabulary entry "${item.word}" has an invalid translation.`);
    if (item.example !== undefined && (!text(item.example) || item.example.length > 300)) fail(`Vocabulary entry "${item.word}" has an invalid example.`);
    if (item.lineId !== undefined && !lineIds.has(item.lineId)) fail(`Vocabulary entry "${item.word}" points at a line that does not exist (${item.lineId}).`);
  }
}

const needLine = (exercise, lineIds, field = "lineId") => { if (!lineIds.has(exercise[field])) fail(`Exercise ${exercise.id}: ${field} "${exercise[field]}" is not a line of this clip.`); };

export function validateExercises(exercises, lineIds, { requireAnswers }) {
  if (exercises === undefined) return;
  if (!Array.isArray(exercises)) fail("Clip exercises must be a list.");
  const seen = new Set();
  for (const exercise of exercises) {
    if (!exercise || !ID.test(String(exercise.id || "")) || seen.has(exercise.id)) fail("Every exercise needs a unique id.");
    seen.add(exercise.id);
    if (![...EXERCISE_TYPES, ...LEGACY_EXERCISE_TYPES].includes(exercise.type)) fail(`Exercise ${exercise.id} has an unknown type.`);
    if (!text(exercise.prompt)) fail(`Exercise ${exercise.id} needs a prompt.`);
    const secret = SECRET_TYPES.includes(exercise.type);
    if (LEGACY_EXERCISE_TYPES.includes(exercise.type)) {
      if (!requireAnswers && Object.hasOwn(exercise, "answer")) fail(`Exercise ${exercise.id}: public drafts must not contain answer keys.`);
      if (requireAnswers && !text(exercise.answer)) fail(`Exercise ${exercise.id} needs its answer key.`);
      if (exercise.type === "gap-fill" && !exercise.prompt.includes("____")) fail(`Exercise ${exercise.id}: a gap-fill prompt needs a ____ blank.`);
      if (exercise.type === "listen-pick" && (!Array.isArray(exercise.options) || exercise.options.length < 2 || (text(exercise.answer) && !exercise.options.includes(exercise.answer)))) fail(`Exercise ${exercise.id}: options must include the answer.`);
      continue;
    }
    if (!requireAnswers && secret && Object.hasOwn(exercise, "answer")) fail(`Exercise ${exercise.id}: public drafts must not contain answer keys.`);
    if (requireAnswers && secret && exercise.answer === undefined) fail(`Exercise ${exercise.id} needs its answer key.`);
    switch (exercise.type) {
      case "before-watch":
        if (exercise.words !== undefined && (!Array.isArray(exercise.words) || exercise.words.some(word => !text(word)))) fail(`Exercise ${exercise.id}: words must be a list of words.`);
        break;
      case "gist":
        if (!Array.isArray(exercise.options) || exercise.options.length < 2 || exercise.options.some(option => !text(option))) fail(`Exercise ${exercise.id} needs at least two options.`);
        if (exercise.answer !== undefined && !exercise.options.includes(exercise.answer)) fail(`Exercise ${exercise.id}: the answer must be one of the options.`);
        break;
      case "line-gap": case "dictation": {
        needLine(exercise, lineIds);
        if (!Array.isArray(exercise.hide) && exercise.type === "line-gap") fail(`Exercise ${exercise.id} needs hide: a list of word positions to blank out.`);
        if (exercise.hide !== undefined && (!Array.isArray(exercise.hide) || exercise.hide.some(i => !Number.isInteger(i) || i < 0))) fail(`Exercise ${exercise.id}: hide must be a list of word positions.`);
        break;
      }
      case "order-lines":
        if (!Array.isArray(exercise.lineIds) || exercise.lineIds.length < 3 || new Set(exercise.lineIds).size !== exercise.lineIds.length) fail(`Exercise ${exercise.id} needs at least three different lineIds.`);
        exercise.lineIds.forEach(id => needLine({ ...exercise, lineId: id }, lineIds));
        if (exercise.answer !== undefined && (!Array.isArray(exercise.answer) || exercise.answer.length !== exercise.lineIds.length || exercise.answer.some(id => !exercise.lineIds.includes(id)) || new Set(exercise.answer).size !== exercise.answer.length)) fail(`Exercise ${exercise.id}: the answer must list each line once.`);
        break;
      case "who-said":
        if (!Array.isArray(exercise.lineIds) || !exercise.lineIds.length) fail(`Exercise ${exercise.id} needs lineIds.`);
        exercise.lineIds.forEach(id => needLine({ ...exercise, lineId: id }, lineIds));
        if (!Array.isArray(exercise.speakers) || exercise.speakers.length < 2 || exercise.speakers.some(name => !text(name))) fail(`Exercise ${exercise.id} needs at least two speakers.`);
        break;
      case "shadowing":
        needLine(exercise, lineIds);
        break;
      case "grammar-spotter":
        if (!text(exercise.target)) fail(`Exercise ${exercise.id} needs target: the structure to look for.`);
        if (!Array.isArray(exercise.lineIds) || !exercise.lineIds.length) fail(`Exercise ${exercise.id} needs lineIds to search.`);
        exercise.lineIds.forEach(id => needLine({ ...exercise, lineId: id }, lineIds));
        if (exercise.answer !== undefined && (!Array.isArray(exercise.answer) || exercise.answer.some(entry => typeof entry !== "string" || !/^[A-Za-z0-9_-]+:\d+$/.test(entry) || !exercise.lineIds.includes(entry.split(":")[0])))) fail(`Exercise ${exercise.id}: answer entries look like lineId:wordNumber.`);
        break;
      case "production":
        if (exercise.minWords !== undefined && (!Number.isInteger(exercise.minWords) || exercise.minWords < 1 || exercise.minWords > 200)) fail(`Exercise ${exercise.id}: minWords must be 1 to 200.`);
        break;
      default: break;
    }
  }
}

export function validateClipV2(clip, { requireAnswers = true } = {}) {
  if (!ID.test(String(clip.id || ""))) fail("Clip needs a valid id.");
  if (!text(clip.title)) fail("Clip needs a title.");
  if (!CEFR.has(clip.level)) fail("Clip level must be a CEFR level (A1 to C2).");
  if (!Array.isArray(clip.genre) || !clip.genre.length || clip.genre.some(g => !text(g) || g.length > 40)) fail("Clip needs at least one genre.");
  if (!Array.isArray(clip.grammarPoints) || clip.grammarPoints.some(g => !text(g))) fail("Clip grammarPoints must be a list.");
  const start = clip.startSeconds; const end = clip.endSeconds;
  if (!num(start) || !num(end) || start < 0 || end - start < MIN_WINDOW || end - start > MAX_WINDOW) fail(`The clip window must be ${MIN_WINDOW} to ${MAX_WINDOW} seconds long.`);
  validateSource(clip.source, start, end);
  if (clip.transcriptType === "verbatim-captions") {
    if (!text(clip.licence) && !text(clip.source.licence)) fail('transcriptType "verbatim-captions" is only allowed with a licence field that permits copying the captions.');
  } else if (!TRANSCRIPT_TYPES.includes(clip.transcriptType)) fail(`transcriptType must be one of: ${TRANSCRIPT_TYPES.join(", ")}.`);
  if (!text(clip.transcriptNote)) fail("Clip needs a transcriptNote that tells learners where the text comes from.");
  if (typeof clip.timingVerified !== "boolean") fail("Clip needs timingVerified: true or false.");
  const lineIds = validateLines(clip.transcript, start, end);
  validateVocabulary(clip.vocabulary, lineIds);
  validateExercises(clip.exercises, lineIds, { requireAnswers });
  if (clip.cultural !== undefined && (!Array.isArray(clip.cultural) || clip.cultural.some(note => !text(note)))) fail("Clip cultural notes must be a list of text.");
  return clip;
}

const MONTH = 30.44 * 86400000;
export function clipWarnings(clip, now = Date.now()) {
  const warnings = [];
  if (clip.schemaVersion !== 2) { warnings.push("Old clip format: upgrade it to version 2."); return warnings; }
  const reviewed = Date.parse(`${clip.source.reviewedAt}T00:00:00Z`);
  if (Number.isFinite(reviewed) && now - reviewed > 12 * MONTH) warnings.push("The rights review is more than 12 months old. Check the video is still available and embeddable.");
  if (!clip.timingVerified) warnings.push("Line timing has not been checked against the video, so line highlighting and looping are off.");
  const seconds = clip.endSeconds - clip.startSeconds;
  const wanted = Math.ceil((seconds / 60) * MIN_LINES_PER_MINUTE);
  if (clip.transcript.length < wanted) warnings.push(`A ${Math.round(seconds)} second clip should have at least ${wanted} transcript lines (it has ${clip.transcript.length}).`);
  const types = new Set((clip.exercises || []).map(exercise => exercise.type));
  if (types.size < 4) warnings.push(`Use at least four kinds of exercise (this clip has ${types.size}).`);
  return warnings;
}

// Students see the clip with its full activities only when the teacher has verified the timing.
export const isInteractive = clip => clip.schemaVersion === 2 && clip.timingVerified === true;

export function stripAnswers(clip) {
  return { ...clip, exercises: (clip.exercises || []).map(({ answer, ...rest }) => { void answer; return rest; }) };
}

// Convert a version 1 clip (one practice line, whole-clip timing) to version 2. Timing stays unverified.
export function migrateV1(clip) {
  const transcript = clip.transcript.map(line => ({ id: line.id, start: line.startSeconds, end: line.endSeconds, text: line.text, ...(line.translation ? { translation: line.translation } : {}) }));
  const source = { provider: "youtube", videoId: clip.source.videoId, sourceUrl: clip.source.sourceUrl, channel: clip.source.channel, videoTitle: clip.source.videoTitle, rights: clip.source.rights, attribution: `${clip.source.videoTitle}, ${clip.source.channel} (official YouTube video, embedded with the official player)`, reviewedAt: clip.source.reviewedAt };
  return {
    schemaVersion: 2, id: clip.id, title: clip.title, level: clip.level, genre: clip.genre, grammarPoints: clip.grammarPoints, vocabularyThemes: clip.vocabularyThemes,
    source, startSeconds: clip.startSeconds, endSeconds: clip.endSeconds,
    transcriptType: "original", transcriptNote: clip.transcriptNote, timingVerified: false,
    transcript,
    vocabulary: (clip.vocabulary || []).map(item => ({ word: item.word, meaning: item.definition, translation: item.translation })),
    exercises: (clip.exercises || []).map(exercise => (exercise.type === "check-understanding" ? { id: exercise.id, type: "gist", prompt: exercise.prompt, options: exercise.options, ...(exercise.answer ? { answer: exercise.answer } : {}) } : exercise))
  };
}

// Which exercises have a secret answer key that the teacher supplies privately at import time.
export const secretExercises = clip => (clip.exercises || []).filter(exercise => SECRET_TYPES.includes(exercise.type));

export function addProtectedAnswersV2(clip, answers) {
  validateClipV2(clip, { requireAnswers: false });
  const secret = secretExercises(clip);
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) { if (!secret.length) answers = {}; else fail(`Private answer keys are required for clip ${clip.id}.`); }
  const expected = new Set(secret.map(exercise => exercise.id)); const supplied = Object.keys(answers);
  if (supplied.length !== expected.size || supplied.some(id => !expected.has(id))) fail(`Private answer keys must match the exercises that need one in clip ${clip.id}: ${[...expected].join(", ") || "none"}.`);
  return validateClipV2({ ...clip, exercises: clip.exercises.map(exercise => (expected.has(exercise.id) ? { ...exercise, answer: answers[exercise.id] } : exercise)) });
}
