import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { fromCodePoints, toCodePoints } from "../../src/engine/codepoints";
import { applyEdits } from "../../src/engine/edits";
import { getLocaleData } from "../../src/engine/locale";
import { KNOWN_LOCALES } from "../../src/generated/locales";
import { MARKER } from "../../src/modes/spans";
import { quotesRule } from "../../src/rules/quotes";

function run(input: string, tag: string): string {
  const locale = getLocaleData(tag);
  const cp = toCodePoints(input);
  const edits = quotesRule.apply({ cp, locale, mode: "text" });
  return fromCodePoints(applyEdits(cp, edits, "quotes"));
}

/**
 * The rule's view of a spliced span array, without going through a mode adapter. Every `⟦` in
 * the template stands for one boundary marker — the integer −1, which is not a code point, so
 * no input can collide with it. `"<em>hello</em>"` extracts as three spans and therefore
 * carries two markers: `"⟦hello⟦"`.
 */
function runSpans(template: string, tag: string): string {
  const locale = getLocaleData(tag);
  const cp = toCodePoints(template).map((c) => (c === 0x27e6 ? MARKER : c));
  const out = applyEdits(cp, quotesRule.apply({ cp, locale, mode: "html" }), "quotes");
  return fromCodePoints(out.map((c) => (c === MARKER ? 0x27e6 : c)));
}

const ch = (code: number): string => String.fromCodePoint(code);
const NBSP = ch(0xa0);
const NNBSP = ch(0x202f);

describe("quotes — en-US worked examples (spec/rules/quotes.md 6)", () => {
  it("case 1 — depth 1 uses the primary pair", () => {
    expect(run('She said "hello" twice.', "en-US")).toBe("She said “hello” twice.");
  });

  it("case 2 — one stack; the inner pair is depth 2", () => {
    expect(run(`"He said 'no' to me," she noted.`, "en-US")).toBe(
      "“He said ‘no’ to me,” she noted.",
    );
  });

  it("case 3 — depth, not the kind of the straight mark, selects the pair", () => {
    expect(run(`'He said "no" to me,' she noted.`, "en-US")).toBe(
      "“He said ‘no’ to me,” she noted.",
    );
  });

  it("case 4 — an unmatched opener survives and does not shift the rest", () => {
    expect(run('He said "hi. She said "bye."', "en-US")).toBe('He said "hi. She said “bye.”');
  });

  it("case 5 — medial vetoes and an unpaired leading elision", () => {
    const input = "Don't touch it — it's the '90s.";
    expect(run(input, "en-US")).toBe(input);
  });

  it("case 6 — foot and inch marks", () => {
    const input = `He is 6' 2" tall.`;
    expect(run(input, "en-US")).toBe(input);
  });

  it("case 7 — two identical adjacent marks are vetoed in pass 1", () => {
    const input = "The letter ''";
    expect(run(input, "en-US")).toBe(input);
  });

  it("case 8 — existing curly glyphs are ignored, including for depth", () => {
    expect(run('“Already curly,” he said, and "this too."', "en-US")).toBe(
      "“Already curly,” he said, and “this too.”",
    );
  });
});

describe("quotes — fi worked examples: the primary open glyph equals the primary close glyph", () => {
  it("case 9 — U+201D on both sides", () => {
    expect(run('Hän sanoi "moi" ja lähti.', "fi")).toBe("Hän sanoi ”moi” ja lähti.");
  });

  it("case 10 — re-processing the output is a no-op, which a flip-flop state machine gets wrong", () => {
    const input = "Hän sanoi ”moi” ja lähti.";
    expect(run(input, "fi")).toBe(input);
  });

  it("case 11 — depth 2 with a same-glyph secondary pair", () => {
    expect(run(`"Hän sanoi 'moi'", totesin.`, "fi")).toBe("”Hän sanoi ’moi’”, totesin.");
  });

  it("sv behaves identically — same glyph on both sides", () => {
    expect(run('Han sade "hej" och gick.', "sv")).toBe("Han sade ”hej” och gick.");
    expect(run("Han sade ”hej” och gick.", "sv")).toBe("Han sade ”hej” och gick.");
    expect(run(`"Han sade 'hej'", sade jag.`, "sv")).toBe("”Han sade ’hej’”, sade jag.");
  });

  it("a same-glyph locale still resolves nesting the reader sees", () => {
    // Both marks of the inner pair are U+2019 and both of the outer are U+201D; the rule
    // knew which was which from the pairing, never from the glyph.
    expect(run(`"a 'b' c"`, "fi")).toBe("”a ’b’ c”");
  });
});

