import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { transform } from "../../src/index";
import { LOCALES } from "../../src/generated/locales";
import { fromCodePoints, toCodePoints } from "../../src/engine/codepoints";
import { applyEdits } from "../../src/engine/edits";
import { dashesRule } from "../../src/rules/dashes";
import type { LocaleData } from "../../src/types";

const NBSP = " ";
const NNBSP = " ";
const WJ = "\u2060"; // §3.3.1 word joiner, emitted around a tight range dash
const EN = "–";
const EM = "—";

function localeOf(tag: string): LocaleData {
  const data = LOCALES[tag];
  if (data === undefined) throw new Error(`missing locale ${tag}`);
  return data;
}

function withDash(base: LocaleData, dash: LocaleData["dash"]): LocaleData {
  return { ...base, dash };
}

/**
 * The rule is exercised directly rather than through `transform`, so these expectations stay
 * true regardless of which other rules are registered in the pipeline.
 */
function run(input: string, locale: LocaleData): string {
  const cp = toCodePoints(input);
  const edits = dashesRule.apply({ cp, locale, mode: "text" });
  return fromCodePoints(applyEdits(cp, edits, "dashes"));
}

const enUS = localeOf("en-US"); // parenthetical em-tight, range en-tight
const deDE = localeOf("de-DE"); // parenthetical en-spaced, range en-tight
const ru = localeOf("ru"); // parenthetical em-spaced, range em-tight
const fr = localeOf("fr");
const deCH = localeOf("de-CH"); // parenthetical en-spaced, range en-tight

describe("dashes — worked examples, spec §6", () => {
  it("1. en-US: spaced hyphen becomes a tight em dash", () => {
    expect(run("The plan - if there is one - fails.", enUS)).toBe(
      `The plan${EM}if there is one${EM}fails.`,
    );
  });

  it("2. en-US: a tight double hyphen becomes a tight em dash", () => {
    expect(run("The plan--if there is one--fails.", enUS)).toBe(
      `The plan${EM}if there is one${EM}fails.`,
    );
  });

  // Case 3 (numeric ranges become en dashes) moved to tests/rules/ranges.test.ts, spec 0.5.0:
  // range recognition is `ranges`' rule now, not `dashes`'.

  it("4. en-US: compound words are untouched", () => {
    const input = "A well-known e-mail address";
    expect(run(input, enUS)).toBe(input);
  });

  it("5. en-US: COVID-19 and ISO 8859-1 are untouched", () => {
    const input = "COVID-19 and ISO 8859-1";
    expect(run(input, enUS)).toBe(input);
  });

  it("6. en-US: an ISO date and an ISBN are untouched", () => {
    const input = "Released 2026-08-15, ISBN 978-3-16-148410-0";
    expect(run(input, enUS)).toBe(input);
  });

  it("7. en-US: a phone number is untouched", () => {
    const input = "Call 212-555-1234";
    expect(run(input, enUS)).toBe(input);
  });

  it("8. en-US: an asymmetric flag is untouched", () => {
    const input = "run --force to override";
    expect(run(input, enUS)).toBe(input);
  });

  it("9. en-US: a list bullet is untouched", () => {
    const input = "- first item";
    expect(run(input, enUS)).toBe(input);
  });

  it("10. en-US: a decreasing pair fails G5", () => {
    const input = "Scores: 20-10";
    expect(run(input, enUS)).toBe(input);
  });

  it("11. de-DE: en-spaced inserts the spacing a tight input lacked", () => {
    expect(run("Der Plan--falls es einen gibt--scheitert.", deDE)).toBe(
      `Der Plan ${EN} falls es einen gibt ${EN} scheitert.`,
    );
  });

  it("12. de-DE: text already in the target form is untouched", () => {
    const input = `Der Plan ${EN} falls es einen gibt ${EN} scheitert.`;
    expect(run(input, deDE)).toBe(input);
  });

  // Case 13 (a page range) moved to tests/rules/ranges.test.ts, spec 0.5.0.

  it("14. ru: em-spaced parenthetical", () => {
    expect(run("Москва - столица", ru)).toBe(`Москва ${EM} столица`);
  });

  it("15. ru: a no-break space left by nbsp is preserved and nothing else changes", () => {
    const input = `Москва${NBSP}${EM} столица`;
    expect(run(input, ru)).toBe(input);
  });

  it("16. ru: Russian compound words are untouched", () => {
    const input = "из-под стола, кое-что";
    expect(run(input, ru)).toBe(input);
  });
});

