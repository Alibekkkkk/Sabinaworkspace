import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(fileURLToPath(new URL(path, root)), "utf8");

function startTheme({ saved = {}, prefersLight = false } = {}) {
  const classes = new Set();
  const button = {
    attributes: {}, textContent: "", title: "",
    setAttribute(name, value) { this.attributes[name] = value; },
    hasAttribute(name) { return name in this.attributes; },
    closest(selector) { return selector === "[data-theme-toggle]" ? this : null; }
  };
  const listeners = {};
  const document = {
    documentElement: { dataset: {}, classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) } },
    body: null,
    querySelectorAll: () => [button],
    addEventListener: (name, listener) => { listeners[name] = listener; },
    dispatchEvent: () => true
  };
  const storage = new Map(Object.entries(saved));
  const localStorage = { getItem: key => (storage.has(key) ? storage.get(key) : null), setItem: (key, value) => storage.set(key, value) };
  const window = { matchMedia: () => ({ matches: prefersLight, addEventListener() {} }) };
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  runInNewContext(read("js/theme.js"), { document, localStorage, window, console, CustomEvent });
  const click = () => listeners.click({ target: button, preventDefault() {} });
  return { button, document, storage, classes, click, window };
}

test("Practice, Clip Lab, and Manga Reader expose accessible theme controls", () => {
  for (const path of ["practice.html", "clip.html", "manga.html"]) {
    const page = read(path);
    const styles = read(`css/pages/${path.replace(".html", ".css")}`);
    assert.match(page, /data-theme-toggle/, `${path} should expose a theme toggle`);
    assert.match(page, /js\/theme\.js/, `${path} should load the shared theme behavior`);
    assert.doesNotMatch(styles, /data-theme="(light|dark)"\]\s*\{[^}]*--(ds-color|page|surface)-?[a-z-]*:\s*#/, `${path} should not re-declare a palette: both themes come from css/design-system.css`);
  }

  assert.match(read("css/design-system.css"), /html\[data-theme="light"\][\s\S]*--ds-color-highlight/, "the shared tokens define the light theme");
  const theme = read("js/theme.js");
  assert.match(theme, /localStorage\.getItem/);
  assert.match(theme, /localStorage\.setItem/);
  assert.match(theme, /setAttribute\("aria-pressed"/);
  assert.match(read("sw.js"), /"js\/theme\.js"/);
});

test("lesson, homework and dashboard use the design system, with no legacy shim, web fonts or raw colours", () => {
  const components = ["controls", "surfaces", "progress", "feedback", "page-aliases"];
  const rawColour = /(?<![\w&])#[0-9a-fA-F]{6}|(?<![\w&])#[0-9a-fA-F]{3}(?![\w-])|rgba?\(/;
  for (const path of ["lesson.html", "homework.html", "dashboard.html"]) {
    const page = read(path);
    assert.doesNotMatch(page, /legacy-pages\.css/, `${path} must not use the removed legacy stylesheet`);
    assert.match(page, /css\/design-system\.css/, `${path} should load the tokens`);
    for (const component of components) assert.match(page, new RegExp(`css/components/${component}\.css`), `${path} should load ${component}`);
    assert.doesNotMatch(page, /fonts\.googleapis\.com|fonts\.gstatic\.com/, `${path} must not depend on Google Fonts`);
    const style = read(`css/pages/${path.replace(".html", ".css")}`);
    assert.doesNotMatch(style, /#[0-9a-fA-F]{3,8}|rgba?\(/, `${path} stylesheet must use design tokens, not raw colours`);
    assert.match(style, /max-width:\s*\d+px/, `${path} stylesheet should be responsive`);
    const script = read(`js/pages/${path.replace(".html", ".js")}`);
    assert.doesNotMatch(script, rawColour, `${path} script must use design tokens in generated markup, not raw colours`);
  }
  assert.throws(() => read("css/legacy-pages.css"), /ENOENT/);
  const worker = read("sw.js");
  assert.doesNotMatch(worker, /legacy-pages/);
  assert.match(worker, /css\/components\/controls\.css/);
  assert.match(read("css/design-system.css"), /prefers-reduced-motion:\s*reduce/);
});

test("Lime Night is the default, one saved choice applies to every page, and older choices carry over", () => {
  const fresh = startTheme({ prefersLight: true });
  assert.equal(fresh.document.documentElement.dataset.theme, "dark", "dark by default, whatever the device prefers");
  assert.ok(fresh.classes.has("dark") && !fresh.classes.has("light"));
  assert.equal(fresh.button.textContent, "Light mode");
  assert.equal(fresh.button.attributes["aria-pressed"], "false");
  assert.equal(fresh.button.attributes["aria-label"], undefined, "the visible text is the accessible name");

  fresh.click();
  assert.equal(fresh.document.documentElement.dataset.theme, "light");
  assert.ok(fresh.classes.has("light") && !fresh.classes.has("dark"));
  assert.equal(fresh.button.attributes["aria-pressed"], "true");
  assert.equal(fresh.storage.get("ls-theme"), "light");
  assert.equal(fresh.window.LSTheme.get(), "light");

  for (const key of ["learning-portal-theme", "nd_theme", "nd_lesson_theme", "nd_homework_theme_v2", "teacher_theme"]) {
    const older = startTheme({ saved: { [key]: "light" } });
    assert.equal(older.document.documentElement.dataset.theme, "light", `${key} carries over`);
    assert.equal(older.storage.get("ls-theme"), "light");
  }
  const chosen = startTheme({ saved: { "ls-theme": "dark", nd_lesson_theme: "light" } });
  assert.equal(chosen.document.documentElement.dataset.theme, "dark", "the site-wide choice wins over an older one");
});
