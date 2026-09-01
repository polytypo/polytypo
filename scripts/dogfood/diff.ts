// Diffing for the M4 dogfooding dry-run tool. Everything here is reporting only -- nothing
// changes what transform() does; it only describes, for a human reviewer, what a diff contains.
//
// Stage 10 Pass A correction: the previous single-level `ReviewChange` model conflated two
// different jobs -- "minimal machine diff span" and "human review unit" -- into one object, and
// got both wrong: it split ordinary punctuation edits into rows for every opening quote, closing
// quote, and removed space, while a genuine 6-line run of independent per-line edits collapsed
// into one multi-line mega-item wrongly tagged `cross-line-edit`. Two entities now do these jobs
// separately:
//
//   - `DiffHunk` -- a unified-diff hunk (`@@ -a,b +c,d @@`), with its own context lines, exactly
//     as `full.diff` shows it. Display/traceability only, never a review unit.
//   - `AtomicEdit` -- the minimal machine-level diff span: exact old/new code-point and byte
//     offsets, exact removed/inserted text, never overlapping another `AtomicEdit`. The ordered,
//     complete set of `AtomicEdit`s for a file reconstructs the transformed file byte-for-byte
//     from the original (and the reverse) -- this is a proven property (`applyAtomicEditsForward`
//     / `applyAtomicEditsBackward`, exercised in tests/scripts/dogfood-model.test.ts), not an
//     assumption. `AtomicEdit` is the unit coverage, Unicode-delta computation, risk tagging, and
//     rule attribution are all built from.
//   - `ReviewChange` -- the human review unit: one or more related `AtomicEdit`s, grouped by a
//     documented deterministic rule (see `groupIntoReviewChanges`), with `before`/`after` sliced
//     directly from the source/output text at the group's own declared offsets -- never
//     reconstructed by concatenating fragments, so "what you see is what's there" is a structural
//     guarantee, not a hope.
import { diffLines, diffWordsWithSpace, structuredPatch } from "diff";
import { createHash } from "node:crypto";

const DIFF_CONTEXT_LINES = 3;

export interface DiffHunk {
  id: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
}

export interface OffsetRange {
  /** Absolute, 0-indexed, `[start, end)`, into the whole file this range is measured against --
   * the original file for `oldOffset`, the full-pipeline output file for `newOffset`. */
  codePointStart: number;
  codePointEnd: number;
  byteStart: number;
  byteEnd: number;
}

export interface LineCol {
  /** 1-indexed line number. */
  line: number;
  /** 0-indexed code-point column within that line. */
  column: number;
}

/** A code-point range `[start, end)`, relative to the start of some other string (documented at
 * each use site) rather than an absolute file offset. */
export interface EditMark {
  start: number;
  end: number;
}

export interface AtomicEdit {
  id: string;
  path: string;
  oldOffset: OffsetRange;
  newOffset: OffsetRange;
  /** Exact removed/inserted text. May contain a line break only when this edit itself changes the
   * number or position of line boundaries (a true merge/split) -- an unchanged newline delimiter
   * between two independently-edited lines is never part of an `AtomicEdit`. */
  before: string;
  after: string;
}

export interface NotableCodePoint {
  codePoint: string; // e.g. "U+00A0"
  name: string;
  count: number;
}

export interface CodePointDeltaEntry {
  kind: "substitute" | "insert" | "delete";
  from?: string; // "U+0027", present for "substitute" | "delete"
  to?: string; // "U+2019", present for "substitute" | "insert"
}

