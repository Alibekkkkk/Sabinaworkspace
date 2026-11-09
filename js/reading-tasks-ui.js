// Reading tasks UI: true/false/not given with evidence, find-the-sentence, long answer with rubric self-check,
// and the application question. DOM APIs and textContent only. Progress is kept in the lesson draft; long and
// application answers are sent to the teacher's review queue.
import { button, el, feedbackBox } from "./grammar-ladder-ui.js";
import {
  checkApply, checkEvidence, checkLong, checkTfng, MAX_ANSWER_CHARS, passageSentences, taskKey, taskOkKey, TFNG_ANSWERS, visibleTasks, wordCount
} from "./reading-tasks.js";

const TYPE_LABELS = { tfng: "True / False / Not Given", find: "Find the sentence", long: "Long answer", apply: "Use the grammar" };

// The passage as a list of sentences the student can tap. onPick(index) is called for each tap.
function sentencePicker(sentences, onPick) {
  const list = el("ol", "rt-sentences");
  list.setAttribute("aria-label", "Sentences of the passage");
  const buttons = sentences.map((sentence, index) => {
    const item = el("li", "rt-sentences__item");
    const pick = el("button", "rt-sentence");
    pick.type = "button";
    pick.setAttribute("aria-pressed", "false");
    if (sentence.para) pick.append(el("span", "rt-sentence__para", `${sentence.para}. `));
    pick.append(document.createTextNode(sentence.text));
    pick.addEventListener("click", () => onPick(index));
    item.append(pick);
    list.append(item);
    return pick;
  });
  return {
    element: list,
    mark(index, state) { buttons.forEach((pick, at) => { pick.setAttribute("aria-pressed", String(at === index)); if (at === index) pick.dataset.state = state; else delete pick.dataset.state; }); },
    lock() { buttons.forEach(pick => { pick.disabled = true; }); }
  };
}

