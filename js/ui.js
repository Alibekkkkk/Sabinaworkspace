// Shared UI helpers.

const TOAST_STYLE = "position:fixed;bottom:30px;left:50%;transform:translateX(-50%);" +
  "background:var(--primary-dark,var(--accent,#1f3a6e));color:#fff;padding:14px 24px;border-radius:12px;" +
  "font-size:16px;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,.3);z-index:9999;" +
  "max-width:90vw;text-align:center;transition:opacity .3s";
const TOAST_MS = 2400;
let hideTimer = 0;

// One polite live region per page; screen readers announce the message without moving focus.
export function showToast(text) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    toast.style.cssText = TOAST_STYLE;
    toast.style.opacity = "0";
    toast.dataset.managed = "true"; // page has no .toast CSS, so fade it with inline opacity
    document.body.append(toast);
  }
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.textContent = String(text);
  toast.classList.add("show");
  if (toast.dataset.managed) toast.style.opacity = "1";
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    toast.classList.remove("show");
    if (toast.dataset.managed) toast.style.opacity = "0";
  }, TOAST_MS);
}
