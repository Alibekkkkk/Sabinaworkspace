// The dictation sentence: one input per hidden word, typed in place, with per-word feedback after checking.
// DOM APIs and textContent only. Keyboard: type, then Space or Enter moves to the next gap (or when the word is
// complete), Backspace in an empty gap goes back, Tab and Shift+Tab work normally, Enter in the last gap checks.
import { checkGap, diffWord } from "./answers.js";
import { showLetterCount } from "./levels.js";
import { bareWord, gapsForLevel, tokenize } from "./schema.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// "(river)," -> { lead: "(", core: "river", trail: ")," }
export function splitToken(token) {
  const match = String(token).match(/^([^A-Za-z0-9’']*)(.*?)([^A-Za-z0-9’']*)$/);
  return { lead: match[1], core: match[2], trail: match[3] };
}

export function createDictation({ item, level = "easy", focusGaps = null, whenChange = () => {}, whenSubmit = () => {} }) {
  const tokens = tokenize(item.text);
  const gapIndexes = (focusGaps && focusGaps.length ? focusGaps : gapsForLevel(item, level)).filter(index => index < tokens.length && /[A-Za-z0-9]/.test(tokens[index]));
  const counts = showLetterCount(level);
  const root = el("p", "ls-sentence");
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "Sentence to complete");
  const gaps = [];
  let checked = false;

  tokens.forEach((token, index) => {
    const parts = splitToken(token);
    const word = el("span", "ls-token");
    if (gapIndexes.includes(index)) {
      const expected = bareWord(token);
      const position = gaps.length;
      if (parts.lead) word.append(el("span", "ls-punct", parts.lead));
      const input = el("input", "ls-gap");
      input.type = "text";
      input.autocomplete = "off"; input.autocapitalize = "none"; input.spellcheck = false; input.setAttribute("autocorrect", "off");
      input.enterKeyHint = "next";
      input.maxLength = counts ? expected.length + 3 : 24;
      input.style.setProperty("--gap-chars", String(Math.max(3, counts ? expected.length : 8)));
      input.placeholder = counts ? "*".repeat(expected.length) : "…";
      gaps.push({ index, expected, input, assisted: false, revealed: false });
      word.append(input);
      if (parts.trail) word.append(el("span", "ls-punct", parts.trail));
      input.addEventListener("input", () => {
        if (checked) return;
        if (/\s/.test(input.value)) { input.value = input.value.replace(/\s+/g, ""); if (input.value) focusGap(position + 1); }
        else if (counts && input.value.length >= expected.length && position < gaps.length - 1 && input.selectionStart === input.value.length) focusGap(position + 1);
        whenChange(snapshot());
      });
      input.addEventListener("keydown", event => {
        if (checked) return;
        if (event.key === "Enter") { event.preventDefault(); if (position < gaps.length - 1) focusGap(position + 1); else whenSubmit(); }
        else if (event.key === "Backspace" && input.selectionStart === 0 && input.selectionEnd === 0 && position > 0) { event.preventDefault(); focusGap(position - 1, true); }
      });
    } else {
      word.append(el("span", "ls-shown", token));
    }
    root.append(word, document.createTextNode(" "));
  });
  gaps.forEach((gap, position) => {
    const count = gaps.length;
    gap.input.setAttribute("aria-label", counts ? `Gap ${position + 1} of ${count}, ${gap.expected.length} letters` : `Gap ${position + 1} of ${count}`);
  });
  if (!gaps.length) root.append(el("span", "ls-sr", "This sentence has no gaps."));

  function focusGap(position, atEnd = false) {
    const gap = gaps[Math.max(0, Math.min(gaps.length - 1, position))];
    if (!gap) return;
    gap.input.focus();
    if (atEnd) gap.input.setSelectionRange(gap.input.value.length, gap.input.value.length); else gap.input.select();
  }
  const snapshot = () => gaps.map(gap => ({ index: gap.index, value: gap.input.value }));
  const currentPosition = () => {
    const focused = gaps.findIndex(gap => gap.input === document.activeElement);
    if (focused >= 0) return focused;
    const empty = gaps.findIndex(gap => !gap.input.value.trim());
    return empty >= 0 ? empty : 0;
  };

  return {
    element: root,
    gaps,
    focusFirst() { focusGap(0); },
    get complete() { return gaps.length > 0 && gaps.every(gap => gap.input.value.trim()); },
    get checked() { return checked; },
    // 💡 reveal the next letter of the current gap (the word then no longer counts as unaided)
    hint() {
      if (checked || !gaps.length) return null;
      const gap = gaps[currentPosition()];
      if (gap.revealed) return gap;
      const typed = gap.input.value;
      const correctSoFar = gap.expected.startsWith(typed.toLowerCase());
      gap.input.value = gap.expected.slice(0, (correctSoFar ? typed.length : 0) + 1);
      gap.assisted = true;
      gap.input.focus();
      whenChange(snapshot());
      return gap;
    },
    // 👁 fill in the current gap with the answer; it is marked as missed
    reveal() {
      if (checked || !gaps.length) return null;
      const gap = gaps[currentPosition()];
      gap.input.value = gap.expected;
      gap.assisted = true; gap.revealed = true;
      gap.input.readOnly = true;
      whenChange(snapshot());
      return gap;
    },
    // Marks every word and returns [{ index, expected, typed, ok, assisted }]. A revealed word is never ok.
    check({ skipped = false } = {}) {
      checked = true;
      const results = gaps.map(gap => {
        const result = skipped ? { ok: false, typed: "", expected: gap.expected } : checkGap(item, gap.index, gap.input.value);
        return { index: gap.index, expected: gap.expected, typed: result.typed, ok: result.ok && !gap.revealed, assisted: gap.assisted };
      });
      const byIndex = new Map(results.map(result => [result.index, result]));
      root.dataset.checked = "true";
      root.replaceChildren();
      tokens.forEach((token, index) => {
        const parts = splitToken(token);
        const result = byIndex.get(index);
        const word = el("span", "ls-token");
        if (parts.lead) word.append(el("span", "ls-punct", parts.lead));
        const label = el("span", "ls-word");
        label.dataset.word = bareWord(token);
        label.dataset.index = String(index);
        if (result) {
          label.dataset.state = result.ok ? "ok" : "wrong";
          if (result.ok) label.append(el("b", "ls-word__ok", `✓ ${splitToken(token).core}`));
          else {
            const diff = diffWord(result.expected, result.typed);
            const correct = el("b", "ls-word__right");
            for (const letter of diff.letters) correct.append(el("span", letter.status === "wrong" ? "ls-letter ls-letter--wrong" : "ls-letter", letter.char));
            label.append(el("span", "ls-word__mark", "✗ "), correct);
            if (result.typed && !skipped) label.append(el("span", "ls-word__typed", ` you typed “${result.typed}”`));
          }
          label.append(el("span", "ls-sr", result.ok ? ". Correct." : `. Wrong. Correct spelling: ${result.expected}.${result.typed ? ` You typed ${result.typed}.` : " You left it empty."}`));
        } else label.append(el("span", "ls-shown", parts.core));
        word.append(label);
        if (parts.trail) word.append(el("span", "ls-punct", parts.trail));
        root.append(word, document.createTextNode(" "));
      });
      return results;
    },
    // After checking, every word can be tapped: whenWord(word, index, buttonElement)
    makeWordsTappable(whenWord) {
      for (const label of root.querySelectorAll(".ls-word")) {
        const button = el("button", "ls-word-btn");
        button.type = "button";
        button.dataset.word = label.dataset.word;
        button.dataset.state = label.dataset.state || "plain";
        button.setAttribute("aria-haspopup", "true");
        button.append(...label.childNodes);
        button.addEventListener("click", () => whenWord(label.dataset.word, Number(label.dataset.index), button));
        label.replaceWith(button);
      }
    },
    disable() { for (const gap of gaps) gap.input.disabled = true; }
  };
}
