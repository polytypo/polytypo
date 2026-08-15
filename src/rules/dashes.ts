import { isLetter } from "../engine/unicode.js";
import type { Edit, LocaleData, Rule, RuleContext } from "../types.js";
import { LINE_MARKER, NONE } from "../engine/sentinels.js";

/**
 * `dashes` — spec/rules/dashes.md (spec 0.1.0), order 30.
 *
 * Explicit index-based scanning only: no regex anywhere, and every index addresses the
 * code-point array, never a native string (ARCHITECTURE.md 4.1, 4.2).
 */

const HYPHEN_MINUS = 0x2d;
const EN_DASH = 0x2013;
const EM_DASH = 0x2014;
const SPACE = 0x20;
const FULL_STOP = 0x2e;
const COMMA = 0x2c;
const SOLIDUS = 0x2f;
const DIGIT_ZERO = 0x30;
const DIGIT_NINE = 0x39;
/** §3.1 JOINER — U+2060, emitted only around a tight range dash (§3.3.1). */
const WORD_JOINER = 0x2060;

/** Not a code point: stands for "there is nothing there" (`before` / `after` in §3.3). */

function isDash(cp: number): boolean {
  return cp === HYPHEN_MINUS || cp === EN_DASH || cp === EM_DASH;
}

/** §3.1 INERT-DASH: never a candidate, never produced. */
function isInertDash(cp: number): boolean {
  return (
    cp === 0x00ad ||
    cp === 0x2010 ||
    cp === 0x2011 ||
    cp === 0x2012 ||
    cp === 0x2015 ||
    cp === 0x2212 ||
    cp === 0xfe58 ||
    cp === 0xfe63 ||
    cp === 0xff0d
  );
}

/** §3.1 DIGIT: ASCII only, deliberately — see spec §7.1. */
function isDigit(cp: number): boolean {
  return cp >= DIGIT_ZERO && cp <= DIGIT_NINE;
}

/** `BREAK` — including `LINE_MARKER`, a member for every rule everywhere (modes.md 3.2). */
function isBreak(cp: number): boolean {
  return (
    cp === 0x0a ||
    cp === 0x0d ||
    cp === 0x0b ||
    cp === 0x0c ||
    cp === 0x85 ||
    cp === 0x2028 ||
    cp === 0x2029 ||
    cp === LINE_MARKER
  );
}

function isNoBreakSpace(cp: number): boolean {
  return cp === 0x00a0 || cp === 0x202f;
}

type DashStyle = LocaleData["dash"]["parenthetical"];

function dashCodePoint(style: DashStyle): number {
  return style === "em-tight" || style === "em-spaced" ? EM_DASH : EN_DASH;
}

function isSpaced(style: DashStyle): boolean {
  return style === "em-spaced" || style === "en-spaced";
}

function sameContent(cp: readonly number[], start: number, end: number, next: readonly number[]) {
  if (end - start !== next.length) return false;
  for (let i = 0; i < next.length; i += 1) {
    if (cp[start + i] !== next[i]) return false;
  }
  return true;
}

/**
 * §3.6: every replacement is built from U+0020 alone. A token touching a no-break space is
 * inert (§3.2 step 3 + step 6), so no edit this rule produces can contain one and there is
 * nothing to preserve.
 */
function buildReplacement(style: DashStyle, bind: boolean): number[] {
  if (!isSpaced(style)) {
    // §3.3.1 — a tight range is one lexical unit; U+2013 is UAX #14 class BA, so without the
    // joiners a renderer may break after the dash.
    return bind ? [WORD_JOINER, dashCodePoint(style), WORD_JOINER] : [dashCodePoint(style)];
  }
  return [SPACE, dashCodePoint(style), SPACE];
}

