import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(fileURLToPath(new URL(path, root)), "utf8");

function startTheme({ savedTheme, prefersLight = false }) {
  const mediaListeners = [];
  const button = {
    attributes: {},
    listeners: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, listener) { this.listeners[name] = listener; }
  };
  const document = {
    documentElement: { dataset: {} },
    querySelector: () => button
  };
  const storage = new Map(savedTheme ? [["learning-portal-theme", savedTheme]] : []);
  const localStorage = {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value)
  };
  const window = {
    matchMedia: () => ({
      matches: prefersLight,
      addEventListener: (name, listener) => mediaListeners.push(listener)
    })
  };

  runInNewContext(read("js/theme.js"), { document, localStorage, window, console });
  return { button, document, mediaListeners, storage };
}

test("Practice, Clip Lab, and Manga Reader expose accessible theme controls", () => {
  for (const path of ["practice.html", "clip.html", "manga.html"]) {
    const page = read(path);
    const styles = read(`css/pages/${path.replace(".html", ".css")}`);
    assert.match(page, /data-theme-toggle/, `${path} should expose a theme toggle`);
    assert.match(page, /js\/theme\.js/, `${path} should load the shared theme behavior`);
    assert.match(styles, /data-theme="light"/, `${path} should define its light palette`);
  }

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

test("theme follows the system until selected and then persists the learner choice", () => {
  const { button, document, mediaListeners, storage } = startTheme({ prefersLight: true });
  assert.equal(document.documentElement.dataset.theme, "light");
  assert.equal(storage.has("learning-portal-theme"), false);

  mediaListeners[0]({ matches: false });
  assert.equal(document.documentElement.dataset.theme, "dark");

  button.listeners.click();
  assert.equal(document.documentElement.dataset.theme, "light");
  assert.equal(button.attributes["aria-pressed"], "true");
  assert.equal(button.attributes["aria-label"], undefined, "the visible text is the accessible name");
  assert.equal(storage.get("learning-portal-theme"), "light");

  mediaListeners[0]({ matches: false });
  assert.equal(document.documentElement.dataset.theme, "light");
});
