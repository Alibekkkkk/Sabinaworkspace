// Whiteboard persistence and real-time sharing over the Realtime Database (compat SDK).
//   whiteboards/<code>/<lessonId>/mode                           view | draw | teacher-only   (teacher writes)
//   whiteboards/<code>/<lessonId>/presence/<uid>                 cursor, name, laser           (each person writes their own)
//   whiteboards/<code>/<lessonId>/snapshots/<id>                 images saved at class stop    (teacher writes)
//   whiteboards/<code>/<lessonId>/boards/<scope>/index/<pageId>  page list (title, order)
//   whiteboards/<code>/<lessonId>/boards/<scope>/pages/<pageId>/{meta, objects/<id>, images/<id>, live/<uid>}
// scope is "shared" (teacher + student, in class) or "personal" (the student's own board, teacher can read it).
import { boardIsFull, LIMITS, MODES, sanitizeMeta, sanitizeObject, isImageDataUrl, wire } from "./model.js";

export const LIVE_INTERVAL_MS = 50; // at most 20 updates a second
export const PRESENCE_INTERVAL_MS = 80;

export function boardPath(code, lessonId) { return `whiteboards/${code}/${lessonId}`; }

export function tombstone(object, by, at) { return { t: object.t, by: object.by || by, at, del: true, z: 0 }; }

// Throttle that keeps the latest value and always delivers the last one.
export function throttle(fn, interval) {
  let last = 0; let timer = 0; let pending = null;
  const run = () => { timer = 0; last = Date.now(); const args = pending; pending = null; if (args) fn(...args); };
  const call = (...args) => {
    pending = args;
    const wait = interval - (Date.now() - last);
    if (wait <= 0) { clearTimeout(timer); run(); } else if (!timer) timer = setTimeout(run, wait);
  };
  call.flush = () => { clearTimeout(timer); if (pending) run(); };
  call.cancel = () => { clearTimeout(timer); timer = 0; pending = null; };
  return call;
}

