// Pair games: Word Match (pick a word, then its meaning), Memory Cards (flip two, find the pair, with a moves count) and
// Flashcards (reveal, then say whether you knew it). All work with taps, clicks and the keyboard.
import { seededShuffle } from "../seed.js";
import { button, el, liveRegion, meter } from "../ui.js";
import { sequence } from "./sequence.js";

// ---- Memory: a pure board so the rules can be tested without a screen ------------------------------------------
export function memoryBoard(pairs, order = null) {
  const cards = pairs.flatMap(pair => [{ pairId: pair.id, value: pair.prompt, side: "word" }, { pairId: pair.id, value: pair.answer, side: "meaning" }]);
  const arranged = order ? order.map(index => cards[index]) : cards;
  return { cards: arranged.map((card, index) => ({ ...card, index, matched: false })), open: [], moves: 0, misses: {}, matched: 0, pairs: pairs.length, run: 0, bestRun: 0 };
}

// Flip one card. Returns { state, event } where event is "first", "match", "mismatch" or "ignored".
export function flipCard(state, index) {
  const card = state.cards[index];
  if (!card || card.matched || state.open.includes(index) || state.open.length >= 2) return { state, event: "ignored" };
  const open = [...state.open, index];
  if (open.length === 1) return { state: { ...state, open }, event: "first" };
  const first = state.cards[open[0]]; const moves = state.moves + 1;
  if (first.pairId === card.pairId) {
    const cards = state.cards.map(item => (item.pairId === card.pairId ? { ...item, matched: true } : item));
    const run = state.run + 1;
    return { state: { ...state, cards, open: [], moves, matched: state.matched + 1, run, bestRun: Math.max(state.bestRun, run) }, event: "match" };
  }
  const misses = { ...state.misses }; for (const id of [first.pairId, card.pairId]) misses[id] = (misses[id] || 0) + 1;
  return { state: { ...state, open, moves, misses, run: 0 }, event: "mismatch" };
}
export const closeMismatch = state => ({ ...state, open: [] });
// A pair found only after two or more wrong flips counts as a miss, so it comes back in review.
export const MEMORY_MISS_LIMIT = 2;
export const memoryPairCorrect = (state, pairId) => (state.misses[pairId] || 0) < MEMORY_MISS_LIMIT;

export const memoryCards = {
  TYPE: "memory-cards",
  supports: game => game.type === "memory-cards",
  render(container, game, bus) {
    const pairs = game.pairs; let state = memoryBoard(pairs, seededShuffle([...pairs.keys()].flatMap(i => [i * 2, i * 2 + 1]), `memory:${game.id}:${Date.now()}`));
    const progress = meter("Pairs found", pairs.length); const live = liveRegion();
    const moves = el("p", "gm-hint", "Moves: 0");
    const board = el("div", "memory-board"); board.setAttribute("role", "group"); board.setAttribute("aria-label", "Cards. Press a card to turn it over.");
    const nodes = state.cards.map(card => {
      const node = button("?", "memory-card", () => flip(card.index), { "aria-label": `Card ${card.index + 1}, face down` });
      board.append(node); return node;
    });
    container.replaceChildren(el("p", "gm-hint", "Turn over two cards. A word and its meaning make a pair."), progress.element, moves, board, live.element);
    const paint = () => {
      state.cards.forEach((card, i) => {
        const open = state.open.includes(i) || card.matched; const node = nodes[i];
        node.textContent = open ? card.value : "?"; node.classList.toggle("is-flipped", open); node.classList.toggle("matched", card.matched); node.disabled = card.matched;
        node.setAttribute("aria-label", open ? `Card ${i + 1}: ${card.value}${card.matched ? ", matched" : ""}` : `Card ${i + 1}, face down`);
      });
      progress.set(state.matched); moves.textContent = `Moves: ${state.moves}`;
    };
    let timer = 0; let done = false;
    function flip(index) {
      if (done) return;
      const out = flipCard(state, index); state = out.state; paint();
      if (out.event === "match") {
        bus.services.sound("good"); live.say("A pair!");
        if (state.matched === state.pairs) finish();
      } else if (out.event === "mismatch") {
        bus.services.sound("bad"); live.say(`Not a pair. ${state.cards[state.open[0]].value} and ${state.cards[state.open[1]].value}.`);
        timer = setTimeout(() => { state = closeMismatch(state); paint(); }, bus.settings && bus.settings.calm ? 1400 : 900);
      }
    }
    function finish() {
      done = true; const answers = {};
      for (const pair of pairs) answers[pair.id] = memoryPairCorrect(state, pair.id) ? pair.answer : "";
      bus.services.celebrate("small");
      bus.finish({ answers, bestRun: state.bestRun, kind: "game" });
      live.say(`All pairs found in ${state.moves} moves.`);
    }
    paint();
    return { destroy() { clearTimeout(timer); done = true; } };
  }
};

