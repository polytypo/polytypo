import { toCodePoints } from "../engine/codepoints.js";
import { isLetter, simpleUppercase } from "../engine/unicode.js";
import { PolytypoError } from "../errors.js";
import type { Edit, Rule, RuleContext } from "../types.js";
import { NONE } from "../engine/sentinels.js";

/**
 * `hyphen` — spec/rules/hyphen.md (spec 0.1.0), order 35.
 *
 * Replaces U+002D with U+2011 inside listed morphological forms. Explicit index-based
 * scanning over the code-point array only: no regex, no native-string indexing
 * (ARCHITECTURE.md 4.1, 4.2).
 */

const HYPHEN_MINUS = 0x2d;
const NON_BREAKING_HYPHEN = 0x2011;
const DIGIT_ZERO = 0x30;
const DIGIT_NINE = 0x39;

/** Not a code point: stands for "index out of range" (spec 3.1 `NONE`). */

/** Out-of-range reads yield `NONE`, which is the spec's own boundary value. */
function at(cp: readonly number[], i: number): number {
  const value = cp[i];
  return value === undefined ? NONE : value;
}

function isDigit(cp: number): boolean {
  return cp >= DIGIT_ZERO && cp <= DIGIT_NINE;
}

/** 3.1 `HYPHENISH`. U+2010, U+00AD, U+2012, U+2013, U+2014 are deliberately absent. */
function isHyphenish(cp: number): boolean {
  return cp === HYPHEN_MINUS || cp === NON_BREAKING_HYPHEN;
}

/**
 * 3.1 `WORDISH` = ALNUM ∪ HYPHENISH. U+2011 is a member on purpose: without it a converted
 * hyphen would flip a neighbouring form's boundary verdict between runs (5).
 */
function isWordish(cp: number): boolean {
  return isDigit(cp) || isLetter(cp) || isHyphenish(cp);
}

/** 3.4: the three lists, in the order that breaks a length tie. */
type ListKind = 0 | 1 | 2;
const COMPOUND: ListKind = 0;
const PREFIX: ListKind = 1;
const SUFFIX: ListKind = 2;

interface Pattern {
  readonly cps: readonly number[];
  readonly kind: ListKind;
}

function preparePatterns(
  entries: readonly string[],
  field: string,
  kind: ListKind,
  out: Pattern[],
): void {
  for (const entry of entries) {
    const cps = toCodePoints(entry);
    let hasHyphen = false;
    for (const cp of cps) {
      if (cp === HYPHEN_MINUS) hasHyphen = true;
    }
    if (!hasHyphen) {
      throw new PolytypoError(
        "POLYTYPO_MALFORMED_LOCALE_DATA",
        `hyphen.${field} entry "${entry}" contains no U+002D; there is nothing for the rule to convert (spec/rules/hyphen.md §2).`,
      );
    }
    out.push({ cps, kind });
  }
}

/**
 * 3.3 — hyphen-lenient, first-character-lenient literal matching. The hyphen leniency covers
 * `j = 0` too, because a suffix entry begins with its own hyphen and must keep matching after
 * it has been converted.
 */
function matchesAt(cp: readonly number[], a: number, w: readonly number[]): boolean {
  if (a + w.length > cp.length) return false;
  for (let j = 0; j < w.length; j += 1) {
    const p = w[j] as number;
    const c = cp[a + j] as number;
    if (p === HYPHEN_MINUS) {
      if (!isHyphenish(c)) return false;
      continue;
    }
    if (c === p) continue;
    if (j === 0 && isLetter(p) && c === simpleUppercase(p)) continue;
    return false;
  }
  return true;
}

function bind(index: number): Edit {
  return { start: index, end: index + 1, replacement: [NON_BREAKING_HYPHEN], ruleId: "hyphen" };
}

/** 3.4 C — a compound is a whole word. */
function guardCompound(cp: readonly number[], a: number, k: number): boolean {
  const before = at(cp, a - 1);
  if (before !== NONE && isWordish(before)) return false;
  const after = at(cp, a + k);
  return after === NONE || !isWordish(after);
}

/** 3.4 P — a prefix starts a word and must actually prefix something. */
function guardPrefix(cp: readonly number[], a: number, k: number): boolean {
  const before = at(cp, a - 1);
  if (before !== NONE && isWordish(before)) return false;
  return isLetter(at(cp, a + k));
}

/** 3.4 S — a suffix must actually suffix something and must end the word. */
function guardSuffix(cp: readonly number[], a: number, k: number): boolean {
  if (!isLetter(at(cp, a - 1))) return false;
  const after = at(cp, a + k);
  return after === NONE || !isWordish(after);
}

function scan(ctx: RuleContext): Edit[] {
  const { hyphen } = ctx.locale;
  // 2: with all three lists empty the rule emits nothing for any input.
  if (
    hyphen.prefixes.length === 0 &&
    hyphen.suffixes.length === 0 &&
    hyphen.compounds.length === 0
  ) {
    return [];
  }

  // 3.4: one candidate per index — the longest entry that matches, ties broken compounds,
  // prefixes, suffixes. Sorting once makes the selection a first-hit linear search.
  const patterns: Pattern[] = [];
  preparePatterns(hyphen.compounds, "compounds", COMPOUND, patterns);
  preparePatterns(hyphen.prefixes, "prefixes", PREFIX, patterns);
  preparePatterns(hyphen.suffixes, "suffixes", SUFFIX, patterns);
  patterns.sort((a, b) => b.cps.length - a.cps.length || a.kind - b.kind);

  const cp = ctx.cp;
  const n = cp.length;
  const edits: Edit[] = [];
  let a = 0;
  while (a < n) {
    let selected: Pattern | undefined;
    for (const pattern of patterns) {
      if (matchesAt(cp, a, pattern.cps)) {
        selected = pattern;
        break;
      }
    }
    if (selected === undefined) {
      a += 1;
      continue;
    }

    // 3.4: matching and guarding are separate steps, and there is no backtracking. A guard
    // failure ends the position; no shorter entry is tried at `a`.
    const w = selected.cps;
    const k = w.length;
    if (selected.kind === COMPOUND) {
      if (!guardCompound(cp, a, k)) {
        a += 1;
        continue;
      }
      for (let j = 0; j < k; j += 1) {
        if (w[j] === HYPHEN_MINUS && cp[a + j] === HYPHEN_MINUS) edits.push(bind(a + j));
      }
    } else if (selected.kind === PREFIX) {
      if (!guardPrefix(cp, a, k)) {
        a += 1;
        continue;
      }
      // The entry's own last code point is the hyphen.
      if (w[k - 1] === HYPHEN_MINUS && cp[a + k - 1] === HYPHEN_MINUS) edits.push(bind(a + k - 1));
    } else {
      if (!guardSuffix(cp, a, k)) {
        a += 1;
        continue;
      }
      // A suffix is matched at its own hyphen.
      if (w[0] === HYPHEN_MINUS && cp[a] === HYPHEN_MINUS) edits.push(bind(a));
    }
    a += k;
  }
  return edits;
}

export const hyphenRule: Rule = {
  id: "hyphen",
  apply: scan,
};