export function createSync({ db, code, lessonId, scope, uid, role, name, colour, handlers = {} }) {
  const base = boardPath(code, lessonId);
  const boardRoot = `${base}/boards/${scope}`;
  const isTeacher = role === "teacher";
  const subscriptions = [];
  let pageId = null; let pageRefs = [];
  let objects = new Map(); let images = {}; let meta = sanitizeMeta(null); let mode = "view";
  let liveMap = new Map(); let pages = [];
  let lastAt = 0; let queued = 0; let closed = false; let lastAdded = null;

  const stamp = () => { lastAt = Math.max(Date.now(), lastAt + 1); return lastAt; };
  const emit = name2 => { const fn = handlers[name2]; if (fn) fn(); };
  const emitObjects = () => { if (queued) return; queued = 1; Promise.resolve().then(() => { queued = 0; if (!closed && handlers.objects) handlers.objects(objects, images); }); };
  const watch = (ref, event, callback) => { ref.on(event, callback, error => handlers.error && handlers.error(error)); subscriptions.push(() => ref.off(event, callback)); };

  function listenTop() {
    watch(db.ref(`${base}/mode`), "value", snapshot => { const value = snapshot.val(); mode = MODES.includes(value) ? value : "view"; if (handlers.mode) handlers.mode(mode); });
    watch(db.ref(`${boardRoot}/index`), "value", snapshot => {
      const raw = snapshot.val() || {};
      pages = Object.entries(raw).map(([id, value]) => ({ id, ...sanitizeMeta(value) })).filter(page => /^[A-Za-z0-9_-]{1,40}$/.test(page.id)).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
      if (handlers.pages) handlers.pages(pages);
    });
    if (scope === "shared") {
      const presence = db.ref(`${base}/presence`);
      const handle = snapshot => {
        const out = new Map();
        for (const [id, value] of Object.entries(snapshot.val() || {})) {
          if (id === uid || !value || typeof value !== "object") continue;
          out.set(id, { id, name: String(value.name || "Guest").slice(0, 40), colour: /^#[0-9a-f]{6}$/i.test(value.colour || "") ? value.colour : "#1c7ed6", x: Number(value.x) || 0, y: Number(value.y) || 0, tool: String(value.tool || "").slice(0, 20), at: Number(value.at) || 0, laser: Array.isArray(value.laser) ? value.laser.slice(0, 40).map(point => [Number(point[0]) || 0, Number(point[1]) || 0, Number(point[2]) || 0]) : [] });
        }
        if (handlers.presence) handlers.presence(out);
      };
      watch(presence, "value", handle);
      const mine = db.ref(`${base}/presence/${uid}`);
      mine.onDisconnect().remove().catch(() => {});
    }
    const connected = db.ref(".info/connected");
    watch(connected, "value", snapshot => { if (handlers.connection) handlers.connection(snapshot.val() === true); });
  }

  function detachPage() { for (const [ref, event, callback] of pageRefs) ref.off(event, callback); pageRefs = []; objects = new Map(); images = {}; liveMap = new Map(); }

  function openPage(id) {
    detachPage(); pageId = id;
    const root = db.ref(`${boardRoot}/pages/${id}`);
    const reportError = error => handlers.error && handlers.error(error);
    const on = (ref, event, callback) => { ref.on(event, callback, reportError); pageRefs.push([ref, event, callback]); };
    const objectsRef = root.child("objects");
    const upsert = snapshot => { const clean = sanitizeObject(snapshot.key, snapshot.val()); if (clean && !clean.del) objects.set(snapshot.key, clean); else objects.delete(snapshot.key); emitObjects(); };
    on(objectsRef, "child_added", upsert); on(objectsRef, "child_changed", upsert);
    on(objectsRef, "child_removed", snapshot => { objects.delete(snapshot.key); emitObjects(); });
    on(root.child("meta"), "value", snapshot => { meta = sanitizeMeta(snapshot.val()); if (handlers.meta) handlers.meta(meta); });
    on(root.child("images"), "value", snapshot => { const raw = snapshot.val() || {}; images = {}; for (const [key, value] of Object.entries(raw)) if (isImageDataUrl(value)) images[key] = value; emitObjects(); });
    const liveRef = root.child("live");
    const liveUpdate = snapshot => {
      if (snapshot.key === uid) return;
      const clean = sanitizeObject(`live-${snapshot.key}`.slice(0, 40), snapshot.val());
      if (clean && clean.t === "stroke") liveMap.set(snapshot.key, clean); else liveMap.delete(snapshot.key);
      if (handlers.live) handlers.live(liveMap);
    };
    on(liveRef, "child_added", liveUpdate); on(liveRef, "child_changed", liveUpdate);
    on(liveRef, "child_removed", snapshot => { liveMap.delete(snapshot.key); if (handlers.live) handlers.live(liveMap); });
  }

  const pageRoot = () => db.ref(`${boardRoot}/pages/${pageId}`);

  async function writeObjects(changes) { // changes: { id: object | null }; returns { ok, reason }
    if (!pageId) return { ok: false, reason: "no-page" };
    const updates = {}; const at = stamp();
    const next = new Map(objects);
    let extra = 0;
    for (const [id, object] of Object.entries(changes)) {
      if (object) { const stored = { ...object, at: object.at && object.keepAt ? object.at : at }; delete stored.keepAt; next.set(id, stored); extra += JSON.stringify(stored).length; }
      else next.delete(id);
    }
    const candidates = [...next.values()];
    if (extra > 0 && boardIsFull(candidates, images, 0)) return { ok: false, reason: "full" };
    for (const [id, object] of Object.entries(changes)) {
      if (object) {
        if (JSON.stringify(wire(object)).length > LIMITS.objectBytes) return { ok: false, reason: "too-big" };
        updates[`objects/${id}`] = wire(next.get(id));
      } else {
        const previous = objects.get(id);
        updates[`objects/${id}`] = previous ? tombstone(previous, uid, at) : null;
      }
    }
    updates["meta/updatedAt"] = at;
    try { await pageRoot().update(updates); } catch (error) { return { ok: false, reason: "denied", error }; }
    return { ok: true, at }; // the listeners already applied the change locally when the write started
  }

  const sendLive = throttle(object => { if (pageId && !closed) pageRoot().child(`live/${uid}`).set(object ? wire(object) : null).catch(() => {}); }, LIVE_INTERVAL_MS);
  const sendPresence = throttle(state => { if (closed || scope !== "shared") return; db.ref(`${base}/presence/${uid}`).set({ name, colour, x: state.x, y: state.y, tool: state.tool || "", at: Date.now(), laser: state.laser || null }).catch(() => {}); }, PRESENCE_INTERVAL_MS);

  async function putImage(imageId, dataUrl) {
    if (!isImageDataUrl(dataUrl)) return { ok: false, reason: "type" };
    if (boardIsFull([...objects.values()], images, dataUrl.length)) return { ok: false, reason: "full" };
    try { await pageRoot().child(`images/${imageId}`).set(dataUrl); } catch (error) { return { ok: false, reason: "denied", error }; }
    return { ok: true };
  }

  async function addPage(title, order, { bg = "blank", paper = "light" } = {}) {
    if (pages.length >= LIMITS.maxPages) return { ok: false, reason: "pages" };
    const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    lastAdded = id; // known before the write is acknowledged, so the caller can switch to the new page straight away
    const entry = { title: String(title || `Page ${pages.length + 1}`).slice(0, LIMITS.title), bg, paper, order: order ?? pages.length };
    try { await db.ref(`${boardRoot}`).update({ [`index/${id}`]: entry, [`pages/${id}/meta`]: { ...entry, updatedAt: stamp() } }); } catch (error) { return { ok: false, reason: "denied", error }; }
    return { ok: true, id };
  }

  async function updatePageMeta(id, patch) {
    const clean = sanitizeMeta({ ...(pages.find(page => page.id === id) || {}), ...patch });
    try { await db.ref(boardRoot).update({ [`index/${id}`]: clean, [`pages/${id}/meta`]: { ...clean, updatedAt: stamp() } }); } catch (error) { return { ok: false, reason: "denied", error }; }
    return { ok: true };
  }

  async function removePage(id) {
    try { await db.ref(boardRoot).update({ [`index/${id}`]: null, [`pages/${id}`]: null }); } catch (error) { return { ok: false, reason: "denied", error }; }
    return { ok: true };
  }

  async function clearPage() { // teacher on the shared board, or the student on their own board
    if (!pageId) return { ok: false, reason: "no-page" };
    try { await pageRoot().update({ objects: null, images: null, "meta/updatedAt": stamp() }); } catch (error) { return { ok: false, reason: "denied", error }; }
    return { ok: true };
  }

  async function setMode(value) {
    if (!isTeacher || !MODES.includes(value)) return { ok: false, reason: "denied" };
    try { await db.ref(`${base}/mode`).set(value); } catch (error) { return { ok: false, reason: "denied", error }; }
    return { ok: true };
  }

  function close() {
    closed = true; sendLive.cancel(); sendPresence.cancel(); detachPage();
    for (const stop of subscriptions) stop();
    subscriptions.length = 0;
    if (scope === "shared") db.ref(`${base}/presence/${uid}`).remove().catch(() => {});
  }

  // One-off read of any page (thumbnails, PDF export, class-stop snapshots).
  async function readPage(id) {
    const [metaSnap, objectsSnap, imageSnap] = await Promise.all([db.ref(`${boardRoot}/pages/${id}/meta`).once("value"), db.ref(`${boardRoot}/pages/${id}/objects`).once("value"), db.ref(`${boardRoot}/pages/${id}/images`).once("value")]);
    const map = new Map();
    for (const [key, value] of Object.entries(objectsSnap.val() || {})) { const clean = sanitizeObject(key, value); if (clean && !clean.del) map.set(key, clean); }
    const imageMap = {};
    for (const [key, value] of Object.entries(imageSnap.val() || {})) if (isImageDataUrl(value)) imageMap[key] = value;
    return { id, objects: map, images: imageMap, meta: sanitizeMeta(metaSnap.val()) };
  }

  function watchSnapshots(callback) {
    const ref = db.ref(`${base}/snapshots`).limitToLast(20);
    const handler = snapshot => {
      const list = Object.entries(snapshot.val() || {}).map(([id, value]) => ({ id, at: Number(value && value.at) || 0, label: String((value && value.label) || "Board").slice(0, 80), pages: Object.entries((value && value.pages) || {}).filter(([, url]) => isImageDataUrl(url)).map(([pid, url]) => ({ id: pid, url })) })).sort((a, b) => b.at - a.at);
      callback(list);
    };
    ref.on("value", handler, () => callback([]));
    subscriptions.push(() => ref.off("value", handler));
  }

  listenTop();
  return {
    openPage, readPage, watchSnapshots, writeObjects, sendLive, sendPresence, putImage, addPage, updatePageMeta, removePage, clearPage, setMode, close,
    get pageId() { return pageId; }, get lastAdded() { return lastAdded; }, get objects() { return objects; }, get images() { return images; }, get pages() { return pages; }, get mode() { return mode; }, get meta() { return meta; },
    stamp, emit
  };
}
