import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { fromCodePoints, toCodePoints } from "../../src/engine/codepoints";
import { applyEdits } from "../../src/engine/edits";
import { getLocaleData } from "../../src/engine/locale";
import { KNOWN_LOCALES } from "../../src/generated/locales";
import { apostropheRule } from "../../src/rules/apostrophe";

function run(input: string, tag = "en-US"): string {
  const locale = getLocaleData(tag);
  const cp = toCodePoints(input);
  const edits = apostropheRule.apply({ cp, locale, mode: "text" });
  return fromCodePoints(applyEdits(cp, edits, "apostrophe"));
}

const ch = (code: number): string => String.fromCodePoint(code);
const RSQUO = ch(0x2019);
const LSQUO = ch(0x2018);
const NBSP = ch(0xa0);
const NNBSP = ch(0x202f);
const NBHYPHEN = ch(0x2011);

describe("apostrophe — worked examples (spec/rules/apostrophe.md 6)", () => {
  it("case 1 — letters both sides", () => {
    expect(run("don't")).toBe("don’t");
  });

  it("case 2 — elision, composed and decomposed", () => {
    expect(run("l'été")).toBe("l’été");
    // U+0301 is in LETTER, so `l'e` + combining acute behaves like `l'é`.
    expect(run("l'ét́")).toBe("l’ét́");
  });

  it("case 3 — letter left, space right", () => {
    expect(run("the dogs' bowls")).toBe("the dogs’ bowls");
  });

  it("case 4 — space left, digit right: U+2019, not U+2018", () => {
    expect(run("Back in the '90s")).toBe(`Back in the ${RSQUO}90s`);
  });

  it("case 5 — start of text, letter right", () => {
    expect(run("'Tis the season")).toBe(`${RSQUO}Tis the season`);
  });

  it("case 6 — prime guard: digit left, space right", () => {
    const input = `He is 6' 2" tall.`;
    expect(run(input)).toBe(input);
  });

  it("case 7 — prime guard: digit left, digit right", () => {
    expect(run(`6'2"`)).toBe(`6'2"`);
  });

  it("case 8 — digit left but letter right, so the prime guard does not fire", () => {
    expect(run("The 1990's were loud")).toBe("The 1990’s were loud");
  });

  it("case 9 — nothing inferable", () => {
    expect(run("a ' b")).toBe("a ' b");
  });

  it("case 10 — already-resolved text has no U+0027 left", () => {
    const input = `“He said ${RSQUO}tis so,” she noted.`;
    expect(run(input)).toBe(input);
  });

  it("case 11 — rock 'n' roll, if quotes leaves both marks (it does not; see quotes.test.ts)", () => {
    expect(run("rock 'n' roll")).toBe(`rock ${RSQUO}n${RSQUO} roll`);
  });

  it("case 12 — dogs''", () => {
    expect(run("dogs''")).toBe("dogs''");
  });

  it("case 13 — two independent medial marks", () => {
    expect(run("O'Brien's")).toBe("O’Brien’s");
  });

  it("case 14 — three medial marks", () => {
    expect(run("Ma'am, it's 5 o'clock")).toBe("Ma’am, it’s 5 o’clock");
  });
});

describe("apostrophe — the case ladder (spec 3.3)", () => {
  it("case 3 accepts CLOSEISH on the right", () => {
    for (const right of [")", "]", "}", "»", RSQUO, "”", "›", ",", ".", ";", ":", "!", "?", "…"]) {
      expect(run(`dogs'${right}`)).toBe(`dogs${RSQUO}${right}`);
    }
    expect(run(`dogs'-x`)).toBe(`dogs${RSQUO}-x`);
    expect(run(`dogs'${NBHYPHEN}x`)).toBe(`dogs${RSQUO}${NBHYPHEN}x`);
  });

  it("case 3 accepts every SPACELIKE on the right, and end of text", () => {
    for (const right of [" ", "\t", NBSP, NNBSP, ch(0x2007), ch(0x2009), ch(0x200a), "\n", "\r"]) {
      expect(run(`dogs'${right}`)).toBe(`dogs${RSQUO}${right}`);
    }
    expect(run("Jesus'")).toBe(`Jesus${RSQUO}`);
  });

  it("case 4 accepts OPENISH on the left", () => {
    for (const left of ["(", "[", "{", "«", LSQUO, "‚", "‛", "“", "„", "‟", "‹", "-", "—", "–"]) {
      expect(run(`${left}'tis`)).toBe(`${left}${RSQUO}tis`);
    }
    expect(run(`${NBHYPHEN}'em`)).toBe(`${NBHYPHEN}${RSQUO}em`);
  });

  it("case 1 wins over case 3 — that is why it is first", () => {
    for (const input of [`6'`, `55° 40' N`, `6'2"`, `1'`, `x = 3' + 2`]) {
      expect(run(input)).toBe(input);
    }
  });

  it("case 5 leaves what cannot be inferred", () => {
    for (const input of ["a ' b", "'", "''", " ' ", ".'.", "('", "')", "'-", "-'"]) {
      expect(run(input)).toBe(input);
    }
  });
});

