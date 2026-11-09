// Teacher dashboard card "Student data and privacy": download everything held for the selected student, or erase it.
// DOM APIs and textContent only. The erase button stays disabled until the student's code is typed.
import { buildExport, confirmationMatches, eraseAll, exportFileName, readAll } from "./student-data.js";

const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };

export function renderPrivacyCard(host, { db, code, name, whenErased }) {
  host.replaceChildren();
  const status = el("p", "", "hint"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  const exportButton = el("button", "Download all data (JSON)", "btn small"); exportButton.type = "button";
  exportButton.addEventListener("click", async () => {
    exportButton.disabled = true; status.textContent = "Collecting…";
    try {
      const { results } = await readAll(db, code); const file = buildExport(code, results);
      const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }); const link = document.createElement("a");
      link.href = URL.createObjectURL(blob); link.download = exportFileName(code); document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      status.textContent = `Downloaded ${Object.keys(file.data).length} kinds of data for ${name || code}.`;
    } catch (error) { status.textContent = `Could not export: ${error.message}`; } finally { exportButton.disabled = false; }
  });
  const label = el("label", `Type the code ${code} to enable deleting `); const input = el("input"); input.type = "text"; input.autocomplete = "off"; input.id = "eraseConfirm"; label.setAttribute("for", input.id);
  const erase = el("button", "Delete all data for this student", "btn small danger"); erase.type = "button"; erase.disabled = true;
  input.addEventListener("input", () => { erase.disabled = !confirmationMatches(input.value, code); });
  erase.addEventListener("click", async () => {
    erase.disabled = true; status.textContent = "Deleting…";
    try {
      const result = await eraseAll(db, code, input.value);
      status.textContent = `Deleted ${result.removed.length} item${result.removed.length === 1 ? "" : "s"}.${result.kept.length ? ` Left in place: ${result.kept.map(item => item.path).join(", ")} (${result.kept[0].reason})` : ""} This cannot be undone.`;
      if (whenErased) whenErased(result);
    } catch (error) { status.textContent = `Could not delete: ${error.message}`; erase.disabled = !confirmationMatches(input.value, code); }
  });
  host.append(el("p", "Download a copy of everything the portal holds for this student, or delete it all (for example when a student leaves). Deleting cannot be undone, so download a copy first if you may need it.", "hint"), exportButton, el("br"), label, input, erase, status);
}
