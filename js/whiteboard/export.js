// Whiteboard export: SVG text, a minimal PDF writer and PNG/JPEG rendering. All client side, nothing is uploaded.
import { decodePoints, objectBounds, smoothSegments, unionBounds } from "./geometry.js";
import { isImageDataUrl, PAPERS, resolveColour } from "./model.js";
import { wrapLines } from "./renderer.js";

export function contentBounds(objects, pad = 40) {
  const live = objects.filter(object => !object.del);
  const box = unionBounds(live.map(objectBounds));
  if (!box) return { x: 0, y: 0, w: 1200, h: 800 };
  return { x: box.x - pad, y: box.y - pad, w: Math.max(80, box.w + pad * 2), h: Math.max(80, box.h + pad * 2) };
}

export function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[ch]));
}

const num = value => Number(value.toFixed(2));

function pathOf(points, dx, dy) {
  if (!points.length) return "";
  const p = points.map(point => [point[0] + dx, point[1] + dy]);
  let d = `M${num(p[0][0])} ${num(p[0][1])}`;
  if (p.length === 2) return `${d}L${num(p[1][0])} ${num(p[1][1])}`;
  for (const segment of smoothSegments(p)) d += `Q${num(segment.cx)} ${num(segment.cy)} ${num(segment.x)} ${num(segment.y)}`;
  return `${d}L${num(p[p.length - 1][0])} ${num(p[p.length - 1][1])}`;
}

const approxWidth = (text, size) => text.length * size * 0.55;

export function objectToSvg(object, images = {}, paper = "light") {
  if (object.del) return "";
  const colour = resolveColour(object.s.c, paper);
  const rotate = object.r ? ` transform="rotate(${num(object.r * 180 / Math.PI)} ${num(object.x + object.w / 2)} ${num(object.y + object.h / 2)})"` : "";
  const opacity = object.s.o < 1 ? ` opacity="${object.s.o}"` : "";
  const strokeAttrs = `fill="none" stroke="${colour}" stroke-width="${object.s.w}" stroke-linecap="round" stroke-linejoin="round"`;
  let body = "";
  if (object.t === "stroke") {
    const points = decodePoints(object.p);
    if (points.length < 2) body = `<circle cx="${num((points[0] || [0, 0])[0] + object.x)}" cy="${num((points[0] || [0, 0])[1] + object.y)}" r="${object.s.w / 2}" fill="${colour}"/>`;
    else if (object.k === "hl") body = `<path d="${pathOf(points, object.x, object.y)}" fill="none" stroke="${colour}" stroke-width="${object.s.w}" stroke-opacity="0.4" style="mix-blend-mode:multiply"/>`;
    else body = `<path d="${pathOf(points, object.x, object.y)}" ${strokeAttrs}/>`;
  } else if (object.t === "shape") {
    const fill = object.s.f ? resolveColour(object.s.f, paper) : "none";
    if (object.k === "line" || object.k === "arrow") {
      const points = decodePoints(object.p).map(point => [point[0] + object.x, point[1] + object.y]);
      if (points.length >= 2) {
        const a = points[0]; const b = points[points.length - 1];
        body = `<path d="M${num(a[0])} ${num(a[1])}L${num(b[0])} ${num(b[1])}" ${strokeAttrs}/>`;
        if (object.k === "arrow") {
          const angle = Math.atan2(b[1] - a[1], b[0] - a[0]); const head = Math.max(12, object.s.w * 4);
          body += `<path d="M${num(b[0] - head * Math.cos(angle - 0.45))} ${num(b[1] - head * Math.sin(angle - 0.45))}L${num(b[0])} ${num(b[1])}L${num(b[0] - head * Math.cos(angle + 0.45))} ${num(b[1] - head * Math.sin(angle + 0.45))}" ${strokeAttrs}/>`;
        }
      }
    } else if (object.k === "ellipse") body = `<ellipse cx="${num(object.x + object.w / 2)}" cy="${num(object.y + object.h / 2)}" rx="${num(object.w / 2)}" ry="${num(object.h / 2)}" fill="${fill}" stroke="${colour}" stroke-width="${object.s.w}"/>`;
    else if (object.k === "triangle") body = `<polygon points="${num(object.x + object.w / 2)},${num(object.y)} ${num(object.x + object.w)},${num(object.y + object.h)} ${num(object.x)},${num(object.y + object.h)}" fill="${fill}" stroke="${colour}" stroke-width="${object.s.w}" stroke-linejoin="round"/>`;
    else body = `<rect x="${num(object.x)}" y="${num(object.y)}" width="${num(object.w)}" height="${num(object.h)}" fill="${fill}" stroke="${colour}" stroke-width="${object.s.w}"/>`;
  } else if (object.t === "text" || object.t === "sticky") {
    const size = object.s.fs || 24; const line = Math.ceil(size * 1.3); const pad = object.t === "sticky" ? 12 : 0;
    const lines = wrapLines(object.tx, object.w - pad * 2, text => approxWidth(text, size));
    const fill = object.t === "sticky" ? `<rect x="${num(object.x)}" y="${num(object.y)}" width="${num(object.w)}" height="${num(object.h)}" fill="${escapeXml(object.s.f)}"/>` : "";
    const ink = object.t === "sticky" ? "#1d2738" : colour;
    const tspans = lines.map((text, index) => `<tspan x="${num(object.x + pad)}" y="${num(object.y + pad + index * line + size)}">${escapeXml(text)}</tspan>`).join("");
    body = `${fill}<text font-family="Segoe UI, Arial, sans-serif" font-size="${size}" fill="${ink}"${object.s.b ? ' font-weight="bold"' : ""}${object.s.u ? ' text-decoration="underline"' : ""}>${tspans}</text>`;
  } else if (object.t === "image") {
    const href = images[object.im];
    body = isImageDataUrl(href) ? `<image x="${num(object.x)}" y="${num(object.y)}" width="${num(object.w)}" height="${num(object.h)}" href="${href}"><title>${escapeXml(object.alt || "")}</title></image>` : "";
  }
  return body ? `<g${rotate}${opacity}>${body}</g>` : "";
}

