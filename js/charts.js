// Tiny dependency-free inline SVG charts (no chart library). All text goes through textContent, all
// colours through design tokens, and every chart carries a text alternative for screen readers.
const NS = "http://www.w3.org/2000/svg";

function svg(tag, attrs = {}, parent) {
  const element = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, String(value));
  if (parent) parent.append(element);
  return element;
}

// Horizontal bars, one per item: [{ label, value (0..1), note }]. Lowest value first reads as "weakest".
export function barChart(items, { width = 320, barHeight = 22, gap = 8, labelWidth = 120, title = "Bar chart" } = {}) {
  const rows = (Array.isArray(items) ? items : []).slice(0, 12);
  const height = Math.max(1, rows.length) * (barHeight + gap);
  const chart = svg("svg", { viewBox: `0 0 ${width} ${height}`, width: "100%", role: "img", class: "ds-chart", "aria-label": title });
  svg("title", {}, chart).textContent = title;
  const trackWidth = width - labelWidth - 40;
  rows.forEach((row, index) => {
    const y = index * (barHeight + gap);
    const value = Math.min(1, Math.max(0, Number(row.value) || 0));
    const label = svg("text", { x: 0, y: y + barHeight * 0.7, class: "ds-chart__label" }, chart);
    label.textContent = String(row.label).slice(0, 18);
    svg("rect", { x: labelWidth, y, width: trackWidth, height: barHeight, rx: 6, class: "ds-chart__track" }, chart);
    svg("rect", { x: labelWidth, y, width: Math.max(2, trackWidth * value), height: barHeight, rx: 6, class: value < 0.6 ? "ds-chart__bar ds-chart__bar--low" : "ds-chart__bar" }, chart);
    const percent = svg("text", { x: labelWidth + trackWidth + 6, y: y + barHeight * 0.7, class: "ds-chart__value" }, chart);
    percent.textContent = `${Math.round(value * 100)}%`;
  });
  return chart;
}

// Line over time: values are numbers 0..1 in order (oldest first). Adds dots so a single point is visible.
export function sparkline(values, { width = 320, height = 72, title = "Trend" } = {}) {
  const points = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite).slice(-30);
  const chart = svg("svg", { viewBox: `0 0 ${width} ${height}`, width: "100%", role: "img", class: "ds-chart", "aria-label": title });
  svg("title", {}, chart).textContent = title;
  svg("line", { x1: 0, y1: height - 4, x2: width, y2: height - 4, class: "ds-chart__axis" }, chart);
  if (!points.length) return chart;
  const step = points.length > 1 ? (width - 16) / (points.length - 1) : 0;
  const coordinates = points.map((value, index) => [8 + index * step, 6 + (height - 16) * (1 - Math.min(1, Math.max(0, value)))]);
  if (coordinates.length > 1) {
    svg("polyline", { points: coordinates.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "), class: "ds-chart__line", fill: "none" }, chart);
  }
  for (const [x, y] of coordinates) svg("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: 3.5, class: "ds-chart__dot" }, chart);
  return chart;
}
