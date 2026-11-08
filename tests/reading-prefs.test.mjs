import assert from "node:assert/strict";
import test from "node:test";
import { applyReadingPrefs, DEFAULT_READING_PREFS, loadReadingPrefs, READING_PREFS_KEY, sanitizeReadingPrefs, saveReadingPrefs } from "../js/reading-prefs.js";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: key => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, String(value)), data };
}

test("defaults are used for missing, malformed or hostile data", () => {
  assert.deepEqual(sanitizeReadingPrefs(undefined), DEFAULT_READING_PREFS);
  assert.deepEqual(sanitizeReadingPrefs("big"), DEFAULT_READING_PREFS);
  assert.deepEqual(sanitizeReadingPrefs({ size: "huge", spacing: "<script>", font: "comic", calm: "yes" }), DEFAULT_READING_PREFS);
  assert.deepEqual(sanitizeReadingPrefs({ size: "xl", spacing: "wide", font: "dyslexia", calm: true }), { size: "xl", spacing: "wide", font: "dyslexia", calm: true });
  assert.deepEqual(sanitizeReadingPrefs({ size: "l", extra: "ignored" }), { ...DEFAULT_READING_PREFS, size: "l" });
});

test("preferences round-trip through storage and survive corrupt JSON", () => {
  const storage = memoryStorage();
  saveReadingPrefs({ size: "l", spacing: "wide", font: "sans", calm: true }, storage);
  assert.deepEqual(loadReadingPrefs(storage), { size: "l", spacing: "wide", font: "sans", calm: true });
  assert.deepEqual(loadReadingPrefs(memoryStorage({ [READING_PREFS_KEY]: "{not json" })), DEFAULT_READING_PREFS);
  assert.deepEqual(loadReadingPrefs({ getItem() { throw new Error("blocked"); } }), DEFAULT_READING_PREFS);
  assert.doesNotThrow(() => saveReadingPrefs(DEFAULT_READING_PREFS, { setItem() { throw new Error("quota"); } }));
});

test("applying preferences sets only whitelisted data attributes", () => {
  const root = { dataset: {} };
  applyReadingPrefs({ size: "xl", spacing: "wide", font: "dyslexia", calm: true }, root);
  assert.deepEqual(root.dataset, { readingSize: "xl", readingSpacing: "wide", readingFont: "dyslexia", calm: "true" });
  applyReadingPrefs({ size: "\"><img src=x>" }, root);
  assert.equal(root.dataset.readingSize, "m");
});
