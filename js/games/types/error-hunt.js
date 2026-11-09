// Error Hunt: find the mistake in a sentence, then fix it. Teacher-authored in content as
//   errorHunt: [{ id, sentence, wrong, fix, alternatives?: [fix], explanation?, wrongIndex? }]
// Scoring: a point when the right word is picked and the fix is accepted; after two wrong word picks the answer is shown.
import { button, el, liveRegion, meter, numberKeys } from "../ui.js";

export const TYPE = "error-hunt";
const bare = word => String(word).toLowerCase().replace(/[’‘]/g, "'").replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "");
const clean = value => String(value || "").trim();

export function correctedSentence(item, fix) {
  return item.tokens.map((token, index) => {
    if (index !== item.wrongIndex) return token;
    const punctuation = /[.,!?;:]+$/.exec(token);
    const lead = /^[^A-Za-z0-9']+/.exec(token);
    return `${lead ? lead[0] : ""}${clean(fix).replace(/[.,!?;:]+$/, "")}${punctuation ? punctuation[0] : ""}`;
  }).join(" ");
}

// Throws a helpful Error for teacher mistakes; returns the normalised items.
export function create(config) {
  const source = Array.isArray(config) ? config : [];
  const seen = new Set();
  return source.map((raw, index) => {
    const where = `errorHunt[${index}]`;
    const id = clean(raw && raw.id) || `hunt-${index + 1}`;
    if (seen.has(id)) throw new Error(`${where}: duplicate id ${id}`);
    seen.add(id);
    const sentence = clean(raw && raw.sentence);
    const wrong = clean(raw && raw.wrong);
    const fix = clean(raw && raw.fix);
    if (!sentence || !wrong || !fix) throw new Error(`${where}: sentence, wrong and fix are all required`);
    const tokens = sentence.split(/\s+/);
    let wrongIndex = Number.isInteger(raw.wrongIndex) ? raw.wrongIndex : tokens.findIndex(token => bare(token) === bare(wrong));
    if (wrongIndex < 0 || wrongIndex >= tokens.length) throw new Error(`${where}: the word "${wrong}" is not in the sentence`);
    if (bare(tokens[wrongIndex]) !== bare(wrong)) throw new Error(`${where}: wrongIndex does not point at "${wrong}"`);
    if (bare(fix) === bare(wrong)) throw new Error(`${where}: the fix is the same as the mistake`);
    const item = { id, prompt: sentence, tokens, wrongIndex, explanation: clean(raw.explanation), topic: "Error Hunt", typed: true, mode: "exact" };
    item.answer = correctedSentence(item, fix);
    item.alternatives = (Array.isArray(raw.alternatives) ? raw.alternatives : []).map(clean).filter(Boolean).map(alt => correctedSentence(item, alt));
    return item;
  });
}

export function supports(game) { return game.type === TYPE; }

export function render(container, game, bus) {
  const items = game.questions;
  const answers = {}; let index = 0; let run = 0; let bestRun = 0; let fixes = 0; let tries = 0; let picked = -1;
  const progress = meter("Sentence", items.length); const live = liveRegion();
  const stage = el("div", "gm-stage");
  container.replaceChildren(progress.element, stage, live.element);
  const removeKeys = numberKeys(container, ".gm-token");

  function show() {
    const item = items[index]; tries = 0; picked = -1;
    progress.set(index, `${items.length - index} to go`);
    const group = el("div", "gm-tokens"); group.setAttribute("role", "group"); group.setAttribute("aria-labelledby", "gmPrompt");
    const label = el("p", "gm-hint", "Tap the word that is wrong."); label.id = "gmPrompt";
    const form = el("form", "gm-answer"); form.hidden = true;
    const input = el("input", "gm-input"); input.type = "text"; input.autocomplete = "off"; input.id = "gmFix"; input.setAttribute("aria-label", "Type the correct word");
    const check = el("button", "button", "Fix it"); check.type = "submit";
    form.append(input, check);
    const feedback = el("p", "gm-feedback"); feedback.setAttribute("aria-live", "polite");
    const next = button("Next", "button", () => advance()); next.hidden = true;
    item.tokens.forEach((token, tokenIndex) => {
      const node = button(token, "gm-token", () => choose(tokenIndex), { "aria-pressed": "false", "aria-label": `Word ${tokenIndex + 1}: ${token}` });
      group.append(node);
    });
    function choose(tokenIndex) {
      if (!next.hidden) return;
      if (tokenIndex === item.wrongIndex) {
        picked = tokenIndex; group.querySelectorAll(".gm-token").forEach((node, i) => { node.setAttribute("aria-pressed", String(i === tokenIndex)); node.disabled = i !== tokenIndex; });
        form.hidden = false; label.textContent = "That is the mistake. Type the correct word."; input.focus(); bus.services.sound("good"); live.say("Right word. Now type the correction.");
      } else {
        tries += 1; bus.services.sound("bad"); run = 0;
        if (tries >= 2) { reveal(false, `The mistake was "${item.tokens[item.wrongIndex]}".`); return; }
        feedback.textContent = `"${item.tokens[tokenIndex]}" is fine. Look again.`; live.say(feedback.textContent);
      }
    }
    function reveal(correct, message) {
      group.querySelectorAll(".gm-token").forEach((node, i) => { node.disabled = true; if (i === item.wrongIndex) node.classList.add(correct ? "is-right" : "is-missed"); });
      form.hidden = true; next.hidden = false; next.textContent = index === items.length - 1 ? "Finish" : "Next sentence"; next.focus();
      feedback.textContent = `${message}${item.explanation ? ` ${item.explanation}` : ""} ${correct ? "" : `Correct sentence: ${item.answer}`}`.trim(); live.say(feedback.textContent);
    }
    form.addEventListener("submit", event => {
      event.preventDefault();
      const attempt = correctedSentence(item, input.value);
      const accepted = [item.answer, ...item.alternatives].some(candidate => bare(candidate.replace(/[.,!?;:]/g, "")) === bare(attempt.replace(/[.,!?;:]/g, "")) || candidate.toLowerCase() === attempt.toLowerCase());
      if (!clean(input.value)) { feedback.textContent = "Type the word first."; return; }
      answers[item.id] = attempt;
      if (accepted) { fixes += 1; run += 1; bestRun = Math.max(bestRun, run); bus.services.sound("good"); bus.services.haptic(20); reveal(true, "Fixed!"); }
      else { run = 0; bus.services.sound("bad"); answers[item.id] = attempt; reveal(false, "Not quite."); }
    });
    stage.replaceChildren(label, group, form, feedback, next);
    label.tabIndex = -1; label.focus({ preventScroll: true });
  }
  function advance() { index += 1; if (index >= items.length) finish(); else show(); }
  function finish() { progress.set(items.length); removeKeys(); bus.finish({ answers, bestRun, fixes, kind: "error-hunt" }); }
  show();
  return { destroy: removeKeys };
}
