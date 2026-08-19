import { describe, expect, it } from "vitest";
import { LOCALES } from "../../src/generated/locales";
import { transform } from "../../src/index";
import {
  concatenateSpans,
  filterBoundaryEdits,
  LINE_MARKER,
  MARKER,
  normalizeSpans,
  spanRangesOf,
} from "../../src/modes/spans";
import type { Edit } from "../../src/types";

const html = (input: string, locale: string): string => transform(input, { locale, mode: "html" });

/**
 * spec/rules/modes.md 3.2–3.4. The span model is the decision the whole mode layer follows from,
 * so it is tested by the worked cases the spec argues from, not by a paraphrase of them.
 */
describe("the span model (modes.md 3.2)", () => {
  it("is not model A: an inner quotation nested across an element takes the secondary pair", () => {
    // Processed per span, `'hi'` would pair in isolation at depth 1 and take the *primary*
    // glyphs. It sits inside a converted outer quotation, so the answer is the secondary pair.
    expect(html("\"He said <em>'hi'</em> loudly\"", "en-US")).toBe(
      "“He said <em>‘hi’</em> loudly”",
    );
    // Same depths as the unwrapped text run: the element is invisible to nesting.
    expect(html("\"He said <em>'hi'</em> loudly\"", "fr")).toBe(
      transform("\"He said 'hi' loudly\"", { locale: "fr" })
        .replace("“", "<em>“")
        .replace("”", "”</em>"),
    );
  });

  it("is not model B: adjacency across a skipped element is not manufactured", () => {
    // Naive concatenation gives `"a""b"`, the same-kind adjacency veto fires on marks that are
    // not adjacent in the document, and the surviving pair quotes the whole construction.
    expect(html('"a"<code>x</code>"b"', "en-US")).toBe("“a”<code>x</code>“b”");
    // Naive concatenation gives two spaces where the document has one on each side.
    expect(html('He said <code>x</code> "hi"', "en-US")).toBe("He said <code>x</code> “hi”");
  });
});

describe("every other rule declines across a boundary (modes.md 3.4)", () => {
  it("dashes: the symmetry guard sees the marker, not a space", () => {
    expect(html("<em>foo </em>- bar", "de-DE")).toBe("<em>foo </em>- bar");
    expect(transform("foo - bar", { locale: "de-DE" })).toBe("foo – bar");
  });

  it("spaces: two runs of one, not one run of two", () => {
    expect(html("a <em>b</em> c", "en-US")).toBe("a <em>b</em> c");
  });

  it("nbsp: N5 requires a real space to the left of the unit", () => {
    expect(html("5 <em>km</em>", "fi")).toBe("5 <em>km</em>");
    expect(transform("5 km", { locale: "fi" })).toBe("5 km");
  });

  it("hyphen: no listed form matches across the marker", () => {
    expect(html("из<em>-под</em>", "ru")).toBe("из<em>-под</em>");
    expect(transform("из-под", { locale: "ru" })).toBe("из‑под");
  });

  it("symbols: the literal (c) does not match across the marker", () => {
    expect(html("(c<em>)</em>", "en-US")).toBe("(c<em>)</em>");
    expect(transform("(c)", { locale: "en-US" })).toBe("©");
  });

  it("a word interrupted by a skipped element is left alone (modes.md 7.2)", () => {
    expect(html("un<code>x</code>believable", "ru")).toBe("un<code>x</code>believable");
  });
});

