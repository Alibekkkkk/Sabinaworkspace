// One-at-a-time typed games: Fill the Gap (with an optional word bank), Hangman, Word Scramble, Listening Dictation and
// Pronunciation. Each uses the shared sequence shell and the shared grader.
import { isAnswerCorrect } from "../../grading.js";
import { createPlayer, speechSupported } from "../../listening/audio.js";
import { compareSpoken } from "../../listening/levels.js";
import { CONSENT_TEXT, giveConsent, hasConsent, listenOnce, speakingSupported } from "../../listening/speaking.js";
import { seededShuffle } from "../seed.js";
import { button, el } from "../ui.js";
import { sequence } from "./sequence.js";

export const HANGMAN_LIVES = 6;
export const HINT_COST = 1; // each hint takes 3 XP off the round (see rewards.js)

const grade = (item, value) => isAnswerCorrect(String(value || ""), [item.answer, ...(item.alternatives || [])], { mode: item.mode || "exact" });

function typedForm({ item, api, label, onSubmit, buttonLabel = "Check", extra = [] }) {
  const form = el("form", "gm-answer");
  const input = el("input", "gm-input"); input.type = "text"; input.autocomplete = "off"; input.autocapitalize = "off"; input.spellcheck = false; input.setAttribute("aria-labelledby", "gmQuestion");
  if (label) input.setAttribute("aria-label", label);
  const check = el("button", "button", buttonLabel); check.type = "submit";
  form.append(input, check, ...extra);
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!input.value.trim() || api.isSettled()) return;
    input.disabled = true; check.disabled = true;
    onSubmit(input.value);
  });
  api.onCleanup(() => {});
  return { form, input, check };
}

// ---- Fill the Gap ----------------------------------------------------------------------------------------------
export const fillGap = {
  TYPE: "fill-gap",
  supports: game => game.type === "fill-gap",
  render(container, game, bus) {
    const answers = [...new Set(game.questions.map(item => item.answer))];
    const bankOrder = seededShuffle(answers, `bank:${game.id}`);
    return sequence({
      container, bus, items: game.questions, label: "Gap",
      intro: "Type the missing words. Switch on the word bank if you want help.",
      renderItem(item, api) {
        const { form, input } = typedForm({ item, api, label: "Your answer", onSubmit: value => { const correct = grade(item, value); api.settle({ correct, given: value, note: item.explanation || "" }); } });
        const bank = el("div", "gm-bank"); bank.hidden = true; bank.setAttribute("role", "group"); bank.setAttribute("aria-label", "Word bank");
        for (const word of bankOrder) bank.append(button(word, "button secondary", () => { if (!input.disabled) { input.value = word; input.focus(); } }));
        const toggle = button("Show word bank", "button secondary", () => { bank.hidden = !bank.hidden; toggle.textContent = bank.hidden ? "Show word bank" : "Hide word bank"; toggle.setAttribute("aria-expanded", String(!bank.hidden)); }, { "aria-expanded": "false" });
        const body = el("div", "gm-stack"); body.append(form, toggle, bank);
        return { body, focus: () => input.focus() };
      }
    });
  }
};

// ---- Hangman ---------------------------------------------------------------------------------------------------
export function hangmanState(word) { return { letters: [...word.toLocaleLowerCase()], guessed: new Set(), wrong: 0 }; }
export function guessLetter(state, letter) {
  if (state.guessed.has(letter)) return { state, event: "repeat" };
  state.guessed.add(letter);
  if (!state.letters.includes(letter)) state.wrong += 1;
  const solved = state.letters.every(character => !/[a-z]/i.test(character) || state.guessed.has(character));
  return { state, event: solved ? "solved" : state.wrong >= HANGMAN_LIVES ? "lost" : state.letters.includes(letter) ? "hit" : "miss" };
}
export const hangmanMask = state => state.letters.map(character => (/[a-z]/i.test(character) ? (state.guessed.has(character) ? character : "_") : character)).join(" ");
export function hintLetter(state) { return state.letters.find(character => /[a-z]/i.test(character) && !state.guessed.has(character)) || ""; }