export interface ReviewChange {
  id: string;
  path: string;
  diffHunkId: string;
  /** IDs of every `AtomicEdit` this review item groups -- each `AtomicEdit` belongs to exactly
   * one `ReviewChange` across a whole file (checked by consistency.ts). */
  atomicEditIds: string[];
  oldOffset: OffsetRange;
  newOffset: OffsetRange;
  /** `start` is `offsetToLineCol(text, oldOffset.codePointStart)`. `end` is
   * `offsetToLineCol(text, oldOffset.codePointEnd)` -- EXCLUSIVE, the position immediately after
   * the last included code point (LSP-range convention), never the position of the last included
   * code point itself. A single-code-point change at line 3, column 5 therefore has
   * `start = {line:3, column:5}` and `end = {line:3, column:6}`, not `end = start`. Stage 10 Pass
   * A second correction: the field used to be computed from `codePointEnd - 1` (inclusive) while
   * still being named `end`, which is exactly the ambiguity this comment exists to rule out. */
  oldLineCol: { start: LineCol; end: LineCol };
  newLineCol: { start: LineCol; end: LineCol };
  /** Sliced directly from the original/transformed file text at `oldOffset`/`newOffset` -- never
   * built by concatenating `AtomicEdit` fragments, so this is structurally guaranteed to be
   * exactly what is at those offsets, nothing else. */
  before: string;
  after: string;
  beforeEscaped: string;
  afterEscaped: string;
  notableCodePoints: NotableCodePoint[];
  codePointDelta: CodePointDeltaEntry[] | null;
  /** True iff at least one of this review change's `AtomicEdit`s itself inserts, removes, or
   * relocates a line boundary (its `before` or `after` contains U+000A). Never true merely because
   * a unified hunk or a multi-edit review group spans several lines. */
  crossLineEdit: boolean;
  /** Window-relative (relative to `before`'s own start, i.e. `oldOffset.codePointStart`) ranges,
   * one per grouped `AtomicEdit`, in old-text order -- a single-edit `ReviewChange` has exactly one
   * mark spanning the whole of `before`; a multi-edit one marks each edit individually rather than
   * one envelope over the whole group (Stage 10 Pass A third correction, item 1). */
  oldMarks: EditMark[];
  /** Same, but relative to `after`'s own start (`newOffset.codePointStart`), using each edit's
   * `newOffset`. */
  newMarks: EditMark[];
  /** Word-boundary-trimmed preview context, for a human reviewer -- distinct from `before`/`after`,
   * never used for reconstruction or coverage.
   *
   * `sourcePreview` = `previewOldLeading.text + before + previewOldTrailing.text`, sliced purely
   * from the ORIGINAL file -- "what a reviewer would see opening the source at this location".
   *
   * `isolatedAfterPreview` = `previewIsolatedLeading.text + after + previewIsolatedTrailing.text`,
   * the SAME logical window with ONLY this item's own `AtomicEdit`s applied. Its leading/trailing
   * are therefore always character-for-character identical to `previewOldLeading`/
   * `previewOldTrailing` -- no other `ReviewChange`'s edit can ever touch this item's own
   * leading/trailing context, because `AtomicEdit`s partition each file with no overlap. Only the
   * middle (`after`, marked by `newMarks`) differs from the source.
   *
   * Stage 10 Pass A third correction: this replaces the earlier `previewNewLeading`/
   * `previewNewTrailing`, which sliced the FULL transformed file and therefore silently showed
   * unrelated neighbouring review changes' edits inside the same preview window -- a genuine
   * correctness bug in what was presented as this item's own before/after, not a display nit.
   * There is deliberately no full-pipeline-context field in this pass: showing it safely
   * (labelled, with its own deltas attributed back to their owning review IDs) is unresolved scope
   * -- omitted rather than shipped unlabelled and easily confused with the isolated result.
   *
   * `truncated` is `true` when real content was cut off on that side. */
  previewOldLeading: PreviewContext;
  previewOldTrailing: PreviewContext;
  previewIsolatedLeading: PreviewContext;
  previewIsolatedTrailing: PreviewContext;
}

export interface CoverageResult {
  ok: boolean;
  issues: string[];
}

export interface FileDiff {
  path: string;
  unifiedText: string;
  diffHunks: DiffHunk[];
  atomicEdits: AtomicEdit[];
  reviewChanges: ReviewChange[];
  /** Byte-exact reconstruction proof for this file: applying every `AtomicEdit` (in order) to the
   * original text reproduces the transformed text exactly, and the reverse. A failure here is not
   * a display nit -- it means the `AtomicEdit` set does not actually describe this diff, and
   * consistency.ts fails the whole run closed on it. */
  reconstruction: CoverageResult;
  oldLineCount: number;
  newLineCount: number;
}

// ---------------------------------------------------------------------------------------------
// Generic contiguous-block grouping, used at both line granularity (diffLines output) and word
// granularity (diffWordsWithSpace output) -- the same algorithm, one level apart.
// ---------------------------------------------------------------------------------------------

interface RawPart {
  value: string;
  added: boolean;
  removed: boolean;
}

interface Block {
  removedValue: string;
  addedValue: string;
  startPartIndex: number;
  endPartIndexExclusive: number;
}

function groupContiguousBlocks(parts: readonly RawPart[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < parts.length) {
    const part = parts[i] as RawPart;
    if (!part.added && !part.removed) {
      i += 1;
      continue;
    }
    const startPartIndex = i;
    let removedValue = "";
    let addedValue = "";
    while (i < parts.length && ((parts[i] as RawPart).added || (parts[i] as RawPart).removed)) {
      const p = parts[i] as RawPart;
      if (p.removed) removedValue += p.value;
      else addedValue += p.value;
      i += 1;
    }
    blocks.push({ removedValue, addedValue, startPartIndex, endPartIndexExclusive: i });
  }
  return blocks;
}

export function codePointLength(s: string): number {
  return [...s].length;
}

function codePointSlice(s: string, start: number, end: number): string {
  return [...s].slice(start, end).join("");
}

// ---------------------------------------------------------------------------------------------
// Offset tracking: cumulative code-point and byte position from the start of a file.
// ---------------------------------------------------------------------------------------------

class OffsetCursor {
  codePoint = 0;
  byte = 0;
  advance(text: string): void {
    this.codePoint += codePointLength(text);
    this.byte += Buffer.byteLength(text, "utf8");
  }
  snapshot(): { codePoint: number; byte: number } {
    return { codePoint: this.codePoint, byte: this.byte };
  }
}

/** Splits `text` into lines, each without its trailing `\n` -- `newline` records whether that line
 * actually had one (only the file's very last line can lack it). Unlike a plain `.split("\n")`,
 * this never fabricates a phantom trailing empty line. */
