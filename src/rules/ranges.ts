import { isLetter } from "../engine/unicode.js";
import type { Edit, Rule, RuleContext } from "../types.js";
import {
  buildReplacement,
  effectiveNeighbour,
  findDashTokens,
  isDashUnion,
  isDigit,
  isOpenBracket,
  isSpaced,
  isSpacingTransitionBlocked,
  isStripBeforeOrCloseBracket,
  sameContent,
  type DashStyle,
} from "./dash-shared.js";

/**
 * `ranges` — spec/rules/ranges.md (spec 0.5.0), order 25. Explicit opt-in: off by default
 * (RULE_DEFAULTS in registry.ts). Split out of `dashes` (spec 0.5.0) — see ranges.md 1 and
 * dashes.md 7.11 for why this is opt-in rather than a bounded structural fix: separating a
 * genuine numeric range (`5-10`) from a compound label sharing the identical shape (`Figure
 * 5-10`) needs the preceding word, which is exactly the open-ended, per-locale context this
 * project's rules are built never to consult.
 *
 * Explicit index-based scanning only: no regex anywhere, and every index addresses the
 * code-point array, never a native string (ARCHITECTURE.md 4.1, 4.2).
 */

const FULL_STOP = 0x2e;
const COMMA = 0x2c;
const SOLIDUS = 0x2f;
const DIGIT_ZERO = 0x30;

/** ranges.md 3.3 G5: equal-length ASCII digit runs compare lexicographically, so no arithmetic. */
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

/** ranges.md 3.3, G1-G5. */
function rangeGuardsPass(cp: readonly number[], left: number, right: number): boolean {
  const n = cp.length;
  let a = left;
  while (a > 0 && isDigit(cp[a - 1] as number)) a -= 1;
  let b = right;
  while (b + 1 < n && isDigit(cp[b + 1] as number)) b += 1;

  const before = effectiveNeighbour(cp, a - 1, -1);
  const after = effectiveNeighbour(cp, b + 1, 1);

  // G1 — no letter adjacency.
  if (isLetter(before)) return false;
  // G2 — no chain: an ISO date, an ISBN or a phone number always trips this.
  if (isDashUnion(before)) return false;
  if (isDashUnion(after)) return false;
  // G3 — not part of a decimal or a path.
  if (before === FULL_STOP || before === COMMA || before === SOLIDUS) return false;
  if (after === SOLIDUS) return false;
  // G4 — run lengths. Equal, or the directional (1,2) branch with no leading zero on Rrun.
  const leftLength = left - a + 1;
  const rightLength = b - right + 1;
  if (leftLength === 1 && rightLength === 2 && cp[right] !== DIGIT_ZERO) {
    return true;
  }
  if (leftLength !== rightLength) return false;
  // G5 — non-decreasing.
  return isNonDecreasing(cp, a, right, leftLength);
}

function scan(ctx: RuleContext): Edit[] {
  const cp = ctx.cp;
  const edits: Edit[] = [];
  const style: DashStyle = ctx.locale.dash.range;

  for (const token of findDashTokens(cp)) {
    const { leftCp, rightCp, left, right, lsp, rsp, spanStart, spanEnd } = token;

    // ranges.md 3.3 — a range candidate iff both flanks are DIGIT. `ranges` never processes any
    // other token shape; that is `dashes`' territory, and `dashes` declines a digit-flanked
    // token unconditionally too (operator decision, spec 0.5.0) — neither rule reinterprets the
    // other's shape, whether or not `ranges` is enabled.
    if (!isDigit(leftCp) || !isDigit(rightCp)) continue;

    if (!rangeGuardsPass(cp, left, right)) continue;

    // `"none"`: the locale has no verified convention, so nothing is substituted.
    if (style === "none") continue;

    if (isSpaced(style)) {
      // T1: a tight token may not become spaced across a digit run that has a far dash.
      if (lsp === 0 && rsp === 0 && isSpacingTransitionBlocked(cp, left, right)) continue;
      // T2: the emitted U+0020 must not land where `spaces` (order 10) would delete it.
      if (isStripBeforeOrCloseBracket(rightCp)) continue;
      if (isOpenBracket(leftCp)) continue;
    }

    // ranges.md 3.3.1: never make an edit whose entire content is invisible. Try the unbound
    // replacement first; only add the joiner pair if the dash itself is genuinely changing.
    const unbound = buildReplacement(style, false);
    const onlyBindingWouldChange =
      !isSpaced(style) && sameContent(cp, spanStart, spanEnd, unbound);
    const bind = !isSpaced(style) && !onlyBindingWouldChange;
    const replacement = bind ? buildReplacement(style, true) : unbound;
    if (sameContent(cp, spanStart, spanEnd, replacement)) continue;

    edits.push({ start: spanStart, end: spanEnd, replacement, ruleId: "ranges" });
  }

  return edits;
}

export const rangesRule: Rule = {
  id: "ranges",
  apply: scan,
};
