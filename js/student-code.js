// Student codes are 8 characters from a 31-symbol alphabet without look-alikes (no 0/O, 1/I/L),
// drawn with the Web Crypto RNG. Bytes >= 248 are rejected so every symbol is equally likely
// (248 = 31 * 8). 31^8 is about 8.5e11 codes, and uniqueness is enforced by claiming
// `students/<code>` in a transaction, not by reading the students list.
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;
const UNBIASED_LIMIT = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length;

export function generateStudentCode(random = globalThis.crypto) {
  if (!random || typeof random.getRandomValues !== "function") {
    throw new Error("A secure random generator is required to create a student code.");
  }
  let code = "";
  while (code.length < CODE_LENGTH) {
    for (const byte of random.getRandomValues(new Uint8Array(CODE_LENGTH * 2))) {
      if (byte < UNBIASED_LIMIT && code.length < CODE_LENGTH) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    }
  }
  return code;
}
