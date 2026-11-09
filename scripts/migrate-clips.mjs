// One-off, safe to repeat: rewrites version 1 clip files in content/clips as version 2 (see js/clips/schema-v2.js).
// Timing stays marked unverified because nobody has checked it against the video. Usage: node scripts/migrate-clips.mjs
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { migrateV1, validateClipV2 } from "../js/clips/schema-v2.js";

const folder = new URL("../content/clips/", import.meta.url);
let changed = 0;
for (const file of readdirSync(folder).filter(name => name.endsWith(".json"))) {
  const clip = JSON.parse(readFileSync(new URL(file, folder), "utf8"));
  if (clip.schemaVersion === 2) { console.log(`${file}: already version 2`); continue; }
  const next = migrateV1(clip);
  validateClipV2(next, { requireAnswers: false });
  writeFileSync(new URL(file, folder), `${JSON.stringify(next, null, 2)}\n`);
  console.log(`${file}: migrated to version 2 (timing unverified)`); changed++;
}
console.log(`${changed} file(s) changed.`);
