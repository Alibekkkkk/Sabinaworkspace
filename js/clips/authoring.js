// Pure helpers behind the clip maker on tools/import-content.html, so they can be tested without a page.
import { addProtectedClipAnswers, validateClip } from "./schema.js";
import { clipWarnings, stripAnswers } from "./schema-v2.js";
import { autoExercises } from "./exercises.js";
import { round1 } from "./lines.js";

const ID11 = /^[A-Za-z0-9_-]{11}$/;
export function parseVideoId(value) {
  const text = String(value || "").trim();
  if (ID11.test(text)) return text;
  try {
    const url = new URL(text);
    if (url.hostname === "youtu.be") { const id = url.pathname.slice(1); return ID11.test(id) ? id : ""; }
    if (/(^|\.)youtube(-nocookie)?\.com$/.test(url.hostname)) {
      const fromQuery = url.searchParams.get("v"); if (fromQuery && ID11.test(fromQuery)) return fromQuery;
      const match = /\/(embed|shorts|live)\/([A-Za-z0-9_-]{11})/.exec(url.pathname); if (match) return match[2];
    }
  } catch (error) { /* not an address */ }
  return "";
}

export const slug = text => String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);

export function parseVocabulary(text) {
  return String(text || "").split("\n").map(row => row.trim()).filter(Boolean).map(row => { const [word, ...rest] = row.split("="); return { word: word.trim(), meaning: rest.join("=").trim() }; });
}

// fields: strings from the form; returns { ok, messages, clip, answers }. Never throws.
export function buildClipDraft(fields, state, today = new Date()) {
  const lines = state.lines.map((line, index) => ({ ...line, id: `l${index + 1}` }));
  const type = fields.transcriptType || "original";
  const draft = {
    schemaVersion: 2, id: (fields.id || "").trim(), title: (fields.title || "").trim(), level: fields.level, genre: [fields.genre],
    grammarPoints: String(fields.grammar || "").split(",").map(item => item.trim()).filter(Boolean),
    source: { provider: "youtube", videoId: state.videoId, sourceUrl: `https://www.youtube.com/watch?v=${state.videoId}`, channel: (fields.channel || "").trim(), videoTitle: (fields.videoTitle || "").trim(), rights: fields.rights, attribution: `${(fields.videoTitle || "").trim()}, ${(fields.channel || "").trim()}`, reviewedAt: today.toISOString().slice(0, 10), ...(String(fields.licence || "").trim() ? { licence: fields.licence.trim() } : {}) },
    startSeconds: round1(state.start), endSeconds: round1(state.end), transcriptType: type,
    transcriptNote: type === "original" ? "Original text written by the teacher about the scene; it is not a copy of the video's captions." : type === "excerpt" ? "A short excerpt used for teaching." : "Text used under the licence shown with the video.",
    timingVerified: Boolean(fields.timingVerified), transcript: lines, vocabulary: parseVocabulary(fields.vocabulary)
  };
  const answers = {}; draft.exercises = autoExercises(draft);
  const options = String(fields.gistOptions || "").split("\n").map(item => item.trim()).filter(Boolean);
  if (String(fields.gist || "").trim() && options.length >= 2) { draft.exercises.unshift({ id: "gist-1", type: "gist", prompt: fields.gist.trim(), options }); answers["gist-1"] = options[0]; }
  for (const exercise of draft.exercises) if (exercise.type === "order-lines") answers[exercise.id] = exercise.answer;
  draft.exercises = draft.exercises.map(({ answer, ...rest }) => { void answer; return rest; });
  try {
    validateClip(draft, { requireAnswers: false });
    const protectedClip = addProtectedClipAnswers(draft, answers); validateClip(protectedClip);
    return { ok: true, messages: ["The clip is valid.", ...clipWarnings(draft).map(text => `Warning: ${text}`)], clip: stripAnswers(protectedClip), answers: { [draft.id]: answers } };
  } catch (error) { return { ok: false, messages: [`Fix this first: ${error.message}`] }; }
}
