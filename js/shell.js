// Shared app-shell behaviour for the student pages: mobile tab bar, offline banner and a friendly
// error page with a retry button and a short diagnostic code the student can read to the teacher.

const TABS = [
  { id: "home", label: "Home", icon: "\u{1F3E0}", href: "portal.html" },
  { id: "lesson", label: "Lesson", icon: "\u{1F4D8}", href: "portal.html#lessonsScreen" },
  { id: "practice", label: "Practice", icon: "\u{1F3AE}", href: "practice.html" },
  { id: "clips", label: "Clips", icon: "\u{1F3AC}", href: "clips.html" },
  { id: "homework", label: "Homework", icon: "\u{1F4CC}", href: "portal.html#lessonsScreen" },
  { id: "me", label: "Me", icon: "\u{1F9D1}", href: "portal.html#studentSummary" }
];

// Same small hash for the same message, so a student and the teacher see the same code.
export function diagnosticCode(error) {
  const text = String((error && (error.code || error.message)) || error || "unknown");
  let hash = 5381;
  for (let index = 0; index < text.length; index++) hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
  return `E-${hash.toString(36).toUpperCase().padStart(6, "0").slice(0, 6)}`;
}

export function mountBottomNav(current, { manga = false } = {}) {
  if (document.querySelector(".ds-bottom-nav")) return;
  const nav = document.createElement("nav");
  nav.className = "ds-bottom-nav";
  nav.setAttribute("aria-label", "Student navigation");
  const tabs = manga ? [...TABS.slice(0, 4), { id: "manga", label: "Manga", icon: "\u{1F4D6}", href: "manga.html" }, ...TABS.slice(4)] : TABS;
  for (const tab of tabs) {
    const link = document.createElement("a");
    link.href = tab.href;
    if (tab.id === current) link.setAttribute("aria-current", "page");
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = tab.icon;
    const label = document.createElement("span");
    label.textContent = tab.label;
    link.append(icon, label);
    nav.append(link);
  }
  document.body.append(nav);
  document.body.classList.add("has-bottom-nav");
}

export function mountOfflineBanner() {
  if (document.getElementById("offlineBanner")) return;
  const banner = document.createElement("div");
  banner.id = "offlineBanner";
  banner.className = "ds-banner ds-banner--warning ds-offline-banner";
  banner.setAttribute("role", "status");
  banner.hidden = navigator.onLine !== false;
  const icon = document.createElement("span");
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "!";
  const text = document.createElement("p");
  text.textContent = "You are offline. Your answers are kept on this device and will be saved when you are back online.";
  banner.append(icon, text);
  document.body.prepend(banner);
  window.addEventListener("online", () => { banner.hidden = true; });
  window.addEventListener("offline", () => { banner.hidden = false; });
}

// Replaces `target` with an error card: friendly message, retry, and a diagnostic code.
export function showErrorPage(target, error, { title = "Something went wrong" } = {}) {
  const code = diagnosticCode(error);
  const card = document.createElement("section");
  card.className = "ds-card ds-error-page";
  card.setAttribute("role", "alert");
  const heading = document.createElement("h2");
  heading.textContent = title;
  const message = document.createElement("p");
  message.textContent = "We could not open this page. Check your connection and try again. If it keeps happening, tell your teacher the code below.";
  const detail = document.createElement("p");
  detail.className = "ds-field__hint";
  detail.textContent = `Diagnostic code: ${code}`;
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "ds-btn ds-btn--primary";
  retry.textContent = "Try again";
  retry.addEventListener("click", () => window.location.reload());
  const technical = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "Technical details";
  const raw = document.createElement("pre");
  raw.className = "ds-error-page__raw";
  raw.textContent = String((error && error.message) || error || "Unknown error").slice(0, 400);
  technical.append(summary, raw);
  card.append(heading, message, detail, retry, technical);
  target.replaceChildren(card);
  return code;
}

// A few skeleton blocks shown while a page loads; replaced by the real content.
export function showSkeleton(target, rows = 4) {
  const wrapper = document.createElement("div");
  wrapper.className = "ds-skeleton-stack";
  wrapper.setAttribute("aria-busy", "true");
  wrapper.setAttribute("aria-label", "Loading");
  for (let index = 0; index < rows; index++) {
    const row = document.createElement("div");
    row.className = "ds-skeleton ds-skeleton-row";
    wrapper.append(row);
  }
  target.replaceChildren(wrapper);
}
