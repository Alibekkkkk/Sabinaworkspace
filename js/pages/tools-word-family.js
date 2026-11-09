// Word family helper on tools/import-content.html: suggests candidate forms, the teacher ticks the real ones,
// writes an example for each and copies the generated `forms` block. Nothing is saved automatically.
import { FORM_KEYS, suggestForms, validateForms } from "../word-family.js";

const input = document.getElementById("wordFamilyInput");
const list = document.getElementById("wordFamilyList");
const status = document.getElementById("wordFamilyStatus");
const output = document.getElementById("wordFamilyOutput");
const build = document.getElementById("wordFamilyBuild");
let headword = "";

function row(candidate, index) {
  const item = document.createElement("li");
  const box = document.createElement("input");
  box.type = "checkbox"; box.id = `wf-pick-${index}`; box.dataset.pos = candidate.pos; box.dataset.word = candidate.w;
  const label = document.createElement("label");
  label.htmlFor = box.id;
  label.textContent = `${candidate.w} (${candidate.pos}${candidate.note ? `, ${candidate.note}` : ""}) `;
  const example = document.createElement("input");
  example.type = "text"; example.maxLength = 200; example.placeholder = "Example sentence"; example.dataset.example = "1";
  example.setAttribute("aria-label", `Example sentence for ${candidate.w}`);
  item.append(box, label, example);
  return item;
}

document.getElementById("wordFamilySuggest").addEventListener("click", () => {
  headword = input.value.trim().toLowerCase();
  const candidates = suggestForms(headword);
  list.replaceChildren(...candidates.map(row));
  build.disabled = !candidates.length;
  output.value = "";
  status.textContent = candidates.length ? `${candidates.length} possible forms for "${headword}". Tick only the real ones.` : "Enter a single English word.";
});

build.addEventListener("click", () => {
  const forms = { status: "draft" };
  const used = new Set();
  for (const box of list.querySelectorAll("input[type=checkbox]:checked")) {
    const example = box.parentElement.querySelector("input[data-example]").value.trim();
    const key = FORM_KEYS.includes(box.dataset.pos) && !used.has(box.dataset.pos) ? box.dataset.pos : "other";
    if (key === "other" && forms.other) continue;
    used.add(key);
    forms[key] = key === "other" ? { label: box.dataset.pos, w: box.dataset.word, ex: example } : { w: box.dataset.word, ex: example };
  }
  const problems = validateForms({ en: headword, forms }, "forms").errors;
  output.value = JSON.stringify({ forms }, null, 2);
  status.textContent = problems.length ? `Fix before use: ${problems.join(" ")}` : "Looks valid. Review it, then paste it into the word in the lesson file. It stays a draft until you set status to approved.";
});
