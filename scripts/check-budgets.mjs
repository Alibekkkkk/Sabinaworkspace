// Size budgets per page:  npm run check:budgets
// For each top-level page it follows the page's own script and style files and every module they import, and reports the gzipped
// size of the JavaScript and CSS (the Firebase SDK comes from a CDN and is listed separately). Fails when a page's own JS is over
// the budget. Modules loaded only on demand (dynamic import) are counted separately as "lazy", because they are not on the
// critical path.  Output as JSON with --json.
import { readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
export const JS_BUDGET = 150 * 1024; // bytes gzipped, per page, excluding the Firebase SDK
export const CSS_BUDGET = 60 * 1024;
const gz = path => gzipSync(readFileSync(root + path)).length;

export function graph(entry) {
  const eager = new Set(); const lazy = new Set();
  const visit = (path, isLazy) => {
    const target = isLazy ? lazy : eager;
    if (eager.has(path) || (isLazy && lazy.has(path))) return;
    target.add(path); let text; try { text = readFileSync(root + path, "utf8"); } catch (error) { return; }
    if (path.endsWith(".css")) { for (const match of text.matchAll(/@import\s+(?:url\()?["']?([^"')]+)/g)) visit(posix.normalize(posix.join(posix.dirname(path), match[1])), isLazy); return; }
    for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/g)) {
      const dynamic = /import\s*\(/.test(text.slice(Math.max(0, match.index - 12), match.index + 12));
      visit(posix.normalize(posix.join(posix.dirname(path), match[1])), isLazy || dynamic);
    }
  };
  visit(entry, false);
  return { eager, lazy: new Set([...lazy].filter(path => !eager.has(path))) };
}

export function pageReport(page) {
  const html = readFileSync(root + page, "utf8");
  const refs = [...html.matchAll(/\b(?:src|href)="([^"#?]+)"/g)].map(match => match[1]);
  const scripts = refs.filter(ref => /^(?!https?:).*\.js$/.test(ref)).map(ref => posix.normalize(ref));
  const styles = refs.filter(ref => /^(?!https?:).*\.css$/.test(ref)).map(ref => posix.normalize(ref));
  const firebase = refs.filter(ref => /gstatic\.com\/firebasejs/.test(ref)).map(ref => ref.match(/firebase-([a-z]+)-compat/)?.[1]).filter(Boolean);
  const js = new Set(); const lazy = new Set(); const css = new Set();
  for (const script of scripts) { const found = graph(script); found.eager.forEach(path => js.add(path)); found.lazy.forEach(path => lazy.add(path)); }
  for (const style of styles) graph(style).eager.forEach(path => css.add(path));
  for (const path of js) lazy.delete(path);
  const sum = set => [...set].reduce((total, path) => total + gz(path), 0);
  return { page, js: sum(js), lazyJs: sum(lazy), css: sum(css), jsFiles: js.size, firebase };
}

export const pages = () => readdirSync(root).filter(name => name.endsWith(".html") && !/^lesson_(abay|gaziz)\.html$|^styleguide\.html$/.test(name)).sort();

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const reports = pages().map(pageReport); let failed = 0;
  if (process.argv.includes("--json")) console.log(JSON.stringify(reports, null, 2));
  else {
    console.log("page".padEnd(18), "JS gz".padStart(9), "lazy JS".padStart(9), "CSS gz".padStart(9), "  Firebase SDK");
    for (const report of reports) {
      const over = report.js > JS_BUDGET || report.css > CSS_BUDGET; if (over) failed += 1;
      console.log(report.page.padEnd(18), `${(report.js / 1024).toFixed(1)} kB`.padStart(9), `${(report.lazyJs / 1024).toFixed(1)} kB`.padStart(9), `${(report.css / 1024).toFixed(1)} kB`.padStart(9), `  ${report.firebase.join("+") || "none"}${over ? "   OVER BUDGET" : ""}`);
    }
    console.log(`\nBudgets: JS ${JS_BUDGET / 1024} kB, CSS ${CSS_BUDGET / 1024} kB gzipped per page, excluding the Firebase SDK.`);
  }
  process.exit(failed ? 1 : 0);
}
