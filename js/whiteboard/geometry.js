// Whiteboard geometry: stroke simplification, compact point encoding, bounds, hit testing and transform maths.
// Pure functions: no DOM, no Firebase. Coordinates are board units (one unit is one pixel at 100% zoom).
// Points are [x, y, pressure] with pressure 0..1.

export const POINT_SCALE = 2; // stored precision: half a board unit

export function distance(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

export function distToSegment(p, a, b) {
  const dx = b[0] - a[0]; const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

// Ramer-Douglas-Peucker, iterative so very long strokes cannot overflow the stack.
export function rdp(points, epsilon) {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1; keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    let worst = 0; let index = -1;
    for (let i = start + 1; i < end; i++) {
      const d = distToSegment(points[i], points[start], points[end]);
      if (d > worst) { worst = d; index = i; }
    }
    if (index !== -1 && worst > epsilon) { keep[index] = 1; stack.push([start, index], [index, end]); }
  }
  return points.filter((_, i) => keep[i]);
}

// Drop points closer than minGap, then simplify. A single tap becomes a two-point dot.
export function simplifyStroke(points, epsilon = 0.6, minGap = 0.4) {
  if (!points.length) return [];
  const spaced = [points[0]];
  for (let i = 1; i < points.length; i++) if (distance(points[i], spaced[spaced.length - 1]) >= minGap) spaced.push(points[i]);
  if (spaced.length === 1) return [spaced[0], [spaced[0][0], spaced[0][1], spaced[0][2]]];
  const last = points[points.length - 1];
  if (spaced[spaced.length - 1] !== last && distance(last, spaced[spaced.length - 1]) > 0) spaced.push(last);
  return rdp(spaced, epsilon);
}

const clampPressure = value => Math.max(0, Math.min(9, Math.round((Number.isFinite(value) ? value : 0.5) * 9)));
const b36 = number => number.toString(36);

// "x,y,p dx,dy,p ..." in base 36, units of 1/POINT_SCALE. The first token is absolute, the rest are deltas.
export function encodePoints(points) {
  let previousX = 0; let previousY = 0; const out = [];
  for (const point of points) {
    const x = Math.round(point[0] * POINT_SCALE); const y = Math.round(point[1] * POINT_SCALE);
    out.push(`${b36(x - previousX)},${b36(y - previousY)},${clampPressure(point[2])}`);
    previousX = x; previousY = y;
  }
  return out.join(" ");
}

export function decodePoints(text, maxPoints = 4000) {
  if (typeof text !== "string" || !text) return [];
  const out = []; let x = 0; let y = 0;
  for (const token of text.split(" ")) {
    if (out.length >= maxPoints) break;
    const parts = token.split(",");
    if (parts.length !== 3) return [];
    const dx = parseInt(parts[0], 36); const dy = parseInt(parts[1], 36); const pressure = Number(parts[2]);
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !(pressure >= 0 && pressure <= 9)) return [];
    x += dx; y += dy;
    out.push([x / POINT_SCALE, y / POINT_SCALE, pressure / 9]);
  }
  return out;
}

export function pointsBounds(points) {
  if (!points.length) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const point of points) { minX = Math.min(minX, point[0]); minY = Math.min(minY, point[1]); maxX = Math.max(maxX, point[0]); maxY = Math.max(maxY, point[1]); }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// Points relative to their own bounding box: { x, y, w, h, points } where points start at (0,0)-(w,h).
export function localisePoints(points) {
  const box = pointsBounds(points);
  return { x: box.x, y: box.y, w: box.w, h: box.h, points: points.map(point => [point[0] - box.x, point[1] - box.y, point[2]]) };
}

export function scalePoints(points, fromW, fromH, toW, toH) {
  const sx = fromW > 0 ? toW / fromW : 1; const sy = fromH > 0 ? toH / fromH : 1;
  return points.map(point => [point[0] * sx, point[1] * sy, point[2]]);
}

// ---- transforms --------------------------------------------------------------------------------------------
export function centre(object) { return [object.x + object.w / 2, object.y + object.h / 2]; }

export function rotatePoint(point, about, angle) {
  const cos = Math.cos(angle); const sin = Math.sin(angle);
  const dx = point[0] - about[0]; const dy = point[1] - about[1];
  return [about[0] + dx * cos - dy * sin, about[1] + dx * sin + dy * cos];
}

export function toLocal(object, point) { // board point -> object's unrotated frame (origin at its x,y)
  const local = object.r ? rotatePoint(point, centre(object), -object.r) : point;
  return [local[0] - object.x, local[1] - object.y];
}

export function corners(object) {
  const about = centre(object);
  return [[object.x, object.y], [object.x + object.w, object.y], [object.x + object.w, object.y + object.h], [object.x, object.y + object.h]]
    .map(corner => (object.r ? rotatePoint(corner, about, object.r) : corner));
}

const padOf = object => (object.t === "stroke" || (object.t === "shape" && (object.k === "line" || object.k === "arrow")) ? ((object.s && object.s.w) || 3) / 2 : 0);

