import assert from "node:assert/strict";
import test from "node:test";
import { addProtectedClipAnswers, clipEmbedUrl, validateClip } from "../js/clips/schema.js";
import { clipWarnings, isInteractive, migrateV1, stripAnswers, validateClipV2 } from "../js/clips/schema-v2.js";
import { activeLineIndex, formatTime, lineProblems, nextStampStart, parseTime, previousTarget, tick } from "../js/clips/lines.js";
import { autoExercises, gapAnswers, gapView, gradeExercise, moveItem, orderView, summarise, suggestHide } from "../js/clips/exercises.js";
import { ERROR_TEXT, POLL_MS, createClipPlayer } from "../js/clips/player.js";

const line = (id, start, end, text, speaker) => ({ id, start, end, text, ...(speaker ? { speaker } : {}) });
const goodClip = () => ({
  schemaVersion: 2, id: "demo-clip", title: "Demo", level: "B1", genre: ["cartoon"], grammarPoints: ["past simple"],
  source: { provider: "youtube", videoId: "4PXj7bOD7IY", sourceUrl: "https://www.youtube.com/watch?v=4PXj7bOD7IY", channel: "Channel", videoTitle: "Title", rights: "official-embed", attribution: "Title, Channel (official video)", reviewedAt: "2026-11-01" },
  startSeconds: 10, endSeconds: 70, transcriptType: "original", transcriptNote: "Original text written by the teacher.", timingVerified: true,
  transcript: [
    line("l1", 10, 16, "The river rose quickly last night.", "Anna"), line("l2", 16, 22, "Did the water reach the road?", "Ben"), line("l3", 22, 28, "Yes, and the shops closed early.", "Anna"),
    line("l4", 28, 34, "Everyone waited for the rain to stop.", "Ben"), line("l5", 34, 40, "Then the volunteers brought sandbags.", "Anna"), line("l6", 40, 46, "They worked until the morning came.", "Ben"),
    line("l7", 46, 52, "By noon the water had gone down.", "Anna"), line("l8", 52, 58, "The town was safe again.", "Ben")
  ],
  vocabulary: [{ word: "sandbags", meaning: "bags of sand used to stop water", lineId: "l5" }],
  exercises: [
    { id: "g1", type: "gist", prompt: "What is the clip about?", options: ["a flood", "a party"], answer: "a flood" },
    { id: "gap", type: "line-gap", prompt: "Fill the gaps.", lineId: "l1", hide: [1, 3] },
    { id: "dic", type: "dictation", prompt: "Type the line.", lineId: "l3" },
    { id: "ord", type: "order-lines", prompt: "Order the lines.", lineIds: ["l1", "l2", "l3"], answer: ["l1", "l2", "l3"] },
    { id: "who", type: "who-said", prompt: "Who said it?", lineIds: ["l1", "l2"], speakers: ["Anna", "Ben"] },
    { id: "sh", type: "shadowing", prompt: "Say it.", lineId: "l1" },
    { id: "gs", type: "grammar-spotter", prompt: "Tap the past simple verbs.", target: "past simple", lineIds: ["l1", "l3"], answer: ["l1:2", "l3:3"] },
    { id: "pr", type: "production", prompt: "Write about it.", minWords: 10 }
  ]
});
const bad = (change, pattern) => { const clip = goodClip(); change(clip); assert.throws(() => validateClip(clip), pattern); };

test("a complete version 2 clip validates and is interactive", () => {
  const clip = validateClip(goodClip());
  assert.equal(isInteractive(clip), true);
  assert.deepEqual(clipWarnings(clip, Date.parse("2026-11-09")), [], "no warnings for a healthy clip");
});

test("the validator explains what is wrong with sources, windows and rights", () => {
  bad(c => { c.source.rights = "ripped"; }, /rights must be one of/);
  bad(c => { c.source.rights = "CC-BY"; }, /licence/);
  bad(c => { c.source.videoId = "short"; }, /videoId/);
  bad(c => { c.source.sourceUrl = "https://example.com/x"; }, /sourceUrl/);
  bad(c => { c.source.provider = "vimeo"; }, /provider/);
  bad(c => { c.endSeconds = 15; }, /10 to 90 seconds/);
  bad(c => { c.endSeconds = 150; }, /10 to 90 seconds/);
  bad(c => { c.level = "Z9"; }, /CEFR/);
  bad(c => { c.source.reviewedAt = "yesterday"; }, /reviewedAt/);
  bad(c => { delete c.timingVerified; }, /timingVerified/);
  bad(c => { c.transcriptNote = ""; }, /transcriptNote/);
});

