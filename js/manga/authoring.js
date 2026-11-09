// Helpers for making manga drafts without hand-writing JSON: a plain-text script format, a CSV format, and the geometry of
// drawing boxes on a page. Pure functions: the tools page does the drawing. The result is always checked by validateMangaV2.
import { isBox } from "./geometry.js";

const slug = text => String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "item";
const numbers = text => String(text || "").split(/[ ,x]+/).map(Number);
const trim = text => String(text == null ? "" : text).trim();

// "word = meaning = translation ; word2 = meaning2" -> [{word, meaning, translation}]
export function parseWords(text) {
  return trim(text).split(/\s*[;|]\s*/).filter(Boolean).map(part => {
    const [word, meaning, translation] = part.split(/\s*=\s*/);
    return { word: trim(word), meaning: trim(meaning), ...(trim(translation) ? { translation: trim(translation) } : {}) };
  }).filter(item => item.word && item.meaning);
}

// ---- pixel boxes from dragging on a displayed image ---------------------------------------------------------------------------
// The two corners are in screen pixels relative to the image's top left; `shown` is the displayed size, `page` the real size.
export function dragToBox(from, to, shown, page, { minimum = 24 } = {}) {
  const scaleX = page.width / shown.width; const scaleY = page.height / shown.height;
  const clamp = (value, max) => Math.max(0, Math.min(max, value));
  const x1 = clamp(Math.min(from.x, to.x) * scaleX, page.width); const x2 = clamp(Math.max(from.x, to.x) * scaleX, page.width);
  const y1 = clamp(Math.min(from.y, to.y) * scaleY, page.height); const y2 = clamp(Math.max(from.y, to.y) * scaleY, page.height);
  const box = [Math.round(x1), Math.round(y1), Math.round(x2 - x1), Math.round(y2 - y1)];
  return box[2] >= minimum && box[3] >= minimum ? box : null;
}

// Which panel holds this bubble box (the first one that contains it completely)?
export function panelFor(panels, box) {
  return panels.find(panel => box[0] >= panel.bbox[0] && box[1] >= panel.bbox[1] && box[0] + box[2] <= panel.bbox[0] + panel.bbox[2] && box[1] + box[3] <= panel.bbox[1] + panel.bbox[3]) || null;
}

// ---- the script format ------------------------------------------------------------------------------------------------------------
export const SCRIPT_HELP = `# Story title
level: A2
genre: slice-of-life
author: Your name
artist: Who drew the pages
licence: Original text and art made for this lesson
rights: original
direction: ltr

## first-seeds | Chapter 1: The first seeds
summary: One sentence about the chapter.
minutes: 8
words: rooftop = The flat top of a building. = крыша ; garden = A place where plants grow. = сад
question gist | q-main-idea | What is the story mostly about? | A garden on a roof ; A lost key ; A new shop
question detail | q-seeds | What did Mrs Lee bring?
question inference | q-wait | How does Marat feel? | 6 | excited, impatient ; wait, grow
boss: q-main-idea, q-seeds
retell: 15 | Retell the chapter in three to five sentences.

### p1 | assets/manga/garden-p1.svg | 800x1200 | Alt text that describes the whole page
quick: who-said | b1 | Aida ; Marat
#### p1a | 20,20,760,380 | Aida stands on a rooftop.
speech | Aida | 60,40,330,110 | This roof could become a garden for everyone.
  simplified: Aida has an idea.
  translation: Эта крыша может стать садом.
  grammar: "Could" talks about something possible.
  words: roof = The top of a building. = крыша`;

