// Phase 10 content review: every lesson passes the item checks, and the checks catch the mistakes they are for.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { reviewLesson } from "../scripts/review-content.mjs";
import { listeningEntryFor } from "../js/listening/entry.js";

const directory = new URL("../content/", import.meta.url);
const lessons = readdirSync(directory).filter(file => file.endsWith(".json") && file !== "manifest.json" && !file.startsWith("homework_"));
const load = file => JSON.parse(readFileSync(new URL(file, directory), "utf8"));
const plain = html => String(html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").toLowerCase();

test("every lesson passes the item checks with no errors and no warnings", () => {
  assert.ok(lessons.length >= 7);
  for (const file of lessons) {
    const result = reviewLesson(file, load(file));
    assert.deepEqual(result.errors, [], file);
    assert.deepEqual(result.warnings, [], file);
  }
});

test("lesson text never uses inline styles (the site's security policy ignores them)", () => {
  for (const file of readdirSync(directory).filter(name => name.endsWith(".json"))) assert.doesNotMatch(readFileSync(new URL(file, directory), "utf8"), /style=/, file);
});

test("test questions about the text are answered by the lesson's own reading", () => {
  for (const file of lessons) {
    const content = load(file); const passage = plain(content.readingHtml);
    for (const question of content.testShort.filter(item => !/^complete/i.test(item.q) && !/_{3,}/.test(item.q))) {
      assert.ok(question.answers.some(answer => passage.includes(String(answer).toLowerCase())), `${file}: "${question.q}" is not answered by the passage`);
    }
  }
});

test("homework short answers are in the homework text", () => {
  for (const file of readdirSync(directory).filter(name => name.startsWith("homework_"))) {
    const homework = load(file);
    const text = plain(homework.reading.paragraphs.map(paragraph => paragraph.text).join(" "));
    for (const question of homework.questions.filter(item => item.type === "short")) assert.ok(question.answers.some(answer => text.includes(String(answer).toLowerCase())), `${file}: ${question.prompt}`);
  }
});

test("the checks catch real mistakes", () => {
  const lesson = structuredClone(load("gaziz.json"));
  lesson.g6.pos[0] = { id: "x.1", p: "Volunteers ___ (clean) the river every spring.", a: "have cleaned" };
  lesson.g6.pos[1] = { id: "x.2", p: "She ___ (not / hear) the news.", a: "heard" };
  lesson.g6.pos[2] = { id: "x.3", p: "The town ___ (flood) in 2019.", a: "has flooded" };
  lesson.g6.pos[3] = { id: "x.4", p: "They ___ (open) a park.", a: "built" };
  lesson.sbPp.pos[0] = { id: "x.5", prompt: "Build: The city has grown.", correct: ["The", "city", "has", "changed."] };
  lesson.testMcq[0] = { id: "x.6", q: "?", options: ["a", "b"], correct: "c" };
  const { errors, warnings } = reviewLesson("broken", lesson);
  const all = [...errors, ...warnings].join("\n");
  assert.match(all, /present perfect "have cleaned" with a habit/);
  assert.match(all, /asks for a negative but the answer "heard"/);
  assert.match(all, /present perfect "has flooded" with a finished time/);
  assert.match(all, /does not use the verb "open"/);
  assert.match(all, /the prompt says "The city has grown." but the words make "The city has changed."/);
  assert.match(all, /"c" is not one of the options/);
});

test("a lesson finds its listening set by its own id or by its content file", () => {
  const manifest = { sabina: { classworkFile: "sabina.json", listeningFile: "listening/sabina.json" }, lesson_1: { classworkFile: "gaziz.json" }, gaziz: { classworkFile: "gaziz.json", listeningFile: "listening/gaziz.json" } };
  assert.equal(listeningEntryFor(manifest, "sabina").listeningFile, "listening/sabina.json");
  assert.equal(listeningEntryFor(manifest, "lesson_1", "gaziz.json").listeningFile, "listening/gaziz.json", "an entry without a set falls back to the content file");
  assert.equal(listeningEntryFor(manifest, "lesson_1792346167287", "content/gaziz.json").listeningFile, "listening/gaziz.json", "generated ids use the content file");
  assert.equal(listeningEntryFor(manifest, "lesson_9", "other.json"), null);
  assert.equal(listeningEntryFor(null, "x"), null);
});
