import { toCodePoints } from "../engine/codepoints.js";
import { isLetter, isUpper, simpleUppercase } from "../engine/unicode.js";
import { PolytypoError } from "../errors.js";
import type { Edit, InitialBinding, LocaleData, Rule, RuleContext } from "../types.js";
import { LINE_MARKER, NONE } from "../engine/sentinels.js";

/**
 * `nbsp` — spec/rules/nbsp.md (spec 0.1.0), order 70 (last).
 *
 * Ten sub-rules, N1…N10, evaluated in that fixed order; each claims indices, and the first
 * claim at an index wins (spec 3.2). The claim table is a positional array, never a map:
 * a map-iteration implementation would resolve conflicts differently in Go
 * (ARCHITECTURE.md 4.5). No regex, no native-string indexing (ARCHITECTURE.md 4.1, 4.2).
 */

const SPACE = 0x20;
const TAB = 0x09;
const NBSP = 0xa0;
const NNBSP = 0x202f;
const FULL_STOP = 0x2e;
const DIGIT_ZERO = 0x30;
const DIGIT_NINE = 0x39;

const PAREN_OPEN = 0x28;
const SQUARE_OPEN = 0x5b;
const BRACE_OPEN = 0x7b;
const PAREN_CLOSE = 0x29;
const SQUARE_CLOSE = 0x5d;
const BRACE_CLOSE = 0x7d;

const EN_DASH = 0x2013;
const EM_DASH = 0x2014;
const ELLIPSIS = 0x2026;

/** Not a code point: stands for "index out of range" (spec 3.1 `NONE`). */

/** Out-of-range reads yield `NONE`, which is the spec's own boundary value. */
export function at(cp: readonly number[], i: number): number {
  const value = cp[i];
  return value === undefined ? NONE : value;
}

function isDigit(cp: number): boolean {
  return cp >= DIGIT_ZERO && cp <= DIGIT_NINE;
}

function isAlnum(cp: number): boolean {
  return isDigit(cp) || isLetter(cp);
}

/** 3.1 `BREAK`. */
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

function isNoBreak(cp: number): boolean {
  return cp === NBSP || cp === NNBSP;
}

/**
 * 3.1 `OTHER-SPACE`: the fixed-width spaces. In `SPACELIKE`, so they read as a boundary, but
 * never converted and never an "already correct" state — §4 promises a thin or figure space
 * the author placed is left exactly where it is.
 */
function isOtherSpace(cp: number): boolean {
  return (cp >= 0x2000 && cp <= 0x200a) || cp === 0x205f || cp === 0x3000;
}

/**
 * 3.1 `SPACELIKE` — and `NOBREAK ⊂ SPACELIKE`. Every boundary test in this rule uses this
 * predicate and never U+0020 alone; that single decision is what makes the rule idempotent.
 */
export function isSpaceLike(cp: number): boolean {
  return cp === SPACE || isNoBreak(cp) || cp === TAB || isOtherSpace(cp) || isBreak(cp);
}

/**
 * 3.1 `SENTENCE-DASH` — U+2013 and U+2014 only, the left boundary of N3, N9 and N10.
 *
 * A hyphen is deliberately excluded, U+002D and U+2011 alike: it marks an *intra-word*
 * position, so the token after it is not a free-standing word. With U+2011 accepted, `из-за
 * дождя` bound twice — `hyphen` produced `из‑за` and N3 then read the compound's tail `за` as
 * the listed preposition (3.5 step 2). An em or en dash does open a phrase, so `— в Москве`
 * still binds.
 */
function isSentenceDash(cp: number): boolean {
  return cp === EN_DASH || cp === EM_DASH;
}

interface QuoteTarget {
  readonly open: number;
  readonly close: number;
  readonly target: number;
}

/** Locale data, resolved to code points once per call. No module-level state (ARCHITECTURE.md 7). */
export interface Prepared {
  readonly beforePunctuation: readonly number[];
  readonly narrowBeforePunctuation: readonly number[];
  readonly shortWords: readonly (readonly number[])[];
  readonly abbreviations: readonly (readonly number[])[];
  readonly units: readonly (readonly number[])[];
  readonly beforeNumber: readonly (readonly number[])[];
  readonly beforeWord: readonly (readonly number[])[];
  readonly symbols: readonly (readonly number[])[];
  readonly initialBinding: InitialBinding;
  readonly opens: readonly number[];
  readonly closes: readonly number[];
  readonly quotePairs: readonly QuoteTarget[];
}

