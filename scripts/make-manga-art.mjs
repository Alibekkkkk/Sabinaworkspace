// Draws the placeholder pages for the demo story "The Garden Above the City". Every shape is made here from scratch, so the
// artwork is original and free to use with the demo (CC0). Run:  node scripts/make-manga-art.mjs
// Each page is 800 x 1200. Empty speech bubbles are drawn where the reader puts its tappable bubbles.
import { writeFileSync } from "node:fs";

const W = 800; const H = 1200;
const sky = "#bfe3f5"; const wall = "#d9c7b0"; const soil = "#7a5230"; const leaf = "#3f9b4f"; const ink = "#1f2933";
const person = (x, y, skin, shirt, scale = 1) => `<g transform="translate(${x} ${y}) scale(${scale})"><circle cx="0" cy="-70" r="26" fill="${skin}" stroke="${ink}" stroke-width="3"/><path d="M-34 60 Q-34 -34 0 -34 Q34 -34 34 60 Z" fill="${shirt}" stroke="${ink}" stroke-width="3"/><circle cx="-9" cy="-72" r="3" fill="${ink}"/><circle cx="9" cy="-72" r="3" fill="${ink}"/><path d="M-9 -58 Q0 -50 9 -58" fill="none" stroke="${ink}" stroke-width="3"/></g>`;
const plant = (x, y, s = 1, fruit = false) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0 L0 -60" stroke="${leaf}" stroke-width="6"/><ellipse cx="-16" cy="-50" rx="18" ry="9" fill="${leaf}" transform="rotate(-25 -16 -50)"/><ellipse cx="16" cy="-62" rx="18" ry="9" fill="${leaf}" transform="rotate(25 16 -62)"/>${fruit ? '<circle cx="0" cy="-20" r="9" fill="#d94a3a" stroke="#8a2a20" stroke-width="2"/>' : ""}</g>`;
const bed = (x, y, w) => `<rect x="${x}" y="${y}" width="${w}" height="40" rx="6" fill="${soil}" stroke="${ink}" stroke-width="3"/>`;
const bubble = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2.4}" fill="#fff" stroke="${ink}" stroke-width="3"/>`;
const frame = (x, y, w, h, body) => `<g><clipPath id="c${x}-${y}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath><g clip-path="url(#c${x}-${y})">${body}</g><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${ink}" stroke-width="6"/></g>`;
const page = (title, desc, panels) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d"><title id="t">${title}</title><desc id="d">${desc}</desc><rect width="${W}" height="${H}" fill="#fffdf7"/>${panels.join("")}</svg>\n`;
const people = (xs, y, skins, shirts, scale) => xs.map((x, i) => person(x, y, skins[i], shirts[i], scale)).join("");

