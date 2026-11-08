import {
  assessPlacement, buildPlacementRecord, canRetake, checkPlacementAnswer, createPlacementSession, MAX_ITEMS,
  nextPlacementItem, nextRetakeAt, recordPlacementAnswer, shouldStopPlacement, tagLabel, validatePlacementItems
} from "./placement.js";

const $ = id => document.getElementById(id);
const ESTIMATED_TOTAL = 24;

let items = [];
let history = []; // [{ item, response, correct }]
let current = null; // { item, response }
let startedAt = 0;
let studentCode = "";
let db = null;
let previous = null;

function sessionFromHistory() {
  return history.reduce((session, entry) => recordPlacementAnswer(session, entry.item, entry.correct), createPlacementSession());
}

function show(card) {
  for (const id of ["introCard", "questionCard", "resultCard"]) $(id).hidden = id !== card;
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

// ---- question rendering -----------------------------------------------------------------------

function setResponse(response, ready) {
  current.response = response;
  $("nextButton").disabled = !ready;
  $("questionError").textContent = "";
}

function renderChoices(item) {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "placement-options";
  const legend = document.createElement("legend");
  legend.className = "placement-prompt";
  legend.textContent = item.prompt;
  fieldset.append(legend);
  item.options.forEach((option, index) => {
    const label = document.createElement("label");
    label.className = "placement-option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "choice";
    input.value = String(index);
    input.addEventListener("change", () => setResponse(index, true));
    const key = document.createElement("span");
    key.className = "key";
    key.setAttribute("aria-hidden", "true");
    key.textContent = String(index + 1);
    const text = document.createElement("span");
    text.textContent = option;
    label.append(input, key, text);
    fieldset.append(label);
  });
  return fieldset;
}

function speak(text) {
  if (!("speechSynthesis" in window)) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-GB";
  utterance.rate = 0.9;
  const voice = window.speechSynthesis.getVoices().find(candidate => /^en-GB/i.test(candidate.lang));
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
  return true;
}

function renderListening(item) {
  const wrapper = document.createElement("div");
  const audio = document.createElement("div");
  audio.className = "placement-audio";
  const play = document.createElement("button");
  play.type = "button";
  play.className = "placement-secondary";
  play.textContent = "▶ Play audio";
  const note = document.createElement("span");
  note.className = "placement-note";
  note.setAttribute("aria-live", "polite");
  play.addEventListener("click", () => {
    if (speak(item.audioText)) {
      note.textContent = "You can play it again.";
    } else {
      note.textContent = `Audio is not available on this device. Read instead: “${item.audioText}”`;
    }
  });
  audio.append(play, note);
  wrapper.append(audio, renderChoices(item));
  return wrapper;
}

function renderGap(item) {
  const wrapper = document.createElement("div");
  const label = document.createElement("label");
  label.className = "placement-prompt";
  label.htmlFor = "gapInput";
  label.textContent = item.prompt;
  label.style.display = "block";
  const input = document.createElement("input");
  input.id = "gapInput";
  input.className = "placement-input";
  input.type = "text";
  input.autocomplete = "off";
  input.autocapitalize = "none";
  input.spellcheck = false;
  input.maxLength = 60;
  input.addEventListener("input", () => setResponse(input.value, input.value.trim().length > 0));
  wrapper.append(label, input);
  return wrapper;
}

function renderOrder(item) {
  const wrapper = document.createElement("div");
  const prompt = document.createElement("p");
  prompt.className = "placement-prompt";
  prompt.textContent = `${item.prompt} Tap the words in the right order.`;
  const answer = document.createElement("div");
  answer.className = "placement-words answer";
  answer.setAttribute("aria-label", "Your sentence");
  answer.setAttribute("aria-live", "polite");
  const bank = document.createElement("div");
  bank.className = "placement-words";
  bank.setAttribute("aria-label", "Available words");
  const chosen = [];
  const order = item.words.map((word, index) => ({ word, index, used: false }));
  // Fixed shuffle so a re-render (Back) shows the same arrangement.
  order.sort((a, b) => ((a.index * 7 + item.id.length) % 11) - ((b.index * 7 + item.id.length) % 11));

  function refresh() {
    answer.replaceChildren(...chosen.map(entry => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "placement-word";
      button.textContent = entry.word;
      button.setAttribute("aria-label", `Remove ${entry.word}`);
      button.addEventListener("click", () => { entry.used = false; chosen.splice(chosen.indexOf(entry), 1); refresh(); });
      return button;
    }));
    bank.replaceChildren(...order.map(entry => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "placement-word";
      button.textContent = entry.word;
      button.disabled = entry.used;
      button.addEventListener("click", () => { entry.used = true; chosen.push(entry); refresh(); bank.querySelector("button:not([disabled])")?.focus(); });
      return button;
    }));
    setResponse(chosen.map(entry => entry.word), chosen.length === item.words.length);
  }
  refresh();
  wrapper.append(prompt, answer, bank);
  return wrapper;
}

