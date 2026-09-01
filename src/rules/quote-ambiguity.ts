import { toCodePoints } from "../engine/codepoints.js";
import { isLetter } from "../engine/unicode.js";
import { NONE } from "../engine/sentinels.js";
import type { ElisionIdiom } from "../types.js";

/**
 * Shared, runtime-independent structural predicate consumed identically by `quotes` (order 40)
 * and `apostrophe` (order 50) — spec 0.5.0, quotes.md 3.2a and apostrophe.md 3.4. One module, one
 * definition of "ambiguous medial single-quote span", so the two rules cannot drift into two
 * approximations of the same shape.
 *
 * The shape: a pair of straight ASCII single quotes (U+0027) enclosing 1-3 `LETTER` code points,
 * with at least one `INLINE-SPACE` code point immediately outside each mark — `rock 'n' roll`,
 * `rock  'n'  roll` (doubled spaces), `She chose 'A' today`, `They said 'no' yesterday`. Only the
 * single code point immediately adjacent to each mark is tested; a longer run of inline spaces
 * further out does not invalidate the match — narrowing this to "exactly one" would reintroduce
 * false-positive quotation conversion for doubled-space input, which is worse than the false
 * negative this predicate already accepts (spec 0.5.0 correction; see quotes.md 3.2's own note).
 * Without a matching `quotes.elisionIdioms`
 * entry, neither `quotes` nor `apostrophe` may touch either mark: `quotes` must not pair them as
 * an ordinary quotation, and `apostrophe`'s own structural case ladder (which would otherwise
 * independently read the left mark as a leading elision and the right one as a trailing
 * possessive/elision — apostrophe.md 3.3 cases 3 and 4 — and convert both to U+2019 without ever
 * knowing about the idiom mechanism) must not convert them either. Preserving the author's ASCII
 * marks is a deliberate bounded false negative, preferred over inventing a quotation mark or an
 * apostrophe (spec/AUDIT_REMEDIATION_AND_RELEASE_PLAN.md 3.1: "False negatives are preferable to
 * text damage").
 *
 * This predicate is **shape-only** and does not itself decide correctness — an exact
 * `elisionIdioms` match (the existing, narrower, locale-cited mechanism — quotes.md 3.2, spec
 * 0.4.0) still takes priority and is computed separately by {@link computeIdiomMatchedIndices};
 * this module's {@link computeAmbiguousShapeIndices} finds the full structural shape regardless
 * of any idiom, and the caller subtracts the idiom-matched positions to get the set that must be
 * preserved.
 */

const SQ = 0x27;
const MIN_ENCLOSED = 1;
const MAX_ENCLOSED = 3;

/** quotes.md 3.1 NARROW — the quote-mark glyphs an elision idiom's marks may appear as across
 * pipeline passes (straight, or already curled by an earlier pass). Canonical definition, shared
 * so `quotes` and `apostrophe` cannot define two slightly different NARROW sets. */
export const NARROW: ReadonlySet<number> = new Set([
  0x27, 0x2018, 0x2019, 0x201a, 0x201b, 0x2039, 0x203a,
]);

/** quotes.md 3.1 INLINE-SPACE — deliberately excludes BREAK, so this shape never crosses a
 * line/span boundary (modes.md 3.3), matching the existing elisionIdioms anchor exactly. */
const INLINE_SPACE: ReadonlySet<number> = new Set([
  0x20, 0x09, 0xa0, 0x202f, 0x2007, 0x2009, 0x200a,
]);

/** Out-of-range reads yield `NONE`, the spec's own boundary value. */
function at(cp: readonly number[], i: number): number {
  const value = cp[i];
  return value === undefined ? NONE : value;
}

/**
 * Case-insensitive-first-code-point comparison, ASCII-only — the same convention
 * `nbsp.afterShortWords` and the existing idiom matcher use (quotes.ts's own `asciiLower`,
 * relocated here so both consumers share one definition).
 */
function asciiLower(cp: number): number {
  return cp >= 0x41 && cp <= 0x5a ? cp + 0x20 : cp;
}

function isAlnum(cp: number): boolean {
  const DIGIT_ZERO = 0x30;
  const DIGIT_NINE = 0x39;
  return (cp >= DIGIT_ZERO && cp <= DIGIT_NINE) || isLetter(cp);
}

function wordEndsAt(arr: readonly number[], end: number, word: readonly number[]): boolean {
  const start = end - word.length;
  if (start < 0) return false;
  for (let k = 0; k < word.length; k += 1) {
    const c = at(arr, start + k);
    const matches = k === 0 ? asciiLower(c) === asciiLower(word[k] as number) : c === word[k];
    if (!matches) return false;
  }
  const before = start > 0 ? at(arr, start - 1) : NONE;
  return before === NONE || !isAlnum(before);
}

function wordStartsAt(arr: readonly number[], start: number, word: readonly number[]): boolean {
  const n = arr.length;
  for (let k = 0; k < word.length; k += 1) {
    const c = at(arr, start + k);
    const matches = k === 0 ? asciiLower(c) === asciiLower(word[k] as number) : c === word[k];
    if (!matches) return false;
  }
  const after = start + word.length < n ? at(arr, start + word.length) : NONE;
  return after === NONE || !isAlnum(after);
}

