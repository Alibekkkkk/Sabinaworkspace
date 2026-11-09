import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const walk = (directory, keep) => readdirSync(directory).flatMap(name => { const full = join(directory, name); return statSync(full).isDirectory() ? walk(full, keep) : keep(full) ? [full] : []; });
const rel = path => relative(root, path).split(sep).join("/");
const jsFiles = walk(join(root, "js"), path => path.endsWith(".js"));
const htmlFiles = [...readdirSync(root).filter(name => name.endsWith(".html")).map(name => join(root, name)), join(root, "tools", "import-content.html")];
const strip = text => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");

test("gate: the only code that writes HTML strings is the sanitizing helper and the template it uses", () => {
  const allowed = new Set(["js/dom.js", "js/sanitize-html.js"]);
  for (const file of jsFiles) {
    if (allowed.has(rel(file))) continue;
    assert.doesNotMatch(strip(readFileSync(file, "utf8")), /\.(innerHTML|outerHTML)\b|insertAdjacentHTML|document\.write\(/, `${rel(file)} must use textContent, DOM nodes or setHtml()`);
  }
});

test("gate: no eval, no new Function, no string timers, no javascript: URLs", () => {
  for (const file of [...jsFiles, ...htmlFiles]) {
    const code = strip(readFileSync(file, "utf8"));
    assert.doesNotMatch(code, /\beval\s*\(|new\s+Function\s*\(|set(Timeout|Interval)\s*\(\s*["'`]/, rel(file));
    assert.doesNotMatch(code, /javascript:/i, `${rel(file)} must not use javascript: URLs`);
  }
});

test("gate: no inline event handlers in pages", () => {
  for (const file of htmlFiles) assert.doesNotMatch(readFileSync(file, "utf8"), /\son[a-z]+\s*=\s*["']/i, rel(file));
});

test("gate: every link that opens a new tab says noopener, and window.open does too", () => {
  for (const file of htmlFiles) for (const tag of readFileSync(file, "utf8").match(/<a\b[^>]*target="_blank"[^>]*>/g) || []) assert.match(tag, /rel="[^"]*noopener/, `${rel(file)}: ${tag}`);
  for (const file of jsFiles) {
    const code = strip(readFileSync(file, "utf8"));
    for (const call of code.match(/window\.open\([^)]*\)/g) || []) assert.match(call, /noopener/, `${rel(file)}: ${call}`);
    for (const match of code.matchAll(/(\w+)\.target\s*=\s*["']_blank["']/g)) assert.match(code, new RegExp(`${match[1]}\\.rel\\s*=\\s*["'][^"']*noopener`), `${rel(file)}: ${match[1]} opens a new tab without rel=noopener`);
  }
});

test("gate: no page allows unsafe-inline or unsafe-eval, and each CSP keeps the baseline directives", () => {
  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8"); const policy = (html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1];
    if (!policy) continue; // the two redirect pages have no content of their own
    assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval/, rel(file));
    for (const directive of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action"]) assert.ok(policy.includes(directive), `${rel(file)} misses ${directive}`);
    assert.doesNotMatch(policy, /script-src[^;]*\s\*(\s|;|$)/, `${rel(file)} must not allow every script host`);
  }
});

test("gate: no secrets in tracked source (private keys, cloud and chat tokens, long key-like strings)", () => {
  const patterns = [/-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/, /\bAKIA[0-9A-Z]{16}\b/, /\bghp_[A-Za-z0-9]{30,}\b/, /\bsk-[A-Za-z0-9]{32,}\b/, /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, /"private_key"\s*:/, /(api[_-]?key|secret|token)["']?\s*[:=]\s*["'][A-Za-z0-9_\-]{24,}["']/i];
  const files = [...jsFiles, ...htmlFiles, ...walk(join(root, "scripts"), path => /\.(mjs|js)$/.test(path)), ...walk(join(root, "content"), path => path.endsWith(".json")), join(root, "firebase.json"), join(root, "database.rules.json")];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const pattern of patterns) { const hit = text.match(pattern); if (hit && !(rel(file) === "js/config.js" && /apiKey["']?\s*:\s*["']AIza/.test(hit[0]))) assert.fail(`${rel(file)} contains something that looks like a secret: ${hit[0].slice(0, 12)}…`); }
  }
});
