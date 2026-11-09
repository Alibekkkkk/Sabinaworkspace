// The student's Clips page: every clip assigned through a lesson, with level, kind and grammar filters, due dates from the
// schedule, and the stars earned. Clip details come from the protected clip record, so a locked clip shows only its title.
import { firebaseConfig } from "../config.js";
import { bindStudentCode } from "../student-context.js";
import { loadProtectedContent } from "../protected-content.js";
import { validateClip } from "../clips/schema.js";
import { migrateV1 } from "../clips/schema-v2.js";
import { buildEntries, clipSummary, comingUp, describe, facets, filterEntries, sortEntries, starsText } from "../clips/catalog.js";
import { localZone } from "../schedule.js";
import { mountBottomNav, mountOfflineBanner, showErrorPage, watchConnection } from "../shell.js";
import { featureEnabled, revealMangaTab, showNotEnabled } from "../feature-gate.js";

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
mountOfflineBanner(); mountBottomNav("clips");

let lessons = {}; let details = {}; let progress = {}; let code = ""; let entries = [];
const filters = { level: "", genre: "", grammar: "", status: "all" };

function rememberedCode() {
  const remember = localStorage.getItem("nd_remember_student") === "true";
  const storage = remember ? localStorage : sessionStorage;
  return String(params.get("code") || storage.getItem("nd_student_code") || "").trim().toUpperCase();
}

function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }

function card(entry, heading) {
  const item = el("li", entry.available ? "cl-card" : "cl-card cl-card--locked");
  const title = el(heading, "", entry.title); title.id = `cl-${entry.lessonId}`;
  item.setAttribute("aria-labelledby", title.id);
  const badges = el("div", "cl-badges");
  if (entry.due.label) badges.append(el("span", `cl-badge${["overdue", "due-today", "due-soon"].includes(entry.due.state) ? " cl-badge--due" : ""}`, entry.due.label));
  if (entry.done) badges.append(el("span", "cl-badge cl-badge--done", `Done ${starsText(entry.stars)} (${entry.stars} of 3 stars)`));
  if (entry.detail && !entry.detail.interactive) badges.append(el("span", "cl-badge", "Text and activities"));
  item.append(title, el("p", "cl-meta", describe(entry)), badges);
  if (entry.available) {
    const link = el("a", "ds-btn ds-btn--primary", entry.done ? "Watch again" : "Start the clip");
    link.href = `clip.html?code=${encodeURIComponent(code)}&lesson=${encodeURIComponent(entry.lessonId)}`;
    link.setAttribute("aria-label", `${entry.done ? "Watch again" : "Start the clip"}: ${entry.title}`);
    item.append(link);
  }
  return item;
}

function paintFacets() {
  const found = facets(entries);
  const fill = (select, values, all) => { const keep = select.value; select.replaceChildren(new Option(all, "")); for (const value of values) select.append(new Option(value, value)); select.value = values.includes(keep) ? keep : ""; };
  fill($("fLevel"), found.levels, "All levels"); fill($("fGenre"), found.genres, "All kinds"); fill($("fGrammar"), found.grammar, "All grammar");
  filters.level = $("fLevel").value; filters.genre = $("fGenre").value; filters.grammar = $("fGrammar").value;
}

function paint() {
  entries = buildEntries(lessons, details, progress, Date.now(), localZone());
  paintFacets();
  const shown = sortEntries(filterEntries(entries, filters));
  const list = $("clList"); list.replaceChildren(...shown.map(entry => card(entry, "h2")));
  const available = entries.filter(entry => entry.available).length;
  $("clFilters").hidden = available === 0;
  $("clCount").textContent = available === 0 ? "" : `Showing ${shown.length} of ${available} clip${available === 1 ? "" : "s"}.`;
  if (available === 0 && !comingUp(entries).length) { $("status").hidden = false; $("status").textContent = "No clips are assigned to you yet. Your teacher will add them to your lessons."; }
  else if (available > 0 && shown.length === 0) { $("status").hidden = false; $("status").textContent = "No clips match these filters. Try choosing All."; }
  else $("status").hidden = true;
  const soon = comingUp(entries); $("clSoon").hidden = soon.length === 0; $("clSoonList").replaceChildren(...soon.map(entry => card(entry, "h3")));
}

async function loadDetails(db) {
  const wanted = Object.entries(lessons).filter(([, lesson]) => lesson && lesson.clipId && lesson.published !== false && (!lesson.availableFrom || Date.now() >= lesson.availableFrom));
  await Promise.all(wanted.map(async ([lessonId, lesson]) => {
    if (details[lesson.clipId]) return;
    try {
      const record = await loadProtectedContent(db, lessonId, "clip");
      let clip = validateClip(record.content); if (clip.schemaVersion === 1) clip = migrateV1(clip);
      details[lesson.clipId] = clipSummary(clip);
    } catch (error) { console.warn(`Clip details for ${lessonId} are not available`, error.message); }
  }));
}

async function start() {
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const db = firebase.database(); watchConnection(db);
  const bound = await bindStudentCode({ auth: firebase.auth(), db, code: rememberedCode() });
  code = bound.code;
  $("backLink").href = `portal.html?code=${encodeURIComponent(code)}`;
  revealMangaTab(db, code);
  if (!(await featureEnabled(db, code, "clipLab"))) { for (const id of ["clFilters", "clList", "clSoon"]) $(id).hidden = true; showNotEnabled($("status"), "clipLab", { backHref: $("backLink").href }); return; }
  db.ref(`studentCurriculum/${code}`).on("value", async snapshot => { lessons = snapshot.val() || {}; await loadDetails(db); paint(); }, error => showErrorPage($("status"), error, { title: "Your clips could not load" }));
  db.ref(`studentProgress/${code}/clips`).on("value", snapshot => { progress = snapshot.val() || {}; paint(); });
  for (const [id, key] of [["fLevel", "level"], ["fGenre", "genre"], ["fGrammar", "grammar"]]) $(id).addEventListener("change", () => { filters[key] = $(id).value; paint(); });
  document.querySelectorAll('input[name="fStatus"]').forEach(radio => radio.addEventListener("change", () => { filters.status = radio.value; paint(); }));
}

start().catch(error => showErrorPage($("status"), error, { title: "Your clips could not load" }));
