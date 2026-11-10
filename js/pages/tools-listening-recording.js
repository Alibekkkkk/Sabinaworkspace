// tools/listening-recording.html: a listening set from a real recording. The teacher picks a lesson, pastes an audio link
// (or chooses the file when the website does not share it), and Whisper writes the transcript in this browser. The
// sentences, with their start and end times, are checked and edited here, then saved to protectedContent/<lesson>/listening,
// where the student's Listening Training finds them. Nothing is uploaded except the finished set.
import { firebaseConfig } from "../config.js";
import { isTeacher } from "../auth.js";
import { MAX_WORDS, generateGaps, tokenize, validateListeningPack } from "../listening/schema.js";
import { buildRecordingSet, chunksToSentences, normalizeAudioLink, transcriptToSentences } from "../listening/recording.js";
import { decodeAudio, fetchAudio, loadTranscriber, transcribe } from "../listening/whisper.js";

const $ = id => document.getElementById(id);
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const state = { database: null, auth: null, teacher: false, lessons: {}, targets: [], sentences: [], link: "", fileUrl: "", duration: 0, busy: false };

function say(target, message, kind = "") { target.textContent = message; if (kind) target.dataset.kind = kind; else delete target.dataset.kind; }
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
const rights = () => { const choice = document.querySelector('input[name="rights"]:checked').value; const detail = $("rightsDetail").value.trim(); return detail ? `${choice}: ${detail}` : choice; };

// ---- sign-in and lessons -------------------------------------------------------------------------------------------
async function boot() {
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  state.database = firebase.database(); state.auth = firebase.auth();
  $("signInButton").addEventListener("click", async () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    try { await state.auth.signInWithPopup(provider); } catch (error) { if (/popup/i.test(error.code || "")) await state.auth.signInWithRedirect(provider); else say($("accountStatus"), `Sign-in failed: ${error.message}`); }
  });
  state.auth.onAuthStateChanged(async user => {
    state.teacher = await isTeacher(user, state.database).catch(() => false);
    $("signInButton").hidden = state.teacher;
    say($("accountStatus"), state.teacher ? `Signed in as ${user.email || "teacher"}` : user ? "This account is not a teacher account." : "Not signed in.");
    if (state.teacher) await loadLessons();
    refreshButtons();
  });
}

async function loadLessons() {
  const snapshot = await state.database.ref("curriculum").once("value");
  state.lessons = snapshot.val() || {};
  const select = $("lessonSelect");
  const entries = Object.entries(state.lessons).filter(([, lesson]) => lesson && !lesson.homework).sort((a, b) => String(a[1].title || a[0]).localeCompare(String(b[1].title || b[0])));
  select.replaceChildren(el("option", "", "Choose a lesson"), ...entries.map(([id, lesson]) => { const option = el("option", "", lesson.title || id); option.value = id; return option; }));
  select.firstChild.value = "";
  select.disabled = false;
  const wanted = new URLSearchParams(location.search).get("lesson");
  if (wanted && state.lessons[wanted]) { select.value = wanted; await chooseLesson(); }
}

