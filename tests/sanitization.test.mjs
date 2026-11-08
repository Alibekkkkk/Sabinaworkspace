import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import test from "node:test";
import { appendHtml, clearElement, insertHtmlAfter, safeUrl, serializeChildren, setHtml } from "../js/dom.js";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(fileURLToPath(new URL(path, root)), "utf8");

function createSanitizer(dom) {
  runInNewContext(read("js/sanitize-html.js"), {
    window: dom.window,
    document: dom.window.document,
    Node: dom.window.Node,
    location: dom.window.location,
    URL
  });
  return dom.window.sanitizeRichHtml;
}

function extractEscapeHtml(source) {
  const start = source.indexOf("function escapeHtml(");
  assert.notEqual(start, -1, "page should define an HTML text encoder");
  const open = source.indexOf("{", start);
  let depth = 0;
  let quote = null;
  for (let index = open; index < source.length; index++) {
    const character = source[index];
    if (quote) {
      if (character === "\\") index++;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === "/") {
      let inCharacterClass = false;
      for (index++; index < source.length; index++) {
        if (source[index] === "\\") index++;
        else if (source[index] === "[") inCharacterClass = true;
        else if (source[index] === "]") inCharacterClass = false;
        else if (source[index] === "/" && !inCharacterClass) break;
      }
      continue;
    }
    if (character === "{") depth++;
    else if (character === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  assert.fail("page escapeHtml helper should have balanced braces");
}

test("lesson and homework sanitize rich content before inserting HTML", () => {
  for (const [path, script] of [
    ["lesson.html", "js/pages/lesson.js"],
    ["homework.html", "js/pages/homework.js"]
  ]) {
    const page = read(path);
    const pageScript = read(script);
    assert.match(page, /src="js\/sanitize-html\.js"/, `${path} should load the sanitizer`);
    assert.match(page, /type="module" src=/, `${path} should load its page module`);
    assert.match(pageScript, /sanitizeRichHtml\(savedHtml\)/, `${path} should sanitize saved annotations`);
  }
  assert.match(read("js/pages/homework.js"), /sanitizeRichHtml\(m\.ex\)/);
  assert.equal((read("js/pages/lesson.js").match(/sanitizeRichHtml\(item\.ex\)/g) || []).length, 2);
});

test("the DOM helpers set, append, insert, clear, and serialize fragments", () => {
  const previousDocument = globalThis.document;
  const dom = new JSDOM("", { url: "https://studio.example/" });
  globalThis.document = dom.window.document;
  try {
    const host = document.createElement("div");
    setHtml(host, "<p>First</p>");
    appendHtml(host, "<p>Last</p>");
    insertHtmlAfter(host.firstElementChild, "<p>Middle</p>");
    assert.deepEqual(
      Array.from(host.children, child => child.textContent),
      ["First", "Middle", "Last"]
    );
    assert.equal(serializeChildren(host), "<p>First</p><p>Middle</p><p>Last</p>");
    clearElement(host);
    assert.equal(host.childNodes.length, 0);
    assert.equal(safeUrl("javascript:alert(1)", "https://studio.example/"), null);
    assert.equal(safeUrl("data:text/html,payload", "https://studio.example/"), null);
    assert.equal(safeUrl("/homework.html", "https://studio.example/").href, "https://studio.example/homework.html");
    assert.equal(
      safeUrl("https://external.example/homework", "https://studio.example/").href,
      "https://external.example/homework"
    );
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    dom.window.close();
  }
});

test("sanitizer allowlists formatting and strips active content and unsafe URLs", () => {
  const sanitizer = read("js/sanitize-html.js");
  assert.match(sanitizer, /allowedTags = new Set/);
  assert.match(sanitizer, /contentlessTags = new Set/);
  assert.match(sanitizer, /removeAttribute/);
  assert.match(sanitizer, /url\.protocol === "https:"/);
  assert.match(read("sw.js"), /"js\/sanitize-html\.js"/);
});

test("sanitizer rejects a 50-payload XSS corpus", () => {
  const payloads = [
    "<script>alert(1)</script>",
    "<script src=https://attacker.invalid/x.js></script>",
    "<img src=x onerror=alert(1)>",
    "<img src=x onload=alert(1)>",
    "<svg onload=alert(1)>",
    "<svg><script>alert(1)</script></svg>",
    "<svg><foreignObject><p>payload</p></foreignObject></svg>",
    "<iframe src=javascript:alert(1)></iframe>",
    "<iframe srcdoc=\"<script>alert(1)</script>\"></iframe>",
    "<object data=javascript:alert(1)>payload</object>",
    "<embed src=javascript:alert(1)>",
    "<form action=javascript:alert(1)><button>submit</button></form>",
    "<input autofocus onfocus=alert(1)>",
    "<button onclick=alert(1)>click</button>",
    "<details open ontoggle=alert(1)>details</details>",
    "<marquee onstart=alert(1)>text</marquee>",
    "<video onerror=alert(1)><source src=x></video>",
    "<audio src=x onerror=alert(1)>",
    "<math><mi xlink:href=\"javascript:alert(1)\">x</mi></math>",
    "<style>@import 'javascript:alert(1)';</style>",
    "<link rel=stylesheet href=javascript:alert(1)>",
    "<meta http-equiv=refresh content=\"0;javascript:alert(1)\">",
    "<base href=https://attacker.invalid/>",
    "<a href=javascript:alert(1)>link</a>",
    "<a href=\"JaVaScRiPt:alert(1)\">link</a>",
    "<a href=\"java&#x73;cript:alert(1)\">link</a>",
    "<a href=\"data:text/html,<script>alert(1)</script>\">link</a>",
    "<img src=\"data:image/svg+xml,<svg onload=alert(1)>\">",
    "<img src=\"javascript:alert(1)\">",
    "<img srcset=\"x 1x, javascript:alert(1) 2x\">",
    "<div onmouseover=alert(1)>hover</div>",
    "<p onmouseenter=alert(1)>text</p>",
    "<span onanimationstart=alert(1)>text</span>",
    "<select onfocus=alert(1)><option>item</option></select>",
    "<textarea oninput=alert(1)>text</textarea>",
    "<table background=javascript:alert(1)><tr><td>cell</td></tr></table>",
    "<div style=\"background:url(javascript:alert(1))\">text</div>",
    "<a href=\"vbscript:msgbox(1)\">link</a>",
    "<a href=\"file:///etc/passwd\">link</a>",
    "<xss onload=alert(1)>payload</xss>",
    "<noscript><img src=x onerror=alert(1)></noscript>",
    "<template><script>alert(1)</script></template>",
    "<svg><a xlink:href=\"javascript:alert(1)\">link</a></svg>",
    "<img src=x onerror=\"&#x61;lert(1)\">",
    "<img src=x ONERROR=alert(1)>",
    "<div data-x=\"<script>alert(1)</script>\">text</div>",
    "<a href=\"https://studio.example/safe\">safe link</a>",
    "<p><strong>safe rich text</strong></p>",
    "<p><img src=\"https://studio.example/image.png\" alt=\"safe image\"></p>",
    "<a href=\"//attacker.invalid/path\">external link</a>"
  ];
  assert.equal(payloads.length, 50);

  const previousDocument = globalThis.document;
  const dom = new JSDOM("", { url: "https://studio.example/" });
  globalThis.document = dom.window.document;
  const sanitizeRichHtml = createSanitizer(dom);
  try {
    const host = document.createElement("div");
    for (const payload of payloads) {
      setHtml(host, sanitizeRichHtml(payload));
      assert.equal(
        host.querySelector("script, iframe, object, embed, svg, math, form, input, video, audio, style, link, meta, base"),
        null,
        `active element survived for payload ${payload}`
      );
      for (const element of host.querySelectorAll("*")) {
        for (const attribute of element.attributes) {
          assert.doesNotMatch(attribute.name, /^on/i, `event attribute survived for payload ${payload}`);
          if (["href", "src"].includes(attribute.name)) {
            assert.doesNotMatch(attribute.value, /^\s*(javascript|vbscript|data|file):/i);
          }
        }
      }
    }
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    dom.window.close();
  }
});

for (const [page, scriptPath] of [
  ["teacher dashboard", "js/pages/dashboard.js"],
  ["student portal", "js/pages/portal.js"]
]) {
  test(`${page} renders injected student names as text`, () => {
    const source = read(scriptPath);
    const escapeHtml = extractEscapeHtml(source);
    const payload = `"><img src=x onerror="alert(1)"> & '`;
    const encoded = runInNewContext(`${escapeHtml}\nescapeHtml(input)`, { input: payload });
    const previousDocument = globalThis.document;
    const dom = new JSDOM("", { url: "https://studio.example/" });
    globalThis.document = dom.window.document;
    try {
      const host = document.createElement("div");
      setHtml(host, `<span>${encoded}</span>`);
      assert.equal(host.querySelector("img"), null);
      assert.equal(host.textContent, payload);
    } finally {
      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
      dom.window.close();
    }
  });
}

for (const [page, scriptPath] of [
  ["lesson", "js/pages/lesson.js"],
  ["homework", "js/pages/homework.js"]
]) {
  test(`${page} sanitizes injected content and saved notes`, () => {
    const source = read(scriptPath);
    const escapeHtml = extractEscapeHtml(source);
    assert.match(source, /sanitizeRichHtml\(savedHtml\)/);
    const payload = `<img src=x onerror="alert(1)"><script>alert(2)</script>`;
    const encoded = runInNewContext(`${escapeHtml}\nescapeHtml(input)`, { input: payload });
    const previousDocument = globalThis.document;
    const dom = new JSDOM("", { url: "https://studio.example/" });
    globalThis.document = dom.window.document;
    const sanitizeRichHtml = createSanitizer(dom);
    try {
      const host = document.createElement("div");
      setHtml(host, `<p>${encoded}</p>`);
      assert.equal(host.querySelector("img, script"), null);
      setHtml(host, sanitizeRichHtml(payload));
      assert.equal(host.querySelector("script"), null);
      assert.equal(host.querySelector("[onerror]"), null);
    } finally {
      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
      dom.window.close();
    }
  });
}

test("application pages contain no direct DOM HTML sinks", () => {
  const collectJavaScript = directory => readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? collectJavaScript(path) :
        entry.isFile() && path.endsWith(".js") ? [path] : [];
    });
  const applicationFiles = collectJavaScript(fileURLToPath(new URL("js/", root)))
    .map(path => relative(fileURLToPath(root), path).replace(/\\/g, "/"))
    .filter(path => !["js/dom.js", "js/sanitize-html.js"].includes(path));
  const forbidden = /innerHTML|outerHTML|insertAdjacentHTML|document\.write/;
  for (const path of applicationFiles) {
    assert.doesNotMatch(read(path), forbidden, `${path} should use the shared DOM helpers`);
  }
  for (const path of [
    "index.html", "legacy/index.html", "portal.html", "dashboard.html", "lesson.html",
    "lesson_abay.html", "lesson_gaziz.html", "homework.html", "practice.html", "clip.html",
    "manga.html", "placement.html", "offline.html", "tools/import-content.html"
  ]) {
    assert.doesNotMatch(read(path), forbidden, `${path} should not contain a direct DOM HTML sink`);
  }
  assert.match(read("js/dom.js"), /template\.innerHTML/);
  assert.match(read("js/sanitize-html.js"), /sanitizeRichHtml/);
});

