(() => {
  const allowedTags = new Set([
    "A", "B", "BLOCKQUOTE", "BR", "BUTTON", "CAPTION", "CODE", "DD", "DIV", "DL",
    "DT", "EM", "H2", "H3", "H4", "I", "IMG", "LI", "OL", "P", "SPAN", "STRONG",
    "SUB", "SUP", "TABLE", "TBODY", "TD", "TH", "THEAD", "TR", "U", "UL"
  ]);
  const contentlessTags = new Set([
    "EMBED", "FORM", "IFRAME", "INPUT", "MATH", "OBJECT", "SCRIPT", "SELECT",
    "STYLE", "SVG", "TEXTAREA"
  ]);
  const allowedAttributes = new Set([
    "alt", "aria-label", "class", "data-id", "data-vocab", "href", "loading", "src", "title"
  ]);

  function safeUrl(value) {
    try {
      const url = new URL(value, location.href);
      return url.protocol === "https:" ||
        (url.protocol === "http:" && url.origin === location.origin);
    } catch {
      return false;
    }
  }

  function clean(parent) {
    for (const child of [...parent.childNodes]) {
      if (child.nodeType !== Node.ELEMENT_NODE) {
        if (child.nodeType !== Node.TEXT_NODE) child.remove();
        continue;
      }

      if (contentlessTags.has(child.tagName)) {
        child.remove();
        continue;
      }

      clean(child);
      if (!allowedTags.has(child.tagName)) {
        child.replaceWith(...child.childNodes);
        continue;
      }

      for (const attribute of [...child.attributes]) {
        const name = attribute.name.toLowerCase();
        if (!allowedAttributes.has(name) ||
            (["href", "src"].includes(name) && !safeUrl(attribute.value))) {
          child.removeAttribute(attribute.name);
        }
      }
      if (child.tagName === "BUTTON") child.type = "button";
    }
  }

  window.sanitizeRichHtml = value => {
    const template = document.createElement("template");
    template.innerHTML = String(value ?? "");
    clean(template.content);
    return template.innerHTML;
  };
})();
