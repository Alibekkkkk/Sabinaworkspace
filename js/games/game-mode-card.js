// Teacher control on the dashboard: how much game framing this student's copy of a lesson gets (full, light or off).
// Saved on the student's assignment record, so a re-import of lesson content never overwrites it.
import { DEFAULT_MODE, GAME_MODES } from "./game-mode.js";

const LABELS = {
  full: ["Full game mode", "Missions, card map, XP, plus Error Hunt on reading and grammar stages and the final test as a Boss Battle (same questions, time limit and one attempt)."],
  light: ["Light (default)", "Missions, card map, XP and celebrations. The stages look and work exactly as before."],
  off: ["Off: classic lesson", "Nothing added. Use this for a quiet, traditional lesson."]
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountGameModeCard({ db, host, showToast = () => {} }) {
  const select = el("select", "ds-select"); select.setAttribute("aria-label", "Lesson for game mode");
  const label = el("label", "ds-field__label", "Lesson");
  const group = el("fieldset", "gm-modes"); group.append(el("legend", "", "Game mode for this student"));
  const radios = new Map();
  for (const mode of GAME_MODES) {
    const row = el("label", "gm-check"); const radio = el("input"); radio.type = "radio"; radio.name = "gameMode"; radio.value = mode;
    const text = el("span"); text.append(el("strong", "", LABELS[mode][0]), el("br"), el("small", "", LABELS[mode][1]));
    row.append(radio, text); group.append(row); radios.set(mode, radio);
    radio.addEventListener("change", async () => {
      if (!code || !select.value) return;
      try { await db.ref(`studentCurriculum/${code}/${select.value}/gameMode`).set(mode); showToast(`${LABELS[mode][0]} saved for ${code}`); }
      catch (error) { showToast(`Could not save: ${error.message}`); await load(); }
    });
  }
  host.replaceChildren(label, select, group);
  let code = ""; let lessons = [];

  async function load() {
    for (const radio of radios.values()) radio.disabled = true;
    if (!code || !select.value) return;
    let value = DEFAULT_MODE;
    try { const snapshot = await db.ref(`studentCurriculum/${code}/${select.value}/gameMode`).once("value"); if (GAME_MODES.includes(snapshot.val())) value = snapshot.val(); } catch (error) { /* shows the default */ }
    for (const [mode, radio] of radios) { radio.checked = mode === value; radio.disabled = false; }
  }
  select.addEventListener("change", load);
  return {
    show(studentCode, lessonList) {
      code = studentCode; lessons = lessonList;
      const previous = select.value;
      select.replaceChildren(...lessons.map(lesson => new Option(lesson.title, lesson.id)));
      if (lessons.some(lesson => lesson.id === previous)) select.value = previous;
      return load();
    },
    hide() { code = ""; }
  };
}
