// Regression tests for the astral-code-point UTF-16/code-point offset bug in
// scripts/dogfood/tagging.ts (Stage 10 Pass A, second correction). `RegExp.exec()` always reports
// `.index` and match length in UTF-16 units; a preceding astral (surrogate-pair) code point in
// the same lexical window silently shifted every later token's reported code-point offset by one,
// including making the reported range fail to intersect the very atomic edit it named.
import { describe, expect, it } from "vitest";
import { computeFileDiff } from "../../scripts/dogfood/diff.js";
import { computeRiskTags, type TokenEvidence } from "../../scripts/dogfood/tagging.js";
import { getLocaleData } from "../../src/engine/locale.js";

const enUSLocale = getLocaleData("en-US");

function tagsFor(before: string, after: string) {
  const diff = computeFileDiff("f.mdx", before, after);
  return diff.reviewChanges.map((rc) => {
    const edits = diff.atomicEdits.filter((e) => rc.atomicEditIds.includes(e.id));
    return {
      rc,
      edits,
      tags: computeRiskTags({
        oldText: before,
        newText: after,
        reviewChange: rc,
        atomicEdits: edits,
        attribution: undefined,
        locale: enUSLocale,
      }),
    };
  });
}

/** `tagsFor` always produces at least one review change for the fixtures this file uses --
 * asserted once here so every call site can index `[0]` without `noUncheckedIndexedAccess`
 * forcing an `| undefined` check at each use. */
function firstEntry(before: string, after: string) {
  const entries = tagsFor(before, after);
  const first = entries[0];
  if (!first) throw new Error("expected at least one review change");
  return first;
}