export function objectBounds(object) { // axis aligned bounds of the rotated, padded object
  const pad = padOf(object);
  const points = corners(object);
  const xs = points.map(point => point[0]); const ys = points.map(point => point[1]);
  const minX = Math.min(...xs) - pad; const minY = Math.min(...ys) - pad;
  return { x: minX, y: minY, w: Math.max(...xs) + pad - minX, h: Math.max(...ys) + pad - minY };
}

export function unionBounds(boxes) {
  if (!boxes.length) return null;
  const minX = Math.min(...boxes.map(box => box.x)); const minY = Math.min(...boxes.map(box => box.y));
  const maxX = Math.max(...boxes.map(box => box.x + box.w)); const maxY = Math.max(...boxes.map(box => box.y + box.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function rectsIntersect(a, b) { return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y; }
export function rectContains(outer, inner) { return outer.x <= inner.x && outer.y <= inner.y && outer.x + outer.w >= inner.x + inner.w && outer.y + outer.h >= inner.y + inner.h; }

// ---- hit testing --------------------------------------------------------------------------------------------
function nearPolyline(points, local, tolerance) {
  if (points.length === 1) return distance(points[0], local) <= tolerance;
  for (let i = 1; i < points.length; i++) if (distToSegment(local, points[i - 1], points[i]) <= tolerance) return true;
  return false;
}

const insideBox = (object, local) => local[0] >= 0 && local[1] >= 0 && local[0] <= object.w && local[1] <= object.h;

function nearBoxEdge(object, local, tolerance) {
  if (!insideBox({ w: object.w + tolerance * 2, h: object.h + tolerance * 2 }, [local[0] + tolerance, local[1] + tolerance])) return false;
  return local[0] <= tolerance || local[1] <= tolerance || local[0] >= object.w - tolerance || local[1] >= object.h - tolerance;
}

function nearEllipseEdge(object, local, tolerance) {
  const rx = object.w / 2; const ry = object.h / 2;
  if (rx <= 0 || ry <= 0) return distance([rx, ry], local) <= tolerance;
  const nx = (local[0] - rx) / rx; const ny = (local[1] - ry) / ry;
  const ratio = Math.hypot(nx, ny);
  return Math.abs(ratio - 1) * Math.min(rx, ry) <= tolerance;
}

function triangleVertices(object) { return [[object.w / 2, 0], [object.w, object.h], [0, object.h]]; }

function pointInTriangle(p, [a, b, c]) {
  const sign = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  const d1 = sign(p, a, b); const d2 = sign(p, b, c); const d3 = sign(p, c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

// `polyline` is the object's decoded local points (strokes, lines and arrows). `tolerance` is in board units.
export function hitTest(object, point, tolerance = 4, polyline = null) {
  if (!object || object.del) return false;
  const local = toLocal(object, point);
  if (object.t === "stroke" || (object.t === "shape" && (object.k === "line" || object.k === "arrow"))) {
    return nearPolyline(polyline || [], local, tolerance + ((object.s && object.s.w) || 3) / 2);
  }
  if (object.t === "shape") {
    const filled = Boolean(object.s && object.s.f);
    if (object.k === "ellipse") {
      const rx = object.w / 2; const ry = object.h / 2;
      const inside = rx > 0 && ry > 0 && ((local[0] - rx) / rx) ** 2 + ((local[1] - ry) / ry) ** 2 <= 1;
      return filled ? inside : nearEllipseEdge(object, local, tolerance + ((object.s && object.s.w) || 3) / 2);
    }
    if (object.k === "triangle") {
      const vertices = triangleVertices(object);
      if (filled) return pointInTriangle(local, vertices);
      const edge = tolerance + ((object.s && object.s.w) || 3) / 2;
      return nearPolyline([...vertices, vertices[0]], local, edge);
    }
    return filled ? insideBox(object, local) : nearBoxEdge(object, local, tolerance + ((object.s && object.s.w) || 3) / 2);
  }
  return insideBox({ w: object.w + tolerance * 2, h: object.h + tolerance * 2 }, [local[0] + tolerance, local[1] + tolerance]);
}

// Topmost first. `polylineOf(object)` returns decoded local points for stroke-like objects.
export function pickTop(objects, point, tolerance, polylineOf) {
  const ordered = [...objects].sort((a, b) => (b.z || 0) - (a.z || 0) || (b.at || 0) - (a.at || 0));
  return ordered.find(object => !object.lk && hitTest(object, point, tolerance, polylineOf ? polylineOf(object) : null)) || null;
}

export function marqueeSelect(objects, rect, { contain = false } = {}) {
  const normal = { x: Math.min(rect.x, rect.x + rect.w), y: Math.min(rect.y, rect.y + rect.h), w: Math.abs(rect.w), h: Math.abs(rect.h) };
  return objects.filter(object => {
    if (object.del || object.lk) return false;
    const box = objectBounds(object);
    return contain ? rectContains(normal, box) : rectsIntersect(normal, box);
  });
}

// ---- resize / rotate ----------------------------------------------------------------------------------------
export const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
export const MIN_SIZE = 4;

// New {x,y,w,h} when dragging `handle` by (dx, dy) given in the object's own unrotated frame.
export function resizeBox(box, handle, dx, dy, { keepRatio = false } = {}) {
  let { x, y, w, h } = box;
  const ratio = box.w > 0 && box.h > 0 ? box.w / box.h : 1;
  if (handle.includes("e")) w += dx;
  if (handle.includes("w")) { x += dx; w -= dx; }
  if (handle.includes("s")) h += dy;
  if (handle.includes("n")) { y += dy; h -= dy; }
  if (keepRatio && handle.length === 2) {
    if (Math.abs(w / box.w - 1) >= Math.abs(h / box.h - 1)) h = w / ratio; else w = h * ratio;
    if (handle.includes("w")) x = box.x + box.w - w;
    if (handle.includes("n")) y = box.y + box.h - h;
  }
  if (w < MIN_SIZE) { if (handle.includes("w")) x -= MIN_SIZE - w; w = MIN_SIZE; }
  if (h < MIN_SIZE) { if (handle.includes("n")) y -= MIN_SIZE - h; h = MIN_SIZE; }
  return { x, y, w, h };
}

export function angleFromCentre(object, point) {
  const about = centre(object);
  return Math.atan2(point[1] - about[1], point[0] - about[0]) + Math.PI / 2;
}

export function snapAngle(angle, step = Math.PI / 12) { return Math.round(angle / step) * step; }

export function snapToGrid(value, grid = 20) { return Math.round(value / grid) * grid; }

// Apply the same scale to a set of objects, relative to the union box, e.g. when resizing a multi-selection.
export function scaleToBox(objects, fromBox, toBox) {
  const sx = fromBox.w > 0 ? toBox.w / fromBox.w : 1; const sy = fromBox.h > 0 ? toBox.h / fromBox.h : 1;
  return objects.map(object => ({ id: object.id, x: toBox.x + (object.x - fromBox.x) * sx, y: toBox.y + (object.y - fromBox.y) * sy, w: Math.max(MIN_SIZE, object.w * sx), h: Math.max(MIN_SIZE, object.h * sy) }));
}

// Smooth a polyline into quadratic segments through midpoints: returns [{ cx, cy, x, y }] after an initial move.
export function smoothSegments(points) {
  const out = [];
  for (let i = 1; i < points.length - 1; i++) {
    out.push({ cx: points[i][0], cy: points[i][1], x: (points[i][0] + points[i + 1][0]) / 2, y: (points[i][1] + points[i + 1][1]) / 2 });
  }
  return out;
}

// Rough shape recognition ("should"): a closed stroke whose points all sit near an ellipse or box becomes that shape.
export function recogniseShape(points) {
  if (points.length < 8) return null;
  const box = pointsBounds(points);
  if (box.w < 24 || box.h < 24) return null;
  const first = points[0]; const last = points[points.length - 1];
  const diagonal = Math.hypot(box.w, box.h);
  if (distance(first, last) > diagonal * 0.25) return null;
  const rx = box.w / 2; const ry = box.h / 2; const cx = box.x + rx; const cy = box.y + ry;
  const ellipseError = points.reduce((sum, point) => sum + Math.abs(Math.hypot((point[0] - cx) / rx, (point[1] - cy) / ry) - 1), 0) / points.length;
  const rectError = points.reduce((sum, point) => sum + Math.min(Math.abs(point[0] - box.x), Math.abs(point[0] - box.x - box.w), Math.abs(point[1] - box.y), Math.abs(point[1] - box.y - box.h)) / Math.min(box.w, box.h), 0) / points.length;
  if (ellipseError < 0.12 && ellipseError <= rectError) return { k: "ellipse", ...box };
  if (rectError < 0.06) return { k: "rect", ...box };
  return null;
}

// Insert points so no two neighbours are further apart than maxGap (used by the area eraser).
export function densify(points, maxGap) {
  if (points.length < 2 || !(maxGap > 0)) return points.slice();
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]; const b = points[i]; const steps = Math.ceil(distance(a, b) / maxGap);
    for (let s = 1; s <= steps; s++) { const t = s / steps; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
  }
  return out;
}

// Split a polyline into the runs of points that lie outside a circle. Used by the area eraser.
export function eraseFromPolyline(points, centreAt, radius) {
  const dense = densify(points, Math.max(1, radius / 2));
  const runs = []; let run = []; let touched = false;
  for (const point of dense) {
    if (Math.hypot(point[0] - centreAt[0], point[1] - centreAt[1]) <= radius) { touched = true; if (run.length) runs.push(run); run = []; } else run.push(point);
  }
  if (run.length) runs.push(run);
  return { touched, runs: runs.filter(part => part.length >= 2).map(part => rdp(part, 0.6)) };
}
