// quotes.md 3.2's Word definition requires elisionIdioms.left/.right to consist entirely of
// LETTER code points. This is not because the engine's literal matcher would fail to match a
// digit or punctuation code point in either field — it is a pure byte comparison and would
// match those exact bytes wherever they occur — but because an entry outside LETTER would let
// the veto fire on text no citation ever attested, exceeding what the normative Word
// definition authorises. scripts/validate-spec.mjs and scripts/gen-locales.mjs both reject such
// an entry at the data boundary, via scripts/lib/is-letter.mjs. This test exercises that shared
// module directly, and — the point that actually matters — proves it agrees with the engine's
// own LETTER predicate over every Unicode scalar value, so validation and runtime cannot
// silently drift apart on what counts as a letter.
import { describe, expect, it } from "vitest";
import { isAllLetters, isLetterCp } from "../../scripts/lib/is-letter.mjs";
import { isLetter } from "../../src/engine/unicode";

/** The full Unicode scalar-value range this project's LETTER predicate is defined over. */
const MAX_CODE_POINT = 0x10ffff;

describe("scripts/lib/is-letter.mjs — elisionIdioms.left/.right validation", () => {
  it("accepts a plain LETTER-only word", () => {
    expect(isAllLetters("rock")).toBe(true);
    expect(isAllLetters("roll")).toBe(true);
    expect(isAllLetters("Rock")).toBe(true);
  });

  it("rejects a word containing a digit", () => {
    expect(isAllLetters("rock5")).toBe(false);
    expect(isAllLetters("5rock")).toBe(false);
  });

  it("rejects a word containing punctuation", () => {
    expect(isAllLetters("roll!")).toBe(false);
    expect(isAllLetters("rock-n")).toBe(false);
    expect(isAllLetters("rock roll")).toBe(false); // an internal space is not a single word
  });

  it("rejects the empty string", () => {
    expect(isAllLetters("")).toBe(false);
  });

  it("accepts a non-ASCII LETTER-only word (no platform locale helper is involved)", () => {
    expect(isAllLetters("été")).toBe(true);
    expect(isAllLetters("café1")).toBe(false);
  });

  it("agrees with the engine's own isLetter (src/engine/unicode.ts) over every Unicode scalar value U+0000–U+10FFFF, including astral planes, so validation and runtime cannot drift apart", () => {
    // A single loop with one assertion at the end, not one assertion per code point (~1.1M of
    // them): a plain binary-search comparison over the full range runs in well under a second,
    // and per-code-point `expect` calls would make this test the suite's slowest by orders of
    // magnitude for no extra coverage. Report the first disagreement, if any, by code point.
    let firstMismatch: number | null = null;
    for (let cp = 0; cp <= MAX_CODE_POINT; cp += 1) {
      if (isLetterCp(cp) !== isLetter(cp)) {
        firstMismatch = cp;
        break;
      }
    }
    expect(
      firstMismatch === null
        ? null
        : `U+${firstMismatch.toString(16).toUpperCase().padStart(4, "0")}`,
    ).toBeNull();
  });
});
