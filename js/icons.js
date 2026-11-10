// Interface icons instead of emojis. The site's own labels were written with emojis ("🔊 Listen", "📍 Stage"); this
// script swaps each one for a line icon from assets/icons.svg as the page renders, so every page, and markup built by
// scripts later, shows the same icon set in both themes. Lesson content keeps its own pictures: a word's emoji on its
// flashcard, reading passages, manga, and anything a person types are never touched (see SKIP).
// Load it in <head> right after js/theme.js:  <script src="js/icons.js"></script>
(() => {
  const SPRITE = "/assets/icons.svg";
  const NAMES = {
    "📖": "book", "📘": "book", "📚": "books", "🗃️": "archive", "📊": "chart", "🎓": "cap", "🏫": "school", "🌍": "logo", "🌐": "globe",
    "▶": "play", "▶️": "play", "⏸": "pause", "⏹": "stop", "⏮": "previous", "⏭": "next",
    "📝": "note", "🗒️": "note", "💬": "chat", "☀️": "sun", "🌞": "sun", "🌙": "moon",
    "🗑️": "trash", "🗑": "trash", "🧹": "broom", "🔊": "sound", "🔇": "mute", "📌": "pushpin", "📍": "pin", "🔗": "link",
    "🎧": "headphones", "👂": "headphones", "🔄": "refresh", "🔁": "refresh", "🔒": "lock", "🔐": "lock", "🔑": "key",
    "🏆": "trophy", "🏁": "flag-finish", "🎖️": "medal", "✏️": "pencil", "🖍️": "highlighter", "🌪️": "logo", "✨": "spark", "🎉": "party",
    "🧭": "compass", "🎮": "gamepad", "🕹️": "gamepad", "⚡": "bolt", "⚠️": "alert", "⚠": "alert", "🎯": "target", "🏹": "target",
    "⭐": "star", "🌟": "star", "👤": "user", "👥": "users", "👋": "hand", "✋": "hand", "↗": "external", "🖼️": "image",
    "✅": "check-circle", "📅": "calendar", "📁": "folder", "💡": "bulb", "👁": "eye", "🙈": "eye-off", "🦅": "eye", "🎬": "film",
    "🐉": "sword", "⚔": "sword", "🛡️": "shield", "⏱": "clock", "⏰": "clock", "⏳": "hourglass", "🔥": "flame",
    "🧩": "puzzle", "🧱": "puzzle", "🌳": "tree", "🌲": "tree", "🍃": "tree", "❌": "close", "🚩": "flag", "🐢": "slow",
    "🔍": "search", "➕": "plus", "🎤": "mic", "👣": "steps", "⬆️": "arrow-up", "⬆": "arrow-up", "⬇": "arrow-down",
    "🏠": "home", "🧑": "user", "📋": "clipboard", "🧠": "brain", "💎": "gem", "🧊": "snowflake", "🌊": "wave", "🦊": "paw", "🦉": "paw", "🧽": "eraser", "🔴": "laser"
  };
  // Longest first, so "▶️" wins over "▶" and "⚠️" over "⚠".
  const keys = Object.keys(NAMES).sort((a, b) => b.length - a.length);
  const PATTERN = new RegExp(`(${keys.map(key => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\s?`, "gu");
  const SKIP = "input, textarea, select, script, style, svg, [contenteditable], [data-keep-emoji], .flashcard, .fc-modal, .fc-emoji, #vocabEmoji, .vocab-emoji, #passageBody, .passage, .reading-passage, .mg-reader, .mg-page, .ls-sentence, .gm-card-emoji";
  const NS = "http://www.w3.org/2000/svg";

  function makeIcon(name) {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", `ds-icon ds-icon--${name}`);
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const use = document.createElementNS(NS, "use");
    use.setAttribute("href", `${SPRITE}#${name}`);
    svg.append(use);
    return svg;
  }

  function replaceText(node) {
    const text = node.nodeValue;
    PATTERN.lastIndex = 0;
    if (!text || !PATTERN.test(text)) return;
    const parent = node.parentElement;
    if (!parent || parent.closest(SKIP)) return;
    PATTERN.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let last = 0;
    for (const match of text.matchAll(PATTERN)) {
      if (match.index > last) fragment.append(text.slice(last, match.index));
      fragment.append(makeIcon(NAMES[match[1]]));
      if (match[0].length > match[1].length) fragment.append(" ");
      last = match.index + match[0].length;
    }
    if (last < text.length) fragment.append(text.slice(last));
    node.replaceWith(fragment);
    // A button or link left with only an icon still needs a name: take its tooltip.
    const control = parent.closest("button, a, [role=button]");
    if (control && !control.textContent.trim() && !control.hasAttribute("aria-label") && control.title) control.setAttribute("aria-label", control.title);
  }

  function scan(root) {
    if (!root) return;
    if (root.nodeType === 3) { replaceText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 11) return;
    if (root.nodeType === 1 && root.closest(SKIP)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const found = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) found.push(node);
    found.forEach(replaceText);
  }

  function start() {
    scan(document.body);
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === "characterData") replaceText(record.target);
        else record.addedNodes.forEach(scan);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  window.LSIcons = Object.freeze({ makeIcon, scan, names: NAMES });
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start, { once: true });
})();
