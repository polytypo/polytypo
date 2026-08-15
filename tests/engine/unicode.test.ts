import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { toCodePoints } from "../../src/engine/codepoints";
import {
  isLetter,
  isUpper,
  LETTER_RANGES,
  simpleUppercase,
  UPPER_RANGES,
} from "../../src/engine/unicode";

// Regex is banned in src/ (ARCHITECTURE.md 4.1) but allowed in tests, which is what makes this
// check possible: the host runtime's own UCD is the oracle the embedded table is compared to.
// Lu|Ll|Lt|Lm|Lo is \p{L}; Mn|Mc|Me is \p{M}.
const HOST_LETTER = /[\p{L}\p{M}]/u;
const HOST_UPPER = /[\p{Lu}\p{Lt}]/u;

function hostIsLetter(cp: number): boolean {
  return HOST_LETTER.test(String.fromCodePoint(cp));
}

function hostIsUpper(cp: number): boolean {
  return HOST_UPPER.test(String.fromCodePoint(cp));
}

/** The simple mapping: a code point whose uppercase expands to several is its own uppercase. */
function hostSimpleUppercase(cp: number): number {
  const mapped = toCodePoints(String.fromCodePoint(cp).toUpperCase());
  return mapped.length === 1 ? (mapped[0] as number) : cp;
}

function hex(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

function expectSortedRanges(ranges: readonly number[]): void {
  expect(ranges.length % 2).toBe(0);
  for (let i = 0; i < ranges.length; i += 2) {
    const start = ranges[i] as number;
    const end = ranges[i + 1] as number;
    expect(start).toBeLessThanOrEqual(end);
    if (i > 0) {
      // A gap of at least one code point, or the two ranges should have been merged.
      expect(start).toBeGreaterThan((ranges[i - 1] as number) + 1);
    }
  }
}

const MAX = 0x10ffff;

describe("embedded letter table", () => {
  it("is a sorted, non-overlapping, non-adjacent range list", () => {
    expect(LETTER_RANGES.length % 2).toBe(0);
    for (let i = 0; i < LETTER_RANGES.length; i += 2) {
      const start = LETTER_RANGES[i] as number;
      const end = LETTER_RANGES[i + 1] as number;
      expect(start).toBeLessThanOrEqual(end);
      if (i > 0) {
        const previousEnd = LETTER_RANGES[i - 1] as number;
        // A gap of at least one code point, or the two ranges should have been merged.
        expect(start).toBeGreaterThan(previousEnd + 1);
      }
    }
  });

  // If a Node upgrade ships a newer UCD, this fails instead of silently changing the output of
  // every rule that asks "is this a letter?". The table is a derived artifact; the drift is real.
  it("agrees with the host runtime's Unicode data on every range boundary", () => {
    const disagreements: Array<{ cp: string; table: boolean; host: boolean }> = [];
    for (let i = 0; i < LETTER_RANGES.length; i += 2) {
      const start = LETTER_RANGES[i] as number;
      const end = LETTER_RANGES[i + 1] as number;
      for (const cp of [start - 1, start, end, end + 1]) {
        if (cp < 0 || cp > MAX) continue;
        const table = isLetter(cp);
        const host = hostIsLetter(cp);
        if (table !== host) {
          disagreements.push({
            cp: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`,
            table,
            host,
          });
        }
      }
    }
    expect(disagreements).toEqual([]);
  });

  it("agrees with the host runtime across the whole code-point space", () => {
    const disagreements: string[] = [];
    for (let cp = 0; cp <= MAX; cp += 1) {
      if (isLetter(cp) !== hostIsLetter(cp)) {
        disagreements.push(`U+${cp.toString(16).toUpperCase().padStart(4, "0")}`);
        if (disagreements.length > 20) break;
      }
    }
    expect(disagreements).toEqual([]);
  });
});

describe("embedded uppercase table", () => {
  it("is a sorted, non-overlapping, non-adjacent range list", () => {
    expectSortedRanges(UPPER_RANGES);
  });

  it("agrees with the host runtime's Lu/Lt classification across the whole code-point space", () => {
    const disagreements: string[] = [];
    for (let cp = 0; cp <= MAX; cp += 1) {
      if (isUpper(cp) !== hostIsUpper(cp)) {
        disagreements.push(hex(cp));
        if (disagreements.length > 20) break;
      }
    }
    expect(disagreements).toEqual([]);
  });
});

describe("simple uppercase mapping", () => {
  it("agrees with the host runtime across the whole code-point space", () => {
    const disagreements: string[] = [];
    for (let cp = 0; cp <= MAX; cp += 1) {
      // Lone surrogates have no case mapping and String.toUpperCase leaves them alone.
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      if (simpleUppercase(cp) !== hostSimpleUppercase(cp)) {
        disagreements.push(hex(cp));
        if (disagreements.length > 20) break;
      }
    }
    expect(disagreements).toEqual([]);
  });

  it("is the pattern-side mapping, never host case folding", () => {
    expect(simpleUppercase(0x69)).toBe(0x49); // i -> I, never Turkish dotted capital
    expect(simpleUppercase(0x438)).toBe(0x418);
    expect(simpleUppercase(0xdf)).toBe(0xdf); // multi-code-point uppercase: maps to itself
  });
});

// One pin covers all three tables: they were generated from the same host UCD.
describe("Unicode version pin", () => {
  const pinPath = fileURLToPath(new URL("../../spec/UNICODE", import.meta.url));
  const hasPin = existsSync(pinPath);

  // The sweep above is the real drift detector and always runs. This one can only check the
  // *declared* pin, and spec/UNICODE does not exist yet — creating it is a spec change, not
  // something this test may fabricate. The title states which case is in effect.
  const title = hasPin
    ? "matches the version pinned by spec/UNICODE"
    : `SKIPPED: spec/UNICODE does not exist; nothing pins the UCD version (host is Unicode ${process.versions.unicode})`;

  it.skipIf(!hasPin)(title, () => {
    const pinned = readFileSync(pinPath, "utf8").trim();
    expect(process.versions.unicode).toBe(pinned);
  });
});