function malformed(message: string): never {
  throw new PolytypoError("POLYTYPO_MALFORMED_LOCALE_DATA", message);
}

function singleCodePoint(entry: string, field: string): number {
  const cps = toCodePoints(entry);
  const first = cps[0];
  if (cps.length !== 1 || first === undefined) {
    malformed(`nbsp.${field} entry "${entry}" is not exactly one code point.`);
  }
  return first;
}

function contains(list: readonly number[], cp: number): boolean {
  for (const value of list) {
    if (value === cp) return true;
  }
  return false;
}

/** Longest first, so each sub-rule's "longest match wins at a given `a`" is a linear search. */
function prepareList(entries: readonly string[]): (readonly number[])[] {
  const out = entries.map((entry) => toCodePoints(entry));
  out.sort((a, b) => b.length - a.length);
  return out;
}

export function prepare(locale: LocaleData): Prepared {
  const data = locale.nbsp;
  const beforePunctuation = data.beforePunctuation.map((entry) =>
    singleCodePoint(entry, "beforePunctuation"),
  );
  const narrowBeforePunctuation = data.narrowBeforePunctuation.map((entry) =>
    singleCodePoint(entry, "narrowBeforePunctuation"),
  );
  // 2: the two arrays must be disjoint. The schema does not enforce it, and picking a winner
  // silently would make N1's precedence load-bearing where the spec says it must not be.
  for (const cp of beforePunctuation) {
    if (contains(narrowBeforePunctuation, cp)) {
      malformed(
        `nbsp.beforePunctuation and nbsp.narrowBeforePunctuation both list U+${cp.toString(16).toUpperCase().padStart(4, "0")}; they must be disjoint (spec/rules/nbsp.md §2).`,
      );
    }
  }

  const primary = locale.quotes.primary;
  const secondary = locale.quotes.secondary;
  const opens = [
    PAREN_OPEN,
    SQUARE_OPEN,
    BRACE_OPEN,
    singleCodePoint(primary.open, "quotes.primary.open"),
    singleCodePoint(secondary.open, "quotes.secondary.open"),
  ];
  const closes = [
    PAREN_CLOSE,
    SQUARE_CLOSE,
    BRACE_CLOSE,
    singleCodePoint(primary.close, "quotes.primary.close"),
    singleCodePoint(secondary.close, "quotes.secondary.close"),
  ];

  const quotePairs: QuoteTarget[] = [];
  for (const pair of [primary, secondary]) {
    if (pair.innerSpace === "none") continue;
    const open = singleCodePoint(pair.open, "quotes.open");
    const close = singleCodePoint(pair.close, "quotes.close");
    // 3.10 sidedness precondition: an open glyph equal to its close glyph cannot be told
    // apart without the pairing information only `quotes` has. Documented no-op (§7.5).
    if (open === close) continue;
    quotePairs.push({ open, close, target: pair.innerSpace === "nbsp" ? NBSP : NNBSP });
  }

  return {
    beforePunctuation,
    narrowBeforePunctuation,
    shortWords: prepareList(data.afterShortWords),
    abbreviations: prepareList(data.abbreviations),
    units: prepareList(data.beforeUnits),
    beforeNumber: prepareList(data.beforeNumber),
    beforeWord: prepareList(data.beforeWord),
    symbols: prepareList(data.afterSymbols),
    initialBinding: data.initialBinding,
    opens,
    closes,
    quotePairs,
  };
}

/** 3.1 `OPENISH` / `CLOSEISH`: the ASCII brackets plus every locale quote glyph. */
export function isOpenish(prep: Prepared, cp: number): boolean {
  return contains(prep.opens, cp);
}

function isCloseish(prep: Prepared, cp: number): boolean {
  return contains(prep.closes, cp);
}

function isMark(prep: Prepared, cp: number): boolean {
  return contains(prep.beforePunctuation, cp) || contains(prep.narrowBeforePunctuation, cp);
}

