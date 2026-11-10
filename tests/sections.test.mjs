import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { lintContent, patternForTopic } from "../scripts/lint-content.mjs";
import { classworkFiles, migrateText } from "../scripts/migrate-sections.mjs";
import {
  SCHEMA_VERSION, applySectionOverrides, buildSections, countWords, readingMinutes, roundToFive, sectionForKey, suggestedEstimates, validateSections
} from "../js/sections.js";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(fileURLToPath(new URL(path, root)), "utf8");

const complete = prefix => ({ pos: [{ id: `${prefix}.1`, p: "They ___ (save) many.", a: "have saved" }], neg: [], q: [], shuffled: [] });
const build = prefix => ({ pos: [{ id: `${prefix}.1`, prompt: "Build it.", correct: ["They", "have", "helped."] }], neg: [], q: [], shuffled: [] });
const TOPICS = [
  { id: "present-perfect", title: "Present Perfect", exercises: ["g6", "sbPp"], rule: { formula: "have/has + V3", points: ["Use it for results."] } },
  { id: "past-passive", title: "Past Passive", exercises: ["g7"], rule: { formula: "was/were + V3" } }
];

function fixture(extra = {}) {
  return {
    vocab: [{ en: "flood", meanings: [] }, { en: "to rescue", meanings: [] }],
    matchData: [],
    readingHtml: "<h1>Flood</h1><p>The flood rose. Rescuers rescue families. The flood ended. They have saved many. They have helped others. We have learned much.</p>",
    readingQ: [{ id: "q1", type: "short", prompt: "What rose?", answers: ["the flood"] }],
    contextQ: [{ id: "c1", prompt: "x", options: ["a", "b"], correct: "a" }],
    g6: complete("g6"), g7: complete("g7"), sbPp: build("sbPp"), sbPs: build("sbPs"), g10: complete("g10"),
    testMcq: [], testShort: [], testTfng: [], testComplete: [],
    ...extra
  };
}
const migrated = (extra, topics = TOPICS) => JSON.parse(migrateText(JSON.stringify(fixture(extra)), "fixture.json", { topics: { "fixture.json": topics } }).text);

test("every shipped classwork file is on schema v3 with valid sections and grammar topics, and stays migrated", () => {
  const files = classworkFiles();
  assert.ok(files.length >= 7);
  for (const name of files) {
    const text = read(`content/${name}`);
    const content = JSON.parse(text);
    assert.deepEqual(validateSections(content), [], name);
    assert.equal(content.schemaVersion, SCHEMA_VERSION, name);
    assert.ok(content.grammar.length >= 1, `${name} has grammar topics`);
    const again = migrateText(text, name);
    assert.equal(again.changed, false, `${name} should already be migrated`);
  }
});

test("migration adds schemaVersion 3, the six sections and the grammar topics, keeps every other key, and is idempotent", () => {
  const original = fixture();
  const first = migrateText(JSON.stringify(original, null, 2), "fixture.json", { topics: { "fixture.json": TOPICS } });
  assert.equal(first.changed, true);
  const content = JSON.parse(first.text);
  assert.equal(content.schemaVersion, 3);
  assert.deepEqual(content.sections.map(section => section.id), ["vocabulary", "reading", "games", "listening", "grammar", "test"]);
  assert.deepEqual(content.grammar, TOPICS);
  for (const key of Object.keys(original)) assert.deepEqual(content[key], original[key], key);
  assert.deepEqual(validateSections(content), []);
  assert.equal(migrateText(first.text, "fixture.json").changed, false);
});

test("migration keeps CRLF line endings, keeps a file's own grammar list, and refuses files without topics", () => {
  const crlf = JSON.stringify(fixture({ schemaVersion: 2, sections: [] }), null, 2).replace(/\n/g, "\r\n");
  const result = migrateText(crlf, "fixture.json", { topics: { "fixture.json": TOPICS } });
  assert.ok(result.text.includes('"schemaVersion": 3,\r\n'));
  assert.ok(!/[^\r]\n/.test(result.text), "no bare LF");
  const own = migrateText(JSON.stringify(fixture({ grammar: [TOPICS[1]] })), "other.json", { topics: {} });
  assert.equal(JSON.parse(own.text).grammar.length, 1);
  assert.throws(() => migrateText(JSON.stringify(fixture()), "missing.json", { topics: {} }), /no grammar topics/);
});

test("section validator reports precise errors", () => {
  const content = migrated();
  const broken = structuredClone(content);
  broken.sections[0].estimatedMinutes = 0;
  broken.sections[1].id = "close-reading";
  broken.sections[2].stages = ["vocab"];
  const errors = validateSections(broken).join(" | ");
  assert.match(errors, /estimatedMinutes must be a number from 1 to 120/);
  assert.match(errors, /id must be one of/);
  assert.match(errors, /stages must be \["games"\]/);
  assert.match(errors, /standard section "reading" is missing/);
  assert.match(validateSections({ ...content, schemaVersion: 2 }).join(" "), /schemaVersion must be 3/);
  assert.match(validateSections({ schemaVersion: 3 }).join(" "), /sections must be an array/);
  const badGrammar = structuredClone(content);
  badGrammar.grammar[1].exercises = ["g6"];
  assert.match(validateSections(badGrammar).join(" "), /"g6" is already used by another topic/);
  badGrammar.grammar[1].exercises = ["readingQ"];
  assert.match(validateSections(badGrammar).join(" "), /"readingQ" is not a complete-the-sentence or sentence-builder exercise/);
  delete badGrammar.grammar;
  assert.match(validateSections(badGrammar).join(" "), /grammar: the list of grammar topics is missing/);
});

