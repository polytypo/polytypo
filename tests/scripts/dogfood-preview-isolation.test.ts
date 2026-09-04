// Regression tests for Stage 10 Pass A's second correction, item 1: preview contamination. The
// old previewNewLeading/previewNewTrailing sliced the FULL transformed file, so a review item's
// own preview window could (and, on real corpus data, routinely did) show an unrelated
// neighbouring review change's own edit -- making a one-item decision ambiguous. `diff.ts` now
// builds `previewIsolatedLeading`/`previewIsolatedTrailing` by construction from the untouched
// source window instead (see `ReviewChange`'s doc comment), and `oldMarks`/`newMarks` mark each
// grouped `AtomicEdit` individually rather than one envelope.
import { describe, expect, it } from "vitest";
import { transform } from "../../src/index.js";
import { computeFileDiff } from "../../scripts/dogfood/diff.js";
import {
  checkAnchorsUnique,
  checkIsolatedPreviewMarks,
  checkPreviewMatchesSource,
  checkQuotePairLinksSymmetric,
} from "../../scripts/dogfood/consistency.js";
import { attributeReviewChanges } from "../../scripts/dogfood/attribution.js";
import {
  buildReviewChangeEntries,
  buildReviewMarkdown,
  reviewChangeAnchor,
} from "../../scripts/dogfood/evidence.js";
import { computeQuotePairing } from "../../scripts/dogfood/quote-pairing.js";
import type { FileResult } from "../../scripts/dogfood/transform-corpus.js";

function fakeResult(path: string, original: string, full: string): FileResult {
  const diff = computeFileDiff(path, original, full);
  const attr = attributeReviewChanges(
    original,
    { locale: "en-US", mode: "text" },
    diff.reviewChanges,
  );
  const quotePairing = computeQuotePairing(original, diff.reviewChanges, attr);
  return {
    path,
    bytes: 0,
    sha256: "x",
    status: "changed",
    idempotencyOk: true,
    diff,
    originalText: original,
    transformedText: full,
    attribution: attr,
    quotePairing,
  };
}

function fakeManifest(entries: ReturnType<typeof buildReviewChangeEntries>) {
  return {
    command: {
      locale: "en-US",
      localeRationale: "",
      mode: "text",
      dialect: "commonmark",
      corpus: "/x",
    },
    results: {
      changedFileCount: 1,
      unchangedFileCount: 0,
      errorCount: 0,
      unifiedDiffHunkCount: 1,
      atomicEditCount: entries.length,
      reviewChangeCount: entries.length,
      idempotency: { checked: 1, failed: 0 },
    },
    git: { head: "x", dirty: false },
    evidence: null,
  };
}

