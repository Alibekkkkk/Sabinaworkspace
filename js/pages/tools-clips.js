// Clip maker on tools/import-content.html: paste a video address, look up its channel and title, mark the clip window on the
// embedded official player, stamp lines while it plays, and download a validated clip plus its private answer keys.
// Nothing is uploaded and no captions are fetched. Exercises are suggested from the lines.
import { buildClipDraft, parseVideoId, slug } from "../clips/authoring.js";
import { formatTime, lineProblems, nextStampStart, round1 } from "../clips/lines.js";
import { loadYouTubeApi, EMBED_HOST } from "../clips/player.js";

const $ = id => document.getElementById(id);
if (!$("clipMaker")) throw new Error("The clip maker section is missing.");
const state = { videoId: "", start: 0, end: 0, lines: [], stampStart: null, player: null, built: null };

const now = () => (state.player && typeof state.player.getCurrentTime === "function" ? round1(Number(state.player.getCurrentTime()) || 0) : 0);
const cell = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };

function paintWindow() { $("cmWindow").textContent = `Start ${formatTime(state.start)} · End ${formatTime(state.end)} (${round1(Math.max(0, state.end - state.start))} seconds)`; }
function paintLines() {
  const body = $("cmLines").querySelector("tbody"); body.replaceChildren();
  state.lines.forEach((line, index) => {
    const row = cell("tr"); row.append(cell("td", String(index + 1)));
    for (const key of ["start", "end"]) { const td = cell("td"); const input = cell("input"); input.type = "number"; input.step = "0.1"; input.value = String(line[key]); input.setAttribute("aria-label", `Line ${index + 1} ${key}`); input.addEventListener("change", () => { line[key] = round1(Number(input.value)); paintLines(); }); td.append(input); row.append(td); }
    row.append(cell("td", `${line.speaker ? `${line.speaker}: ` : ""}${line.text}`));
    const remove = cell("button", "Remove"); remove.type = "button"; remove.addEventListener("click", () => { state.lines.splice(index, 1); paintLines(); }); const td = cell("td"); td.append(remove); row.append(td);
    body.append(row);
  });
  const problems = lineProblems(state.lines, state.start, state.end);
  $("cmLineProblems").textContent = problems.length ? problems.join(" ") : state.lines.length ? `${state.lines.length} line${state.lines.length === 1 ? "" : "s"}, no timing problems.` : "No lines yet.";
  $("cmStampInfo").textContent = state.stampStart === null ? `The next line starts at ${formatTime(nextStampStart(state.lines, state.start))} unless you stamp a start.` : `Start stamped at ${formatTime(state.stampStart)}.`;
}

async function lookup() {
  const id = parseVideoId($("cmUrl").value);
  if (!id) { $("cmLookupStatus").textContent = "That does not look like a YouTube address. Paste the address from the browser's address bar."; return; }
  state.videoId = id; $("cmLookupStatus").textContent = "Looking up the video…";
  try {
    const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`);
    if (response.status === 401) { $("cmLookupStatus").textContent = "The owner does not allow this video to be embedded. Choose another video, or use a link-out clip."; return; }
    if (!response.ok) throw new Error(`YouTube answered ${response.status}`);
    const data = await response.json(); $("cmChannel").value = data.author_name || ""; $("cmVideoTitle").value = data.title || ""; if (!$("cmTitle").value) $("cmTitle").value = data.title || "";
    if (!$("cmId").value) $("cmId").value = slug(data.title); $("cmLookupStatus").textContent = `Found: ${data.title} by ${data.author_name}. Embedding is allowed.`;
  } catch (error) { $("cmLookupStatus").textContent = `The video details could not be fetched (${error.message}). Type the channel and title yourself from the video page.`; }
  try {
    const YT = await loadYouTubeApi(window, 8000); $("cmPlayer").replaceChildren(); const target = document.createElement("div"); target.id = "cmYoutube"; $("cmPlayer").append(target);
    state.player = new YT.Player("cmYoutube", { videoId: id, host: EMBED_HOST, playerVars: { rel: 0, playsinline: 1, autoplay: 0, origin: location.origin }, events: { onReady: () => { for (const button of ["cmMarkStart", "cmMarkEnd", "cmPlayWindow", "cmStampStart", "cmStampEnd"]) $(button).disabled = false; } } });
  } catch (error) { $("cmLookupStatus").textContent += ` The player could not load (${error.message}). You can still type the times by hand in the table.`; }
}

function addLine(start, end) {
  const text = $("cmLineText").value.trim(); if (!text) { $("cmLineProblems").textContent = "Write what is said first."; return; }
  state.lines.push({ id: `l${state.lines.length + 1}`, start: round1(start), end: round1(end), text, ...( $("cmLineSpeaker").value.trim() ? { speaker: $("cmLineSpeaker").value.trim() } : {}), ...($("cmLineTranslation").value.trim() ? { translation: $("cmLineTranslation").value.trim() } : {}) });
  $("cmLineText").value = ""; $("cmLineTranslation").value = ""; state.stampStart = null; paintLines(); $("cmLineText").focus();
}

function build() {
  const out = buildClipDraft({
    id: $("cmId").value, title: $("cmTitle").value, level: $("cmLevel").value, genre: $("cmGenre").value, grammar: $("cmGrammar").value, channel: $("cmChannel").value, videoTitle: $("cmVideoTitle").value,
    rights: $("cmRights").value, licence: $("cmLicence").value, transcriptType: $("cmTranscriptType").value, timingVerified: $("cmTiming").checked, vocabulary: $("cmVocab").value, gist: $("cmGist").value, gistOptions: $("cmGistOptions").value
  }, state);
  state.built = out.ok ? { clip: out.clip, answers: out.answers } : null; $("cmDownload").disabled = !out.ok;
  $("cmMessages").replaceChildren(...out.messages.map(text => cell("li", text)));
}

function download(name, value) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" }); const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

$("cmLookup").addEventListener("click", lookup);
$("cmMarkStart").addEventListener("click", () => { state.start = now(); if (state.end <= state.start) state.end = round1(state.start + 30); paintWindow(); paintLines(); });
$("cmMarkEnd").addEventListener("click", () => { state.end = now(); paintWindow(); paintLines(); });
$("cmPlayWindow").addEventListener("click", () => { if (state.player) { state.player.seekTo(state.start, true); state.player.playVideo(); } });
$("cmStampStart").addEventListener("click", () => { state.stampStart = now(); paintLines(); });
$("cmStampEnd").addEventListener("click", () => addLine(state.stampStart === null ? nextStampStart(state.lines, state.start) : state.stampStart, now()));
$("cmBuild").addEventListener("click", build);
$("cmDownload").addEventListener("click", () => { if (!state.built) return; download(`${state.built.clip.id}.json`, state.built.clip); download(`${state.built.clip.id}.answers.json`, state.built.answers); });
paintWindow(); paintLines();
