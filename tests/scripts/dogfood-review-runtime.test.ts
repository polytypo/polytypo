// Regression tests for scripts/dogfood/review-runtime.js -- the pure, DOM-free decision-state
// logic REVIEW.html embeds a byte-identical copy of (see scripts/dogfood/review-html.ts). Tested
// here directly, without any browser harness, per Stage 10 Pass A's instruction not to add a
// browser-test dependency when clean DOM-free functions are enough.
import { describe, expect, it } from "vitest";
import {
  computeCounts,
  createDefaultState,
  DECISIONS,
  isFullyAccepted,
  isValidDecision,
  mergeImportedState,
  serializeExportPayload,
  storageKey,
  validateImportPayload,
} from "../../scripts/dogfood/review-runtime.js";

const IDS = ["a#r1", "a#r2", "a#r3"];
const HASH = "deadbeef".repeat(8);

describe("storageKey", () => {
  it("namespaces by evidenceReviewHash", () => {
    expect(storageKey(HASH)).toContain(HASH);
    expect(storageKey(HASH)).not.toBe(storageKey("other-hash"));
  });
});

describe("createDefaultState / computeCounts / isFullyAccepted", () => {
  it("9. default decisions are all UNREVIEWED", () => {
    const { decisions, notes } = createDefaultState(IDS);
    for (const id of IDS) {
      expect(decisions[id]).toBe("UNREVIEWED");
      expect(notes[id]).toBe("");
    }
    expect(computeCounts(IDS, decisions)).toEqual({
      total: 3,
      UNREVIEWED: 3,
      ACCEPT: 0,
      REJECT: 0,
      "NEEDS-DISCUSSION": 0,
    });
    expect(isFullyAccepted(IDS, decisions)).toBe(false);
  });

  it("is fully accepted only when every id is ACCEPT, never merely non-UNREVIEWED", () => {
    const decisions = { "a#r1": "ACCEPT", "a#r2": "ACCEPT", "a#r3": "NEEDS-DISCUSSION" };
    expect(isFullyAccepted(IDS, decisions)).toBe(false);
    decisions["a#r3"] = "ACCEPT";
    expect(isFullyAccepted(IDS, decisions)).toBe(true);
  });
});

describe("serializeExportPayload: deterministic export", () => {
  it("10. two exports of identical decisions are byte-identical (no timestamp in the payload)", () => {
    const decisions = { "a#r1": "ACCEPT", "a#r2": "REJECT", "a#r3": "UNREVIEWED" };
    const notes = { "a#r1": "looks fine", "a#r2": "", "a#r3": "" };
    const first = JSON.stringify(serializeExportPayload(HASH, IDS, decisions, notes));
    const second = JSON.stringify(serializeExportPayload(HASH, IDS, decisions, notes));
    expect(first).toBe(second);
  });

  it("export includes counts and every id including UNREVIEWED ones", () => {
    const decisions = { "a#r1": "ACCEPT" };
    const notes = {};
    const payload = serializeExportPayload(HASH, IDS, decisions, notes);
    expect(payload.decisions.map((d) => d.id)).toEqual(IDS);
    expect(payload.decisions.find((d) => d.id === "a#r2")!.decision).toBe("UNREVIEWED");
    expect(payload.counts).toEqual({
      total: 3,
      UNREVIEWED: 2,
      ACCEPT: 1,
      REJECT: 0,
      "NEEDS-DISCUSSION": 0,
    });
  });

  it("export id order matches the canonical order given, regardless of decisions object key order", () => {
    const decisions = { "a#r3": "ACCEPT", "a#r1": "REJECT" };
    const payload = serializeExportPayload(HASH, IDS, decisions, {});
    expect(payload.decisions.map((d) => d.id)).toEqual(IDS);
  });
});