describe("dashes — must not touch, spec §4", () => {
  const unchanged: readonly [string, string][] = [
    ["compound word", "well-known e-mail Jean-Luc well-being"],
    ["russian compounds", "из-под кое-что что-таки"],
    ["long flag", "run --force"],
    ["short flag", "use -v here"],
    ["markdown bullet", "text\n- item\nmore"],
    ["signature", "text\n-- Iurii"],
    ["right arrow", "a->b"],
    ["left arrow", "a<-b"],
    ["thematic break", "para\n---\npara"],
    ["long rule", "para\n--------\npara"],
    ["iso date", "2026-08-15"],
    ["isbn", "978-3-16-148410-0"],
    ["phone", "+358-40-555-1234"],
    ["us phone", "212-555-1234"],
    ["part number", "ABC-1234-5678"],
    ["covid", "COVID-19"],
    ["mp3", "MP3-4"],
    ["h2", "H2-2"],
    ["windows", "Windows-1252"],
    ["iso 8859", "ISO 8859-1"],
    ["utf-8", "UTF-8"],
    ["soft hyphen", "well­known"],
    ["non-breaking hyphen", "a ‑ b"],
    ["figure dash", "1 ‒ 2"],
    ["horizontal bar", "a ― b"],
    ["minus sign", "5 − 3"],
    ["fullwidth hyphen", "a － b"],
    ["inert neighbour left", "a‐- b"],
    ["negative number at start", "-5 degrees"],
    ["negative number inline", "it is -5 today"],
    ["decimal range", "1.5-2.5"],
    ["comma decimal range", "1,5-2,5"],
    ["path range", "01/02-03/04"],
    ["abbreviated year range", "2020-24"],
    ["score", "5-0"],
    ["arabic-indic digits", "١٩١٤-١٩١٨"],
    ["dash at end of line", "trailing -\nnext"],
    ["dash at start of line", "prev\n- trailing"],
    ["dash alone", "-"],
    ["empty", ""],
  ];

  for (const [name, input] of unchanged) {
    it(`leaves ${name} alone`, () => {
      expect(run(input, enUS)).toBe(input);
      expect(run(input, deDE)).toBe(input);
      expect(run(input, ru)).toBe(input);
    });
  }
});

describe("dashes — regressions with the highest false-positive cost", () => {
  it("an ISO date survives every locale", () => {
    for (const tag of Object.keys(LOCALES)) {
      expect(run("Released 2026-08-15.", localeOf(tag))).toBe("Released 2026-08-15.");
    }
  });

  it("an ISBN survives every locale", () => {
    for (const tag of Object.keys(LOCALES)) {
      expect(run("ISBN 978-3-16-148410-0", localeOf(tag))).toBe("ISBN 978-3-16-148410-0");
    }
  });

  it("a phone number survives every locale", () => {
    for (const tag of Object.keys(LOCALES)) {
      expect(run("Call +358-40-555-1234 now", localeOf(tag))).toBe("Call +358-40-555-1234 now");
    }
  });

  it("a score survives every locale (G5 rejects 5 > 0)", () => {
    for (const tag of Object.keys(LOCALES)) {
      expect(run("Final score 5-0", localeOf(tag))).toBe("Final score 5-0");
    }
  });

  // "an increasing score is converted" moved to tests/rules/ranges.test.ts, spec 0.5.0.
});

describe("dashes — idempotency regressions, spec §6 cases 18-21", () => {
  it("18. ru: DASH digits DASH is one cluster with two dash runs and is inert", () => {
    const input = `a${EM}0${WJ}${EN}${WJ}0`;
    for (const tag of Object.keys(LOCALES)) {
      expect(run(input, localeOf(tag))).toBe(input);
    }
  });

  it("19. en-US: `a- - a` is inert — the second token has a DASH at cp[L]", () => {
    for (const tag of Object.keys(LOCALES)) {
      expect(run("a- - a", localeOf(tag))).toBe("a- - a");
    }
  });

  it("20. de-DE: `1914-1918--annexation` is one cluster with three dash runs", () => {
    const input = "1914-1918--annexation";
    for (const tag of Object.keys(LOCALES)) {
      expect(run(input, localeOf(tag))).toBe(input);
    }
  });

  it("21. en-US: `a - - b` is inert; it is also the shape that would overlap two edit spans", () => {
    for (const tag of Object.keys(LOCALES)) {
      expect(run("a - - b", localeOf(tag))).toBe("a - - b");
    }
  });
});