function renderQuestion() {
  const session = sessionFromHistory();
  const item = nextPlacementItem(session, items);
  current = { item, response: null };
  const number = history.length + 1;
  $("questionHeading").textContent = `Question ${number}`;
  $("progressText").textContent = `${number} / ${Math.max(ESTIMATED_TOTAL, number)}`;
  const percent = Math.min(100, Math.round(((number - 1) / Math.max(ESTIMATED_TOTAL, number)) * 100));
  $("progressFill").style.width = `${percent}%`;
  $("progressBar").setAttribute("aria-valuenow", String(percent));
  $("backButton").disabled = history.length === 0;
  $("nextButton").disabled = true;
  $("nextButton").textContent = "Next";
  const body = item.type === "listening" ? renderListening(item)
    : item.type === "gap" ? renderGap(item)
    : item.type === "order" ? renderOrder(item)
    : renderChoices(item);
  $("questionBody").replaceChildren(body);
  $("questionHint").textContent = item.type === "mcq" || item.type === "listening"
    ? "Tip: press 1, 2 or 3 to choose, then Enter."
    : item.type === "gap" ? "Type the missing word(s), then press Enter." : "";
  (body.querySelector("input, button") || $("nextButton")).focus({ preventScroll: true });
}

function advance() {
  if (!current || current.response === null || $("nextButton").disabled) return;
  history.push({ item: current.item, response: current.response, correct: checkPlacementAnswer(current.item, current.response) });
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (shouldStopPlacement(sessionFromHistory(), items) || history.length >= MAX_ITEMS) finish();
  else renderQuestion();
}

function goBack() {
  if (!history.length) return;
  history.pop();
  renderQuestion();
}

// ---- result ---------------------------------------------------------------------------------------

function fillList(list, values, emptyText) {
  list.replaceChildren(...(values.length ? values : [emptyText]).map(value => {
    const li = document.createElement("li");
    li.textContent = value;
    return li;
  }));
}

function showAssessment(assessment) {
  $("resultLevel").textContent = assessment.cefr;
  const sure = assessment.confidence >= 0.75 ? "fairly confident" : assessment.confidence >= 0.5 ? "moderately confident" : "not very sure";
  $("resultSummary").textContent = `${assessment.guidance} (You answered ${assessment.correct} of ${assessment.answered} correctly; this estimate is ${sure}.)`;
  fillList($("resultStrengths"), assessment.strengths.map(tagLabel), "Keep going — more practice will show your strengths.");
  fillList($("resultWeaknesses"), assessment.weaknesses.map(tagLabel), "Nothing stood out. Nice work!");
  const path = $("resultPath");
  path.replaceChildren(...assessment.suggestedPath.map(step => {
    const li = document.createElement("li");
    li.textContent = step.label;
    return li;
  }));
}

