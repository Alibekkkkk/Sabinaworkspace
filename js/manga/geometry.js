// Pure geometry for manga pages. A box is [x, y, width, height] in image pixels.

const finite = n => typeof n === "number" && Number.isFinite(n);

export function isBox(box) { return Array.isArray(box) && box.length === 4 && box.every(finite) && box[2] > 0 && box[3] > 0 && box[0] >= 0 && box[1] >= 0; }

// Does the box sit completely inside an image of the given size?
export function bboxInside(box, width, height) { return isBox(box) && box[0] + box[2] <= width && box[1] + box[3] <= height; }

// Does `inner` sit completely inside `outer`?
export function bboxWithin(inner, outer) { return isBox(inner) && isBox(outer) && inner[0] >= outer[0] && inner[1] >= outer[1] && inner[0] + inner[2] <= outer[0] + outer[2] && inner[1] + inner[3] <= outer[1] + outer[3]; }

const round = n => Math.round(n * 1000) / 1000;

// Where a hotspot goes over the page image, as percentages of the page (so it scales with the image).
export function hotspotStyle(box, page) {
  return { left: `${round((box[0] / page.width) * 100)}%`, top: `${round((box[1] / page.height) * 100)}%`, width: `${round((box[2] / page.width) * 100)}%`, height: `${round((box[3] / page.height) * 100)}%` };
}

// Panel-by-panel view: a frame with the panel's proportions and the page image sized and shifted inside it so only the panel shows.
export function panelFrame(panelBox, page) {
  const [x, y, w, h] = panelBox;
  return { aspect: round(w / h), imageWidth: round((page.width / w) * 100), left: round((-x / w) * 100), top: round((-y / h) * 100) };
}

// Panels in reading order: rows from top to bottom (panels whose vertical ranges overlap by more than half share a row),
// and within a row left to right, or right to left for rtl. A vertical (webtoon) story reads strictly top to bottom.
export function orderPanels(panels, direction = "ltr") {
  const sorted = [...panels].sort((a, b) => a.bbox[1] - b.bbox[1] || a.bbox[0] - b.bbox[0]);
  const rows = [];
  for (const panel of sorted) {
    const row = rows.find(r => { const top = Math.max(r.top, panel.bbox[1]); const bottom = Math.min(r.bottom, panel.bbox[1] + panel.bbox[3]); return bottom - top > Math.min(r.bottom - r.top, panel.bbox[3]) / 2; });
    if (row) { row.items.push(panel); row.top = Math.min(row.top, panel.bbox[1]); row.bottom = Math.max(row.bottom, panel.bbox[1] + panel.bbox[3]); }
    else rows.push({ top: panel.bbox[1], bottom: panel.bbox[1] + panel.bbox[3], items: [panel] });
  }
  return rows.flatMap(row => row.items.sort((a, b) => (direction === "rtl" ? b.bbox[0] - a.bbox[0] : a.bbox[0] - b.bbox[0]) || a.bbox[1] - b.bbox[1]));
}

// Which bubble does a point (in image pixels) fall in? Used by tests and by tap handling on touch devices.
export function bubbleAt(panels, x, y) {
  for (const panel of panels) for (const bubble of panel.bubbles) { const [bx, by, bw, bh] = bubble.at; if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) return bubble; }
  return null;
}