type Claims = (Edit | undefined)[];

/** 3.2: the first sub-rule to claim an index wins; every later edit at that index is discarded. */
function claimConversion(claims: Claims, index: number, target: number): void {
  if (claims[index] !== undefined) return;
  claims[index] = { start: index, end: index + 1, replacement: [target], ruleId: "nbsp" };
}

function claimInsertion(claims: Claims, index: number, target: number): void {
  if (claims[index] !== undefined) return;
  claims[index] = { start: index, end: index, replacement: [target], ruleId: "nbsp" };
}

type Matcher = (cp: readonly number[], a: number, w: readonly number[]) => boolean;

function matchExact(cp: readonly number[], a: number, w: readonly number[]): boolean {
  if (a + w.length > cp.length) return false;
  for (let j = 0; j < w.length; j += 1) {
    if (cp[a + j] !== w[j]) return false;
  }
  return true;
}

/** 3.5 step 1: exact except that the first code point may be its simple uppercase mapping. */
function matchFirstCharLenient(cp: readonly number[], a: number, w: readonly number[]): boolean {
  if (a + w.length > cp.length) return false;
  const first = w[0];
  if (first === undefined) return false;
  const head = cp[a];
  if (head !== first && head !== simpleUppercase(first)) return false;
  for (let j = 1; j < w.length; j += 1) {
    if (cp[a + j] !== w[j]) return false;
  }
  return true;
}

/** 3.6 step 1: exact except that a pattern U+0020 also matches U+00A0 or U+202F. */
function matchSpaceLenient(cp: readonly number[], a: number, w: readonly number[]): boolean {
  if (a + w.length > cp.length) return false;
  for (let j = 0; j < w.length; j += 1) {
    const p = w[j] as number;
    const c = cp[a + j] as number;
    if (c === p) continue;
    if (p === SPACE && isNoBreak(c)) continue;
    return false;
  }
  return true;
}

/**
 * 3.5, normative for N3, N4, N5, N6, N9 and N10: the longest entry that matches at `a` is
 * selected, the sub-rule's guards are applied to *that* entry, and there is no backtracking —
 * a shorter entry is never retried when the longest one fails a guard.
 */
function longestMatch(
  patterns: readonly (readonly number[])[],
  cp: readonly number[],
  a: number,
  matcher: Matcher,
): readonly number[] | undefined {
  for (const w of patterns) {
    if (matcher(cp, a, w)) return w;
  }
  return undefined;
}

/** N1 (3.3) and N2 (3.4) differ only in which no-break space is the target. */
function punctuationSubRule(
  cp: readonly number[],
  prep: Prepared,
  claims: Claims,
  marks: readonly number[],
  target: number,
  other: number,
): void {
  if (marks.length === 0) return;
  for (let i = 0; i < cp.length; i += 1) {
    if (!contains(marks, cp[i] as number)) continue;
    const left = at(cp, i - 1);
    // Step 1 — run guard: only the first mark of `?!` or `!!!` takes the space.
    if (left !== NONE && isMark(prep, left)) continue;
    // Step 2 — right-context guard: this is what protects `http://` and `12:30`.
    const after = at(cp, i + 1);
    // U+2026 is accepted: the guard exists to catch punctuation *inside a token*, and an
    // ellipsis after a question mark is not that. `Vraiment?…` must take the same space
    // `Vraiment ?` does, whether or not `ellipsis` (order 20) has already run.
    if (
      after !== NONE &&
      !isSpaceLike(after) &&
      !isCloseish(prep, after) &&
      after !== ELLIPSIS &&
      !isMark(prep, after)
    ) {
      continue;
    }
    // Step 3 — quote-glyph guard. The space beside an opening quotation glyph is
    // `quotes.innerSpace` and belongs to N8 alone. Without this, N2 and N8 want different
    // code points at one index, and "already correct" claims nothing, so the two alternate
    // for ever on the French input `«?` (3.2, 3.10.1).
    if (isOpenish(prep, left)) continue;
    if (left !== NONE && isSpaceLike(left) && isOpenish(prep, at(cp, i - 2))) continue;
    // Step 4.
    if (left === target) continue;
    if (left === SPACE || left === other) {
      claimConversion(claims, i - 1, target);
      continue;
    }
    // A fixed-width space stays as typed, and nothing is inserted beside it.
    if (isOtherSpace(left)) continue;
    if (left === NONE || isBreak(left) || left === TAB) continue;
    claimInsertion(claims, i, target);
  }
}

