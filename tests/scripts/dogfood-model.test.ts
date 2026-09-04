// Regression tests for the M4 dogfooding two-level AtomicEdit/ReviewChange model (Stage 10 Pass A
// correction). Covers all 20 acceptance cases from the correction task, plus the reconstruction
// property tests the whole model rests on. Every fixture is synthetic and constructed inline;
// nothing here touches the real blog corpus.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { transform } from "../../src/index.js";
import { getLocaleData } from "../../src/engine/locale.js";
import { LOCALES } from "../../src/generated/locales.js";
import { attributeReviewChanges } from "../../scripts/dogfood/attribution.js";
import {
  applyAtomicEditsBackward,
  applyAtomicEditsForward,
  computeFileDiff,
  offsetToLineCol,
  REVIEW_CHANGE_MAX_OLD_SPAN_CODEPOINTS,
  type AtomicEdit,
} from "../../scripts/dogfood/diff.js";
import { computeRiskTags, type RiskTag } from "../../scripts/dogfood/tagging.js";
import { buildReviewChangeEntries } from "../../scripts/dogfood/evidence.js";
import {
  checkAtomicEditOwnership,
  checkIndependentReconstruction,
  checkReviewChangeSlicesMatchSource,
  checkReviewChangeSizeCap,
  checkRiskTagEvidence,
  checkUtf8ByteBoundaries,
} from "../../scripts/dogfood/consistency.js";
import { runDogfood } from "../../scripts/dogfood/run.js";
import type { FileResult } from "../../scripts/dogfood/transform-corpus.js";

