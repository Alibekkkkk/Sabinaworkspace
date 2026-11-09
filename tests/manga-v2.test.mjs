import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { addProtectedMangaAnswers, validateManga } from "../js/manga/schema.js";
import { ALLOWED_IMAGE_HOSTS, mangaWarnings, migrateV1, secretQuestions, stripAnswers, validateMangaV2 } from "../js/manga/schema-v2.js";
import { bboxInside, bboxWithin, bubbleAt, hotspotStyle, isBox, orderPanels, panelFrame } from "../js/manga/geometry.js";
import { clampPosition, defaultMode, effectiveDirection, keyDelta, loadPosition, normalisePrefs, panelSteps, panelsOf, positionKey, savePosition, step } from "../js/manga/reader-state.js";
import { bareWord, bossGame, chapterRecord, checkQuestion, checkQuick, fillBubble, preReadingWords, rubricFeedback, stars, whoSaid, wordKey } from "../js/manga/learning.js";
import { chooseAdaptation, recentAccuracy } from "../js/manga/adaptation.js";
import { chapterShelf, earnedBadges, nextChapter, teacherRows } from "../js/manga/shelf.js";
import { evaluateGame } from "../js/games/engine.js";

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const demo = read("../content/manga/gaziz-demo.json");
const answerKeys = read("../docs/manga/gaziz-demo.answers.json")["gaziz-demo"];
const full = () => addProtectedMangaAnswers(structuredClone(demo), answerKeys);
const publicCopy = () => structuredClone(demo);
const check = (change, pattern) => { const copy = publicCopy(); change(copy); assert.throws(() => validateMangaV2(copy, { requireAnswers: false }), pattern); };

// ---- the shipped story --------------------------------------------------------------------------------------------------------------------
test("the demo story is version 2, original and has no soft problems", () => {
  assert.equal(demo.schemaVersion, 2);
  assert.doesNotThrow(() => validateManga(demo, { requireAnswers: false }));
  assert.deepEqual(mangaWarnings(full()), []);
  assert.equal(demo.credits.rights, "original");
  assert.ok(demo.credits.author && demo.credits.artist && demo.credits.licence);
});

test("every page image of the demo exists, is small, and is a local file", () => {
  for (const chapter of demo.chapters) for (const page of chapter.pages) {
    assert.match(page.image, /^assets\/manga\/[a-z0-9-]+\.svg$/);
    const path = new URL(`../${page.image}`, import.meta.url);
    assert.ok(existsSync(path), `${page.image} is missing`);
    assert.ok(readFileSync(path).length <= 250 * 1024, `${page.image} is over 250 kB`);
    assert.ok(page.alt.length > 20, "alt text describes the page");
  }
});

test("public drafts carry no answers; protected records carry exactly the secret ones", () => {
  for (const chapter of demo.chapters) for (const question of chapter.questions) for (const key of ["answer", "answers"]) assert.equal(Object.hasOwn(question, key), false);
  const secret = secretQuestions(demo).map(question => question.id).sort();
  assert.deepEqual(Object.keys(answerKeys).sort(), secret);
  const protectedStory = full();
  assert.doesNotThrow(() => validateMangaV2(protectedStory));
  assert.deepEqual(stripAnswers(protectedStory), demo);
  assert.throws(() => addProtectedMangaAnswers(demo, {}), /must match the questions/);
  assert.throws(() => addProtectedMangaAnswers(demo, { ...answerKeys, extra: "x" }), /must match the questions/);
  assert.throws(() => validateMangaV2(demo), /answer key/);
});

test("the import tool and the reader accept the same files", () => {
  const manifest = read("../content/manifest.json");
  const entry = Object.values(manifest).find(item => item.mangaFile);
  assert.equal(read(`../content/${entry.mangaFile}`).id, entry.mangaId);
});

