// High-risk-class tagging for the M4 dogfooding dry-run tool: heuristic hints for a human
// reviewer's attention, never a claim that a change is wrong and never fed back into transform()
// or any rule.
//
// Stage 10 Pass A correction: the previous version computed every tag from a `ReviewChange`'s
// own `before`/`after` text alone. That is provably too narrow for two of the tags (a
// numeric-range or dash-restyle edit is very often *only* the punctuation character -- the
// surrounding digits or spaces are unchanged context that never appeared in `before`/`after` at
// all, so the regex could never match) and too broad for a third (`quote-pairing-candidate`
// matched any quote-*class* code point, which includes U+0027/U+2019 -- the same characters an
// ordinary apostrophe/contraction edit produces, wrongly tagging almost every apostrophe change
// as a quote-pairing risk). This module fixes both directions:
//  - numeric-range/figure-label/dash-restyling/elision now search a small bounded *lexical
//    window* of the real surrounding line text (never fed to `escapeNotable`, never shown as
//    `before`/`after`) for the relevant token, and tag a review change only when that token's own
//    range genuinely *intersects* one of the review change's `AtomicEdit`s -- not merely "the
//    token exists somewhere in the same hunk."
//  - `quote-pairing-candidate` is now tied to the review change's own rule attribution
//    (`overlappingIsolatedRules` including `"quotes"`), not bare character-class membership --
//    an ordinary contraction, attributed only to `apostrophe`, no longer qualifies.
// Tagging runs *after* attribution for exactly this reason: quote-pairing needs attribution's
// output as an input.
import type { AtomicEdit, ReviewChange } from "./diff.js";
import { computeAlignedCodePointDelta } from "./diff.js";
import type { ReviewChangeAttribution } from "./attribution.js";
// The pinned Unicode UPPER predicate/data, imported directly from the engine rather than
// reimplemented -- Correction pass (spec 0.6.0): a handwritten `/[A-ZÀ-ÖØ-ÞА-Я]/` regex here
// missed U+0152 Œ, U+0178 Ÿ, U+0401 Ё, Greek uppercase and every astral uppercase code point,
// none of which `nbsp`'s own `isUpper`-based N7 misses. A second, incomplete classification
// table is exactly the drift this import prevents.
import { isUpper } from "../../src/engine/unicode.js";
// Final Correction pass: the exact N7 structural predicates, imported from the rule itself
// rather than reimplemented a second (or third, counting the validator) time. `prepare()` reads
// the *actual resolved locale*'s quote-opening glyphs for OPENISH -- not a fixed cross-locale
// union -- and `isInitialAt`/`isAbbreviationTail`/`hasPrecedingInitial` are byte-for-byte the
// same functions `nbsp.ts`'s own C1 calls. None of these are part of the package's public API
// (`src/index.ts` never re-exports `src/rules/nbsp.ts`); this is an internal reuse within the
// dogfooding tool, not a new public surface.
import {
  prepare,
  isInitialAt,
  isAbbreviationTail,
  hasPrecedingInitial,
  type Prepared,
} from "../../src/rules/nbsp.js";
import type { LocaleData } from "../../src/types.js";

/** Used by `numeric-range-or-compound-label-candidate`, `figure-label-shaped`, and
 * `quote-elision-ambiguity-candidate` -- tags whose claim is "this token's own range genuinely
 * overlaps the named atomic edit." `intersectingAtomicEditId` is only ever set to an edit the
 * token range actually intersects; see `checkRiskTagEvidence` in consistency.ts, which enforces
 * that literally. */
export interface TokenEvidence {
  tokenText: string;
  tokenOldOffset: { codePointStart: number; codePointEnd: number };
  intersectingAtomicEditId: string;
}

/** Used only by `dash-restyling`, whose claim is deliberately weaker than `TokenEvidence`'s: "a
 * dash-class character sits within `DASH_PROXIMITY_CODEPOINTS` code points of the named atomic
 * edit" -- not that the dash character itself changed (a space-only edit next to an unchanged
 * dash is the common real case; see `computeRiskTags`'s doc comment). Stage 10 Pass A third
 * correction: this used to reuse `TokenEvidence`'s `intersectingAtomicEditId` field name for a
 * relationship that is proximity, not intersection -- a dishonest field name for what was
 * actually recorded, caught by `checkRiskTagEvidence` treating "intersecting" literally. */
