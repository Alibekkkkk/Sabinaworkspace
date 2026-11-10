import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { align, canonicalWord, checkGap, diffWord, normalizeTyped } from "../js/listening/answers.js";
import { adaptLevel, canSlow, compareSpoken, mistakeItems, showLetterCount, summarizeRound } from "../js/listening/levels.js";
import { draftItemsFromSentences, gapsForLevel, generateGaps, pickGaps, targetWordsFromTags, tokenize, validateListeningPack } from "../js/listening/schema.js";

const pack = JSON.parse(readFileSync(fileURLToPath(new URL("../content/listening/sabina.json", import.meta.url)), "utf8"));
const root = fileURLToPath(new URL("../content/", import.meta.url));
const item = text => ({ text });
const clone = () => structuredClone(pack);

// ---- schema -----------------------------------------------------------------------------------------

test("every student has a valid, original, approved listening set that the manifest names", () => {
  const manifest = JSON.parse(readFileSync(root + "manifest.json", "utf8"));
  for (const name of ["sabina", "gaziz", "abay", "araylim_1", "araylim_2", "araylim_3", "george"]) {
    const set = JSON.parse(readFileSync(root + `listening/${name}.json`, "utf8"));
    assert.deepEqual(validateListeningPack(set, { fileExists: path => existsSync(root + path) }), [], name);
    assert.equal(set.status, "approved", name);
    assert.ok(set.items.length >= 10 && set.items.every(entry => /^original/.test(entry.credits) && entry.translation && entry.translation.ru), name);
    assert.equal(manifest[name].listeningFile, `listening/${name}.json`, name);
    assert.ok(set.items.every(entry => entry.gaps.easy.length >= 2), `${name}: every Easy sentence practises at least two words`);
  }
  assert.deepEqual(validateListeningPack(pack, { fileExists: path => existsSync(root + path) }), []);
  assert.equal(pack.items.length, 10);
  assert.ok(pack.items.every(entry => /^original/.test(entry.credits)));
});

test("validator reports each structural problem in plain words", () => {
  const broken = clone();
  broken.level = "Z9"; broken.voice.provider = "robot"; broken.voice.character = "bob";
  broken.items[0].id = broken.items[1].id;
  broken.items[0].gaps.easy = [99];
  broken.items[1].gaps.medium = [1, 1];
  broken.items[2].text = Array.from({ length: 30 }, (_, index) => `word${index}`).join(" ");
  broken.items[3].audio = { normal: "../evil.mp3" };
  broken.items[4].audio = { normal: "audio/missing.mp3" };
  broken.items[5].credits = "copied from a song";
  broken.items[6].wordTimings = [{ i: 0, start: 1, end: 0.5 }];
  broken.items[7].translation = { russian: "x" };
  broken.items[8].alternatives = { 99: ["x"] };
  delete broken.items[9].gaps;
  const text = validateListeningPack(broken, { fileExists: () => false }).join("\n");
  for (const fragment of [
    "level must be one of", "voice.provider must be one of", "voice.character must be one of", "duplicate id", "outside the sentence", "listed twice",
    "the limit is 25", "must be a path like", "does not exist", "credits must start with", "wordTimings must be", "translation must map", "alternatives must map", "gaps is required"
  ]) assert.ok(text.includes(fragment), `missing: ${fragment}\n${text}`);
  assert.deepEqual(validateListeningPack(null), ["The pack must be an object."]);
  assert.match(validateListeningPack({ ...clone(), items: [] }).join(), /at least one sentence/);
});

