// Whiteboard application: builds the toolbar and panels, wires the board controller to the database, and applies
// the teacher's permission mode. Used by whiteboard.html and by the drawer in lesson.html.
import { createBoard, TOOLS } from "./board.js";
import { boardToSvg, buildPdf, canvasToBlob, contentBounds, dataUrlToBytes, downloadBlob, renderToCanvas } from "./export.js";
import { BACKGROUNDS, FONT_SIZES, LIMITS, MODES, PALETTE, WIDTH_PRESETS } from "./model.js";
import { pageToBlob, pageToDataUrl, saveSnapshot, sharedPainter } from "./snapshot.js";
import { createSync } from "./sync.js";
import { TEMPLATES } from "./templates.js";

const TOOL_GLYPHS = { select: "⬚", hand: "✋", pen: "✏️", hl: "🖍️", eraser: "🧽", laser: "🔴", line: "╱", arrow: "➜", rect: "▭", ellipse: "◯", triangle: "△", text: "T", sticky: "🗒️" };
const MODE_TEXT = {
  view: "Watching: the teacher is drawing. You can look and point with the laser.",
  draw: "Everyone can draw on this board.",
  "teacher-only": "The teacher is preparing this board. It will appear when they share it."
};
const PERSON_COLOURS = ["#1c7ed6", "#2f9e44", "#ae3ec9", "#d9480f", "#0c8599", "#d6336c"];
const colourFor = uid => PERSON_COLOURS[[...uid].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % PERSON_COLOURS.length];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(label, glyph, className, handler, attributes = {}) {
  const node = el("button", className);
  node.type = "button"; node.setAttribute("aria-label", label); node.title = attributes.title || label;
  if (glyph) { const g = el("span", "wb-glyph", glyph); g.setAttribute("aria-hidden", "true"); node.append(g); }
  if (attributes.text) node.append(el("span", "wb-label", attributes.text));
  for (const [name, value] of Object.entries(attributes)) if (name !== "title" && name !== "text") node.setAttribute(name, value);
  if (handler) node.addEventListener("click", handler);
  return node;
}