export interface DashProximityEvidence {
  tokenText: string;
  tokenOldOffset: { codePointStart: number; codePointEnd: number };
  nearestAtomicEditId: string;
  /** Code-point distance from the dash token to the named atomic edit's old range; `0` when they
   * do intersect. Always `<= DASH_PROXIMITY_CODEPOINTS`. */
  distance: number;
}

export interface BoundaryEvidence {
  distance: number;
  boundaryType: string;
  boundaryText: string;
  /** The boundary token's own code-point range in the original file -- required so
   * `distance`/`boundaryText` can be independently re-verified against real source text, not
   * merely trusted. Stage 10 Pass A third correction: this field did not exist before; only
   * `distance`/`boundaryType`/`boundaryText` were recorded, with no range to check them against. */
  boundaryOldOffset: { codePointStart: number; codePointEnd: number };
}

/** `authored-en-dash-restyled` (spec 0.6.0, Correction pass). Identifies the exact source U+2013
 * this tag claims was restyled, and the specific `AtomicEdit` that did it -- not the review
 * change as a whole, which may bundle several edits. `checkRiskTagEvidence` independently
 * re-slices `sourceOldOffset` against the original file and re-derives, from `atomicEditId`'s own
 * `before`/`after`, that a substitution FROM U+2013 genuinely occurred there. */
export interface AuthoredEnDashEvidence {
  sourceOldOffset: { codePointStart: number; codePointEnd: number };
  /** Always "–" (U+2013) when honest. */
  sourceText: string;
  atomicEditId: string;
}

/** `single-initial-binding-candidate` (spec 0.6.0, Correction pass). Identifies the exact
 * converted space, its owning `AtomicEdit`, the left initial and the following non-initial
 * uppercase code point nbsp.md §3.9's C1 initial-to-word shape reads, and the explicit claim that
 * no preceding chain was confirmed. `checkRiskTagEvidence` independently re-derives every field
 * from the original text and the real N7 structural predicates (§3.9), never trusting the
 * recorded claim. */
export interface SingleInitialBindingEvidence {
  spaceOldOffset: { codePointStart: number; codePointEnd: number };
  atomicEditId: string;
  leftInitialCodePoint: string;
  leftInitialOldOffset: { codePointStart: number; codePointEnd: number };
  followingCodePoint: string;
  followingOldOffset: { codePointStart: number; codePointEnd: number };
  /** Always `true` when this tag fires -- an explicit, independently re-checkable claim rather
   * than an implicit one, so a future author cannot silently weaken the condition without
   * `checkRiskTagEvidence` catching the now-dishonest field. */
  noPrecedingChainConfirmed: true;
}

export interface RiskTag {
  tag: string;
  evidence:
    | TokenEvidence
    | DashProximityEvidence
    | BoundaryEvidence
    | AuthoredEnDashEvidence
    | SingleInitialBindingEvidence
    | null;
}

const CP_HYPHEN_MINUS = 0x002d;
const CP_HYPHEN = 0x2010;
const CP_NON_BREAKING_HYPHEN = 0x2011;
const CP_FIGURE_DASH = 0x2012;
const CP_EN_DASH = 0x2013;
const CP_EM_DASH = 0x2014;
const CP_NBSP = 0x00a0;
const CP_NNBSP = 0x202f;

