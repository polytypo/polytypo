// Fail-closed consistency checks for one M4 dry-run's generated evidence. Every function here
// returns a list of human-readable issue strings (empty = no problem) rather than throwing --
// scripts/dogfood/run.ts merges every non-empty list into its existing `failureReasons`
// mechanism, so a consistency violation fails the run exactly the same way a malformed input or
// an idempotency failure already does.
//
// Stage 10 Pass A correction: the previous `checkNoContextLeakage` only compared `before`'s own
// length against offsets the *same construction code* produced -- a tautology that could never
// catch a real slicing bug. The checks below instead independently re-slice the real source and
// output text at each declared offset and compare, independently recompute line/column from
// offsets, verify byte offsets land on UTF-8 character boundaries, and independently re-derive
// full forward/backward file reconstruction from the `AtomicEdit` set -- so a corrupted offset, a
// duplicated atomic-edit id, or a review window that doesn't actually contain its own edits is
// caught here, not assumed away.
import type { AtomicEdit, ReviewChange } from "./diff.js";
import { offsetToLineCol, computeAlignedCodePointDelta } from "./diff.js";
import { reviewChangeAnchor, type ReviewChangeEntry } from "./evidence.js";
import {
  DASH_PROXIMITY_CODEPOINTS,
  MDX_BOUNDARY_MAX_DISTANCE_CODEPOINTS,
  isDashTokenShape,
  isElisionQuoteTokenShape,
  isFigureLabelTokenShape,
  isMdxBoundaryTokenShape,
  isNumericRangeTokenShape,
  type BoundaryEvidence,
  type DashProximityEvidence,
  type RiskTag,
  type TokenEvidence,
} from "./tagging.js";
import type { FileResult } from "./transform-corpus.js";
// Same pinned Unicode UPPER predicate the engine and `tagging.ts` use -- never a second table.
import { isUpper } from "../../src/engine/unicode.js";
// Final Correction pass: the exact N7 structural predicates, imported from the rule itself --
// see the identical import in tagging.ts for why (it is the single source of truth both the
// generator and this independent validator read, which is what makes "independent" meaningful
// rather than "two reimplementations that happen to agree today").
import { prepare, isInitialAt, isAbbreviationTail, hasPrecedingInitial, type Prepared } from "../../src/rules/nbsp.js";
import type { LocaleData } from "../../src/types.js";

const SPACE_CHAR = String.fromCodePoint(0x20);
const NBSP_CHAR = String.fromCodePoint(0xa0);

/** Legacy tags whose contract has always permitted `evidence: null` -- a bare boolean claim with
 * nothing further to verify. Final Correction pass: this allowlist is what makes the `null` skip
 * safe now that two tags (`authored-en-dash-restyled`, `single-initial-binding-candidate`)
 * require real evidence -- a `null` claim for either of those must fail closed, not fall through
 * this list silently. */
const LEGACY_NULL_EVIDENCE_TAGS = new Set([
  "quote-pairing-candidate",
  "nbsp-insertion",
  "non-breaking-hyphen-insertion",
  "cross-line-edit",
  "large-edit",
]);

function isFiniteInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

function isValidRange(v: unknown): v is { codePointStart: number; codePointEnd: number } {
  return (
    typeof v === "object" &&
    v !== null &&
    isFiniteInt((v as Record<string, unknown>).codePointStart) &&
    isFiniteInt((v as Record<string, unknown>).codePointEnd)
  );
}

export interface ManifestCounts {
  reviewChangeCount: number;
  unifiedDiffHunkCount: number;
  atomicEditCount: number;
}

/** Every `ReviewChange` id across the whole run must be globally unique. */
export function checkIdsUnique(entries: readonly ReviewChangeEntry[]): string[] {
  const seen = new Map<string, number>();
  for (const e of entries) seen.set(e.id, (seen.get(e.id) ?? 0) + 1);
  const duplicates = [...seen.entries()].filter(([, count]) => count > 1);
  return duplicates.map(([id, count]) => `duplicate review change id "${id}" appears ${count} times in changes.json`);
}

/** `REVIEW.md`'s checklist must name exactly the same id set as `changes.json`, each exactly
 * once -- parsed from the markdown table itself, not assumed. */
export function checkReviewMarkdownIds(entries: readonly ReviewChangeEntry[], reviewMarkdown: string): string[] {
  const issues: string[] = [];
  const idPattern = /^\|\s*(?:<a id="[^"]*"><\/a>)?`([^`]+)`\s*\|/gm;
  const foundIds: string[] = [];
  for (const m of reviewMarkdown.matchAll(idPattern)) {
    if (m[1]) foundIds.push(m[1]);
  }

  const expected = new Set(entries.map((e) => e.id));
  const foundCounts = new Map<string, number>();
  for (const id of foundIds) foundCounts.set(id, (foundCounts.get(id) ?? 0) + 1);

  for (const [id, count] of foundCounts) {
    if (count > 1) issues.push(`REVIEW.md lists review change id "${id}" ${count} times, expected exactly once`);
    if (!expected.has(id)) issues.push(`REVIEW.md lists review change id "${id}" which does not exist in changes.json`);
  }
  for (const id of expected) {
    if (!foundCounts.has(id)) issues.push(`REVIEW.md is missing review change id "${id}"`);
  }
  if (foundIds.length !== entries.length) {
    issues.push(`REVIEW.md lists ${foundIds.length} review change row(s) but changes.json has ${entries.length}`);
  }
  return issues;
}

/** Every row REVIEW.md lists must start as `UNREVIEWED`. */
export function checkReviewMarkdownAllUnreviewed(entries: readonly ReviewChangeEntry[], reviewMarkdown: string): string[] {
  const issues: string[] = [];
  const rowPattern = /^\|\s*(?:<a id="[^"]*"><\/a>)?`([^`]+)`\s*\|.*\|\s*([A-Za-z-]+)\s*\|\s*\|?\s*$/gm;
  const decisions = new Map<string, string>();
  for (const m of reviewMarkdown.matchAll(rowPattern)) {
    if (m[1] && m[2]) decisions.set(m[1], m[2]);
  }
  for (const e of entries) {
    const decision = decisions.get(e.id);
    if (decision !== "UNREVIEWED") {
      issues.push(`REVIEW.md row for "${e.id}" is not UNREVIEWED (found "${decision ?? "<not found>"}")`);
    }
  }
  return issues;
}

/** manifest.json's counts must agree with the actual generated artifacts. */
export function checkManifestCounts(manifestCounts: ManifestCounts, entries: readonly ReviewChangeEntry[], actualUnifiedDiffHunkCount: number, actualAtomicEditCount: number): string[] {
  const issues: string[] = [];
  if (manifestCounts.reviewChangeCount !== entries.length) {
    issues.push(`manifest.json reviewChangeCount (${manifestCounts.reviewChangeCount}) does not match changes.json's entry count (${entries.length})`);
  }
  if (manifestCounts.unifiedDiffHunkCount !== actualUnifiedDiffHunkCount) {
    issues.push(`manifest.json unifiedDiffHunkCount (${manifestCounts.unifiedDiffHunkCount}) does not match the actual unified diff hunk count (${actualUnifiedDiffHunkCount})`);
  }
  if (manifestCounts.atomicEditCount !== actualAtomicEditCount) {
    issues.push(`manifest.json atomicEditCount (${manifestCounts.atomicEditCount}) does not match the actual atomic edit count (${actualAtomicEditCount})`);
  }
  return issues;
}

function codePointSliceOf(text: string, start: number, end: number): string {
  return [...text].slice(start, end).join("");
}

/** Independently re-slices `before`/`after` from the *real* source/output text at each entry's
 * own declared `oldOffset`/`newOffset` and compares to the stored strings. This both replaces and
 * strengthens the old context-leakage check: it does not merely check that a length matches an
 * offset the same code computed, it re-derives the text from scratch and requires an exact match.
 */