describe("acceptance item 1: apostrophe + nearby dash in the same preview window", () => {
  const original = "Every year - nearly everyone's plans change here.\n";
  const full = transform(original, { locale: "en-US", mode: "text" });
  const result = fakeResult("f.md", original, full);
  const diff = result.diff!;

  it("the fixture actually produces two separate review changes close enough to have contaminated each other under the old model", () => {
    expect(full).not.toBe(original);
    expect(diff.reviewChanges.length).toBeGreaterThanOrEqual(2);
    const dashRc = diff.reviewChanges.find((rc) => rc.before.includes("-"));
    const apostropheRc = diff.reviewChanges.find((rc) => rc.before === "'");
    expect(dashRc).toBeDefined();
    expect(apostropheRc).toBeDefined();
    // Close enough (well within the 40-code-point preview radius) that the old full-transformed-
    // file preview would have pulled one into the other's window.
    expect(
      Math.abs(apostropheRc!.oldOffset.codePointStart - dashRc!.oldOffset.codePointStart),
    ).toBeLessThan(40);
  });

  it("1/2. the apostrophe row's isolated preview does not show the dash's own edit, and vice versa", () => {
    const apostropheRc = diff.reviewChanges.find((rc) => rc.before === "'")!;
    const dashRc = diff.reviewChanges.find((rc) => rc.before.includes("-"))!;

    // The apostrophe row's isolated "after" picture must show the dash exactly as it was in the
    // SOURCE (a literal ASCII "-", never the em dash the dash row's own edit produced).
    const apostropheIsolatedFull =
      apostropheRc.previewIsolatedLeading.text +
      apostropheRc.after +
      apostropheRc.previewIsolatedTrailing.text;
    expect(apostropheIsolatedFull).toContain("year - nearly");
    expect(apostropheIsolatedFull).not.toContain("year—nearly");

    // Symmetrically, the dash row's isolated "after" picture must show the apostrophe exactly as
    // it was in the source (a literal ASCII "'"), never the curly apostrophe the apostrophe row's
    // own edit produced.
    const dashIsolatedFull =
      dashRc.previewIsolatedLeading.text + dashRc.after + dashRc.previewIsolatedTrailing.text;
    expect(dashIsolatedFull).toContain("everyone's");
    expect(dashIsolatedFull).not.toContain("everyone’s");
  });

  it("sourcePreview + this row's own edits exactly reproduces isolatedAfterPreview (the core isolation invariant)", () => {
    for (const rc of diff.reviewChanges) {
      expect(rc.previewIsolatedLeading.text).toBe(rc.previewOldLeading.text);
      expect(rc.previewIsolatedTrailing.text).toBe(rc.previewOldTrailing.text);
      const sourceFull = rc.previewOldLeading.text + rc.before + rc.previewOldTrailing.text;
      const isolatedFull =
        rc.previewIsolatedLeading.text + rc.after + rc.previewIsolatedTrailing.text;
      // The only thing that ever changes between the two full windows is the marked span itself.
      expect(sourceFull.slice(0, rc.previewOldLeading.text.length)).toBe(
        isolatedFull.slice(0, rc.previewIsolatedLeading.text.length),
      );
    }
  });

  it("checkPreviewMatchesSource and checkIsolatedPreviewMarks pass on healthy data", () => {
    expect(checkPreviewMatchesSource([result])).toEqual([]);
    expect(checkIsolatedPreviewMarks([result])).toEqual([]);
  });

  it("a corrupted previewIsolatedLeading (diverging from previewOldLeading) is caught", () => {
    const [rc, ...rest] = diff.reviewChanges;
    const corrupted = {
      ...rc!,
      previewIsolatedLeading: { text: "totally different text", truncated: false },
    };
    const badResult: FileResult = {
      ...result,
      diff: { ...diff, reviewChanges: [corrupted, ...rest] },
    };
    const issues = checkPreviewMatchesSource([badResult]);
    expect(issues.some((i) => i.includes("previewIsolatedLeading"))).toBe(true);
  });
});

describe("acceptance item 1: multi-atomic review item highlights every edit individually", () => {
  it("a review change with more than one grouped AtomicEdit has one mark per edit, not one envelope", () => {
    // A run of straight quotes each separated by one "x" -- every quote-to-x-to-quote gap is 1
    // code point, well within REVIEW_CHANGE_ADJACENCY_GAP_CODEPOINTS, so this diff's AtomicEdits
    // (one per quote mark) merge into multi-edit ReviewChange groups. Uses computeFileDiff
    // directly on a synthetic before/after (not transform()) purely to force a genuine
    // multi-AtomicEdit group deterministically, independent of the real quotes rule's own nesting
    // decisions on any specific fixture.
    const original = Array.from({ length: 20 }, () => '"').join("x") + "\n";
    const full = Array.from({ length: 20 }, () => "“").join("x") + "\n";
    const result = fakeResult("f.md", original, full);
    const multi = result.diff!.reviewChanges.find((rc) => rc.atomicEditIds.length > 1);
    expect(multi).toBeDefined();
    expect(multi!.oldMarks.length).toBe(multi!.atomicEditIds.length);
    expect(multi!.newMarks.length).toBe(multi!.atomicEditIds.length);
    // Not one envelope: at least one mark's span is strictly smaller than the whole `before`.
    const wholeSpan = [...multi!.before].length;
    expect(multi!.oldMarks.some((m) => m.end - m.start < wholeSpan)).toBe(true);
    expect(checkIsolatedPreviewMarks([result])).toEqual([]);
  });
});

