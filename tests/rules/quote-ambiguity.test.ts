import { describe, it, expect } from "vitest";
import { toCodePoints } from "../../src/engine/codepoints";
import {
  computeAmbiguousShapeIndices,
  computeIdiomMatchedIndices,
  computePreserveIndices,
} from "../../src/rules/quote-ambiguity";
import { LOCALES } from "../../src/generated/locales";

const enUS = LOCALES["en-US"]!;
const enGB = LOCALES["en-GB"]!;

function indicesOf(text: string): number[] {
  return [...computeAmbiguousShapeIndices(toCodePoints(text))].sort((a, b) => a - b);
}

describe("quote-ambiguity — computeAmbiguousShapeIndices (quotes.md §3.2)", () => {
  it("matches 1, 2 and 3 LETTER code points enclosed, space-flanked on both sides", () => {
    expect(indicesOf("rock 'n' roll")).toEqual([5, 7]);
    expect(indicesOf("say 'no' now")).toEqual([4, 7]);
    expect(indicesOf("say 'yes' now")).toEqual([4, 8]);
  });

  it("does not match 4 or more LETTER code points enclosed", () => {
    expect(indicesOf("say 'like' now")).toEqual([]);
  });

  it("does not match digit or punctuation content", () => {
    expect(indicesOf("say '12' now")).toEqual([]);
    expect(indicesOf("say '@' now")).toEqual([]);
  });

  it("matches an astral LETTER (U+10400, DESERET CAPITAL LETTER LONG A)", () => {
    expect(indicesOf("say '\u{10400}' now")).toEqual([4, 6]);
  });

  it("does not match a leading elision (no left INLINE-SPACE, or at document start)", () => {
    expect(indicesOf("'Tis the season")).toEqual([]);
    expect(indicesOf("Back in the '90s")).toEqual([]);
  });

  it("does not match a trailing possessive (only one mark, not a pair)", () => {
    expect(indicesOf("the dogs' bowls")).toEqual([]);
  });

  it("does not match already-curly marks (straight ASCII U+0027 only)", () => {
    expect(indicesOf("rock ’n’ roll")).toEqual([]);
  });

  it("requires no INLINE-SPACE at all does not match (comma directly after the mark)", () => {
    // No space before the closing word ("roll," directly, comma not space after 'n'):
    expect(indicesOf("rock 'n',roll")).toEqual([]);
  });

  it("requires AT LEAST ONE INLINE-SPACE, not exactly one — a doubled or longer run still matches", () => {
    // Only the single code point immediately adjacent to each mark is tested; a longer run of
    // inline spaces further out does not invalidate the match (spec 0.5.0 correction — narrowing
    // this to "exactly one" would reintroduce false-positive quotation conversion for doubled-
    // space input).
    expect(indicesOf("rock  'n' roll")).toEqual([6, 8]); // doubled space, left side
    expect(indicesOf("rock 'n'  roll")).toEqual([5, 7]); // doubled space, right side
    expect(indicesOf("rock  'n'  roll")).toEqual([6, 8]); // doubled space, both sides
    expect(indicesOf("rock   'n' roll")).toEqual([7, 9]); // tripled space
    expect(indicesOf("say  'no'  now")).toEqual([5, 8]); // 2-letter form, both sides doubled
  });
});

describe("quote-ambiguity — computeIdiomMatchedIndices (quotes.md §3.2, spec 0.4.0)", () => {
  it("matches en-US's cited rock/n/roll idiom", () => {
    const cp = toCodePoints("rock 'n' roll");
    expect([...computeIdiomMatchedIndices(cp, enUS.quotes.elisionIdioms)].sort()).toEqual([5, 7]);
  });

  it("does not match when en-GB has no elisionIdioms entry", () => {
    expect(enGB.quotes.elisionIdioms).toEqual([]);
    const cp = toCodePoints("rock 'n' roll");
    expect(computeIdiomMatchedIndices(cp, enGB.quotes.elisionIdioms).size).toBe(0);
  });

  it("does not match a non-idiom left/right context", () => {
    const cp = toCodePoints("The letter 'n' is common.");
    expect(computeIdiomMatchedIndices(cp, enUS.quotes.elisionIdioms).size).toBe(0);
  });

  it("MAY remain stricter than the general shape on doubled spaces — this is not a contradiction", () => {
    // The listed-idiom matcher's word-boundary test (wordEndsAt/wordStartsAt) expects the cited
    // word to occupy the code points immediately adjacent to the single tested INLINE-SPACE; a
    // doubled space puts a gap between the word and that tested position, so the word is not
    // found there and the idiom does not match. This is fine: the general ambiguous-shape veto
    // (computeAmbiguousShapeIndices, above) still fires on the same input, so
    // computePreserveIndices still preserves it — see the next describe block.
    const cp = toCodePoints("rock  'n' roll");
    expect(computeIdiomMatchedIndices(cp, enUS.quotes.elisionIdioms).size).toBe(0);
  });
});

describe("quote-ambiguity — computePreserveIndices (apostrophe.md §3.4)", () => {
  it("en-US: rock/n/roll is idiom-matched, so it is NOT in the preserve set", () => {
    const cp = toCodePoints("rock 'n' roll");
    expect(computePreserveIndices(cp, enUS.quotes.elisionIdioms).size).toBe(0);
  });

  it("en-US: a doubled space breaks the idiom match, so the general veto wins and preserves it", () => {
    // With extra spaces the exact idiom matcher need not match the cited en-US tuple (previous
    // test) — the general ambiguity preserve-set wins instead and keeps the input unchanged,
    // exactly as it already does for a locale with no idiom at all.
    const cp = toCodePoints("rock  'n' roll");
    expect([...computePreserveIndices(cp, enUS.quotes.elisionIdioms)].sort()).toEqual([6, 8]);
  });

  it("en-GB: rock/n/roll is ambiguous but not idiom-matched, so it IS preserved", () => {
    const cp = toCodePoints("rock 'n' roll");
    expect([...computePreserveIndices(cp, enGB.quotes.elisionIdioms)].sort()).toEqual([5, 7]);
  });

  it("en-US: an unrelated short quote ('A') is preserved even though an idiom list exists", () => {
    const cp = toCodePoints("She chose 'A' today");
    const preserve = computePreserveIndices(cp, enUS.quotes.elisionIdioms);
    expect(preserve.size).toBe(2);
  });
});
