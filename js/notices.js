// Small dismissible messages stacked at the top of the page (a second tab is open, the clock is wrong, storage is blocked,
// something went wrong). Each has an id, so the same message is never shown twice. DOM APIs and textContent only.
import { t } from "./i18n.js";

const set = (node, rules) => { for (const [name, value] of Object.entries(rules)) node.style.setProperty(name, value); };

function host() {
  let node = document.getElementById("noticeHost");
  if (!node) { node = document.createElement("div"); node.id = "noticeHost"; set(node, { position: "fixed", top: "0", left: "0", right: "0", "z-index": "950", display: "grid", gap: "1px" }); document.body.prepend(node); }
  return node;
}

// kind: "warning" | "error" | "info". `action` is { label, run } for one extra button (for example "Copy code").
export function showNotice(id, text, { kind = "warning", action = null } = {}) {
  if (typeof document === "undefined" || !document.body) return null;
  const existing = document.getElementById(`notice-${id}`); if (existing) { existing.querySelector("p").textContent = text; return existing; }
  const box = document.createElement("div"); box.id = `notice-${id}`; box.className = `ds-banner ds-banner--${kind === "error" ? "danger" : "warning"}`; box.setAttribute("role", kind === "error" ? "alert" : "status");
  set(box, { display: "flex", "flex-wrap": "wrap", gap: "8px", "align-items": "center", padding: "8px 12px", background: kind === "error" ? "var(--ds-color-danger-soft, #fde8ea)" : "var(--ds-color-warning-soft, #fff3d6)", color: "var(--ds-color-text, #1d2738)", "border-bottom": "2px solid currentColor", font: "600 15px system-ui, sans-serif" });
  const message = document.createElement("p"); message.textContent = text; set(message, { margin: "0", flex: "1 1 16rem" });
  box.append(message);
  const button = (label, run) => { const node = document.createElement("button"); node.type = "button"; node.textContent = label; set(node, { "min-height": "44px", "min-width": "44px", padding: "0 12px", font: "inherit", cursor: "pointer" }); node.addEventListener("click", run); return node; };
  if (action) box.append(button(action.label, () => action.run(box)));
  box.append(button(t("notice.close"), () => box.remove()));
  host().append(box);
  return box;
}
export const hideNotice = id => { const node = typeof document !== "undefined" ? document.getElementById(`notice-${id}`) : null; if (node) node.remove(); };