export const hangman = {
  TYPE: "hangman",
  supports: game => game.type === "hangman",
  render(container, game, bus) {
    return sequence({
      container, bus, items: game.questions, label: "Word", intro: "Use the meaning as a hint. Click a letter or type it on your keyboard. A hint reveals one letter and takes a little XP.",
      renderItem(item, api) {
        const state = hangmanState(item.answer);
        const prompt = el("p", "gm-prompt", `Hint: ${item.prompt}`);
        const mask = el("p", "gm-mask"); mask.setAttribute("aria-live", "polite");
        const lives = el("p", "gm-feedback");
        const letters = el("div", "letters"); letters.setAttribute("role", "group"); letters.setAttribute("aria-label", "Letters");
        const paint = () => { mask.textContent = hangmanMask(state); lives.textContent = `Lives left: ${Math.max(HANGMAN_LIVES - state.wrong, 0)} of ${HANGMAN_LIVES}`; };
        const buttons = new Map();
        const guess = letter => {
          if (api.isSettled()) return;
          const out = guessLetter(state, letter); const node = buttons.get(letter); if (node) node.disabled = true;
          paint();
          if (out.event === "solved") api.settle({ correct: true });
          else if (out.event === "lost") api.settle({ correct: false, given: "" });
          else api.say(out.event === "hit" ? `Yes, there is a ${letter}.` : `No ${letter}.`);
          if (api.isSettled()) letters.querySelectorAll("button").forEach(b => { b.disabled = true; });
        };
        for (const letter of "abcdefghijklmnopqrstuvwxyz") { const node = button(letter.toUpperCase(), "button secondary", () => guess(letter), { "aria-label": `Guess ${letter}` }); buttons.set(letter, node); letters.append(node); }
        const hint = button("Hint: reveal a letter", "button secondary", () => { const letter = hintLetter(state); if (!letter || api.isSettled()) return; api.useHint(HINT_COST); hint.disabled = true; guess(letter); if (!api.isSettled()) prompt.focus({ preventScroll: true }); }); // a disabled button would drop focus out of the game, so keys keep working
        const keys = event => { if (event.ctrlKey || event.metaKey || event.altKey || !/^[a-z]$/i.test(event.key) || (event.target instanceof HTMLElement && event.target.closest("input, textarea"))) return; guess(event.key.toLowerCase()); };
        const root = container.closest(".game-card") || container; root.addEventListener("keydown", keys); api.onCleanup(() => root.removeEventListener("keydown", keys));
        paint();
        const body = el("div", "gm-stack"); body.append(mask, lives, letters, hint);
        return { prompt, body };
      }
    });
  }
};

// ---- Word Scramble ----------------------------------------------------------------------------------------------
export const wordScramble = {
  TYPE: "word-scramble",
  supports: game => game.type === "word-scramble",
  render(container, game, bus) {
    return sequence({
      container, bus, items: game.questions, label: "Word", intro: "Put the letters in order. The meaning is your clue. A hint shows the first letter and takes a little XP.",
      renderItem(item, api) {
        const prompt = el("p", "gm-prompt", `${item.scrambled}`); prompt.setAttribute("aria-label", `Scrambled letters: ${[...item.scrambled].join(" ")}. Clue: ${item.prompt}`);
        const clue = el("p", "gm-hint", `Clue: ${item.prompt}`);
        const hintText = el("p", "gm-hint"); hintText.setAttribute("aria-live", "polite");
        let input = null;
        const hint = button("Hint: first letter", "button secondary", () => { api.useHint(HINT_COST); hint.disabled = true; hintText.textContent = `It starts with "${[...item.answer][0]}".`; input.focus(); });
        const made = typedForm({ item, api, label: "The word", onSubmit: value => api.settle({ correct: grade(item, value), given: value }) }); const form = made.form; input = made.input;
        const body = el("div", "gm-stack"); body.append(clue, form, hint, hintText);
        return { prompt, body, focus: () => input.focus() };
      }
    });
  }
};

