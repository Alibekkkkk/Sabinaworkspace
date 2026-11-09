import assert from "node:assert/strict";
import test from "node:test";
import {
  corners, decodePoints, densify, distToSegment, encodePoints, eraseFromPolyline, hitTest, localisePoints, marqueeSelect, objectBounds,
  pickTop, pointsBounds, rdp, recogniseShape, resizeBox, rotatePoint, scaleToBox, simplifyStroke, snapAngle, snapToGrid, toLocal, unionBounds
} from "../js/whiteboard/geometry.js";
import { createHistory } from "../js/whiteboard/history.js";
import {
  AUTO_INK, defaultStyle, imageObject, isImageDataUrl, LIMITS, objectBytes, outlineOf, PALETTE, PAPERS, resolveColour, sanitizeMeta, sanitizeObject,
  shapeObject, stickyObject, strokeObjects, textObject, wire
} from "../js/whiteboard/model.js";
import { boardToSvg, buildPdf, contentBounds, escapeXml } from "../js/whiteboard/export.js";
import { fitWithin, sniffImageType } from "../js/whiteboard/images.js";
import { buildTemplate, TEMPLATES } from "../js/whiteboard/templates.js";
import { throttle } from "../js/whiteboard/sync.js";
import { wrapLines } from "../js/whiteboard/renderer.js";

const pt = (x, y, p = 0.5) => [x, y, p];
const wave = count => Array.from({ length: count }, (_, i) => pt(i * 2, Math.sin(i / 4) * 30 + 100, 0.2 + (i % 7) / 10));

test("point encoding round-trips to half a unit and keeps pressure", () => {
  const points = wave(60);
  const text = encodePoints(points);
  const back = decodePoints(text);
  assert.equal(back.length, points.length);
  back.forEach((point, i) => { assert.ok(Math.abs(point[0] - points[i][0]) <= 0.26); assert.ok(Math.abs(point[1] - points[i][1]) <= 0.26); assert.ok(Math.abs(point[2] - points[i][2]) <= 0.06); });
  assert.deepEqual(decodePoints(encodePoints([pt(-5.5, 7, 1)]))[0].slice(0, 2), [-5.5, 7]);
});

test("delta encoding is much smaller than absolute coordinates", () => {
  const points = wave(200);
  const absolute = points.map(point => `${Math.round(point[0] * 2)},${Math.round(point[1] * 2)},5`).join(" ");
  assert.ok(encodePoints(points).length < absolute.length);
});

test("decoding rejects malformed input instead of guessing", () => {
  assert.deepEqual(decodePoints("zz"), []);
  assert.deepEqual(decodePoints("1,2"), []);
  assert.deepEqual(decodePoints("1,2,99"), []);
  assert.deepEqual(decodePoints(""), []);
  assert.deepEqual(decodePoints(null), []);
  assert.equal(decodePoints(Array(5000).fill("1,1,5").join(" ")).length, 4000, "capped");
});

test("Ramer-Douglas-Peucker keeps corners and drops collinear points", () => {
  const line = Array.from({ length: 50 }, (_, i) => pt(i, i));
  assert.equal(rdp(line, 0.5).length, 2);
  const corner = [...Array.from({ length: 20 }, (_, i) => pt(i, 0)), ...Array.from({ length: 20 }, (_, i) => pt(19, i + 1))];
  const simplified = rdp(corner, 0.5);
  assert.equal(simplified.length, 3);
  assert.deepEqual(simplified[1].slice(0, 2), [19, 0]);
});

test("stroke simplification: a tap becomes a dot, noise is reduced, endpoints stay", () => {
  assert.equal(simplifyStroke([pt(5, 5)]).length, 2);
  assert.deepEqual(simplifyStroke([]), []);
  const noisy = wave(400);
  const simple = simplifyStroke(noisy, 0.8);
  assert.ok(simple.length < noisy.length / 2);
  assert.deepEqual(simple[0], noisy[0]);
  assert.deepEqual(simple[simple.length - 1], noisy[noisy.length - 1]);
});

