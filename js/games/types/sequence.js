// Shared shell for games that show one item at a time: progress meter, prompt focus, feedback, a Next button, run tracking.
// A game supplies renderItem(item, api) and decides when an item is settled with api.settle({ correct, given, note }).
import { button, el, liveRegion, meter, numberKeys } from "../ui.js";

export function sequence({ container, bus, items, label = "Item", intro = "", renderItem, extra = () => ({}), numberKeySelector = "" }) {
  const answers = {}; let index = 0; let run = 0; let bestRun = 0; let hints = 0; let destroyed = false;
  const progress = meter(label, items.length); const live = liveRegion(); const stage = el("div", "gm-stage");
  const parts = []; if (intro) parts.push(el("p", "gm-hint", intro));
  parts.push(progress.element, stage, live.element);
  container.replaceChildren(...parts);
  const removeKeys = numberKeySelector ? numberKeys(container, numberKeySelector) : () => {};
  const cleanups = [];

  function show() {
    const item = items[index];
    progress.set(index, `${items.length - index} to go${run >= 3 ? `, streak ${run}` : ""}`);
    const feedback = el("p", "gm-feedback"); feedback.setAttribute("aria-live", "polite");
    const next = button(index === items.length - 1 ? "See results" : "Next", "button", advance); next.hidden = true;
    let settled = false;
    const api = {
      item, bus, say: text => live.say(text),
      useHint(cost = 1) { hints += cost; },
      onCleanup: fn => cleanups.push(fn),
      isSettled: () => settled,
      settle({ correct, given = "", note = "" }) {
        if (settled || destroyed) return; settled = true;
        answers[item.id] = correct ? item.answer : given;
        if (correct) { run += 1; bestRun = Math.max(bestRun, run); bus.services.sound("good"); bus.services.haptic(20); } else { run = 0; bus.services.sound("bad"); }
        feedback.textContent = `${correct ? "Correct!" : `Not quite. The answer is: ${item.answer}.`} ${note}`.trim(); live.say(feedback.textContent);
        next.hidden = false; next.focus();
      }
    };
    const view = renderItem(item, api);
    const prompt = view.prompt || el("p", "gm-prompt", item.prompt); prompt.id = "gmQuestion"; prompt.tabIndex = -1;
    stage.replaceChildren(prompt, view.body, feedback, next);
    prompt.focus({ preventScroll: true });
    if (view.focus) setTimeout(() => { if (!destroyed && !api.isSettled()) view.focus(); }, 0);
  }
  function cleanup() { while (cleanups.length) { try { cleanups.pop()(); } catch (error) { /* already gone */ } } }
  function advance() { cleanup(); index += 1; if (index >= items.length) finish(); else show(); }
  function finish() { progress.set(items.length); removeKeys(); bus.finish({ answers, bestRun, hints, ...extra() }); }
  show();
  return { destroy() { destroyed = true; cleanup(); removeKeys(); } };
}

export const isTyped = item => Boolean(item.typed);