test("gap generation: content words first, targets first, function words only when needed", () => {
  const text = "The council has provided free food and water.";
  const words = tokenize(text).map(word => word.toLowerCase().replace(/[^a-z]/g, ""));
  const easy = pickGaps(text, "easy");
  assert.equal(easy.length, 2);
  assert.ok(easy.every(index => !["the", "has", "and"].includes(words[index])), "easy hides content words only");
  const targeted = pickGaps(text, "easy", { targets: ["water"] });
  assert.ok(targeted.includes(words.indexOf("water")), "a lesson target word is picked first");
  const medium = pickGaps(text, "medium");
  assert.equal(medium.length, Math.round(words.length / 2));
  assert.ok(medium.length > easy.length);
  assert.equal(pickGaps(text, "hard"), "all");
  assert.equal(pickGaps(text, "expert"), "all");
  assert.deepEqual(pickGaps("Hello.", "easy"), [0]);
  assert.deepEqual(pickGaps("", "easy"), []);
  assert.deepEqual([...pickGaps(text, "medium")], [...pickGaps(text, "medium")].sort((a, b) => a - b), "indices are sorted");
  const made = generateGaps(text, { targets: ["council"] });
  assert.deepEqual(Object.keys(made), ["easy", "medium", "hard"]);
  const mediumFn = pickGaps("It is to be at on in", "medium");
  assert.ok(mediumFn.length >= 3, "function-word sentences still get gaps");
});

test("gapsForLevel and tags", () => {
  const entry = pack.items[0];
  assert.deepEqual(gapsForLevel(entry, "easy"), entry.gaps.easy);
  assert.equal(gapsForLevel(entry, "hard").length, tokenize(entry.text).length);
  assert.deepEqual(gapsForLevel(entry, "expert"), gapsForLevel(entry, "hard"));
  assert.deepEqual(targetWordsFromTags(["vocabulary:grasp", "grammar:present simple", "vocabulary: flood"]), ["grasp", "flood"]);
  const drafts = draftItemsFromSentences(["The flood closed the road.", "  ", "It rained."], { prefix: "x", targets: ["flood"] });
  assert.equal(drafts.length, 2);
  assert.equal(drafts[0].id, "x-001");
  assert.deepEqual(drafts[0].lessonTags, ["vocabulary:flood"]);
  assert.deepEqual(validateListeningPack({ schemaVersion: 1, id: "demo-pack", title: "t", level: "A2", voice: { id: "v", provider: "browser", character: "nora" }, items: drafts }), []);
});

// ---- answer matching (>= 50 cases) --------------------------------------------------------------------

const matching = [
  // [sentence, index, typed, ok]
  ["The council has provided free food.", 1, "council", true],
  ["The council has provided free food.", 1, "Council", true],
  ["The council has provided free food.", 1, "COUNCIL", true],
  ["The council has provided free food.", 1, "  council ", true],
  ["The council has provided free food.", 1, "council.", true],
  ["The council has provided free food.", 1, "counsel", false],
  ["The council has provided free food.", 1, "counci", false],
  ["The council has provided free food.", 1, "councils", false],
  ["The council has provided free food.", 1, "", false],
  ["The council has provided free food.", 1, "   ", false],
  ["The council has provided free food.", 5, "food", true],
  ["The council has provided free food.", 5, "food.", true],
  ["The council has provided free food.", 5, "Food!", true],
  ["The council has provided free food.", 5, "foods", false],
  ["The council has provided free food.", 5, "mood", false],
  ["We haven't heard any news.", 1, "haven't", true],
  ["We haven't heard any news.", 1, "haven’t", true],
  ["We haven’t heard any news.", 1, "haven't", true],
  ["We haven't heard any news.", 1, "Haven't", true],
  ["We haven't heard any news.", 1, "have", false],
  ["We haven't heard any news.", 1, "havent", false],
  ["It's raining again.", 0, "it's", true],
  ["It's raining again.", 0, "its", false],
  ["It's raining again.", 0, "it is", false],
  ["It's raining again.", 1, "raining", true],
  ["The colour is red.", 1, "colour", true],
  ["The colour is red.", 1, "color", true],
  ["The color is red.", 1, "colour", true],
  ["The color is red.", 1, "colors", false],
  ["My favourite place is here.", 1, "favorite", true],
  ["My favourite place is here.", 1, "favourite", true],
  ["The centre of town is closed.", 1, "center", true],
  ["The theatre has reopened.", 1, "theater", true],
  ["They built new defences.", 3, "defenses", true],
  ["They built new defences.", 3, "defences", true],
  ["They built new defences.", 3, "defense", false],
  ["We organise a trip.", 1, "organize", true],
  ["We organized a trip.", 1, "organised", true],
  ["She was travelling alone.", 2, "traveling", true],
  ["The grey sky was dark.", 1, "gray", true],
  ["The programme starts now.", 1, "program", true],
  ["Fur is not the same as four.", 6, "four", true],
  ["Fur is not the same as four.", 6, "for", false],
  ["He has 3 books.", 2, "three", false],
  ["Mother-in-law arrived.", 0, "mother-in-law", true],
  ["Mother-in-law arrived.", 0, "motherinlaw", false],
  ["Do you like it?", 3, "it", true],
  ["Do you like it?", 3, "it?", true],
  ["Do you like it?", 1, "YOU", true],
  ["Do you like it?", 1, "u", false],
  ["Rain, rain, go away.", 0, "rain", true],
  ["Rain, rain, go away.", 1, "rain,", true]
];
test(`answer matching: ${matching.length} cases (case, punctuation, curly quotes, contractions, UK/US)`, () => {
  assert.ok(matching.length >= 50);
  for (const [text, index, typed, ok] of matching) assert.equal(checkGap(item(text), index, typed).ok, ok, `${text} [${index}] "${typed}"`);
});