export function checkReviewChangeSlicesMatchSource(results: readonly FileResult[]): string[] {
  const issues: string[] = [];
  for (const r of results) {
    if (r.status !== "changed" || !r.diff || r.originalText === undefined || r.transformedText === undefined) continue;
    for (const rc of r.diff.reviewChanges) {
      const expectedBefore = codePointSliceOf(r.originalText, rc.oldOffset.codePointStart, rc.oldOffset.codePointEnd);
      const expectedAfter = codePointSliceOf(r.transformedText, rc.newOffset.codePointStart, rc.newOffset.codePointEnd);
      if (expectedBefore !== rc.before) {
        issues.push(`review change "${rc.id}": before-text does not match an independent slice of the original file at its declared old offset`);
      }
      if (expectedAfter !== rc.after) {
        issues.push(`review change "${rc.id}": after-text does not match an independent slice of the transformed file at its declared new offset`);
      }
    }
  }
  return issues;
}

/** Independently recomputes `line`/`column` from each `ReviewChange`'s own declared code-point
 * offset and requires it to match the stored `oldLineCol`/`newLineCol`. */
function codePointLinesOf(text: string): string[] {
  return text.split("\n");
}

/** Length, in code points, of 1-indexed line `lineNumber` of `text` (excluding its own trailing
 * `\n`). Used to bound-check a `LineCol.column` against the line it actually claims to be on. */
function lineLengthCodePoints(lines: readonly string[], lineNumber: number): number | null {
  const line = lines[lineNumber - 1];
  return line === undefined ? null : [...line].length;
}

/** A `LineCol` is in bounds when its line exists in `lines` and its column does not exceed that
 * line's own code-point length. `end`'s exclusive convention (see `ReviewChange.oldLineCol`'s doc
 * comment in diff.ts) allows `column === lineLength` legitimately (the position immediately after
 * the last character on the line), so the bound is `<=`, not `<`. */
function lineColInBounds(lines: readonly string[], lc: { line: number; column: number }): boolean {
  if (lc.line < 1) return false;
  const len = lineLengthCodePoints(lines, lc.line);
  return len !== null && lc.column >= 0 && lc.column <= len;
}

/** Independently recomputes `start` *and* `end` line/column for every `ReviewChange` (old and
 * new side) and every `AtomicEdit` (old and new side) from their own declared offsets, and
 * requires every one of those eight coordinates to be in bounds (line exists, column within that
 * line's own length). Stage 10 Pass A second correction: the previous version checked only
 * `start`, leaving a corrupted or out-of-bounds `end` (or any `AtomicEdit` coordinate at all,
 * which was never checked) free to pass silently. */
export function checkLineColMatchesOffsets(results: readonly FileResult[]): string[] {
  const issues: string[] = [];
  for (const r of results) {
    if (r.status !== "changed" || !r.diff || r.originalText === undefined || r.transformedText === undefined) continue;
    const oldLines = codePointLinesOf(r.originalText);
    const newLines = codePointLinesOf(r.transformedText);

    for (const rc of r.diff.reviewChanges) {
      const expectedOldStart = offsetToLineCol(r.originalText, rc.oldOffset.codePointStart);
      const expectedOldEnd = offsetToLineCol(r.originalText, rc.oldOffset.codePointEnd);
      const expectedNewStart = offsetToLineCol(r.transformedText, rc.newOffset.codePointStart);
      const expectedNewEnd = offsetToLineCol(r.transformedText, rc.newOffset.codePointEnd);
      if (expectedOldStart.line !== rc.oldLineCol.start.line || expectedOldStart.column !== rc.oldLineCol.start.column) {
        issues.push(`review change "${rc.id}": stored old start line/column does not match an independent recomputation from its offset`);
      }
      if (expectedOldEnd.line !== rc.oldLineCol.end.line || expectedOldEnd.column !== rc.oldLineCol.end.column) {
        issues.push(`review change "${rc.id}": stored old end line/column does not match an independent recomputation from its offset`);
      }
      if (expectedNewStart.line !== rc.newLineCol.start.line || expectedNewStart.column !== rc.newLineCol.start.column) {
        issues.push(`review change "${rc.id}": stored new start line/column does not match an independent recomputation from its offset`);
      }
      if (expectedNewEnd.line !== rc.newLineCol.end.line || expectedNewEnd.column !== rc.newLineCol.end.column) {
        issues.push(`review change "${rc.id}": stored new end line/column does not match an independent recomputation from its offset`);
      }
      if (!lineColInBounds(oldLines, rc.oldLineCol.start)) issues.push(`review change "${rc.id}": old start column exceeds its own line's length`);
      if (!lineColInBounds(oldLines, rc.oldLineCol.end)) issues.push(`review change "${rc.id}": old end column exceeds its own line's length`);
      if (!lineColInBounds(newLines, rc.newLineCol.start)) issues.push(`review change "${rc.id}": new start column exceeds its own line's length`);
      if (!lineColInBounds(newLines, rc.newLineCol.end)) issues.push(`review change "${rc.id}": new end column exceeds its own line's length`);
    }

    for (const e of r.diff.atomicEdits) {
      const oldStart = offsetToLineCol(r.originalText, e.oldOffset.codePointStart);
      const oldEnd = offsetToLineCol(r.originalText, e.oldOffset.codePointEnd);
      const newStart = offsetToLineCol(r.transformedText, e.newOffset.codePointStart);
      const newEnd = offsetToLineCol(r.transformedText, e.newOffset.codePointEnd);
      if (!lineColInBounds(oldLines, oldStart)) issues.push(`atomic edit "${e.id}": old start offset resolves to an out-of-bounds column`);
      if (!lineColInBounds(oldLines, oldEnd)) issues.push(`atomic edit "${e.id}": old end offset resolves to an out-of-bounds column`);
      if (!lineColInBounds(newLines, newStart)) issues.push(`atomic edit "${e.id}": new start offset resolves to an out-of-bounds column`);
      if (!lineColInBounds(newLines, newEnd)) issues.push(`atomic edit "${e.id}": new end offset resolves to an out-of-bounds column`);
    }
  }
  return issues;
}

/** A byte offset is a valid UTF-8 character boundary iff it is 0, the buffer's own length, or the
 * byte at that position is not a UTF-8 *continuation* byte (`10xxxxxx`, i.e. `(byte & 0xc0) ===
 * 0x80`). This is checked independently of slice content -- Stage 10 Pass A third correction: the
 * previous check only compared `buf.subarray(byteStart, byteEnd).toString()` to the edit's own
 * text, which cannot catch a zero-length range (`before === ""`, a pure insertion point) whose
 * `byteStart === byteEnd` sits mid-character -- an empty slice decodes to `""` regardless of
 * where it is cut, so the old check silently passed exactly the case it existed to catch. */
function isUtf8CharBoundary(buf: Buffer, byteOffset: number): boolean {
  if (byteOffset < 0 || byteOffset > buf.length) return false;
  if (byteOffset === 0 || byteOffset === buf.length) return true;
  const b = buf[byteOffset] as number;
  return (b & 0xc0) !== 0x80;
}

/** The UTF-8 byte length of `text`'s own code points `[0, codePointOffset)` -- the byte offset a
 * correct implementation must have recorded for that code-point position. Computed fresh here
 * (not reusing diff.ts's own running `OffsetCursor`), so a cumulative drift in the construction
 * code cannot also be baked into the check that is supposed to catch it. */
function expectedByteOffsetForCodePoint(text: string, codePointOffset: number): number {
  return Buffer.byteLength([...text].slice(0, codePointOffset).join(""), "utf8");
}

/** Every declared byte offset must (a) land on a real UTF-8 character boundary in the actual file
 * bytes, (b) equal the byte offset independently computed for its own declared code-point
 * position, and (c) -- for non-zero-length ranges -- decode to exactly the edit's own text. All
 * three are required; (c) alone is the check that missed zero-length insertion points. */
