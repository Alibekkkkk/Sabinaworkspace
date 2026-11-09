// DOM helpers for game screens. Everything is built with createElement and textContent, never from HTML strings.
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(label, className, handler, attributes = {}) {
  const node = el("button", className || "button", label);
  node.type = "button";
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (handler) node.addEventListener("click", handler);
  return node;
}

// A labelled progress meter. The visible bar is decorative; the text says the same in words.
export function meter(label, max) {
  const wrap = el("div", "gm-meter");
  const text = el("span", "gm-meter__label");
  const track = el("div", "gm-meter__track"); track.setAttribute("role", "progressbar"); track.setAttribute("aria-label", label); track.setAttribute("aria-valuemin", "0"); track.setAttribute("aria-valuemax", String(max));
  const fill = el("div", "gm-meter__fill"); track.append(fill); wrap.append(text, track);
  return {
    element: wrap,
    set(value, extra = "") {
      const clamped = Math.max(0, Math.min(max, value));
      fill.style.setProperty("--fill", `${max ? (clamped / max) * 100 : 0}%`);
      track.setAttribute("aria-valuenow", String(clamped));
      text.textContent = `${label}: ${clamped} of ${max}${extra ? `, ${extra}` : ""}`;
    }
  };
}

export function liveRegion() {
  const node = el("p", "gm-live"); node.setAttribute("role", "status"); node.setAttribute("aria-live", "polite");
  return { element: node, say(text) { node.textContent = ""; setTimeout(() => { node.textContent = text; }, 20); } };
}

// Number keys choose options while the game has focus: 1..9 click the Nth button inside `container`.
export function numberKeys(container, selector) {
  const root = container.closest(".game-card") || container; // keys work while focus is anywhere on the game card
  const handler = event => {
    if (event.ctrlKey || event.metaKey || event.altKey || !/^[1-9]$/.test(event.key)) return;
    if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select")) return;
    const buttons = [...container.querySelectorAll(selector)].filter(node => !node.disabled);
    const target = buttons[Number(event.key) - 1];
    if (target) { event.preventDefault(); target.click(); }
  };
  root.addEventListener("keydown", handler);
  return () => root.removeEventListener("keydown", handler);
}