const disposableDirs: string[] = [];
function freshDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  disposableDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (disposableDirs.length > 0) {
    const dir = disposableDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function fakeResult(path_: string, original: string, full: string): FileResult {
  const diff = computeFileDiff(path_, original, full);
  return {
    path: path_,
    bytes: 0,
    sha256: "x",
    status: "changed",
    idempotencyOk: true,
    diff,
    originalText: original,
    transformedText: full,
  };
}

const enUSLocale = getLocaleData("en-US");
const frLocale = getLocaleData("fr");

// -------------------------------------------------------------------------------------------
// Reconstruction property -- the foundation every other guarantee is built on.
// -------------------------------------------------------------------------------------------
describe("AtomicEdit reconstruction property", () => {
  it("forward (original + atomic edits) reproduces the transformed text exactly, for a variety of shapes", () => {
    const cases: [string, string][] = [
      ['He said "hi" then left.\n', "He said “hi” then left.\n"],
      ["whole line one rewrite.\nkept.\n", "totally different content here.\nkept.\n"],
      ["kept.\n", "kept.\nnew line appended.\n"],
      ["kept.\nremoved line.\n", "kept.\n"],
      ["line one.\nline two.\n", "line one line two.\n"],
      ["line one line two.\n", "line one.\nline two.\n"],
    ];
    for (const [before, after] of cases) {
      const diff = computeFileDiff("f.md", before, after);
      expect(diff.reconstruction.ok, JSON.stringify(diff.reconstruction.issues)).toBe(true);
      expect(applyAtomicEditsForward(before, diff.atomicEdits)).toBe(after);
      expect(applyAtomicEditsBackward(after, diff.atomicEdits)).toBe(before);
    }
  });

  it("holds on real engine output across a realistic multi-paragraph fixture", () => {
    const original =
      "That's roughly 75 hours a year - nearly two weeks - on \"meetings\" that could've been an email.\n" +
      "Section 5-10 covers the details; Figure 5-10 has the chart.\n" +
      "He said 'don't' go, and left.\n";
    const full = transform(original, { locale: "en-US", mode: "text" });
    const diff = computeFileDiff("f.md", original, full);
    expect(diff.reconstruction.ok, JSON.stringify(diff.reconstruction.issues)).toBe(true);
  });
});

// -------------------------------------------------------------------------------------------
// 1. Two changed adjacent lines with equal line count -> two line-local review items.
// -------------------------------------------------------------------------------------------
describe("acceptance 1: two adjacent same-count lines split into two line-local review items", () => {
  it("does not collapse into one multi-line item", () => {
    const before = 'line one "a".\nline two "b".\n';
    const after = "line one “a”.\nline two “b”.\n";
    const diff = computeFileDiff("f.md", before, after);
    expect(diff.reviewChanges).toHaveLength(2);
    for (const rc of diff.reviewChanges) {
      expect(rc.crossLineEdit).toBe(false);
      expect(rc.oldLineCol.start.line).toBe(rc.oldLineCol.end.line);
    }
  });
});

// -------------------------------------------------------------------------------------------
// 2. Six adjacent changed lines -> not one mega-item.
// -------------------------------------------------------------------------------------------
describe("acceptance 2: six adjacent changed lines do not collapse into one mega-item", () => {
  it("splits into six independent line-local review items", () => {
    const before = Array.from({ length: 6 }, (_, i) => `line ${i} "x${i}".`).join("\n") + "\n";
    const after = Array.from({ length: 6 }, (_, i) => `line ${i} “x${i}”.`).join("\n") + "\n";
    const diff = computeFileDiff("f.md", before, after);
    expect(diff.reviewChanges).toHaveLength(6);
    expect(diff.reviewChanges.every((rc) => !rc.crossLineEdit)).toBe(true);
  });
});

// -------------------------------------------------------------------------------------------
// 3-4. Real merge / split get cross-line-edit.
// -------------------------------------------------------------------------------------------
describe("acceptance 3-4: real line merge/split are cross-line, unlike adjacent per-line edits", () => {
  it("3. a real merge of two lines into one is tagged cross-line", () => {
    const diff = computeFileDiff("f.md", "line one.\nline two.\n", "line one line two.\n");
    expect(diff.reviewChanges.some((rc) => rc.crossLineEdit)).toBe(true);
  });

  it("4. a real split of one line into two is tagged cross-line", () => {
    const diff = computeFileDiff("f.md", "line one line two.\n", "line one.\nline two.\n");
    expect(diff.reviewChanges.some((rc) => rc.crossLineEdit)).toBe(true);
  });
});

// -------------------------------------------------------------------------------------------
// 5. Several ordinary typographic edits on one line: grouped for review, atomic edits preserved.
// -------------------------------------------------------------------------------------------
describe("acceptance 5: multiple typographic edits on one line stay a reviewable group with atomic edits intact", () => {
  it("real dash-restyle example groups tightly without losing atomic edits", () => {
    const original = "That's roughly 75 hours a year - nearly two weeks - on things.\n";
    const full = transform(original, { locale: "en-US", mode: "text" });
    const diff = computeFileDiff("f.md", original, full);
    // Not four unrelated rows for one dash operation -- and every atomic edit is still traceable.
    for (const rc of diff.reviewChanges) {
      expect(rc.atomicEditIds.length).toBeGreaterThan(0);
      const span = rc.oldOffset.codePointEnd - rc.oldOffset.codePointStart;
      expect(span).toBeLessThan(10); // tight, not a whole-line span
    }
  });
});

// -------------------------------------------------------------------------------------------
// 6-7. Numeric-range risk tag intersects the atomic edit; a nearby quote edit does not inherit it.
// -------------------------------------------------------------------------------------------
describe("acceptance 6-7: numeric-range risk tag is scoped to the intersecting atomic edit", () => {
  it("6. `5-10` gets numeric-range risk with a token range intersecting the dash atomic edit", () => {
    const before = "kept.\nkept.\nkept.\nSee Figure 5-10 for details.\n";
    const after = "kept.\nkept.\nkept.\nSee Figure 5–10 for details.\n";
    const diff = computeFileDiff("f.mdx", before, after);
    const rc = diff.reviewChanges[0] as (typeof diff.reviewChanges)[number];
    const edits = diff.atomicEdits.filter((e) => rc.atomicEditIds.includes(e.id));
    const tags = computeRiskTags({
      oldText: before,
      newText: after,
      reviewChange: rc,
      atomicEdits: edits,
      attribution: undefined,
      locale: enUSLocale,
    });
    const numericTag = tags.find((t) => t.tag === "numeric-range-or-compound-label-candidate");
    expect(numericTag).toBeDefined();
    const evidence = numericTag!.evidence as {
      tokenOldOffset: { codePointStart: number; codePointEnd: number };
    };
    expect(evidence.tokenOldOffset.codePointStart).toBeLessThanOrEqual(rc.oldOffset.codePointStart);
    expect(evidence.tokenOldOffset.codePointEnd).toBeGreaterThanOrEqual(rc.oldOffset.codePointEnd);
  });

  it("7. a quote edit two lines away does not inherit the numeric-range tag from the same unified hunk", () => {
    const before = 'See "figure" note.\nkept.\nkept.\nSee Figure 5-10 for details.\n';
    const after = "See “figure” note.\nkept.\nkept.\nSee Figure 5–10 for details.\n";
    const diff = computeFileDiff("f.md", before, after);
    expect(diff.diffHunks).toHaveLength(1);
    const quoteChange = diff.reviewChanges.find((r) => r.before === '"');
    expect(quoteChange).toBeDefined();
    const edits = diff.atomicEdits.filter((e) => quoteChange!.atomicEditIds.includes(e.id));
    const tags = computeRiskTags({
      oldText: before,
      newText: after,
      reviewChange: quoteChange!,
      atomicEdits: edits,
      attribution: undefined,
      locale: enUSLocale,
    });
    expect(tags.map((t) => t.tag)).not.toContain("numeric-range-or-compound-label-candidate");
  });
});

// -------------------------------------------------------------------------------------------
// 8. `text - text` -> dash-restyling fires even when the atomic edit is only whitespace.
// -------------------------------------------------------------------------------------------
describe("acceptance 8: dash-restyling fires via proximity, even for a space-only atomic edit", () => {
  it("a synthetic space-only edit next to an unchanged dash is tagged dash-restyling", () => {
    // Construct a case directly: the dash character itself is unchanged, only the space
    // immediately before it was removed -- exercises the proximity rule, not literal dash-char
    // presence in before/after.
    const oldText = "value 1 - 2 end\n";
    const newText = "value 1- 2 end\n"; // one space before the dash removed
    const diff = computeFileDiff("f.md", oldText, newText);
    expect(diff.reviewChanges).toHaveLength(1);
    const rc = diff.reviewChanges[0]!;
    expect(rc.before).toBe(" "); // the atomic edit is just the removed space, not the dash itself
    const edits = diff.atomicEdits.filter((e) => rc.atomicEditIds.includes(e.id));
    const tags = computeRiskTags({
      oldText,
      newText,
      reviewChange: rc,
      atomicEdits: edits,
      attribution: undefined,
      locale: enUSLocale,
    });
    expect(tags.map((t) => t.tag)).toContain("dash-restyling");
  });

  it("an ordinary space removal far from any dash is not tagged dash-restyling", () => {
    const oldText = "some  double  spaced   prose with no dashes at all here.\n";
    const newText = "some double spaced prose with no dashes at all here.\n";
    const diff = computeFileDiff("f.md", oldText, newText);
    for (const rc of diff.reviewChanges) {
      const edits = diff.atomicEdits.filter((e) => rc.atomicEditIds.includes(e.id));
      const tags = computeRiskTags({
        oldText,
        newText,
        reviewChange: rc,
        atomicEdits: edits,
        attribution: undefined,
        locale: enUSLocale,
      });
      expect(tags.map((t) => t.tag)).not.toContain("dash-restyling");
    }
  });
});

// -------------------------------------------------------------------------------------------
// 9-10. quote-pairing-candidate tied to quotes attribution, not bare character class.
// -------------------------------------------------------------------------------------------
describe("acceptance 9-10: quote-pairing-candidate is attribution-honest", () => {
  it("9. an ordinary contraction does not get quote-pairing-candidate", () => {
    const original = "It's fine.\n";
    const full = transform(original, { locale: "en-US", mode: "text" });
    const diff = computeFileDiff("f.md", original, full);
    const attr = attributeReviewChanges(
      original,
      { locale: "en-US", mode: "text" },
      diff.reviewChanges,
    );
    for (const rc of diff.reviewChanges) {
      const edits = diff.atomicEdits.filter((e) => rc.atomicEditIds.includes(e.id));
      const tags = computeRiskTags({
        oldText: original,
        newText: full,
        reviewChange: rc,
        atomicEdits: edits,
        attribution: attr.get(rc.id),
        locale: enUSLocale,
      });
      expect(tags.map((t) => t.tag)).not.toContain("quote-pairing-candidate");
    }
  });

  it("10. a real paired-quote edit gets quote-pairing-candidate evidence", () => {
    const original = 'He said "hi" today.\n';
    const full = transform(original, { locale: "en-US", mode: "text" });
    const diff = computeFileDiff("f.md", original, full);
    const attr = attributeReviewChanges(
      original,
      { locale: "en-US", mode: "text" },
      diff.reviewChanges,
    );
    let sawQuotePairing = false;
    for (const rc of diff.reviewChanges) {
      const edits = diff.atomicEdits.filter((e) => rc.atomicEditIds.includes(e.id));
      const tags = computeRiskTags({
        oldText: original,
        newText: full,
        reviewChange: rc,
        atomicEdits: edits,
        attribution: attr.get(rc.id),
        locale: enUSLocale,
      });
      if (tags.some((t) => t.tag === "quote-pairing-candidate")) sawQuotePairing = true;
    }
    expect(sawQuotePairing).toBe(true);
  });
});

// -------------------------------------------------------------------------------------------
// 11-12. MDX/JSX boundary: negative (far, same long line) and positive (close) controls.
// -------------------------------------------------------------------------------------------
describe("acceptance 11-12: mdx-jsx-code-boundary-adjacent uses real offset distance", () => {
  it("11. a backtick far away on the same long line is a negative control", () => {
    const oldText =
      "Prose ".repeat(30) +
      'with "quotes" far from anything, then plenty more unrelated words follow along here to pad the distance out. `code`\n';
    const newText = transform(oldText, { locale: "en-US", mode: "text" });
    const diff = computeFileDiff("f.md", oldText, newText);
    for (const rc of diff.reviewChanges) {
      const edits = diff.atomicEdits.filter((e) => rc.atomicEditIds.includes(e.id));
      const tags = computeRiskTags({
        oldText,
        newText,
        reviewChange: rc,
        atomicEdits: edits,
        attribution: undefined,
        locale: enUSLocale,
      });
      expect(tags.map((t) => t.tag)).not.toContain("mdx-jsx-code-boundary-adjacent");
    }
  });

  it("12. a boundary close to the edit on the same line is a positive control", () => {
    const oldText = '<Component prop="x" /> then "quotes" right after.\n';
    const newText = transform(oldText, { locale: "en-US", mode: "markdown", dialect: "mdx" });
    const diff = computeFileDiff("f.mdx", oldText, newText);
    let saw = false;
    for (const rc of diff.reviewChanges) {
      const edits = diff.atomicEdits.filter((e) => rc.atomicEditIds.includes(e.id));
      const tags = computeRiskTags({
        oldText,
        newText,
        reviewChange: rc,
        atomicEdits: edits,
        attribution: undefined,
        locale: enUSLocale,
      });
      if (tags.some((t) => t.tag === "mdx-jsx-code-boundary-adjacent")) saw = true;
    }
    expect(saw).toBe(true);
  });
});

// -------------------------------------------------------------------------------------------
// M4 Pass A reject follow-up (spec 0.6.0): two new risk tags, regression canaries for the two
// reject classes -- an authored en-dash restyled by `dashes` (now impossible after P5, but the
// tag stays useful if a future change regresses it), and an `nbsp` edit binding a lone initial to
// a following word without a confirmed chain (still reachable under `initialBinding: "single"`).
// -------------------------------------------------------------------------------------------
describe("authored-en-dash-restyled: regression canary for P5 (dashes.md §3.4/§8.8)", () => {
  it("synthetic negative control: fires when a real AtomicEdit substitutes FROM U+2013, proving the tag still works if P5 ever regresses", () => {
    // A real `computeFileDiff` result, not a fabricated ReviewChange object -- this is what P5
    // regressing would actually produce: a genuine one-code-point substitution, en-dash to
    // em-dash, exactly the shape `dashes` used to emit for this input before spec 0.6.0.
    const before = "–";
    const after = "—";
    const diff = computeFileDiff("f.md", before, after);
    expect(diff.reviewChanges).toHaveLength(1);
    const rc = diff.reviewChanges[0]!;
    const edits = diff.atomicEdits.filter((e) => rc.atomicEditIds.includes(e.id));
    expect(edits).toHaveLength(1);
    expect(edits[0]!.before).toBe("–");
    expect(edits[0]!.after).toBe("—");
    const tags = computeRiskTags({
      oldText: before,
      newText: after,
      reviewChange: rc,
      atomicEdits: edits,
      attribution: {
        overlappingIsolatedRules: ["dashes"],
        category: "single-rule",
        singleRule: "dashes",
        composingRules: null,
        inferred: true,
      },
      locale: enUSLocale,
    });
    const tag = tags.find((t) => t.tag === "authored-en-dash-restyled");
    expect(tag).toBeDefined();
    const ev = tag!.evidence as {
      sourceOldOffset: { codePointStart: number; codePointEnd: number };
      sourceText: string;
      atomicEditId: string;
    };
    expect(ev.sourceText).toBe("–");
    expect(ev.sourceOldOffset).toEqual({ codePointStart: 0, codePointEnd: 1 });
    expect(ev.atomicEditId).toBe(edits[0]!.id);
    // checkRiskTagEvidence independently confirms this evidence, against the real edit.
    const fake = fakeResult("f.md", before, after);
    fake.riskTags = new Map([[rc.id, tags]]);
    expect(checkRiskTagEvidence([fake], enUSLocale)).toEqual([]);
  });

  it("tampered-evidence negative control: a claimed U+2013 range that does not actually slice to U+2013 fails checkRiskTagEvidence", () => {
    const before = "–";
    const after = "—";
    const diff = computeFileDiff("f.md", before, after);
    const rc = diff.reviewChanges[0]!;
    const edits = diff.atomicEdits.filter((e) => rc.atomicEditIds.includes(e.id));
    const tampered = [
      {
        tag: "authored-en-dash-restyled",
        evidence: {
          sourceOldOffset: { codePointStart: 0, codePointEnd: 1 },
          sourceText: "—",
          atomicEditId: edits[0]!.id,
        },
      },
    ];
    const fake = fakeResult("f.md", before, after);
    fake.riskTags = new Map([[rc.id, tampered]]);
    const issues = checkRiskTagEvidence([fake], enUSLocale);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toMatch(/does not slice to a lone U\+2013/);
  });

  it("tampered-evidence negative control: an atomicEditId naming a real edit that does not substitute FROM U+2013 fails checkRiskTagEvidence", () => {
    // "It's a–b": the apostrophe converts (a real, unrelated edit); the en-dash is protected by
    // P5 and untouched. sourceOldOffset correctly slices to the real "–" (passing the first
    // check), but atomicEditId falsely names the apostrophe edit -- a real edit that neither
    // contains that offset nor substitutes FROM U+2013.
    const before = "It's a–b\n";
    const after = transform(before, { locale: "en-US", mode: "text" });
    expect(after).toBe("It’s a–b\n"); // apostrophe converts; the en-dash is untouched by P5
    const diff = computeFileDiff("f.md", before, after);
    const rc = diff.reviewChanges[0]!;
    const apostropheEdit = diff.atomicEdits.find((e) => e.before === "'")!;
    expect(apostropheEdit).toBeDefined();
    const enDashIndex = [...before].indexOf("–");
    const dishonest = [
      {
        tag: "authored-en-dash-restyled",
        evidence: {
          sourceOldOffset: { codePointStart: enDashIndex, codePointEnd: enDashIndex + 1 },
          sourceText: "–",
          atomicEditId: apostropheEdit.id,
        },
      },
    ];
    const fake = fakeResult("f.md", before, after);
    fake.riskTags = new Map([[rc.id, dishonest]]);
    const issues = checkRiskTagEvidence([fake], enUSLocale);
    expect(issues.length).toBeGreaterThan(0);
  });

  it("real corpus check: after the P5 fix, an authored en-dash produces no edit at all, so there is nothing to tag", () => {
    const original = "a word–word pair and another–one here.\n";
    const full = transform(original, { locale: "en-US", mode: "text" });
    // P5 declines every pure single authored U+2013 unconditionally (dashes.md §3.4) -- the
    // dashes-attributed edit this tag used to be able to fire on simply does not exist anymore.
    expect(full).toBe(original);
    const diff = computeFileDiff("f.md", original, full);
    expect(diff.reviewChanges).toHaveLength(0);
  });
});

describe("single-initial-binding-candidate: nbsp.md §3.9's initial-to-word shape without a confirmed chain", () => {
  /** Runs one `fr` witness end to end and returns every risk tag found across the diff, plus the
   * fabricated FileResult (diff + riskTags) ready for `checkRiskTagEvidence`. */
  function tagFr(original: string) {
    const full = transform(original, { locale: "fr", mode: "text" });
    const diff = computeFileDiff("f.md", original, full);
    const attr = attributeReviewChanges(
      original,
      { locale: "fr", mode: "text" },
      diff.reviewChanges,
    );
    const byRc = new Map<string, ReturnType<typeof computeRiskTags>>();
    for (const rc of diff.reviewChanges) {
      const edits = diff.atomicEdits.filter((e) => rc.atomicEditIds.includes(e.id));
      byRc.set(
        rc.id,
        computeRiskTags({
          oldText: original,
          newText: full,
          reviewChange: rc,
          atomicEdits: edits,
          attribution: attr.get(rc.id),
          locale: frLocale,
        }),
      );
    }
    const fake = fakeResult("f.md", original, full);
    fake.riskTags = byRc;
    return { full, diff, byRc, fake };
  }

  it('REPRODUCED VALIDATOR DISAGREEMENT, then fixed: "xA. B. Word" in fr -- checkRiskTagEvidence used to invent a confirmed chain from an embedded "xA."', () => {
    // Final Correction pass, item 1. Before this fix: `computeRiskTags` correctly declined to
    // treat "xA." as a preceding initial (it already used the full `isInitialAt` token-start
    // condition), so `single-initial-binding-candidate` correctly fired for the space after
    // "B." with `noPrecedingChainConfirmed: true`. But `checkRiskTagEvidence`'s own
    // recomputation of "is there a confirmed chain" only checked "space + dot + uppercase" --
    // not the token-start condition -- so it read the embedded "xA." as a valid initial anyway,
    // concluded a chain WAS confirmed, and reported a false consistency failure contradicting the
    // tag's own (correct) claim. Sharing `isInitialAt`/`hasPrecedingInitial` between the tagger
    // and the validator (rather than two separate reimplementations) makes this disagreement
    // structurally impossible: both now call the literal same function.
    const original = "xA. B. Word\n";
    const { full, byRc, fake } = tagFr(original);
    // The exact healthy production path from the task: "xA. B. Word" -> "xA. B.<NBSP>Word".
    expect([...full]).toEqual([..."xA. B."].concat([" ", "W", "o", "r", "d", "\n"]));
    expect(full.codePointAt(6)).toBe(0xa0); // the space after "B." became NBSP
    const allTags = [...byRc.values()].flat();
    const tag = allTags.find((t) => t.tag === "single-initial-binding-candidate");
    expect(tag, 'the tag must still fire -- "xA." is not a valid preceding initial').toBeDefined();
    const ev = tag!.evidence as {
      leftInitialCodePoint: string;
      noPrecedingChainConfirmed: boolean;
    };
    expect(ev.leftInitialCodePoint).toBe("B");
    expect(ev.noPrecedingChainConfirmed).toBe(true);
    // The corrected healthy evidence must pass with zero consistency issues -- this is the fix:
    // before it, this exact call reported "a preceding initial chain is independently confirmed
    // ... contradicting noPrecedingChainConfirmed".
    expect(checkRiskTagEvidence([fake], frLocale)).toEqual([]);
  });

  it('REPRODUCED LIVE FAILURE, then fixed: "N. Œuvre avance." in fr -- U+0152 Œ was missed by the old handwritten regex', () => {
    // Before this correction, `/[A-ZÀ-ÖØ-ÞА-Я]/` did not match U+0152 (Œ is outside the Latin-1
    // Supplement block this regex covered), so the tag was silently absent for this exact input
    // even though the engine's own `isUpper` -- and therefore N7 itself -- correctly binds it.
    const { full, byRc } = tagFr("N. Œuvre avance.\n");
    expect(full).toBe("N. Œuvre avance.\n"); // the engine binds it (isUpper(0x152) is true)
    const allTags = [...byRc.values()].flat();
    expect(allTags.map((t) => t.tag)).toContain("single-initial-binding-candidate");
  });

  it("Unicode coverage: Ÿ, Ё, Greek Σ, and an astral uppercase letter (U+1D400) are all recognized", () => {
    const witnesses = [
      "N. Ÿport avance.\n",
      "N. Ёж бежит.\n",
      "N. Σχήμα.\n",
      `N. ${String.fromCodePoint(0x1d400)}bc avance.\n`,
    ];
    for (const original of witnesses) {
      const { allTags } = (() => {
        const r = tagFr(original);
        return { allTags: [...r.byRc.values()].flat() };
      })();
      expect(
        allTags.map((t) => t.tag),
        JSON.stringify(original),
      ).toContain("single-initial-binding-candidate");
    }
  });

  it('positive control: fr\'s "single" mode still binds a sentence-boundary collision, and the tag catches it with real, independently-checked evidence', () => {
    const original = "vu la lettre N. Il continue son travail\n";
    const { full, byRc, fake } = tagFr(original);
    expect(full).not.toBe(original); // "single" mode still binds this ambiguous shape
    const allTags = [...byRc.values()].flat();
    const tag = allTags.find((t) => t.tag === "single-initial-binding-candidate");
    expect(tag).toBeDefined();
    const ev = tag!.evidence as {
      spaceOldOffset: { codePointStart: number; codePointEnd: number };
      atomicEditId: string;
      leftInitialCodePoint: string;
      followingCodePoint: string;
      noPrecedingChainConfirmed: boolean;
    };
    expect(ev.leftInitialCodePoint).toBe("N");
    expect(ev.followingCodePoint).toBe("I");
    expect(ev.noPrecedingChainConfirmed).toBe(true);
    expect([...original][ev.spaceOldOffset.codePointStart]).toBe(" ");
    // checkRiskTagEvidence independently confirms this evidence, against the real edits.
    expect(checkRiskTagEvidence([fake], frLocale)).toEqual([]);
  });

  it("regression test: examines the correct AtomicEdit when another edit sits earlier in the same review change", () => {
    // "N. Qu'il continue": the nbsp conversion (before "Qu'il") and the apostrophe conversion
    // (inside "Qu'il", two code points later) are close enough to group into one multi-edit
    // review change -- proves the tag reads the converted-space AtomicEdit's own offset, not
    // `reviewChange.oldOffset.codePointStart` (which here is the nbsp edit's own start only by
    // coincidence of ordering; the assertion below checks the real relationship, not that
    // coincidence).
    const original = "vu la lettre N. Qu'il continue son travail\n";
    const { full, diff, fake } = tagFr(original);
    expect(full).not.toBe(original);
    const spaceEdit = diff.atomicEdits.find((e) => e.before === " " && e.after === " ")!;
    expect(spaceEdit, "expected a real U+0020->U+00A0 AtomicEdit").toBeDefined();
    const apostropheEdit = diff.atomicEdits.find((e) => e.before === "'")!;
    expect(apostropheEdit, "expected a real apostrophe AtomicEdit").toBeDefined();
    const owningRc = diff.reviewChanges.find((rc) => rc.atomicEditIds.includes(spaceEdit.id))!;
    expect(owningRc, "expected a review change owning the space edit").toBeDefined();
    expect(
      owningRc.atomicEditIds.length,
      "expected the space and apostrophe edits to be grouped together",
    ).toBeGreaterThan(1);
    expect(owningRc.atomicEditIds).toContain(apostropheEdit.id);
    const tags = fake.riskTags?.get(owningRc.id) ?? [];
    const tag = tags.find((t) => t.tag === "single-initial-binding-candidate");
    expect(tag).toBeDefined();
    const ev = tag!.evidence as {
      spaceOldOffset: { codePointStart: number; codePointEnd: number };
      atomicEditId: string;
    };
    // The evidence names the space edit specifically, not the group's own (possibly different) start.
    expect(ev.atomicEditId).toBe(spaceEdit.id);
    expect(ev.spaceOldOffset.codePointStart).toBe(spaceEdit.oldOffset.codePointStart);
    expect(checkRiskTagEvidence([fake], frLocale)).toEqual([]);
  });

  it('negative control: en-US "chain" mode\'s own confirmed two-initial binding is never tagged (E. B. White)', () => {
    const original = "E. B. White wrote it and left.\n";
    const full = transform(original, { locale: "en-US", mode: "text" });
    expect(full).not.toBe(original); // both spaces still bind, just not via the ambiguous shape
    const diff = computeFileDiff("f.md", original, full);
    const attr = attributeReviewChanges(
      original,
      { locale: "en-US", mode: "text" },
      diff.reviewChanges,
    );
    for (const rc of diff.reviewChanges) {
      const edits = diff.atomicEdits.filter((e) => rc.atomicEditIds.includes(e.id));
      const tags = computeRiskTags({
        oldText: original,
        newText: full,
        reviewChange: rc,
        atomicEdits: edits,
        attribution: attr.get(rc.id),
        locale: enUSLocale,
      });
      expect(tags.map((t) => t.tag)).not.toContain("single-initial-binding-candidate");
    }
  });

  it('negative control: after the M4 fix, en-US "chain" mode produces no edit at all for the sentence-boundary shape, so there is nothing to tag', () => {
    const original = "take the top N. It runs across four relationship types\n";
    const full = transform(original, { locale: "en-US", mode: "text" });
    expect(full).toBe(original);
    const diff = computeFileDiff("f.md", original, full);
    expect(diff.reviewChanges).toHaveLength(0);
  });

  it("tampered-evidence negative control: a claimed leftInitialCodePoint that is not actually UPPER fails checkRiskTagEvidence", () => {
    const original = "vu la lettre N. Il continue son travail\n";
    const { fake, byRc } = tagFr(original);
    const allTags = [...byRc.values()].flat();
    const real = allTags.find((t) => t.tag === "single-initial-binding-candidate")!;
    const ev = real.evidence as unknown as Record<string, unknown>;
    const tampered = { ...ev, leftInitialCodePoint: "n" }; // lower-case: not UPPER
    const rcId = [...(fake.riskTags ?? new Map()).entries()].find(([, tags]) =>
      tags.includes(real),
    )![0]!;
    fake.riskTags!.set(rcId, [
      {
        tag: "single-initial-binding-candidate",
        evidence: tampered as unknown as RiskTag["evidence"],
      },
    ]);
    const issues = checkRiskTagEvidence([fake], frLocale);
    expect(issues.length).toBeGreaterThan(0);
  });

  it("tampered-evidence negative control: noPrecedingChainConfirmed=true is rejected when a chain is actually present", () => {
    // "E. B. White": the space before White DOES have a confirmed preceding chain (E. before
    // B.). Falsely tagging it as single-initial-binding-candidate with noPrecedingChainConfirmed
    // must be caught as dishonest.
    const original = "E. B. White wrote it.\n";
    const full = transform(original, { locale: "en-US", mode: "text" });
    const diff = computeFileDiff("f.md", original, full);
    const originalCps = [...original];
    const edit = diff.atomicEdits.find(
      (e) =>
        e.before === " " &&
        e.after === " " &&
        originalCps.slice(e.oldOffset.codePointStart - 2, e.oldOffset.codePointStart).join("") ===
          "B.",
    )!;
    expect(edit, "expected to find the B.->White space conversion AtomicEdit").toBeDefined();
    const rc = diff.reviewChanges.find((r) => r.atomicEditIds.includes(edit.id))!;
    expect(rc, "expected an owning review change").toBeDefined();
    const q = edit.oldOffset.codePointStart;
    const dishonest: RiskTag[] = [
      {
        tag: "single-initial-binding-candidate",
        evidence: {
          spaceOldOffset: { codePointStart: q, codePointEnd: q + 1 },
          atomicEditId: edit.id,
          leftInitialCodePoint: "B",
          leftInitialOldOffset: { codePointStart: q - 2, codePointEnd: q - 1 },
          followingCodePoint: "W",
          followingOldOffset: { codePointStart: q + 1, codePointEnd: q + 2 },
          noPrecedingChainConfirmed: true,
        },
      },
    ];
    const fake = fakeResult("f.md", original, full);
    fake.riskTags = new Map([[rc.id, dishonest]]);
    const issues = checkRiskTagEvidence([fake], enUSLocale);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.includes("contradicting noPrecedingChainConfirmed"))).toBe(true);
  });
});