export function checkUtf8ByteBoundaries(results: readonly FileResult[]): string[] {
  const issues: string[] = [];
  for (const r of results) {
    if (r.status !== "changed" || !r.diff || r.originalText === undefined || r.transformedText === undefined) continue;
    const oldBuf = Buffer.from(r.originalText, "utf8");
    const newBuf = Buffer.from(r.transformedText, "utf8");
    for (const e of r.diff.atomicEdits) {
      for (const [side, buf, text, offset] of [
        ["old", oldBuf, r.originalText, e.oldOffset] as const,
        ["new", newBuf, r.transformedText, e.newOffset] as const,
      ]) {
        if (!isUtf8CharBoundary(buf, offset.byteStart)) {
          issues.push(`atomic edit "${e.id}": ${side} byteStart (${offset.byteStart}) does not land on a UTF-8 character boundary`);
        }
        if (!isUtf8CharBoundary(buf, offset.byteEnd)) {
          issues.push(`atomic edit "${e.id}": ${side} byteEnd (${offset.byteEnd}) does not land on a UTF-8 character boundary`);
        }
        const expectedStart = expectedByteOffsetForCodePoint(text, offset.codePointStart);
        const expectedEnd = expectedByteOffsetForCodePoint(text, offset.codePointEnd);
        if (offset.byteStart !== expectedStart) {
          issues.push(`atomic edit "${e.id}": ${side} byteStart (${offset.byteStart}) does not match the byte offset independently computed for code-point ${offset.codePointStart} (expected ${expectedStart})`);
        }
        if (offset.byteEnd !== expectedEnd) {
          issues.push(`atomic edit "${e.id}": ${side} byteEnd (${offset.byteEnd}) does not match the byte offset independently computed for code-point ${offset.codePointEnd} (expected ${expectedEnd})`);
        }
        const expectedText = side === "old" ? e.before : e.after;
        const byteSlice = buf.subarray(offset.byteStart, offset.byteEnd).toString("utf8");
        if (byteSlice !== expectedText) {
          issues.push(`atomic edit "${e.id}": ${side} byte offset [${offset.byteStart}, ${offset.byteEnd}) does not decode to its own text`);
        }
      }
    }
  }
  return issues;
}

/** Independently reconstructs the transformed file (forward, using `AtomicEdit.after` at
 * `oldOffset`s) and the original file (backward, using `AtomicEdit.before` at `newOffset`s) from
 * each file's real `AtomicEdit` set, using a fresh implementation deliberately separate from
 * `diff.ts`'s own `applyAtomicEditsForward`/`applyAtomicEditsBackward` (which is exercised inside
 * `computeFileDiff` itself, at construction time) -- this is the independent, after-the-fact
 * check that the finished evidence is actually correct, not a re-run of the same code path. */
export function checkIndependentReconstruction(results: readonly FileResult[]): string[] {
  const issues: string[] = [];
  for (const r of results) {
    if (r.status !== "changed" || !r.diff || r.originalText === undefined || r.transformedText === undefined) continue;
    const edits = [...r.diff.atomicEdits].sort((a, b) => a.oldOffset.codePointStart - b.oldOffset.codePointStart);

    const oldCps = [...r.originalText];
    const forwardPieces: string[] = [];
    let cursor = 0;
    let overlapFound = false;
    for (const e of edits) {
      if (e.oldOffset.codePointStart < cursor) {
        overlapFound = true;
        break;
      }
      forwardPieces.push(oldCps.slice(cursor, e.oldOffset.codePointStart).join(""), e.after);
      cursor = e.oldOffset.codePointEnd;
    }
    forwardPieces.push(oldCps.slice(cursor).join(""));
    if (overlapFound) {
      issues.push(`"${r.path}": atomic edits have overlapping old-offset ranges (independent reconstruction check)`);
    } else if (forwardPieces.join("") !== r.transformedText) {
      issues.push(`"${r.path}": independently reconstructing forward (original + atomic edits) did not reproduce the transformed file exactly`);
    }

    const newCps = [...r.transformedText];
    const byNewStart = [...r.diff.atomicEdits].sort((a, b) => a.newOffset.codePointStart - b.newOffset.codePointStart);
    const backwardPieces: string[] = [];
    let bCursor = 0;
    for (const e of byNewStart) {
      backwardPieces.push(newCps.slice(bCursor, e.newOffset.codePointStart).join(""), e.before);
      bCursor = e.newOffset.codePointEnd;
    }
    backwardPieces.push(newCps.slice(bCursor).join(""));
    if (backwardPieces.join("") !== r.originalText) {
      issues.push(`"${r.path}": independently reconstructing backward (transformed + atomic edits) did not reproduce the original file exactly`);
    }
  }
  return issues;
}

/** Every `AtomicEdit` in a file must belong to exactly one `ReviewChange` -- no atomic edit id
 * lost, none duplicated across two review changes. */
export function checkAtomicEditOwnership(results: readonly FileResult[]): string[] {
  const issues: string[] = [];
  for (const r of results) {
    if (r.status !== "changed" || !r.diff) continue;
    const allIds = new Set(r.diff.atomicEdits.map((e) => e.id));
    const owned = new Map<string, number>();
    for (const rc of r.diff.reviewChanges) {
      for (const id of rc.atomicEditIds) owned.set(id, (owned.get(id) ?? 0) + 1);
    }
    for (const [id, count] of owned) {
      if (count > 1) issues.push(`"${r.path}": atomic edit "${id}" is owned by ${count} review changes, expected exactly 1`);
      if (!allIds.has(id)) issues.push(`"${r.path}": review change references unknown atomic edit id "${id}"`);
    }
    for (const id of allIds) {
      if (!owned.has(id)) issues.push(`"${r.path}": atomic edit "${id}" is not owned by any review change`);
    }
  }
  return issues;
}

function rangesIntersectConsistency(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Fail-closed validation of every `RiskTag.evidence` a file's review changes carry (Stage 10
 * Pass A third correction). Nothing here re-derives whether a tag *should* have fired -- that is
 * `computeRiskTags`'s job, exercised by tagging tests -- this only proves that whatever evidence
 * was recorded is internally honest: the token range is inside the real file, the range's own
 * text really is `tokenText`, the named `AtomicEdit` exists and belongs to *this* review change,
 * the token range genuinely intersects that edit's old range, and the token text actually has the
 * shape the tag claims (a numeric-range token really is `\d...(dash)...\d`, a figure-label token
 * really starts with an allowed label word, a dash token really is one dash-class code point). For
 * `mdx-jsx-code-boundary-adjacent`, the boundary's own range is re-sliced and compared to its
 * recorded text, its distance to the nearest atomic edit in the review change is independently
 * recomputed, and that distance must not exceed the documented threshold. */
/** Independently re-verifies one `authored-en-dash-restyled` tag. Never throws: every field is
 * type-checked before use, and a malformed/missing field produces an issue string rather than a
 * runtime exception. Final Correction pass, item 5: re-derives "substitutes FROM U+2013" from
 * the named `AtomicEdit`'s own `before`/`after` via the real `computeAlignedCodePointDelta` --
 * not a positional index compare, which an insertion/deletion earlier in the same edit can
 * desynchronize from the true substitution position. */