// ---- validator fixtures ----------------------------------------------------------------------------------------------------------------------------
test("the validator names the thing that is wrong", () => {
  check(copy => { delete copy.credits; }, /credits block/);
  check(copy => { copy.credits.rights = "scanned"; }, /rights must be one of/);
  check(copy => { copy.credits.rights = "CC-BY"; delete copy.credits.sourceUrl; }, /source in credits.sourceUrl|https address/);
  check(copy => { copy.readingDirection = "diagonal"; }, /readingDirection/);
  check(copy => { copy.chapters[0].pages[0].alt = ""; }, /alt text/);
  check(copy => { copy.chapters[0].pages[0].image = "https://example.com/page.png"; }, /local file under assets\/manga/);
  check(copy => { copy.chapters[0].pages[0].image = "assets/manga/../secret.svg"; }, /local file under assets\/manga/);
  check(copy => { copy.chapters[0].pages[0].panels[0].bbox = [20, 20, 900, 380]; }, /must sit inside the image/);
  check(copy => { copy.chapters[0].pages[0].panels[0].bbox = [-5, 20, 100, 100]; }, /must sit inside the image/);
  check(copy => { copy.chapters[0].pages[0].panels[0].bubbles[0].at = [700, 40, 330, 110]; }, /inside its panel/);
  check(copy => { copy.chapters[0].pages[0].panels[0].summary = ""; }, /summary/);
  check(copy => { copy.chapters[0].pages[0].panels[0].bubbles[0].simplified = ""; }, /simplified/);
  check(copy => { copy.chapters[0].pages[0].panels[0].bubbles[0].type = "shout"; }, /type must be one of/);
});

test("ids are unique and every reference points at something real", () => {
  check(copy => { copy.chapters[0].pages[1].id = copy.chapters[0].pages[0].id; }, /unique ids/);
  check(copy => { copy.chapters[0].pages[0].panels[1].id = copy.chapters[0].pages[0].panels[0].id; }, /unique ids/);
  check(copy => { copy.chapters[0].pages[0].panels[1].bubbles[0].id = "b1"; }, /unique ids/);
  check(copy => { copy.chapters[1].id = copy.chapters[0].id; }, /unique ids/);
  check(copy => { copy.chapters[0].questions[1].id = copy.chapters[0].questions[0].id; }, /unique ids/);
  check(copy => { copy.chapters[1].questions[0].id = copy.chapters[0].questions[0].id; }, /unique ids/);
  check(copy => { copy.chapters[0].questions[2].bubbleId = "nope"; }, /not a bubble of this chapter/);
  check(copy => { copy.chapters[0].questions[2].panelId = "nope"; }, /not a panel of this chapter/);
  check(copy => { copy.chapters[0].boss.questionIds = ["q-main-idea", "q-share", "ghost"]; }, /boss needs/);
  check(copy => { copy.chapters[0].boss.questionIds = ["q-main-idea", "q-share", "q-wait"]; }, /not inference/);
  check(copy => { copy.chapters[0].pages[0].quick.bubbleId = "b9"; }, /bubble on this page/);
  check(copy => { copy.chapters[0].pages[0].quick.speakers = ["Aida"]; }, /at least two names/);
  check(copy => { copy.chapters[0].pages[1].quick.hide = [99]; }, /inside the bubble/);
  check(copy => { copy.chapters[0].questions[0].options = ["only one"]; }, /two options/);
  check(copy => { copy.chapters[0].questions[5].rubric = { minWords: 1, groups: [] }; }, /rubric/);
});

test("answer keys are checked against the options and kept out of public drafts", () => {
  const story = full();
  story.chapters[0].questions[0].answer = "something else";
  assert.throws(() => validateMangaV2(story), /one of the options/);
  const leaky = publicCopy(); leaky.chapters[0].questions[0].answer = "x";
  assert.throws(() => validateMangaV2(leaky, { requireAnswers: false }), /must not contain answer keys/);
  assert.equal(ALLOWED_IMAGE_HOSTS.length, 0, "no remote image host is allowed unless a teacher adds one on purpose");
});

