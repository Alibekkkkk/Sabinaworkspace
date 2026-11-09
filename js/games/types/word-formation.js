// Word Formation Race: turn a root word into the form asked for (noun, verb, adjective, adverb, negative).
// Built from the word-family forms the teacher has approved. Timed rounds become untimed with "no timers".
import { familyItems } from "../../word-family.js";
import { timerSeconds } from "../settings.js";
import { button, el, liveRegion, meter, numberKeys } from "../ui.js";

export const TYPE = "word-formation";
export const SECONDS_PER_ITEM = 14;

export function fromVocab(vocab, { isTeacher = false, limit = 10 } = {}) {
  const items = familyItems(vocab, { isTeacher }).map(item => ({
    id: item.id, prompt: item.prompt, answer: item.answer, typed: true, mode: "exact", topic: "Word families", hint: item.ex || "",
    ...(item.type === "choose" ? { options: item.options } : {})
  }));
  return items.slice(0, limit);
}

export function supports(game) { return game.type === TYPE; }

export function render(container, game, bus) {
  const items = game.questions; const answers = {};
  const total = timerSeconds(bus.settings, items.length * SECONDS_PER_ITEM);
  let index = 0; let run = 0; let bestRun = 0; let left = total; let timer = 0; let done = false;
  const progress = meter("Word", items.length); const live = liveRegion();
  const clock = el("p", "gm-timer", total ? `Time left: ${left}s` : ""); clock.setAttribute("aria-live", "off");
  const mode = el("p", "gm-hint", total ? `Race: ${total} seconds for ${items.length} words.` : "Untimed: no race, just practice.");
  const stage = el("div", "gm-stage");
  container.replaceChildren(mode, progress.element, clock, stage, live.element);
  const removeKeys = numberKeys(stage, ".gm-option");

  function finish() { if (done) return; done = true; clearInterval(timer); removeKeys(); progress.set(Math.min(index, items.length)); bus.finish({ answers, bestRun, kind: "game", words: items.filter(item => answers[item.id] && answers[item.id].toLowerCase() === item.answer.toLowerCase()).length }); }
  function show() {
    const item = items[index]; progress.set(index, `${items.length - index} to go`);
    const prompt = el("p", "gm-prompt", item.prompt); prompt.id = "gmQuestion";
    const feedback = el("p", "gm-feedback"); feedback.setAttribute("aria-live", "polite");
    const next = button(index === items.length - 1 ? "Finish" : "Next word", "button", () => { index += 1; if (index >= items.length) finish(); else show(); }); next.hidden = true;
    const settle = given => {
      answers[item.id] = given; const right = given.trim().toLowerCase() === item.answer.toLowerCase();
      if (right) { run += 1; bestRun = Math.max(bestRun, run); bus.services.sound("good"); } else { run = 0; bus.services.sound("bad"); }
      feedback.textContent = right ? `Correct: ${item.answer}.${item.hint ? ` ${item.hint}` : ""}` : `The answer is: ${item.answer}.${item.hint ? ` ${item.hint}` : ""}`; live.say(feedback.textContent);
      next.hidden = false; next.focus();
    };
    let body;
    if (item.options) {
      body = el("div", "gm-options"); body.setAttribute("role", "group"); body.setAttribute("aria-labelledby", "gmQuestion");
      item.options.forEach((option, i) => body.append(button(`${i + 1}. ${option}`, "gm-option", () => { body.querySelectorAll("button").forEach(node => { node.disabled = true; }); settle(option); })));
    } else {
      body = el("form", "gm-answer"); const input = el("input", "gm-input"); input.type = "text"; input.autocomplete = "off"; input.setAttribute("aria-labelledby", "gmQuestion");
      const check = el("button", "button", "Check"); check.type = "submit"; body.append(input, check);
      body.addEventListener("submit", event => { event.preventDefault(); if (!input.value.trim()) return; input.disabled = true; check.disabled = true; settle(input.value); });
      setTimeout(() => input.focus(), 0);
    }
    stage.replaceChildren(prompt, body, feedback, next);
    prompt.tabIndex = -1; prompt.focus({ preventScroll: true });
  }
  if (total) timer = setInterval(() => { left -= 1; clock.textContent = `Time left: ${Math.max(0, left)}s`; if (left <= 0) { live.say("Time is up."); finish(); } }, 1000);
  show();
  return { destroy() { clearInterval(timer); removeKeys(); } };
}
