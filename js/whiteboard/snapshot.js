// Board pictures: small JPEGs of pages for thumbnails, dashboard previews and the snapshot saved when a class stops.
import { canvasToBlob, contentBounds, renderToCanvas } from "./export.js";
import { LIMITS } from "./model.js";
import { createRenderer } from "./renderer.js";
import { createSync } from "./sync.js";

let painter = null;
export function sharedPainter() { // a detached renderer used only for its paint functions
  if (!painter) painter = createRenderer(document.createElement("canvas"));
  return painter;
}

// JPEG data URL of a page that fits the database size cap, or "" for an empty page.
export async function pageToDataUrl({ objects, images, meta }, { maxSide = 900, quality = 0.7, whole = false } = {}) {
  const list = [...objects.values()];
  const bounds = whole ? { x: 0, y: 0, w: 1600, h: 1000 } : contentBounds(list, 30);
  let side = maxSide; let q = quality;
  for (let attempt = 0; attempt < 6; attempt++) {
    const canvas = await renderToCanvas({ renderer: sharedPainter(), objects: list, images, bounds, paper: meta.paper, background: meta.bg, scale: side / Math.max(bounds.w, bounds.h) });
    const url = canvas.toDataURL("image/jpeg", q);
    if (url.length <= LIMITS.imageChars) return url;
    side = Math.round(side * 0.8); q = Math.max(0.4, q - 0.1);
  }
  return "";
}

export async function pageToBlob(page, scale = 1.5) {
  const list = [...page.objects.values()];
  const canvas = await renderToCanvas({ renderer: sharedPainter(), objects: list, images: page.images, bounds: contentBounds(list), paper: page.meta.paper, background: page.meta.bg, scale });
  return canvasToBlob(canvas, "image/png");
}

// Teacher: save a picture of every page for the student (read it back in the whiteboard's "Snapshots" list).
export async function saveSnapshot({ db, sync, code, lessonId, uid, label }) {
  const pages = {};
  for (const page of sync.pages.slice(0, LIMITS.maxPages)) {
    const data = await sync.readPage(page.id);
    if (!data.objects.size) continue;
    const url = await pageToDataUrl(data);
    if (url) pages[page.id] = url;
  }
  if (!Object.keys(pages).length) return { ok: false, reason: "empty" };
  const ref = db.ref(`whiteboards/${code}/${lessonId}/snapshots`).push();
  try { await ref.set({ at: firebase.database.ServerValue.TIMESTAMP, by: uid, label: String(label || "Board snapshot").slice(0, 80), pages }); } catch (error) { return { ok: false, reason: "denied", error }; }
  return { ok: true, id: ref.key, pages: Object.keys(pages).length };
}

// Used by the dashboard when the clock stops: save the shared board without opening the whiteboard UI.
export async function snapshotOnStop({ db, code, lessonId, uid }) {
  let ready; const loaded = new Promise(resolve => { ready = resolve; });
  const sync = createSync({ db, code, lessonId, scope: "shared", uid, role: "teacher", name: "Teacher", colour: "#d6336c", handlers: { pages: ready, error: () => ready([]) } });
  try {
    await Promise.race([loaded, new Promise(resolve => setTimeout(resolve, 5000))]);
    return await saveSnapshot({ db, sync, code, lessonId, uid, label: `End of class ${new Date().toLocaleDateString()}` });
  } finally { sync.close(); }
}
