// Grammar ladder UI: rule card and the six steps. DOM APIs and textContent only (lesson content is data,
// never markup). Results are kept in the lesson draft (so they survive a refresh), a produced answer is
// sent to the teacher's review queue, and every feedback box is a polite live region.
import {
  assembleTiles, checkBuild, checkNotice, checkProduce, checkTyped, ladderKey, ladderOkKey, ladderProgress, LADDER_STEPS,
  MAX_PRODUCE_CHARS, noticeTokens, STEP_TITLES
} from "./grammar-ladder.js";

export function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function button(label, className = "ds-btn ds-btn--secondary ds-btn--small", handler) {
  const element = el("button", className, label);
  element.type = "button";
  if (handler) element.addEventListener("click", handler);
  return element;
}

// A feedback sheet: icon + words + reason, never colour alone.
export function feedbackBox() {
  const box = el("div", "ds-feedback");
  box.setAttribute("role", "status");
  box.setAttribute("aria-live", "polite");
  return {
    element: box,
    show(kind, title, detail) {
      box.className = `ds-feedback ds-feedback--${kind}`;
      const icon = el("span", "ds-feedback__icon", kind === "correct" ? "✓" : kind === "wrong" ? "✗" : "i");
      icon.setAttribute("aria-hidden", "true");
      const body = el("div");
      body.append(el("b", "ds-feedback__title", title));
      if (detail) body.append(el("p", "ds-feedback__detail", detail));
      box.replaceChildren(icon, body);
    },
    clear() { box.className = "ds-feedback"; box.replaceChildren(); }
  };
}

export function renderRuleCard(ladder) {
  const card = el("section", "ds-card ladder-rule");
  card.setAttribute("aria-label", `Rule: ${ladder.topic}`);
  card.append(el("h3", "", `Rule card: ${ladder.topic}`));
  card.append(el("p", "ladder-formula", ladder.rule.formula));
  const examples = el("ul", "ladder-examples");
  for (const example of ladder.rule.examples) {
    const item = el("li");
    item.append(el("b", "", example.en));
    if (example.note) item.append(el("span", "ladder-note", example.note));
    examples.append(item);
  }
  card.append(examples);
  const errors = el("details", "ladder-l1");
  errors.append(el("summary", "", "Common mistakes (Kazakh and Russian speakers)"));
  for (const entry of ladder.rule.l1Errors) {
    const block = el("div", "ladder-l1__entry");
    block.append(el("p", "ladder-wrong", `✗ ${entry.wrong}`), el("p", "ladder-right", `✓ ${entry.right}`), el("p", "ladder-note", entry.why));
    errors.append(block);
  }
  card.append(errors);
  return card;
}