// ---- Listening Dictation (the Phase 3 player, one word or phrase at a time) -------------------------------------------
export const listeningDictation = {
  TYPE: "listening-dictation",
  supports: game => game.type === "listening-dictation",
  render(container, game, bus) {
    return sequence({
      container, bus, items: game.questions, label: "Word", intro: "Listen, then type what you hear. You can play it as often as you like, slowly too.",
      renderItem(item, api) {
        const source = el("p", "gm-hint"); source.setAttribute("aria-live", "polite");
        const player = createPlayer({ item: { text: item.spoken || item.answer }, character: "nora", whenSource: (kind, message) => { source.textContent = message || ""; } });
        api.onCleanup(() => player.stop());
        const supported = speechSupported();
        const play = button("Play", "button secondary", () => player.play({ slow: false }), supported ? {} : { disabled: "" });
        const slow = button("Play slowly", "button secondary", () => player.play({ slow: true }), supported ? {} : { disabled: "" });
        const reveal = button("I cannot hear it: show the word", "button secondary", () => { if (api.isSettled()) return; api.settle({ correct: false, given: "", note: "Listen for it next time." }); });
        const { form, input } = typedForm({ item, api, label: "What you heard", onSubmit: value => api.settle({ correct: grade(item, value), given: value }) });
        if (!supported) source.textContent = "This browser cannot play speech. Use the button below to see the word.";
        const body = el("div", "gm-stack"); const row = el("div", "gm-answer"); row.append(play, slow); body.append(row, source, form, reveal);
        return { prompt: el("p", "gm-prompt", "Listen and type the word."), body, focus: () => play.focus() };
      }
    });
  }
};

// ---- Pronunciation (coaching, not scoring) -----------------------------------------------------------------------------
export const MAX_TRIES = 3;
export const pronunciation = {
  TYPE: "pronunciation",
  supports: game => game.type === "pronunciation",
  render(container, game, bus) {
    return sequence({
      container, bus, items: game.questions, label: "Word", extra: () => ({ noQueue: true }),
      intro: "Say each word. This is coaching, not a test: missed words are not added to your review list. If the microphone does not work, type the word.",
      renderItem(item, api) {
        let tries = 0; const target = item.answer;
        const coach = el("p", "gm-feedback"); coach.setAttribute("aria-live", "polite");
        const consent = el("div", "gm-consent"); consent.hidden = true;
        consent.append(...CONSENT_TEXT.map(line => el("p", "gm-hint", line)));
        const speak = button(speakingSupported() ? "Speak the word" : "Speaking is not available here", "button secondary", async () => {
          if (!hasConsent()) { consent.hidden = false; agree.focus(); return; }
          speak.disabled = true; coach.textContent = "Listening…";
          try {
            const heard = await listenOnce({ whenInterim: text => { coach.textContent = `Hearing: ${text}`; } });
            tries += 1;
            const result = compareSpoken(target, heard);
            if (result.total && result.hits === result.total) api.settle({ correct: true, note: `I heard "${heard}".` });
            else { coach.textContent = heard ? `I heard "${heard}". Listen again and try once more.` : "I did not hear anything. Try again, closer to the microphone."; if (tries >= MAX_TRIES) api.settle({ correct: false, given: heard, note: "That is fine: say it with the model next time." }); }
          } catch (error) { coach.textContent = error.message; }
          if (!api.isSettled()) speak.disabled = false;
        }, speakingSupported() ? {} : { disabled: "" });
        const agree = button("I agree, use the microphone", "button", () => { giveConsent(); consent.hidden = true; speak.focus(); });
        consent.append(agree);
        const listen = button("Hear the word", "button secondary", () => { const p = createPlayer({ item: { text: target } }); api.onCleanup(() => p.stop()); p.play({ slow: false }); }, speechSupported() ? {} : { disabled: "" });
        const { form, input } = typedForm({ item, api, label: "Type the word instead", buttonLabel: "Check typed word", onSubmit: value => { tries += 1; const ok = grade(item, value); if (ok || tries >= MAX_TRIES) api.settle({ correct: ok, given: value, note: ok ? "" : "That is fine: say it with the model next time." }); else { coach.textContent = "Close. Try once more."; input.disabled = false; form.querySelector("button").disabled = false; input.focus(); } } });
        const body = el("div", "gm-stack"); const row = el("div", "gm-answer"); row.append(listen, speak); body.append(row, consent, coach, form);
        return { prompt: el("p", "gm-prompt", `Say: ${target}`), body, focus: () => (speakingSupported() ? speak : input).focus() };
      }
    });
  }
};
