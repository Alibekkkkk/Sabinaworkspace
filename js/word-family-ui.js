// Word family UI: the "Word family" panel on a flashcard and the "Form the word" mini-exercise.
// DOM APIs and textContent only (lesson content is data, never markup).
import { button, el, feedbackBox } from "./grammar-ladder-ui.js";
import { checkChoose, checkMorphemes, checkTypedForm, explainForm, familyItems, familyKey, familyOkKey, visibleForms } from "./word-family.js";

const plain = text => String(text || "").replace(/<[^>]*>/g, "");

// Table of every form of one headword, with an example for each and the affixes that build them.
export function renderFamilyPanel(vocabItem, { isTeacher = false } = {}) {
  const panel = el("section", "wf-panel");
  panel.setAttribute("aria-label", `Word family: ${vocabItem.en}`);
  const forms = visibleForms(vocabItem, isTeacher);
  panel.append(el("h3", "wf-panel__title", `Word family: ${vocabItem.en}`));
  if (!forms.length) { panel.append(el("p", "ladder-note", "No word family for this word yet.")); return panel; }
  if (vocabItem.forms.status !== "approved") panel.append(el("p", "ds-banner ds-banner--warning", "Draft: only you can see this word family."));
  const list = el("dl", "wf-forms");
  for (const form of forms) {
    const row = el("div", "wf-forms__row");
    const term = el("dt", "wf-forms__pos", form.label);
    const detail = el("dd", "wf-forms__word");
    const word = el("b", "", form.w);
    detail.append(word);
    if (form.needsReview) detail.append(el("span", "wf-flag", " needs your review"));
    if (form.parts) detail.append(el("span", "ladder-note", form.parts.join(" + ")));
    detail.append(el("span", "ladder-note", plain(form.ex)));
    row.append(term, detail);
    list.append(row);
  }
  panel.append(list);
  const affixes = Array.isArray(vocabItem.forms.affixes) ? vocabItem.forms.affixes : [];
  if (affixes.length) {
    const chips = el("ul", "wf-affixes");
    for (const affix of affixes) chips.append(el("li", "wf-affix", `${affix.part} (${affix.type}): ${affix.meaning}`));
    panel.append(el("h4", "wf-panel__sub", "Word parts"), chips);
  }
  return panel;
}

// store: { get(key), set(key, value) }; flag(id, prompt, answer) is optional.
export function renderFormTheWord({ vocab, store, isTeacher = false }) {
  const items = familyItems(vocab, { isTeacher });
  if (!items.length) return null;
  const root = el("section", "ds-card wf");
  root.setAttribute("aria-label", "Form the word");
  root.append(el("h3", "wf__title", "Form the word"));
  root.append(el("p", "ladder-note", "Use the word family to complete each word. Tap Check to see why."));
  if (isTeacher && vocab.some(item => item.forms && item.forms.status !== "approved")) root.append(el("p", "ds-banner ds-banner--warning", "Draft families are shown because you are in teacher preview. Students see approved families only."));
  const progress = el("p", "wf__progress");
  progress.setAttribute("role", "status");
  root.append(progress);
  const isDone = id => store.get(familyOkKey(id)) === true;
  const refresh = () => { progress.textContent = `${items.filter(item => isDone(item.id)).length} of ${items.length} done`; };
  const finish = item => { store.set(familyOkKey(item.id), true); refresh(); };

  items.forEach((item, index) => {
    const wrap = el("div", "ladder-item wf-item");
    wrap.append(el("p", "ladder-prompt", `${index + 1}. ${item.prompt}`));
    const feedback = feedbackBox();
    const wrong = () => feedback.show("wrong", "Not quite", explainForm(item));
    const right = () => feedback.show("correct", "Correct!", explainForm(item));
    const done = isDone(item.id);
    if (item.type === "choose") {
      const group = el("div", "ladder-row");
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", "Choose the word");
      for (const option of item.options) {
        const choice = button(option, "ds-btn ds-btn--secondary ds-btn--small", () => {
          if (isDone(item.id)) return;
          if (checkChoose(item, option)) { right(); group.querySelectorAll("button").forEach(b => { b.disabled = true; }); finish(item); } else wrong();
        });
        if (done) choice.disabled = true;
        group.append(choice);
      }
      wrap.append(group);
    } else if (item.type === "type") {
      const input = el("input", "ds-input ladder-input");
      input.type = "text"; input.autocomplete = "off"; input.autocapitalize = "none"; input.spellcheck = false; input.maxLength = 40;
      input.setAttribute("aria-label", "Your word");
      const saved = store.get(familyKey(item.id));
      if (typeof saved === "string") input.value = saved;
      const check = button("Check", "ds-btn ds-btn--primary ds-btn--small", () => {
        if (isDone(item.id)) return;
        store.set(familyKey(item.id), input.value.slice(0, 40));
        if (checkTypedForm(item, input.value)) { right(); input.disabled = true; check.disabled = true; finish(item); } else wrong();
      });
      input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); check.click(); } });
      if (done) { input.disabled = true; check.disabled = true; }
      const row = el("div", "ladder-row");
      row.append(input, check);
      wrap.append(row);
    } else {
      // build from morphemes: tap the pieces in order
      const chosen = [];
      const answerArea = el("div", "ladder-tiles ladder-tiles--answer");
      answerArea.setAttribute("role", "group");
      answerArea.setAttribute("aria-label", "Your word");
      const bank = el("div", "ladder-tiles");
      bank.setAttribute("role", "group");
      bank.setAttribute("aria-label", "Word parts");
      const draw = () => {
        answerArea.replaceChildren(...chosen.map((tile, at) => {
          const piece = button(tile, "ladder-tile", () => { if (isDone(item.id)) return; chosen.splice(at, 1); draw(); });
          piece.setAttribute("aria-label", `Remove ${tile}`);
          return piece;
        }));
        const left = [...item.tiles];
        for (const tile of chosen) left.splice(left.indexOf(tile), 1);
        bank.replaceChildren(...left.map(tile => {
          const piece = button(tile, "ladder-tile", () => { if (isDone(item.id)) return; chosen.push(tile); draw(); });
          piece.disabled = isDone(item.id);
          return piece;
        }));
      };
      if (done) chosen.push(...item.parts.map(part => part.toLowerCase()));
      draw();
      const check = button("Check", "ds-btn ds-btn--primary ds-btn--small", () => {
        if (isDone(item.id)) return;
        if (checkMorphemes(item, chosen)) { right(); check.disabled = true; finish(item); draw(); } else wrong();
      });
      check.disabled = done;
      wrap.append(answerArea, bank, check);
    }
    if (done) right();
    wrap.append(feedback.element);
    root.append(wrap);
  });
  refresh();
  return root;
}