describe("dashes — dash-length reclassification, spec §3.2 step 2a (0.2.0)", () => {
  // Spec 0.2.0 retires the unconditional authored-dash guard: length is not reliably an
  // authorial decision (as often a copy-paste artefact as a deliberate choice), and the M4
  // corpus finding this guard originally repaired only ever measured *restyling* — length and
  // spacing changed together — as damage. U+2013/U+2014 are now ordinary `DASH` members with
  // no token-level special case: a run mixing dash glyphs converts exactly as the same run
  // spelled entirely with hyphens would (§3.4 P3 admits a `k = 2, 3` run regardless of
  // spacing), and a locale with no verified convention (`el`, both fields `"none"`) still
  // leaves everything untouched.
  it("42. a mixed run of dash glyphs converts exactly like the same run typed with hyphens", () => {
    for (const input of [`a-${EN}b`, `a${EN}-b`, `a-${EM}b`, `a${EM}--b`, `a-${EN}-b`]) {
      expect(run(input, enUS)).toBe("a—b");
      expect(run(input, deDE)).toBe("a – b");
      expect(run(input, ru)).toBe("a — b");
      // `el` has no verified convention for either field: everything round-trips untouched.
      expect(run(input, localeOf("el"))).toBe(input);
    }
  });

  // Cases 43 and 44 (binding an authored/hyphen-typed range) moved to
  // tests/rules/ranges.test.ts, spec 0.5.0 — binding (§3.3.1) is `ranges`-only now.

  it("the guard decides the token, it does not reclassify the characters", () => {
    // U+2013/U+2014 remain full DASH members as CONTEXT. If they stopped counting, the
    // `a—0–0` family of §5.2 would come straight back through step 6 / step 7 / G2.
    // Step 7, cluster with an authored dash in it:
    expect(run(`a${EM}0-0`, ru)).toBe(`a${EM}0-0`);
    expect(run(`a${EM}0${EN}0`, ru)).toBe(`a${EM}0${EN}0`);
    // Step 6, a DASH neighbour at cp[L] / cp[R]:
    expect(run(`a${EM} - a`, enUS)).toBe(`a${EM} - a`);
    expect(run(`a - ${EM}a`, enUS)).toBe(`a - ${EM}a`);
    // G2, `before` is an authored dash:
    expect(run(`a${EN}1 - 1`, deDE)).toBe(`a${EN}1 - 1`);
  });

  it("T1 is still reachable after step 2a", () => {
    // §5.3a: T1 kept a narrower witness — a tight `--` run facing a digit run with a dash
    // beyond. Without T1 this would become `a – 1 -1` and the far token would flip on pass 2.
    expect(run("a--1 -1", deDE)).toBe("a--1 -1");
    // The control: remove the far dash and the same token converts.
    expect(run("a--1 x", deDE)).toBe(`a ${EN} 1 x`);
  });

  // Cases 45-47 (joiner transparency for G1/G2/G3, and the fixed-point control) moved to
  // tests/rules/ranges.test.ts, spec 0.5.0 — G1-G5 are `ranges`-only now.

  it("the joiner is transparent to T1's two-code-point reach", () => {
    // de-DE en-spaced: the far dash is now reachable across a joiner as well as across a space.
    expect(run(`a--1${WJ}-1`, deDE)).toBe(`a--1${WJ}-1`);
    expect(run(`a--1${WJ} ${WJ}-1`, deDE)).toBe(`a--1${WJ} ${WJ}-1`);
  });

  it("the joiner is in the cluster alphabet, so it cannot split a two-dash cluster", () => {
    expect(run(`2026${WJ}-08-15`, enUS)).toBe(`2026${WJ}-08-15`);
    expect(run(`a${EM}0${WJ}${EN}0`, ru)).toBe(`a${EM}0${WJ}${EN}0`);
  });

  it("the §3.2b guards each keep a witness — none became unreachable", () => {
    // Empirically confirmed by neutralising each guard in turn over the tier-1 and tier-2
    // sweep spaces: all ten still change at least one output. These are the two whose
    // witnesses are §3.2b-adjacent and least obvious.
    // Cluster JOINER membership — a joiner must not split a two-dash cluster:
    expect(run(`1-11${WJ}1-`, deCH)).toBe(`1-11${WJ}1-`);
    // §3.2a's crossed-joiner check — an author's joiner beside a non-range token:
    expect(run(`111--${WJ}.`, enUS)).toBe(`111--${WJ}.`);
  });

  it("7.15. a -spaced locale meeting U+2026 declines — T2's set includes it", () => {
    // spec §7.15: T2's set is deliberately wider than `spaces`' STRIP-BEFORE by U+2026, and
    // both readings are idempotent, so only a fixture can separate them. This is what the
    // implementation actually does, for every -spaced locale.
    for (const tag of Object.keys(LOCALES)) {
      const style = localeOf(tag).dash.parenthetical;
      const spaced = style === "em-spaced" || style === "en-spaced";
      if (!spaced) continue;
      expect(run("a--\u2026", localeOf(tag))).toBe("a--\u2026");
      expect(run("a -- \u2026", localeOf(tag))).toBe("a -- \u2026");
      expect(transform("a--\u2026", { locale: tag })).toBe("a--\u2026");
    }
    // The control: a -tight locale emits no U+0020, so T2 never applies and it converts.
    expect(run("a--\u2026", enUS)).toBe(`a${EM}\u2026`);
  });

  it("spec 0.2.0 reopens the M4 class deliberately: en-GB (en-spaced) now converts an authored em dash's length too", () => {
    // en-GB wants EN_DASH for parenthetical; the author typed EM_DASH. Spec 0.1.0's guard (and
    // 0.2.0's briefly-shipped narrowing) declined this outright. Full retirement converts it:
    // the operator judged a dash's length not to be reliably authorial, so every dash \u2014 not
    // just the spacing of a length-matching one \u2014 now follows the locale.
    const authored = "The plan \u2014 if there is one \u2014 fails.";
    const fixed = "The plan \u2013 if there is one \u2013 fails.";
    const once = transform(authored, { locale: "en-GB" });
    expect(once).toBe(fixed);
    expect(transform(once, { locale: "en-GB" })).toBe(once);
  });

  it("a mis-spaced authored em dash gets its spacing corrected in en-US (em-tight), same as before the length repeal", () => {
    // en-US wants EM_DASH tight. The author's dash is already the right length, only spaced
    // wrong \u2014 this is the class the M4 gate's own corpus showed being left broken forever
    // under the original unconditional guard, and it converts under every later revision of
    // this guard, including full retirement, because the length already matches.
    const authored = "The plan \u2014 if there is one \u2014 fails.";
    const fixed = "The plan\u2014if there is one\u2014fails.";
    const once = transform(authored, { locale: "en-US" });
    expect(once).toBe(fixed);
    expect(transform(once, { locale: "en-US" })).toBe(once);
  });
});

// The entire "G4 run lengths" describe block (cases 3a-3j) moved to
// tests/rules/ranges.test.ts, spec 0.5.0 — G4/G5 and the whole range admissibility test are
// `ranges`-only now.

