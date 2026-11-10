// Listening dictation trainer: a British-voice character says a sentence, some words are hidden, the student types
// them in place, gets per-word feedback, taps words to save them, and finishes a round with a summary.
import { listeningEntryFor } from "../listening/entry.js";
import { firebaseConfig } from "../config.js";
import { EMBEDDED, notifyLesson, resolvePageContext } from "../embed.js";
import { featureEnabled, showNotEnabled } from "../feature-gate.js";
import { mountOfflineBanner, watchConnection } from "../shell.js";
mountOfflineBanner({ languageSwitch: !EMBEDDED });
import { loadProtectedContent } from "../protected-content.js";
import { progressPath, saveGameProgress, saveVocabularyWord } from "../games/progress.js";
import { createPlayer, speechSupported } from "../listening/audio.js";
import { CHARACTER_INFO, createCharacter } from "../listening/character.js";
import { createDictation } from "../listening/dictation.js";
import { adaptLevel, canSlow, compareSpoken, LEVEL_HELP, LEVEL_LABELS, LEVELS, mistakeItems, ROUND_SIZE, sentenceCorrect, summarizeRound } from "../listening/levels.js";
import { bareWord, tokenize, validateListeningPack } from "../listening/schema.js";
import { CONSENT_TEXT, giveConsent, hasConsent, listenOnce, speakingSupported } from "../listening/speaking.js";

const $ = id => document.getElementById(id);
const PREF_KEY = "listening.prefs.v1";
const query = new URLSearchParams(location.search);
const previewDraft = query.get("preview") === "1";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(label, className, handler, attributes = {}) {
  const node = el("button", className, label);
  node.type = "button";
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (handler) node.addEventListener("click", handler);
  return node;
}

// ---- preferences (character, level, translation) are per device and optional ----------------------------------
let prefs = { character: "nora", level: "auto", lang: "ru", showTranslation: false };
try { prefs = { ...prefs, ...(JSON.parse(localStorage.getItem(PREF_KEY)) || {}) }; } catch (error) { /* defaults */ }
const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (error) { /* not remembered */ } };
if (!CHARACTER_INFO[prefs.character]) prefs.character = "nora";
if (prefs.level !== "auto" && !LEVELS.includes(prefs.level)) prefs.level = "auto";

// ---- state ----------------------------------------------------------------------------------------------------
let database; let context; let pack; let lessonGloss = new Map(); let progressBefore = {};
let round = null; // { items, focusGaps: Map, results: [], position, adapt, level, startedAt, kind }
let current = null; // { dictation, character, player, checked, wordsSeen }

const live = $("lsLive");
const announce = text => { live.textContent = ""; setTimeout(() => { live.textContent = text; }, 30); };
const status = $("status");
const shuffle = list => { const copy = [...list]; for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; };
const show = name => { for (const id of ["lsSetup", "lsStage", "lsSummary"]) $(id).hidden = id !== name; };

function showRewards(progress) {
  const stats = $("stats");
  stats.replaceChildren();
  for (const [label, value] of [["Level", progress.level || 1], ["XP", progress.xp || 0], ["Gems", progress.gems || 0], ["Streak", `${progress.streak || 0} days`]]) stats.append(el("span", "stat", `${label}: ${value}`));
}