test("a very long stroke is split into objects that each fit the size cap", () => {
  const long = Array.from({ length: 6000 }, (_, i) => pt(i * 1.5, 200 + Math.sin(i / 3) * 90 + (i % 5) * 7, (i % 9) / 9));
  const parts = strokeObjects(long, { by: "u1" });
  assert.ok(parts.length > 1);
  for (const part of parts) { assert.ok(part.p.length <= LIMITS.strokePts); assert.ok(objectBytes(wire(part)) <= LIMITS.objectBytes, `object is ${objectBytes(wire(part))} bytes`); }
});

test("bounds, localise and union", () => {
  const points = [pt(10, 20), pt(30, 5), pt(15, 40)];
  assert.deepEqual(pointsBounds(points), { x: 10, y: 5, w: 20, h: 35 });
  const local = localisePoints(points);
  assert.deepEqual([local.x, local.y, local.w, local.h], [10, 5, 20, 35]);
  assert.deepEqual(local.points[0].slice(0, 2), [0, 15]);
  assert.deepEqual(unionBounds([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 5, w: 5, h: 30 }]), { x: 0, y: 0, w: 25, h: 35 });
  assert.equal(unionBounds([]), null);
});

test("transform maths: rotation about a centre, local frame, corners", () => {
  const rotated = rotatePoint([10, 0], [0, 0], Math.PI / 2);
  assert.ok(Math.abs(rotated[0]) < 1e-9 && Math.abs(rotated[1] - 10) < 1e-9);
  const box = { x: 100, y: 100, w: 40, h: 20, r: Math.PI / 2 };
  const local = toLocal(box, rotatePoint([105, 105], [120, 110], Math.PI / 2));
  assert.ok(Math.abs(local[0] - 5) < 1e-9 && Math.abs(local[1] - 5) < 1e-9);
  assert.equal(corners({ x: 0, y: 0, w: 10, h: 10 }).length, 4);
  const aabb = objectBounds({ t: "shape", k: "rect", x: 0, y: 0, w: 100, h: 20, r: Math.PI / 2, s: { w: 2 } });
  assert.ok(Math.abs(aabb.w - 20) < 1e-6 && Math.abs(aabb.h - 100) < 1e-6);
});

test("hit testing: filled and outline shapes, strokes, rotated boxes and tombstones", () => {
  const stroke = { t: "stroke", x: 10, y: 10, w: 100, h: 0, s: { w: 4 } };
  const pts = [pt(0, 0), pt(100, 0)];
  assert.ok(hitTest(stroke, [60, 11], 2, pts));
  assert.ok(!hitTest(stroke, [60, 30], 2, pts));
  const outline = { t: "shape", k: "rect", x: 0, y: 0, w: 100, h: 100, s: { w: 4 } };
  assert.ok(hitTest(outline, [1, 50], 2), "on the edge");
  assert.ok(!hitTest(outline, [50, 50], 2), "inside an unfilled rectangle is empty");
  assert.ok(hitTest({ ...outline, s: { w: 4, f: "#bfe0fb" } }, [50, 50], 2), "inside a filled rectangle");
  const ellipse = { t: "shape", k: "ellipse", x: 0, y: 0, w: 100, h: 60, s: { w: 4 } };
  assert.ok(hitTest(ellipse, [50, 0], 2) && !hitTest(ellipse, [50, 30], 2) && !hitTest(ellipse, [2, 2], 2));
  const triangle = { t: "shape", k: "triangle", x: 0, y: 0, w: 100, h: 100, s: { w: 4, f: "#bfe0fb" } };
  assert.ok(hitTest(triangle, [50, 60], 2) && !hitTest(triangle, [5, 5], 2));
  const sticky = { t: "sticky", x: 0, y: 0, w: 100, h: 100, r: Math.PI / 4, s: { w: 2 } };
  assert.ok(hitTest(sticky, [50, 50], 2) && !hitTest(sticky, [2, 2], 0), "a corner of the unrotated box is outside once rotated");
  assert.ok(!hitTest({ ...sticky, del: true }, [50, 50], 2));
});