describe("an insertion at a span boundary is discarded (modes.md 3.4, 7.3)", () => {
  it("declines both halves of the mirror pair rather than choosing a side", () => {
    expect(html("mot<em>!</em>", "fr")).toBe("mot<em>!</em>");
    expect(html("<em>mot</em>!", "fr")).toBe("<em>mot</em>!");
    expect(transform("mot!", { locale: "fr" })).toBe("mot !");
  });

  it("still applies a replacement adjacent to a boundary", () => {
    // The U+0020 already lives inside the right-hand span, so N2 converts it in place.
    expect(html("<em>mot</em> !", "fr")).toBe("<em>mot</em> !");
  });

  it("filterBoundaryEdits discards an insertion whose position is a span edge", () => {
    const cp = [0x61, MARKER, 0x62];
    const ranges = spanRangesOf(cp);
    const insertion = (start: number): Edit => ({
      start,
      end: start,
      replacement: [0x20],
      ruleId: "nbsp",
    });
    // An insertion has d = 0, so r > d always: it survives only strictly inside a span.
    expect(filterBoundaryEdits(cp, [insertion(0)], ranges)).toEqual([]);
    expect(filterBoundaryEdits(cp, [insertion(1)], ranges)).toEqual([]);
    expect(filterBoundaryEdits(cp, [insertion(2)], ranges)).toEqual([]);
    expect(filterBoundaryEdits(cp, [insertion(3)], ranges)).toEqual([]);
  });

  it("filterBoundaryEdits discards an edit whose span contains a marker", () => {
    const cp = [0x61, MARKER, 0x62];
    const ranges = spanRangesOf(cp);
    const across: Edit = { start: 0, end: 3, replacement: [0x63], ruleId: "spaces" };
    const inside: Edit = { start: 2, end: 3, replacement: [0x63], ruleId: "spaces" };
    expect(filterBoundaryEdits(cp, [across], ranges)).toEqual([]);
    expect(filterBoundaryEdits(cp, [inside], ranges)).toEqual([inside]);
  });
});

/**
 * modes.md 3.4's worked table, case for case. The verdict is a pure function of
 * `(p, q, r, s₀, s₁)` and needs no knowledge of Markdown or HTML syntax.
 */
