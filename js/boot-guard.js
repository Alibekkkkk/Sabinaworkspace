// Recovers a page whose code failed to load. After a site update, a browser can briefly hold files from two versions
// (an old cached script next to a new page); a script then fails to load or names an export the other version lacks, and
// the page stays blank. When that happens while the page starts, this clears the site's cached copy and reloads once. If
// it happens again, it shows a "Repair and reload" bar instead of reloading in a loop.
// Load it in <head> right after js/theme.js:  <script src="js/boot-guard.js"></script>
(() => {
  const STARTUP_MS = 20000;
  const FLAG = "ls-repaired-at";
  const started = Date.now();
  const sameSite = url => { try { return new URL(url, location.href).origin === location.origin; } catch (error) { return false; } };
  // Errors that mean "these files do not belong together" or "a file could not be loaded".
  const LOAD_FAILURE = /does not provide an export|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;
  let handled = false;

  async function repair() {
    try {
      if ("serviceWorker" in navigator) for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
      if (window.caches) for (const key of await caches.keys()) if (key.startsWith("learning-studio-")) await caches.delete(key);
    } catch (error) { /* reload anyway */ }
    location.reload();
  }

  function showBar() {
    if (document.getElementById("bootGuardBar")) return;
    const bar = document.createElement("div");
    bar.id = "bootGuardBar"; bar.setAttribute("role", "alert");
    const text = document.createElement("span");
    text.textContent = "This page did not load completely. The site may have just been updated.";
    const button = document.createElement("button");
    button.type = "button"; button.textContent = "Repair and reload";
    button.addEventListener("click", () => { button.disabled = true; repair(); });
    bar.append(text, button);
    for (const [name, value] of Object.entries({ position: "fixed", inset: "auto 0 0 0", "z-index": "2000", display: "flex", gap: "12px", "align-items": "center", "justify-content": "center", "flex-wrap": "wrap", padding: "12px 16px", background: "var(--ds-color-highlight, #c6f432)", color: "var(--ds-color-on-highlight, #0a0e1c)", font: "600 15px system-ui, sans-serif" })) bar.style.setProperty(name, value);
    for (const [name, value] of Object.entries({ "min-height": "44px", padding: "0 16px", "border-radius": "10px", border: "0", background: "var(--ds-color-on-highlight, #0a0e1c)", color: "var(--ds-color-highlight, #c6f432)", font: "700 15px system-ui, sans-serif", cursor: "pointer" })) button.style.setProperty(name, value);
    (document.body || document.documentElement).append(bar);
  }

  function failed(detail) {
    // offline, a missing file is expected and the cache is what keeps the site working: never clear it then
    if (handled || Date.now() - started > STARTUP_MS || navigator.onLine === false) return;
    handled = true;
    let last = 0;
    try { last = Number(sessionStorage.getItem(FLAG)) || 0; } catch (error) { last = Date.now(); }
    if (Date.now() - last > 60000) {
      try { sessionStorage.setItem(FLAG, String(Date.now())); } catch (error) { /* ignore */ }
      console.warn("A page file failed to load; clearing the cached copy and reloading once.", detail);
      repair();
    } else {
      const show = () => showBar();
      if (document.body) show(); else document.addEventListener("DOMContentLoaded", show, { once: true });
    }
  }

  window.addEventListener("error", event => {
    const target = event.target;
    if (target && target !== window && (target.tagName === "SCRIPT" || (target.tagName === "LINK" && target.rel === "stylesheet")) && sameSite(target.src || target.href)) { failed(`could not load ${target.src || target.href}`); return; }
    if (event.filename && sameSite(event.filename) && LOAD_FAILURE.test(String(event.message || ""))) failed(event.message);
  }, true);
  window.addEventListener("unhandledrejection", event => {
    const message = String((event.reason && event.reason.message) || event.reason || "");
    if (/does not provide an export|dynamically imported module|Importing a module script failed/i.test(message)) failed(message);
  });
})();
