// Where the reader is, how it moves, and what the student prefers. Pure functions plus tiny storage helpers that never throw.
import { orderPanels } from "./geometry.js";

export const MODES = Object.freeze(["scroll", "flip", "panel"]);
export const MODE_LABELS = Object.freeze({ scroll: "Scroll", flip: "Page flip", panel: "Panel by panel" });
export const DEFAULT_PREFS = Object.freeze({ mode: "", direction: "", fontScale: 1, highContrast: false, hideText: false, translation: false });
export const FONT_SCALES = Object.freeze([0.85, 1, 1.2, 1.45]);

export const positionKey = (code, mangaId, chapterId) => `manga.pos.v1:${code}:${mangaId}:${chapterId}`;
export const PREFS_KEY = "manga.prefs.v1";

// "ltr" or "rtl" for flipping; "vertical" stories (webtoons) read top to bottom and always start in scroll mode.
export function effectiveDirection(manga, prefs = DEFAULT_PREFS) {
  if (manga.readingDirection === "vertical") return "vertical";
  return prefs.direction === "ltr" || prefs.direction === "rtl" ? prefs.direction : manga.readingDirection;
}

export function defaultMode(manga, prefs = DEFAULT_PREFS) {
  if (MODES.includes(prefs.mode)) return prefs.mode;
  return manga.readingDirection === "vertical" ? "scroll" : "flip";
}

export function normalisePrefs(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    mode: MODES.includes(input.mode) ? input.mode : "",
    direction: input.direction === "ltr" || input.direction === "rtl" ? input.direction : "",
    fontScale: FONT_SCALES.includes(input.fontScale) ? input.fontScale : 1,
    highContrast: input.highContrast === true, hideText: input.hideText === true, translation: input.translation === true
  };
}

export function loadPrefs(storage = globalThis.localStorage) { try { return normalisePrefs(JSON.parse(storage.getItem(PREFS_KEY))); } catch (error) { return { ...DEFAULT_PREFS }; } }
export function savePrefs(prefs, storage = globalThis.localStorage) { try { storage.setItem(PREFS_KEY, JSON.stringify(normalisePrefs(prefs))); } catch (error) { /* not remembered */ } }

// The panels of a page in reading order for the chosen direction.
export const panelsOf = (page, direction) => orderPanels(page.panels, direction === "rtl" ? "rtl" : "ltr");

// Every panel of the chapter as { page, panel } in reading order: the steps of panel-by-panel mode.
export function panelSteps(chapter, direction) {
  return chapter.pages.flatMap((page, pageIndex) => panelsOf(page, direction).map(panel => ({ pageIndex, panel })));
}

// Keep a saved position inside the chapter (the chapter may have changed since it was saved).
export function clampPosition(position, chapter, direction = "ltr") {
  const input = position && typeof position === "object" ? position : {};
  const page = Math.min(Math.max(Number.isInteger(input.page) ? input.page : 0, 0), chapter.pages.length - 1);
  const count = chapter.pages[page].panels.length;
  const panel = Math.min(Math.max(Number.isInteger(input.panel) ? input.panel : 0, 0), count - 1);
  void direction;
  return { page, panel, mode: MODES.includes(input.mode) ? input.mode : "" };
}

export function loadPosition(storage, key, chapter, direction = "ltr") {
  try { const saved = JSON.parse(storage.getItem(key)); return saved ? clampPosition(saved, chapter, direction) : null; } catch (error) { return null; }
}
export function savePosition(storage, key, position) {
  try { storage.setItem(key, JSON.stringify({ page: position.page, panel: position.panel, mode: position.mode })); } catch (error) { /* not remembered */ }
}

// One step forward (+1) or back (-1). Page modes move one page; panel mode moves one panel and crosses page edges.
// Returns the new position and `edge`: "start" or "end" when the move ran out of chapter, else "".
export function step(chapter, position, delta, direction = "ltr") {
  const mode = position.mode;
  if (mode === "panel") {
    const steps = panelSteps(chapter, direction);
    const current = Math.max(0, steps.findIndex(item => item.pageIndex === position.page && item.panel === panelsOf(chapter.pages[position.page], direction)[position.panel]));
    const next = current + delta;
    if (next < 0) return { position, edge: "start" };
    if (next >= steps.length) return { position, edge: "end" };
    const target = steps[next];
    return { position: { ...position, page: target.pageIndex, panel: panelsOf(chapter.pages[target.pageIndex], direction).indexOf(target.panel) }, edge: "" };
  }
  const page = position.page + delta;
  if (page < 0) return { position, edge: "start" };
  if (page >= chapter.pages.length) return { position, edge: "end" };
  return { position: { ...position, page, panel: 0 }, edge: "" };
}

// Arrow keys follow the reading direction: in a right-to-left story the left arrow goes forward.
export function keyDelta(key, direction = "ltr", mode = "flip") {
  if (mode === "scroll") return 0; // the browser scrolls; the page buttons do the rest
  if (key === "PageDown" || key === "ArrowDown") return 1;
  if (key === "PageUp" || key === "ArrowUp") return -1;
  if (key === "ArrowRight") return direction === "rtl" ? -1 : 1;
  if (key === "ArrowLeft") return direction === "rtl" ? 1 : -1;
  return 0;
}

// How much of the chapter has been reached, as a whole-chapter count of pages (the highest page seen counts).
export const pagesReached = (highestPage, chapter) => Math.min(chapter.pages.length, Math.max(0, highestPage + 1));