export function mountWhiteboard({ host, db, code, lessonId, uid, role, name, scopes, initialScope, onBack }) {
  host.replaceChildren();
  const isTeacher = role === "teacher";
  const available = scopes || (isTeacher ? ["shared", "personal"] : ["shared", "personal"]);
  let scope = initialScope && available.includes(initialScope) ? initialScope : "shared";
  const colour = isTeacher ? "#d6336c" : colourFor(uid);

  // ---- DOM ---------------------------------------------------------------------------------------------------
  const root = el("section", "wb"); root.tabIndex = 0; root.setAttribute("aria-label", "Whiteboard. Press the question mark button for keyboard help."); root.dataset.scope = scope;
  const top = el("div", "wb-top");
  const scopeTabs = el("div", "wb-scopes"); scopeTabs.setAttribute("role", "group"); scopeTabs.setAttribute("aria-label", "Which board");
  const pageStrip = el("div", "wb-pages"); pageStrip.setAttribute("role", "group"); pageStrip.setAttribute("aria-label", "Pages");
  const modeBox = el("div", "wb-mode");
  const status = el("p", "wb-status"); status.setAttribute("role", "status");
  top.append(scopeTabs, pageStrip, modeBox, status);

  const main = el("div", "wb-main");
  const rail = el("div", "wb-rail"); rail.setAttribute("role", "toolbar"); rail.setAttribute("aria-label", "Drawing tools"); rail.setAttribute("aria-orientation", "vertical");
  const stage = el("div", "wb-stage");
  const canvas = el("canvas", "wb-canvas"); canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", "Whiteboard drawing area. The text and pictures on it are listed under Board contents.");
  const empty = el("p", "wb-empty"); empty.hidden = true;
  stage.append(canvas, empty);
  const stylePanel = el("div", "wb-style"); stylePanel.setAttribute("role", "group"); stylePanel.setAttribute("aria-label", "Colour and size");
  main.append(rail, stage, stylePanel);

  const bottom = el("div", "wb-bottom");
  const live = el("div", "wb-sr"); live.setAttribute("aria-live", "polite");
  const toast = el("p", "wb-toast"); toast.setAttribute("role", "status"); toast.hidden = true;
  root.append(top, main, bottom, live, toast);
  host.append(root);

  const announce = text => { live.textContent = ""; setTimeout(() => { live.textContent = text; }, 30); };
  let toastTimer = 0;
  const notify = text => { toast.textContent = text; toast.hidden = false; announce(text); clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 5000); };

  // ---- board and data ----------------------------------------------------------------------------------------------
  let sync = null; let mode = "view"; let pages = []; let currentPage = null; let connected = true; let denied = false;
  const thumbs = new Map(); let thumbTimer = 0; let snapshots = [];
  const board = createBoard({ root, canvas, role, uid, scope, announce, notify, changed: refreshUi });
  window.__whiteboard = board; // handy in the browser console and for the end-to-end tests

  function canDraw() {
    if (denied) return false;
    if (scope === "personal") return !isTeacher; // the teacher can look at a student's own board but not change it
    return isTeacher || mode === "draw";
  }
  function applyPermissions() { board.setCanDraw(canDraw(), mode); renderModeBox(); updateEmpty(); refreshUi(); }

  function connect() {
    if (sync) sync.close();
    denied = false; pages = []; currentPage = null; board.setData(new Map(), {}); board.resetHistory();
    root.dataset.scope = scope;
    sync = createSync({
      db, code, lessonId, scope, uid, role, name, colour,
      handlers: {
        mode: value => {
          mode = value;
          if (!isTeacher && scope === "shared") { // a hidden board stops reading; sharing it again needs fresh listeners
            if (value === "teacher-only") { denied = true; board.setData(new Map(), {}); }
            else if (denied) { setTimeout(connect, 0); return; }
          }
          applyPermissions();
        },
        pages: list => { pages = list; renderPages(); choosePage(); },
        objects: (map, images) => { board.setData(map, images); scheduleThumb(); renderOutline(); updateEmpty(); },
        meta: meta => { board.setMeta(meta); renderBackgroundControls(); },
        presence: map => board.setRemote(map),
        live: map => board.setLive(map),
        connection: value => { connected = value; renderStatus(); },
        error: error => { if (error && /permission/i.test(String(error.code || error.message))) { denied = true; applyPermissions(); } }
      }
    });
    board.attachSync(sync);
    sync.watchSnapshots(list => { snapshots = list; renderSnapshots(); });
    applyPermissions();
  }

  function choosePage() {
    if (!pages.length) {
      const mayCreate = scope === "personal" ? !isTeacher : isTeacher;
      if (mayCreate && !choosePage.creating) { choosePage.creating = true; sync.addPage("Page 1", 0).then(() => { choosePage.creating = false; }); }
      updateEmpty(); return;
    }
    if (!currentPage || !pages.some(page => page.id === currentPage)) { currentPage = pages[0].id; sync.openPage(currentPage); board.resetHistory(); }
    renderPages(); updateEmpty();
  }
  function gotoPage(id) { if (id === currentPage) return; currentPage = id; sync.openPage(id); board.resetHistory(); board.clearSelection(); renderPages(); announce(`Page ${pages.findIndex(page => page.id === id) + 1} of ${pages.length}`); }

  // ---- thumbnails -------------------------------------------------------------------------------------------------------
  function scheduleThumb() { clearTimeout(thumbTimer); thumbTimer = setTimeout(() => refreshThumb(currentPage, { objects: board.objects, images: board.images, meta: board.meta }), 700); }
  async function refreshThumb(id, data) {
    if (!id) return;
    try {
      const page = data || await sync.readPage(id);
      thumbs.set(id, page.objects.size ? await pageToDataUrl(page, { maxSide: 220, quality: 0.6 }) : "");
      renderPages();
    } catch (error) { /* a missing thumbnail is not an error */ }
  }

  // ---- toolbar ------------------------------------------------------------------------------------------------------------
  const toolButtons = new Map();
  for (const [id, info] of Object.entries(TOOLS)) {
    const node = button(`${info.label} (${info.key.toUpperCase()})`, TOOL_GLYPHS[id], "wb-btn", () => board.setTool(id), { "aria-pressed": "false", "data-tool": id, title: `${info.label} (${info.key.toUpperCase()})` });
    toolButtons.set(id, node); rail.append(node);
  }
  const eraserMode = button("Eraser mode: part of a stroke", "", "wb-btn wb-btn--small", () => board.setEraserMode(board.state.eraserMode === "area" ? "stroke" : "area"), { "aria-pressed": "true", text: "Erase part" });
  rail.append(eraserMode);
  rail.addEventListener("mousedown", event => { if (event.target.closest("button")) event.preventDefault(); });
  rail.addEventListener("keydown", event => { // arrow keys move between tools; one tab stop for the whole toolbar
    const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }; if (!(event.key in keys)) return;
    const items = [...rail.querySelectorAll("button")]; const index = items.indexOf(document.activeElement); if (index === -1) return;
    event.preventDefault(); event.stopPropagation(); items[(index + keys[event.key] + items.length) % items.length].focus();
  });

  // ---- style panel ------------------------------------------------------------------------------------------------------------
  const swatches = el("div", "wb-swatches"); swatches.setAttribute("role", "group"); swatches.setAttribute("aria-label", "Colour");
  const swatchButtons = PALETTE.map(entry => {
    const node = button(entry.name, "", "wb-swatch", () => board.setStyle({ c: entry.value }), { "aria-pressed": "false", "data-colour": entry.value });
    if (entry.value === "auto") node.classList.add("wb-swatch--auto"); else node.style.setProperty("--swatch", entry.value);
    swatches.append(node); return node;
  });
  const picker = el("input", "wb-colour"); picker.type = "color"; picker.value = "#1c7ed6"; picker.setAttribute("aria-label", "Custom colour");
  picker.addEventListener("input", () => board.setStyle({ c: picker.value }));
  swatches.append(picker);

  const widths = el("div", "wb-widths"); widths.setAttribute("role", "group"); widths.setAttribute("aria-label", "Line width");
  const widthButtons = WIDTH_PRESETS.map(w => {
    const node = button(`Width ${w}`, "", "wb-width", () => board.setStyle({ w }), { "aria-pressed": "false", "data-width": String(w) });
    const dot = el("span", "wb-width__dot"); dot.style.setProperty("--dot", `${Math.min(18, 3 + w * 0.7)}px`); dot.setAttribute("aria-hidden", "true"); node.append(dot); widths.append(node); return node;
  });
  const widthRange = el("input", "wb-range"); widthRange.type = "range"; widthRange.min = "1"; widthRange.max = "48"; widthRange.value = "4"; widthRange.setAttribute("aria-label", "Line width slider");
  widthRange.addEventListener("input", () => board.setStyle({ w: Number(widthRange.value) }));
  const opacityRange = el("input", "wb-range"); opacityRange.type = "range"; opacityRange.min = "10"; opacityRange.max = "100"; opacityRange.value = "100"; opacityRange.setAttribute("aria-label", "Opacity");
  opacityRange.addEventListener("input", () => board.setStyle({ o: Number(opacityRange.value) / 100 }));
  const fillToggle = button("Fill shapes", "", "wb-btn wb-btn--small", () => { const on = !board.state.style.f; board.setStyle({ f: on ? "#bfe0fb" : undefined }); }, { "aria-pressed": "false", text: "Fill" });
  const fontSelect = el("select", "wb-select"); fontSelect.setAttribute("aria-label", "Text size");
  for (const size of FONT_SIZES) { const option = el("option", "", `${size}`); option.value = String(size); fontSelect.append(option); }
  fontSelect.value = "24"; fontSelect.addEventListener("change", () => board.setStyle({ fs: Number(fontSelect.value) }));
  const boldToggle = button("Bold", "", "wb-btn wb-btn--small", () => board.setStyle({ b: !board.state.style.b }), { "aria-pressed": "false", text: "B" });
  const underlineToggle = button("Underline", "", "wb-btn wb-btn--small", () => board.setStyle({ u: !board.state.style.u }), { "aria-pressed": "false", text: "U" });
  const altBox = el("div", "wb-alt"); altBox.hidden = true;
  const altInput = el("input", "wb-input"); altInput.type = "text"; altInput.maxLength = LIMITS.alt; altInput.id = "wbAlt"; altInput.placeholder = "Describe this picture";
  const altLabel = el("label", "wb-field-label", "Picture description"); altLabel.htmlFor = "wbAlt";
  altInput.addEventListener("change", () => board.setAlt(altInput.value));
  altBox.append(altLabel, altInput);
  stylePanel.append(swatches, widths, labelled("Slider", widthRange), labelled("Opacity", opacityRange), el("div", "wb-row"), altBox);
  const row = stylePanel.querySelector(".wb-row"); row.append(fillToggle, labelled("Text size", fontSelect), boldToggle, underlineToggle);
  function labelled(text, control) { const wrap = el("label", "wb-labelled"); wrap.append(el("span", "wb-field-label", text), control); return wrap; }

  // ---- bottom bar ---------------------------------------------------------------------------------------------------------------
  const undoButton = button("Undo (Ctrl+Z)", "↶", "wb-btn", () => board.undo(), { text: "Undo" });
  const redoButton = button("Redo (Ctrl+Shift+Z)", "↷", "wb-btn", () => board.redo(), { text: "Redo" });
  const deleteButton = button("Delete selected (Delete)", "🗑️", "wb-btn", () => board.deleteSelection(), { text: "Delete" });
  const duplicateButton = button("Duplicate selected (Ctrl+D)", "⧉", "wb-btn", () => board.duplicateSelection(), { text: "Duplicate" });
  const zoomOut = button("Zoom out (minus)", "−", "wb-btn", () => board.zoomBy(0.8));
  const zoomLabel = el("span", "wb-zoom", "100%"); zoomLabel.setAttribute("aria-hidden", "true");
  const zoomIn = button("Zoom in (plus)", "+", "wb-btn", () => board.zoomBy(1.25));
  const fitButton = button("Fit to content (0)", "⤢", "wb-btn", () => board.fit(), { text: "Fit" });
  const snapButton = button("Snap to grid", "", "wb-btn wb-btn--small", () => board.toggleSnap(), { "aria-pressed": "false", text: "Snap" });
  const lockButton = button("Lock or unlock selected (Ctrl+L)", "🔒", "wb-btn", () => board.toggleLock(), { text: "Lock" });
  const frontButton = button("Bring to front (Ctrl+])", "⬆", "wb-btn", () => board.reorder(1), { text: "Front" });
  const backButton = button("Send to back (Ctrl+[)", "⬇", "wb-btn", () => board.reorder(-1), { text: "Back" });
  const imageInput = el("input"); imageInput.type = "file"; imageInput.accept = "image/png,image/jpeg,image/webp"; imageInput.hidden = true; imageInput.setAttribute("aria-label", "Choose a picture to add");
  imageInput.addEventListener("change", () => { const file = imageInput.files && imageInput.files[0]; imageInput.value = ""; if (file) board.insertImageFile(file); });
  const imageButton = button("Add a picture", "🖼️", "wb-btn", () => imageInput.click(), { text: "Picture" });
  const templateSelect = el("select", "wb-select"); templateSelect.setAttribute("aria-label", "Add a template");
  const placeholder = el("option", "", "Templates…"); placeholder.value = ""; templateSelect.append(placeholder);
  for (const template of TEMPLATES) { const option = el("option", "", template.name); option.value = template.id; option.title = template.description; templateSelect.append(option); }
  templateSelect.addEventListener("change", () => { if (templateSelect.value) board.insertTemplate(templateSelect.value); templateSelect.value = ""; });
  const backgroundSelect = el("select", "wb-select"); backgroundSelect.setAttribute("aria-label", "Background");
  for (const name of BACKGROUNDS) { const option = el("option", "", name === "blank" ? "Blank" : name === "grid" ? "Grid" : name === "dots" ? "Dots" : "Lined"); option.value = name; backgroundSelect.append(option); }
  backgroundSelect.addEventListener("change", () => sync.updatePageMeta(currentPage, { bg: backgroundSelect.value }));
  const paperButton = button("Dark or light paper", "◐", "wb-btn", () => sync.updatePageMeta(currentPage, { paper: board.meta.paper === "dark" ? "light" : "dark" }), { text: "Paper" });
  const exportSelect = el("select", "wb-select"); exportSelect.setAttribute("aria-label", "Save or export");
  const exportOptions = [["", "Save as…"], ["png", "Picture (PNG)"], ["svg", "Vector (SVG)"], ["pdf", "Document (PDF)"]];
  if (isTeacher && scope === "shared") exportOptions.push(["snapshot", "Send snapshot to student"]);
  for (const [value, label] of exportOptions) { const option = el("option", "", label); option.value = value; exportSelect.append(option); }
  exportSelect.addEventListener("change", () => { const choice = exportSelect.value; exportSelect.value = ""; if (choice) runExport(choice); });
  const clearButton = button("Clear this page", "🧹", "wb-btn", clearBoard, { text: "Clear" });
  const helpButton = button("Keyboard help", "?", "wb-btn", () => { help.hidden = !help.hidden; helpButton.setAttribute("aria-expanded", String(!help.hidden)); }, { "aria-expanded": "false", "aria-controls": "wbHelp" });
  const group = (label, ...items) => { const g = el("div", "wb-group"); g.setAttribute("role", "group"); g.setAttribute("aria-label", label); g.append(...items); return g; };
  bottom.append(group("History", undoButton, redoButton), group("Selection", deleteButton, duplicateButton, lockButton, frontButton, backButton), group("Zoom", zoomOut, zoomLabel, zoomIn, fitButton, snapButton), group("Add", imageButton, imageInput, templateSelect), group("Page", backgroundSelect, paperButton, exportSelect, clearButton, helpButton));

  const help = el("div", "wb-help"); help.id = "wbHelp"; help.hidden = true;
  help.append(el("h3", "", "Keyboard"), ...[
    "Tools: V select, H pan, P pen, M highlighter, E eraser, L laser, I line, A arrow, R rectangle, O ellipse, G triangle, T text, N sticky note.",
    "Select an object with [ and ] (previous and next), or click it. Arrow keys move it (Shift = bigger steps, Alt = tiny steps). Enter edits text.",
    "Delete removes it. Ctrl+Z undo, Ctrl+Shift+Z redo, Ctrl+D duplicate, Ctrl+C / Ctrl+V copy and paste, Ctrl+A select all, Ctrl+L lock.",
    "Zoom: plus and minus, 0 fits everything, 1 is 100%. Hold Space and drag, or use two fingers, to move around."
  ].map(text => el("p", "", text)));

  const outline = el("details", "wb-outline"); const outlineSummary = el("summary", "", "Board contents"); const outlineList = el("ul", "wb-outline__list");
  outline.append(outlineSummary, outlineList);
  const snapshotBox = el("details", "wb-snapshots"); snapshotBox.hidden = true; const snapshotList = el("ul", "wb-snapshots__list");
  snapshotBox.append(el("summary", "", "Snapshots from your teacher"), snapshotList);
  root.insertBefore(help, live); root.insertBefore(outline, live); root.insertBefore(snapshotBox, live);

  // ---- rendering the UI from state -------------------------------------------------------------------------------------------------
  function refreshUi() {
    const s = board.snapshotState();
    for (const [id, node] of toolButtons) { node.setAttribute("aria-pressed", String(s.tool === id)); node.disabled = !s.canDraw && !["select", "hand", "laser"].includes(id); }
    eraserMode.setAttribute("aria-pressed", String(s.eraserMode === "area")); eraserMode.querySelector(".wb-label").textContent = s.eraserMode === "area" ? "Erase part" : "Erase whole";
    eraserMode.hidden = s.tool !== "eraser"; eraserMode.disabled = !s.canDraw;
    swatchButtons.forEach(node => node.setAttribute("aria-pressed", String(node.dataset.colour === s.style.c)));
    widthButtons.forEach(node => node.setAttribute("aria-pressed", String(Number(node.dataset.width) === s.style.w)));
    widthRange.value = String(Math.round(s.style.w)); opacityRange.value = String(Math.round((s.style.o ?? 1) * 100));
    fillToggle.setAttribute("aria-pressed", String(Boolean(s.style.f))); boldToggle.setAttribute("aria-pressed", String(Boolean(s.style.b))); underlineToggle.setAttribute("aria-pressed", String(Boolean(s.style.u)));
    fontSelect.value = String(FONT_SIZES.includes(s.style.fs) ? s.style.fs : 24);
    snapButton.setAttribute("aria-pressed", String(s.snap));
    undoButton.disabled = !s.canUndo || !s.canDraw; redoButton.disabled = !s.canRedo || !s.canDraw;
    const hasSelection = s.selection.length > 0;
    for (const node of [deleteButton, duplicateButton, lockButton, frontButton, backButton]) node.disabled = !hasSelection || !s.canDraw;
    for (const node of [imageButton, templateSelect, backgroundSelect, paperButton, clearButton]) node.disabled = !s.canDraw && node !== backgroundSelect && node !== paperButton ? true : node.disabled;
    const mayPage = scope === "personal" ? !isTeacher : isTeacher;
    backgroundSelect.disabled = !mayPage; paperButton.disabled = !mayPage; clearButton.disabled = !(mayPage && s.canDraw) && !(isTeacher && scope === "shared");
    imageButton.disabled = !s.canDraw; templateSelect.disabled = !s.canDraw;
    zoomLabel.textContent = `${Math.round(s.zoom * 100)}%`;
    const image = board.selectionObjects().find(object => object.t === "image");
    altBox.hidden = !(image && s.selection.length === 1); if (image && document.activeElement !== altInput) altInput.value = image.alt || "";
    stylePanel.dataset.tool = s.tool;
  }

  function renderModeBox() {
    modeBox.replaceChildren();
    if (scope === "personal") { modeBox.append(el("span", "wb-badge", isTeacher ? "Reading the student's own board" : "Your own board: only you and your teacher can see it")); return; }
    if (isTeacher) {
      const select = el("select", "wb-select"); select.setAttribute("aria-label", "What the student can do");
      for (const [value, label] of [["view", "Student can watch"], ["draw", "Student can draw"], ["teacher-only", "Hidden from student"]]) { const o = el("option", "", label); o.value = value; select.append(o); }
      select.value = mode; select.addEventListener("change", () => sync.setMode(select.value).then(result => { if (!result.ok) notify("The mode could not be changed."); else announce(`Student mode: ${select.options[select.selectedIndex].text}`); }));
      const control = button(mode === "draw" ? "Take control: stop the student drawing" : "Give control: let the student draw", "", "wb-btn wb-btn--small", () => sync.setMode(mode === "draw" ? "view" : "draw"), { text: mode === "draw" ? "Take control" : "Give control", "data-action-name": "control" });
      modeBox.append(select, control);
    } else modeBox.append(el("span", "wb-badge", MODE_TEXT[mode]));
  }

  function renderScopes() {
    scopeTabs.replaceChildren();
    if (available.length < 2) return;
    for (const value of available) {
      const label = value === "shared" ? "Class board" : isTeacher ? "Student's own board" : "My own board";
      const node = button(label, "", "wb-tab", () => { if (scope !== value) { scope = value; connect(); renderScopes(); } }, { "aria-pressed": String(scope === value), text: label });
      scopeTabs.append(node);
    }
  }

  function renderPages() {
    pageStrip.replaceChildren();
    pages.forEach((page, index) => {
      const node = button(`Page ${index + 1}: ${page.title}`, "", "wb-page", () => gotoPage(page.id), { "aria-pressed": String(page.id === currentPage), "aria-current": page.id === currentPage ? "page" : "false" });
      const url = thumbs.get(page.id);
      if (url) { const img = el("img", "wb-page__thumb"); img.src = url; img.alt = ""; node.append(img); } else node.append(el("span", "wb-page__blank"));
      node.append(el("span", "wb-page__label", String(index + 1)));
      pageStrip.append(node);
      if (!thumbs.has(page.id) && sync) { thumbs.set(page.id, ""); refreshThumb(page.id); }
    });
    const mayPage = scope === "personal" ? !isTeacher : isTeacher;
    if (mayPage) {
      pageStrip.append(button("Add a page", "+", "wb-page wb-page--add", async () => {
        const pending = sync.addPage(`Page ${pages.length + 1}`, pages.length);
        if (sync.lastAdded) gotoPage(sync.lastAdded);
        const result = await pending;
        if (!result.ok) notify(result.reason === "pages" ? "That is the most pages this board can have." : "A page could not be added.");
      }));
      if (pages.length > 1) pageStrip.append(button("Delete this page", "✕", "wb-page wb-page--add", async () => { if (!confirm("Delete this whole page and everything on it?")) return; const id = currentPage; currentPage = null; await sync.removePage(id); thumbs.delete(id); }));
    }
  }

  function renderBackgroundControls() { backgroundSelect.value = board.meta.bg; }
  function renderStatus() { status.textContent = connected ? "" : "Offline: your changes will be saved when you are back online."; status.hidden = connected; }
  function updateEmpty() {
    let message = "";
    if (denied) message = scope === "shared" && !isTeacher ? MODE_TEXT["teacher-only"] : "You do not have access to this board.";
    else if (!pages.length && !(scope === "personal" ? !isTeacher : isTeacher)) message = scope === "shared" ? "Waiting for your teacher to open the board." : "This student has not started their own board yet.";
    empty.textContent = message; empty.hidden = !message;
  }

  let outlineTimer = 0;
  function renderOutline() {
    clearTimeout(outlineTimer);
    outlineTimer = setTimeout(() => {
      const items = board.outline(); outlineList.replaceChildren(); outlineSummary.textContent = `Board contents (${items.length})`;
      if (!items.length) { outlineList.append(el("li", "", "Nothing with words or pictures on this page yet.")); return; }
      for (const item of items) { const li = el("li"); const go = button(`${item.type === "image" ? "Picture" : item.type === "sticky" ? "Sticky note" : "Text"}: ${item.label}`, "", "wb-linkbtn", () => { board.selectId(item.id); root.focus(); }, { text: `${item.type === "image" ? "Picture" : item.type === "sticky" ? "Sticky note" : "Text"}: ${item.label.slice(0, 120)}` }); li.append(go); outlineList.append(li); }
    }, 250);
  }

  function renderSnapshots() {
    snapshotList.replaceChildren(); snapshotBox.hidden = !snapshots.length || isTeacher;
    for (const snapshot of snapshots) {
      const li = el("li"); li.append(el("span", "", `${snapshot.label} · ${new Date(snapshot.at).toLocaleString()} `));
      snapshot.pages.forEach((page, index) => { const link = el("a", "wb-linkbtn", `Page ${index + 1}`); link.href = page.url; link.download = `${snapshot.label.replace(/[^A-Za-z0-9_-]+/g, "-")}-page-${index + 1}.jpg`; li.append(link, document.createTextNode(" ")); });
      snapshotList.append(li);
    }
  }

  // ---- export and clear ----------------------------------------------------------------------------------------------------------------------
  async function currentData() { return { id: currentPage, objects: board.objects, images: board.images, meta: board.meta }; }
  async function runExport(kind) {
    try {
      const page = await currentData(); const list = [...page.objects.values()]; const base = `whiteboard-${lessonId}`;
      if (kind === "png") { downloadBlob(await pageToBlob(page, 2), `${base}.png`); announce("Picture saved"); }
      else if (kind === "svg") { downloadBlob(new Blob([boardToSvg(list, page.images, { paper: page.meta.paper })], { type: "image/svg+xml" }), `${base}.svg`); announce("Vector file saved"); }
      else if (kind === "pdf") {
        const sheets = [];
        for (const info of pages) {
          const data = info.id === currentPage ? page : await sync.readPage(info.id);
          const items = [...data.objects.values()]; const bounds = contentBounds(items);
          const canvas = await renderToCanvas({ renderer: sharedPainter(), objects: items, images: data.images, bounds, paper: data.meta.paper, background: data.meta.bg, scale: Math.min(1.5, 1800 / Math.max(bounds.w, bounds.h)) });
          sheets.push({ jpeg: dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.85)), w: canvas.width, h: canvas.height });
        }
        downloadBlob(new Blob([buildPdf(sheets)], { type: "application/pdf" }), `${base}.pdf`); announce("Document saved");
      } else if (kind === "snapshot") {
        const result = await saveSnapshot({ db, sync, code, lessonId, uid, label: `Class board ${new Date().toLocaleDateString()}` });
        notify(result.ok ? `Snapshot sent: ${result.pages} page${result.pages === 1 ? "" : "s"}. The student will see it under Snapshots.` : result.reason === "empty" ? "There is nothing on the board to save yet." : "The snapshot could not be saved.");
      }
    } catch (error) { console.error("Whiteboard export failed", error); notify("That could not be saved."); }
  }
  async function clearBoard() {
    if (!confirm(scope === "shared" ? "Clear the whole class board page for everyone?" : "Clear this whole page?")) return;
    const result = await sync.clearPage(); board.resetHistory();
    notify(result.ok ? "The page is clear." : "The page could not be cleared.");
  }

  // ---- go ---------------------------------------------------------------------------------------------------------------------------------------------
  renderScopes(); connect(); renderStatus(); refreshUi();
  if (onBack) { const back = button("Back to lesson", "←", "wb-btn wb-btn--back", onBack, { text: "Back to lesson" }); top.prepend(back); }
  return {
    board, root,
    get sync() { return sync; },
    destroy() { clearTimeout(thumbTimer); clearTimeout(outlineTimer); if (sync) sync.close(); board.destroy(); host.replaceChildren(); delete window.__whiteboard; },
    resize() { board.renderer.resize(); }
  };
}

export { MODES };
