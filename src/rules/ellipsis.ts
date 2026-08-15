import type { Edit, Rule, RuleContext } from "../types.js";
import { NONE } from "../engine/sentinels.js";

// spec/rules/ellipsis.md 3.1.
const DOT = 0x2e;
const ELL = 0x2026;
const EXCLAMATION = 0x21;
const QUESTION = 0x3f;

/** Out-of-range reads yield `NONE`, which is the spec's own boundary value. */
function at(cp: readonly number[], i: number): number {
  const value = cp[i];
  return value === undefined ? NONE : value;
}

function isDotlike(cp: number): boolean {
  return cp === DOT || cp === ELL;
}

function isTerminal(cp: number): boolean {
  return cp === EXCLAMATION || cp === QUESTION;
}

function isSameRun(
  cp: readonly number[],
  s: number,
  e: number,
  target: readonly number[],
): boolean {
  if (e - s !== target.length) return false;
  for (let j = 0; j < target.length; j += 1) {
    if (at(cp, s + j) !== target[j]) return false;
  }
  return true;
}

export const ellipsisRule: Rule = {
  id: "ellipsis",
  apply(ctx: RuleContext): Edit[] {
    const cp = ctx.cp;
    const n = cp.length;
    const abbreviated = ctx.locale.ellipsis.abbreviatedAfterTerminal;
    const edits: Edit[] = [];
    let i = 0;

    while (i < n) {
      if (!isDotlike(at(cp, i))) {
        i += 1;
        continue;
      }

      const s = i;
      let e = s;
      let q = 0;
      while (e < n && isDotlike(at(cp, e))) {
        if (at(cp, e) === ELL) q += 1;
        e += 1;
      }
      const k = e - s;
      const left = at(cp, s - 1);

      // One decision per run, one edit per run (spec/rules/ellipsis.md 3.3 step 6).
      const target = runTarget(k, q, left, abbreviated);
      if (target !== null && !isSameRun(cp, s, e, target)) {
        edits.push({ start: s, end: e, replacement: target, ruleId: "ellipsis" });
      }
      i = e;
    }

    return edits;
  },
};

/** `null` means "emit nothing"; otherwise the final form of the whole run. */
function runTarget(
  k: number,
  q: number,
  left: number,
  abbreviated: boolean,
): readonly number[] | null {
  if (k === 2 && q === 0) {
    // The two-dot run is unconditionally inert where `?..` is the correct output form; that
    // is what stops `?..` ⇄ `?…` from oscillating (spec/rules/ellipsis.md 5).
    if (abbreviated) return null;
    if (isTerminal(left)) return [ELL];
    return null;
  }
  if (k === 1 && q === 0) return null;
  // k = 1 with an existing U+2026, or any run of 2+ containing one: normalise, then decide
  // the abbreviated form on the same span.
  if (abbreviated && isTerminal(left)) return [DOT, DOT];
  return [ELL];
}