// ---- setup screen ---------------------------------------------------------------------------------------------
function renderSetup() {
  show("lsSetup");
  const setup = $("lsSetup");
  setup.replaceChildren();
  setup.append(el("h2", "", pack.title));
  const draft = pack.status && pack.status !== "approved";
  if (draft) setup.append(el("p", "ds-banner ds-banner--warning", "Draft pack: your teacher has not approved these sentences yet. You are seeing it because of the preview link."));
  setup.append(el("p", "muted", `${pack.items.length} sentences · level ${pack.level}. Listen, then type the missing words. You can replay as often as you like.`));

  const characters = el("fieldset", "ls-fieldset");
  characters.append(el("legend", "", "Choose your tutor"));
  for (const [kind, info] of Object.entries(CHARACTER_INFO)) {
    const label = el("label", "ls-choice");
    const radio = el("input"); radio.type = "radio"; radio.name = "character"; radio.value = kind; radio.checked = prefs.character === kind;
    radio.addEventListener("change", () => { prefs.character = kind; savePrefs(); });
    const face = createCharacter(kind, { label: `${info.name}` });
    face.element.classList.add("ls-character--small");
    label.append(radio, face.element, el("span", "", `${info.name} · ${info.description}`));
    characters.append(label);
  }
  setup.append(characters);

  const levels = el("fieldset", "ls-fieldset");
  levels.append(el("legend", "", "Level"));
  const options = [["auto", "Auto", "Starts Easy. Three right in a row go up, two wrong in a row go down."], ...LEVELS.map(level => [level, LEVEL_LABELS[level], LEVEL_HELP[level]])];
  for (const [value, label, help] of options) {
    const row = el("label", "ls-choice ls-choice--level");
    const radio = el("input"); radio.type = "radio"; radio.name = "level"; radio.value = value; radio.checked = prefs.level === value;
    radio.addEventListener("change", () => { prefs.level = value; savePrefs(); });
    row.append(radio, el("span", "", `${label}: ${help}`));
    levels.append(row);
  }
  setup.append(levels);

  const voice = el("p", "ls-voice-note");
  const hasAudio = pack.items.some(entry => entry.audio && entry.audio.normal);
  voice.textContent = hasAudio ? "Voice: neural British voice." : speechSupported() ? "Voice: your device's British voice (quality depends on your device)." : "This browser cannot speak sentences, so you will only see the text.";
  setup.append(voice);
  setup.append(button("Start round", "ds-btn ds-btn--primary", () => startRound(shuffle(pack.items).slice(0, ROUND_SIZE), { kind: "round" })));
}

// ---- round ----------------------------------------------------------------------------------------------------
function startRound(items, { kind, focusGaps = new Map() }) {
  round = { items, focusGaps, results: new Array(items.length).fill(null), position: 0, startedAt: Date.now(), kind, auto: prefs.level === "auto", level: prefs.level === "auto" ? "easy" : prefs.level, adapt: { level: prefs.level === "auto" ? "easy" : prefs.level, correctRun: 0, wrongRun: 0 } };
  show("lsStage");
  showItem(0);
}

function stopCurrent() { if (current) { current.player.stop(); current = null; } }

