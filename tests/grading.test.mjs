import assert from "node:assert/strict";
import test from "node:test";
import { isAnswerCorrect, levenshtein, normalizeAnswer } from "../js/grading.js";

// [user answer, accepted answers, mode, expected result, why]
const cases = [
  // --- exact matches and normalisation
  ["went", ["went"], "exact", true, "identical"],
  ["Went", ["went"], "exact", true, "case"],
  ["  went  ", ["went"], "exact", true, "outer whitespace"],
  ["has   been   waiting", ["has been waiting"], "exact", true, "inner whitespace"],
  ["went.", ["went"], "exact", true, "trailing full stop"],
  ["went!", ["went"], "exact", true, "trailing exclamation"],
  ["went ?", ["went"], "exact", true, "trailing question + space"],
  ["“has gone”", ["has gone"], "exact", true, "curly double quotes"],
  ["don’t", ["do not"], "exact", true, "curly apostrophe contraction"],
  ["don't", ["do not"], "exact", true, "contraction expands"],
  ["do not", ["don't"], "exact", true, "contraction in the key"],
  ["didn't go", ["did not go"], "exact", true, "didn't"],
  ["can't", ["cannot"], "exact", true, "can't"],
  ["cannot", ["can't"], "exact", true, "cannot"],
  ["won't", ["will not"], "exact", true, "won't"],
  ["I'm", ["I am"], "exact", true, "I'm"],
  ["they're", ["they are"], "exact", true, "they're"],
  ["we've", ["we have"], "exact", true, "we've"],
  ["she'll", ["she will"], "exact", true, "she'll"],
  ["it's raining", ["it is raining"], "exact", true, "it's -> it is"],
  ["he's tired", ["he is tired"], "exact", true, "he's -> he is"],
  ["let's go", ["let us go"], "exact", true, "let's"],
  ["went", ["gone", "went"], "exact", true, "second alternative accepted"],
  ["have gone", ["has gone", "have gone"], "exact", true, "teacher-listed alternative"],
  // --- UK / US spelling
  ["organise", ["organize"], "exact", true, "organise"],
  ["organize", ["organise"], "exact", true, "organize (key is UK)"],
  ["centre", ["center"], "exact", true, "centre"],
  ["learnt", ["learned"], "exact", true, "learnt"],
  ["colour", ["color"], "exact", true, "colour"],
  ["favourite", ["favorite"], "exact", true, "favourite"],
  ["travelling", ["traveling"], "exact", true, "travelling"],
  ["I have learnt it", ["I have learned it"], "exact", true, "spelling inside a sentence"],
  // --- exact mode must NOT forgive grammar
  ["did go", ["did not go"], "exact", false, "dropped negation"],
  ["did not go", ["did go"], "exact", false, "added negation"],
  ["didn't go", ["did go"], "exact", false, "negative contraction vs positive"],
  ["go", ["went"], "exact", false, "wrong tense"],
  ["goes", ["go"], "exact", false, "extra -s"],
  ["going", ["go"], "exact", false, "-ing suffix is not forgiven"],
  ["goed", ["go"], "exact", false, "-ed suffix is not forgiven"],
  ["has been", ["been"], "exact", false, "superset answer"],
  ["been", ["has been"], "exact", false, "subset answer"],
  ["in the morning", ["in morning"], "exact", false, "article change"],
  ["a", ["an"], "exact", false, "a vs an"],
  ["is", ["are"], "exact", false, "is vs are"],
  ["was", ["were"], "exact", false, "was vs were"],
  ["on", ["in"], "exact", false, "preposition"],
  ["have", ["has"], "exact", false, "have vs has"],
  ["will go", ["would go"], "exact", false, "will vs would"],
  ["can", ["could"], "exact", false, "modal"],
  ["goed home", ["went home"], "exact", false, "wrong word"],
  ["3", ["three"], "exact", false, "digit vs word needs a listed alternative"],
  ["three", ["three", "3"], "exact", true, "alternatives cover it"],
  ["He is", ["He was"], "exact", false, "tense"],
  ["", ["went"], "exact", false, "empty"],
  ["   ", ["went"], "exact", false, "blank"],
  ["went", [], "exact", false, "no accepted answers"],
  ["went", [""], "exact", false, "empty accepted answer"],
  ["it's", ["its"], "exact", false, "it's (it is) is not the possessive its"],
  // --- fuzzy mode
  ["communicate", ["communicate"], "fuzzy", true, "identical"],
  ["comunicate", ["communicate"], "fuzzy", true, "one missing letter, long word"],
  ["communikate", ["communicate"], "fuzzy", true, "one substituted letter, long word"],
  ["comunnicate", ["communicate"], "fuzzy", false, "missing m plus extra n is two edits"],
  ["communicatee", ["communicate"], "fuzzy", true, "one extra letter, long word"],
  ["comunicatte", ["communicate"], "fuzzy", false, "two edits"],
  ["trvel", ["travel"], "fuzzy", true, "6-letter word, one edit"],
  ["trvl", ["travel"], "fuzzy", false, "two edits"],
  ["go", ["do"], "fuzzy", false, "short words are exact only"],
  ["cat", ["cap"], "fuzzy", false, "3-letter word, one edit not forgiven"],
  ["house", ["horse"], "fuzzy", false, "5-letter word is below the typo threshold"],
  ["did not go", ["did go"], "fuzzy", false, "negation never fuzzy-matched"],
  ["did go", ["did not go"], "fuzzy", false, "negation never fuzzy-matched (reverse)"],
  ["he did not leave", ["he did leave"], "fuzzy", false, "dropped auxiliary"],
  ["in the garden", ["in the gardn"], "fuzzy", false, "typo in key is not special-cased for short stems"],
  ["in the gardens", ["in the garden"], "fuzzy", false, "plural slip is a grammar error, not a typo"],
  ["she walked quikly", ["she walked quickly"], "fuzzy", true, "typo inside a sentence"],
  ["she walked quickly home", ["she walked quickly"], "fuzzy", false, "extra words"],
  ["she quickly walked", ["she walked quickly"], "fuzzy", false, "word order matters"],
  ["12", ["13"], "fuzzy", false, "numbers must match exactly"],
  ["1999", ["1998"], "fuzzy", false, "years must match exactly"],
  ["Organise the meating", ["organize the meeting"], "fuzzy", true, "7-letter word with one substituted letter"],
  ["Organise the metaing", ["organize the meeting"], "fuzzy", false, "transposition costs two edits"],
  ["Organise the meetng", ["organize the meeting"], "fuzzy", true, "UK spelling plus one typo"]
];