describe("the edge-growth rule (modes.md 3.4)", () => {
  // `abc⟦def`: span 0 is [0,2], span 1 is [4,6].
  const cp = [0x61, 0x62, 0x63, MARKER, 0x64, 0x65, 0x66];
  const ranges = spanRangesOf(cp);
  const edit = (start: number, end: number, replacement: number[]): Edit => ({
    start,
    end,
    replacement,
    ruleId: "dashes",
  });
  const applies = (e: Edit): boolean => filterBoundaryEdits(cp, [e], ranges).length === 1;

  it("applies a one-for-one replacement at an edge (1 → 1)", () => {
    expect(applies(edit(0, 1, [0x201c]))).toBe(true);
    expect(applies(edit(2, 3, [0x201d]))).toBe(true);
    expect(applies(edit(6, 7, [0x201d]))).toBe(true);
  });

  it("discards growth at either edge (1 → 3)", () => {
    expect(applies(edit(0, 1, [0x20, 0x2013, 0x20]))).toBe(false);
    expect(applies(edit(2, 3, [0x20, 0x2013, 0x20]))).toBe(false);
    expect(applies(edit(4, 5, [0x20, 0x2013, 0x20]))).toBe(false);
  });

  it("applies the same growth interior to a span (1 → 3)", () => {
    expect(applies(edit(1, 2, [0x20, 0x2013, 0x20]))).toBe(true);
    expect(applies(edit(5, 6, [0x20, 0x2013, 0x20]))).toBe(true);
  });

  it("applies shrinking at an edge (3 → 1)", () => {
    expect(applies(edit(0, 3, [0xa9]))).toBe(true);
    expect(applies(edit(4, 7, [0xa9]))).toBe(true);
  });

  it("never sees a deletion: r > d is false, so this filter does not restrict one", () => {
    expect(applies(edit(0, 1, []))).toBe(true);
    expect(applies(edit(6, 7, []))).toBe(true);
  });

  /**
   * The same four verdicts driven through `transform`, so that the filter is exercised by real
   * rule output rather than only by synthetic edits.
   *
   * The vehicle for growth is a **double hyphen**, not an authored dash: `dashes.md` 3.2 step 2a
   * promotes a hyphen and never restyles a U+2013/U+2014 the author typed, so `a<em>–</em>b`
   * produces no edit to filter. `--` still becomes `␣–␣` in a `-spaced` locale, which is 2 → 3.
   */
  it("applies a one-for-one replacement at a span edge", () => {
    // Both marks of the span `"x"` sit at s₀ and s₁; `"` → `“` is 1 → 1 and is permitted there.
    expect(html('<em>"x"</em>', "en-US")).toBe("<em>“x”</em>");
    expect(html('a<em>"x"</em>b', "en-US")).toBe("a<em>“x”</em>b");
  });

  it("applies shrinking at a span edge", () => {
    expect(html("<em>(c)</em>x", "en-US")).toBe("<em>©</em>x");
    expect(html("<em>...</em>x", "en-US")).toBe("<em>…</em>x");
  });

  it("discards growth at a span edge and applies it interior (modes.md 7.9)", () => {
    // de-DE is `en-spaced`: `--` → `␣–␣`, 2 → 3. At both edges of the span, so it is discarded.
    expect(html("a<em>--</em>b", "de-DE")).toBe("a<em>--</em>b");
    // The same edit, the same locale, the same document — interior, so it fires.
    expect(html("a<em>x--y</em>b", "de-DE")).toBe("a<em>x – y</em>b");
    // en-US is `em-tight`: `--` → `—` is 2 → 1, shrinking, so the edge does not stop it. The
    // asymmetry 7.9 records is between locale *conventions*, not between documents.
    expect(html("a<em>--</em>b", "en-US")).toBe("a<em>—</em>b");
    expect(html("a<em>x--y</em>b", "en-US")).toBe("a<em>x—y</em>b");
  });

  it("does not resurrect a conversion the rule itself declined", () => {
    // `dashes.md` §3.2 step 2a is fully retired (spec 0.2.0): a dash's length is no longer
    // protected on authorship grounds, so `a<em>–</em>b`'s EN dash converts to EM in en-US
    // (`em-tight`) — the mode edge-growth rule (modes.md 3.4) permits it because a tight
    // 1-code-point-for-1-code-point replacement does not grow the span. Every other locale
    // here wants EN already (unchanged, correct) or wants a spaced form the tight token has no
    // room to grow into at the span edge (unchanged, declined at the boundary layer, not by
    // authorship). The mode layer only ever removes edits, so a rule that produced none must
    // come back byte-identical.
    for (const locale of Object.keys(LOCALES)) {
      const expected = locale === "en-US" ? "a<em>—</em>b" : "a<em>–</em>b";
      expect(html("a<em>–</em>b", locale), locale).toBe(expected);
    }
    // `a<em>x — y</em>b` is EM, spaced, with room inside the span for the dash to change
    // length. en-US (`em-tight`) closes the spacing; de-CH/de-DE/en-GB/fi/sv (`en-spaced`)
    // convert the length; el/fr/fr-CA/ru (`em-spaced` or `none`) are already correct.
    const enSpaced = ["de-CH", "de-DE", "en-GB", "fi", "sv"];
    for (const locale of Object.keys(LOCALES)) {
      const expected =
        locale === "en-US"
          ? "a<em>x—y</em>b"
          : enSpaced.includes(locale)
            ? "a<em>x – y</em>b"
            : "a<em>x — y</em>b";
      expect(html("a<em>x — y</em>b", locale), locale).toBe(expected);
    }
  });
});

