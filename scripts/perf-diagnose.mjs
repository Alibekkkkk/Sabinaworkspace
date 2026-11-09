// Why is a page slow?  node scripts/perf-diagnose.mjs lesson.html clip.html
// Mobile Lighthouse on each page, then prints the largest-contentful-paint element, the render-blocking files and the requests
// in order. A diagnostic for fixing a budget miss, not a gate (the gate is `npm run perf:budgets`).
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import lighthouse from "lighthouse";
import puppeteer from "puppeteer-core";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = createServer((request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  const file = resolve(join(root, path || "index.html"));
  if (!file.startsWith(root + sep) || !existsSync(file)) { response.writeHead(404).end(); return; }
  const type = TYPES[extname(file)] || "application/octet-stream";
  const body = readFileSync(file);
  if (/^(text|application\/json|image\/svg|application\/manifest)/.test(type) && /gzip/.test(request.headers["accept-encoding"] || "")) response.writeHead(200, { "content-type": type, "content-encoding": "gzip", vary: "accept-encoding" }).end(gzipSync(body));
  else response.writeHead(200, { "content-type": type }).end(body);
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const browserPath = [process.env.CHROME_PATH, "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(path => existsSync(path));
const browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ["--no-sandbox", "--lang=en-US"] });
const port = Number(new URL(browser.wsEndpoint()).port);
try {
  for (const page of process.argv.slice(2)) {
    const { lhr } = await lighthouse(`http://127.0.0.1:${server.address().port}/${page}`, { port, output: "json", logLevel: "error", onlyCategories: ["performance"] });
    console.log(`== ${page}`);
    const element = lhr.audits["largest-contentful-paint-element"];
    console.log("LCP element:", JSON.stringify(element.details?.items?.[0]?.items?.[0]?.node?.snippet || element.displayValue));
    console.log("FCP", Math.round(lhr.audits["first-contentful-paint"].numericValue), "ms; LCP", Math.round(lhr.audits["largest-contentful-paint"].numericValue), "ms; TBT", Math.round(lhr.audits["total-blocking-time"].numericValue), "ms");
    const blocking = lhr.audits["render-blocking-resources"];
    console.log("render-blocking:", (blocking.details?.items || []).map(item => `${item.url.split("/").slice(-2).join("/")} ${Math.round(item.wastedMs)}ms`).join("; ") || "none");
    const boot = lhr.audits["bootup-time"].details?.items || [];
    console.log("script time (ms, top 6):", boot.slice(0, 6).map(item => `${item.url.split("/").slice(-1)[0].slice(0, 30)} total ${Math.round(item.total)} scripting ${Math.round(item.scripting)} parse ${Math.round(item.scriptParseCompile)}`).join(" | "));
    const unused = lhr.audits["unused-javascript"].details?.items || [];
    console.log("unused JS (top 5):", unused.slice(0, 5).map(item => `${item.url.split("/").slice(-1)[0].slice(0, 30)} ${Math.round(item.wastedBytes / 1024)}kB of ${Math.round(item.totalBytes / 1024)}kB`).join(" | "));
    console.log("main-thread:", (lhr.audits["mainthread-work-breakdown"].details?.items || []).slice(0, 5).map(item => `${item.groupLabel} ${Math.round(item.duration)}ms`).join(" | "), "; DOM nodes", lhr.audits["dom-size"].numericValue);
    const requests = lhr.audits["network-requests"].details.items.map(item => `${item.url.split("/").slice(-1)[0].slice(0, 32)} ${Math.round(item.networkEndTime - item.networkRequestTime || 0)}ms ${Math.round(item.transferSize / 1024)}kB`);
    console.log(`requests (${requests.length}):`, requests.slice(0, 45).join(" | "));
  }
} finally { await browser.close(); server.close(); }
void sep;
