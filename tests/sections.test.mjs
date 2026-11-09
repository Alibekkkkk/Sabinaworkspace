import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { lintContent } from "../scripts/lint-content.mjs";
import { classworkFiles, migrateText } from "../scripts/migrate-sections.mjs";
import {
  applySectionOverrides, buildSections, countWords, readingMinutes, roundToFive, sectionForStage, suggestedEstimates, validateSections
} from "../js/sections.js";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(fileURLToPath(new URL(path, root)), "utf8");

function fixture(extra = {}) {
  return {
    vocab: [{ en: "flood", meanings: [] }, { en: "to rescue", meanings: [] }],
    matchData: [],
    readingHtml: "<h1>Flood</h1><p>The flood rose. Rescuers rescue families. The flood ended. They have saved many. They have helped others. We have learned much.</p>",
    readingQ: [{ id: "q1", type: "short", prompt: "What rose?", answers: ["the flood"] }],
    contextQ: [{ id: "c1", prompt: "x", options: ["a", "b"], correct: "a" }],
    g6: {}, g7: {}, sbPp: {}, sbPs: {}, g10: {},
    testMcq: [], testShort: [], testTfng: [], testComplete: [],
    ...extra
  };
}

test("every shipped classwork file is on schema v2 with valid sections and stays migrated (idempotent)", () => {
  const files = classworkFiles();
  assert.ok(files.length >= 7);
  for (const name of files) {
    const text = read(`content/${name}`);
    const content = JSON.parse(text);
    assert.deepEqual(validateSections(content), [], name);
    assert.equal(content.schemaVersion, 2, name);
    const again = migrateText(text);
    assert.equal(again.changed, false, `${name} should already be migrated`);
    assert.equal(again.text, text);
  }
});

test("migration adds only schemaVersion and sections, keeps every other key byte-for-byte equal in value, and is idempotent", () => {
  const original = JSON.stringify(fixture(), null, 2);
  const first = migrateText(original);
  assert.equal(first.changed, true);
  const migrated = JSON.parse(first.text);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.sections.length, 3);
  for (const key of Object.keys(JSON.parse(original))) assert.deepEqual(migrated[key], JSON.parse(original)[key], key);
  assert.deepEqual(validateSections(migrated), []);
  const second = migrateText(first.text);
  assert.equal(second.changed, false);
  assert.equal(second.text, first.text);
});

test("migration keeps CRLF line endings and refuses half-migrated files", () => {
  const crlf = JSON.stringify(fixture(), null, 2).replace(/\n/g, "\r\n");
  const result = migrateText(crlf);
  assert.ok(result.text.includes('"schemaVersion": 2,\r\n'));
  assert.ok(!/[^\r]\n/.test(result.text.slice(0, 200)), "no bare LF introduced");
  assert.throws(() => migrateText(JSON.stringify({ ...fixture(), sections: [] })), /partial schema v2/);
});

test("section validator reports precise errors", () => {
  const good = migrateText(JSON.stringify(fixture())).text;
  const content = JSON.parse(good);
  const broken = structuredClone(content);
  broken.sections[0].estimatedMinutes = 0;
  broken.sections[1].id = "Bad Id";
  broken.sections[2].stages = ["vocab"];
  const errors = validateSections(broken).join(" | ");
  assert.match(errors, /estimatedMinutes must be a number from 1 to 120/);
  assert.match(errors, /id must be/);
  assert.match(errors, /already in another section/);
  assert.match(errors, /is not part of any section/);
  assert.match(validateSections({ ...content, schemaVersion: 1 }).join(" "), /schemaVersion must be 2/);
  assert.match(validateSections({ schemaVersion: 2 }).join(" "), /sections must be an array/);
  const withTest = structuredClone(content);
  withTest.sections[0].stages.push("testMcq");
  assert.match(validateSections(withTest).join(" "), /unknown or reserved stage key "testMcq"/);
  const missing = structuredClone(content);
  missing.sections.pop();
  assert.match(validateSections(missing).join(" "), /standard section "reading" is missing/);
});

