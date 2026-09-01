import { isLetter } from "../engine/unicode.js";
import { LINE_MARKER, MARKER, NONE } from "../engine/sentinels.js";
import type { Edit, Rule, RuleContext } from "../types.js";
import { computePreserveIndices } from "./quote-ambiguity.js";

// spec/rules/apostrophe.md 3.1. The apostrophe is U+2019 in every v1 locale and the case ladder
// below is structural, not lexical — but as of spec 0.5.0 this rule does read one piece of
// locale data, `quotes.elisionIdioms`, indirectly: `computePreserveIndices` (quote-ambiguity.js)
// tells this rule which straight-ASCII U+0027 positions `quotes` (order 40) left alone because
// they are an ambiguous medial span with no cited idiom (apostrophe.md 3.4). Those positions are
// skipped by the case ladder entirely, so this rule's own structural cases 3/4 never
// independently curl a mark `quotes` deliberately preserved.
const SQ = 0x27;
const RIGHT_SINGLE = 0x2019;

/**
 * Not −1: that is the span boundary marker (spec/rules/modes.md 3.2), and §3.3 forbids a
 * marker inside the array from being indistinguishable from the absence of a neighbour.
 *
 * The verdicts happen to be identical under either reading — verified exhaustively over the
 * whole two-neighbour decision space — because the only two branches the marker can reach
 * (case 3's right-test, case 4's left-test) are disjunctions that already accept `NONE`, and
 * §3.3 puts the marker in exactly the class each of those disjunctions also accepts. That
 * alignment is a coincidence of the class assignment, not a structural guarantee: a future
 * branch accepting `NONE` but not `CLOSEISH`/`OPENISH` would silently diverge. Conforming
 * here makes the agreement a property rather than luck.
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

// Unlike `quotes`, U+0027 is a member of neither class here and U+2019 is in `CLOSEISH` only;
// spec 5 turns exactly that asymmetry into the idempotency argument. U+2011 sits beside
// U+002D because `hyphen` (order 35) converts one to the other. `MARKER` is in both classes
// per modes.md 3.3, whose table names this rule.
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
  0x2d,
  0x2011,
  0x2013,
  0x2014,
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
  0x2d,
  0x2011,
  0x2013,
  0x2014,
]);

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

/**
 * The case ladder of spec 3.3, first match wins. Every verdict is a pure function of exactly
 * two neighbouring code points; there is no lookahead and no state between candidates.
 */
function isApostrophe(left: number, right: number): boolean {
  // 1 — prime guard, first so it wins over case 3: `6' 2"`, `55° 40' N`, `6'2"`.
  if (isDigit(left) && !isLetter(right)) return false;
  // 2 — medial: `don't`, `l'été`, `O'Brien`, `1990's`.
  if (isAlnum(left) && isAlnum(right)) return true;
  // 3 — trailing elision or possessive: `the dogs' bowls`, `Jesus'`.
  if (isLetter(left) && (right === NONE || SPACELIKE.has(right) || CLOSEISH.has(right)))
    return true;
  // 4 — leading elision: `’90s`, `’tis`, `’em`. The replacement is U+2019, never U+2018 —
  // a leading elision is a raised comma, not an opening quotation mark, and `quotes` has
  // already had its chance to claim the mark as a quotation and declined (spec 3.2, 5).
  if ((left === NONE || SPACELIKE.has(left) || OPENISH.has(left)) && isAlnum(right)) return true;
  // 5 — nothing inferable: `a ' b`, `''`.
  return false;
}

export const apostropheRule: Rule = {
  id: "apostrophe",
  apply(ctx: RuleContext): Edit[] {
    const cp = ctx.cp;
    const n = cp.length;
    const edits: Edit[] = [];
    const preserve = computePreserveIndices(cp, ctx.locale.quotes.elisionIdioms);

    for (let i = 0; i < n; i += 1) {
      if (at(cp, i) !== SQ) continue;
      if (preserve.has(i)) continue;
      const left = i > 0 ? at(cp, i - 1) : NONE;
      const right = i + 1 < n ? at(cp, i + 1) : NONE;
      if (isApostrophe(left, right)) {
        edits.push({ start: i, end: i + 1, replacement: [RIGHT_SINGLE], ruleId: "apostrophe" });
      }
    }

    return edits;
  },
};
