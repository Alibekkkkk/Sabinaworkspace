// Whiteboard canvas renderer. Committed objects are drawn into an offscreen cache that is blitted every frame
// (so panning is cheap); live strokes, selection, cursors and laser trails are drawn on top each frame.
// Frames are requested with requestAnimationFrame and coalesced.
import { corners, decodePoints, smoothSegments, unionBounds, objectBounds, rectsIntersect } from "./geometry.js";
import { AUTO_INK, BOARD, isImageDataUrl, PAPERS, resolveColour } from "./model.js";

export const FONT = '"Segoe UI", system-ui, -apple-system, Roboto, sans-serif';
export const STICKY_PAD = 12;
const MAX_CACHE_PIXELS = 4096;

export function fontFor(style) { return `${style.b ? "bold " : ""}${style.fs || 24}px ${FONT}`; }

// Word-wrapped lines for a text box of `width` board units. `measure(text)` returns the text width.
export function wrapLines(content, width, measure) {
  const lines = [];
  for (const paragraph of String(content || "").split("\n")) {
    if (!paragraph) { lines.push(""); continue; }
    let line = "";
    for (const word of paragraph.split(/(\s+)/)) {
      const attempt = line + word;
      if (line && measure(attempt) > width && word.trim()) { lines.push(line.trimEnd()); line = word.trimStart(); } else line = attempt;
    }
    lines.push(line);
  }
  return lines;
}

let measureContext = null;
export function measureTextHeight(content, style, width) {
  if (!measureContext && typeof document !== "undefined") measureContext = document.createElement("canvas").getContext("2d");
  const size = style.fs || 24;
  if (!measureContext) return Math.ceil(size * 1.3) * String(content || "").split("\n").length;
  measureContext.font = fontFor(style);
  return Math.max(Math.ceil(size * 1.3), wrapLines(content, width, text => measureContext.measureText(text).width).length * Math.ceil(size * 1.3));
}

// Frame used for selection handles: a single object keeps its rotation, several use the union box.
export function selectionFrame(objects) {
  if (!objects.length) return null;
  if (objects.length === 1) { const o = objects[0]; return { x: o.x, y: o.y, w: o.w, h: o.h, r: o.r || 0 }; }
  const box = unionBounds(objects.map(objectBounds));
  return { ...box, r: 0 };
}

export function handlePoints(frame, zoom, rotateGap = 26) {
  const about = [frame.x + frame.w / 2, frame.y + frame.h / 2];
  const turn = point => {
    if (!frame.r) return point;
    const cos = Math.cos(frame.r); const sin = Math.sin(frame.r);
    const dx = point[0] - about[0]; const dy = point[1] - about[1];
    return [about[0] + dx * cos - dy * sin, about[1] + dx * sin + dy * cos];
  };
  const { x, y, w, h } = frame; const mx = x + w / 2; const my = y + h / 2;
  return {
    nw: turn([x, y]), n: turn([mx, y]), ne: turn([x + w, y]), e: turn([x + w, my]), se: turn([x + w, y + h]), s: turn([mx, y + h]), sw: turn([x, y + h]), w: turn([x, my]),
    rot: turn([mx, y - rotateGap / zoom])
  };
}

