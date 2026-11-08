import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { contrast, evaluate, PAIRS, readThemes } from "../scripts/design-tokens.mjs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(fileURLToPath(new URL(path, root)), "utf8");

test("contrast maths matches known WCAG values", () => {
  assert.equal(Math.round(contrast("#000000", "#ffffff")), 21);
  assert.equal(contrast("#ffffff", "#ffffff"), 1);
  assert.ok(Math.abs(contrast("#767676", "#ffffff") - 4.54) < 0.02);
});

test("every token pair meets its WCAG threshold in light and dark", () => {
  const rows = evaluate();
  assert.equal(rows.length, PAIRS.length * 2);
  const failures = rows.filter(row => !row.pass).map(row => `${row.theme}: ${row.foreground} on ${row.background} = ${row.ratio.toFixed(2)} (needs ${row.minimum})`);
  assert.deepEqual(failures, []);
});

test("light and dark define the same token names", () => {
  const { light, dark } = readThemes();
  assert.deepEqual(Object.keys(dark).sort(), Object.keys(light).sort());
  assert.ok(Object.keys(light).length >= 25);
});

test("the committed contrast table is current", () => {
  const table = read("docs/DESIGN_TOKENS.md");
  for (const row of evaluate()) assert.ok(table.includes(row.ratio.toFixed(2)), `docs/DESIGN_TOKENS.md is stale for ${row.theme} ${row.foreground}/${row.background}; run npm run tokens:contrast`);
});

test("component stylesheets contain no raw colour values", () => {
  const directory = new URL("css/components/", root);
  for (const file of readdirSync(directory)) {
    const css = read(`css/components/${file}`);
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, `${file} must use var(--ds-*) tokens only`);
    assert.doesNotMatch(css, /\brgba?\(/, `${file} must use var(--ds-*) tokens only`);
  }
});

test("the style guide exists, is noindex, and has no inline script, style block or style attribute", () => {
  const page = read("styleguide.html");
  assert.match(page, /noindex/);
  assert.doesNotMatch(page, /<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(page, /<style[\s>]/i);
  assert.doesNotMatch(page, /\sstyle\s*=/i);
  for (const component of ["ds-btn", "ds-input", "ds-card", "ds-banner", "ds-feedback", "ds-progress", "ds-ring", "ds-stat", "ds-path", "ds-modal", "ds-sheet", "ds-toast", "ds-tooltip", "ds-skeleton", "ds-empty", "ds-avatar", "ds-toolbar", "ds-segmented", "ds-tabs", "ds-reading"]) {
    assert.ok(page.includes(component), `style guide is missing ${component}`);
  }
});