describe("dashes — Roman-numeral veto P4, spec §3.4 and §6 cases 17a-17c", () => {
  it("17a. ru: a tight em dash between Roman numerals is already correct and is left alone", () => {
    const input = "в XV\u2014XVII веках";
    expect(run(input, ru)).toBe(input);
    // The whole point: an -spaced locale must not space it out.
    expect(run(input, deDE)).toBe(input);
    expect(run(input, fr)).toBe(input);
    for (const tag of Object.keys(LOCALES)) {
      expect(run(input, localeOf(tag))).toBe(input);
    }
  });

  it("17b. the recorded miss: `XV-XVII` is NOT converted — do not silently fix this", () => {
    // spec §7.10. P4 is a veto, never a range-enabler; a real fix needs Roman-to-integer
    // evaluation and a length bound, and must be specified before it is implemented.
    const input = "в XV-XVII веках";
    for (const tag of Object.keys(LOCALES)) {
      expect(run(input, localeOf(tag))).toBe(input);
    }
    // Same for a tight double hyphen, which P3 would otherwise admit.
    expect(run("XV--XVII", ru)).toBe("XV--XVII");
  });

  it("17c. an authored tight em dash gets ru's spacing", () => {
    // Cyrillic is not ROMAN, so P4 does not fire. ru's parenthetical is `em-spaced`, so the
    // token is promoted exactly as a hyphen-typed one would be — its length here happens to
    // already be EM, so only the spacing visibly changes.
    expect(run(`Москва${EM}столица`, ru)).toBe(`Москва ${EM} столица`);
    // The hyphen-typed form still normalises the same way, which is what P4 has to be tested
    // against.
    expect(run("Москва--столица", ru)).toBe(`Москва ${EM} столица`);
  });

  it("lower case is not ROMAN", () => {
    expect(run("mix--did", ru)).toBe(`mix ${EM} did`);
    expect(run("xv--xvii", deDE)).toBe(`xv ${EN} xvii`);
  });

  it("an all-caps word that is not a pure Roman run is unaffected by P4", () => {
    // The outer-bound condition: the ROMAN run must not be part of a longer letter word.
    expect(run("ABC--DEF", deDE)).toBe(`ABC ${EN} DEF`);
    expect(run("WORD--TEXT", deDE)).toBe(`WORD ${EN} TEXT`);
    expect(run("NASA--ESA", deDE)).toBe(`NASA ${EN} ESA`);
  });

  it("the accepted cost: an all-caps word built only from Roman letters is vetoed", () => {
    // spec §3.4 P4 / §7.10 — declining is the safe direction, so `MIX--CIVIL` stays as typed.
    expect(run("MIX--CIVIL", deDE)).toBe("MIX--CIVIL");
  });

  it("P4 only vetoes a tight token, and is still reachable after step 2a", () => {
    // §5.3a: P4 lost its original witness (an authored `XV—XVII`) to step 2a and kept a
    // narrower one — a hyphen run between Roman numerals. Both directions asserted.
    expect(run("XV--XVII", deDE)).toBe("XV--XVII");
    expect(run("Louis XIV--XVI", ru)).toBe("Louis XIV--XVI");
    expect(run("XV -- XVII", deDE)).toBe(`XV ${EN} XVII`);
  });

  it("holds end to end through `transform`, not just through the rule", () => {
    // No leading short word: `nbsp` binds one, which is its job and not this rule's concern.
    const preserved = ["XV\u2014XVII веках", "XV-XVII веках", "Louis XIV\u2014XVI"];
    for (const input of preserved) {
      for (const tag of Object.keys(LOCALES)) {
        const once = transform(input, { locale: tag });
        expect(once).toBe(input);
        expect(transform(once, { locale: tag })).toBe(once);
      }
    }
    // And the control: a non-ROMAN hyphen flank is still normalised by the whole pipeline.
    expect(transform("Москва--столица", { locale: "ru" })).toBe(`Москва ${EM} столица`);
    expect(transform("ABC--DEF", { locale: "de-DE" })).toBe(`ABC ${EN} DEF`);
  });

  it("a mixed Roman/digit flank is not P4's business", () => {
    // `cp[R]` is a digit but `cp[L]` is not, so this is the parenthetical branch, P4 needs
    // ROMAN on both sides, and the ordinary form applies.
    expect(run("XV--9", deDE)).toBe(`XV ${EN} 9`);
  });
});

