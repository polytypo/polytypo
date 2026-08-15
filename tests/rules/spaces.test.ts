import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { fromCodePoints, toCodePoints } from "../../src/engine/codepoints";
import { applyEdits } from "../../src/engine/edits";
import { getLocaleData } from "../../src/engine/locale";
import { spacesRule } from "../../src/rules/spaces";
import { transform } from "../../src/index";

const locale = getLocaleData("en-GB");

function run(input: string): string {
  const cp = toCodePoints(input);
  const edits = spacesRule.apply({ cp, locale, mode: "text" });
  return fromCodePoints(applyEdits(cp, edits, "spaces"));
}

// Invisible characters are written by code point: a diff full of literal U+202F is unreviewable.
const ch = (code: number): string => String.fromCodePoint(code);
const SP = ch(0x20);
const NBSP = ch(0xa0);
const NNBSP = ch(0x202f);
const TAB = ch(0x09);

describe("spaces — worked examples (spec/rules/spaces.md 6)", () => {
  const cases: readonly [number | string, string, string][] = [
    [1, "Hello   world.", "Hello world."],
    [2, "Hello , world !", "Hello, world!"],
    [3, "( ok ) and [ x ]", "(ok) and [x]"],
    [4, "- [ ] buy milk", "- [ ] buy milk"],
    // 4b: the guard forces length 1, it does not skip the run (spec/rules/spaces.md 3.3).
    ["4b", "(  )", "( )"],
    [5, `line one${SP}${SP}\nline two`, `line one${SP}${SP}\nline two`],
    [6, "    indented code", "    indented code"],
    [7, `5${NBSP}${SP}${SP}km`, `5${NBSP}${SP}km`],
    [8, `a${NBSP}${NBSP}b`, `a${NBSP}${NBSP}b`],
    [9, "Bonjour ! Ça va ?", "Bonjour! Ça va?"],
    [10, "See p. 12 .", "See p. 12."],
    ["10a", "See ../docs", "See ../docs"],
    ["10b", "e.g. ..", "e.g. .."],
    ["10c", "Wait ...", "Wait ..."],
    ["10d", "Hello . . .", "Hello..."],
    ["10e", "Wait …", "Wait …"],
    [11, "foo    \n    bar", "foo    \n    bar"],
    [12, "Q:  why ?  Because .", "Q: why? Because."],
  ];

  for (const [n, input, expected] of cases) {
    it(`case ${n}`, () => {
      expect(run(input)).toBe(expected);
    });
  }

  it("worked trace of 3.4", () => {
    expect(run("a  (  b  ,  c  )  d")).toBe("a (b, c) d");
  });
});

// Every assertion here is rule-local by construction: it drives `spacesRule.apply` directly.
// Bullets marked [R] in spec/rules/spaces.md 4 may be falsified by a later rule, so they are
// deliberately NOT asserted through `transform` — see pipeline-idempotency.md 5.2.
describe("spaces — must not touch (spec/rules/spaces.md 4)", () => {
  const PROTECTED = [
    0x09, 0xa0, 0x202f, 0x2007, 0x2008, 0x2009, 0x200a, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004,
    0x2005, 0x2006, 0x205f, 0x3000, 0x200b, 0xfeff,
  ];

  it("[R] never collapses, removes or converts a PROTECTED-SPACE (nbsp may re-width U+00A0)", () => {
    for (const code of PROTECTED) {
      const c = ch(code);
      expect(run(`a${c}${c}b`)).toBe(`a${c}${c}b`);
      expect(run(`a${c},b`)).toBe(`a${c},b`);
    }
  });

  it("[R] treats a protected space as CONTENT bounding two separate runs", () => {
    expect(run(`a${SP}${SP}${NNBSP}${SP}${SP}b`)).toBe(`a${SP}${NNBSP}${SP}b`);
    expect(run(`a${SP}${SP}${TAB}${SP}${SP}b`)).toBe(`a${SP}${TAB}${SP}b`);
  });

  const BREAKS = [0x0a, 0x0d, 0x0b, 0x0c, 0x85, 0x2028, 0x2029];

  it("[P] never merges a space run across a line terminator", () => {
    for (const code of BREAKS) {
      const br = ch(code);
      expect(run(`a${SP}${SP}${br}${SP}${SP}b`)).toBe(`a${SP}${SP}${br}${SP}${SP}b`);
      expect(run(`a${br}b`)).toBe(`a${br}b`);
    }
  });

  it("[R] leaves leading whitespace on a line (nbsp may re-class its last space)", () => {
    expect(run("   a")).toBe("   a");
    expect(run("x\n    y")).toBe("x\n    y");
  });

  it("[P] leaves trailing whitespace before a terminator or at the end of the unit", () => {
    expect(run("a  \nb")).toBe("a  \nb");
    expect(run("a  ")).toBe("a  ");
    expect(run("   ")).toBe("   ");
  });

  it("[R] leaves single spaces in ordinary positions", () => {
    expect(run("a b")).toBe("a b");
  });

  it("[P] never empties a bracket pair, but does collapse inside one", () => {
    expect(run("[ ]")).toBe("[ ]");
    expect(run("( )")).toBe("( )");
    expect(run("{ }")).toBe("{ }");
    expect(run("- [ ] a\n- [ ] b")).toBe("- [ ] a\n- [ ] b");
    expect(run("[   ]")).toBe("[ ]");
    expect(run("{  }")).toBe("{ }");
    expect(run("- [  ] a")).toBe("- [ ] a");
    // Mismatched pairs are not guarded: the inner space is deleted as usual.
    expect(run("[ )")).toBe("[)");
    expect(run("(  ]")).toBe("(]");
  });

  it("[R] does not strip before a closing quotation mark or guillemet — nbsp owns that", () => {
    expect(run(`x${SP}${SP}»`)).toBe(`x${SP}»`);
    expect(run(`x${SP}”`)).toBe(`x${SP}”`);
  });

  it("strips before a lone dot only — spec/rules/spaces.md 3.4", () => {
    expect(run("a .")).toBe("a.");
    expect(run("a .b")).toBe("a.b");
    expect(run("a ..")).toBe("a ..");
    expect(run("a ...")).toBe("a ...");
    expect(run("a ....b")).toBe("a ....b");
    expect(run("a  ..")).toBe("a ..");
    // Measured in the input array, so every dot here is lone and every space still strips.
    expect(run("Hello . . .")).toBe("Hello...");
    expect(run("a . . . . b")).toBe("a.... b");
  });

  it("never strips before U+2026 — it is not in STRIP-BEFORE", () => {
    expect(run("Wait …")).toBe("Wait …");
    expect(run("Wait  …")).toBe("Wait …");
    expect(run("a .…")).toBe("a .…");
    expect(run("a ….")).toBe("a ….");
  });

  it("does not strip before an em or en dash — dashes owns that", () => {
    expect(run("a — b")).toBe("a — b");
    expect(run("a – b")).toBe("a – b");
  });

  it("does not normalise a space before an opening bracket", () => {
    expect(run("word (note)")).toBe("word (note)");
    expect(run("word(note)")).toBe("word(note)");
  });

  it("[R] removes only U+0020: the non-space subsequence is invariant", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary", maxLength: 200 }), (input) => {
        const before = toCodePoints(input).filter((c) => c !== 0x20);
        const after = toCodePoints(run(input)).filter((c) => c !== 0x20);
        expect(after).toStrictEqual(before);
      }),
      { numRuns: 500 },
    );
  });
});

