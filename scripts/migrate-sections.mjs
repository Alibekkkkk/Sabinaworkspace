// Adds schemaVersion 2 and the three standard sections to every classwork file in content/.
//   node scripts/migrate-sections.mjs --dry-run     (show what would change)
//   node scripts/migrate-sections.mjs               (write; snapshots the old file first)
// Idempotent: files that already validate as schema v2 are left alone. Lesson text is never edited;
// the two new keys are inserted textually at the top so the rest of each file keeps its formatting.
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSections, validateSections } from "../js/sections.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const contentDirectory = join(root, "content");
const snapshotDirectory = join(contentDirectory, "_snapshots");

export function classworkFiles() {
  return readdirSync(contentDirectory).filter(name => name.endsWith(".json") && name !== "manifest.json" && !name.startsWith("homework_"));
}

export function migrateText(text) {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const content = JSON.parse(text);
  if (content.schemaVersion === 2 && validateSections(content).length === 0) return { changed: false, text };
  if (content.schemaVersion === 2 || "sections" in content) throw new Error("File has partial schema v2 data; fix it by hand instead of migrating.");
  const sections = buildSections(content);
  const pad = "  ";
  const block = [
    `${pad}"schemaVersion": 2,`,
    `${pad}"sections": [`,
    ...sections.map((section, index) => `${pad}${pad}${JSON.stringify(section)}${index < sections.length - 1 ? "," : ""}`),
    `${pad}],`
  ].join(newline);
  const open = text.indexOf("{");
  const migrated = text.slice(0, open + 1) + newline + block + text.slice(open + 1);
  const check = JSON.parse(migrated);
  const errors = validateSections(check);
  if (errors.length) throw new Error(`Migration produced invalid sections: ${errors.join(" ")}`);
  for (const key of Object.keys(content)) if (JSON.stringify(check[key]) !== JSON.stringify(content[key])) throw new Error(`Migration altered "${key}".`);
  return { changed: true, text: migrated, sections };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dryRun = process.argv.includes("--dry-run");
  let changed = 0;
  for (const name of classworkFiles()) {
    const path = join(contentDirectory, name);
    const result = migrateText(readFileSync(path, "utf8"));
    if (!result.changed) { console.log(`unchanged  ${name}`); continue; }
    changed += 1;
    console.log(`${dryRun ? "would change" : "migrated   "} ${name}: ${result.sections.map(section => `${section.id} ${section.estimatedMinutes}m`).join(", ")}`);
    if (dryRun) continue;
    mkdirSync(snapshotDirectory, { recursive: true });
    const snapshot = join(snapshotDirectory, name.replace(/\.json$/, ".pre-sections.json"));
    if (!existsSync(snapshot)) copyFileSync(path, snapshot);
    writeFileSync(path, result.text);
  }
  console.log(dryRun ? `Dry run: ${changed} file(s) would change.` : `Done: ${changed} file(s) migrated.`);
}