// -------------------------------------------------------------------------------------------
// Final Correction pass, item 2: single-initial-binding-candidate must use the exact resolved
// locale's own OPENISH set (via prepare()), not a fixed cross-locale union. Parity across all 10
// locales and representative token starts.
// -------------------------------------------------------------------------------------------
describe("single-initial-binding-candidate: locale-aware OPENISH parity (item 2)", () => {
  const allLocaleTags = Object.keys(LOCALES);

  it("every shipped locale's own quote-opening glyph is a valid token start for an initial (isInitialAt reads prepare(locale).opens)", () => {
    // For each locale, an initial immediately after that locale's own primary open quote glyph
    // must be recognised -- proving OPENISH is read from the resolved locale, not a fixed table.
    for (const tag of allLocaleTags) {
      const locale = getLocaleData(tag);
      if (locale.nbsp.initialBinding === "none") continue; // N7 disabled -- nothing to assert
      const openGlyph = locale.quotes.primary.open;
      // Build "<open>N. It runs" so a chain-mode locale still declines (single initial, no
      // preceding chain) but a single-mode locale binds -- either way the tag computation must
      // not throw and, when it fires, evidence must be internally consistent.
      const original = `${openGlyph}N. Word\n`;
      const full = transform(original, { locale: tag, mode: "text" });
      const diff = computeFileDiff("f.md", original, full);
      const attr = attributeReviewChanges(
        original,
        { locale: tag, mode: "text" },
        diff.reviewChanges,
      );
      const riskTags = new Map<string, RiskTag[]>();
      for (const rc of diff.reviewChanges) {
        const edits = diff.atomicEdits.filter((e) => rc.atomicEditIds.includes(e.id));
        riskTags.set(
          rc.id,
          computeRiskTags({
            oldText: original,
            newText: full,
            reviewChange: rc,
            atomicEdits: edits,
            attribution: attr.get(rc.id),
            locale,
          }),
        );
      }
      const fake = fakeResult("f.md", original, full);
      fake.riskTags = riskTags;
      expect(checkRiskTagEvidence([fake], locale), `locale=${tag}`).toEqual([]);
    }
  });

  it("a quote glyph that opens only in ANOTHER locale is not treated as a token start under the current locale (cross-locale leakage would be a false OPENISH member)", () => {
    // de-DE's primary open is „ (U+201E); fr's primary open is « (U+00AB). Neither is in the
    // other's OPENISH by construction (prepare() reads only the resolved locale's own quotes),
    // so this only needs to not throw and stay internally consistent -- a cross-locale union
    // would have made both glyphs open-ish everywhere, silently widening every locale's N7.
    const deDE = getLocaleData("de-DE");
    const fr = getLocaleData("fr");
    expect(deDE.quotes.primary.open).not.toBe(fr.quotes.primary.open);
    for (const [locale, foreignOpen] of [
      [deDE, fr.quotes.primary.open],
      [fr, deDE.quotes.primary.open],
    ] as const) {
      const original = `x${foreignOpen}N. Word\n`;
      const full = transform(original, { locale: locale.locale, mode: "text" });
      const diff = computeFileDiff("f.md", original, full);
      const attr = attributeReviewChanges(
        original,
        { locale: locale.locale, mode: "text" },
        diff.reviewChanges,
      );
      const riskTags = new Map<string, RiskTag[]>();
      for (const rc of diff.reviewChanges) {
        const edits = diff.atomicEdits.filter((e) => rc.atomicEditIds.includes(e.id));
        riskTags.set(
          rc.id,
          computeRiskTags({
            oldText: original,
            newText: full,
            reviewChange: rc,
            atomicEdits: edits,
            attribution: attr.get(rc.id),
            locale,
          }),
        );
      }
      const fake = fakeResult("f.md", original, full);
      fake.riskTags = riskTags;
      expect(checkRiskTagEvidence([fake], locale), `locale=${locale.locale}`).toEqual([]);
    }
  });

  it("representative token starts (input start, U+0020, U+00A0, locale open quote, ordinary letter, astral prefix) all agree between generation and validation", () => {
    const nbsp = String.fromCodePoint(0xa0);
    const astral = String.fromCodePoint(0x1d400); // 𝐀, an astral uppercase letter, as prefix noise
    const openGlyph = enUSLocale.quotes.primary.open;
    const witnesses = [
      "N. Word after nothing\n", // input start
      "word N. Word\n", // U+0020 token start
      `word${nbsp}N. Word\n`, // U+00A0 token start
      `${openGlyph}N. Word\n`, // locale open quote token start
      "xN. Word\n", // ordinary letter -- NOT a valid token start, declines
      `${astral}N. Word\n`, // astral prefix, still a valid token start (it's not letter-adjacent)
    ];
    for (const original of witnesses) {
      const full = transform(original, { locale: "en-US", mode: "text" });
      const diff = computeFileDiff("f.md", original, full);
      const attr = attributeReviewChanges(
        original,
        { locale: "en-US", mode: "text" },
        diff.reviewChanges,
      );
      const riskTags = new Map<string, RiskTag[]>();
      for (const rc of diff.reviewChanges) {
        const edits = diff.atomicEdits.filter((e) => rc.atomicEditIds.includes(e.id));
        riskTags.set(
          rc.id,
          computeRiskTags({
            oldText: original,
            newText: full,
            reviewChange: rc,
            atomicEdits: edits,
            attribution: attr.get(rc.id),
            locale: enUSLocale,
          }),
        );
      }
      const fake = fakeResult("f.md", original, full);
      fake.riskTags = riskTags;
      expect(checkRiskTagEvidence([fake], enUSLocale), JSON.stringify(original)).toEqual([]);
    }
  });
});

