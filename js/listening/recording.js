// Listening sets made from a real recording: the teacher pastes a link to an audio file, the browser transcribes it
// (js/listening/whisper.js), and each sentence becomes a dictation item that plays its own stretch of the recording.
// Pure functions: no DOM, no network.
import { MAX_WORDS, generateGaps, tokenize } from "./schema.js";

export const LINK_PROBLEMS = Object.freeze({
  empty: "Paste a link to an audio file.",
  notHttps: "The link must start with https://.",
  video: "YouTube and other video pages cannot be used: a browser cannot read their sound. Use a link to an audio file (.mp3, .m4a, .wav, .ogg), or download the audio and choose the file.",
  page: "This looks like a web page, not an audio file. Open the page, find the download or audio link, and paste that."
});
const VIDEO_HOSTS = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|instagram\.com|facebook\.com)$/i;
const AUDIO_EXTENSION = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)$/i;

// Share links that have a direct-download form: Google Drive, Dropbox and OneDrive.
export function normalizeAudioLink(raw) {
  const text = String(raw || "").trim();
  if (!text) return { url: "", problem: LINK_PROBLEMS.empty };
  let url;
  try { url = new URL(text); } catch { return { url: "", problem: LINK_PROBLEMS.notHttps }; }
  const local = url.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(url.hostname); // the local test server only
  if (url.protocol !== "https:" && !local) return { url: "", problem: LINK_PROBLEMS.notHttps };
  if (VIDEO_HOSTS.test(url.hostname)) return { url: "", problem: LINK_PROBLEMS.video };
  if (/(^|\.)drive\.google\.com$/i.test(url.hostname)) {
    const id = (url.pathname.match(/\/file\/d\/([^/]+)/) || [])[1] || url.searchParams.get("id");
    if (id) return { url: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`, problem: "", note: "Google Drive link turned into a direct download. The file must be shared with “anyone with the link”." };
  }
  if (/(^|\.)dropbox\.com$/i.test(url.hostname)) {
    url.searchParams.delete("dl"); url.searchParams.set("raw", "1");
    return { url: url.href, problem: "", note: "Dropbox link turned into a direct link." };
  }
  if (/(^|\.)1drv\.ms$|(^|\.)onedrive\.live\.com$/i.test(url.hostname)) {
    url.searchParams.set("download", "1");
    return { url: url.href, problem: "", note: "OneDrive link turned into a download link." };
  }
  if (!AUDIO_EXTENSION.test(url.pathname) && /\.(html?|php|aspx?)$/i.test(url.pathname)) return { url: "", problem: LINK_PROBLEMS.page };
  return { url: url.href, problem: "" };
}

const round = value => Math.round(value * 100) / 100;

// Splits one piece of text into sentences: at . ! ? followed by a space, then long sentences at commas, then every
// MAX_WORDS words. A piece of fewer than three words joins its neighbour (the previous sentence when there is one).
export function splitSentences(text, maxWords = MAX_WORDS) {
  const raw = String(text || "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+(?=\S)/).filter(Boolean);
  const pieces = [];
  for (const sentence of raw) {
    if (tokenize(sentence).length <= maxWords) { pieces.push(sentence); continue; }
    let buffer = [];
    for (const part of sentence.split(/(?<=,)\s+/)) {
      const words = tokenize(part);
      if (buffer.length && buffer.length + words.length > maxWords) { pieces.push(buffer.join(" ")); buffer = []; }
      for (const word of words) { if (buffer.length === maxWords) { pieces.push(buffer.join(" ")); buffer = []; } buffer.push(word); }
    }
    if (buffer.length) pieces.push(buffer.join(" "));
  }
  const merged = [];
  for (const piece of pieces) {
    const last = merged[merged.length - 1];
    const short = tokenize(piece).length < 3 || (last && tokenize(last).length < 3);
    if (last && short && tokenize(last).length + tokenize(piece).length <= maxWords) merged[merged.length - 1] = `${last} ${piece}`;
    else merged.push(piece);
  }
  return merged;
}

// Whisper chunks [{ text, timestamp: [start, end] }] -> sentences [{ text, start, end }]. A chunk can hold several
// sentences and a sentence can run across chunks, so the text is joined first and every character carries the time of
// its chunk (spread evenly inside it); each sentence then takes the time of its first and last characters.
export function chunksToSentences(chunks, { duration = 0, maxWords = MAX_WORDS } = {}) {
  const list = (Array.isArray(chunks) ? chunks : []).filter(chunk => chunk && String(chunk.text || "").trim());
  let text = ""; const times = [];
  list.forEach((chunk, index) => {
    const start = Number(chunk.timestamp && chunk.timestamp[0]) || 0;
    const fallbackEnd = index + 1 < list.length ? Number(list[index + 1].timestamp && list[index + 1].timestamp[0]) : duration;
    const end = Number(chunk.timestamp && chunk.timestamp[1]) || fallbackEnd || start + 2;
    const piece = (text ? " " : "") + String(chunk.text).trim();
    for (let i = 0; i < piece.length; i++) times.push(start + ((end - start) * i) / Math.max(1, piece.length - 1));
    text += piece;
  });
  return sentencesWithTimes(text, times, { duration, maxWords });
}

// A transcript the teacher already has (no timings): times are spread over the recording by length.
export function transcriptToSentences(transcript, duration, { maxWords = MAX_WORDS } = {}) {
  const text = String(transcript || "").replace(/\s+/g, " ").trim();
  const times = [...text].map((_, i) => (duration * i) / Math.max(1, text.length - 1));
  return sentencesWithTimes(text, times, { duration, maxWords, estimated: true });
}

function sentencesWithTimes(text, times, { duration, maxWords, estimated = false }) {
  const sentences = []; let cursor = 0;
  for (const sentence of splitSentences(text, maxWords)) {
    const at = text.indexOf(sentence.split(" ")[0], cursor);
    const from = at === -1 ? cursor : at;
    const to = Math.min(text.length - 1, from + sentence.length - 1);
    cursor = to + 1;
    sentences.push({ text: sentence, start: round(times[from] || 0), end: round(times[to] || duration || 0), estimated });
  }
  return sentences.map(sentence => ({ ...sentence, ...padClip(sentence.start, sentence.end, duration) }));
}

// A little air around each sentence so the first and last words are not cut off.
export function padClip(start, end, duration = 0, { before = 0.15, after = 0.35 } = {}) {
  const limit = duration > 0 ? duration : Infinity;
  const from = Math.max(0, start - before);
  const to = Math.min(limit, Math.max(end + after, from + 0.5));
  return { start: round(from), end: round(to) };
}

const slug = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "recording";

// The listening set saved for a lesson. sentences: [{ text, start, end }] after the teacher's edits.
export function buildRecordingSet({ lessonId, title, level = "B1", character = "nora", sourceUrl, credits, sentences, targets = [], duration = 0, status = "approved" }) {
  const prefix = `${slug(lessonId)}-rec`;
  return {
    schemaVersion: 1,
    id: `${slug(lessonId)}-recording`,
    title: String(title || "Listening from a recording").trim(),
    level, status,
    voice: { id: "recording", provider: "browser", character },
    source: { url: sourceUrl, credits: String(credits || "").trim(), ...(duration > 0 ? { duration: round(duration) } : {}) },
    items: sentences.filter(sentence => String(sentence.text || "").trim()).map((sentence, index) => ({
      id: `${prefix}-${String(index + 1).padStart(3, "0")}`,
      text: String(sentence.text).trim(),
      clip: { start: round(Number(sentence.start) || 0), end: round(Number(sentence.end) || 0) },
      gaps: generateGaps(String(sentence.text).trim(), { targets }),
      credits: String(credits || "").trim()
    }))
  };
}