test("soft warnings point at weak chapters", () => {
  const story = full(); story.chapters[0].vocabulary = story.chapters[0].vocabulary.slice(0, 3); delete story.chapters[0].retell; delete story.chapters[0].boss;
  const warnings = mangaWarnings(story);
  assert.ok(warnings.some(text => /6 to 8 words/.test(text)));
  assert.ok(warnings.some(text => /retell/.test(text)));
  assert.ok(warnings.some(text => /boss/.test(text)));
});

test("a version 1 story is migrated into a valid version 2 story", () => {
  const v1 = read("./fixtures/manga-v1.json");
  const protectedV1 = addProtectedMangaAnswers(v1, { "garden-purpose": "vegetables", "fill-bubble": "share", "chapter-boss": "They worked and shared food together." });
  const migrated = migrateV1(protectedV1);
  assert.doesNotThrow(() => validateMangaV2(migrated));
  assert.equal(migrated.chapters[0].pages.length, v1.chapters[0].panels.length);
  assert.equal(migrated.credits.rights, "original");
});

// ---- geometry ------------------------------------------------------------------------------------------------------------------------------------------------
test("boxes are checked against the image and against their panel", () => {
  assert.ok(isBox([0, 0, 10, 10])); assert.ok(!isBox([0, 0, 0, 10])); assert.ok(!isBox([0, 0, 10])); assert.ok(!isBox([0, 0, NaN, 10]));
  assert.ok(bboxInside([10, 10, 80, 80], 100, 100)); assert.ok(bboxInside([0, 0, 100, 100], 100, 100));
  assert.ok(!bboxInside([10, 10, 100, 80], 100, 100)); assert.ok(!bboxInside([-1, 0, 10, 10], 100, 100)); assert.ok(!bboxInside([0, 95, 10, 10], 100, 100));
  assert.ok(bboxWithin([20, 20, 30, 30], [10, 10, 100, 100])); assert.ok(!bboxWithin([5, 20, 30, 30], [10, 10, 100, 100])); assert.ok(!bboxWithin([20, 20, 100, 30], [10, 10, 100, 100]));
});

test("hotspots and panel frames are percentages of the page, so they scale with the image", () => {
  const page = { width: 800, height: 1200 };
  assert.deepEqual(hotspotStyle([80, 120, 400, 240], page), { left: "10%", top: "10%", width: "50%", height: "20%" });
  const frame = panelFrame([20, 420, 370, 380], page);
  assert.equal(frame.aspect, Math.round((370 / 380) * 1000) / 1000);
  assert.equal(frame.imageWidth, Math.round((800 / 370) * 100000) / 1000);
  assert.ok(frame.left < 0 && frame.top < 0, "the page image is pulled up and to the left so the panel fills the frame");
  // The bubble sits at the right place inside the zoomed frame: its offset from the panel corner, as a share of the panel.
  const bubble = [40, 440, 240, 90];
  const inFrame = (bubble[0] - 20) / 370 * 100; // left edge as a share of the panel
  const zoomed = (bubble[0] / 800) * frame.imageWidth + frame.left; // the same edge from the page percentage, the frame's offset and its zoom
  assert.ok(Math.abs(zoomed - inFrame) < 0.01);
});

test("panels are read in rows, left to right or right to left", () => {
  const panels = [{ id: "d", bbox: [0, 400, 400, 100] }, { id: "b", bbox: [410, 0, 390, 190] }, { id: "a", bbox: [0, 0, 400, 200] }, { id: "c", bbox: [0, 210, 800, 180] }];
  assert.deepEqual(orderPanels(panels, "ltr").map(p => p.id), ["a", "b", "c", "d"]);
  assert.deepEqual(orderPanels(panels, "rtl").map(p => p.id), ["b", "a", "c", "d"]);
  assert.deepEqual(orderPanels([], "ltr"), []);
});

test("a point finds the bubble under it", () => {
  const panels = [{ bubbles: [{ id: "x", at: [10, 10, 100, 50] }, { id: "y", at: [200, 10, 100, 50] }] }];
  assert.equal(bubbleAt(panels, 20, 20).id, "x"); assert.equal(bubbleAt(panels, 250, 60).id, "y"); assert.equal(bubbleAt(panels, 150, 20), null);
});

