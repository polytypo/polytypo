import type { Edit, Rule, RuleContext } from "../types.js";
import { isMarker, LINE_MARKER, NONE } from "../engine/sentinels.js";
import { isLetter } from "../engine/unicode.js";

// spec/rules/spaces.md 3.1. Explicit code points only: no regex, no \s (ARCHITECTURE.md 4.1).
const SPACE = 0x20;

const LF = 0x0a;
const CR = 0x0d;
const VT = 0x0b;
const FF = 0x0c;
const NEL = 0x85;
const LS = 0x2028;
const PS = 0x2029;

const COMMA = 0x2c;
const FULL_STOP = 0x2e;
const SEMICOLON = 0x3b;
const COLON = 0x3a;
const EXCLAMATION = 0x21;
const QUESTION = 0x3f;
const ELLIPSIS = 0x2026;

const PAREN_OPEN = 0x28;
const PAREN_CLOSE = 0x29;
const SQUARE_OPEN = 0x5b;
const SQUARE_CLOSE = 0x5d;
const CURLY_OPEN = 0x7b;
const CURLY_CLOSE = 0x7d;

const HYPHEN_MINUS = 0x2d;
const CARET = 0x5e;
const SOLIDUS = 0x2f;
const REVERSE_SOLIDUS = 0x5c;
const VERTICAL_LINE = 0x7c;
const ASTERISK = 0x2a;
const DIGIT_ZERO = 0x30;
const DIGIT_NINE = 0x39;
const LETTER_D_UPPER = 0x44;
const LETTER_D_LOWER = 0x64;
const LETTER_P_UPPER = 0x50;
const LETTER_P_LOWER = 0x70;
const LETTER_O_UPPER = 0x4f;
const LETTER_O_LOWER = 0x6f;

/** `NONE` in the spec: the position one past either end of the array. */

/** Out-of-range reads yield `NONE`, which is the spec's own boundary value. */
function at(cp: readonly number[], i: number): number {
  const value = cp[i];
  return value === undefined ? NONE : value;
}

/** `BREAK` — including `LINE_MARKER`, a member for every rule everywhere (modes.md 3.2). */
function isBreak(cp: number): boolean {
  return (
    cp === LF ||
    cp === CR ||
    cp === VT ||
    cp === FF ||
    cp === NEL ||
    cp === LS ||
    cp === PS ||
    cp === LINE_MARKER
  );
}

/**
 * Six code points. U+2026 is deliberately absent: with it, `Wait ...` would keep its space
 * here, `ellipsis` would yield `Wait …`, and a second pipeline pass would then strip that
 * space — a composition divergence (spec/rules/spaces.md 3.4).
 */
function isStripBefore(cp: number): boolean {
  return (
    cp === COMMA ||
    cp === FULL_STOP ||
    cp === SEMICOLON ||
    cp === COLON ||
    cp === EXCLAMATION ||
    cp === QUESTION
  );
}

function isDotlike(cp: number): boolean {
  return cp === FULL_STOP || cp === ELLIPSIS;
}

function isOpenBracket(cp: number): boolean {
  return cp === PAREN_OPEN || cp === SQUARE_OPEN || cp === CURLY_OPEN;
}

function isCloseBracket(cp: number): boolean {
  return cp === PAREN_CLOSE || cp === SQUARE_CLOSE || cp === CURLY_CLOSE;
}

function matchingCloser(open: number): number {
  if (open === PAREN_OPEN) return PAREN_CLOSE;
  if (open === SQUARE_OPEN) return SQUARE_CLOSE;
  return CURLY_CLOSE;
}

/** spec/rules/spaces.md 3.3: `- [ ] item` must not become `- [] item`. It may still collapse. */
function isEmptyBracketGuarded(left: number, right: number): boolean {
  return isOpenBracket(left) && right === matchingCloser(left);
}

/**
 * The replacement length is a pure function of the two bounding code points, computed once
 * (spec/rules/spaces.md 3.2 step 5). A two-pass "collapse then strip" formulation would need a
 * fixed-point loop, which two runtimes would iterate differently.
 */
/**
 * spec/rules/spaces.md 3.4. A run of dots is a different token from a terminal full stop — a
 * relative path, a truncation, a typed ellipsis — and deleting the space before it merges the
 * run with a preceding abbreviation dot (`See ../docs` → `See../docs`).
 *
 * `e` indexes `right` in the **input** array, and the run is measured there. Measuring it after
 * any edit had been applied would break the Chicago spaced ellipsis `Hello . . .`, where every
 * dot is a lone dot at decision time and all three spaces must still strip.
 */
function isLoneDot(cp: readonly number[], e: number): boolean {
  if (at(cp, e) !== FULL_STOP) return true;
  return !isDotlike(at(cp, e + 1));
}

function isDigitAscii(cp: number): boolean {
  return cp >= DIGIT_ZERO && cp <= DIGIT_NINE;
}

