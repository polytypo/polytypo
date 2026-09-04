import { toCodePoints } from "../engine/codepoints.js";
import { isLetter } from "../engine/unicode.js";
import { LINE_MARKER, MARKER, NONE } from "../engine/sentinels.js";
import type { Edit, ElisionIdiom, LocaleData, QuotePair, Rule, RuleContext } from "../types.js";
import {
  NARROW,
  computeAmbiguousShapeIndices,
  computeIdiomMatchedIndices,
} from "./quote-ambiguity.js";

/**
 * `quotes` — spec/rules/quotes.md (spec 0.4.1), order 40.
 *
 * Mandate 1 (every existing quote glyph is a re-typesetting candidate) and mandate 2 (a space
 * touching a quote mark is sloppiness, not evidence) replace 0.1.0's whole architecture, whose
 * idempotency rested on never reading this rule's own curly output. Five passes plus an emit;
 * no backtracking inside a pass, no regular expression, no native-string indexing
 * (ARCHITECTURE.md 4.1, 4.2).
 */

const DIGIT_ZERO = 0x30;
const DIGIT_NINE = 0x39;

/**
 * spec 3.2 `V1ID` (spec 0.4.1) — a **conservative over-approximation**, not a claim that every
 * U+0027 becomes U+2019. `apostrophe` (R₆) only ever *emits* U+2019 for a U+0027 (never any
 * other code point), but its own case ladder leaves a U+0027 unedited under the prime guard
 * (case 1: `6' 2"`) and case 5 (`a ' b`, `''`) — `apostrophe.md` §5 names both as surviving to
 * the second run unedited. `V1ID` cannot know, from inside `quotes`, which outcome a given
 * U+0027 will get without re-deriving `apostrophe`'s verdict against `quotes`' own final output
 * — circular, since that output is what this rule is computing — so it treats every U+0027 as
 * *possibly* about to become U+2019 and every U+2019 as *possibly* a U+0027 that already did.
 *
 * **What "conservative" bounds, and what it does not.** At this single comparison, `V1ID` can
 * only ever *add* a veto (merge two identities that raw equality would have kept apart) — it
 * never grants `canOpen`/`canClose` to a candidate that would not otherwise have had it. It does
 * **not** follow that the rule's final output only ever declines more and converts less: pass 2
 * (`pairCandidates`) and pass 4 (`certify`) are global over the whole candidate list, and removing
 * one candidate can remove a crossing pair, a nesting conflict, or a certification-gate
 * instability that was previously making a *different, unrelated* pair fail to certify. An extra
 * local veto can therefore *indirectly* let another pair certify, reassign depth/glyphs, or
 * change what `nbsp` (order 70) later inserts — the reported counterexample is exactly this: V1ID
 * declining the crossing `NARROW` pair is what lets the `WIDE` pair certify on pass 1 instead of
 * being caught in the same gate rejection. See quotes.md §5, Lemma A / Corollary A1 and the "V1ID
 * empirical audit" section for the bound this actually rests on — inspection of every globally
 * changed output within a reproducible sweep, not a monotonicity claim.
 */
const SQ = 0x27;
const RIGHT_SINGLE_QUOTE = 0x2019;
function v1Identity(cp: number): number {
  return cp === SQ ? RIGHT_SINGLE_QUOTE : cp;
}

/** spec 3.1 `WIDE` / `NARROW`. `WIDE ∪ NARROW = QUOTEMARK`, and the two are disjoint. `NARROW`
 * is imported from `./quote-ambiguity.js`, shared with `apostrophe` (spec 0.5.0). */
const WIDE: ReadonlySet<number> = new Set([
  0x22, 0xab, 0xbb, 0x201c, 0x201d, 0x201e, 0x201f, 0x301d, 0x301e, 0x301f,
]);

function isQuoteMark(cp: number): boolean {
  return WIDE.has(cp) || NARROW.has(cp);
}

/**
 * spec 3.1 `INLINE-SPACE` — split out of `SPACELIKE` because §3.2's skip walks read this class
 * alone. `MARKER`/`LINE_MARKER` are deliberately absent, so no skip walk ever crosses a span
 * boundary or a line terminator (modes.md 3.3).
 */
