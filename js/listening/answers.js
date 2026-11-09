// Dictation answer matching, letter diffs and token alignment. Pure functions.
import { bareWord, tokenize } from "./schema.js";

// UK <-> US spelling pairs, written as [UK, US]. Inflected forms (-s, -ed, -d, -ing) are generated.
const PAIRS = [
  ["colour", "color"], ["favourite", "favorite"], ["neighbour", "neighbor"], ["behaviour", "behavior"], ["honour", "honor"], ["labour", "labor"],
  ["harbour", "harbor"], ["humour", "humor"], ["flavour", "flavor"], ["rumour", "rumor"], ["savour", "savor"], ["vapour", "vapor"], ["odour", "odor"],
  ["centre", "center"], ["metre", "meter"], ["litre", "liter"], ["theatre", "theater"], ["fibre", "fiber"], ["calibre", "caliber"], ["spectre", "specter"],
  ["defence", "defense"], ["offence", "offense"], ["licence", "license"], ["pretence", "pretense"],
  ["organise", "organize"], ["realise", "realize"], ["recognise", "recognize"], ["apologise", "apologize"], ["criticise", "criticize"], ["emphasise", "emphasize"],
  ["memorise", "memorize"], ["summarise", "summarize"], ["civilise", "civilize"], ["energise", "energize"], ["specialise", "specialize"], ["minimise", "minimize"],
  ["analyse", "analyze"], ["paralyse", "paralyze"], ["catalyse", "catalyze"],
  ["travelled", "traveled"], ["travelling", "traveling"], ["traveller", "traveler"], ["cancelled", "canceled"], ["cancelling", "canceling"], ["labelled", "labeled"], ["labelling", "labeling"],
  ["modelled", "modeled"], ["modelling", "modeling"], ["counsellor", "counselor"], ["jewellery", "jewelry"],
  ["grey", "gray"], ["mould", "mold"], ["plough", "plow"], ["tyre", "tire"], ["programme", "program"], ["catalogue", "catalog"], ["dialogue", "dialog"],
  ["aluminium", "aluminum"], ["cheque", "check"], ["kerb", "curb"], ["pyjamas", "pajamas"], ["sceptical", "skeptical"], ["ageing", "aging"], ["whisky", "whiskey"],
  ["sulphur", "sulfur"], ["storey", "story"], ["draught", "draft"], ["manoeuvre", "maneuver"], ["oestrogen", "estrogen"], ["anaemia", "anemia"], ["encyclopaedia", "encyclopedia"]
];
const TO_US = new Map();
for (const [uk, us] of PAIRS) {
  for (const suffix of ["", "s", "ed", "d", "ing", "r", "rs"]) TO_US.set(`${uk}${suffix}`, `${us}${suffix}`);
  TO_US.set(us, us);
}

export const canonicalWord = word => {
  const bare = bareWord(word);
  return TO_US.get(bare) || bare;
};

// Whole-input normalisation for one gap: case, curly quotes, surrounding punctuation and spaces.
export const normalizeTyped = text => bareWord(String(text || "").normalize("NFC").trim());

// Is `typed` an accepted answer for word `index` of the item? Teachers widen it with item.alternatives[index].
export function checkGap(item, index, typed) {
  const tokens = tokenize(item.text);
  const expected = bareWord(tokens[index]);
  const accepted = [expected, ...((item.alternatives && item.alternatives[String(index)]) || [])].map(canonicalWord).filter(Boolean);
  const attempt = canonicalWord(normalizeTyped(typed));
  return { ok: Boolean(attempt) && accepted.includes(attempt), expected, typed: normalizeTyped(typed) };
}

// ---- alignment ------------------------------------------------------------------------------------------

// Levenshtein alignment of two sequences. Returns ops in order:
// { op: "match" | "sub" | "miss" | "extra", a?, b? }  (miss = in `a` only, extra = in `b` only)
export function align(a, b, equal = (x, y) => x === y) {
  const rows = a.length + 1; const cols = b.length + 1;
  const cost = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i++) cost[i][0] = i;
  for (let j = 0; j < cols; j++) cost[0][j] = j;
  for (let i = 1; i < rows; i++) for (let j = 1; j < cols; j++) {
    cost[i][j] = Math.min(cost[i - 1][j] + 1, cost[i][j - 1] + 1, cost[i - 1][j - 1] + (equal(a[i - 1], b[j - 1]) ? 0 : 1));
  }
  const ops = [];
  let i = a.length; let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && cost[i][j] === cost[i - 1][j - 1] + (equal(a[i - 1], b[j - 1]) ? 0 : 1)) {
      ops.push(equal(a[i - 1], b[j - 1]) ? { op: "match", a: a[i - 1], b: b[j - 1] } : { op: "sub", a: a[i - 1], b: b[j - 1] });
      i--; j--;
    } else if (i > 0 && cost[i][j] === cost[i - 1][j] + 1) { ops.push({ op: "miss", a: a[i - 1] }); i--; }
    else { ops.push({ op: "extra", b: b[j - 1] }); j--; }
  }
  return ops.reverse();
}

// Letter-level view of a wrong answer: the correct word with each letter marked "ok" or "wrong" (typed wrongly or
// left out), plus the letters that were typed but do not belong. Used to show WHERE the spelling differs.
export function diffWord(expected, typed) {
  const want = [...String(expected || "")];
  const got = [...String(typed || "").toLowerCase()];
  const ops = align(want.map(ch => ch.toLowerCase()), got);
  const letters = []; const extra = [];
  let at = 0;
  for (const entry of ops) {
    if (entry.op === "extra") { extra.push(entry.b); continue; }
    letters.push({ char: want[at], status: entry.op === "match" ? "ok" : "wrong" });
    at += 1;
  }
  return { letters, extra, exact: letters.every(letter => letter.status === "ok") && !extra.length };
}
