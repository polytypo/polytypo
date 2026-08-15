import { toCodePoints } from "../engine/codepoints.js";
import { isLetter } from "../engine/unicode.js";
import { LINE_MARKER, MARKER, NONE } from "../engine/sentinels.js";
import type { Edit, QuotePair, Rule, RuleContext } from "../types.js";

// spec/rules/quotes.md 3.1. The rule reasons about U+0022 and U+0027 only and never reads
// back its own curly output; that is what makes a same-glyph locale (fi, sv: U+201D on both
// sides) tractable at all, and it is the premise of the idempotency proof in 5.
const DQ = 0x22;
const SQ = 0x27;

/**
 * "Index out of range", and deliberately **not** −1: −1 is the span boundary marker the mode
 * adapters splice into the array (spec/rules/modes.md 3.2), and a marker *inside* the array
 * must never be indistinguishable from the absence of a neighbour (modes.md 3.3). Nothing
 * outside this rule observes the value.
 */

const DIGIT_ZERO = 0x30;
const DIGIT_NINE = 0x39;

const SPACELIKE: ReadonlySet<number> = new Set([
  0x20,
  0x09,
  0xa0,
  0x202f,
  0x2007,
  0x2009,
  0x200a,
  // BREAK, including the line-boundary marker: modes.md 3.2 makes it a member for every rule.
  0x0a,
  0x0d,
  0x0b,
  0x0c,
  0x85,
  0x2028,
  0x2029,
  LINE_MARKER,
]);

/**
 * `STRAIGHT` is a member of **both** `OPENISH` and `CLOSEISH` (spec 3.1). Not sloppiness:
 * it makes `canOpen`/`canClose` monotone non-increasing across runs, which is Claim 2 of the
 * idempotency argument. If a straight mark were in only one class, converting a neighbour
 * could *add* a capability and the second run could form a pair the first did not.
 *
 * The span boundary `MARKER` is in both classes for a different reason (modes.md 3.3): it is
 * what makes a quotation pair across a wrapping element. Neither "treat it as `NONE`" nor
 * "treat it as opaque content" passes all three rows of that table — do not simplify it.
 */
const OPENISH: ReadonlySet<number> = new Set([
  MARKER,
  0x28,
  0x5b,
  0x7b,
  0xab,
  0x2018,
  0x201a,
  0x201b,
  0x201c,
  0x201e,
  0x201f,
  0x2039,
  0x301d,
  DQ,
  SQ,
]);

const CLOSEISH: ReadonlySet<number> = new Set([
  MARKER,
  0x29,
  0x5d,
  0x7d,
  0xbb,
  0x2019,
  0x201d,
  0x203a,
  0x2c,
  0x2e,
  0x3b,
  0x3a,
  0x21,
  0x3f,
  0x2026,
  0x2013,
  0x2014,
  DQ,
  SQ,
]);

// U+2011 is listed because `hyphen` (order 35) converts U+002D to it; without it a
// candidate's classification would flip between pipeline runs (spec 3.1).
const DASHISH: ReadonlySet<number> = new Set([0x2d, 0x2011, 0x2013, 0x2014]);

interface Candidate {
  readonly index: number;
  /** The straight code point itself, `DQ` or `SQ` — pass 2 pairs only within a kind (spec 3.3). */
  readonly kind: number;
  readonly canOpen: boolean;
  readonly canClose: boolean;
}

interface Pair {
  readonly open: number;
  readonly close: number;
}

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

function isStraight(cp: number): boolean {
  return cp === DQ || cp === SQ;
}

/**
 * `canOpen`'s right-test rejects a `right` in `CLOSEISH`. A `STRAIGHT` right does not
 * disqualify (spec 3.1), and the span boundary marker takes the same exemption
 * (modes.md 3.3) — without it the opening mark of `"<em>hello</em>"` would not be `canOpen`.
 */
function isExemptFromCloseishRejection(cp: number): boolean {
  return isStraight(cp) || cp === MARKER;
}

