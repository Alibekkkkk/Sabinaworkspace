// Draws manga pages, panels and their tappable bubbles, and runs the bottom sheet for a bubble and the dialog for a word.
// DOM APIs and textContent only. Style values are set through the CSS object model, which the page's CSP allows.
import { hotspotStyle, panelFrame } from "./geometry.js";
import { panelsOf } from "./reader-state.js";

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
export function button(label, className, handler, attributes = {}) {
  const node = el("button", className, label); node.type = "button";
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (handler) node.addEventListener("click", handler);
  return node;
}

const TYPE_NAME = { speech: "Speech bubble", thought: "Thought bubble", narration: "Narration box", sfx: "Sound effect" };
export const bubbleNumber = (chapter, bubble) => chapter.pages.flatMap(page => page.panels.flatMap(panel => panel.bubbles)).findIndex(item => item.id === bubble.id) + 1;

// The accessible name of a hotspot. When the student hides bubble text, the name does not give the text away either.
export function bubbleLabel(bubble, number, prefs) {
  const who = bubble.speaker ? `, ${bubble.speaker}` : "";
  return prefs.hideText ? `${TYPE_NAME[bubble.type]} ${number}${who}. Tap to read it.` : `${TYPE_NAME[bubble.type]} ${number}${who}: ${bubble.text}`;
}

function hotspot(bubble, page, number, prefs, whenOpened) {
  const node = button("", `mg-bubble mg-bubble--${bubble.type}`, null, { "aria-label": bubbleLabel(bubble, number, prefs), "aria-haspopup": "dialog" });
  const style = hotspotStyle(bubble.at, page);
  for (const [name, value] of Object.entries(style)) node.style.setProperty(name, value);
  node.dataset.bubble = bubble.id;
  node.append(el("span", "mg-bubble__text", bubble.text), el("span", "mg-bubble__icon", "💬"));
  node.querySelector(".mg-bubble__icon").setAttribute("aria-hidden", "true");
  node.addEventListener("click", () => whenOpened(bubble, node));
  return node;
}

function image(page, eager) {
  const img = document.createElement("img");
  img.src = page.image; img.alt = page.alt; img.width = page.width; img.height = page.height;
  img.loading = eager ? "eager" : "lazy"; img.decoding = "async";
  return img;
}

// A whole page with every bubble of every panel (scroll and page-flip modes).
export function renderPage(page, pageIndex, ctx) {
  const figure = el("figure", `mg-page${ctx.prefs.hideText ? " mg-hide" : ""}`); figure.dataset.page = String(pageIndex);
  figure.style.margin = "0"; figure.setAttribute("aria-label", `Page ${pageIndex + 1} of ${ctx.chapter.pages.length}`);
  const wrap = el("div", "mg-pagewrap");
  wrap.append(image(page, pageIndex === 0 || ctx.eager));
  for (const panel of panelsOf(page, ctx.direction)) for (const bubble of panel.bubbles) wrap.append(hotspot(bubble, page, ctx.number(bubble), ctx.prefs, ctx.whenBubble));
  figure.append(wrap);
  return figure;
}

// One panel, zoomed to fill the frame (panel-by-panel mode). Only this panel's bubbles are in the page, so the keyboard
// never lands on a bubble that is out of view.
export function renderPanel(page, pageIndex, panel, ctx) {
  const frame = el("div", `mg-frame${ctx.prefs.hideText ? " mg-hide" : ""}`); frame.dataset.page = String(pageIndex);
  frame.setAttribute("role", "group"); frame.setAttribute("aria-label", `Page ${pageIndex + 1}, panel: ${panel.summary}`);
  const geometry = panelFrame(panel.bbox, page);
  frame.style.aspectRatio = String(geometry.aspect);
  const wrap = el("div", "mg-pagewrap");
  wrap.style.width = `${geometry.imageWidth}%`; wrap.style.left = `${geometry.left}%`; wrap.style.top = `${geometry.top}%`;
  wrap.append(image(page, true));
  for (const bubble of panel.bubbles) wrap.append(hotspot(bubble, page, ctx.number(bubble), ctx.prefs, ctx.whenBubble));
  frame.append(wrap);
  return frame;
}