/** §3.2 step 9 — the positions `spaces` (order 10) deletes a U+0020 from. */
function isStripBeforeOrCloseBracket(cp: number): boolean {
  return (
    cp === COMMA ||
    cp === FULL_STOP ||
    cp === 0x3b ||
    cp === 0x3a ||
    cp === 0x21 ||
    cp === 0x3f ||
    cp === 0x2026 ||
    cp === 0x29 ||
    cp === 0x5d ||
    cp === 0x7d
  );
}

function isOpenBracket(cp: number): boolean {
  return cp === 0x28 || cp === 0x5b || cp === 0x7b;
}

/** §3.1 ROMAN: the seven uppercase Roman-numeral letters only. Lower-case is not a member. */
function isRoman(cp: number): boolean {
  return (
    cp === 0x49 || // I
    cp === 0x56 || // V
    cp === 0x58 || // X
    cp === 0x4c || // L
    cp === 0x43 || // C
    cp === 0x44 || // D
    cp === 0x4d // M
  );
}

/**
 * §3.4 P4 — Roman-numeral veto. A tight dash between two word-bounded ROMAN runs is a range
 * already in its correct Russian form (`в XV—XVII веках`); the range branch cannot see it,
 * because §3.3 needs a DIGIT on each side, so without this the parenthetical branch would space
 * out input that was already right.
 *
 * A veto only: it never converts. Admitting ROMAN runs as range candidates would also fix
 * `XV-XVII`, but it fires on all-caps words built from the same letters (`MIX`, `CIVIL`), and
 * converting is the direction that damages. The miss is recorded in spec §7.10.
 */
function isRomanFlanked(cp: readonly number[], left: number, right: number): boolean {
  const n = cp.length;

  if (!isRoman(cp[left] as number) || !isRoman(cp[right] as number)) return false;

  let a = left;
  while (a > 0 && isRoman(cp[a - 1] as number)) a -= 1;
  if (a > 0 && isLetter(cp[a - 1] as number)) return false;

  let b = right;
  while (b + 1 < n && isRoman(cp[b + 1] as number)) b += 1;
  if (b + 1 < n && isLetter(cp[b + 1] as number)) return false;

  return true;
}

/**
 * §3.2 step 7: the cluster alphabet is DASH ∪ INERT-DASH ∪ DIGIT ∪ JOINER.
 *
 * JOINER is a member because a bound range (§3.3.1) is one lexical unit: without it, the
 * joiners this rule emits would split `a—0⁠–⁠0` into two clusters and hand the tight em dash
 * to the parenthetical branch, undoing the protection the guard exists to give an ISBN or a
 * phone number. A joiner is not a space, so admitting it does not widen the guard's reach
 * past the boundary §3.2 step 7 draws.
 */
function isClusterMember(cp: number): boolean {
  return isDash(cp) || isInertDash(cp) || isDigit(cp) || cp === WORD_JOINER;
}

function isDashUnion(cp: number): boolean {
  return isDash(cp) || isInertDash(cp);
}

/**
 * §3.2 step 7 — cluster guard. A maximal DASH ∪ INERT-DASH ∪ DIGIT span holding two or more
 * dash runs is inert in its entirety: `2026-08-15`, an ISBN, a phone number, `a—0–0`.
 */
function isClusterInert(cp: readonly number[], s: number, e: number): boolean {
  const n = cp.length;
  let start = s;
  while (start > 0 && isClusterMember(cp[start - 1] as number)) start -= 1;
  let end = e;
  while (end < n && isClusterMember(cp[end] as number)) end += 1;

  let runs = 0;
  let i = start;
  while (i < end) {
    if (!isDashUnion(cp[i] as number)) {
      i += 1;
      continue;
    }
    runs += 1;
    if (runs >= 2) return true;
    while (i < end && isDashUnion(cp[i] as number)) i += 1;
  }
  return false;
}

