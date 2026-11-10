// The dashboard previews lessons and homework in same-site iframes. Its own <meta> policy and the hosting header must
// both allow that, or the browser shows "this content is blocked" in the preview.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function metaPolicy(file) {
  const html = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const match = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);
  assert.ok(match, `${file} has a Content-Security-Policy meta tag`);
  return Object.fromEntries(match[1].split(";").map(part => part.trim().split(/\s+/)).filter(parts => parts[0]).map(([name, ...values]) => [name, values]));
}

test("the dashboard's own policy allows framing pages of this site", () => {
  const html = readFileSync(new URL("../dashboard.html", import.meta.url), "utf8");
  assert.match(html, /id="classworkFrame"/);
  assert.ok(metaPolicy("dashboard.html")["frame-src"].includes("'self'"));
});

test("the hosting header allows same-site framing and nothing else", () => {
  const config = JSON.parse(readFileSync(new URL("../firebase.json", import.meta.url), "utf8"));
  const global = config.hosting.headers.find(rule => rule.source === "**").headers;
  const csp = global.find(header => header.key === "Content-Security-Policy").value;
  assert.match(csp, /frame-src 'self' /);
  assert.match(csp, /frame-ancestors 'self'(;|$)/);
  assert.equal(global.find(header => header.key === "X-Frame-Options").value, "SAMEORIGIN");
});

test("old content snapshots are never published (they hold earlier answer keys)", () => {
  const config = JSON.parse(readFileSync(new URL("../firebase.json", import.meta.url), "utf8"));
  assert.ok(config.hosting.ignore.includes("content/_snapshots/**"));
});