describe("quotes — fr and ru worked examples", () => {
  it("case 12 — glyphs only; innerSpace belongs to nbsp (spec 3.7)", () => {
    expect(run('Il a dit "bonjour".', "fr")).toBe("Il a dit «bonjour».");
  });

  it("case 13 — already-guillemetted text has no straight marks left to convert", () => {
    const input = "Il a dit « bonjour ».";
    expect(run(input, "fr")).toBe(input);
  });

  it("case 14 — ru primary « » and secondary „ “", () => {
    expect(run(`Он сказал: "это 'моё' дело".`, "ru")).toBe("Он сказал: «это „моё“ дело».");
  });

  it("de-DE and de-CH take their glyphs from the locale file, nothing else changes", () => {
    expect(run(`Er sagte "hallo 'du' dort".`, "de-DE")).toBe("Er sagte „hallo ‚du‘ dort“.");
    expect(run(`Er sagte "hallo 'du' dort".`, "de-CH")).toBe("Er sagte «hallo ‹du› dort».");
  });

  it("en-GB is single-first, and depth parity normalises the author's choice of kind", () => {
    expect(run('She said "hello".', "en-GB")).toBe("She said ‘hello’.");
    expect(run(`She said 'hello'.`, "en-GB")).toBe("She said ‘hello’.");
  });
});

describe("quotes — nesting", () => {
  it("alternates primary/secondary by depth parity", () => {
    expect(run(`"a 'b "c" d' e"`, "en-US")).toBe("“a ‘b “c” d’ e”");
  });

  it("depth is counted over the finished pair list, not the stack height (spec 3.4)", () => {
    // The first mark never finds a partner. A stack-height implementation would make the
    // second pair depth 2 and emit secondary glyphs for a first-level quotation.
    expect(run('He said "hi. She said "bye."', "en-US")).toBe('He said "hi. She said “bye.”');
    expect(run(`"unmatched. "a 'b' c"`, "en-US")).toBe(`"unmatched. “a ‘b’ c”`);
  });

  it("closing takes precedence over opening when a candidate could be either (spec 3.3)", () => {
    // The mark at index 4 has `(` on the left and U+002D on the right, so it is both canOpen
    // and canClose; step 1 fires first and it closes the mark at index 0.
    expect(run('"a ("-b"', "en-US")).toBe('“a (”-b"');
  });

  it("spec 3.3's own illustration no longer pairs — the pass 1 veto reaches it first", () => {
    // `"He said "hi.""` is still cited in 3.3 as the closing-precedence example, but the two
    // trailing marks are now identical and adjacent, so both are vetoed and no pair forms.
    // Reported as a stale cross-reference; the behaviour below is what the algorithm says.
    const input = '"He said "hi.""';
    expect(run(input, "en-US")).toBe(input);
  });
});

describe("quotes — unbalanced input is left alone (spec 3.6)", () => {
  const unchanged = [
    '"one mark only',
    'one mark only"',
    'a " b',
    `a ' b`,
    'He said "hello',
    '" " "',
  ];

  for (const input of unchanged) {
    it(`leaves ${JSON.stringify(input)} untouched`, () => {
      expect(run(input, "en-US")).toBe(input);
    });
  }

  it("converts what is unambiguous and leaves the rest", () => {
    expect(run('"a" and "b" and "', "en-US")).toBe('“a” and “b” and "');
    expect(run('" and "a" and "b"', "en-US")).toBe('" and “a” and “b”');
    expect(run('"a" b" c', "en-US")).toBe('“a” b" c');
  });

  it("an unmatchable mark cannot consume a matchable one", () => {
    // The leading mark is canClose-only (letter left), so it never pops and never pushes.
    expect(run('x" then "a"', "en-US")).toBe('x" then “a”');
  });
});

