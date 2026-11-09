// Manga maker on tools/import-content.html: turn a script or CSV into a draft, then draw panel and bubble boxes on a page
// image and put the finished page into the draft. Nothing is uploaded; the draft lives in the textarea above until it is
// downloaded. Boxes can also be typed as numbers, so the editor works without a mouse.
import { addPageToDraft, csvToDraft, dragToBox, pageProblems, panelFor, parseScript, SCRIPT_HELP } from "../manga/authoring.js";
import { hotspotStyle } from "../manga/geometry.js";
import { BUBBLE_TYPES } from "../manga/schema-v2.js";

const $ = id => document.getElementById(id);
if (!$("mangaMaker")) throw new Error("The manga maker section is missing.");
const page = { id: "p1", image: "", width: 0, height: 0, alt: "", panels: [] };
let draftBox = null;

const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const label = (text, control) => { const wrap = el("label", "", text); wrap.append(control); return wrap; };
const field = (value, change, attributes = {}) => { const input = el("input"); input.type = "text"; input.value = value || ""; for (const [name, v] of Object.entries(attributes)) input.setAttribute(name, v); input.addEventListener("change", () => change(input.value)); return input; };
const boxInputs = (box, change, name) => {
  const row = el("div", "mm-nums"); row.setAttribute("role", "group"); row.setAttribute("aria-label", `${name} position and size`);
  ["x", "y", "width", "height"].forEach((part, index) => { const input = el("input"); input.type = "number"; input.value = String(box[index]); input.min = "0"; input.setAttribute("aria-label", `${name} ${part}`); input.addEventListener("change", () => { box[index] = Math.max(0, Math.round(Number(input.value) || 0)); change(); }); row.append(input); });
  return row;
};

function paintStage() {
  const stage = $("mmStage");
  stage.querySelectorAll(".mm-box").forEach(node => node.remove());
  const add = (box, kind) => { const node = el("div", `mm-box mm-box--${kind}`); for (const [name, value] of Object.entries(hotspotStyle(box, page))) node.style.setProperty(name, value); node.setAttribute("aria-hidden", "true"); stage.append(node); return node; };
  for (const panel of page.panels) { add(panel.bbox, "panel"); for (const bubble of panel.bubbles) add(bubble.at, "bubble"); }
  if (draftBox) add(draftBox, "draft");
}

function paintItems() {
  const host = $("mmItems"); host.replaceChildren();
  page.panels.forEach((panel, pIndex) => {
    const box = el("fieldset", "mm-item"); box.append(el("legend", "", `Panel ${pIndex + 1}`));
    box.append(label("What happens in this panel (for screen readers)", field(panel.summary, value => { panel.summary = value; refresh(); })), boxInputs(panel.bbox, () => { refresh(true); }, `Panel ${pIndex + 1}`));
    const remove = el("button", "", "Remove this panel and its bubbles"); remove.type = "button"; remove.addEventListener("click", () => { page.panels.splice(pIndex, 1); refresh(true); }); box.append(remove);
    panel.bubbles.forEach((bubble, bIndex) => {
      const item = el("fieldset", "mm-item mm-bubble"); item.append(el("legend", "", `Bubble ${bIndex + 1}`));
      const type = el("select"); for (const name of BUBBLE_TYPES) type.append(new Option(name, name, false, bubble.type === name)); type.addEventListener("change", () => { bubble.type = type.value; refresh(); });
      item.append(label("Kind", type), label("Who says it (leave empty for narration)", field(bubble.speaker, value => { if (value.trim()) bubble.speaker = value.trim(); else delete bubble.speaker; refresh(); })),
        label("Text exactly as printed", field(bubble.text, value => { bubble.text = value; refresh(); }, { maxlength: "300" })),
        label("The same in simpler English", field(bubble.simplified, value => { bubble.simplified = value; refresh(); }, { maxlength: "300" })),
        label("Translation (optional)", field(bubble.translation, value => { if (value.trim()) bubble.translation = value.trim(); else delete bubble.translation; refresh(); })),
        label("Grammar note (optional)", field(bubble.grammarNote, value => { if (value.trim()) bubble.grammarNote = value.trim(); else delete bubble.grammarNote; refresh(); })),
        boxInputs(bubble.at, () => refresh(true), `Panel ${pIndex + 1} bubble ${bIndex + 1}`));
      const gone = el("button", "", "Remove this bubble"); gone.type = "button"; gone.addEventListener("click", () => { panel.bubbles.splice(bIndex, 1); refresh(true); }); item.append(gone); box.append(item);
    });
    host.append(box);
  });
}

function refresh(rebuild = false) {
  paintStage(); if (rebuild) paintItems();
  const problems = page.width ? pageProblems({ ...page, alt: $("mmAlt").value, image: $("mmImage").value.trim() }) : ["Load a page first."];
  $("mmProblems").replaceChildren(...problems.map(text => el("li", "", text)));
  $("mmAddToDraft").disabled = problems.length > 0;
}

function currentDraft() { try { const draft = JSON.parse($("mangaDraft").value); return draft && Array.isArray(draft.chapters) ? draft : null; } catch (error) { return null; } }
function paintChapters() {
  const draft = currentDraft(); const select = $("mmChapter"); const keep = select.value; select.replaceChildren();
  if (draft) for (const chapter of draft.chapters) select.append(new Option(chapter.title || chapter.id, chapter.id, false, chapter.id === keep));
}

