// Regression tests for REVIEW.md's contextual previews, quote pairing, Markdown-table safety, and
// the remaining fail-closed consistency checks added in Stage 10 Pass A's later corrections
// (hunk containment, cross-namespace id uniqueness, preview-matches-source, and
// count-summary-matches-entries).
import { describe, expect, it } from "vitest";
import { transform } from "../../src/index.js";
import { computeFileDiff } from "../../scripts/dogfood/diff.js";
import { attributeReviewChanges } from "../../scripts/dogfood/attribution.js";
import { computeRiskTags } from "../../scripts/dogfood/tagging.js";
import { getLocaleData } from "../../src/engine/locale.js";
import { computeQuotePairing } from "../../scripts/dogfood/quote-pairing.js";

const enUSLocale = getLocaleData("en-US");
import {
  buildManifest,
  buildReviewChangeEntries,
  buildReviewMarkdown,
} from "../../scripts/dogfood/evidence.js";
import {
  checkGlobalIdNamespaceUnique,
  checkHunkContainment,
  checkPreviewMatchesSource,
  checkReviewMarkdownCountsMatchEntries,
} from "../../scripts/dogfood/consistency.js";
import type { FileResult } from "../../scripts/dogfood/transform-corpus.js";

function fakeResult(
  path: string,
  original: string,
  full: string,
  opts: { markdown?: boolean; ranges?: boolean } = {},
): FileResult {
  const diff = computeFileDiff(path, original, full);
  const options = opts.markdown
    ? { locale: "en-US", mode: "markdown" as const, dialect: "mdx" as const }
    : {
        locale: "en-US",
        mode: "text" as const,
        ...(opts.ranges ? { rules: { ranges: true } } : {}),
      };
  const attr = attributeReviewChanges(original, options, diff.reviewChanges);
  const riskTags = new Map(
    diff.reviewChanges.map((rc) => {
      const edits = diff.atomicEdits.filter((e) => rc.atomicEditIds.includes(e.id));
      return [
        rc.id,
        computeRiskTags({
          oldText: original,
          newText: full,
          reviewChange: rc,
          atomicEdits: edits,
          attribution: attr.get(rc.id),
          locale: enUSLocale,
        }),
      ] as const;
    }),
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
    riskTags,
    quotePairing,
  };
}

function fakeManifest(
  entries: ReturnType<typeof buildReviewChangeEntries>,
  hunkCount: number,
  atomicCount: number,
) {
  return buildManifest({
    provenance: {
      argv: [],
      corpusRoot: "/x",
      outDir: "/y",
      locale: "en-US",
      localeRationale: "",
      mode: "markdown",
      dialect: "mdx",
      nodeVersion: "v0",
      packageVersion: "0.0.0",
      specVersion: "0.0.0",
      gitHead: "x",
      gitDirty: false,
    },
    implementationInputs: { roots: [], fileCount: 0, totalBytes: 0, aggregateHash: "x", files: [] },
    corpusPreRun: { files: [], fileCount: 0, totalBytes: 0, aggregateHash: "x" },
    corpusPostRun: { files: [], fileCount: 0, totalBytes: 0, aggregateHash: "x" },
    corpusManifestsEqual: true,
    results: [],
    counts: {
      changedFileCount: 1,
      unchangedFileCount: 0,
      errorCount: 0,
      unifiedDiffHunkCount: hunkCount,
      atomicEditCount: atomicCount,
      reviewChangeCount: entries.length,
    },
    idempotencyFailures: [],
    evidence: null,
  });
}

