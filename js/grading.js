// Shared answer grader for lessons and homework.
//
// Two modes:
//   "exact" - grammar items. The answer must equal an accepted answer after normalisation
//             (case, whitespace, curly quotes, trailing punctuation, UK/US spelling,
//             contractions). Nothing else is forgiven, and auxiliaries/negations are never
//             dropped, so "did not go" never matches "did go".
//   "fuzzy" - reading / short answers. As "exact", plus a bounded typo allowance: a word of
//             6+ letters may differ from the accepted word by one edit (Levenshtein <= 1).
//             Shorter words, numbers and word counts must match exactly.
// Teachers widen what is accepted by listing alternatives in the `accepted` array.

const UK_TO_US = new Map(Object.entries({
  organise: "organize", organised: "organized", organising: "organizing", organisation: "organization",
  realise: "realize", realised: "realized", realising: "realizing",
  recognise: "recognize", recognised: "recognized", recognising: "recognizing",
  apologise: "apologize", apologised: "apologized",
  criticise: "criticize", criticised: "criticized",
  summarise: "summarize", summarised: "summarized",
  memorise: "memorize", memorised: "memorized",
  specialise: "specialize", specialised: "specialized",
  centre: "center", centres: "centers", metre: "meter", litre: "liter", theatre: "theater",
  colour: "color", colours: "colors", coloured: "colored", favourite: "favorite", favourites: "favorites",
  neighbour: "neighbor", neighbours: "neighbors", behaviour: "behavior", honour: "honor",
  humour: "humor", labour: "labor", flavour: "flavor", harbour: "harbor",
  learnt: "learned", dreamt: "dreamed", burnt: "burned", spelt: "spelled", spoilt: "spoiled",
  travelling: "traveling", travelled: "traveled", traveller: "traveler",
  cancelled: "canceled", cancelling: "canceling", modelling: "modeling", labelled: "labeled",
  grey: "gray", programme: "program", programmes: "programs", cheque: "check",
  defence: "defense", offence: "offense", licence: "license", practise: "practice",
  catalogue: "catalog", dialogue: "dialog", analyse: "analyze", analysed: "analyzed",
  tyre: "tire", kerb: "curb", plough: "plow", aluminium: "aluminum", whilst: "while", amongst: "among"
}));

const IRREGULAR_CONTRACTIONS = [
  [/\bcan't\b/g, "cannot"],
  [/\bcannot\b/g, "cannot"],
  [/\bwon't\b/g, "will not"],
  [/\bshan't\b/g, "shall not"],
  [/\bain't\b/g, "am not"]
];

const PRONOUN_IS = /\b(it|he|she|that|there|here|what|who|where|how)'s\b/g;

export function expandContractions(text) {
  let output = text;
  for (const [pattern, replacement] of IRREGULAR_CONTRACTIONS) output = output.replace(pattern, replacement);
  return output
    .replace(PRONOUN_IS, "$1 is")
    .replace(/\blet's\b/g, "let us")
    .replace(/n't\b/g, " not")
    .replace(/'re\b/g, " are")
    .replace(/'m\b/g, " am")
    .replace(/'ll\b/g, " will")
    .replace(/'ve\b/g, " have");
  // 's (possessive / is / has) and 'd (would / had) are deliberately left alone: they are
  // ambiguous, so a teacher lists the wanted form in `accepted`.
}

export function normalizeAnswer(value) {
  let text = String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‛ʼ′`]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  text = expandContractions(text);
  text = text.replace(/[\s.,!?;:"'()\[\]{}]+$/g, "").replace(/^[\s"'(\[{]+/g, "");
  return text
    .split(" ")
    .filter(Boolean)
    .map(word => UK_TO_US.get(word.replace(/[.,!?;:"()\[\]{}]/g, "")) ?? word.replace(/[,;:"()\[\]{}]/g, ""))
    .join(" ")
    .trim();
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length];
}

const MIN_FUZZY_WORD_LENGTH = 6;

// "garden"/"gardens" or "agree"/"agreed" differ by one letter but are different grammatical
// forms, not typos, so they are never forgiven.
function isInflectionSlip(word, target) {
  const [shorter, longer] = word.length < target.length ? [word, target] : [target, word];
  return longer.length === shorter.length + 1 && longer.startsWith(shorter) && /[sd]$/.test(longer);
}

function wordsMatchWithTypoAllowance(userWords, targetWords) {
  if (userWords.length !== targetWords.length) return false;
  return userWords.every((word, index) => {
    const target = targetWords[index];
    if (word === target) return true;
    if (target.length < MIN_FUZZY_WORD_LENGTH || /\d/.test(target) || /\d/.test(word)) return false;
    if (isInflectionSlip(word, target)) return false;
    return levenshtein(word, target) <= 1;
  });
}

export function isAnswerCorrect(userAnswer, accepted, { mode = "exact" } = {}) {
  const user = normalizeAnswer(userAnswer);
  if (!user) return false;
  const candidates = (Array.isArray(accepted) ? accepted : [accepted])
    .filter(candidate => candidate !== undefined && candidate !== null)
    .map(normalizeAnswer)
    .filter(Boolean);
  if (candidates.includes(user)) return true;
  if (mode !== "fuzzy") return false;
  const userWords = user.split(" ");
  return candidates.some(candidate => wordsMatchWithTypoAllowance(userWords, candidate.split(" ")));
}
