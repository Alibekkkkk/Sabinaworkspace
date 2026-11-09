// Global error boundary. Any uncaught error or unhandled promise rejection on a page shows a short message with a diagnostic code
// the student can copy, and (for a signed-in student) leaves a small record the teacher can see: clientErrors/<code>/<slot>.
// The record keeps at most 50 slots per student (the database rules only accept slots 0 to 49), the page sends at most
// MAX_PER_PAGE of them, the same error only once, and never two within MIN_GAP_MS. No personal data is added to the record.
import { diagnosticCode } from "./diagnostic.js";
import { t } from "./i18n.js";
import { showNotice } from "./notices.js";

export const MAX_PER_PAGE = 5; export const MIN_GAP_MS = 3000; export const SLOTS = 50;
const IGNORED = /ResizeObserver loop|^Script error\.?$|chrome-extension:|moz-extension:|Non-Error promise rejection/i;
const state = { installed: false, seen: new Set(), sent: 0, lastAt: 0, target: { db: null, code: "" } };

export function setErrorLogTarget(target) { Object.assign(state.target, target); }
export const resetErrorStateForTests = () => { state.seen.clear(); state.sent = 0; state.lastAt = 0; state.target = { db: null, code: "" }; };

export function describeError(reason) {
  const error = reason && typeof reason === "object" ? reason : { message: String(reason ?? "") };
  const message = String(error.message || error.code || error.reason || reason || "Unknown error");
  return { message, stack: String(error.stack || ""), diag: diagnosticCode(error.code ? error : { message }), permission: /permission[_ ]denied/i.test(`${error.code || ""} ${message}`) };
}

// The bounded record that is stored. Every string is cut to the length the database rules allow.
export function buildRecord(info, page, now = Date.now(), agent = "") {
  const record = { ts: now, diag: info.diag, page: String(page || "").slice(0, 80), message: info.message.replace(/\s+/g, " ").slice(0, 200) };
  if (info.stack) record.stack = info.stack.split("\n").slice(0, 6).join("\n").slice(0, 600);
  if (agent) record.agent = String(agent).slice(0, 120);
  return record;
}
export const slotFor = (now = Date.now()) => Math.floor(now / 1000) % SLOTS;

// Should this error be shown and sent now? Returns false for noise, repeats, and anything over the limits.
export function shouldReport(info, now = Date.now()) {
  if (IGNORED.test(info.message) || state.seen.has(info.diag)) return false;
  if (state.sent >= MAX_PER_PAGE || now - state.lastAt < MIN_GAP_MS) return false;
  state.seen.add(info.diag); state.sent += 1; state.lastAt = now;
  return true;
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (error) { /* try the old way */ }
  try { const area = document.createElement("textarea"); area.value = text; document.body.append(area); area.select(); const ok = document.execCommand("copy"); area.remove(); return ok; } catch (error) { return false; }
}

export function handleError(reason, now = Date.now()) {
  let info; try { info = describeError(reason); } catch (error) { return null; }
  if (typeof console !== "undefined") console.error(reason);
  if (!shouldReport(info, now)) return null;
  const connected = typeof navigator === "undefined" || navigator.onLine !== false;
  const text = info.permission ? t("error.expired") : !connected ? t("error.offline") : t("error.toast", { code: info.diag });
  showNotice(`error-${info.diag}`, text, { kind: "error", action: { label: t("error.copy"), run: async box => { const ok = await copyText(info.diag); const note = box.querySelector("p"); note.textContent = ok ? `${t("error.copied")}: ${info.diag}` : t("error.copyFailed"); } } });
  const { db, code } = state.target;
  if (db && code) {
    try { Promise.resolve(db.ref(`clientErrors/${code}/${slotFor(now)}`).set(buildRecord(info, typeof location !== "undefined" ? location.pathname.split("/").pop() : "", now, typeof navigator !== "undefined" ? navigator.userAgent : ""))).catch(() => {}); } catch (error) { /* logging must never raise another error */ }
  }
  return info;
}

export function installErrorBoundary(target = typeof window !== "undefined" ? window : null) {
  if (!target || state.installed) return false;
  state.installed = true;
  target.addEventListener("error", event => handleError(event.error || event.message));
  target.addEventListener("unhandledrejection", event => handleError(event.reason));
  return true;
}