describe("acceptance 8-9: contextual apostrophe/dash previews are readable without changes.json", () => {
  it("8. an apostrophe edit's preview reads as the whole word, not just the mark", () => {
    const original = "Most IT problems don't just disappear on their own.\n";
    const full = transform(original, { locale: "en-US", mode: "text" });
    const result = fakeResult("f.md", original, full);
    const entries = buildReviewChangeEntries([result]);
    const md = buildReviewMarkdown(fakeManifest(entries, 1, entries.length), entries, [result]);
    // The rendered row must contain the full word "don" + mark + "t" reconstructible from the
    // preview cell, not just the bare apostrophe substitute in isolation.
    expect(md).toMatch(/don.*t/);
    expect(md).toContain("problems");
  });

  it("9. a dash edit's preview shows the local phrase, e.g. 'year' and 'nearly' around the dash", () => {
    const original = "roughly 75 hours a year - nearly two weeks - on things.\n";
    const full = transform(original, { locale: "en-US", mode: "text" });
    const result = fakeResult("f.md", original, full);
    const entries = buildReviewChangeEntries([result]);
    const md = buildReviewMarkdown(fakeManifest(entries, 1, entries.length), entries, [result]);
    expect(md).toContain("year");
    expect(md).toContain("nearly");
  });
});

describe("acceptance 10: paired quote preview/link, or an honest unknown", () => {
  it("a simple same-line pair is linked to each other", () => {
    const original = 'She said "this is fine" today.\n';
    const full = transform(original, { locale: "en-US", mode: "text" });
    const result = fakeResult("f.md", original, full);
    const entries = buildReviewChangeEntries([result]);
    const opening = entries.find(
      (e) => e.quotePairing?.status === "paired" && e.quotePairing.role === "opening",
    );
    const closing = entries.find(
      (e) => e.quotePairing?.status === "paired" && e.quotePairing.role === "closing",
    );
    expect(opening).toBeDefined();
    expect(closing).toBeDefined();
    const openingPairing = opening!.quotePairing;
    const closingPairing = closing!.quotePairing;
    if (openingPairing?.status !== "paired" || closingPairing?.status !== "paired")
      throw new Error("expected both to be paired");
    expect(openingPairing.pairedReviewChangeId).toBe(closing!.id);
    expect(closingPairing.pairedReviewChangeId).toBe(opening!.id);
  });

  it("an inner nested mark that is genuinely ambiguous with apostrophe is never paired -- only the unambiguous outer double-quote pair is", () => {
    const original = "She said \"he said 'hello there' loudly\" today.\n";
    const full = transform(original, { locale: "en-US", mode: "text" });
    const result = fakeResult("f.md", original, full);
    const entries = buildReviewChangeEntries([result]);
    const quoteEntries = entries.filter((e) => e.quotePairing !== null);
    expect(quoteEntries.length).toBeGreaterThan(0);
    // The single-curly-quote family here has an ambiguous closing mark (apostrophe-attributed,
    // not quotes-attributed) -- whatever single-curly candidates remain must never be paired.
    const singleCurlyCandidates = quoteEntries.filter(
      (e) => e.before === "'" || e.after === "‘" || e.after === "’",
    );
    for (const e of singleCurlyCandidates) {
      expect(e.quotePairing!.status).not.toBe("paired");
    }
  });

  it("an unmatched single quote mark is unpaired, not silently linked", () => {
    const original = 'It said "hi today.\n'; // deliberately unbalanced
    const full = transform(original, { locale: "en-US", mode: "text" });
    const result = fakeResult("f.md", original, full);
    const entries = buildReviewChangeEntries([result]);
    const quoteEntries = entries.filter((e) => e.quotePairing !== null);
    if (quoteEntries.length > 0) {
      expect(quoteEntries.every((e) => e.quotePairing!.status !== "paired")).toBe(true);
    }
  });

  it("an ordinary apostrophe never gets quote pairing at all", () => {
    const original = "It's fine.\n";
    const full = transform(original, { locale: "en-US", mode: "text" });
    const result = fakeResult("f.md", original, full);
    const entries = buildReviewChangeEntries([result]);
    for (const e of entries) expect(e.quotePairing).toBeNull();
  });
});