/** N3 — 3.5 `afterShortWords`. */
function shortWordsSubRule(cp: readonly number[], prep: Prepared, claims: Claims): void {
  if (prep.shortWords.length === 0) return;
  for (let a = 0; a < cp.length; a += 1) {
    const w = longestMatch(prep.shortWords, cp, a, matchFirstCharLenient);
    if (w === undefined) continue;
    const k = w.length;
    const before = at(cp, a - 1);
    if (!(
      before === NONE ||
      isSpaceLike(before) ||
      isOpenish(prep, before) ||
      isSentenceDash(before)
    )) {
      continue;
    }
    const separator = at(cp, a + k);
    if (separator === NBSP) continue;
    if (separator !== SPACE) continue;
    const next = at(cp, a + k + 1);
    if (!isAlnum(next) && !isOpenish(prep, next)) continue;
    claimConversion(claims, a + k, NBSP);
  }
}

/** N4 — 3.6 `abbreviations`. */
function abbreviationsSubRule(cp: readonly number[], prep: Prepared, claims: Claims): void {
  if (prep.abbreviations.length === 0) return;
  for (let a = 0; a < cp.length; a += 1) {
    const w = longestMatch(prep.abbreviations, cp, a, matchSpaceLenient);
    if (w === undefined) continue;
    const k = w.length;
    if (isAlnum(at(cp, a - 1))) continue;
    if (isAlnum(at(cp, a + k))) continue;
    for (let j = 0; j < k; j += 1) {
      if (w[j] !== SPACE) continue;
      if (cp[a + j] === NBSP) continue;
      claimConversion(claims, a + j, NBSP);
    }
  }
}

/** N5 — 3.7 `beforeUnits`. Converts an existing space; never inserts one (§7.2). */
function unitsSubRule(cp: readonly number[], prep: Prepared, claims: Claims): void {
  if (prep.units.length === 0) return;
  for (let a = 0; a < cp.length; a += 1) {
    const w = longestMatch(prep.units, cp, a, matchExact);
    if (w === undefined) continue;
    const k = w.length;
    if (isAlnum(at(cp, a + k))) continue;
    const left = at(cp, a - 1);
    if (left === NBSP) continue;
    if (left !== SPACE) continue;
    if (!isDigit(at(cp, a - 2))) continue;
    let b = a - 2;
    while (b - 1 >= 0 && isDigit(cp[b - 1] as number)) b -= 1;
    // The letter guard: `H2 O`, `A4`, `MP3` are not measurements.
    if (isLetter(at(cp, b - 1))) continue;
    claimConversion(claims, a - 1, NBSP);
  }
}

/** N6 — 3.8 `afterSymbols`. Conversion only. */
function symbolsSubRule(cp: readonly number[], prep: Prepared, claims: Claims): void {
  if (prep.symbols.length === 0) return;
  for (let a = 0; a < cp.length; a += 1) {
    const w = longestMatch(prep.symbols, cp, a, matchExact);
    if (w === undefined) continue;
    const k = w.length;
    if (isAlnum(at(cp, a - 1))) continue;
    const separator = at(cp, a + k);
    if (separator === NBSP) continue;
    if (separator !== SPACE) continue;
    if (!isDigit(at(cp, a + k + 1))) continue;
    claimConversion(claims, a + k, NBSP);
  }
}

/** 3.9: one uppercase letter, one full stop, at a token start. */
export function isInitialAt(cp: readonly number[], prep: Prepared, p: number): boolean {
  if (p < 0) return false;
  if (!isUpper(at(cp, p))) return false;
  if (at(cp, p + 1) !== FULL_STOP) return false;
  const before = at(cp, p - 1);
  return before === NONE || isSpaceLike(before) || isOpenish(prep, before);
}