async function finish() {
  const assessment = assessPlacement(history.map(entry => ({ id: entry.item.id, cefr: entry.item.cefr, tag: entry.item.tag, correct: entry.correct })));
  show("resultCard");
  showAssessment(assessment);
  $("resultTitle").focus();
  const status = $("saveStatus");
  if (!studentCode) {
    status.textContent = "You are not signed in as a student, so this result was not saved.";
    return;
  }
  if (previous && !canRetake(previous.takenAt)) {
    status.textContent = `Not saved: you can save a new result after ${formatDate(nextRetakeAt(previous.takenAt))}. Ask your teacher if you need a reset.`;
    return;
  }
  try {
    const record = buildPlacementRecord(assessment, history.map(entry => ({ id: entry.item.id, correct: entry.correct })), Date.now() - startedAt);
    await db.ref(`studentProgress/${studentCode}/placement`).set({ ...record, takenAt: firebase.database.ServerValue.TIMESTAMP });
    status.textContent = "Saved. Your level now shows in your portal and for your teacher.";
  } catch (error) {
    console.error("Placement result could not be saved", error);
    status.textContent = "Your result could not be saved. You can still use it, and try again later.";
  }
}

// ---- start-up -----------------------------------------------------------------------------------

function startTest(saveAllowed) {
  history = [];
  startedAt = Date.now();
  if (!saveAllowed) previous = previous || { takenAt: Date.now() };
  show("questionCard");
  renderQuestion();
}

async function identifyStudent() {
  if (!window.firebase) return;
  const config = await import("./config.js");
  if (!firebase.apps.length) firebase.initializeApp(config.firebaseConfig);
  db = firebase.database();
  const user = await new Promise(resolve => {
    const stop = firebase.auth().onAuthStateChanged(found => { stop(); resolve(found); }, () => resolve(null));
  });
  if (!user) return;
  const link = await db.ref(`studentByUid/${user.uid}`).once("value");
  if (!link.exists()) return;
  studentCode = String(link.val());
  const snapshot = await db.ref(`studentProgress/${studentCode}/placement`).once("value");
  previous = snapshot.val();
}

function describePrevious() {
  const box = $("previousResult");
  if (!previous || !previous.cefr) return;
  const level = previous.teacherLevel || previous.cefr;
  box.hidden = false;
  box.textContent = `Your last result: ${level}${previous.teacherLevel ? " (set by your teacher)" : " (estimated)"} on ${formatDate(previous.takenAt)}.`;
}

document.addEventListener("keydown", event => {
  if ($("questionCard").hidden || !current) return;
  const target = event.target;
  const typing = target instanceof HTMLInputElement && target.type === "text";
  if (!typing && /^[1-4]$/.test(event.key) && current.item.options) {
    const radio = document.querySelector(`input[name="choice"][value="${Number(event.key) - 1}"]`);
    if (radio) { radio.checked = true; radio.dispatchEvent(new Event("change")); event.preventDefault(); }
  } else if (event.key === "Enter" && !(target instanceof HTMLButtonElement)) {
    event.preventDefault();
    advance();
  }
});

$("nextButton").addEventListener("click", advance);
$("backButton").addEventListener("click", goBack);
$("startButton").addEventListener("click", () => startTest(true));
$("retakeButton").addEventListener("click", () => { studentCode = ""; startTest(false); });

(async function boot() {
  try {
    const response = await fetch("content/placement/items.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("The question bank could not be loaded.");
    const bank = await response.json();
    const check = validatePlacementItems(bank);
    if (!check.valid) throw new Error(`The question bank is invalid: ${check.errors[0]}`);
    items = bank.items;
  } catch (error) {
    $("introStatus").textContent = error.message;
    return;
  }
  try {
    await identifyStudent();
  } catch (error) {
    console.error("Could not check the student sign-in", error);
    studentCode = "";
  }
  describePrevious();
  const locked = studentCode && previous && !canRetake(previous.takenAt);
  $("introStatus").textContent = !studentCode
    ? "You can try the check without signing in; results are only saved for signed-in students."
    : locked
      ? `You can save a new result after ${formatDate(nextRetakeAt(previous.takenAt))}. You may still practise the check; it just will not be saved.`
      : "Your result will be saved to your portal when you finish.";
  $("startButton").textContent = previous && previous.cefr ? "Take it again" : "Start the check";
  $("startButton").disabled = false;
})();