function splitLinesKeepingSeparators(text: string): { text: string; newline: string }[] {
  if (text === "") return [];
  const result: { text: string; newline: string }[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") {
      result.push({ text: text.slice(start, i), newline: "\n" });
      start = i + 1;
    }
  }
  if (start < text.length) result.push({ text: text.slice(start), newline: "" });
  return result;
}

// ---------------------------------------------------------------------------------------------
// Word-level (or, for a genuine multi-line block, whole-block) splitting into tight AtomicEdits.
// ---------------------------------------------------------------------------------------------

interface RawAtomicEdit {
  oldOffset: OffsetRange;
  newOffset: OffsetRange;
  before: string;
  after: string;
}

/** Splits `oldSeg`/`newSeg` (either one bare line, or -- when line counts differ and positional
 * pairing is impossible -- a whole multi-line block) into tight `AtomicEdit`s via word-plus-space
 * tokenisation, so ordinary prose spacing stays attached to the word it separates. There is
 * deliberately no "just return the whole segment" fallback for the common one-block case: doing
 * so would silently re-widen an already-tight span back out, folding unchanged text into
 * `before`/`after` -- exactly the contamination this module exists to avoid, and the source of a
 * real regression fixed earlier in Stage 10 (see git history / tests/scripts/dogfood-review-model.test.ts). */
function wordLevelEdits(
  oldSeg: string,
  newSeg: string,
  oldStart: { codePoint: number; byte: number },
  newStart: { codePoint: number; byte: number },
): RawAtomicEdit[] {
  if (oldSeg === "" && newSeg === "") return [];
  const parts = diffWordsWithSpace(oldSeg, newSeg) as RawPart[];
  const blocks = groupContiguousBlocks(parts);

  const edits: RawAtomicEdit[] = [];
  let oldCp = 0;
  let newCp = 0;
  let oldByte = 0;
  let newByte = 0;
  let partIndex = 0;
  for (const block of blocks) {
    while (partIndex < block.startPartIndex) {
      const p = parts[partIndex] as RawPart;
      const len = codePointLength(p.value);
      oldCp += len;
      newCp += len;
      const blen = Buffer.byteLength(p.value, "utf8");
      oldByte += blen;
      newByte += blen;
      partIndex += 1;
    }
    const oldCpStart = oldCp;
    const newCpStart = newCp;
    const oldByteStart = oldByte;
    const newByteStart = newByte;
    oldCp += codePointLength(block.removedValue);
    newCp += codePointLength(block.addedValue);
    oldByte += Buffer.byteLength(block.removedValue, "utf8");
    newByte += Buffer.byteLength(block.addedValue, "utf8");
    if (block.removedValue !== "" || block.addedValue !== "") {
      edits.push({
        oldOffset: {
          codePointStart: oldStart.codePoint + oldCpStart,
          codePointEnd: oldStart.codePoint + oldCp,
          byteStart: oldStart.byte + oldByteStart,
          byteEnd: oldStart.byte + oldByte,
        },
        newOffset: {
          codePointStart: newStart.codePoint + newCpStart,
          codePointEnd: newStart.codePoint + newCp,
          byteStart: newStart.byte + newByteStart,
          byteEnd: newStart.byte + newByte,
        },
        before: block.removedValue,
        after: block.addedValue,
      });
    }
    partIndex = block.endPartIndexExclusive;
  }

  // Defensive only: oldSeg !== newSeg is already known by every caller (that is why it is
  // splitting at all), so `blocks` finding nothing should be unreachable. Falling back to one
  // whole-segment edit rather than silently emitting nothing keeps a known-real change from
  // vanishing; the reconstruction proof below would catch it either way.
  if (edits.length === 0 && oldSeg !== newSeg) {
    edits.push({
      oldOffset: {
        codePointStart: oldStart.codePoint,
        codePointEnd: oldStart.codePoint + codePointLength(oldSeg),
        byteStart: oldStart.byte,
        byteEnd: oldStart.byte + Buffer.byteLength(oldSeg, "utf8"),
      },
      newOffset: {
        codePointStart: newStart.codePoint,
        codePointEnd: newStart.codePoint + codePointLength(newSeg),
        byteStart: newStart.byte,
        byteEnd: newStart.byte + Buffer.byteLength(newSeg, "utf8"),
      },
      before: oldSeg,
      after: newSeg,
    });
  }
  return edits;
}

/**
 * Builds the complete, ordered, non-overlapping `AtomicEdit` set for `oldText` -> `newText`.
 *
 * Algorithm (Stage 10 Pass A correction of the "6-line block collapses into one mega-item wrongly
 * tagged cross-line-edit" bug): `diffLines` first splits the file into unchanged/changed blocks.
 * Within a changed block:
 *  - if the removed and added line counts are equal (the common case: N independently-edited
 *    lines sitting next to each other, with no intervening unchanged line), lines are paired
 *    *positionally* -- old line i against new line i -- and each pair is word-diffed on its own,
 *    bare (no trailing `\n`) text. A block of 6 lines that each independently changed a quote or a
 *    dash therefore yields 6 (or more) line-local `AtomicEdit`s, none of which ever contains a
 *    newline, and none of which is `cross-line-edit`.
 *  - otherwise (line counts differ: a real merge, split, insertion, or deletion, or a rewrite so
 *    unrelated that positional pairing cannot be assumed to mean anything) the whole block's text
 *    is word-diffed as one segment. Because `diffWordsWithSpace` tokenises whitespace runs
 *    (including `\n`) as their own tokens, a genuine two-line merge or one-line split still gets a
 *    *tight* `AtomicEdit` (its `before`/`after` is just the changed whitespace/newline run, not
 *    the whole two lines) -- and that edit's `before`/`after` containing `\n` is exactly what makes
 *    `cross-line-edit` true for it, correctly.
 */