test("pickTop returns the object drawn last and skips locked ones", () => {
  const a = { id: "a", t: "sticky", x: 0, y: 0, w: 50, h: 50, z: 1, s: { w: 1 } };
  const b = { id: "b", t: "sticky", x: 0, y: 0, w: 50, h: 50, z: 2, s: { w: 1 } };
  assert.equal(pickTop([a, b], [10, 10], 2).id, "b");
  assert.equal(pickTop([a, { ...b, lk: true }], [10, 10], 2).id, "a");
  assert.equal(pickTop([a, b], [400, 400], 2), null);
});

test("marquee selects intersecting objects, or only contained ones", () => {
  const items = [{ id: "in", t: "sticky", x: 10, y: 10, w: 20, h: 20, s: { w: 1 } }, { id: "edge", t: "sticky", x: 90, y: 90, w: 40, h: 40, s: { w: 1 } }, { id: "out", t: "sticky", x: 300, y: 300, w: 10, h: 10, s: { w: 1 } }];
  assert.deepEqual(marqueeSelect(items, { x: 0, y: 0, w: 100, h: 100 }).map(o => o.id), ["in", "edge"]);
  assert.deepEqual(marqueeSelect(items, { x: 100, y: 100, w: -100, h: -100 }, { contain: true }).map(o => o.id), ["in"], "dragging up and left works");
});

test("resize keeps a minimum size, supports each handle and the aspect ratio", () => {
  const box = { x: 100, y: 100, w: 200, h: 100 };
  assert.deepEqual(resizeBox(box, "e", 50, 0), { x: 100, y: 100, w: 250, h: 100 });
  assert.deepEqual(resizeBox(box, "nw", 20, 10), { x: 120, y: 110, w: 180, h: 90 });
  assert.equal(resizeBox(box, "e", -500, 0).w, 4);
  const ratio = resizeBox(box, "se", 100, 5, { keepRatio: true });
  assert.ok(Math.abs(ratio.w / ratio.h - 2) < 1e-9);
  const scaled = scaleToBox([{ id: "a", x: 0, y: 0, w: 10, h: 10 }, { id: "b", x: 10, y: 0, w: 10, h: 10 }], { x: 0, y: 0, w: 20, h: 10 }, { x: 0, y: 0, w: 40, h: 20 });
  assert.deepEqual(scaled.map(o => [o.x, o.w, o.h]), [[0, 20, 20], [20, 20, 20]]);
  assert.equal(snapAngle(0.27), Math.round(0.27 / (Math.PI / 12)) * (Math.PI / 12));
  assert.equal(snapToGrid(33, 20), 40);
});

test("area eraser removes only the touched part and leaves the runs on either side", () => {
  const line = [pt(0, 0), pt(200, 0)];
  const { touched, runs } = eraseFromPolyline(line, [100, 0], 10);
  assert.ok(touched);
  assert.equal(runs.length, 2);
  assert.ok(runs[0][runs[0].length - 1][0] < 100 && runs[1][0][0] > 100);
  assert.equal(eraseFromPolyline(line, [100, 80], 10).touched, false);
  assert.ok(densify(line, 10).length >= 21);
  assert.ok(distToSegment([5, 5], [0, 0], [10, 0]) === 5);
});

test("rough circles and boxes are recognised, scribbles are not", () => {
  const circle = Array.from({ length: 40 }, (_, i) => pt(100 + Math.cos(i / 39 * Math.PI * 2) * 60 + (i % 3), 100 + Math.sin(i / 39 * Math.PI * 2) * 60));
  assert.equal(recogniseShape(circle).k, "ellipse");
  const box = [...Array.from({ length: 10 }, (_, i) => pt(i * 10, 0)), ...Array.from({ length: 10 }, (_, i) => pt(100, i * 10)), ...Array.from({ length: 10 }, (_, i) => pt(100 - i * 10, 100)), ...Array.from({ length: 10 }, (_, i) => pt(0, 100 - i * 10))];
  assert.equal(recogniseShape(box).k, "rect");
  assert.equal(recogniseShape(wave(30)), null);
  assert.equal(recogniseShape([pt(0, 0), pt(1, 1)]), null);
});

