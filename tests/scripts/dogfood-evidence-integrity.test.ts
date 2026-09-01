// Regression tests for the fail-closed evidence-integrity checks added in Stage 10 Pass A's
// second and third corrections: risk-tag evidence validation, full old/new start+end line/column
// verification, and the UTF-8 byte-boundary check's zero-length-range blind spot.
import { describe, expect, it } from "vitest";
import { computeFileDiff } from "../../scripts/dogfood/diff.js";
import { computeRiskTags, type BoundaryEvidence, type TokenEvidence } from "../../scripts/dogfood/tagging.js";
import { attributeReviewChanges } from "../../scripts/dogfood/attribution.js";
import { transform } from "../../src/index.js";
import { getLocaleData } from "../../src/engine/locale.js";
import {
  checkLineColMatchesOffsets,
  checkRiskTagEvidence,
  checkUtf8ByteBoundaries,
} from "../../scripts/dogfood/consistency.js";
import type { FileResult } from "../../scripts/dogfood/transform-corpus.js";

const RANGES_OPTS = { locale: "en-US", mode: "text" as const, rules: { ranges: true } };
const enUSLocale = getLocaleData("en-US");

function fakeResult(path: string, original: string, full: string, opts: { locale: string; mode: "text" | "markdown"; dialect?: "mdx"; rules?: { ranges?: boolean } } = { locale: "en-US", mode: "text" }): FileResult {
  const diff = computeFileDiff(path, original, full);
  const attr = attributeReviewChanges(original, opts, diff.reviewChanges);
  const localeData = getLocaleData(opts.locale);
  const riskTags = new Map(
    diff.reviewChanges.map((rc) => {
      const edits = diff.atomicEdits.filter((e) => rc.atomicEditIds.includes(e.id));
      return [rc.id, computeRiskTags({ oldText: original, newText: full, reviewChange: rc, atomicEdits: edits, attribution: attr.get(rc.id), locale: localeData })] as const;
    }),
  );
  return { path, bytes: 0, sha256: "x", status: "changed", idempotencyOk: true, diff, originalText: original, transformedText: full, attribution: attr, riskTags };
}

describe("checkRiskTagEvidence: healthy real-engine evidence passes", () => {
  it("a realistic multi-tag fixture produces zero validation failures", () => {
    const original = '😀 See Figure 5-10 now, and "quotes" here — a dash too.\n';
    const full = transform(original, RANGES_OPTS);
    const result = fakeResult("f.md", original, full, RANGES_OPTS);
    expect(checkRiskTagEvidence([result], enUSLocale)).toEqual([]);
  });
});

describe("checkRiskTagEvidence: corrupted evidence fails closed", () => {
  it("2. corrupted risk token range is caught", () => {
    const original = "See Figure 5-10 now.\n";
    const full = transform(original, RANGES_OPTS);
    const result = fakeResult("f.md", original, full, RANGES_OPTS);
    const [rc] = result.diff!.reviewChanges;
    const tags = result.riskTags!.get(rc!.id)!;
    const numeric = tags.find((t) => t.tag === "numeric-range-or-compound-label-candidate")!;
    const corrupted = { ...numeric, evidence: { ...(numeric.evidence as TokenEvidence), tokenOldOffset: { codePointStart: 999, codePointEnd: 1005 } } };
    const corruptedTags = new Map(result.riskTags);
    corruptedTags.set(rc!.id, [corrupted, ...tags.filter((t) => t !== numeric)]);
    const issues = checkRiskTagEvidence([{ ...result, riskTags: corruptedTags }], enUSLocale);
    expect(issues.length).toBeGreaterThan(0);
  });

  it("3. corrupted risk atomic ID is caught", () => {
    const original = "See Figure 5-10 now.\n";
    const full = transform(original, RANGES_OPTS);
    const result = fakeResult("f.md", original, full, RANGES_OPTS);
    const [rc] = result.diff!.reviewChanges;
    const tags = result.riskTags!.get(rc!.id)!;
    const numeric = tags.find((t) => t.tag === "numeric-range-or-compound-label-candidate")!;
    const corrupted = { ...numeric, evidence: { ...(numeric.evidence as TokenEvidence), intersectingAtomicEditId: "f.md#a999-nonexistent" } };
    const corruptedTags = new Map(result.riskTags);
    corruptedTags.set(rc!.id, [corrupted, ...tags.filter((t) => t !== numeric)]);
    const issues = checkRiskTagEvidence([{ ...result, riskTags: corruptedTags }], enUSLocale);
    expect(issues.some((i) => i.includes("does not exist"))).toBe(true);
  });

  it("4. a claimed atomic edit that does not intersect the token range is caught", () => {
    const original = 'See "quotes" and Figure 5-10 details.\n';
    const full = transform(original, RANGES_OPTS);
    const result = fakeResult("f.md", original, full, RANGES_OPTS);
    // Take the numeric tag from the dash review change, but point it at the unrelated quote edit.
    const dashRc = result.diff!.reviewChanges.find((rc) => rc.before === "-")!;
    const quoteEdit = result.diff!.atomicEdits.find((e) => e.before === '"')!;
    const tags = result.riskTags!.get(dashRc.id)!;
    const numeric = tags.find((t) => t.tag === "numeric-range-or-compound-label-candidate")!;
    const corrupted = { ...numeric, evidence: { ...(numeric.evidence as TokenEvidence), intersectingAtomicEditId: quoteEdit.id } };
    // Include the quote edit's owning review change's atomicEditIds is irrelevant here; the point
    // is the token range (near the dash) never intersects the quote edit's range.
    const corruptedTags = new Map(result.riskTags);
    corruptedTags.set(dashRc.id, [corrupted, ...tags.filter((t) => t !== numeric)]);
    const issues = checkRiskTagEvidence([{ ...result, riskTags: corruptedTags }], enUSLocale);
    expect(issues.some((i) => i.includes("does not actually intersect") || i.includes("does not belong to this review change"))).toBe(true);
  });

  it("5. corrupted boundary distance is caught", () => {
    const original = '<Component prop="x" /> then "quotes" right after.\n';
    const full = transform(original, { locale: "en-US", mode: "markdown", dialect: "mdx" });
    const result = fakeResult("f.mdx", original, full);
    let found = false;
    for (const [id, tags] of result.riskTags!) {
      const boundary = tags.find((t) => t.tag === "mdx-jsx-code-boundary-adjacent");
      if (!boundary) continue;
      found = true;
      const corrupted = { ...boundary, evidence: { ...(boundary.evidence as BoundaryEvidence), distance: (boundary.evidence as BoundaryEvidence).distance + 50 } };
      const corruptedTags = new Map(result.riskTags);
      corruptedTags.set(id, [corrupted, ...tags.filter((t) => t !== boundary)]);
      const issues = checkRiskTagEvidence([{ ...result, riskTags: corruptedTags }], enUSLocale);
      expect(issues.length).toBeGreaterThan(0);
    }
    expect(found).toBe(true);
  });
});

