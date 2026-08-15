import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { fromCodePoints, toCodePoints } from "../../src/engine/codepoints";
import { applyEdits } from "../../src/engine/edits";
import { getLocaleData } from "../../src/engine/locale";
import { symbolsRule } from "../../src/rules/symbols";

const locale = getLocaleData("en-GB");

function run(input: string): string {
  const cp = toCodePoints(input);
  const edits = symbolsRule.apply({ cp, locale, mode: "text" });
  return fromCodePoints(applyEdits(cp, edits, "symbols"));
}

const ch = (code: number): string => String.fromCodePoint(code);
const NBSP = ch(0xa0);
const NNBSP = ch(0x202f);

describe("symbols — worked examples (spec/rules/symbols.md 6)", () => {
  it("case 1", () => {
    expect(run("Copyright (c) 2026 Iurii Rogulia")).toBe("Copyright © 2026 Iurii Rogulia");
  });

  it("case 2", () => {
    expect(run("Acme(tm) and Acme (R)")).toBe("Acme™ and Acme ®");
  });

  // The deliberate asymmetry of the S1 exemption (spec/rules/symbols.md 3.2 step 3, 7.2).
  it("case 2b", () => {
    expect(run("f(c)")).toBe("f(c)");
    expect(run("f(tm)")).toBe("f™");
  });

  it("case 3", () => {
    expect(run("The (r)evolution will not be televised")).toBe(
      "The (r)evolution will not be televised",
    );
  });

  it("case 4", () => {
    expect(run("f(c) returns c")).toBe("f(c) returns c");
  });

  it("case 5", () => {
    expect(run("A 3x5 card, 10 x 20 cm")).toBe("A 3×5 card, 10 × 20 cm");
  });

  it("case 6", () => {
    expect(run("Colour 0x1F, mask 0xFF, offset 0x10")).toBe("Colour 0x1F, mask 0xFF, offset 0x10");
  });

  it("case 7", () => {
    expect(run("Resolution 1920x1080")).toBe("Resolution 1920×1080");
  });

  it("case 8", () => {
    expect(run("Let x = 5 and solve for x")).toBe("Let x = 5 and solve for x");
  });

  it("case 9", () => {
    expect(run("0x1F, 0xFF, 0x10 stay")).toBe("0x1F, 0xFF, 0x10 stay");
  });

  it("case 10", () => {
    expect(run(`10${NBSP}× 20`)).toBe(`10${NBSP}× 20`);
  });

  it("case 11", () => {
    expect(run("((c))")).toBe("((c))");
  });

  it("case 12", () => {
    expect(run("Version 1080x")).toBe("Version 1080x");
  });

  it("case 13", () => {
    expect(run("© 2026, ® and ™")).toBe("© 2026, ® and ™");
  });

  it("case 14", () => {
    expect(run("2*3")).toBe("2*3");
  });
});

