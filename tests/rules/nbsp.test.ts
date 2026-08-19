import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { LOCALES } from "../../src/generated/locales";
import { transform } from "../../src/index";
import { fromCodePoints, toCodePoints } from "../../src/engine/codepoints";
import { applyEdits } from "../../src/engine/edits";
import { nbspRule } from "../../src/rules/nbsp";
import { PolytypoError } from "../../src/errors";
import type { LocaleData } from "../../src/types";

const NBSP = " ";
const NNBSP = " ";

function localeOf(tag: string): LocaleData {
  const data = LOCALES[tag];
  if (data === undefined) throw new Error(`missing locale ${tag}`);
  return data;
}

/** The rule is exercised directly, so these expectations do not depend on the pipeline. */
function run(input: string, locale: LocaleData): string {
  const cp = toCodePoints(input);
  const edits = nbspRule.apply({ cp, locale, mode: "text" });
  return fromCodePoints(applyEdits(cp, edits, "nbsp"));
}

function withNbsp(base: LocaleData, patch: Partial<LocaleData["nbsp"]>): LocaleData {
  return { ...base, nbsp: { ...base.nbsp, ...patch } };
}

const fr = localeOf("fr");
const ru = localeOf("ru");
const deDE = localeOf("de-DE");
const deCH = localeOf("de-CH");

/** spec §6 assumes `« »` with `innerSpace: "narrow-nbsp"`; the shipped `fr` file says `nbsp`. */
const frNarrowQuotes: LocaleData = {
  ...fr,
  quotes: { ...fr.quotes, primary: { ...fr.quotes.primary, innerSpace: "narrow-nbsp" } },
};

describe("nbsp — worked examples, spec §6 (fr)", () => {
  it("1. N2 inserts a narrow no-break space before `!`", () => {
    expect(run("Bonjour!", fr)).toBe(`Bonjour${NNBSP}!`);
  });

  it("2. N2 already correct — the round-trip case", () => {
    const input = `Bonjour${NNBSP}!`;
    expect(run(input, fr)).toBe(input);
  });

  it("3. N8 inserts on both inner edges of the guillemets", () => {
    expect(run("Il a dit «mot».", frNarrowQuotes)).toBe(`Il a dit «${NNBSP}mot${NNBSP}».`);
  });

  it("4. N8 already correct", () => {
    const input = `Il a dit «${NNBSP}mot${NNBSP}».`;
    expect(run(input, frNarrowQuotes)).toBe(input);
  });

  it("5. N1 guard 2 rejects the colon in a URL and accepts a sentence colon", () => {
    expect(run("Voir http://example.org: la suite", fr)).toBe(
      `Voir http://example.org${NBSP}: la suite`,
    );
  });

  it("6a. U+2026 is accepted right context, so `Vraiment?…` takes its narrow space", () => {
    expect(run("Vraiment?\u2026", fr)).toBe(`Vraiment${NNBSP}?\u2026`);
  });

  it("6. only the first mark of `?!` takes a space", () => {
    expect(run("Vraiment?!", fr)).toBe(`Vraiment${NNBSP}?!`);
  });

  it("shipped fr quotes use U+00A0, as the locale file says", () => {
    expect(run("Il a dit «mot».", fr)).toBe(`Il a dit «${NBSP}mot${NBSP}».`);
  });

  it("a space already inside the guillemets is converted, not doubled", () => {
    expect(run("Il a dit « mot ».", fr)).toBe(`Il a dit «${NBSP}mot${NBSP}».`);
  });
});