describe("validateImportPayload: fail-closed import", () => {
  it("round trip: export then import reproduces the same decisions/notes", () => {
    const decisions = { "a#r1": "ACCEPT", "a#r2": "REJECT", "a#r3": "NEEDS-DISCUSSION" };
    const notes = { "a#r1": "fine", "a#r2": "bad", "a#r3": "" };
    const exported = serializeExportPayload(HASH, IDS, decisions, notes);
    const result = validateImportPayload(exported, HASH, IDS);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.decisions).toEqual(decisions);
    expect(result.notes).toEqual(notes);
  });

  it("11. an import with the wrong evidenceReviewHash is rejected", () => {
    const exported = serializeExportPayload("some-other-hash", IDS, {}, {});
    const result = validateImportPayload(exported, HASH, IDS);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toMatch(/evidenceReviewHash/);
  });

  it("12. an import missing ids fails closed by default (no allowPartial)", () => {
    const exported = serializeExportPayload(HASH, ["a#r1"], { "a#r1": "ACCEPT" }, {});
    const result = validateImportPayload(exported, HASH, IDS);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toMatch(/missing decision/);
  });

  it("a partial import succeeds only when allowPartial is explicitly true", () => {
    const exported = {
      schemaVersion: 1,
      evidenceReviewHash: HASH,
      counts: {},
      decisions: [{ id: "a#r1", decision: "ACCEPT", note: "" }],
    };
    const result = validateImportPayload(exported, HASH, IDS, { allowPartial: true });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.importedCount).toBe(1);
    expect(result.totalCount).toBe(3);
  });

  it("13. duplicate ids inside the import are rejected", () => {
    const exported = {
      schemaVersion: 1,
      evidenceReviewHash: HASH,
      counts: {},
      decisions: [
        { id: "a#r1", decision: "ACCEPT", note: "" },
        { id: "a#r1", decision: "REJECT", note: "" },
      ],
    };
    const result = validateImportPayload(exported, HASH, IDS, { allowPartial: true });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toMatch(/duplicate/);
  });

  it("an unknown decision enum value is rejected", () => {
    const exported = {
      schemaVersion: 1,
      evidenceReviewHash: HASH,
      counts: {},
      decisions: [{ id: "a#r1", decision: "MAYBE", note: "" }],
    };
    const result = validateImportPayload(exported, HASH, IDS, { allowPartial: true });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toMatch(/invalid decision/);
  });

  it("an id the bundle never produced is rejected even under allowPartial", () => {
    const exported = {
      schemaVersion: 1,
      evidenceReviewHash: HASH,
      counts: {},
      decisions: [{ id: "not-a-real-id", decision: "ACCEPT", note: "" }],
    };
    const result = validateImportPayload(exported, HASH, IDS, { allowPartial: true });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toMatch(/does not exist/);
  });

  it("malformed JSON shape (not an object, decisions not an array) is rejected, never throws", () => {
    expect(validateImportPayload(null, HASH, IDS).ok).toBe(false);
    expect(validateImportPayload("just a string", HASH, IDS).ok).toBe(false);
    expect(
      validateImportPayload(
        { schemaVersion: 1, evidenceReviewHash: HASH, decisions: "not-an-array" },
        HASH,
        IDS,
      ).ok,
    ).toBe(false);
  });

  it("wrong schemaVersion is rejected", () => {
    const exported = { schemaVersion: 999, evidenceReviewHash: HASH, counts: {}, decisions: [] };
    const result = validateImportPayload(exported, HASH, IDS, { allowPartial: true });
    expect(result.ok).toBe(false);
  });
});

describe("mergeImportedState", () => {
  it("overwrites only imported ids, leaves the rest untouched, never mutates inputs", () => {
    const existingDecisions = { "a#r1": "UNREVIEWED", "a#r2": "UNREVIEWED", "a#r3": "UNREVIEWED" };
    const existingNotes = { "a#r1": "", "a#r2": "", "a#r3": "" };
    const imported = { decisions: { "a#r2": "ACCEPT" }, notes: { "a#r2": "looks good" } };
    const merged = mergeImportedState(existingDecisions, existingNotes, imported);
    expect(merged.decisions).toEqual({
      "a#r1": "UNREVIEWED",
      "a#r2": "ACCEPT",
      "a#r3": "UNREVIEWED",
    });
    expect(existingDecisions["a#r2"]).toBe("UNREVIEWED"); // original untouched
  });
});

describe("DECISIONS / isValidDecision", () => {
  it("the enum is exactly the four documented decisions", () => {
    expect(DECISIONS.slice().sort()).toEqual(
      ["ACCEPT", "NEEDS-DISCUSSION", "REJECT", "UNREVIEWED"].sort(),
    );
    expect(isValidDecision("ACCEPT")).toBe(true);
    expect(isValidDecision("MAYBE")).toBe(false);
  });
});