describe("dashes — spacing-transition guard T1, spec §3.2 step 8 (cases 24-27)", () => {
  // Correction pass (spec 0.6.0): cases 24-26 used to witness with EN (U+2013). That is no
  // longer a valid T1 witness — P5 (§3.4) now declines a pure single authored U+2013
  // unconditionally, before T1 is ever consulted, so an EN witness "passes" regardless of
  // whether T1's own condition holds or not (P5 alone decides it) and would keep passing even
  // with T1 deleted. A T1 test must reach T1 and change outcome if T1 is removed, so every
  // witness below uses EM (never touched by P5) instead. Case 27 already did; 24-26 now match
  // it. See "28b. P5 pre-empts T1" for the EN-witness case, tested separately and honestly as a
  // P5 test, not conflated with T1's own.
  it("24. de-DE: a tight token may not become spaced across a digit run with a far dash", () => {
    expect(run(`a${EM}1 - 1`, deDE)).toBe(`a${EM}1 - 1`);
  });

  it("25. ru: the same shape under em-spaced / em-tight", () => {
    expect(run(`a${EM}1 - 1`, ru)).toBe(`a${EM}1 - 1`);
  });

  it("26. de-DE: the tight sibling, far dash at distance 1", () => {
    expect(run(`a${EM}1-1`, deDE)).toBe(`a${EM}1-1`);
  });

  it("27. en-US converts freely (em-tight, T1 never applies); de-DE stays blocked by T1 (en-spaced)", () => {
    // Revised row 27 for spec 0.2.0. en-US's parenthetical is `em-tight` — not spaced — so T1
    // (which only guards a tight-to-spaced transition) never engages, and the token converts
    // length and spacing both. de-DE's parenthetical is `en-spaced`, so converting this token
    // would insert a U+0020 next to a digit run with a dash two positions further out — T1
    // blocks exactly that, same mechanism as before the guard's retirement.
    // spec 0.6.0: the witness uses EM here, not EN — an authored EN witness would now be
    // declined by P5 (§3.4) regardless of T1/style, which tests P5 rather than T1. See
    // "28b. P5 pre-empts T1" immediately below for that case.
    const input = `a${EM}1 - 1`;
    expect(run(input, enUS)).toBe(`a${EM}1 - 1`);
    expect(run(input, deDE)).toBe(input);
  });

  it("28b. P5 pre-empts T1: an authored EN witness in this exact shape is declined by P5, not converted", () => {
    // Same shape as case 27, but with EN instead of EM: P5 (dashes.md §3.4, spec 0.6.0) declines
    // a pure single authored U+2013 unconditionally, before T1 is ever consulted. This is the
    // regression the T1 test above used to exercise incidentally; kept as its own case so the
    // T1 mechanism and the P5 veto are each tested for what they actually do.
    const input = `a${EN}1 - 1`;
    expect(run(input, enUS)).toBe(input);
    expect(run(input, deDE)).toBe(input);
  });

  it("T1 does not fire when the token is already spaced", () => {
    expect(run("Der Plan--falls es einen gibt--scheitert.", deDE)).toBe(
      `Der Plan ${EN} falls es einen gibt ${EN} scheitert.`,
    );
  });

  // "T1 does not fire when there is no far dash" moved to tests/rules/ranges.test.ts, spec
  // 0.5.0 — both witnesses were range tokens.
});

describe("dashes — composition guard T2, spec §3.2 step 9 (cases 28-32)", () => {
  it("28. de-DE: a spaced dash may not be emitted before a full stop", () => {
    expect(run(".--.", deDE)).toBe(".--.");
  });

  it("29. ru: same, em-spaced", () => {
    expect(run("a--.", ru)).toBe("a--.");
  });

  it("30. de-DE: T2 on the left, after an open bracket", () => {
    expect(run("(--a", deDE)).toBe("(--a");
  });

  it("31. de-DE: T2 on the right, before a close bracket", () => {
    expect(run("a--)", deDE)).toBe("a--)");
  });

  it("32. en-US: em-tight emits no U+0020, so T2 never applies", () => {
    expect(run(".--.", enUS)).toBe(`.${EM}.`);
  });

  it("covers every STRIP-BEFORE and bracket code point", () => {
    for (const right of [",", ".", ";", ":", "!", "?", "\u2026", ")", "]", "}"]) {
      expect(run(`a--${right}`, deDE)).toBe(`a--${right}`);
    }
    for (const left of ["(", "[", "{"]) {
      expect(run(`${left}--a`, deDE)).toBe(`${left}--a`);
    }
    // A locale with a tight form is unaffected throughout.
    expect(run("a--,", enUS)).toBe(`a${EM},`);
  });
});

describe("dashes — composition family 2, spec §6 cases 33-34", () => {
  it("33. fr: a guillemet-spaced hyphen is declined", () => {
    const input = `\u00AB${NBSP}-${NBSP}\u00BB`;
    expect(run(input, fr)).toBe(input);
  });

  it("33. and the shape it comes from is declined too", () => {
    expect(run('"-"', fr)).toBe('"-"');
    expect(run("\u00AB-\u00BB", fr)).toBe("\u00AB-\u00BB");
  });

  it("35.-37. fr: defect (d) — an nbsp inner space on the LEFT of an already-spaced dash", () => {
    // `«⍽–␣x`: under the withdrawn left-only rule this read as symmetric and was promoted
    // en -> em on the second pipeline pass. Now `lsp = 0` against `rsp = 1` and the symmetry
    // guard declines. All five witnesses behave identically.
    for (const right of ["\u00AB", '"', "'", "a", "1"]) {
      const settled = `\u00AB${NBSP}${EN} ${right}`; // case 35 / 37
      const pass1 = `\u00AB${EN} ${right}`; // case 36, the shape `nbsp` acts on
      for (const tag of Object.keys(LOCALES)) {
        expect(run(settled, localeOf(tag))).toBe(settled);
        expect(run(pass1, localeOf(tag))).toBe(pass1);
      }
    }
  });

  it("35.-37. the five witnesses are fixed points through `transform` in fr", () => {
    for (const right of ["\u00AB", '"', "'", "a", "1"]) {
      const input = `\u00AB${EN} ${right}`;
      const once = transform(input, { locale: "fr" });
      expect(transform(once, { locale: "fr" })).toBe(once);
      // ...and the settled form the pipeline actually produces is stable in its own right.
      const settled = `\u00AB${NBSP}${EN} ${right}`;
      const settledOnce = transform(settled, { locale: "fr" });
      expect(transform(settledOnce, { locale: "fr" })).toBe(settledOnce);
    }
  });

  it("the other direction did not regress: ordinary U+0020 spacing still normalises", () => {
    // Same outputs as before the step-3 simplification; the spec reaches them by refusing
    // rather than by recomputing an identical span.
    expect(run("\u00AB - \u00BB", fr)).toBe(`\u00AB ${EM} \u00BB`);
    expect(run("Москва - столица", ru)).toBe(`Москва ${EM} столица`);
    expect(run(`Москва ${EM} столица`, ru)).toBe(`Москва ${EM} столица`);
    expect(run("Москва--столица", ru)).toBe(`Москва ${EM} столица`);
    // The range witness ("Годы 1914-1918 были тяжёлыми") moved to tests/rules/ranges.test.ts,
    // spec 0.5.0.
    // ...and through the whole pipeline, where `nbsp` then settles the spacing.
    for (const input of ["\u00AB - \u00BB", "Москва - столица", "Москва--столица"]) {
      const once = transform(input, { locale: input.includes("Моск") ? "ru" : "fr" });
      const tag = input.includes("Моск") ? "ru" : "fr";
      expect(transform(once, { locale: tag })).toBe(once);
    }
  });

  it("34. ru: the nbsp-promoted Russian form is still untouched", () => {
    const input = `слово${NBSP}${EM} столица`;
    expect(run(input, ru)).toBe(input);
  });
});