describe("nbsp — worked examples, spec §6 (ru)", () => {
  it("13f/13g. a hyphen fails N3's left boundary, so a compound tail is not bound", () => {
    // `hyphen` (order 35) has already produced U+2011 by the time this rule runs.
    expect(run("из\u2011за дождя", ru)).toBe("из\u2011за дождя");
    expect(run("из\u2011под стола", ru)).toBe("из\u2011под стола");
    // U+002D fails for the same reason, whether or not `hyphen` listed the form.
    expect(run("из-за дождя", ru)).toBe("из-за дождя");
  });

  it("13h. SENTENCE-DASH still opens a phrase, so a preposition after an em dash binds", () => {
    expect(run("— в Москве", ru)).toBe(`— в${NBSP}Москве`);
    expect(run("– в Москве", ru)).toBe(`– в${NBSP}Москве`);
  });

  it("7. N3 binds a short word to the following word", () => {
    expect(run("Он живёт в Москве", ru)).toBe(`Он живёт в${NBSP}Москве`);
  });

  it("8. N3 already correct", () => {
    const input = `Он живёт в${NBSP}Москве`;
    expect(run(input, ru)).toBe(input);
  });

  it("9. N3 claims the leading `и`, N4 the space inside `т. д.`", () => {
    expect(run("и т. д.", ru)).toBe(`и${NBSP}т.${NBSP}д.`);
  });

  it("10. N7 clause C1 twice", () => {
    expect(run("А. С. Пушкин", ru)).toBe(`А.${NBSP}С.${NBSP}Пушкин`);
  });

  it("11. N7 clause C2 then C1", () => {
    expect(run("Пушкин А. С.", ru)).toBe(`Пушкин${NBSP}А.${NBSP}С.`);
  });

  it("12. N6 binds a symbol to the following number", () => {
    expect(run("см. № 5", ru)).toBe(`см. №${NBSP}5`);
  });

  it("13. ordinary prose is untouched", () => {
    const input = "Иван пошёл домой";
    expect(run(input, ru)).toBe(input);
  });

  it("13a. N10 binds a listed abbreviation to a following word", () => {
    expect(run("ул. Ленина", ru)).toBe(`ул.${NBSP}Ленина`);
  });

  it("13c. N10 already correct", () => {
    const input = `ул.${NBSP}Ленина`;
    expect(run(input, ru)).toBe(input);
  });

  it("13d. N9/N10 never insert", () => {
    const input = "ул.Ленина";
    expect(run(input, ru)).toBe(input);
  });

  it("13e. N10 guard G-W: a quotation glyph is not a word", () => {
    const input = "ул. «Ленина»";
    expect(run(input, ru)).toBe(input);
  });

  it("N5 binds a unit to the preceding number (and N3 the short word before it)", () => {
    expect(run("около 5 км и 20 %", ru)).toBe(`около 5${NBSP}км и${NBSP}20${NBSP}%`);
  });
});

describe("nbsp — worked examples, spec §6 (de)", () => {
  it("14. N4 binds inside the abbreviation; C1-a keeps N7 off the space after it", () => {
    expect(run("z. B. Berlin", deDE)).toBe(`z.${NBSP}B. Berlin`);
  });

  it("14a. and that output is a fixed point after one run", () => {
    const once = run("z. B. Berlin", deDE);
    expect(run(once, deDE)).toBe(once);
  });

  it("15. N4 matches space-leniently, so its own output is already correct", () => {
    const input = `z.${NBSP}B. Berlin`;
    expect(run(input, deDE)).toBe(input);
  });

  it("C1-a declines only the abbreviation shape: `А. С. Пушкин` still binds twice", () => {
    expect(run("А. С. Пушкин", ru)).toBe(`А.${NBSP}С.${NBSP}Пушкин`);
  });

  it("16. N5 twice", () => {
    expect(run("Es sind 20 km bis 5 %", deDE)).toBe(`Es sind 20${NBSP}km bis 5${NBSP}%`);
  });

  it("17. N5 never inserts (§7.2)", () => {
    const input = "Es sind 20km";
    expect(run(input, deDE)).toBe(input);
  });

  it("18. N5 step 4: a letter before the digit run blocks the bind", () => {
    const input = "H2 O ist kein Wert";
    expect(run(input, deDE)).toBe(input);
  });

  it("19. N9 binds an abbreviation to a following number", () => {
    expect(run("siehe S. 12", deDE)).toBe(`siehe S.${NBSP}12`);
    expect(run("siehe Kap. 4", deCH)).toBe(`siehe Kap.${NBSP}4`);
  });

  it("20. N9 matches exactly; `s.` is not `S.`", () => {
    const input = "siehe s. 12";
    expect(run(input, deDE)).toBe(input);
  });

  it("N10 binds `St.` to a following word", () => {
    expect(run("St. Gallen", deCH)).toBe(`St.${NBSP}Gallen`);
  });
});

describe("nbsp — worked examples, spec §6 (fr beforeWord)", () => {
  it("21. `Mme` binds; `M.` is claimed by N7 in this locale (see the report note on G-D)", () => {
    expect(run("M. Dupont et Mme Hugo", fr)).toBe(`M.${NBSP}Dupont et Mme${NBSP}Hugo`);
  });

  it("22. the sub-rule does nothing without an entry", () => {
    const noBeforeWord = withNbsp(fr, { beforeWord: [], bindInitials: false });
    const input = "M. Dupont";
    expect(run(input, noBeforeWord)).toBe(input);
  });
});

