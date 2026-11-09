// Teacher dashboard card "Recent errors": what the student's browser reported (clientErrors/<code>), newest first, with a clear
// button. DOM APIs and textContent only.
const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };

// The stored slots as a list, newest first, at most `limit` of them.
export function recentErrors(slots, limit = 10) {
  return Object.values(slots || {}).filter(item => item && Number.isFinite(item.ts)).sort((a, b) => b.ts - a.ts).slice(0, limit);
}

export function renderErrorCard(host, { slots, clear }) {
  host.replaceChildren();
  const items = recentErrors(slots);
  if (!items.length) { host.append(el("p", "No errors reported by this student's browser.")); return items; }
  host.append(el("p", `${Object.keys(slots).length} report${Object.keys(slots).length === 1 ? "" : "s"} stored; the newest ${items.length} are shown. The code is the one the student sees on screen.`, "hint"));
  const list = el("ul", "", "error-list");
  for (const item of items) { const row = el("li"); row.append(el("strong", item.diag), el("span", ` · ${new Date(item.ts).toLocaleString()} · ${item.page} · ${item.message}`)); list.append(row); }
  host.append(list);
  if (clear) { const button = el("button", "Clear these reports", "btn small"); button.type = "button"; button.addEventListener("click", () => { button.disabled = true; clear().catch(error => { button.disabled = false; host.append(el("p", `Could not clear: ${error.message}`, "hint")); }); }); host.append(button); }
  return items;
}
