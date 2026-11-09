import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  checkChoose, checkMorphemes, checkTypedForm, explainForm, familyItems, familyKey, familyVisible, parseDerivations,
  suggestForms, validateForms, validateWordFamilies, visibleForms
} from "../js/word-family.js";
import { lintContent } from "../scripts/lint-content.mjs";

const content = JSON.parse(readFileSync(fileURLToPath(new URL("../content/sabina.json", import.meta.url)), "utf8"));
const vocab = content.vocab;
const item = word => structuredClone(vocab.find(entry => entry.en === word));

test("the shipped word families are valid and still drafts", () => {
  const result = validateWordFamilies(vocab);
  assert.deepEqual(result.errors, []);
  const withForms = vocab.filter(entry => entry.forms);
  assert.ok(withForms.length >= 5);
  assert.ok(withForms.every(entry => entry.forms.status === "draft"), "nothing reaches students before the teacher approves it");
  assert.deepEqual(lintContent("sabina.json", content).errors, []);
});

test("validator rejects forms that cannot be confirmed and says what to do", () => {
  const broken = item("humid");
  broken.forms.affixes = [];
  broken.forms.noun = { w: "wetness", ex: "The wetness was clear." };
  assert.match(validateForms(broken).errors.join(), /cannot confirm "wetness"/);
  assert.deepEqual(validateForms(broken, "v", { derivations: parseDerivations("wetness") }).errors, [], "a local derivation list confirms it");
  broken.forms.review = ["noun"];
  const flagged = validateForms(broken);
  assert.deepEqual(flagged.errors, []);
  assert.match(flagged.warnings.join(), /marked for teacher review/);
});

test("validator reports each structural problem", () => {
  const broken = item("humid");
  broken.forms.status = "live";
  broken.forms.noun.parts = ["humid", "ness"];
  broken.forms.verb.ex = "This sentence lacks the word.";
  broken.forms.affixes = [{ part: "-ness", type: "suffix", meaning: "state" }, { part: "x", type: "middle", meaning: "?" }];
  broken.forms.adjective = { w: "humid", ex: "It is humid." };
  broken.forms.other.parts = ["de", "humid"];
  const text = validateForms(broken).errors.join("\n");
  for (const fragment of ['status must be "draft" or "approved"', "do not add up to", "must contain", "is not at the end of any listed form", "needs part, type", "already used"]) assert.ok(text.includes(fragment), `${fragment}\n${text}`);
  assert.match(validateForms({ en: "x", forms: [] }).errors.join(), /must be an object/);
  assert.deepEqual(validateForms({ en: "x" }), { errors: [], warnings: [] });
});

test("students see approved forms only, never ones under review; teachers see drafts", () => {
  const flood = item("flood");
  assert.equal(familyVisible(flood, false), false);
  assert.equal(visibleForms(flood, false).length, 0);
  assert.equal(familyVisible(flood, true), true);
  flood.forms.status = "approved";
  flood.forms.review = ["adjective"];
  assert.deepEqual(visibleForms(flood, false).map(form => form.w), ["flooding"]);
  assert.deepEqual(visibleForms(flood, true).map(form => form.w), ["flooding", "flooded"]);
  assert.equal(visibleForms(flood, true)[1].needsReview, true);
});

test("exercises: stable ids, a type per item, build only with parts, choose needs distractors", () => {
  const approved = vocab.map(entry => (entry.forms ? { ...structuredClone(entry), forms: { ...entry.forms, status: "approved" } } : entry));
  const items = familyItems(approved, { isTeacher: false });
  assert.ok(items.length >= 8);
  assert.equal(new Set(items.map(entry => entry.id)).size, items.length);
  assert.ok(items.every(entry => /^[a-z0-9_]+\.[a-z]+$/.test(entry.id) && familyKey(entry.id).length <= 64));
  assert.ok(items.every(entry => entry.pos !== "other"));
  assert.deepEqual(familyItems(vocab, { isTeacher: false }), [], "drafts produce nothing for students");
  for (const entry of items) {
    if (entry.type === "build") {
      assert.ok(entry.parts && checkMorphemes(entry, entry.parts), entry.id);
      assert.ok(entry.tiles.length > entry.parts.length, "has distractor morphemes");
      assert.equal(checkMorphemes(entry, [...entry.parts].reverse()), false);
    }
    if (entry.type === "choose") {
      assert.ok(entry.options.includes(entry.answer) && entry.options.length >= 3);
      assert.equal(checkChoose(entry, entry.answer), true);
      assert.equal(checkChoose(entry, entry.options.find(option => option !== entry.answer)), false);
    }
  }
  assert.deepEqual(new Set(items.map(entry => entry.type)).size >= 2, true);
  assert.ok(items.some(entry => entry.prompt.startsWith("Humid → (noun)") ));
  assert.ok(new Set(["choose", "type", "build"]).has(items[0].type));
});

test("grading: typed form ignores case, rejects other forms; explanations name the answer", () => {
  const typed = familyItems([{ en: "humid", forms: { status: "approved", noun: { w: "humidity", ex: "The humidity rose." }, verb: { w: "humidify", ex: "We humidify the room." }, adjective: { w: "humidish", ex: "It is humidish." } } }])[1];
  assert.equal(typed.type, "type");
  assert.equal(checkTypedForm(typed, "Humidify"), true);
  assert.equal(checkTypedForm(typed, "humidity"), false);
  assert.equal(checkTypedForm(typed, ""), false);
  assert.match(explainForm(typed), /"humidify"/);
});

test("suggestions are candidates only: no duplicates of the headword, plausible suffixes", () => {
  const candidates = suggestForms("evacuate");
  assert.ok(candidates.some(entry => entry.w === "evacuation"));
  assert.ok(candidates.every(entry => entry.w !== "evacuate"));
  assert.ok(suggestForms("humid").some(entry => entry.w === "humidity"));
  assert.deepEqual(suggestForms("two words"), []);
  assert.deepEqual(suggestForms(""), []);
});