// The Cyrillic pair and the chain scan, spec/rules/symbols.md 6 cases 5a-5j.
describe("symbols — multiplication chains (spec/rules/symbols.md 3.1, 3.3)", () => {
  const cases: readonly [string, string, string][] = [
    ["5a", "Размер 5х4 см", "Размер 5×4 см"],
    ["5b", "Размер 5Х4 см", "Размер 5×4 см"],
    ["5c", "хорошо и их", "хорошо и их"],
    ["5d", "5х4х3", "5×4×3"],
    ["5e", "A 2x3x4 box", "A 2×3×4 box"],
    ["5f", "5x4х3", "5×4×3"],
    ["5g", "Стол 120х80х75 см", "Стол 120×80×75 см"],
    ["5h", "10 x 20 x 30", "10 × 20 × 30"],
    ["5i", "5x4 x 3", "5x4 x 3"],
    ["5j", "5×4x3", "5×4×3"],
  ];

  for (const [n, input, expected] of cases) {
    it(`case ${n}`, () => {
      expect(run(input)).toBe(expected);
    });
  }

  it("converts the whole chain in ONE pass — the property the chain form buys", () => {
    // A pairwise implementation yields 5×4х3 here and needs a second pass; that is the
    // defect spec 7.10 records in another implementation.
    for (const input of ["5х4х3", "2x3x4", "5x4х3", "120х80х75", "1x2x3x4x5"]) {
      const once = run(input);
      expect(once).not.toContain("x");
      expect(once).not.toContain("х");
      expect(once).not.toContain("X");
      expect(once).not.toContain("Х");
      expect(run(once)).toBe(once);
    }
  });

  it("all four MUL-LETTER code points convert, in every combination of two", () => {
    const letters = ["x", "X", "х", "Х"];
    for (const first of letters) {
      for (const second of letters) {
        expect(run(`5${first}4${second}3`)).toBe("5×4×3");
      }
    }
  });

  it("M1 is uniform across the chain, not per link", () => {
    expect(run("5x4 x 3")).toBe("5x4 x 3");
    expect(run("5 x 4x3")).toBe("5 x 4x3");
    expect(run("5x4x3 x 2")).toBe("5x4x3 x 2");
    expect(run("10 x 20")).toBe("10 × 20");
    expect(run("10x20")).toBe("10×20");
  });

  it("M2 and M3 apply to the chain's outer boundaries only", () => {
    expect(run("H2x3x4")).toBe("H2x3x4");
    expect(run("2x3x4b")).toBe("2x3x4b");
    expect(run("2x3x4")).toBe("2×3×4");
    expect(run("х2х3")).toBe("х2х3");
  });

  it("M4 inspects the first link and stays Latin-lowercase", () => {
    expect(run("0x10")).toBe("0x10");
    expect(run("0x10x20")).toBe("0x10x20");
    expect(run("0X10")).toBe("0×10");
    expect(run("0х10")).toBe("0×10");
    expect(run("10x0x10")).toBe("10×0×10");
  });

  it("carries the exact space code point of each side across every link", () => {
    expect(run(`10${NBSP}x${NBSP}20${NBSP}x${NBSP}30`)).toBe(
      `10${NBSP}×${NBSP}20${NBSP}×${NBSP}30`,
    );
    expect(run(`10${NNBSP}x${NNBSP}20`)).toBe(`10${NNBSP}×${NNBSP}20`);
    expect(run(`10${NBSP}x 20`)).toBe(`10${NBSP}× 20`);
  });
});

describe("symbols — plus-minus (spec/rules/symbols.md 3.4)", () => {
  const cases: readonly [string, string, string][] = [
    ["5k", "Tolerance +/-5 mm", "Tolerance ±5 mm"],
    ["5l", "Tolerance +/- 5 mm", "Tolerance ± 5 mm"],
    ["5m", "Погрешность 5+/-3", "Погрешность 5±3"],
    ["5n", "lines marked +/- were edited", "lines marked +/- were edited"],
    ["5o", "match [+/-] once", "match [+/-] once"],
    ["5p", "Range 5+-3", "Range 5+-3"],
  ];

  for (const [n, input, expected] of cases) {
    it(`case ${n}`, () => {
      expect(run(input)).toBe(expected);
    });
  }

  it("F2 allows exactly one intervening U+0020 and leaves it in place", () => {
    expect(run("+/-5")).toBe("±5");
    expect(run("+/- 5")).toBe("± 5");
    expect(run("+/-  5")).toBe("+/-  5");
    expect(run(`+/-${NBSP}5`)).toBe(`+/-${NBSP}5`);
    expect(run("+/-")).toBe("+/-");
    expect(run("+/-x")).toBe("+/-x");
    expect(run("+/-.5")).toBe("+/-.5");
  });

  it("F1 rejects only a preceding [", () => {
    expect(run("[+/-5")).toBe("[+/-5");
    expect(run("(+/-5")).toBe("(±5");
    expect(run("a+/-5")).toBe("a±5");
  });
});

describe("symbols — the trademark table is exhaustive and case-explicit", () => {
  const accepted: readonly [string, string][] = [
    ["(c)", "©"],
    ["(C)", "©"],
    ["(r)", "®"],
    ["(R)", "®"],
    ["(tm)", "™"],
    ["(TM)", "™"],
    ["(Tm)", "™"],
    ["(tM)", "™"],
  ];

  for (const [literal, replacement] of accepted) {
    it(`converts ${literal}`, () => {
      expect(run(`a ${literal} b`)).toBe(`a ${replacement} b`);
    });
  }

  it("rejects every other parenthesised letter", () => {
    for (const literal of ["(s)", "(a)", "(e)", "(i)", "(n)", "(x)", "(t)", "(m)", "(cc)", "(Ⅽ)"]) {
      expect(run(`a ${literal} b`)).toBe(`a ${literal} b`);
    }
  });

  it("does no case folding: (tm) variants outside the table are rejected", () => {
    for (const literal of ["(ᵗᵐ)", "(ｔｍ)", "(t\u006d\u200b)"]) {
      expect(run(`a ${literal} b`)).toBe(`a ${literal} b`);
    }
  });
});