export function createRenderer(canvas, options = {}) {
  const context = canvas.getContext("2d");
  const view = { zoom: 1, tx: 0, ty: 0 };
  let objects = new Map(); let images = {}; const imageElements = new Map(); const decoded = new Map();
  let background = "blank"; let paper = "light";
  const overlays = { live: new Map(), local: null, selection: [], marquee: null, lasers: new Map(), cursors: new Map(), guides: [], preview: null };
  let version = 0; let cache = null; let frame = 0; let width = 1; let height = 1; let dpr = 1;
  let zoomingUntil = 0; let rebuildTimer = 0;
  const stats = { frames: 0, rebuilds: 0, lastDrawMs: 0 };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    width = Math.max(1, Math.round(rect.width)); height = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    cache = null; request();
  }

  const points = object => {
    const key = object.id; const hit = decoded.get(key);
    if (hit && hit.p === object.p) return hit.points;
    const fresh = decodePoints(object.p);
    decoded.set(key, { p: object.p, points: fresh });
    return fresh;
  };

  function imageFor(id) {
    let entry = imageElements.get(id);
    const source = images[id];
    if (!entry || entry.source !== source) {
      entry = { source, ready: false, image: null };
      if (isImageDataUrl(source)) {
        const image = new Image(); entry.image = image;
        image.addEventListener("load", () => { entry.ready = true; version++; request(); });
        image.src = source;
      }
      imageElements.set(id, entry);
    }
    return entry;
  }

  // ---- drawing one committed object (also used by exports with their own context) ---------------------------
  function paintObject(ctx, object, paperName, imageLookup) {
    if (object.del) return;
    ctx.save();
    if (object.r) { ctx.translate(object.x + object.w / 2, object.y + object.h / 2); ctx.rotate(object.r); ctx.translate(-(object.x + object.w / 2), -(object.y + object.h / 2)); }
    ctx.globalAlpha = object.s.o;
    const stroke = resolveColour(object.s.c, paperName);
    ctx.strokeStyle = stroke; ctx.fillStyle = stroke; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = object.s.w;
    if (object.t === "stroke") paintStroke(ctx, object, points(object), paperName);
    else if (object.t === "shape") paintShape(ctx, object, paperName);
    else if (object.t === "text") paintText(ctx, object, paperName);
    else if (object.t === "sticky") paintSticky(ctx, object);
    else if (object.t === "image") paintImage(ctx, object, imageLookup);
    ctx.restore();
  }

  function paintStroke(ctx, object, pts, paperName) {
    ctx.save(); ctx.translate(object.x, object.y);
    if (object.k === "hl") {
      ctx.globalCompositeOperation = paperName === "dark" ? "source-over" : "multiply";
      ctx.globalAlpha = Math.min(object.s.o, 0.4); ctx.lineCap = "butt";
    }
    if (pts.length < 2) { ctx.beginPath(); ctx.arc(pts[0] ? pts[0][0] : 0, pts[0] ? pts[0][1] : 0, object.s.w / 2, 0, Math.PI * 2); ctx.fill(); ctx.restore(); return; }
    const pressureVaries = object.k !== "hl" && pts.some(point => Math.abs(point[2] - pts[0][2]) > 0.08);
    if (pressureVaries) {
      for (let i = 1; i < pts.length; i++) {
        ctx.beginPath(); ctx.lineWidth = Math.max(0.6, object.s.w * (0.35 + 1.1 * (pts[i][2] + pts[i - 1][2]) / 2));
        ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
      }
    } else tracePath(ctx, pts), ctx.stroke();
    ctx.restore();
  }

  function tracePath(ctx, pts) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    if (pts.length === 2) { ctx.lineTo(pts[1][0], pts[1][1]); return; }
    for (const segment of smoothSegments(pts)) ctx.quadraticCurveTo(segment.cx, segment.cy, segment.x, segment.y);
    const last = pts[pts.length - 1]; ctx.lineTo(last[0], last[1]);
  }

  function paintShape(ctx, object, paperName) {
    const { x, y, w, h } = object;
    const fill = object.s.f ? resolveColour(object.s.f, paperName) : null;
    if (object.k === "line" || object.k === "arrow") {
      const pts = points(object).map(point => [point[0] + x, point[1] + y]);
      if (pts.length < 2) return;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]); ctx.stroke();
      if (object.k === "arrow") {
        const a = pts[0]; const b = pts[pts.length - 1]; const angle = Math.atan2(b[1] - a[1], b[0] - a[0]); const head = Math.max(12, object.s.w * 4);
        ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] - head * Math.cos(angle - 0.45), b[1] - head * Math.sin(angle - 0.45));
        ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] - head * Math.cos(angle + 0.45), b[1] - head * Math.sin(angle + 0.45)); ctx.stroke();
      }
      return;
    }
    ctx.beginPath();
    if (object.k === "ellipse") ctx.ellipse(x + w / 2, y + h / 2, Math.max(0.5, w / 2), Math.max(0.5, h / 2), 0, 0, Math.PI * 2);
    else if (object.k === "triangle") { ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); }
    else ctx.rect(x, y, w, h);
    if (fill) { ctx.save(); ctx.fillStyle = fill; ctx.globalAlpha = object.s.o * 0.9; ctx.fill(); ctx.restore(); }
    ctx.stroke();
  }

  function paintText(ctx, object, paperName) {
    ctx.fillStyle = resolveColour(object.s.c, paperName); ctx.font = fontFor(object.s); ctx.textBaseline = "top";
    const line = Math.ceil((object.s.fs || 24) * 1.3);
    wrapLines(object.tx, object.w, text => ctx.measureText(text).width).forEach((text, index) => {
      ctx.fillText(text, object.x, object.y + index * line);
      if (object.s.u && text) { const w = ctx.measureText(text).width; ctx.fillRect(object.x, object.y + index * line + line - 3, w, Math.max(1, (object.s.fs || 24) / 16)); }
    });
  }

  function paintSticky(ctx, object) {
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.25)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    ctx.fillStyle = object.s.f; ctx.fillRect(object.x, object.y, object.w, object.h); ctx.restore();
    ctx.fillStyle = "#1d2738"; ctx.font = fontFor(object.s); ctx.textBaseline = "top";
    const line = Math.ceil((object.s.fs || 20) * 1.3);
    wrapLines(object.tx, object.w - STICKY_PAD * 2, text => ctx.measureText(text).width).forEach((text, index) => {
      if ((index + 1) * line > object.h - STICKY_PAD) return;
      ctx.fillText(text, object.x + STICKY_PAD, object.y + STICKY_PAD + index * line);
    });
  }

  function paintImage(ctx, object, imageLookup) {
    const entry = (imageLookup || imageFor)(object.im);
    if (entry && entry.ready && entry.image) ctx.drawImage(entry.image, object.x, object.y, object.w, object.h);
    else { ctx.strokeStyle = "#7b8aa3"; ctx.setLineDash([6, 6]); ctx.strokeRect(object.x, object.y, object.w, object.h); }
  }

  // ---- background -------------------------------------------------------------------------------------------
  function paintBackground(ctx, visible, zoom, bgName = background, paperName = paper) {
    ctx.fillStyle = PAPERS[paperName]; ctx.fillRect(visible.x, visible.y, visible.w, visible.h);
    if (bgName === "blank") return;
    const line = paperName === "dark" ? "rgba(255,255,255,0.14)" : "rgba(30,40,60,0.16)";
    ctx.strokeStyle = line; ctx.fillStyle = line; ctx.lineWidth = 1 / zoom;
    const step = bgName === "ruled" ? 48 : 40;
    const factor = zoom < 0.35 ? 5 : zoom < 0.6 ? 2 : 1;
    const gap = step * factor;
    const startX = Math.max(0, Math.floor(visible.x / gap) * gap); const endX = Math.min(BOARD.width, visible.x + visible.w);
    const startY = Math.max(0, Math.floor(visible.y / gap) * gap); const endY = Math.min(BOARD.height, visible.y + visible.h);
    ctx.beginPath();
    if (bgName === "grid") {
      for (let x = startX; x <= endX; x += gap) { ctx.moveTo(x, startY); ctx.lineTo(x, endY); }
      for (let y = startY; y <= endY; y += gap) { ctx.moveTo(startX, y); ctx.lineTo(endX, y); }
      ctx.stroke();
    } else if (bgName === "ruled") {
      for (let y = startY; y <= endY; y += gap) { ctx.moveTo(startX, y); ctx.lineTo(endX, y); }
      ctx.stroke();
    } else {
      const radius = 1.6 / Math.min(1, zoom);
      for (let x = startX; x <= endX; x += gap) for (let y = startY; y <= endY; y += gap) { ctx.moveTo(x + radius, y); ctx.arc(x, y, radius, 0, Math.PI * 2); }
      ctx.fill();
    }
  }

  // ---- frame ------------------------------------------------------------------------------------------------
  const visibleRect = () => ({ x: -view.tx / view.zoom, y: -view.ty / view.zoom, w: width / view.zoom, h: height / view.zoom });

  function buildCache(visible) {
    const margin = 0.5;
    let rect = { x: visible.x - visible.w * margin, y: visible.y - visible.h * margin, w: visible.w * (1 + margin * 2), h: visible.h * (1 + margin * 2) };
    if (rect.w * view.zoom * dpr > MAX_CACHE_PIXELS || rect.h * view.zoom * dpr > MAX_CACHE_PIXELS) rect = { ...visible };
    const canvasElement = cache && cache.canvas ? cache.canvas : document.createElement("canvas");
    canvasElement.width = Math.max(1, Math.round(rect.w * view.zoom * dpr)); canvasElement.height = Math.max(1, Math.round(rect.h * view.zoom * dpr));
    const ctx = canvasElement.getContext("2d");
    ctx.setTransform(view.zoom * dpr, 0, 0, view.zoom * dpr, -rect.x * view.zoom * dpr, -rect.y * view.zoom * dpr);
    paintBackground(ctx, rect, view.zoom);
    const ordered = [...objects.values()].filter(object => rectsIntersect(objectBounds(object), rect)).sort((a, b) => (a.z || 0) - (b.z || 0) || (a.at || 0) - (b.at || 0));
    for (const object of ordered) paintObject(ctx, object, paper);
    cache = { canvas: canvasElement, rect, zoom: view.zoom, dpr, version };
    stats.rebuilds++;
  }

  function draw() {
    frame = 0;
    const started = performance.now();
    const visible = visibleRect();
    const now = Date.now();
    const zooming = now < zoomingUntil;
    const fresh = cache && cache.version === version && cache.dpr === dpr && cache.zoom === view.zoom && cache.rect.x <= visible.x && cache.rect.y <= visible.y && cache.rect.x + cache.rect.w >= visible.x + visible.w && cache.rect.y + cache.rect.h >= visible.y + visible.h;
    if (!fresh && !(zooming && cache && cache.version === version)) buildCache(visible);
    else if (!fresh && zooming) { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(() => { zoomingUntil = 0; request(); }, 140); }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = paper === "dark" ? "#0f1420" : "#d5dbe6"; context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = view.zoom / cache.zoom;
    context.imageSmoothingEnabled = true;
    context.drawImage(cache.canvas, (cache.rect.x * view.zoom + view.tx) * dpr, (cache.rect.y * view.zoom + view.ty) * dpr, cache.canvas.width * scale, cache.canvas.height * scale);

    context.setTransform(view.zoom * dpr, 0, 0, view.zoom * dpr, view.tx * dpr, view.ty * dpr);
    drawOverlays(context, now);
    stats.frames++; stats.lastDrawMs = performance.now() - started;
    if (overlays.lasers.size || overlays.live.size) request();
  }

  function drawOverlays(ctx, now) {
    ctx.save(); ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 2 / view.zoom; ctx.strokeRect(0, 0, BOARD.width, BOARD.height); ctx.restore();
    for (const live of overlays.live.values()) paintObject(ctx, live.object, paper);
    if (overlays.local) paintObject(ctx, overlays.local, paper);
    if (overlays.preview) { ctx.save(); ctx.globalAlpha = 0.9; paintObject(ctx, overlays.preview, paper); ctx.restore(); }
    drawSelection(ctx);
    for (const guide of overlays.guides) { ctx.save(); ctx.strokeStyle = "#d6336c"; ctx.lineWidth = 1 / view.zoom; ctx.setLineDash([6 / view.zoom, 4 / view.zoom]); ctx.beginPath(); ctx.moveTo(guide.x1, guide.y1); ctx.lineTo(guide.x2, guide.y2); ctx.stroke(); ctx.restore(); }
    if (overlays.marquee) {
      const m = overlays.marquee; ctx.save(); ctx.fillStyle = "rgba(28,126,214,0.12)"; ctx.strokeStyle = "#1c7ed6"; ctx.lineWidth = 1 / view.zoom; ctx.setLineDash([5 / view.zoom, 4 / view.zoom]);
      ctx.fillRect(m.x, m.y, m.w, m.h); ctx.strokeRect(m.x, m.y, m.w, m.h); ctx.restore();
    }
    for (const [uid, laser] of overlays.lasers) drawLaser(ctx, laser, now, uid);
    for (const cursor of overlays.cursors.values()) drawCursor(ctx, cursor);
  }

  function drawSelection(ctx) {
    const selected = overlays.selection.filter(object => !object.del);
    if (!selected.length) return;
    ctx.save(); ctx.lineWidth = 1.5 / view.zoom; ctx.strokeStyle = "#1c7ed6";
    for (const object of selected) { const c = corners(object); ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(c[i][0], c[i][1]); ctx.closePath(); ctx.setLineDash(selected.length > 1 ? [4 / view.zoom, 3 / view.zoom] : []); ctx.stroke(); }
    const frameBox = selectionFrame(selected); const handles = handlePoints(frameBox, view.zoom);
    if (selected.length > 1) { const c = corners(frameBox); ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(c[i][0], c[i][1]); ctx.closePath(); ctx.stroke(); }
    const size = 9 / view.zoom; ctx.setLineDash([]); ctx.fillStyle = "#ffffff";
    for (const [name, point] of Object.entries(handles)) {
      if (name === "rot" && selected.length > 1) continue;
      ctx.beginPath(); if (name === "rot") ctx.arc(point[0], point[1], size * 0.7, 0, Math.PI * 2); else ctx.rect(point[0] - size / 2, point[1] - size / 2, size, size);
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  function drawLaser(ctx, laser, now, uid) {
    const fadeMs = 1100; const trail = laser.trail.filter(point => now - point[2] < fadeMs);
    if (!trail.length) return;
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (let i = 1; i < trail.length; i++) {
      const age = (now - trail[i][2]) / fadeMs;
      ctx.strokeStyle = laser.colour || "#e03131"; ctx.globalAlpha = Math.max(0, 1 - age); ctx.lineWidth = (6 * (1 - age) + 2) / Math.min(1, view.zoom);
      ctx.beginPath(); ctx.moveTo(trail[i - 1][0], trail[i - 1][1]); ctx.lineTo(trail[i][0], trail[i][1]); ctx.stroke();
    }
    const head = trail[trail.length - 1]; ctx.globalAlpha = 1; ctx.fillStyle = laser.colour || "#e03131"; ctx.beginPath(); ctx.arc(head[0], head[1], 7 / view.zoom, 0, Math.PI * 2); ctx.fill();
    ctx.restore(); void uid;
  }

  function drawCursor(ctx, cursor) {
    const s = 1 / view.zoom;
    ctx.save(); ctx.translate(cursor.x, cursor.y); ctx.scale(s, s);
    ctx.fillStyle = cursor.colour; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 17); ctx.lineTo(4.5, 13); ctx.lineTo(8, 20); ctx.lineTo(11, 18.5); ctx.lineTo(7.5, 12); ctx.lineTo(13, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.font = `600 12px ${FONT}`; const label = cursor.name || ""; const w = ctx.measureText(label).width + 12;
    ctx.fillStyle = cursor.colour; ctx.fillRect(14, 16, w, 20); ctx.fillStyle = "#ffffff"; ctx.textBaseline = "middle"; ctx.fillText(label, 20, 26);
    ctx.restore();
  }

  function request() { if (!frame) frame = requestAnimationFrame(draw); }
  function markDirty() { version++; request(); }

  return {
    canvas, view, stats, resize, request,
    setObjects(map) { objects = map; markDirty(); },
    setImages(map) { images = map || {}; markDirty(); },
    setBackground(name, paperName) { background = name; paper = paperName === "dark" ? "dark" : "light"; markDirty(); },
    get paper() { return paper; },
    setOverlays(patch) { Object.assign(overlays, patch); request(); },
    overlays, markDirty, points,
    setView(next, { zooming = false } = {}) { Object.assign(view, next); if (zooming) zoomingUntil = Date.now() + 160; request(); },
    toBoard(clientX, clientY) { const rect = canvas.getBoundingClientRect(); return [(clientX - rect.left - view.tx) / view.zoom, (clientY - rect.top - view.ty) / view.zoom]; },
    toScreen(x, y) { return [x * view.zoom + view.tx, y * view.zoom + view.ty]; },
    visibleRect,
    paintObject, imageFor, paintBackground,
    size: () => ({ width, height })
  };
}

export { AUTO_INK };