test("alternatives widen what is accepted, per word and per item only", () => {
  const entry = { text: "He has three books.", alternatives: { 2: ["3"] } };
  assert.equal(checkGap(entry, 2, "3").ok, true);
  assert.equal(checkGap(entry, 2, "three").ok, true);
  assert.equal(checkGap(entry, 3, "3").ok, false, "alternatives of another word do not leak");
  assert.equal(checkGap({ text: "He has three books." }, 2, "3").ok, false);
  const noApostrophe = pack.items.find(entry => entry.text.includes("haven't"));
  assert.equal(checkGap(noApostrophe, 1, "havent").ok, true, "the shipped item accepts the apostrophe-free spelling");
  assert.equal(checkGap(noApostrophe, 2, "havent").ok, false);
  assert.equal(canonicalWord("Colours"), "colors");
  assert.equal(normalizeTyped("  “Hello”, "), "hello");
});

test("diffWord marks where the letters differ", () => {
  const letters = diffWord("council", "counsel").letters;
  assert.equal(letters.map(entry => entry.char).join(""), "council");
  assert.deepEqual(letters.filter(entry => entry.status === "wrong").map(entry => entry.char), ["c", "i"]);
  assert.equal(diffWord("food", "food").exact, true);
  const missing = diffWord("river", "rver");
  assert.deepEqual(missing.letters.filter(entry => entry.status === "wrong").map(entry => entry.char), ["i"]);
  const extra = diffWord("rain", "raain");
  assert.deepEqual(extra.extra, ["a"]);
  assert.equal(extra.exact, false);
  assert.equal(diffWord("storm", "").letters.every(entry => entry.status === "wrong"), true);
  assert.equal(diffWord("a", "A").exact, true, "case is ignored");
  assert.deepEqual(align(["a", "b"], ["a", "x", "b"]).map(entry => entry.op), ["match", "extra", "match"]);
});

// ---- levels, rounds, speaking ---------------------------------------------------------------------------

test("adaptive level: 3 correct in a row go up, 2 wrong in a row go down, within bounds", () => {
  let state = { level: "easy", correctRun: 0, wrongRun: 0 };
  state = adaptLevel(state, true); state = adaptLevel(state, true);
  assert.equal(state.level, "easy");
  state = adaptLevel(state, true);
  assert.equal(state.level, "medium"); assert.equal(state.changed, "up"); assert.equal(state.correctRun, 0);
  state = adaptLevel(state, false);
  assert.equal(state.level, "medium"); assert.equal(state.changed, null);
  state = adaptLevel(state, false);
  assert.equal(state.level, "easy"); assert.equal(state.changed, "down");
  state = adaptLevel(state, false); state = adaptLevel(state, false);
  assert.equal(state.level, "easy", "cannot go below easy");
  let top = { level: "expert", correctRun: 2, wrongRun: 0 };
  top = adaptLevel(top, true);
  assert.equal(top.level, "expert", "cannot go above expert");
  const reset = adaptLevel({ level: "hard", correctRun: 2, wrongRun: 1 }, false);
  assert.equal(reset.correctRun, 0, "a wrong answer breaks the correct run");
  assert.equal(canSlow("hard"), true); assert.equal(canSlow("expert"), false);
  assert.equal(showLetterCount("hard"), true); assert.equal(showLetterCount("expert"), false);
});

