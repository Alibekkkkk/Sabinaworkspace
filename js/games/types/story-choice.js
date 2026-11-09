// Story Choice: a branching mini-story. Each decision needs a correct grammar form; a wrong choice explains itself and
// lets the reader try again, so the story never dead-ends. Authored in content as storyGraph:
//   { title, start, allowCycles?, nodes: { id: { text, end?: true, choices: [{ text, next, correct?, explain? }] } } }
import { button, el, liveRegion, meter, numberKeys } from "../ui.js";

export const TYPE = "story-choice";

// Returns a list of problems in plain words; an empty list means the story is sound.
export function validateStoryGraph(graph) {
  const problems = [];
  if (!graph || typeof graph !== "object" || !graph.nodes || typeof graph.nodes !== "object") return ["The story needs a nodes object."];
  const ids = Object.keys(graph.nodes);
  if (!ids.length) return ["The story has no scenes."];
  if (ids.length > 60) problems.push("A story can have at most 60 scenes.");
  if (!graph.start || !graph.nodes[graph.start]) problems.push(`The start scene "${graph.start}" does not exist.`);
  for (const id of ids) {
    const node = graph.nodes[id];
    if (!/^[a-z0-9_-]{1,32}$/i.test(id)) problems.push(`Scene id "${id}" may only use letters, numbers, - and _.`);
    if (!node || typeof node.text !== "string" || !node.text.trim()) { problems.push(`Scene "${id}" has no text.`); continue; }
    if (node.end) { if (node.choices && node.choices.length) problems.push(`Ending "${id}" should not have choices.`); continue; }
    const choices = Array.isArray(node.choices) ? node.choices : [];
    if (choices.length < 2) problems.push(`Scene "${id}" needs at least two choices (or end: true).`);
    if (!choices.some(choice => choice.correct)) problems.push(`Scene "${id}" has no correct choice, so the reader would be stuck.`);
    const texts = new Set();
    choices.forEach((choice, index) => {
      if (!choice || typeof choice.text !== "string" || !choice.text.trim()) problems.push(`Scene "${id}" choice ${index + 1} has no text.`);
      else if (texts.has(choice.text)) problems.push(`Scene "${id}" repeats the choice "${choice.text}".`);
      else texts.add(choice.text);
      if (choice.correct && !graph.nodes[choice.next]) problems.push(`Scene "${id}": the correct choice "${choice.text}" leads to "${choice.next}", which does not exist.`);
      if (!choice.correct && choice.next && !graph.nodes[choice.next]) problems.push(`Scene "${id}": "${choice.text}" leads to a missing scene "${choice.next}".`);
      if (!choice.correct && !choice.explain) problems.push(`Scene "${id}": the wrong choice "${choice.text}" needs an explanation.`);
    });
  }
  if (problems.length) return problems;
  // reachability and cycles over the correct path (wrong choices stay in the same scene)
  const seen = new Set(); const stack = new Set(); let cycle = false; let reachesEnd = false;
  const visit = id => {
    if (stack.has(id)) { cycle = true; return; }
    if (seen.has(id)) return;
    seen.add(id); stack.add(id);
    const node = graph.nodes[id];
    if (node.end) reachesEnd = true;
    for (const choice of node.choices || []) if (choice.correct) visit(choice.next);
    stack.delete(id);
  };
  visit(graph.start);
  const unreachable = ids.filter(id => !seen.has(id) && !ids.some(other => (graph.nodes[other].choices || []).some(choice => choice.next === id && seen.has(other))));
  for (const id of unreachable) problems.push(`Scene "${id}" can never be reached.`);
  if (cycle && !graph.allowCycles) problems.push("The story loops back on itself. Set allowCycles: true if that is intended.");
  if (!reachesEnd) problems.push("No ending can be reached by correct choices.");
  return problems;
}

// One decision per scene that has choices, in the order the correct path visits them. Used for scoring and validation.
export function decisionsOf(graph) {
  const out = []; const seen = new Set(); let id = graph.start;
  while (id && !seen.has(id) && graph.nodes[id]) {
    seen.add(id); const node = graph.nodes[id];
    if (node.end) break;
    const right = node.choices.find(choice => choice.correct);
    out.push({ id, prompt: node.text, answer: right.text, options: node.choices.map(choice => choice.text), topic: "Story: grammar choices" });
    id = right.next;
  }
  return out;
}

export function supports(game) { return game.type === TYPE && Boolean(game.graph); }

export function render(container, game, bus) {
  const graph = game.graph; const answers = {}; let current = graph.start; let run = 0; let bestRun = 0; let steps = 0;
  const total = game.questions.length; const progress = meter("Story", total); const live = liveRegion(); const stage = el("div", "gm-stage");
  container.replaceChildren(progress.element, stage, live.element);
  const removeKeys = numberKeys(stage, ".gm-option");
  function show() {
    const node = graph.nodes[current];
    progress.set(Math.min(steps, total));
    const text = el("p", "gm-story", node.text); text.id = "gmQuestion";
    if (node.end) { removeKeys(); stage.replaceChildren(text, el("h3", "", "The end")); bus.services.celebrate("big"); bus.finish({ answers, bestRun, kind: "game" }); return; }
    const options = el("div", "gm-options"); options.setAttribute("role", "group"); options.setAttribute("aria-labelledby", "gmQuestion");
    const feedback = el("p", "gm-feedback"); feedback.setAttribute("aria-live", "polite");
    node.choices.forEach((choice, i) => {
      const node2 = button(`${i + 1}. ${choice.text}`, "gm-option", () => {
        if (!(current in answers)) answers[current] = choice.text;
        if (choice.correct) { run += 1; bestRun = Math.max(bestRun, run); steps += 1; bus.services.sound("good"); current = choice.next; live.say("Correct. The story continues."); show(); }
        else { run = 0; node2.disabled = true; bus.services.sound("bad"); feedback.textContent = `Not that one. ${choice.explain}`; live.say(feedback.textContent); }
      });
      options.append(node2);
    });
    stage.replaceChildren(text, options, feedback);
    options.querySelector("button").focus();
  }
  show();
  return { destroy: removeKeys };
}
