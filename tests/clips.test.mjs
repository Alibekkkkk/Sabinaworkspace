import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { addProtectedClipAnswers, clipEmbedUrl, validateClip } from "../js/clips/schema.js";

const clipFiles = readdirSync(new URL("../content/clips/", import.meta.url))
  .filter(file => file.endsWith(".json"));
const clips = clipFiles.map(file => ({
  file,
  content: JSON.parse(readFileSync(new URL(`../content/clips/${file}`, import.meta.url), "utf8"))
}));

test("public clip drafts are valid and do not expose answer keys", () => {
  assert.ok(clips.length > 0);
  for (const { file, content } of clips) {
    assert.doesNotThrow(() => validateClip(content, { requireAnswers: false }), file);
    for (const exercise of content.exercises) {
      assert.equal(Object.hasOwn(exercise, "answer"), false, `${file} exposes an answer`);
    }
  }
});

test("clip drafts become importable protected records after private answers are supplied", () => {
  for (const { file, content } of clips) {
    const answers = Object.fromEntries(content.exercises.map(exercise => [
      exercise.id,
      exercise.options ? exercise.options[0] : "example"
    ]));
    const protectedClip = addProtectedClipAnswers(content, answers);
    assert.doesNotThrow(() => validateClip(protectedClip), file);
    assert.throws(() => addProtectedClipAnswers(content, {}), /must match the exercises/);
  }
});

test("clip schema rejects invalid video sources and segment lengths", () => {
  const { content } = clips[0];
  assert.throws(() => validateClip({
    ...content,
    source: { ...content.source, sourceUrl: "https://example.com/video" }
  }, { requireAnswers: false }), /source needs attribution/);
  assert.throws(() => validateClip({
    ...content,
    endSeconds: content.startSeconds + 61
  }, { requireAnswers: false }), /between 10 and 60 seconds/);
});

test("public clip drafts reject embedded answers", () => {
  const { content } = clips[0];
  assert.throws(() => validateClip({
    ...content,
    exercises: content.exercises.map(exercise => ({ ...exercise, answer: "secret" }))
  }, { requireAnswers: false }), /must not contain answer keys/);
});

test("transcript timing and quiz shapes are validated", () => {
  const { content } = clips[0];
  assert.throws(() => validateClip({
    ...content,
    transcript: [{ ...content.transcript[0], endSeconds: content.endSeconds + 1 }]
  }, { requireAnswers: false }), /timing must stay within/);
  assert.throws(() => validateClip({
    ...content,
    exercises: [{ ...content.exercises[0], answer: "correct", options: ["wrong", "also wrong"] }]
  }), /options must include the answer/);
});

test("official embed URL uses the privacy-enhanced YouTube player and bounded segment", () => {
  const { content } = clips[0];
  const answers = Object.fromEntries(content.exercises.map(exercise => [
    exercise.id,
    exercise.options ? exercise.options[0] : "example"
  ]));
  const url = new URL(clipEmbedUrl(addProtectedClipAnswers(content, answers)));
  assert.equal(url.origin, "https://www.youtube-nocookie.com");
  assert.equal(url.pathname, `/embed/${content.source.videoId}`);
  assert.equal(url.searchParams.get("start"), String(content.startSeconds));
  assert.equal(url.searchParams.get("end"), String(content.endSeconds));
});