test("round summary: accuracy, stars, hardest words, best combo; assisted words do not count", () => {
  const gap = (expected, ok, assisted = false) => ({ index: 0, expected, ok, assisted });
  const results = [
    { itemId: "a", level: "easy", gaps: [gap("river", true), gap("flood", true), gap("road", false)] },
    { itemId: "b", level: "easy", gaps: [gap("storm", true), gap("road", false), gap("rain", true, true)] }
  ];
  const summary = summarizeRound(results);
  assert.equal(summary.gapsTotal, 6);
  assert.equal(summary.gapsCorrect, 3, "a hint-assisted word is not counted");
  assert.equal(summary.stars, 1);
  assert.equal(summary.bestCombo, 2);
  assert.deepEqual(summary.hardestWords, ["road", "rain"]);
  assert.equal(summarizeRound([{ itemId: "x", level: "easy", gaps: [gap("a", true), gap("b", true)] }]).stars, 3);
  assert.equal(summarizeRound([{ itemId: "x", level: "easy", gaps: [gap("a", true), gap("b", true), gap("c", true), gap("d", false)] }]).stars, 2);
  assert.equal(summarizeRound([]).stars, 0);
  assert.deepEqual(mistakeItems(results), [{ itemId: "a", onlyGaps: [0] }, { itemId: "b", onlyGaps: [0, 0] }]);
});

test("speaking comparison: highlights missed words, ignores case and punctuation, never grades", () => {
  const full = compareSpoken("The river has flooded the road.", "the river has flooded the road");
  assert.equal(full.score, 100);
  assert.ok(full.words.every(word => word.status === "hit"));
  const partial = compareSpoken("The river has flooded the road.", "the river flooded road");
  assert.deepEqual(partial.words.filter(word => word.status === "miss").map(word => word.word), ["has", "the"]);
  assert.equal(partial.hits, 4);
  assert.equal(partial.score, 67);
  const wrong = compareSpoken("We have left.", "we have lift");
  assert.deepEqual(wrong.words.map(word => word.status), ["hit", "hit", "miss"]);
  assert.deepEqual(compareSpoken("Hello there.", "hello big there").extra, ["big"]);
  assert.equal(compareSpoken("Hello.", "").score, 0);
  assert.equal(compareSpoken("", "anything").total, 0);
  assert.equal(compareSpoken("The colour red.", "the color red").score, 100, "UK/US spelling is accepted");
});

// ---- audio: voice choice and the generation pipeline ----------------------------------------------------------

import { pickBritishVoice, wordIndexAt } from "../js/listening/audio.js";
import { azureRequest, buildRequest, buildSsml, elevenLabsRequest, estimateWordTimings, googleRequest, loudnormArgs, slowArgs, withinBudget } from "../scripts/tts-providers.mjs";
import { spawnSync } from "node:child_process";

test("voice choice prefers a British neural voice and matches the character's gender", () => {
  const voices = [
    { name: "Microsoft David - English (United States)", lang: "en-US" },
    { name: "Google UK English Male", lang: "en-GB" },
    { name: "Microsoft Sonia Online (Natural) - English (United Kingdom)", lang: "en-GB", localService: false },
    { name: "Microsoft Ryan Online (Natural) - English (United Kingdom)", lang: "en-GB", localService: false },
    { name: "Anna", lang: "de-DE" }
  ];
  assert.match(pickBritishVoice(voices, "nora").name, /Sonia/);
  assert.match(pickBritishVoice(voices, "arthur").name, /Ryan/);
  assert.match(pickBritishVoice(voices.slice(0, 2), "nora").name, /Google UK English Male/, "a British voice beats an American one even with the wrong gender");
  assert.match(pickBritishVoice([voices[0]], "nora").name, /David/, "any English voice is better than none");
  assert.equal(pickBritishVoice([voices[4]], "nora"), null);
  assert.equal(pickBritishVoice([], "nora"), null);
  assert.equal(pickBritishVoice(undefined), null);
  assert.match(pickBritishVoice([{ name: "x", lang: "en_GB" }, { name: "y", lang: "en-US" }]).name, /x/, "en_GB spelling is understood");
});

