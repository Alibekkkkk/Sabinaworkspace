// Stage/homework completion celebration. The CSS hides it entirely for prefers-reduced-motion and
// Calm mode, and we skip creating the nodes too so nothing is ever inserted for those users.
export function prefersCalm() {
  try {
    return document.documentElement.dataset.calm === "true" ||
      (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (error) {
    return false;
  }
}

export function confetti(pieces = 48) {
  if (prefersCalm()) return;
  const layer = document.createElement("div");
  layer.className = "ds-confetti";
  layer.setAttribute("aria-hidden", "true");
  for (let index = 0; index < pieces; index++) {
    const piece = document.createElement("i");
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.animationDelay = `${Math.random() * 0.5}s`;
    piece.style.transform = `rotate(${Math.floor(Math.random() * 360)}deg)`;
    layer.append(piece);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 2600);
}