function loadPage() {
  const image = $("mmImage").value.trim();
  if (!/^assets\/manga\/[a-z0-9][a-z0-9-]*\.(svg|webp|avif|png|jpe?g)$/i.test(image)) { $("mmLoadStatus").textContent = "The image must be a file under assets/manga, for example assets/manga/garden-p1.svg."; return; }
  const img = new Image(); img.alt = "";
  img.addEventListener("load", () => {
    page.width = img.naturalWidth || 800; page.height = img.naturalHeight || 1200; page.image = image; page.id = $("mmPageId").value.trim() || "p1"; page.panels = []; draftBox = null;
    $("mmStage").replaceChildren(img); img.style.setProperty("width", "100%");
    $("mmLoadStatus").textContent = `Loaded ${image}: ${page.width} by ${page.height} pixels. Drag on the page to draw a box.`; paintItems(); refresh();
  });
  img.addEventListener("error", () => { $("mmLoadStatus").textContent = "That image could not be loaded. Check the file name."; });
  img.src = new URL(`../${image}`, location.href).href;
}

function addBox(kind, box) {
  if (kind === "panel") { page.panels.push({ id: `${page.id}${String.fromCharCode(97 + page.panels.length)}`, bbox: box, summary: "", bubbles: [] }); refresh(true); return; }
  const owner = panelFor(page.panels, box) || (page.panels.length ? page.panels[page.panels.length - 1] : null);
  if (!owner) { $("mmLoadStatus").textContent = "Draw the panel first, then its bubbles inside it."; return; }
  const count = page.panels.reduce((sum, panel) => sum + panel.bubbles.length, 0) + 1;
  owner.bubbles.push({ id: `b${count}`, type: "speech", text: "", simplified: "", at: panelFor([owner], box) ? box : [owner.bbox[0], owner.bbox[1], Math.min(owner.bbox[2], 200), Math.min(owner.bbox[3], 80)], vocabulary: [] }); refresh(true);
}

function wireStage() {
  const stage = $("mmStage"); let start = null;
  const point = event => { const rect = stage.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
  const shown = () => { const rect = stage.getBoundingClientRect(); return { width: rect.width, height: rect.height }; };
  stage.addEventListener("pointerdown", event => { if (!page.width) return; start = point(event); stage.setPointerCapture(event.pointerId); });
  stage.addEventListener("pointermove", event => { if (!start) return; draftBox = dragToBox(start, point(event), shown(), page, { minimum: 1 }); paintStage(); });
  stage.addEventListener("pointerup", event => {
    if (!start) return; const box = dragToBox(start, point(event), shown(), page); start = null; draftBox = null;
    if (box) addBox(document.querySelector('input[name="mmTool"]:checked').value, box); else paintStage();
  });
}

function convert() {
  const text = $("mmScript").value; const looksLikeCsv = /^\s*chapter\s*,\s*page\s*,/i.test(text);
  const result = looksLikeCsv ? csvToDraft(text, currentDraft() || {}) : parseScript(text);
  if (result.problems.length) { $("mmScriptStatus").textContent = `${result.problems.length} problem${result.problems.length === 1 ? "" : "s"}: ${result.problems.slice(0, 4).join(" ")}`; return; }
  $("mangaDraft").value = JSON.stringify(result.draft, null, 2);
  $("mmScriptStatus").textContent = `Made a draft with ${result.draft.chapters.length} chapter${result.draft.chapters.length === 1 ? "" : "s"}. It is in the draft box above: press Validate manga draft to check it.`;
  paintChapters();
}

$("mmExample").addEventListener("click", () => { $("mmScript").value = SCRIPT_HELP; $("mmScriptStatus").textContent = "This is an example. Change it, then press Turn it into a draft."; });
$("mmConvert").addEventListener("click", convert);
$("mmFile").addEventListener("change", async () => { const file = $("mmFile").files[0]; if (!file) return; if (file.size > 500000) { $("mmScriptStatus").textContent = "That file is too big for a script."; return; } $("mmScript").value = await file.text(); $("mmScriptStatus").textContent = `Loaded ${file.name}.`; });
$("mmLoad").addEventListener("click", loadPage);
$("mmAlt").addEventListener("input", () => refresh());
$("mmAddPanel").addEventListener("click", () => { if (page.width) addBox("panel", [Math.round(page.width * 0.05), Math.round(page.height * 0.05), Math.round(page.width * 0.9), Math.round(page.height * 0.3)]); });
$("mmAddBubble").addEventListener("click", () => { if (page.width) addBox("bubble", [0, 0, 1, 1]); });
$("mmAddToDraft").addEventListener("click", () => {
  const draft = currentDraft();
  if (!draft) { $("mmDraftStatus").textContent = "There is no draft above yet. Turn a script into a draft first, or paste one."; return; }
  try {
    const finished = { id: page.id, image: $("mmImage").value.trim(), width: page.width, height: page.height, alt: $("mmAlt").value.trim(), panels: structuredClone(page.panels) };
    $("mangaDraft").value = JSON.stringify(addPageToDraft(draft, $("mmChapter").value, finished), null, 2);
    $("mmDraftStatus").textContent = `Page ${finished.id} is in the draft. Press Validate manga draft to check the whole story.`;
  } catch (error) { $("mmDraftStatus").textContent = error.message; }
});
$("mangaDraft").addEventListener("input", paintChapters);
wireStage(); paintChapters();
