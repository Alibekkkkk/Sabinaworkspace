// Small deterministic random numbers so a puzzle made from the same seed is always the same puzzle.
export function hashSeed(text) {
  let hash = 2166136261;
  for (const char of String(text)) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededRandom(seed) {
  const next = mulberry32(typeof seed === "number" ? seed : hashSeed(seed));
  return max => Math.floor(next() * max);
}

export function seededShuffle(list, seed) {
  const random = seededRandom(seed);
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) { const j = random(i + 1); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}