const INLINE_SPACE: ReadonlySet<number> = new Set([
  0x20, 0x09, 0xa0, 0x202f, 0x2007, 0x2009, 0x200a,
]);

/** spec 3.1 `BREAK`, including the line-boundary marker (modes.md 3.2). */
const BREAK: ReadonlySet<number> = new Set([
  0x0a,
  0x0d,
  0x0b,
  0x0c,
  0x85,
  0x2028,
  0x2029,
  LINE_MARKER,
]);

const SPACELIKE: ReadonlySet<number> = new Set([...INLINE_SPACE, ...BREAK]);

/**
 * spec 3.1 `OPENISH` / `CLOSEISH`. `QUOTEMARK` is a member of **both**, and is exempt from
 * `canOpen`'s closeish rejection — Lemma A's entire mechanism (spec 5). Do not "simplify" this
 * back to per-glyph lists: it is what makes a candidate's verdict independent of *which* quote
 * glyph its neighbour is.
 */
const OPENISH: ReadonlySet<number> = new Set([MARKER, 0x28, 0x5b, 0x7b, ...WIDE, ...NARROW]);

const CLOSEISH: ReadonlySet<number> = new Set([
  MARKER,
  0x29,
  0x5d,
  0x7d,
  0x2c,
  0x2e,
  0x3b,
  0x3a,
  0x21,
  0x3f,
  0x2026,
  0x2013,
  0x2014,
  ...WIDE,
  ...NARROW,
]);

/** spec 3.1 `DASHISH`. U+2011 because `hyphen` (order 35) converts U+002D to it. */
const DASHISH: ReadonlySet<number> = new Set([0x2d, 0x2011, 0x2013, 0x2014]);

/** Out-of-range reads yield `NONE`, the spec's own boundary value. */
function at(cp: readonly number[], i: number): number {
  const value = cp[i];
  return value === undefined ? NONE : value;
}

function isDigit(cp: number): boolean {
  return cp >= DIGIT_ZERO && cp <= DIGIT_NINE;
}

function isAlnum(cp: number): boolean {
  return isDigit(cp) || isLetter(cp);
}

/** spec 3.1 `DELETE-LANDING` — the largest landing class for which every earlier-ordered rule's own classes are unaffected by a quote glyph or a U+0020 (spec 3.7, composition obligation). */
function isDeleteLanding(cp: number): boolean {
  return isAlnum(cp) || isQuoteMark(cp);
}

/** The straight-line walk of spec 3.2: step outward across a maximal `INLINE-SPACE` run. */
function skipLeft(arr: readonly number[], i: number): number {
  let j = i - 1;
  while (j >= 0 && INLINE_SPACE.has(arr[j] as number)) j -= 1;
  return j >= 0 ? (arr[j] as number) : NONE;
}

function skipRight(arr: readonly number[], i: number): number {
  const n = arr.length;
  let j = i + 1;
  while (j < n && INLINE_SPACE.has(arr[j] as number)) j += 1;
  return j < n ? (arr[j] as number) : NONE;
}

interface Candidate {
  readonly index: number;
  readonly wide: boolean;
  readonly canOpen: boolean;
  readonly canClose: boolean;
}

interface Pair {
  readonly open: number;
  readonly close: number;
}

interface SkipSets {
  readonly spaceRight: ReadonlySet<number>;
  readonly spaceLeft: ReadonlySet<number>;
}

function glyphCodePoint(s: string): number {
  return toCodePoints(s)[0] as number;
}

/**
 * spec 3.1a — locale-derived skip sets, computed once per call. These are exactly the
 * positions at which `nbsp` N8 can insert a space (nbsp.md 3.10), which is what makes Lemma B's
 * coverage exact rather than a survey.
 */
function computeSkipSets(locale: LocaleData): SkipSets {
  const spaceRight = new Set<number>();
  const spaceLeft = new Set<number>();
  for (const pair of [locale.quotes.primary, locale.quotes.secondary]) {
    if (pair.innerSpace === "none") continue;
    const open = glyphCodePoint(pair.open);
    const close = glyphCodePoint(pair.close);
    if (open === close) continue;
    spaceRight.add(open);
    spaceLeft.add(close);
  }
  return { spaceRight, spaceLeft };
}

