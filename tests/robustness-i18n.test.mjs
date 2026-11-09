import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { JSDOM } from "jsdom";
import { LANGUAGES, applyStaticTranslations, format, formatDate, formatNumber, initI18n, isLanguage, mountLanguageSwitch, pickLanguage, setLanguage, t } from "../js/i18n.js";
import { safeLocal, onStorageDegraded, resetStorageStateForTests, storageDegraded } from "../js/safe-storage.js";
import { MAX_PER_PAGE, MIN_GAP_MS, SLOTS, buildRecord, describeError, handleError, resetErrorStateForTests, setErrorLogTarget, shouldReport, slotFor } from "../js/error-log.js";
import { hideNotice, showNotice } from "../js/notices.js";
import { startTabGuard } from "../js/tab-guard.js";
import { SKEW_LIMIT_MS, showErrorPage, skewMessage } from "../js/shell.js";
import { renderErrorCard, recentErrors } from "../js/error-card.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const locale = name => JSON.parse(readFileSync(join(root, "locales", `${name}.json`), "utf8"));
const walk = directory => readdirSync(directory).flatMap(name => { const full = join(directory, name); return statSync(full).isDirectory() ? walk(full) : full.endsWith(".js") ? [full] : []; });
const placeholders = text => [...String(text).matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

function withDom(run, options = {}) {
  const dom = new JSDOM("<!doctype html><body><main id='main'></main><button data-theme-toggle>Theme</button></body>", { url: "https://example.test/", pretendToBeVisual: true, ...options });
  const previous = { document: globalThis.document, window: globalThis.window, navigator: globalThis.navigator, location: globalThis.location };
  for (const [key, value] of Object.entries({ document: dom.window.document, window: dom.window, navigator: dom.window.navigator, location: dom.window.location })) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  return Promise.resolve(run(dom)).finally(() => { for (const [key, value] of Object.entries(previous)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }); });
}

// ---- languages ------------------------------------------------------------------------------------------------------------------------------
test("the three dictionaries have the same keys and placeholders, and Russian and Kazakh are really translated", () => {
  const en = locale("en"); const keys = Object.keys(en).filter(key => key !== "_meta");
  for (const name of ["ru", "kk"]) {
    const other = locale(name);
    assert.deepEqual(Object.keys(other).filter(key => key !== "_meta").sort(), [...keys].sort(), `${name} has exactly the keys of English`);
    for (const key of keys) {
      assert.ok(String(other[key]).trim(), `${name}.${key} is empty`);
      assert.deepEqual(placeholders(other[key]), placeholders(en[key]), `${name}.${key} must keep the same {placeholders}`);
    }
    const same = keys.filter(key => other[key] === en[key]);
    assert.ok(same.length <= 1, `${name} leaves these in English: ${same.join(", ")}`);
    assert.match(other._meta, /проверить|тексеруі/, `${name} says it needs a native speaker's review`);
  }
});

test("every key the code asks for exists in English", () => {
  const en = locale("en"); const missing = [];
  for (const file of walk(join(root, "js"))) {
    const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
    for (const match of text.matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g)) if (!Object.hasOwn(en, match[1])) missing.push(`${file.slice(root.length)}: ${match[1]}`);
    for (const match of text.matchAll(/labelKey:\s*"([a-zA-Z0-9_.]+)"/g)) if (!Object.hasOwn(en, match[1])) missing.push(`${file.slice(root.length)}: ${match[1]}`);
  }
  for (const name of ["mangaReader", "clipLab", "whiteboard", "listeningTrainer"]) assert.ok(Object.hasOwn(en, `feature.${name}`), `a name for the ${name} feature`);
  assert.deepEqual(missing, []);
});