describe("dashes — isolation guard, spec §3.2 step 6", () => {
  it("rejects a token whose neighbour beyond the outer spacing is space-like", () => {
    // Two consecutive space-like code points: this rule does not own that spacing.
    expect(run("a  - b", enUS)).toBe("a  - b");
    expect(run(`a${NBSP} - b`, enUS)).toBe(`a${NBSP} - b`);
    expect(run(`a ${NBSP}- b`, enUS)).toBe(`a ${NBSP}- b`);
  });

  it("still accepts an ordinary token", () => {
    expect(run("a - b", enUS)).toBe(`a${EM}b`);
    expect(run("a-b", enUS)).toBe("a-b");
  });
});

describe("dashes — cluster guard, spec §3.2 step 7", () => {
  // "a cluster with one dash run is still editable" and "a space ends a cluster" moved to
  // tests/rules/ranges.test.ts, spec 0.5.0 — both witnesses were range tokens; the cluster
  // guard itself (dash-shared.ts) is unchanged and shared with `dashes`.

  it("INERT-DASH counts towards the cluster's dash-run total", () => {
    // U+2011 and U+002D are two runs inside the single cluster `1914\u20111918-1920`.
    const input = "1914\u20111918-1920";
    expect(run(input, enUS)).toBe(input);
  });
});

describe("dashes — the `none` convention substitutes nothing", () => {
  it("fr declares range: none, so a numeric range is untouched", () => {
    expect(fr.dash.range).toBe("none");
    expect(run("p. 123-125", fr)).toBe("p. 123-125");
    expect(run("Les années 1914-1918", fr)).toBe("Les années 1914-1918");
  });

  it("fr still applies its parenthetical convention", () => {
    expect(run("Le plan - s'il existe - échoue.", fr)).toBe(
      `Le plan ${EM} s'il existe ${EM} échoue.`,
    );
  });

  it("22./23. a locale with both fields none changes nothing at all", () => {
    const silent = withDash(enUS, { parenthetical: "none", range: "none" });
    const inputs = [
      "The plan - if there is one - fails.", // 22: classified parenthetical, nothing emitted
      "1914-1918", // 23: classified range, nothing emitted, never reconsidered
      "The plan--if there is one--fails.",
      "1914-1918 and pp. 34-36",
      `already ${EM} normalised`,
      `already ${EN} normalised`,
    ];
    for (const input of inputs) {
      expect(run(input, silent)).toBe(input);
    }
  });

  it("23. a none range token is never reconsidered as a parenthetical", () => {
    // The dangerous shape: `range` is none while `parenthetical` is not. A fall-through would
    // turn `1914-1918` into `1914 — 1918`.
    const rangeSilent = withDash(enUS, { parenthetical: "em-spaced", range: "none" });
    expect(run("1914-1918", rangeSilent)).toBe("1914-1918");
    expect(run("pp. 34-36", rangeSilent)).toBe("pp. 34-36");
    // A range token that fails a guard is not a parenthetical either.
    expect(run("Scores: 20-10", rangeSilent)).toBe("Scores: 20-10");
    // The parenthetical field still works in the same locale.
    expect(run("Le plan - s'il existe - échoue", rangeSilent)).toBe(
      `Le plan ${EM} s'il existe ${EM} échoue`,
    );
  });
});