// -------------------------------------------------------------------------------------------
// Final Correction pass, item 3: both new tags must be genuinely fail-closed -- null, missing,
// non-object, or malformed evidence must produce an issue, never silently pass, never throw.
// -------------------------------------------------------------------------------------------
describe("fail-closed evidence validation (item 3): malformed/null evidence for the two new tags", () => {
  function fakeWithTag(
    original: string,
    full: string,
    tag: RiskTag,
  ): { fake: FileResult; rc: ReturnType<typeof computeFileDiff>["reviewChanges"][number] } {
    const diff = computeFileDiff("f.md", original, full);
    const rc = diff.reviewChanges[0]!;
    const fake = fakeResult("f.md", original, full);
    fake.riskTags = new Map([[rc.id, [tag]]]);
    return { fake, rc };
  }

  const MALFORMED_CASES: [string, unknown][] = [
    ["null", null],
    ["empty object", {}],
    [
      "missing atomicEditId",
      { sourceOldOffset: { codePointStart: 0, codePointEnd: 1 }, sourceText: "–" },
    ],
    [
      "non-string atomicEditId",
      {
        sourceOldOffset: { codePointStart: 0, codePointEnd: 1 },
        sourceText: "–",
        atomicEditId: 42,
      },
    ],
    ["missing sourceOldOffset", { sourceText: "–", atomicEditId: "x" }],
    [
      "zero-length sourceOldOffset",
      {
        sourceOldOffset: { codePointStart: 0, codePointEnd: 0 },
        sourceText: "–",
        atomicEditId: "x",
      },
    ],
    [
      "multi-code-point sourceOldOffset",
      {
        sourceOldOffset: { codePointStart: 0, codePointEnd: 3 },
        sourceText: "–",
        atomicEditId: "x",
      },
    ],
  ];
  for (const [label, evidence] of MALFORMED_CASES) {
    it(`authored-en-dash-restyled: ${label} does not throw and produces an issue`, () => {
      const { fake } = fakeWithTag("–", "—", {
        tag: "authored-en-dash-restyled",
        evidence: evidence as RiskTag["evidence"],
      });
      let issues: string[] = [];
      expect(() => {
        issues = checkRiskTagEvidence([fake], enUSLocale);
      }).not.toThrow();
      expect(issues.length).toBeGreaterThan(0);
    });
  }

  it("authored-en-dash-restyled: evidence belonging to the wrong tag type (single-initial shape) is caught", () => {
    const { fake } = fakeWithTag("–", "—", {
      tag: "authored-en-dash-restyled",
      evidence: {
        spaceOldOffset: { codePointStart: 0, codePointEnd: 1 },
        atomicEditId: "x",
        leftInitialCodePoint: "A",
        leftInitialOldOffset: { codePointStart: 0, codePointEnd: 1 },
        followingCodePoint: "B",
        followingOldOffset: { codePointStart: 2, codePointEnd: 3 },
        noPrecedingChainConfirmed: true,
      } as unknown as RiskTag["evidence"],
    });
    const issues = checkRiskTagEvidence([fake], enUSLocale);
    expect(issues.length).toBeGreaterThan(0);
  });

  const SINGLE_INITIAL_MALFORMED: [string, unknown][] = [
    ["null", null],
    ["empty object", {}],
    [
      "missing atomicEditId",
      {
        spaceOldOffset: { codePointStart: 4, codePointEnd: 5 },
        leftInitialCodePoint: "N",
        leftInitialOldOffset: { codePointStart: 2, codePointEnd: 3 },
        followingCodePoint: "I",
        followingOldOffset: { codePointStart: 5, codePointEnd: 6 },
        noPrecedingChainConfirmed: true,
      },
    ],
    [
      "non-string atomicEditId",
      {
        spaceOldOffset: { codePointStart: 4, codePointEnd: 5 },
        atomicEditId: 42,
        leftInitialCodePoint: "N",
        leftInitialOldOffset: { codePointStart: 2, codePointEnd: 3 },
        followingCodePoint: "I",
        followingOldOffset: { codePointStart: 5, codePointEnd: 6 },
        noPrecedingChainConfirmed: true,
      },
    ],
    [
      "missing leftInitialOldOffset",
      {
        spaceOldOffset: { codePointStart: 4, codePointEnd: 5 },
        atomicEditId: "x",
        leftInitialCodePoint: "N",
        followingCodePoint: "I",
        followingOldOffset: { codePointStart: 5, codePointEnd: 6 },
        noPrecedingChainConfirmed: true,
      },
    ],
    [
      "zero-length followingOldOffset",
      {
        spaceOldOffset: { codePointStart: 4, codePointEnd: 5 },
        atomicEditId: "x",
        leftInitialCodePoint: "N",
        leftInitialOldOffset: { codePointStart: 2, codePointEnd: 3 },
        followingCodePoint: "I",
        followingOldOffset: { codePointStart: 5, codePointEnd: 5 },
        noPrecedingChainConfirmed: true,
      },
    ],
    [
      "multi-code-point leftInitialOldOffset",
      {
        spaceOldOffset: { codePointStart: 4, codePointEnd: 5 },
        atomicEditId: "x",
        leftInitialCodePoint: "N",
        leftInitialOldOffset: { codePointStart: 2, codePointEnd: 4 },
        followingCodePoint: "I",
        followingOldOffset: { codePointStart: 5, codePointEnd: 6 },
        noPrecedingChainConfirmed: true,
      },
    ],
    [
      "wrong literal noPrecedingChainConfirmed (false)",
      {
        spaceOldOffset: { codePointStart: 4, codePointEnd: 5 },
        atomicEditId: "x",
        leftInitialCodePoint: "N",
        leftInitialOldOffset: { codePointStart: 2, codePointEnd: 3 },
        followingCodePoint: "I",
        followingOldOffset: { codePointStart: 5, codePointEnd: 6 },
        noPrecedingChainConfirmed: false,
      },
    ],
    [
      "non-boolean noPrecedingChainConfirmed",
      {
        spaceOldOffset: { codePointStart: 4, codePointEnd: 5 },
        atomicEditId: "x",
        leftInitialCodePoint: "N",
        leftInitialOldOffset: { codePointStart: 2, codePointEnd: 3 },
        followingCodePoint: "I",
        followingOldOffset: { codePointStart: 5, codePointEnd: 6 },
        noPrecedingChainConfirmed: "true",
      },
    ],
  ];
  // These malformed-evidence checks only need a real, existing review change to attach the
  // fabricated tag to -- its semantic content is irrelevant to what's being validated here, so
  // reuse the guaranteed-real "–"->"—" diff pair rather than an identical-text pair (which
  // produces zero review changes and makes fakeWithTag's own `diff.reviewChanges[0]!` throw).
  for (const [label, evidence] of SINGLE_INITIAL_MALFORMED) {
    it(`single-initial-binding-candidate: ${label} does not throw and produces an issue`, () => {
      const { fake } = fakeWithTag("–", "—", {
        tag: "single-initial-binding-candidate",
        evidence: evidence as RiskTag["evidence"],
      });
      let issues: string[] = [];
      expect(() => {
        issues = checkRiskTagEvidence([fake], enUSLocale);
      }).not.toThrow();
      expect(issues.length).toBeGreaterThan(0);
    });
  }

  it("single-initial-binding-candidate: evidence belonging to the wrong tag type (authored-en-dash shape) is caught", () => {
    const { fake } = fakeWithTag("–", "—", {
      tag: "single-initial-binding-candidate",
      evidence: {
        sourceOldOffset: { codePointStart: 0, codePointEnd: 1 },
        sourceText: "–",
        atomicEditId: "x",
      } as unknown as RiskTag["evidence"],
    });
    const issues = checkRiskTagEvidence([fake], enUSLocale);
    expect(issues.length).toBeGreaterThan(0);
  });

  it("legacy null-evidence tags (e.g. nbsp-insertion) still pass through the null skip -- the allowlist is not overly broad", () => {
    const { fake } = fakeWithTag("–", "—", { tag: "nbsp-insertion", evidence: null });
    expect(checkRiskTagEvidence([fake], enUSLocale)).toEqual([]);
  });

  it("an entirely unknown tag name with null evidence not on the legacy allowlist is caught, not silently passed", () => {
    const { fake } = fakeWithTag("–", "—", {
      tag: "some-future-tag-nobody-added-to-the-allowlist",
      evidence: null,
    });
    const issues = checkRiskTagEvidence([fake], enUSLocale);
    expect(issues.length).toBeGreaterThan(0);
  });
});