const DASH_CODEPOINTS = [
  CP_HYPHEN_MINUS,
  CP_HYPHEN,
  CP_NON_BREAKING_HYPHEN,
  CP_FIGURE_DASH,
  CP_EN_DASH,
  CP_EM_DASH,
];
const dashCharClass = DASH_CODEPOINTS.map((cp) => String.fromCodePoint(cp)).join("");
const DASH_CHAR = new RegExp(`[${dashCharClass}]`, "g");
const NUMERIC_RANGE = new RegExp(`\\d[\\d.]*\\s*[${dashCharClass}]\\s*\\d[\\d.]*`, "g");
const FIGURE_LABEL_NUMERIC_RANGE = new RegExp(
  `\\b(?:figure|fig\\.|table|chapter|section|appendix)\\s+\\d[\\d.]*(?:\\s*[${dashCharClass}]\\s*\\d[\\d.]*)?`,
  "gi",
);
const NBSP_LIKE = new RegExp(`[${String.fromCodePoint(CP_NBSP)}${String.fromCodePoint(CP_NNBSP)}]`);
const NON_BREAKING_HYPHEN_CHAR = new RegExp(String.fromCodePoint(CP_NON_BREAKING_HYPHEN));
const QUOTE_CHARS = /['"‘’“”«»‹›]/;
const ELISION_QUOTE = /(^|\s)['‘’][a-z]{1,3}['‘’](\s|$)/gi;
const MDX_BOUNDARY_TOKEN = /`+|<\/?[A-Za-z][\w.-]*|\{/g;

/** `authored-en-dash-restyled` / `single-initial-binding-candidate` (spec 0.6.0). Both are
 * regression canaries for the two M4 Pass A reject classes: an authored en-dash restyled by
 * `dashes` (now impossible after the P5 fix, dashes.md §3.4/§8.8, but the tag stays useful if a
 * future change regresses it), and an `nbsp` edit binding a lone initial to a following
 * capitalized non-initial word without a confirmed preceding chain (still reachable under
 * `initialBinding: "single"`, and the exact shape the `"chain"` fix declines). Final Correction
 * pass: OPENISH is no longer a fixed cross-locale union here -- see the `prepare()` import above,
 * which reads the actual resolved locale's own quote-opening glyphs, matching N7 exactly. */
const EN_DASH_CHAR = "–";
const SPACE_CHAR = " ";
const NBSP_CHAR = " ";

/** How close (in code points) a dash-class character must be to an `AtomicEdit`'s own old range
 * for that edit to be considered "about" the dash, not merely "somewhere on the same line as a
 * dash." Small and explicit: covers an edit that changes only the space immediately beside a
 * dash (the common case -- see `computeFileDiff`'s doc comment: `" - "` -> `"—"` is usually
 * already one tight edit, but a locale/rule combination that edits the spaces and the dash
 * character separately must still be tagged). */
export const DASH_PROXIMITY_CODEPOINTS = 2;

/** Search window radius (code points) around an `AtomicEdit` used to look for MDX/JSX/code
 * boundary tokens and dash/numeric context -- never the whole line or file, so a token far away
 * on a long line cannot tag an edit near the other end of it. */
const LEXICAL_WINDOW_CODEPOINTS = 80;

/** How close (in code points) the *nearest edge* of an MDX/JSX/code boundary token must be to an
 * `AtomicEdit`'s own old range to tag `mdx-jsx-code-boundary-adjacent`. Distance is real
 * character distance in the source text, not "same line" -- a backtick 300 code points away on
 * the same long line no longer qualifies. */
export const MDX_BOUNDARY_MAX_DISTANCE_CODEPOINTS = 40;

function codePointArray(s: string): string[] {
  return [...s];
}

/** Converts a UTF-16 index into `text` (as returned by `RegExp.exec`'s `.index`, or a UTF-16
 * substring `.length`) to a code-point count. `RegExp.exec` always reports `.index` and match
 * length in UTF-16 units, never code points -- if any astral (surrogate-pair) code point appears
 * *anywhere before* the match in the same string, a raw `.index`/`.length` silently drifts from
 * the true code-point offset by one per such character. This was a real bug (Stage 10 Pass A
 * correction, second pass): `findTokenRanges` and the dash-proximity scan both assumed "every
 * token searched for is ASCII, so UTF-16 index == code-point index," which is true of the *match
 * itself* but not of what precedes it in the window -- an emoji earlier in the same lexical
 * window shifted every subsequent token's reported offset by one code point, up to and including
 * making a reported token range fail to intersect the very atomic edit it claimed to. */
function utf16LengthToCodePointLength(text: string): number {
  return [...text].length;
}

/** All non-overlapping matches of `pattern` (a `g`-flagged regex) within `windowText`, converted
 * to absolute code-point offsets via `windowStartCodePoint`. Both the match position and the
 * match length are re-measured in code points (never trusting `m.index`/`m[0].length` directly --
 * see `utf16LengthToCodePointLength`), so an astral code point anywhere earlier in the window
 * cannot desynchronize a later match's reported range. */
function findTokenRanges(
  windowText: string,
  windowStartCodePoint: number,
  pattern: RegExp,
): { text: string; start: number; end: number }[] {
  const results: { text: string; start: number; end: number }[] = [];
  pattern.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(windowText)) !== null) {
    const cpIndex = utf16LengthToCodePointLength(windowText.slice(0, m.index));
    const cpLength = utf16LengthToCodePointLength(m[0]);
    results.push({
      text: m[0],
      start: windowStartCodePoint + cpIndex,
      end: windowStartCodePoint + cpIndex + cpLength,
    });
    if (m[0].length === 0) pattern.lastIndex += 1; // guard against zero-width matches looping forever
  }
  return results;
}

function rangesIntersect(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** A bounded window of `fullText` (never the whole file) centered on `[start, end)`, plus the
 * code-point offset the window itself starts at -- so any match found inside it can be converted
 * back to an absolute offset. */
function lexicalWindow(
  fullText: string,
  start: number,
  end: number,
  radius: number,
): { text: string; startCodePoint: number } {
  const cps = codePointArray(fullText);
  const windowStart = Math.max(0, start - radius);
  const windowEnd = Math.min(cps.length, end + radius);
  return { text: cps.slice(windowStart, windowEnd).join(""), startCodePoint: windowStart };
}

/**
 * Computes every high-risk tag for one `ReviewChange`, given its own `AtomicEdit`s (already
 * looked up by the caller from the full per-file `AtomicEdit` list) and its attribution (computed
 * separately, beforehand -- see attribution.ts). `oldText`/`newText` are the full original and
 * transformed file text, used only to build small bounded lexical windows; never scanned in full.
 *
 * Exact rules (each records the token/edit that triggered it as evidence, never just "found
 * somewhere"):
 *  - `numeric-range-or-compound-label-candidate` -- a `\d...(dash)...\d` token found in a bounded
 *    window of the *old* line intersects one of this review change's `AtomicEdit` old ranges.
 *  - `figure-label-shaped` -- as above, but the token additionally starts with a
 *    `Figure|Table|...` word.
 *  - `dash-restyling` -- a dash-class character appears within `DASH_PROXIMITY_CODEPOINTS` code
 *    points of one of this review change's `AtomicEdit` old ranges (covers both "the edit changes
 *    the dash itself" and "the edit changes only whitespace immediately beside an unchanged
 *    dash"). An edit whose nearest dash is farther than that is never tagged, so an unrelated
 *    space removal elsewhere on the line does not inherit it.
 *  - `quote-elision-ambiguity-candidate` -- a short `'x'`/`'xx'` quoted run (the `rock 'n' roll`
 *    shape) in a bounded window intersects one of this review change's `AtomicEdit`s.
 *  - `quote-pairing-candidate` -- attribution says `"quotes"` is one of this review change's
 *    `overlappingIsolatedRules`, *and* the review change's own text contains a quote-class code
 *    point. Tied to the quotes rule's own attributed involvement, not bare character-class
 *    membership -- an ordinary contraction (attributed only to `apostrophe`) never qualifies.
 *  - `nbsp-insertion` / `non-breaking-hyphen-insertion` -- the review change's own `before`/`after`
 *    shows the code point appearing in `after` but not `before`.
 *  - `mdx-jsx-code-boundary-adjacent` -- the nearest MDX/JSX/code-boundary-looking token
 *    (backtick run, `<Tag`, `</Tag`, `{`) found in a bounded window is within
 *    `MDX_BOUNDARY_MAX_DISTANCE_CODEPOINTS` real code points of one of this review change's
 *    `AtomicEdit`s -- real character distance, not "same line."
 *  - `cross-line-edit` -- `reviewChange.crossLineEdit` (computed in diff.ts from whether an
 *    `AtomicEdit` itself inserts/removes a line boundary).
 *  - `large-edit` -- the *larger* of `before`/`after`'s code-point length exceeds 80. Measures
 *    affected volume, not `|Δlength|` -- replacing 1000 code points with 1000 different ones is
 *    not a small edit merely because the lengths match.
 */
export function computeRiskTags(input: {
  oldText: string;
  newText: string;
  reviewChange: ReviewChange;
  atomicEdits: readonly AtomicEdit[];
  attribution: ReviewChangeAttribution | undefined;
  /** The resolved locale the corpus is being run against (one locale for the whole M4 run --
   * dogfood-m4.ts's own CLI contract). Used only by `single-initial-binding-candidate`, to read
   * this exact locale's own OPENISH set via `prepare()` rather than a fixed cross-locale union. */
  locale: LocaleData;
}): RiskTag[] {
  const { oldText, newText, reviewChange, atomicEdits, attribution, locale } = input;
  const tags: RiskTag[] = [];
  const rcStart = reviewChange.oldOffset.codePointStart;
  const rcEnd = reviewChange.oldOffset.codePointEnd;
  const window = lexicalWindow(oldText, rcStart, rcEnd, LEXICAL_WINDOW_CODEPOINTS);

  const intersectingEdit = (tokenStart: number, tokenEnd: number): AtomicEdit | null => {
    for (const e of atomicEdits) {
      if (
        rangesIntersect(tokenStart, tokenEnd, e.oldOffset.codePointStart, e.oldOffset.codePointEnd)
      )
        return e;
    }
    return null;
  };

  // numeric-range-or-compound-label-candidate / figure-label-shaped
  for (const token of findTokenRanges(window.text, window.startCodePoint, NUMERIC_RANGE)) {
    const edit = intersectingEdit(token.start, token.end);
    if (edit) {
      tags.push({
        tag: "numeric-range-or-compound-label-candidate",
        evidence: {
          tokenText: token.text,
          tokenOldOffset: { codePointStart: token.start, codePointEnd: token.end },
          intersectingAtomicEditId: edit.id,
        },
      });
      break;
    }
  }
  for (const token of findTokenRanges(
    window.text,
    window.startCodePoint,
    FIGURE_LABEL_NUMERIC_RANGE,
  )) {
    const edit = intersectingEdit(token.start, token.end);
    if (edit) {
      tags.push({
        tag: "figure-label-shaped",
        evidence: {
          tokenText: token.text,
          tokenOldOffset: { codePointStart: token.start, codePointEnd: token.end },
          intersectingAtomicEditId: edit.id,
        },
      });
      break;
    }
  }

  // dash-restyling: proximity, not containment. Uses findTokenRanges (not a raw regex .exec
  // loop) so the dash's reported position is already code-point-correct even when an astral code
  // point precedes it in the window.
  {
    let best: {
      token: { text: string; start: number; end: number };
      edit: AtomicEdit;
      distance: number;
    } | null = null;
    for (const token of findTokenRanges(window.text, window.startCodePoint, DASH_CHAR)) {
      for (const e of atomicEdits) {
        const distance =
          token.end <= e.oldOffset.codePointStart
            ? e.oldOffset.codePointStart - token.end
            : token.start >= e.oldOffset.codePointEnd
              ? token.start - e.oldOffset.codePointEnd
              : 0;
        if (distance <= DASH_PROXIMITY_CODEPOINTS) {
          best = { token, edit: e, distance };
          break;
        }
      }
      if (best) break;
    }
    if (best) {
      tags.push({
        tag: "dash-restyling",
        evidence: {
          tokenText: best.token.text,
          tokenOldOffset: { codePointStart: best.token.start, codePointEnd: best.token.end },
          nearestAtomicEditId: best.edit.id,
          distance: best.distance,
        },
      });
    }
  }

  // quote-elision-ambiguity-candidate
  for (const token of findTokenRanges(window.text, window.startCodePoint, ELISION_QUOTE)) {
    const edit = intersectingEdit(token.start, token.end);
    if (edit) {
      tags.push({
        tag: "quote-elision-ambiguity-candidate",
        evidence: {
          tokenText: token.text,
          tokenOldOffset: { codePointStart: token.start, codePointEnd: token.end },
          intersectingAtomicEditId: edit.id,
        },
      });
      break;
    }
  }

  // quote-pairing-candidate: tied to attribution, not bare character class.
  if (
    attribution?.overlappingIsolatedRules.includes("quotes") &&
    QUOTE_CHARS.test(`${reviewChange.before}\n${reviewChange.after}`)
  ) {
    tags.push({ tag: "quote-pairing-candidate", evidence: null });
  }

  // authored-en-dash-restyled (spec 0.6.0, Correction pass): inspects each of this review
  // change's own AtomicEdits individually -- not reviewChange-level aggregate text -- using the
  // project's real `computeAlignedCodePointDelta` (the same alignment `computeCodePointDelta`
  // itself is now a thin wrapper over) rather than a positional `beforeCps[idx]` comparison.
  // Final Correction pass: the naive positional form was not generally equivalent to
  // "substitutes FROM U+2013" -- an insertion or deletion earlier in the same edit shifts a
  // preserved dash's index on one side without the other, which a raw index compare cannot tell
  // apart from a real substitution. The aligned delta's common-prefix/common-suffix trim is
  // exactly what tells them apart, and `prefix` maps an entry back to its real source offset.
  // After the P5 fix (dashes.md §3.4/§8.8) this should never fire on real transform() output (P5
  // declines the token before `dashes` ever proposes an edit for it), but it remains a
  // regression canary -- see `tests/scripts/dogfood-model.test.ts`.
  if (attribution?.overlappingIsolatedRules.includes("dashes")) {
    editLoop: for (const edit of atomicEdits) {
      const aligned = computeAlignedCodePointDelta(edit.before, edit.after);
      if (!aligned) continue;
      let offsetWithinMid = 0;
      for (const entry of aligned.entries) {
        if (entry.kind === "substitute" && entry.from === "U+2013") {
          const start = edit.oldOffset.codePointStart + aligned.prefix + offsetWithinMid;
          tags.push({
            tag: "authored-en-dash-restyled",
            evidence: {
              sourceOldOffset: { codePointStart: start, codePointEnd: start + 1 },
              sourceText: EN_DASH_CHAR,
              atomicEditId: edit.id,
            },
          });
          break editLoop;
        }
        // Only "substitute" and "delete" entries consume a position in `before`; "insert" does
        // not, so it must not advance the offset a later `before`-relative entry is measured from.
        if (entry.kind !== "insert") offsetWithinMid += 1;
      }
    }
  }

  // single-initial-binding-candidate (spec 0.6.0, Correction pass): inspects each of this review
  // change's own AtomicEdits individually for a real U+0020 -> U+00A0 substitution (never assumes
  // `reviewChange.oldOffset.codePointStart` is the converted space -- a multi-edit review change
  // groups several AtomicEdits, and the space this tag cares about may not be the group's first
  // code point), then reads nbsp.md §3.9's C1 initial-to-word shape around that edit's own
  // position using `nbsp.ts`'s own exported `isInitialAt`/`isAbbreviationTail`/
  // `hasPrecedingInitial` -- byte-for-byte the same functions N7 itself calls, prepared against
  // the *actual resolved locale* (`prepare(locale)`), not a fixed cross-locale OPENISH union.
  // `codePointArray` (not UTF-16 indices) keeps every lookaround correct across an astral code
  // point anywhere earlier in the file. The exact ambiguous shape represented by both the
  // English M4 witness ("...top N. It runs...") and the French `"single"`-mode cases
  // (`N. Bourbaki`).
  if (attribution?.overlappingIsolatedRules.includes("nbsp")) {
    const oldCps = codePointArray(oldText);
    const oldCodePoints = oldCps.map((c) => c.codePointAt(0) as number);
    const at = (i: number): string | undefined => oldCps[i];
    const prep: Prepared = prepare(locale);
    // nbsp.md §3.9: "one letter, one full stop, at a token start" -- `isInitialAt` already
    // encodes the token-start condition (NONE/SPACELIKE/OPENISH) exactly as N7 reads it; no
    // separate reimplementation here can drift from it because there is no separate
    // reimplementation.
    const isInitial = (p: number): boolean =>
      isInitialAt(oldCodePoints, prep, p) && !isAbbreviationTail(oldCodePoints, p);

    for (const edit of atomicEdits) {
      if (edit.before !== SPACE_CHAR || edit.after !== NBSP_CHAR) continue;
      const q = edit.oldOffset.codePointStart;
      const leftInitialP = q - 2;

      if (at(q - 1) !== ".") continue;
      if (!isInitial(leftInitialP)) continue;
      const rightCp = oldCodePoints[q + 1];
      if (rightCp === undefined || !isUpper(rightCp)) continue;
      if (at(q + 2) === ".") continue; // between-initials -- always safe, not this tag's shape
      if (hasPrecedingInitial(oldCodePoints, prep, leftInitialP)) continue; // a confirmed chain

      tags.push({
        tag: "single-initial-binding-candidate",
        evidence: {
          spaceOldOffset: { codePointStart: q, codePointEnd: q + 1 },
          atomicEditId: edit.id,
          leftInitialCodePoint: at(leftInitialP) as string,
          leftInitialOldOffset: { codePointStart: leftInitialP, codePointEnd: leftInitialP + 1 },
          followingCodePoint: at(q + 1) as string,
          followingOldOffset: { codePointStart: q + 1, codePointEnd: q + 2 },
          noPrecedingChainConfirmed: true,
        },
      });
      break;
    }
  }

  // nbsp-insertion / non-breaking-hyphen-insertion
  if (NBSP_LIKE.test(reviewChange.after) && !NBSP_LIKE.test(reviewChange.before)) {
    tags.push({ tag: "nbsp-insertion", evidence: null });
  }
  if (
    NON_BREAKING_HYPHEN_CHAR.test(reviewChange.after) &&
    !NON_BREAKING_HYPHEN_CHAR.test(reviewChange.before)
  ) {
    tags.push({ tag: "non-breaking-hyphen-insertion", evidence: null });
  }

  // mdx-jsx-code-boundary-adjacent: real offset distance, small explicit threshold.
  {
    let bestDistance: number | null = null;
    let bestToken: { text: string; start: number; end: number } | null = null;
    for (const token of findTokenRanges(window.text, window.startCodePoint, MDX_BOUNDARY_TOKEN)) {
      const distance =
        token.end <= rcStart ? rcStart - token.end : token.start >= rcEnd ? token.start - rcEnd : 0;
      if (bestDistance === null || distance < bestDistance) {
        bestDistance = distance;
        bestToken = token;
      }
    }
    if (
      bestDistance !== null &&
      bestToken !== null &&
      bestDistance <= MDX_BOUNDARY_MAX_DISTANCE_CODEPOINTS
    ) {
      tags.push({
        tag: "mdx-jsx-code-boundary-adjacent",
        evidence: {
          distance: bestDistance,
          boundaryType: bestToken.text,
          boundaryText: bestToken.text,
          boundaryOldOffset: { codePointStart: bestToken.start, codePointEnd: bestToken.end },
        },
      });
    }
  }

  // cross-line-edit
  if (reviewChange.crossLineEdit) tags.push({ tag: "cross-line-edit", evidence: null });

  // large-edit: affected volume, not |Δlength|.
  const volume = Math.max(
    codePointArray(reviewChange.before).length,
    codePointArray(reviewChange.after).length,
  );
  if (volume > 80) tags.push({ tag: "large-edit", evidence: null });

  void newText; // reserved for a future new-side lexical window; not needed by any rule above yet
  return tags;
}

// ---------------------------------------------------------------------------------------------
// Shape validators: does a piece of text actually look like what a given risk tag claims it is?
// Used by scripts/dogfood/consistency.ts to fail-closed-verify risk-tag evidence independently of
// the code that produced it -- exported here rather than duplicated so the two never drift apart.
// Every check below matches the *whole* candidate string (`^...$`), never searches within it, and
// uses a private, non-global copy of the pattern so it never shares mutable `lastIndex` state with
// the scanning regexes above.
// ---------------------------------------------------------------------------------------------

const NUMERIC_RANGE_WHOLE = new RegExp(`^\\d[\\d.]*\\s*[${dashCharClass}]\\s*\\d[\\d.]*$`);
const FIGURE_LABEL_WHOLE = new RegExp(
  `^(?:figure|fig\\.|table|chapter|section|appendix)\\s+\\d[\\d.]*(?:\\s*[${dashCharClass}]\\s*\\d[\\d.]*)?$`,
  "i",
);
const DASH_CHAR_WHOLE = new RegExp(`^[${dashCharClass}]$`);
const ELISION_QUOTE_WHOLE = /^['‘’][a-z]{1,3}['‘’]$/i;
const MDX_BOUNDARY_TOKEN_WHOLE = new RegExp(`^(?:${MDX_BOUNDARY_TOKEN.source})$`);

export function isNumericRangeTokenShape(text: string): boolean {
  return NUMERIC_RANGE_WHOLE.test(text);
}
export function isFigureLabelTokenShape(text: string): boolean {
  return FIGURE_LABEL_WHOLE.test(text);
}
export function isDashTokenShape(text: string): boolean {
  return DASH_CHAR_WHOLE.test(text);
}
export function isElisionQuoteTokenShape(text: string): boolean {
  // The scanning regex additionally requires word-boundary whitespace/anchors around the match;
  // once isolated as `tokenText` those anchors have already done their job, so only the inner
  // quoted-run shape itself needs re-checking here.
  return ELISION_QUOTE_WHOLE.test(text.trim());
}
export function isMdxBoundaryTokenShape(text: string): boolean {
  return MDX_BOUNDARY_TOKEN_WHOLE.test(text);
}
