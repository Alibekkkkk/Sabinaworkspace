// Registers the service worker and offers an update when a new version is ready ("New version available - reload").
// The new worker waits until the student presses Reload, so a lesson in progress is never replaced under their hands.
function showUpdateBanner(worker) {
  if (document.getElementById("updateBanner")) return;
  const banner = document.createElement("div");
  banner.id = "updateBanner"; banner.setAttribute("role", "status");
  const set = (node, rules) => { for (const [name, value] of Object.entries(rules)) node.style.setProperty(name, value); };
  set(banner, { position: "fixed", left: "0", right: "0", bottom: "0", "z-index": "1000", display: "flex", "flex-wrap": "wrap", gap: "12px", "align-items": "center", "justify-content": "center", padding: "12px 16px", background: "var(--ds-color-primary, #4257b2)", color: "var(--ds-color-on-primary, #fff)", font: "600 16px system-ui, sans-serif" });
  const message = document.createElement("span"); message.textContent = "New version available.";
  const reload = document.createElement("button"); reload.type = "button"; reload.textContent = "Reload";
  set(reload, { "min-height": "44px", "min-width": "44px", padding: "0 16px", font: "inherit", cursor: "pointer" });
  const later = document.createElement("button"); later.type = "button"; later.textContent = "Not now";
  set(later, { "min-height": "44px", "min-width": "44px", padding: "0 16px", font: "inherit", cursor: "pointer" });
  reload.addEventListener("click", () => { reload.disabled = true; worker.postMessage({ type: "SKIP_WAITING" }); });
  later.addEventListener("click", () => banner.remove());
  banner.append(message, reload, later);
  document.body.append(banner);
}

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then(registration => {
      const offer = worker => { if (worker && navigator.serviceWorker.controller) showUpdateBanner(worker); };
      offer(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const incoming = registration.installing;
        if (incoming) incoming.addEventListener("statechange", () => { if (incoming.state === "installed") offer(incoming); });
      });
    }).catch(error => {
      console.error("Offline support could not be enabled:", error);
    });
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading || !document.getElementById("updateBanner")) return; // the first install also changes the controller: no reload then
      reloading = true; location.reload();
    });
  });
}