test("verbatim captions are refused unless a licence allows them", () => {
  bad(c => { c.transcriptType = "verbatim-captions"; }, /licence/);
  const licensed = goodClip(); licensed.transcriptType = "verbatim-captions"; licensed.licence = "CC BY 4.0 https://creativecommons.org/licenses/by/4.0/";
  assert.doesNotThrow(() => validateClip(licensed));
  bad(c => { c.transcriptType = "copied"; }, /transcriptType must be/);
});

test("a link-out source is allowed without a video id, but needs https and a where note", () => {
  const link = goodClip(); link.source = { provider: "link", url: "https://example.com/watch", where: "Scene at 12:30 to 13:10", channel: "Studio", videoTitle: "Film", rights: "official-embed", attribution: "Film, Studio", reviewedAt: "2026-11-01" };
  assert.doesNotThrow(() => validateClip(link));
  assert.throws(() => clipEmbedUrl(link), /Only YouTube/);
  bad(c => { c.source = { ...link.source, url: "http://example.com" }; }, /https/);
  bad(c => { c.source = { ...link.source, where: "" }; }, /where/);
});

test("line times must sit inside the window, increase and not overlap", () => {
  bad(c => { c.transcript[0].start = 5; }, /outside the clip window/);
  bad(c => { c.transcript[2].end = 80; }, /outside the clip window/);
  bad(c => { c.transcript[1].start = 12; }, /overlaps/);
  bad(c => { c.transcript[1].end = 16; }, /must end after it starts/);
  bad(c => { c.transcript[1].id = "l1"; }, /unique id/);
  bad(c => { c.transcript[0].text = ""; }, /needs text/);
  bad(c => { c.transcript = []; }, /at least one transcript line/);
  bad(c => { c.transcript[0].start = "10"; }, /numeric/);
});

test("exercises must point at real lines and keep answers out of public drafts", () => {
  bad(c => { c.exercises[1].lineId = "nope"; }, /not a line of this clip/);
  bad(c => { c.exercises[3].lineIds = ["l1", "l2", "ghost"]; }, /not a line/);
  bad(c => { c.exercises[3].answer = ["l1", "l2"]; }, /each line once/);
  bad(c => { c.exercises[0].answer = "a nap"; }, /one of the options/);
  bad(c => { c.exercises[4].speakers = ["Anna"]; }, /two speakers/);
  bad(c => { c.exercises[6].answer = ["l2:1"]; }, /lineId:wordNumber|answer entries/);
  bad(c => { c.exercises[1].hide = [-1]; }, /word positions/);
  bad(c => { c.exercises.push({ id: "g1", type: "gist", prompt: "x", options: ["a", "b"], answer: "a" }); }, /unique id/);
  bad(c => { c.exercises[0].type = "magic"; }, /unknown type/);
  bad(c => { c.vocabulary[0].lineId = "ghost"; }, /does not exist/);
  const draft = stripAnswers(goodClip());
  assert.doesNotThrow(() => validateClip(draft, { requireAnswers: false }));
  assert.throws(() => validateClip(goodClip(), { requireAnswers: false }), /public drafts must not contain answer keys/);
  assert.throws(() => validateClip(draft), /needs its answer key/);
});

test("warnings tell the teacher about old reviews, thin transcripts and few exercise types", () => {
  const old = goodClip(); old.source.reviewedAt = "2025-01-01";
  assert.ok(clipWarnings(old, Date.parse("2026-11-09")).some(w => /12 months/.test(w)));
  const unchecked = goodClip(); unchecked.timingVerified = false;
  assert.ok(clipWarnings(unchecked, Date.parse("2026-11-09")).some(w => /not been checked/.test(w)));
  assert.equal(isInteractive(unchecked), false);
  const thin = goodClip(); thin.transcript = thin.transcript.slice(0, 3); thin.exercises = thin.exercises.slice(0, 2);
  const warnings = clipWarnings(thin, Date.parse("2026-11-09"));
  assert.ok(warnings.some(w => /at least 8 transcript lines/.test(w)) && warnings.some(w => /four kinds/.test(w)));
});