test("speech boundary character index maps to the right word", () => {
  const text = "The river has flooded.";
  assert.equal(wordIndexAt(text, 0), 0);
  assert.equal(wordIndexAt(text, 4), 1);
  assert.equal(wordIndexAt(text, 8), 1);
  assert.equal(wordIndexAt(text, 10), 2);
  assert.equal(wordIndexAt(text, 14), 3);
  assert.equal(wordIndexAt(text, 99), 3);
});

test("TTS requests: SSML is escaped and British, slow means -25%, keys only travel in headers or the provider URL", () => {
  const ssml = buildSsml('Tom & "Jerry" <run>', "en-GB-SoniaNeural", 0.75);
  assert.match(ssml, /xml:lang="en-GB"/);
  assert.match(ssml, /rate="-25%"/);
  assert.ok(ssml.includes("Tom &amp; &quot;Jerry&quot; &lt;run&gt;"), "text is escaped");
  assert.match(buildSsml("x", "v", 1), /rate="\+0%"/);
  const azure = azureRequest({ text: "Hello", voice: "en-GB-RyanNeural", region: "uksouth", key: "SECRET", rate: 1 });
  assert.equal(azure.url, "https://uksouth.tts.speech.microsoft.com/cognitiveservices/v1");
  assert.equal(azure.init.headers["Ocp-Apim-Subscription-Key"], "SECRET");
  assert.ok(!azure.url.includes("SECRET"));
  assert.throws(() => azureRequest({ text: "x", voice: "v", region: "evil.com/x", key: "k" }), /TTS_REGION/);
  const google = googleRequest({ text: "Hello", voice: "en-GB-Neural2-A", key: "K E Y", rate: 0.75 });
  assert.ok(google.url.endsWith("key=K%20E%20Y"));
  assert.equal(JSON.parse(google.init.body).audioConfig.speakingRate, 0.75);
  assert.equal(JSON.parse(google.init.body).voice.languageCode, "en-GB");
  const eleven = elevenLabsRequest({ text: "Hi", voice: "abc", key: "K" });
  assert.equal(eleven.init.headers["xi-api-key"], "K");
  assert.ok(!eleven.url.includes("K="));
  assert.throws(() => buildRequest("robot", {}), /Unknown TTS_PROVIDER/);
  assert.deepEqual(slowArgs("a.mp3", "b.mp3").filter(arg => arg.startsWith("atempo")), ["atempo=0.75"]);
  assert.ok(loudnormArgs("a.mp3", "b.mp3").includes("loudnorm=I=-16:TP=-1.5:LRA=11"));
});

test("estimated word timings cover the audio, stay in order and are always flagged by the script", () => {
  const timings = estimateWordTimings("The river has flooded the main road again.", 3.2);
  assert.equal(timings.length, 8);
  assert.equal(timings[0].start, 0);
  assert.ok(Math.abs(timings.at(-1).end - 3.2) < 0.01);
  for (let index = 1; index < timings.length; index++) assert.ok(timings[index].start >= timings[index - 1].end - 0.002);
  assert.ok(timings.every(timing => timing.end > timing.start));
  assert.equal(withinBudget(60 * 1024), true);
  assert.equal(withinBudget(60 * 1024 + 1), false);
  const source = readFileSync(fileURLToPath(new URL("../scripts/generate-listening-audio.mjs", import.meta.url)), "utf8");
  assert.match(source, /timingsEstimated = true/);
});

test("the audio script refuses to run without a key and writes nothing", () => {
  const env = { ...process.env }; delete env.TTS_KEY; delete env.TTS_PROVIDER;
  const run = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/generate-listening-audio.mjs", import.meta.url)), fileURLToPath(new URL("../content/listening/sabina.json", import.meta.url))], { env, encoding: "utf8" });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /NEEDS KEY/);
  assert.equal(JSON.parse(readFileSync(fileURLToPath(new URL("../content/listening/sabina.json", import.meta.url)), "utf8")).items[0].audio, undefined, "no audio is faked");
});