/**
 * §3.2 step 8 (T1) — spacing-transition guard, the repair for idempotency defect (c).
 *
 * A tight token that is about to become spaced would insert a U+0020 between itself and an
 * adjacent digit run. If that digit run has another dash on its far side, the insertion turns
 * that other token's `before`/`after` from a dash into a space and flips its G2 verdict on the
 * next run. The far dash may be tight against the digit run (`a–1-1`) or one space away
 * (`a–1 - 1`); no third distance is reachable, because the replacement inserts exactly one
 * U+0020.
 */
function isSpacingTransitionBlocked(cp: readonly number[], left: number, right: number): boolean {
  const n = cp.length;

  if (isDigit(cp[left] as number)) {
    let d = left;
    while (d > 0 && isDigit(cp[d - 1] as number)) d -= 1;
    // §3.2b: T1's two-code-point reach is measured in effective neighbours.
    const i1 = effectiveIndex(cp, d - 1, -1);
    const one = i1 < 0 ? NONE : (cp[i1] as number);
    const two = i1 < 0 ? NONE : effectiveNeighbour(cp, i1 - 1, -1);
    if (isDashUnion(one)) return true;
    if ((one === SPACE || isNoBreakSpace(one)) && isDashUnion(two)) return true;
  }

  if (isDigit(cp[right] as number)) {
    let d = right;
    while (d + 1 < n && isDigit(cp[d + 1] as number)) d += 1;
    const i1 = effectiveIndex(cp, d + 1, 1);
    const one = i1 < 0 ? NONE : (cp[i1] as number);
    const two = i1 < 0 ? NONE : effectiveNeighbour(cp, i1 + 1, 1);
    if (isDashUnion(one)) return true;
    if ((one === SPACE || isNoBreakSpace(one)) && isDashUnion(two)) return true;
  }

  return false;
}

/** §3.3 G5: equal-length ASCII digit runs compare lexicographically, so no arithmetic. */
function isNonDecreasing(
  cp: readonly number[],
  leftStart: number,
  rightStart: number,
  length: number,
): boolean {
  for (let i = 0; i < length; i += 1) {
    const l = cp[leftStart + i] as number;
    const r = cp[rightStart + i] as number;
    if (l < r) return true;
    if (l > r) return false;
  }
  return true;
}

/**
 * §3.2b — effective neighbour. Step outward across a maximal run of JOINER and return the index
 * of the first code point that is not one, or -1 if the walk leaves the array.
 *
 * Every guard that inspects a code point outside its own token's dash run must read one of
 * these. U+2060 is in this rule's own emission alphabet, so a guard that cannot see through it
 * has a verdict that depends on whether the rule has already run — which is the definition of
 * non-idempotency (CO-S, pipeline-idempotency.md §5.1a). §3.2a made the joiner transparent to
 * the token that owns it; this makes it transparent everywhere a guard looks outward.
 */
function effectiveIndex(cp: readonly number[], from: number, step: number): number {
  let i = from;
  while (i >= 0 && i < cp.length && cp[i] === WORD_JOINER) i += step;
  return i >= 0 && i < cp.length ? i : -1;
}

function effectiveNeighbour(cp: readonly number[], from: number, step: number): number {
  const i = effectiveIndex(cp, from, step);
  return i < 0 ? NONE : (cp[i] as number);
}