test("migrating a version 1 clip gives a valid version 2 clip with unverified timing", () => {
  const v1 = { schemaVersion: 1, id: "old-clip", title: "Old", level: "A2", genre: ["cartoon"], grammarPoints: ["x"], vocabularyThemes: ["y"],
    source: { provider: "youtube", videoId: "4PXj7bOD7IY", channel: "C", videoTitle: "T", sourceUrl: "https://www.youtube.com/watch?v=4PXj7bOD7IY", rights: "official-embed", reviewedAt: "2026-11-01" },
    startSeconds: 0, endSeconds: 30, transcriptType: "teacher-created", transcriptNote: "Original practice text.",
    transcript: [{ id: "a", startSeconds: 0, endSeconds: 15, text: "A line.", translation: "t" }], vocabulary: [{ word: "w", translation: "t", definition: "d" }],
    exercises: [{ id: "q", type: "check-understanding", prompt: "p", options: ["a", "b"] }] };
  const clip = migrateV1(v1);
  assert.doesNotThrow(() => validateClipV2(clip, { requireAnswers: false }));
  assert.equal(clip.timingVerified, false); assert.equal(clip.transcriptType, "original"); assert.equal(clip.exercises[0].type, "gist"); assert.equal(clip.vocabulary[0].meaning, "d");
  assert.deepEqual(migrateV1(v1), clip, "migration is repeatable");
  assert.throws(() => addProtectedClipAnswers(clip, { wrong: "a" }), /must match/);
  assert.doesNotThrow(() => addProtectedClipAnswers(clip, { q: "a" }));
});

// ---- timing helpers ---------------------------------------------------------------------------------------------------------
test("the active line follows the playback time, holds through gaps and is empty before the first line", () => {
  const lines = [line("a", 5, 8, "x"), line("b", 10, 14, "y"), line("c", 14, 20, "z")];
  assert.equal(activeLineIndex(lines, 4), -1); assert.equal(activeLineIndex(lines, 5), 0); assert.equal(activeLineIndex(lines, 9), 0, "a gap keeps the previous line");
  assert.equal(activeLineIndex(lines, 10), 1); assert.equal(activeLineIndex(lines, 14), 2); assert.equal(activeLineIndex(lines, 999), 2);
  assert.equal(activeLineIndex([], 3), -1); assert.equal(activeLineIndex(lines, NaN), -1);
});

test("previous line goes to the start of this line unless you are near it, next stops at the last", () => {
  const lines = [line("a", 0, 5, "x"), line("b", 5, 10, "y"), line("c", 10, 15, "z")];
  assert.equal(previousTarget(lines, 8), 1, "well into a line: restart it");
  assert.equal(previousTarget(lines, 5.5), 0, "just after it began: the one before");
  assert.equal(previousTarget(lines, 0.5), 0);
  assert.equal(previousTarget(lines, -1), 0);
});

test("the playback tick loops a line, stops at the end and reports the line otherwise", () => {
  const lines = [line("a", 0, 5, "x"), line("b", 5, 10, "y")];
  assert.deepEqual(tick({ lines, time: 4.99, start: 0, end: 10, loopLine: 0 }), { action: "seek", to: 0, index: 0 });
  assert.equal(tick({ lines, time: 9.9, start: 0, end: 10 }).action, "stop");
  assert.deepEqual(tick({ lines, time: 6, start: 0, end: 10 }), { action: "line", index: 1 });
  assert.equal(tick({ lines, time: 3, start: 0, end: 10, loopLine: 1 }).action, "line", "looping line 1 does nothing while we are before it");
});

test("times format and parse for the authoring tool and lines are checked in words", () => {
  assert.equal(formatTime(65.25), "1:05.3"); assert.equal(formatTime(-3), "0:00.0");
  assert.equal(parseTime("1:05"), 65); assert.equal(parseTime("12.5"), 12.5); assert.equal(parseTime("abc"), null); assert.equal(parseTime(""), null); assert.equal(parseTime("1:2:3"), null);
  const problems = lineProblems([line("a", 0, 5, "x"), line("b", 4, 8, "y"), line("c", 9, 8, "z"), line("d", 50, 60, "w")], 0, 30);
  assert.ok(problems.some(p => /Line 2 overlaps/.test(p)) && problems.some(p => /Line 3 ends before/.test(p)) && problems.some(p => /Line 4 is outside/.test(p)));
  assert.equal(nextStampStart([line("a", 3, 7, "x")], 0), 7); assert.equal(nextStampStart([], 12), 12);
});

