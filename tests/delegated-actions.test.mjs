import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  installDelegatedActions,
  registerDelegatedClick,
  runRegisteredClick,
  readActionEnum,
  readActionInteger,
  readActionParam
} from "../js/delegated-actions.js";

test("delegated actions dispatch only whitelisted actions on their declared event", () => {
  const previousDocument = globalThis.document;
  const previousElement = globalThis.Element;
  const listeners = new Map();
  globalThis.Element = class {};
  globalThis.document = {
    addEventListener(name, listener) {
      listeners.set(name, listener);
    },
    documentElement: { contains: () => true }
  };

  try {
    let invoked = 0;
    installDelegatedActions({
      "save-record": { event: "click", run: () => invoked++ }
    });
    const element = new Element();
    element.dataset = { action: "save-record" };
    element.closest = () => element;

    listeners.get("change")?.({ target: element, type: "change" });
    listeners.get("click")({ target: element, type: "click" });
    element.dataset.action = "unlisted";
    listeners.get("click")({ target: element, type: "click" });

    assert.equal(invoked, 1);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousElement === undefined) delete globalThis.Element;
    else globalThis.Element = previousElement;
  }
});

test("delegated action parameters must match their declared formats", () => {
  const element = { dataset: { code: "AB-123", mode: "all", stage: "12" } };
  assert.equal(readActionParam(element, "code", /^[A-Z0-9-]{1,12}$/), "AB-123");
  assert.equal(readActionParam(element, "code", /^[0-9]+$/), null);
  assert.equal(readActionEnum(element, "mode", ["all", "vocab"]), "all");
  assert.equal(readActionEnum(element, "mode", ["all", "vocab", "reset"]), "all");
  assert.equal(readActionInteger(element, "stage", 1, 20), 12);
  assert.equal(readActionInteger(element, "stage", 1, 10), null);
});

test("registered dynamic click callbacks are dispatched through the delegated whitelist", () => {
  const previousElement = globalThis.Element;
  globalThis.Element = class {};
  try {
    let invoked = false;
    const element = new Element();
    element.dataset = {};
    registerDelegatedClick(element, () => { invoked = true; });
    assert.equal(element.dataset.action, "registered-click");
    runRegisteredClick(element, { type: "click" });
    assert.equal(invoked, true);
  } finally {
    if (previousElement === undefined) delete globalThis.Element;
    else globalThis.Element = previousElement;
  }
});

test("HTML pages and application scripts contain no inline event handlers", () => {
  const repositoryUrl = new URL("../", import.meta.url);
  const repositoryPath = fileURLToPath(repositoryUrl);
  const collectJavaScript = directory => readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? collectJavaScript(path) :
        entry.isFile() && path.endsWith(".js") ? [path] : [];
    });
  const htmlFiles = [
    "dashboard.html", "homework.html", "lesson.html", "portal.html", "clip.html",
    "index.html", "manga.html", "placement.html", "offline.html", "practice.html",
    "lesson_abay.html", "lesson_gaziz.html", "legacy/index.html", "tools/import-content.html"
  ];
  const javascriptFiles = collectJavaScript(join(repositoryPath, "js"));
  const inlineEventAttribute = /\son[a-z]+\s*=/i;

  for (const path of [...htmlFiles, ...javascriptFiles.map(path => relative(repositoryPath, path))]) {
    const source = readFileSync(new URL(path, repositoryUrl), "utf8");
    assert.doesNotMatch(source, inlineEventAttribute, `${path} contains an inline event handler`);
  }
});
