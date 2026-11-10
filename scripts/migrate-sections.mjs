// Moves every classwork file in content/ to schema v3: the six clock sections and a `grammar` list (one entry per grammar
// topic, named after it, with its rule and the exercise keys it uses). Topics come from the file's own `grammar` list or,
// for v2 files, from scripts/data/grammar-v3.json.
//   node scripts/migrate-sections.mjs --dry-run     (show what would change)
//   node scripts/migrate-sections.mjs               (write; snapshots the old file first)
// Idempotent: files that already validate as v3 are left alone. Exercise text is never edited. Files are written as
// standard two-space JSON, keeping their line endings.
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA_VERSION, buildSections, validateSections } from "../js/sections.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const contentDirectory = join(root, "content");
const snapshotDirectory = join(contentDirectory, "_snapshots");
const topicTable = JSON.parse(readFileSync(join(root, "scripts", "data", "grammar-v3.json"), "utf8"));

export function classworkFiles() {
  return readdirSync(contentDirectory).filter(name => name.endsWith(".json") && name !== "manifest.json" && !name.startsWith("homework_"));
}

export function migrateText(text, name = "", { topics = topicTable } = {}) {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const content = JSON.parse(text);
  if (content.schemaVersion === SCHEMA_VERSION && validateSections(content).length === 0) return { changed: false, text };
  const grammar = Array.isArray(content.grammar) && content.grammar.length ? content.grammar : topics[name];
  if (!grammar) throw new Error(`${name || "This file"} has no grammar topics: add them to scripts/data/grammar-v3.json.`);
  const { schemaVersion, sections, grammar: _old, ...rest } = content;
  const next = { schemaVersion: SCHEMA_VERSION, sections: buildSections({ ...rest, grammar }), grammar, ...rest };
  const errors = validateSections(next);
  if (errors.length) throw new Error(`Migration of ${name || "this file"} produced invalid content: ${errors.join(" ")}`);
  for (const key of Object.keys(rest)) if (JSON.stringify(next[key]) !== JSON.stringify(content[key])) throw new Error(`Migration altered "${key}".`);
  return { changed: true, text: JSON.stringify(next, null, 2).replace(/\n/g, newline) + newline, sections: next.sections, grammar };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dryRun = process.argv.includes("--dry-run");
  let changed = 0;
  for (const name of classworkFiles()) {
    const path = join(contentDirectory, name);
    const result = migrateText(readFileSync(path, "utf8"), name);
    if (!result.changed) { console.log(`unchanged  ${name}`); continue; }
    changed += 1;
    console.log(`${dryRun ? "would change" : "migrated   "} ${name}: ${result.grammar.map((topic, index) => `Grammar ${index + 1} ${topic.title}`).join(" · ")}`);
    if (dryRun) continue;
    mkdirSync(snapshotDirectory, { recursive: true });
    const snapshot = join(snapshotDirectory, name.replace(/\.json$/, ".pre-v3.json"));
    if (!existsSync(snapshot)) copyFileSync(path, snapshot);
    writeFileSync(path, result.text);
  }
  console.log(dryRun ? `Dry run: ${changed} file(s) would change.` : `Done: ${changed} file(s) migrated.`);
}
