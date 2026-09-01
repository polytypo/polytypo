// Shared build-tooling copy of the engine's LETTER predicate (ARCHITECTURE.md 4.1: no regex,
// no platform locale helper, no normalization — a pinned code-point table only).
//
// scripts/*.mjs are plain ESM, run directly with `node` and no TS build step, so they cannot
// import src/engine/unicode.ts (Node 20, in the CI matrix, has no native TypeScript support).
// They therefore re-parse the SAME data file the engine imports — src/engine/letter-ranges.json
// — rather than embedding a second copy of the table that could drift from it. Only the binary
// search (mechanical, unambiguous, exercised by tests/engine/unicode.test.ts on the engine side)
// is duplicated; the data, which is the part that could actually drift, is not.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LETTER_RANGES = JSON.parse(
  readFileSync(join(HERE, "..", "..", "src", "engine", "letter-ranges.json"), "utf8"),
);

/** True for a code point in Lu, Ll, Lt, Lm, Lo, Mn, Mc or Me. Mirrors src/engine/unicode.ts. */
export function isLetterCp(cp) {
  if (cp < 0) return false;
  if (cp < 0x80) return (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a);
  let lo = 0;
  let hi = LETTER_RANGES.length / 2 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const start = LETTER_RANGES[mid * 2];
    const end = LETTER_RANGES[mid * 2 + 1];
    if (cp < start) hi = mid - 1;
    else if (cp > end) lo = mid + 1;
    else return true;
  }
  return false;
}

/** True iff every code point of `s` is LETTER, and `s` is non-empty. */
export function isAllLetters(s) {
  if (typeof s !== "string" || s.length === 0) return false;
  for (const ch of s) {
    if (!isLetterCp(ch.codePointAt(0))) return false;
  }
  return true;
}