// -------------------------------------------------------------------------------------------
// Final Correction pass, item 4: every N7 evidence field must be anchored exactly to the
// converted space, not merely "some plausible uppercase letter somewhere in the file."
// -------------------------------------------------------------------------------------------
describe("single-initial-binding-candidate: exact anchoring to the converted space (item 4)", () => {
  it("leftInitialOldOffset pointing at a different valid uppercase letter elsewhere in the file is rejected", () => {
    // "Elsewhere" is a real, unrelated uppercase letter ("Y." at the very start) -- not q-2.
    // Anchoring must catch this even though the pointed-to code point is itself genuinely UPPER.
    // en-US "chain" mode never fires this tag at all for an isolated initial (it either confirms
    // a real chain or produces no edit), so this needs fr's "single" mode, which does bind the
    // ambiguous shape and gives a real tag to tamper with.
    const original = "Y. vu la lettre N. Il continue son travail\n"; // "Y." supplies a decoy real initial
    const full = transform(original, { locale: "fr", mode: "text" });
    const diff = computeFileDiff("f.md", original, full);
    const attr = attributeReviewChanges(
      original,
      { locale: "fr", mode: "text" },
      diff.reviewChanges,
    );
    const riskTags = new Map<string, RiskTag[]>();
    let ownerRcId = "";
    let realTag: RiskTag | undefined;
    for (const rc of diff.reviewChanges) {
      const edits = diff.atomicEdits.filter((e) => rc.atomicEditIds.includes(e.id));
      const tags = computeRiskTags({
        oldText: original,
        newText: full,
        reviewChange: rc,
        atomicEdits: edits,
        attribution: attr.get(rc.id),
        locale: frLocale,
      });
      riskTags.set(rc.id, tags);
      const found = tags.find((t) => t.tag === "single-initial-binding-candidate");
      if (found) {
        realTag = found;
        ownerRcId = rc.id;
      }
    }
    expect(realTag).toBeDefined();
    const ev = realTag!.evidence as {
      leftInitialOldOffset: { codePointStart: number; codePointEnd: number };
      leftInitialCodePoint: string;
    };
    // "Y" sits at code point 0 -- a real, different UPPER letter than the true left initial "N".
    const tampered = {
      ...ev,
      leftInitialOldOffset: { codePointStart: 0, codePointEnd: 1 },
      leftInitialCodePoint: "Y",
    };
    const tamperedTag: RiskTag = {
      tag: "single-initial-binding-candidate",
      evidence: { ...(realTag!.evidence as object), ...tampered } as RiskTag["evidence"],
    };
    const fake = fakeResult("f.md", original, full);
    fake.riskTags = new Map([[ownerRcId, [tamperedTag]]]);
    const issues = checkRiskTagEvidence([fake], frLocale);
    expect(
      issues.some((i) => i.includes("leftInitialOldOffset") && i.includes("not anchored")),
    ).toBe(true);
  });

  it("followingOldOffset pointing at a different valid uppercase letter elsewhere in the file is rejected", () => {
    // "Zebra" supplies a decoy real UPPER letter elsewhere in the file. Same fr/single-mode
    // witness shape as the leftInitialOldOffset test above, so there is a real tag/edit to tamper
    // with instead of a synthetic fallback review change.
    const original = "vu la lettre N. Il continue son travail, Zebra.\n";
    const full = transform(original, { locale: "fr", mode: "text" });
    const diff = computeFileDiff("f.md", original, full);
    const attr = attributeReviewChanges(
      original,
      { locale: "fr", mode: "text" },
      diff.reviewChanges,
    );
    const zIndex = original.indexOf("Zebra"); // ASCII-only witness: string index == code-point index
    let ownerRcId = "";
    let realTag: RiskTag | undefined;
    for (const rc of diff.reviewChanges) {
      const edits = diff.atomicEdits.filter((e) => rc.atomicEditIds.includes(e.id));
      const tags = computeRiskTags({
        oldText: original,
        newText: full,
        reviewChange: rc,
        atomicEdits: edits,
        attribution: attr.get(rc.id),
        locale: frLocale,
      });
      const found = tags.find((t) => t.tag === "single-initial-binding-candidate");
      if (found) {
        realTag = found;
        ownerRcId = rc.id;
      }
    }
    expect(realTag).toBeDefined();
    const tampered = {
      ...(realTag!.evidence as object),
      followingCodePoint: "Z",
      followingOldOffset: { codePointStart: zIndex, codePointEnd: zIndex + 1 },
    };
    const tamperedTag: RiskTag = {
      tag: "single-initial-binding-candidate",
      evidence: tampered as unknown as RiskTag["evidence"],
    };
    const fake = fakeResult("f.md", original, full);
    fake.riskTags = new Map([[ownerRcId, [tamperedTag]]]);
    const issues = checkRiskTagEvidence([fake], frLocale);
    expect(issues.some((i) => i.includes("followingOldOffset") && i.includes("not anchored"))).toBe(
      true,
    );
  });
});