test("the demo's panels and bubbles all sit on their page", () => {
  for (const chapter of demo.chapters) for (const page of chapter.pages) for (const panel of page.panels) {
    assert.ok(bboxInside(panel.bbox, page.width, page.height), `${panel.id} is outside ${page.id}`);
    for (const bubble of panel.bubbles) assert.ok(bboxWithin(bubble.at, panel.bbox), `${bubble.id} is outside ${panel.id}`);
  }
});

// ---- reading position, modes and direction -----------------------------------------------------------------------------------------------
function memoryStorage() { const data = new Map(); return { getItem: key => (data.has(key) ? data.get(key) : null), setItem: (key, value) => { data.set(key, String(value)); } }; }
const chapter = demo.chapters[0];

test("a position is remembered per chapter and kept inside the chapter", () => {
  const storage = memoryStorage(); const key = positionKey("ANNA1", "gaziz-demo", "first-seeds");
  assert.equal(loadPosition(storage, key, chapter), null);
  savePosition(storage, key, { page: 2, panel: 1, mode: "panel" });
  assert.deepEqual(loadPosition(storage, key, chapter), { page: 2, panel: 1, mode: "panel" });
  assert.notEqual(positionKey("ANNA1", "gaziz-demo", "little-market"), key);
  assert.deepEqual(clampPosition({ page: 99, panel: 99, mode: "flip" }, chapter), { page: 2, panel: 2, mode: "flip" });
  assert.deepEqual(clampPosition({ page: -3, panel: -1, mode: "bogus" }, chapter), { page: 0, panel: 0, mode: "" });
  assert.deepEqual(clampPosition(null, chapter), { page: 0, panel: 0, mode: "" });
  storage.setItem(key, "not json"); assert.equal(loadPosition(storage, key, chapter), null, "damaged data is ignored");
  assert.doesNotThrow(() => savePosition({ setItem() { throw new Error("full"); } }, key, { page: 0, panel: 0, mode: "flip" }), "storage errors never break reading");
});

test("scroll, page flip and panel modes move through the chapter", () => {
  let position = { page: 0, panel: 0, mode: "flip" };
  let moved = step(chapter, position, 1); assert.deepEqual(moved.position, { page: 1, panel: 0, mode: "flip" }); assert.equal(moved.edge, "");
  assert.equal(step(chapter, position, -1).edge, "start");
  assert.equal(step(chapter, { page: 2, panel: 0, mode: "flip" }, 1).edge, "end");
  // panel mode crosses page edges in reading order
  position = { page: 0, panel: 3, mode: "panel" };
  moved = step(chapter, position, 1); assert.deepEqual([moved.position.page, moved.position.panel], [1, 0]);
  moved = step(chapter, { page: 1, panel: 0, mode: "panel" }, -1); assert.deepEqual([moved.position.page, moved.position.panel], [0, 3]);
  assert.equal(step(chapter, { page: 2, panel: 2, mode: "panel" }, 1).edge, "end");
  assert.equal(step(chapter, { page: 0, panel: 0, mode: "panel" }, -1).edge, "start");
  assert.equal(panelSteps(chapter, "ltr").length, chapter.pages.reduce((sum, page) => sum + page.panels.length, 0));
  // switching mode keeps the page
  const switched = { ...{ page: 1, panel: 0, mode: "flip" }, mode: "panel" };
  assert.equal(step(chapter, switched, 0).position.page, 1);
});