interface CompiledIdiom {
  readonly left: readonly number[];
  readonly elided: readonly number[];
  readonly right: readonly number[];
}

/**
 * Listed elision veto (quotes.md 3.2, spec 0.4.0), locale data `quotes.elisionIdioms`. Bounded
 * literal scan for `left, NARROW, elided, NARROW, right` (`rock 'n' roll`'s `{left: "rock",
 * elided: "n", right: "roll"}`). Both marks of a match are returned. Matches on NARROW quote
 * marks generally (U+0027 and already-curly U+2018/U+2019), not only straight ASCII — this is
 * `quotes`' own idempotency requirement (an idiom must still veto pairing on a second pipeline
 * pass, after `apostrophe` has curled the marks) and is unchanged from spec 0.4.0/0.4.1.
 */
export function computeIdiomMatchedIndices(
  arr: readonly number[],
  idioms: readonly ElisionIdiom[],
): ReadonlySet<number> {
  const vetoed = new Set<number>();
  if (idioms.length === 0) return vetoed;

  const n = arr.length;
  const compiled: readonly CompiledIdiom[] = idioms.map((idiom) => ({
    left: toCodePoints(idiom.left),
    elided: toCodePoints(idiom.elided),
    right: toCodePoints(idiom.right),
  }));

  for (let i = 0; i < n; i += 1) {
    const g = at(arr, i);
    if (!NARROW.has(g)) continue;

    const lLit = i > 0 ? at(arr, i - 1) : NONE;
    if (lLit === NONE || !INLINE_SPACE.has(lLit)) continue;

    for (const idiom of compiled) {
      const k = idiom.elided.length;
      const j = i + 1 + k;
      if (j >= n) continue;

      let elidedMatches = true;
      for (let w = 0; w < k; w += 1) {
        if (at(arr, i + 1 + w) !== idiom.elided[w]) {
          elidedMatches = false;
          break;
        }
      }
      if (!elidedMatches) continue;
      if (!NARROW.has(at(arr, j))) continue;

      const rLit = j + 1 < n ? at(arr, j + 1) : NONE;
      if (rLit === NONE || !INLINE_SPACE.has(rLit)) continue;

      if (!wordEndsAt(arr, i - 1, idiom.left)) continue;
      if (!wordStartsAt(arr, j + 2, idiom.right)) continue;

      vetoed.add(i);
      vetoed.add(j);
    }
  }

  return vetoed;
}

/**
 * The general ambiguous-medial-span shape, locale-independent: a pair of **straight ASCII**
 * single quotes (U+0027 only — an already-curly U+2019/U+2018 pair is out of this predicate's
 * scope by construction, see the module comment) enclosing 1-3 `LETTER` code points, with **at
 * least one** `INLINE-SPACE` code point immediately outside each mark — a longer run of inline
 * spaces (`rock  'n'  roll`) still matches, since only the single adjacent code point is tested.
 * Both mark positions are returned for every match. A superset of
 * {@link computeIdiomMatchedIndices}'s output whenever an idiom's `elided` field is itself 1-3
 * letters (true of every idiom shipped so far), but computed independently rather than assumed,
 * since a future idiom's `elided` field is not required to be that short.
 */
export function computeAmbiguousShapeIndices(cp: readonly number[]): ReadonlySet<number> {
  const ambiguous = new Set<number>();
  const n = cp.length;

  for (let i = 0; i < n; i += 1) {
    if (at(cp, i) !== SQ) continue;

    const lLit = i > 0 ? at(cp, i - 1) : NONE;
    if (lLit === NONE || !INLINE_SPACE.has(lLit)) continue;

    let k = 0;
    while (k < MAX_ENCLOSED && isLetter(at(cp, i + 1 + k))) k += 1;
    if (k < MIN_ENCLOSED) continue;

    const j = i + 1 + k;
    if (at(cp, j) !== SQ) continue;

    const rLit = j + 1 < n ? at(cp, j + 1) : NONE;
    if (rLit === NONE || !INLINE_SPACE.has(rLit)) continue;

    ambiguous.add(i);
    ambiguous.add(j);
  }

  return ambiguous;
}

/**
 * The set of straight-ASCII-quote index positions that must be preserved byte-identically by
 * both `quotes` and `apostrophe`: ambiguous-shaped, but with no matching cited idiom. Computed
 * once and consumed by both rules — see the module comment.
 */
export function computePreserveIndices(
  cp: readonly number[],
  idioms: readonly ElisionIdiom[],
): ReadonlySet<number> {
  const ambiguous = computeAmbiguousShapeIndices(cp);
  if (ambiguous.size === 0) return ambiguous;
  const idiomMatched = computeIdiomMatchedIndices(cp, idioms);
  if (idiomMatched.size === 0) return ambiguous;

  const preserve = new Set<number>();
  for (const index of ambiguous) {
    if (!idiomMatched.has(index)) preserve.add(index);
  }
  return preserve;
}
