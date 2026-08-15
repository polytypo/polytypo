import { isLetter } from "../engine/unicode.js";
import type { Edit, Rule, RuleContext } from "../types.js";
import { NONE } from "../engine/sentinels.js";

// spec/rules/symbols.md 3.1.
const PAREN_OPEN = 0x28;
const PAREN_CLOSE = 0x29;
const SQUARE_CLOSE = 0x5d;

const COPYRIGHT = 0xa9;
const REGISTERED = 0xae;
const TRADEMARK = 0x2122;
const MULTIPLICATION = 0xd7;

const SPACE = 0x20;
const NBSP = 0xa0;
const NNBSP = 0x202f;

const LOWER_X = 0x78;
const UPPER_X = 0x58;
const CYRILLIC_LOWER_HA = 0x445;
const CYRILLIC_UPPER_HA = 0x425;
const DIGIT_ZERO = 0x30;
const DIGIT_NINE = 0x39;

const PLUS = 0x2b;
const SOLIDUS = 0x2f;
const HYPHEN_MINUS = 0x2d;
const PLUS_MINUS = 0xb1;
const SQUARE_OPEN = 0x5b;

/** Out-of-range reads yield `NONE`, which is the spec's own boundary value. */
function at(cp: readonly number[], i: number): number {
  const value = cp[i];
  return value === undefined ? NONE : value;
}

/**
 * Every accepted spelling is enumerated. Case folding is forbidden here: `toLowerCase` is
 * locale-dependent in the host process and `(TM)` would behave differently under a Turkish
 * locale (ARCHITECTURE.md 4.4). Longest literals first (spec/rules/symbols.md 3.2 step 1).
 */
interface TrademarkRow {
  readonly literal: readonly number[];
  readonly to: number;
  /** S1 applies to the `(c)` and `(r)` rows only (spec/rules/symbols.md 3.2 step 3). */
  readonly guardedByS1: boolean;
}

const TRADEMARK_TABLE: readonly TrademarkRow[] = [
  { literal: [PAREN_OPEN, 0x74, 0x6d, PAREN_CLOSE], to: TRADEMARK, guardedByS1: false }, // (tm)
  { literal: [PAREN_OPEN, 0x54, 0x4d, PAREN_CLOSE], to: TRADEMARK, guardedByS1: false }, // (TM)
  { literal: [PAREN_OPEN, 0x54, 0x6d, PAREN_CLOSE], to: TRADEMARK, guardedByS1: false }, // (Tm)
  { literal: [PAREN_OPEN, 0x74, 0x4d, PAREN_CLOSE], to: TRADEMARK, guardedByS1: false }, // (tM)
  { literal: [PAREN_OPEN, 0x63, PAREN_CLOSE], to: COPYRIGHT, guardedByS1: true }, // (c)
  { literal: [PAREN_OPEN, 0x43, PAREN_CLOSE], to: COPYRIGHT, guardedByS1: true }, // (C)
  { literal: [PAREN_OPEN, 0x72, PAREN_CLOSE], to: REGISTERED, guardedByS1: true }, // (r)
  { literal: [PAREN_OPEN, 0x52, PAREN_CLOSE], to: REGISTERED, guardedByS1: true }, // (R)
];

function isDigit(cp: number): boolean {
  return cp >= DIGIT_ZERO && cp <= DIGIT_NINE;
}

function isAlnum(cp: number): boolean {
  return isDigit(cp) || isLetter(cp);
}

function isSpaceLike(cp: number): boolean {
  return cp === SPACE || cp === NBSP || cp === NNBSP;
}

/**
 * `MUL-LETTER`, spec/rules/symbols.md 3.1: four code points, enumerated, no locale data. The
 * Cyrillic pair is unconditional — U+0445 between two ASCII digits is a Russian dimension typed
 * on a Cyrillic layout or keyboard debris, there is no third reading, and the glyphs are
 * identical to the Latin ones in every font, so no human review can catch it.
 */
function isMulLetter(cp: number): boolean {
  return cp === LOWER_X || cp === UPPER_X || cp === CYRILLIC_LOWER_HA || cp === CYRILLIC_UPPER_HA;
}

function matchesAt(cp: readonly number[], i: number, literal: readonly number[]): boolean {
  if (i + literal.length > cp.length) return false;
  for (let j = 0; j < literal.length; j += 1) {
    if (at(cp, i + j) !== literal[j]) return false;
  }
  return true;
}

/** Returns the edit, or `null` when a guard rejects the candidate. */
function trademarkAt(cp: readonly number[], i: number): Edit | null {
  for (const row of TRADEMARK_TABLE) {
    if (!matchesAt(cp, i, row.literal)) continue;
    const end = i + row.literal.length;
    const before = at(cp, i - 1);
    const after = at(cp, end);

    // S1 — left adjacency, for the `(c)` and `(r)` rows only: a one-letter argument list is
    // common, `(tm)` tucked against a product name is not a call. ©, ® and ™ are listed so
    // that `(c)(r)` converges in one run (spec/rules/symbols.md 5).
    if (
      row.guardedByS1 &&
      before !== NONE &&
      (isAlnum(before) ||
        before === PAREN_CLOSE ||
        before === SQUARE_CLOSE ||
        before === COPYRIGHT ||
        before === REGISTERED ||
        before === TRADEMARK)
    ) {
      return null;
    }
    // S2 — right adjacency: `(r)evolution`.
    if (after !== NONE && isAlnum(after)) return null;
    // S3 — no nesting: `((c))` is ASCII art or code.
    if (before === PAREN_OPEN) return null;

    return { start: i, end, replacement: [row.to], ruleId: "symbols" };
  }
  return null;
}

