// English-teaching board templates. Each builds ordinary board objects (shapes and text) around an origin, so a
// template can be moved, edited and erased like anything the student draws.
import { localisePoints } from "./geometry.js";
import { defaultStyle, shapeObject, textObject } from "./model.js";

export const TEMPLATES = Object.freeze([
  { id: "timeline", name: "Tense timeline", description: "Past, now and future on one line, for choosing a tense." },
  { id: "tchart", name: "T-chart", description: "Two columns: compare, sort, or pros and cons." },
  { id: "sentence", name: "Sentence builder", description: "Subject, verb, object and extra boxes to build sentences." },
  { id: "mindmap", name: "Mind map", description: "A centre topic with six branches for vocabulary." },
  { id: "venn", name: "Venn diagram", description: "Two circles to compare two things." },
  { id: "family", name: "Word-family tree", description: "A base word with noun, verb, adjective and adverb branches." }
]);

function context(origin, by, now) {
  let z = 1;
  const base = { by, now };
  const ink = defaultStyle({ w: 3 });
  const out = [];
  const place = object => { object.z = z; z += 0.001; out.push(object); return object; };
  return {
    out,
    rect: (x, y, w, h, style = ink) => place(shapeObject("rect", { x: origin.x + x, y: origin.y + y, w, h }, { ...base, style })),
    ellipse: (x, y, w, h, style = ink) => place(shapeObject("ellipse", { x: origin.x + x, y: origin.y + y, w, h }, { ...base, style })),
    line: (x1, y1, x2, y2, arrow = false, style = ink) => {
      const local = localisePoints([[origin.x + x1, origin.y + y1, 0.5], [origin.x + x2, origin.y + y2, 0.5]]);
      return place(shapeObject(arrow ? "arrow" : "line", { x: local.x, y: local.y, w: local.w, h: local.h }, { ...base, style, points: local.points }));
    },
    label: (x, y, content, fs = 24, w = 320) => place(textObject({ x: origin.x + x, y: origin.y + y, w, h: Math.ceil(fs * 1.4) * content.split("\n").length }, content, { ...base, style: defaultStyle({ fs }) }))
  };
}

const builders = {
  timeline(c) {
    c.line(0, 160, 1100, 160, true, defaultStyle({ w: 5 }));
    for (const [x, name] of [[100, "PAST"], [500, "NOW"], [900, "FUTURE"]]) { c.line(x, 140, x, 180); c.label(x - 60, 60, name, 28, 160); }
    c.label(40, 200, "Past simple\nPast continuous\nPast perfect", 22, 280);
    c.label(440, 200, "Present simple\nPresent continuous\nPresent perfect", 22, 300);
    c.label(840, 200, "will + verb\nbe going to\nFuture continuous", 22, 280);
  },
  tchart(c) {
    c.rect(0, 0, 900, 560);
    c.line(450, 0, 450, 560);
    c.line(0, 80, 900, 80);
    c.label(120, 20, "Heading A", 30, 260); c.label(570, 20, "Heading B", 30, 260);
  },
  sentence(c) {
    const names = ["Who? (subject)", "Does what? (verb)", "What? (object)", "Where / when?"];
    names.forEach((name, i) => { c.rect(i * 300, 80, 280, 140); c.label(i * 300 + 10, 20, name, 22, 270); });
    c.label(0, 250, "Build a sentence: move a box, or type in each one.", 22, 900);
  },
  mindmap(c) {
    c.ellipse(350, 250, 300, 160, defaultStyle({ w: 4 }));
    c.label(410, 315, "Topic", 32, 180);
    const spots = [[40, 20], [380, 0], [720, 20], [40, 480], [380, 520], [720, 480]];
    spots.forEach(([x, y]) => { c.line(500, 330, x + 120, y + 60, false, defaultStyle({ w: 3 })); c.ellipse(x, y, 240, 120); });
  },
  venn(c) {
    c.ellipse(0, 0, 520, 520); c.ellipse(380, 0, 520, 520);
    c.label(60, 240, "Only A", 26, 200); c.label(360, 240, "Both", 26, 160); c.label(660, 240, "Only B", 26, 200);
  },
  family(c) {
    c.rect(300, 0, 300, 100, defaultStyle({ w: 4 })); c.label(340, 25, "base word", 30, 240);
    [["noun", 0], ["verb", 240], ["adjective", 480], ["adverb", 720]].forEach(([name, x]) => {
      c.line(450, 100, x + 90, 220, true); c.rect(x, 220, 180, 100); c.label(x + 10, 170, name, 22, 170);
    });
  }
};

export function buildTemplate(id, origin = { x: 200, y: 200 }, { by = "", now = Date.now() } = {}) {
  const build = builders[id];
  if (!build) throw new Error(`Unknown template: ${id}`);
  const c = context(origin, by, now);
  build(c);
  return c.out;
}
