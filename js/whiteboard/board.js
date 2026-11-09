// Whiteboard controller: tools, Pointer Events (mouse, touch, stylus), selection and transforms, text editing,
// keyboard alternatives, zoom and pan, undo/redo. It draws through renderer.js and saves through sync.js.
import {
  angleFromCentre, centre, eraseFromPolyline, hitTest, localisePoints, marqueeSelect, objectBounds, pickTop, recogniseShape, resizeBox,
  rotatePoint, scalePoints, scaleToBox, simplifyStroke, snapAngle, snapToGrid, unionBounds, decodePoints, encodePoints, pointsBounds
} from "./geometry.js";
import { createHistory } from "./history.js";
import { BOARD, defaultStyle, imageObject, LIMITS, newId, nextZ, outlineOf, shapeObject, stickyObject, STICKY_COLOURS, strokeObjects, textObject } from "./model.js";
import { createRenderer, fontFor, handlePoints, measureTextHeight, selectionFrame } from "./renderer.js";
import { prepareImage } from "./images.js";
import { buildTemplate } from "./templates.js";

export const TOOLS = Object.freeze({
  select: { label: "Select", key: "v" }, hand: { label: "Pan", key: "h" }, pen: { label: "Pen", key: "p" }, hl: { label: "Highlighter", key: "m" },
  eraser: { label: "Eraser", key: "e" }, laser: { label: "Laser pointer", key: "l" }, line: { label: "Line", key: "i" }, arrow: { label: "Arrow", key: "a" },
  rect: { label: "Rectangle", key: "r" }, ellipse: { label: "Ellipse", key: "o" }, triangle: { label: "Triangle", key: "g" }, text: { label: "Text", key: "t" }, sticky: { label: "Sticky note", key: "n" }
});
export const ZOOM_MIN = 0.25; export const ZOOM_MAX = 4;
const SHAPE_TOOLS = new Set(["line", "arrow", "rect", "ellipse", "triangle"]);
const VIEW_ONLY_TOOLS = new Set(["select", "hand", "laser"]);

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function createBoard({ root, canvas, role = "student", uid = "", scope = "shared", announce = () => {}, notify = () => {}, changed = () => {} }) {
  const isTeacher = role === "teacher";
  const renderer = createRenderer(canvas);
  const history = createHistory();
  const state = { tool: "pen", style: defaultStyle(), eraserMode: "area", eraserSize: 18, snap: false, selection: new Set(), canDraw: true, mode: "view", clipboard: [] };
  let sync = null; let objects = new Map(); let images = {}; let meta = { bg: "blank", paper: "light" };
  let gesture = null; let working = null; const pointers = new Map(); let spaceHeld = false; let lastPenAt = 0; let editor = null; let destroyed = false;
  const laser = { trail: [], colour: "#e03131" };

  const emit = () => changed(snapshotState());
  const selectionObjects = () => [...state.selection].map(id => objects.get(id)).filter(Boolean);
  const mayChange = object => isTeacher || scope === "personal" || object.by === uid;
  const editable = () => state.canDraw;

  function snapshotState() {
    return { tool: state.tool, style: { ...state.style }, eraserMode: state.eraserMode, snap: state.snap, canDraw: state.canDraw, selection: [...state.selection], zoom: renderer.view.zoom, canUndo: history.canUndo(), canRedo: history.canRedo(), count: objects.size };
  }

  // ---- data from sync -------------------------------------------------------------------------------------
  function setData(map, imageMap) {
    objects = map; images = imageMap || images;
    for (const id of [...state.selection]) if (!objects.has(id)) state.selection.delete(id);
    if (!gesture) { renderer.setObjects(objects); renderer.setImages(images); renderer.setOverlays({ selection: selectionObjects() }); }
    emit();
  }

  function setMeta(next) { meta = next; renderer.setBackground(meta.bg, meta.paper); emit(); }

  async function commit(changes, { record = true, keepAt = false } = {}) {
    if (!sync) return { ok: false };
    const before = {}; const send = {};
    for (const [id, next] of Object.entries(changes)) {
      before[id] = objects.get(id) ? JSON.parse(JSON.stringify(objects.get(id))) : null;
      send[id] = next ? { ...next, ...(keepAt ? { keepAt: true } : {}) } : null;
    }
    // writeObjects applies the change locally before its first await, so history can be recorded straight away
    // (undo works the instant after an edit) and rolled back if the server refuses the write.
    const pending = sync.writeObjects(send);
    let recorded = false;
    if (record) {
      const after = {};
      for (const id of Object.keys(changes)) after[id] = sync.objects.get(id) ? JSON.parse(JSON.stringify(sync.objects.get(id))) : null;
      recorded = history.record(before, after);
    }
    const result = await pending;
    if (!result.ok) {
      if (recorded) history.dropLast();
      notify(result.reason === "full" ? "This board is full. Delete something or start a new page." : result.reason === "too-big" ? "That drawing is too big to save." : "That change could not be saved.");
    }
    emit();
    return result;
  }

  // ---- view -----------------------------------------------------------------------------------------------
  function constrainView() {
    const { width, height } = renderer.size(); const view = renderer.view;
    const minTx = Math.min(0, width - BOARD.width * view.zoom - 200); const maxTx = Math.max(200, 200);
    const minTy = Math.min(0, height - BOARD.height * view.zoom - 200); const maxTy = 200;
    view.tx = clamp(view.tx, Math.min(minTx, maxTx), maxTx); view.ty = clamp(view.ty, Math.min(minTy, maxTy), maxTy);
  }
  function zoomAt(factor, clientX, clientY) {
    const view = renderer.view; const rect = canvas.getBoundingClientRect();
    const cx = clientX === undefined ? rect.width / 2 : clientX - rect.left; const cy = clientY === undefined ? rect.height / 2 : clientY - rect.top;
    const next = clamp(view.zoom * factor, ZOOM_MIN, ZOOM_MAX);
    const bx = (cx - view.tx) / view.zoom; const by = (cy - view.ty) / view.zoom;
    renderer.setView({ zoom: next, tx: cx - bx * next, ty: cy - by * next }, { zooming: true });
    constrainView(); renderer.setView({}); emit(); announce(`Zoom ${Math.round(next * 100)} percent`);
  }
  function panBy(dx, dy) { renderer.view.tx += dx; renderer.view.ty += dy; constrainView(); renderer.setView({}); }
  function setZoom(value) { zoomAt(value / renderer.view.zoom); }
  function fit() {
    const live = [...objects.values()]; const box = unionBounds(live.map(objectBounds));
    const { width, height } = renderer.size();
    if (!box) { renderer.setView({ zoom: 1, tx: 60, ty: 60 }); emit(); return; }
    const zoom = clamp(Math.min((width - 80) / box.w, (height - 80) / box.h), ZOOM_MIN, 2);
    renderer.setView({ zoom, tx: (width - box.w * zoom) / 2 - box.x * zoom, ty: (height - box.h * zoom) / 2 - box.y * zoom }); constrainView(); renderer.setView({}); emit(); announce("Fit to content");
  }
  function centreOn(object) {
    const { width, height } = renderer.size(); const zoom = renderer.view.zoom;
    renderer.setView({ tx: width / 2 - (object.x + object.w / 2) * zoom, ty: height / 2 - (object.y + object.h / 2) * zoom }); constrainView(); renderer.setView({});
  }

  // ---- tools ----------------------------------------------------------------------------------------------
  function setTool(tool) {
    if (!TOOLS[tool]) return;
    if (!editable() && !VIEW_ONLY_TOOLS.has(tool)) { announce("Drawing is switched off by your teacher right now."); return; }
    closeEditor(true); cancelGesture();
    state.tool = tool; if (tool !== "select") { state.selection.clear(); renderer.setOverlays({ selection: [] }); }
    canvas.dataset.tool = tool; announce(`${TOOLS[tool].label} tool`); emit();
  }
  function setStyle(patch) {
    state.style = { ...state.style, ...patch };
    for (const key of Object.keys(state.style)) if (state.style[key] === undefined || state.style[key] === false) delete state.style[key];
    const targets = selectionObjects().filter(mayChange);
    if (targets.length && state.tool === "select") {
      const changes = {};
      for (const object of targets) {
        const next = { ...object, s: { ...object.s } };
        for (const key of Object.keys(patch)) { if (patch[key] === undefined || patch[key] === false) delete next.s[key]; else if (!(object.t === "sticky" && key === "c")) next.s[key] = patch[key]; }
        if (object.t === "text" && (patch.fs || patch.b !== undefined)) next.h = measureTextHeight(next.tx, next.s, next.w);
        changes[object.id] = next;
      }
      commit(changes);
    }
    emit();
  }
  function setEraserMode(mode) { state.eraserMode = mode === "stroke" ? "stroke" : "area"; announce(`Eraser: ${state.eraserMode === "stroke" ? "whole strokes" : "part of a stroke"}`); emit(); }

  function setCanDraw(allowed, mode) {
    state.canDraw = Boolean(allowed); state.mode = mode || state.mode;
    if (!allowed && !VIEW_ONLY_TOOLS.has(state.tool)) { closeEditor(true); cancelGesture(); state.tool = "select"; canvas.dataset.tool = "select"; }
    root.dataset.canDraw = String(Boolean(allowed)); emit();
  }

  // ---- pointer input --------------------------------------------------------------------------------------
  const pressureOf = event => (event.pointerType === "mouse" ? 0.5 : (event.pressure > 0 ? event.pressure : 0.5));
  const tolerance = event => (event.pointerType === "touch" ? 14 : 6) / renderer.view.zoom;

  function sample(event) {
    const events = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
    return (events.length ? events : [event]).map(item => { const p = renderer.toBoard(item.clientX, item.clientY); return [clamp(p[0], 0, BOARD.width), clamp(p[1], 0, BOARD.height), pressureOf(item)]; });
  }

  function handleAt(point, event) {
    const selected = selectionObjects().filter(mayChange);
    if (!selected.length || selected.length !== selectionObjects().length) return null;
    const frame = selectionFrame(selected); const handles = handlePoints(frame, renderer.view.zoom);
    const reach = (event.pointerType === "touch" ? 20 : 11) / renderer.view.zoom;
    for (const [name, at] of Object.entries(handles)) {
      if (name === "rot" && selected.length > 1) continue;
      if (Math.hypot(point[0] - at[0], point[1] - at[1]) <= reach) return name;
    }
    return null;
  }

  function startPan(event) { gesture = { kind: "pan", x: event.clientX, y: event.clientY }; canvas.dataset.panning = "true"; }

  function handlePointerDown(event) {
    if (destroyed) return;
    root.focus({ preventScroll: true });
    closeEditor(true);
    if (event.pointerType === "pen") lastPenAt = Date.now();
    if (event.pointerType === "touch" && Date.now() - lastPenAt < 1500 && state.tool !== "hand") return; // palm rejection
    try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* synthetic or already released pointer */ }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, type: event.pointerType });
    if (pointers.size === 2) { beginPinch(); return; }
    if (pointers.size > 2) return;
    const point = renderer.toBoard(event.clientX, event.clientY);
    if (event.button === 1 || event.button === 2 || spaceHeld || state.tool === "hand") { event.preventDefault(); startPan(event); return; }
    if (event.button !== 0 && event.pointerType === "mouse") return;
    if (!editable() && !VIEW_ONLY_TOOLS.has(state.tool)) return;
    const tool = state.tool;
    if (tool === "pen" || tool === "hl") {
      const style = tool === "hl" ? { ...state.style, w: Math.max(state.style.w * 3, 14), o: 0.4 } : { ...state.style };
      gesture = { kind: "draw", tool, points: sample(event), style };
      updateLocalStroke();
    } else if (tool === "eraser") {
      working = new Map(objects); gesture = { kind: "erase", touched: new Set(), original: objects };
      eraseAt(point);
    } else if (tool === "laser") {
      gesture = { kind: "laser" }; laser.trail = [[point[0], point[1], Date.now()]]; pushLaser();
    } else if (SHAPE_TOOLS.has(tool)) {
      gesture = { kind: "shape", tool, start: point, current: point, points: sample(event) };
    } else if (tool === "text" || tool === "sticky") {
      const hit = pickTop([...objects.values()], point, tolerance(event), renderer.points);
      if (hit && (hit.t === "text" || hit.t === "sticky") && mayChange(hit)) { openEditor(hit); return; }
      event.preventDefault();
      const box = tool === "sticky" ? { x: point[0] - 100, y: point[1] - 100, w: 200, h: 200 } : { x: point[0], y: point[1], w: 360, h: 40 };
      openEditor(null, box, tool);
    } else if (tool === "select") beginSelect(event, point);
  }

  function beginSelect(event, point) {
    const handle = handleAt(point, event);
    if (handle && editable()) {
      const selected = selectionObjects();
      gesture = { kind: handle === "rot" ? "rotate" : "resize", handle, start: point, originals: new Map(selected.map(object => [object.id, { ...object, s: { ...object.s } }])), frame: selectionFrame(selected), event };
      working = new Map(objects); return;
    }
    const hit = pickTop([...objects.values()], point, tolerance(event), renderer.points);
    if (hit) {
      if (event.shiftKey) { if (state.selection.has(hit.id)) state.selection.delete(hit.id); else state.selection.add(hit.id); } else if (!state.selection.has(hit.id)) state.selection = new Set([hit.id]);
      renderer.setOverlays({ selection: selectionObjects() }); emit();
      const movable = selectionObjects().filter(mayChange);
      if (movable.length && editable()) { gesture = { kind: "move", start: point, originals: new Map(movable.map(object => [object.id, { ...object, s: { ...object.s } }])), moved: false }; working = new Map(objects); }
      announce(`Selected ${describe(hit)}`);
    } else {
      if (!event.shiftKey) { state.selection.clear(); renderer.setOverlays({ selection: [] }); }
      gesture = { kind: "marquee", start: point, keep: new Set(state.selection) }; emit();
    }
  }

  function handlePointerMove(event) {
    if (destroyed) return;
    const known = pointers.get(event.pointerId);
    if (known) { known.x = event.clientX; known.y = event.clientY; }
    const point = renderer.toBoard(event.clientX, event.clientY);
    if (sync && sync.sendPresence && !gesture) sync.sendPresence({ x: point[0], y: point[1], tool: state.tool, laser: null });
    if (!gesture) return;
    if (gesture.kind === "pinch") { updatePinch(); return; }
    if (gesture.kind === "pan") { panBy(event.clientX - gesture.x, event.clientY - gesture.y); gesture.x = event.clientX; gesture.y = event.clientY; return; }
    const sampled = sample(event);
    if (gesture.kind === "draw") { gesture.points.push(...sampled); updateLocalStroke(); sendLive(); }
    else if (gesture.kind === "erase") for (const p of sampled) eraseAt(p);
    else if (gesture.kind === "laser") { for (const p of sampled) laser.trail.push([p[0], p[1], Date.now()]); laser.trail = laser.trail.slice(-60); pushLaser(); }
    else if (gesture.kind === "shape") { gesture.current = point; gesture.points = sampled.length ? [...gesture.points, ...sampled].slice(-1) : gesture.points; updateShapePreview(event); }
    else if (gesture.kind === "move") moveSelection(point, event);
    else if (gesture.kind === "resize") resizeSelection(point, event);
    else if (gesture.kind === "rotate") rotateSelection(point, event);
    else if (gesture.kind === "marquee") {
      const rect = { x: gesture.start[0], y: gesture.start[1], w: point[0] - gesture.start[0], h: point[1] - gesture.start[1] };
      renderer.setOverlays({ marquee: { x: Math.min(rect.x, rect.x + rect.w), y: Math.min(rect.y, rect.y + rect.h), w: Math.abs(rect.w), h: Math.abs(rect.h) } });
      gesture.rect = rect;
    }
  }

  function handlePointerUp(event) {
    if (destroyed) return;
    pointers.delete(event.pointerId);
    try { canvas.releasePointerCapture(event.pointerId); } catch (error) { /* not captured */ }
    if (!gesture) return;
    const current = gesture;
    if (current.kind === "pinch") { if (pointers.size < 2) { gesture = null; canvas.dataset.panning = "false"; } return; }
    gesture = null; canvas.dataset.panning = "false";
    if (current.kind === "draw") finishStroke(current);
    else if (current.kind === "erase") finishErase();
    else if (current.kind === "laser") { laser.trail = []; renderer.overlays.lasers.delete("me"); renderer.request(); if (sync && sync.sendPresence) { sync.sendPresence({ x: 0, y: 0, tool: "laser", laser: null }); } }
    else if (current.kind === "shape") finishShape(current, event);
    else if (current.kind === "move" || current.kind === "resize" || current.kind === "rotate") finishTransform(current);
    else if (current.kind === "marquee") finishMarquee(current, event);
    else if (current.kind === "pan") canvas.dataset.panning = "false";
  }

  function handlePointerCancel(event) { pointers.delete(event.pointerId); cancelGesture(); }

  function cancelGesture(keepPointers = false) {
    gesture = null; working = null; if (!keepPointers) pointers.clear();
    renderer.setOverlays({ local: null, marquee: null, preview: null, guides: [] });
    if (sync && sync.sendLive) sync.sendLive(null);
    renderer.setObjects(objects); renderer.setOverlays({ selection: selectionObjects() });
  }

  // ---- pinch / two-finger pan -----------------------------------------------------------------------------
  function beginPinch() {
    const [a, b] = [...pointers.values()];
    if (gesture && gesture.kind !== "pinch") cancelGesture(true);
    pointers.set([...pointers.keys()][0], a); pointers.set([...pointers.keys()][1], b);
    const rect = canvas.getBoundingClientRect(); const view = renderer.view;
    const cx = (a.x + b.x) / 2 - rect.left; const cy = (a.y + b.y) / 2 - rect.top;
    gesture = { kind: "pinch", distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: view.zoom, anchor: [(cx - view.tx) / view.zoom, (cy - view.ty) / view.zoom] };
  }
  function updatePinch() {
    const [a, b] = [...pointers.values()]; if (!a || !b) return;
    const rect = canvas.getBoundingClientRect();
    const cx = (a.x + b.x) / 2 - rect.left; const cy = (a.y + b.y) / 2 - rect.top;
    const zoom = clamp(gesture.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / gesture.distance), ZOOM_MIN, ZOOM_MAX);
    renderer.setView({ zoom, tx: cx - gesture.anchor[0] * zoom, ty: cy - gesture.anchor[1] * zoom }, { zooming: true }); constrainView(); renderer.setView({}); emit();
  }

  function handleWheel(event) {
    event.preventDefault();
    if (event.shiftKey && !event.ctrlKey) { panBy(-event.deltaY, 0); return; }
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    zoomAt(Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0016)), event.clientX, event.clientY);
  }

  // ---- drawing ----------------------------------------------------------------------------------------------
  function strokeObjectFor(points, tool, style) {
    const simplified = simplifyStroke(points, 0.5, 0.35);
    const local = localisePoints(simplified);
    return { id: "live", t: "stroke", k: tool === "hl" ? "hl" : "pen", z: 1e9, x: local.x, y: local.y, w: local.w, h: local.h, p: encodePoints(local.points), s: style, by: uid, at: Date.now() };
  }
  function updateLocalStroke() { renderer.setOverlays({ local: strokeObjectFor(gesture.points, gesture.tool, gesture.style) }); }
  function sendLive() { if (sync && sync.sendLive && gesture) sync.sendLive(strokeObjectFor(gesture.points.slice(-1200), gesture.tool, gesture.style)); }

  function finishStroke(current) {
    renderer.setOverlays({ local: null });
    if (sync && sync.sendLive) { sync.sendLive.cancel(); sync.sendLive(null); sync.sendLive.flush(); }
    let points = current.points;
    if (current.tool === "pen" && points.length > 8) {
      const shape = recogniseShape(points);
      if (shape && state.recognise) { const made = shapeObject(shape.k, shape, { style: current.style, by: uid, z: nextZ([...objects.values()]) }); commit({ [made.id]: made }); return; }
    }
    const made = strokeObjects(points.length ? simplifyStroke(points, 0.5, 0.35) : points, { kind: current.tool === "hl" ? "hl" : "pen", style: current.style, by: uid, z: nextZ([...objects.values()]) });
    const changes = {}; for (const object of made) changes[object.id] = object;
    commit(changes);
  }

  function updateShapePreview(event) {
    const { start, current, tool } = gesture; let end = current;
    if (event.shiftKey) {
      const dx = current[0] - start[0]; const dy = current[1] - start[1];
      if (tool === "line" || tool === "arrow") { const angle = snapAngle(Math.atan2(dy, dx)); const length = Math.hypot(dx, dy); end = [start[0] + Math.cos(angle) * length, start[1] + Math.sin(angle) * length]; }
      else { const size = Math.max(Math.abs(dx), Math.abs(dy)); end = [start[0] + Math.sign(dx || 1) * size, start[1] + Math.sign(dy || 1) * size]; }
    }
    gesture.end = end; renderer.setOverlays({ preview: shapeFrom(tool, start, end, "preview") });
  }
  function shapeFrom(tool, start, end, id) {
    const style = { ...state.style };
    if (tool === "line" || tool === "arrow") {
      const local = localisePoints([[start[0], start[1], 0.5], [end[0], end[1], 0.5]]);
      return { ...shapeObject(tool, { x: local.x, y: local.y, w: local.w, h: local.h }, { style, by: uid, z: 1e9, points: local.points }), id };
    }
    return { ...shapeObject(tool, { x: Math.min(start[0], end[0]), y: Math.min(start[1], end[1]), w: Math.abs(end[0] - start[0]), h: Math.abs(end[1] - start[1]) }, { style, by: uid, z: 1e9 }), id };
  }
  function finishShape(current) {
    renderer.setOverlays({ preview: null });
    const end = current.end || current.current; if (Math.hypot(end[0] - current.start[0], end[1] - current.start[1]) < 4) return;
    const made = shapeFrom(current.tool, current.start, end, newId("h")); made.z = nextZ([...objects.values()]); made.at = Date.now();
    commit({ [made.id]: made });
  }

  // ---- eraser -----------------------------------------------------------------------------------------------
  function eraseAt(point) {
    if (!working) return;
    const radius = state.eraserSize / renderer.view.zoom / 2 + 1;
    const next = new Map(working); let changed = false;
    for (const object of working.values()) {
      if (!mayChange(object) || object.lk) continue;
      const box = objectBounds(object);
      if (point[0] < box.x - radius || point[0] > box.x + box.w + radius || point[1] < box.y - radius || point[1] > box.y + box.h + radius) continue;
      if (state.eraserMode === "area" && object.t === "stroke" && !object.r) {
        const world = decodePoints(object.p).map(p => [p[0] + object.x, p[1] + object.y, p[2]]);
        const { touched, runs } = eraseFromPolyline(world, point, radius + object.s.w / 2);
        if (!touched) continue;
        next.delete(object.id); changed = true;
        for (const run of runs) for (const piece of strokeObjects(run, { kind: object.k, style: object.s, by: object.by, z: object.z })) next.set(piece.id, piece);
      } else if (hitTest(object, point, radius, renderer.points(object))) { next.delete(object.id); changed = true; }
    }
    if (changed) { working = next; renderer.setObjects(working); }
  }
  function finishErase() {
    const final = working; working = null; if (!final) return;
    const changes = {};
    for (const id of objects.keys()) if (!final.has(id)) changes[id] = null;
    for (const [id, object] of final) if (!objects.has(id)) changes[id] = object;
    renderer.setObjects(objects);
    if (Object.keys(changes).length) commit(changes);
  }

  // ---- selection transforms -----------------------------------------------------------------------------------
  function moveSelection(point, event) {
    const dx0 = point[0] - gesture.start[0]; const dy0 = point[1] - gesture.start[1];
    if (!gesture.moved && Math.hypot(dx0, dy0) < 3 / renderer.view.zoom) return;
    gesture.moved = true; let dx = dx0; let dy = dy0;
    if (event.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    const next = new Map(objects);
    for (const object of gesture.originals.values()) {
      let x = object.x + dx; let y = object.y + dy;
      if (state.snap) { x = snapToGrid(x); y = snapToGrid(y); }
      next.set(object.id, { ...object, x: clamp(x, -LIMITS.coord, LIMITS.coord), y: clamp(y, -LIMITS.coord, LIMITS.coord) });
    }
    working = next; renderer.setObjects(working); renderer.setOverlays({ selection: [...state.selection].map(id => working.get(id)).filter(Boolean) });
  }

  function retarget(object, box) { // new geometry for one object; strokes and lines have their points scaled to the box
    const next = { ...object, x: box.x, y: box.y, w: box.w, h: box.h };
    if (object.p && (object.w !== box.w || object.h !== box.h)) next.p = encodePoints(scalePoints(decodePoints(object.p), object.w, object.h, box.w, box.h));
    if (object.t === "text") next.h = measureTextHeight(next.tx, next.s, next.w);
    return next;
  }

  function resizeSelection(point, event) {
    const next = new Map(objects); const originals = [...gesture.originals.values()];
    if (originals.length === 1) {
      const original = originals[0]; const about = centre(original);
      const rotatedBack = original.r ? rotatePoint(point, about, -original.r) : point;
      const startBack = original.r ? rotatePoint(gesture.start, about, -original.r) : gesture.start;
      const keep = event.shiftKey || original.t === "image";
      const box = resizeBox({ x: original.x, y: original.y, w: original.w, h: original.h }, gesture.handle, rotatedBack[0] - startBack[0], rotatedBack[1] - startBack[1], { keepRatio: keep && gesture.handle.length === 2 });
      let finalBox = box;
      if (original.r) { const newCentre = rotatePoint([box.x + box.w / 2, box.y + box.h / 2], about, original.r); finalBox = { x: newCentre[0] - box.w / 2, y: newCentre[1] - box.h / 2, w: box.w, h: box.h }; }
      next.set(original.id, retarget(original, finalBox));
    } else {
      const frame = gesture.frame;
      const box = resizeBox(frame, gesture.handle, point[0] - gesture.start[0], point[1] - gesture.start[1], { keepRatio: event.shiftKey });
      for (const scaled of scaleToBox(originals, frame, box)) next.set(scaled.id, retarget(gesture.originals.get(scaled.id), scaled));
    }
    working = next; renderer.setObjects(working); renderer.setOverlays({ selection: [...state.selection].map(id => working.get(id)).filter(Boolean) });
  }

  function rotateSelection(point, event) {
    const original = [...gesture.originals.values()][0]; if (!original) return;
    let angle = angleFromCentre(original, point); if (event.shiftKey) angle = snapAngle(angle);
    const next = new Map(objects); next.set(original.id, { ...original, r: Math.abs(angle) < 1e-6 ? undefined : Math.round(angle * 1000) / 1000 });
    if (next.get(original.id).r === undefined) delete next.get(original.id).r;
    working = next; renderer.setObjects(working); renderer.setOverlays({ selection: [...state.selection].map(id => working.get(id)).filter(Boolean) });
  }

  function finishTransform(current) {
    const final = working; working = null;
    renderer.setObjects(objects); renderer.setOverlays({ selection: selectionObjects() });
    if (!final || (current.kind === "move" && !current.moved)) return;
    const changes = {};
    for (const id of current.originals.keys()) if (final.get(id)) changes[id] = final.get(id);
    commit(changes);
  }

  function finishMarquee(current) {
    renderer.setOverlays({ marquee: null });
    if (!current.rect) { emit(); return; }
    const picked = marqueeSelect([...objects.values()], current.rect, { contain: false }).map(object => object.id);
    state.selection = new Set([...current.keep, ...picked]);
    renderer.setOverlays({ selection: selectionObjects() }); emit();
    if (picked.length) announce(`${state.selection.size} objects selected`);
  }

  // ---- selection commands ---------------------------------------------------------------------------------------
  function describe(object) {
    if (object.t === "text" || object.t === "sticky") return `${object.t === "text" ? "text" : "sticky note"} ${(object.tx || "").slice(0, 40)}`;
    if (object.t === "image") return `image ${object.alt || ""}`.trim();
    return object.t === "shape" ? object.k : "drawing";
  }
  function selectAll() { if (state.tool !== "select") setTool("select"); state.selection = new Set([...objects.values()].filter(o => !o.lk).map(o => o.id)); renderer.setOverlays({ selection: selectionObjects() }); emit(); announce(`${state.selection.size} objects selected`); }
  function clearSelection() { state.selection.clear(); renderer.setOverlays({ selection: [] }); emit(); }
  function selectId(id) { if (!objects.has(id)) return; if (state.tool !== "select") setTool("select"); state.selection = new Set([id]); renderer.setOverlays({ selection: selectionObjects() }); centreOn(objects.get(id)); emit(); announce(`Selected ${describe(objects.get(id))}`); }
  function cycleSelection(step) {
    const ordered = [...objects.values()].sort((a, b) => Math.round(a.y / 40) - Math.round(b.y / 40) || a.x - b.x);
    if (!ordered.length) return;
    const current = [...state.selection][0]; let index = ordered.findIndex(object => object.id === current);
    index = index === -1 ? (step > 0 ? 0 : ordered.length - 1) : (index + step + ordered.length) % ordered.length;
    selectId(ordered[index].id);
  }
  function deleteSelection() {
    const targets = selectionObjects().filter(mayChange);
    if (!targets.length || !editable()) { if (selectionObjects().length) announce("Those belong to your teacher; only they can delete them."); return; }
    const changes = {}; for (const object of targets) changes[object.id] = null;
    state.selection.clear(); renderer.setOverlays({ selection: [] }); commit(changes); announce(`${targets.length} deleted`);
  }
  function duplicateSelection() {
    const targets = selectionObjects(); if (!targets.length || !editable()) return;
    const changes = {}; const ids = [];
    let z = nextZ([...objects.values()]);
    for (const object of targets) { const id = newId(object.t[0]); changes[id] = { ...JSON.parse(JSON.stringify(object)), id, x: object.x + 24, y: object.y + 24, z: z += 0.001, by: uid, at: Date.now() }; delete changes[id].lk; ids.push(id); }
    commit(changes); state.selection = new Set(ids); renderer.setOverlays({ selection: selectionObjects() }); emit();
    announce(`${targets.length} duplicated`);
  }
  function copySelection() { state.clipboard = selectionObjects().map(object => JSON.parse(JSON.stringify(object))); if (state.clipboard.length) announce(`${state.clipboard.length} copied`); return state.clipboard.length; }
  function cutSelection() { if (copySelection()) deleteSelection(); }
  function pasteClipboard() {
    if (!state.clipboard.length || !editable()) return false;
    const changes = {}; const ids = []; let z = nextZ([...objects.values()]);
    for (const object of state.clipboard) { const id = newId(object.t[0]); changes[id] = { ...object, id, x: object.x + 30, y: object.y + 30, z: z += 0.001, by: uid, at: Date.now() }; delete changes[id].lk; ids.push(id); }
    state.clipboard = state.clipboard.map(object => ({ ...object, x: object.x + 30, y: object.y + 30 }));
    commit(changes); state.selection = new Set(ids); renderer.setOverlays({ selection: selectionObjects() }); emit();
    announce(`${ids.length} pasted`); return true;
  }
  function nudge(dx, dy) {
    const targets = selectionObjects().filter(mayChange); if (!targets.length || !editable()) return;
    const changes = {}; for (const object of targets) changes[object.id] = { ...object, x: clamp(object.x + dx, -LIMITS.coord, LIMITS.coord), y: clamp(object.y + dy, -LIMITS.coord, LIMITS.coord) };
    commit(changes);
  }
  function toggleLock() {
    if (!isTeacher && scope === "shared") { announce("Only your teacher can lock objects on the shared board."); return; }
    const targets = selectionObjects().filter(mayChange); if (!targets.length) return;
    const lock = !targets.every(object => object.lk); const changes = {};
    for (const object of targets) { const next = { ...object }; if (lock) next.lk = true; else delete next.lk; changes[object.id] = next; }
    commit(changes); announce(lock ? "Locked" : "Unlocked");
  }
  function reorder(direction) {
    const targets = selectionObjects().filter(mayChange); if (!targets.length || !editable()) return;
    const all = [...objects.values()]; const changes = {};
    const top = Math.max(0, ...all.map(o => o.z || 0)); const bottom = Math.min(0, ...all.map(o => o.z || 0));
    targets.forEach((object, index) => { changes[object.id] = { ...object, z: direction > 0 ? top + 1 + index * 0.001 : bottom - 1 - index * 0.001 }; });
    commit(changes); announce(direction > 0 ? "Brought to front" : "Sent to back");
  }
  function setAlt(text) {
    const image = selectionObjects().find(object => object.t === "image"); if (!image || !mayChange(image)) return;
    commit({ [image.id]: { ...image, alt: String(text).slice(0, LIMITS.alt) } });
  }

  // ---- undo / redo --------------------------------------------------------------------------------------------------
  async function applyHistory(result, verb) {
    if (!result) { announce(`Nothing to ${verb}`); return; }
    const changes = {};
    for (const [id, object] of Object.entries(result.apply)) changes[id] = object;
    if (Object.keys(changes).length) await commit(changes, { record: false, keepAt: true });
    announce(result.skipped.length ? `${verb} done. Some changes were skipped because someone else edited them.` : `${verb} done`);
    emit();
  }
  const live = id => objects.get(id) || null;
  function undo() { if (!editable()) return; closeEditor(true); return applyHistory(history.undo(live), "undo"); }
  function redo() { if (!editable()) return; return applyHistory(history.redo(live), "redo"); }

  // ---- text and sticky editing ------------------------------------------------------------------------------------
  function openEditor(object, box = null, kind = null) {
    closeEditor(true);
    const type = object ? object.t : kind;
    const frame = object ? { x: object.x, y: object.y, w: object.w, h: object.h } : box;
    const area = document.createElement("textarea");
    area.className = `wb-editor wb-editor--${type}`; area.setAttribute("aria-label", type === "sticky" ? "Sticky note text" : "Board text"); area.value = object ? object.tx || "" : "";
    area.maxLength = LIMITS.text; area.spellcheck = true;
    root.append(area);
    editor = { area, object, frame, type, style: object ? object.s : { ...state.style }, colour: object && object.t === "sticky" ? object.s.f : STICKY_COLOURS[0] };
    placeEditor();
    area.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); closeEditor(true); root.focus(); } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); closeEditor(true); root.focus(); } event.stopPropagation(); });
    area.addEventListener("blur", () => closeEditor(true));
    setTimeout(() => { if (editor && editor.area === area) { area.focus({ preventScroll: true }); area.select(); } }, 0); // after the click's own focus change
    if (object) { working = new Map(objects); working.delete(object.id); renderer.setObjects(working); }
    announce(type === "sticky" ? "Editing sticky note. Press Escape or Control Enter to finish." : "Editing text. Press Escape or Control Enter to finish.");
  }
  function placeEditor() {
    if (!editor) return;
    const { area, frame, type, style } = editor; const zoom = renderer.view.zoom; const [sx, sy] = renderer.toScreen(frame.x, frame.y);
    area.style.left = `${sx}px`; area.style.top = `${sy}px`; area.style.width = `${frame.w * zoom}px`; area.style.height = `${Math.max(frame.h, (style.fs || 24) * 1.4) * zoom}px`;
    area.style.fontSize = `${(style.fs || (type === "sticky" ? 20 : 24)) * zoom}px`; area.style.fontFamily = fontFor({ fs: 1 }).replace(/^1px /, "");
    area.style.color = type === "sticky" ? "#1d2738" : "#111827"; area.style.background = type === "sticky" ? editor.colour : "rgba(255,255,255,0.92)";
    area.style.padding = type === "sticky" ? `${12 * zoom}px` : "2px"; area.style.fontWeight = style.b ? "700" : "400";
  }
  function closeEditor(save) {
    if (!editor) return;
    const { area, object, frame, type } = editor; editor = null;
    const value = area.value.trim() ? area.value : ""; area.remove();
    if (working && object) { working = null; renderer.setObjects(objects); }
    if (!save) return;
    if (object) {
      if (!value) { commit({ [object.id]: null }); return; }
      if (value !== object.tx) commit({ [object.id]: { ...object, tx: value, h: object.t === "text" ? measureTextHeight(value, object.s, object.w) : object.h } });
      return;
    }
    if (!value) return;
    const z = nextZ([...objects.values()]);
    const made = type === "sticky" ? stickyObject(frame, value, STICKY_COLOURS[objects.size % STICKY_COLOURS.length], { by: uid, z }) : textObject({ ...frame, h: measureTextHeight(value, state.style, frame.w) }, value, { style: { ...state.style, fs: Math.max(state.style.fs, 18) }, by: uid, z });
    commit({ [made.id]: made }); state.selection = new Set([made.id]); renderer.setOverlays({ selection: selectionObjects() }); emit();
  }

  // ---- insertion ------------------------------------------------------------------------------------------------------
  function viewCentre() { const { width, height } = renderer.size(); return renderer.toBoard(renderer.canvas.getBoundingClientRect().left + width / 2, renderer.canvas.getBoundingClientRect().top + height / 2); }
  async function insertTemplate(id) {
    if (!editable()) return;
    const [cx, cy] = viewCentre();
    const made = buildTemplate(id, { x: Math.max(0, cx - 400), y: Math.max(0, cy - 250) }, { by: uid });
    const base = nextZ([...objects.values()]); const changes = {};
    made.forEach((object, index) => { object.z = base + index * 0.001; changes[object.id] = object; });
    const result = await commit(changes);
    if (result.ok) { state.selection = new Set(Object.keys(changes)); setTool("select"); state.selection = new Set(Object.keys(changes)); renderer.setOverlays({ selection: selectionObjects() }); emit(); announce("Template added"); }
  }
  async function insertImageFile(file) {
    if (!editable()) return { ok: false };
    const prepared = await prepareImage(file);
    if (!prepared.ok) { notify(prepared.message); return prepared; }
    const imageId = newId("m"); const stored = await sync.putImage(imageId, prepared.dataUrl);
    if (!stored.ok) { notify(stored.reason === "full" ? "This board is full. Delete something or start a new page." : "The picture could not be saved."); return stored; }
    const [cx, cy] = viewCentre(); const scale = Math.min(1, 480 / Math.max(prepared.w, prepared.h));
    const made = imageObject({ x: cx - prepared.w * scale / 2, y: cy - prepared.h * scale / 2, w: prepared.w * scale, h: prepared.h * scale }, imageId, "", { by: uid, z: nextZ([...objects.values()]) });
    await commit({ [made.id]: made });
    state.selection = new Set([made.id]); setTool("select"); state.selection = new Set([made.id]); renderer.setOverlays({ selection: selectionObjects() }); emit();
    announce("Picture added. Describe it in the picture description box."); return { ok: true, id: made.id };
  }
  async function insertPlainText(text) {
    if (!editable() || !text.trim()) return;
    const [cx, cy] = viewCentre(); const clean = text.slice(0, LIMITS.text);
    const made = textObject({ x: cx - 180, y: cy - 20, w: 360, h: measureTextHeight(clean, state.style, 360) }, clean, { style: { ...state.style }, by: uid, z: nextZ([...objects.values()]) });
    await commit({ [made.id]: made });
  }

  // ---- laser and presence ------------------------------------------------------------------------------------------
  function pushLaser() {
    renderer.overlays.lasers.set("me", { trail: laser.trail, colour: laser.colour }); renderer.request();
    if (sync && sync.sendPresence) {
      const now = Date.now(); const tail = laser.trail.slice(-12);
      const head = tail[tail.length - 1];
      sync.sendPresence({ x: head[0], y: head[1], tool: "laser", laser: tail.map(point => [Math.round(point[0]), Math.round(point[1]), now - point[2]]) });
    }
  }
  function setRemote(presence) {
    const cursors = new Map(); const now = Date.now();
    for (const [id, person] of presence) {
      if (now - person.at > 30000) { renderer.overlays.lasers.delete(id); continue; }
      cursors.set(id, { x: person.x, y: person.y, name: person.name, colour: person.colour });
      if (person.laser && person.laser.length) renderer.overlays.lasers.set(id, { trail: person.laser.map(point => [point[0], point[1], now - point[2]]), colour: person.colour }); else renderer.overlays.lasers.delete(id);
    }
    for (const key of [...renderer.overlays.lasers.keys()]) if (key !== "me" && !presence.has(key)) renderer.overlays.lasers.delete(key);
    renderer.setOverlays({ cursors });
  }
  function setLive(map) {
    const mapped = new Map();
    for (const [id, object] of map) mapped.set(id, { object: { ...object, id: `live-${id}`, z: 1e9 } });
    renderer.setOverlays({ live: mapped });
  }

  // ---- keyboard -----------------------------------------------------------------------------------------------------
  function handleKeyDown(event) {
    const target = event.target;
    if (target instanceof HTMLElement && (target.closest("input, textarea, select, [contenteditable='true']"))) return;
    const mod = event.ctrlKey || event.metaKey; const key = event.key;
    if (key === " " && target === root) { spaceHeld = true; event.preventDefault(); return; }
    if (mod && !event.altKey) {
      const lower = key.toLowerCase();
      if (lower === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
      if (lower === "y") { event.preventDefault(); redo(); return; }
      if (lower === "d") { event.preventDefault(); duplicateSelection(); return; }
      if (lower === "a") { event.preventDefault(); selectAll(); return; }
      if (lower === "c") { copySelection(); return; }
      if (lower === "x") { event.preventDefault(); cutSelection(); return; }
      if (lower === "l") { event.preventDefault(); toggleLock(); return; }
      if (key === "]") { event.preventDefault(); reorder(1); return; }
      if (key === "[") { event.preventDefault(); reorder(-1); return; }
      return;
    }
    if (key === "Delete" || key === "Backspace") { if (state.selection.size) { event.preventDefault(); deleteSelection(); } return; }
    if (key === "Escape") { cancelGesture(); clearSelection(); return; }
    if (key === "Enter") { const single = selectionObjects()[0]; if (single && (single.t === "text" || single.t === "sticky") && mayChange(single) && editable()) { event.preventDefault(); openEditor(single); } return; }
    if (key.startsWith("Arrow") && state.selection.size) {
      event.preventDefault(); const step = event.shiftKey ? 50 : event.altKey ? 1 : 10;
      nudge(key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0, key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0); return;
    }
    if (key === "]") { cycleSelection(1); return; }
    if (key === "[") { cycleSelection(-1); return; }
    if (key === "+" || key === "=") { zoomAt(1.25); return; }
    if (key === "-" || key === "_") { zoomAt(0.8); return; }
    if (key === "0") { fit(); return; }
    if (key === "1") { setZoom(1); return; }
    if (event.altKey || event.shiftKey) return;
    const tool = Object.entries(TOOLS).find(([, info]) => info.key === key.toLowerCase());
    if (tool) { event.preventDefault(); setTool(tool[0]); }
  }
  function handleKeyUp(event) { if (event.key === " ") spaceHeld = false; }

  function handlePaste(event) {
    const data = event.clipboardData; if (!data || !editable()) return;
    const target = event.target; if (target instanceof HTMLElement && target.closest("input, textarea")) return;
    const file = [...data.files].find(item => item.type.startsWith("image/"));
    if (file) { event.preventDefault(); insertImageFile(file); return; }
    if (state.clipboard.length) { event.preventDefault(); pasteClipboard(); return; }
    const text = data.getData("text/plain"); if (text) { event.preventDefault(); insertPlainText(text); }
  }

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerCancel);
  canvas.addEventListener("wheel", handleWheel, { passive: false });
  canvas.addEventListener("contextmenu", event => event.preventDefault());
  root.addEventListener("keydown", handleKeyDown);
  root.addEventListener("keyup", handleKeyUp);
  root.addEventListener("paste", handlePaste);
  root.addEventListener("dragover", event => { if (editable() && event.dataTransfer && [...event.dataTransfer.types].includes("Files")) event.preventDefault(); });
  root.addEventListener("drop", event => { const file = event.dataTransfer && [...event.dataTransfer.files].find(item => item.type.startsWith("image/")); if (file && editable()) { event.preventDefault(); insertImageFile(file); } });
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => { renderer.resize(); placeEditor(); }) : null;
  if (resizeObserver) resizeObserver.observe(canvas);
  renderer.resize(); renderer.setView({ zoom: 1, tx: 40, ty: 40 });
  canvas.dataset.tool = state.tool;

  return {
    renderer, state, history, TOOLS,
    attachSync(next) { sync = next; }, setData, setMeta, setCanDraw, setRemote, setLive, setTool, setStyle, setEraserMode,
    undo, redo, deleteSelection, duplicateSelection, copySelection, pasteClipboard, selectAll, clearSelection, selectId, cycleSelection, toggleLock, reorder, setAlt,
    zoomBy: factor => zoomAt(factor), setZoom, fit, centreOn, insertTemplate, insertImageFile,
    toggleSnap() { state.snap = !state.snap; announce(`Snap to grid ${state.snap ? "on" : "off"}`); emit(); },
    toggleRecognise() { state.recognise = !state.recognise; announce(`Shape recognition ${state.recognise ? "on" : "off"}`); emit(); },
    get objects() { return objects; }, get images() { return images; }, get meta() { return meta; },
    outline: () => outlineOf([...objects.values()]),
    selectionObjects, snapshotState, resetHistory: () => history.clear(),
    destroy() { destroyed = true; closeEditor(false); if (resizeObserver) resizeObserver.disconnect(); canvas.removeEventListener("pointerdown", handlePointerDown); canvas.removeEventListener("pointermove", handlePointerMove); canvas.removeEventListener("pointerup", handlePointerUp); canvas.removeEventListener("pointercancel", handlePointerCancel); canvas.removeEventListener("wheel", handleWheel); root.removeEventListener("keydown", handleKeyDown); root.removeEventListener("keyup", handleKeyUp); root.removeEventListener("paste", handlePaste); }
  };
}

export { pointsBounds };
