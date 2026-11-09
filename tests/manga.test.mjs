import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { addProtectedMangaAnswers, validateManga } from "../js/manga/schema.js";

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const draft = read("./fixtures/manga-v1.json"); // the original version 1 story, kept to prove old records still load
const manifest = read("../content/manifest.json");
const answers = {
  "garden-purpose": "vegetables",
  "fill-bubble": "share",
  "chapter-boss": "They worked and shared food together."
};

test("a version 1 manga draft validates without exposing answer keys", () => {
  assert.doesNotThrow(() => validateManga(draft, { requireAnswers: false }));
  for (const chapter of draft.chapters) {
    for (const check of chapter.checks) assert.equal(Object.hasOwn(check, "answer"), false);
    for (const panel of chapter.panels) {
      assert.match(panel.imageUrl, /^assets\/manga\/[a-z0-9-]+\.svg$/i);
      assert.ok(panel.alt);
    }
  }
});

test("Manga Reader is feature-flagged only for Gaziz in the manifest", () => {
  assert.equal(manifest.gaziz.features.mangaReader, true);
  const enabled = Object.entries(manifest)
    .filter(([, entry]) => entry.features?.mangaReader === true);
  assert.ok(enabled.length > 0);
  for (const [, entry] of enabled) assert.equal(entry.mangaFeatureFor, "gaziz");
});

test("private answers are merged into protected version 1 manga records", () => {
  const protectedManga = addProtectedMangaAnswers(draft, answers);
  assert.doesNotThrow(() => validateManga(protectedManga));
  assert.equal(protectedManga.chapters[0].checks[1].answer, "share");
  assert.throws(() => addProtectedMangaAnswers(draft, {}), /must match the checks/);
});

test("version 1 rejects remote images and missing answers", () => {
  const badImage = {
    ...draft,
    chapters: draft.chapters.map(chapter => ({
      ...chapter,
      panels: chapter.panels.map((panel, index) => index ? panel : { ...panel, imageUrl: "https://example.com/panel.svg" })
    }))
  };
  assert.throws(() => validateManga(badImage, { requireAnswers: false }), /local SVG art/);
  const protectedManga = addProtectedMangaAnswers(draft, answers);
  const missingAnswer = {
    ...protectedManga,
    chapters: protectedManga.chapters.map(chapter => ({
      ...chapter,
      checks: chapter.checks.map((check, index) => index ? check : { ...check, answer: undefined })
    }))
  };
  assert.throws(() => validateManga(missingAnswer), /correct answer/);
  assert.throws(() => validateManga({
    ...draft,
    chapters: draft.chapters.map(chapter => ({
      ...chapter,
      checks: chapter.checks.map(check => ({ ...check, answer: "secret" }))
    }))
  }, { requireAnswers: false }), /must not contain answer keys/);
});
