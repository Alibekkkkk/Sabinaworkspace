// Teacher dashboard card "Manga Reader": for the selected student, each chapter's pages read, time, words saved, quiz accuracy
// and written answers waiting for review, plus a small form to assign a chapter with a due date. DOM APIs and textContent only.
import { teacherRows } from "./shelf.js";
import { starsText } from "../clips/catalog.js";
import { localZone } from "../schedule.js";

const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };

// End of the chosen day in the teacher's own time zone, so "due Friday" means Friday night.
export function dueTimestamp(dateText) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateText || ""));
  if (!match) return null;
  const stamp = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 0).getTime();
  return Number.isFinite(stamp) ? stamp : null;
}

// story: the manga content (or null); progress: studentProgress/<code>; assignments: mangaAssignments/<code>/<mangaId>;
// reviewItems: sessions/<code>/reviewQueue values; actions: { assign(chapterId, dueAt|null), clear(chapterId) }
export function renderMangaCard(host, { story, progress, assignments, reviewItems, actions }) {
  host.replaceChildren();
  if (!story) { host.append(el("p", "No manga story is assigned to this student.")); return []; }
  const records = (progress && progress.manga && progress.manga[story.id]) || {};
  const rows = teacherRows(story, records, assignments || {}, reviewItems || [], Date.now(), localZone());
  const finished = rows.filter(row => row.state === "done").length;
  host.append(el("p", `${story.title} (${story.level}): ${finished} of ${rows.length} chapter${rows.length === 1 ? "" : "s"} finished.`));
  const waiting = rows.reduce((sum, row) => sum + row.awaitingReview, 0);
  if (waiting) host.append(el("p", `${waiting} written answer${waiting === 1 ? "" : "s"} waiting for you in the review queue.`, "manga-teacher-waiting"));
  const list = el("ul", "", "manga-teacher-list");
  for (const row of rows) {
    const item = el("li"); item.append(el("strong", row.title));
    const parts = [row.state === "done" ? `finished ${starsText(row.stars)}` : row.state === "reading" ? "reading" : "not started", `${row.pagesRead} of ${row.pages} pages`];
    if (row.minutes) parts.push(`${row.minutes} min`);
    if (row.words) parts.push(`${row.words} word${row.words === 1 ? "" : "s"} saved`);
    if (row.accuracy !== null) parts.push(`${row.accuracy}% of questions right`);
    if (row.bossWon) parts.push("boss defeated");
    if (row.awaitingReview) parts.push(`${row.awaitingReview} to review`);
    if (row.assigned) parts.push(row.due.label || "assigned");
    item.append(el("span", ` · ${parts.join(" · ")}`));
    if (row.assigned && actions) { const clear = el("button", "Remove assignment", "btn small"); clear.type = "button"; clear.setAttribute("aria-label", `Remove the assignment for ${row.title}`); clear.addEventListener("click", () => { clear.disabled = true; actions.clear(row.id).catch(error => { clear.disabled = false; message.textContent = `Could not remove it: ${error.message}`; }); }); item.append(document.createTextNode(" "), clear); }
    list.append(item);
  }
  host.append(list);
  const message = el("p", "", "hint"); message.setAttribute("aria-live", "polite");
  if (actions) {
    const form = el("form", "", "manga-assign");
    const chapter = el("select"); chapter.id = "mangaAssignChapter"; for (const row of rows) chapter.append(new Option(row.title, row.id));
    const chapterLabel = el("label", "Chapter "); chapterLabel.setAttribute("for", chapter.id);
    const due = el("input"); due.type = "date"; due.id = "mangaAssignDue";
    const dueLabel = el("label", "Due date (optional) "); dueLabel.setAttribute("for", due.id);
    const go = el("button", "Assign chapter", "btn small primary"); go.type = "submit";
    form.append(chapterLabel, chapter, dueLabel, due, go, message);
    form.addEventListener("submit", event => {
      event.preventDefault(); go.disabled = true;
      actions.assign(chapter.value, dueTimestamp(due.value)).then(() => { message.textContent = "Assigned."; }).catch(error => { message.textContent = `Could not assign: ${error.message}`; }).finally(() => { go.disabled = false; });
    });
    host.append(form);
  }
  return rows;
}