/** Pass 1 — collect and classify candidates (spec 3.2). */
function collectCandidates(cp: readonly number[]): Candidate[] {
  const n = cp.length;
  const candidates: Candidate[] = [];

  for (let i = 0; i < n; i += 1) {
    const here = at(cp, i);
    if (!isStraight(here)) continue;

    const left = i > 0 ? at(cp, i - 1) : NONE;
    const right = i + 1 < n ? at(cp, i + 1) : NONE;

    let canOpen =
      (left === NONE || SPACELIKE.has(left) || OPENISH.has(left) || DASHISH.has(left)) &&
      right !== NONE &&
      !SPACELIKE.has(right) &&
      (!CLOSEISH.has(right) || isExemptFromCloseishRejection(right));

    let canClose =
      left !== NONE &&
      !SPACELIKE.has(left) &&
      (right === NONE || SPACELIKE.has(right) || CLOSEISH.has(right) || DASHISH.has(right));

    // Medial-apostrophe veto, SQ only: `don't`, `l'été`, `O'Brien`, `1990's` are not
    // quotation marks under any reading and belong to `apostrophe` (spec 3.2).
    if (here === SQ && left !== NONE && right !== NONE && isAlnum(left) && isAlnum(right)) {
      canOpen = false;
      canClose = false;
    }

    // Same-kind adjacency veto (spec 3.2): `""` and `''` are typewriter artefacts, not
    // quotations. `"'` and `'"` survive — that is an ordinary nested boundary (`"'Tis so,"`,
    // `…'moi'"`). The veto is self-reinforcing, so its verdict can never change between runs;
    // that is what makes it a legal replacement for the empty-pair discard pass 2 used to
    // carry, which added a fourth outcome and broke Claim 3's partition (spec 5.4).
    if (left === here || right === here) {
      canOpen = false;
      canClose = false;
    }

    if (canOpen || canClose) {
      candidates.push({ index: i, kind: here, canOpen, canClose });
    }
  }

  return candidates;
}

/**
 * Pass 2 — pair the candidates, one stack per kind (spec 3.3). A `DQ` closes only a `DQ` and an
 * `SQ` only an `SQ`: no reader opens with a double mark and closes with a single one, so a
 * mixed pair is never the right answer. Nesting still interleaves correctly — `"He said 'no'
 * twice"` puts each kind on its own stack and both pairs come out right — because genuine
 * nesting is balanced per kind. Closing is tried before opening, which is what makes
 * `"He said "hi.""` resolve the way a reader does.
 *
 * Exactly three outcomes — paired, pushed, or unmatched — and every candidate reaches exactly
 * one. Claim 3 of spec 5 partitions the unmatched candidates into "left on a stack" and
 * "reached step 3"; a fourth outcome makes that partition wrong and the proof unsound. Do not
 * add one (spec 3.3, 5.4). Note that per-kind stacks preserve the partition exactly: a
 * candidate only ever touches the stack for its own kind, so the proof goes through with "the
 * stack" read as "the stack for its kind" (spec 5, Claim 3).
 *
 * Splitting the stack is what stops a stray elision from swallowing a quotation: in
 * `"σ' αυτό"` the `'` of the Greek elision is `canClose`, and with one shared stack it popped
 * the opening `"` and emitted `«σ»`, destroying the sentence (spec 5.5).
 */
function pairCandidates(candidates: readonly Candidate[]): Pair[] {
  const stacks = new Map<number, Candidate[]>([
    [DQ, []],
    [SQ, []],
  ]);
  const pairs: Pair[] = [];

  for (const c of candidates) {
    const stack = stacks.get(c.kind) as Candidate[];
    const o = stack[stack.length - 1];
    if (c.canClose && o !== undefined) {
      stack.pop();
      pairs.push({ open: o.index, close: c.index });
      continue;
    }
    if (c.canOpen) stack.push(c);
  }

  return pairs;
}

/**
 * Pass 3 — depth is one plus the number of *successfully paired* quotations that strictly
 * enclose this one (spec 3.4). Deliberately not the stack height at pop time: the stack may
 * hold candidates that never find a partner, and counting it mis-levels every quotation
 * following an unmatched mark.
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

export const quotesRule: Rule = {
  id: "quotes",
  apply(ctx: RuleContext): Edit[] {
    const cp = ctx.cp;
    const candidates = collectCandidates(cp);
    if (candidates.length === 0) return [];

    const pairs = pairCandidates(candidates);
    if (pairs.length === 0) return [];

    // Pass 4 — emit. Every edit is one code point replacing one code point: no insertion, no
    // deletion, no reflow. `innerSpace` is deliberately not acted on here; `nbsp` (order 70)
    // owns all no-break spacing (spec 3.7).
    const edits: Edit[] = [];
    for (const p of pairs) {
      const glyphs = pairFor(ctx, depthOf(pairs, p));
      edits.push({
        start: p.open,
        end: p.open + 1,
        replacement: toCodePoints(glyphs.open),
        ruleId: "quotes",
      });
      edits.push({
        start: p.close,
        end: p.close + 1,
        replacement: toCodePoints(glyphs.close),
        ruleId: "quotes",
      });
    }

    edits.sort((a, b) => a.start - b.start);
    return edits;
  },
};
