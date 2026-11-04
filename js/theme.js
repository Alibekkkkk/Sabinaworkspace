(() => {
  const toggle = document.querySelector("[data-theme-toggle]");
  if (!toggle) return;

  const storageKey = "learning-portal-theme";
  let theme = "dark";
  let userSelectedTheme = false;
  let systemTheme;
  try {
    const savedTheme = localStorage.getItem(storageKey);
    if (savedTheme === "light" || savedTheme === "dark") {
      theme = savedTheme;
      userSelectedTheme = true;
    }
    systemTheme = window.matchMedia("(prefers-color-scheme: light)");
    if (!userSelectedTheme) theme = systemTheme.matches ? "light" : "dark";
  } catch (error) {
    console.error("Theme preference could not be loaded:", error);
  }

  function applyTheme(nextTheme, persist) {
    theme = nextTheme;
    document.documentElement.dataset.theme = theme;
    toggle.textContent = theme === "dark" ? "☀️ Light mode" : "🌙 Dark mode";
    toggle.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} theme`);
    if (persist) {
      try {
        localStorage.setItem(storageKey, theme);
      } catch (error) {
        console.error("Theme preference could not be saved:", error);
      }
    }
  }

  applyTheme(theme, false);
  if (!userSelectedTheme && systemTheme) {
    systemTheme.addEventListener("change", event => {
      if (!userSelectedTheme) applyTheme(event.matches ? "light" : "dark", false);
    });
  }
  toggle.addEventListener("click", () => {
    userSelectedTheme = true;
    applyTheme(theme === "dark" ? "light" : "dark", true);
  });
})();
