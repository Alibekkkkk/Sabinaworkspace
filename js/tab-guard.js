// Warns when the same page is open in a second tab of this browser: two tabs writing the same lesson answers can overwrite each
// other. Uses BroadcastChannel (no storage, nothing is sent anywhere). Each tab announces itself; any tab that hears another says so.
import { t } from "./i18n.js";
import { showNotice } from "./notices.js";

export function startTabGuard(key, { channelFactory = name => (typeof BroadcastChannel === "function" ? new BroadcastChannel(name) : null), notify = text => showNotice("second-tab", text) } = {}) {
  let channel; try { channel = channelFactory(`nd-tab-guard:${key}`); } catch (error) { channel = null; }
  if (!channel) return () => {};
  const id = Math.random().toString(36).slice(2);
  channel.addEventListener("message", event => {
    const message = event.data || {};
    if (message.from === id) return;
    if (message.type === "hello") { channel.postMessage({ type: "here", from: id }); notify(t("tab.other")); }
    else if (message.type === "here") notify(t("tab.other"));
  });
  channel.postMessage({ type: "hello", from: id });
  return () => channel.close();
}