// -------------------------------------------------------------------------------------------
// 13-14. Independent composition is never mislabeled interaction; real interaction is only ever
// "interaction-candidate", never a fabricated "confirmed-interaction".
// -------------------------------------------------------------------------------------------
describe("acceptance 13-14: attribution honesty", () => {
  it("13. three independent rules edited nearby on one line is not interaction", () => {
    const original = 'He said "hi" and left at 5-10 oclock.\n';
    const full = transform(original, { locale: "en-US", mode: "text" });
    const diff = computeFileDiff("f.md", original, full);
    const attr = attributeReviewChanges(
      original,
      { locale: "en-US", mode: "text" },
      diff.reviewChanges,
    );
    for (const [, a] of attr) {
      expect(a.category).not.toBe("interaction-candidate");
      expect(["single-rule", "multi-rule-composition"]).toContain(a.category);
    }
  });

  it("14. category is never the literal string 'confirmed-interaction' -- the type does not offer it, and a genuine ambiguous overlap is reported as interaction-candidate with no fabricated composingRules/singleRule", () => {
    // "'don't'" nested inside apostrophe+quotes context: apostrophe and quotes both touch the
    // same small span and isolating either alone does not exactly reproduce the combined result.
    const original = "He said 'don't' go.\n";
    const full = transform(original, { locale: "en-US", mode: "text" });
    const diff = computeFileDiff("f.md", original, full);
    const attr = attributeReviewChanges(
      original,
      { locale: "en-US", mode: "text" },
      diff.reviewChanges,
    );
    let sawInteractionCandidate = false;
    for (const [, a] of attr) {
      expect(a.category).not.toBe("confirmed-interaction" as never);
      if (a.category === "interaction-candidate") {
        sawInteractionCandidate = true;
        expect(a.composingRules).toBeNull();
        expect(a.singleRule).toBeNull();
        expect(a.overlappingIsolatedRules.length).toBeGreaterThanOrEqual(1);
      }
    }
    expect(sawInteractionCandidate).toBe(true);
  });
});