// pipeline-idempotency.md 5.2: a §4 bullet is a hypothesis until a fixture exercises it
// through the whole pipeline. These are the cases the lone-dot condition exists for, and they
// are only meaningful end to end — `spaces` alone never produced the bad output.
describe("spaces — the lone-dot condition through transform (spec/rules/spaces.md 3.4)", () => {
  const tags = ["en-GB", "fi", "ru", "fr"];

  for (const tag of tags) {
    it(`See ../docs keeps its space (${tag})`, () => {
      expect(transform("See ../docs", { locale: tag })).toBe("See ../docs");
    });

    it(`e.g. .. is untouched (${tag})`, () => {
      expect(transform("e.g. ..", { locale: tag })).toBe("e.g. ..");
    });

    it(`Wait ... becomes Wait … and keeps the space (${tag})`, () => {
      expect(transform("Wait ...", { locale: tag })).toBe("Wait …");
    });

    it(`the Chicago spaced ellipsis still merges (${tag})`, () => {
      expect(transform("Hello . . .", { locale: tag })).toBe("Hello…");
    });

    it("each is a fixed point of transform", () => {
      for (const input of ["See ../docs", "e.g. ..", "Wait ...", "Hello . . .", "Wait …"]) {
        const once = transform(input, { locale: tag });
        expect(transform(once, { locale: tag })).toBe(once);
      }
    });
  }
});

describe("spaces — code-point safety", () => {
  it("leaves astral characters untouched", () => {
    expect(run("\u{1f600}  \u{1f600}")).toBe("\u{1f600} \u{1f600}");
    expect(run("\u{1d54f}")).toBe("\u{1d54f}");
    expect(run("\u{1f600},")).toBe("\u{1f600},");
  });

  it("leaves lone surrogates untouched", () => {
    expect(run("\ud800  \udfff")).toBe("\ud800 \udfff");
    expect(run("\udc00")).toBe("\udc00");
    expect(run("\ud800  ,")).toBe("\ud800,");
  });
});

describe("spaces — idempotency", () => {
  it("apply(apply(x)) === apply(x) on arbitrary input", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary", maxLength: 200 }), (input) => {
        const once = run(input);
        expect(run(once)).toBe(once);
      }),
      { numRuns: 1000 },
    );
  });

  it("apply(apply(x)) === apply(x) over a spacing-heavy alphabet", () => {
    const alphabet = fc.constantFrom(
      SP,
      `${SP}${SP}`,
      "\n",
      TAB,
      NBSP,
      "a",
      ",",
      ".",
      ";",
      ":",
      "!",
      "?",
      "…",
      "(",
      ")",
      "[",
      "]",
      "{",
      "}",
      "—",
    );
    fc.assert(
      fc.property(fc.array(alphabet, { maxLength: 40 }), (parts) => {
        const once = run(parts.join(""));
        expect(run(once)).toBe(once);
      }),
      { numRuns: 2000 },
    );
  });
});