/**
 * 3.9 guard C1-a: an uppercase letter plus a dot that is itself preceded by a *lower-case*
 * letter plus a dot is the second token of an abbreviation, not an initial. Without it the
 * shipped `de-DE` data turns `z. B. Berlin` into `z.⍽B.⍽Berlin` — a false positive on
 * ordinary prose. `А. С. Пушкин` is unaffected: `cp[p-3]` there is uppercase.
 */
export function isAbbreviationTail(cp: readonly number[], p: number): boolean {
  if (!isSpaceLike(at(cp, p - 1))) return false;
  if (at(cp, p - 2) !== FULL_STOP) return false;
  const head = at(cp, p - 3);
  return isLetter(head) && !isUpper(head);
}

/**
 * 3.9 chain confirmation: is the initial whose letter sits at `p` itself immediately preceded by
 * another initial (`cp[p-1]` space-like, `cp[p-2]` a full stop, and `isInitialAt(p-3)`)? Used only
 * by `"chain"` mode's C1, to require Chicago's own "two or more initials" before the space
 * leading into a following non-initial word (a candidate surname) is bound — see nbsp.md §3.9.
 */
export function hasPrecedingInitial(cp: readonly number[], prep: Prepared, p: number): boolean {
  const gap = at(cp, p - 1);
  if (gap !== SPACE && gap !== NBSP) return false;
  if (at(cp, p - 2) !== FULL_STOP) return false;
  return isInitialAt(cp, prep, p - 3);
}

/** N7 — 3.9 `initialBinding`. */
function initialsSubRule(cp: readonly number[], prep: Prepared, claims: Claims): void {
  const mode: InitialBinding = prep.initialBinding;
  if (mode === "none") return;
  for (let q = 0; q < cp.length; q += 1) {
    const here = cp[q] as number;
    if (here !== SPACE && here !== NBSP) continue;
    // C1 — an initial on the left and an uppercase letter on the right, unless C1-a declines.
    const leftInitialP = q - 2;
    const c1Shape =
      at(cp, q - 1) === FULL_STOP &&
      isInitialAt(cp, prep, leftInitialP) &&
      isUpper(at(cp, q + 1)) &&
      !isAbbreviationTail(cp, leftInitialP);
    // `"chain"` mode additionally requires either that the right side is itself an initial (the
    // between-initials case, e.g. `E.|B.`, always safe) or that the left initial is itself
    // preceded by another initial (a confirmed chain of two or more, e.g. `E. B.|White`) before
    // binding to a plain following word. `"single"` mode keeps the unconditional shape check —
    // that is the behaviour `fr`/`fr-CA` need for `N. Bourbaki`/`M. Dupont` (nbsp.md §3.9,
    // Jacques André) and cannot structurally distinguish from a sentence-boundary collision.
    const c1 =
      c1Shape &&
      (mode === "single" || isInitialAt(cp, prep, q + 1) || hasPrecedingInitial(cp, prep, leftInitialP));
    // C2 — a word on the left and two consecutive initials on the right (`Пушкин А. С.`). Already
    // requires two initials by construction, so it is unaffected by `"chain"` vs `"single"`.
    const rightSpace = at(cp, q + 3);
    const c2 =
      isLetter(at(cp, q - 1)) &&
      isInitialAt(cp, prep, q + 1) &&
      (rightSpace === SPACE || rightSpace === NBSP) &&
      isInitialAt(cp, prep, q + 4);
    if (!c1 && !c2) continue;
    if (here === NBSP) continue;
    claimConversion(claims, q, NBSP);
  }
}

/** N8 — 3.10 `quotes.innerSpace`. The only sub-rule besides N1/N2 that may insert. */
function quotesSubRule(cp: readonly number[], prep: Prepared, claims: Claims): void {
  for (const pair of prep.quotePairs) {
    for (let i = 0; i < cp.length; i += 1) {
      const here = cp[i] as number;
      if (here === pair.open) {
        const right = at(cp, i + 1);
        if (right === pair.target) continue;
        if (right === SPACE || isNoBreak(right)) {
          claimConversion(claims, i + 1, pair.target);
          continue;
        }
        if (right === NONE || isBreak(right)) continue;
        claimInsertion(claims, i + 1, pair.target);
        continue;
      }
      if (here !== pair.close) continue;
      const left = at(cp, i - 1);
      if (left === pair.target) continue;
      if (left === SPACE || isNoBreak(left)) {
        claimConversion(claims, i - 1, pair.target);
        continue;
      }
      if (left === NONE || isBreak(left)) continue;
      claimInsertion(claims, i, pair.target);
    }
  }
}

