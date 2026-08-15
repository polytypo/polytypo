import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { LOCALES } from "../../src/generated/locales";
import { fromCodePoints, toCodePoints } from "../../src/engine/codepoints";
import { applyEdits } from "../../src/engine/edits";
import { hyphenRule } from "../../src/rules/hyphen";
import { simpleUppercase } from "../../src/engine/unicode";
import { PolytypoError } from "../../src/errors";
import type { LocaleData } from "../../src/types";

const NBHY = "‑";

function localeOf(tag: string): LocaleData {
  const data = LOCALES[tag];
  if (data === undefined) throw new Error(`missing locale ${tag}`);
  return data;
}

/** The rule is exercised directly, so these expectations do not depend on the pipeline. */
function run(input: string, locale: LocaleData): string {
  const cp = toCodePoints(input);
  const edits = hyphenRule.apply({ cp, locale, mode: "text" });
  return fromCodePoints(applyEdits(cp, edits, "hyphen"));
}

const ru = localeOf("ru");
const emptyLocales = ["en-GB", "en-US", "de-DE", "de-CH", "fi", "fr", "sv"].map(localeOf);

/** spec/rules/hyphen.md §6 uses `по-моему` and `кое-как`; the shipped `ru` file lists neither. */
function withHyphen(base: LocaleData, hyphen: LocaleData["hyphen"]): LocaleData {
  return { ...base, hyphen };
}

const specRu = withHyphen(ru, {
  compounds: ["из-под", "из-за", "по-моему"],
  prefixes: ["кое-"],
  suffixes: ["-таки", "-то", "-либо", "-нибудь"],
});

describe("hyphen — worked examples, spec §6", () => {
  it("1. a compound binds between non-WORDISH boundaries", () => {
    expect(run("Достал из-под стола", specRu)).toBe(`Достал из${NBHY}под стола`);
  });

  it("2. first-character leniency: the simple uppercase mapping of `и`", () => {
    expect(run("Из-под стола донёсся звук", specRu)).toBe(`Из${NBHY}под стола донёсся звук`);
  });

  it("3. all-capitals is not matched (§7.1, known limitation)", () => {
    const input = "ИЗ-ПОД СТОЛА";
    expect(run(input, specRu)).toBe(input);
  });

  it("4. prefixes bind when a letter follows", () => {
    expect(run("кое-что и кое-как", specRu)).toBe(`кое${NBHY}что и кое${NBHY}как`);
  });

  it("5. a suffix binds when a letter precedes", () => {
    expect(run("Он сделал-таки это", specRu)).toBe(`Он сделал${NBHY}таки это`);
  });

  it("6. two suffixes in one sentence", () => {
    expect(run("что-нибудь или что-либо", specRu)).toBe(`что${NBHY}нибудь или что${NBHY}либо`);
  });

  it("7. text already containing U+2011 round-trips byte-identically", () => {
    const input = `Достал из${NBHY}под стола`;
    expect(run(input, specRu)).toBe(input);
  });

  it("8. a hyphen in no list is untouched", () => {
    const input = "научно-технический прогресс";
    expect(run(input, specRu)).toBe(input);
  });

  it("9. a prefix with no letter after it fails P2", () => {
    expect(run("кое- и кое-что", specRu)).toBe(`кое- и кое${NBHY}что`);
  });

  it("10. compound guard C1 rejects a match inside a longer word", () => {
    const input = "квазииз-подный";
    expect(run(input, specRu)).toBe(input);
  });

  it("11. an em dash beside the compound is another rule's business", () => {
    expect(run("Москва — из-за дождя", specRu)).toBe(`Москва — из${NBHY}за дождя`);
  });

  it("12. suffix guard S1 rejects a line-initial suffix", () => {
    const input = "-таки в начале строки";
    expect(run(input, specRu)).toBe(input);
  });

  it("13/14. every locale with empty lists is a total no-op", () => {
    const input = "A well-known e-mail address, COVID-19, Jean-Luc — из-под кое-что";
    for (const locale of emptyLocales) {
      expect(run(input, locale)).toBe(input);
      const cp = toCodePoints(input);
      expect(hyphenRule.apply({ cp, locale, mode: "text" })).toEqual([]);
    }
  });
});

describe("hyphen — shipped ru data", () => {
  it("binds the listed compounds and affixes", () => {
    expect(run("Достал из-под стола из-за кое-что сделал-таки скажи-ка", ru)).toBe(
      `Достал из${NBHY}под стола из${NBHY}за кое${NBHY}что сделал${NBHY}таки скажи${NBHY}ка`,
    );
  });

  it("leaves unlisted hyphenated words alone", () => {
    // `-нибудь` fails S2 here: what follows the match is another hyphen, which is WORDISH.
    const input = "научно-технический, кто-нибудь-то-сё, из-подобный";
    expect(run(input, ru)).toBe(input);
  });
});

