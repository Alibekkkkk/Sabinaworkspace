// Reading comfort preferences: text size, line spacing, font and Calm mode.
// Saved per device in localStorage and applied as data attributes on <html> (see css/components/feedback.css).
export const READING_PREFS_KEY = "nd_reading_prefs_v1";
export const READING_OPTIONS = Object.freeze({
  size: ["s", "m", "l", "xl"],
  spacing: ["normal", "wide"],
  font: ["serif", "sans", "dyslexia"],
  calm: [false, true]
});
export const DEFAULT_READING_PREFS = Object.freeze({ size: "m", spacing: "normal", font: "serif", calm: false });

// Only whitelisted values survive, so stored or tampered data can never inject an attribute value.
export function sanitizeReadingPrefs(value) {
  const input = value && typeof value === "object" ? value : {};
  const next = { ...DEFAULT_READING_PREFS };
  for (const key of Object.keys(READING_OPTIONS)) {
    if (READING_OPTIONS[key].includes(input[key])) next[key] = input[key];
  }
  return next;
}

export function loadReadingPrefs(storage = globalThis.localStorage) {
  try {
    return sanitizeReadingPrefs(JSON.parse(storage.getItem(READING_PREFS_KEY)));
  } catch (error) {
    return { ...DEFAULT_READING_PREFS };
  }
}

export function saveReadingPrefs(prefs, storage = globalThis.localStorage) {
  try {
    storage.setItem(READING_PREFS_KEY, JSON.stringify(sanitizeReadingPrefs(prefs)));
  } catch (error) {
    console.error("Reading preferences could not be saved:", error);
  }
}

export function applyReadingPrefs(prefs, root = document.documentElement) {
  const safe = sanitizeReadingPrefs(prefs);
  root.dataset.readingSize = safe.size;
  root.dataset.readingSpacing = safe.spacing;
  root.dataset.readingFont = safe.font;
  root.dataset.calm = String(safe.calm);
  return safe;
}

const LABELS = {
  size: ["Text size", [["s", "A−"], ["m", "A"], ["l", "A+"], ["xl", "A++"]]],
  spacing: ["Line spacing", [["normal", "Normal"], ["wide", "Wide"]]],
  font: ["Font", [["serif", "Book"], ["sans", "Clean"], ["dyslexia", "Easy read"]]],
  calm: ["Motion", [["false", "Normal"], ["true", "Calm"]]]
};

let current = { ...DEFAULT_READING_PREFS };
let panel = null;

function render() {
  if (!panel) return;
  for (const button of panel.querySelectorAll("button[data-pref]")) {
    button.setAttribute("aria-pressed", String(String(current[button.dataset.pref]) === button.dataset.value));
  }
}

function buildPanel() {
  const element = document.createElement("section");
  element.id = "readingPrefs";
  element.className = "ds-card ds-reading-panel";
  element.hidden = true;
  element.setAttribute("aria-label", "Reading settings");
  for (const [key, [label, options]] of Object.entries(LABELS)) {
    const row = document.createElement("div");
    row.className = "ds-reading-prefs";
    const name = document.createElement("span");
    name.className = "ds-field__label";
    name.textContent = label;
    const group = document.createElement("div");
    group.className = "ds-segmented";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", label);
    for (const [value, text] of options) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.pref = key;
      button.dataset.value = value;
      button.textContent = text;
      group.append(button);
    }
    row.append(name, group);
    element.append(row);
  }
  const note = document.createElement("p");
  note.className = "ds-field__hint";
  note.textContent = "Saved on this device. Calm mode removes animations and confetti.";
  element.append(note);
  return element;
}

function togglePanel(trigger) {
  if (!panel) {
    panel = buildPanel();
    document.body.append(panel);
    render();
  }
  panel.hidden = !panel.hidden;
  trigger.setAttribute("aria-expanded", String(!panel.hidden));
  if (!panel.hidden) panel.querySelector("button[aria-pressed='true']")?.focus();
}

// One document listener, whitelisted actions only. Buttons carry data-action="toggle-reading-prefs".
export function initReadingPrefs() {
  current = applyReadingPrefs(loadReadingPrefs());
  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const trigger = target.closest('[data-action="toggle-reading-prefs"]');
    if (trigger) { togglePanel(trigger); return; }
    const choice = target.closest("button[data-pref]");
    if (choice && panel && panel.contains(choice) && choice.dataset.pref in READING_OPTIONS) {
      const key = choice.dataset.pref;
      const value = key === "calm" ? choice.dataset.value === "true" : choice.dataset.value;
      current = applyReadingPrefs({ ...current, [key]: value });
      saveReadingPrefs(current);
      render();
    }
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && panel && !panel.hidden) {
      panel.hidden = true;
      document.querySelector('[data-action="toggle-reading-prefs"]')?.setAttribute("aria-expanded", "false");
      document.querySelector('[data-action="toggle-reading-prefs"]')?.focus();
    }
  });
}
