import { describe, it, expect } from "vitest";
import { fromCodePoints, toCodePoints } from "../../src/engine/codepoints";

describe("code-point conversion", () => {
  it("round-trips ASCII", () => {
    const input = "Hello, world.";
    expect(fromCodePoints(toCodePoints(input))).toBe(input);
    expect(toCodePoints(input)).toHaveLength(input.length);
  });

  it("round-trips BMP characters", () => {
    const input = "Hän sanoi ”moi” — ja lähti… 100 km";
    expect(fromCodePoints(toCodePoints(input))).toBe(input);
  });

  it("treats an astral character as one code point", () => {
    const input = "a\u{1F600}b";
    const cp = toCodePoints(input);
    expect(cp).toEqual([0x61, 0x1f600, 0x62]);
    expect(cp).toHaveLength(3);
    expect(input.length).toBe(4);
    expect(fromCodePoints(cp)).toBe(input);
  });

  it("round-trips a string of astral characters", () => {
    const input = "\u{1F600}\u{1F1EB}\u{1F1EE}\u{10FFFF}";
    expect(fromCodePoints(toCodePoints(input))).toBe(input);
  });

  it("carries lone surrogates through unchanged", () => {
    const highOnly = "a\uD800b";
    const lowOnly = "a\uDC00b";
    const reversedPair = "\uDC00\uD800";
    for (const input of [highOnly, lowOnly, reversedPair, "\uD83D", "\uD83Dx\uDE00"]) {
      expect(fromCodePoints(toCodePoints(input))).toBe(input);
    }
    expect(toCodePoints(highOnly)).toEqual([0x61, 0xd800, 0x62]);
    expect(toCodePoints(reversedPair)).toEqual([0xdc00, 0xd800]);
  });

  it("handles a trailing high surrogate at the end of input", () => {
    const input = "abc\uD83D";
    expect(toCodePoints(input)).toEqual([0x61, 0x62, 0x63, 0xd83d]);
    expect(fromCodePoints(toCodePoints(input))).toBe(input);
  });

  it("round-trips the empty string", () => {
    expect(toCodePoints("")).toEqual([]);
    expect(fromCodePoints([])).toBe("");
  });

  it("round-trips input longer than the conversion chunk", () => {
    const input = "a\u{1F600}".repeat(10_000);
    expect(fromCodePoints(toCodePoints(input))).toBe(input);
  });
});