// ---- exercises ---------------------------------------------------------------------------------------------------------------
test("gap fill: words are hidden, answers come from the line and typos are not forgiven", () => {
  const clip = goodClip(); const ex = clip.exercises[1];
  const view = gapView(clip, ex);
  assert.equal(view.filter(part => part.gap).length, 2); assert.equal(view[1].gap, true); assert.equal(view[1].length, 5);
  assert.deepEqual(gapAnswers(clip, ex), ["river", "quickly"], "hide positions 1 and 3");
  assert.equal(gradeExercise(clip, ex, ["River", "quickly"]).correct, true, "case does not matter");
  const partly = gradeExercise(clip, ex, ["river", "quick"]); assert.equal(partly.correct, false); assert.equal(partly.score, 1);
  assert.equal(gradeExercise(clip, ex, []).score, 0);
});

test("dictation compares word by word and notices extra words", () => {
  const clip = goodClip(); const ex = clip.exercises[2];
  assert.equal(gradeExercise(clip, ex, "yes and the shops closed early").correct, true, "punctuation and case are forgiven");
  const wrong = gradeExercise(clip, ex, "Yes, and the shop closed early"); assert.equal(wrong.correct, false); assert.equal(wrong.score, 5);
  assert.equal(gradeExercise(clip, ex, "Yes, and the shops closed early now").correct, false);
  assert.equal(gradeExercise(clip, ex, "").score, 0);
});

test("order the lines: shuffles without starting solved, grades positions, and reordering works", () => {
  const clip = goodClip(); const ex = clip.exercises[3];
  const view = orderView(ex, "s"); assert.deepEqual([...view].sort(), ["l1", "l2", "l3"]); assert.notDeepEqual(view, ["l1", "l2", "l3"]); assert.deepEqual(orderView(ex, "s"), view);
  assert.equal(gradeExercise(clip, ex, ["l1", "l2", "l3"]).correct, true);
  const swapped = gradeExercise(clip, ex, ["l2", "l1", "l3"]); assert.equal(swapped.correct, false); assert.equal(swapped.score, 1);
  assert.deepEqual(moveItem(["a", "b", "c"], 0, 2), ["b", "c", "a"]); assert.deepEqual(moveItem(["a", "b"], 5, 0), ["a", "b"]);
});

test("who said it, grammar spotter, gist, production and the unscored types", () => {
  const clip = goodClip();
  assert.equal(gradeExercise(clip, clip.exercises[4], { l1: "Anna", l2: "Ben" }).correct, true);
  assert.equal(gradeExercise(clip, clip.exercises[4], { l1: "Ben", l2: "Ben" }).score, 1);
  const spot = clip.exercises[6];
  assert.equal(gradeExercise(clip, spot, ["l1:2", "l3:3"]).correct, true);
  const sloppy = gradeExercise(clip, spot, ["l1:2", "l1:0"]); assert.equal(sloppy.correct, false); assert.deepEqual(sloppy.missed, ["l3:3"]); assert.equal(sloppy.wrong, 1);
  assert.equal(gradeExercise(clip, clip.exercises[0], "a flood").correct, true); assert.equal(gradeExercise(clip, clip.exercises[0], "a party").correct, false);
  const essay = gradeExercise(clip, clip.exercises[7], "The river rose and the town closed the shops for a day."); assert.equal(essay.scored, false); assert.equal(essay.enough, true);
  assert.equal(gradeExercise(clip, clip.exercises[7], "Too short").enough, false);
  assert.equal(gradeExercise(clip, clip.exercises[5], { heard: "x" }).scored, false, "shadowing is coaching");
});

test("a clip lesson is summed from scored exercises only, misses become review items, essays wait for the teacher", () => {
  const clip = goodClip();
  const done = summarise(clip, { g1: "a party", gap: ["river", "quickly"], dic: "yes", ord: ["l1", "l2", "l3"], pr: "I think the story is about a flood and a town.", sh: {} });
  assert.equal(done.pending, 1);
  assert.equal(done.total, 1 + 2 + 6 + 3, "gist 1 + gaps 2 + dictation 6 words + order 3");
  assert.deepEqual(done.mistakes.map(m => m.itemId), ["demo-clip:g1", "demo-clip:dic"]);
  assert.ok(done.mistakes.every(m => m.topic.startsWith("Clip: ") && m.prompt && m.answer));
  assert.deepEqual(summarise(clip, {}), { score: 0, total: 0, mistakes: [], pending: 0 });
});

test("exercises can be suggested from the lines so teachers do not write them by hand", () => {
  assert.deepEqual(suggestHide("The river rose quickly last night."), [1, 3, 5], "the three longest content words");
  assert.deepEqual(suggestHide("It is a to be"), [], "short function words are never blanked");
  const clip = goodClip(); const made = autoExercises(clip);
  assert.ok(made.length >= 5);
  const candidate = { ...clip, exercises: made };
  assert.doesNotThrow(() => validateClip(candidate), "suggested exercises are valid");
  assert.deepEqual(autoExercises({ transcript: [] }).map(e => e.type), ["production"]);
});