test("gate: the shared modules contain no hard-coded visible text (everything goes through t())", () => {
  const covered = ["js/shell.js", "js/notices.js", "js/error-log.js", "js/tab-guard.js", "js/feature-gate.js", "js/i18n.js"];
  for (const path of covered) {
    const code = readFileSync(join(root, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
    for (const match of code.matchAll(/\.(?:textContent|title|placeholder|alt)\s*=\s*(["'`])((?:\\.|(?!\1).)*)\1/g)) assert.ok(!/\p{L}{2,}/u.test(match[2]), `${path}: hard-coded text "${match[2]}"`);
    for (const match of code.matchAll(/setAttribute\(\s*"(?:aria-label|title|placeholder)"\s*,\s*(["'`])((?:\\.|(?!\1).)*)\1/g)) assert.ok(!/\p{L}{2,}/u.test(match[2]), `${path}: hard-coded label "${match[2]}"`);
  }
});

test("the language is the saved choice, then the browser's, then English; and it can be changed", async () => {
  assert.deepEqual(Object.keys(LANGUAGES), ["en", "ru", "kk"]); assert.ok(isLanguage("kk")); assert.ok(!isLanguage("de")); assert.ok(!isLanguage("__proto__"));
  assert.equal(pickLanguage("ru", ["kk"]), "ru"); assert.equal(pickLanguage(null, ["kk-KZ", "en"]), "kk"); assert.equal(pickLanguage("xx", ["fr-FR", "ru-RU"]), "ru"); assert.equal(pickLanguage(null, []), "en"); assert.equal(pickLanguage(null, [undefined, ""]), "en");
  const loader = async name => ({ en: { hi: "Hello {name}", only: "English only" }, ru: { hi: "Привет, {name}" } }[name] || {});
  assert.equal(await initI18n({ language: "ru", loader }), "ru");
  assert.equal(t("hi", { name: "Аня" }), "Привет, Аня"); assert.equal(t("only"), "English only", "a missing translation falls back to English"); assert.equal(t("nothing.here"), "nothing.here", "and then to the key");
  assert.equal(t("hi"), "Привет, {name}", "a missing value stays visible");
  assert.equal(format("{a}{b}", { a: 1 }), "1{b}");
  assert.equal(await initI18n({ language: "en", loader }), "en"); assert.equal(t("hi", { name: "Ann" }), "Hello Ann");
  setLanguage("kk", { reload: false }); assert.equal(safeLocal.getItem("nd_language"), "kk"); assert.throws(() => setLanguage("de", { reload: false }), /Unsupported/);
  assert.equal(await initI18n({ loader: async name => ({}) }), "kk", "the saved choice is used next time");
  safeLocal.removeItem("nd_language"); await initI18n({ language: "en", loader: async name => locale(name) });
});

test("dates and numbers follow the chosen language", async () => {
  await initI18n({ language: "en", loader: async name => locale(name) }); const stamp = Date.UTC(2026, 10, 9, 12);
  const en = formatDate(stamp); assert.match(en, /Nov/); assert.equal(formatNumber(1234.5), "1,234.5");
  await initI18n({ language: "ru", loader: async name => locale(name) }); assert.match(formatDate(stamp), /ноя/i); assert.match(formatNumber(1234.5), /1\s234,5/);
  await initI18n({ language: "kk", loader: async name => locale(name) }); assert.match(formatDate(stamp), /қар|Қар|2026/); await initI18n({ language: "en", loader: async name => locale(name) });
});

test("the language picker sits next to the theme button, lists the languages, and saves the choice", () => withDom(async dom => {
  await initI18n({ language: "en", loader: async name => locale(name) });
  let reloaded = false; Object.defineProperty(dom.window, "__reloaded", { value: () => { reloaded = true; } });
  const select = mountLanguageSwitch(); assert.ok(select); assert.equal(document.querySelector("[data-theme-toggle]").nextElementSibling, select);
  assert.deepEqual([...select.options].map(option => `${option.value}:${option.textContent}`), ["en:English", "ru:Русский", "kk:Қазақша"]); assert.equal(select.value, "en"); assert.equal(select.getAttribute("aria-label"), "Language");
  assert.equal(mountLanguageSwitch(), null, "never twice");
  const html = new JSDOM("<p data-i18n='nav.home'></p><p data-i18n-aria-label='nav.me'></p>"); applyStaticTranslations(html.window.document);
  assert.equal(html.window.document.querySelector("[data-i18n]").textContent, "Home"); assert.equal(html.window.document.querySelector("[data-i18n-aria-label]").getAttribute("aria-label"), "Me");
  void reloaded;
}));

// ---- storage that can fail ---------------------------------------------------------------------------------------------------------------------
test("blocked or full storage never throws: values live in memory and the first failure is reported once", () => {
  resetStorageStateForTests();
  const reasons = []; onStorageDegraded(reason => reasons.push(reason));
  const keep = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new DOMException("denied", "SecurityError"); } });
    assert.equal(safeLocal.getItem("a"), null); safeLocal.setItem("a", "1"); assert.equal(safeLocal.getItem("a"), "1", "kept in memory for the visit");
    safeLocal.removeItem("a"); assert.equal(safeLocal.getItem("a"), null); assert.equal(safeLocal.length, 0);
    assert.ok(storageDegraded()); assert.equal(reasons.length, 1, "reported once");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null, setItem() { const error = new Error("full"); error.name = "QuotaExceededError"; throw error; }, removeItem() {}, key: () => null, length: 0 } });
    resetStorageStateForTests(); const quota = []; onStorageDegraded(reason => quota.push(reason));
    safeLocal.setItem("b", "2"); assert.equal(safeLocal.getItem("b"), "2"); assert.deepEqual(quota, ["quota"]); assert.deepEqual(safeLocal.keys(), ["b"]);
  } finally { if (keep) Object.defineProperty(globalThis, "localStorage", keep); else delete globalThis.localStorage; resetStorageStateForTests(); }
});

// ---- errors ----------------------------------------------------------------------------------------------------------------------------------------------
test("an error becomes a short bounded record that fits the database rules", () => {
  const info = describeError(new Error("x".repeat(500)));
  const record = buildRecord(info, "lesson.html".repeat(20), 1790000000000, "A".repeat(300));
  assert.ok(record.message.length <= 200 && record.page.length <= 80 && record.agent.length <= 120 && (record.stack || "").length <= 600);
  assert.match(record.diag, /^E-[0-9A-Z]{6}$/); assert.equal(record.ts, 1790000000000);
  const rules = JSON.parse(readFileSync(join(root, "database.rules.json"), "utf8")).rules.clientErrors.$code.$slot;
  for (const field of Object.keys(record)) assert.ok(Object.hasOwn(rules, field), `${field} is allowed by the rules`);
  assert.equal(describeError("plain text").message, "plain text"); assert.equal(describeError(undefined).message, "Unknown error");
  assert.equal(describeError({ code: "PERMISSION_DENIED", message: "x" }).permission, true); assert.equal(describeError(new Error("boom")).permission, false);
  assert.equal(describeError(new Error("same")).diag, describeError(new Error("same")).diag);
  for (const now of [0, 49999, 123456789012]) { const slot = slotFor(now); assert.ok(Number.isInteger(slot) && slot >= 0 && slot < SLOTS); }
});

test("reports are limited: no noise, no repeats, a gap between them and a cap per page", () => {
  resetErrorStateForTests();
  assert.equal(shouldReport(describeError("ResizeObserver loop completed with undelivered notifications."), 1e9), false, "browser noise");
  assert.equal(shouldReport(describeError("Script error."), 1e9), false);
  assert.equal(shouldReport(describeError(new Error("e1")), 1e9), true);
  assert.equal(shouldReport(describeError(new Error("e1")), 1e9 + 99999), false, "the same error once");
  assert.equal(shouldReport(describeError(new Error("e2")), 1e9 + 100), false, "not within the gap");
  let now = 1e9; for (let i = 0; i < 10; i += 1) { now += MIN_GAP_MS + 1; shouldReport(describeError(new Error(`n${i}`)), now); }
  assert.equal(shouldReport(describeError(new Error("late")), now + 1e6), false, `at most ${MAX_PER_PAGE} per page`);
  resetErrorStateForTests();
});

test("the boundary shows a copyable code, logs once for a signed-in student, and never logs without one", () => withDom(async () => {
  await initI18n({ language: "en", loader: async name => locale(name) });
  const written = []; const db = { ref: path => ({ set: async value => { written.push({ path, value }); } }) };
  resetErrorStateForTests(); const originalError = console.error; console.error = () => {};
  try {
    handleError(new Error("kaboom"), 2e9);
    assert.equal(written.length, 0, "no student code yet, so nothing is sent");
    const notice = document.querySelector("#noticeHost [role=alert]"); assert.ok(notice); assert.match(notice.textContent, /Something went wrong\. Code: E-[0-9A-Z]{6}/); assert.ok([...notice.querySelectorAll("button")].some(b => b.textContent === "Copy code"));
    setErrorLogTarget({ db, code: "ANNA1" }); handleError(new Error("second"), 2e9 + 10000);
    assert.equal(written.length, 1); assert.match(written[0].path, /^clientErrors\/ANNA1\/\d{1,2}$/); assert.equal(written[0].value.message, "second");
    handleError(new Error("second"), 2e9 + 20000); assert.equal(written.length, 1, "a repeat is not sent again");
    resetErrorStateForTests(); handleError({ code: "PERMISSION_DENIED", message: "permission_denied" }, 3e9); assert.match(document.body.textContent, /sign-in may have expired/);
  } finally { console.error = originalError; resetErrorStateForTests(); }
}));

test("notices appear once per id, can be dismissed, and are announced", () => withDom(async () => {
  await initI18n({ language: "en", loader: async name => locale(name) });
  const first = showNotice("a", "First"); assert.equal(first.getAttribute("role"), "status"); assert.equal(showNotice("a", "Changed"), first); assert.equal(first.querySelector("p").textContent, "Changed"); assert.equal(document.querySelectorAll("#notice-a").length, 1);
  assert.equal(showNotice("b", "Bad", { kind: "error" }).getAttribute("role"), "alert");
  first.querySelector("button").click(); assert.equal(document.getElementById("notice-a"), null); hideNotice("b"); assert.equal(document.getElementById("notice-b"), null);
}));

// ---- two tabs and the clock ----------------------------------------------------------------------------------------------------------------------------
test("a second tab on the same page is noticed by both tabs; one tab alone sees nothing", async () => {
  await initI18n({ language: "en", loader: async name => locale(name) });
  const channels = []; const factory = () => { const listeners = []; const channel = { addEventListener: (event, fn) => listeners.push(fn), postMessage: data => { for (const other of channels) if (other !== channel) for (const fn of other.listeners) fn({ data }); }, close() {}, listeners }; channels.push(channel); return channel; };
  const one = []; const two = [];
  startTabGuard("lesson:?a=1", { channelFactory: factory, notify: text => one.push(text) });
  assert.deepEqual(one, [], "alone, nothing");
  startTabGuard("lesson:?a=1", { channelFactory: factory, notify: text => two.push(text) });
  assert.equal(one.length, 1); assert.equal(two.length, 1); assert.match(one[0], /open in another tab/);
  assert.equal(typeof startTabGuard("x", { channelFactory: () => null }), "function", "no BroadcastChannel: does nothing");
});

test("a device clock more than two minutes off is reported, in the right direction", async () => {
  await initI18n({ language: "en", loader: async name => locale(name) });
  assert.equal(skewMessage(0), ""); assert.equal(skewMessage(SKEW_LIMIT_MS - 1), ""); assert.equal(skewMessage(NaN), "");
  assert.match(skewMessage(-5 * 60000), /about 5 minutes ahead/); assert.match(skewMessage(10 * 60000), /about 10 minutes behind/);
});

test("the error page has a retry and a copy button, and the code can be copied", () => withDom(async dom => {
  await initI18n({ language: "en", loader: async name => locale(name) });
  let copied = ""; Object.defineProperty(dom.window.navigator, "clipboard", { configurable: true, value: { writeText: async text => { copied = text; } } });
  const target = document.getElementById("main"); const code = showErrorPage(target, new Error("nope"));
  const buttons = [...target.querySelectorAll("button")].map(button => button.textContent); assert.deepEqual(buttons, ["Try again", "Copy code"]);
  target.querySelectorAll("button")[1].click(); await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(copied, code); assert.equal(target.querySelector("[role=status]").textContent, "Code copied");
}));

test("the teacher's error list is newest first, bounded and clearable", () => withDom(async () => {
  assert.deepEqual(recentErrors({ 0: { ts: 1, diag: "E-A" }, 1: { ts: 3, diag: "E-C" }, 2: { ts: 2, diag: "E-B" }, 3: null, 4: { diag: "bad" } }).map(item => item.diag), ["E-C", "E-B", "E-A"]);
  assert.equal(recentErrors(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [i, { ts: i + 1, diag: `E-${i}` }]))).length, 10);
  const host = document.createElement("div"); let cleared = false;
  renderErrorCard(host, { slots: { 0: { ts: 1790000000000, diag: "E-1A2B3C", page: "lesson.html", message: "oops" } }, clear: async () => { cleared = true; } });
  assert.match(host.textContent, /E-1A2B3C/); host.querySelector("button").click(); assert.ok(cleared);
  renderErrorCard(host, { slots: {} }); assert.match(host.textContent, /No errors reported/);
}));
