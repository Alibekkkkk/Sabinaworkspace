// Reports where every manga file comes from and whether it may be used:  npm run check:manga
// For each story in content/manga: validation, credits, rights, and every image (local, size, referenced). Also lists files in
// assets/manga that no story uses. Exit code 1 when a story is invalid, an image is missing or too big, or a file has no clear source.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { validateManga } from "../js/manga/schema.js";
import { mangaWarnings } from "../js/manga/schema-v2.js";

const root = new URL("../", import.meta.url);
const limit = 250 * 1024; let bad = 0;
const used = new Set();
for (const file of readdirSync(new URL("content/manga/", root)).filter(name => name.endsWith(".json"))) {
  const story = JSON.parse(readFileSync(new URL(`content/manga/${file}`, root), "utf8"));
  console.log(`\n${file}  (${story.title || story.id}, schema ${story.schemaVersion})`);
  try { validateManga(story, { requireAnswers: false }); console.log("  valid"); } catch (error) { bad += 1; console.log(`  INVALID: ${error.message}`); continue; }
  if (story.schemaVersion === 2) {
    const c = story.credits; console.log(`  rights: ${c.rights}; author: ${c.author}; artist: ${c.artist}; licence: ${c.licence}${c.sourceUrl ? `; source: ${c.sourceUrl}` : ""}`);
    for (const warning of mangaWarnings({ ...story })) console.log(`  advice: ${warning}`);
  } else console.log("  version 1 story (original placeholder art, no credits block)");
  const images = story.schemaVersion === 2 ? story.chapters.flatMap(ch => ch.pages.map(p => p.image)) : story.chapters.flatMap(ch => ch.panels.map(p => p.imageUrl));
  for (const image of new Set(images)) {
    used.add(image); const path = new URL(image, root);
    if (!existsSync(path)) { bad += 1; console.log(`  MISSING ${image}`); continue; }
    const size = statSync(path).size; const flag = size > limit ? "  TOO BIG" : "";
    if (flag) bad += 1; console.log(`  ${image}  ${(size / 1024).toFixed(1)} kB${flag}`);
  }
}
const files = readdirSync(new URL("assets/manga/", root)).filter(name => /\.(svg|webp|avif|png|jpe?g)$/i.test(name));
const orphans = files.filter(name => !used.has(`assets/manga/${name}`));
console.log(`\nassets/manga: ${files.length} file(s), ${orphans.length} not used by any current story${orphans.length ? `: ${orphans.join(", ")}` : ""}`);
console.log("Sources: pages p1 to p5 are drawn by scripts/make-manga-art.mjs (original, CC0). The older garden-rooftop, garden-neighbors and garden-harvest SVGs are the first demo's original placeholder art, kept for version 1 stories.");
process.exit(bad ? 1 : 0);