function rangeGuardsPass(cp: readonly number[], left: number, right: number): boolean {
  const n = cp.length;
  let a = left;
  while (a > 0 && isDigit(cp[a - 1] as number)) a -= 1;
  let b = right;
  while (b + 1 < n && isDigit(cp[b + 1] as number)) b += 1;

  // §3.2b: `before` and `after` are effective neighbours, so G1-G3 see through a joiner this
  // rule emitted on an earlier pass. Without this, `1-1 - 1` converts the second token on pass
  // 2 because G2 finds U+2060 where pass 1 found a dash — defect (e).
  const before = effectiveNeighbour(cp, a - 1, -1);
  const after = effectiveNeighbour(cp, b + 1, 1);

  // G1 — no letter adjacency.
  if (isLetter(before)) return false;
  // G2 — no chain: an ISO date, an ISBN or a phone number always trips this.
  if (isDash(before) || isInertDash(before)) return false;
  if (isDash(after) || isInertDash(after)) return false;
  // G3 — not part of a decimal or a path.
  if (before === FULL_STOP || before === COMMA || before === SOLIDUS) return false;
  if (after === SOLIDUS) return false;
  // G4 — run lengths. Equal, or the directional (1,2) branch with no leading zero on Rrun.
  const leftLength = left - a + 1;
  const rightLength = b - right + 1;
  if (leftLength === 1 && rightLength === 2 && cp[right] !== DIGIT_ZERO) {
    // `5-10`, `9-10`, `0-60`. G5 is *vacuous* here — a one-digit run is at most 9 and a
    // two-digit run without a leading zero is at least 10 — so it is deliberately not called.
    // G5 compares digit-by-digit, which is an integer comparison only for equal-length runs;
    // handing it `"5"` against `"10"` would yield `'5' > '1'` and decline the very case this
    // branch exists to admit. The leading-zero clause is what keeps G5 vacuous: `9-05` is
    // descending and G5 could not evaluate it. (2,1) is excluded for the same reason.
    return true;
  }
  if (leftLength !== rightLength) return false;
  // G5 — non-decreasing. Unchanged, and reached only for equal-length runs.
  return isNonDecreasing(cp, a, right, leftLength);
}