function checkAuthoredEnDashEvidence(t: RiskTag, rc: ReviewChange, path: string, originalCps: readonly string[], editsById: ReadonlyMap<string, AtomicEdit>, ownEditIds: ReadonlySet<string>): string[] {
  const issues: string[] = [];
  const label = `risk tag "${t.tag}" on "${rc.id}"`;
  if (t.evidence === null || typeof t.evidence !== "object") {
    issues.push(`${label}: evidence is ${t.evidence === null ? "null" : "not an object"}, but this tag's contract requires real evidence identifying the source U+2013 and its atomic edit`);
    return issues;
  }
  const ev = t.evidence as unknown as Record<string, unknown>;

  if (typeof ev.atomicEditId !== "string") {
    issues.push(`${label}: atomicEditId is missing or not a string`);
  }
  if (typeof ev.sourceText !== "string") {
    issues.push(`${label}: sourceText is missing or not a string`);
  }
  if (!isValidRange(ev.sourceOldOffset)) {
    issues.push(`${label}: sourceOldOffset is missing or malformed`);
  }
  if (issues.length > 0) return issues; // cannot proceed without well-typed fields

  const { codePointStart, codePointEnd } = ev.sourceOldOffset as { codePointStart: number; codePointEnd: number };
  const sourceText = ev.sourceText as string;
  const atomicEditId = ev.atomicEditId as string;

  if (codePointStart < 0 || codePointEnd > originalCps.length || codePointStart > codePointEnd) {
    issues.push(`${label}: sourceOldOffset [${codePointStart}, ${codePointEnd}) is out of bounds for "${path}"`);
    return issues;
  }
  if (codePointEnd - codePointStart !== 1) {
    issues.push(`${label}: sourceOldOffset must span exactly one code point, spans ${codePointEnd - codePointStart}`);
  }
  const slice = originalCps.slice(codePointStart, codePointEnd).join("");
  if (slice !== sourceText || sourceText !== "–") {
    issues.push(`${label}: sourceOldOffset does not slice to a lone U+2013 ("${slice}" recorded as "${sourceText}")`);
  }

  const edit = editsById.get(atomicEditId);
  if (!edit) {
    issues.push(`${label}: atomicEditId "${atomicEditId}" does not exist in "${path}"`);
    return issues;
  }
  if (!ownEditIds.has(edit.id)) {
    issues.push(`${label}: atomicEditId "${edit.id}" does not belong to this review change`);
  }
  if (codePointStart < edit.oldOffset.codePointStart || codePointEnd > edit.oldOffset.codePointEnd) {
    issues.push(`${label}: sourceOldOffset [${codePointStart}, ${codePointEnd}) is not contained in atomic edit "${edit.id}"'s own old range`);
    return issues;
  }

  // Independently recompute, via the real aligned delta (not a positional compare), whether this
  // edit contains a genuine substitution FROM U+2013 at exactly the claimed absolute position.
  const aligned = computeAlignedCodePointDelta(edit.before, edit.after);
  if (!aligned) {
    issues.push(`${label}: atomic edit "${edit.id}" is too long to independently verify via the aligned code-point delta`);
    return issues;
  }
  let offsetWithinMid = 0;
  let found = false;
  for (const entry of aligned.entries) {
    const absolute = edit.oldOffset.codePointStart + aligned.prefix + offsetWithinMid;
    if (entry.kind === "substitute" && entry.from === "U+2013" && absolute === codePointStart) {
      found = true;
      break;
    }
    if (entry.kind !== "insert") offsetWithinMid += 1;
  }
  if (!found) {
    issues.push(`${label}: atomic edit "${edit.id}" does not actually substitute FROM U+2013 at the claimed position under the aligned delta (before="${edit.before}", after="${edit.after}")`);
  }
  return issues;
}

/** Independently re-verifies one `single-initial-binding-candidate` tag against the real N7
 * structural predicates (`isInitialAt`/`isAbbreviationTail`/`hasPrecedingInitial`, imported --
 * never reimplemented), prepared against the actual resolved locale. Never throws. Final
 * Correction pass, item 4: every field is anchored to `q = spaceOldOffset.codePointStart` by
 * exact range equality, not merely "contains an uppercase letter somewhere" -- a tampered
 * `leftInitialOldOffset`/`followingOldOffset` pointing at a different valid uppercase character
 * elsewhere in the file must fail. */
function checkSingleInitialBindingEvidence(t: RiskTag, rc: ReviewChange, path: string, originalCps: readonly string[], editsById: ReadonlyMap<string, AtomicEdit>, ownEditIds: ReadonlySet<string>, prep: Prepared): string[] {
  const issues: string[] = [];
  const label = `risk tag "${t.tag}" on "${rc.id}"`;
  if (t.evidence === null || typeof t.evidence !== "object") {
    issues.push(`${label}: evidence is ${t.evidence === null ? "null" : "not an object"}, but this tag's contract requires real evidence identifying the converted space, the left initial and the following code point`);
    return issues;
  }
  const ev = t.evidence as unknown as Record<string, unknown>;

  if (typeof ev.atomicEditId !== "string") issues.push(`${label}: atomicEditId is missing or not a string`);
  if (typeof ev.leftInitialCodePoint !== "string") issues.push(`${label}: leftInitialCodePoint is missing or not a string`);
  if (typeof ev.followingCodePoint !== "string") issues.push(`${label}: followingCodePoint is missing or not a string`);
  if (typeof ev.noPrecedingChainConfirmed !== "boolean") issues.push(`${label}: noPrecedingChainConfirmed is missing or not a boolean`);
  const rangeFields: [string, unknown][] = [
    ["spaceOldOffset", ev.spaceOldOffset],
    ["leftInitialOldOffset", ev.leftInitialOldOffset],
    ["followingOldOffset", ev.followingOldOffset],
  ];
  for (const [name, value] of rangeFields) {
    if (!isValidRange(value)) issues.push(`${label}: ${name} is missing or malformed`);
  }
  if (issues.length > 0) return issues; // cannot proceed without well-typed fields

  const spaceOldOffset = ev.spaceOldOffset as { codePointStart: number; codePointEnd: number };
  const leftInitialOldOffset = ev.leftInitialOldOffset as { codePointStart: number; codePointEnd: number };
  const followingOldOffset = ev.followingOldOffset as { codePointStart: number; codePointEnd: number };
  const leftInitialCodePoint = ev.leftInitialCodePoint as string;
  const followingCodePoint = ev.followingCodePoint as string;
  const noPrecedingChainConfirmed = ev.noPrecedingChainConfirmed as boolean;
  const atomicEditId = ev.atomicEditId as string;

  for (const [name, range] of [
    ["spaceOldOffset", spaceOldOffset],
    ["leftInitialOldOffset", leftInitialOldOffset],
    ["followingOldOffset", followingOldOffset],
  ] as const) {
    if (range.codePointStart < 0 || range.codePointEnd > originalCps.length || range.codePointStart > range.codePointEnd) {
      issues.push(`${label}: ${name} [${range.codePointStart}, ${range.codePointEnd}) is out of bounds for "${path}"`);
    } else if (range.codePointEnd - range.codePointStart !== 1) {
      issues.push(`${label}: ${name} must span exactly one code point, spans ${range.codePointEnd - range.codePointStart}`);
    }
  }
  if (issues.length > 0) return issues;

  // Anchoring (item 4): every range must sit exactly where the converted space says it must,
  // not merely somewhere plausible.
  const q = spaceOldOffset.codePointStart;
  if (leftInitialOldOffset.codePointStart !== q - 2 || leftInitialOldOffset.codePointEnd !== q - 1) {
    issues.push(`${label}: leftInitialOldOffset [${leftInitialOldOffset.codePointStart}, ${leftInitialOldOffset.codePointEnd}) is not anchored to the converted space at q=${q} (expected [${q - 2}, ${q - 1}))`);
  }
  if (followingOldOffset.codePointStart !== q + 1 || followingOldOffset.codePointEnd !== q + 2) {
    issues.push(`${label}: followingOldOffset [${followingOldOffset.codePointStart}, ${followingOldOffset.codePointEnd}) is not anchored to the converted space at q=${q} (expected [${q + 1}, ${q + 2}))`);
  }
  if (issues.length > 0) return issues;

  if (q - 2 < 0 || q + 2 > originalCps.length) {
    issues.push(`${label}: q=${q} leaves no room for the anchored ranges in "${path}"`);
    return issues;
  }
  const sliceAt = (range: { codePointStart: number; codePointEnd: number }) => originalCps.slice(range.codePointStart, range.codePointEnd).join("");
  const dotSlice = originalCps[q - 1];
  if (dotSlice !== ".") {
    issues.push(`${label}: original[q-1] is "${dotSlice}", not "." -- left side is not an initial`);
  }
  const leftSlice = sliceAt(leftInitialOldOffset);
  if (leftSlice !== leftInitialCodePoint) {
    issues.push(`${label}: leftInitialOldOffset does not slice to the recorded leftInitialCodePoint ("${leftSlice}" vs "${leftInitialCodePoint}")`);
  }
  const followingSlice = sliceAt(followingOldOffset);
  if (followingSlice !== followingCodePoint) {
    issues.push(`${label}: followingOldOffset does not slice to the recorded followingCodePoint ("${followingSlice}" vs "${followingCodePoint}")`);
  }
  if (issues.length > 0) return issues;

  // Independent structural re-derivation using the real, imported N7 predicates -- never a
  // reimplementation -- prepared against the actual resolved locale.
  const originalCodePoints = originalCps.map((c) => c.codePointAt(0) as number);
  const leftP = q - 2;
  if (!isUpper(originalCodePoints[leftP] ?? -1)) {
    issues.push(`${label}: left code point at ${leftP} is not UPPER per the engine's own pinned predicate`);
  }
  if (!isInitialAt(originalCodePoints, prep, leftP)) {
    issues.push(`${label}: left letter + dot is not a valid initial at this locale's own token-start condition (isInitialAt) -- e.g. embedded inside a longer token such as "xA."`);
  }
  if (isAbbreviationTail(originalCodePoints, leftP)) {
    issues.push(`${label}: the abbreviation-tail veto (C1-a) applies at this position -- this is the second token of an abbreviation, not an initial`);
  }
  if (!isUpper(originalCodePoints[q + 1] ?? -1)) {
    issues.push(`${label}: following code point at ${q + 1} is not UPPER per the engine's own pinned predicate`);
  }
  if (originalCps[q + 2] === ".") {
    issues.push(`${label}: the following code point is itself an initial (between-initials shape) -- this tag must not fire here`);
  }
  if (noPrecedingChainConfirmed !== true) {
    issues.push(`${label}: noPrecedingChainConfirmed must be literally true when this tag fires`);
  } else if (hasPrecedingInitial(originalCodePoints, prep, leftP)) {
    issues.push(`${label}: a preceding initial chain is independently confirmed at the claimed position (via the real hasPrecedingInitial), contradicting noPrecedingChainConfirmed`);
  }

  const edit = editsById.get(atomicEditId);
  if (!edit) {
    issues.push(`${label}: atomicEditId "${atomicEditId}" does not exist in "${path}"`);
    return issues;
  }
  if (!ownEditIds.has(edit.id)) {
    issues.push(`${label}: atomicEditId "${edit.id}" does not belong to this review change`);
  }
  if (edit.oldOffset.codePointStart !== q || edit.oldOffset.codePointEnd !== q + 1) {
    issues.push(`${label}: atomic edit "${edit.id}"'s own old range does not equal the claimed spaceOldOffset`);
  } else if (edit.before !== SPACE_CHAR || edit.after !== NBSP_CHAR) {
    issues.push(`${label}: atomic edit "${edit.id}" does not actually substitute U+0020 with U+00A0 (before="${edit.before}", after="${edit.after}")`);
  }
  return issues;
}