async function chooseLesson() {
  const lessonId = $("lessonSelect").value;
  state.targets = []; $("existingNote").hidden = true; $("removeButton").hidden = true;
  if (!lessonId) { refreshButtons(); return; }
  const [classwork, existing] = await Promise.all([
    state.database.ref(`protectedContent/${lessonId}/classwork/content/vocab`).once("value").then(snapshot => snapshot.val()).catch(() => null),
    state.database.ref(`protectedContent/${lessonId}/listening`).once("value").then(snapshot => snapshot.val()).catch(() => null)
  ]);
  state.targets = (Array.isArray(classwork) ? classwork : Object.values(classwork || {})).map(word => String(word.en || "").replace(/^to\s+/i, "").toLowerCase()).filter(Boolean);
  if (existing && existing.content) {
    const set = existing.content;
    $("setTitle").value = set.title || ""; $("setLevel").value = set.level || "B1"; $("setCharacter").value = (set.voice && set.voice.character) || "nora";
    if (set.source) {
      $("audioLink").value = set.source.url || ""; checkLink();
      const credits = String(set.source.credits || "");
      const choice = [...document.querySelectorAll('input[name="rights"]')].find(input => credits.toLowerCase().startsWith(input.value.toLowerCase()));
      if (choice) { choice.checked = true; $("rightsDetail").value = credits.slice(choice.value.length).replace(/^:\s*/, ""); }
      state.duration = Number(set.source.duration) || 0;
    }
    state.sentences = (set.items || []).map(item => ({ text: item.text, start: item.clip ? item.clip.start : 0, end: item.clip ? item.clip.end : 0 }));
    renderSentences();
    $("existingNote").textContent = `This lesson already has a recording set (${plural(state.sentences.length, "sentence")}, saved ${existing.importedAt ? new Date(existing.importedAt).toLocaleString() : "earlier"}). Edit it below and save again, or remove it.`;
    $("existingNote").hidden = false; $("removeButton").hidden = false;
  }
  refreshButtons();
}

// ---- recording -----------------------------------------------------------------------------------------------------
function checkLink() {
  const { url, problem, note } = normalizeAudioLink($("audioLink").value);
  state.link = url;
  say($("linkNote"), problem || note || (url ? "Link looks like an audio file. Press play below to check it." : ""), problem ? "error" : "");
  if (url) { $("previewAudio").src = url; state.duration = 0; }
  refreshButtons();
}

function audioDuration() {
  const audio = $("previewAudio");
  if (Number.isFinite(audio.duration) && audio.duration > 0) return Promise.resolve(audio.duration);
  return new Promise((resolve, reject) => {
    const done = () => (Number.isFinite(audio.duration) && audio.duration > 0 ? resolve(audio.duration) : reject(new Error("The length of the recording could not be read.")));
    audio.addEventListener("loadedmetadata", done, { once: true });
    audio.addEventListener("error", () => reject(new Error("The recording could not be opened from the link. Check that it plays above.")), { once: true });
    audio.load();
  });
}

function progress(percent, message) {
  $("progressWrap").hidden = percent === null;
  if (percent !== null) { $("progressFill").style.width = `${percent}%`; $("progressWrap").querySelector("[role=progressbar]").setAttribute("aria-valuenow", String(percent)); }
  if (message) say($("makeStatus"), message);
}

async function makeSentences() {
  if (state.busy) return;
  state.busy = true; refreshButtons();
  const mode = $("mode").value;
  try {
    const file = $("audioFile").files[0];
    if (mode === "transcript") {
      const text = $("transcript").value.trim();
      if (!text) throw new Error("Paste the transcript first.");
      progress(30, "Reading the length of the recording…");
      const duration = file ? (await decodeAudio(await file.arrayBuffer())).duration : await audioDuration();
      state.duration = duration;
      state.sentences = transcriptToSentences(text, duration);
      progress(null, `${plural(state.sentences.length, "sentence")}. The times are estimates: play each one and adjust it.`);
    } else {
      progress(2, file ? "Reading the file…" : "Downloading the recording…");
      const buffer = file ? await file.arrayBuffer() : await fetchAudio(state.link);
      progress(6, "Decoding the audio…");
      const { samples, duration } = await decodeAudio(buffer);
      state.duration = duration;
      const transcriber = await loadTranscriber(mode, (percent, message) => progress(Math.round(6 + percent * 0.5), message));
      progress(60, `Writing down what is said (${Math.round(duration)} seconds of audio; this can take about as long as the recording)…`);
      const started = Date.now();
      const ticker = setInterval(() => progress(Math.min(95, 60 + Math.round(((Date.now() - started) / 1000 / Math.max(10, duration * 1.5)) * 35)), null), 1000);
      let chunks;
      try { chunks = await transcribe(transcriber, samples); } finally { clearInterval(ticker); }
      state.sentences = chunksToSentences(chunks, { duration });
      progress(null, `${plural(state.sentences.length, "sentence")} from ${Math.round(duration)} seconds of audio. Check each one below.`);
    }
    renderSentences();
  } catch (error) {
    progress(null); say($("makeStatus"), error.message, "error");
  } finally { state.busy = false; refreshButtons(); }
}