/** spec/rules/spaces.md 3.6: the recognised "mouth" glyphs of a Western text emoticon. */
function isEmoticonMouth(cp: number): boolean {
  return (
    cp === PAREN_OPEN ||
    cp === PAREN_CLOSE ||
    cp === SQUARE_OPEN ||
    cp === SQUARE_CLOSE ||
    cp === LETTER_D_UPPER ||
    cp === LETTER_D_LOWER ||
    cp === LETTER_P_UPPER ||
    cp === LETTER_P_LOWER ||
    cp === LETTER_O_UPPER ||
    cp === LETTER_O_LOWER ||
    cp === SOLIDUS ||
    cp === REVERSE_SOLIDUS ||
    cp === VERTICAL_LINE ||
    cp === ASTERISK
  );
}

/**
 * spec/rules/spaces.md 3.6, the emoticon guard. A colon or semicolon immediately followed by
 * an optional "nose" and a recognised "mouth" is the eye of a Western text emoticon
 * (`:-)`, `:)`, `;-)`), not sentence punctuation, and the space in front of it must survive.
 *
 * The mouth must not itself run into a letter or a digit — `:Deal` is a colon before a
 * capitalised word, not a face — which is the one check needed to keep this from firing on
 * ordinary prose. `e` indexes `right`, exactly as `isLoneDot` does.
 */
function isEmoticon(cp: readonly number[], e: number): boolean {
  const eye = at(cp, e);
  if (eye !== COLON && eye !== SEMICOLON) return false;

  let i = e + 1;
  const nose = at(cp, i);
  if (nose === HYPHEN_MINUS || nose === CARET) i += 1;

  if (!isEmoticonMouth(at(cp, i))) return false;
  i += 1;

  const after = at(cp, i);
  return !isLetter(after) && !isDigitAscii(after);
}

/**
 * spec/rules/spaces.md 3.6, the mouth side. `(` and `[` are EMOTICON-MOUTH members and
 * OPEN-BRACKET members at once, so without this the opening-bracket clause deleted the space
 * after an emoticon the eye side had just recognised: `a :( b` became `a :(b`, and then `a:(b`
 * on a second pass, because a letter after the mouth stops the eye side firing.
 *
 * The walk is the eye side's, backwards from `s`, and it needs no trailing check: the code point
 * after the mouth is the space run itself, which is neither a letter nor a digit. A nose with no
 * eye behind it is not a face — EMOTICON-NOSE and EMOTICON-EYE are disjoint, so the walk cannot
 * mistake one for the other.
 */
function isEmoticonEnd(cp: readonly number[], s: number): boolean {
  if (!isEmoticonMouth(at(cp, s - 1))) return false;

  let j = s - 2;
  const nose = at(cp, j);
  if (nose === HYPHEN_MINUS || nose === CARET) j -= 1;

  const eye = at(cp, j);
  return eye === COLON || eye === SEMICOLON;
}

function replacementLength(
  cp: readonly number[],
  s: number,
  e: number,
  left: number,
  right: number,
): number {
  // The guard is a clause of this decision, not a "skip the run" branch: `(  )` collapses to
  // `( )` (spec/rules/spaces.md 3.3, normative reading).
  if (isEmptyBracketGuarded(left, right)) return 1;
  if (isOpenBracket(left) && !isEmoticonEnd(cp, s)) return 0;
  if (isCloseBracket(right)) return 0;
  if (isStripBefore(right) && isLoneDot(cp, e) && !isEmoticon(cp, e)) return 0;
  return 1;
}

export const spacesRule: Rule = {
  id: "spaces",
  apply(ctx: RuleContext): Edit[] {
    const cp = ctx.cp;
    const n = cp.length;
    const edits: Edit[] = [];
    let i = 0;

    while (i < n) {
      if (at(cp, i) !== SPACE) {
        i += 1;
        continue;
      }

      const s = i;
      let e = s;
      while (e < n && at(cp, e) === SPACE) e += 1;
      const k = e - s;

      const left = at(cp, s - 1);
      const right = at(cp, e);

      // Boundary guard: indentation, Markdown hard breaks and text-unit edges are structural.
      // A span boundary is a text-unit edge: spaces.md 3.2 step 4 protects "trailing spaces at
      // the end of a text unit, which in `html` mode are frequently the only separator between
      // two inline elements", and in the concatenated array that edge is a marker rather than
      // `NONE`. Only this guard treats a marker that way; everywhere else in this rule the
      // marker is opaque content, per modes.md 3.3.
      if (
        left === NONE ||
        isMarker(left) ||
        isBreak(left) ||
        right === NONE ||
        isMarker(right) ||
        isBreak(right)
      ) {
        i = e;
        continue;
      }

      const length = replacementLength(cp, s, e, left, right);
      if (length !== k) {
        edits.push({
          start: s,
          end: e,
          replacement: length === 0 ? [] : [SPACE],
          ruleId: "spaces",
        });
      }
      i = e;
    }

    return edits;
  },
};
