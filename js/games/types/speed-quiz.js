// Speed Quiz: one multiple-choice question at a time, number keys pick an option, a streak bonus rewards runs.
// With "no timers" on it becomes the untimed Steady Quiz: same questions, no countdown, nothing runs out.
import { timerSeconds } from "../settings.js";
import { button, el, liveRegion, meter, numberKeys } from "../ui.js";

export const TYPE = "speed-quiz";
export function supports(game) { return game.type === TYPE; }

export function render(container, game, bus) {
  const items = game.questions; const answers = {};
  const seconds = timerSeconds(bus.settings, game.secondsPerQuestion || 20);
  let index = 0; let run = 0; let bestRun = 0; let timer = 0; let streakPoints = 0;
  const progress = meter("Question", items.length); const live = liveRegion();
  const clock = el("p", "gm-timer"); clock.setAttribute("aria-live", "off");
  const mode = el("p", "gm-hint", seconds ? `Timed: ${seconds} seconds a question.` : "Untimed: take as long as you like.");
  const stage = el("div", "gm-stage");
  container.replaceChildren(mode, progress.element, clock, stage, live.element);
  const removeKeys = numberKeys(stage, ".gm-option");

  function show() {
    const item = items[index]; progress.set(index, `${items.length - index} to go${run >= 2 ? `, streak ${run}` : ""}`);
    const prompt = el("p", "gm-prompt", item.prompt); prompt.id = "gmQuestion";
    const options = el("div", "gm-options"); options.setAttribute("role", "group"); options.setAttribute("aria-labelledby", "gmQuestion");
    const feedback = el("p", "gm-feedback"); feedback.setAttribute("aria-live", "polite");
    const next = button(index === items.length - 1 ? "See results" : "Next", "button", advance); next.hidden = true;
    let left = seconds; let settled = false;
    const settle = (choice, timedOut) => {
      if (settled) return; settled = true; clearInterval(timer);
      const right = choice === item.answer; answers[item.id] = choice || "";
      options.querySelectorAll("button").forEach(node => { node.disabled = true; if (node.dataset.value === item.answer) node.classList.add("is-right"); else if (node.dataset.value === choice) node.classList.add("is-missed"); });
      if (right) { run += 1; bestRun = Math.max(bestRun, run); if (run >= 3) streakPoints += 1; bus.services.sound("good"); bus.services.haptic(20); } else { run = 0; bus.services.sound("bad"); }
      feedback.textContent = right ? `Correct!${run >= 3 ? ` Streak of ${run}.` : ""}` : `${timedOut ? "Time is up." : "Not quite."} The answer is: ${item.answer}.`; live.say(feedback.textContent);
      next.hidden = false; next.focus();
      if (seconds && timedOut) setTimeout(() => { if (document.body.contains(next)) advance(); }, 1800);
    };
    item.options.forEach((option, i) => { const node = button(`${i + 1}. ${option}`, "gm-option", () => settle(option, false)); node.dataset.value = option; options.append(node); });
    stage.replaceChildren(prompt, options, feedback, next);
    prompt.tabIndex = -1; prompt.focus({ preventScroll: true }); // keep focus on the card so number keys keep working
    clock.textContent = seconds ? `${left}s` : "";
    if (seconds) timer = setInterval(() => { left -= 1; clock.textContent = `${Math.max(0, left)}s`; if (left <= 0) settle("", true); }, 1000);
  }
  function advance() { index += 1; clearInterval(timer); if (index >= items.length) { removeKeys(); progress.set(items.length); bus.finish({ answers, bestRun, kind: "game", streakPoints }); } else show(); }
  show();
  return { destroy() { clearInterval(timer); removeKeys(); } };
}