describe("apostrophe — must not touch (spec/rules/apostrophe.md 4)", () => {
  it("U+2019 that is already present", () => {
    const input = `don${RSQUO}t, the dogs${RSQUO} bowls, ${RSQUO}90s`;
    expect(run(input)).toBe(input);
  });

  it("U+0060, U+00B4, U+02BC, U+02B9 and U+2032", () => {
    for (const code of [0x60, 0xb4, 0x2bc, 0x2b9, 0x2032, 0x2033, 0x2bb]) {
      const input = `don${ch(code)}t and 6${ch(code)}`;
      expect(run(input)).toBe(input);
    }
  });

  it("never inserts, deletes or reflows: every edit is one code point for one", () => {
    const input = `Ma'am, it's the '90s — 6' 2" and O'Brien's`;
    expect(toCodePoints(run(input)).length).toBe(toCodePoints(input).length);
  });

  it("is locale-independent — order.json declares no locale data", () => {
    const input = `Ma'am, it's the '90s, the dogs' bowls, 6' tall`;
    const expected = run(input, "en-US");
    for (const tag of KNOWN_LOCALES) expect(run(input, tag)).toBe(expected);
  });
});

describe("apostrophe — never emits U+2018 (spec 5)", () => {
  // The structural protection for `’90s` and `’tis`: quotes (order 40) has already had its
  // chance to claim the mark as an opening quotation and declined, so the only remaining
  // reading is an elision, and the elision glyph is U+2019.
  it("a leading elision becomes U+2019", () => {
    for (const input of ["'90s", "'tis", "'em", "'cause", "('tis)", "she said 'tis"]) {
      expect(run(input)).not.toContain(LSQUO);
      expect(run(input)).toContain(RSQUO);
    }
  });

  it("U+2018 never appears in the output for any input", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary", maxLength: 200 }), (input) => {
        fc.pre(!input.includes(LSQUO));
        expect(run(input)).not.toContain(LSQUO);
      }),
      { numRuns: 1000 },
    );
  });
});

describe("apostrophe — code-point safety", () => {
  it("treats an astral letter as a LETTER", () => {
    // U+1D400 MATHEMATICAL BOLD CAPITAL A is category Lu.
    expect(run("\u{1d400}'\u{1d400}")).toBe(`\u{1d400}${RSQUO}\u{1d400}`);
    expect(run("\u{1d400}' ")).toBe(`\u{1d400}${RSQUO} `);
  });

  it("indexes code points, not UTF-16 units", () => {
    expect(run("\u{1f600} don't \u{1f600}")).toBe("\u{1f600} don’t \u{1f600}");
  });

  it("leaves a lone surrogate neighbour uninferable", () => {
    const input = "\ud800'\udfff";
    expect(run(input)).toBe(input);
  });
});

describe("apostrophe — idempotency", () => {
  it("every worked example is its own fixed point", () => {
    for (const input of [
      "don't",
      "l'été",
      "the dogs' bowls",
      "Back in the '90s",
      "'Tis the season",
      `He is 6' 2" tall.`,
      "The 1990's were loud",
      "a ' b",
      "rock 'n' roll",
      "dogs''",
      "O'Brien's",
      "Ma'am, it's 5 o'clock",
    ]) {
      const once = run(input);
      expect(run(once)).toBe(once);
    }
  });

  for (const tag of KNOWN_LOCALES) {
    it(`apply(apply(x)) === apply(x) for ${tag} on arbitrary input`, () => {
      fc.assert(
        fc.property(fc.string({ unit: "binary", maxLength: 200 }), (input) => {
          const once = run(input, tag);
          expect(run(once, tag)).toBe(once);
        }),
        { numRuns: 500 },
      );
    });

    it(`apply(apply(x)) === apply(x) for ${tag} over an apostrophe-heavy alphabet`, () => {
      const alphabet = fc.constantFrom(
        "'",
        RSQUO,
        LSQUO,
        "a",
        "Z",
        "0",
        "9",
        " ",
        NBSP,
        NNBSP,
        "\n",
        ".",
        ",",
        "!",
        "(",
        ")",
        "-",
        NBHYPHEN,
        "—",
        "…",
        "“",
        "”",
        "«",
        '"',
      );
      fc.assert(
        fc.property(fc.array(alphabet, { maxLength: 40 }), (parts) => {
          const once = run(parts.join(""), tag);
          expect(run(once, tag)).toBe(once);
        }),
        { numRuns: 3000 },
      );
    });
  }
});