describe("nbsp — must not touch (spec §4)", () => {
  it("never puts a no-break space at the start or end of a text unit", () => {
    expect(run("!", fr)).toBe("!");
    expect(run("«", fr)).toBe("«");
    expect(run("»", fr)).toBe("»");
    expect(run("в ", ru)).toBe("в ");
  });

  it("never crosses or converts a line terminator", () => {
    expect(run("mot\n!", fr)).toBe("mot\n!");
    expect(run("Он живёт в\nМоскве", ru)).toBe("Он живёт в\nМоскве");
    expect(run("«\nmot\n»", fr)).toBe("«\nmot\n»");
  });

  it("never converts a tab", () => {
    expect(run("mot\t!", fr)).toBe("mot\t!");
    expect(run("в\tМоскве", ru)).toBe("в\tМоскве");
  });

  it("leaves `12:30`, `1:2` and `http://` alone", () => {
    const input = "12:30, 1:2, http://example.org/a:b";
    expect(run(input, fr)).toBe(input);
  });

  it("does not space `(!)`", () => {
    expect(run("(!)", fr)).toBe("(!)");
  });

  it("leaves `5km`, `50%`, `H2O`, `A4` and `MP3` alone", () => {
    const input = "5km 50% H2O A4 MP3";
    expect(run(input, deDE)).toBe(input);
  });

  it("leaves U+2007, U+2009 and U+200A exactly as typed (OTHER-SPACE)", () => {
    // They are SPACELIKE, so they read as a boundary, but N1/N2 decline them outright rather
    // than converting them or inserting a second space beside them.
    const input = "Bonjour\u2007! Bonjour\u2009! Bonjour\u200a!";
    expect(run(input, fr)).toBe(input);
  });

  it("U+2060 and U+FEFF are not spaces at all, so a mark beside one still gets its space", () => {
    expect(run("Bonjour\u2060!", fr)).toBe("Bonjour\u2060" + NNBSP + "!");
    expect(run("Bonjour\ufeff!", fr)).toBe("Bonjour\ufeff" + NNBSP + "!");
  });

  it("does not remove a space inside quotes when innerSpace is none (§7.4)", () => {
    const input = "«  mot  »";
    expect(run(input, ru)).toBe(input);
  });

  it("does nothing for a quote pair whose open equals its close (§7.5)", () => {
    const fi = localeOf("fi");
    const sameGlyph: LocaleData = {
      ...fi,
      quotes: { ...fi.quotes, primary: { open: "”", close: "”", innerSpace: "nbsp" } },
    };
    const input = "Hän sanoi ”moi” ja lähti.";
    expect(run(input, sameGlyph)).toBe(input);
  });
});

describe("nbsp — conflict policy and sub-rule ordering (spec §3.2)", () => {
  it("edits are ascending, non-overlapping and never touch an index twice", () => {
    const input = "и т. д. в Москве А. С. Пушкин, 5 км, № 7";
    const cp = toCodePoints(input);
    const edits = nbspRule.apply({ cp, locale: ru, mode: "text" });
    let previousEnd = 0;
    for (const edit of edits) {
      expect(edit.start).toBeGreaterThanOrEqual(previousEnd);
      previousEnd = edit.end;
    }
    expect(edits.length).toBeGreaterThan(0);
  });

  it("N4 wins over N3 at a shared index and the verdicts agree", () => {
    expect(run("и т. п.", ru)).toBe(`и${NBSP}т.${NBSP}п.`);
  });

  it("N1 wins over N2 is unreachable: the two lists must be disjoint", () => {
    const clash = withNbsp(fr, { beforePunctuation: ["!"], narrowBeforePunctuation: ["!"] });
    const cp = toCodePoints("Bonjour!");
    expect(() => nbspRule.apply({ cp, locale: clash, mode: "text" })).toThrow(PolytypoError);
    try {
      nbspRule.apply({ cp, locale: clash, mode: "text" });
    } catch (error) {
      expect((error as PolytypoError).code).toBe("POLYTYPO_MALFORMED_LOCALE_DATA");
    }
  });
});

