// Original SVG tutor characters ("Nora" and "Arthur", drawn for this project). States: idle (blinks), talking
// (mouth follows the audio amplitude), happy, encouraging, thinking, celebrating. With prefers-reduced-motion the
// figure keeps a static pose per state: no blinking, no bouncing, no mouth flapping.
const NS = "http://www.w3.org/2000/svg";
export const STATES = Object.freeze(["idle", "talking", "happy", "encouraging", "thinking", "celebrating"]);
export const CHARACTER_INFO = Object.freeze({
  nora: { name: "Nora", description: "British female voice", skin: "#f2c9a5", hair: "#5b3a29", top: "#4a5bd0", accent: "#f4b942" },
  arthur: { name: "Arthur", description: "British male voice", skin: "#e8b88f", hair: "#2f2a26", top: "#2c7a6b", accent: "#d96b4b" }
});

function svg(tag, attributes = {}, parent) {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  if (parent) parent.append(node);
  return node;
}

export const prefersReducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Mouth path for a state and openness (0..1). Pure: unit-testable.
export function mouthShape(state, openness = 0) {
  const level = Math.max(0, Math.min(1, openness));
  if (state === "talking" && level > 0.06) {
    const drop = 3 + level * 13;
    return { kind: "open", d: `M 40 66 Q 50 ${66 + drop} 60 66 Q 50 ${64 - level * 2} 40 66 Z` };
  }
  if (state === "happy" || state === "celebrating") return { kind: "smile", d: "M 36 64 Q 50 80 64 64 Q 50 70 36 64 Z" };
  if (state === "thinking") return { kind: "line", d: "M 42 68 Q 50 66 58 69" };
  if (state === "encouraging") return { kind: "line", d: "M 38 65 Q 50 75 62 65" };
  return { kind: "line", d: "M 40 66 Q 50 72 60 66" };
}

export function createCharacter(kind = "nora", { label } = {}) {
  const look = CHARACTER_INFO[kind] || CHARACTER_INFO.nora;
  const root = svg("svg", { viewBox: "0 0 100 120", class: "ls-character", role: "img", "aria-label": label || `${look.name}, your listening tutor`, "data-state": "idle", "data-kind": kind });
  const body = svg("g", { class: "ls-character__body" }, root);
  svg("path", { d: "M 14 120 Q 14 86 50 86 Q 86 86 86 120 Z", fill: look.top }, body);
  svg("rect", { x: 43, y: 76, width: 14, height: 14, rx: 5, fill: look.skin }, body);
  if (kind === "arthur") svg("path", { d: "M 44 90 L 50 96 L 56 90 L 56 100 L 50 95 L 44 100 Z", fill: look.accent }, body);
  else svg("circle", { cx: 50, cy: 98, r: 4, fill: look.accent }, body);
  const head = svg("g", { class: "ls-character__head" }, root);
  if (kind === "nora") svg("path", { d: "M 18 52 Q 16 14 50 14 Q 84 14 82 52 Q 84 78 76 84 L 24 84 Q 16 78 18 52 Z", fill: look.hair }, head);
  svg("ellipse", { cx: 50, cy: 52, rx: 30, ry: 32, fill: look.skin }, head);
  if (kind === "arthur") svg("path", { d: "M 20 48 Q 18 18 50 18 Q 82 18 80 48 Q 70 32 50 32 Q 30 32 20 48 Z", fill: look.hair }, head);
  else svg("path", { d: "M 20 46 Q 24 22 50 22 Q 76 22 80 46 Q 62 30 50 36 Q 38 30 20 46 Z", fill: look.hair }, head);
  svg("circle", { cx: 29, cy: 62, r: 5, fill: "#f08f8f", opacity: 0.35 }, head);
  svg("circle", { cx: 71, cy: 62, r: 5, fill: "#f08f8f", opacity: 0.35 }, head);
  const brows = svg("g", { class: "ls-character__brows", stroke: look.hair, "stroke-width": 2.4, "stroke-linecap": "round", fill: "none" }, head);
  const browLeft = svg("path", { d: "M 33 40 Q 39 37 45 40" }, brows);
  const browRight = svg("path", { d: "M 55 40 Q 61 37 67 40" }, brows);
  const eyesOpen = svg("g", { class: "ls-character__eyes" }, head);
  svg("ellipse", { cx: 39, cy: 50, rx: 4, ry: 5, fill: "#22262e" }, eyesOpen);
  svg("ellipse", { cx: 61, cy: 50, rx: 4, ry: 5, fill: "#22262e" }, eyesOpen);
  svg("circle", { cx: 40.4, cy: 48, r: 1.4, fill: "#fff" }, eyesOpen);
  svg("circle", { cx: 62.4, cy: 48, r: 1.4, fill: "#fff" }, eyesOpen);
  const eyesHappy = svg("g", { class: "ls-character__eyes-happy", stroke: "#22262e", "stroke-width": 2.6, "stroke-linecap": "round", fill: "none" }, head);
  svg("path", { d: "M 34 51 Q 39 44 44 51" }, eyesHappy);
  svg("path", { d: "M 56 51 Q 61 44 66 51" }, eyesHappy);
  const mouth = svg("path", { class: "ls-character__mouth", d: mouthShape("idle").d, fill: "#b4434c", stroke: "#b4434c", "stroke-width": 2.2, "stroke-linecap": "round", "stroke-linejoin": "round" }, head);
  const sparkles = svg("g", { class: "ls-character__sparkles", fill: look.accent }, root);
  for (const [x, y] of [[10, 22], [90, 18], [6, 62], [94, 58]]) svg("path", { d: `M ${x} ${y - 6} L ${x + 2} ${y - 2} L ${x + 6} ${y} L ${x + 2} ${y + 2} L ${x} ${y + 6} L ${x - 2} ${y + 2} L ${x - 6} ${y} L ${x - 2} ${y - 2} Z` }, sparkles);

  let state = "idle";
  let openness = 0;
  const still = () => prefersReducedMotion();
  function draw() {
    root.dataset.state = state;
    const shape = mouthShape(state, openness);
    mouth.setAttribute("d", shape.d);
    mouth.setAttribute("fill", shape.kind === "line" ? "none" : "#b4434c");
    const happy = state === "happy" || state === "celebrating";
    eyesOpen.style.display = happy ? "none" : "";
    eyesHappy.style.display = happy ? "" : "none";
    browLeft.setAttribute("d", state === "thinking" ? "M 33 37 Q 39 33 45 38" : state === "encouraging" ? "M 33 38 Q 39 34 45 39" : "M 33 40 Q 39 37 45 40");
    browRight.setAttribute("d", state === "thinking" ? "M 55 40 Q 61 38 67 40" : state === "encouraging" ? "M 55 39 Q 61 34 67 38" : "M 55 40 Q 61 37 67 40");
  }
  draw();
  return {
    element: root,
    setState(next) { if (STATES.includes(next)) { state = next; if (next !== "talking") openness = 0; draw(); } },
    // amplitude 0..1; ignored for reduced motion (the pose stays still while talking)
    setMouth(level) { if (still()) return; openness = level; if (state === "talking") draw(); },
    get state() { return state; }
  };
}