describe("quotes — must not touch (spec/rules/quotes.md 4)", () => {
  it("medial apostrophes", () => {
    for (const input of [
      "don't",
      "l'été",
      "O'Brien",
      "Hawai'i",
      "1990's",
      "нью-йорк'ский",
      "d'accord",
    ]) {
      expect(run(input, "en-US")).toBe(input);
      expect(run(input, "fr")).toBe(input);
    }
  });

  it("a leading elision or trailing possessive that finds no partner", () => {
    for (const input of ["Back in the '90s", "'tis the season", "'em all", "the dogs' bowls"]) {
      expect(run(input, "en-US")).toBe(input);
    }
  });

  it("foot and inch marks", () => {
    for (const input of [`6' 2"`, `55° 40' N`, `6'2"`]) {
      expect(run(input, "en-US")).toBe(input);
    }
  });

  it("'' and \"\" — vetoed in pass 1, never candidates", () => {
    for (const input of ["''", '""', "a '' b", 'a "" b', "''''", "a''b", "1''2"]) {
      expect(run(input, "en-US")).toBe(input);
    }
  });

  it("every non-straight quotation glyph", () => {
    const glyphs = [
      0x2018, 0x2019, 0x201a, 0x201b, 0x201c, 0x201d, 0x201e, 0x201f, 0xab, 0xbb, 0x2039, 0x203a,
      0x301d, 0x301e, 0x301f, 0x2bc, 0x2032, 0x2033,
    ];
    for (const code of glyphs) {
      const input = `a ${ch(code)}b${ch(code)} c`;
      for (const tag of KNOWN_LOCALES) expect(run(input, tag)).toBe(input);
    }
  });

  it("U+0060, U+00B4 and the LaTeX idioms", () => {
    for (const input of ["`a'", "``a''", "´a´", "`` ''"]) {
      expect(run(input, "en-US")).toBe(input);
    }
  });

  it("spacing of any kind — every edit is one code point for one code point", () => {
    expect(run(`"a"`, "fr")).toBe("«a»");
    expect(run(`${NBSP}"a"${NNBSP}`, "fr")).toBe(`${NBSP}«a»${NNBSP}`);
    for (const tag of KNOWN_LOCALES) {
      const out = run('x "a" y', tag);
      expect(toCodePoints(out).length).toBe(toCodePoints('x "a" y').length);
    }
  });
});

describe("quotes — code-point safety", () => {
  it("treats an astral letter as a LETTER", () => {
    // U+1D400 MATHEMATICAL BOLD CAPITAL A is category Lu, so this is a medial apostrophe.
    expect(run("\u{1d400}'\u{1d400}", "en-US")).toBe("\u{1d400}'\u{1d400}");
    expect(run(`"\u{1d400}"`, "en-US")).toBe("“\u{1d400}”");
  });

  it("indexes code points, not UTF-16 units", () => {
    expect(run('\u{1f600} "a" \u{1f600}', "en-US")).toBe("\u{1f600} “a” \u{1f600}");
  });

  it("treats a lone surrogate as an ordinary code point, so it is neither open- nor close-ish", () => {
    const input = '\ud800"a"\udfff';
    expect(run(input, "en-US")).toBe(input);
    expect(run('\ud800 "a" \udfff', "en-US")).toBe("\ud800 “a” \udfff");
  });
});

describe("quotes — known defects, pinned so a change is deliberate", () => {
  // spec/rules/quotes.md 7.1 and apostrophe.md 7.1: `rock 'n' roll` should be two closing
  // marks. Pass 1 makes both marks candidates, pass 2 pairs them, and the pair is depth 1 —
  // so the output is the locale's PRIMARY pair, not the secondary pair the spec's open
  // question predicts. Fixing it needs a per-locale list of literal elision forms, and
  // locale.schema.json has no field for it.
  it("rock 'n' roll pairs as a depth-1 quotation instead of two elisions", () => {
    expect(run("rock 'n' roll", "en-US")).toBe("rock “n” roll");
    expect(run("rock 'n' roll", "en-GB")).toBe("rock ‘n’ roll");
    expect(run("rock 'n' roll", "fi")).toBe("rock ”n” roll");
  });
});

describe("quotes — the same-kind adjacency veto (spec 3.2, 5.4)", () => {
  it("case 7b — the former idempotency witness now has no candidates at all", () => {
    // Previously '"""a""' → '""“a”"' → '"““a””'. All five marks have an identical straight
    // neighbour, so all five are vetoed and the input is returned unchanged on the first pass.
    for (const tag of KNOWN_LOCALES) {
      expect(run('"""a""', tag)).toBe('"""a""');
    }
  });

  it("case 7c — a vetoed inner run does not disturb the pair around it", () => {
    expect(run('"a "" b"', "en-US")).toBe('“a "" b”');
    expect(run('“a "" b”', "en-US")).toBe('“a "" b”');
  });

  it("vetoes any run of two or more identical straight marks (spec 4)", () => {
    for (const input of ["''", '""', "'''", '""""', "a '' b", 'a "" b', "The letter ''"]) {
      for (const tag of KNOWN_LOCALES) expect(run(input, tag)).toBe(input);
    }
  });

  it("does not veto two adjacent marks of different kinds — the nested boundary", () => {
    // spec 6 case 11: the `'` and `"` at the end of `…'moi'"` are adjacent but of different
    // kinds, which is exactly what the veto is deliberately narrow for.
    expect(run(`"Hän sanoi 'moi'", totesin.`, "fi")).toBe("”Hän sanoi ’moi’”, totesin.");
    expect(run(`"'Tis so,' he said."`, "en-US")).toBe("“‘Tis so,’ he said.”");
  });

  it("a pair enclosing nothing is possible only across kinds, and it is stable", () => {
    // spec 3.3: the input is meaningless either way; what matters is that the output does not
    // move on a second run.
    const once = run(`a "'`, "en-US");
    expect(run(once, "en-US")).toBe(once);
  });
});

