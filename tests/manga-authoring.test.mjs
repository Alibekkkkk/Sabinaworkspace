import assert from "node:assert/strict";
import test from "node:test";
import { addPageToDraft, csvToDraft, dragToBox, pageProblems, panelFor, parseCsv, parseScript, parseWords, SCRIPT_HELP } from "../js/manga/authoring.js";
import { validateMangaV2 } from "../js/manga/schema-v2.js";

test("words are read from 'word = meaning = translation' lists", () => {
  assert.deepEqual(parseWords("roof = top of a building = крыша ; garden = place for plants"), [{ word: "roof", meaning: "top of a building", translation: "крыша" }, { word: "garden", meaning: "place for plants" }]);
  assert.deepEqual(parseWords(""), []); assert.deepEqual(parseWords("lonely"), []);
});

test("dragging on the shown image gives a box in real pixels, whichever way you drag", () => {
  const shown = { width: 400, height: 600 }; const page = { width: 800, height: 1200 };
  assert.deepEqual(dragToBox({ x: 10, y: 20 }, { x: 110, y: 70 }, shown, page), [20, 40, 200, 100]);
  assert.deepEqual(dragToBox({ x: 110, y: 70 }, { x: 10, y: 20 }, shown, page), [20, 40, 200, 100], "dragging up and left gives the same box");
  assert.deepEqual(dragToBox({ x: -50, y: -50 }, { x: 500, y: 700 }, shown, page), [0, 0, 800, 1200], "the box is kept on the page");
  assert.equal(dragToBox({ x: 5, y: 5 }, { x: 8, y: 8 }, shown, page), null, "a tap is not a box");
});

test("a bubble belongs to the panel that holds it", () => {
  const panels = [{ id: "a", bbox: [0, 0, 100, 100] }, { id: "b", bbox: [100, 0, 100, 100] }];
  assert.equal(panelFor(panels, [110, 10, 50, 50]).id, "b"); assert.equal(panelFor(panels, [90, 10, 50, 50]), null);
});

test("the example script becomes a draft with no parse problems", () => {
  const { draft, problems } = parseScript(SCRIPT_HELP);
  assert.deepEqual(problems, []);
  assert.equal(draft.title, "Story title"); assert.equal(draft.level, "A2"); assert.equal(draft.credits.rights, "original"); assert.equal(draft.chapters.length, 1);
  const chapter = draft.chapters[0]; assert.equal(chapter.id, "first-seeds"); assert.equal(chapter.estimatedMinutes, 8); assert.equal(chapter.vocabulary.length, 2); assert.equal(chapter.questions.length, 3);
  assert.deepEqual(chapter.boss.questionIds, ["q-main-idea", "q-seeds"]); assert.equal(chapter.retell.minWords, 15);
  const bubble = chapter.pages[0].panels[0].bubbles[0];
  assert.deepEqual([bubble.type, bubble.speaker, bubble.at, bubble.simplified.startsWith("Aida")], ["speech", "Aida", [60, 40, 330, 110], true]);
  assert.equal(bubble.vocabulary[0].word, "roof"); assert.equal(bubble.grammarNote.startsWith("\"Could\""), true);
  assert.equal(chapter.pages[0].quick.type, "who-said");
});

test("script mistakes are reported with their line numbers", () => {
  assert.match(parseScript("#### p1a | 1,2,3 | x").problems[0], /Line 1.*page/);
  assert.match(parseScript("## c | C\n### p | assets/manga/a.svg | 800x1200 | alt\n#### a | 1,2,x,4 | s").problems[0], /Line 3.*four numbers/);
  assert.match(parseScript("speech | A | 1,2,3,4 | hi").problems[0], /Line 1.*panel/);
  assert.match(parseScript("# T\nnonsense here").problems[0], /Line 2/);
  assert.match(parseScript("# T\nlevel: A2\ncolour: red").problems[0], /Unknown story setting/);
});