describe("dashes — no-break spaces", () => {
  // "17. ru uses an em dash for ranges" and "an en-spaced range keeps its spacing stable" moved
  // to tests/rules/ranges.test.ts, spec 0.5.0 — `dash.range` is no longer read by `dashes`.

  /**
   * §3.2 step 3 + §3.6, rewritten. SPACE means U+0020 and nothing else, so a dash touching a
   * no-break space is inert on EITHER side — it falls through to cp[L]/cp[R] and step 6
   * declines it as space-like. This is the CO-S discharge against `nbsp`
   * (pipeline-idempotency.md §5.1a): every code point `nbsp` can emit is inert here, so no
   * input exists on which `nbsp` can create work for this rule.
   */
  it("a token touching a NOBREAK-SPACE is inert, on either side", () => {
    const inputs = [
      `слово${NBSP}- слово`,
      `Wort${NBSP}-- Wort`,
      `слово${NBSP}-${NBSP}слово`,
      `mot${NNBSP}-${NNBSP}mot`,
      `Wort${NBSP}--${NBSP}Wort`,
      `mot -${NBSP}mot`,
      `mot${NBSP}- autre`,
      `mot${NNBSP}--${NNBSP}autre`,
      `слово${NBSP}${EM} столица`,
      `слово${NBSP}${EM}${NBSP}столица`,
    ];
    for (const input of inputs) {
      for (const tag of Object.keys(LOCALES)) {
        expect(run(input, localeOf(tag))).toBe(input);
      }
    }
  });

  it("7a. the accepted miss: a hand-typed `mot⍽- autre` is declined, not normalised", () => {
    // spec §7.7a. The rule cannot tell an author's U+00A0 from one `nbsp` inserted, and
    // reinterpreting no-break spacing here is the road that produced three defects. If real
    // content shows this matters, the fix belongs in `nbsp`, not here.
    const input = `mot${NBSP}- autre`;
    expect(run(input, fr)).toBe(input);
    expect(run(input, deDE)).toBe(input);
    // The all-U+0020 form still normalises, which is what the miss is measured against.
    expect(run("mot - autre", deDE)).toBe(`mot ${EN} autre`);
  });

  it("every emitted space is U+0020, and the only other emission is U+2060", () => {
    const emitted = new Set<number>();
    for (const tag of Object.keys(LOCALES)) {
      const locale = localeOf(tag);
      for (const input of ["mot - autre", "mot--autre", `mot${EM}autre`, `a ${EN} b`]) {
        const cp = toCodePoints(input);
        for (const edit of dashesRule.apply({ cp, locale, mode: "text" })) {
          for (const value of edit.replacement) emitted.add(value);
        }
      }
    }
    for (const value of emitted) {
      expect([0x20, 0x2013, 0x2014, 0x2060]).toContain(value);
    }
    expect(emitted.has(0x00a0)).toBe(false);
    expect(emitted.has(0x202f)).toBe(false);
  });

  it("an authored EM dash's length and spacing both follow the locale's parenthetical form (spec 0.2.0)", () => {
    // The 1063-line M4 class was restyling — turning an authored em dash into an en dash or
    // back — and spec 0.2.0 reopens it deliberately (dashes.md §7 item 14): a dash's length is
    // no longer treated as reliably authorial, so every authored EM dash is promoted to the
    // locale's parenthetical form exactly as a hyphen-typed one would be. Expected outputs are
    // computed from each locale's own `dash.parenthetical` field, not hand-picked per row.
    // spec 0.6.0: this exhaustive loop used to cover EN alongside EM. It no longer does — P5
    // (§3.4, §8.8) carves out exactly one glyph, a pure single authored U+2013, as a narrow
    // exception to the "no distinction based on which DASH glyph the author typed" claim this
    // test title used to make in full generality. See the next test for EN's own, now-different,
    // exhaustive assertion.
    for (const tag of Object.keys(LOCALES)) {
      const style = localeOf(tag).dash.parenthetical;
      for (const spaced of [true, false]) {
        const input = spaced
          ? `The plan ${EM} if any ${EM} fails`
          : `The plan${EM}if any${EM}fails`;
        const expected =
          style === "none"
            ? input
            : (() => {
                const target = style === "em-tight" || style === "em-spaced" ? EM : EN;
                const wantSpaced = style === "em-spaced" || style === "en-spaced";
                return wantSpaced
                  ? `The plan ${target} if any ${target} fails`
                  : `The plan${target}if any${target}fails`;
              })();
        expect(run(input, localeOf(tag)), `${tag} ${JSON.stringify(input)}`).toBe(expected);
      }
    }

    // Hyphen input converts exactly the same way — there is no separate "length guard" left, and
    // P5 never applies to a hyphen (only to a pure single U+2013).
    expect(run("The plan -- if any -- fails", enUS)).toBe(`The plan${EM}if any${EM}fails`);
  });

  it("P5 (spec 0.6.0): an authored EN dash is declined unconditionally, every locale, tight and spaced, regardless of the locale's own parenthetical target glyph", () => {
    // Fresh M4 evidence (dashes.md §8.8): 8/8 authored-en-dash conversions found in a real
    // corpus were range or joint-name damage; 0/8589 other accepted edits touched an authored
    // en-dash at all. Unlike EM above, EN's expected output is the same everywhere: unchanged —
    // not locale-target-conditioned, per the operator decision recorded in §8.8 (a
    // target-glyph-conditioned veto would leave the identical failure reachable in exactly the
    // locales whose own target happens to already be U+2013).
    for (const tag of Object.keys(LOCALES)) {
      for (const spaced of [true, false]) {
        const input = spaced
          ? `The plan ${EN} if any ${EN} fails`
          : `The plan${EN}if any${EN}fails`;
        expect(run(input, localeOf(tag)), `${tag} ${JSON.stringify(input)}`).toBe(input);
      }
    }
  });

  it("a run of two or three qualifies, a run of four does not", () => {
    expect(run("a--b", enUS)).toBe(`a${EM}b`);
    expect(run("a---b", enUS)).toBe(`a${EM}b`);
    expect(run("a----b", enUS)).toBe("a----b");
  });
});

