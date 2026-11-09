// DOM for the game layer inside the lesson player: mission line, card map, extra-practice blocks and the Boss Battle
// version of the final test. Built with createElement only. Nothing here changes how a stage is graded.
import { deckSummary, missionFor, modeAllows } from "./game-mode.js";
import { createServices, loadSettings } from "./settings.js";
import { button, el, meter } from "./ui.js";

export function renderMission({ stageId, mode, deck }) {
  if (!modeAllows(mode, "mission")) return null;
  const box = el("section", "gl-mission"); box.setAttribute("aria-label", "Stage mission");
  box.append(el("p", "gl-mission__text", missionFor(stageId)));
  if (deck) {
    const bar = meter("Cards collected", Math.max(1, deck.total)); bar.set(deck.collected, deck.collected === deck.total && deck.total ? "deck complete" : "");
    box.append(bar.element);
    const list = el("ul", "gl-deck");
    for (const card of deck.cards) { const item = el("li", `gl-card gl-card--${card.state.replace(" ", "-")}`); item.append(el("strong", "", card.word), el("span", "", ` ${card.state}`)); list.append(item); }
    const details = el("details", "gl-deckmap"); details.append(el("summary", "", "Card map"), list);
    box.append(details);
  }
  return box;
}

export function buildDeck(words, statusOf, startedOf) { return deckSummary(words, statusOf, startedOf); }

// Extra practice below a stage: a collapsed block that starts a game module only when opened.
export function renderExtra({ title, intro, load }) {
  const box = el("details", "gl-extra"); box.append(el("summary", "", title), el("p", "gl-hint", intro));
  const host = el("div", "gl-extra__host"); box.append(host);
  let started = false;
  box.addEventListener("toggle", async () => {
    if (!box.open || started) return; started = true;
    try { await load(host); } catch (error) { host.replaceChildren(el("p", "", `This practice could not start: ${error.message}`)); started = false; }
  });
  return box;
}

// Plays a game module inside `host`. Resolves with the evaluated result. `reportAnswer` is optional (the Boss Battle uses it).
export async function playInto(host, game, { reportAnswer, onResult } = {}) {
  const { playModular } = await import("./runtime.js");
  const settings = loadSettings();
  host.replaceChildren(); const arena = el("div", "game-card gm-arena-host"); host.append(arena);
  const handle = playModular({ container: arena, game, settings, reportAnswer, onFinish: result => { if (onResult) onResult(result); } });
  return handle;
}

export function epicMessage() {
  const box = el("section", "gl-epic"); box.setAttribute("role", "status");
  box.append(el("h3", "", "Lesson complete!"), el("p", "", "You finished every stage. That is a real achievement."));
  return box;
}

export { button, createServices, loadSettings };
