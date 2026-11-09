// Screens for the nine clip exercise types. Built with createElement only. Every exercise is keyboard operable
// (re-ordering uses Move up / Move down buttons, not drag only). `ctx` carries the clip, the player (may be null when the
// video cannot load), the speech helpers and a callback that records what the learner did.
import { CONSENT_TEXT, giveConsent, hasConsent, listenOnce, speakingSupported } from "../listening/speaking.js";
import { compareSpoken } from "../listening/levels.js";
import { speechSupported } from "../listening/audio.js";
import { button, el } from "../games/ui.js";
import { gapView, gradeExercise, moveItem, orderView, spotKey } from "./exercises.js";
import { bareWord, wordsOf } from "./lines.js";

const lineIndex = (clip, id) => clip.transcript.findIndex(line => line.id === id);
const lineOf = (clip, id) => clip.transcript.find(line => line.id === id);

function speakLine(text) {
  if (!speechSupported()) return false;
  window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = "en-GB"; window.speechSynthesis.speak(utterance); return true;
}

// Plays one line: from the video when its timing is verified, otherwise with the device voice (and says so).
function playLine(ctx, id, note) {
  const index = lineIndex(ctx.clip, id);
  if (ctx.player && ctx.player.verified && ctx.player.ready) { ctx.player.loop(-1); ctx.player.seekToLine(index, { play: true }); note.textContent = "Playing that part of the video."; return; }
  const spoken = speakLine(lineOf(ctx.clip, id).text);
  note.textContent = spoken ? "The video timing is not checked yet, so the line is read by your device's voice." : "Audio is not available here. Read the line on screen instead.";
}

function frame(exercise, number) {
  const box = el("section", "cx"); box.id = `cx-${exercise.id}`; box.setAttribute("aria-labelledby", `cx-h-${exercise.id}`);
  const heading = el("h3", "cx__title", `${number}. ${exercise.prompt}`); heading.id = `cx-h-${exercise.id}`; box.append(heading);
  return box;
}
const feedbackNode = () => { const node = el("p", "cx__feedback"); node.setAttribute("aria-live", "polite"); return node; };
const result = (node, ok, message) => { node.textContent = message; node.classList.toggle("is-right", ok === true); node.classList.toggle("is-missed", ok === false); };