describe("quotes — the span boundary marker (spec/rules/modes.md 3.3)", () => {
  it("row 1 — the marker is not NONE on either side, so a pair forms across it", () => {
    expect(runSpans('"⟦hello⟦"', "en-US")).toBe("“⟦hello⟦”");
    expect(runSpans('"⟦hello⟦"', "fi")).toBe("”⟦hello⟦”");
  });

  it("row 2 — CLOSEISH closes one pair, OPENISH opens the next", () => {
    expect(runSpans('"a"⟦"b"', "en-US")).toBe("“a”⟦“b”");
  });

  it("row 3 — depth is counted across the marker, so the inner pair is secondary", () => {
    expect(runSpans("\"He said ⟦'hi'⟦ loudly\"", "en-US")).toBe("“He said ⟦‘hi’⟦ loudly”");
  });

  it("the out-of-range sentinel is distinct from the marker", () => {
    // A mark at the very start of the array has no left neighbour and cannot close; the same
    // mark with a marker on its left can. If NONE were −1 these two would be identical.
    expect(runSpans('a"', "en-US")).toBe('a"');
    expect(runSpans('"a"⟦"', "en-US")).toBe('“a”⟦"');
  });

  it("the marker is not SPACELIKE, ALNUM or STRAIGHT", () => {
    // Not SPACELIKE: a mark with a marker on the left is still canClose. Depth 1 takes the
    // primary pair whatever the kind of the straight mark, hence the double glyphs.
    expect(runSpans("'⟦'", "en-US")).toBe("“⟦”");
    // Not ALNUM: the medial-apostrophe veto needs ALNUM on both sides and does not fire.
    // Not STRAIGHT: the same-kind adjacency veto does not fire across it either.
    expect(runSpans("a⟦'⟦b", "en-US")).toBe("a⟦'⟦b");
  });

  it("a marker-bearing array is still a fixed point after one run", () => {
    for (const template of ['"⟦hello⟦"', '"a"⟦"b"', "\"He said ⟦'hi'⟦ loudly\"", "'⟦'", '"⟦"⟦"']) {
      for (const tag of KNOWN_LOCALES) {
        const once = runSpans(template, tag);
        expect(runSpans(once, tag)).toBe(once);
      }
    }
  });
});

describe("quotes — idempotency", () => {
  it("every worked example is its own fixed point", () => {
    const cases: readonly [string, string][] = [
      ['She said "hello" twice.', "en-US"],
      [`"He said 'no' to me," she noted.`, "en-US"],
      ['He said "hi. She said "bye."', "en-US"],
      ['"""a""', "en-US"],
      ['"a "" b"', "en-US"],
      ['Hän sanoi "moi" ja lähti.', "fi"],
      [`"Hän sanoi 'moi'", totesin.`, "fi"],
      ['Il a dit "bonjour".', "fr"],
      [`Он сказал: "это 'моё' дело".`, "ru"],
      [`"a 'b "c" d' e"`, "en-US"],
    ];
    for (const [input, tag] of cases) {
      const once = run(input, tag);
      expect(run(once, tag)).toBe(once);
    }
  });

  // pipeline-idempotency.md 6.1: a biased or exhaustive generator is not optional. Uniform
  // random strings never produce the shapes that broke this rule. No precondition — 6 also
  // forbids one except as named containment for a reported defect, and there is none left.
  it("exhaustive sweep: every string of length 0–4 over {\" ' - ␣ . 1 a}, every locale", () => {
    const alphabet = ['"', "'", "-", " ", ".", "1", "a"];
    const failures: string[] = [];
    for (const tag of KNOWN_LOCALES) {
      const sweep = (input: string, depth: number): void => {
        const once = run(input, tag);
        if (run(once, tag) !== once) failures.push(`${tag} :: ${JSON.stringify(input)}`);
        if (depth === 0) return;
        for (const c of alphabet) sweep(input + c, depth - 1);
      };
      sweep("", 4);
    }
    expect(failures).toEqual([]);
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

    it(`apply(apply(x)) === apply(x) for ${tag} over a quote-heavy alphabet`, () => {
      const alphabet = fc.constantFrom(
        '"',
        "'",
        "a",
        "Z",
        "1",
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
        "—",
        "…",
        "“",
        "”",
        "‘",
        "’",
        "«",
        "»",
        "„",
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