function showItem(position) {
  stopCurrent();
  round.position = position;
  const item = round.items[position];
  const focusGaps = round.focusGaps.get(item.id) || null;
  const stage = $("lsStage");
  stage.replaceChildren();
  const level = focusGaps ? "easy" : round.level;

  const top = el("div", "ls-top");
  const levelSelect = el("select", "ds-input ls-level-select");
  levelSelect.setAttribute("aria-label", "Level");
  for (const value of LEVELS) { const option = el("option", "", LEVEL_LABELS[value]); option.value = value; option.selected = value === round.level; levelSelect.append(option); }
  levelSelect.disabled = Boolean(focusGaps);
  levelSelect.addEventListener("change", () => { round.level = levelSelect.value; round.auto = false; round.adapt = { level: round.level, correctRun: 0, wrongRun: 0 }; prefs.level = round.level; savePrefs(); if (!current.checked) showItem(round.position); });
  top.append(el("span", "ls-chip", round.kind === "mistakes" ? "Practise mistakes" : round.auto ? `${LEVEL_LABELS[round.level]} (auto)` : LEVEL_LABELS[round.level]), levelSelect, el("span", "ls-count", `Sentence ${position + 1} of ${round.items.length}`));
  const source = el("span", "ls-source"); source.setAttribute("aria-live", "polite");
  top.append(source);
  stage.append(top);

  const progress = el("div", "ds-progress"); progress.setAttribute("role", "progressbar"); progress.setAttribute("aria-label", "Round progress");
  progress.setAttribute("aria-valuemin", "0"); progress.setAttribute("aria-valuemax", String(round.items.length)); progress.setAttribute("aria-valuenow", String(position));
  const fill = el("span", "ds-progress__fill"); fill.style.width = `${(position / round.items.length) * 100}%`; progress.append(fill);
  stage.append(progress);

  const scene = el("div", "ls-scene");
  const character = createCharacter(prefs.character);
  const bubble = el("div", "ls-bubble");
  const dictation = createDictation({ item, level, focusGaps, whenChange: () => { check.disabled = !dictation.complete; }, whenSubmit: () => { if (dictation.complete) doCheck(); else { feedbackSheet.show("info", "Fill every gap first", "Type each missing word, or use Hint or Reveal."); } } });
  bubble.append(dictation.element);
  const translation = el("p", "ls-translation");
  translation.hidden = true;
  bubble.append(translation);
  scene.append(character.element, bubble);
  stage.append(scene);

  const feedbackHost = el("div", "ls-feedback"); const feedbackSheet = makeFeedback(feedbackHost);
  const wordPanel = el("div", "ls-wordpanel"); wordPanel.hidden = true;
  const speakingPanel = el("div", "ls-speaking"); speakingPanel.hidden = true;
  stage.append(feedbackHost, wordPanel, speakingPanel);

  const player = createPlayer({
    item, character: prefs.character, baseUrl: new URL("../../content/", import.meta.url).href,
    whenAmplitude: level2 => character.setMouth(level2),
    whenState: state => { if (state === "speaking") character.setState("talking"); else if (character.state === "talking") character.setState(current && current.checked ? current.mood : "idle"); },
    whenSource: (kind, message) => { source.textContent = kind === "neural" ? "🔊 Neural British voice" : kind === "device" ? `🔊 ${message}` : `⚠ ${message}`; source.dataset.kind = kind; }
  });
  current = { dictation, character, player, checked: false, mood: "idle", item };

  // controls
  const controls = el("div", "ls-controls");
  controls.setAttribute("role", "group"); controls.setAttribute("aria-label", "Controls");
  const replay = button("▶ Replay", "ds-btn ds-btn--secondary ds-btn--small", () => player.play({ slow: false }));
  const slow = button("🐢 Slow", "ds-btn ds-btn--secondary ds-btn--small", () => player.play({ slow: true }));
  slow.disabled = !canSlow(level);
  if (!canSlow(level)) slow.title = "Slow replay is switched off on Expert.";
  const prev = button("⏮ Previous", "ds-btn ds-btn--ghost ds-btn--small", () => showItem(position - 1));
  prev.disabled = position === 0;
  const hint = button("💡 Hint", "ds-btn ds-btn--ghost ds-btn--small", () => { if (dictation.hint()) feedbackSheet.show("info", "Hint used", "That word will not count towards your score."); });
  const reveal = button("👁 Reveal word", "ds-btn ds-btn--ghost ds-btn--small", () => { if (dictation.reveal()) feedbackSheet.show("info", "Word revealed", "That word counts as missed. Listen again and learn it."); });
  const translate = button("🌐 Translation", "ds-btn ds-btn--ghost ds-btn--small", () => { prefs.showTranslation = !prefs.showTranslation; savePrefs(); drawTranslation(); });
  translate.setAttribute("aria-pressed", String(prefs.showTranslation));
  const languages = [...new Set(round.items.flatMap(entry => Object.keys(entry.translation || {})))];
  let languageSelect = null;
  if (languages.length > 1) {
    languageSelect = el("select", "ds-input ls-lang"); languageSelect.setAttribute("aria-label", "Translation language");
    for (const code of languages) { const option = el("option", "", code.toUpperCase()); option.value = code; option.selected = code === prefs.lang; languageSelect.append(option); }
    languageSelect.addEventListener("change", () => { prefs.lang = languageSelect.value; savePrefs(); drawTranslation(); });
  }
  const skip = button("⏭ Skip", "ds-btn ds-btn--ghost ds-btn--small", () => { if (!current.checked) doCheck({ skipped: true }); else goNext(); });
  const check = button("✓ Check", "ds-btn ds-btn--primary ds-btn--small", () => doCheck());
  check.disabled = true;
  const next = button(position === round.items.length - 1 ? "Finish round" : "Next ⏭", "ds-btn ds-btn--primary ds-btn--small", goNext);
  next.hidden = true;
  controls.append(replay, slow, prev, hint, reveal, translate, ...(languageSelect ? [languageSelect] : []), skip, check, next);
  stage.append(controls);

  function drawTranslation() {
    const entry = item.translation || {};
    const lang = entry[prefs.lang] ? prefs.lang : Object.keys(entry)[0];
    translate.setAttribute("aria-pressed", String(prefs.showTranslation));
    translate.disabled = !lang;
    translation.hidden = !(prefs.showTranslation && lang);
    if (lang) { translation.textContent = entry[lang]; translation.lang = lang; }
  }
  drawTranslation();

  function doCheck({ skipped = false } = {}) {
    if (current.checked) return;
    const results = dictation.check({ skipped });
    current.checked = true;
    const isNew = !round.results[position];
    round.results[position] = { itemId: item.id, level, gaps: results, skipped };
    const right = results.filter(result => result.ok && !result.assisted).length;
    const assisted = results.filter(result => result.assisted).length;
    const allRight = results.length > 0 && results.every(result => result.ok && !result.assisted);
    current.mood = allRight ? (right >= 3 ? "celebrating" : "happy") : "encouraging";
    character.setState(current.mood);
    const detail = skipped ? "Skipped. Here is the sentence; listen once more." : `${right} of ${results.length} word${results.length === 1 ? "" : "s"} correct${assisted ? ` (${assisted} with help)` : ""}.`;
    if (allRight) feedbackSheet.show("correct", "Well heard!", detail);
    else feedbackSheet.show(skipped ? "info" : "wrong", skipped ? "Skipped" : "Nearly there", `${detail} The correct spelling is shown in the sentence.`);
    announce(`${detail} ${tokenize(item.text).join(" ")}`);
    if (isNew && round.kind === "round" && !skipped && round.auto) {
      const adapted = adaptLevel(round.adapt, sentenceCorrect(round.results[position]));
      round.adapt = adapted;
      if (adapted.changed) { round.level = adapted.level; feedbackSheet.append(adapted.changed === "up" ? `Level up: ${LEVEL_LABELS[adapted.level]} next.` : `Easier next: ${LEVEL_LABELS[adapted.level]}.`); }
    }
    dictation.makeWordsTappable((word, index, anchor) => openWordPanel(word, anchor));
    dictation.disable();
    controls.querySelectorAll("button, select").forEach(node => { if (node === hint || node === reveal || node === check) node.disabled = true; });
    skip.hidden = true; check.hidden = true; next.hidden = false;
    renderSpeaking();
    next.focus();
  }

  function openWordPanel(word, anchor) {
    wordPanel.hidden = false;
    wordPanel.replaceChildren();
    const gloss = lookupGloss(item, word);
    wordPanel.append(el("strong", "ls-wordpanel__word", word));
    const meaning = el("p", "ls-wordpanel__meaning", gloss || "Tap Look up to see the meaning.");
    meaning.setAttribute("aria-live", "polite");
    const note = el("p", "ds-field__hint");
    const lookup = button("🔍 Look up", "ds-btn ds-btn--secondary ds-btn--small", () => { meaning.textContent = gloss || "No meaning is stored for this word yet. Save it and ask your teacher."; });
    const save = button("➕ Save to my words", "ds-btn ds-btn--primary ds-btn--small", async () => {
      save.disabled = true;
      try {
        const entry = { word, savedAt: new Date().toISOString(), sourceListeningId: item.id.slice(0, 80) };
        if (gloss) entry.translation = gloss.slice(0, 300);
        await saveVocabularyWord({ db: database, code: context.code, key: wordKey(word), entry });
        note.textContent = `“${word}” is saved in your words.`;
      } catch (error) { note.textContent = error.message; save.disabled = false; }
      announce(note.textContent);
    });
    const close = button("Close", "ds-btn ds-btn--ghost ds-btn--small", () => { wordPanel.hidden = true; anchor.focus(); });
    const row = el("div", "ls-row"); row.append(lookup, save, close);
    wordPanel.append(meaning, row, note);
    lookup.focus();
  }

  function renderSpeaking() {
    speakingPanel.hidden = false;
    speakingPanel.replaceChildren();
    if (!speakingSupported()) { speakingPanel.append(el("p", "ds-field__hint", "Speaking practice is not supported in this browser. Typing works everywhere.")); return; }
    const say = button("🎤 Say it", "ds-btn ds-btn--secondary ds-btn--small", () => (hasConsent() ? runSpeaking() : renderConsent()));
    speakingPanel.append(say, el("span", "ds-field__hint", " Optional: say the sentence and see which words were heard."));
  }
  function renderConsent() {
    speakingPanel.replaceChildren();
    const box = el("div", "ds-card ls-consent");
    box.setAttribute("role", "group"); box.setAttribute("aria-label", "Before you use the microphone");
    box.append(el("h3", "", "Before you use the microphone"), ...CONSENT_TEXT.map(line => el("p", "", line)));
    const row = el("div", "ls-row");
    const agree = button("I understand, continue", "ds-btn ds-btn--primary ds-btn--small", () => { giveConsent(); runSpeaking(); });
    const typeInstead = button("Type instead", "ds-btn ds-btn--ghost ds-btn--small", renderSpeaking);
    row.append(agree, typeInstead);
    box.append(row);
    speakingPanel.append(box);
    agree.focus();
  }
  async function runSpeaking() {
    speakingPanel.replaceChildren();
    const transcript = el("p", "ls-transcript", "Listening… say the sentence now.");
    transcript.setAttribute("aria-live", "polite");
    const stop = button("Type instead", "ds-btn ds-btn--ghost ds-btn--small", renderSpeaking);
    speakingPanel.append(transcript, stop);
    character.setState("thinking");
    try {
      const heard = await listenOnce({ whenInterim: text => { transcript.textContent = `Hearing: ${text}`; } });
      character.setState(current.mood);
      if (!heard) { transcript.textContent = "I did not hear anything. Try again."; speakingPanel.append(button("Try again", "ds-btn ds-btn--secondary ds-btn--small", runSpeaking)); return; }
      const result = compareSpoken(item.text, heard);
      speakingPanel.replaceChildren();
      const line = el("p", "ls-spoken");
      for (const word of result.words) line.append(el("span", `ls-spoken__word ls-spoken__word--${word.status}`, `${word.status === "hit" ? "✓ " : "✗ "}${word.word} `));
      speakingPanel.append(el("p", "", `I heard: “${heard}”`), line, el("p", "ds-field__hint", `${result.hits} of ${result.total} words heard. This is coaching, not a grade. Listen again and say it once more if you like.`));
      speakingPanel.append(button("Try again", "ds-btn ds-btn--secondary ds-btn--small", runSpeaking), button("Done", "ds-btn ds-btn--ghost ds-btn--small", renderSpeaking));
      announce(`${result.hits} of ${result.total} words heard.`);
    } catch (error) {
      character.setState(current.mood);
      speakingPanel.replaceChildren(el("p", "ds-feedback ds-feedback--info", error.message), button("OK", "ds-btn ds-btn--secondary ds-btn--small", renderSpeaking));
    }
  }

  announce(`Sentence ${position + 1} of ${round.items.length}. ${LEVEL_LABELS[level]} level. ${dictation.gaps.length} gap${dictation.gaps.length === 1 ? "" : "s"}.`);
  dictation.focusFirst();
  character.setState("thinking");
  player.play({ slow: false }).then(ok => { if (!ok && current && current.player === player && !current.checked) character.setState("idle"); });
}

