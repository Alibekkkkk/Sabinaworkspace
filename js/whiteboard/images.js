// Image intake for the whiteboard: type sniffing by file signature (never trust the file name or MIME type),
// a size cap, downscaling and re-encoding. Re-encoding through a canvas also strips metadata and any hostile payload.
// SVG is rejected on purpose: it can carry script.
import { LIMITS } from "./model.js";

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_SIDE = 1024;

export function sniffImageType(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

export function fitWithin(width, height, max = MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height, 1));
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

// Returns { ok: true, dataUrl, w, h } or { ok: false, reason, message }.
export async function prepareImage(file) {
  if (!file || typeof file.size !== "number") return { ok: false, reason: "file", message: "That is not a file I can read." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, reason: "size", message: "That picture is bigger than 2 MB. Choose a smaller one." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes.subarray(0, 16));
  if (!type) return { ok: false, reason: "type", message: "Only PNG, JPEG and WebP pictures can be added." };
  let bitmap;
  try { bitmap = await createImageBitmap(new Blob([bytes], { type })); } catch (error) { return { ok: false, reason: "decode", message: "That picture could not be opened." }; }
  const { w, h } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (type === "image/jpeg") { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h); }
  ctx.drawImage(bitmap, 0, 0, w, h);
  // Keep photos as JPEG and artwork with transparency as PNG when small enough; always fall back to smaller JPEG.
  const attempts = type === "image/png" ? [["image/png", 1], ["image/jpeg", 0.8], ["image/jpeg", 0.6], ["image/jpeg", 0.4]] : [["image/jpeg", 0.8], ["image/jpeg", 0.6], ["image/jpeg", 0.4]];
  for (const [mime, quality] of attempts) {
    if (mime === "image/jpeg" && type === "image/png") { ctx.globalCompositeOperation = "destination-over"; ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = "source-over"; }
    const dataUrl = canvas.toDataURL(mime, quality);
    if (dataUrl.length <= LIMITS.imageChars) return { ok: true, dataUrl, w, h };
  }
  const smaller = fitWithin(w, h, 640);
  canvas.width = smaller.w; canvas.height = smaller.h;
  const small = canvas.getContext("2d"); small.fillStyle = "#ffffff"; small.fillRect(0, 0, smaller.w, smaller.h);
  small.drawImage(bitmap, 0, 0, smaller.w, smaller.h);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.5);
  if (dataUrl.length <= LIMITS.imageChars) return { ok: true, dataUrl, w: smaller.w, h: smaller.h };
  return { ok: false, reason: "big", message: "That picture is too detailed to store. Try a simpler one." };
}