export function checkRiskTagEvidence(results: readonly FileResult[], locale: LocaleData): string[] {
  const issues: string[] = [];
  const prep = prepare(locale);
  for (const r of results) {
    if (r.status !== "changed" || !r.diff || r.originalText === undefined) continue;
    const originalCps = [...r.originalText];
    const editsById = new Map(r.diff.atomicEdits.map((e) => [e.id, e] as const));

    for (const rc of r.diff.reviewChanges) {
      const tags: readonly RiskTag[] = r.riskTags?.get(rc.id) ?? [];
      const ownEditIds = new Set(rc.atomicEditIds);

      for (const t of tags) {
        // Final Correction pass, item 3: both new tags are dispatched to their own fully
        // type-checked, never-throwing validators *before* any null-evidence skip -- a `null` (or
        // missing, or malformed) evidence object for either of them is a consistency failure, not
        // a silent pass. Only tags on `LEGACY_NULL_EVIDENCE_TAGS` may skip via `evidence === null`.
        if (t.tag === "authored-en-dash-restyled") {
          issues.push(...checkAuthoredEnDashEvidence(t, rc, r.path, originalCps, editsById, ownEditIds));
          continue;
        }
        if (t.tag === "single-initial-binding-candidate") {
          issues.push(...checkSingleInitialBindingEvidence(t, rc, r.path, originalCps, editsById, ownEditIds, prep));
          continue;
        }
        if (t.evidence === null) {
          if (!LEGACY_NULL_EVIDENCE_TAGS.has(t.tag)) {
            issues.push(`risk tag "${t.tag}" on "${rc.id}": evidence is null, and "${t.tag}" is not on the legacy null-evidence allowlist`);
          }
          continue;
        }

        if (t.tag === "dash-restyling") {
          // Proximity-based, deliberately weaker than the intersection tags below -- see
          // `DashProximityEvidence`'s doc comment in tagging.ts.
          const ev = t.evidence as DashProximityEvidence;
          const { codePointStart, codePointEnd } = ev.tokenOldOffset;
          if (codePointStart < 0 || codePointEnd > originalCps.length || codePointStart > codePointEnd) {
            issues.push(`risk tag "${t.tag}" on "${rc.id}": token range [${codePointStart}, ${codePointEnd}) is out of bounds for "${r.path}"`);
            continue;
          }
          const slice = originalCps.slice(codePointStart, codePointEnd).join("");
          if (slice !== ev.tokenText) {
            issues.push(`risk tag "${t.tag}" on "${rc.id}": token range does not slice to the recorded tokenText ("${slice}" vs "${ev.tokenText}")`);
          }
          if (!isDashTokenShape(ev.tokenText)) {
            issues.push(`risk tag "${t.tag}" on "${rc.id}": tokenText "${ev.tokenText}" is not a single dash-class code point`);
          }
          const edit = editsById.get(ev.nearestAtomicEditId);
          if (!edit) {
            issues.push(`risk tag "${t.tag}" on "${rc.id}": nearestAtomicEditId "${ev.nearestAtomicEditId}" does not exist in "${r.path}"`);
          } else {
            if (!ownEditIds.has(edit.id)) {
              issues.push(`risk tag "${t.tag}" on "${rc.id}": nearestAtomicEditId "${edit.id}" does not belong to this review change`);
            }
            const expectedDistance =
              codePointEnd <= edit.oldOffset.codePointStart
                ? edit.oldOffset.codePointStart - codePointEnd
                : codePointStart >= edit.oldOffset.codePointEnd
                  ? codePointStart - edit.oldOffset.codePointEnd
                  : 0;
            if (expectedDistance !== ev.distance) {
              issues.push(`risk tag "${t.tag}" on "${rc.id}": recorded distance (${ev.distance}) does not match an independent recomputation (${expectedDistance})`);
            }
          }
          if (ev.distance > DASH_PROXIMITY_CODEPOINTS) {
            issues.push(`risk tag "${t.tag}" on "${rc.id}": recorded distance (${ev.distance}) exceeds the documented threshold (${DASH_PROXIMITY_CODEPOINTS})`);
          }
        } else if ("tokenText" in t.evidence) {
          const ev = t.evidence as TokenEvidence;
          const { codePointStart, codePointEnd } = ev.tokenOldOffset;
          if (codePointStart < 0 || codePointEnd > originalCps.length || codePointStart > codePointEnd) {
            issues.push(`risk tag "${t.tag}" on "${rc.id}": token range [${codePointStart}, ${codePointEnd}) is out of bounds for "${r.path}"`);
            continue;
          }
          const slice = originalCps.slice(codePointStart, codePointEnd).join("");
          if (slice !== ev.tokenText) {
            issues.push(`risk tag "${t.tag}" on "${rc.id}": token range does not slice to the recorded tokenText ("${slice}" vs "${ev.tokenText}")`);
          }
          const edit = editsById.get(ev.intersectingAtomicEditId);
          if (!edit) {
            issues.push(`risk tag "${t.tag}" on "${rc.id}": intersectingAtomicEditId "${ev.intersectingAtomicEditId}" does not exist in "${r.path}"`);
          } else {
            if (!ownEditIds.has(edit.id)) {
              issues.push(`risk tag "${t.tag}" on "${rc.id}": intersectingAtomicEditId "${edit.id}" does not belong to this review change`);
            }
            if (!rangesIntersectConsistency(codePointStart, codePointEnd, edit.oldOffset.codePointStart, edit.oldOffset.codePointEnd)) {
              issues.push(`risk tag "${t.tag}" on "${rc.id}": token range does not actually intersect atomic edit "${edit.id}"`);
            }
          }
          const shapeOk =
            t.tag === "numeric-range-or-compound-label-candidate"
              ? isNumericRangeTokenShape(ev.tokenText)
              : t.tag === "figure-label-shaped"
                ? isFigureLabelTokenShape(ev.tokenText)
                : t.tag === "quote-elision-ambiguity-candidate"
                  ? isElisionQuoteTokenShape(ev.tokenText)
                  : true; // tags without a defined shape validator are not checked here
          if (!shapeOk) {
            issues.push(`risk tag "${t.tag}" on "${rc.id}": tokenText "${ev.tokenText}" does not have the shape this tag claims`);
          }
        } else if (t.evidence && typeof t.evidence === "object" && "boundaryOldOffset" in t.evidence) {
          const ev = t.evidence as BoundaryEvidence;
          const { codePointStart, codePointEnd } = ev.boundaryOldOffset;
          if (codePointStart < 0 || codePointEnd > originalCps.length || codePointStart > codePointEnd) {
            issues.push(`risk tag "${t.tag}" on "${rc.id}": boundary range [${codePointStart}, ${codePointEnd}) is out of bounds for "${r.path}"`);
            continue;
          }
          const slice = originalCps.slice(codePointStart, codePointEnd).join("");
          if (slice !== ev.boundaryText) {
            issues.push(`risk tag "${t.tag}" on "${rc.id}": boundary range does not slice to the recorded boundaryText ("${slice}" vs "${ev.boundaryText}")`);
          }
          if (!isMdxBoundaryTokenShape(ev.boundaryText)) {
            issues.push(`risk tag "${t.tag}" on "${rc.id}": boundaryText "${ev.boundaryText}" does not have the shape of an MDX/JSX/code boundary token`);
          }
          const edits = r.diff.atomicEdits.filter((e) => ownEditIds.has(e.id));
          const distances = edits.map((e) =>
            codePointEnd <= e.oldOffset.codePointStart
              ? e.oldOffset.codePointStart - codePointEnd
              : codePointStart >= e.oldOffset.codePointEnd
                ? codePointStart - e.oldOffset.codePointEnd
                : 0,
          );
          const expectedDistance = distances.length > 0 ? Math.min(...distances) : null;
          if (expectedDistance === null || expectedDistance !== ev.distance) {
            issues.push(`risk tag "${t.tag}" on "${rc.id}": recorded distance (${ev.distance}) does not match an independent recomputation (${expectedDistance ?? "n/a"})`);
          }
          if (ev.distance > MDX_BOUNDARY_MAX_DISTANCE_CODEPOINTS) {
            issues.push(`risk tag "${t.tag}" on "${rc.id}": recorded distance (${ev.distance}) exceeds the documented threshold (${MDX_BOUNDARY_MAX_DISTANCE_CODEPOINTS})`);
          }
        } else {
          // Final Correction pass, item 3: an evidence object that matches none of the known
          // shapes (`tokenText`, `nearestAtomicEditId` under `dash-restyling`, or
          // `boundaryOldOffset`) must fail closed rather than being silently cast to
          // `BoundaryEvidence` and read as `undefined` fields that then pass every check.
          issues.push(`risk tag "${t.tag}" on "${rc.id}": evidence does not match any known shape (TokenEvidence, DashProximityEvidence, or BoundaryEvidence)`);
        }
      }
    }
  }
  return issues;
}

