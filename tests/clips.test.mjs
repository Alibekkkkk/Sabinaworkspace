import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { addProtectedClipAnswers, clipEmbedUrl, validateClip } from "../js/clips/schema.js";
import { clipWarnings } from "../js/clips/schema-v2.js";

const clipFiles = readdirSync(new URL("../content/clips/", import.meta.url)).filter(file => file.endsWith(".json"));
const clips = clipFiles.map(file => ({ file, content: JSON.parse(readFileSync(new URL(`../content/clips/${file}`, import.meta.url), "utf8")) }));

// A version 1 clip as it was shipped before schema v2: the old import path must keep working for records already stored.
const legacy = () => ({
  schemaVersion: 1, id: "legacy-floods", title: "Floods", level: "B1", genre: ["science explainer"], grammarPoints: ["present simple"], vocabularyThemes: ["floods"],
  source: { provider: "youtube", videoId: "4PXj7bOD7IY", channel: "National Geographic", videoTitle: "Floods 101", sourceUrl: "https://www.youtube.com/watch?v=4PXj7bOD7IY", rights: "official-embed", reviewedAt: "2026-11-04" },
  startSeconds: 0, endSeconds: 30, transcriptType: "teacher-created", transcriptNote: "Original practice text.",
  transcript: [{ id: "flood-impact", startSeconds: 0, endSeconds: 15, text: "A flood covers land that is usually dry.", translation: "x" }],
  vocabulary: [{ word: "flood", translation: "x", definition: "Water covering land." }],
  exercises: [{ id: "flood-pick", type: "check-understanding", prompt: "What does a flood cover?", options: ["land", "a space station"] }]
});

test("every shipped clip file is a valid version 2 draft without answer keys and is flagged until its timing is checked", () => {
  assert.ok(clips.length >= 7);
  for (const { file, content } of clips) {
    assert.equal(content.schemaVersion, 2, file);
    assert.doesNotThrow(() => validateClip(content, { requireAnswers: false }), file);
    for (const exercise of content.exercises) assert.equal(Object.hasOwn(exercise, "answer"), false, `${file} exposes an answer`);
    assert.equal(content.timingVerified, false, `${file}: nobody has checked the line timing against the video yet`);
    assert.ok(clipWarnings(content).some(warning => /not been checked/.test(warning)), `${file} warns the teacher`);
  }
});

test("shipped clips become importable protected records once the private answers are supplied", () => {
  for (const { file, content } of clips) {
    const answers = Object.fromEntries(content.exercises.filter(exercise => ["gist", "gap-fill", "listen-pick"].includes(exercise.type)).map(exercise => [exercise.id, exercise.options ? exercise.options[0] : "example"]));
    assert.doesNotThrow(() => validateClip(addProtectedClipAnswers(content, answers)), file);
    assert.throws(() => addProtectedClipAnswers(content, {}), /must match the exercises/, file);
  }
});

test("version 1 clips still validate, import and embed through the old path", () => {
  const clip = legacy();
  assert.doesNotThrow(() => validateClip(clip, { requireAnswers: false }));
  const protectedClip = addProtectedClipAnswers(clip, { "flood-pick": "land" });
  assert.doesNotThrow(() => validateClip(protectedClip));
  const url = new URL(clipEmbedUrl(protectedClip));
  assert.equal(url.origin, "https://www.youtube-nocookie.com"); assert.equal(url.pathname, "/embed/4PXj7bOD7IY");
  assert.equal(url.searchParams.get("start"), "0"); assert.equal(url.searchParams.get("end"), "30");
  assert.throws(() => validateClip({ ...clip, source: { ...clip.source, sourceUrl: "https://example.com/video" } }, { requireAnswers: false }), /source needs attribution/);
  assert.throws(() => validateClip({ ...clip, endSeconds: 61 }, { requireAnswers: false }), /between 10 and 60 seconds/);
  assert.throws(() => validateClip({ ...clip, exercises: clip.exercises.map(exercise => ({ ...exercise, answer: "secret" })) }, { requireAnswers: false }), /must not contain answer keys/);
  assert.throws(() => validateClip({ ...clip, transcript: [{ ...clip.transcript[0], endSeconds: 31 }] }, { requireAnswers: false }), /timing must stay within/);
  assert.throws(() => validateClip({ ...clip, exercises: [{ ...clip.exercises[0], answer: "air", options: ["land", "sea"] }] }), /options must include the answer/);
  assert.throws(() => validateClip({ ...clip, schemaVersion: 3 }), /Unsupported clip schema version/);
});

test("the embed URL of a version 2 clip uses the privacy-enhanced player and the clip window", () => {
  const { content } = clips[0];
  const url = new URL(clipEmbedUrl(content));
  assert.equal(url.origin, "https://www.youtube-nocookie.com"); assert.equal(url.pathname, `/embed/${content.source.videoId}`);
  assert.equal(url.searchParams.get("start"), String(content.startSeconds)); assert.equal(url.searchParams.get("end"), String(content.endSeconds));
});
