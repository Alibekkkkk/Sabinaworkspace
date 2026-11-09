// "Lesson clock" card on the teacher dashboard (selected student): live clock + controls for one lesson,
// editable section estimates (stored as per-student overrides, never in protected content), the table of
// saved class times and the CSV export. Rendering always follows the listener, never a local assumption.
import { buildClockCsv, classRows, monthlyTotalSeconds } from "./clock-report.js";
import { createClockControls } from "./clock-controls.js";
import { createClockView } from "./clock-ui.js";
import { runClockAction, subscribeClock } from "./clock-service.js";
import { clockWarnings, elapsedMs, emptyClock, formatDuration, serverNowFrom } from "./lesson-clock.js";
import { applySectionOverrides, buildSections } from "./sections.js";

function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function mountDashboardClock({ db, auth, host, showToast, onStopped }) {
  const select = el("select", "ds-select");
  select.setAttribute("aria-label", "Lesson");
  const selectLabel = el("label", "ds-field__label", "Lesson");
  const display = el("div", "dash-clock__display");
  const value = el("span", "clock-value", "00:00");
  const chip = el("span", "clock-chip", "Not started");
  const hint = el("span", "clock-hint", "offline – time may resync");
  hint.hidden = true;
  display.append(value, chip, hint);
  const controlsHost = el("div");
  const estimates = el("details", "dash-clock__estimates");
  estimates.append(el("summary", "", "Section times (minutes)"));
  const history = el("div", "dash-clock__history");
  const exportButton = el("button", "ds-btn ds-btn--secondary ds-btn--small", "Download class times (CSV)");
  exportButton.type = "button";
  host.replaceChildren(selectLabel, select, display, controlsHost, estimates, history, exportButton);

  const view = createClockView({ valueEl: value, chipEl: chip, hintEl: hint, container: display });
  let snapshot = { clock: emptyClock(), offset: 0, connected: true };
  let code = "";
  let sections = buildSections({});
  let lessons = [];
  let unsubscribe = () => {};
  let unsubscribeHistory = () => {};
  let rows = [];
  let controls = null;
  let lastActivity = 0;
  let activityRef = null;
  let activityHandler = null;
  let timer = 0;

  const serverNow = () => serverNowFrom(Date.now(), snapshot.offset);
  const currentLesson = () => select.value;

  async function loadSections() {
    sections = buildSections({});
    const lessonId = currentLesson();
    if (!code || !lessonId) return;
    try {
      const [contentSnapshot, overrideSnapshot] = await Promise.all([
        db.ref(`protectedContent/${lessonId}/classwork/content/sections`).once("value"),
        db.ref(`studentCurriculum/${code}/${lessonId}/sectionOverrides`).once("value")
      ]);
      const fromContent = contentSnapshot.val();
      sections = applySectionOverrides(Array.isArray(fromContent) ? fromContent : buildSections({}), overrideSnapshot.val());
    } catch (error) {
      console.error("Could not load the lesson's sections", error);
    }
    renderEstimates();
    if (controls) controls.setSections(sections);
  }

  function renderEstimates() {
    const summary = estimates.querySelector("summary");
    estimates.replaceChildren(summary);
    for (const section of sections) {
      const label = el("label", "dash-clock__estimate");
      label.append(el("span", "", section.title));
      const input = el("input", "ds-input");
      input.type = "number";
      input.min = "1";
      input.max = "120";
      input.value = String(section.estimatedMinutes);
      input.setAttribute("aria-label", `${section.title} planned minutes`);
      input.addEventListener("change", async () => {
        const minutes = Math.round(Number(input.value));
        if (!Number.isFinite(minutes) || minutes < 1 || minutes > 120) { input.value = String(section.estimatedMinutes); showToast("Use 1 to 120 minutes."); return; }
        try {
          await db.ref(`studentCurriculum/${code}/${currentLesson()}/sectionOverrides/estimatedMinutes/${section.id}`).set(minutes);
          section.estimatedMinutes = minutes;
          showToast(`${section.title} set to ${minutes} min for this student`);
        } catch (error) { showToast(`Could not save: ${error.message}`); input.value = String(section.estimatedMinutes); }
      });
      label.append(input);
      estimates.append(label);
    }
    estimates.append(el("p", "ds-field__hint", "Saved for this student's copy of the lesson; the lesson content itself is not changed."));
  }

  function renderHistory() {
    const total = monthlyTotalSeconds(rows, serverNow());
    const heading = el("p", "dash-clock__month", `Class time this month: ${formatDuration(total * 1000)}`);
    const table = el("table", "dash-clock__table");
    table.append(el("caption", "ds-field__hint", "Saved class times"));
    const head = el("tr");
    for (const name of ["Lesson", "Ended", "Time"]) head.append(el("th", "", name));
    table.append(head);
    for (const row of rows.slice(0, 10)) {
      const tr = el("tr");
      tr.append(el("td", "", row.title), el("td", "", row.stoppedAt ? new Date(row.stoppedAt).toLocaleDateString() : ""), el("td", "", formatDuration(row.durationSeconds * 1000)));
      table.append(tr);
    }
    history.replaceChildren(heading, rows.length ? table : el("p", "ds-field__hint", "No saved classes yet."));
  }

  function paintWarnings() {
    if (controls) controls.setWarnings(clockWarnings(snapshot.clock, serverNow(), lastActivity));
  }

  function subscribe() {
    unsubscribe();
    const lessonId = currentLesson();
    snapshot = { clock: emptyClock(), offset: snapshot.offset, connected: true };
    view.update(snapshot);
    if (!code || !lessonId) return;
    unsubscribe = subscribeClock(db, code, lessonId, next => {
      snapshot = next;
      view.update(snapshot);
      if (controls) { controls.render(); paintWarnings(); }
    });
  }

  function subscribeHistory() {
    unsubscribeHistory();
    if (!code) return;
    const ref = db.ref(`lessonClock/${code}`);
    const handler = snapshotValue => {
      const titles = Object.fromEntries(lessons.map(lesson => [lesson.id, lesson.title]));
      rows = classRows(code, snapshotValue.val() || {}, titles);
      renderHistory();
    };
    ref.on("value", handler, error => console.error("Class time history failed", error));
    unsubscribeHistory = () => ref.off("value", handler);
  }

  controls = createClockControls({
    container: controlsHost,
    sections,
    getSnapshot: () => snapshot,
    run: async (action, extra) => {
      const stoppedCode = code; const stoppedLesson = currentLesson();
      const result = await runClockAction({ db, auth, code, lessonId: stoppedLesson, action, offset: snapshot.offset, clock: snapshot.clock, ...extra });
      if (action === "stop" && result && result.ok && onStopped) { try { onStopped({ code: stoppedCode, lessonId: stoppedLesson }); } catch (error) { console.error("Stop hook failed", error); } }
      return result;
    }
  });

  select.addEventListener("change", async () => { subscribe(); await loadSections(); });
  exportButton.addEventListener("click", () => {
    const blob = new Blob([buildClockCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `class-times-${code}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  view.start();
  timer = setInterval(() => { if (controls && code) paintWarnings(); }, 5000);

  return {
    // lessonList: [{ id, title }] classwork lessons visible to this student
    async show(studentCode, lessonList) {
      if (studentCode !== code) {
        if (activityRef && activityHandler) activityRef.off("value", activityHandler);
        code = studentCode;
        lastActivity = 0;
        if (code) {
          activityRef = db.ref(`sessionSummary/${code}/lastUpdate`);
          activityHandler = snapshotValue => { lastActivity = Number(snapshotValue.val()) || 0; paintWarnings(); };
          activityRef.on("value", activityHandler);
        }
      }
      lessons = lessonList;
      const previous = select.value;
      select.replaceChildren(...lessons.map(lesson => new Option(lesson.title, lesson.id)));
      if (lessons.some(lesson => lesson.id === previous)) select.value = previous;
      subscribeHistory();
      subscribe();
      await loadSections();
      renderHistory();
    },
    hide() {
      unsubscribe();
      unsubscribeHistory();
      if (activityRef && activityHandler) activityRef.off("value", activityHandler);
      code = "";
    },
    rows: () => rows,
    destroy() { clearInterval(timer); view.stop(); this.hide(); }
  };
}