describe("checkLineColMatchesOffsets: negative controls for old/new end and column", () => {
  it("7. an incorrect old end line/column is caught", () => {
    const original = 'line one "a".\nline two "b".\n';
    const full = "line one “a”.\nline two “b”.\n";
    const result = fakeResult("f.md", original, full);
    const [rc, ...rest] = result.diff!.reviewChanges;
    const corruptedRc = { ...rc!, oldLineCol: { ...rc!.oldLineCol, end: { line: 99, column: 0 } } };
    const corrupted: FileResult = { ...result, diff: { ...result.diff!, reviewChanges: [corruptedRc, ...rest] } };
    const issues = checkLineColMatchesOffsets([corrupted]);
    expect(issues.some((i) => i.includes("old end"))).toBe(true);
  });

  it("an incorrect new end line/column is caught", () => {
    const original = 'line one "a".\nline two "b".\n';
    const full = "line one “a”.\nline two “b”.\n";
    const result = fakeResult("f.md", original, full);
    const [rc, ...rest] = result.diff!.reviewChanges;
    const corruptedRc = { ...rc!, newLineCol: { ...rc!.newLineCol, end: { line: 1, column: 999 } } };
    const corrupted: FileResult = { ...result, diff: { ...result.diff!, reviewChanges: [corruptedRc, ...rest] } };
    const issues = checkLineColMatchesOffsets([corrupted]);
    expect(issues.some((i) => i.includes("new end"))).toBe(true);
  });

  it("a column exceeding its own line's length is caught", () => {
    const original = 'line one "a".\nline two "b".\n';
    const full = "line one “a”.\nline two “b”.\n";
    const result = fakeResult("f.md", original, full);
    const [rc, ...rest] = result.diff!.reviewChanges;
    const corruptedRc = { ...rc!, oldLineCol: { ...rc!.oldLineCol, start: { line: rc!.oldLineCol.start.line, column: 9999 } } };
    const corrupted: FileResult = { ...result, diff: { ...result.diff!, reviewChanges: [corruptedRc, ...rest] } };
    const issues = checkLineColMatchesOffsets([corrupted]);
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe("checkUtf8ByteBoundaries: zero-length range inside a multibyte code point", () => {
  it("6. is caught even though the old check (empty slice equals empty before) would have missed it", () => {
    const original = "prefix😀suffix\n";
    const full = "prefix😀suffix\n";
    const diff = computeFileDiff("f.md", original, full);
    // "prefix" = 6 bytes, 😀 (U+1F600) spans UTF-8 bytes [6,10). Byte 8 is mid-character.
    const fake = {
      id: "f.md#afake",
      path: "f.md",
      oldOffset: { codePointStart: 7, codePointEnd: 7, byteStart: 8, byteEnd: 8 },
      newOffset: { codePointStart: 7, codePointEnd: 7, byteStart: 8, byteEnd: 8 },
      before: "",
      after: "X",
    };
    expect(fake.before).toBe(""); // the exact shape the old check silently passed
    const result: FileResult = {
      path: "f.md",
      bytes: 0,
      sha256: "x",
      status: "changed",
      idempotencyOk: true,
      originalText: original,
      transformedText: full,
      diff: { ...diff, atomicEdits: [fake] },
    };
    const issues = checkUtf8ByteBoundaries([result]);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.includes("UTF-8 character boundary"))).toBe(true);
  });

  it("a correctly-aligned zero-length range at a real boundary passes", () => {
    const original = "prefix😀suffix\n";
    const full = "prefix😀Xsuffix\n";
    const diff = computeFileDiff("f.md", original, full);
    const result: FileResult = { path: "f.md", bytes: 0, sha256: "x", status: "changed", idempotencyOk: true, originalText: original, transformedText: full, diff };
    expect(checkUtf8ByteBoundaries([result])).toEqual([]);
  });
});
