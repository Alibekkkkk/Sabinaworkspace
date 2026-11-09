// Student side of the feature flags: read the student's flags, show a friendly page when a feature is off, and reveal
// the Manga tab only when the flag is on. The database rules are what actually protect the content; this is the friendly layer.
import { hasFeature, isFeature } from "./features.js";
import { t } from "./i18n.js";
import { addNavTab } from "./shell.js";

export async function loadFlags(db, code) {
  try { return (await db.ref(`studentFeatures/${code}`).once("value")).val() || null; } catch (error) { return null; }
}

export async function featureEnabled(db, code, name, lessonFeatures = null) {
  return hasFeature(await loadFlags(db, code), name, lessonFeatures);
}

// Replaces `target` with a short, kind explanation. Returns the card.
export function showNotEnabled(target, name, { backHref = "portal.html", backLabel = t("feature.back") } = {}) {
  const card = document.createElement("section");
  card.className = "ds-card ds-error-page"; card.setAttribute("role", "status");
  const heading = document.createElement("h2"); heading.textContent = t("feature.notEnabledTitle");
  const message = document.createElement("p"); message.textContent = t("feature.notEnabled", { feature: isFeature(name) ? t(`feature.${name}`) : t("feature.thisFeature") });
  const link = document.createElement("a"); link.className = "ds-btn ds-btn--primary"; link.href = backHref; link.textContent = backLabel;
  card.append(heading, message, link);
  target.replaceChildren(card); target.hidden = false;
  return card;
}

// Adds the Manga tab to the bottom navigation when the student has the flag. Safe to call on any page that mounted the nav.
export async function revealMangaTab(db, code, lessonFeatures = null) {
  if (!(await featureEnabled(db, code, "mangaReader", lessonFeatures))) return false;
  addNavTab({ id: "manga", labelKey: "nav.manga", icon: "\u{1F4D6}", href: `manga.html?code=${encodeURIComponent(code)}` }, "clips");
  return true;
}