/**
 * Pass 1 — collect and classify candidates (spec 3.2). `canOpen` always skips right and
 * `canClose` always skips left (mandate 2's inner-side skip); the outer side skips only when
 * `nbsp` can reach it (the locale-derived `spaceRight`/`spaceLeft` sets), which is what keeps
 * every verdict inert to `nbsp` (Lemma B).
 */
function collectCandidates(
  arr: readonly number[],
  skip: SkipSets,
  elisionIdioms: readonly ElisionIdiom[],
): Candidate[] {
  const n = arr.length;
  const candidates: Candidate[] = [];
  // spec 0.5.0: the veto set is the UNION of the cited-idiom match (unchanged since 0.4.0) and
  // the general ambiguous-medial-span shape (quotes.md 3.2a) — `quotes` must decline pairing for
  // both, so that `apostrophe`'s own case ladder never independently "fixes" a shape `quotes`
  // left alone (the shared-predicate module's own doc comment explains why that would
  // reintroduce the class of bug the listed-idiom design exists to prevent).
  const idiomMatched = computeIdiomMatchedIndices(arr, elisionIdioms);
  const ambiguousShape = computeAmbiguousShapeIndices(arr);
  const elisionVetoed =
    ambiguousShape.size === 0
      ? idiomMatched
      : idiomMatched.size === 0
        ? ambiguousShape
        : new Set([...idiomMatched, ...ambiguousShape]);

  for (let i = 0; i < n; i += 1) {
    const g = at(arr, i);
    if (!isQuoteMark(g)) continue;

    const lLit = i > 0 ? at(arr, i - 1) : NONE;
    const rLit = i + 1 < n ? at(arr, i + 1) : NONE;
    const lSkip = skipLeft(arr, i);
    const rSkip = skipRight(arr, i);

    const openLeft = skip.spaceLeft.has(g) ? lSkip : lLit;
    const closeRight = skip.spaceRight.has(g) ? rSkip : rLit;

    let canOpen =
      (openLeft === NONE ||
        SPACELIKE.has(openLeft) ||
        OPENISH.has(openLeft) ||
        DASHISH.has(openLeft)) &&
      rSkip !== NONE &&
      !SPACELIKE.has(rSkip) &&
      (!CLOSEISH.has(rSkip) || isQuoteMark(rSkip) || rSkip === MARKER);

    let canClose =
      lSkip !== NONE &&
      !SPACELIKE.has(lSkip) &&
      (closeRight === NONE ||
        SPACELIKE.has(closeRight) ||
        CLOSEISH.has(closeRight) ||
        DASHISH.has(closeRight));

    // Medial-elision veto (spec 3.2), `NARROW` marks only, literal reads: `don't`, `l'été`,
    // `O'Brien`, `1990's` — and, on a second pipeline pass, `don't` with U+2019, because
    // `apostrophe` has converted the mark and U+2019 is also `NARROW`.
    if (NARROW.has(g) && lLit !== NONE && rLit !== NONE && isAlnum(lLit) && isAlnum(rLit)) {
      canOpen = false;
      canClose = false;
    }

    // Listed elision veto (spec 3.2, spec 0.4.0): both capabilities of a mark found by the
    // pre-pass above are forced false, overriding every other test in this loop.
    if (elisionVetoed.has(i)) {
      canOpen = false;
      canClose = false;
    }

    // V1 — same-V1-identity adjacency veto (spec 3.2), both widths: `""`, `''`, `««`, `””` —
    // literal adjacency under `v1Identity` (`v1Identity` is the identity function everywhere
    // except U+0027, see its definition above), **plus** the same shape separated by exactly one
    // INLINE-SPACE code point at a position `nbsp` can insert or remove. The second clause is
    // narrow on purpose:
    // it fires only when the space-or-not gap sits immediately after a `SPACE-RIGHT` glyph (on
    // the left) or immediately before a `SPACE-LEFT` glyph (on the right) — the two positions
    // Lemma B (spec 5) enumerates as `nbsp`'s entire insertion surface next to a quote mark.
    // Without it, a pairing the gate declines when the gap is absent can certify once `nbsp`
    // (a *later* rule) inserts the gap on a subsequent pipeline pass — a composition-obligation
    // violation, since `quotes` must be a no-op on its own already-settled output regardless of
    // whether `nbsp` has acted yet. A plain skip-based V1 (comparing `Lskip`/`Rskip` to `g`
    // unconditionally) was tried and rejected: it also vetoes two *genuinely distinct*
    // quotations separated by an ordinary word space (`'a' 'b'`), which is ordinary prose, not
    // an artefact — the veto must depend on the *locale's* `SPACE-RIGHT`/`SPACE-LEFT` sets, not
    // fire on every space-separated repeat of a glyph.
    // `g` is shared identically between a candidate and the same-glyph neighbour reached by a
    // skip, so it does not matter here which of the two sits on which side of the gap: nbsp
    // can insert there iff `g` plays *either* spaced role (it opens on its own right, or closes
    // on its own left) for this locale.
    //
    // Every comparison below reads `v1Identity`, not the raw code point (spec 3.2 `V1ID`, spec
    // 0.4.1) — a *conservative* closure, not a claim that every U+0027 becomes U+2019.
    // `apostrophe` (R₆) only ever emits U+2019 for a U+0027, but its own case ladder leaves some
    // U+0027s unedited (prime guard, case 5); `v1Identity`'s definition above explains why
    // `quotes` cannot know which without a circular re-derivation of `apostrophe`'s verdict
    // against its own output. Without this closure, a literal U+0027-vs-U+2019 comparison here
    // gives a different verdict before and after `apostrophe` edits a neighbour between two
    // pipeline passes — a composition-obligation violation against this rule's own idempotency
    // (quotes.md §5, Lemma A / Corollary A1). At *this* comparison the effect is one-directional
    // — an extra veto on a mixed U+0027/U+2019 adjacency, never a granted capability — but that is
    // a local fact about this line, not a claim about the rule's final output: declining one
    // candidate here can remove a crossing/nesting/certification conflict downstream (passes 2
    // and 4 are global over the whole candidate list) and thereby let a *different* pair certify
    // that previously could not. See the module comment on `v1Identity` above.
    const gV1 = v1Identity(g);
    const gapIsNbspInsertable = skip.spaceRight.has(g) || skip.spaceLeft.has(g);
    const leftVetoed =
      v1Identity(lLit) === gV1 ||
      (lLit !== NONE && INLINE_SPACE.has(lLit) && v1Identity(lSkip) === gV1 && gapIsNbspInsertable);
    const rightVetoed =
      v1Identity(rLit) === gV1 ||
      (rLit !== NONE && INLINE_SPACE.has(rLit) && v1Identity(rSkip) === gV1 && gapIsNbspInsertable);
    if (leftVetoed || rightVetoed) {
      canOpen = false;
      canClose = false;
    }

    if (canOpen || canClose) {
      candidates.push({ index: i, wide: WIDE.has(g), canOpen, canClose });
    }
  }

  return candidates;
}

