// Teacher dashboard card "Clip Lab": the clips assigned to the selected student with completion, stars, time on the clip,
// the transcript lines they struggled with and the words they saved. DOM APIs and textContent only.
import { teacherRows, starsText } from "./catalog.js";
import { localZone } from "../schedule.js";

function el(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }

export function renderClipCard(host, { lessons, progress, loadLines }) {
  const rows = teacherRows(lessons, (progress && progress.clips) || {}, progress && progress.vocabulary, Date.now(), localZone());
  host.replaceChildren();
  if (!rows.length) { host.append(el("p", "No clips are assigned to this student. Add a clipFile and clipId to their lesson in the manifest.")); return rows; }
  const done = rows.filter(row => row.done).length;
  host.append(el("p", `${done} of ${rows.length} clip${rows.length === 1 ? "" : "s"} finished.`));
  const list = el("ul", "", "clip-teacher-list");
  for (const row of rows) {
    const item = el("li");
    item.append(el("strong", row.title), el("span", ` · ${row.done ? `${starsText(row.stars)} ${row.score} of ${row.total}` : row.status === "locked" ? "locked" : "not finished"}${row.due ? ` · ${row.due}` : ""}${row.attempts ? ` · ${row.attempts} attempt${row.attempts === 1 ? "" : "s"}` : ""}${row.minutes ? ` · ${row.minutes} min on the clip` : ""}${row.words ? ` · ${row.words} word${row.words === 1 ? "" : "s"} saved` : ""}`));
    if (row.weakLines.length) {
      const weak = el("p", "Lines they found hard: loading…", "clip-teacher-weak"); item.append(weak);
      if (loadLines) loadLines(row.lessonId, row.weakLines).then(texts => { weak.textContent = texts.length ? `Lines they found hard: ${texts.map(text => `“${text}”`).join(" ")}` : `Lines they found hard: ${row.weakLines.join(", ")}`; }).catch(() => { weak.textContent = `Lines they found hard: ${row.weakLines.join(", ")}`; });
    }
    list.append(item);
  }
  host.append(list);
  return rows;
}