function goNext() {
  if (round.position + 1 < round.items.length) showItem(round.position + 1);
  else finishRound();
}

function makeFeedback(host) {
  const box = el("div", "ds-feedback"); box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite");
  host.append(box);
  return {
    show(kind, title, detail) {
      box.className = `ds-feedback ds-feedback--${kind}`;
      const icon = el("span", "ds-feedback__icon", kind === "correct" ? "✓" : kind === "wrong" ? "✗" : "i"); icon.setAttribute("aria-hidden", "true");
      const body = el("div"); body.append(el("b", "ds-feedback__title", title)); if (detail) body.append(el("p", "ds-feedback__detail", detail));
      box.replaceChildren(icon, body);
    },
    append(text) { const body = box.lastElementChild; if (body) body.append(el("p", "ds-feedback__detail", text)); }
  };
}

// ---- meanings and saving ------------------------------------------------------------------------------------------
const wordKey = word => String(word).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "word";
function lookupGloss(item, word) {
  const forms = [word, word.replace(/(es|s|ed|d|ing)$/, "")];
  for (const form of forms) {
    if (item.glosses && item.glosses[form]) return item.glosses[form];
    if (lessonGloss.has(form)) return lessonGloss.get(form);
  }
  return "";
}

// ---- summary --------------------------------------------------------------------------------------------------------
async function finishRound() {
  stopCurrent();
  const results = round.results.filter(Boolean);
  const summary = summarizeRound(results);
  const seconds = Math.round((Date.now() - round.startedAt) / 1000);
  show("lsSummary");
  const box = $("lsSummary");
  box.replaceChildren();
  const character = createCharacter(prefs.character);
  character.setState(summary.stars === 3 ? "celebrating" : summary.stars === 2 ? "happy" : "encouraging");
  const stars = el("p", "ls-stars", "★".repeat(summary.stars) + "☆".repeat(3 - summary.stars));
  stars.setAttribute("role", "img"); stars.setAttribute("aria-label", `${summary.stars} of 3 stars`);
  box.append(character.element, el("h2", "", round.kind === "mistakes" ? "Mistakes practised" : "Round complete"), stars);
  const list = el("ul", "ls-summary__list");
  list.append(el("li", "", `Accuracy: ${Math.round(summary.accuracy * 100)}% (${summary.gapsCorrect} of ${summary.gapsTotal} words)`));
  list.append(el("li", "", `Best combo: ${summary.bestCombo} word${summary.bestCombo === 1 ? "" : "s"} in a row`));
  list.append(el("li", "", summary.hardestWords.length ? `Hardest words: ${summary.hardestWords.join(", ")}` : "No hard words: everything was heard."));
  const xp = el("li", "", "Saving your progress…");
  list.append(xp);
  box.append(list);
  const actions = el("div", "ls-row");
  const redo = mistakeItems(results);
  if (redo.length && round.kind !== "mistakes") actions.append(button(`Practise mistakes (${redo.length})`, "ds-btn ds-btn--primary", () => {
    const byId = new Map(round.items.map(item => [item.id, item]));
    startRound(redo.map(entry => byId.get(entry.itemId)), { kind: "mistakes", focusGaps: new Map(redo.map(entry => [entry.itemId, [...new Set(entry.onlyGaps)]])) });
  }));
  actions.append(button("New round", "ds-btn ds-btn--secondary", () => renderSetup()), el("a", "ds-btn ds-btn--ghost", "Back to lessons"));
  actions.lastChild.href = "portal.html";
  box.append(actions);
  announce(`Round complete. ${summary.stars} of 3 stars. ${Math.round(summary.accuracy * 100)} percent.`);
  if (context.preview) { xp.textContent = "Teacher preview: nothing is saved."; return; }
  notifyLesson("section-complete", { section: "listening", score: summary.gapsCorrect, total: summary.gapsTotal });
  try {
    const before = progressBefore.xp || 0;
    const saved = await saveRound(results, summary, seconds);
    progressBefore = saved;
    showRewards(saved);
    xp.textContent = `XP earned: ${Math.max(0, (saved.xp || 0) - before)} · Streak: ${saved.streak || 0} day${saved.streak === 1 ? "" : "s"}`;
    status.textContent = summary.gapsTotal - summary.gapsCorrect ? `${summary.gapsTotal - summary.gapsCorrect} word(s) added to your Practice review.` : "Perfect round! Progress saved.";
  } catch (error) {
    xp.textContent = `Progress could not be saved: ${error.message}`;
  }
}