test("reading direction decides what the arrow keys do and how panels are ordered", () => {
  assert.equal(keyDelta("ArrowRight", "ltr", "flip"), 1); assert.equal(keyDelta("ArrowLeft", "ltr", "flip"), -1);
  assert.equal(keyDelta("ArrowRight", "rtl", "flip"), -1); assert.equal(keyDelta("ArrowLeft", "rtl", "flip"), 1);
  assert.equal(keyDelta("ArrowDown", "ltr", "panel"), 1); assert.equal(keyDelta("PageUp", "rtl", "panel"), -1);
  assert.equal(keyDelta("ArrowRight", "ltr", "scroll"), 0, "scroll mode is left to the browser");
  assert.equal(keyDelta("a", "ltr", "flip"), 0);
  const rtl = panelsOf(demo.chapters[0].pages[0], "rtl"); const ltr = panelsOf(demo.chapters[0].pages[0], "ltr");
  assert.deepEqual(ltr.map(p => p.id), ["p1a", "p1b", "p1c", "p1d"]); assert.deepEqual(rtl.map(p => p.id), ["p1a", "p1c", "p1b", "p1d"]);
  assert.equal(effectiveDirection({ readingDirection: "ltr" }, { direction: "rtl" }), "rtl");
  assert.equal(effectiveDirection({ readingDirection: "rtl" }, { direction: "" }), "rtl");
  assert.equal(effectiveDirection({ readingDirection: "vertical" }, { direction: "rtl" }), "vertical", "a webtoon always reads downwards");
  assert.equal(defaultMode({ readingDirection: "vertical" }, {}), "scroll"); assert.equal(defaultMode({ readingDirection: "ltr" }, {}), "flip"); assert.equal(defaultMode({ readingDirection: "ltr" }, { mode: "panel" }), "panel");
  assert.deepEqual(normalisePrefs({ mode: "x", fontScale: 9, highContrast: "yes", direction: "rtl", translation: true }), { mode: "", direction: "rtl", fontScale: 1, highContrast: false, hideText: false, translation: true }, "translation is off unless the student turned it on");
});

// ---- learning loop ------------------------------------------------------------------------------------------------------------------------------------
test("pre-reading offers six to eight words, skipping the ones already known", () => {
  assert.equal(preReadingWords(chapter, 8).length, 8); assert.equal(preReadingWords(chapter, 6).length, 6);
  assert.equal(preReadingWords(chapter, 8, new Set([wordKey("rooftop")])).some(item => item.word === "rooftop"), false);
  assert.equal(wordKey("Fresh Tomatoes!"), "fresh-tomatoes");
});

test("fill the bubble hides the chosen words and offers them among a few others, in a fixed order", () => {
  const page = chapter.pages[1]; const quick = page.quick;
  const view = fillBubble(page, quick, chapter);
  assert.deepEqual(view.answers, ["seed"]);
  assert.equal(view.tokens.filter(token => token.hidden).length, 1);
  assert.ok(view.options.includes("seed") && view.options.length >= 3);
  assert.deepEqual(fillBubble(page, quick, chapter).options, view.options, "the same order every time");
  assert.equal(checkQuick(quick, page, chapter, ["seed"]), true); assert.equal(checkQuick(quick, page, chapter, ["Seed,"]), true); assert.equal(checkQuick(quick, page, chapter, ["soil"]), false);
  assert.equal(bareWord("“Hello,”"), "hello");
});

test("who said it checks the speaker and prediction questions have no wrong answer", () => {
  const page = chapter.pages[0]; const quick = page.quick;
  const view = whoSaid(page, quick); assert.equal(view.answer, "Marat"); assert.deepEqual([...view.options].sort(), ["Aida", "Marat"]);
  assert.equal(checkQuick(quick, page, chapter, "Marat"), true); assert.equal(checkQuick(quick, page, chapter, "Aida"), false);
  const predict = demo.chapters[1].pages[0].quick; assert.equal(checkQuick(predict, demo.chapters[1].pages[0], demo.chapters[1], predict.options[1]), null);
});

test("chapter questions: choices, short answers, and written answers that go to the teacher", () => {
  const protectedStory = full(); const questions = protectedStory.chapters[0].questions; const byId = id => questions.find(q => q.id === id);
  assert.equal(checkQuestion(byId("q-main-idea"), "Neighbours make a garden on a roof"), true); assert.equal(checkQuestion(byId("q-main-idea"), "A shop opens in the city"), false);
  assert.equal(checkQuestion(byId("q-seeds"), "tomato seeds"), true); assert.equal(checkQuestion(byId("q-seeds"), "Tomato seeds."), true); assert.equal(checkQuestion(byId("q-seeds"), "carrots"), false);
  assert.equal(checkQuestion(byId("q-where"), "On the roof"), true);
  assert.equal(checkQuestion(byId("q-wait"), "anything"), null, "inference answers are reviewed by the teacher");
  const rubric = byId("q-wait").rubric;
  assert.deepEqual([rubricFeedback("excited", rubric).enough, rubricFeedback("He is excited because he wants the plants to grow soon", rubric).enough], [false, true]);
  assert.deepEqual(rubricFeedback("He is excited because he wants the plants to grow soon", rubric).covered, [true, true]);
  assert.equal(rubricFeedback("", rubric).words, 0);
});

