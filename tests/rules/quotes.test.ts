import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { fromCodePoints, toCodePoints } from "../../src/engine/codepoints";
import { applyEdits } from "../../src/engine/edits";
import { getLocaleData } from "../../src/engine/locale";
import { KNOWN_LOCALES } from "../../src/generated/locales";
import { transform } from "../../src/index";
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

describe("quotes — en-US worked examples (spec/rules/quotes.md 6)", () => {
  it("case 1 — depth 1 uses the primary pair", () => {
    expect(run('She said "hello" twice.', "en-US")).toBe("She said “hello” twice.");
  });

  it("case 3 — depth, not width, selects the pair; the gate certifies despite the width swap", () => {
    expect(run(`'He said "no" to me,' she noted.`, "en-US")).toBe(
      "“He said ‘no’ to me,” she noted.",
    );
  });

  it("case 4 — the first mark's closeRight is a letter, so it cannot swallow the real quotation", () => {
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

  it("case 7 — two identical adjacent marks are vetoed in pass 1 (V1)", () => {
    const input = "The letter ''";
    expect(run(input, "en-US")).toBe(input);
  });

  it("case 8 — mandate 1: an existing curly pair is now a real depth-1 pair, not ignored", () => {
    expect(run('“Already curly,” he said, and "this too."', "en-US")).toBe(
      "“Already curly,” he said, and “this too.”",
    );
  });

  it("row A — already-correct nesting is a no-op (required scenario a)", () => {
    const input = "“He said ‘no’ twice.”";
    expect(run(input, "en-US")).toBe(input);
  });

  it("row M2a — mandate 2: a leading space is sloppiness and is deleted", () => {
    expect(run('" hello"', "en-US")).toBe("“hello”");
  });

  it("row M2b — mandate 2: the mirror case on the closing side", () => {
    expect(run('"hello "', "en-US")).toBe("“hello”");
  });

  it("row D1 — a deletion declines rather than reviving a dash token for `dashes`", () => {
    expect(run('" --x"', "en-US")).toBe("“ --x”");
  });
});

describe("quotes — fi worked examples: the primary open glyph equals the primary close glyph", () => {
  it("case 9 — U+201D on both sides", () => {
    expect(run('Hän sanoi "moi" ja lähti.', "fi")).toBe("Hän sanoi ”moi” ja lähti.");
  });

  it("row B — same-glyph already-correct nesting is a no-op, impossible to even attempt under 0.1.0", () => {
    const input = "”Hän sanoi ’moi’”, totesin.";
    expect(run(input, "fi")).toBe(input);
  });

  it("case 11 — depth 2 with a same-glyph secondary pair, reached from straight marks", () => {
    expect(run(`"Hän sanoi 'moi'", totesin.`, "fi")).toBe("”Hän sanoi ’moi’”, totesin.");
  });

  it("row U1 — unbalanced same-glyph: the stray leading mark is left alone", () => {
    const input = "”Hän sanoi ”moi” ja lähti.";
    expect(run(input, "fi")).toBe(input);
  });

  it("sv behaves identically — same glyph on both sides", () => {
    expect(run('Han sade "hej" och gick.', "sv")).toBe("Han sade ”hej” och gick.");
    expect(run("Han sade ”hej” och gick.", "sv")).toBe("Han sade ”hej” och gick.");
    expect(run(`"Han sade 'hej'", sade jag.`, "sv")).toBe("”Han sade ’hej’”, sade jag.");
  });

  it("a same-glyph locale still resolves nesting the reader sees", () => {
    expect(run(`"a 'beta' c"`, "fi")).toBe("”a ’beta’ c”");
  });
});

describe("quotes — fr, fr-CA and ru worked examples", () => {
  it("case 12 — glyphs only; innerSpace belongs to nbsp (spec 3.7)", () => {
    expect(run('Il a dit "bonjour".', "fr")).toBe("Il a dit «bonjour».");
  });

  it("row 13 — mandate 2's second half: the pair forms on the first application", () => {
    // `«` skips right (spaceRight) and `»` skips left (spaceLeft), so both read past the
    // stray outer spaces to real content and the pair certifies immediately — quotes itself
    // emits no edit, because the glyphs are already right and innerSpace is not "none".
    const input = "Il a dit « bonjour ».";
    expect(run(input, "fr")).toBe(input);
  });

  it("row 3a — the bug-3a witness: canClose's outer test skips exactly what nbsp can insert", () => {
    expect(run('« **"', "fr")).toBe("« **»");
  });

  it("row 3b — the bug-3b witness: a MARKER-adjacent « never becomes canClose", () => {
    // «'s closeRight reads Rskip (because « ∈ SPACE-RIGHT for fr-CA) and finds the marker's
    // neighbour `[`, never real closing evidence, so quotes forms no pair across the boundary.
    expect(runSpans('"⟦«[t](u)', "fr-CA")).toBe('"⟦«[t](u)');
  });

  it("case 14 — ru primary « » and secondary „ “", () => {
    expect(run(`Он сказал: "это 'моего' дело".`, "ru")).toBe("Он сказал: «это „моего“ дело».");
  });

  it("row B1 — the bug-1 witness: width drift with an unmatched candidate declines to ∅", () => {
    const input = `'"‘`;
    expect(run(input, "ru")).toBe(input);
  });

  it("de-DE and de-CH take their glyphs from the locale file, nothing else changes", () => {
    expect(run(`Er sagte "hallo 'dort' heute".`, "de-DE")).toBe("Er sagte „hallo ‚dort‘ heute“.");
    expect(run(`Er sagte "hallo 'dort' heute".`, "de-CH")).toBe("Er sagte «hallo ‹dort› heute».");
  });

  it("row C — mandate 1: foreign guillemets convert (required scenario c)", () => {
    expect(run("Er sagte «Wort» leise.", "de-DE")).toBe("Er sagte „Wort“ leise.");
  });

  it("row C2 — same, plus both inner runs deleted (landings are ALNUM)", () => {
    expect(run("Er sagte « Wort » leise.", "de-DE")).toBe("Er sagte „Wort“ leise.");
  });

  it("en-GB is single-first, and depth parity normalises the author's choice of kind", () => {
    expect(run('She said "hello".', "en-GB")).toBe("She said ‘hello’.");
    expect(run(`She said 'hello'.`, "en-GB")).toBe("She said ‘hello’.");
  });
});

describe("quotes — el worked examples", () => {
  it("row 16 — width drift with no gate intervention: the gate's cost is near zero", () => {
    expect(run(`"Είπε 'κάτι' σε μένα", σημείωσε.`, "el")).toBe("«Είπε “κάτι” σε μένα», σημείωσε.");
  });

  it("row 18 — the elision is NARROW, the quotation WIDE, different stacks", () => {
    const input = `Είπε "σ' αυτό το βιβλίο" χθες.`;
    expect(run(input, "el")).toBe("Είπε «σ' αυτό το βιβλίο» χθες.");
  });
});

describe("quotes — nesting", () => {
  it("alternates primary/secondary by depth parity", () => {
    expect(run(`"a 'b "c" d' e"`, "en-US")).toBe("“a ‘b “c” d’ e”");
  });

  it("depth is counted over the accepted set, not stack height or the raw pass-2 output", () => {
    expect(run('He said "hi. She said "bye."', "en-US")).toBe('He said "hi. She said “bye.”');
    expect(run(`"unmatched. "a 'beta' c"`, "en-US")).toBe(`"unmatched. “a ‘beta’ c”`);
  });

  it("closing takes precedence over opening when a candidate could be either (spec 3.3)", () => {
    expect(run('"a ("-b"', "en-US")).toBe('“a (”-b"');
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
    expect(run('x" then "a"', "en-US")).toBe('x" then “a”');
  });
});

describe("quotes — must not touch (spec/rules/quotes.md 4)", () => {
  it("medial apostrophes, straight and curly alike", () => {
    for (const input of [
      "don't",
      "l'été",
      "O'Brien",
      "Hawai'i",
      "1990's",
      "нью-йорк'ский",
      "d'accord",
      "don’t",
      "l’été",
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

  it("mandate 1: every non-straight quotation glyph is now a candidate, not left alone", () => {
    // A lone curly mark with real content on the inner side and nothing on the outer side is
    // canOpen (or canClose) but finds no partner, so it survives — the same "unmatched, not
    // converted" outcome a lone straight mark has always had.
    const glyphs = [0x2018, 0x201c, 0xab, 0x2039];
    for (const code of glyphs) {
      for (const tag of KNOWN_LOCALES) {
        const input = `plain text ${ch(code)} more text`;
        expect(run(input, tag)).toBe(input);
      }
    }
  });

  it("U+2032, U+2033, U+02BC, U+0060, U+00B4 and the LaTeX idioms are never candidates", () => {
    for (const input of ["`a'", "``a''", "´a´", "`` ''", "6′ 2″", "lʼété"]) {
      for (const tag of KNOWN_LOCALES) expect(run(input, tag)).toBe(input);
    }
  });

  it("spacing: an inner-run deletion only ever removes INLINE-SPACE, never crosses a BREAK", () => {
    expect(run(`"a"`, "fr")).toBe("«a»");
    for (const tag of KNOWN_LOCALES) {
      const out = run('x "a" y', tag);
      // At most one code point shorter than the input, and only ever shorter (a deletion),
      // never longer (quotes never inserts).
      expect(toCodePoints(out).length).toBeLessThanOrEqual(toCodePoints('x "a" y').length);
    }
  });
});

describe("quotes — code-point safety", () => {
  it("treats an astral letter as a LETTER", () => {
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

describe("quotes — the same-kind adjacency veto (V1, spec 3.2) — no longer permanent", () => {
  it("row 7b — the former idempotency witness now has no candidates at all", () => {
    for (const tag of KNOWN_LOCALES) {
      expect(run('"""a""', tag)).toBe('"""a""');
    }
  });

  it("row 7c — a vetoed inner run does not disturb the pair around it", () => {
    expect(run('"a "" b"', "en-US")).toBe('“a "" b”');
    expect(run('“a "" b”', "en-US")).toBe('“a "" b”');
  });

  it("vetoes any run of two or more identical quote marks, straight or curly", () => {
    for (const input of [
      "''",
      '""',
      "'''",
      '""""',
      "a '' b",
      'a "" b',
      "The letter ''",
      "««",
      "””",
    ]) {
      for (const tag of KNOWN_LOCALES) expect(run(input, tag)).toBe(input);
    }
  });

  it("does not veto two adjacent marks of different code points", () => {
    expect(run(`"Hän sanoi 'moi'", totesin.`, "fi")).toBe("”Hän sanoi ’moi’”, totesin.");
    expect(run(`"'Tis so,' he said."`, "en-US")).toBe("“‘Tis so,’ he said.”");
  });
});

describe("quotes — the vacuity condition: a pair enclosing nothing but spaces (spec 3.3)", () => {
  it('the pinned witness " "', () => {
    expect(run('" "', "en-US")).toBe('" "');
  });

  it("the pinned witness «»", () => {
    for (const tag of KNOWN_LOCALES) expect(run("«»", tag)).toBe("«»");
  });

  it("still forms a pair once real content separates the marks", () => {
    expect(run('" a "', "en-US")).toBe("“a”");
  });
});

describe("quotes — the certification gate declines an unstable pairing (spec 3.5)", () => {
  it("the bug-1 witness, ru: width drift with an unmatched candidate declines to ∅", () => {
    const input = `'"‘`;
    expect(run(input, "ru")).toBe(input);
  });

  it("the bug-2 witness, en-GB: a non-local interference across four code points", () => {
    const input = `‘""-"-"`;
    expect(run(input, "en-GB")).toBe(input);
  });

  it("a width-drift pairing that would let an interior elision shadow the real opener declines", () => {
    // Under 0.1.0 the outer DQ pair converted unconditionally to en-GB's NARROW primary. The
    // gate now catches that the elision '90s — also NARROW, canOpen — would sit between the
    // rendered NARROW marks and shadow the real opener on re-scan, and declines the pair.
    const input = `She said "it's the '90s" and left.`;
    expect(run(input, "en-GB")).toBe(input);
  });

  it("every named gate witness is a genuine fixed point of the whole rule, not just of one run", () => {
    const witnesses: readonly [string, string][] = [
      [`'"‘`, "ru"],
      [`‘""-"-"`, "en-GB"],
      [`She said "it's the '90s" and left.`, "en-GB"],
      ['« **"', "fr"],
    ];
    for (const [input, tag] of witnesses) {
      const once = run(input, tag);
      expect(run(once, tag)).toBe(once);
    }
  });
});

describe("quotes — V1's gapInsertable clause: a composition-obligation fix found by testing", () => {
  // Neither design document specified this; it was found by running the full pipeline. A
  // literal-only V1 lets the certification gate correctly decline a pairing whose render would
  // place two identical glyphs strictly adjacent — but `nbsp` (order 70) can then insert a
  // space at exactly that gap, and on the *next* full-pipeline pass the same pairing certifies:
  // `nbsp` creating work for the earlier-ordered `quotes`, forbidden by
  // pipeline-idempotency.md §2. These two witnesses are pinned in spec/fixtures/fr.json.
  it("html tag boundary: « immediately left of a MARKER-adjacent mark that would render to «", () => {
    const input = '«"<p class="x">"';
    const once = transform(input, { locale: "fr", mode: "html" });
    expect(transform(once, { locale: "fr", mode: "html" })).toBe(once);
  });

  it("two adjacent « followed by an unrelated closer", () => {
    const once = transform("««”", { locale: "fr", mode: "text" });
    expect(transform(once, { locale: "fr", mode: "text" })).toBe(once);
  });

  it("does not veto two genuinely distinct, space-separated quotations", () => {
    // The rejected alternative fix (a plain skip-based V1, no gapInsertable guard) would veto
    // this — ordinary prose, not a typewriter artefact — in every locale, including ones with
    // no spaced pair at all.
    expect(run("'a' 'b'", "en-US")).toBe("“a” “b”");
  });
});

describe("quotes — V1ID: apostrophe's U+0027→U+2019 edit is inert to V1 (Corollary A1 fix, spec 0.4.1)", () => {
  // pipeline-idempotency.md §2's composition obligation, violated against I5 by apostrophe (R6)
  // before this fix: V1 compared raw code points, so a NARROW candidate g = U+2019 standing
  // literally next to an *unmatched* U+0027 read a different neighbour on pass 1 (U+0027 ≠
  // U+2019, V1 silent) than on pass 2, after apostrophe converted that neighbour to U+2019
  // (U+2019 = U+2019, V1 fires) — same position, same candidate, different verdict, purely
  // because of what a *later* rule did between the two runs. Found by the fast-check idempotency
  // sweep in de-CH; reproduces deterministically, not a flaky/seed-dependent finding — the exact
  // witness below is the one fast-check reported. Pinned as spec/fixtures/de-CH.json
  // de-ch-quotes-041-cobug-apostrophe-v1; this test additionally asserts the exact normative
  // pass-1 output (which the fixture runner also checks) plus the literal idempotency equality
  // the bug report specifically demanded, and a small bounded family of structurally related
  // witnesses across other locales.

  it("the exact reported counterexample: de-CH, U+0022 B U+0027 U+2019 U+0022 U+2039", () => {
    const input = ch(0x22) + "B" + ch(0x27) + ch(0x2019) + ch(0x22) + ch(0x2039);
    const options = { locale: "de-CH", mode: "text" } as const;

    const once = transform(input, options);
    // Normative first-pass output: the outer U+0022 pair certifies as de-CH's primary « » on
    // pass 1 already (it no longer waits for a second pass to become stable), and the sole
    // unmatched U+0027 is picked up by `apostrophe` in the same pass.
    expect(once).toBe(ch(0xab) + "B" + ch(0x2019) + ch(0x2019) + ch(0xbb) + ch(0x2039));

    // The exact assertion the bug report demanded.
    expect(transform(once, options)).toBe(once);
  });

  it("quotes alone (no apostrophe) is already a no-op on the pass-1 output — I5 holds", () => {
    // Isolates the claim this fix is actually about: quotes' own re-derivation of its pass-1
    // output must not want to change anything, independent of apostrophe running again.
    const once = transform(
      ch(0x22) + "B" + ch(0x27) + ch(0x2019) + ch(0x22) + ch(0x2039),
      { locale: "de-CH", mode: "text" },
    );
    expect(run(once, "de-CH")).toBe(once);
  });

  it("reproduces, and is fixed, in every shipped locale — not a de-CH/B/U+2039 special case", () => {
    const input = ch(0x22) + "B" + ch(0x27) + ch(0x2019) + ch(0x22) + ch(0x2039);
    for (const tag of KNOWN_LOCALES) {
      const once = transform(input, { locale: tag, mode: "text" });
      expect(transform(once, { locale: tag, mode: "text" }), tag).toBe(once);
    }
  });

  it("bounded family: an unmatched U+0027 literally adjacent to a U+2019 candidate, several shapes", () => {
    // Not exhaustive — a small, targeted family around the same shape (a NARROW U+2019 or
    // U+2018/U+2039/U+203a candidate directly beside an unmatched straight apostrophe), across
    // locales whose own primary/secondary pair is genuinely U+2019 (en-GB, fi, sv) as well as
    // one that isn't (en-US), so the fix is checked both where the shape is adversarial and
    // where it is reachable from ordinary correctly-typed content.
    const family: readonly [string, string][] = [
      [ch(0x78) + ch(0x27) + ch(0x2019) + ch(0x79) + ch(0x2039) + ch(0x7a) + ch(0x2039), "en-GB"],
      [ch(0x22) + ch(0x27) + ch(0x2019) + ch(0x22) + ch(0x2039) + "w", "en-US"],
      [ch(0x22) + "a" + ch(0x22) + ch(0x27) + ch(0x2019) + ch(0x2039), "fi"],
      [ch(0x2039) + ch(0x27) + ch(0x2019) + ch(0x22) + "a" + ch(0x22), "sv"],
    ];
    for (const [input, tag] of family) {
      const once = transform(input, { locale: tag, mode: "text" });
      expect(transform(once, { locale: tag, mode: "text" }), `${tag}: ${JSON.stringify(input)}`).toBe(once);
    }
  });

  // V1ID's "conservative" bound is a *local* fact about a single comparison (it can only add a
  // veto there, never grant a capability) — it is NOT a claim about the rule's global output.
  // Passes 2 and 4 operate over the whole candidate list at once, so declining one candidate can
  // remove a crossing/nesting/certification conflict and let a *different* pair certify, get
  // reassigned different glyphs/depth, or change what `nbsp` inserts downstream. The five tests
  // below pin one permanent regression case per distinct mechanism found by exhaustively diffing
  // the pre-0.4.1 raw-comparison V1 against V1ID over a bounded alphabet (all against the current,
  // fixed engine — see quotes.md §5's "V1ID empirical audit" for the full classification):
  //   1–2. pure conservative veto (prime guard, case 5): the mark itself is never corrupted;
  //   3. the reported counterexample's own shape: vetoing a competing candidate *enables* a
  //      different pair to certify that previously could not (indirect newly-enabled conversion);
  //   4. a pairing reassignment: the same input pairs differently, not more or less;
  //   5. the fr/fr-CA downstream `nbsp` consequence of a differently accepted/declined pair.
  // Every assertion is the exact full output, not a substring or single indexed character — the
  // whole point is proving nothing else in the string was touched.
  it("conservative-veto case: a prime-guard-protected U+0027 (digit left, non-letter right) stays U+0027", () => {
    // "2'" is a foot/inch mark (apostrophe.md §3.3 case 1) directly adjacent to a U+2019
    // candidate; V1ID's closure still declines the surrounding pairing, but the mark itself must
    // never be corrupted into a quote glyph or otherwise altered.
    const input = ch(0x22) + "2" + ch(0x27) + ch(0x2019) + ch(0x22) + ch(0x2039);
    const once = transform(input, { locale: "de-CH", mode: "text" });
    expect(once).toBe(ch(0xab) + "2" + ch(0x27) + ch(0x2019) + ch(0xbb) + ch(0x2039));
    expect(transform(once, { locale: "de-CH", mode: "text" })).toBe(once);
  });

  it("conservative-veto case: a case-5 U+0027 (nothing inferable) stays U+0027", () => {
    const input = ch(0x22) + ch(0x27) + ch(0x2019) + ch(0x22) + ch(0x2039);
    const once = transform(input, { locale: "de-CH", mode: "text" });
    expect(once).toBe(ch(0xab) + ch(0x27) + ch(0x2019) + ch(0xbb) + ch(0x2039));
    expect(transform(once, { locale: "de-CH", mode: "text" })).toBe(once);
  });

  it("indirect mechanism: vetoing one candidate lets an unrelated outer pair certify (not a local grant)", () => {
    // Simpler than the full reported counterexample, same mechanism: under the pre-0.4.1 raw
    // comparison this input is left entirely untouched (the inner U+0027/U+2019 pair and the
    // outer NARROW marks destabilise each other's certification, exactly as in the reported
    // counterexample); V1ID vetoing the inner pair removes that instability and lets the outer
    // pair certify on the very first pass.
    const input = ch(0x2018) + ch(0x27) + ch(0x2019) + ch(0x2018);
    const once = transform(input, { locale: "en-US", mode: "text" });
    expect(once).toBe(ch(0x201c) + ch(0x27) + ch(0x2019) + ch(0x201d));
    expect(transform(once, { locale: "en-US", mode: "text" })).toBe(once);
  });

  it("pairing reassignment: the same input pairs differently, not more or less", () => {
    const input = ch(0x27) + "a" + ch(0x27) + ch(0x2019);
    const once = transform(input, { locale: "en-US", mode: "text" });
    // Pre-0.4.1: the two U+0027 pair as a NARROW pair, promoted to en-US's WIDE primary
    // (“a”), leaving the trailing U+2019 untouched: "“a”’". V1ID vetoes the second U+0027
    // (its own literal right neighbour is already U+2019) before it can ever reach pairing, so
    // both U+0027s instead fall through to `apostrophe`'s case ladder independently — leading
    // elision on the first, trailing elision on the second — and the original U+2019 is
    // untouched: "’a’’". Neither output is corrupted; the pairing choice differs.
    expect(once).toBe(ch(0x2019) + "a" + ch(0x2019) + ch(0x2019));
    expect(transform(once, { locale: "en-US", mode: "text" })).toBe(once);
  });

  it("fr/fr-CA downstream nbsp consequence of a differently declined pair", () => {
    // Pre-0.4.1: the two U+2019 pair (NARROW), promoted to fr's WIDE primary « », and `nbsp`
    // (order 70) inserts its required inner no-break spaces around the newly-formed pair:
    // "« ’’ »" (U+00A0 on both sides). V1ID vetoes the pairing entirely (the same "own literal
    // neighbour is already U+2019" mechanism as the reassignment case above, mirrored at both
    // ends), so `quotes` makes no edit and `nbsp` has no pair to insert spacing around: the
    // input passes through byte-identical.
    const input = ch(0x27) + ch(0x2019) + ch(0x2019) + ch(0x27);
    const once = transform(input, { locale: "fr", mode: "text" });
    expect(once).toBe(input);
    expect(transform(once, { locale: "fr", mode: "text" })).toBe(once);
  });

  it("the U+0027/U+2019 distinction still governs outside V1 — not globally normalized by V1ID", () => {
    // V1ID is scoped to V1's own comparison; it must not leak into apostrophe's case ladder (which
    // only ever scans literal U+0027, apostrophe.ts's `at(cp, i) !== SQ`) or into anything treating
    // an already-curly U+2019 as if it were still convertible.
    const options = { locale: "en-US", mode: "text" } as const;
    expect(transform("don't", options)).toBe("don’t"); // literal U+0027, medial: converted
    expect(transform("don’t", options)).toBe("don’t"); // already U+2019: untouched, not "reconverted"
  });
});

describe("quotes — the elision-vs-closer tradeoff (Corollary A1, spec 4/5/6)", () => {
  // An already-curly leading elision can be paired as an opener by a later unrelated closer.
  // Verified by running the implementation: the same corruption already existed for straight
  // input under 0.1.0 (both marks are the same width and pair on the same stack), so mandate 1
  // does not introduce a new class of damage — it only makes the existing ambiguity reachable
  // via curly input too. No U+2019-specific "can never open" restriction is applied, because it
  // would make fi/sv's same-glyph secondary pair unrecognisable as a pair.
  it("en-US: curly and straight input produce the identical corruption", () => {
    expect(run("’90s were fun,’ he said", "en-US")).toBe("“90s were fun,” he said");
    expect(run("'90s were fun,' he said", "en-US")).toBe("“90s were fun,” he said");
  });

  it("en-GB: curly and straight input produce the identical corruption", () => {
    expect(run("’90s were fun,’ he said", "en-GB")).toBe("‘90s were fun,’ he said");
    expect(run("'90s were fun,' he said", "en-GB")).toBe("‘90s were fun,’ he said");
  });

  it("fi: curly and straight input produce the identical corruption", () => {
    expect(run("’90s were fun,’ he said", "fi")).toBe("”90s were fun,” he said");
    expect(run("'90s were fun,' he said", "fi")).toBe("”90s were fun,” he said");
  });

  it("sv: curly and straight input produce the identical corruption", () => {
    expect(run("’90s were fun,’ he said", "sv")).toBe("”90s were fun,” he said");
    expect(run("'90s were fun,' he said", "sv")).toBe("”90s were fun,” he said");
  });

  it("fi/sv's own same-glyph secondary pair (U+2019 both sides) is still recognised as a pair", () => {
    // The scenario Corollary A1 was weighed against: forcing canOpen = false for every U+2019
    // would make this input un-recognisable as a pair at all.
    expect(run(`"a 'beta' c"`, "fi")).toBe("”a ’beta’ c”");
    expect(run("”a ’b’ c”", "fi")).toBe("”a ’b’ c”");
  });
});

describe("quotes — ru/el/fr/fr-CA adversarial sweep: already-curly, both-WIDE locales", () => {
  it("already-correct interleaved nesting is a no-op", () => {
    expect(run(`«a„b«c»d“e»`, "ru")).toBe(`«a„b«c»d“e»`);
    expect(run(`«a“b«c»d”e»`, "el")).toBe(`«a“b«c»d”e»`);
    expect(run(`«a“b«c»d”e»`, "fr")).toBe(`«a“b«c»d”e»`);
    expect(run(`«a“b«c»d”e»`, "fr-CA")).toBe(`«a“b«c»d”e»`);
  });

  it("exhaustive: no idempotency failure over the locale's own glyphs plus {a, space} to length 5", () => {
    const failures: string[] = [];
    for (const tag of ["ru", "el", "fr", "fr-CA"]) {
      const locale = getLocaleData(tag);
      const glyphs = new Set<string>();
      for (const pair of [locale.quotes.primary, locale.quotes.secondary]) {
        glyphs.add(pair.open);
        glyphs.add(pair.close);
      }
      glyphs.add('"');
      glyphs.add("'");
      const alphabet = [...glyphs, "a", " "];
      const sweep = (input: string, depth: number): void => {
        const once = run(input, tag);
        if (run(once, tag) !== once) failures.push(`${tag} :: ${JSON.stringify(input)}`);
        if (depth === 0) return;
        for (const c of alphabet) sweep(input + c, depth - 1);
      };
      sweep("", 5);
    }
    expect(failures).toEqual([]);
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
    expect(runSpans('a"', "en-US")).toBe('a"');
    expect(runSpans('"a"⟦"', "en-US")).toBe('“a”⟦"');
  });

  it("the marker is not SPACELIKE, ALNUM or a QUOTEMARK", () => {
    expect(runSpans("'⟦'", "en-US")).toBe("“⟦”");
    expect(runSpans("a⟦'⟦b", "en-US")).toBe("a⟦'⟦b");
  });

  it("bug-3b's witness: a marker between « and its would-be inner content never pairs", () => {
    expect(runSpans('"⟦«[t](u)', "fr-CA")).toBe('"⟦«[t](u)');
  });

  it("a marker-bearing array is still a fixed point after one run", () => {
    for (const template of [
      '"⟦hello⟦"',
      '"a"⟦"b"',
      "\"He said ⟦'hi'⟦ loudly\"",
      "'⟦'",
      '"⟦"⟦"',
      '"⟦«[t](u)',
    ]) {
      for (const tag of KNOWN_LOCALES) {
        const once = runSpans(template, tag);
        expect(runSpans(once, tag)).toBe(once);
      }
    }
  });
});

describe("quotes — idempotency", () => {
  it("every worked example, and every named witness, is its own fixed point", () => {
    const cases: readonly [string, string][] = [
      ['She said "hello" twice.', "en-US"],
      [`'He said "no" to me,' she noted.`, "en-US"],
      ['He said "hi. She said "bye."', "en-US"],
      ['"""a""', "en-US"],
      ['"a "" b"', "en-US"],
      ["“He said ‘no’ twice.”", "en-US"],
      ['" hello"', "en-US"],
      ['"hello "', "en-US"],
      ['" --x"', "en-US"],
      ['" "', "en-US"],
      ["«»", "en-US"],
      ["’90s were fun,’ he said", "en-US"],
      [`‘""-"-"`, "en-GB"],
      [`She said "it's the '90s" and left.`, "en-GB"],
      ['Hän sanoi "moi" ja lähti.', "fi"],
      [`"Hän sanoi 'moi'", totesin.`, "fi"],
      ["”Hän sanoi ”moi” ja lähti.", "fi"],
      ['Il a dit "bonjour".', "fr"],
      ["Il a dit « bonjour ».", "fr"],
      ['« **"', "fr"],
      [`Он сказал: "это 'моё' дело".`, "ru"],
      [`'"‘`, "ru"],
      [`"Είπε 'όχι' σε μένα", σημείωσε.`, "el"],
      [`Είπε "σ' αυτό το βιβλίο" χθες.`, "el"],
      ["Er sagte «Wort» leise.", "de-DE"],
      ["Er sagte « Wort » leise.", "de-DE"],
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

  // pipeline-idempotency.md §6, the "quotes" tier added in spec 0.3.0: the bug-2 witness
  // (`‘""-"-"`) is seven code points over `{‘ " -}` and the deep tier's core alphabet cannot
  // reach it — this tier is keyed to the rule's own now-self-consistent alphabet instead.
  it("exhaustive sweep: {\" ' - ␣ a} ∪ every distinct quote glyph in the registry, length 0–5, per locale", () => {
    const core = ['"', "'", "-", " ", "a"];
    const failures: string[] = [];
    for (const tag of KNOWN_LOCALES) {
      const locale = getLocaleData(tag);
      const glyphs = new Set<string>();
      for (const pair of [locale.quotes.primary, locale.quotes.secondary]) {
        glyphs.add(pair.open);
        glyphs.add(pair.close);
      }
      const alphabet = [...core, ...glyphs];
      const sweep = (input: string, depth: number): void => {
        const once = run(input, tag);
        if (run(once, tag) !== once) failures.push(`${tag} :: ${JSON.stringify(input)}`);
        if (depth === 0) return;
        for (const c of alphabet) sweep(input + c, depth - 1);
      };
      sweep("", 5);
    }
    expect(failures).toEqual([]);
  }, 60000);

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
        ch(0xa0),
        ch(0x202f),
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

describe("quotes — DOCUMENTED LIMITATION (not portable conformance evidence): identical bytes, different authorial intent", () => {
  it("the idiom matcher cannot read a sentence's own stated intent, only its code points", () => {
    // This test characterizes a known, accepted limitation of the listed-idiom mechanism
    // (quotes.md §3.2's residual-ambiguity note) — it does NOT assert that the output below is
    // the correct interpretation of the input's meaning. Canonical conformance fixtures
    // (spec/fixtures/*.json) never assert this converted form as a successful expected output;
    // only this implementation-level test does, specifically to pin the exposure.
    //
    // The sentence explicitly states it means three separate tokens — the word "rock", a
    // genuinely quoted letter "n", and the word "roll" — then reproduces the identical surface
    // sequence "rock 'n' roll" for illustration. The matcher has no way to read that stated
    // intent: it matches code points against `quotes.elisionIdioms`' left/elided/right shape,
    // not meaning. The first `'n'` is correctly NOT vetoed (its left context is "letter", not
    // "rock", and a comma follows rather than a space), so it pairs as an ordinary depth-1
    // quotation — proving the matcher works exactly as its own N1/N2 counter-examples show. The
    // final "rock 'n' roll" IS vetoed: left/elided/right all match verbatim, even though the
    // sentence's own stated intent is that this is a literal concatenation, not a fresh
    // invocation of the idiom.
    const input =
      "The sequence is the word rock, the quoted letter 'n', and the word roll: rock 'n' roll.";
    const expected =
      "The sequence is the word rock, the quoted letter “n”, and the word roll: rock ’n’ roll.";
    expect(transform(input, { locale: "en-US" })).toBe(expected);
    // Idempotent, as every output must be — the limitation is in what is asserted as "correct",
    // not in the pipeline's stability.
    expect(transform(expected, { locale: "en-US" })).toBe(expected);
  });
});

describe("quotes — ambiguity veto: at least one inline space, not exactly one (spec 0.5.0 correction)", () => {
  // `spaces` (order 10) ordinarily collapses a doubled space before `quotes` (order 40) ever
  // sees it, so a doubled space surviving to the ambiguity veto's own check only happens when
  // `spaces` is disabled — an uncommon but fully supported configuration (`rules: { spaces:
  // false }`), and the one that actually exercises this predicate's own multi-space behaviour
  // rather than `spaces`' collapsing behaviour.
  const noSpacesCollapse = { rules: { spaces: false } } as const;

  it("en-US (cited idiom): a doubled space still preserves the input unchanged, full pipeline", () => {
    // The idiom matcher itself does not match doubled-space input (tests/rules/quote-ambiguity
    // .test.ts), but the general ambiguity veto still does, so the observable result is the same
    // "preserved" outcome as an uncited locale — not a fallback conversion, not a crash.
    for (const input of ["rock  'n' roll", "rock 'n'  roll", "rock  'n'  roll"]) {
      expect(transform(input, { locale: "en-US", ...noSpacesCollapse })).toBe(input);
    }
  });

  it("en-GB/fi/sv (no cited idiom): a doubled space still preserves the input unchanged, full pipeline", () => {
    for (const locale of ["en-GB", "fi", "sv"]) {
      for (const input of ["rock  'n' roll", "rock 'n'  roll", "rock  'n'  roll"]) {
        expect(transform(input, { locale, ...noSpacesCollapse })).toBe(input);
      }
    }
  });

  it("2- and 3-letter ambiguous forms are also preserved with a doubled space, full pipeline", () => {
    expect(transform("say  'no'  now", { locale: "en-US", ...noSpacesCollapse })).toBe(
      "say  'no'  now",
    );
    expect(transform("say  'yes'  now", { locale: "en-US", ...noSpacesCollapse })).toBe(
      "say  'yes'  now",
    );
  });

  it("stable through a second full-pipeline run", () => {
    for (const input of ["rock  'n' roll", "rock 'n'  roll", "say  'no'  now"]) {
      const once = transform(input, { locale: "en-US", ...noSpacesCollapse });
      expect(transform(once, { locale: "en-US", ...noSpacesCollapse })).toBe(once);
    }
  });

  it("with default options (`spaces` enabled), a doubled space collapses first, then the ordinary single-space contract applies", () => {
    // Not a special case of the ambiguity veto — `spaces` (order 10) runs before `quotes`
    // (order 40) and collapses "rock  'n' roll" to "rock 'n' roll" first, so en-US's cited idiom
    // still matches and converts, exactly as it does for genuinely single-spaced input.
    expect(transform("rock  'n' roll", { locale: "en-US" })).toBe("rock ’n’ roll");
    expect(transform("rock  'n' roll", { locale: "en-GB" })).toBe("rock 'n' roll");
  });
});