/** spec 3.3 `vacuous(a, b)`. Vacuously true when `b = a + 1`. */
function isVacuous(arr: readonly number[], a: number, b: number): boolean {
  for (let k = a + 1; k < b; k += 1) {
    if (!INLINE_SPACE.has(arr[k] as number)) return false;
  }
  return true;
}

/**
 * Pass 2 — pair the candidates, one stack per width (spec 3.3). Closing is tried before
 * opening; a candidate reaches exactly one of three outcomes (paired, pushed, unmatched), and a
 * closer that fails the vacuity condition falls through to step 2 and then step 3 rather than
 * being discarded — the exhaustive three-outcome shape the certification gate depends on.
 */
function pairCandidates(arr: readonly number[], candidates: readonly Candidate[]): Pair[] {
  const wideStack: Candidate[] = [];
  const narrowStack: Candidate[] = [];
  const pairs: Pair[] = [];

  for (const c of candidates) {
    const stack = c.wide ? wideStack : narrowStack;
    const top = stack[stack.length - 1];
    if (c.canClose && top !== undefined && !isVacuous(arr, top.index, c.index)) {
      stack.pop();
      pairs.push({ open: top.index, close: c.index });
      continue;
    }
    if (c.canOpen) stack.push(c);
  }

  return pairs;
}

