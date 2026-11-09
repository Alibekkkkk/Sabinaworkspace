// The learning loop on screen: words before reading, the small question after a page, and the chapter questions.
// DOM APIs and textContent only. Answers are reported through ctx so the page can save them.
import { button, el } from "./reader-ui.js";
import { bareWord, checkQuestion, checkQuick, fillBubble, rubricFeedback, whoSaid, wordCount, wordKey } from "./learning.js";

let uid = 0;
const nextId = prefix => `${prefix}-${(uid += 1)}`;

function feedback(host, good, text) {
  const note = host.querySelector(".mg-feedback") || host.appendChild(el("p", "mg-feedback"));
  note.className = `mg-feedback ${good === null ? "" : good ? "good" : "bad"}`; note.setAttribute("role", "status"); note.textContent = text;
}

// ---- words before reading --------------------------------------------------------------------------------------------------------
export function renderPreReading(list, words, saved, saveWord) {
  list.replaceChildren();
  for (const item of words) {
    const row = el("li"); const key = wordKey(item.word);
    const save = button(saved.has(key) ? "Saved" : "Save", "ds-btn ds-btn--secondary ds-btn--small", null, { "aria-label": `Save the word ${item.word}` });
    save.disabled = saved.has(key);
    save.addEventListener("click", async () => {
      save.disabled = true;
      try { await saveWord(item); save.textContent = "Saved"; } catch (error) { save.disabled = false; save.textContent = "Try again"; }
    });
    row.append(el("strong", "", item.word), el("span", "mg-meaning", `${item.translation ? `${item.translation} · ` : ""}${item.meaning}`), save);
    list.append(row);
  }
}

// ---- the question after a page -----------------------------------------------------------------------------------------------------
// ctx: { chapter, answers: { quick: {id: {given, correct}} }, record(quick, given, correct) }
export function renderQuiz(page, ctx) {
  const quick = page.quick; if (!quick) return null;
  const box = el("section", "mg-quiz"); const titleId = nextId("mg-quiz"); box.setAttribute("aria-labelledby", titleId);
  const heading = el("h2", "", quick.type === "predict" ? "What happens next?" : quick.type === "who-said" ? "Who said it?" : "Fill the bubble"); heading.id = titleId;
  box.append(heading, el("p", "", quick.prompt));
  const done = ctx.answers.quick[quick.id];
  const options = el("div", "mg-options"); options.setAttribute("role", "group"); options.setAttribute("aria-labelledby", titleId);

  if (quick.type === "who-said") {
    const view = whoSaid(page, quick);
    box.append(el("p", "mg-sentence", `“${view.text}”`));
    for (const name of view.options) options.append(button(name, "ds-btn ds-btn--secondary", () => {
      const right = checkQuick(quick, page, ctx.chapter, name);
      lock(options, name, right ? name : view.answer); feedback(box, right, right ? "Yes!" : `Not quite. It was ${view.answer}.`);
      ctx.record(quick, name, right);
    }));
    box.append(options);
    if (done) { lock(options, done.given, whoSaid(page, quick).answer); feedback(box, done.correct, done.correct ? "Yes!" : `Not quite. It was ${view.answer}.`); }
  } else if (quick.type === "predict") {
    for (const text of quick.options) options.append(button(text, "ds-btn ds-btn--secondary", () => {
      lock(options, text, null); feedback(box, null, "Good thinking. Keep reading to see if you were right."); ctx.record(quick, text, null);
    }));
    box.append(options);
    if (done) { lock(options, done.given, null); feedback(box, null, "Good thinking. Keep reading to see if you were right."); }
  } else {
    const view = fillBubble(page, quick, ctx.chapter); const picks = [];
    const sentence = el("p", "mg-sentence"); sentence.setAttribute("aria-live", "polite");
    const paintSentence = () => {
      sentence.replaceChildren(); let blank = 0;
      view.tokens.forEach((token, index) => {
        if (index) sentence.append(document.createTextNode(" "));
        if (!token.hidden) { sentence.append(document.createTextNode(token.text)); return; }
        const slot = el("span", "mg-blank", picks[blank] || "____"); slot.setAttribute("aria-label", picks[blank] ? `Blank ${blank + 1}: ${picks[blank]}` : `Blank ${blank + 1}, empty`); sentence.append(slot); blank += 1;
      });
    };
    paintSentence(); box.append(sentence);
    for (const word of view.options) {
      const choice = button(word, "ds-btn ds-btn--secondary", () => {
        choice.disabled = true; picks.push(word); paintSentence();
        if (picks.length === view.answers.length) {
          const right = checkQuick(quick, page, ctx.chapter, picks);
          options.querySelectorAll("button").forEach(node => { node.disabled = true; });
          feedback(box, right, right ? "Yes, that completes the bubble!" : `Not quite. The bubble says: “${view.tokens.map(t => t.text).join(" ").replace(/\s+/g, " ")}”`);
          if (!right) { picks.length = 0; view.answers.forEach(answer => picks.push(answer)); paintSentence(); }
          ctx.record(quick, [...picks], right);
        }
      });
      options.append(choice);
    }
    box.append(options);
    if (done) { options.querySelectorAll("button").forEach(node => { node.disabled = true; }); picks.push(...view.answers); paintSentence(); feedback(box, done.correct, done.correct ? "Yes, that completes the bubble!" : "Not quite. The correct words are filled in."); }
  }
  return box;
}

