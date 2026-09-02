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
    [13, "Привет :-)", "Привет :-)"],
    ["13a", "Привет :)", "Привет :)"],
    ["13b", "Hello :Deal with it", "Hello:Deal with it"],
    ["13c", "10:30", "10:30"],
    ["13d", "See you at 10 : 30", "See you at 10: 30"],
    ["13e", "Sorry :( it happens", "Sorry :( it happens"],
    ["13f", "Hmm :[ well", "Hmm :[ well"],
    ["13g", "Well :-( then", "Well :-( then"],
    ["13h", "a -( b", "a -(b"],
    ["13i", "word ( note )", "word (note)"],
    ["13j", "Note:( x )", "Note:( x)"],
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

describe("spaces — the emoticon guard (spec/rules/spaces.md 3.6)", () => {
  it("fires for common Western emoticons, with and without a nose", () => {
    for (const mouth of [")", "(", "D", "d", "P", "p", "O", "o", "/", "\\", "|", "*", "[", "]"]) {
      expect(run(`hi :-${mouth}`)).toBe(`hi :-${mouth}`);
      expect(run(`hi :${mouth}`)).toBe(`hi :${mouth}`);
    }
  });

  it("fires on the semicolon eye too (a wink)", () => {
    expect(run("sure ;-)")).toBe("sure ;-)");
    expect(run("sure ;)")).toBe("sure ;)");
  });

  it("does not fire when the mouth runs into a letter or digit", () => {
    expect(run("Hello :Deal with it")).toBe("Hello:Deal with it");
    expect(run("Say :D5 the code")).toBe("Say:D5 the code");
  });

  it("does not fire when there is no mouth at all", () => {
    expect(run("See you at 10 : 30")).toBe("See you at 10: 30");
    expect(run("Note ; think again")).toBe("Note; think again");
  });

  it("fires even when the mouth is followed by more punctuation", () => {
    expect(run("great :-)!")).toBe("great :-)!");
  });

  it("is idempotent", () => {
    for (const input of ["hi :-)", "hi :)", "sure ;-)", "Hello :Deal with it", "10 : 30"]) {
      const once = run(input);
      expect(run(once)).toBe(once);
    }
  });
});

// The mouth side. `(` and `[` are EMOTICON-MOUTH and OPEN-BRACKET at once, and step 5's
// opening-bracket clause used to win: `a :( b` -> `a :(b` (text damage) -> `a:(b` (a second-pass
// divergence, because a letter after the mouth stops the eye side firing).
describe("spaces — the emoticon guard, mouth side (spec/rules/spaces.md 3.6)", () => {
  it("keeps the space after a mouth that is also an opening bracket", () => {
    for (const eye of [":", ";"]) {
      for (const nose of ["", "-", "^"]) {
        for (const mouth of ["(", "["]) {
          const input = `a ${eye}${nose}${mouth} b`;
          expect(run(input)).toBe(input);
        }
      }
    }
  });

  // The reading a narrower port would take — "the eye must begin a token" — passes every other
  // case here and diverges on this one (spec/rules/spaces.md §7 item 11).
  it("asks nothing about what precedes the eye", () => {
    expect(run("Note:( x )")).toBe("Note:( x)");
    expect(run("Hi!:( yes")).toBe("Hi!:( yes");
    expect(run("a:[ b")).toBe("a:[ b");
  });

  it("does not fire without an eye behind the mouth", () => {
    expect(run("a -( b")).toBe("a -(b");
    expect(run("a ^[ b")).toBe("a ^[b");
    expect(run("a ( b")).toBe("a (b");
    expect(run("word ( note )")).toBe("word (note)");
  });

  it("suppresses the opening-bracket clause only", () => {
    // CLOSE-BRACKET and STRIP-BEFORE still delete; neither can strand a letter after the mouth.
    expect(run("a :) )")).toBe("a :))");
    expect(run("a :) !")).toBe("a :)!");
    // The empty-bracket guard still collapses rather than skips (spec/rules/spaces.md 3.3).
    expect(run("a :(  )")).toBe("a :( )");
    expect(run("- [ ] item")).toBe("- [ ] item");
  });

  it("is idempotent on the shapes that used to diverge", () => {
    for (const input of ["a :( b", "! :( a", "x :( y", "! ;( a", "! :-( a", "a :[ b"]) {
      expect(run(input)).toBe(input);
      expect(run(run(input))).toBe(input);
    }
  });
});

/**
 * Deterministic and exhaustive, because the seeded kind is not enough: the mouth-side defect was
 * discovered by the unseeded `fc.assert` at the foot of this file and hidden from most of its
 * seeds, and none of the three sweep alphabets in tests/engine/idempotency.test.ts contains an
 * emoticon character at all. A pinned regression seed would record one witness, not the class.
 *
 * The shortest witness is six code points — CONTENT, SPACE, eye, mouth, SPACE, LETTER — so the
 * enumeration runs to length 6. It is rule-local (`run` drives `spacesRule.apply` directly), which
 * is where the defect lives and is cheap enough to afford both mouths that are also brackets:
 * `[` is in the alphabet, and the pipeline-level sweep in tests/engine/idempotency.test.ts covers
 * `(` end to end in every locale.
 */
describe("spaces — bounded exhaustive sweep over the emoticon alphabet", () => {
  const SWEEP_ALPHABET = [":", ";", "-", "(", ")", "[", "]", " ", "a", "!"];
  const MAX_LENGTH = 6;

  function* strings(): Generator<string> {
    let frontier = [""];
    yield "";
    for (let length = 1; length <= MAX_LENGTH; length += 1) {
      const next: string[] = [];
      for (const prefix of frontier) {
        for (const char of SWEEP_ALPHABET) {
          next.push(prefix + char);
          yield prefix + char;
        }
      }
      frontier = next;
    }
  }

  it(`every string up to ${MAX_LENGTH} characters is a fixed point of apply`, () => {
    const broken: string[] = [];
    for (const input of strings()) {
      const once = run(input);
      if (run(once) !== once) {
        broken.push(JSON.stringify(input));
        if (broken.length >= 10) break;
      }
    }
    expect(broken, "first non-idempotent inputs over the emoticon alphabet").toEqual([]);
  });

  // Idempotency alone would accept `a :(b` — stable, and still damaged. This is the other half:
  // the space after a recognised mouth survives whenever what follows it is ordinary word text.
  it("never deletes the space after a recognised mouth", () => {
    const damaged: string[] = [];
    for (const before of ["a", "1", "!", "x."]) {
      for (const eye of [":", ";"]) {
        for (const nose of ["", "-", "^"]) {
          for (const mouth of ["(", ")", "[", "]", "D", "P", "o", "/", "*"]) {
            for (const after of ["b", "1", "a b", "ok"]) {
              const input = `${before} ${eye}${nose}${mouth} ${after}`;
              if (run(input) !== input) damaged.push(JSON.stringify(input));
            }
          }
        }
      }
    }
    expect(damaged, "emoticons whose surrounding word spacing was not preserved").toEqual([]);
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
