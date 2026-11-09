// Boss Battle: the unit test as a fight. Correct answers damage the boss, mistakes cost a shield. Nobody is locked out:
// with no shield left a mistake just lets the boss heal a little, and the round always reaches its summary.
// Items come from testMcq (choice), testTfng (True / False / Not Given), testShort and testComplete (typed).
import { button, el, liveRegion, meter, numberKeys } from "../ui.js";

export const TYPE = "boss-battle";
export const SHIELDS = 3;
export const DAMAGE = 10;
export const HEAL = 10;
export const WIN_SHARE = 0.7; // the boss falls when about 70% of the questions are answered correctly

export function startBattle(total) {
  const maxHp = Math.max(1, Math.ceil(total * WIN_SHARE)) * DAMAGE;
  return { maxHp, hp: maxHp, shield: SHIELDS, run: 0, bestRun: 0, correct: 0, answered: 0, total };
}

// Pure reducer: returns the new state and what happened, for tests and for the screen.
export function strike(state, correct) {
  const next = { ...state, answered: state.answered + 1 };
  let event;
  if (correct) {
    next.run = state.run + 1; next.bestRun = Math.max(state.bestRun, next.run); next.correct = state.correct + 1;
    const damage = DAMAGE + (next.run >= 3 && next.run % 3 === 0 ? 5 : 0); // a small bonus for three in a row
    next.hp = Math.max(0, state.hp - damage); event = next.hp === 0 && state.hp > 0 ? "defeated" : "hit";
  } else {
    next.run = 0;
    if (state.shield > 0) { next.shield = state.shield - 1; event = "shield-lost"; }
    else { next.hp = Math.min(state.maxHp, state.hp + HEAL); event = "boss-heals"; }
  }
  return { state: next, event };
}

export const won = state => state.hp === 0;