// ---- sentences -----------------------------------------------------------------------------------------------------
let stopAt = 0; let stopTimer = 0;
function playSentence(sentence) {
  const audio = $("previewAudio");
  const file = $("audioFile").files[0];
  if (!state.link && file) { if (!state.fileUrl) state.fileUrl = URL.createObjectURL(file); if (audio.src !== state.fileUrl) audio.src = state.fileUrl; }
  clearInterval(stopTimer);
  const start = () => { try { audio.currentTime = sentence.start; } catch { /* no seeking */ } stopAt = sentence.end; audio.play().catch(() => say($("makeStatus"), "The recording could not be played here.", "error")); stopTimer = setInterval(() => { if (audio.currentTime >= stopAt) { audio.pause(); clearInterval(stopTimer); } }, 40); };
  if (audio.readyState >= 1) start(); else { audio.addEventListener("loadedmetadata", start, { once: true }); audio.load(); }
}

function gapPreview(text) {
  const words = tokenize(text); const gaps = generateGaps(text, { targets: state.targets });
  const line = el("p", "lr-gaps");
  words.forEach((word, index) => { const part = el("span", gaps.easy.includes(index) ? "lr-gap-easy" : gaps.medium.includes(index) ? "lr-gap-medium" : "", `${word} `); line.append(part); });
  return line;
}

function sentenceRow(sentence, index) {
  const row = el("li", "lr-sentence");
  const head = el("div", "lr-sentence__row");
  const play = el("button", "ds-btn ds-btn--secondary ds-btn--small", "▶ Play"); play.type = "button";
  play.setAttribute("aria-label", `Play sentence ${index + 1}`);
  play.addEventListener("click", () => playSentence(sentence));
  const time = (label, key) => {
    const wrap = el("label", "", `${label} `); const input = el("input"); input.type = "number"; input.step = "0.1"; input.min = "0"; input.value = String(sentence[key]);
    input.setAttribute("aria-label", `${label} of sentence ${index + 1} in seconds`);
    input.addEventListener("change", () => { sentence[key] = Math.max(0, Number(input.value) || 0); validateRow(); });
    wrap.append(input, document.createTextNode(" s")); return wrap;
  };
  const remove = el("button", "ds-btn ds-btn--ghost ds-btn--small", "Remove"); remove.type = "button";
  remove.setAttribute("aria-label", `Remove sentence ${index + 1}`);
  remove.addEventListener("click", () => { state.sentences.splice(state.sentences.indexOf(sentence), 1); renderSentences(); });
  head.append(el("strong", "", `${index + 1}.`), play, time("From", "start"), time("to", "end"), remove);
  const text = el("textarea"); text.value = sentence.text; text.rows = 2; text.setAttribute("aria-label", `Words of sentence ${index + 1}`);
  const preview = gapPreview(sentence.text);
  const warning = el("p", "lr-warning"); warning.hidden = true;
  function validateRow() {
    const problems = [];
    if (tokenize(sentence.text).length > MAX_WORDS) problems.push(`More than ${MAX_WORDS} words: split it into two sentences.`);
    if (!(sentence.end > sentence.start)) problems.push("The end must be after the start.");
    if (state.duration && sentence.start >= state.duration) problems.push("This starts after the end of the recording.");
    warning.textContent = problems.join(" "); warning.hidden = !problems.length; row.toggleAttribute("data-warning", problems.length > 0);
  }
  text.addEventListener("input", () => { sentence.text = text.value.replace(/\s+/g, " ").trim(); gapPreviewInto(preview, sentence.text); validateRow(); });
  row.append(head, text, preview, warning);
  validateRow();
  return row;
}
function gapPreviewInto(old, text) { const fresh = gapPreview(text); old.replaceChildren(...fresh.childNodes); return old; }