async function saveRound(results, summary, seconds) {
  const byId = new Map(round.items.map(item => [item.id, item]));
  const mistakes = [];
  for (const result of results) {
    const item = byId.get(result.itemId);
    const tokens = tokenize(item.text);
    for (const gap of result.gaps) {
      if (gap.ok && !gap.assisted) continue;
      const masked = tokens.map((token, index) => (index === gap.index ? "____" : token)).join(" ");
      mistakes.push({ itemId: `${item.id}-${gap.index}`.slice(0, 100), prompt: `Listen and type the missing word: ${masked}`.slice(0, 300), answer: gap.expected.slice(0, 300), topic: "Listening" });
    }
  }
  const saved = await saveGameProgress({
    db: database, code: context.code,
    game: { id: `listening-${pack.id}`.slice(0, 80), type: "listening", title: `Listening: ${pack.title}`.slice(0, 80) },
    result: { score: summary.gapsCorrect, total: Math.max(1, summary.gapsTotal), timeSpentSeconds: seconds, mistakes: mistakes.slice(0, 20) }
  });
  for (const result of results) {
    const gaps = result.gaps.length || 1;
    const accuracy = result.gaps.filter(gap => gap.ok && !gap.assisted).length / gaps;
    await database.ref(`${progressPath(context.code)}/listening/${wordKey(result.itemId)}`).transaction(old => {
      const previous = old && typeof old === "object" ? old : {};
      return { attempts: Math.min(1000000, (Number(previous.attempts) || 0) + 1), bestAccuracy: Math.max(Number(previous.bestAccuracy) || 0, Math.round(accuracy * 1000) / 1000), lastAt: Date.now() };
    }).catch(() => {});
  }
  return saved;
}

