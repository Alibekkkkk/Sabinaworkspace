// Practice-page panels: play settings (calm options), level and weekly goals, badges and the avatar shop.
import { AVATAR_ITEMS, BADGES, DAILY_XP_CAP, questProgress, xpToNextLevel } from "./rewards.js";
import { button, el, meter } from "./ui.js";

const section = (title, open = false) => { const details = el("details", "gm-panel"); details.open = open; details.append(el("summary", "", title)); return details; };

export function mountPanels(host, { progress, settings, onSettings, onShop }) {
  host.replaceChildren();
  const state = { progress: progress || {}, settings: { ...settings } };

  const settingsBox = section("Play settings", false);
  const options = [["calm", "Reduce animation (no confetti or flashing)"], ["noTimers", "No timers (timed games become untimed)"], ["muted", "No sound"], ["vibrate", "Vibration feedback on phones"]];
  for (const [key, label] of options) {
    const row = el("label", "gm-check"); const box = el("input"); box.type = "checkbox"; box.checked = Boolean(state.settings[key]);
    box.addEventListener("change", () => { state.settings[key] = box.checked; onSettings({ ...state.settings }); });
    row.append(box, el("span", "", label)); settingsBox.append(row);
  }

  const goalsBox = section("Level, streak and weekly goals", true); const badgesBox = section("Badges"); const shopBox = section("Avatar shop");
  host.append(goalsBox, badgesBox, shopBox, settingsBox);

  function paint() {
    const p = state.progress;
    const info = xpToNextLevel(p.xp || 0);
    goalsBox.replaceChildren(goalsBox.querySelector("summary"));
    const level = meter(`Level ${info.level}`, Math.max(1, info.next)); level.set(Math.min(info.next, p.xp || 0), `${info.remaining} XP to level ${info.level + 1}`);
    goalsBox.append(level.element);
    goalsBox.append(el("p", "gm-hint", `Streak: ${p.streak || 0} day${p.streak === 1 ? "" : "s"}. Streak freezes: ${p.streakFreezes || 0}. A freeze covers one missed day automatically; you earn one for every 7 days in a row.`));
    goalsBox.append(el("p", "gm-hint", `XP today: ${(p.daily && p.daily.xp) || 0} of ${DAILY_XP_CAP}. After that games still count, they just stop paying XP.`));
    const list = el("ul", "gm-quests");
    for (const quest of questProgress(p.weekly)) { const item = el("li"); const bar = meter(quest.label, quest.goal); bar.set(quest.value, quest.done ? "done" : ""); item.append(bar.element); list.append(item); }
    goalsBox.append(el("p", "gm-subhead", "This week's goals"), list);

    const earned = new Set(p.badges || []);
    badgesBox.replaceChildren(badgesBox.querySelector("summary"), el("p", "gm-hint", `${earned.size} of ${BADGES.length} earned.`));
    const grid = el("ul", "gm-badges");
    for (const badge of BADGES) {
      const item = el("li", earned.has(badge.id) ? "gm-badge is-earned" : "gm-badge");
      const icon = el("span", "gm-badge__icon", badge.icon); icon.setAttribute("aria-hidden", "true");
      item.append(icon, el("strong", "", badge.name), el("span", "", ` ${earned.has(badge.id) ? "Earned" : "Locked"}: ${badge.criteria}`));
      grid.append(item);
    }
    badgesBox.append(grid);

    const avatar = p.avatar || {}; const owned = new Set(avatar.owned || []);
    shopBox.replaceChildren(shopBox.querySelector("summary"), el("p", "gm-hint", `You have ${p.gems || 0} gems. Gems buy looks for your profile, never answers.`));
    const shop = el("ul", "gm-shop");
    for (const item of AVATAR_ITEMS) {
      const row = el("li", "gm-shopitem"); const icon = el("span", "gm-badge__icon", item.icon); icon.setAttribute("aria-hidden", "true");
      row.append(icon, el("span", "", `${item.name} (${item.slot})`));
      if (owned.has(item.id)) {
        const equipped = avatar[item.slot] === item.id;
        row.append(button(equipped ? `In use: ${item.name}` : `Use ${item.name}`, "button secondary", () => onShop(item.id, "equip"), { ...(equipped ? { disabled: "" } : {}) }));
      } else row.append(button(`Buy ${item.name} for ${item.cost} gems`, "button", () => onShop(item.id, "buy"), { ...((p.gems || 0) < item.cost ? { disabled: "" } : {}) }));
      shop.append(row);
    }
    shopBox.append(shop);
  }
  paint();
  return { update(next) { state.progress = next || {}; paint(); } };
}