export function weakPoints(mistakes) {
  const counts = new Map();
  for (const mistake of mistakes) counts.set(mistake.topic, (counts.get(mistake.topic) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([topic, count]) => ({ topic, count }));
}

// Builds boss items from lesson content; every item has { id, prompt, answer, kind, topic } plus options or alternatives.
export function fromContent(content) {
  const items = [];
  for (const item of content.testMcq || []) {
    const options = Array.isArray(item.options) ? item.options : [];
    if (item.q && options.includes(item.correct)) items.push({ id: String(item.id || `mcq-${items.length + 1}`), prompt: item.q, answer: item.correct, options, kind: "choice", topic: "Vocabulary and facts", explanation: item.exp || "" });
  }
  for (const item of content.testTfng || []) if (item.q && item.answer) items.push({ id: String(item.id || `tfng-${items.length + 1}`), prompt: item.q, answer: item.answer, options: ["True", "False", "Not Given"], kind: "choice", topic: "Reading: True / False / Not Given", explanation: item.exp || "" });
  for (const item of content.testShort || []) {
    const accepted = Array.isArray(item.answers) ? item.answers : [];
    if (item.q && accepted.length) items.push({ id: String(item.id || `short-${items.length + 1}`), prompt: item.q, answer: accepted[0], alternatives: accepted.slice(1), kind: "typed", typed: true, mode: "fuzzy", topic: "Reading: short answers", explanation: item.exp || "" });
  }
  for (const item of content.testComplete || []) {
    const prompt = item.p || item.prompt; const answer = item.a || item.answer;
    if (prompt && answer) items.push({ id: String(item.id || `gap-${items.length + 1}`), prompt, answer, kind: "typed", typed: true, mode: "exact", topic: "Grammar", explanation: item.exp || "" });
  }
  return items;
}

export function supports(game) { return game.type === TYPE; }

export function render(container, game, bus) {
  const items = game.questions; const answers = {}; const wrong = [];
  let battle = startBattle(items.length); let index = 0;
  const bossBar = meter("Boss health", battle.maxHp); const shieldBar = meter("Your shield", SHIELDS); const progress = meter("Question", items.length);
  const arena = el("div", "gm-arena"); const boss = el("div", "gm-boss", "🐉"); boss.setAttribute("aria-hidden", "true");
  arena.append(boss, bossBar.element, shieldBar.element, progress.element);
  const stage = el("div", "gm-stage"); const live = liveRegion();
  container.replaceChildren(arena, stage, live.element);
  const removeKeys = numberKeys(stage, ".gm-option");
  const paint = () => { bossBar.set(battle.hp); shieldBar.set(battle.shield); progress.set(index, `${items.length - index} to go`); };

  function show() {
    const item = items[index]; paint();
    const prompt = el("p", "gm-prompt", item.prompt); prompt.id = "gmQuestion";
    const feedback = el("p", "gm-feedback"); feedback.setAttribute("aria-live", "polite");
    const next = button(index === items.length - 1 ? "See results" : "Next", "button", () => { index += 1; if (index >= items.length) end(); else show(); }); next.hidden = true;
    const settle = (given, correct) => {
      answers[item.id] = given; if (bus.reportAnswer) bus.reportAnswer(correct, item, given); const before = battle; const out = strike(battle, correct); battle = out.state;
      if (!correct) wrong.push({ topic: item.topic });
      bus.services.sound(correct ? (out.event === "defeated" ? "win" : "hit") : "bad"); bus.services.haptic(correct ? 20 : [30, 40, 30]);
      const note = correct ? (out.event === "defeated" ? "The boss is defeated!" : "Direct hit!") : out.event === "shield-lost" ? "Shield cracked." : "The boss heals a little. Keep going, you cannot be locked out.";
      feedback.textContent = `${correct ? "Correct." : `Not quite. The answer is: ${item.answer}.`} ${note} ${item.explanation || ""}`.trim(); live.say(feedback.textContent);
      boss.classList.toggle("is-hit", correct && before.hp > battle.hp); paint(); next.hidden = false; next.focus();
    };
    let body;
    if (item.kind === "choice") {
      body = el("div", "gm-options"); body.setAttribute("role", "group"); body.setAttribute("aria-labelledby", "gmQuestion");
      item.options.forEach((option, i) => body.append(button(`${i + 1}. ${option}`, "gm-option", () => { body.querySelectorAll("button").forEach(node => { node.disabled = true; }); settle(option, option === item.answer); })));
    } else {
      body = el("form", "gm-answer"); const input = el("input", "gm-input"); input.type = "text"; input.autocomplete = "off"; input.setAttribute("aria-labelledby", "gmQuestion");
      const check = el("button", "button", "Attack"); check.type = "submit"; body.append(input, check);
      body.addEventListener("submit", async event => { event.preventDefault(); if (!input.value.trim()) return; input.disabled = true; check.disabled = true; const { isAnswerCorrect } = await import("../../grading.js"); settle(input.value, isAnswerCorrect(input.value, [item.answer, ...(item.alternatives || [])], { mode: item.mode || "exact" })); });
      setTimeout(() => input.focus(), 0);
    }
    stage.replaceChildren(prompt, body, feedback, next);
    prompt.tabIndex = -1; prompt.focus({ preventScroll: true });
  }
  function end() {
    removeKeys(); const weak = weakPoints(wrong);
    stage.replaceChildren(el("h3", "", won(battle) ? "Boss defeated!" : "The boss is still standing"), el("p", "", won(battle) ? "You answered enough questions to win the fight." : "Not this time. Every question you missed is saved for practice, so next round is easier."));
    if (weak.length) { const list = el("ul", "gm-weak"); for (const point of weak) list.append(el("li", "", `${point.topic}: ${point.count} to practise`)); stage.append(el("p", "gm-hint", "Where to practise:"), list); }
    bus.services.celebrate(won(battle) ? "epic" : "small"); paint();
    bus.finish({ answers, bestRun: battle.bestRun, won: won(battle), kind: "boss" });
  }
  show();
  return { destroy: removeKeys };
}