describe("acceptance 11: Markdown metacharacters never break the table", () => {
  it("pipe, backtick, newline, and HTML/MDX content in preview text render as a well-formed table", () => {
    const original = 'Code `like|this` and <Component prop="x" /> then "text with | pipe" more.\n';
    const full = transform(original, { locale: "en-US", mode: "markdown", dialect: "mdx" });
    const result = fakeResult("f.mdx", original, full, { markdown: true });
    const entries = buildReviewChangeEntries([result]);
    const md = buildReviewMarkdown(fakeManifest(entries, 1, entries.length), entries, [result]);
    const tableLines = md
      .split("\n")
      .filter((l) => l.startsWith("| <a id=") && l.includes("`f.mdx"));
    expect(tableLines.length).toBeGreaterThan(0);
    for (const line of tableLines) {
      // A well-formed GFM row: same cell count as the header (8 columns -> 9 pipes).
      expect((line.match(/\|/g) ?? []).length).toBe(9);
      expect(line).not.toContain("\n");
    }
  });
});

describe("acceptance 12: oversized preview truncates deterministically with an ellipsis marker", () => {
  it("a change deep inside a very long line gets a truncated preview on both sides", () => {
    const original = "word ".repeat(60) + '"quoted" ' + "word ".repeat(60) + "\n";
    const full = transform(original, { locale: "en-US", mode: "text" });
    const result = fakeResult("f.md", original, full);
    const rc = result.diff!.reviewChanges[0]!;
    expect(rc.previewOldLeading.truncated).toBe(true);
    expect(rc.previewOldTrailing.truncated).toBe(true);
    const entries = buildReviewChangeEntries([result]);
    const md = buildReviewMarkdown(fakeManifest(entries, 1, entries.length), entries, [result]);
    expect(md).toContain("…");
  });
});

describe("acceptance 13: hunk containment", () => {
  it("healthy data passes; a fabricated out-of-range hunk reference fails closed", () => {
    const original = 'line one "a".\n';
    const full = "line one “a”.\n";
    const result = fakeResult("f.md", original, full);
    expect(checkHunkContainment([result])).toEqual([]);

    const rc = result.diff!.reviewChanges[0]!;
    const corrupted = { ...rc, diffHunkId: "unknown" };
    const badResult: FileResult = {
      ...result,
      diff: { ...result.diff!, reviewChanges: [corrupted] },
    };
    const issues = checkHunkContainment([badResult]);
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe("acceptance 14: REVIEW.md summary counts are derived from entries, not hand-threaded", () => {
  it("healthy data passes; a corrupted REVIEW.md count fails closed", () => {
    const original = 'See Figure 5-10 and "quotes" here.\n';
    const full = transform(original, { locale: "en-US", mode: "text", rules: { ranges: true } });
    const result = fakeResult("f.md", original, full, { ranges: true });
    const entries = buildReviewChangeEntries([result]);
    const md = buildReviewMarkdown(fakeManifest(entries, 1, entries.length), entries, [result]);
    expect(checkReviewMarkdownCountsMatchEntries(entries, md)).toEqual([]);

    const corruptedMd = md.replace(
      /(- `dash-restyling`: )(\d+)( changes?)/,
      (_m, a, _n, c) => `${a}999${c}`,
    );
    const issues = checkReviewMarkdownCountsMatchEntries(entries, corruptedMd);
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe("global id namespace uniqueness and preview-matches-source", () => {
  it("healthy real-engine data has no collisions and every preview matches real source text", () => {
    const original = '😀 That\'s "great" — really — Figure 5-10 shows it.\n';
    const full = transform(original, { locale: "en-US", mode: "text" });
    const result = fakeResult("f.md", original, full);
    expect(checkGlobalIdNamespaceUnique([result])).toEqual([]);
    expect(checkPreviewMatchesSource([result])).toEqual([]);
  });

  it("a corrupted preview text is caught", () => {
    const original = 'She said "hi" today.\n';
    const full = transform(original, { locale: "en-US", mode: "text" });
    const result = fakeResult("f.md", original, full);
    const [rc, ...rest] = result.diff!.reviewChanges;
    const corrupted = {
      ...rc!,
      previewOldLeading: { text: "totally wrong text", truncated: false },
    };
    const badResult: FileResult = {
      ...result,
      diff: { ...result.diff!, reviewChanges: [corrupted, ...rest] },
    };
    expect(checkPreviewMatchesSource([badResult]).length).toBeGreaterThan(0);
  });
});
