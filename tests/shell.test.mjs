import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { JSDOM } from "jsdom";
import { diagnosticCode, mountBottomNav, mountOfflineBanner, showErrorPage, showSkeleton } from "../js/shell.js";

function withDom(run) {
  const dom = new JSDOM("<!doctype html><body><main id='main'></main></body>", { url: "https://example.test/" });
  const previous = { document: globalThis.document, window: globalThis.window, navigator: globalThis.navigator };
  Object.defineProperty(globalThis, "document", { value: dom.window.document, configurable: true });
  Object.defineProperty(globalThis, "window", { value: dom.window, configurable: true });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  try { return run(dom); } finally {
    for (const [key, value] of Object.entries(previous)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
}

test("diagnostic codes are stable, short and differ per error", () => {
  assert.equal(diagnosticCode(new Error("permission_denied")), diagnosticCode({ message: "permission_denied" }));
  assert.match(diagnosticCode(new Error("x")), /^E-[0-9A-Z]{6}$/);
  assert.notEqual(diagnosticCode(new Error("a")), diagnosticCode(new Error("b")));
  assert.match(diagnosticCode(undefined), /^E-/);
});

test("the mobile tab bar has the six student tabs, marks the current one and shows Manga only when flagged", () => withDom(() => {
  mountBottomNav("lesson");
  const links = [...document.querySelectorAll(".ds-bottom-nav a")];
  assert.deepEqual(links.map(link => link.textContent.replace(/^\S+/u, "").trim() || link.lastChild.textContent), ["Home", "Lesson", "Practice", "Clips", "Homework", "Me"]);
  assert.equal(document.querySelectorAll('.ds-bottom-nav [aria-current="page"]').length, 1);
  assert.equal(document.querySelector('.ds-bottom-nav [aria-current="page"]').lastChild.textContent, "Lesson");
  mountBottomNav("lesson");
  assert.equal(document.querySelectorAll(".ds-bottom-nav").length, 1, "mounting twice must not duplicate");
}));

test("manga tab appears only with the feature flag", () => withDom(() => {
  mountBottomNav("home", { manga: true });
  assert.ok([...document.querySelectorAll(".ds-bottom-nav a")].some(link => link.lastChild.textContent === "Manga"));
}));

test("offline banner reacts to the online and offline events and announces politely", () => withDom(dom => {
  mountOfflineBanner();
  const banner = document.getElementById("offlineBanner");
  assert.equal(banner.getAttribute("role"), "status");
  assert.equal(banner.hidden, true);
  dom.window.dispatchEvent(new dom.window.Event("offline"));
  assert.equal(banner.hidden, false);
  dom.window.dispatchEvent(new dom.window.Event("online"));
  assert.equal(banner.hidden, true);
}));

test("error page shows a friendly message, a retry button and the diagnostic code; raw text only inside collapsed details", () => withDom(() => {
  const code = showErrorPage(document.getElementById("main"), new Error("secret internal detail"));
  const main = document.getElementById("main");
  assert.match(main.textContent, new RegExp(code));
  assert.equal(main.querySelector("button").textContent, "Try again");
  assert.ok(main.querySelector("[role='alert']"));
  const details = main.querySelector("details");
  assert.ok(details && !details.open, "technical details start collapsed");
  assert.match(details.textContent, /secret internal detail/);
  assert.doesNotMatch(main.querySelector("p").textContent, /secret internal detail/);
  showErrorPage(main, new Error("<img src=x onerror=alert(1)>"));
  assert.equal(main.querySelector("img"), null, "error text is never parsed as HTML");
}));

test("skeleton marks the region busy", () => withDom(() => {
  showSkeleton(document.getElementById("main"), 3);
  assert.equal(document.querySelectorAll(".ds-skeleton").length, 3);
  assert.equal(document.querySelector("[aria-busy='true']") !== null, true);
}));

test("student pages mount the shell", () => {
  const read = path => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");
  for (const path of ["js/pages/lesson.js", "js/pages/homework.js"]) {
    const source = read(path);
    assert.match(source, /from "\.\.\/shell\.js"/, `${path} should import the shell`);
    assert.match(source, /mountBottomNav\(/);
    assert.match(source, /mountOfflineBanner\(\)/);
  }
});
