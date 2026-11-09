import assert from "node:assert/strict";
import test from "node:test";
import { FEATURE_NAMES, FEATURES, describeFlags, hasFeature, isFeature, manifestFeatures, notEnabledMessage } from "../js/features.js";

test("an explicit teacher choice always wins, then the lesson's marker, then the default", () => {
  assert.equal(hasFeature({ mangaReader: true }, "mangaReader"), true);
  assert.equal(hasFeature({ mangaReader: false }, "mangaReader", { mangaReader: true }), false, "the teacher can switch it off even if the lesson turns it on");
  assert.equal(hasFeature({}, "mangaReader", { mangaReader: true }), true);
  assert.equal(hasFeature(null, "mangaReader"), false, "the manga reader is off by default");
  assert.equal(hasFeature(null, "clipLab"), true); assert.equal(hasFeature({ clipLab: false }, "clipLab"), false);
  assert.equal(hasFeature({ whiteboard: "yes" }, "whiteboard"), true, "junk is ignored and the default applies");
});

test("unknown flags are never on", () => {
  assert.equal(hasFeature({ hacker: true }, "hacker"), false); assert.equal(isFeature("hacker"), false); assert.equal(isFeature("clipLab"), true);
  assert.equal(hasFeature({ __proto__: { mangaReader: true } }, "toString"), false);
  assert.deepEqual([...FEATURE_NAMES], ["mangaReader", "clipLab", "whiteboard", "listeningTrainer"]);
});

test("the teacher's panel says where each value comes from", () => {
  const rows = describeFlags({ clipLab: false }, { mangaReader: true });
  const byName = Object.fromEntries(rows.map(row => [row.name, row]));
  assert.deepEqual([byName.clipLab.enabled, byName.clipLab.source], [false, "teacher"]);
  assert.deepEqual([byName.mangaReader.enabled, byName.mangaReader.source], [true, "lesson"]);
  assert.deepEqual([byName.whiteboard.enabled, byName.whiteboard.source], [true, "default"]);
  assert.ok(rows.every(row => row.label && row.description));
});

test("manifest defaults keep only real boolean flags and messages are friendly", () => {
  assert.deepEqual(manifestFeatures({ features: { mangaReader: true, nonsense: true, clipLab: "x" } }), { mangaReader: true });
  assert.deepEqual(manifestFeatures({}), {}); assert.deepEqual(manifestFeatures(null), {});
  assert.match(notEnabledMessage("mangaReader"), /Manga reader is not switched on for your account/);
  assert.match(notEnabledMessage("nope"), /^This feature is not switched on/);
  assert.equal(FEATURES.mangaReader.default, false);
});