// ---- the bottom sheet for a bubble and the dialog for a word ---------------------------------------------------------------------
export function wordPattern(words) {
  const terms = [...new Set(words.map(item => item.word))].sort((a, b) => b.length - a.length);
  return terms.length ? new RegExp(`(${terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi") : null;
}

// Text with the words that have a meaning turned into buttons.
export function paintWords(host, text, words, whenWord) {
  host.replaceChildren();
  const pattern = wordPattern(words);
  if (!pattern) { host.textContent = text; return; }
  text.split(pattern).forEach(part => {
    const item = words.find(entry => entry.word.toLocaleLowerCase() === part.toLocaleLowerCase());
    if (!item) { if (part) host.append(document.createTextNode(part)); return; }
    host.append(button(part, "mg-word", () => whenWord(item), { "aria-label": `Meaning of ${part}` }));
  });
}

export function createSheets({ $, chapter, getPrefs, saveSentence, saveWord, speak }) {
  const sheet = $("sheet"); const wordDialog = $("wordDialog");
  let current = null; let invoker = null; let wordInvoker = null; let currentWord = null;
  const allWords = bubble => { const map = new Map(); for (const item of [...(bubble.vocabulary || []), ...(chapter.vocabulary || [])]) if (!map.has(item.word.toLocaleLowerCase())) map.set(item.word.toLocaleLowerCase(), item); return [...map.values()]; };

  function showTranslation(visible) {
    $("sheetTranslation").hidden = !visible;
    $("translationToggle").setAttribute("aria-expanded", String(visible));
    $("translationToggle").textContent = visible ? "Hide translation" : "Show translation";
  }

  function openWord(item, from) {
    currentWord = item; wordInvoker = from || null;
    $("wordTitle").textContent = item.word; $("wordTranslation").textContent = item.translation || "";
    $("wordMeaning").textContent = item.meaning; $("wordExample").textContent = item.example ? `Example: ${item.example}` : "";
    $("wordStatus").textContent = ""; $("wordSave").disabled = false; $("wordSave").textContent = "Save word";
    if (!wordDialog.open) wordDialog.showModal();
    $("wordSave").focus();
  }

  function openBubble(bubble, from) {
    current = bubble; invoker = from || null;
    $("sheetTitle").textContent = bubble.speaker || TYPE_NAME[bubble.type];
    paintWords($("sheetOriginal"), bubble.text, allWords(bubble), item => openWord(item, null));
    $("sheetSimple").textContent = bubble.simplified;
    $("sheetTranslationBox").hidden = !bubble.translation;
    if (bubble.translation) { $("sheetTranslation").textContent = bubble.translation; showTranslation(getPrefs().translation); }
    $("sheetGrammar").hidden = !bubble.grammarNote; $("sheetGrammar").textContent = bubble.grammarNote ? `Grammar: ${bubble.grammarNote}` : "";
    $("sheetStatus").textContent = ""; $("sheetSave").disabled = false; $("sheetSave").textContent = "Save sentence";
    if (!sheet.open) sheet.showModal();
    $("sheetClose").focus();
  }

  $("sheetClose").addEventListener("click", () => sheet.close());
  sheet.addEventListener("close", () => { if (invoker && invoker.isConnected) invoker.focus(); });
  $("translationToggle").addEventListener("click", () => showTranslation($("sheetTranslation").hidden));
  $("sheetRead").addEventListener("click", () => { if (current) $("sheetStatus").textContent = speak(current) || ""; });
  $("sheetSave").addEventListener("click", async () => {
    if (!current) return;
    $("sheetSave").disabled = true;
    try { await saveSentence(current); $("sheetSave").textContent = "Saved"; $("sheetStatus").textContent = "Saved to your vocabulary collection."; }
    catch (error) { $("sheetSave").disabled = false; $("sheetStatus").textContent = `Could not save: ${error.message}`; }
  });
  $("wordClose").addEventListener("click", () => wordDialog.close());
  wordDialog.addEventListener("close", () => { if (wordInvoker && wordInvoker.isConnected) wordInvoker.focus(); else if (sheet.open) $("sheetClose").focus(); });
  $("wordSave").addEventListener("click", async () => {
    if (!currentWord) return;
    $("wordSave").disabled = true;
    try { await saveWord(currentWord); $("wordSave").textContent = "Saved"; $("wordStatus").textContent = "Saved to your vocabulary collection."; }
    catch (error) { $("wordSave").disabled = false; $("wordStatus").textContent = `Could not save: ${error.message}`; }
  });
  return { openBubble, openWord, close() { if (sheet.open) sheet.close(); if (wordDialog.open) wordDialog.close(); } };
}