describe("astral code-point offset probe (the exact case from the task)", () => {
  it("1. emoji before a numeric range: reported token ranges match the true code-point positions", () => {
    const before = "😀 See Figure 5-10 now.\n";
    const after = "😀 See Figure 5–10 now.\n";
    const { rc, edits, tags } = firstEntry(before, after);
    expect(edits[0]!.oldOffset).toEqual({
      codePointStart: 14,
      codePointEnd: 15,
      byteStart: 17,
      byteEnd: 18,
    });
    const numeric = tags.find((t) => t.tag === "numeric-range-or-compound-label-candidate")!;
    const figure = tags.find((t) => t.tag === "figure-label-shaped")!;
    const dash = tags.find((t) => t.tag === "dash-restyling")!;
    expect((numeric.evidence as TokenEvidence).tokenOldOffset).toEqual({
      codePointStart: 13,
      codePointEnd: 17,
    });
    expect((figure.evidence as TokenEvidence).tokenOldOffset).toEqual({
      codePointStart: 6,
      codePointEnd: 17,
    });
    expect((dash.evidence as TokenEvidence).tokenOldOffset).toEqual({
      codePointStart: 14,
      codePointEnd: 15,
    });
    // The dash token must actually intersect the atomic edit it names.
    expect((dash.evidence as TokenEvidence).tokenOldOffset.codePointStart).toBeLessThan(
      rc.oldOffset.codePointEnd,
    );
    expect((dash.evidence as TokenEvidence).tokenOldOffset.codePointEnd).toBeGreaterThan(
      rc.oldOffset.codePointStart,
    );
  });

  it("2. emoji sits between the start of the lexical window and the token", () => {
    // Padding keeps the emoji inside the ~80-code-point window radius but not adjacent to the edit.
    const before = "😀 " + "pad ".repeat(5) + "Figure 5-10 done.\n";
    const after = "😀 " + "pad ".repeat(5) + "Figure 5–10 done.\n";
    const { tags } = firstEntry(before, after);
    const numeric = tags.find((t) => t.tag === "numeric-range-or-compound-label-candidate")!;
    const expectedStart =
      [...before].join("").indexOf("5-10") === -1 ? -1 : [...("😀 " + "pad ".repeat(5))].length;
    expect((numeric.evidence as TokenEvidence).tokenOldOffset.codePointStart).toBe(
      expectedStart + "Figure ".length,
    );
  });

  it("3. several astral code points before the token compound correctly", () => {
    const before = "😀😀😀 Figure 5-10 here.\n";
    const after = "😀😀😀 Figure 5–10 here.\n";
    const { tags } = firstEntry(before, after);
    const numeric = tags.find((t) => t.tag === "numeric-range-or-compound-label-candidate")!;
    const prefixCp = [..."😀😀😀 Figure "].length; // 3 emoji (1 code point each) + " Figure "
    expect((numeric.evidence as TokenEvidence).tokenOldOffset.codePointStart).toBe(prefixCp);
  });

  it("4. an astral code point after the token does not distort its own end", () => {
    const before = "Figure 5-10 then 😀 more text.\n";
    const after = "Figure 5–10 then 😀 more text.\n";
    const { tags } = firstEntry(before, after);
    const numeric = tags.find((t) => t.tag === "numeric-range-or-compound-label-candidate")!;
    const expectedEnd = [..."Figure 5-10"].length;
    expect((numeric.evidence as TokenEvidence).tokenOldOffset.codePointEnd).toBe(expectedEnd);
  });

  it("5. MDX boundary token distance is measured correctly across an astral code point", () => {
    const before = '<Component prop="x" /> 😀 then "quotes" right after.\n';
    const after = '<Component prop="x" /> 😀 then “quotes” right after.\n';
    const entry = firstEntry(before, after);
    const boundary = entry.tags.find((t) => t.tag === "mdx-jsx-code-boundary-adjacent");
    expect(boundary).toBeDefined();
    const evidence = boundary!.evidence as { distance: number };
    // Independently recompute expected distance in code points.
    const cps = [...before];
    const editStart = entry.edits[0]!.oldOffset.codePointStart;
    const tagEnd = [..."<Component"].length;
    expect(evidence.distance).toBe(editStart - tagEnd);
    void cps;
  });

  it("6. dash proximity is measured correctly across an astral code point", () => {
    const before = "😀 value 1 - 2 end\n";
    const after = "😀 value 1- 2 end\n"; // one space before the dash removed
    const { rc, tags } = firstEntry(before, after);
    expect(rc.before).toBe(" ");
    const dash = tags.find((t) => t.tag === "dash-restyling");
    expect(dash).toBeDefined();
    const evidence = dash!.evidence as {
      tokenOldOffset: { codePointStart: number; codePointEnd: number };
    };
    const expectedDashOffset = [..."😀 value 1 "].length;
    expect(evidence.tokenOldOffset).toEqual({
      codePointStart: expectedDashOffset,
      codePointEnd: expectedDashOffset + 1,
    });
  });

  it("7. token evidence range independently slices from the original text and equals tokenText exactly", () => {
    const before = "😀😀 Figure 5-10 for details.\n";
    const after = "😀😀 Figure 5–10 for details.\n";
    const { tags } = firstEntry(before, after);
    for (const t of tags) {
      const evidence = t.evidence as {
        tokenText?: string;
        tokenOldOffset?: { codePointStart: number; codePointEnd: number };
      } | null;
      if (!evidence?.tokenOldOffset) continue;
      const slice = [...before]
        .slice(evidence.tokenOldOffset.codePointStart, evidence.tokenOldOffset.codePointEnd)
        .join("");
      expect(slice).toBe(evidence.tokenText);
    }
  });

  it("8. tokenOldOffset for every evidence entry actually intersects its claimed intersectingAtomicEditId", () => {
    const before = "😀 Figure 5-10 details.\n";
    const after = "😀 Figure 5–10 details.\n";
    const { edits, tags } = firstEntry(before, after);
    const byId = new Map(edits.map((e) => [e.id, e] as const));
    for (const t of tags) {
      const evidence = t.evidence as {
        tokenOldOffset?: { codePointStart: number; codePointEnd: number };
        intersectingAtomicEditId?: string;
      } | null;
      if (!evidence?.tokenOldOffset || !evidence.intersectingAtomicEditId) continue;
      const edit = byId.get(evidence.intersectingAtomicEditId);
      expect(edit).toBeDefined();
      const intersects =
        evidence.tokenOldOffset.codePointStart < edit!.oldOffset.codePointEnd &&
        edit!.oldOffset.codePointStart < evidence.tokenOldOffset.codePointEnd;
      expect(intersects).toBe(true);
    }
  });
});
