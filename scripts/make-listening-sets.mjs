// Builds content/listening/<student>.json from the sentences in scripts/data/listening-sentences.json:
//   node scripts/make-listening-sets.mjs            (writes; existing files are only replaced with --force)
// Gaps come from the same helper as the import tool (lesson target words are hidden first). Every set is checked with the
// listening schema, and its manifest entry gets a listeningFile so the lesson, the portal and the listening page find it.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { draftItemsFromSentences, validateListeningPack } from "../js/listening/schema.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = path => JSON.parse(readFileSync(join(root, path), "utf8"));
const write = (path, value) => { const text = readFileSync(join(root, path), "utf8"); const newline = text.includes("\r\n") ? "\r\n" : "\n"; writeFileSync(join(root, path), JSON.stringify(value, null, 2).replace(/\n/g, newline) + newline); };
const create = (path, value) => writeFileSync(join(root, path), JSON.stringify(value, null, 2).replace(/\n/g, "\r\n") + "\r\n");

export function buildSet(name, spec, lesson) {
  const targets = (lesson.vocab || []).map(word => word.en.replace(/^to\s+/, ""));
  const items = draftItemsFromSentences(spec.items.map(([text]) => text), { prefix: `${name.replace(/_/g, "-")}-l`, targets, credits: "original sentence written for this lesson" });
  // Tags name the lesson's target words in the sentence (the grammar of the set is listed in `spec.grammar` for authors only).
  items.forEach((item, index) => {
    item.translation = { ru: spec.items[index][1] };
    // Easy always practises at least two words: add the next Medium gap when the helper picked only one
    if (item.gaps.easy.length < 2) { const extra = item.gaps.medium.find(position => !item.gaps.easy.includes(position)); if (extra !== undefined) item.gaps.easy = [...item.gaps.easy, extra].sort((a, b) => a - b); }
  });
  return { schemaVersion: 1, id: spec.id, title: spec.title, level: spec.level, status: "approved", voice: { id: spec.character === "arthur" ? "en-GB-RyanNeural" : "en-GB-SoniaNeural", provider: "browser", character: spec.character }, items };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const force = process.argv.includes("--force");
  const specs = read("scripts/data/listening-sentences.json");
  const manifest = read("content/manifest.json");
  for (const [name, spec] of Object.entries(specs)) {
    const file = `listening/${name}.json`;
    const pack = buildSet(name, spec, read(`content/${name}.json`));
    const problems = validateListeningPack(pack);
    if (problems.length) throw new Error(`${name}: ${problems.join(" ")}`);
    if (existsSync(join(root, "content", file)) && !force) console.log(`kept       content/${file} (use --force to replace)`);
    else { create(`content/${file}`, pack); console.log(`written    content/${file}: ${pack.items.length} sentences`); }
    for (const entry of Object.values(manifest)) if (entry && entry.classworkFile === `${name}.json`) entry.listeningFile = file;
  }
  write("content/manifest.json", manifest);
  console.log("manifest updated");
}
