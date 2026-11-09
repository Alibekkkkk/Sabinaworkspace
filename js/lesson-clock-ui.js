// Lesson page glue: the live clock in the header, the always-visible section bar, the teacher's floating
// control panel, the "class finished" summary card and the teacher warnings. Everything renders from
// the listener snapshot (never from a local assumption about what a button did).
import { createClockControls } from "./clock-controls.js";
import { createClockView } from "./clock-ui.js";
import { runClockAction, subscribeClock } from "./clock-service.js";
import { clockWarnings, elapsedMs, emptyClock, formatDuration, sectionElapsedMs, sectionProgress, serverNowFrom } from "./lesson-clock.js";

const FALLBACK_SECTIONS = [
  { id: "vocabulary", title: "Vocabulary", estimatedMinutes: 15 },
  { id: "grammar", title: "Grammar", estimatedMinutes: 20 },
  { id: "reading", title: "Reading Comprehension", estimatedMinutes: 25 }
];

function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

// options: { db, auth, isTeacher, getContext() -> { code, lessonId }, getSections() -> sections[], getScore() }
export function initLessonClock(options) {
  const { db, auth, isTeacher } = options;
  let snapshot = { clock: emptyClock(), offset: 0, connected: true };
  let unsubscribe = () => {};
  let activeKey = "";
  let lastStudentActivity = 0;
  let activityRef = null;
  let stopActivity = () => {};

  const view = createClockView({
    valueEl: document.getElementById("clockValue"),
    chipEl: document.getElementById("clockChip"),
    hintEl: document.getElementById("clockHint"),
    container: document.getElementById("timerPill")
  });

  const slot = document.getElementById("lessonBarSlot");
  const bar = el("div", "section-bar");
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Lesson sections: estimated, actual and remaining time");
  const summary = el("section", "ds-card class-summary");
  summary.hidden = true;
  summary.setAttribute("aria-label", "Class summary");
  slot.append(bar, summary);

  let segments = [];
  let sectionsShown = "";

  function sections() {
    const list = options.getSections();
    return Array.isArray(list) && list.length ? list : FALLBACK_SECTIONS;
  }

  function serverNow() { return serverNowFrom(Date.now(), snapshot.offset); }

  function buildBar() {
    const list = sections();
    const signature = JSON.stringify(list.map(section => [section.id, section.title, section.estimatedMinutes]));
    if (signature === sectionsShown) return;
    sectionsShown = signature;
    segments = list.map(section => {
      const root = el("div", "section-segment");
      root.dataset.section = section.id;
      const title = el("span", "section-segment__title", section.title);
      const times = el("span", "section-segment__times");
      const remaining = el("span", "section-segment__remaining");
      const track = el("span", "ds-progress section-segment__track");
      track.setAttribute("role", "progressbar");
      track.setAttribute("aria-label", `${section.title} time used`);
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", "100");
      const fill = el("span", "ds-progress__fill");
      track.append(fill);
      root.title = `${section.title}: about ${section.estimatedMinutes} minutes planned`;
      root.append(title, times, remaining, track);
      return { section, root, times, remaining, track, fill };
    });
    const children = segments.map(segment => segment.root);
    if (isTeacher) {
      const next = el("button", "ds-btn ds-btn--ghost ds-btn--small section-bar__next", "Next section ▸");
      next.type = "button";
      next.addEventListener("click", () => {
        const ids = sections().map(section => section.id);
        const index = ids.indexOf(snapshot.clock.currentSection);
        const target = ids[(index + 1) % ids.length];
        if (index === ids.length - 1) return; // already on the last section
        perform("section", { section: target });
      });
      children.push(next);
    }
    bar.replaceChildren(...children);
  }

  function paintBar() {
    buildBar();
    const now = serverNow();
    const clock = snapshot.clock;
    for (const segment of segments) {
      const elapsed = sectionElapsedMs(clock, segment.section.id, now);
      const progress = sectionProgress(elapsed, segment.section.estimatedMinutes);
      const timesText = `${formatDuration(elapsed)} / ${formatDuration(segment.section.estimatedMinutes * 60000)}`;
      if (segment.times.textContent !== timesText) segment.times.textContent = timesText;
      const remainingText = progress.band === "ok" ? `${formatDuration(progress.remainingMs)} left` : `${formatDuration(elapsed - segment.section.estimatedMinutes * 60000)} over`;
      if (segment.remaining.textContent !== remainingText) segment.remaining.textContent = remainingText;
      const percent = Math.min(100, Math.round(progress.ratio * 100));
      segment.fill.style.width = `${percent}%`;
      segment.track.setAttribute("aria-valuenow", String(percent));
      segment.root.dataset.band = progress.band;
      segment.root.toggleAttribute("data-current", clock.currentSection === segment.section.id);
      if (clock.currentSection === segment.section.id) segment.root.setAttribute("aria-current", "step"); else segment.root.removeAttribute("aria-current");
    }
    bar.dataset.clockState = clock.state;
  }

  function paintSummary() {
    const clock = snapshot.clock;
    summary.hidden = clock.state !== "stopped";
    if (summary.hidden) return;
    const total = formatDuration(elapsedMs(clock, serverNow()));
    const rows = sections().map(section => {
      const actual = sectionElapsedMs(clock, section.id, serverNow());
      const row = el("li");
      row.textContent = `${section.title}: ${formatDuration(actual)} (planned ${formatDuration(section.estimatedMinutes * 60000)})`;
      return row;
    });
    const heading = el("h2", "", "Class finished");
    const totalLine = el("p", "class-summary__total", `Total class time: ${total}`);
    const list = el("ul", "class-summary__list");
    list.append(...rows);
    const score = options.getScore ? options.getScore() : null;
    const children = [heading, totalLine, list];
    if (score !== null && score !== undefined) children.push(el("p", "", `Score so far: ${score}`));
    summary.replaceChildren(...children);
  }

  // ---- teacher panel -------------------------------------------------------------------------------
  let controls = null;
  let panel = null;
  if (isTeacher) {
    panel = el("aside", "ds-card clock-panel");
    panel.setAttribute("aria-label", "Lesson clock controls");
    const title = el("h2", "clock-panel__title");
    const toggle = el("button", "clock-panel__toggle", "Lesson clock");
    toggle.type = "button";
    title.append(toggle);
    const body = el("div");
    body.id = "clockPanelBody";
    toggle.setAttribute("aria-controls", body.id);
    // Open by default on wide screens; collapsed on phones so it never covers the lesson.
    const startOpen = window.matchMedia ? !window.matchMedia("(max-width: 700px)").matches : true;
    const setOpen = open => { body.hidden = !open; toggle.setAttribute("aria-expanded", String(open)); toggle.textContent = open ? "Lesson clock \u25BE" : "Lesson clock \u25B8"; };
    toggle.addEventListener("click", () => setOpen(body.hidden));
    setOpen(startOpen);
    panel.append(title, body);
    document.body.append(panel);
    controls = createClockControls({
      container: body,
      sections: sections(),
      getSnapshot: () => snapshot,
      run: (action, extra) => perform(action, extra)
    });
  }

  async function perform(action, extra = {}) {
    const context = options.getContext();
    if (!context || !context.code) return { ok: false, reason: "aborted" };
    return runClockAction({ db, auth, code: context.code, lessonId: context.lessonId, action, offset: snapshot.offset, clock: snapshot.clock, ...extra });
  }

  function paintWarnings() {
    if (!controls) return;
    controls.setWarnings(clockWarnings(snapshot.clock, serverNow(), lastStudentActivity));
  }

  function paintAll() {
    paintBar();
    paintSummary();
    if (controls) { controls.render(); paintWarnings(); }
    if (options.onChange) options.onChange(snapshot);
  }

  // Re-subscribe when the lesson (or student) changes, e.g. the sidebar switches lessons.
  function ensureSubscription() {
    const context = options.getContext();
    const key = context && context.code ? `${context.code}/${context.lessonId}` : "";
    if (key === activeKey) return;
    unsubscribe();
    stopActivity();
    activeKey = key;
    snapshot = { clock: emptyClock(), offset: snapshot.offset, connected: true };
    view.update(snapshot);
    paintAll();
    if (!key) return;
    unsubscribe = subscribeClock(db, context.code, context.lessonId, next => {
      snapshot = next;
      view.update(snapshot);
      paintAll();
    });
    if (isTeacher) {
      activityRef = db.ref(`sessionSummary/${context.code}/lastUpdate`);
      const handler = value => { lastStudentActivity = Number(value.val()) || 0; paintWarnings(); };
      activityRef.on("value", handler);
      stopActivity = () => activityRef.off("value", handler);
    }
  }

  let frame = 0;
  function loop() {
    ensureSubscription();
    paintBar();
    if (controls) paintWarnings();
    frame = setTimeout(loop, 250);
  }
  view.start();
  loop();

  return {
    // whole seconds on the lesson clock; used for the "elapsed" value in the state/summary writes
    elapsedSeconds() { return Math.max(0, Math.floor(elapsedMs(snapshot.clock, serverNow()) / 1000)); },
    snapshot() { return snapshot; },
    refreshSections() { sectionsShown = ""; if (controls) controls.setSections(sections()); paintAll(); },
    destroy() { clearTimeout(frame); view.stop(); unsubscribe(); stopActivity(); if (panel) panel.remove(); }
  };
}
