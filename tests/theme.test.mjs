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

test("legacy lesson, homework, and teacher shells use shared responsive accessibility styles", () => {
  for (const path of ["lesson.html", "homework.html", "dashboard.html"]) {
    assert.match(read(path), /css\/legacy-pages\.css/, `${path} should use the shared page polish`);
  }
  const styles = read("css/legacy-pages.css");
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.match(styles, /max-width:\s*700px/);
  assert.match(read("sw.js"), /"css\/legacy-pages\.css"/);
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
