// Pure, DOM-free decision-state logic for the REVIEW.html local reviewer -- shared, byte-identical
// source between (a) tests/scripts/dogfood-review-runtime.test.ts, which imports this file
// directly, and (b) REVIEW.html, which gets a build-time copy of this exact file inlined as a
// plain classic (non-module) inline script element (see scripts/dogfood/review-html.ts's
// `inlineReviewRuntime`, which strips the `export ` keywords so the same source runs unmodified
// under `file://` with no module loader or bundler). Nothing in this file touches `document`,
// `window`, `localStorage`, or any other browser global -- all of that lives in REVIEW.html's own
// inline behaviour script, which calls into these functions.
//
// Deliberately plain JavaScript, not TypeScript: it must run unmodified in a browser opened
// directly from disk, with no build step between "this file" and "what the browser executes".

export const DECISIONS = ["UNREVIEWED", "ACCEPT", "REJECT", "NEEDS-DISCUSSION"];

export const EXPORT_SCHEMA_VERSION = 1;

export const STORAGE_KEY_PREFIX = "polytypo-m4-review-decisions:";

/** The localStorage key this evidence bundle's decisions live under -- namespaced by
 * `evidenceReviewHash` so decisions from one bundle (one code+corpus+locale/mode/dialect
 * snapshot) never leak into review of a different one, even in the same browser profile. */
export function storageKey(evidenceReviewHash) {
  return `${STORAGE_KEY_PREFIX}${evidenceReviewHash}`;
}

export function isValidDecision(value) {
  return DECISIONS.indexOf(value) !== -1;
}

/** `ids` in their canonical (changes.json) order -> `{ [id]: "UNREVIEWED" }` decisions and
 * `{ [id]: "" }` notes -- the starting state before any review has happened. */
export function createDefaultState(ids) {
  const decisions = {};
  const notes = {};
  for (const id of ids) {
    decisions[id] = "UNREVIEWED";
    notes[id] = "";
  }
  return { decisions, notes };
}

export function computeCounts(ids, decisions) {
  const counts = { total: ids.length, UNREVIEWED: 0, ACCEPT: 0, REJECT: 0, "NEEDS-DISCUSSION": 0 };
  for (const id of ids) {
    const d = decisions[id];
    if (isValidDecision(d)) counts[d] += 1;
    else counts.UNREVIEWED += 1;
  }
  return counts;
}

/** `true` iff every id has a non-UNREVIEWED, non-REJECT, non-NEEDS-DISCUSSION decision -- the
 * completion criterion the UI must honestly report (never "M4 passed", only "every row has an
 * ACCEPT decision recorded here" -- the human review decision itself, not a tool verdict). */
export function isFullyAccepted(ids, decisions) {
  for (const id of ids) {
    if (decisions[id] !== "ACCEPT") return false;
  }
  return true;
}

/** Deterministic export payload: stable id order (the same order `ids` is given in, which callers
 * pass as the canonical changes.json order), no timestamp inside the compared payload (a
 * `generatedAtUnknown` marker documents that intentionally, rather than embedding a real clock
 * reading that would make two exports of identical decisions differ byte-for-byte). */
export function serializeExportPayload(evidenceReviewHash, ids, decisions, notes) {
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    evidenceReviewHash,
    counts: computeCounts(ids, decisions),
    decisions: ids.map((id) => ({
      id,
      decision: isValidDecision(decisions[id]) ? decisions[id] : "UNREVIEWED",
      note: notes[id] || "",
    })),
  };
}

/**
 * Fail-closed import validation. Returns `{ ok: true, decisions, notes }` on success or
 * `{ ok: false, reason }` on any problem -- never throws, never partially applies a bad import.
 *
 * Checks, in order: is it an object with the right schema version; does `evidenceReviewHash`
 * match this bundle's own hash; is `decisions` an array of `{id, decision, note?}`; are ids
 * unique within the import; is every `decision` a valid enum value; does the imported id set
 * exactly equal `expectedIds` (unless `opts.allowPartial` is explicitly `true`, in which case a
 * subset is accepted but every imported id must still exist in `expectedIds` -- an id
 * changes.json never produced is always rejected, partial or not).
 */
export function validateImportPayload(raw, expectedEvidenceReviewHash, expectedIds, opts) {
  const allowPartial = !!(opts && opts.allowPartial);
  if (!raw || typeof raw !== "object") return { ok: false, reason: "not a JSON object" };
  if (raw.schemaVersion !== EXPORT_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: `unsupported schemaVersion (expected ${EXPORT_SCHEMA_VERSION}, got ${JSON.stringify(raw.schemaVersion)})`,
    };
  }
  if (raw.evidenceReviewHash !== expectedEvidenceReviewHash) {
    return {
      ok: false,
      reason:
        "evidenceReviewHash does not match this bundle -- this decisions file was exported from a different review (different code, corpus, locale/mode/dialect, or edited evidence)",
    };
  }
  if (!Array.isArray(raw.decisions)) return { ok: false, reason: '"decisions" is not an array' };

  const expected = new Set(expectedIds);
  const seen = new Set();
  const decisions = {};
  const notes = {};
  for (const row of raw.decisions) {
    if (!row || typeof row !== "object" || typeof row.id !== "string") {
      return { ok: false, reason: 'a decisions[] row is missing a string "id"' };
    }
    if (seen.has(row.id)) return { ok: false, reason: `duplicate id "${row.id}" in decisions[]` };
    seen.add(row.id);
    if (!expected.has(row.id))
      return { ok: false, reason: `id "${row.id}" does not exist in this bundle's review changes` };
    if (!isValidDecision(row.decision))
      return {
        ok: false,
        reason: `id "${row.id}" has an invalid decision ${JSON.stringify(row.decision)}`,
      };
    decisions[row.id] = row.decision;
    notes[row.id] = typeof row.note === "string" ? row.note : "";
  }

  if (!allowPartial) {
    for (const id of expectedIds) {
      if (!seen.has(id))
        return {
          ok: false,
          reason: `missing decision for id "${id}" -- import is partial; pass allowPartial to accept a partial import explicitly`,
        };
    }
  }

  return { ok: true, decisions, notes, importedCount: seen.size, totalCount: expectedIds.length };
}

/** Merges a successfully-validated partial/full import onto existing state -- imported ids
 * overwrite, everything else is left untouched. Pure: returns new objects, never mutates its
 * arguments. */
export function mergeImportedState(existingDecisions, existingNotes, imported) {
  const decisions = Object.assign({}, existingDecisions, imported.decisions);
  const notes = Object.assign({}, existingNotes, imported.notes);
  return { decisions, notes };
}