function buildAtomicEditsUnpathed(oldText: string, newText: string): RawAtomicEdit[] {
  const parts = diffLines(oldText, newText) as RawPart[];
  const blocks = groupContiguousBlocks(parts);
  const oldCursor = new OffsetCursor();
  const newCursor = new OffsetCursor();
  const edits: RawAtomicEdit[] = [];
  let partIndex = 0;

  for (const block of blocks) {
    while (partIndex < block.startPartIndex) {
      const p = parts[partIndex] as RawPart;
      oldCursor.advance(p.value);
      newCursor.advance(p.value);
      partIndex += 1;
    }

    const removedLines = splitLinesKeepingSeparators(block.removedValue);
    const addedLines = splitLinesKeepingSeparators(block.addedValue);

    if (removedLines.length === addedLines.length && removedLines.length > 0) {
      for (let i = 0; i < removedLines.length; i += 1) {
        const ol = removedLines[i] as { text: string; newline: string };
        const nl = addedLines[i] as { text: string; newline: string };
        const oldLineStart = oldCursor.snapshot();
        const newLineStart = newCursor.snapshot();
        if (ol.text !== nl.text) {
          edits.push(...wordLevelEdits(ol.text, nl.text, oldLineStart, newLineStart));
        }
        oldCursor.advance(ol.text + ol.newline);
        newCursor.advance(nl.text + nl.newline);
      }
    } else {
      const oldStart = oldCursor.snapshot();
      const newStart = newCursor.snapshot();
      edits.push(...wordLevelEdits(block.removedValue, block.addedValue, oldStart, newStart));
      oldCursor.advance(block.removedValue);
      newCursor.advance(block.addedValue);
    }
    partIndex = block.endPartIndexExclusive;
  }
  return edits;
}

// ---------------------------------------------------------------------------------------------
// Reconstruction: the proof that an AtomicEdit set actually describes the diff it claims to.
// ---------------------------------------------------------------------------------------------

/** Applies `edits` (sorted, non-overlapping `oldOffset`s) to `oldText`, replacing each edit's old
 * span with its `after` text. If `edits` is the complete, correct atomic-edit set for
 * `oldText -> newText`, this returns `newText` exactly. */
export function applyAtomicEditsForward(oldText: string, edits: readonly AtomicEdit[]): string {
  const oldCps = [...oldText];
  let result = "";
  let cursor = 0;
  for (const e of edits) {
    result += oldCps.slice(cursor, e.oldOffset.codePointStart).join("");
    result += e.after;
    cursor = e.oldOffset.codePointEnd;
  }
  result += oldCps.slice(cursor).join("");
  return result;
}

/** The reverse of `applyAtomicEditsForward`: applies `edits` to `newText` via their `newOffset`s
 * and `before` text, and should reproduce `oldText` exactly. */
export function applyAtomicEditsBackward(newText: string, edits: readonly AtomicEdit[]): string {
  const newCps = [...newText];
  let result = "";
  let cursor = 0;
  for (const e of edits) {
    result += newCps.slice(cursor, e.newOffset.codePointStart).join("");
    result += e.before;
    cursor = e.newOffset.codePointEnd;
  }
  result += newCps.slice(cursor).join("");
  return result;
}

function verifyReconstruction(oldText: string, newText: string, edits: readonly AtomicEdit[]): CoverageResult {
  const issues: string[] = [];
  const forward = applyAtomicEditsForward(oldText, edits);
  if (forward !== newText) issues.push("applying atomic edits forward (old -> new) did not reproduce the transformed text exactly");
  const backward = applyAtomicEditsBackward(newText, edits);
  if (backward !== oldText) issues.push("applying atomic edits backward (new -> old) did not reproduce the original text exactly");
  for (let i = 1; i < edits.length; i += 1) {
    const prev = edits[i - 1] as AtomicEdit;
    const cur = edits[i] as AtomicEdit;
    if (cur.oldOffset.codePointStart < prev.oldOffset.codePointEnd) {
      issues.push(`atomic edits "${prev.id}" and "${cur.id}" have overlapping old-offset ranges`);
    }
  }
  return { ok: issues.length === 0, issues };
}

// ---------------------------------------------------------------------------------------------
// Line/column: always independently recomputed from an absolute code-point offset, never carried
// through the diff walk -- so a stored line/column can never silently drift from its own offset.
// ---------------------------------------------------------------------------------------------

/** Returns `{ line, column }` (1-indexed line, 0-indexed code-point column) for the code point at
 * absolute code-point offset `codePointOffset` into `text`. */