function renderSentences() {
  $("sentenceList").replaceChildren(...state.sentences.map(sentenceRow));
  $("emptyNote").hidden = state.sentences.length > 0;
  refreshButtons();
}

// ---- save ----------------------------------------------------------------------------------------------------------
function currentSet() {
  return buildRecordingSet({
    lessonId: $("lessonSelect").value, title: $("setTitle").value || `Listening: ${(state.lessons[$("lessonSelect").value] || {}).title || "recording"}`,
    level: $("setLevel").value, character: $("setCharacter").value, sourceUrl: state.link, credits: rights(),
    sentences: state.sentences, targets: state.targets, duration: state.duration
  });
}

async function save() {
  const lessonId = $("lessonSelect").value;
  if (!state.link) { say($("saveStatus"), "Students play the recording from its link, so a working link is needed to save.", "error"); return; }
  const set = currentSet();
  const problems = validateListeningPack(set);
  if (problems.length) { say($("saveStatus"), `Fix before saving: ${problems.slice(0, 3).join(" ")}`, "error"); return; }
  $("saveButton").disabled = true;
  try {
    await state.database.ref(`protectedContent/${lessonId}/listening`).set({ sourceFile: "recording", content: set, importedAt: new Date().toISOString() });
    say($("saveStatus"), `Saved: ${plural(set.items.length, "sentence")}. Students of this lesson now get them in Listening Training.`);
    $("removeButton").hidden = false;
  } catch (error) { say($("saveStatus"), `Could not save: ${error.message}`, "error"); }
  finally { refreshButtons(); }
}

async function removeSet() {
  const lessonId = $("lessonSelect").value;
  if (!lessonId || !window.confirm("Remove the recording set from this lesson? Students go back to the lesson's own listening sentences.")) return;
  try { await state.database.ref(`protectedContent/${lessonId}/listening`).remove(); say($("saveStatus"), "Removed. The lesson uses its own listening sentences again."); $("removeButton").hidden = true; $("existingNote").hidden = true; }
  catch (error) { say($("saveStatus"), `Could not remove: ${error.message}`, "error"); }
}

function download() {
  const set = currentSet();
  const link = el("a"); link.href = URL.createObjectURL(new Blob([JSON.stringify(set, null, 2)], { type: "application/json" })); link.download = `${set.id}.json`;
  document.body.append(link); link.click(); link.remove();
}

function refreshButtons() {
  const lesson = Boolean($("lessonSelect").value);
  const source = Boolean(state.link || $("audioFile").files[0]);
  $("makeButton").disabled = !state.teacher || !lesson || !source || state.busy;
  $("saveButton").disabled = !state.teacher || !lesson || !state.sentences.length || state.busy;
  $("downloadButton").disabled = !state.sentences.length;
}

$("lessonSelect").addEventListener("change", chooseLesson);
$("audioLink").addEventListener("change", checkLink);
$("audioLink").addEventListener("paste", () => setTimeout(checkLink, 0));
$("audioFile").addEventListener("change", () => { if (state.fileUrl) { URL.revokeObjectURL(state.fileUrl); state.fileUrl = ""; } refreshButtons(); });
$("mode").addEventListener("change", () => { $("transcriptField").hidden = $("mode").value !== "transcript"; });
$("makeButton").addEventListener("click", makeSentences);
$("saveButton").addEventListener("click", save);
$("downloadButton").addEventListener("click", download);
$("removeButton").addEventListener("click", removeSet);
window.addEventListener("load", () => boot().catch(error => say($("accountStatus"), `The page could not start: ${error.message}`)));