describe("hyphen — must not touch (spec §4)", () => {
  it("leaves U+2010, U+00AD, U+2013, U+2014 and U+2212 alone", () => {
    const input = "из‐под из­под из–под из—под из−под";
    expect(run(input, specRu)).toBe(input);
  });

  it("never changes the length of the text", () => {
    const input = "из-под кое-что сделал-таки";
    expect(toCodePoints(run(input, specRu)).length).toBe(toCodePoints(input).length);
  });

  it("never touches spacing", () => {
    const input = "из - под";
    expect(run(input, specRu)).toBe(input);
  });

  it("rejects a right boundary that is WORDISH, including U+2011", () => {
    const input = `из-под${NBHY}ный`;
    expect(run(input, specRu)).toBe(input);
  });
});

describe("hyphen — locale data validation (spec §2)", () => {
  it("raises POLYTYPO_MALFORMED_LOCALE_DATA for an entry with no U+002D", () => {
    const broken = withHyphen(ru, { compounds: ["изпод"], prefixes: [], suffixes: [] });
    const cp = toCodePoints("изпод");
    expect(() => hyphenRule.apply({ cp, locale: broken, mode: "text" })).toThrow(PolytypoError);
    try {
      hyphenRule.apply({ cp, locale: broken, mode: "text" });
    } catch (error) {
      expect((error as PolytypoError).code).toBe("POLYTYPO_MALFORMED_LOCALE_DATA");
    }
  });
});

describe("hyphen — first-character leniency", () => {
  // The table and its exhaustive host sweep live in src/engine/unicode.ts and
  // tests/engine/unicode.test.ts; what matters here is that the rule maps the PATTERN.
  it("uses the simple uppercase mapping of the pattern, not host case folding", () => {
    expect(simpleUppercase(0x438)).toBe(0x418); // и → И
    expect(run("Из-под стола", specRu)).toBe(`Из${NBHY}под стола`);
    expect(run("ИЗ-ПОД СТОЛА", specRu)).toBe("ИЗ-ПОД СТОЛА");
  });
});

describe("hyphen — selection and guards (spec §3.4)", () => {
  const listed = withHyphen(ru, {
    compounds: ["из-под"],
    prefixes: ["из-"],
    suffixes: [],
  });

  it("the longest entry wins across lists, ties broken compounds first", () => {
    expect(run("из-под стола", listed)).toBe(`из${NBHY}под стола`);
  });

  it("no backtracking: when the longest entry fails a guard, no shorter one is tried", () => {
    // `из-под` matches at 0 and fails C2 (`н` after it is WORDISH). The shorter prefix `из-`
    // would have passed P2, and must not be retried at that index.
    const input = "из-подный";
    expect(run(input, listed)).toBe(input);
  });

  it("a claim consumes its own length, so the scan does not re-enter the form", () => {
    expect(run("из-под-из-под", listed)).toBe("из-под-из-под");
  });
});

describe("hyphen — idempotency", () => {
  const alphabet = fc.constantFrom(
    "из-под",
    "из-за",
    "кое-",
    "кое-что",
    "-таки",
    "-то",
    `из${NBHY}под`,
    `кое${NBHY}как`,
    "Из-под",
    "ИЗ-ПОД",
    "научно-технический",
    "-",
    NBHY,
    "‐",
    "—",
    " ",
    "\n",
    "а",
    "А",
    "5",
    "e-mail",
  );

  for (const tag of Object.keys(LOCALES)) {
    it(`apply(apply(x)) === apply(x) for ${tag}`, () => {
      const locale = localeOf(tag);
      fc.assert(
        fc.property(fc.array(alphabet, { maxLength: 30 }), (parts) => {
          const once = run(parts.join(""), locale);
          expect(run(once, locale)).toBe(once);
        }),
        { numRuns: 1000 },
      );
    });
  }

  it("apply(apply(x)) === apply(x) over arbitrary text, for every locale", () => {
    for (const tag of Object.keys(LOCALES)) {
      const locale = localeOf(tag);
      fc.assert(
        fc.property(fc.string({ unit: "binary", maxLength: 200 }), (input) => {
          const once = run(input, locale);
          expect(run(once, locale)).toBe(once);
        }),
        { numRuns: 300 },
      );
    }
  });
});

/**
 * pipeline-idempotency.md §6 item 2 — the per-rule bounded exhaustive sweep. Uniform random
 * strings essentially never produce the shapes that broke the pipeline; this does.
 */
describe("hyphen — exhaustive sweep, length 0…4", () => {
  const alphabet = ['"', "'", "-", " ", ".", "1", "a"];

  for (const tag of Object.keys(LOCALES)) {
    it(`apply(apply(x)) === apply(x) for every string over the sweep alphabet, ${tag}`, () => {
      const locale = localeOf(tag);
      let current = [""];
      for (let length = 0; length <= 4; length += 1) {
        for (const input of current) {
          const once = run(input, locale);
          expect(run(once, locale)).toBe(once);
        }
        const next: string[] = [];
        for (const prefix of current) {
          for (const symbol of alphabet) next.push(prefix + symbol);
        }
        current = next;
      }
    });
  }
});