describe("symbols — must not touch (spec/rules/symbols.md 4)", () => {
  it("[P] rejects a call or index position for the (c) and (r) rows — guard S1", () => {
    expect(run("f(c)")).toBe("f(c)");
    expect(run("f(C)")).toBe("f(C)");
    expect(run("f(r)")).toBe("f(r)");
    expect(run("f(R)")).toBe("f(R)");
    expect(run("arr[i](c)")).toBe("arr[i](c)");
    expect(run("foo(c)")).toBe("foo(c)");
    expect(run("1(c)")).toBe("1(c)");
    expect(run("©(c)")).toBe("©(c)");
    expect(run("®(r)")).toBe("®(r)");
    expect(run("™(c)")).toBe("™(c)");
  });

  it("[P] exempts the (tm) rows from S1 — spec/rules/symbols.md 3.2 step 3", () => {
    for (const literal of ["(tm)", "(TM)", "(Tm)", "(tM)"]) {
      expect(run(`Acme${literal}`)).toBe("Acme™");
      expect(run(`arr[i]${literal}`)).toBe("arr[i]™");
      expect(run(`1${literal}`)).toBe("1™");
      expect(run(`©${literal}`)).toBe("©™");
    }
  });

  it("[P] rejects the optional-first-letter idiom — guard S2", () => {
    expect(run("(r)evolution")).toBe("(r)evolution");
    expect(run("(c)ompiler")).toBe("(c)ompiler");
    expect(run("(s)he")).toBe("(s)he");
    expect(run("(tm)odel")).toBe("(tm)odel");
    expect(run("(c)1")).toBe("(c)1");
  });

  it("[P] rejects nesting — guard S3", () => {
    expect(run("((c))")).toBe("((c))");
    expect(run("((tm))")).toBe("((tm))");
  });

  it("[P] leaves existing ©, ®, ™, × and ± alone", () => {
    expect(run("© ® ™ × ±")).toBe("© ® ™ × ±");
    expect(run("5×4")).toBe("5×4");
    expect(run("±5")).toBe("±5");
  });

  it("[P] leaves x as a word or a variable", () => {
    for (const input of ["x = 5", "the x axis", "Malcolm X", "x", "X", "axb"]) {
      expect(run(input)).toBe(input);
    }
  });

  it("[P] rejects asymmetric spacing — guard M1", () => {
    for (const input of ["1080x", "x264", "2x", "10 x20", "10x 20", `10${NBSP}x20`]) {
      expect(run(input)).toBe(input);
    }
  });

  it("[P] rejects hexadecimal literals — guards M3 and M4", () => {
    for (const input of ["0x1F", "0xFF", "0x10", "0x0", "0xdeadbeef", "0x24"]) {
      expect(run(input)).toBe(input);
    }
  });

  it("[P] rejects a letter on the outer edge of either number — guards M2 and M3", () => {
    expect(run("ax3")).toBe("ax3");
    expect(run("H2x4")).toBe("H2x4");
    expect(run("3x4b")).toBe("3x4b");
  });

  it("[P] Cyrillic х outside a numeric context", () => {
    for (const input of ["хорошо", "их", "по-моему х", "х", "Хорошо", "5х", "х5"]) {
      expect(run(input)).toBe(input);
    }
  });

  it("[P] the bare sequence +- is never converted, in any context", () => {
    for (const input of ["5+-3", "+-5", "a+-5", "[+-]", "+-"]) {
      expect(run(input)).toBe(input);
    }
  });

  it("[P] [+/-] in a regular expression, and +/- followed by a letter", () => {
    expect(run("match [+/-] once")).toBe("match [+/-] once");
    expect(run("+/- indicates added rows")).toBe("+/- indicates added rows");
  });

  it("[R] never inserts or deletes a space; it carries the existing one across", () => {
    expect(run("10 x 20")).toBe("10 × 20");
    expect(run(`10${NBSP}x${NBSP}20`)).toBe(`10${NBSP}×${NBSP}20`);
    expect(run(`10${NNBSP}x${NNBSP}20`)).toBe(`10${NNBSP}×${NNBSP}20`);
    expect(run(`10${NBSP}x 20`)).toBe(`10${NBSP}× 20`);
    expect(run("10x20")).toBe("10×20");
  });

  it("[P] leaves emoticons and ASCII art", () => {
    for (const input of ["(x)", ":-)", "(^_^)", "\\o/", "(>_<)"]) {
      expect(run(input)).toBe(input);
    }
  });

  it("converts an uppercase X between numerals", () => {
    expect(run("3X5")).toBe("3×5");
    // M4 is Latin-lowercase-only and the spec says so explicitly (3.3 step 6).
    expect(run("0X10")).toBe("0×10");
  });
});