/**
 * Pass 3 — depth over the *accepted* set, never the raw pass-2 output (spec 3.4). On a second
 * run the accepted set is the raw set, so a depth taken over the raw set on run 1 and the
 * accepted set on run 2 would disagree whenever the gate declined anything.
 */
function depthOf(pairs: readonly Pair[], p: Pair): number {
  let depth = 1;
  for (const q of pairs) {
    if (q.open < p.open && p.close < q.close) depth += 1;
  }
  return depth;
}

function pairFor(ctx: RuleContext, depth: number): QuotePair {
  return depth % 2 === 1 ? ctx.locale.quotes.primary : ctx.locale.quotes.secondary;
}

interface RenderPlan {
  /** index (in `arr`) -> replacement code point, for every mark in an accepted pair. */
  readonly replace: ReadonlyMap<number, number>;
  /** indices (in `arr`) to delete: the inner-run deletions the landing guard permitted. */
  readonly deleteIndices: ReadonlySet<number>;
}

/**
 * spec 3.5 `render`'s glyph/deletion plan, shared by the certification gate's hypothetical and
 * the real emit (pass 5) — the only difference between them is whether the plan is applied to a
 * throwaway array or actually returned as edits.
 */
function computeRenderPlan(
  arr: readonly number[],
  accepted: readonly Pair[],
  ctx: RuleContext,
): RenderPlan {
  const replace = new Map<number, number>();
  const deleteIndices = new Set<number>();

  for (const p of accepted) {
    const glyphs = pairFor(ctx, depthOf(accepted, p));
    replace.set(p.open, glyphCodePoint(glyphs.open));
    replace.set(p.close, glyphCodePoint(glyphs.close));

    if (glyphs.innerSpace !== "none") continue;

    // Open-side run: the maximal INLINE-SPACE run starting at p.open + 1.
    let openEnd = p.open + 1;
    while (openEnd < arr.length && INLINE_SPACE.has(arr[openEnd] as number)) openEnd += 1;
    const openStart = p.open + 1;
    const openEmpty = openEnd === openStart;
    const openLanding = openEnd < arr.length ? (arr[openEnd] as number) : NONE;

    // Close-side run: the maximal INLINE-SPACE run ending at p.close - 1.
    let closeStart = p.close - 1;
    while (closeStart >= 0 && INLINE_SPACE.has(arr[closeStart] as number)) closeStart -= 1;
    closeStart += 1;
    const closeEnd = p.close;
    const closeEmpty = closeStart === closeEnd;
    const closeLanding = closeStart - 1 >= 0 ? (arr[closeStart - 1] as number) : NONE;

    // A run is deleted iff non-empty, its landing is in DELETE-LANDING, and it is not
    // simultaneously both of the pair's runs — a pair enclosing nothing but spaces deletes
    // neither (spec 3.5). Unreachable for an accepted pair given pass 2's vacuity condition,
    // but the guard is cheap and the spec states it unconditionally.
    const sameRun = !openEmpty && !closeEmpty && openStart === closeStart && openEnd === closeEnd;

    if (!openEmpty && isDeleteLanding(openLanding) && !sameRun) {
      for (let k = openStart; k < openEnd; k += 1) deleteIndices.add(k);
    }
    if (!closeEmpty && isDeleteLanding(closeLanding) && !sameRun) {
      for (let k = closeStart; k < closeEnd; k += 1) deleteIndices.add(k);
    }
  }

  return { replace, deleteIndices };
}

/** Applies a render plan, returning the rendered array and the order-preserving index map. */
function applyRenderPlan(
  arr: readonly number[],
  plan: RenderPlan,
): { readonly y: number[]; readonly map: readonly number[] } {
  const y: number[] = [];
  const map: number[] = new Array(arr.length).fill(-1);
  for (let i = 0; i < arr.length; i += 1) {
    if (plan.deleteIndices.has(i)) continue;
    map[i] = y.length;
    y.push(plan.replace.get(i) ?? (arr[i] as number));
  }
  return { y, map };
}

