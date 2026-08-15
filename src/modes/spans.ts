import { toCodePoints } from "../engine/codepoints.js";
import { isMarker, LINE_MARKER, MARKER } from "../engine/sentinels.js";
import { PolytypoError } from "../errors.js";
import type { Edit } from "../types.js";

/**
 * The boundary markers are defined in the engine (src/engine/sentinels.ts), which is where all
 * three non-code-point sentinels live and where their disjointness is maintained. They are
 * re-exported here because the mode layer is what writes them into the array.
 *
 * Which marker separates two spans is decided by the **raw source bytes of the gap between
 * them**, so it is decidable without asking the parser anything and is identical in five
 * runtimes: a gap containing a line terminator gives `LINE_MARKER`, anything else `MARKER`.
 */
export { LINE_MARKER, MARKER, isMarker } from "../engine/sentinels.js";

/** `BREAK` as the rules define it (`spaces.md` 3.1), tested against the gap's raw source. */
const LINE_TERMINATORS: ReadonlySet<number> = new Set([
  0x0a, 0x0d, 0x0b, 0x0c, 0x85, 0x2028, 0x2029,
]);

function gapIsLineBoundary(source: string, from: number, to: number): boolean {
  for (let i = from; i < to; i += 1) {
    if (LINE_TERMINATORS.has(source.charCodeAt(i))) return true;
  }
  return false;
}

/**
 * A processable span, identified by its offsets in the **original source**. Offsets are UTF-16
 * indices into the JS source string, which is what every JS parser reports; they are an
 * implementation detail of this runtime and never reach the rules, which index code points.
 */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/** A span's extent in the concatenated code-point array: `s₀` and `s₁` of modes.md 3.4. */
export interface SpanRange {
  readonly first: number;
  readonly last: number;
}

/**
 * Sort, drop empties, and coalesce spans separated by nothing in the source (modes.md 7.5:
 * a parser that reports one text run as two adjacent nodes must not manufacture a boundary).
 * Overlapping spans are an extractor bug and are rejected rather than silently merged.
 */
export function normalizeSpans(spans: readonly Span[]): Span[] {
  const sorted = spans.filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  for (const span of sorted) {
    const last = out[out.length - 1];
    if (last === undefined) {
      out.push(span);
      continue;
    }
    if (span.start < last.end) {
      throw new PolytypoError(
        "POLYTYPO_RULE_CONTRACT",
        `mode extractor produced overlapping spans (${last.start}, ${last.end}) and (${span.start}, ${span.end})`,
      );
    }
    if (span.start === last.end) {
      out[out.length - 1] = { start: last.start, end: span.end };
      continue;
    }
    out.push(span);
  }
  return out;
}

/** `S₁ ⌢ [marker] ⌢ S₂ ⌢ … ⌢ Sₘ` (modes.md 3.5 step 2). */
export function concatenateSpans(source: string, spans: readonly Span[]): number[] {
  const cp: number[] = [];
  let previous: Span | undefined;
  for (const span of spans) {
    if (previous !== undefined) {
      cp.push(gapIsLineBoundary(source, previous.end, span.start) ? LINE_MARKER : MARKER);
    }
    for (const value of toCodePoints(source.slice(span.start, span.end))) cp.push(value);
    previous = span;
  }
  return cp;
}

/**
 * The span extents of the array as it stands. Recomputed after every rule, because applying
 * edits shifts every index after the first one — the markers themselves are guaranteed to
 * survive, since no edit may contain one.
 */
export function spanRangesOf(cp: readonly number[]): SpanRange[] {
  const ranges: SpanRange[] = [];
  let first = 0;
  for (let i = 0; i < cp.length; i += 1) {
    if (isMarker(cp[i] as number)) {
      ranges.push({ first, last: i - 1 });
      first = i + 1;
    }
  }
  ranges.push({ first, last: cp.length - 1 });
  return ranges;
}

function spanContaining(ranges: readonly SpanRange[], p: number): SpanRange | undefined {
  for (const range of ranges) {
    if (p >= range.first && p <= range.last + 1) return range;
  }
  return undefined;
}

/**
 * modes.md 3.4, two safety nets, both pure functions of `(p, q, r, s₀, s₁)` — so the verdict is
 * identical on every run, which is what makes redistribution deterministic (modes.md 5, point 3).
 *
 * 1. **No edit may contain a marker.** No rule can produce one; one that does is a bug, and the
 *    edit is discarded rather than treated as a redistribution question.
 * 2. **The edge-growth rule.** An edit is discarded if it would place code points at an
 *    extremity of its span that were not there before: with `d = q - p + 1` the replaced length
 *    and `r` the replacement length, discard when `p = s₀ and r > d`, or `q = s₁ and r > d`.
 *
 * The length test is the whole rule and needs no knowledge of Markdown or HTML syntax. It
 * separates exactly the cases that matter: `"` → `“` at an edge is 1 → 1 and applies; `--` →
 * `␣–␣` at an edge is 2 → 3 and is discarded, while the same edit interior to a span applies;
 * `(c)` → `©` is 3 → 1 and applies, because shrinking is always safe. An insertion has `d = 0`,
 * so it is discarded exactly when its position coincides with a span edge — the rule this one
 * generalises.
 *
 * **Deletion at an edge is not restricted here**, and must not be: `r > d` is false for a
 * deletion, so this filter never sees one. Deletion at an edge is governed by modes.md 3.3's
 * *Edge tests* clause instead — where a rule asks "am I at the edge of the text I am allowed to
 * modify" rather than "what character is here", the marker behaves as `NONE`. That clause is the
 * one place a rule may treat a span edge as the end of the text, it exists because `spaces` is
 * the only rule that deletes, and 3.3 states the division: **a rule that deletes must treat a
 * span edge as the end of the text; a rule that replaces or inserts must not, and is governed by
 * this filter.** The single test that claims the clause is `spaces.md` 3.2 step 4.
 */
export function filterBoundaryEdits(
  cp: readonly number[],
  edits: readonly Edit[],
  ranges: readonly SpanRange[],
): Edit[] {
  const out: Edit[] = [];
  for (const edit of edits) {
    let containsMarker = false;
    for (let i = edit.start; i < edit.end; i += 1) {
      if (isMarker(cp[i] as number)) {
        containsMarker = true;
        break;
      }
    }
    if (containsMarker) continue;

    // `[start, end)` in the engine's half-open form is `cp[p … q]` with p = start, q = end - 1;
    // an insertion is `q = p - 1`, which falls out of the same expression.
    const p = edit.start;
    const q = edit.end - 1;
    const d = edit.end - edit.start;
    const r = edit.replacement.length;
    const span = spanContaining(ranges, p);
    if (span !== undefined && r > d && (p === span.first || q === span.last)) continue;

    out.push(edit);
  }
  return out;
}

/** Redistribute the transformed array back to one piece per span (modes.md 3.5 step 4). */
export function splitOnMarker(cp: readonly number[], expected: number): number[][] {
  const pieces: number[][] = [[]];
  for (const value of cp) {
    if (isMarker(value)) {
      pieces.push([]);
      continue;
    }
    (pieces[pieces.length - 1] as number[]).push(value);
  }
  if (pieces.length !== expected) {
    throw new PolytypoError(
      "POLYTYPO_RULE_CONTRACT",
      `boundary markers did not survive the pipeline: expected ${expected} spans, found ${pieces.length}`,
    );
  }
  return pieces;
}
