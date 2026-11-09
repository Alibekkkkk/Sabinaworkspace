// Dashboard card "Games & mastery": accuracy by skill and topic, weakest items, time, streak, XP trend, badges,
// a CSV for the class and the words the whole class misses. DOM APIs and textContent only.
import { sparkline } from "../charts.js";
import { classMostMissed, masteryCsv, summarizeMastery } from "./mastery-summary.js";

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
const pct = value => `${Math.round(value * 100)}%`;

export function renderMasteryCard(host, progress, { loadClass } = {}) {
  const summary = summarizeMastery(progress);
  host.replaceChildren();
  if (!summary.games) { host.append(el("p", "No games played yet. This fills in after the student finishes a game in Practice.")); }
  else {
    host.append(el("p", `${summary.games} games · ${pct(summary.accuracy)} correct · ${Math.round(summary.seconds / 60)} min · level ${summary.level} (${summary.xp} XP) · streak ${summary.streak} day${summary.streak === 1 ? "" : "s"}${summary.freezes ? ` · ${summary.freezes} freeze${summary.freezes === 1 ? "" : "s"}` : ""} · ${summary.badges} of ${summary.badgeTotal} badges`));
    host.append(el("h3", "Points from games, last 7 days"));
    host.append(sparkline(summary.trend.map(day => day.score), { title: `Game points per day, oldest to newest: ${summary.trend.map(day => day.score).join(", ")}.` }));
    host.append(el("h3", "Accuracy by skill"));
    const skills = el("ul");
    for (const row of summary.skills) skills.append(el("li", `${row.skill}: ${pct(row.accuracy)} over ${row.games} game${row.games === 1 ? "" : "s"}, ${Math.round(row.seconds / 60)} min`));
    host.append(skills);
    if (summary.topics.length) {
      host.append(el("h3", "Weakest topics"));
      const topics = el("ul");
      for (const row of summary.topics.slice(0, 5)) topics.append(el("li", `${row.label}: ${pct(row.accuracy)} (${row.total} answers)`));
      host.append(topics);
    }
    host.append(el("h3", "Items missed most often"));
    if (!summary.weakest.length) host.append(el("p", "Nothing in the review queue."));
    else { const items = el("ol"); for (const row of summary.weakest) items.append(el("li", `${row.prompt} → ${row.answer} · missed ${row.misses} time${row.misses === 1 ? "" : "s"}`)); host.append(items); }
  }
  if (loadClass) {
    const out = el("div", undefined, "mastery-class");
    const button = el("button", "Show class view and download CSV", "ds-btn ds-btn--secondary ds-btn--small"); button.type = "button";
    button.addEventListener("click", async () => {
      button.disabled = true; button.textContent = "Loading the class…";
      try {
        const rows = (await loadClass()).map(row => ({ ...row, summary: summarizeMastery(row.progress) }));
        out.replaceChildren(el("h3", "Most missed across the class"));
        const missed = classMostMissed(rows.map(row => row.progress));
        if (!missed.length) out.append(el("p", "No shared mistakes yet."));
        else { const list = el("ol"); for (const row of missed) list.append(el("li", `${row.prompt} → ${row.answer} · ${row.students} student${row.students === 1 ? "" : "s"}, ${row.misses} misses`)); out.append(list); }
        const link = el("a", "Download class CSV", "ds-btn ds-btn--secondary ds-btn--small");
        link.href = URL.createObjectURL(new Blob([masteryCsv(rows)], { type: "text/csv;charset=utf-8" })); link.download = `games-mastery-${new Date().toISOString().slice(0, 10)}.csv`;
        out.append(link);
      } catch (error) { out.replaceChildren(el("p", `The class view could not be loaded: ${error.message}`)); }
      button.disabled = false; button.textContent = "Refresh class view";
    });
    host.append(button, out);
  }
  return summary;
}
