// Sentence Builder: tap word tiles to place them, tap a placed tile to take it back. Distractor tiles are supported
// (item.distractors). Works with taps, clicks and the keyboard; there is no drag-only step.
import { seededShuffle } from "../seed.js";
import { normalizeAnswer } from "../engine.js";
import { button, el } from "../ui.js";
import { sequence } from "./sequence.js";

// Pure rules, testable without a screen. `placed` is a list of tile ids; tiles are { id, text }.
export function makeTiles(item, seed) {
  const real = item.words.map((text, i) => ({ id: `w${i}`, text }));
  const extra = (Array.isArray(item.distractors) ? item.distractors : []).map((text, i) => ({ id: `d${i}`, text: String(text) }));
  return seededShuffle([...real, ...extra], seed);
}
export const placedText = (tiles, placed) => placed.map(id => tiles.find(tile => tile.id === id).text).join(" ");
export const sentenceCorrect = (item, tiles, placed) => normalizeAnswer(placedText(tiles, placed)) === normalizeAnswer(item.answer);
export const place = (placed, id) => (placed.includes(id) ? placed : [...placed, id]);
export const takeBack = (placed, id) => placed.filter(value => value !== id);

export const sentenceBuilder = {
  TYPE: "sentence-builder",
  supports: game => game.type === "sentence-builder",
  render(container, game, bus) {
    return sequence({
      container, bus, items: game.questions, label: "Sentence", intro: "Press the word tiles in order to build the sentence. Press a tile in your sentence to take it back.",
      renderItem(item, api) {
        const tiles = makeTiles(item, `${game.id}:${item.id}:${Date.now()}`); let placed = [];
        const sentence = el("p", "gm-built"); sentence.setAttribute("aria-live", "polite");
        const line = el("div", "gm-placed"); line.setAttribute("role", "group"); line.setAttribute("aria-label", "Your sentence");
        const bank = el("div", "tile-bank"); bank.setAttribute("role", "group"); bank.setAttribute("aria-label", "Word tiles");
        const nodes = new Map();
        const paint = () => {
          line.replaceChildren(...placed.map(id => button(tiles.find(t => t.id === id).text, "button", () => { if (api.isSettled()) return; placed = takeBack(placed, id); paint(); api.say("Removed."); }, { "aria-label": `${tiles.find(t => t.id === id).text}, press to remove` })));
          for (const [id, node] of nodes) node.disabled = placed.includes(id) || api.isSettled();
          sentence.textContent = placed.length ? placedText(tiles, placed) : "Your sentence is empty.";
          check.disabled = !placed.length || api.isSettled();
        };
        for (const tile of tiles) { const node = button(tile.text, "button secondary", () => { placed = place(placed, tile.id); paint(); }); nodes.set(tile.id, node); bank.append(node); }
        const clear = button("Clear", "button secondary", () => { placed = []; paint(); });
        const check = button("Check", "button", () => { const ok = sentenceCorrect(item, tiles, placed); api.settle({ correct: ok, given: placedText(tiles, placed) }); paint(); });
        const body = el("div", "gm-stack"); const row = el("div", "gm-answer"); row.append(check, clear); body.append(line, bank, sentence, row);
        paint();
        return { body };
      }
    });
  }
};