/**
 * N9 (3.12 `beforeNumber`) and N10 (3.13 `beforeWord`) share every guard except what must
 * follow the separator: a digit for N9, a letter for N10.
 */
function forwardBindingSubRule(
  cp: readonly number[],
  prep: Prepared,
  claims: Claims,
  patterns: readonly (readonly number[])[],
  wantsDigit: boolean,
): void {
  if (patterns.length === 0) return;
  for (let a = 0; a < cp.length; a += 1) {
    const w = longestMatch(patterns, cp, a, matchExact);
    if (w === undefined) continue;
    const k = w.length;
    // G-D (3.13 step 5): in a locale where N7 is active, an *uppercase* letter plus a dot is
    // structurally an initial, and N7 owns that shape with better evidence. The UPPER test is
    // load-bearing: without it Russian `г.` would be inert, contradicting §6 case 13a.
    if (
      !wantsDigit &&
      prep.initialBinding !== "none" &&
      k === 2 &&
      isUpper(w[0] as number) &&
      w[1] === FULL_STOP
    ) {
      continue;
    }
    // G-L — stronger than "not ALNUM": it is what stops `S.` matching inside `Fig.S. 3`.
    const before = at(cp, a - 1);
    if (!(
      before === NONE ||
      isSpaceLike(before) ||
      isOpenish(prep, before) ||
      isSentenceDash(before)
    )) {
      continue;
    }
    // G-S — exactly one separator, and it must already be a space.
    const separator = at(cp, a + k);
    if (separator === NBSP) continue;
    if (separator !== SPACE) continue;
    const next = at(cp, a + k + 1);
    if (isSpaceLike(next)) continue;
    // G-W / "a following number": one code point, tested for membership. `NONE` fails both,
    // which is also the line-boundary guard G-B.
    if (wantsDigit ? !isDigit(next) : !isLetter(next)) continue;
    claimConversion(claims, a + k, NBSP);
  }
}

function scan(ctx: RuleContext): Edit[] {
  const prep = prepare(ctx.locale);
  const cp = ctx.cp;
  const claims: Claims = new Array<Edit | undefined>(cp.length + 1);

  // 3.2 — N1 … N10, in this order, first claim wins. The order is positional and total, not
  // an artefact of iterating a map.
  //
  // First claim wins only settles a conflict when both sub-rules emit; an "already correct"
  // branch claims nothing and yields the index. So sub-rules wanting *different* code points
  // must be disjoint by construction. They are: N3…N7, N9 and N10 all target U+00A0, so any
  // yield between them is a common fixed point. The only cross-target pairs are N1 against N2
  // — kept disjoint by the §2 precondition, which fails loudly — and N1/N2 against N8, which
  // is what the quote-glyph guard above repairs.
  punctuationSubRule(cp, prep, claims, prep.beforePunctuation, NBSP, NNBSP);
  punctuationSubRule(cp, prep, claims, prep.narrowBeforePunctuation, NNBSP, NBSP);
  shortWordsSubRule(cp, prep, claims);
  abbreviationsSubRule(cp, prep, claims);
  unitsSubRule(cp, prep, claims);
  symbolsSubRule(cp, prep, claims);
  initialsSubRule(cp, prep, claims);
  quotesSubRule(cp, prep, claims);
  forwardBindingSubRule(cp, prep, claims, prep.beforeNumber, true);
  forwardBindingSubRule(cp, prep, claims, prep.beforeWord, false);

  const edits: Edit[] = [];
  for (let i = 0; i <= cp.length; i += 1) {
    const claim = claims[i];
    if (claim !== undefined) edits.push(claim);
  }
  return edits;
}

export const nbspRule: Rule = {
  id: "nbsp",
  apply: scan,
};