test("the boss reuses the Phase 5 boss battle and can be scored by the games engine", () => {
  const protectedStory = full(); const game = bossGame(protectedStory.chapters[0]);
  assert.equal(game.type, "boss-battle"); assert.match(game.id, /^[a-z0-9-]{1,60}$/); assert.equal(game.questions.length, 5);
  const typed = game.questions.find(q => q.id === "q-seeds"); assert.equal(typed.typed, true); assert.ok(typed.alternatives.length >= 1);
  const result = evaluateGame(game, { "q-main-idea": "Neighbours make a garden on a roof", "q-share": "Use something together", "q-seeds": "seeds", "q-closer": "It made them argue", "q-where": "the roof" });
  assert.deepEqual([result.score, result.total], [4, 5]);
  assert.equal(bossGame({ id: "x", title: "X", questions: [], boss: undefined }), null);
});

test("the saved record only goes up, keeps the best stars and fits the database rules", () => {
  const visit = (extra = {}) => ({ pagesRead: 1, seconds: 30, mode: "flip", words: 2, quick: { score: 1, total: 2 }, questions: { score: 3, total: 5 }, boss: null, retell: false, finished: false, ...extra });
  const first = chapterRecord(chapter, null, visit(), 1000);
  assert.deepEqual([first.pagesRead, first.pagesTotal, first.seconds, first.words, first.lastAt, first.completedAt], [1, 3, 30, 2, 1000, undefined]);
  assert.equal(first.stars, undefined, "no stars until the chapter is finished");
  const back = chapterRecord(chapter, first, visit({ pagesRead: 3, seconds: 90, words: 1 }), 2000);
  assert.deepEqual([back.pagesRead, back.seconds, back.words], [3, 120, 2]);
  const done = chapterRecord(chapter, back, visit({ pagesRead: 3, seconds: 10, finished: true, quick: { score: 2, total: 2 }, questions: { score: 5, total: 5 }, boss: { score: 5, total: 5, won: true }, retell: true }), 3000);
  assert.deepEqual([done.stars, done.attempts, done.completedAt, done.bossWon, done.retell, done.qScore, done.quickTotal], [3, 1, 3000, true, true, 5, 2]);
  const worse = chapterRecord(chapter, done, visit({ finished: true, quick: { score: 0, total: 2 }, questions: { score: 0, total: 5 }, boss: { score: 0, total: 5, won: false } }), 4000);
  assert.deepEqual([worse.stars, worse.attempts, worse.bossWon], [3, 2, true], "a bad second try never takes stars or the boss win away");
  assert.equal(chapterRecord(chapter, null, visit({ pagesRead: 99, seconds: 9e9 }), 1).pagesRead, 3, "pages are capped at the chapter length");
  assert.equal(chapterRecord(chapter, null, visit({ seconds: 9e9 }), 1).seconds, 8640000);
  const bossLater = chapterRecord(chapter, done, visit({ boss: { score: 4, total: 5, won: true } }), 5000);
  assert.equal(bossLater.bossScore, 4, "a boss fight after finishing is still recorded");
  assert.equal(chapterRecord({ ...chapter, title: "x".repeat(200) }, null, visit(), 1).title.length, 80);
  assert.deepEqual([stars(0.95), stars(0.75), stars(0.2)], [3, 2, 1]);
});

