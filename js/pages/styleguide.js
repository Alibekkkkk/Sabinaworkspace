// Renders the specimen template into the light and dark panels and wires the few interactive demos.
const specimen = document.getElementById("specimen");
for (const panel of [document.getElementById("panelLight"), document.getElementById("panelDark")]) {
  panel.append(specimen.content.cloneNode(true));
}

const modal = document.getElementById("sgModal");
const sheet = document.getElementById("sgSheet");
const toast = document.getElementById("sgToast");
let toastTimer = 0;

document.addEventListener("click", event => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  if (target.closest(".js-open-modal")) modal.hidden = false;
  else if (target.closest(".js-open-sheet")) sheet.hidden = false;
  else if (target.closest(".js-close") || target === modal || target === sheet) { modal.hidden = true; sheet.hidden = true; }
  else if (target.closest(".js-show-toast")) {
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2400);
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") { modal.hidden = true; sheet.hidden = true; }
});

// Tabs and segmented controls: demonstrate the selected state only.
document.addEventListener("click", event => {
  const tab = event.target instanceof Element ? event.target.closest('[role="tab"]') : null;
  if (tab) {
    for (const sibling of tab.parentElement.querySelectorAll('[role="tab"]')) sibling.setAttribute("aria-selected", String(sibling === tab));
    return;
  }
  const segment = event.target instanceof Element ? event.target.closest(".ds-segmented > button") : null;
  if (segment) for (const sibling of segment.parentElement.children) sibling.setAttribute("aria-pressed", String(sibling === segment));
});