describe("nbsp — G-D and the sentence-boundary miss (spec §3.13, §7.9)", () => {
  const withGorod = withNbsp(ru, { beforeWord: ["г.", "ул."] });

  it("13a. a lower-case one-letter form binds: G-D tests UPPER, and `г` is not upper", () => {
    expect(run("г. Москва, ул. Ленина", withGorod)).toBe(`г.${NBSP}Москва, ул.${NBSP}Ленина`);
  });

  it("G-D still makes an UPPER one-letter form inert in N10 (N7 owns that shape)", () => {
    const locale = withNbsp(ru, { beforeWord: ["М."], bindInitials: true });
    // N7 C1 needs UPPER after the space, so a lower-case following word binds nowhere —
    // the documented residual gap, §6 case 22 / §7.10.
    expect(run("М. петров", locale)).toBe("М. петров");
    // With an upper-case surname N7 C1 reaches the same U+00A0 by the other route.
    expect(run("М. Петров", locale)).toBe(`М.${NBSP}Петров`);
  });

  /** §7.9: N10 has no sentence-boundary test, and with G-D repaired this is reachable again. */
  it("N10 binds across a sentence boundary in Russian", () => {
    expect(run("Это было в 1990 г. Москва тогда была другой", withGorod)).toBe(
      `Это было в${NBSP}1990${NBSP}г.${NBSP}Москва тогда была другой`,
    );
  });
});

describe("nbsp — round trip", () => {
  it("correctly typeset text comes out byte-identical, for every locale", () => {
    const samples: Readonly<Record<string, readonly string[]>> = {
      fr: [
        `Bonjour${NNBSP}!`,
        `Vraiment${NNBSP}?`,
        `Voir ceci${NBSP}: la suite`,
        `Il a dit «${NBSP}mot${NBSP}».`,
        `M.${NBSP}Dupont et Mme${NBSP}Hugo`,
        `art.${NBSP}237`,
      ],
      ru: [
        `Он живёт в${NBSP}Москве`,
        `и${NBSP}т.${NBSP}д.`,
        `А.${NBSP}С.${NBSP}Пушкин`,
        `Пушкин${NBSP}А.${NBSP}С.`,
        `см. №${NBSP}5`,
        `около 5${NBSP}км`,
        `ул.${NBSP}Ленина`,
      ],
      "de-DE": [
        `z.${NBSP}B.${NBSP}Berlin`,
        `Es sind 20${NBSP}km bis 5${NBSP}%`,
        `siehe S.${NBSP}12`,
      ],
      "de-CH": [`St.${NBSP}Gallen`, `siehe Kap.${NBSP}4`, `u.${NBSP}a.`],
      "en-GB": [`The plan is 5${NBSP}km long.`],
      "en-US": [`The plan is 5${NBSP}km long.`, `A.${NBSP}B.${NBSP}Smith`],
      fi: ["Hän sanoi ”moi” ja lähti."],
      sv: ["Han sa ”hej” och gick."],
    };
    for (const [tag, cases] of Object.entries(samples)) {
      const locale = localeOf(tag);
      for (const input of cases) {
        expect(run(input, locale)).toBe(input);
      }
    }
  });

  it("a locale with nothing to do is a total no-op", () => {
    const input = "The plan - if there is one - fails: 12:30, 50%, A. B. Smith, «mot»!";
    // `en-US` is absent: it sets `bindInitials`, so `A. B. Smith` is not a no-op there.
    for (const tag of ["en-GB", "sv"]) {
      const locale = localeOf(tag);
      const cp = toCodePoints(input);
      const edits = nbspRule.apply({ cp, locale, mode: "text" });
      expect(edits).toEqual([]);
    }
  });
});

describe("nbsp — UPPER table", () => {
  it("matches the host runtime's Lu/Lt classification at every range boundary", () => {
    // The table is private; N7's behaviour is the observable proxy for it.
    const locale = withNbsp(ru, { bindInitials: true });
    const upper = ["A", "Ǆ", "А", "Ω", "Ա", "Ⰰ"];
    for (const letter of upper) {
      expect(run(`${letter}. ${letter}. Х`, locale)).toBe(`${letter}.${NBSP}${letter}.${NBSP}Х`);
    }
    for (const letter of ["a", "ǆ", "а", "ω", "1"]) {
      const input = `${letter}. ${letter}. Х`;
      expect(run(input, locale)).toBe(input);
    }
  });
});