// ---- model -------------------------------------------------------------------------------------------------------
test("palette colours keep at least 3:1 contrast on both paper colours", () => {
  const luminance = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  for (const entry of PALETTE) {
    for (const paper of Object.keys(PAPERS)) {
      const colour = resolveColour(entry.value, paper);
      assert.ok(contrast(colour, PAPERS[paper]) >= 3, `${entry.name} on ${paper} paper is ${contrast(colour, PAPERS[paper]).toFixed(2)}:1`);
    }
  }
  assert.equal(resolveColour(AUTO_INK, "dark"), "#ffffff");
  assert.equal(resolveColour("javascript:alert(1)", "light"), "#111827", "an unknown colour falls back to ink");
});

test("sanitiser accepts good objects and rejects or repairs hostile ones", () => {
  const good = strokeObjects([pt(0, 0), pt(50, 50)], { by: "u1" })[0];
  const clean = sanitizeObject("abc", wire(good));
  assert.equal(clean.t, "stroke"); assert.equal(clean.id, "abc");
  assert.equal(sanitizeObject("bad id!", wire(good)), null);
  assert.equal(sanitizeObject("a", { t: "script", x: 1 }), null);
  assert.equal(sanitizeObject("a", null), null);
  assert.equal(sanitizeObject("a", { t: "stroke", p: "x".repeat(LIMITS.strokePts + 1) }), null);
  assert.equal(sanitizeObject("a", { t: "shape", k: "star", s: {} }), null);
  assert.equal(sanitizeObject("a", { t: "image", im: "../../x" }), null);
  const odd = sanitizeObject("a", { t: "text", x: 1e12, y: NaN, w: -5, h: "9", s: { c: "red; background:url(x)", w: 9999, o: 7, f: "<b>" }, tx: 5 });
  assert.equal(odd.x, 0); assert.equal(odd.y, 0); assert.equal(odd.w, 0); assert.equal(odd.s.c, AUTO_INK); assert.equal(odd.s.w, 4); assert.equal(odd.s.o, 1); assert.equal(odd.s.f, undefined); assert.equal(odd.tx, "");
  const tomb = sanitizeObject("a", { t: "stroke", del: true, by: "u", at: 5 });
  assert.equal(tomb.del, true);
  assert.equal(sanitizeObject("a", { t: "sticky", x: 0, y: 0, w: 5, h: 5, s: { f: "#ff0000" } }).s.f, "#fff3a8", "sticky colours come from the allowed set");
  assert.equal(sanitizeMeta({ title: "x".repeat(80), bg: "weird", paper: "dark", order: 4 }).bg, "blank");
  assert.equal(sanitizeMeta({ paper: "dark" }).paper, "dark");
});

test("image data URLs: only png, jpeg and webp base64, never svg or oversize", () => {
  assert.ok(isImageDataUrl("data:image/png;base64,iVBORw0KGgo="));
  assert.ok(!isImageDataUrl("data:image/svg+xml;base64,PHN2Zz4="));
  assert.ok(!isImageDataUrl("data:text/html;base64,PGI+"));
  assert.ok(!isImageDataUrl("data:image/png;base64," + "A".repeat(LIMITS.imageChars)));
  assert.ok(!isImageDataUrl("javascript:alert(1)"));
});

test("file signature sniffing ignores the claimed type and rejects svg and html", () => {
  assert.equal(sniffImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])), "image/png");
  assert.equal(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffImageType(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50])), "image/webp");
  assert.equal(sniffImageType(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>")), null);
  assert.equal(sniffImageType(new TextEncoder().encode("<html><script>")), null);
  assert.equal(sniffImageType(new Uint8Array(0)), null);
  assert.deepEqual(fitWithin(4000, 2000, 1024), { w: 1024, h: 512 });
  assert.deepEqual(fitWithin(100, 50, 1024), { w: 100, h: 50 });
});