describe("symbols — code-point safety", () => {
  it("leaves astral characters untouched", () => {
    expect(run("\u{1f600} (c) \u{1f600}")).toBe("\u{1f600} © \u{1f600}");
    expect(run("\u{1f600}")).toBe("\u{1f600}");
    expect(run("\u{1d400}x\u{1d401}")).toBe("\u{1d400}x\u{1d401}");
  });

  it("treats an astral letter as a LETTER for the adjacency guards", () => {
    // U+1D400 MATHEMATICAL BOLD CAPITAL A is category Lu.
    expect(run("\u{1d400}(c)")).toBe("\u{1d400}(c)");
    expect(run("\u{1d400}2x3")).toBe("\u{1d400}2x3");
  });

  it("leaves lone surrogates untouched", () => {
    expect(run("\ud800(c)\udfff")).toBe("\ud800©\udfff");
    expect(run("\udc00")).toBe("\udc00");
  });
});

describe("symbols — idempotency", () => {
  // spec/rules/symbols.md 5: each of these must be its own fixed point after one run.
  it("adjacent trademark spans converge in a single run", () => {
    expect(run("(c)(r)")).toBe("©(r)");
    expect(run("©(r)")).toBe("©(r)");
    expect(run("(c)(tm)")).toBe("©™");
    expect(run("(tm)(c)")).toBe("™(c)");
    expect(run("™(c)")).toBe("™(c)");
    expect(run("(tm)(tm)")).toBe("™™");
  });

  it("apply(apply(x)) === apply(x) on arbitrary input", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary", maxLength: 200 }), (input) => {
        const once = run(input);
        expect(run(once)).toBe(once);
      }),
      { numRuns: 1000 },
    );
  });

  // Targeted at the defect the chain form exists to prevent: a pairwise implementation
  // converts one operator per pass, so the first output still contains a MUL-LETTER between
  // two digits and the second pass differs.
  it("no chain shape needs a second pass", () => {
    const digits = fc.constantFrom("0", "1", "5", "10", "120", "1920");
    const letters = fc.constantFrom("x", "X", "х", "Х", "×");
    const spacing = fc.constantFrom("", " ", NBSP);
    const chain = fc
      .array(fc.tuple(letters, spacing, digits), { minLength: 1, maxLength: 4 })
      .chain((links) =>
        fc.tuple(digits, spacing).map(([head, lead]) => {
          let out = head;
          for (const [letter, gap, digit] of links) out += lead + letter + gap + digit;
          return out;
        }),
      );
    fc.assert(
      fc.property(fc.array(chain, { maxLength: 3 }), (parts) => {
        const once = run(parts.join(" "));
        expect(run(once)).toBe(once);
      }),
      { numRuns: 3000 },
    );
  });

  // pipeline-idempotency.md 6: the alphabet must contain the code points the rule EMITS
  // (×, ±, ©, ®, ™), not only the ones it consumes — a per-pass chain conversion is only
  // visible on input that already contains a converted operator.
  it("apply(apply(x)) === apply(x) over a symbol-heavy alphabet", () => {
    const alphabet = fc.constantFrom(
      "(c)",
      "(C)",
      "(r)",
      "(tm)",
      "(TM)",
      "(",
      ")",
      "[",
      "]",
      "x",
      "X",
      "х",
      "Х",
      "+/-",
      "+-",
      "+",
      "/",
      "-",
      "0",
      "1",
      "9",
      "a",
      "F",
      " ",
      NBSP,
      NNBSP,
      "©",
      "®",
      "™",
      "×",
      "±",
    );
    fc.assert(
      fc.property(fc.array(alphabet, { maxLength: 40 }), (parts) => {
        const once = run(parts.join(""));
        expect(run(once)).toBe(once);
      }),
      { numRuns: 3000 },
    );
  });
});
