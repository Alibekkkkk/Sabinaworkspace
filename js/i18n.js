// Interface language: English, Russian and Kazakh. Strings live in locales/<language>.json; t("key", { name: value }) returns the
// text in the chosen language, then in English, then the key itself. The choice is remembered on the device and the page reloads
// when it changes, so everything is drawn again in the new language. Dates and numbers go through Intl in the same language.
import { safeLocal } from "./safe-storage.js";

export const LANGUAGES = Object.freeze({ en: "English", ru: "Русский", kk: "Қазақша" });
export const DEFAULT_LANGUAGE = "en";
export const LANGUAGE_KEY = "nd_language";
const LOCALE_TAGS = { en: "en-GB", ru: "ru-RU", kk: "kk-KZ" };
let current = DEFAULT_LANGUAGE; let dictionary = {}; let fallback = {};

export const isLanguage = value => Object.hasOwn(LANGUAGES, value);
export const getLanguage = () => current;
export const localeTag = () => LOCALE_TAGS[current];

// Fills {name} placeholders. A missing value leaves the placeholder visible, which is easier to spot than a blank.
export function format(template, params = {}) {
  return String(template).replace(/\{(\w+)\}/g, (match, name) => (Object.hasOwn(params, name) ? String(params[name]) : match));
}
export function t(key, params) { return format(Object.hasOwn(dictionary, key) ? dictionary[key] : Object.hasOwn(fallback, key) ? fallback[key] : key, params); }

// Which language to use: the saved choice, then the browser's, then English.
export function pickLanguage(saved, browserLanguages = []) {
  if (isLanguage(saved)) return saved;
  for (const tag of browserLanguages) { const base = String(tag || "").toLowerCase().split("-")[0]; if (isLanguage(base)) return base; }
  return DEFAULT_LANGUAGE;
}

async function loadFile(language) {
  const url = new URL(`../locales/${language}.json`, import.meta.url);
  try { const response = await fetch(url); if (response.ok) return await response.json(); } catch (error) { /* fall through to the file system (tests) */ }
  try { const fs = globalThis.process && globalThis.process.getBuiltinModule && globalThis.process.getBuiltinModule("node:fs"); if (fs) return JSON.parse(fs.readFileSync(url, "utf8")); } catch (error) { /* no dictionary: keys are shown */ }
  return {};
}

export async function initI18n({ language, loader = loadFile } = {}) {
  const saved = (() => { try { return safeLocal.getItem(LANGUAGE_KEY); } catch (error) { return null; } })();
  // Outside a browser page (tests, scripts) the machine's own language must not change the interface: English unless asked.
  const languages = typeof document !== "undefined" && typeof navigator !== "undefined" ? (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]) : [];
  current = isLanguage(language) ? language : pickLanguage(saved, languages);
  fallback = await loader(DEFAULT_LANGUAGE);
  dictionary = current === DEFAULT_LANGUAGE ? fallback : await loader(current);
  if (typeof document !== "undefined" && document.documentElement) document.documentElement.lang = current;
  if (typeof window !== "undefined") window.__i18n = { t, language: current };
  return current;
}

export function setLanguage(language, { reload = true } = {}) {
  if (!isLanguage(language)) throw new Error(`Unsupported language: ${language}`);
  safeLocal.setItem(LANGUAGE_KEY, language);
  if (reload && typeof location !== "undefined") location.reload();
  return language;
}

// A small language picker, put next to the theme button (or in `host`). Returns the select, or null when there is no place for it.
export function mountLanguageSwitch(host) {
  if (typeof document === "undefined") return null;
  if (document.getElementById("languageSwitch")) return null;
  let place = host || document.querySelector("[data-theme-toggle]");
  if (!place && document.body) { // pages without a theme button get a small picker in the top corner
    place = document.createElement("div"); place.id = "languageCorner";
    for (const [name, value] of Object.entries({ position: "fixed", top: "6px", right: "6px", "z-index": "900" })) place.style.setProperty(name, value);
    document.body.append(place); host = place;
  }
  if (!place) return null;
  const select = document.createElement("select"); select.id = "languageSwitch"; select.className = "ds-select"; select.setAttribute("aria-label", t("lang.label"));
  select.style.setProperty("width", "auto"); select.style.setProperty("min-height", "44px"); select.style.setProperty("margin-inline", "8px");
  for (const [code, name] of Object.entries(LANGUAGES)) { const option = document.createElement("option"); option.value = code; option.textContent = name; option.selected = code === current; option.lang = code; select.append(option); }
  select.addEventListener("change", () => setLanguage(select.value));
  if (host) host.append(select); else place.after(select);
  return select;
}

export const formatNumber = (value, options) => new Intl.NumberFormat(LOCALE_TAGS[current], options).format(value);
export const formatDate = (timestamp, options = { dateStyle: "medium" }) => new Intl.DateTimeFormat(LOCALE_TAGS[current], options).format(new Date(timestamp));
export const formatDateTime = timestamp => formatDate(timestamp, { dateStyle: "medium", timeStyle: "short" });
export const formatMinutes = minutes => new Intl.NumberFormat(LOCALE_TAGS[current], { style: "unit", unit: "minute", unitDisplay: "long" }).format(minutes);

// For static HTML: elements with data-i18n="key" get their text from the dictionary; data-i18n-aria-label="key" sets that attribute.
export function applyStaticTranslations(root = typeof document !== "undefined" ? document : null) {
  if (!root) return;
  for (const node of root.querySelectorAll("[data-i18n]")) node.textContent = t(node.getAttribute("data-i18n"));
  for (const node of root.querySelectorAll("[data-i18n-aria-label]")) node.setAttribute("aria-label", t(node.getAttribute("data-i18n-aria-label")));
}