test("estimates: rounding, reading maths (words / 120 + 1.5 min per question) and vocabulary scaling", () => {
  assert.equal(roundToFive(2), 5);
  assert.equal(roundToFive(22.4), 20);
  assert.equal(roundToFive(23), 25);
  assert.equal(countWords("<p>one two  <b>three</b></p>"), 3);
  const content = { readingHtml: `<p>${"word ".repeat(240)}</p>`, readingQ: new Array(4).fill({}), contextQ: new Array(2).fill({}) };
  assert.equal(readingMinutes(content), 2 + 9);
  assert.equal(suggestedEstimates({ ...content, vocab: new Array(20).fill({}) }).vocabulary, 25);
  assert.equal(suggestedEstimates({ ...content, vocab: [] }).vocabulary, 10);
  assert.equal(suggestedEstimates(content).grammar, 20);
  assert.equal(buildSections(fixture()).map(section => section.id).join(), "vocabulary,grammar,reading");
});

test("stages map to sections; the final test belongs to none", () => {
  const sections = buildSections(fixture());
  const names = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(stage => (sectionForStage(sections, stage) || {}).id || null);
  assert.deepEqual(names, ["vocabulary", "vocabulary", "reading", "grammar", "grammar", "grammar", "grammar", "grammar", null]);
  assert.equal(sectionForStage(undefined, 1), null);
});

test("teacher overrides change minutes and order without touching the source sections", () => {
  const sections = buildSections(fixture());
  const result = applySectionOverrides(sections, { estimatedMinutes: { grammar: 35, reading: 9999, vocabulary: "x" }, order: ["reading", "vocabulary"] });
  assert.deepEqual(result.map(section => section.id), ["reading", "vocabulary", "grammar"]);
  assert.equal(result.find(section => section.id === "grammar").estimatedMinutes, 35);
  assert.equal(result.find(section => section.id === "reading").estimatedMinutes, sections.find(section => section.id === "reading").estimatedMinutes, "out-of-range values are ignored");
  assert.equal(sections.find(section => section.id === "grammar").estimatedMinutes, 20, "source is not mutated");
  assert.deepEqual(applySectionOverrides(sections, null).map(section => section.id), ["vocabulary", "grammar", "reading"]);
});

function migrated(extra) { return JSON.parse(migrateText(JSON.stringify(fixture(extra))).text); }

test("lint: a clean fixture passes; a missing grammar topic is a warning, not an error", () => {
  const content = migrated();
  content.sections[1].topic = "present perfect";
  const result = lintContent("fixture.json", content);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings.filter(message => /target word/.test(message)), []);
  assert.deepEqual(result.warnings.filter(message => /grammar structure|expected/.test(message)), []);
  const noTopic = lintContent("fixture.json", migrated());
  assert.ok(noTopic.warnings.some(message => /no "topic"/.test(message)));
});

test("lint: failing fixtures produce actionable warnings", () => {
  const content = migrated({ readingHtml: "<p>It was calm. Nothing else happened here today.</p>" });
  content.sections[1].topic = "present perfect";
  content.sections[2].estimatedMinutes = 90;
  const result = lintContent("fixture.json", content);
  assert.match(result.warnings.join("\n"), /target word\(s\) never appear in the reading passage: flood, to rescue/);
  assert.match(result.warnings.join("\n"), /structure 0 time\(s\); at least 3/);
  assert.match(result.warnings.join("\n"), /Reading estimate is 90 min/);
  assert.match(result.warnings.join("\n"), /short-answer question\(s\) have no accepted answer/);
  const unknownTopic = migrated();
  unknownTopic.sections[1].topic = "third conditional";
  assert.match(lintContent("x", unknownTopic).warnings.join(), /No pattern is defined/);
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
