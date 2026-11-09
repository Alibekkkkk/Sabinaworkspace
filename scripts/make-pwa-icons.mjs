// Renders assets/pwa/icon.svg to the PNG icons the install prompt needs:  node scripts/make-pwa-icons.mjs
// icon-192.png and icon-512.png (rounded, "any"), icon-maskable-512.png (full-bleed with the artwork inside the safe zone),
// and apple-touch-icon.png (180). Uses the local Chrome or Edge; the PNGs are committed, so this only runs when the icon changes.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(path => existsSync(path));
if (!executable) throw new Error("No Chrome/Edge found. Set CHROME_PATH.");
const svg = readFileSync(new URL("../assets/pwa/icon.svg", import.meta.url), "utf8");
const data = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
const BACKGROUND = "#141a25";
const jobs = [
  { file: "icon-192.png", size: 192, inset: 0, rounded: true },
  { file: "icon-512.png", size: 512, inset: 0, rounded: true },
  { file: "icon-maskable-512.png", size: 512, inset: 0.18, rounded: false }, // the safe zone is the inner 80%
  { file: "apple-touch-icon.png", size: 180, inset: 0, rounded: false }
];
const browser = await puppeteer.launch({ executablePath: executable, headless: true, args: ["--no-sandbox"] });
try {
  for (const job of jobs) {
    const page = await browser.newPage(); await page.setViewport({ width: job.size, height: job.size, deviceScaleFactor: 1 });
    const pad = Math.round(job.size * job.inset);
    await page.setContent(`<body style="margin:0;background:${job.rounded ? "transparent" : BACKGROUND};width:${job.size}px;height:${job.size}px"><img src="${data}" style="position:absolute;left:${pad}px;top:${pad}px;width:${job.size - 2 * pad}px;height:${job.size - 2 * pad}px"></body>`);
    await page.waitForFunction(() => document.images[0].complete);
    const png = await page.screenshot({ type: "png", omitBackground: job.rounded });
    writeFileSync(new URL(`../assets/pwa/${job.file}`, import.meta.url), png); await page.close();
    console.log(`wrote assets/pwa/${job.file}`);
  }
} finally { await browser.close(); }
