// Whiteboard object model: limits, palette, creation helpers and a strict sanitiser for anything read from the
// database (other people's data is untrusted). Mirrors the validation in database.rules.json.
import { decodePoints, encodePoints, localisePoints } from "./geometry.js";

export const BOARD = Object.freeze({ width: 8000, height: 6000 });
export const LIMITS = Object.freeze({
  objectBytes: 8192, // per object, enforced by the field caps below and checked on the client
  pageBytes: 1536 * 1024, // per page, checked on the client before every write
  strokePts: 5600, // characters of encoded points per stroke object
  text: 1500, alt: 200, title: 60, imageChars: 250000, maxPages: 12, coord: 20000, size: 20000
});

export const TYPES = Object.freeze(["stroke", "shape", "text", "sticky", "image"]);
export const SHAPE_KINDS = Object.freeze(["line", "arrow", "rect", "ellipse", "triangle"]);
export const STROKE_KINDS = Object.freeze(["pen", "hl"]);
export const BACKGROUNDS = Object.freeze(["blank", "grid", "dots", "ruled"]);
export const MODES = Object.freeze(["view", "draw", "teacher-only"]);
export const PAPERS = Object.freeze({ light: "#ffffff", dark: "#1e2433" });
export const AUTO_INK = "auto"; // black on light paper, white on dark paper

// Colours with at least 3:1 contrast on both papers. "auto" flips with the paper.
export const PALETTE = Object.freeze([
  { name: "Ink", value: AUTO_INK },
  { name: "Red", value: "#e03131" },
  { name: "Orange", value: "#d9480f" },
  { name: "Green", value: "#2f9e44" },
  { name: "Blue", value: "#1c7ed6" },
  { name: "Purple", value: "#ae3ec9" },
  { name: "Pink", value: "#d6336c" },
  { name: "Teal", value: "#0c8599" }
]);
export const STICKY_COLOURS = Object.freeze(["#fff3a8", "#bdecc9", "#bfe0fb", "#fbcbe0"]);
export const WIDTH_PRESETS = Object.freeze([2, 4, 8, 14, 24]);
export const FONT_SIZES = Object.freeze([18, 24, 32, 48, 72]);

const COLOUR = /^(auto|#[0-9a-fA-F]{6})$/;
const ID = /^[A-Za-z0-9_-]{1,40}$/;
const finite = (value, low, high) => typeof value === "number" && Number.isFinite(value) && value >= low && value <= high;
const text = (value, max) => typeof value === "string" && value.length <= max;

export function newId(prefix = "o") {
  const random = typeof crypto !== "undefined" && crypto.getRandomValues ? Array.from(crypto.getRandomValues(new Uint8Array(6)), byte => byte.toString(36).padStart(2, "0")).join("") : Math.random().toString(36).slice(2, 14);
  return `${prefix}${Date.now().toString(36)}${random}`.slice(0, 40);
}

export function resolveColour(value, paper = "light") {
  if (value === AUTO_INK) return paper === "dark" ? "#ffffff" : "#111827";
  return COLOUR.test(value || "") ? value : "#111827";
}

export function defaultStyle(overrides = {}) { return { c: AUTO_INK, w: 4, o: 1, fs: 24, ...overrides }; }

function cleanStyle(raw) {
  const style = {};
  if (!raw || typeof raw !== "object") return defaultStyle();
  style.c = COLOUR.test(raw.c || "") ? raw.c : AUTO_INK;
  style.w = finite(raw.w, 1, 64) ? raw.w : 4;
  style.o = finite(raw.o, 0.05, 1) ? raw.o : 1;
  if (typeof raw.f === "string" && COLOUR.test(raw.f)) style.f = raw.f;
  style.fs = finite(raw.fs, 8, 200) ? raw.fs : 24;
  if (raw.b === true) style.b = true;
  if (raw.u === true) style.u = true;
  return style;
}

// A clean copy of an object read from the database, or null if it is not usable. Tombstones keep only identity.
export function sanitizeObject(id, raw) {
  if (!ID.test(id || "") || !raw || typeof raw !== "object") return null;
  if (!TYPES.includes(raw.t)) return null;
  const base = { id, t: raw.t, z: finite(raw.z, -1e9, 1e9) ? raw.z : 0, by: text(raw.by, 128) ? raw.by : "", at: finite(raw.at, 0, 1e15) ? raw.at : 0 };
  if (raw.del === true) return { ...base, del: true, x: 0, y: 0, w: 0, h: 0 };
  const object = {
    ...base,
    x: finite(raw.x, -LIMITS.coord, LIMITS.coord) ? raw.x : 0,
    y: finite(raw.y, -LIMITS.coord, LIMITS.coord) ? raw.y : 0,
    w: finite(raw.w, 0, LIMITS.size) ? raw.w : 0,
    h: finite(raw.h, 0, LIMITS.size) ? raw.h : 0,
    s: cleanStyle(raw.s)
  };
  if (finite(raw.r, -7, 7) && raw.r) object.r = raw.r;
  if (raw.lk === true) object.lk = true;
  if (raw.t === "stroke") {
    object.k = STROKE_KINDS.includes(raw.k) ? raw.k : "pen";
    if (!text(raw.p, LIMITS.strokePts)) return null;
    object.p = raw.p;
  } else if (raw.t === "shape") {
    if (!SHAPE_KINDS.includes(raw.k)) return null;
    object.k = raw.k;
    if (raw.k === "line" || raw.k === "arrow") { if (!text(raw.p, LIMITS.strokePts)) return null; object.p = raw.p; }
  } else if (raw.t === "text" || raw.t === "sticky") {
    object.tx = text(raw.tx, LIMITS.text) ? raw.tx : "";
    if (raw.t === "sticky") object.s.f = STICKY_COLOURS.includes(object.s.f) ? object.s.f : STICKY_COLOURS[0];
  } else if (raw.t === "image") {
    if (!ID.test(raw.im || "")) return null;
    object.im = raw.im;
    object.alt = text(raw.alt, LIMITS.alt) ? raw.alt : "";
  }
  return object;
}

export function sanitizeMeta(raw) {
  const meta = { title: "Page", bg: "blank", paper: "light", order: 0 };
  if (!raw || typeof raw !== "object") return meta;
  if (text(raw.title, LIMITS.title) && raw.title.trim()) meta.title = raw.title;
  if (BACKGROUNDS.includes(raw.bg)) meta.bg = raw.bg;
  if (raw.paper === "dark") meta.paper = "dark";
  if (finite(raw.order, 0, 1000)) meta.order = raw.order;
  return meta;
}

export function isImageDataUrl(value) {
  return typeof value === "string" && value.length <= LIMITS.imageChars && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value);
}

