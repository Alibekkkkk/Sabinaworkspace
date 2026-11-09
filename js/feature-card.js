// Teacher dashboard panel "Feature flags": one switch per feature for the selected student. DOM APIs and textContent only.
// onChange(name, value) is called with true or false, or null to go back to the default.
import { describeFlags } from "./features.js";

function el(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }

const SOURCE = { teacher: "set by you", lesson: "from the lesson", default: "default" };

export function renderFeatureCard(host, { flags, lessonFeatures, onChange }) {
  const rows = describeFlags(flags, lessonFeatures);
  host.replaceChildren();
  const list = el("ul", "", "feature-list");
  for (const row of rows) {
    const item = el("li", "", "feature-row");
    const label = el("label", "", "feature-switch");
    const box = el("input"); box.type = "checkbox"; box.checked = row.enabled; box.dataset.feature = row.name;
    box.addEventListener("change", () => { box.disabled = true; Promise.resolve(onChange(row.name, box.checked)).catch(error => { box.checked = !box.checked; status.textContent = `Could not change ${row.label}: ${error.message}`; }).finally(() => { box.disabled = false; }); });
    label.append(box, el("span", row.label, "feature-name"));
    item.append(label, el("span", `${row.enabled ? "On" : "Off"} (${SOURCE[row.source]})`, "feature-source"), el("span", row.description, "feature-hint"));
    if (row.source === "teacher") {
      const reset = el("button", "Use default", "btn small"); reset.type = "button"; reset.setAttribute("aria-label", `Use the default for ${row.label}`);
      reset.addEventListener("click", () => { reset.disabled = true; Promise.resolve(onChange(row.name, null)).catch(error => { status.textContent = `Could not reset ${row.label}: ${error.message}`; reset.disabled = false; }); });
      item.append(reset);
    }
    list.append(item);
  }
  const status = el("p", "", "hint"); status.setAttribute("aria-live", "polite");
  host.append(list, status);
  return rows;
}