export function parseScript(text) {
  const problems = []; const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const draft = { schemaVersion: 2, id: "", title: "", level: "A2", genre: [], credits: { author: "", artist: "", licence: "", rights: "original" }, readingDirection: "ltr", chapters: [] };
  let chapter = null; let page = null; let panel = null; let bubble = null; let bubbleCount = 0; let target = "story";
  const fail = (index, message) => problems.push(`Line ${index + 1}: ${message}`);
  lines.forEach((raw, index) => {
    const line = raw.replace(/\s+$/, ""); const bare = line.trim();
    if (!bare || bare.startsWith("//")) return;
    let match;
    if ((match = /^#### (.*)$/.exec(bare))) {
      const [id, box, summary] = match[1].split("|").map(trim);
      if (!page) { fail(index, "A panel needs a page above it (a line starting with ###)."); return; }
      const bbox = numbers(box); if (!isBox(bbox)) { fail(index, `The panel box "${box}" should be four numbers: x, y, width, height.`); return; }
      panel = { id: id || `${page.id}-${page.panels.length + 1}`, bbox, summary: summary || "", bubbles: [] }; page.panels.push(panel); bubble = null; target = "panel";
    } else if ((match = /^### (.*)$/.exec(bare))) {
      const [id, image, size, alt] = match[1].split("|").map(trim);
      if (!chapter) { fail(index, "A page needs a chapter above it (a line starting with ##)."); return; }
      const [width, height] = numbers(size);
      page = { id: id || `p${chapter.pages.length + 1}`, image: image || "", width, height, alt: alt || "", panels: [] }; chapter.pages.push(page); panel = null; bubble = null; target = "page";
    } else if ((match = /^## (.*)$/.exec(bare))) {
      const [id, title] = match[1].split("|").map(trim);
      chapter = { id: title ? id : slug(id), title: title || id, summary: "", estimatedMinutes: 5, vocabulary: [], pages: [], questions: [] }; draft.chapters.push(chapter); page = null; panel = null; bubble = null; target = "chapter";
    } else if ((match = /^# (.*)$/.exec(bare))) {
      draft.title = trim(match[1]); draft.id = slug(match[1]); target = "story";
    } else if (/^(speech|thought|narration|sfx)\s*\|/.test(bare)) {
      if (!panel) { fail(index, "A bubble needs a panel above it (a line starting with ####)."); return; }
      const [type, speaker, at, ...rest] = bare.split("|").map(trim); const bubbleText = rest.join("|").trim(); const box = numbers(at);
      if (!isBox(box)) { fail(index, `The bubble box "${at}" should be four numbers: x, y, width, height.`); return; }
      bubbleCount += 1;
      bubble = { id: `b${bubbleCount}`, type, ...(speaker ? { speaker } : {}), text: bubbleText, simplified: "", at: box, vocabulary: [] }; panel.bubbles.push(bubble);
    } else if (/^question\s+/.test(bare)) {
      if (!chapter) { fail(index, "A question needs a chapter above it."); return; }
      const [head, id, prompt, ...extra] = bare.split("|").map(trim); const type = head.replace(/^question\s+/, "");
      const question = { id, type, prompt };
      if (type === "gist" || type === "vocab") question.options = trim(extra[0]).split(/\s*;\s*/).filter(Boolean);
      if (type === "inference") question.rubric = { minWords: Number(extra[0]) || 6, groups: trim(extra[1]).split(/\s*;\s*/).filter(Boolean).map(group => group.split(/\s*,\s*/).filter(Boolean)) };
      chapter.questions.push(question);
    } else if (/^quick\s*:/.test(bare)) {
      if (!page) { fail(index, "A quick question needs a page above it."); return; }
      const [type, bubbleId, extra] = bare.replace(/^quick\s*:/, "").split("|").map(trim);
      const quick = { id: `${page.id}-${type}`, type, prompt: type === "who-said" ? "Who says this?" : type === "fill-bubble" ? "Fill the gap." : "What do you think will happen next?" };
      if (type === "who-said") { quick.bubbleId = bubbleId; quick.speakers = trim(extra).split(/\s*;\s*/).filter(Boolean); }
      else if (type === "fill-bubble") { quick.bubbleId = bubbleId; quick.hide = trim(extra).split(/[ ,]+/).filter(Boolean).map(Number); }
      else quick.options = trim(bubbleId + (extra ? `;${extra}` : "")).split(/\s*;\s*/).filter(Boolean);
      page.quick = quick;
    } else if (/^boss\s*:/.test(bare)) {
      if (chapter) chapter.boss = { questionIds: bare.replace(/^boss\s*:/, "").split(/\s*,\s*/).map(trim).filter(Boolean) }; else fail(index, "A boss line needs a chapter above it.");
    } else if (/^retell\s*:/.test(bare)) {
      const [minWords, prompt] = bare.replace(/^retell\s*:/, "").split("|").map(trim);
      if (chapter) chapter.retell = { minWords: Number(minWords) || 15, prompt: prompt || "Retell the chapter in your own words." }; else fail(index, "A retell line needs a chapter above it.");
    } else if ((match = /^([a-z]+)\s*:\s*(.*)$/i.exec(bare))) {
      const key = match[1].toLowerCase(); const value = match[2];
      if (target === "story") {
        if (key === "level") draft.level = value.toUpperCase(); else if (key === "genre") draft.genre = value.split(/\s*,\s*/).filter(Boolean);
        else if (["author", "artist", "licence", "rights"].includes(key)) draft.credits[key] = value; else if (key === "source") draft.credits.sourceUrl = value;
        else if (key === "direction") draft.readingDirection = value; else fail(index, `Unknown story setting "${key}".`);
      } else if (target === "chapter" || (target === "page" && key === "words")) {
        if (key === "summary") chapter.summary = value; else if (key === "minutes") chapter.estimatedMinutes = Number(value) || 5; else if (key === "words") chapter.vocabulary = parseWords(value); else fail(index, `Unknown chapter setting "${key}".`);
      } else if (bubble && /^\s/.test(line)) {
        if (key === "simplified") bubble.simplified = value; else if (key === "translation") bubble.translation = value; else if (key === "grammar") bubble.grammarNote = value; else if (key === "words") bubble.vocabulary = parseWords(value); else if (key === "audio") bubble.audio = value; else fail(index, `Unknown bubble setting "${key}".`);
      } else fail(index, `"${bare}" is not understood here.`);
    } else fail(index, `"${bare}" is not understood.`);
  });
  return { draft, problems };
}

// ---- CSV ---------------------------------------------------------------------------------------------------------------------------------
export function parseCsv(text) {
  const rows = []; let row = []; let cell = ""; let quoted = false; const input = String(text || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quoted) { if (ch === '"' && input[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch; }
    else if (ch === '"') quoted = true; else if (ch === ",") { row.push(cell); cell = ""; } else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(items => items.some(item => item.trim()));
}

export const CSV_COLUMNS = Object.freeze(["chapter", "page", "image", "width", "height", "alt", "panel", "panelBox", "panelSummary", "type", "speaker", "bubbleBox", "text", "simplified", "translation", "grammar", "words"]);

// One bubble per row. Columns are named in the first row; chapter, page and panel values repeat or are left empty to continue.
export function csvToDraft(text, story = {}) {
  const rows = parseCsv(text); const problems = [];
  const draft = { schemaVersion: 2, id: slug(story.title || "story"), title: story.title || "", level: story.level || "A2", genre: story.genre || ["slice-of-life"], credits: story.credits || { author: "", artist: "", licence: "", rights: "original" }, readingDirection: story.readingDirection || "ltr", chapters: [] };
  if (!rows.length) return { draft, problems: ["The CSV is empty."] };
  const head = rows[0].map(name => name.trim()); const missing = ["chapter", "page", "image", "panel", "panelBox", "type", "bubbleBox", "text"].filter(name => !head.includes(name));
  if (missing.length) return { draft, problems: [`The first row needs these column names: ${missing.join(", ")}.`] };
  let chapter = null; let page = null; let panel = null; let count = 0;
  rows.slice(1).forEach((cells, index) => {
    const get = name => trim(cells[head.indexOf(name)]);
    const fail = message => problems.push(`Row ${index + 2}: ${message}`);
    if (get("chapter") && (!chapter || chapter.title !== get("chapter"))) { chapter = { id: slug(get("chapter")), title: get("chapter"), summary: get("chapter"), estimatedMinutes: 5, vocabulary: [], pages: [], questions: [] }; draft.chapters.push(chapter); page = null; panel = null; }
    if (!chapter) { fail("the first row needs a chapter."); return; }
    if (get("page") && (!page || page.id !== get("page"))) { page = { id: get("page"), image: get("image"), width: Number(get("width")), height: Number(get("height")), alt: get("alt"), panels: [] }; chapter.pages.push(page); panel = null; }
    if (!page) { fail("the first row needs a page."); return; }
    const box = numbers(get("panelBox"));
    if (get("panel") && (!panel || panel.id !== get("panel"))) { if (!isBox(box)) { fail(`the panel box "${get("panelBox")}" should be four numbers.`); return; } panel = { id: get("panel"), bbox: box, summary: get("panelSummary") || get("panel"), bubbles: [] }; page.panels.push(panel); }
    if (!panel) { fail("the first row of a page needs a panel."); return; }
    const at = numbers(get("bubbleBox")); if (!isBox(at)) { fail(`the bubble box "${get("bubbleBox")}" should be four numbers.`); return; }
    count += 1;
    panel.bubbles.push({ id: `b${count}`, type: get("type") || "speech", ...(get("speaker") ? { speaker: get("speaker") } : {}), text: get("text"), simplified: get("simplified"), ...(get("translation") ? { translation: get("translation") } : {}), ...(get("grammar") ? { grammarNote: get("grammar") } : {}), at, vocabulary: parseWords(get("words")) });
  });
  return { draft, problems };
}

// Problems with one page while it is being drawn, in plain words. An empty list means the page is ready to add to the draft.
export function pageProblems(page) {
  const problems = [];
  if (!/^assets\/manga\/[a-z0-9][a-z0-9-]*\.(svg|webp|avif|png|jpe?g)$/i.test(String(page.image || ""))) problems.push("The image must be a file under assets/manga.");
  if (!trim(page.alt)) problems.push("Add alt text that describes the page for screen readers.");
  if (!(page.width > 0 && page.height > 0)) problems.push("Load the page so its size is known.");
  if (!page.panels.length) problems.push("Draw at least one panel.");
  page.panels.forEach((panel, index) => {
    const name = `Panel ${index + 1}`;
    if (!trim(panel.summary)) problems.push(`${name} needs a short summary.`);
    if (!isBox(panel.bbox) || panel.bbox[0] + panel.bbox[2] > page.width || panel.bbox[1] + panel.bbox[3] > page.height) problems.push(`${name} must sit inside the page.`);
    panel.bubbles.forEach((bubble, number) => {
      const label = `${name}, bubble ${number + 1}`;
      if (!trim(bubble.text)) problems.push(`${label} needs text.`);
      if (!trim(bubble.simplified)) problems.push(`${label} needs a simpler version.`);
      if (!isBox(bubble.at) || !(bubble.at[0] >= panel.bbox[0] && bubble.at[1] >= panel.bbox[1] && bubble.at[0] + bubble.at[2] <= panel.bbox[0] + panel.bbox[2] && bubble.at[1] + bubble.at[3] <= panel.bbox[1] + panel.bbox[3])) problems.push(`${label} must sit inside its panel.`);
    });
  });
  return problems;
}

// Puts a finished page into a chapter of a draft (replacing a page with the same id). Returns a new draft.
export function addPageToDraft(draft, chapterId, page) {
  const copy = structuredClone(draft);
  const chapter = copy.chapters.find(item => item.id === chapterId);
  if (!chapter) throw new Error(`The draft has no chapter "${chapterId}".`);
  const at = chapter.pages.findIndex(item => item.id === page.id);
  if (at >= 0) chapter.pages[at] = page; else chapter.pages.push(page);
  return copy;
}