function lock(group, chosen, right) {
  group.querySelectorAll("button").forEach(node => {
    node.disabled = true;
    if (right !== null && bareWord(node.textContent) === bareWord(right)) node.setAttribute("aria-label", `${node.textContent} (correct answer)`);
    if (node.textContent === chosen) node.setAttribute("aria-pressed", "true");
  });
}

// ---- chapter questions -----------------------------------------------------------------------------------------------------------------
// ctx: { chapter, answers: { questions: {id: {given, correct}} }, record(question, given, correct), sendReview(question, text), changed() }
export function renderQuestions(host, ctx) {
  host.replaceChildren();
  ctx.chapter.questions.forEach((question, index) => {
    const box = el("section", "mg-question"); const titleId = nextId("mg-q"); box.setAttribute("aria-labelledby", titleId);
    const label = { gist: "Main idea", vocab: "Vocabulary", detail: "Detail", inference: "Think about it" }[question.type];
    const heading = el("h3", "", `${index + 1}. ${label}`); heading.id = titleId;
    box.append(heading, el("p", "", question.prompt));
    const done = ctx.answers.questions[question.id];
    if (question.type === "gist" || question.type === "vocab") {
      const options = el("div", "mg-options"); options.setAttribute("role", "group"); options.setAttribute("aria-labelledby", titleId);
      for (const text of question.options) options.append(button(text, "ds-btn ds-btn--secondary", () => {
        const right = checkQuestion(question, text);
        options.querySelectorAll("button").forEach(node => { node.disabled = true; });
        feedback(box, right, right ? "Correct!" : `Not quite. The answer is: ${question.answer}.`); ctx.record(question, text, right);
      }));
      box.append(options);
      if (done) { options.querySelectorAll("button").forEach(node => { node.disabled = true; }); feedback(box, done.correct, done.correct ? "Correct!" : `Not quite. The answer is: ${question.answer}.`); }
    } else if (question.type === "detail") {
      const form = el("form", "gm-answer"); const input = el("input", "ds-input"); input.type = "text"; input.autocomplete = "off"; input.setAttribute("aria-labelledby", titleId);
      const check = el("button", "ds-btn ds-btn--secondary", "Check"); check.type = "submit"; form.append(input, check); box.append(form);
      form.addEventListener("submit", event => {
        event.preventDefault(); if (!input.value.trim()) return;
        const right = checkQuestion(question, input.value); input.disabled = true; check.disabled = true;
        feedback(box, right, right ? "Correct!" : `Not quite. A good answer is: ${question.answers[0]}.`); ctx.record(question, input.value, right);
      });
      if (done) { input.value = String(done.given || ""); input.disabled = true; check.disabled = true; feedback(box, done.correct, done.correct ? "Correct!" : `Not quite. A good answer is: ${question.answers[0]}.`); }
    } else {
      const area = el("textarea", "ds-textarea"); area.rows = 3; area.maxLength = 300; area.setAttribute("aria-labelledby", titleId);
      const hint = el("p", "mg-note", `Write at least ${question.rubric.minWords} words. Your teacher will read your answer.`); hint.setAttribute("aria-live", "polite");
      const send = el("button", "ds-btn ds-btn--secondary", "Send to my teacher"); send.type = "button";
      area.addEventListener("input", () => { const result = rubricFeedback(area.value, question.rubric); hint.textContent = result.enough ? `${result.words} words. Ready to send.` : `${result.words} of ${question.rubric.minWords} words.`; });
      send.addEventListener("click", async () => {
        if (!area.value.trim()) { hint.textContent = "Write your answer first."; return; }
        send.disabled = true;
        try { await ctx.sendReview(question, area.value.trim()); area.disabled = true; send.textContent = "Sent"; feedback(box, null, "Sent to your teacher. They will read it."); ctx.record(question, area.value.trim(), null); }
        catch (error) { send.disabled = false; feedback(box, false, `Could not send: ${error.message}`); }
      });
      box.append(area, hint, send);
      if (done) { area.value = String(done.given || ""); area.disabled = true; send.disabled = true; send.textContent = "Sent"; feedback(box, null, "Sent to your teacher. They will read it."); }
    }
    host.append(box);
  });
}

export function renderRetell(chapter, refs, ctx) {
  const retell = chapter.retell; refs.area.hidden = !retell; if (!retell) return;
  refs.prompt.textContent = retell.prompt; refs.hint.textContent = `Write at least ${retell.minWords} words.`;
  const update = () => { const count = wordCount(refs.text.value); refs.hint.textContent = count >= retell.minWords ? `${count} words. Ready to send.` : `${count} of ${retell.minWords} words.`; };
  refs.text.addEventListener("input", update);
  refs.send.addEventListener("click", async () => {
    if (!refs.text.value.trim()) { refs.hint.textContent = "Write your retelling first."; return; }
    refs.send.disabled = true;
    try { await ctx.sendRetell(refs.text.value.trim()); refs.text.disabled = true; refs.send.textContent = "Sent"; refs.hint.textContent = "Sent to your teacher."; }
    catch (error) { refs.send.disabled = false; refs.hint.textContent = `Could not send: ${error.message}`; }
  });
}