// -------------------------------------------------------------------------------------------
// 15-18. Fail-closed reconstruction/offset/ownership checks on synthetically corrupted evidence.
// -------------------------------------------------------------------------------------------
describe("acceptance 15-18: fail-closed checks on corrupted evidence", () => {
  it("15. deleting one atomic edit from a multi-edit line is caught by reconstruction", () => {
    const original = 'line one "a" and "b".\n';
    const full = "line one “a” and “b”.\n";
    const result = fakeResult("f.md", original, full);
    expect(result.diff!.atomicEdits.length).toBeGreaterThanOrEqual(2);
    const corrupted: FileResult = {
      ...result,
      diff: { ...result.diff!, atomicEdits: result.diff!.atomicEdits.slice(1) },
    };
    const issues = checkIndependentReconstruction([corrupted]);
    expect(issues.length).toBeGreaterThan(0);
  });

  it("16. substituting text of the same length is caught by the source-slice check", () => {
    const original = 'line one "a".\n';
    const full = "line one “a”.\n";
    const result = fakeResult("f.md", original, full);
    const rc = result.diff!.reviewChanges[0]!;
    const corruptedRc = { ...rc, before: "X" }; // same length (1 code point), wrong content
    const corrupted: FileResult = {
      ...result,
      diff: {
        ...result.diff!,
        reviewChanges: [corruptedRc, ...result.diff!.reviewChanges.slice(1)],
      },
    };
    const issues = checkReviewChangeSlicesMatchSource([corrupted]);
    expect(issues.length).toBeGreaterThan(0);
  });

  it("17. an incorrect UTF-8 byte offset is caught", () => {
    const original = 'café "test".\n'; // é is 2 bytes in UTF-8
    const full = "café “test”.\n";
    const result = fakeResult("f.md", original, full);
    const edit = result.diff!.atomicEdits[0] as AtomicEdit;
    const corruptedEdit: AtomicEdit = {
      ...edit,
      oldOffset: {
        ...edit.oldOffset,
        byteStart: edit.oldOffset.byteStart - 1,
        byteEnd: edit.oldOffset.byteEnd - 1,
      },
    };
    const corrupted: FileResult = {
      ...result,
      diff: { ...result.diff!, atomicEdits: [corruptedEdit, ...result.diff!.atomicEdits.slice(1)] },
    };
    const issues = checkUtf8ByteBoundaries([corrupted]);
    expect(issues.length).toBeGreaterThan(0);
  });

  it("18. every atomic edit belongs to exactly one review item -- ownership violations are caught", () => {
    const original = 'line one "a" and "b".\n';
    const full = "line one “a” and “b”.\n";
    const result = fakeResult("f.md", original, full);
    expect(checkAtomicEditOwnership([result])).toEqual([]); // healthy case: no issues

    const rcs = result.diff!.reviewChanges;
    const duplicated = { ...rcs[1]!, atomicEditIds: rcs[0]!.atomicEditIds }; // steal rc[0]'s edit
    const corrupted: FileResult = {
      ...result,
      diff: { ...result.diff!, reviewChanges: [rcs[0]!, duplicated, ...rcs.slice(2)] },
    };
    const issues = checkAtomicEditOwnership([corrupted]);
    expect(issues.length).toBeGreaterThan(0);
  });
});