test("grader table: normalisation, exact matching and bounded fuzzy matching", () => {
  assert.ok(cases.length >= 60, `expected 60+ cases, got ${cases.length}`);
  const failures = [];
  for (const [user, accepted, mode, expected, why] of cases) {
    const actual = isAnswerCorrect(user, accepted, { mode });
    if (actual !== expected) {
      failures.push(`${why}: ${JSON.stringify(user)} vs ${JSON.stringify(accepted)} [${mode}] -> ${actual}, wanted ${expected}`);
    }
  }
  assert.deepEqual(failures, []);
});

test("exact is the default mode", () => {
  assert.equal(isAnswerCorrect("comunicate", ["communicate"]), false);
});

test("accepts a single string as the accepted answer", () => {
  assert.equal(isAnswerCorrect("went", "went"), true);
});

test("normalizeAnswer is idempotent", () => {
  for (const [user] of cases) {
    const once = normalizeAnswer(user);
    assert.equal(normalizeAnswer(once), once, `not idempotent for ${JSON.stringify(user)}`);
  }
});

test("levenshtein distances", () => {
  assert.equal(levenshtein("", "abc"), 3);
  assert.equal(levenshtein("kitten", "sitting"), 3);
  assert.equal(levenshtein("same", "same"), 0);
  assert.equal(levenshtein("flaw", "lawn"), 2);
});