test("dashboard uses delegated actions and validates dynamic parameters", () => {
  const dashboard = read("js/pages/dashboard.js");
  assert.match(dashboard, /data-action="approve-pending-student" data-uid=/);
  assert.match(dashboard, /data-action="undo-teacher-action" data-id=/);
  assert.match(dashboard, /readActionParam\(element, "uid", \/\^\[A-Za-z0-9_-\]\{1,128\}\$\/\)/);
  assert.match(dashboard, /data-action="select-student" data-code="' \+ escapeHtml\(code\)/);

  const htmlHelper = dashboard.match(/function escapeHtml\(s\) \{[\s\S]*?\r?\n\}/);
  assert.ok(htmlHelper, "dashboard should define HTML-safe attribute encoding");
  const payload = `');alert(1)//<img src=x onerror="alert(2)">&`;
  const encoded = runInNewContext(`${htmlHelper[0]}\nescapeHtml(${JSON.stringify(payload)})`);
  assert.doesNotMatch(encoded, /[<>"']/);
  assert.match(encoded, /&#39;/);
});

test("lesson and homework use delegated actions for annotations and review", () => {
  const lesson = read("js/pages/lesson.js");
  const homework = read("js/pages/homework.js");
  assert.match(lesson, /data-action="edit-note" data-note-id=/);
  assert.match(lesson, /data-action="delete-note" data-note-id=/);
  assert.match(lesson, /data-action="flag-for-review"/);
  assert.match(homework, /data-action="edit-note" data-note-id=/);
  assert.match(homework, /data-action="delete-note" data-note-id=/);
  assert.ok(lesson.includes('/^(?:note|legacy)_'));
  assert.ok(homework.includes('/^(?:note|legacy)_'));
  assert.doesNotMatch(lesson, /onerror="this\.parentNode/);
  assert.match(lesson, /escapeHtml\(w\.emoji\|\|'📖'\)/);
  assert.match(lesson, /setHtml\(lEl,.*escapeHtml\(title\)/);
  assert.match(lesson, /escapeHtml\(e\.message\)/);
});

test("student portal escapes lesson content and coerces scores to numbers", () => {
  const portal = read("js/pages/portal.js");
  assert.match(portal, /escapeHtml\(lesson\.icon \|\| '📘'\)/);
  assert.match(portal, /escapeHtml\(lesson\.title \|\| 'Untitled lesson'\)/);
  assert.match(portal, /Number\(state\.progress\.scores\[/);
  assert.match(portal, /escapeHtml\(code\)/);
});
