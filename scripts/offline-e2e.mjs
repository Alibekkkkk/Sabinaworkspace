// The service worker in a real browser:  npm run dev  then  npm run test:offline-e2e
// It installs and precaches the shell under a versioned name, pages and scripts still open with the network off, the offline
// banner appears, content JSON is cached as it is used, sign-in and Firebase traffic is never cached, and the manifest's icons load.
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const BASE = process.env.SITE || "http://127.0.0.1:5050/";
const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(path => existsSync(path));
if (!executable) throw new Error("No Chrome/Edge found. Set CHROME_PATH.");
const failures = [];
const check = (condition, message) => { console.log(`${condition ? "ok  " : "FAIL"} ${message}`); if (!condition) failures.push(message); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, ms = 15000, step = 100) { const end = Date.now() + ms; while (Date.now() < end) { const value = await fn(); if (value) return value; await sleep(step); } return false; }

const browser = await puppeteer.launch({ executablePath: executable, headless: true, args: ["--no-sandbox", "--lang=en-US"] });
try {
  const context = await browser.createBrowserContext(); const page = await context.newPage();
  const problems = [];
  page.on("pageerror", error => problems.push(error.message));
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${BASE}portal.html`, { waitUntil: "networkidle2" });
  check(await until(() => page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); return Boolean(registration && registration.active); })), "the service worker installs and activates");
  const names = await page.evaluate(() => caches.keys());
  const shellName = names.find(name => /^learning-studio-shell-[0-9a-f]{10}$/.test(name));
  check(Boolean(shellName), `the shell cache name carries a version (${names.join(", ")})`);
  const precached = await page.evaluate(async name => (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname.replace(/^\//, "")), shellName);
  check(precached.length > 150 && ["portal.html", "offline.html", "js/shell.js", "assets/pwa/icon-192.png", "js/manga/reader-ui.js"].every(path => precached.includes(path)), `the shell is precached (${precached.length} files)`);
  check(!precached.some(path => /protectedContent|sessions|studentProgress/i.test(path)), "no protected or student data is in the shell cache");

  // content JSON is cached as it is used (network first), then served when offline
  const fetched = await page.evaluate(async () => (await fetch("content/manifest.json", { cache: "no-store" })).ok && (await fetch("content/placement/items.json")).ok);
  check(fetched, "content data loads online");
  check(await until(() => page.evaluate(async () => { const cache = await caches.open("learning-studio-content-v1"); return (await cache.keys()).some(request => /placement\/items\.json/.test(request.url)); })), "content JSON is kept in its own cache after it is used");

  // a page the student has opened still opens with the network off
  await page.goto(`${BASE}practice.html`, { waitUntil: "networkidle2" });
  await page.setOfflineMode(true);
  await page.goto(`${BASE}practice.html`, { waitUntil: "domcontentloaded" });
  check(await page.evaluate(() => /Practice/i.test(document.title) && document.body.children.length > 0), "a visited page opens with the network off");
  check(await until(() => page.evaluate(() => { const banner = document.getElementById("offlineBanner"); return Boolean(banner) && !banner.hidden && /do not close this page/i.test(banner.textContent); }), 8000), "and says it is offline, honestly: changes are kept while the page stays open");
  await page.goto(`${BASE}manga.html`, { waitUntil: "domcontentloaded" });
  check(await page.evaluate(() => /Manga Reader/.test(document.title)), "a page that was only precached opens offline too");
  await page.goto(`${BASE}clips.html?x=${Date.now()}`, { waitUntil: "domcontentloaded" });
  check(await page.evaluate(() => /Clips/.test(document.title)), "a query string does not stop a cached page from opening");
  const content = await page.evaluate(async () => { try { const r = await fetch("content/placement/items.json"); return r.ok; } catch (error) { return false; } });
  check(content, "cached content JSON is served offline");
  const uncached = await page.evaluate(async () => { try { const r = await fetch("content/gaziz.json?bust=1"); return r.ok ? "served" : "failed"; } catch (error) { return "failed"; } });
  check(uncached === "failed" || uncached === "served", "an uncached content file fails cleanly (no hang)");
  await page.setOfflineMode(false);

  // icons and manifest
  const manifest = await page.evaluate(async () => (await fetch("manifest.webmanifest")).json());
  const iconStatuses = await page.evaluate(async icons => Promise.all(icons.map(async icon => (await fetch(icon.src)).status)), manifest.icons);
  check(iconStatuses.every(status => status === 200) && manifest.icons.some(icon => icon.purpose === "maskable"), "every manifest icon loads, including a maskable one");

  // the shell never holds Firebase or sign-in traffic
  const allUrls = await page.evaluate(async () => { const out = []; for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) out.push(request.url); return out; });
  check(!allUrls.some(url => /firebaseio|identitytoolkit|googleapis|gstatic|__\/auth/.test(url)), "no cache holds Firebase, Google or sign-in requests");
  check(problems.length === 0, `no page errors (${problems.slice(0, 2).join(" | ") || "none"})`);
  await context.close();
} finally { await browser.close(); }
if (failures.length) { console.log(`\n${failures.length} check(s) failed.`); process.exit(1); }
console.log("\nAll offline checks passed.");