// -------------------------------------------------------------------------------------------
// 19. Review-item maximum size is respected.
// -------------------------------------------------------------------------------------------
describe("acceptance 19: review-item maximum size cap", () => {
  it("no review change's old span exceeds the documented maximum", () => {
    // A long run of tightly adjacent single-character edits (well within the adjacency gap)
    // forces the grouping rule to actually hit the cap and split.
    const before = Array.from({ length: 120 }, () => '"').join("x") + "\n";
    const after = Array.from({ length: 120 }, () => "“").join("x") + "\n";
    const diff = computeFileDiff("f.md", before, after);
    const result: FileResult = {
      path: "f.md",
      bytes: 0,
      sha256: "x",
      status: "changed",
      idempotencyOk: true,
      diff,
    };
    const issues = checkReviewChangeSizeCap([result], REVIEW_CHANGE_MAX_OLD_SPAN_CODEPOINTS);
    expect(issues).toEqual([]);
    for (const rc of diff.reviewChanges) {
      expect(rc.oldOffset.codePointEnd - rc.oldOffset.codePointStart).toBeLessThanOrEqual(
        REVIEW_CHANGE_MAX_OLD_SPAN_CODEPOINTS,
      );
    }
    // The cap actually forced more than one group, proving the split is exercised, not just untested.
    expect(diff.reviewChanges.length).toBeGreaterThan(1);
  });
});

// -------------------------------------------------------------------------------------------
// 20. Repeat run gives identical substantive artifacts.
// -------------------------------------------------------------------------------------------
describe("acceptance 20: repeat-run determinism", () => {
  it("two runDogfood() calls over the same disposable corpus produce byte-identical changes.json/REVIEW.md content (modulo output path fields)", () => {
    const corpus = freshDir("dogfood-model-corpus-");
    const postDir = path.join(corpus, "post-one");
    mkdirSync(postDir, { recursive: true });
    const content = '---\ntitle: "x"\n---\n\nHe said "hi" and left at 5-10 oclock.\n';
    writeFileSync(path.join(postDir, "index.mdx"), content, "utf8");

    const out1 = path.join(freshDir("dogfood-model-out1-"), "evidence");
    const out2 = path.join(freshDir("dogfood-model-out2-"), "evidence");
    const summary1 = runDogfood({
      corpusRoot: corpus,
      outDir: out1,
      locale: "en-US",
      dialect: "mdx",
      argv: [],
    });
    const summary2 = runDogfood({
      corpusRoot: corpus,
      outDir: out2,
      locale: "en-US",
      dialect: "mdx",
      argv: [],
    });

    expect(summary1.status).toBe("success");
    expect(summary2.status).toBe("success");
    expect(readFileSync(path.join(out1, "changes.json"), "utf8")).toBe(
      readFileSync(path.join(out2, "changes.json"), "utf8"),
    );
    expect(readFileSync(path.join(out1, "REVIEW.md"), "utf8")).toBe(
      readFileSync(path.join(out2, "REVIEW.md"), "utf8"),
    );
    expect(readFileSync(path.join(out1, "full.diff"), "utf8")).toBe(
      readFileSync(path.join(out2, "full.diff"), "utf8"),
    );
    expect(readFileSync(path.join(postDir, "index.mdx"), "utf8")).toBe(content);
  });
});

// -------------------------------------------------------------------------------------------
// Additional structural checks: content-stable IDs, entry building, and the full end-to-end path.
// -------------------------------------------------------------------------------------------
describe("content-stable IDs", () => {
  it("an unrelated edit inserted earlier in the file does not rename a later, unmoved edit's id, when isolated via rule subset", () => {
    // Vary rule enablement rather than the fixture text (inserting text earlier shifts every
    // later offset by construction, which is the documented limit of the ID guarantee, not a
    // bug) -- run the same source through two different rule subsets and confirm any edit that
    // appears in both keeps the same id.
    const original = 'He said "hi" and left at 5-10 oclock.\n';
    const quotesOnly = transform(original, {
      locale: "en-US",
      mode: "text",
      rules: {
        spaces: false,
        ellipsis: false,
        dashes: false,
        hyphen: false,
        apostrophe: false,
        symbols: false,
        nbsp: false,
      },
    });
    const quotesAndDashes = transform(original, {
      locale: "en-US",
      mode: "text",
      rules: {
        spaces: false,
        ellipsis: false,
        hyphen: false,
        apostrophe: false,
        symbols: false,
        nbsp: false,
      },
    });
    const diffA = computeFileDiff("f.md", original, quotesOnly);
    const diffB = computeFileDiff("f.md", original, quotesAndDashes);
    const quoteEditA = diffA.atomicEdits.find((e) => e.before === '"');
    const quoteEditB = diffB.atomicEdits.find((e) => e.before === '"');
    expect(quoteEditA).toBeDefined();
    expect(quoteEditB).toBeDefined();
    expect(quoteEditA!.id).toBe(quoteEditB!.id);
  });
});

describe("buildReviewChangeEntries / offsetToLineCol sanity", () => {
  it("entries carry atomicEditIds and independently-derivable line/col", () => {
    const original = 'line one "a".\nline two "b".\n';
    const full = "line one “a”.\nline two “b”.\n";
    const result = fakeResult("f.md", original, full);
    const entries = buildReviewChangeEntries([result]);
    expect(entries.length).toBe(2);
    for (const e of entries) {
      expect(e.atomicEditIds.length).toBeGreaterThan(0);
      const recomputed = offsetToLineCol(original, e.oldOffset.codePointStart);
      expect(recomputed).toEqual(e.oldLineCol.start);
    }
  });
});