const pages = {
  "garden-p1": page("The garden above the city, page 1", "Original placeholder art: a student on a roof, an empty bed, and a neighbour at a door.", [
    frame(20, 20, 760, 380, `<rect x="20" y="20" width="760" height="380" fill="${sky}"/><rect x="20" y="300" width="760" height="100" fill="${wall}"/>${[60, 200, 330, 520, 650].map((x, i) => `<rect x="${x}" y="${150 + (i % 2) * 40}" width="90" height="${250 - (i % 2) * 40}" fill="#9fb3c2" stroke="${ink}" stroke-width="3"/>`).join("")}${person(160, 300, "#e8b894", "#e0703c")}${bubble(60, 40, 330, 110)}`),
    frame(20, 420, 370, 380, `<rect x="20" y="420" width="370" height="380" fill="#eaf4e4"/>${bed(70, 650, 270)}${bed(70, 720, 270)}<ellipse cx="205" cy="540" rx="70" ry="30" fill="#c9d6dd"/>${bubble(40, 440, 240, 90)}`),
    frame(410, 420, 370, 380, `<rect x="410" y="420" width="370" height="380" fill="#f3e6d3"/><rect x="560" y="520" width="140" height="280" fill="#a0724a" stroke="${ink}" stroke-width="3"/>${person(520, 720, "#c68f6a", "#4a7fb5", 0.9)}${bubble(430, 440, 330, 90)}`),
    frame(20, 820, 760, 360, `<rect x="20" y="820" width="760" height="360" fill="${sky}"/><rect x="20" y="1060" width="760" height="120" fill="${wall}"/>${bed(200, 1030, 400)}${person(120, 1060, "#e8b894", "#e0703c")}${person(690, 1060, "#c68f6a", "#4a7fb5")}${bubble(80, 840, 340, 100)}${bubble(430, 840, 320, 100)}`)
  ]),
  "garden-p2": page("The garden above the city, page 2", "Original placeholder art: neighbours carry pots to the roof and plant seeds.", [
    frame(20, 20, 760, 340, `<rect x="20" y="20" width="760" height="340" fill="#cfeadd"/>${people([220, 420, 620], 300, ["#c68f6a", "#e0b080", "#e8b894"], ["#4a7fb5", "#8a5fb0", "#e0703c"], 0.9)}<rect x="60" y="300" width="60" height="40" fill="#b5651d" stroke="${ink}" stroke-width="3"/>${bubble(40, 40, 360, 110)}${bubble(430, 40, 320, 110)}`),
    frame(20, 380, 760, 400, `<rect x="20" y="380" width="760" height="400" fill="${sky}"/><rect x="20" y="640" width="760" height="140" fill="${wall}"/>${bed(100, 620, 600)}${[160, 260, 360, 460, 560].map(x => plant(x, 620, 0.6)).join("")}${person(80, 700, "#e8b894", "#e0703c", 0.8)}${bubble(260, 400, 440, 100)}`),
    frame(20, 800, 370, 380, `<rect x="20" y="800" width="370" height="380" fill="#dbe9f4"/><path d="M120 900 L180 1000 L120 1000 L200 1100" stroke="#5b8bb5" stroke-width="6" fill="none"/><circle cx="260" cy="900" r="40" fill="#f6d55c" stroke="${ink}" stroke-width="3"/>${bubble(40, 1090, 320, 70)}`),
    frame(410, 800, 370, 380, `<rect x="410" y="800" width="370" height="380" fill="#eaf4e4"/>${bed(450, 1080, 290)}${[500, 590, 680].map(x => plant(x, 1080, 0.7)).join("")}${bubble(430, 820, 330, 100)}`)
  ]),
  "garden-p3": page("The garden above the city, page 3", "Original placeholder art: the garden is full of vegetables and the neighbours eat together.", [
    frame(20, 20, 760, 420, `<rect x="20" y="20" width="760" height="420" fill="${sky}"/><rect x="20" y="340" width="760" height="100" fill="${wall}"/>${bed(60, 300, 680)}${[110, 210, 310, 410, 510, 610].map(x => plant(x, 300, 0.9, true)).join("")}${bubble(380, 40, 380, 110)}`),
    frame(20, 460, 760, 420, `<rect x="20" y="460" width="760" height="420" fill="#f3e6d3"/><ellipse cx="400" cy="720" rx="260" ry="80" fill="#a0724a" stroke="${ink}" stroke-width="3"/>${people([190, 400, 610], 700, ["#e8b894", "#c68f6a", "#e0b080"], ["#e0703c", "#4a7fb5", "#8a5fb0"], 0.8)}${bubble(40, 480, 340, 100)}${bubble(420, 480, 340, 100)}`),
    frame(20, 900, 760, 280, `<rect x="20" y="900" width="760" height="280" fill="#fbe6a6"/>${people([260, 540], 1130, ["#e8b894", "#c68f6a"], ["#e0703c", "#4a7fb5"], 0.9)}${bubble(180, 920, 440, 100)}`)
  ]),
  "garden-p4": page("The garden above the city, chapter 2 page 1", "Original placeholder art: the neighbours plan a market and make a sign.", [
    frame(20, 20, 760, 560, `<rect x="20" y="20" width="760" height="560" fill="${sky}"/><rect x="20" y="420" width="760" height="160" fill="${wall}"/><rect x="200" y="260" width="400" height="140" fill="#fff" stroke="${ink}" stroke-width="4"/><rect x="230" y="290" width="340" height="80" fill="#fbe6a6" stroke="${ink}" stroke-width="2"/>${people([120, 680], 540, ["#c68f6a", "#e8b894"], ["#4a7fb5", "#e0703c"], 0.9)}${bubble(40, 40, 360, 100)}${bubble(420, 40, 340, 100)}`),
    frame(20, 600, 760, 580, `<rect x="20" y="600" width="760" height="580" fill="#eaf4e4"/><rect x="120" y="850" width="560" height="40" fill="#a0724a" stroke="${ink}" stroke-width="3"/>${[180, 280, 380, 480, 580].map(x => `<circle cx="${x}" cy="830" r="24" fill="#d94a3a" stroke="#8a2a20" stroke-width="2"/>`).join("")}${people([220, 580], 1100, ["#e0b080", "#e8b894"], ["#8a5fb0", "#e0703c"], 0.9)}${bubble(40, 620, 340, 100)}${bubble(420, 620, 340, 100)}`)
  ]),
  "garden-p5": page("The garden above the city, chapter 2 page 2", "Original placeholder art: customers visit the market and the garden grows.", [
    frame(20, 20, 760, 540, `<rect x="20" y="20" width="760" height="540" fill="${sky}"/><rect x="20" y="440" width="760" height="120" fill="${wall}"/>${people([150, 300, 450, 600], 520, ["#e8b894", "#c68f6a", "#e0b080", "#d8a07a"], ["#e0703c", "#4a7fb5", "#8a5fb0", "#3f9b4f"], 0.7)}${bubble(40, 40, 360, 100)}${bubble(430, 40, 330, 100)}`),
    frame(20, 580, 760, 600, `<rect x="20" y="580" width="760" height="600" fill="#fbe6a6"/>${bed(120, 1000, 560)}${[170, 270, 370, 470, 570].map(x => plant(x, 1000, 1, true)).join("")}${person(400, 1130, "#e8b894", "#e0703c", 0.9)}${bubble(120, 600, 560, 110)}`)
  ])
};
for (const [name, svg] of Object.entries(pages)) writeFileSync(new URL(`../assets/manga/${name}.svg`, import.meta.url), svg);
console.log(`Wrote ${Object.keys(pages).length} pages.`);
