import assert from "node:assert/strict";
import test from "node:test";
import { buildClipDraft, parseVideoId, parseVocabulary, slug } from "../js/clips/authoring.js";

test("video addresses of every common shape give the id, and nonsense gives nothing", () => {
  const id = "4PXj7bOD7IY";
  for (const address of [id, `https://www.youtube.com/watch?v=${id}`, `https://youtube.com/watch?v=${id}&t=30s`, `https://youtu.be/${id}?si=abc`, `https://www.youtube.com/embed/${id}`, `https://www.youtube-nocookie.com/embed/${id}`, `https://www.youtube.com/shorts/${id}`, `  https://m.youtube.com/watch?v=${id}  `]) assert.equal(parseVideoId(address), id, address);
  for (const bad of ["", "hello", "https://example.com/watch?v=4PXj7bOD7IY", "https://www.youtube.com/watch?v=short", "javascript:alert(1)", null, undefined]) assert.equal(parseVideoId(bad), "", String(bad));
  assert.equal(slug("Floods 101 | National Geographic!"), "floods-101-national-geographic");
});

test("vocabulary rows split on the first equals sign and skip blank rows", () => {
  assert.deepEqual(parseVocabulary("sandbags = bags of sand\n\n flood = water = everywhere "), [{ word: "sandbags", meaning: "bags of sand" }, { word: "flood", meaning: "water = everywhere" }]);
  assert.deepEqual(parseVocabulary(""), []);
});

const lines = [["The river rose quickly last night.", "Anna"], ["Did the water reach the road?", "Ben"], ["Yes, and the shops closed early.", "Anna"], ["Everyone waited for the rain to stop.", "Ben"], ["Then the volunteers brought sandbags.", "Anna"], ["They worked until the morning came.", "Ben"], ["By noon the water had gone down.", "Anna"], ["The town was safe again.", "Ben"]]
  .map(([text, speaker], i) => ({ id: `x${i}`, start: 10 + i * 6, end: 16 + i * 6, text, speaker }));
const fields = { id: "my-clip", title: "My clip", level: "B1", genre: "documentary", grammar: "past simple, time words", channel: "Channel", videoTitle: "Title", rights: "official-embed", transcriptType: "original", timingVerified: true, vocabulary: "sandbags = bags of sand", gist: "What is it about?", gistOptions: "a flood\na party\na race" };
const state = { videoId: "4PXj7bOD7IY", start: 10, end: 70, lines };

test("the clip maker turns the form into a valid clip, with the answers kept separate", () => {
  const out = buildClipDraft(fields, state, new Date("2026-11-09T10:00:00Z"));
  assert.equal(out.ok, true, out.messages.join(" "));
  assert.equal(out.clip.source.reviewedAt, "2026-11-09"); assert.deepEqual(out.clip.transcript.map(line => line.id), ["l1", "l2", "l3", "l4", "l5", "l6", "l7", "l8"]);
  for (const exercise of out.clip.exercises) assert.equal(Object.hasOwn(exercise, "answer"), false, "the public clip has no answer keys");
  assert.deepEqual(out.answers["my-clip"]["gist-1"], "a flood"); assert.ok(out.answers["my-clip"]["order-1"].length >= 3);
  assert.ok(new Set(out.clip.exercises.map(e => e.type)).size >= 4, "at least four kinds of exercise are suggested");
  assert.deepEqual(out.messages, ["The clip is valid."], "a healthy clip has no warnings");
});

test("the clip maker explains what is wrong instead of throwing", () => {
  assert.match(buildClipDraft({ ...fields, id: "" }, state).messages[0], /Fix this first: Clip needs a valid id/);
  assert.match(buildClipDraft(fields, { ...state, end: 15 }).messages[0], /10 to 90 seconds/);
  assert.match(buildClipDraft(fields, { ...state, lines: [{ ...lines[0], start: 3 }] }).messages[0], /outside the clip window/);
  assert.match(buildClipDraft({ ...fields, rights: "CC-BY" }, state).messages[0], /licence/);
  assert.match(buildClipDraft(fields, { ...state, videoId: "" }).messages[0], /videoId/);
  assert.match(buildClipDraft(fields, { ...state, lines: [] }).messages[0], /at least one transcript line/);
  const few = buildClipDraft({ ...fields, timingVerified: false }, { ...state, lines: lines.slice(0, 3), end: 40 });
  assert.equal(few.ok, true); assert.ok(few.messages.some(m => /not been checked/.test(m)) && few.messages.some(m => /transcript lines/.test(m)), "soft problems become warnings");
});

test("a teacher cannot choose verbatim captions without a licence", () => {
  assert.equal(buildClipDraft({ ...fields, transcriptType: "licensed" }, state).ok, true, "licensed text is allowed as a type");
  assert.equal(buildClipDraft({ ...fields, transcriptType: "verbatim-captions" }, state).ok, false);
});