// ---- boot -------------------------------------------------------------------------------------------------------------
async function boot() {
  try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    database = firebase.database(); watchConnection(database);
    context = await resolvePageContext({ auth: firebase.auth(), db: database, lessonId: query.get("lesson") });
    if (!context.preview && !(await featureEnabled(database, context.code, "listeningTrainer"))) { showNotEnabled(status, "listeningTrainer"); return; }
    const [manifest, record] = await Promise.all([
      fetch(new URL("../../content/manifest.json", import.meta.url)).then(response => response.json()),
      loadProtectedContent(database, context.lessonId, "classwork").catch(() => null)
    ]);
    const entry = listeningEntryFor(manifest, context.lessonId, record && record.sourceFile);
    if (!entry || !entry.listeningFile) { status.textContent = "Your teacher has not added listening sentences to this lesson yet."; return; }
    const response = await fetch(new URL(`../../content/${entry.listeningFile}`, import.meta.url));
    if (!response.ok) throw new Error("The listening pack could not be loaded.");
    pack = await response.json();
    const problems = validateListeningPack(pack);
    if (problems.length) throw new Error(`The listening pack has errors: ${problems[0]}`);
    if (pack.status === "draft" && !previewDraft && !context.preview) { status.textContent = "These sentences are waiting for your teacher's approval."; return; }
    const progressSnapshot = await database.ref(progressPath(context.code)).once("value").catch(error => { if (context.preview) return { val: () => null }; throw error; });
    progressBefore = progressSnapshot.val() || {};
    showRewards(progressBefore);
    for (const word of (record && record.content && record.content.vocab) || []) {
      const meaning = word.meanings && word.meanings[0];
      if (meaning) lessonGloss.set(bareWord(word.en), meaning.ru || meaning.context || "");
    }
    status.textContent = "Choose your tutor and level, then start.";
    renderSetup();
  } catch (error) {
    status.textContent = `Listening could not be opened: ${error.message}`;
  }
}
boot();