// ---- size accounting ----------------------------------------------------------------------------------------
export function objectBytes(object) { return JSON.stringify(object).length; }

export function pageBytes(objects, images = {}) {
  let total = 0;
  for (const object of objects) total += objectBytes(object);
  for (const value of Object.values(images)) total += typeof value === "string" ? value.length : 0;
  return total;
}

export function boardIsFull(objects, images, extraBytes = 0) { return pageBytes(objects, images) + extraBytes > LIMITS.pageBytes; }

// ---- creation ------------------------------------------------------------------------------------------------
let zCounter = 0;
export function nextZ(objects = []) { zCounter = Math.max(zCounter, ...objects.map(object => object.z || 0), 0) + 1; return zCounter; }

export function wire(object) { // the shape stored in the database: no id (it is the key), no derived fields
  const { id, ...rest } = object;
  void id;
  return JSON.parse(JSON.stringify(rest)); // drops undefined values, which the database rejects
}

// Stroke objects from a list of absolute points. Long strokes are split so each object stays under the size cap.
export function strokeObjects(points, { kind = "pen", style = defaultStyle(), by = "", z = 1, now = Date.now() } = {}) {
  const chunks = []; let current = [];
  for (const point of points) {
    current.push(point);
    if (encodePoints(localisePoints(current).points).length > LIMITS.strokePts - 200) { chunks.push(current); current = [point]; }
  }
  if (current.length > 1 || !chunks.length) chunks.push(current);
  return chunks.map((chunk, index) => {
    const local = localisePoints(chunk);
    return { id: newId("s"), t: "stroke", k: kind, z: z + index * 0.001, x: local.x, y: local.y, w: local.w, h: local.h, p: encodePoints(local.points), s: { ...style }, by, at: now };
  });
}

export function shapeObject(kind, box, { style = defaultStyle(), by = "", z = 1, now = Date.now(), points = null } = {}) {
  const object = { id: newId("h"), t: "shape", k: kind, z, x: box.x, y: box.y, w: box.w, h: box.h, s: { ...style }, by, at: now };
  if (points) object.p = encodePoints(points);
  return object;
}

export function textObject(box, content, { style = defaultStyle(), by = "", z = 1, now = Date.now() } = {}) {
  return { id: newId("t"), t: "text", z, x: box.x, y: box.y, w: box.w, h: box.h, tx: content.slice(0, LIMITS.text), s: { ...style }, by, at: now };
}

export function stickyObject(box, content, colour, { by = "", z = 1, now = Date.now() } = {}) {
  return { id: newId("n"), t: "sticky", z, x: box.x, y: box.y, w: box.w, h: box.h, tx: content.slice(0, LIMITS.text), s: { c: "#1d2738", w: 2, o: 1, fs: 20, f: colour || STICKY_COLOURS[0] }, by, at: now };
}

export function imageObject(box, imageId, alt, { by = "", z = 1, now = Date.now() } = {}) {
  return { id: newId("i"), t: "image", z, x: box.x, y: box.y, w: box.w, h: box.h, im: imageId, alt: (alt || "").slice(0, LIMITS.alt), s: defaultStyle(), by, at: now };
}

export function polyline(object) { return decodePoints(object.p); }

// Plain-text outline of the board for screen readers: text, sticky notes and images in reading order.
export function outlineOf(objects) {
  const items = objects.filter(object => !object.del && (object.t === "text" || object.t === "sticky" || object.t === "image"));
  items.sort((a, b) => Math.round(a.y / 40) - Math.round(b.y / 40) || a.x - b.x);
  return items.map(object => ({ id: object.id, type: object.t, label: object.t === "image" ? (object.alt || "Image without a description") : (object.tx || "(empty)").replace(/\s+/g, " ").trim() || "(empty)", x: Math.round(object.x), y: Math.round(object.y) }));
}