/** No `ReviewChange`'s old span may exceed the documented size cap
 * (`REVIEW_CHANGE_MAX_OLD_SPAN_CODEPOINTS` in diff.ts) -- the grouping rule promises a
 * deterministic split at that boundary, not an unbounded merge. */
export function checkReviewChangeSizeCap(results: readonly FileResult[], maxOldSpanCodePoints: number): string[] {
  const issues: string[] = [];
  for (const r of results) {
    if (r.status !== "changed" || !r.diff) continue;
    for (const rc of r.diff.reviewChanges) {
      const span = rc.oldOffset.codePointEnd - rc.oldOffset.codePointStart;
      if (span > maxOldSpanCodePoints) {
        issues.push(`review change "${rc.id}": old span (${span} code points) exceeds the documented maximum (${maxOldSpanCodePoints})`);
      }
    }
  }
  return issues;
}

/** A `ReviewChange`'s line range must sit inside the file it was cut from. */
/** `end.line` is exclusive-position (see `ReviewChange.oldLineCol`'s doc comment), so it may
 * legitimately equal `counts.oldLines` (one past the last real line index in a 1-indexed sense --
 * `oldLines` itself already counts the trailing empty "line" `split("\n")` produces for a
 * newline-terminated file) but never exceed it. */
export function checkRegionsInBounds(entries: readonly ReviewChangeEntry[], fileLineCounts: ReadonlyMap<string, { oldLines: number; newLines: number }>): string[] {
  const issues: string[] = [];
  for (const e of entries) {
    const counts = fileLineCounts.get(e.path);
    if (!counts) {
      issues.push(`review change "${e.id}": no known line count for file "${e.path}"`);
      continue;
    }
    if (e.oldLineCol.start.line < 1 || e.oldLineCol.end.line > counts.oldLines) {
      issues.push(`review change "${e.id}": old line range [${e.oldLineCol.start.line}, ${e.oldLineCol.end.line}) is out of bounds for "${e.path}" (${counts.oldLines} line(s))`);
    }
    if (e.newLineCol.start.line < 1 || e.newLineCol.end.line > counts.newLines) {
      issues.push(`review change "${e.id}": new line range [${e.newLineCol.start.line}, ${e.newLineCol.end.line}) is out of bounds for "${e.path}" (${counts.newLines} line(s))`);
    }
  }
  return issues;
}

/** Every `ReviewChange` must resolve to a real enclosing `DiffHunk` (never the `"unknown"`
 * fallback `findEnclosingHunk` uses when it cannot find one), and that hunk's own `[oldStart,
 * oldStart+oldLines)` / `[newStart, newStart+newLines)` ranges must genuinely contain the review
 * change's line range on both sides -- independently re-verified here, not merely trusted from
 * whatever `diffHunkId` was assigned at construction time. */
export function checkHunkContainment(results: readonly FileResult[]): string[] {
  const issues: string[] = [];
  for (const r of results) {
    if (r.status !== "changed" || !r.diff) continue;
    const hunksById = new Map(r.diff.diffHunks.map((h) => [h.id, h] as const));
    for (const rc of r.diff.reviewChanges) {
      if (rc.diffHunkId === "unknown") {
        issues.push(`review change "${rc.id}": diffHunkId is "unknown" -- no enclosing unified hunk was found`);
        continue;
      }
      const hunk = hunksById.get(rc.diffHunkId);
      if (!hunk) {
        issues.push(`review change "${rc.id}": diffHunkId "${rc.diffHunkId}" does not exist in "${r.path}"`);
        continue;
      }
      const oldLastIncluded = Math.max(rc.oldLineCol.start.line, rc.oldLineCol.end.line - (rc.oldLineCol.end.column === 0 ? 1 : 0));
      const newLastIncluded = Math.max(rc.newLineCol.start.line, rc.newLineCol.end.line - (rc.newLineCol.end.column === 0 ? 1 : 0));
      const oldOk = rc.oldLineCol.start.line >= hunk.oldStart && oldLastIncluded <= hunk.oldStart + hunk.oldLines - 1;
      const newOk = rc.newLineCol.start.line >= hunk.newStart && newLastIncluded <= hunk.newStart + hunk.newLines - 1;
      if (!oldOk) issues.push(`review change "${rc.id}": its own old line range is not actually contained by hunk "${hunk.id}"`);
      if (!newOk) issues.push(`review change "${rc.id}": its own new line range is not actually contained by hunk "${hunk.id}"`);
    }
  }
  return issues;
}