describe("acceptance item 2: stable anchors and real symmetric quote-pair links", () => {
  const original = 'She said "this is fine" today.\n';
  const full = transform(original, { locale: "en-US", mode: "text" });
  const result = fakeResult("f.md", original, full);

  it("5. anchors are deterministic and unique; healthy data passes checkAnchorsUnique", () => {
    const entries = buildReviewChangeEntries([result]);
    for (const e of entries) expect(e.anchor).toBe(reviewChangeAnchor(e.id));
    expect(checkAnchorsUnique(entries)).toEqual([]);
    // Regenerating from the same id always gives the same anchor.
    expect(reviewChangeAnchor(entries[0]!.id)).toBe(reviewChangeAnchor(entries[0]!.id));
  });

  it("duplicate anchors are caught", () => {
    const entries = buildReviewChangeEntries([result]);
    if (entries.length < 2) throw new Error("fixture needs at least 2 entries");
    const corrupted = entries.map((e, i) => (i === 1 ? { ...e, anchor: entries[0]!.anchor } : e));
    const issues = checkAnchorsUnique(corrupted);
    expect(issues.some((i) => i.includes("shared by"))).toBe(true);
  });

  it("6/7. REVIEW.md renders a real relative pair link resolving to an anchor that exists exactly once, symmetric both ways", () => {
    const entries = buildReviewChangeEntries([result]);
    const md = buildReviewMarkdown(fakeManifest(entries), entries, [result]);
    const opening = entries.find(
      (e) => e.quotePairing?.status === "paired" && e.quotePairing.role === "opening",
    )!;
    const closing = entries.find(
      (e) => e.quotePairing?.status === "paired" && e.quotePairing.role === "closing",
    )!;
    expect(opening).toBeDefined();
    expect(closing).toBeDefined();

    // Real relative markdown links, not bare backticked ids.
    expect(md).toContain(`](#${closing.anchor})`);
    expect(md).toContain(`](#${opening.anchor})`);
    // Each target anchor appears exactly once as a heading/id target.
    expect((md.match(new RegExp(`id="${opening.anchor}"`, "g")) ?? []).length).toBe(1);
    expect((md.match(new RegExp(`id="${closing.anchor}"`, "g")) ?? []).length).toBe(1);

    expect(checkQuotePairLinksSymmetric(entries)).toEqual([]);
  });

  it("8. unknown/unpaired quote changes never render a pair link", () => {
    const unbalanced = 'It said "hi today.\n'; // deliberately unbalanced
    const unbalancedFull = transform(unbalanced, { locale: "en-US", mode: "text" });
    const r2 = fakeResult("f2.md", unbalanced, unbalancedFull);
    const entries2 = buildReviewChangeEntries([r2]);
    const md2 = buildReviewMarkdown(fakeManifest(entries2), entries2, [r2]);
    const quoteRows = entries2.filter((e) => e.quotePairing !== null);
    for (const e of quoteRows) {
      expect(e.quotePairing!.status).not.toBe("paired");
    }
    // No "role ↔ [...]" link syntax should appear anywhere for this file's rows.
    expect(md2).not.toMatch(/(opening|closing) ↔ \[/);
  });

  it("an asymmetric quotePairing (one side does not link back) is caught", () => {
    const entries = buildReviewChangeEntries([result]);
    const opening = entries.find(
      (e) => e.quotePairing?.status === "paired" && e.quotePairing.role === "opening",
    )!;
    const closing = entries.find(
      (e) => e.quotePairing?.status === "paired" && e.quotePairing.role === "closing",
    )!;
    const corrupted = entries.map((e) =>
      e.id === closing.id ? { ...e, quotePairing: { status: "unknown" as const } } : e,
    );
    const issues = checkQuotePairLinksSymmetric(corrupted);
    expect(issues.some((i) => i.includes(opening.id) || i.includes("not symmetric"))).toBe(true);
  });
});
