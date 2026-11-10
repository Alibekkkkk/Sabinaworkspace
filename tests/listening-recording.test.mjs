// Listening sets made from a recording (Phase 11): link handling, sentences with times, the set and its validation.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRecordingSet, chunksToSentences, normalizeAudioLink, padClip, splitSentences, transcriptToSentences } from "../js/listening/recording.js";
import { MAX_WORDS, tokenize, validateListeningPack } from "../js/listening/schema.js";

test("audio links: direct files pass, share links become direct, video and web pages are refused", () => {
  assert.deepEqual(normalizeAudioLink("https://example.com/news.mp3"), { url: "https://example.com/news.mp3", problem: "" });
  assert.equal(normalizeAudioLink("https://drive.google.com/file/d/AbC_123/view?usp=sharing").url, "https://drive.google.com/uc?export=download&id=AbC_123");
  assert.equal(normalizeAudioLink("https://drive.google.com/open?id=XyZ").url, "https://drive.google.com/uc?export=download&id=XyZ");
  assert.equal(normalizeAudioLink("https://www.dropbox.com/s/abc/talk.m4a?dl=0").url, "https://www.dropbox.com/s/abc/talk.m4a?raw=1");
  assert.match(normalizeAudioLink("https://www.youtube.com/watch?v=x").problem, /YouTube/);
  assert.match(normalizeAudioLink("https://youtu.be/x").problem, /YouTube/);
  assert.match(normalizeAudioLink("http://example.com/a.mp3").problem, /https/);
  assert.match(normalizeAudioLink("https://example.com/story.html").problem, /web page/);
  assert.match(normalizeAudioLink("").problem, /Paste a link/);
  assert.match(normalizeAudioLink("not a link").problem, /https/);
  assert.equal(normalizeAudioLink("http://127.0.0.1:5050/tests/fixtures/tones.wav").problem, "", "the local test server is allowed");
});

test("sentences: split at full stops, long ones at commas or every 25 words, tiny pieces joined", () => {
  assert.deepEqual(splitSentences("The river rose. People left! Did they return? Yes."), ["The river rose. People left!", "Did they return? Yes."]);
  assert.deepEqual(splitSentences("Hello. The river rose quickly."), ["Hello. The river rose quickly."]);
  const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ") + ".";
  const parts = splitSentences(long);
  assert.ok(parts.every(part => tokenize(part).length <= MAX_WORDS));
  assert.equal(parts.join(" "), long);
  const withCommas = `${"one two three four five six seven eight nine ten, ".repeat(3)}end.`;
  assert.ok(splitSentences(withCommas).every(part => tokenize(part).length <= MAX_WORDS));
});

test("Whisper chunks become sentences with times, padded and within the recording", () => {
  // the real output for the JFK sample (whisper-tiny.en), checked in the browser
  const jfk = chunksToSentences([{ text: " And so my fellow Americans ask not what your country can do for you", timestamp: [0, 7.74] }, { text: " ask what you can do for your country.", timestamp: [7.74, 10.64] }], { duration: 11 });
  assert.equal(jfk.length, 1);
  assert.equal(jfk[0].start, 0);
  assert.ok(jfk[0].end > 10.6 && jfk[0].end <= 11);
  const two = chunksToSentences([{ text: " The river rose quickly. People left their homes.", timestamp: [0, 5] }, { text: " Rescue teams helped them. It rained for days.", timestamp: [5, 10] }], { duration: 10.5 });
  assert.deepEqual(two.map(sentence => sentence.text), ["The river rose quickly.", "People left their homes.", "Rescue teams helped them.", "It rained for days."]);
  two.forEach((sentence, index) => { assert.ok(sentence.end > sentence.start); if (index) assert.ok(sentence.start >= two[index - 1].start); assert.ok(sentence.end <= 10.5); });
  assert.ok(two[2].start > 4 && two[2].start < 5.2, "a sentence in the second chunk starts near its time");
  assert.deepEqual(chunksToSentences([]), []);
});

test("a pasted transcript is spread over the recording, and clips get a little air", () => {
  const sentences = transcriptToSentences("One two three four. Five six seven eight nine ten.", 10);
  assert.equal(sentences.length, 2);
  assert.ok(sentences.every(sentence => sentence.estimated));
  assert.equal(sentences[0].start, 0);
  assert.equal(sentences[1].end, 10);
  assert.deepEqual(padClip(5, 6, 20), { start: 4.85, end: 6.35 });
  assert.deepEqual(padClip(0, 0.1, 0.3), { start: 0, end: 0.3 });
});

test("the saved set is a valid listening set that plays clips of the recording", () => {
  const set = buildRecordingSet({ lessonId: "lesson_1", title: "A news report", level: "B2", sourceUrl: "https://example.com/news.mp3", credits: "used with permission: BBC Learning English", duration: 30,
    sentences: [{ text: "Floods have hit the north.", start: 0, end: 3.2 }, { text: " ", start: 3, end: 4 }, { text: "Rescue teams are working.", start: 3.2, end: 6 }], targets: ["flood"] });
  assert.deepEqual(validateListeningPack(set), []);
  assert.equal(set.items.length, 2, "empty sentences are dropped");
  assert.deepEqual(set.items[0].clip, { start: 0, end: 3.2 });
  assert.equal(set.items[0].gaps.easy[0], 0, "the lesson word (flood) is hidden first");
  assert.equal(set.source.url, "https://example.com/news.mp3");
  assert.equal(set.status, "approved");
});

test("the validator explains broken recording sets", () => {
  const set = buildRecordingSet({ lessonId: "x1", title: "t", sourceUrl: "https://example.com/a.mp3", credits: "original", duration: 10, sentences: [{ text: "Hello there my friend.", start: 1, end: 2 }] });
  const broken = structuredClone(set);
  broken.source.url = "http://example.com/a.mp3"; broken.source.credits = "copied from the radio";
  broken.items[0].clip = { start: 3, end: 2 };
  const errors = validateListeningPack(broken).join(" | ");
  assert.match(errors, /source.url must be an https/);
  assert.match(errors, /source.credits must start with/);
  assert.match(errors, /clip must be \{ start, end \}/);
  const orphan = structuredClone(set); delete orphan.source;
  assert.match(validateListeningPack(orphan).join(), /clip needs a source recording/);
  const late = structuredClone(set); late.items[0].clip = { start: 12, end: 13 };
  assert.match(validateListeningPack(late).join(), /starts after the end of the recording/);
});

test("the tool page loads the library only from its own wider policy, and the student pages stay strict", () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  assert.match(read("tools/listening-recording.html"), /script-src [^;]*https:\/\/cdn\.jsdelivr\.net[^;]*'wasm-unsafe-eval'/);
  assert.doesNotMatch(read("listening.html"), /cdn\.jsdelivr\.net/);
  const config = JSON.parse(read("firebase.json"));
  const rules = config.hosting.headers;
  const tool = rules.findIndex(rule => rule.source === "/tools/listening-recording.html");
  assert.ok(tool > rules.findIndex(rule => rule.source === "**"), "the page rule comes after the site-wide one, so it wins");
  assert.match(rules[tool].headers.find(header => header.key === "Content-Security-Policy").value, /connect-src 'self' https:/);
  assert.match(read("js/listening/whisper.js"), /@huggingface\/transformers@3\.0\.2\//, "the library version is pinned");
});