test("estimates: rounding, reading maths (words / 120 + 1.5 min per question), vocabulary and grammar scaling", () => {
  assert.equal(roundToFive(2), 5);
  assert.equal(roundToFive(22.4), 20);
  assert.equal(roundToFive(23), 25);
  assert.equal(countWords("<p>one two  <b>three</b></p>"), 3);
  const content = { readingHtml: `<p>${"word ".repeat(240)}</p>`, readingQ: new Array(4).fill({}), contextQ: new Array(2).fill({}) };
  assert.equal(readingMinutes(content), 2 + 9);
  assert.equal(suggestedEstimates({ ...content, vocab: new Array(20).fill({}) }).vocabulary, 25);
  assert.equal(suggestedEstimates({ ...content, vocab: [] }).vocabulary, 10);
  assert.equal(suggestedEstimates(fixture({ grammar: TOPICS })).grammar, 20, "10 minutes per grammar topic");
  assert.equal(buildSections(fixture()).map(section => section.id).join(), "vocabulary,reading,games,listening,grammar,test");
});

test("lesson sections map to clock sections", () => {
  const sections = buildSections(fixture());
  const names = ["vocab", "match", "reading", "games", "listening", "grammar-1", "grammar-3", "test"].map(key => (sectionForKey(sections, key) || {}).id || null);
  assert.deepEqual(names, ["vocabulary", "vocabulary", "reading", "games", "listening", "grammar", "grammar", "test"]);
  assert.equal(sectionForKey(undefined, "vocab"), null);
});

test("teacher overrides change minutes and order without touching the source sections", () => {
  const sections = buildSections(fixture({ grammar: TOPICS }));
  const result = applySectionOverrides(sections, { estimatedMinutes: { grammar: 35, reading: 9999, vocabulary: "x" }, order: ["reading", "vocabulary"] });
  assert.deepEqual(result.slice(0, 3).map(section => section.id), ["reading", "vocabulary", "games"]);
  assert.equal(result.find(section => section.id === "grammar").estimatedMinutes, 35);
  assert.equal(result.find(section => section.id === "reading").estimatedMinutes, sections.find(section => section.id === "reading").estimatedMinutes, "out-of-range values are ignored");
  assert.equal(sections.find(section => section.id === "grammar").estimatedMinutes, 20, "source is not mutated");
});

test("lint: a clean fixture passes; the first grammar topic with a known pattern is checked in the passage", () => {
  const result = lintContent("fixture.json", migrated());
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings.filter(message => /target word|structure|No pattern/.test(message)), []);
  assert.equal(patternForTopic({ title: "Past Passive" }), "passive voice");
  assert.equal(patternForTopic({ id: "present-perfect", title: "Anything" }), "present perfect");
  const unknown = lintContent("x", migrated({}, [{ id: "third-conditional", title: "Third Conditional", exercises: ["g6"], rule: { formula: "If + had + V3" } }]));
  assert.match(unknown.warnings.join(), /No pattern is defined for the grammar topics \(Third Conditional\)/);
});

test("lint: failing fixtures produce actionable warnings", () => {
  const content = migrated({ readingHtml: "<p>It was calm. Nothing else happened here today.</p>" });
  content.sections[1].estimatedMinutes = 90;
  const result = lintContent("fixture.json", content);
  assert.match(result.warnings.join("\n"), /target word\(s\) never appear in the reading passage: flood, to rescue/);
  assert.match(result.warnings.join("\n"), /"Present Perfect" structure 0 time\(s\); at least 3/);
  assert.match(result.warnings.join("\n"), /Reading estimate is 90 min/);
  assert.match(result.warnings.join("\n"), /short-answer question\(s\) have no accepted answer/);
});

test("lint: invalid schema is an error, and an openly licensed word list can flag hard words", () => {
  assert.ok(lintContent("x", { ...fixture(), schemaVersion: 1 }).errors.length > 0);
  const content = migrated({ readingHtml: "<p>flood flood unusual extraordinary phenomenon catastrophic devastation overwhelming inundation torrential cataclysmic perpetual surreal</p>" });
  const result = lintContent("x", content, { wordlist: new Set(["the", "and"]) });
  assert.match(result.warnings.join("\n"), /passage words are not in the word list/);
});

test("the content directory only contains files the migration and lint know about", () => {
  const names = readdirSync(fileURLToPath(new URL("content/", root))).filter(name => name.endsWith(".json"));
  for (const name of names) assert.ok(name === "manifest.json" || name.startsWith("homework_") || classworkFiles().includes(name));
});