interface ChainLink {
  readonly letterIndex: number;
  readonly leftSpace: 0 | 1;
  readonly rightSpace: 0 | 1;
}

interface Chain {
  /** Index of the last code point read, whether or not any link was completed. */
  readonly end: number;
  readonly links: readonly ChainLink[];
  readonly firstRunEnd: number;
}

/**
 * `DIGIT+ (MUL-LETTER DIGIT+)+`, read from the start of a maximal digit run at `a`
 * (spec/rules/symbols.md 3.3 step 1). Reading the whole chain up front is what lets step 8
 * convert every link in one pass; a pairwise test cannot be made idempotent here by any amount
 * of guarding, because it converts one operator per pass (spec 5, 7.10).
 */
function readChain(cp: readonly number[], a: number): Chain {
  let p = a;
  while (isDigit(at(cp, p))) p += 1;
  const firstRunEnd = p - 1;
  const links: ChainLink[] = [];
  let end = p - 1;

  for (;;) {
    let q = p;
    let leftSpace: 0 | 1 = 0;
    if (isSpaceLike(at(cp, q))) {
      leftSpace = 1;
      q += 1;
    }
    if (!isMulLetter(at(cp, q))) break;
    const letterIndex = q;
    q += 1;
    let rightSpace: 0 | 1 = 0;
    if (isSpaceLike(at(cp, q))) {
      rightSpace = 1;
      q += 1;
    }
    if (!isDigit(at(cp, q))) break;
    while (isDigit(at(cp, q))) q += 1;
    links.push({ letterIndex, leftSpace, rightSpace });
    end = q - 1;
    p = q;
  }

  return { end, links, firstRunEnd };
}

/** `null` when a guard declines the chain — always the whole chain, never a subset. */
function chainEdits(cp: readonly number[], a: number, chain: Chain): Edit[] | null {
  const links = chain.links;
  const first = links[0];
  if (first === undefined) return null;

  // M1 — each link symmetric, and every link agreeing. `5x4 x 3` is ambiguous and is declined
  // whole rather than half-converted.
  const sp = first.leftSpace;
  for (const link of links) {
    if (link.leftSpace !== link.rightSpace) return null;
    if (link.leftSpace !== sp) return null;
  }

  // M2/M3 — the chain's OUTER boundaries, not each link. Applying them per link is what made
  // the pairwise form reject chains: the letter past the middle digit run is itself a
  // MUL-LETTER, hence a LETTER.
  const before = at(cp, a - 1);
  const after = at(cp, chain.end + 1);
  if (before !== NONE && isLetter(before)) return null;
  if (after !== NONE && isLetter(after)) return null;

  // M4 — hexadecimal literal. Latin-lowercase only: a hex literal is never written with
  // Cyrillic. Inspects the first link alone.
  if (
    sp === 0 &&
    at(cp, first.letterIndex) === LOWER_X &&
    chain.firstRunEnd === a &&
    at(cp, a) === DIGIT_ZERO
  ) {
    return null;
  }

  // There is no M5. It was removed rather than extended (spec 3.3 step 7, 7.3).
  const edits: Edit[] = [];
  for (const link of links) {
    const j = link.letterIndex;
    const replacement =
      sp === 0 ? [MULTIPLICATION] : [at(cp, j - 1), MULTIPLICATION, at(cp, j + 1)];
    edits.push({ start: j - sp, end: j + sp + 1, replacement, ruleId: "symbols" });
  }
  return edits;
}

/** spec/rules/symbols.md 3.4. Only the literal `+/-`; the bare `+-` is never converted. */
function plusMinusAt(cp: readonly number[], i: number): Edit | null {
  if (at(cp, i + 1) !== SOLIDUS || at(cp, i + 2) !== HYPHEN_MINUS) return null;
  // F1 — `[+/-]` is a regular-expression character class.
  if (at(cp, i - 1) === SQUARE_OPEN) return null;
  // F2 — numeric context, with one optional intervening space so `+/-5` and `+/- 5` both work.
  // Without it, prose that names the characters (`lines marked +/- were edited`) is corrupted.
  let j = i + 3;
  if (at(cp, j) === SPACE) j += 1;
  if (!isDigit(at(cp, j))) return null;
  return { start: i, end: i + 3, replacement: [PLUS_MINUS], ruleId: "symbols" };
}

export const symbolsRule: Rule = {
  id: "symbols",
  apply(ctx: RuleContext): Edit[] {
    const cp = ctx.cp;
    const n = cp.length;
    const edits: Edit[] = [];
    let i = 0;

    while (i < n) {
      const current = at(cp, i);

      if (current === PAREN_OPEN) {
        const edit = trademarkAt(cp, i);
        if (edit !== null) {
          edits.push(edit);
          i = edit.end;
          continue;
        }
      } else if (isDigit(current) && !isDigit(at(cp, i - 1))) {
        // Keyed on the start of a maximal digit run, not on the letter.
        const chain = readChain(cp, i);
        const chainResult = chainEdits(cp, i, chain);
        if (chainResult !== null) for (const edit of chainResult) edits.push(edit);
        // Continue past the chain whether or not it converted. A declined chain has no
        // convertible sub-chain: any sub-chain starts right after a MUL-LETTER, which is a
        // LETTER, so M2 rejects it.
        i = chain.end + 1;
        continue;
      } else if (current === PLUS) {
        const edit = plusMinusAt(cp, i);
        if (edit !== null) {
          edits.push(edit);
          i = edit.end;
          continue;
        }
      }
      i += 1;
    }

    return edits;
  },
};
