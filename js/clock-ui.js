// Clock display shared by the lesson header and the dashboard: a role="timer" value that ticks at 4 Hz
// without being announced, a state chip that IS announced politely, and a small offline hint.
import { elapsedMs, formatDuration, serverNowFrom, STATE_LABELS } from "./lesson-clock.js";

const TICK_MS = 250;

export function createClockView({ valueEl, chipEl, hintEl, container }) {
  let snapshot = { clock: null, offset: 0, connected: true };
  let lastText = "";
  let lastState = "";
  let timer = 0;

  valueEl.setAttribute("role", "timer");
  valueEl.setAttribute("aria-live", "off");
  chipEl.setAttribute("role", "status");
  chipEl.setAttribute("aria-live", "polite");

  function paint() {
    if (!snapshot.clock) return;
    const now = serverNowFrom(Date.now(), snapshot.offset);
    const text = formatDuration(elapsedMs(snapshot.clock, now));
    if (text !== lastText) { valueEl.textContent = text; lastText = text; }
    if (snapshot.clock.state !== lastState) {
      lastState = snapshot.clock.state;
      chipEl.textContent = STATE_LABELS[lastState];
      chipEl.dataset.state = lastState;
      if (container) container.dataset.clockState = lastState;
    }
    if (hintEl) hintEl.hidden = snapshot.connected;
  }

  function tick() {
    paint();
    timer = setTimeout(tick, TICK_MS);
  }

  return {
    update(next) { snapshot = next; paint(); },
    start() { if (!timer) tick(); },
    stop() { clearTimeout(timer); timer = 0; },
    // exposed for tests
    text() { return valueEl.textContent; }
  };
}