test("a finished script draft passes the real validator", () => {
  const text = `# Tiny\nlevel: A1\ngenre: slice-of-life\nauthor: T\nartist: T\nlicence: Original\nrights: original\n\n## one | Chapter one\nsummary: A very small chapter.\nminutes: 2\nwords: cat = a small pet\nquestion gist | q1 | What is it about? | A cat ; A dog\nboss: q1\n\n### p1 | assets/manga/garden-p1.svg | 800x1200 | A page of a cat.\n#### a | 20,20,760,380 | A cat sits.\nspeech | Cat | 60,40,330,110 | Meow, I am here.\n  simplified: The cat says hello.`;
  const { draft, problems } = parseScript(text); assert.deepEqual(problems, []);
  assert.throws(() => validateMangaV2(draft, { requireAnswers: false }), /questions|boss/i, "the validator still asks for what is missing: a boss needs three questions");
  draft.chapters[0].boss = undefined; delete draft.chapters[0].boss;
  assert.doesNotThrow(() => validateMangaV2(draft, { requireAnswers: false }));
});

test("CSV rows become pages, panels and bubbles", () => {
  assert.deepEqual(parseCsv('a,b\n"x, y","say ""hi"""\n'), [["a", "b"], ["x, y", 'say "hi"']]);
  const csv = [
    "chapter,page,image,width,height,alt,panel,panelBox,panelSummary,type,speaker,bubbleBox,text,simplified,translation,grammar,words",
    'One,p1,assets/manga/garden-p1.svg,800,1200,A page,a,"20 20 760 380",A roof,speech,Aida,"60 40 330 110","Hello, city!",Aida greets the city.,,,roof = top of a building',
    ",,,,,,,,,speech,Marat,\"100 200 200 80\",Hi!,Marat says hi.,,,"
  ].join("\n");
  const { draft, problems } = csvToDraft(csv, { title: "CSV story", credits: { author: "T", artist: "T", licence: "Original", rights: "original" } });
  assert.deepEqual(problems, []);
  const panel = draft.chapters[0].pages[0].panels[0];
  assert.equal(draft.chapters[0].pages[0].panels.length, 1); assert.equal(panel.bubbles.length, 2); assert.equal(panel.bubbles[0].text, "Hello, city!"); assert.deepEqual(panel.bubbles[1].at, [100, 200, 200, 80]);
  assert.match(csvToDraft("a,b\n1,2").problems[0], /column names/);
  assert.match(csvToDraft("chapter,page,image,panel,panelBox,type,bubbleBox,text\nOne,p1,x.svg,a,1 2 x 4,speech,1 2 3 4,hi").problems[0], /Row 2.*four numbers/);
  assert.deepEqual(csvToDraft("").problems, ["The CSV is empty."]);
});

test("a page being drawn lists what is missing in plain words", () => {
  const page = { id: "p1", image: "assets/manga/garden-p1.svg", width: 800, height: 1200, alt: "", panels: [{ id: "a", bbox: [20, 20, 760, 380], summary: "", bubbles: [{ id: "b1", type: "speech", text: "", simplified: "", at: [900, 10, 50, 50], vocabulary: [] }] }] };
  const problems = pageProblems(page);
  assert.ok(problems.some(text => /alt text/.test(text))); assert.ok(problems.some(text => /Panel 1 needs a short summary/.test(text)));
  assert.ok(problems.some(text => /bubble 1 needs text/.test(text))); assert.ok(problems.some(text => /inside its panel/.test(text)));
  assert.ok(pageProblems({ ...page, image: "https://example.com/a.png" }).some(text => /under assets\/manga/.test(text)));
  const good = { ...page, alt: "A roof", panels: [{ ...page.panels[0], summary: "A roof", bubbles: [{ ...page.panels[0].bubbles[0], text: "Hi", simplified: "Hello", at: [40, 40, 200, 80] }] }] };
  assert.deepEqual(pageProblems(good), []);
});

test("a page replaces the one with the same id, or is added at the end", () => {
  const draft = { chapters: [{ id: "c", pages: [{ id: "p1", alt: "old" }] }] };
  assert.equal(addPageToDraft(draft, "c", { id: "p1", alt: "new" }).chapters[0].pages[0].alt, "new");
  assert.equal(addPageToDraft(draft, "c", { id: "p2" }).chapters[0].pages.length, 2);
  assert.equal(draft.chapters[0].pages[0].alt, "old", "the original draft is not changed");
  assert.throws(() => addPageToDraft(draft, "nope", { id: "p" }), /no chapter/);
});
