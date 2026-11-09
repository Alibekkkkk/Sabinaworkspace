// Shared app-shell behaviour for the student pages: mobile tab bar, offline banner, connection and clock checks, the global error
// boundary, the language picker, and a friendly error page with a copyable diagnostic code. Every visible string comes from
// locales/*.json through t(); the dictionary is loaded here, before any page code that imports this module runs.
import { diagnosticCode } from "./diagnostic.js";
import { initI18n, mountLanguageSwitch, t } from "./i18n.js";
import { installErrorBoundary, setErrorLogTarget } from "./error-log.js";
import { showNotice } from "./notices.js";
import { onStorageDegraded } from "./safe-storage.js";

await initI18n();
export { diagnosticCode };
export { setErrorLogTarget };

const TABS = [
  { id: "home", labelKey: "nav.home", icon: "\u{1F3E0}", href: "portal.html" },
  { id: "lesson", labelKey: "nav.lesson", icon: "\u{1F4D8}", href: "portal.html#lessonsScreen" },
  { id: "practice", labelKey: "nav.practice", icon: "\u{1F3AE}", href: "practice.html" },
  { id: "clips", labelKey: "nav.clips", icon: "\u{1F3AC}", href: "clips.html" },
  { id: "homework", labelKey: "nav.homework", icon: "\u{1F4CC}", href: "portal.html#lessonsScreen" },
  { id: "me", labelKey: "nav.me", icon: "\u{1F9D1}", href: "portal.html#studentSummary" }
];
const MANGA_TAB = { id: "manga", labelKey: "nav.manga", icon: "\u{1F4D6}", href: "manga.html" };

function tabLink(tab, current) {
  const link = document.createElement("a");
  link.href = tab.href; link.dataset.tab = tab.id;
  if (tab.id === current) link.setAttribute("aria-current", "page");
  const icon = document.createElement("span"); icon.setAttribute("aria-hidden", "true"); icon.textContent = tab.icon;
  const label = document.createElement("span"); label.textContent = tab.label || t(tab.labelKey);
  link.append(icon, label);
  return link;
}

export function mountBottomNav(current, { manga = false } = {}) {
  if (document.querySelector(".ds-bottom-nav")) return;
  const nav = document.createElement("nav");
  nav.className = "ds-bottom-nav";
  nav.setAttribute("aria-label", t("nav.label"));
  const tabs = manga ? [...TABS.slice(0, 4), MANGA_TAB, ...TABS.slice(4)] : TABS;
  for (const tab of tabs) nav.append(tabLink(tab, current));
  document.body.append(nav);
  document.body.classList.add("has-bottom-nav");
}

// Adds one tab to the bottom navigation after the tab with id `after` (or at the end). Does nothing if it is already there.
export function addNavTab(tab, after) {
  const nav = document.querySelector(".ds-bottom-nav");
  if (!nav || nav.querySelector(`[data-tab="${tab.id}"]`)) return;
  const link = tabLink(tab);
  const anchor = after ? [...nav.children].find(child => child.dataset.tab === after) : null;
  if (anchor) anchor.after(link); else nav.append(link);
}

export const OFFLINE_TEXT = t("offline.text");
export const DISCONNECTED_TEXT = t("offline.disconnected");
export const SYNCED_TEXT = t("offline.synced");

// languageSwitch: false on full-screen tools (the whiteboard), where the picker would take drawing space; the saved choice still applies.
export function mountOfflineBanner({ languageSwitch = true } = {}) {
  installErrorBoundary();
  if (languageSwitch) mountLanguageSwitch();
  onStorageDegraded(() => showNotice("storage", t("storage.degraded")));
  if (document.getElementById("offlineBanner")) return;
  const banner = document.createElement("div");
  banner.id = "offlineBanner";
  banner.className = "ds-banner ds-banner--warning ds-offline-banner";
  banner.setAttribute("role", "status");
  banner.hidden = navigator.onLine !== false;
  const icon = document.createElement("span");
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "!";
  const text = document.createElement("p");
  text.textContent = OFFLINE_TEXT;
  banner.append(icon, text);
  document.body.prepend(banner);
  window.addEventListener("online", () => { banner.hidden = true; });
  window.addEventListener("offline", () => { banner.hidden = false; });
}

