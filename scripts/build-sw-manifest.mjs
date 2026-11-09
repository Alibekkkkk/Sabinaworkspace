// Keeps the service worker's precache list in step with the file tree, so a new page or script cannot be forgotten.
//   node scripts/build-sw-manifest.mjs           rewrites the generated block in sw.js
//   node scripts/build-sw-manifest.mjs --check   exits 1 if sw.js is out of date (the unit tests run this too)
// The cache version is a hash of every precached file, so a changed file always rolls the shell cache over.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const BEGIN = "// BEGIN GENERATED (scripts/build-sw-manifest.mjs)"; const END = "// END GENERATED";

// Left out of the precache on purpose: teacher-only tools and development pages. Students never open them.
export const EXCLUDED = Object.freeze([
  /^js\/pages\/tools-.*\.js$/, /^js\/clips\/authoring\.js$/, /^js\/manga\/authoring\.js$/, /^js\/manga\/dashboard-card\.js$/, /^js\/clips\/dashboard-card\.js$/,
  /^js\/feature-card\.js$/, /^styleguide\.html$/, /^css\/pages\/styleguide\.css$/, /^css\/pages\/tools-/
]);
const TOP_FILES = ["manifest.webmanifest", "content/manifest.json"];
const DIRECTORIES = ["js", "css", "assets", "locales"];
const SKIP_EXTENSIONS = /\.(map|md|log)$/i;

const toPosix = path => relative(root, path).split(sep).join(posix.sep);
function walk(directory) {
  let entries; try { entries = readdirSync(directory); } catch (error) { return []; }
  return entries.flatMap(name => { const full = join(directory, name); return statSync(full).isDirectory() ? walk(full) : [toPosix(full)]; });
}

export function collectPrecache() {
  const pages = readdirSync(root).filter(name => name.endsWith(".html"));
  const files = [...pages, ...TOP_FILES, ...DIRECTORIES.flatMap(directory => walk(join(root, directory)))]
    .filter(path => !SKIP_EXTENSIONS.test(path) && !EXCLUDED.some(pattern => pattern.test(path)));
  return [...new Set(files)].sort((a, b) => (a.endsWith(".html") === b.endsWith(".html") ? a.localeCompare(b) : a.endsWith(".html") ? -1 : 1));
}

export function versionOf(files) {
  const hash = createHash("sha256");
  for (const path of files) { hash.update(path); hash.update(readFileSync(join(root, path))); }
  return hash.digest("hex").slice(0, 10);
}

export function generatedBlock(files = collectPrecache()) {
  return `${BEGIN}\nconst CACHE_VERSION = ${JSON.stringify(versionOf(files))};\nconst SHELL_URLS = ${JSON.stringify(files, null, 2)};\n${END}`;
}

// Every local file a page or module points at: HTML src and href, and import statements (static and dynamic), followed recursively.
export function referencedFiles() {
  const found = new Set(); const queue = [];
  const add = (from, ref) => {
    if (!ref || /^(https?:|data:|blob:|mailto:|#|\/\/)/i.test(ref)) return;
    const clean = ref.split(/[?#]/)[0]; if (!clean) return;
    const resolved = posix.normalize(posix.join(posix.dirname(from), clean));
    if (resolved.startsWith("..")) return;
    if (!found.has(resolved)) { found.add(resolved); if (/\.(js|css)$/.test(resolved)) queue.push(resolved); }
  };
  for (const page of readdirSync(root).filter(name => name.endsWith(".html"))) {
    const html = readFileSync(join(root, page), "utf8");
    for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) if (!/<a\b/.test(html.slice(Math.max(0, match.index - 40), match.index))) add(page, match[1]);
  }
  while (queue.length) {
    const path = queue.shift(); let text; try { text = readFileSync(join(root, path), "utf8"); } catch (error) { continue; }
    if (path.endsWith(".css")) { for (const match of text.matchAll(/@import\s+(?:url\()?["']?([^"')]+)/g)) add(path, match[1]); continue; }
    for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"']+)["']/g)) add(path, match[1]);
  }
  return [...found].filter(path => { try { return statSync(join(root, path)).isFile(); } catch (error) { return false; } });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const worker = readFileSync(join(root, "sw.js"), "utf8").replace(/\r\n/g, "\n");
  const from = worker.indexOf(BEGIN); const to = worker.indexOf(END);
  if (from < 0 || to < 0) { console.error("sw.js has no generated block."); process.exit(1); }
  const next = `${worker.slice(0, from)}${generatedBlock()}${worker.slice(to + END.length)}`;
  if (process.argv.includes("--check")) {
    if (next !== worker) { console.error("sw.js is out of date. Run: node scripts/build-sw-manifest.mjs"); process.exit(1); }
    console.log("sw.js precache list is up to date."); process.exit(0);
  }
  writeFileSync(join(root, "sw.js"), next);
  console.log(`sw.js updated: ${collectPrecache().length} precached files.`);
}
void dirname;