test("outline lists text, sticky notes and pictures in reading order for screen readers", () => {
  const items = [textObject({ x: 300, y: 10, w: 100, h: 30 }, "right"), stickyObject({ x: 10, y: 12, w: 100, h: 100 }, "left note"), imageObject({ x: 10, y: 400, w: 100, h: 100 }, "m1", "A flooded street"), shapeObject("rect", { x: 0, y: 0, w: 5, h: 5 }), imageObject({ x: 10, y: 600, w: 100, h: 100 }, "m2", "")];
  const outline = outlineOf(items);
  assert.deepEqual(outline.map(item => item.label), ["left note", "right", "A flooded street", "Image without a description"]);
});

// ---- history -------------------------------------------------------------------------------------------------------
const obj = (id, x, at) => ({ id, t: "shape", k: "rect", x, y: 0, w: 5, h: 5, s: {}, at });

test("undo and redo restore objects, and a new action clears redo", () => {
  const history = createHistory(); const live = new Map();
  const put = (id, object) => { if (object) live.set(id, object); else live.delete(id); };
  live.set("a", obj("a", 1, 10)); history.record({ a: null }, { a: obj("a", 1, 10) });
  live.set("a", obj("a", 50, 20)); history.record({ a: obj("a", 1, 10) }, { a: obj("a", 50, 20) });
  assert.ok(history.canUndo() && !history.canRedo());
  let result = history.undo(id => live.get(id) || null);
  assert.equal(result.apply.a.x, 1); put("a", result.apply.a);
  result = history.undo(id => live.get(id) || null);
  assert.equal(result.apply.a, null); put("a", null);
  assert.ok(!history.canUndo() && history.canRedo());
  result = history.redo(id => live.get(id) || null);
  assert.equal(result.apply.a.x, 1); put("a", result.apply.a);
  history.record({ a: obj("a", 1, 10) }, { a: obj("a", 9, 30) });
  assert.ok(!history.canRedo(), "recording after undo discards the redo branch");
  assert.deepEqual(history.undo(() => null), { apply: {}, skipped: ["a"] }, "the object is gone, so there is nothing to restore");
  assert.deepEqual(history.undo(() => null), { apply: {}, skipped: ["a"] }, "the older command is skipped the same way");
  assert.equal(history.undo(() => null), null, "and the stack is empty afterwards");
});

test("undo skips an object somebody else changed in the meantime and says so", () => {
  const history = createHistory();
  history.record({ a: obj("a", 1, 10), b: obj("b", 1, 10) }, { a: obj("a", 2, 20), b: obj("b", 2, 20) });
  const live = new Map([["a", obj("a", 99, 55)], ["b", obj("b", 2, 20)]]); // a was moved by someone else
  const result = history.undo(id => live.get(id) || null);
  assert.deepEqual(result.skipped, ["a"]);
  assert.equal(result.apply.b.x, 1);
  assert.ok(!("a" in result.apply));
});

test("history is bounded and ignores no-op commands", () => {
  const history = createHistory(5);
  for (let i = 0; i < 20; i++) history.record({ a: obj("a", i, i) }, { a: obj("a", i + 1, i + 1) });
  assert.equal(history.size().undo, 5);
  assert.equal(history.record({ a: obj("a", 1, 1) }, { a: obj("a", 1, 1) }), false);
});

// ---- templates, export ----------------------------------------------------------------------------------------------------
test("every English template builds valid objects that survive sanitising", () => {
  assert.equal(TEMPLATES.length, 6);
  for (const template of TEMPLATES) {
    const objects = buildTemplate(template.id, { x: 100, y: 100 }, { by: "teacher" });
    assert.ok(objects.length >= 4, template.id);
    const ids = new Set(objects.map(object => object.id)); assert.equal(ids.size, objects.length, "ids are unique");
    for (const object of objects) { assert.ok(sanitizeObject(object.id, wire(object)), `${template.id} ${object.t} ${object.k || ""}`); assert.ok(objectBytes(wire(object)) < LIMITS.objectBytes); }
  }
  assert.throws(() => buildTemplate("nope"));
});

