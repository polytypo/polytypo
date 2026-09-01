import { isLetter } from "../engine/unicode.js";
import type { Edit, Rule, RuleContext } from "../types.js";
import {
  HYPHEN_MINUS,
  HYPHEN,
  MINUS_SIGN,
  EN_DASH,
  buildReplacement,
  isDigit,
  isOpenBracket,
  isSpaced,
  isSpacingTransitionBlocked,
  isStripBeforeOrCloseBracket,
  findDashTokens,
  sameContent,
  type DashStyle,
} from "./dash-shared.js";

/**
 * `dashes` — spec/rules/dashes.md (spec 0.5.0), order 30. Parenthetical-dash processing only,
 * as of spec 0.5.0: numeric/date-range recognition moved to the `ranges` rule (order 25,
 * off by default), which owns `dash.range` and shares this rule's token-scanning and guard
 * machinery via `dash-shared.js`. See dashes.md 1 and 7.11, and ranges.md 1, for why the split
 * happened and why range detection is opt-in rather than fixed structurally.
 *
 * A digit-flanked dash token is declined here **unconditionally** — never reinterpreted as a
 * parenthetical dash — regardless of whether `ranges` is enabled (operator decision, spec
 * 0.5.0). That was already true of every prior spec version: the range/parenthetical branches
 * have always been mutually exclusive per token, on the same `isDigit(leftCp) && isDigit(rightCp)`
 * test that now decides which rule a token belongs to rather than which branch of one rule it
 * takes.
 *
 * Explicit index-based scanning only: no regex anywhere, and every index addresses the
 * code-point array, never a native string (ARCHITECTURE.md 4.1, 4.2).
 */

/** dashes.md 3.1 ROMAN: the seven uppercase Roman-numeral letters only. Lower-case is not a member. */
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
 * dashes.md 3.4 P4 — Roman-numeral veto. A tight dash between two word-bounded ROMAN runs is a
 * range already in its correct Russian form (`в XV—XVII веках`); `ranges` cannot see it, because
 * ranges.md 3.3 needs a DIGIT on each side, so without this the parenthetical branch would space
 * out input that was already right.
 *
 * A veto only: it never converts. Admitting ROMAN runs as range candidates would also fix
 * `XV-XVII`, but it fires on all-caps words built from the same letters (`MIX`, `CIVIL`), and
 * converting is the direction that damages. The miss is recorded in dashes.md 7.10.
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

function scan(ctx: RuleContext): Edit[] {
  const cp = ctx.cp;
  const edits: Edit[] = [];
  const style: DashStyle = ctx.locale.dash.parenthetical;

  for (const token of findDashTokens(cp)) {
    const { s, e, leftCp, rightCp, left, right, lsp, rsp } = token;

    // A digit-flanked token is `ranges`' territory, never `dashes`' — declined unconditionally,
    // whether or not `ranges` is enabled (operator decision, spec 0.5.0).
    if (isDigit(leftCp) && isDigit(rightCp)) continue;

    // dashes.md 3.4 P5 — authored en-dash mark-identity veto (spec 0.6.0). A run consisting of
    // exactly one U+2013 is declined unconditionally: every locale, tight or spaced, regardless
    // of `dash.parenthetical`'s target glyph. Unlike P1/P4 this is not conditioned on the
    // replacement that would be chosen — an en-spaced locale's own tight-authored en-dash is
    // just as protected as an em-target locale's, because the failure this guards against
    // (an authored en-dash silently re-spaced into ordinary parenthetical punctuation) can
    // corrupt a range or joint-name reading in an en-spaced locale exactly as it can in an
    // em-target one; only the glyph substitution differs, not the risk. See §8.8 for the
    // fresh-evidence argument this guard rests on and why it does not reopen the pre-0.2.0
    // guards §8.1 retired.
    if (e - s === 1 && cp[s] === EN_DASH) continue;

    // dashes.md 3.4 P1 — a bare hyphen-shaped stroke must be spaced (the compound-word guard).
    if (
      e - s === 1 &&
      (cp[s] === HYPHEN_MINUS || cp[s] === HYPHEN || cp[s] === MINUS_SIGN) &&
      lsp === 0
    ) {
      continue;
    }
    // dashes.md 3.4 P4 — Roman-numeral veto.
    if (lsp === 0 && rsp === 0 && isRomanFlanked(cp, left, right)) continue;

    // `"none"`: the locale has no verified convention, so nothing is substituted.
    if (style === "none") continue;

    if (isSpaced(style)) {
      // T1: a tight token may not become spaced across a digit run that has a far dash.
      if (lsp === 0 && rsp === 0 && isSpacingTransitionBlocked(cp, left, right)) continue;
      // T2: the emitted U+0020 must not land where `spaces` (order 10) would delete it.
      if (isStripBeforeOrCloseBracket(rightCp)) continue;
      if (isOpenBracket(leftCp)) continue;
    }

    // `dashes` never binds: an interrupting dash is exactly where a line may break
    // (dashes.md 3.3.1's binding is `ranges`-only).
    const replacement = buildReplacement(style, false);
    const spanStart = s - lsp;
    const spanEnd = e + rsp;
    if (sameContent(cp, spanStart, spanEnd, replacement)) continue;

    edits.push({ start: spanStart, end: spanEnd, replacement, ruleId: "dashes" });
  }

  return edits;
}

export const dashesRule: Rule = {
  id: "dashes",
  apply: scan,
};