export const SKEW_LIMIT_MS = 2 * 60 * 1000;
// A device clock more than two minutes from the server's makes due dates look wrong. Returns the notice text, or "" when it is fine.
export function skewMessage(offsetMs) {
  if (!Number.isFinite(offsetMs) || Math.abs(offsetMs) < SKEW_LIMIT_MS) return "";
  return t(offsetMs < 0 ? "skew.ahead" : "skew.behind", { minutes: Math.round(Math.abs(offsetMs) / 60000) });
}

// Shows the connection state of the database on top of the browser's own online flag: a drop shows a warning, and coming back
// shows "saved" for a few seconds. It also warns once if the device clock is far from the server's. `db` is the Firebase database.
export function watchConnection(db, { hideAfter = 4000 } = {}) {
  mountOfflineBanner({ languageSwitch: false }); // the page already chose whether to show the picker
  setErrorLogTarget({ db });
  const banner = document.getElementById("offlineBanner"); const text = banner.querySelector("p");
  let seenConnected = false; let dropped = false; let timer = 0;
  db.ref(".info/connected").on("value", snapshot => {
    const connected = snapshot.val() === true;
    clearTimeout(timer);
    if (connected) {
      seenConnected = true;
      if (dropped) { dropped = false; text.textContent = SYNCED_TEXT; banner.hidden = false; timer = setTimeout(() => { banner.hidden = navigator.onLine !== false; text.textContent = OFFLINE_TEXT; }, hideAfter); }
      else banner.hidden = navigator.onLine !== false;
    } else if (seenConnected) { dropped = true; text.textContent = navigator.onLine === false ? OFFLINE_TEXT : DISCONNECTED_TEXT; banner.hidden = false; }
  });
  db.ref(".info/serverTimeOffset").on("value", snapshot => { const message = skewMessage(Number(snapshot.val())); if (message) showNotice("clock-skew", message); });
}

// Replaces `target` with an error card: friendly message, retry, a diagnostic code with a copy button.
export function showErrorPage(target, error, { title = t("error.title") } = {}) {
  const code = diagnosticCode(error);
  const card = document.createElement("section");
  card.className = "ds-card ds-error-page";
  card.setAttribute("role", "alert");
  const heading = document.createElement("h2");
  heading.textContent = title;
  const message = document.createElement("p");
  message.textContent = t("error.message");
  const detail = document.createElement("p");
  detail.className = "ds-field__hint";
  detail.textContent = t("error.code", { code });
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "ds-btn ds-btn--primary";
  retry.textContent = t("error.retry");
  retry.addEventListener("click", () => window.location.reload());
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "ds-btn ds-btn--secondary";
  copy.textContent = t("error.copy");
  const copyStatus = document.createElement("span"); copyStatus.setAttribute("role", "status");
  copy.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(code); copyStatus.textContent = t("error.copied"); } catch (failure) { copyStatus.textContent = t("error.copyFailed"); }
  });
  const technical = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = t("error.technical");
  const raw = document.createElement("pre");
  raw.className = "ds-error-page__raw";
  raw.textContent = String((error && error.message) || error || t("error.unknown")).slice(0, 400);
  technical.append(summary, raw);
  card.append(heading, message, detail, retry, copy, copyStatus, technical);
  target.replaceChildren(card);
  return code;
}

// A few skeleton blocks shown while a page loads; replaced by the real content.
export function showSkeleton(target, rows = 4) {
  const wrapper = document.createElement("div");
  wrapper.className = "ds-skeleton-stack";
  wrapper.setAttribute("aria-busy", "true");
  wrapper.setAttribute("aria-label", t("skeleton.loading"));
  for (let index = 0; index < rows; index++) {
    const row = document.createElement("div");
    row.className = "ds-skeleton ds-skeleton-row";
    wrapper.append(row);
  }
  target.replaceChildren(wrapper);
}