test("SVG export escapes text, embeds only valid images and covers every object type", () => {
  const hostile = textObject({ x: 0, y: 0, w: 300, h: 40 }, '<script>alert("x")</script> & </text>');
  const stroke = strokeObjects([pt(0, 0), pt(30, 30), pt(60, 0)], { by: "u" })[0];
  const sticky = stickyObject({ x: 100, y: 100, w: 100, h: 100 }, "note");
  const image = imageObject({ x: 300, y: 300, w: 50, h: 50 }, "m1", "alt <b>");
  const bad = imageObject({ x: 400, y: 400, w: 50, h: 50 }, "m2", "");
  const svg = boardToSvg([hostile, stroke, sticky, image, bad, shapeObject("ellipse", { x: 0, y: 200, w: 50, h: 50 }), shapeObject("triangle", { x: 0, y: 300, w: 50, h: 50 })], { m1: "data:image/png;base64,iVBORw0KGgo=", m2: "data:image/svg+xml;base64,PHN2Zz4=" });
  assert.ok(svg.startsWith("<svg xmlns="));
  assert.ok(!svg.includes("<script>") && svg.includes("&lt;script&gt;"));
  assert.ok(svg.includes('href="data:image/png;base64,iVBORw0KGgo="') && !svg.includes("image/svg+xml"));
  assert.ok(svg.includes("alt &lt;b&gt;"));
  assert.ok(svg.includes("<ellipse") && svg.includes("<polygon") && svg.includes("<path"));
  assert.equal(escapeXml(`<>&"'`), "&lt;&gt;&amp;&quot;&apos;");
  const box = contentBounds([stickyObject({ x: 100, y: 100, w: 100, h: 100 }, "a")], 10);
  assert.deepEqual(box, { x: 90, y: 90, w: 120, h: 120 });
});

test("PDF export writes a structurally valid file with correct xref offsets", () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
  const pdf = buildPdf([{ jpeg, w: 400, h: 300 }, { jpeg, w: 200, h: 200 }]);
  const text = new TextDecoder("latin1").decode(pdf);
  assert.ok(text.startsWith("%PDF-1.4") && text.trimEnd().endsWith("%%EOF"));
  assert.ok(text.includes("/Count 2"));
  const xrefAt = Number(/startxref\n(\d+)/.exec(text)[1]);
  assert.ok(text.slice(xrefAt).startsWith("xref"));
  const offsets = [...text.slice(xrefAt).matchAll(/(\d{10}) 00000 n /g)].map(match => Number(match[1]));
  assert.equal(offsets.length, 6 + 2);
  offsets.forEach((offset, index) => assert.ok(new RegExp(`^${index + 1} 0 obj`).test(text.slice(offset)), `object ${index + 1} starts at its xref offset`));
  assert.ok(text.includes("/Width 400 /Height 300"));
});

test("throttle delivers the first call, spaces the rest and always sends the last value", async () => {
  const seen = []; const send = throttle(value => seen.push(value), 30);
  send(1); send(2); send(3);
  assert.deepEqual(seen, [1]);
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.deepEqual(seen, [1, 3]);
  send(4); send.flush(); assert.equal(seen[seen.length - 1], 4);
});

test("text wrapping breaks long lines at spaces and keeps blank lines", () => {
  const lines = wrapLines("one two three four\n\nfive", 9, text => text.length);
  assert.deepEqual(lines, ["one two", "three", "four", "", "five"]);
  assert.deepEqual(wrapLines("", 100, text => text.length), [""]);
});

test("default style is the flipping ink colour so a new pen is readable on either paper", () => {
  assert.equal(defaultStyle().c, AUTO_INK);
});
