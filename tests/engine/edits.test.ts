import { describe, it, expect } from "vitest";
import { fromCodePoints, toCodePoints } from "../../src/engine/codepoints";
import { applyEdits, validateEdits } from "../../src/engine/edits";
import { PolytypoError } from "../../src/errors";
import type { Edit, RuleId } from "../../src/types";

function edit(start: number, end: number, replacement: string, ruleId: RuleId = "quotes"): Edit {
  return { start, end, replacement: toCodePoints(replacement), ruleId };
}

function apply(input: string, edits: Edit[]): string {
  return fromCodePoints(applyEdits(toCodePoints(input), edits));
}

function expectContractError(run: () => unknown): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(PolytypoError);
    expect((error as PolytypoError).code).toBe("POLYTYPO_RULE_CONTRACT");
    return;
  }
  throw new Error("expected a POLYTYPO_RULE_CONTRACT error");
}

describe("applyEdits", () => {
  it("returns the input unchanged for an empty edit list", () => {
    expect(apply("abc", [])).toBe("abc");
  });

  it("applies a single replacement", () => {
    expect(apply("a-b", [edit(1, 2, "–")])).toBe("a–b");
  });

  it("applies several replacements", () => {
    expect(apply('say "hi" now', [edit(4, 5, "“"), edit(7, 8, "”")])).toBe("say “hi” now");
  });

  it("inserts without deleting", () => {
    expect(apply("5km", [edit(1, 1, " ")])).toBe("5 km");
  });

  it("deletes without inserting", () => {
    expect(apply("a  b", [edit(1, 3, " ")])).toBe("a b");
    expect(apply("a  b", [edit(2, 3, "")])).toBe("a b");
  });

  it("applies edits at both ends", () => {
    expect(apply("abc", [edit(0, 1, "X"), edit(2, 3, "Z")])).toBe("XbZ");
    expect(apply("abc", [edit(0, 0, "<"), edit(3, 3, ">")])).toBe("<abc>");
    expect(apply("abc", [edit(0, 3, "")])).toBe("");
  });

  it("indexes code points, not UTF-16 units", () => {
    // "a😀b" is 4 UTF-16 units but 3 code points; the edit addresses index 1.
    expect(apply("a\u{1F600}b", [edit(1, 2, "\u{1F601}")])).toBe("a\u{1F601}b");
    expect(apply("a\u{1F600}b", [edit(2, 3, "B")])).toBe("a\u{1F600}B");
  });

  it("works on an empty input", () => {
    expect(apply("", [])).toBe("");
    expect(apply("", [edit(0, 0, "x")])).toBe("x");
  });
});

describe("rule contract enforcement", () => {
  it("rejects descending edits", () => {
    expectContractError(() => apply("abcdef", [edit(3, 4, "X"), edit(1, 2, "Y")]));
  });

  it("rejects overlapping edits", () => {
    expectContractError(() => apply("abcdef", [edit(1, 4, "X"), edit(3, 5, "Y")]));
  });

  it("rejects two edits touching the same insertion point", () => {
    expectContractError(() => apply("abcdef", [edit(2, 4, "X"), edit(3, 3, "Y")]));
  });

  it("rejects out-of-bounds edits", () => {
    expectContractError(() => apply("abc", [edit(0, 4, "X")]));
    expectContractError(() => apply("abc", [edit(-1, 1, "X")]));
    expectContractError(() => apply("abc", [edit(5, 5, "X")]));
  });

  it("rejects an edit whose end precedes its start", () => {
    expectContractError(() => apply("abc", [edit(2, 1, "X")]));
  });

  it("rejects non-integer bounds", () => {
    expectContractError(() => apply("abc", [edit(0.5, 1, "X")]));
  });

  it("rejects invalid code points in a replacement", () => {
    expectContractError(() =>
      applyEdits(toCodePoints("abc"), [
        { start: 0, end: 1, replacement: [0x110000], ruleId: "quotes" },
      ]),
    );
    expectContractError(() =>
      applyEdits(toCodePoints("abc"), [{ start: 0, end: 1, replacement: [-1], ruleId: "quotes" }]),
    );
  });

  it("rejects an edit tagged with a different rule than the one that produced it", () => {
    expectContractError(() =>
      applyEdits(toCodePoints("abc"), [edit(0, 1, "X", "quotes")], "dashes"),
    );
  });

  it("accepts adjacent, non-overlapping edits", () => {
    expect(() => validateEdits([edit(0, 2, "X"), edit(2, 4, "Y")], 4)).not.toThrow();
    expect(apply("abcd", [edit(0, 2, "X"), edit(2, 4, "Y")])).toBe("XY");
  });
});
