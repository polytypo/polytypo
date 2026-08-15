import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { fromCodePoints, toCodePoints } from "../../src/engine/codepoints";
import { applyEdits } from "../../src/engine/edits";
import { getLocaleData } from "../../src/engine/locale";
import { ellipsisRule } from "../../src/rules/ellipsis";

function runIn(tag: string): (input: string) => string {
  const locale = getLocaleData(tag);
  return (input: string): string => {
    const cp = toCodePoints(input);
    const edits = ellipsisRule.apply({ cp, locale, mode: "text" });
    return fromCodePoints(applyEdits(cp, edits, "ellipsis"));
  };
}

// abbreviatedAfterTerminal: false in en-GB, true in ru — the only two behaviours.
const plain = runIn("en-GB");
const abbrev = runIn("ru");

describe("ellipsis — abbreviatedAfterTerminal = false (spec/rules/ellipsis.md 6)", () => {
  const cases: readonly [number, string, string][] = [
    [1, "Wait... what?", "Wait… what?"],
    [2, "Wait…… what?", "Wait… what?"],
    [3, "Really?.. ", "Really?… "],
    [4, "See ../docs", "See ../docs"],
    [5, "Version 1..5", "Version 1..5"],
    [6, "He left…", "He left…"],
    [7, "Hmm.....", "Hmm…"],
    [8, "Yes. No.", "Yes. No."],
  ];

  for (const [n, input, expected] of cases) {
    it(`case ${n}`, () => {
      expect(plain(input)).toBe(expected);
    });
  }

  it("normalises the mixed runs of 3.3 step 4", () => {
    expect(plain("a…..b")).toBe("a…b");
    expect(plain("a..…b")).toBe("a…b");
    expect(plain("a……b")).toBe("a…b");
  });
});

describe("ellipsis — abbreviatedAfterTerminal = true (spec/rules/ellipsis.md 6)", () => {
  const cases: readonly [number, string, string][] = [
    [9, "Что?...", "Что?.."],
    [10, "Что?…", "Что?.."],
    [11, "Что?..", "Что?.."],
    [12, "Что?!...", "Что?!.."],
    [13, "Он ушёл...", "Он ушёл…"],
    [14, "см. ../", "см. ../"],
  ];

  for (const [n, input, expected] of cases) {
    it(`case ${n}`, () => {
      expect(abbrev(input)).toBe(expected);
    });
  }

  it("fires after ! as well as after ? (3.4)", () => {
    expect(abbrev("Стой!...")).toBe("Стой!..");
    expect(abbrev("Стой!…")).toBe("Стой!..");
    expect(abbrev("Что!?…")).toBe("Что!?..");
  });

  it("leaves a two-dot run inert unconditionally, whatever precedes it", () => {
    for (const left of ["?", "!", "a", "1", " ", "/", ""]) {
      expect(abbrev(`${left}..`)).toBe(`${left}..`);
    }
  });
});

describe("ellipsis — must not touch (spec/rules/ellipsis.md 4)", () => {
  for (const [name, run] of [
    ["en-GB", plain],
    ["ru", abbrev],
  ] as const) {
    it(`leaves a single full stop (${name})`, () => {
      expect(run("Yes. No.")).toBe("Yes. No.");
      expect(run("3.14")).toBe("3.14");
      expect(run("1.2.3")).toBe("1.2.3");
      expect(run("p. 12")).toBe("p. 12");
    });

    it(`leaves two-dot idioms not preceded by terminal punctuation (${name})`, () => {
      for (const input of ["../", "./..", "1..5", "a..b", "e.g. ..", ".."]) {
        expect(run(input)).toBe(input);
      }
    });

    it(`never produces or consumes U+2025 or the CJK leaders (${name})`, () => {
      for (const input of ["a‥b", "a⋯b", "a︙b", "a‥‥b"]) {
        expect(run(input)).toBe(input);
      }
    });

    it(`never joins two dot runs across an intervening character (${name})`, () => {
      for (const sep of [0x20, 0x09, 0xa0, 0x202f]) {
        const sepChar = String.fromCodePoint(sep);
        expect(run(`a.${sepChar}.b`)).toBe(`a.${sepChar}.b`);
      }
    });

    it(`never changes the spacing around an ellipsis (${name})`, () => {
      expect(run("word ...")).toBe("word …");
      expect(run("word …")).toBe("word …");
    });
  }

  it("does not convert a two-dot run preceding terminal punctuation (7.3)", () => {
    expect(plain("а..?")).toBe("а..?");
    expect(abbrev("а..?")).toBe("а..?");
  });
});

describe("ellipsis — code-point safety", () => {
  for (const [name, run] of [
    ["en-GB", plain],
    ["ru", abbrev],
  ] as const) {
    it(`leaves astral characters and lone surrogates untouched (${name})`, () => {
      expect(run("\u{1f600}...")).toBe("\u{1f600}…");
      expect(run("\u{1f600}")).toBe("\u{1f600}");
      expect(run("\ud800...\udfff")).toBe("\ud800…\udfff");
      expect(run("\udc00")).toBe("\udc00");
    });
  }
});

describe("ellipsis — idempotency", () => {
  for (const [name, run] of [
    ["en-GB", plain],
    ["ru", abbrev],
  ] as const) {
    it(`apply(apply(x)) === apply(x) on arbitrary input (${name})`, () => {
      fc.assert(
        fc.property(fc.string({ unit: "binary", maxLength: 200 }), (input) => {
          const once = run(input);
          expect(run(once)).toBe(once);
        }),
        { numRuns: 1000 },
      );
    });

    it(`apply(apply(x)) === apply(x) over a dot-heavy alphabet (${name})`, () => {
      const alphabet = fc.constantFrom(".", "..", "...", "…", "?", "!", "a", "1", " ", "/", "?!");
      fc.assert(
        fc.property(fc.array(alphabet, { maxLength: 30 }), (parts) => {
          const once = run(parts.join(""));
          expect(run(once)).toBe(once);
        }),
        { numRuns: 3000 },
      );
    });
  }
});