export function boardToSvg(objects, images = {}, { paper = "light", bounds = null } = {}) {
  const box = bounds || contentBounds(objects);
  const ordered = objects.filter(object => !object.del).sort((a, b) => (a.z || 0) - (b.z || 0) || (a.at || 0) - (b.at || 0));
  const inner = ordered.map(object => objectToSvg(object, images, paper)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(box.x)} ${num(box.y)} ${num(box.w)} ${num(box.h)}" width="${Math.round(box.w)}" height="${Math.round(box.h)}"><rect x="${num(box.x)}" y="${num(box.y)}" width="${num(box.w)}" height="${num(box.h)}" fill="${PAPERS[paper]}"/>${inner}</svg>`;
}

// ---- PDF -----------------------------------------------------------------------------------------------------
// One JPEG per page. `pages`: [{ jpeg: Uint8Array, w, h }] (pixels). Returns Uint8Array of a valid PDF 1.4 file.
export function buildPdf(pages) {
  const encoder = new TextEncoder(); const chunks = []; const offsets = []; let length = 0;
  const push = part => { const bytes = typeof part === "string" ? encoder.encode(part) : part; chunks.push(bytes); length += bytes.length; };
  const startObject = number => { offsets[number] = length; push(`${number} 0 obj\n`); };
  push("%PDF-1.4\n%âãÏÓ\n");
  const pageIds = pages.map((_, index) => 3 + index * 3);
  startObject(1); push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  startObject(2); push(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>\nendobj\n`);
  pages.forEach((page, index) => {
    const pageId = 3 + index * 3; const contentId = pageId + 1; const imageId = pageId + 2;
    const width = Math.round(page.w * 0.75); const height = Math.round(page.h * 0.75); // px -> points
    startObject(pageId); push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`);
    const stream = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
    startObject(contentId); push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`);
    startObject(imageId); push(`<< /Type /XObject /Subtype /Image /Width ${page.w} /Height ${page.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`); push(page.jpeg); push("\nendstream\nendobj\n");
  });
  const count = 3 + pages.length * 3; const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length); let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}

export function dataUrlToBytes(dataUrl) {
  const base64 = String(dataUrl).split(",")[1] || "";
  const binary = atob(base64); const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ---- raster ------------------------------------------------------------------------------------------------
export function loadImages(images) { // resolves to a lookup(id) -> { ready, image }
  const entries = new Map();
  const jobs = Object.entries(images || {}).filter(([, value]) => isImageDataUrl(value)).map(([id, value]) => new Promise(resolve => {
    const image = new Image(); const entry = { ready: false, image };
    image.addEventListener("load", () => { entry.ready = true; resolve(); }); image.addEventListener("error", () => resolve());
    image.src = value; entries.set(id, entry);
  }));
  return Promise.all(jobs).then(() => id => entries.get(id) || null);
}

// Draws `objects` into a new canvas covering `bounds` at `scale` (device pixels per board unit).
export async function renderToCanvas({ renderer, objects, images, bounds, paper = "light", background = "blank", scale = 1, maxSide = 6000 }) {
  const box = bounds || contentBounds(objects);
  const factor = Math.min(scale, maxSide / Math.max(box.w, box.h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(box.w * factor)); canvas.height = Math.max(1, Math.round(box.h * factor));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(factor, 0, 0, factor, -box.x * factor, -box.y * factor);
  renderer.paintBackground(ctx, box, factor, background, paper);
  void background;
  const lookup = await loadImages(images);
  const ordered = objects.filter(object => !object.del).sort((a, b) => (a.z || 0) - (b.z || 0) || (a.at || 0) - (b.at || 0));
  for (const object of ordered) renderer.paintObject(ctx, object, paper, lookup);
  return canvas;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = filename; link.rel = "noopener";
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const canvasToBlob = (canvas, type = "image/png", quality) => new Promise(resolve => canvas.toBlob(resolve, type, quality));