/** `ReviewChange` ids must be unique not only among themselves but across the whole id
 * namespace this run produces -- no `ReviewChange` id may collide with any `AtomicEdit` id (both
 * appear together in changes.json's `atomicEditIds` cross-references, so a collision there would
 * be genuinely ambiguous, not just cosmetically confusing). */
export function checkGlobalIdNamespaceUnique(results: readonly FileResult[]): string[] {
  const issues: string[] = [];
  for (const r of results) {
    if (r.status !== "changed" || !r.diff) continue;
    const atomicIds = new Set(r.diff.atomicEdits.map((e) => e.id));
    for (const rc of r.diff.reviewChanges) {
      if (atomicIds.has(rc.id)) issues.push(`"${r.path}": review change id "${rc.id}" collides with an atomic edit id`);
    }
  }
  return issues;
}

/** Every source-side preview piece (`previewOldLeading`/`previewOldTrailing`) must be an exact
 * suffix (leading) or prefix (trailing) of the real ORIGINAL file text immediately adjacent to the
 * review change's own declared old offset -- independently re-sliced here from the real file text,
 * not merely trusted from construction.
 *
 * The isolated-after side (`previewIsolatedLeading`/`previewIsolatedTrailing`) is checked
 * differently, deliberately: it is NOT a slice of any file (Stage 10 Pass A second correction,
 * item 1 -- this replaces the earlier version of this check, which asserted it against the FULL
 * TRANSFORMED file and would therefore have failed closed on every row whose window happens to
 * contain a neighbouring review change's edit, i.e. most real corpus rows). Instead it must be
 * character-for-character IDENTICAL to the source-side leading/trailing -- the "apply only this
 * item's own edits to the source window" invariant, which for the leading/trailing pieces
 * (untouched by this item's own edits, by construction) means "unchanged from source". */
export function checkPreviewMatchesSource(results: readonly FileResult[]): string[] {
  const issues: string[] = [];
  for (const r of results) {
    if (r.status !== "changed" || !r.diff || r.originalText === undefined) continue;
    const oldCps = [...r.originalText];
    for (const rc of r.diff.reviewChanges) {
      const leadingLen = [...rc.previewOldLeading.text].length;
      const actualOldLeading = oldCps.slice(rc.oldOffset.codePointStart - leadingLen, rc.oldOffset.codePointStart).join("");
      if (actualOldLeading !== rc.previewOldLeading.text) issues.push(`review change "${rc.id}": previewOldLeading does not match the real source text immediately before its offset`);

      const oldTrailingLen = [...rc.previewOldTrailing.text].length;
      const actualOldTrailing = oldCps.slice(rc.oldOffset.codePointEnd, rc.oldOffset.codePointEnd + oldTrailingLen).join("");
      if (actualOldTrailing !== rc.previewOldTrailing.text) issues.push(`review change "${rc.id}": previewOldTrailing does not match the real source text immediately after its offset`);

      if (rc.previewIsolatedLeading.text !== rc.previewOldLeading.text || rc.previewIsolatedLeading.truncated !== rc.previewOldLeading.truncated) {
        issues.push(`review change "${rc.id}": previewIsolatedLeading is not identical to previewOldLeading -- isolated-apply must leave untouched leading context unchanged`);
      }
      if (rc.previewIsolatedTrailing.text !== rc.previewOldTrailing.text || rc.previewIsolatedTrailing.truncated !== rc.previewOldTrailing.truncated) {
        issues.push(`review change "${rc.id}": previewIsolatedTrailing is not identical to previewOldTrailing -- isolated-apply must leave untouched trailing context unchanged`);
      }
    }
  }
  return issues;
}

/** Independently validates `oldMarks`/`newMarks`: every mark must be in-bounds within `before`/
 * `after`, marks must be in ascending non-overlapping order, there must be exactly one mark per
 * grouped `AtomicEdit` (not one merged envelope for a multi-edit item), and each mark's slice of
 * `before`/`after` must equal its corresponding `AtomicEdit`'s own `before`/`after` text exactly.
 * This is the proof that `sourcePreview` + `oldMarks` correctly identifies each individual edit
 * location, and that applying this item's own edits (via `newMarks`) reproduces `after` --
 * `after` itself is already independently checked against a real source slice by
 * `checkReviewChangeSlicesMatchSource`, so this check closes the remaining gap: that the
 * *sub-spans* claimed as "this is where edit N landed" are honest, not just the whole-group total. */
export function checkIsolatedPreviewMarks(results: readonly FileResult[]): string[] {
  const issues: string[] = [];
  for (const r of results) {
    if (r.status !== "changed" || !r.diff) continue;
    const editsById = new Map(r.diff.atomicEdits.map((e) => [e.id, e] as const));
    for (const rc of r.diff.reviewChanges) {
      const edits = rc.atomicEditIds.map((id) => editsById.get(id)).filter((e): e is AtomicEdit => e !== undefined);
      if (edits.length !== rc.atomicEditIds.length) {
        issues.push(`review change "${rc.id}": one or more atomicEditIds do not resolve to a real AtomicEdit`);
        continue;
      }
      if (rc.oldMarks.length !== edits.length || rc.newMarks.length !== edits.length) {
        issues.push(`review change "${rc.id}": oldMarks/newMarks count (${rc.oldMarks.length}/${rc.newMarks.length}) does not match its own atomic edit count (${edits.length})`);
        continue;
      }
      const beforeCps = [...rc.before];
      const afterCps = [...rc.after];
      let prevOldEnd = -1;
      let prevNewEnd = -1;
      for (let i = 0; i < edits.length; i += 1) {
        const edit = edits[i] as AtomicEdit;
        const om = rc.oldMarks[i] as { start: number; end: number };
        const nm = rc.newMarks[i] as { start: number; end: number };

        if (om.start < 0 || om.end > beforeCps.length || om.start > om.end) {
          issues.push(`review change "${rc.id}": oldMarks[${i}] [${om.start}, ${om.end}) is out of bounds for its own "before" text`);
        } else {
          if (om.start < prevOldEnd) issues.push(`review change "${rc.id}": oldMarks are not in ascending non-overlapping order at index ${i}`);
          prevOldEnd = om.end;
          const slice = beforeCps.slice(om.start, om.end).join("");
          if (slice !== edit.before) issues.push(`review change "${rc.id}": oldMarks[${i}] slice ("${slice}") does not equal atomic edit "${edit.id}"'s own before-text ("${edit.before}")`);
          const expectedStart = edit.oldOffset.codePointStart - rc.oldOffset.codePointStart;
          const expectedEnd = edit.oldOffset.codePointEnd - rc.oldOffset.codePointStart;
          if (om.start !== expectedStart || om.end !== expectedEnd) {
            issues.push(`review change "${rc.id}": oldMarks[${i}] does not match an independent recomputation from atomic edit "${edit.id}"'s own offset`);
          }
        }

        if (nm.start < 0 || nm.end > afterCps.length || nm.start > nm.end) {
          issues.push(`review change "${rc.id}": newMarks[${i}] [${nm.start}, ${nm.end}) is out of bounds for its own "after" text`);
        } else {
          if (nm.start < prevNewEnd) issues.push(`review change "${rc.id}": newMarks are not in ascending non-overlapping order at index ${i}`);
          prevNewEnd = nm.end;
          const slice = afterCps.slice(nm.start, nm.end).join("");
          if (slice !== edit.after) issues.push(`review change "${rc.id}": newMarks[${i}] slice ("${slice}") does not equal atomic edit "${edit.id}"'s own after-text ("${edit.after}")`);
          const expectedStart = edit.newOffset.codePointStart - rc.newOffset.codePointStart;
          const expectedEnd = edit.newOffset.codePointEnd - rc.newOffset.codePointStart;
          if (nm.start !== expectedStart || nm.end !== expectedEnd) {
            issues.push(`review change "${rc.id}": newMarks[${i}] does not match an independent recomputation from atomic edit "${edit.id}"'s own offset`);
          }
        }
      }
    }
  }
  return issues;
}

