// Teacher controls for the lesson clock, used on the dashboard and as a floating panel on the lesson page.
// Everything renders from the latest listener snapshot; a button press only asks for a transition.
import { canTransition, elapsedMs, formatDuration, serverNowFrom } from "./lesson-clock.js";

const REASONS = {
  conflict: "Someone else just changed the clock. It has been refreshed; try again.",
  illegal: "That is not possible in the clock's current state.",
  "invalid-section": "Choose one of the lesson sections.",
  unchanged: "That section is already active.",
  "not-signed-in": "Sign in again to control the clock.",
  aborted: "The clock could not be changed. Check your connection and try again."
};

export function describeResult(result) {
  return result && result.ok ? "" : REASONS[result && result.reason] || REASONS.aborted;
}

function button(label, action, className = "ds-btn ds-btn--secondary ds-btn--small") {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.dataset.clockAction = action;
  element.textContent = label;
  return element;
}

// sections: [{ id, title }]. run(action, options) must resolve { ok, reason? }.
export function createClockControls({ container, sections, run, getSnapshot, onMessage }) {
  container.classList.add("clock-controls");
  const row = document.createElement("div");
  row.className = "clock-controls__row";
  const start = button("Start", "start", "ds-btn ds-btn--primary ds-btn--small");
  const pause = button("Pause", "pause");
  const resume = button("Resume", "resume", "ds-btn ds-btn--primary ds-btn--small");
  const stop = button("Stop…", "stop", "ds-btn ds-btn--danger ds-btn--small");
  row.append(start, pause, resume, stop);

  const sectionRow = document.createElement("div");
  sectionRow.className = "clock-controls__row";
  const sectionLabel = document.createElement("label");
  sectionLabel.className = "ds-field__label";
  sectionLabel.textContent = "Section";
  const sectionSelect = document.createElement("select");
  sectionSelect.className = "ds-select";
  sectionSelect.setAttribute("aria-label", "Current section");
  for (const section of sections) sectionSelect.add(new Option(section.title, section.id));
  const switchButton = button("Switch section", "section");
  sectionRow.append(sectionLabel, sectionSelect, switchButton);

  const adjust = document.createElement("details");
  adjust.className = "clock-controls__adjust";
  const summary = document.createElement("summary");
  summary.textContent = "Adjust time…";
  const sign = document.createElement("select");
  sign.className = "ds-select";
  sign.setAttribute("aria-label", "Add or remove time");
  sign.add(new Option("Add", "1"));
  sign.add(new Option("Remove", "-1"));
  const minutes = document.createElement("input");
  minutes.type = "number";
  minutes.min = "1";
  minutes.max = "240";
  minutes.value = "1";
  minutes.className = "ds-input";
  minutes.setAttribute("aria-label", "Minutes");
  const reason = document.createElement("input");
  reason.type = "text";
  reason.maxLength = 200;
  reason.placeholder = "Reason (required, saved in the log)";
  reason.className = "ds-input";
  reason.setAttribute("aria-label", "Reason for the adjustment");
  const apply = button("Apply", "adjust");
  adjust.append(summary, sign, minutes, reason, apply);

  const warning = document.createElement("div");
  warning.className = "clock-controls__warnings";
  warning.setAttribute("role", "status");
  const message = document.createElement("p");
  message.className = "ds-field__hint";
  message.setAttribute("role", "status");
  container.append(row, sectionRow, adjust, warning, message);

  function say(text) { message.textContent = text; if (onMessage) onMessage(text); }

  async function perform(action, options = {}) {
    const snapshot = getSnapshot();
    const buttons = container.querySelectorAll("button");
    buttons.forEach(item => { item.disabled = true; });
    try {
      const result = await run(action, { expectedRev: snapshot.clock.rev, ...options });
      say(describeResult(result));
    } catch (error) {
      console.error("Lesson clock action failed", error);
      say(`The clock could not be changed (${error && error.message ? error.message : "unknown error"}).`);
    } finally {
      render();
    }
  }

  container.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target.closest("button[data-clock-action]") : null;
    if (!target || target.disabled) return;
    const action = target.dataset.clockAction;
    const snapshot = getSnapshot();
    if (action === "stop") {
      const total = formatDuration(elapsedMs(snapshot.clock, serverNowFrom(Date.now(), snapshot.offset)));
      if (!confirm(`Stop and save ${total}?`)) return;
      perform("stop");
    } else if (action === "section") {
      perform("section", { section: sectionSelect.value });
    } else if (action === "adjust") {
      const delta = Number(sign.value) * Math.round(Number(minutes.value)) * 60000;
      if (!reason.value.trim()) { say("Please give a reason for the adjustment."); reason.focus(); return; }
      if (!Number.isFinite(delta) || delta === 0) { say("Enter a number of minutes."); return; }
      perform("adjust", { deltaMs: delta, note: reason.value.trim() }).then(() => { reason.value = ""; adjust.open = false; });
    } else {
      perform(action);
    }
  });

  function render() {
    const snapshot = getSnapshot();
    const state = snapshot.clock.state;
    start.disabled = !canTransition(state, "start");
    pause.disabled = !canTransition(state, "pause");
    resume.disabled = !canTransition(state, "resume");
    stop.disabled = !canTransition(state, "stop");
    switchButton.disabled = state === "stopped";
    sectionSelect.disabled = state === "stopped";
    apply.disabled = state === "idle";
    adjust.hidden = state === "idle";
    if (document.activeElement !== sectionSelect && sections.some(section => section.id === snapshot.clock.currentSection)) sectionSelect.value = snapshot.clock.currentSection;
  }

  function setSections(list) {
    const selected = sectionSelect.value;
    sectionSelect.replaceChildren(...list.map(section => new Option(section.title, section.id)));
    if (list.some(section => section.id === selected)) sectionSelect.value = selected;
  }

  return { render, setSections, setWarnings(items) { warning.replaceChildren(...items.map(item => { const line = document.createElement("p"); line.className = "ds-banner ds-banner--warning"; line.textContent = item.text; return line; })); } };
}