const builders = {
  "before-watch"(ctx, exercise, box, done) {
    const words = (exercise.words || []).map(word => ctx.clip.vocabulary && ctx.clip.vocabulary.find(item => item.word.toLowerCase() === word.toLowerCase()) || { word, meaning: "" });
    if (words.length) { const list = el("ul", "cx__words"); for (const item of words) list.append(el("li", "", item.meaning ? `${item.word}: ${item.meaning}` : item.word)); box.append(list); }
    const guess = el("textarea", "cx__text"); guess.rows = 2; guess.maxLength = 200; guess.setAttribute("aria-label", "Your guess");
    const ready = button("I am ready to watch", "button", () => { ready.disabled = true; guess.disabled = true; done({ guess: guess.value }); result(note, null, "Good. Now watch the clip."); });
    const note = feedbackNode(); box.append(guess, ready, note);
  },
  gist(ctx, exercise, box, done) {
    const group = el("div", "gm-options"); group.setAttribute("role", "group"); group.setAttribute("aria-labelledby", `cx-h-${exercise.id}`); const note = feedbackNode();
    exercise.options.forEach((option, i) => group.append(button(`${i + 1}. ${option}`, "gm-option", () => {
      group.querySelectorAll("button").forEach(node => { node.disabled = true; });
      const graded = gradeExercise(ctx.clip, exercise, option); done(option); result(note, graded.correct, graded.correct ? "Correct!" : `Not quite. The answer is: ${exercise.answer}.`);
    })));
    box.append(group, note);
  },
  "listen-pick"(ctx, exercise, box, done) { builders.gist(ctx, exercise, box, done); },
  "check-understanding"(ctx, exercise, box, done) { builders.gist(ctx, exercise, box, done); },
  "gap-fill"(ctx, exercise, box, done) {
    const input = el("input", "gm-input"); input.type = "text"; input.autocomplete = "off"; input.setAttribute("aria-label", "Your answer"); const note = feedbackNode();
    const check = button("Check", "button", () => { if (!input.value.trim()) return; input.disabled = check.disabled = true; const graded = gradeExercise(ctx.clip, exercise, input.value); done(input.value); result(note, graded.correct, graded.correct ? "Correct!" : "Saved for your review."); });
    box.append(input, check, note);
  },
  "line-gap"(ctx, exercise, box, done) {
    const line = el("p", "cx__line"); const inputs = []; const note = feedbackNode();
    for (const part of gapView(ctx.clip, exercise)) {
      if (!part.gap) { line.append(document.createTextNode(`${part.word} `)); continue; }
      const input = el("input", "cx__gap"); input.type = "text"; input.autocomplete = "off"; input.size = Math.max(3, part.length + 1); input.setAttribute("aria-label", `Missing word, ${part.length} letters`); inputs.push(input); line.append(input, document.createTextNode(" "));
    }
    const listen = button("Play this line", "button secondary", () => playLine(ctx, exercise.lineId, note));
    const check = button("Check", "button", () => { inputs.forEach(node => { node.disabled = true; }); check.disabled = true; const graded = gradeExercise(ctx.clip, exercise, inputs.map(node => node.value)); done(inputs.map(node => node.value)); result(note, graded.correct, graded.correct ? "All the words are right!" : `${graded.score} of ${graded.total} right. The line is: ${lineOf(ctx.clip, exercise.lineId).text}`); });
    box.append(line, listen, check, note);
  },
  dictation(ctx, exercise, box, done) {
    const note = feedbackNode(); const area = el("textarea", "cx__text"); area.rows = 2; area.setAttribute("aria-label", "What you heard"); area.autocomplete = "off"; area.spellcheck = false;
    const play = button("Play the line", "button secondary", () => playLine(ctx, exercise.lineId, note));
    const check = button("Check", "button", () => { if (!area.value.trim()) return; area.disabled = check.disabled = true; const graded = gradeExercise(ctx.clip, exercise, area.value); done(area.value); result(note, graded.correct, graded.correct ? "Perfect!" : `${graded.score} of ${graded.total} words right. The line is: ${lineOf(ctx.clip, exercise.lineId).text}`); });
    box.append(play, area, check, note);
  },
  "order-lines"(ctx, exercise, box, done) {
    let order = orderView(exercise, ctx.clip.id); const list = el("ol", "cx__order"); const note = feedbackNode(); let locked = false;
    const paint = () => { list.replaceChildren(...order.map((id, i) => { const item = el("li"); item.append(el("span", "cx__ordertext", lineOf(ctx.clip, id).text)); if (!locked) { const up = button("Move up", "button secondary", () => { order = moveItem(order, i, i - 1); paint(); focusAt(i - 1, "up"); }, { "aria-label": `Move up: ${lineOf(ctx.clip, id).text}` }); const down = button("Move down", "button secondary", () => { order = moveItem(order, i, i + 1); paint(); focusAt(i + 1, "down"); }, { "aria-label": `Move down: ${lineOf(ctx.clip, id).text}` }); up.disabled = i === 0; down.disabled = i === order.length - 1; item.append(up, down); } return item; })); };
    const focusAt = (i, which) => { const items = list.querySelectorAll("li"); const target = items[Math.min(Math.max(i, 0), items.length - 1)]; const buttons = target.querySelectorAll("button"); const pick = which === "up" && !buttons[0].disabled ? buttons[0] : buttons[1] && !buttons[1].disabled ? buttons[1] : buttons[0]; pick.focus(); };
    const check = button("Check the order", "button", () => { locked = true; check.disabled = true; paint(); const graded = gradeExercise(ctx.clip, exercise, order); done(order); result(note, graded.correct, graded.correct ? "That is the right order!" : `${graded.score} of ${graded.total} lines are in the right place.`); });
    paint(); box.append(list, check, note);
  },
  "who-said"(ctx, exercise, box, done) {
    const choices = {}; const note = feedbackNode(); const table = el("div", "cx__who");
    for (const id of exercise.lineIds) { const row = el("label", "cx__whorow"); row.append(el("span", "", lineOf(ctx.clip, id).text)); const select = el("select", "ds-select"); select.append(new Option("Choose…", "")); for (const name of exercise.speakers) select.append(new Option(name, name)); select.addEventListener("change", () => { choices[id] = select.value; }); row.append(select); table.append(row); }
    const check = button("Check", "button", () => { table.querySelectorAll("select").forEach(node => { node.disabled = true; }); check.disabled = true; const graded = gradeExercise(ctx.clip, exercise, choices); done(choices); result(note, graded.correct, graded.correct ? "All correct!" : `${graded.score} of ${graded.total} right.`); });
    box.append(table, check, note);
  },
  shadowing(ctx, exercise, box, done) {
    const line = lineOf(ctx.clip, exercise.lineId); const note = feedbackNode(); const coach = feedbackNode(); let tries = 0;
    box.append(el("p", "cx__line", line.text));
    const consent = el("div", "gm-consent"); consent.hidden = true; consent.append(...CONSENT_TEXT.map(text => el("p", "gm-hint", text)));
    const agree = button("I agree, use the microphone", "button", () => { giveConsent(); consent.hidden = true; speak.focus(); }); consent.append(agree);
    const play = button("Play the line", "button secondary", () => playLine(ctx, exercise.lineId, note));
    const speak = button(speakingSupported() ? "Say it" : "Speaking is not available here", "button secondary", async () => {
      if (!hasConsent()) { consent.hidden = false; agree.focus(); return; }
      speak.disabled = true; coach.textContent = "Listening…";
      try { const heard = await listenOnce({ whenInterim: text => { coach.textContent = `Hearing: ${text}`; } }); tries += 1; const compared = compareSpoken(line.text, heard); coach.textContent = compared.total && compared.hits === compared.total ? `Well done. I heard every word: "${heard}".` : `I heard "${heard}". These words need another go: ${compared.words.filter(word => word.status === "miss").map(word => word.word).join(", ") || "none"}.`; done({ heard, tries }); }
      catch (error) { coach.textContent = error.message; }
      speak.disabled = false;
    }, speakingSupported() ? {} : { disabled: "" });
    const said = button("I said it aloud", "button secondary", () => { said.disabled = true; done({ self: true }); result(note, null, "Good. Shadowing is practice, so it is not marked."); });
    box.append(play, speak, said, consent, note, coach);
  },
  "grammar-spotter"(ctx, exercise, box, done) {
    const picked = new Set(); const note = feedbackNode(); const wrap = el("div", "cx__spot"); const nodes = new Map();
    for (const id of exercise.lineIds) { const line = lineOf(ctx.clip, id); const p = el("p", "cx__spotline"); wordsOf(line.text).forEach((word, i) => { const key = spotKey(id, i); const node = button(word, "cx__word", () => { if (picked.has(key)) picked.delete(key); else picked.add(key); node.setAttribute("aria-pressed", String(picked.has(key))); }, { "aria-pressed": "false" }); nodes.set(key, node); p.append(node, document.createTextNode(" ")); }); wrap.append(p); }
    const check = button("Check", "button", () => { check.disabled = true; nodes.forEach(node => { node.disabled = true; }); const graded = gradeExercise(ctx.clip, exercise, [...picked]); for (const key of exercise.answer || []) { const node = nodes.get(key); if (node) node.classList.add(picked.has(key) ? "is-right" : "is-missed"); } for (const key of picked) if (!(exercise.answer || []).includes(key)) nodes.get(key).classList.add("is-missed"); done([...picked]); result(note, graded.correct, graded.correct ? "You found them all!" : `${graded.hits} found, ${graded.wrong} wrong, ${graded.missed.length} missed.`); });
    box.append(el("p", "gm-hint", `Find: ${exercise.target}. Press each word that shows it.`), wrap, check, note);
  },
  production(ctx, exercise, box, done) {
    const area = el("textarea", "cx__text"); area.rows = 4; area.maxLength = 280; area.setAttribute("aria-label", "Your writing"); const count = el("p", "gm-hint"); const note = feedbackNode();
    const paint = () => { const words = wordsOf(area.value).length; count.textContent = `${words} word${words === 1 ? "" : "s"} (try for ${exercise.minWords || 10} or more)`; };
    area.addEventListener("input", paint); paint();
    const send = button("Send to my teacher", "button", async () => { if (!area.value.trim()) return; send.disabled = true; area.disabled = true; try { if (ctx.sendForReview) await ctx.sendForReview(exercise, area.value); done(area.value); result(note, null, "Sent. Your teacher will read it."); } catch (error) { send.disabled = false; area.disabled = false; result(note, false, `Could not send: ${error.message}`); } });
    box.append(area, count, send, note);
  }
};

export const exerciseLabel = { "before-watch": "Before you watch", gist: "Gist", "line-gap": "Fill the gaps", dictation: "What did they say?", "order-lines": "Order the lines", "who-said": "Who said it?", shadowing: "Shadowing", "grammar-spotter": "Grammar spotter", production: "Your turn" };

export function renderExercise(ctx, exercise, number, done) {
  const build = builders[exercise.type]; const box = frame(exercise, number);
  if (!build) { box.append(el("p", "", "This kind of exercise is not available yet.")); return box; }
  build(ctx, exercise, box, done); return box;
}
export { bareWord };