// ---- Word Match ---------------------------------------------------------------------------------------------------
export const wordMatch = {
  TYPE: "word-match",
  supports: game => game.type === "word-match",
  render(container, game, bus) {
    const pairs = game.pairs; const answers = {}; const missed = new Set(); const matched = new Set();
    let chosen = null; let run = 0; let bestRun = 0;
    const progress = meter("Matched", pairs.length); const live = liveRegion();
    const words = el("div", "gm-col"); words.setAttribute("role", "group"); words.setAttribute("aria-label", "Words");
    const meanings = el("div", "gm-col"); meanings.setAttribute("role", "group"); meanings.setAttribute("aria-label", "Meanings");
    const feedback = el("p", "gm-feedback"); feedback.setAttribute("aria-live", "polite");
    const seed = `match:${game.id}:${Date.now()}`;
    const wordNodes = new Map(); const meaningNodes = new Map();
    for (const pair of seededShuffle(pairs, `${seed}:w`)) { const node = button(pair.prompt, "gm-option", () => pickWord(pair.id), { "aria-pressed": "false" }); wordNodes.set(pair.id, node); words.append(node); }
    for (const pair of seededShuffle(pairs, `${seed}:m`)) { const node = button(pair.answer, "gm-option", () => pickMeaning(pair.id), {}); meaningNodes.set(pair.id, node); meanings.append(node); }
    const columns = el("div", "gm-columns"); columns.append(words, meanings);
    container.replaceChildren(el("p", "gm-hint", "Choose a word, then choose its meaning."), progress.element, columns, feedback, live.element);
    progress.set(0);
    const pickWord = id => {
      if (matched.has(id)) return;
      if (chosen) wordNodes.get(chosen).setAttribute("aria-pressed", "false");
      chosen = id; wordNodes.get(id).setAttribute("aria-pressed", "true"); wordNodes.get(id).classList.add("is-picked");
      for (const [key, node] of wordNodes) if (key !== id) node.classList.remove("is-picked");
      feedback.textContent = `Now choose the meaning of "${pairs.find(p => p.id === id).prompt}".`; live.say(feedback.textContent);
    };
    const pickMeaning = id => {
      if (!chosen) { feedback.textContent = "Choose a word first."; live.say(feedback.textContent); return; }
      const word = pairs.find(p => p.id === chosen);
      if (chosen === id) {
        matched.add(id); answers[id] = missed.has(id) ? "" : word.answer; run = missed.has(id) ? 0 : run + 1; bestRun = Math.max(bestRun, run);
        for (const node of [wordNodes.get(id), meaningNodes.get(id)]) { node.disabled = true; node.classList.add("is-right"); node.classList.remove("is-picked"); }
        wordNodes.get(id).setAttribute("aria-pressed", "false"); chosen = null; bus.services.sound("good"); bus.services.haptic(15);
        feedback.textContent = `${word.prompt} means ${word.answer}.`; live.say(feedback.textContent); progress.set(matched.size);
        if (matched.size === pairs.length) { bus.services.celebrate("small"); bus.finish({ answers, bestRun, kind: "game" }); }
      } else {
        missed.add(chosen); run = 0; bus.services.sound("bad");
        feedback.textContent = `Not that one. Try again for "${word.prompt}".`; live.say(feedback.textContent);
      }
    };
    return { destroy() {} };
  }
};

// ---- Flashcards -------------------------------------------------------------------------------------------------------
export const flashcards = {
  TYPE: "flashcards",
  supports: game => game.type === "flashcards",
  render(container, game, bus) {
    return sequence({
      container, bus, items: game.questions, label: "Card", intro: "Think of the meaning first, then turn the card over.",
      renderItem(item, api) {
        const answer = el("p", "gm-answerline", item.answer); answer.hidden = true; answer.setAttribute("aria-live", "polite");
        const knew = button("I knew it", "button", () => api.settle({ correct: true, note: "Marked as recalled." })); const again = button("Practise again", "button secondary", () => api.settle({ correct: false, given: "", note: "Added to your review list." }));
        knew.hidden = again.hidden = true;
        const reveal = button("Turn the card over", "button secondary", () => { answer.hidden = false; knew.hidden = again.hidden = false; reveal.disabled = true; api.say(`The meaning is: ${item.answer}`); knew.focus(); });
        const body = el("div", "gm-stack"); const row = el("div", "gm-answer"); row.append(knew, again); body.append(reveal, answer, row);
        return { body, focus: () => reveal.focus() };
      }
    });
  }
};