// ---- adaptation, shelf and teacher rows -------------------------------------------------------------------------------------------------------------------------
test("the adaptation selector gives Gaziz more help when the story is harder or the last chapters went badly", () => {
  const harder = chooseAdaptation({ storyLevel: "B1", studentLevel: "A2", accuracy: 0.9 });
  assert.deepEqual([harder.simplifiedFirst, harder.preReadingWords, harder.gap], [true, 8, 1]);
  assert.match(harder.reason, /above the student's level/);
  const matched = chooseAdaptation({ storyLevel: "A2", studentLevel: "A2", accuracy: 0.8 });
  assert.deepEqual([matched.simplifiedFirst, matched.preReadingWords, matched.next], [false, 7, "same"]);
  assert.equal(chooseAdaptation({ storyLevel: "A2", studentLevel: "A2", accuracy: 0.4 }).simplifiedFirst, true);
  assert.equal(chooseAdaptation({ storyLevel: "A2", studentLevel: "A2", accuracy: 0.4 }).next, "easier");
  const easy = chooseAdaptation({ storyLevel: "A1", studentLevel: "B1", accuracy: 0.95 });
  assert.deepEqual([easy.simplifiedFirst, easy.preReadingWords, easy.next, easy.hintsAfterWrong], [false, 6, "harder", 2]);
  const unknown = chooseAdaptation({});
  assert.deepEqual([unknown.simplifiedFirst, unknown.gap, unknown.next], [false, 0, "same"], "missing information changes nothing");
  assert.equal(recentAccuracy([]), null); assert.equal(recentAccuracy([{ score: 3, total: 4 }, { score: 1, total: 4 }]), 0.5);
  assert.equal(recentAccuracy([{ score: 9, total: 4 }]), 1, "scores are capped at the total");
});

test("the chapters shelf shows progress, due dates, stars and badges", () => {
  const now = Date.parse("2026-11-09T10:00:00Z"); const day = 86400000;
  const records = { "first-seeds": { lastAt: now, pagesRead: 3, pagesTotal: 3, completedAt: now, stars: 3, bossWon: true }, "little-market": { lastAt: now, pagesRead: 1, pagesTotal: 2 } };
  const shelf = chapterShelf(demo, records, { "little-market": { assignedAt: now, dueAt: now + 2 * day } }, now);
  assert.deepEqual(shelf.map(item => item.state), ["done", "reading"]);
  assert.deepEqual([shelf[0].stars, shelf[0].bossWon, shelf[1].percent, shelf[1].assigned], [3, true, 50, true]);
  assert.equal(shelf[1].due.state, "due-soon"); assert.match(shelf[1].due.label, /Due in 2 days/);
  assert.equal(nextChapter(shelf).id, "little-market");
  assert.equal(nextChapter(chapterShelf(demo, {}, {}, now)).id, "first-seeds");
  assert.deepEqual(earnedBadges(shelf).map(badge => badge.id).sort(), ["boss-slayer", "chapter-done", "first-page", "three-stars"]);
  assert.ok(!earnedBadges(shelf).some(badge => badge.id === "story-complete"));
  assert.equal(chapterShelf(demo, null, null, now)[0].state, "new");
});

test("the teacher sees pages, time, words, accuracy and what waits for review", () => {
  const now = Date.now();
  const records = { "first-seeds": { lastAt: now, pagesRead: 2, pagesTotal: 3, seconds: 400, words: 4, attempts: 1, quickScore: 1, quickTotal: 2, qScore: 3, qTotal: 4, completedAt: now, stars: 2 } };
  const queue = [{ questionId: "manga:first-seeds:q-wait" }, { questionId: "manga:first-seeds:retell" }, { questionId: "manga:little-market:q-proud" }, { questionId: "clip-x:e1" }, null];
  const rows = teacherRows(demo, records, {}, queue, now);
  assert.deepEqual([rows[0].pagesRead, rows[0].minutes, rows[0].words, rows[0].accuracy, rows[0].awaitingReview, rows[1].awaitingReview], [2, 7, 4, 67, 2, 1]);
  assert.equal(rows[1].accuracy, null);
  assert.deepEqual(teacherRows(demo, null, null, null, now).map(row => row.awaitingReview), [0, 0]);
});
