// The site's theme, for every page: Lime Night (dark) by default, Lime Light when the person chooses it. One saved
// choice for the whole site ("ls-theme"); the older per-page choices are picked up once. Load this in <head>, before
// the stylesheets paint, so a page never flashes the wrong theme:  <script src="js/theme.js"></script>
// Any element with [data-theme-toggle] switches the theme; pages can also call window.LSTheme.toggle() / set() / get().
(() => {
  const KEY = "ls-theme";
  const OLDER_KEYS = ["learning-portal-theme", "nd_theme", "nd_lesson_theme", "nd_homework_theme_v2", "teacher_theme"];
  const valid = value => value === "light" || value === "dark";

  function saved() {
    try {
      const value = localStorage.getItem(KEY);
      if (valid(value)) return value;
      for (const key of OLDER_KEYS) {
        const older = localStorage.getItem(key);
        if (valid(older)) { localStorage.setItem(KEY, older); return older; }
      }
    } catch (error) { /* storage blocked: use the default */ }
    return "dark";
  }

  let theme = saved();

  function paintToggles() {
    for (const toggle of document.querySelectorAll("[data-theme-toggle]")) {
      const light = theme === "light";
      toggle.setAttribute("aria-pressed", String(light));
      toggle.title = light ? "Switch to the dark theme" : "Switch to the light theme";
      if (!toggle.hasAttribute("data-theme-toggle-keep")) toggle.textContent = light ? "Dark mode" : "Light mode";
    }
  }

  function apply() {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");
    if (document.body && document.body.classList.contains("portal-page")) document.body.classList.toggle("light", theme === "light");
    paintToggles();
  }

  window.LSTheme = Object.freeze({
    get: () => theme,
    set(next) {
      if (!valid(next)) return;
      theme = next;
      try { localStorage.setItem(KEY, theme); } catch (error) { /* not saved, still applied */ }
      apply();
      document.dispatchEvent(new CustomEvent("ls-themechange", { detail: { theme } }));
    },
    toggle() { this.set(theme === "dark" ? "light" : "dark"); }
  });

  apply();
  document.addEventListener("DOMContentLoaded", apply);
  document.addEventListener("click", event => {
    const toggle = event.target.closest && event.target.closest("[data-theme-toggle]");
    if (!toggle) return;
    event.preventDefault();
    window.LSTheme.toggle();
  });
})();