function scan(ctx: RuleContext): Edit[] {
  const cp = ctx.cp;
  const n = cp.length;
  const edits: Edit[] = [];
  let i = 0;

  while (i < n) {
    if (!isDash(cp[i] as number)) {
      i += 1;
      continue;
    }

    const s = i;
    let e = s;
    while (e < n && isDash(cp[e] as number)) e += 1;
    i = e;

    // §3.2 step 2 — a run longer than three is decoration, not a dash.
    if (e - s > 3) continue;

    // §3.2 step 2a — authored-dash guard. This rule promotes a hyphen; it never restyles a
    // dash. A hyphen is a typewriter substitute for a mark the writer could not type, so
    // promoting it completes their intent; a U+2013 or U+2014 already in the input is the mark
    // they meant, and it keeps its glyph and its spacing whatever the locale prescribes.
    //
    // The test is on the whole run, so a mixed `-–` declines too. This decides the *token*
    // only: U+2013 and U+2014 stay full members of DASH for every other token's guards, which
    // is what keeps steps 6 and 7 and G2 protecting a hyphen token from an authored-dash
    // neighbour. Inert as a token, fully present as context.
    let hasAuthoredDash = false;
    for (let j = s; j < e; j += 1) {
      if (cp[j] === EN_DASH || cp[j] === EM_DASH) hasAuthoredDash = true;
    }
    if (hasAuthoredDash) continue;

    // §3.2 step 3 — outer spacing. SPACE means U+0020 and nothing else: this rule normalises
    // ordinary sentence spacing, and a no-break space beside a dash belongs to whoever put it
    // there. It therefore falls through to `cp[L]`/`cp[R]`, where step 6 declines the token as
    // space-like — so a dash touching a U+00A0 or U+202F is inert on either side. That makes
    // every code point `nbsp` (order 70) can emit inert here, which discharges the composition
    // obligation against it structurally (pipeline-idempotency.md §5.1a, CO-S) rather than by
    // the case analysis that produced three successive defects.
    const lsp = s > 0 && cp[s - 1] === SPACE ? 1 : 0;
    const rsp = e < n && cp[e] === SPACE ? 1 : 0;

    // §3.2 step 4 — symmetry guard.
    if (lsp !== rsp) continue;

    // §3.2 step 5 — content on both sides, on the same line.
    let left = s - 1 - lsp;
    let right = e + rsp;
    if (left < 0 || right >= n) continue;

    // §3.2a — joiner neighbours. Walk across them, then admit the token only if what lies
    // beyond is a digit on both sides: that is this rule's own bound range coming back for a
    // second pass. Any other joiner was placed by the author and makes the token inert.
    let joinStart = left + 1;
    let joinEnd = right;
    while (left >= 0 && cp[left] === WORD_JOINER) left -= 1;
    while (right < n && cp[right] === WORD_JOINER) right += 1;
    if (left < 0 || right >= n) continue;
    const crossedJoiner = left + 1 !== joinStart || right !== joinEnd;
    joinStart = left + 1;
    joinEnd = right;

    const leftCp = cp[left] as number;
    const rightCp = cp[right] as number;
    if (crossedJoiner && !(isDigit(leftCp) && isDigit(rightCp))) continue;
    if (isBreak(leftCp) || isBreak(rightCp)) continue;

    // §3.2 step 6 — isolation guard. An INERT-DASH neighbour was written deliberately; a DASH
    // neighbour is the `dash space dash` shape, whose two runs would merge on the next pass
    // (defect (b)) and whose edit spans would overlap; a space-like neighbour means two
    // consecutive space-like code points, whose spacing this rule does not own.
    if (isInertDash(leftCp) || isInertDash(rightCp)) continue;
    if (isDash(leftCp) || isDash(rightCp)) continue;
    if (leftCp === SPACE || isNoBreakSpace(leftCp)) continue;
    if (rightCp === SPACE || isNoBreakSpace(rightCp)) continue;

    // §3.2 step 7 — cluster guard (defect (a)).
    if (isClusterInert(cp, s, e)) continue;

    // The span swallows any joiner already adjacent, so a second pass rewrites the same span
    // with the same content and `sameContent` below declines it.
    const spanStart = Math.min(s - lsp, joinStart);
    const spanEnd = Math.max(e + rsp, joinEnd);

    let style: DashStyle;
    let isRange = false;
    if (isDigit(leftCp) && isDigit(rightCp)) {
      isRange = true;
      // §3.3 — the range branch is terminal: a digit-flanked stroke is a range or nothing.
      if (!rangeGuardsPass(cp, left, right)) continue;
      style = ctx.locale.dash.range;
    } else {
      // §3.4 P1 — a bare hyphen must be spaced (the compound-word guard).
      if (e - s === 1 && cp[s] === HYPHEN_MINUS && lsp === 0) continue;
      // §3.4 P4 — Roman-numeral veto.
      if (lsp === 0 && rsp === 0 && isRomanFlanked(cp, left, right)) continue;
      style = ctx.locale.dash.parenthetical;
    }

    // `none`: the locale has no verified convention, so nothing is substituted.
    if (style === "none") continue;

    // §3.2 steps 8 and 9 — evaluated here, because both depend on the chosen form.
    if (isSpaced(style)) {
      // T1: a tight token may not become spaced across a digit run that has a far dash.
      if (lsp === 0 && rsp === 0 && isSpacingTransitionBlocked(cp, left, right)) continue;
      // T2: the emitted U+0020 must not land where `spaces` (order 10) would delete it, or the
      // next pipeline pass undoes it and this rule then declines the token
      // (pipeline-idempotency.md §4, family 1).
      if (isStripBeforeOrCloseBracket(rightCp)) continue;
      if (isOpenBracket(leftCp)) continue;
    }

    const replacement = buildReplacement(style, isRange && !isSpaced(style));
    if (sameContent(cp, spanStart, spanEnd, replacement)) continue;

    // Spans are pairwise disjoint by §3.5: the `dash space dash` shape that would share a
    // space is already inert at step 6, so no first-claim-wins fallback is reachable here.
    edits.push({ start: spanStart, end: spanEnd, replacement, ruleId: "dashes" });
  }

  return edits;
}

export const dashesRule: Rule = {
  id: "dashes",
  apply: scan,
};