describe("dashes — idempotency", () => {
  const alphabet = [
    "a",
    "b",
    "z",
    "Я",
    "é",
    "0",
    "1",
    "5",
    "9",
    "-",
    EN,
    EM,
    "‑",
    "−",
    " ",
    NBSP,
    NNBSP,
    "\n",
    ".",
    ",",
    "/",
    "+",
    "(",
  ];

  const tags = Object.keys(LOCALES);

  /**
   * pipeline-idempotency.md §6.2 — the per-rule bounded exhaustive sweep, in the two normative
   * tiers. A uniform random generator misses `.--.` essentially always; these do not.
   * No preconditions: §6 forbids them outside a named, pinned containment, and there is
   * nothing left to contain.
   *
   * The standing obligation behind the bounds: a bound that cannot reach a known witness will
   * hide the next one. Defect (e) needed seven characters and the bound was four, so the suite
   * stayed green while it shipped. When a defect's witness is out of reach, the bound is raised
   * in the same change that fixes the defect.
   */
  it("bounded exhaustive sweep, tier 1: wide alphabet to length 5, every locale", () => {
    // pipeline-idempotency.md §6: the alphabet must carry the code points the rules EMIT, not
    // only those they consume. Idempotency is a statement about re-processing output, and
    // defect (d) — `«⍽–␣"`, spelled entirely in emitted characters — was unreachable without
    // this. The list grows when a locale adds quote glyphs.
    const sweepAlphabet = [
      // consumed
      '"',
      "'",
      "-",
      " ",
      ".",
      "1",
      "a",
      "‐", // hyphen — joined `dashes`' DASH class in spec 0.2.0
      "−", // minus sign — joined `dashes`' DASH class in spec 0.2.0
      // emitted
      "\u00AB",
      "\u00BB",
      "\u201C",
      "\u201D",
      "\u201E",
      "\u2018",
      "\u2019",
      EN,
      EM,
      "\u2026",
      NBSP,
      NNBSP,
      "\u2011",
      WJ, // §3.3.1 emits it, so the sweep must be able to re-read it
    ];
    const diverged: string[] = [];
    const walk = (prefix: string, depth: number) => {
      for (const tag of tags) {
        const locale = localeOf(tag);
        const once = run(prefix, locale);
        if (run(once, locale) !== once) diverged.push(`${tag} ${JSON.stringify(prefix)}`);
      }
      if (depth === 0) return;
      for (const c of sweepAlphabet) walk(prefix + c, depth - 1);
    };
    walk("", 5);
    expect(diverged).toEqual([]);
  }, 600000);

  it("bounded exhaustive sweep, tier 2: deep core alphabet to length 8, every locale", () => {
    // `1 - SPACE . U+2060` to length 8 — 390 625 strings per locale. This is the tier that
    // reaches the seven-character witness of defect (e), `1-1 - 1`.
    const core = ["1", "-", " ", ".", WJ];
    const diverged: string[] = [];
    const walk = (prefix: string, depth: number) => {
      for (const tag of tags) {
        const locale = localeOf(tag);
        const once = run(prefix, locale);
        if (run(once, locale) !== once) diverged.push(`${tag} ${JSON.stringify(prefix)}`);
      }
      if (depth === 0) return;
      for (const c of core) walk(prefix + c, depth - 1);
    };
    walk("", 8);
    expect(diverged).toEqual([]);
  }, 600000);

  it("apply(apply(x)) === apply(x)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...tags),
        fc.array(fc.constantFrom(...alphabet), { maxLength: 40 }),
        (tag, chars) => {
          const input = chars.join("");
          const locale = localeOf(tag);
          const once = run(input, locale);
          expect(run(once, locale)).toBe(once);
        },
      ),
      { numRuns: 5000 },
    );
  });

  it("apply(apply(x)) === apply(x) over arbitrary text", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...tags),
        fc.string({ unit: "binary", maxLength: 200 }),
        (tag, input) => {
          const locale = localeOf(tag);
          const once = run(input, locale);
          expect(run(once, locale)).toBe(once);
        },
      ),
      { numRuns: 2000 },
    );
  });

  it("never inserts or removes a line terminator", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...tags),
        fc.array(fc.constantFrom(...alphabet), { maxLength: 40 }),
        (tag, chars) => {
          const input = chars.join("");
          const out = run(input, localeOf(tag));
          const count = (text: string) => toCodePoints(text).filter((c) => c === 0x0a).length;
          expect(count(out)).toBe(count(input));
        },
      ),
      { numRuns: 1000 },
    );
  });

  it("never produces an INERT-DASH that was not already there", () => {
    // §3.1: U+00AD (soft hyphen) and U+2011 (non-breaking hyphen, `hyphen`'s own output) are
    // the only two code points this rule must never touch or emit. Every other former member
    // (U+2010, U+2012, U+2015, U+2212, U+FE58, U+FE63, U+FF0D) is now a DASH candidate.
    const inert = [0x00ad, 0x2011];
    fc.assert(
      fc.property(
        fc.constantFrom(...tags),
        fc.array(fc.constantFrom(...alphabet), { maxLength: 40 }),
        (tag, chars) => {
          const input = chars.join("");
          const before = toCodePoints(input).filter((c) => inert.includes(c)).length;
          const after = toCodePoints(run(input, localeOf(tag))).filter((c) =>
            inert.includes(c),
          ).length;
          expect(after).toBe(before);
        },
      ),
      { numRuns: 1000 },
    );
  });
});
