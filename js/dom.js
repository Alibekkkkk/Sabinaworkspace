const voidElements = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
  "param", "source", "track", "wbr"
]);

function escapeText(value) {
  return String(value).replace(/[&<>]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;"
  })[character]);
}

function escapeAttribute(value) {
  return escapeText(value).replace(/"/g, "&quot;");
}

function serializeNode(node) {
  if (node.nodeType === 3) return escapeText(node.nodeValue);
  if (node.nodeType !== 1) return "";

  const tagName = node.localName;
  const attributes = Array.from(node.attributes, attribute =>
    ` ${attribute.name}="${escapeAttribute(attribute.value)}"`
  ).join("");
  const openingTag = `<${tagName}${attributes}>`;
  if (voidElements.has(tagName)) return openingTag;
  return `${openingTag}${Array.from(node.childNodes, serializeNode).join("")}</${tagName}>`;
}

function parseMarkup(markup) {
  const template = document.createElement("template");
  template.innerHTML = String(markup ?? "");
  return template.content;
}

export function safeUrl(value, base = window.location.href) {
  try {
    const url = new URL(value, base);
    const origin = new URL(base).origin;
    return url.protocol === "https:" || (url.protocol === "http:" && url.origin === origin)
      ? url
      : null;
  } catch {
    return null;
  }
}

// Use only for application-owned markup; escape interpolated values and sanitize teacher content first.
export function setHtml(element, markup) {
  element.replaceChildren(parseMarkup(markup));
}

export function appendHtml(element, markup) {
  element.append(parseMarkup(markup));
}

export function insertHtmlAfter(element, markup) {
  element.after(parseMarkup(markup));
}

export function clearElement(element) {
  element.replaceChildren();
}

export function serializeChildren(element) {
  return Array.from(element.childNodes, serializeNode).join("");
}