// block: content.readingTasks; store: { get(key), set(key, value) }; flag(id, prompt, answer, auto, extra) sends to the teacher.
export function renderReadingTasks({ block, passageHtml, store, flag, isTeacher = false }) {
  const tasks = visibleTasks(block, isTeacher);
  if (!tasks.length) return null;
  const sentences = passageSentences(passageHtml);
  const root = el("section", "ds-card rt");
  root.setAttribute("aria-label", "Go deeper");
  root.append(el("h3", "rt__title", "Part C — Go deeper"));
  root.append(el("p", "ladder-note", "These tasks ask you to prove, explain and use what you read. They do not change your score."));
  if (block.status !== "approved") root.append(el("p", "ds-banner ds-banner--warning", "Draft: only you can see these tasks. Set \"status\": \"approved\" in readingTasks to show them to the student."));
  const progress = el("p", "rt__progress");
  progress.setAttribute("role", "status");
  root.append(progress);
  const isDone = id => store.get(taskOkKey(id)) === true;
  const refresh = () => { progress.textContent = `${tasks.filter(task => isDone(task.id)).length} of ${tasks.length} done`; };
  const finish = task => { store.set(taskOkKey(task.id), true); refresh(); };

  tasks.forEach((task, index) => {
    const card = el("div", "ladder-item rt-task");
    card.dataset.type = task.type;
    const head = el("p", "ladder-prompt");
    head.append(document.createTextNode(`${index + 1}. ${task.prompt} `), el("span", "q-type", TYPE_LABELS[task.type]));
    card.append(head);
    const feedback = feedbackBox();
    const done = isDone(task.id);

    if (task.type === "tfng") {
      const group = el("div", "ladder-row");
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", "Your answer");
      const proof = el("div", "rt-proof");
      proof.hidden = true;
      const picker = sentencePicker(sentences, at => {
        if (isDone(task.id)) return;
        if (checkEvidence(task, sentences, at)) {
          picker.mark(at, "correct"); picker.lock();
          feedback.show("correct", "Correct! That sentence proves it.", task.explanation);
          finish(task);
        } else {
          picker.mark(at, "wrong");
          feedback.show("wrong", "That sentence does not prove it", "Look for the sentence that gives the facts about the statement.");
        }
      });
      proof.append(el("p", "rt-proof__ask", "Now tap the sentence that proves your answer."), picker.element);
      const options = TFNG_ANSWERS.map(option => {
        const choice = button(option, "ds-btn ds-btn--secondary ds-btn--small", () => {
          if (isDone(task.id)) return;
          if (!checkTfng(task, option)) { feedback.show("wrong", "Not quite", "Read the statement again and check the passage. Is it stated, contradicted, or not mentioned?"); proof.hidden = true; return; }
          group.querySelectorAll("button").forEach(b => { b.disabled = true; });
          if (task.answer === "Not Given") { feedback.show("correct", "Correct! The text does not say this.", task.explanation); finish(task); proof.hidden = true; }
          else { feedback.show("info", `Yes, the answer is ${task.answer}.`, "Now prove it with a sentence from the text."); proof.hidden = false; }
        });
        return choice;
      });
      group.append(...options);
      card.append(group, proof);
      if (done) {
        group.querySelectorAll("button").forEach(b => { b.disabled = true; });
        picker.lock();
        const at = task.evidence ? sentences.findIndex(sentence => checkEvidence(task, sentences, sentence.index)) : -1;
        if (at >= 0) { proof.hidden = false; picker.mark(at, "correct"); }
        feedback.show("correct", "Done", task.explanation);
      }
    } else if (task.type === "find") {
      const picker = sentencePicker(sentences, at => {
        if (isDone(task.id)) return;
        if (checkEvidence(task, sentences, at)) { picker.mark(at, "correct"); picker.lock(); feedback.show("correct", "Correct!", task.explanation); finish(task); }
        else { picker.mark(at, "wrong"); feedback.show("wrong", "Not that sentence", "Read the question again and look for the sentence with that information."); }
      });
      card.append(picker.element);
      if (done) { picker.lock(); picker.mark(sentences.findIndex(sentence => checkEvidence(task, sentences, sentence.index)), "correct"); feedback.show("correct", "Done", task.explanation); }
    } else {
      // long and apply: write, check, send
      const area = el("textarea", "ds-textarea ladder-textarea");
      area.maxLength = MAX_ANSWER_CHARS;
      area.setAttribute("aria-label", "Your answer");
      const saved = store.get(taskKey(task.id));
      if (typeof saved === "string") area.value = saved;
      const counter = el("p", "ds-field__hint");
      const update = () => {
        counter.textContent = task.type === "long"
          ? `${wordCount(area.value)} words (aim for ${task.wordGuide.min}-${task.wordGuide.max}) · ${area.value.length} / ${MAX_ANSWER_CHARS} characters`
          : `${area.value.length} / ${MAX_ANSWER_CHARS} characters`;
      };
      area.addEventListener("input", () => { if (!isDone(task.id)) store.set(taskKey(task.id), area.value.slice(0, MAX_ANSWER_CHARS)); update(); });
      update();
      const rubric = el("ul", "rt-rubric");
      rubric.setAttribute("aria-label", "Self-check");
      const showRubric = report => {
        rubric.replaceChildren(...report.criteria.map(entry => {
          const item = el("li", "rt-rubric__item", `${entry.met ? "✓ Found" : "✗ Not found yet"}: ${entry.criterion}`);
          item.dataset.met = String(entry.met);
          return item;
        }));
      };
      const actions = el("div", "ladder-row");
      const send = button("Send to my teacher", "ds-btn ds-btn--primary ds-btn--small", () => {
        if (isDone(task.id)) return;
        const text = area.value.trim();
        const result = task.type === "long" ? checkLong(task, text) : checkApply(task, text);
        if (!result.ok) { feedback.show("wrong", "Not ready to send yet", result.problems.join(" ")); return; }
        if (!isTeacher && flag) flag(task.id, task.prompt.slice(0, 120), text.slice(0, MAX_ANSWER_CHARS), task.type === "long" ? result.rubric.allMet : result.structureFound, { extra: task.type === "long" ? "reading-long" : "reading-apply" });
        store.set(taskKey(task.id), text);
        area.disabled = true; send.disabled = true; selfCheck.disabled = true;
        feedback.show("correct", "Sent to your teacher", `Model answer: ${task.modelAnswer}`);
        finish(task);
      });
      const selfCheck = button(task.type === "long" ? "Check against the rubric" : "Check my grammar", "ds-btn ds-btn--secondary ds-btn--small", () => {
        if (task.type === "long") {
          const result = checkLong(task, area.value);
          showRubric(result.rubric);
          feedback.show(result.rubric.allMet ? "correct" : "info", result.rubric.allMet ? "You covered every point" : `${result.rubric.metCount} of ${result.rubric.criteria.length} points found`, result.problems.join(" ") || "This check looks for key words. Your teacher reads the full answer.");
        } else {
          const result = checkApply(task, area.value);
          feedback.show(result.ok ? "correct" : "wrong", result.ok ? "The structure is there. Read it once more, then send it." : "Not ready yet", result.problems.join(" "));
        }
      });
      actions.append(selfCheck, send);
      card.append(area, counter);
      if (task.type === "long") card.append(rubric);
      card.append(actions);
      if (done) { area.disabled = true; send.disabled = true; selfCheck.disabled = true; if (task.type === "long") showRubric(checkLong(task, area.value).rubric); feedback.show("correct", "Sent to your teacher", `Model answer: ${task.modelAnswer}`); }
    }
    card.append(feedback.element);
    root.append(card);
  });
  refresh();
  return root;
}