describe("span bookkeeping", () => {
  it("coalesces spans separated by nothing in the source (modes.md 7.4)", () => {
    expect(
      normalizeSpans([
        { start: 0, end: 3 },
        { start: 3, end: 5 },
      ]),
    ).toEqual([{ start: 0, end: 5 }]);
  });

  it("sorts and drops empty spans", () => {
    expect(
      normalizeSpans([
        { start: 4, end: 6 },
        { start: 2, end: 2 },
        { start: 0, end: 1 },
      ]),
    ).toEqual([
      { start: 0, end: 1 },
      { start: 4, end: 6 },
    ]);
  });

  it("rejects overlapping spans rather than merging them", () => {
    expect(() =>
      normalizeSpans([
        { start: 0, end: 4 },
        { start: 2, end: 6 },
      ]),
    ).toThrow(/overlapping spans/);
  });

  it("separates every adjacent pair with exactly one marker, and never uses a code point", () => {
    const source = "ab.cd.ef";
    const cp = concatenateSpans(source, [
      { start: 0, end: 2 },
      { start: 3, end: 5 },
      { start: 6, end: 8 },
    ]);
    expect(cp).toEqual([0x61, 0x62, MARKER, 0x63, 0x64, MARKER, 0x65, 0x66]);
    expect(MARKER).toBe(-1);
  });
});

/**
 * modes.md 3.3, the *Edge tests* clause. Where a rule asks "am I at the edge of the text I am
 * allowed to modify" rather than "what character is here", the marker behaves as `NONE`. There is
 * exactly one such test in the spec — `spaces.md` 3.2 step 4 — and the division it draws is that
 * a rule that **deletes** must treat a span edge as the end of the text, while a rule that
 * replaces or inserts must not and is governed by the edge-growth rule instead.
 */
describe("edge tests (modes.md 3.3)", () => {
  it("spaces treats a span edge as the end of the text and declines to delete", () => {
    // Read without the clause, the trailing run has content on both sides and collapses. In
    // `html` such a run is frequently the only separator between two inline elements.
    expect(html("a  <!--x-->  b", "en-US")).toBe("a  <!--x-->  b");
    expect(html("a  <em>x</em>  b", "en-US")).toBe("a  <em>x</em>  b");
  });

  it("but a replacement at the same edge still applies, per 3.4", () => {
    // `spaces` does not delete the U+0020, so `nbsp` converts it in place: 1 -> 1, permitted.
    expect(html("<em>mot</em> !", "fr")).toBe("<em>mot</em>\u202f!");
    expect(transform("mot !", { locale: "fr" })).toBe("mot\u202f!");
  });
});

/**
 * modes.md 3.2: which marker separates two spans is decided by the raw source bytes of the gap,
 * so it is decidable without asking the parser anything.
 */
describe("the two markers (modes.md 3.2)", () => {
  it("uses -1 when the gap holds no line terminator and -2 when it does", () => {
    const inline = "ab.cd";
    expect(
      concatenateSpans(inline, [
        { start: 0, end: 2 },
        { start: 3, end: 5 },
      ]),
    ).toEqual([0x61, 0x62, MARKER, 0x63, 0x64]);

    const wrapped = "ab\ncd";
    expect(
      concatenateSpans(wrapped, [
        { start: 0, end: 2 },
        { start: 3, end: 5 },
      ]),
    ).toEqual([0x61, 0x62, LINE_MARKER, 0x63, 0x64]);

    expect(MARKER).toBe(-1);
    expect(LINE_MARKER).toBe(-2);
  });

  it("classifies a paragraph-internal soft line break as a line boundary", () => {
    const source = 'foo\n"bar"';
    // The two `data` runs of one paragraph, separated by a `lineEnding` — a -2 gap.
    expect(transform(source, { locale: "en-US", mode: "markdown", dialect: "commonmark" })).toBe(
      transform(source, { locale: "en-US" }),
    );
  });

  it("protects a run bordering a line boundary", () => {
    // modes.md 3.2 makes -2 a member of BREAK for every rule, so `spaces` must refuse a run
    // bordering it exactly as it does at a real line terminator in `text` mode.
    expect(transform("a  \n  b", { locale: "en-US" })).toBe("a  \n  b");
    expect(html("a  <!--\n-->  b", "en-US")).toBe("a  <!--\n-->  b");
  });
});