export function offsetToLineCol(text: string, codePointOffset: number): LineCol {
  const cps = [...text];
  let line = 1;
  let column = 0;
  for (let i = 0; i < codePointOffset && i < cps.length; i += 1) {
    if (cps[i] === "\n") {
      line += 1;
      column = 0;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

// ---------------------------------------------------------------------------------------------
// Notable/confusable code points.
// ---------------------------------------------------------------------------------------------

const WATCHLIST: ReadonlyMap<number, string> = new Map([
  [0x00a0, "NO-BREAK SPACE"],
  [0x202f, "NARROW NO-BREAK SPACE"],
  [0x2060, "WORD JOINER"],
  [0x2011, "NON-BREAKING HYPHEN"],
  [0x00ad, "SOFT HYPHEN"],
  [0x200b, "ZERO WIDTH SPACE"],
  [0x200c, "ZERO WIDTH NON-JOINER"],
  [0x200d, "ZERO WIDTH JOINER"],
  [0xfeff, "ZERO WIDTH NO-BREAK SPACE (BOM)"],
  [0x0078, "LATIN SMALL LETTER X"],
  [0x0445, "CYRILLIC SMALL LETTER HA"],
  [0x0058, "LATIN CAPITAL LETTER X"],
  [0x0425, "CYRILLIC CAPITAL LETTER HA"],
  [0x00d7, "MULTIPLICATION SIGN"],
]);

function codePointToken(cp: number): string {
  const hex = cp.toString(16).toUpperCase().padStart(4, "0");
  return `U+${hex}`;
}

/** Replaces every code point on the watch list with a bracketed `<U+XXXX NAME>` token. Must only
 * ever be called with the exact `before`/`after` of a `ReviewChange` -- never with surrounding
 * unchanged context. */
export function escapeNotable(text: string): { escaped: string; notable: NotableCodePoint[] } {
  const counts = new Map<number, number>();
  let escaped = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if (WATCHLIST.has(cp)) {
      counts.set(cp, (counts.get(cp) ?? 0) + 1);
      escaped += `<${codePointToken(cp)} ${WATCHLIST.get(cp)}>`;
    } else {
      escaped += ch;
    }
  }
  const notable: NotableCodePoint[] = [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([cp, count]) => ({ codePoint: codePointToken(cp), name: WATCHLIST.get(cp) as string, count }));
  return { escaped, notable };
}

function mergeNotable(a: NotableCodePoint[], b: NotableCodePoint[]): NotableCodePoint[] {
  const merged = new Map<string, NotableCodePoint>();
  for (const entry of [...a, ...b]) {
    const existing = merged.get(entry.codePoint);
    merged.set(entry.codePoint, existing ? { ...entry, count: existing.count + entry.count } : entry);
  }
  return [...merged.values()].sort((x, y) => (x.codePoint < y.codePoint ? -1 : 1));
}

const CODE_POINT_DELTA_MAX_LENGTH = 12;

/** Common-prefix/common-suffix-trimmed alignment between `before` and `after`, plus `entries` in
 * the same shape `computeCodePointDelta` returns. `prefix` is the code-point offset, within
 * `before` (and, symmetrically, within `after`), where the first non-common code point sits --
 * callers that need to map an entry back to an absolute source position (e.g. risk-tag evidence
 * identifying exactly which code point in the original file a "substitute" entry corresponds to)
 * add `prefix + i` to their own base offset, rather than trusting a raw positional index into the
 * unaligned strings, which drifts under any insertion/deletion earlier in the same edit.
 * `computeCodePointDelta` is a thin wrapper over this, so the two can never disagree. */
export function computeAlignedCodePointDelta(
  before: string,
  after: string,
): { prefix: number; entries: CodePointDeltaEntry[] } | null {
  const b = [...before];
  const a = [...after];
  if (b.length > CODE_POINT_DELTA_MAX_LENGTH || a.length > CODE_POINT_DELTA_MAX_LENGTH) return null;

  let prefix = 0;
  while (prefix < b.length && prefix < a.length && b[prefix] === a[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < b.length - prefix &&
    suffix < a.length - prefix &&
    b[b.length - 1 - suffix] === a[a.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const bMid = b.slice(prefix, b.length - suffix);
  const aMid = a.slice(prefix, a.length - suffix);

  const entries: CodePointDeltaEntry[] = [];
  const pairs = Math.min(bMid.length, aMid.length);
  for (let i = 0; i < pairs; i += 1) {
    entries.push({
      kind: "substitute",
      from: codePointToken((bMid[i] as string).codePointAt(0) as number),
      to: codePointToken((aMid[i] as string).codePointAt(0) as number),
    });
  }
  for (let i = pairs; i < bMid.length; i += 1) {
    entries.push({ kind: "delete", from: codePointToken((bMid[i] as string).codePointAt(0) as number) });
  }
  for (let i = pairs; i < aMid.length; i += 1) {
    entries.push({ kind: "insert", to: codePointToken((aMid[i] as string).codePointAt(0) as number) });
  }
  return { prefix, entries };
}

export function computeCodePointDelta(before: string, after: string): CodePointDeltaEntry[] | null {
  return computeAlignedCodePointDelta(before, after)?.entries ?? null;
}

// ---------------------------------------------------------------------------------------------
// ReviewChange grouping: the documented, deterministic rule for turning AtomicEdits into human
// review units.
// ---------------------------------------------------------------------------------------------

/** Two `AtomicEdit`s on the same old *and* new line merge into one `ReviewChange` when the
 * unchanged code-point gap between them (on both the old and new side) is at most this many code
 * points. Deliberately small: this is meant to catch a single ordinary typographic operation that
 * a word-level split fragments into adjacent pieces (e.g. "text - text" -> "text—text": the space
 * before the dash, the dash itself, and the space after are three tokens to `diffWordsWithSpace`
 * but one visible operation to a reader), not to merge unrelated edits that happen to share a
 * line. Not tuned to hit any particular resulting count -- see docs/AUDIT_REMEDIATION note in the
 * Stage 10 correction report for the measured effect on the real corpus. */
export const REVIEW_CHANGE_ADJACENCY_GAP_CODEPOINTS = 2;

/** Hard upper bound, in code points of the *old* span, on how large one `ReviewChange` may grow
 * by merging adjacent `AtomicEdit`s. Reaching it stops the merge (the next edit starts a new
 * `ReviewChange`) rather than either silently producing an unreviewable giant row or aborting the
 * run -- a deterministic split, not a failure. */
export const REVIEW_CHANGE_MAX_OLD_SPAN_CODEPOINTS = 200;

interface AtomicEditGroup {
  edits: AtomicEdit[];
}

/** Groups `atomicEdits` (already sorted by `oldOffset.codePointStart`, non-overlapping) into
 * `AtomicEditGroup`s per the rule above. An edit whose own `before`/`after` contains a line break
 * (a true merge/split) is always its own standalone group -- it never merges with a neighbour,
 * because "this line" is not a well-defined single line for it. Two edits only merge when they
 * sit on the same old line *and* the same new line (guards against merging across a boundary that
 * an intervening, already-consumed edit relocated) and are within the adjacency gap on both
 * sides, and merging would not exceed the size cap. */
function groupAtomicEdits(oldText: string, newText: string, atomicEdits: readonly AtomicEdit[]): AtomicEditGroup[] {
  const groups: AtomicEditGroup[] = [];
  let current: AtomicEdit[] = [];

  const isCrossLine = (e: AtomicEdit): boolean => e.before.includes("\n") || e.after.includes("\n");

  for (const edit of atomicEdits) {
    if (current.length === 0) {
      current = [edit];
      continue;
    }
    const prev = current[current.length - 1] as AtomicEdit;
    const prevOldLine = offsetToLineCol(oldText, prev.oldOffset.codePointEnd).line;
    const curOldLine = offsetToLineCol(oldText, edit.oldOffset.codePointStart).line;
    const prevNewLine = offsetToLineCol(newText, prev.newOffset.codePointEnd).line;
    const curNewLine = offsetToLineCol(newText, edit.newOffset.codePointStart).line;
    const oldGap = edit.oldOffset.codePointStart - prev.oldOffset.codePointEnd;
    const newGap = edit.newOffset.codePointStart - prev.newOffset.codePointEnd;
    const groupOldStart = (current[0] as AtomicEdit).oldOffset.codePointStart;
    const wouldSpan = edit.oldOffset.codePointEnd - groupOldStart;

    const canMerge =
      !isCrossLine(prev) &&
      !isCrossLine(edit) &&
      prevOldLine === curOldLine &&
      prevNewLine === curNewLine &&
      oldGap >= 0 &&
      oldGap <= REVIEW_CHANGE_ADJACENCY_GAP_CODEPOINTS &&
      newGap >= 0 &&
      newGap <= REVIEW_CHANGE_ADJACENCY_GAP_CODEPOINTS &&
      wouldSpan <= REVIEW_CHANGE_MAX_OLD_SPAN_CODEPOINTS;

    if (canMerge) {
      current.push(edit);
    } else {
      groups.push({ edits: current });
      current = [edit];
    }
  }
  if (current.length > 0) groups.push({ edits: current });
  return groups;
}

// ---------------------------------------------------------------------------------------------
// Display context: a small, bounded window of unchanged text for a reviewer.
// ---------------------------------------------------------------------------------------------

const DISPLAY_CONTEXT_CHARS = 40;

/** How much further (in code points) `trimToWordBoundary` may search past the raw radius cut for
 * a whitespace/newline to cut on cleanly, before giving up and hard-cutting mid-word anyway. */
const PREVIEW_WORD_TRIM_SLACK = 15;

const WHITESPACE_CODEPOINTS = new Set([" ", "\t", "\n"]);

/** Trims the *far* edge of a context slice (the edge away from the change) to the nearest
 * whitespace, searching up to `PREVIEW_WORD_TRIM_SLACK` code points further from the change than
 * the raw radius cut, so a preview reads as whole words, not a word sheared in half. Never crosses
 * a newline outward (a line boundary is itself a natural, non-truncating cut). `direction: 1`
 * trims forward (used for the "before" context's leading edge); `direction: -1` trims backward
 * (used for the "after" context's trailing edge). */
function trimToWordBoundary(cps: readonly string[], rawEdge: number, absoluteLimit: number, direction: 1 | -1): { edge: number; truncated: boolean } {
  if (rawEdge === absoluteLimit) return { edge: rawEdge, truncated: false }; // already at file start/end -- nothing omitted
  const slackLimit = direction === 1 ? Math.max(absoluteLimit, rawEdge - PREVIEW_WORD_TRIM_SLACK) : Math.min(absoluteLimit, rawEdge + PREVIEW_WORD_TRIM_SLACK);
  for (let i = rawEdge; direction === 1 ? i > slackLimit : i < slackLimit; i -= direction) {
    const ch = cps[direction === 1 ? i - 1 : i];
    if (ch === "\n") return { edge: direction === 1 ? i : i + 1, truncated: false }; // stop at the line boundary itself
    if (ch !== undefined && WHITESPACE_CODEPOINTS.has(ch)) return { edge: direction === 1 ? i : i + 1, truncated: true };
  }
  return { edge: rawEdge, truncated: true }; // no boundary found within slack -- hard cut, honestly flagged
}

export interface PreviewContext {
  text: string;
  truncated: boolean;
}

/** A word-boundary-trimmed preview window either side of a `ReviewChange`, for a human reader --
 * structurally separate from `before`/`after` (never fed to `escapeNotable`/`detectHighRiskTags`,
 * never used for reconstruction or coverage). Stage 10 Pass A fourth correction: replaces the
 * fixed-radius `displayContext`, which could (and on real corpus data routinely did) cut a
 * preview off mid-word, making an ordinary apostrophe/quote/dash edit unreadable without opening
 * changes.json.
 *
 * Stage 10 Pass A second correction (this pass): builds ONLY from `oldText` (the original file).
 * There is deliberately no equivalent function that slices the full transformed file for a
 * "new-side" preview -- that was the source of the preview-contamination bug (a neighbouring,
 * unrelated `ReviewChange`'s own edit legitimately appears in the transformed file within an
 * ordinary radius window, and showing it as part of THIS item's preview made the decision
 * ambiguous). The isolated "after" picture is built separately, at the `ReviewChange` construction
 * site, by reusing this exact same leading/trailing text (nothing outside `[oldOffset.start,
 * oldOffset.end)` is ever touched by this item's own edits, by construction -- `AtomicEdit`s
 * partition the file with no overlap) together with this item's own `after` text. */
function buildSourcePreviewContext(oldText: string, oldOffset: OffsetRange): { leading: PreviewContext; trailing: PreviewContext } {
  const oldCps = [...oldText];
  const rawLeadingStart = Math.max(0, oldOffset.codePointStart - DISPLAY_CONTEXT_CHARS);
  const rawTrailingEnd = Math.min(oldCps.length, oldOffset.codePointEnd + DISPLAY_CONTEXT_CHARS);

  const leadingTrim = trimToWordBoundary(oldCps, rawLeadingStart, 0, 1);
  const trailingTrim = trimToWordBoundary(oldCps, rawTrailingEnd, oldCps.length, -1);

  return {
    leading: { text: oldCps.slice(leadingTrim.edge, oldOffset.codePointStart).join(""), truncated: leadingTrim.truncated },
    trailing: { text: oldCps.slice(oldOffset.codePointEnd, trailingTrim.edge).join(""), truncated: trailingTrim.truncated },
  };
}

// ---------------------------------------------------------------------------------------------
// IDs: content-stable, never a running counter. See scripts/dogfood/tests for the guarantee this
// buys (an unrelated edit inserted earlier in the file never renames a later, unmoved edit).
// ---------------------------------------------------------------------------------------------

function shortHash(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("␟")).digest("hex").slice(0, 12);
}

function assignAtomicEditIds(path: string, edits: readonly RawAtomicEdit[]): AtomicEdit[] {
  const seen = new Map<string, number>();
  return edits.map((e) => {
    const base = `${path}#a${e.oldOffset.codePointStart}-${e.oldOffset.codePointEnd}-${shortHash([e.before, e.after])}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const id = n === 1 ? base : `${base}-dup${n}`;
    return { id, path, oldOffset: e.oldOffset, newOffset: e.newOffset, before: e.before, after: e.after };
  });
}

// ---------------------------------------------------------------------------------------------
// Public entry point.
// ---------------------------------------------------------------------------------------------

function findEnclosingHunk(hunks: readonly DiffHunk[], oldStartLine: number, oldEndLine: number, newStartLine: number, newEndLine: number): string {
  for (const h of hunks) {
    const oldOk = oldStartLine >= h.oldStart && oldEndLine <= h.oldStart + h.oldLines - 1;
    const newOk = newStartLine >= h.newStart && newEndLine <= h.newStart + h.newLines - 1;
    if (oldOk && newOk) return h.id;
  }
  return "unknown";
}

/** Computes a file's diff once and derives the unified-diff text (`full.diff`), the coarse
 * `DiffHunk` list, the complete `AtomicEdit` set, and the grouped `ReviewChange` list from the
 * same underlying comparison. `relPath` must already be a stable POSIX-relative path. */
export function computeFileDiff(relPath: string, before: string, after: string): FileDiff {
  const patch = structuredPatch(`a/${relPath}`, `b/${relPath}`, before, after, undefined, undefined, {
    context: DIFF_CONTEXT_LINES,
  });
  const diffHunks: DiffHunk[] = patch.hunks.map((h, index) => ({
    id: `${relPath}#h${index}`,
    oldStart: h.oldStart,
    oldLines: h.oldLines,
    newStart: h.newStart,
    newLines: h.newLines,
  }));
  const headerLines = [`--- a/${relPath}`, `+++ b/${relPath}`];
  const bodyLines = patch.hunks.map(
    (h) => `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@\n${h.lines.join("\n")}`,
  );
  const unifiedText = patch.hunks.length === 0 ? "" : [...headerLines, ...bodyLines].join("\n") + "\n";

  const rawEdits = buildAtomicEditsUnpathed(before, after);
  const atomicEdits = assignAtomicEditIds(relPath, rawEdits);
  const reconstruction = verifyReconstruction(before, after, atomicEdits);

  const groups = groupAtomicEdits(before, after, atomicEdits);
  const reviewChanges: ReviewChange[] = groups.map((group) => {
    const first = group.edits[0] as AtomicEdit;
    const last = group.edits[group.edits.length - 1] as AtomicEdit;
    const oldOffset: OffsetRange = {
      codePointStart: first.oldOffset.codePointStart,
      codePointEnd: last.oldOffset.codePointEnd,
      byteStart: first.oldOffset.byteStart,
      byteEnd: last.oldOffset.byteEnd,
    };
    const newOffset: OffsetRange = {
      codePointStart: first.newOffset.codePointStart,
      codePointEnd: last.newOffset.codePointEnd,
      byteStart: first.newOffset.byteStart,
      byteEnd: last.newOffset.byteEnd,
    };
    const groupBefore = codePointSlice(before, oldOffset.codePointStart, oldOffset.codePointEnd);
    const groupAfter = codePointSlice(after, newOffset.codePointStart, newOffset.codePointEnd);
    const beforeEsc = escapeNotable(groupBefore);
    const afterEsc = escapeNotable(groupAfter);
    const oldStartLC = offsetToLineCol(before, oldOffset.codePointStart);
    const oldEndLC = offsetToLineCol(before, oldOffset.codePointEnd); // exclusive -- see oldLineCol's doc comment
    const newStartLC = offsetToLineCol(after, newOffset.codePointStart);
    const newEndLC = offsetToLineCol(after, newOffset.codePointEnd); // exclusive
    // Hunk containment is about which physical lines the change's content actually touches, so it
    // uses the *last included* code point's line (inclusive), not the exclusive `end` reported to
    // callers above -- a change whose content ends exactly at a line boundary would otherwise
    // appear to start touching a line it never contains any text from.
    const oldLastIncludedLine = offsetToLineCol(before, Math.max(oldOffset.codePointStart, oldOffset.codePointEnd - 1)).line;
    const newLastIncludedLine = offsetToLineCol(after, Math.max(newOffset.codePointStart, newOffset.codePointEnd - 1)).line;
    const crossLineEdit = group.edits.some((e) => e.before.includes("\n") || e.after.includes("\n"));
    const src = buildSourcePreviewContext(before, oldOffset);
    // Marks are window-relative to `before`/`after` respectively -- each grouped AtomicEdit gets
    // its own mark, not one envelope over the whole group (task item 1's multi-atomic requirement).
    const oldMarks: EditMark[] = group.edits.map((e) => ({
      start: e.oldOffset.codePointStart - oldOffset.codePointStart,
      end: e.oldOffset.codePointEnd - oldOffset.codePointStart,
    }));
    const newMarks: EditMark[] = group.edits.map((e) => ({
      start: e.newOffset.codePointStart - newOffset.codePointStart,
      end: e.newOffset.codePointEnd - newOffset.codePointStart,
    }));
    const idBase = `${relPath}#r${oldOffset.codePointStart}-${oldOffset.codePointEnd}-${shortHash(group.edits.map((e) => e.id))}`;
    return {
      id: idBase,
      path: relPath,
      diffHunkId: findEnclosingHunk(diffHunks, oldStartLC.line, oldLastIncludedLine, newStartLC.line, newLastIncludedLine),
      atomicEditIds: group.edits.map((e) => e.id),
      oldOffset,
      newOffset,
      oldLineCol: { start: oldStartLC, end: oldEndLC },
      newLineCol: { start: newStartLC, end: newEndLC },
      before: groupBefore,
      after: groupAfter,
      beforeEscaped: beforeEsc.escaped,
      afterEscaped: afterEsc.escaped,
      notableCodePoints: mergeNotable(beforeEsc.notable, afterEsc.notable),
      codePointDelta: computeCodePointDelta(groupBefore, groupAfter),
      crossLineEdit,
      oldMarks,
      newMarks,
      // isolatedAfterPreview's leading/trailing are literally the source preview's leading/trailing
      // -- no other edit ever touches this item's own leading/trailing window (AtomicEdits
      // partition the file with no overlap), so "apply only this item's edits to the source
      // window" leaves those two pieces unchanged by construction.
      previewOldLeading: src.leading,
      previewOldTrailing: src.trailing,
      previewIsolatedLeading: src.leading,
      previewIsolatedTrailing: src.trailing,
    };
  });

  return {
    path: relPath,
    unifiedText,
    diffHunks,
    atomicEdits,
    reviewChanges,
    reconstruction,
    oldLineCount: before.split("\n").length,
    newLineCount: after.split("\n").length,
  };
}