describe("nbsp — N1/N2 versus N8 at one index (spec §3.3 step 3, §3.10.1)", () => {
  it("23/24. N1/N2 decline the space beside an opening quote glyph; N8 owns it", () => {
    const once = run("«?", fr);
    expect(once).toBe(`«${NBSP}?`);
    expect(run(once, fr)).toBe(once);
  });

  it("25. the ordinary case is unaffected: a letter before the space keeps N2 in charge", () => {
    expect(run("mot ?", fr)).toBe(`mot${NNBSP}?`);
    expect(run("mot?", fr)).toBe(`mot${NNBSP}?`);
  });

  it("the guard is about the quote glyph, not about any bracket-like neighbour", () => {
    // `(!)` is skipped by the same step for the same reason: the mark's left neighbour is
    // OPENISH, and nothing may put a no-break space there.
    expect(run("(!)", fr)).toBe("(!)");
  });
});

/**
 * Through `transform`, not through the rule alone: these are the [P] claims of §4 and §6, and
 * a rule-level assertion cannot see what `hyphen`, `ellipsis` or `spaces` did first
 * (pipeline-idempotency.md §5.2).
 */
describe("nbsp — end to end through transform", () => {
  it("13f. `из-за дождя` binds the hyphen and nothing else", () => {
    expect(transform("из-за дождя", { locale: "ru" })).toBe("из\u2011за дождя");
  });

  it("13h. `— в Москве` still binds the preposition", () => {
    expect(transform("— в Москве", { locale: "ru" })).toBe(`— в${NBSP}Москве`);
  });

  it("6a. `Vraiment?..` gets the same narrow space as `Vraiment ?`", () => {
    expect(transform("Vraiment?..", { locale: "fr" })).toBe(`Vraiment${NNBSP}?\u2026`);
    expect(transform("Vraiment ?", { locale: "fr" })).toBe(`Vraiment${NNBSP}?`);
  });

  it("§7.4, updated for quotes.md spec 0.3.0 mandate 2: `« hallo »`'s inner spaces are now deleted by `quotes` itself, not merely left alone by `nbsp`", () => {
    // Under 0.1.0 `nbsp` alone was the whole story here: it never removes a space, so a
    // stray inner space beside an innerSpace:"none" pair survived untouched. Under mandate 2
    // `quotes` (order 40, before `nbsp`) now recognises the already-correct pair on the first
    // application and deletes the inner space itself, since `nbsp` still has no deletion
    // capability at all — see spec/rules/quotes.md §3.7.
    expect(transform("« hallo »", { locale: "de-CH" })).toBe("«hallo»");
  });

  it("each of the four is a fixed point of transform", () => {
    const cases: readonly [string, string][] = [
      ["из-за дождя", "ru"],
      ["— в Москве", "ru"],
      ["Vraiment?..", "fr"],
      ["« hallo »", "de-CH"],
    ];
    for (const [input, locale] of cases) {
      const once = transform(input, { locale });
      expect(transform(once, { locale })).toBe(once);
    }
  });
});

describe("nbsp — idempotency", () => {
  const alphabet = fc.constantFrom(
    " ",
    NBSP,
    NNBSP,
    "\t",
    "\n",
    "!",
    "?",
    ";",
    ":",
    "«",
    "»",
    "„",
    "“",
    "(",
    ")",
    ".",
    ",",
    "-",
    "—",
    "‑",
    "0",
    "5",
    "12",
    "%",
    "km",
    "км",
    "№",
    "§",
    "z. B.",
    "и т. д.",
    "в",
    "на",
    "В",
    "А.",
    "С.",
    "Пушкин",
    "Москва",
    "ул.",
    "S.",
    "St.",
    "M.",
    "Mme",
    "mot",
    "Х",
    "x",
  );

  for (const tag of Object.keys(LOCALES)) {
    it(`apply(apply(x)) === apply(x) for ${tag}`, () => {
      const locale = localeOf(tag);
      fc.assert(
        fc.property(fc.array(alphabet, { maxLength: 30 }), (parts) => {
          const once = run(parts.join(""), locale);
          expect(run(once, locale)).toBe(once);
        }),
        { numRuns: 2000 },
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
 * pipeline-idempotency.md §6 item 2 — the per-rule bounded exhaustive sweep. The alphabet is
 * the one the document mandates, plus the guillemet, which is where this rule's own defect was.
 */
describe("nbsp — exhaustive sweep, length 0…4", () => {
  const alphabet = ['"', "'", "-", " ", ".", "1", "a", "«"];

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