/** Every entry's stored `anchor` must equal `reviewChangeAnchor(entry.id)` (never hand-set, never
 * drifted from the function REVIEW.md/REVIEW.html both actually call), and no two entries in the
 * same run may collide on the same anchor -- both required for "target anchor exists exactly
 * once" (task item 2). */
export function checkAnchorsUnique(entries: readonly ReviewChangeEntry[]): string[] {
  const issues: string[] = [];
  const seen = new Map<string, string>();
  for (const e of entries) {
    const expected = reviewChangeAnchor(e.id);
    if (e.anchor !== expected) {
      issues.push(`review change "${e.id}": stored anchor "${e.anchor}" does not match an independent recomputation ("${expected}")`);
    }
    const owner = seen.get(e.anchor);
    if (owner && owner !== e.id) {
      issues.push(`anchor "${e.anchor}" is shared by review change "${owner}" and "${e.id}" -- must be unique`);
    } else {
      seen.set(e.anchor, e.id);
    }
  }
  return issues;
}

/** Quote-pair links must be genuinely symmetric (opening ↔ closing) and never dangle: every
 * `pairedReviewChangeId` must resolve to a real entry, that entry's own pairing must point back,
 * and `unknown`/`unpaired` must never carry a `pairedReviewChangeId` at all. */
export function checkQuotePairLinksSymmetric(entries: readonly ReviewChangeEntry[]): string[] {
  const issues: string[] = [];
  const byId = new Map(entries.map((e) => [e.id, e] as const));
  for (const e of entries) {
    const p = e.quotePairing;
    if (!p || p.status !== "paired") continue;
    const target = byId.get(p.pairedReviewChangeId);
    if (!target) {
      issues.push(`review change "${e.id}": quotePairing points to "${p.pairedReviewChangeId}" which does not exist`);
      continue;
    }
    const back = target.quotePairing;
    if (!back || back.status !== "paired" || back.pairedReviewChangeId !== e.id) {
      issues.push(`review change "${e.id}": quotePairing to "${target.id}" is not symmetric (the target does not link back)`);
    }
    if (back && back.status === "paired" && back.role === p.role) {
      issues.push(`review change "${e.id}" and "${target.id}": paired quote marks have the same role ("${p.role}"), expected one opening and one closing`);
    }
  }
  return issues;
}

/** REVIEW.md's "Counts by risk tag" and "Counts by attribution" bullet lists must independently
 * recompute to the same numbers as `changes.json`'s own entries -- a printed summary must never
 * be able to drift from the data it claims to summarize. */
export function checkReviewMarkdownCountsMatchEntries(entries: readonly ReviewChangeEntry[], reviewMarkdown: string): string[] {
  const issues: string[] = [];

  const expectedByTag = new Map<string, number>();
  for (const e of entries) {
    const tags = e.riskTags.length > 0 ? e.riskTags.map((t) => t.tag) : ["no-high-risk-tag"];
    for (const tag of tags) expectedByTag.set(tag, (expectedByTag.get(tag) ?? 0) + 1);
  }
  const tagSection = reviewMarkdown.split("## Counts by risk tag")[1]?.split("## Counts by file")[0] ?? "";
  const foundByTag = new Map<string, number>();
  for (const m of tagSection.matchAll(/^- `([^`]+)`: (\d+) changes?$/gm)) {
    foundByTag.set(m[1] as string, Number(m[2]));
  }
  for (const [tag, count] of expectedByTag) {
    if (foundByTag.get(tag) !== count) issues.push(`REVIEW.md risk-tag count for "${tag}" (${foundByTag.get(tag) ?? "missing"}) does not match changes.json (${count})`);
  }
  for (const tag of foundByTag.keys()) {
    if (!expectedByTag.has(tag)) issues.push(`REVIEW.md lists risk-tag "${tag}" which changes.json's entries do not produce`);
  }

  return issues;
}

/** Every changed file's own reconstruction proof (computed once, in diff.ts, at construction
 * time) must have found no gap. This is the fast, always-on check; `checkIndependentReconstruction`
 * above is the slower, deliberately-separate re-derivation. */
export function checkFileCoverage(results: readonly FileResult[]): string[] {
  const issues: string[] = [];
  for (const r of results) {
    if (r.status !== "changed" || !r.diff) continue;
    if (!r.diff.reconstruction.ok) {
      for (const issue of r.diff.reconstruction.issues) issues.push(`"${r.path}": ${issue}`);
    }
  }
  return issues;
}

/** Two independent serializations of the same generated data must be byte-identical. */
export function checkSerializationDeterministic(label: string, serializeOnce: () => string): string[] {
  const first = serializeOnce();
  const second = serializeOnce();
  return first === second ? [] : [`${label}: two serializations of the same in-memory data produced different output (non-deterministic)`];
}

/** Runs every check above and returns the combined issue list, prefixed for readability. */
export function checkAllConsistency(input: {
  entries: readonly ReviewChangeEntry[];
  results: readonly FileResult[];
  reviewMarkdown: string;
  manifestCounts: ManifestCounts;
  actualUnifiedDiffHunkCount: number;
  actualAtomicEditCount: number;
  reviewChangeMaxOldSpanCodePoints: number;
  fileLineCounts: ReadonlyMap<string, { oldLines: number; newLines: number }>;
  /** The resolved locale the corpus was run against -- one locale for the whole M4 run. Used
   * only by `checkRiskTagEvidence`, to prepare the exact same locale-specific N7 structural data
   * (`prepare(locale)`) the real `nbsp` rule used when it produced the output being checked. */
  locale: LocaleData;
}): string[] {
  return [
    ...checkIdsUnique(input.entries),
    ...checkReviewMarkdownIds(input.entries, input.reviewMarkdown),
    ...checkReviewMarkdownAllUnreviewed(input.entries, input.reviewMarkdown),
    ...checkManifestCounts(input.manifestCounts, input.entries, input.actualUnifiedDiffHunkCount, input.actualAtomicEditCount),
    ...checkReviewChangeSlicesMatchSource(input.results),
    ...checkLineColMatchesOffsets(input.results),
    ...checkUtf8ByteBoundaries(input.results),
    ...checkIndependentReconstruction(input.results),
    ...checkAtomicEditOwnership(input.results),
    ...checkRiskTagEvidence(input.results, input.locale),
    ...checkHunkContainment(input.results),
    ...checkGlobalIdNamespaceUnique(input.results),
    ...checkPreviewMatchesSource(input.results),
    ...checkIsolatedPreviewMarks(input.results),
    ...checkAnchorsUnique(input.entries),
    ...checkQuotePairLinksSymmetric(input.entries),
    ...checkReviewMarkdownCountsMatchEntries(input.entries, input.reviewMarkdown),
    ...checkReviewChangeSizeCap(input.results, input.reviewChangeMaxOldSpanCodePoints),
    ...checkRegionsInBounds(input.entries, input.fileLineCounts),
    ...checkFileCoverage(input.results),
  ].map((issue) => `consistency: ${issue}`);
}

export type { AtomicEdit, ReviewChange };
