import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import { CODE_ALPHABET, CODE_LENGTH, generateStudentCode } from "../js/student-code.js";

test("generated codes are 8 characters from the look-alike-free alphabet and match the rules pattern", () => {
  for (let index = 0; index < 500; index++) {
    const code = generateStudentCode(webcrypto);
    assert.equal(code.length, CODE_LENGTH);
    assert.match(code, /^[A-Z0-9]{4,12}$/);
    assert.match(code, new RegExp(`^[${CODE_ALPHABET}]+$`));
    assert.doesNotMatch(code, /[01ILO]/);
  }
});

test("codes are not repeated across a large sample", () => {
  const seen = new Set(Array.from({ length: 5000 }, () => generateStudentCode(webcrypto)));
  assert.equal(seen.size, 5000);
});

test("every symbol is reachable and distribution is roughly uniform", () => {
  const counts = new Map();
  for (let index = 0; index < 4000; index++) {
    for (const character of generateStudentCode(webcrypto)) counts.set(character, (counts.get(character) ?? 0) + 1);
  }
  assert.equal(counts.size, CODE_ALPHABET.length);
  const expected = (4000 * CODE_LENGTH) / CODE_ALPHABET.length;
  for (const count of counts.values()) assert.ok(Math.abs(count - expected) < expected * 0.2);
});

test("a missing secure RNG is an error, never a weak fallback", () => {
  assert.throws(() => generateStudentCode(null), /secure random/);
  assert.throws(() => generateStudentCode({}), /secure random/);
});

test("rejection sampling discards biased bytes (>= 248) instead of wrapping them", () => {
  const batches = [new Uint8Array(16).fill(255), new Uint8Array(16).fill(0)];
  const fake = { getRandomValues(array) { array.set(batches.shift().subarray(0, array.length)); return array; } };
  assert.equal(generateStudentCode(fake), CODE_ALPHABET[0].repeat(CODE_LENGTH));
});