// options: { ladder, store: { get(key), set(key, value) }, flag(questionId, prompt, answer, autoResult, extra), isTeacher, stageId }
export function renderGrammarLadder({ ladder, store, flag, isTeacher = false, stageId = 8 }) {
  const root = el("section", "ladder");
  root.setAttribute("aria-label", "Grammar ladder");
  const heading = el("h2", "ladder__title", "Grammar ladder: now use it yourself");
  const progressText = el("p", "ladder__progress");
  progressText.setAttribute("role", "status");
  const track = el("div", "ds-progress");
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", "Ladder progress");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "6");
  const fill = el("span", "ds-progress__fill");
  track.append(fill);
  root.append(heading);
  if (ladder.status !== "approved") {
    const draft = el("div", "ds-banner ds-banner--warning");
    draft.setAttribute("role", "note");
    draft.append(el("p", "", "Draft: only you can see this. Set \"status\": \"approved\" in the lesson file to show it to the student."));
    root.append(draft);
  }
  root.append(progressText, track);

  const sections = new Map();
  const isDone = id => store.get(ladderOkKey(id)) === true;
  const markDone = id => { store.set(ladderOkKey(id), true); refresh(); };

  function refresh() {
    const done = {};
    for (const step of LADDER_STEPS) for (const id of idsOf(step)) if (isDone(id)) done[id] = true;
    const progress = ladderProgress(ladder, done);
    progressText.textContent = `${progress.completeSteps} of 6 steps complete`;
    fill.style.width = `${Math.round((progress.completeSteps / 6) * 100)}%`;
    track.setAttribute("aria-valuenow", String(progress.completeSteps));
    for (const entry of progress.steps) {
      const section = sections.get(entry.step);
      const open = isTeacher || entry.unlocked;
      section.body.hidden = !open;
      section.lock.hidden = open;
      section.status.textContent = entry.complete ? "Done" : `${entry.completed} of ${entry.total}`;
      section.status.dataset.state = entry.complete ? "done" : "todo";
      section.root.dataset.state = entry.complete ? "done" : open ? "open" : "locked";
    }
  }

  function idsOf(step) {
    if (step === "notice") return [ladder.notice.id];
    if (step === "produce") return [ladder.produce.id];
    return ladder[step].map(item => item.id);
  }

  // ---- step builders ------------------------------------------------------------------------------
  function noticeItem() {
    const item = ladder.notice;
    const wrap = el("div", "ladder-item");
    wrap.append(el("p", "ladder-prompt", item.prompt));
    const textBox = el("p", "ladder-notice-text");
    const selected = new Set();
    const tokens = noticeTokens(item.text);
    const buttons = tokens.map((token, index) => {
      const word = button(token, "ladder-token", () => {
        if (isDone(item.id)) return;
        if (selected.has(index)) selected.delete(index); else selected.add(index);
        word.setAttribute("aria-pressed", String(selected.has(index)));
      });
      word.setAttribute("aria-pressed", "false");
      textBox.append(word, document.createTextNode(" "));
      return word;
    });
    const feedback = feedbackBox();
    const check = button("Check", "ds-btn ds-btn--primary ds-btn--small", () => {
      const result = checkNotice(item, selected);
      if (result.ok) { feedback.show("correct", "Correct!", item.explanation); buttons.forEach(word => { word.disabled = true; }); markDone(item.id); return; }
      const hints = [];
      if (result.missed.length) hints.push(`You missed ${result.missed.length} word${result.missed.length === 1 ? "" : "s"}.`);
      if (result.extra.length) hints.push(`${result.extra.length} word${result.extra.length === 1 ? " does" : "s do"} not belong to the structure.`);
      feedback.show("wrong", "Not quite", `${hints.join(" ")} ${item.explanation}`);
    });
    if (isDone(item.id)) {
      buttons.forEach(word => { word.disabled = true; });
      feedback.show("correct", "Done", item.explanation);
    }
    wrap.append(textBox, check, feedback.element);
    return wrap;
  }

  function typedItem(step, item, index) {
    const wrap = el("div", "ladder-item");
    wrap.append(el("p", "ladder-prompt", `${index + 1}. ${item.prompt}`));
    if (step === "correct") wrap.append(el("p", "ladder-wrong", `✗ ${item.sentence}`));
    if (step === "transform") wrap.append(el("p", "ladder-given", item.given));
    const input = el("input", "ds-input ladder-input");
    input.type = "text";
    input.autocomplete = "off";
    input.autocapitalize = "none";
    input.spellcheck = false;
    input.maxLength = 160;
    input.setAttribute("aria-label", step === "complete" ? "Your answer" : "Your sentence");
    const saved = store.get(ladderKey(item.id));
    if (typeof saved === "string") input.value = saved;
    const feedback = feedbackBox();
    const row = el("div", "ladder-row");
    let attempts = 0;
    const answerButton = button("Show answer", "ds-btn ds-btn--ghost ds-btn--small", () => {
      feedback.show("info", `Accepted answer: ${item.answers[0]}`, item.explanation);
    });
    answerButton.hidden = true;
    const check = button("Check", "ds-btn ds-btn--primary ds-btn--small", () => {
      if (isDone(item.id)) return;
      store.set(ladderKey(item.id), input.value.slice(0, 160));
      if (checkTyped(item, input.value)) {
        feedback.show("correct", "Correct!", item.explanation);
        input.disabled = true;
        check.disabled = true;
        answerButton.hidden = true;
        markDone(item.id);
      } else {
        attempts += 1;
        feedback.show("wrong", "Not quite", item.explanation);
        answerButton.hidden = attempts < 1;
      }
    });
    input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); check.click(); } });
    if (isDone(item.id)) { input.disabled = true; check.disabled = true; feedback.show("correct", "Done", item.explanation); }
    row.append(input, check, answerButton);
    wrap.append(row, feedback.element);
    return wrap;
  }

  function buildItem(item, index) {
    const wrap = el("div", "ladder-item");
    wrap.append(el("p", "ladder-prompt", `${index + 1}. ${item.prompt}`));
    const answerArea = el("div", "ladder-tiles ladder-tiles--answer");
    answerArea.setAttribute("role", "group");
    answerArea.setAttribute("aria-label", "Your sentence");
    answerArea.setAttribute("aria-live", "polite");
    const bank = el("div", "ladder-tiles");
    bank.setAttribute("role", "group");
    bank.setAttribute("aria-label", "Available tiles");
    // fixed, repeatable order that does not give the answer away
    const order = item.tiles.map((tile, tileIndex) => ({ tile, used: false, rank: (tileIndex * 7 + item.id.length) % 11 })).sort((a, b) => a.rank - b.rank);
    const chosen = [];
    const feedback = feedbackBox();
    const locked = () => isDone(item.id);
    function paint() {
      answerArea.replaceChildren(...chosen.map(entry => button(entry.tile, "ladder-tile", () => { if (locked()) return; entry.used = false; chosen.splice(chosen.indexOf(entry), 1); paint(); })));
      bank.replaceChildren(...order.map(entry => { const tile = button(entry.tile, "ladder-tile", () => { if (locked()) return; entry.used = true; chosen.push(entry); paint(); }); tile.disabled = entry.used || locked(); return tile; }));
    }
    const check = button("Check", "ds-btn ds-btn--primary ds-btn--small", () => {
      if (locked()) return;
      if (checkBuild(item, chosen.map(entry => entry.tile))) { feedback.show("correct", "Correct!", item.explanation); markDone(item.id); paint(); }
      else feedback.show("wrong", "Not quite", item.explanation);
    });
    const reset = button("Start again", "ds-btn ds-btn--ghost ds-btn--small", () => { if (locked()) return; chosen.length = 0; order.forEach(entry => { entry.used = false; }); feedback.clear(); paint(); });
    if (locked()) { chosen.push(...item.answers[0].match(/[A-Za-z0-9'’-]+|[.,!?;:]/g).map(tile => ({ tile }))); feedback.show("correct", "Done", item.explanation); }
    paint();
    const row = el("div", "ladder-row");
    row.append(check, reset);
    wrap.append(answerArea, bank, row, feedback.element);
    return wrap;
  }

  function produceItem() {
    const item = ladder.produce;
    const wrap = el("div", "ladder-item");
    wrap.append(el("p", "ladder-prompt", item.prompt));
    const area = el("textarea", "ds-textarea ladder-textarea");
    area.maxLength = MAX_PRODUCE_CHARS;
    area.setAttribute("aria-label", "Your sentences");
    const saved = store.get(ladderKey(item.id));
    if (typeof saved === "string") area.value = saved;
    const counter = el("p", "ds-field__hint");
    counter.setAttribute("aria-live", "off");
    const updateCounter = () => { counter.textContent = `${area.value.length} / ${MAX_PRODUCE_CHARS} characters`; };
    updateCounter();
    area.addEventListener("input", () => { updateCounter(); store.set(ladderKey(item.id), area.value.slice(0, MAX_PRODUCE_CHARS)); });
    const checklist = el("fieldset", "ladder-checklist");
    checklist.append(el("legend", "ds-field__label", "Check your sentences"));
    const boxes = item.checklist.map(text => {
      const label = el("label", "ladder-check");
      const box = el("input");
      box.type = "checkbox";
      label.append(box, el("span", "", text));
      checklist.append(label);
      return box;
    });
    const feedback = feedbackBox();
    const send = button("Send to my teacher", "ds-btn ds-btn--primary ds-btn--small", () => {
      if (isDone(item.id)) return;
      const result = checkProduce(item, area.value, boxes.filter(box => box.checked).length);
      if (!result.ok) { feedback.show("wrong", "Almost there", result.problems.join(" ")); return; }
      if (!isTeacher && flag) flag(item.id, item.prompt.slice(0, 120), area.value.trim().slice(0, MAX_PRODUCE_CHARS), result.patternFound, { extra: "grammar-ladder" });
      const hint = result.patternFound ? "" : " I could not find the target structure in your sentences; your teacher will take a look.";
      feedback.show("correct", "Sent!", `Your teacher will read it.${hint}${item.model ? ` One possible answer: ${item.model}` : ""}`);
      area.disabled = true;
      send.disabled = true;
      boxes.forEach(box => { box.disabled = true; });
      markDone(item.id);
    });
    if (isDone(item.id)) { area.disabled = true; send.disabled = true; boxes.forEach(box => { box.checked = true; box.disabled = true; }); feedback.show("correct", "Sent", "Your teacher has your sentences."); }
    wrap.append(area, counter, checklist, send, feedback.element);
    return wrap;
  }

  // ---- assemble the steps ---------------------------------------------------------------------------
  LADDER_STEPS.forEach((step, stepIndex) => {
    const section = el("section", "ladder-step");
    section.setAttribute("aria-label", `Step ${stepIndex + 1}: ${STEP_TITLES[step]}`);
    const head = el("h3", "ladder-step__head");
    head.append(el("span", "ladder-step__num", `Step ${stepIndex + 1}`), document.createTextNode(` ${STEP_TITLES[step]} `));
    const status = el("span", "ds-badge");
    head.append(status);
    const lock = el("p", "ds-field__hint", "Finish the step above to unlock this one.");
    const body = el("div", "ladder-step__body");
    if (step === "notice") body.append(noticeItem());
    else if (step === "produce") body.append(produceItem());
    else if (step === "build") ladder.build.forEach((item, index) => body.append(buildItem(item, index)));
    else ladder[step].forEach((item, index) => body.append(typedItem(step, item, index)));
    section.append(head, lock, body);
    sections.set(step, { root: section, body, lock, status });
    root.append(section);
  });
  refresh();
  return root;
}
