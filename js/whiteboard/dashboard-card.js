// "Whiteboard" card on the teacher dashboard: live pictures of the selected student's class board and own board,
// who can draw (view / draw / hidden), a Take control / Give control button, links that open the full boards,
// and the snapshot saved when a class stops. Reads through the same sync layer as the whiteboard itself.
import { MODES } from "./model.js";
import { pageToDataUrl, saveSnapshot } from "./snapshot.js";
import { createSync } from "./sync.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const MODE_LABEL = { view: "The student can watch", draw: "The student can draw", "teacher-only": "Hidden from the student" };

export function mountDashboardWhiteboard({ db, auth, host, showToast = () => {} }) {
  const lessonSelect = el("select", "ds-select"); lessonSelect.setAttribute("aria-label", "Whiteboard lesson");
  const lessonLabel = el("label", "ds-field__label", "Lesson");
  const modeText = el("p", "wb-dash__mode"); modeText.setAttribute("role", "status");
  const modeSelect = el("select", "ds-select"); modeSelect.setAttribute("aria-label", "What the student can do on the class board");
  for (const value of MODES) { const option = el("option", "", MODE_LABEL[value]); option.value = value; modeSelect.append(option); }
  const control = el("button", "ds-btn ds-btn--primary ds-btn--small"); control.type = "button";
  const row = el("div", "wb-dash__row"); row.append(modeSelect, control);
  const sharedTitle = el("h3", "", "Class board"); const sharedImage = el("img", "wb-dash__thumb"); sharedImage.alt = "";
  const sharedNote = el("p", "ds-field__hint");
  const personalTitle = el("h3", "", "Student's own board (read only)"); const personalImage = el("img", "wb-dash__thumb"); personalImage.alt = "";
  const personalNote = el("p", "ds-field__hint");
  const links = el("p", "wb-dash__links"); const openShared = el("a", "ds-btn ds-btn--secondary ds-btn--small", "Open the class board"); const openPersonal = el("a", "ds-btn ds-btn--secondary ds-btn--small", "Open their own board");
  for (const link of [openShared, openPersonal]) { link.target = "_blank"; link.rel = "noopener"; }
  const snapshotButton = el("button", "ds-btn ds-btn--secondary ds-btn--small", "Send a snapshot to the student"); snapshotButton.type = "button";
  links.append(openShared, openPersonal, snapshotButton);
  host.replaceChildren(lessonLabel, lessonSelect, modeText, row, sharedTitle, sharedImage, sharedNote, personalTitle, personalImage, personalNote, links);

  let code = ""; let lessons = []; let shared = null; let personal = null; let mode = "view"; const timers = new Map();

  function watchThumb(sync, image, note, key) {
    let latest = { objects: new Map(), images: {}, meta: { paper: "light", bg: "blank" } };
    const refresh = async () => {
      if (!latest.objects.size) { image.removeAttribute("src"); image.hidden = true; note.textContent = "Nothing drawn yet."; return; }
      const url = await pageToDataUrl(latest, { maxSide: 620, quality: 0.7 });
      if (url) { image.src = url; image.hidden = false; image.alt = `Picture of the ${key} board with ${latest.objects.size} objects`; note.textContent = `${latest.objects.size} objects. Updates live.`; }
    };
    return {
      objects: (objects, images) => { latest = { ...latest, objects, images }; clearTimeout(timers.get(key)); timers.set(key, setTimeout(refresh, 700)); },
      meta: meta => { latest = { ...latest, meta }; clearTimeout(timers.get(key)); timers.set(key, setTimeout(refresh, 300)); },
      pages: pages => {
        if (pages.length && !sync.pageId) sync.openPage(pages[0].id);
        if (!pages.length) { latest = { ...latest, objects: new Map() }; refresh(); if (key === "shared" && !sync.creating) { sync.creating = true; sync.addPage("Page 1", 0); } } // the teacher's side opens the first page so the student can join in
      }
    };
  }

  function stop() {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    for (const sync of [shared, personal]) if (sync) sync.close();
    shared = null; personal = null;
  }

  function renderMode() {
    modeText.textContent = MODE_LABEL[mode];
    modeSelect.value = mode;
    control.textContent = mode === "draw" ? "Take control" : "Give control";
    control.setAttribute("aria-label", mode === "draw" ? "Take control: stop the student drawing" : "Give control: let the student draw");
  }

  function start() {
    stop();
    const lessonId = lessonSelect.value;
    if (!code || !lessonId || !auth.currentUser) return;
    const uid = auth.currentUser.uid;
    const common = { db, code, lessonId, uid, role: "teacher", name: "Teacher", colour: "#d6336c" };
    const sharedHandlers = watchThumb({ get pageId() { return shared && shared.pageId; }, openPage: id => shared.openPage(id), addPage: (title, order) => shared.addPage(title, order), creating: false }, sharedImage, sharedNote, "shared");
    shared = createSync({ ...common, scope: "shared", handlers: { ...sharedHandlers, mode: value => { mode = value; renderMode(); }, error: () => { sharedNote.textContent = "The class board could not be read."; } } });
    const personalHandlers = watchThumb({ get pageId() { return personal && personal.pageId; }, openPage: id => personal.openPage(id) }, personalImage, personalNote, "personal");
    personal = createSync({ ...common, scope: "personal", handlers: { ...personalHandlers, error: () => { personalNote.textContent = "Their own board could not be read."; } } });
    const query = `code=${encodeURIComponent(code)}&lesson=${encodeURIComponent(lessonId)}`;
    openShared.href = `whiteboard.html?${query}`; openPersonal.href = `whiteboard.html?${query}&board=personal`;
    renderMode();
  }

  lessonSelect.addEventListener("change", start);
  modeSelect.addEventListener("change", async () => { if (!shared) return; const result = await shared.setMode(modeSelect.value); if (!result.ok) { showToast("Could not change the whiteboard mode."); renderMode(); } });
  control.addEventListener("click", async () => { if (!shared) return; const result = await shared.setMode(mode === "draw" ? "view" : "draw"); if (!result.ok) showToast("Could not change the whiteboard mode."); });
  snapshotButton.addEventListener("click", async () => {
    if (!shared) return; snapshotButton.disabled = true;
    const result = await saveSnapshot({ db, sync: shared, code, lessonId: lessonSelect.value, uid: auth.currentUser.uid, label: `Class board ${new Date().toLocaleDateString()}` });
    snapshotButton.disabled = false;
    showToast(result.ok ? `Snapshot saved (${result.pages} page${result.pages === 1 ? "" : "s"}). The student sees it under Snapshots on the board.` : result.reason === "empty" ? "The class board is empty; nothing to save." : "The snapshot could not be saved.");
  });

  return {
    show(studentCode, lessonList) {
      const previous = lessonSelect.value; const changed = studentCode !== code;
      code = studentCode; lessons = lessonList;
      lessonSelect.replaceChildren(...lessons.map(lesson => new Option(lesson.title, lesson.id)));
      if (lessons.some(lesson => lesson.id === previous)) lessonSelect.value = previous;
      if (changed || !shared) start();
    },
    selectLesson(lessonId) { if (lessons.some(lesson => lesson.id === lessonId) && lessonSelect.value !== lessonId) { lessonSelect.value = lessonId; start(); } },
    hide() { stop(); code = ""; },
    destroy() { stop(); host.replaceChildren(); }
  };
}