// ---- the player wrapper, with a fake YouTube player ----------------------------------------------------------------------------
function fakeYT() {
  const made = [];
  class Player {
    constructor(target, options) { this.options = options; this.time = options.playerVars.start; this.state = -1; this.rate = 1; this.calls = []; made.push(this); queueMicrotask(() => options.events.onReady()); }
    getCurrentTime() { return this.time; } getPlayerState() { return this.state; }
    playVideo() { this.calls.push("play"); this.state = 1; this.options.events.onStateChange({ data: 1 }); }
    pauseVideo() { this.calls.push("pause"); this.state = 2; this.options.events.onStateChange({ data: 2 }); }
    seekTo(t) { this.calls.push(`seek:${t}`); this.time = t; }
    setPlaybackRate(r) { this.rate = r; } destroy() { this.destroyed = true; }
  }
  return { YT: { Player }, made };
}

test("the player uses the privacy domain, never autoplays, and reports ready, lines and the end", async t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const { YT, made } = fakeYT(); const events = [];
  const api = createClipPlayer({ clip: goodClip(), target: "x", YT, origin: "https://site.test", whenLine: i => events.push(`line:${i}`), whenState: s => events.push(`state:${s}`) });
  await Promise.resolve();
  const fake = made[0];
  assert.equal(fake.options.host, "https://www.youtube-nocookie.com"); assert.equal(fake.options.playerVars.autoplay, 0); assert.equal(fake.options.playerVars.start, 10); assert.equal(fake.options.playerVars.end, 70); assert.equal(fake.options.playerVars.origin, "https://site.test");
  assert.equal(api.ready, true);
  api.play(); fake.time = 18; t.mock.timers.tick(POLL_MS); assert.ok(events.includes("line:1"), "the line under the playhead is reported");
  fake.time = 69.95; t.mock.timers.tick(POLL_MS);
  assert.ok(events.includes("state:ended")); assert.ok(fake.calls.includes("pause")); assert.equal(fake.time, 10, "it returns to the start of the window");
  api.destroy(); assert.equal(fake.destroyed, true);
});

test("loop a line, change speed, move by line, and refuse to loop when the timing is not verified", t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const { YT, made } = fakeYT(); const clip = goodClip();
  const api = createClipPlayer({ clip, target: "x", YT }); const fake = made[0];
  assert.equal(api.loop(2), true); assert.equal(api.loopLine, 2); assert.ok(fake.calls.includes("seek:22"));
  fake.time = 27.97; t.mock.timers.tick(POLL_MS); assert.equal(fake.time, 22, "back to the start of the looped line");
  assert.equal(api.loop(2), false, "the same line again turns looping off");
  api.setSpeed(0.5); assert.equal(fake.rate, 0.5); api.setSpeed(2); assert.equal(fake.rate, 0.5, "only the offered speeds");
  fake.time = 30; api.nextLine(); assert.ok(fake.calls.includes("seek:34"));
  fake.time = 44; api.previousLine(); assert.ok(fake.calls.includes("seek:40"), "restart the current line");
  api.toggle(); assert.ok(["play", "pause"].includes(fake.calls[fake.calls.length - 1]));
  const unverified = goodClip(); unverified.timingVerified = false;
  const plain = createClipPlayer({ clip: unverified, target: "x", YT: fakeYT().YT });
  assert.equal(plain.loop(0), false, "no looping against unchecked timing");
});

test("player errors become plain messages and a failed API load does not crash", () => {
  const errors = [];
  class Boom { constructor() { throw new Error("blocked by network"); } }
  createClipPlayer({ clip: goodClip(), target: "x", YT: { Player: Boom }, whenError: e => errors.push(e.message) });
  assert.deepEqual(errors, ["blocked by network"]);
  assert.match(ERROR_TEXT[101], /does not allow/); assert.match(ERROR_TEXT[100], /removed or made private/);
  let handler; const { made } = (() => { const f = fakeYT(); return f; })();
  const f = fakeYT(); const seen = [];
  createClipPlayer({ clip: goodClip(), target: "x", YT: f.YT, whenError: e => seen.push(e) });
  f.made[0].options.events.onError({ data: 150 });
  assert.equal(seen[0].code, 150); assert.match(seen[0].message, /does not allow/);
  void handler; void made;
});