function pairKey(open: number, close: number): string {
  return `${open},${close}`;
}

function pairSetsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const key of a) {
    if (!b.has(key)) return false;
  }
  return true;
}

/**
 * Pass 4 — the certification gate (spec 3.5). The accepted pairing is *checked*, not proved:
 * render the hypothetical output, re-run passes 1–2 on it, and decline pairs until the re-run
 * reproduces the accepted set exactly. Declination is simultaneous per round, and when the
 * intersection fails to shrink `A`, the pair with the greatest `open` index is forced out — both
 * clauses are normative (spec 3.5), so two ports cannot disagree.
 */
function certify(
  arr: readonly number[],
  initialPairs: readonly Pair[],
  ctx: RuleContext,
  skip: SkipSets,
): Pair[] {
  let accepted: Pair[] = initialPairs.slice();
  // Each round accepts or strictly shrinks `accepted`; it is finite and ∅ accepts
  // unconditionally, so the loop runs at most |A0| + 1 times (spec 3.5). The cap is a defensive
  // safety net, not a normative bound.
  const cap = initialPairs.length + 2;

  for (let round = 0; round <= cap; round += 1) {
    if (accepted.length === 0) return accepted;

    const plan = computeRenderPlan(arr, accepted, ctx);
    const { y, map } = applyRenderPlan(arr, plan);
    const rederived = pairCandidates(
      y,
      collectCandidates(y, skip, ctx.locale.quotes.elisionIdioms),
    );
    const bSet = new Set(rederived.map((p) => pairKey(p.open, p.close)));

    const projected = accepted.map((p) => ({
      open: map[p.open] as number,
      close: map[p.close] as number,
    }));
    const projSet = new Set(projected.map((p) => pairKey(p.open, p.close)));

    if (pairSetsEqual(projSet, bSet)) return accepted;

    const survivors = accepted.filter((_, idx) => {
      const proj = projected[idx] as { open: number; close: number };
      return bSet.has(pairKey(proj.open, proj.close));
    });

    if (survivors.length === accepted.length) {
      let removeIdx = 0;
      for (let i = 1; i < accepted.length; i += 1) {
        if ((accepted[i] as Pair).open > (accepted[removeIdx] as Pair).open) removeIdx = i;
      }
      accepted = accepted.filter((_, i) => i !== removeIdx);
    } else {
      accepted = survivors;
    }
  }

  // Unreachable given the termination argument; declines everything rather than looping.
  return [];
}

/**
 * Pass 5 — emit (spec 3.6). An edit whose replacement equals the span it replaces is never
 * emitted — the invisible-edit principle, applied per mark, not per pair.
 */
function emit(arr: readonly number[], accepted: readonly Pair[], ctx: RuleContext): Edit[] {
  const plan = computeRenderPlan(arr, accepted, ctx);
  const edits: Edit[] = [];

  for (const [index, cp] of plan.replace) {
    if (arr[index] === cp) continue;
    edits.push({ start: index, end: index + 1, replacement: [cp], ruleId: "quotes" });
  }

  const deletions = Array.from(plan.deleteIndices).sort((a, b) => a - b);
  let i = 0;
  while (i < deletions.length) {
    let j = i;
    while (
      j + 1 < deletions.length &&
      (deletions[j + 1] as number) === (deletions[j] as number) + 1
    ) {
      j += 1;
    }
    edits.push({
      start: deletions[i] as number,
      end: (deletions[j] as number) + 1,
      replacement: [],
      ruleId: "quotes",
    });
    i = j + 1;
  }

  edits.sort((a, b) => a.start - b.start);
  return edits;
}

export const quotesRule: Rule = {
  id: "quotes",
  apply(ctx: RuleContext): Edit[] {
    const cp = ctx.cp;
    const skip = computeSkipSets(ctx.locale);

    const candidates = collectCandidates(cp, skip, ctx.locale.quotes.elisionIdioms);
    if (candidates.length === 0) return [];

    const initialPairs = pairCandidates(cp, candidates);
    if (initialPairs.length === 0) return [];

    const accepted = certify(cp, initialPairs, ctx, skip);
    if (accepted.length === 0) return [];

    return emit(cp, accepted, ctx);
  },
};
