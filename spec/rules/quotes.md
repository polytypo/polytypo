# Rule: `quotes`

**Order:** 40. **Default:** on. **Modes:** text, html, markdown.
**Spec version:** 0.5.0 (0.4.1 for everything except the general ambiguous-medial-span veto
described in §3.2 and the History section below).

---

## 0. What changed from 0.1.0, and why it is a rewrite rather than a patch

0.1.0's whole architecture rested on one sentence: *the rule reasons about the straight input
marks and never about the curly output glyphs.* Two operator decisions withdraw that sentence:

1. **Any existing quote glyph is a re-typesetting candidate**, this locale's own or a foreign
   one. `«Wort»` in German prose becomes `„Wort“`. Same principle as `dashes` §3.2 step 2a
   applies to dash length: a quote glyph's identity in ordinary prose is at least as often a
   copy-paste artefact or unfamiliarity as a deliberate choice, and an author who wants their own
   typography untouched has always had the option of not running the pipeline. **0.1.0 §3.8 is
   withdrawn.**
2. **A space touching a quote mark is sloppiness, not evidence.** `" hello"` is `“hello”`; the
   space is deleted. `« bonjour »` is a formed pair on the first application, not only after
   `nbsp` has touched it.

Once every quote glyph is a candidate, **the rule's input alphabet equals its output alphabet**,
and 0.1.0's idempotency proof — whose first line is "a converted position is not a candidate in
pass 1 of the second run" — is not weakened, it is **false**. Three ideas replace it, and each
closes one class of the four defects that motivated this revision:

| Idea | Closes |
| --- | --- |
| **Glyph-blindness (Lemma A, §5).** Every quote mark belongs to `QUOTEMARK`, which is a member of *both* `OPENISH` and `CLOSEISH` and exempt from `canOpen`'s closeish rejection. A candidate's verdict never depends on *which* quote glyph its neighbour is. | neighbour drift; `apostrophe` (R₆) becomes structurally invisible as a neighbour |
| **Directional space-skipping (Lemma B, §5).** `canOpen` skips a space on its inner (right) side, `canClose` on its inner (left) side, unconditionally; each reads its *outer* side literally, except at the two positions `nbsp` can insert — derived from locale data, not hand-picked. | mandate 2; a run-1/run-2 asymmetry across an `nbsp`-inserted space; an HTML span boundary the same shape exposed |
| **Certification (the gate, §3.5).** The accepted pairing is *checked*, not proved: render the hypothetical output, re-run passes 1–2 on it, and decline pairs until the re-run reproduces the accepted set exactly. | width drift interacting with an unmatched candidate — the one remaining non-invariance, and provably non-local |

The division of labour is the point. **Lemmas A and B cover what the gate cannot see** — edits
made by *other* rules after `quotes` has run. **The gate covers everything `quotes` itself
does** — instabilities in the vetoes, the width partition, the depth assignment — without
anyone having to enumerate them by hand. A future change to the capability tests can break
quality; it cannot break idempotency, because the gate checks the actual re-derivation rather
than trusting an argument about it.

---

## 1. Purpose

`quotes` resolves every quotation mark in the text — typewriter (U+0022, U+0027) or typographic
(`«`, `“`, `„`, `‘`, `”`, …), the locale's own or a foreign locale's — into the pair of glyphs
the locale prescribes, alternating between the primary and secondary pairs by nesting depth, and
normalising the spacing immediately inside each pair.

---

## 2. Locale data consumed

- `quotes.primary.open` / `.close` / `.innerSpace`
- `quotes.secondary.open` / `.close` / `.innerSpace`
- `quotes.elisionIdioms` (spec 0.4.0) — an array of `{ left, elided, right }` triples, each a
  literal string, consulted only by the **listed elision veto** (§3.2) to **decline** pairing
  two `NARROW` marks as a quotation when the full context matches: the elided content between
  the marks, the word immediately before the opening mark, and the word immediately after the
  closing mark (`rock 'n' roll`'s `{ left: "rock", elided: "n", right: "roll" }`). May be
  empty, and empty is the default for a locale with no verified idiom of this shape. A
  decline-only list can never widen what this rule pairs, only narrow it — the same principle
  stated normatively in `nbsp.md` §2.1 and governing every list-valued field in
  `locale.schema.json`.

  **All three fields are required, and matching `elided` alone is deliberately not a supported
  shape.** A bare word list cannot distinguish an idiom from an arbitrary quotation of the same
  word — `The letter 'n' is common.` and `He said "press 'n' now".` are both genuine
  quotations of the letter *n*, and a list keyed on `elided` alone would falsely elide both.
  The surrounding context is the evidence that makes `rock 'n' roll` an idiom and these two
  sentences ordinary prose; §3.2 states exactly how much of it must match.

  **`left` and `right` must consist entirely of `LETTER` code points** — §3.2's Word definition
  is a maximal `LETTER` run, and a `left`/`right` entry is normatively *authored as* that word.
  This is not a limit the matcher itself enforces at match time: the comparison in §3.2 is a
  literal code-point equality test, so a configured entry containing a digit or punctuation
  code point would still match those exact bytes wherever they occur, not fail to match at all.
  The constraint exists precisely because the matcher does not check it — an unvalidated entry
  could make the veto fire on text no citation ever attested, silently exceeding what the
  normative Word definition authorises. `scripts/validate-spec.mjs` and `scripts/gen-locales.mjs`
  therefore reject such an entry at the data boundary, before it can be authored into a locale
  file at all. `elided` carries no such constraint: its match is a literal equality test over
  the raw code points between the two marks, not a `LETTER`-run walk, so it may contain any
  non-empty literal. Both validators read the identical pinned table `src/engine/unicode.ts`
  imports (`scripts/lib/is-letter.mjs`), so validation and the runtime engine cannot classify a
  code point differently.

`innerSpace` is read and acted on in **one direction only**: `quotes` *deletes* an inner space
when the assigned pair's `innerSpace` is `"none"`, and never inserts or converts one. Insertion
and conversion stay with `nbsp` (order 70), exactly as 0.1.0 always said. See §3.7.

### 2.1 Two new normative locale constraints

Both are needed by §5's proof. **All ten shipped locales already satisfy both**, verified against
`spec/locales/*.json`:

- **Q-W — a pair is width-homogeneous.** For each of `primary` and `secondary`, `open` and
  `close` must have the same quote *width* (§3.1). Without it a formed pair straddles both
  stacks after rendering and the gate would decline every pair in a same-glyph document.
- **Q-A — a spaced pair must not use the apostrophe glyph.** If `innerSpace ≠ "none"`, neither
  `open` nor `close` may be U+2019. Without it `apostrophe`'s output would land in a
  `nbsp`-insertion-adjacent skip set and Lemma A's corollary would break.

One constraint belongs to `nbsp`'s data and is stated normatively in `nbsp.md` §2:

- **Q-P — every code point in `nbsp.beforePunctuation` and `nbsp.narrowBeforePunctuation` must
  be a member of this rule's `CLOSEISH`.** This is what makes Lemma B cover N1/N2 as well as N8.
  The shipped lists (`:`, `;`, `!`, `?` in `fr`/`fr-CA`, empty elsewhere) satisfy it.

**Evidence for locale data.** A locale attests **membership**; the rule owns the **mechanism**.
Stated normatively in `nbsp.md` §2.1; it governs every locale field this rule reads.

---

## 3. Algorithm

Input is a code-point array `cp[0 … n-1]`. Five passes plus an emit; no backtracking inside a
pass, no regular expression, no native-string indexing.

### 3.1 Character classes

| Class | Members |
| --- | --- |
| `DQ` | U+0022 |
| `SQ` | U+0027 |
| `STRAIGHT` | `DQ` ∪ `SQ` |
| `WIDE` | U+0022, U+00AB, U+00BB, U+201C, U+201D, U+201E, U+201F, U+301D, U+301E, U+301F |
| `NARROW` | U+0027, U+2018, U+2019, U+201A, U+201B, U+2039, U+203A |
| `QUOTEMARK` | `WIDE` ∪ `NARROW` (disjoint) |
| `DIGIT` | U+0030–U+0039 |
| `LETTER` | general categories `Lu Ll Lt Lm Lo Mn Mc Me` |
| `ALNUM` | `LETTER` ∪ `DIGIT` |
| `BREAK` | U+000A, U+000D, U+000B, U+000C, U+0085, U+2028, U+2029, plus `LINE_MARKER` |
| `INLINE-SPACE` | U+0020, U+0009, U+00A0, U+202F, U+2007, U+2009, U+200A |
| `SPACELIKE` | `INLINE-SPACE` ∪ `BREAK` |
| `OPENISH` | U+0028 `(` U+005B `[` U+007B `{`, `MARKER`, ∪ `QUOTEMARK` |
| `CLOSEISH` | U+0029, U+005D, U+007D, U+002C, U+002E, U+003B, U+003A, U+0021, U+003F, U+2026, U+2013, U+2014, `MARKER`, ∪ `QUOTEMARK` |
| `DASHISH` | U+002D, U+2011, U+2013, U+2014 |
| `DELETE-LANDING` | `ALNUM` ∪ `QUOTEMARK` |
| `NONE` | the pseudo-class "index out of range" |

**`QUOTEMARK` is a member of both `OPENISH` and `CLOSEISH`, and is exempt from `canOpen`'s
closeish rejection** — the same dual membership `STRAIGHT` had in 0.1.0, widened to the whole
class. This is Lemma A's entire mechanism and must not be simplified back to per-glyph lists.
`MARKER` keeps its 0.1.0 treatment (`modes.md` §3.3): in both classes, exempt from the
rejection, and **not** in `SPACELIKE`, so no skip walk ever crosses a span boundary.

**Deliberately excluded from `QUOTEMARK`:** U+2032/U+2033 (primes — a separate rule with its own
false-positive profile, §7), U+02BC (a `Lm` letter), U+0060 and U+00B4. Neither candidates nor
produced.

**Unicode version.** As 0.1.0: the pinned UCD in `spec/UNICODE` is normative for the derived
tables, not for the host runtime (`pipeline-idempotency.md` §6a).

**A declared quote glyph must not be in `SPACELIKE`, `ALNUM` or `STRAIGHT`**, and by Q-W must
share its pair's `WIDE`/`NARROW` bucket with its partner glyph. `singleChar` in
`locale.schema.json` enforces the `STRAIGHT` exclusion.

### 3.1a Locale-derived skip sets

Computed once per call, from locale data alone:

```
SPACE-RIGHT = { p.open  : p ∈ {primary, secondary}, p.innerSpace ≠ "none", p.open ≠ p.close }
SPACE-LEFT  = { p.close : p ∈ {primary, secondary}, p.innerSpace ≠ "none", p.open ≠ p.close }
```

These are **exactly the positions at which `nbsp` N8 can insert a space** (`nbsp.md` §3.10;
`nbsp.ts` `quotesSubRule` skips a pair whose `open` equals its `close`, and skips
`innerSpace: "none"`). For the ten shipped locales: `SPACE-RIGHT = {«}` and `SPACE-LEFT = {»}`
in `fr` and `fr-CA`; both empty everywhere else. The sets are derived from the *reason*, not
hand-written — if a locale gains a spaced pair, they follow automatically and Lemma B keeps
holding.

### 3.2 Pass 1 — collect and classify candidates

Walk `i` from `0` to `n-1`. Skip unless `cp[i] ∈ QUOTEMARK`. Write `g = cp[i]` and compute four
neighbour reads:

- `Llit = cp[i-1]`, or `NONE`; `Rlit = cp[i+1]`, or `NONE`;
- `Lskip` = the first `cp[j]`, `j < i` descending, with `cp[j] ∉ INLINE-SPACE`; `NONE` if the
  walk leaves the array;
- `Rskip` = symmetric to the right.

`MARKER` and every `BREAK` stop a skip walk, because neither is in `INLINE-SPACE` — a skip never
crosses a span boundary or a line terminator.

Then two *directed* reads:

- `openLeft` = `Lskip` if `g ∈ SPACE-LEFT`, else `Llit`;
- `closeRight` = `Rskip` if `g ∈ SPACE-RIGHT`, else `Rlit`.

The two capabilities:

```
canOpen  ⟺ ( openLeft = NONE ∨ openLeft ∈ SPACELIKE ∨ openLeft ∈ OPENISH ∨ openLeft ∈ DASHISH )
         ∧ ( Rskip ≠ NONE ∧ Rskip ∉ SPACELIKE
             ∧ ( Rskip ∉ CLOSEISH ∨ Rskip ∈ QUOTEMARK ∨ Rskip = MARKER ) )

canClose ⟺ ( Lskip ≠ NONE ∧ Lskip ∉ SPACELIKE )
         ∧ ( closeRight = NONE ∨ closeRight ∈ SPACELIKE ∨ closeRight ∈ CLOSEISH ∨ closeRight ∈ DASHISH )
```

`Rskip`/`Lskip` can still be a `BREAK` (a skip walk stops there), which is why both
`∉ SPACELIKE` tests are retained: a mark at a line end does not open across the break, a mark at
a line start does not close back over it.

**Why this exact asymmetry.**

- `canOpen` skips right and `canClose` skips left: each capability treats its *inner* side — the
  side facing the quoted text under that hypothesis — as noise. That is mandate 2, stated once
  and applied uniformly, unconditionally, on every locale.
- Each capability reads its *outer* side literally. The outer space is not noise, it is the
  evidence. `"hi" to me` is a closing mark **because** a space follows it; skipping that space
  (reading `t`) would destroy the commonest closing shape in every language. `He said "hi. She
  said "bye."` is preserved by exactly this: the first mark's `closeRight` is the letter `h`, so
  it is `canOpen` only, and the stray mark cannot swallow the real quotation.
- The two exceptions to "outer side is literal" are *derived*, not chosen: `nbsp` can insert on
  the right of a `SPACE-RIGHT` glyph and the left of a `SPACE-LEFT` glyph, and those are the only
  two outer reads it can reach. Making exactly those two reads skip is what makes every verdict
  inert to `nbsp` (Lemma B).

**Medial-elision veto** (`NARROW` marks only, literal reads):

> if `g ∈ NARROW` and `Llit ∈ ALNUM` and `Rlit ∈ ALNUM`, set both capabilities false.

`don't`, `l'été`, `O'Brien`, `1990's` — and, on a second pipeline pass, `don't` with U+2019,
because `apostrophe` has converted the mark and U+2019 is also `NARROW`. Widening from `SQ` to
`NARROW` is what makes `apostrophe`'s output inert here.

**Listed elision veto** (spec 0.4.0, `NARROW` marks only, locale data `quotes.elisionIdioms`,
literal reads). **Matching the elided content alone is not this veto's shape.** A bare word
list cannot distinguish `rock 'n' roll` from an arbitrary quotation of the same word —
`The letter 'n' is common.` and `He said "press 'n' now".` are both genuine quotations that a
content-only match would falsely elide (this was tried and rejected in an earlier revision of
this field; both sentences are pinned as negative fixtures, `spec/fixtures/en-US.json`). The
veto therefore requires the **full context**: the elided content, and a literal word on each
outer side of the two marks.

> **Word.** A maximal run of `LETTER` code points. Its outer boundary — the code point
> immediately before its first code point, or immediately after its last — is either `NONE`
> (document or span start/end) or **not** `LETTER` and **not** `DIGIT`. This is a whole-word
> test: `"MyRock 'n' roll"` does not match a `left` of `"Rock"`, because the code point before
> `R` is `y`, a `LETTER`.
>
> **The permitted space.** Exactly one code point of `INLINE-SPACE` (`spec 3.1`) separates a
> context word from its adjacent mark — not `NONE`, not `OPENISH`, not `DASHISH`, unlike
> `canOpen`/`canClose`'s own outer tests above. The veto needs an actual word to anchor to, so
> a mark at document or span start, or immediately after an opening bracket, has no `left` word
> and cannot be vetoed on that side — §3.2's `MARKER` (`modes.md` §3.3) is not `INLINE-SPACE`
> either, so a context word split from a mark by an element or span boundary does not match
> (`<em>rock</em> 'n' roll` is unaffected; §6 rows H1–H3).
>
> Computed once, before capabilities are assigned, over every index `i` with `cp[i] ∈ NARROW`:
> for each entry `{ left, elided, right } ∈ quotes.elisionIdioms`, of `k` code points in
> `elided`: if `cp[i+1 … i+k]` equals `elided` **exactly**, code point for code point — no case
> leniency, on the elided content — and `cp[i+k+1] ∈ NARROW` (call this index `j`), and:
>
> - `cp[i-1]` is a single `INLINE-SPACE` code point, and the word ending there equals `left`;
> - `cp[j+1]` is a single `INLINE-SPACE` code point, and the word starting after it equals `right`;
>
> then both `i` and `j` are **vetoed**: both capabilities of `i` and both capabilities of `j`
> are set to `false`, overriding every other test in this section — including capabilities
> computed for `j` when the main walk reaches it.
>
> **Exact matching, with one narrow exception.** `elided` is always matched exactly, code point
> for code point — no leniency, ever, on the elided content itself. `left` and `right` are
> matched exactly **except their first code point**, which is compared case-insensitively —
> implemented directly by code point (ASCII `A`–`Z` folds to `a`–`z`; every other code point,
> including every non-ASCII letter, must match exactly), never through a platform locale
> function (`ARCHITECTURE.md` §4.4). This is the same leniency `nbsp.md` §3.5's
> `afterShortWords` already uses, for the same reason: `Rock 'n' roll is great.` (sentence-
> initial capital) is exactly as much the idiom as `rock 'n' roll` is, and `rock 'N' roll` —
> case varying anywhere past the first code point — is not: it fails the exact `elided` test in
> this specific idiom (`elided = "n"`, and `N ≠ n`) and is correctly left alone (§6 row N5).

`rock 'n' roll` with `elisionIdioms = [{ left: "rock", elided: "n", right: "roll" }]`: the
leading mark's `left` word is `rock`, the elided run spells exactly `n`, the trailing mark's
`right` word is `roll` — all three match, both marks are vetoed, survive pass 1 as U+0027, and
`apostrophe` (order 50) renders each independently: leading elision (`apostrophe.md` §3.3 case
4) on the first, trailing elision (case 3) on the second, giving `rock ’n’ roll`. Without the
veto both marks are `canOpen`/`canClose` candidates in their own right — the leading mark has
no `ALNUM` on its left so the medial veto above does not apply to it, and likewise for the
trailing mark's right — and pass 2 pairs them as an ordinary quotation.

**This is a bounded, literal check, not a heuristic.** The lookahead from `i` and `j` is
bounded by the total length of `left` + `elided` + `right` for each configured idiom — no
regex, no priorities, no open-ended word class; the same shape `nbsp.md`'s
`beforeNumber`/`beforeWord` literal matching already uses on one side of a mark
(`nbsp.md` §3.11), applied here to both sides of a pair of marks at once. It can only ever
**prevent** a pairing pass 2 would otherwise have formed — an empty `quotes.elisionIdioms`
makes it a total no-op, and every `NARROW` mark is classified exactly as it was before spec
0.4.0.

**Behaviour at punctuation and document boundaries.** Trailing punctuation after `right` (a
period, a comma, a closing quotation mark) does not block the match: the word-boundary test
only requires the code point after `right`'s last letter to be non-`LETTER`/non-`DIGIT`, and
punctuation satisfies that trivially (`I love rock 'n' roll.` still vetoes; §6 row P3).

**A context word may itself begin at document/span start or end at document/span end — the
Word definition above already says so (`NONE` is an accepted outer boundary).** `Rock 'n' roll
is great.`, where `Rock` is the very first thing in the document, still vetoes (§6 row P2): the
mark's own left neighbour `cp[i-1]` is a real `INLINE-SPACE` code point (the space after
`Rock`), and `wordEndsAt` finds `Rock` ending there with a legal `NONE` boundary one step
further left. **What cannot happen is the mark itself sitting at that extremity.** A `NARROW`
mark at the very start or end of the text unit has `Llit`/`Rlit` = `NONE`, which is not
`INLINE-SPACE`, so its own outer test fails before a word is even sought — the veto needs an
actual space *and* an actual word beyond it, and a mark with nothing to its outer side has
neither. The constraint is on the mark's adjacency, not on where the word may fall.

**Membership evidence, not mechanism**, stated normatively in `nbsp.md` §2.1 and governing every
list-valued field in `locale.schema.json`: a locale attests that a `{ left, elided, right }`
triple belongs in this list; this rule owns the mechanism. Each triple is independently
evidenced — `{ left: "rock", elided: "n", right: "roll" }` is cited (§6, `en-US.json`
`sources`), and that citation supports no other triple: it does not, for instance, attest
`{ left: "fish", elided: "n", right: "chips" }`, which is not listed here and would need its
own citation before being added. This is deliberately **not** a general elision-word list, and
it must not grow into one merely because the mechanism could technically encode it. A locale
with no citable evidence for a triple of this exact shape ships an empty list rather than a
guessed one — the same discipline `PLAN.md` §6.1 states for every locale field, and the reason
this veto is populated for only one locale at launch (§6).

**Known, accepted residual ambiguity — not eliminated by the full-context requirement.** The
veto has no notion of authorial intent: it matches code points, not meaning, so a document that
explicitly states its own intent to write three separate tokens — the word `rock`, a genuinely
quoted letter `n`, and the word `roll` — and then, for illustration, reproduces the identical
surface sequence `rock 'n' roll`, still gets that final occurrence vetoed:

```
The sequence is the word rock, the quoted letter 'n', and the word roll: rock 'n' roll.
```

transforms to

```
The sequence is the word rock, the quoted letter “n”, and the word roll: rock ’n’ roll.
```

The **first** `'n'` is correctly left alone: its `left` context is `letter`, not `rock`, and it
is immediately followed by a comma rather than a space, so no configured idiom matches and it
pairs as an ordinary depth-1 quotation — exactly the mechanism §6 rows N1/N2 already prove. The
**second** occurrence — `rock 'n' roll` at the end — matches `left`/`elided`/`right` exactly,
regardless of the fact that the same sentence has just told the reader it is meant as a literal
concatenation of the three tokens just described, not a fresh invocation of the idiom. **Under
the authorial intent the sentence itself states, this conversion is a real semantic false
positive** — the final `'n'` is meant as a repetition of the same quoted letter named earlier in
the sentence, not the idiom, and eliding it changes what the author wrote to mean. It is
accepted as an **unavoidable** false positive for a bounded, surface-form contract, not a
tolerated one: `left`, `elided`, `right` and the single permitted `INLINE-SPACE` on each side
are the entire alphabet this veto is defined over, and none of them can encode "this is a
demonstration, not an utterance of the idiom" — no finite extension of that alphabet could,
short of the veto reasoning about meaning, which is out of scope for a literal, bounded
contract (§3.2). The implementation still **conforms exactly** to its own normative matcher on
this input: the two occurrences are given the treatment the matcher's rules specify byte for
byte, and the defect is that the matcher's contract cannot distinguish these bytes from the
idiom it exists to recognise — because, written this way, they are the same bytes. Recorded
here in the same spirit as `dashes.md` §7.9, and §6 row N6 pins it as a fixture, so the exposure
is visible in the conformance suite rather
than discovered in someone's content.

**General ambiguous-medial-span veto (spec 0.5.0).** The listed elision veto above closes
`rock 'n' roll` for `en-US`, where a citation exists. It closes nothing for `en-GB`, `de-DE`,
`de-CH`, `fr`, `fr-CA`, `ru`, `fi`, `sv` or `el`, whose `elisionIdioms` lists are empty (§7 item
8: `en-GB` carries an elevated ambiguity risk since its primary pair is itself the single quote;
`fi`/`sv` write the idiom closed up, so a citation for the spaced form would be evidenced-inert;
the rest have simply never been researched for it). Without a further mechanism, the marks in
`rock 'n' roll` would fall through to ordinary pairing in all nine and be typeset as a
quotation — a different, undocumented instance of the same class of false positive
`docs/AUDIT_REMEDIATION_AND_RELEASE_PLAN.md` §3.1 names, just missing a fixture that happens to
say so.

`quotes.ts`/`apostrophe.ts` share one predicate for this (`src/rules/quote-ambiguity.ts`,
`computeAmbiguousShapeIndices`) — not a second, independent approximation of the listed-idiom
shape, so the two rules cannot drift apart on what counts as ambiguous. The shape: a pair of
**straight ASCII single quotes** (U+0027 — an already-curly U+2018/U+2019 pair is out of scope by
construction) enclosing **1 to 3 `LETTER` code points**, with **at least one** `INLINE-SPACE` code
point immediately outside each mark. `rock 'n' roll`, `She chose 'A' today`, `They said 'no'
yesterday` all match; `say 'like' now` (4 letters enclosed) and `say '12' now` (digits, not
`LETTER`) do not, and fall through to ordinary quote-pairing exactly as before 0.5.0.

**"At least one", deliberately, not "exactly one".** Only the single code point immediately
adjacent to each mark is tested; a longer run of inline spaces further out — `rock  'n'  roll`,
doubled — does not invalidate the match. Narrowing this to "exactly one" was considered and
rejected: it would make a doubled-space variant of `rock 'n' roll` fall through to ordinary
quote-pairing, reintroducing a false-positive quotation conversion the veto exists to prevent, in
exchange for no compensating benefit. The existing listed-idiom matcher (above) may remain
stricter on this point without contradiction — with extra spaces its own literal `left`/`right`
word-boundary test can fail to match the cited en-US `rock`/`n`/`roll` tuple, and when it does,
this general veto still wins and the input is preserved unchanged, exactly as an uncited locale's
input already is.

**Every position this shape matches is added to the same veto set the listed-idiom check
populates** — `quotes` must decline to pair these marks as a quotation regardless of which of
the two mechanisms is the reason. A position covered by an exact `elisionIdioms` match keeps its
existing treatment unchanged (the veto lets the marks survive to `apostrophe`, whose own
structural case ladder independently curls each — apostrophe.md §3.3 cases 3/4 — reproducing
`rock ’n’ roll` for `en-US` exactly as spec 0.4.0 shipped it). A position that matches the general
shape but **no** idiom is additionally placed in a **preserve set**
(`computePreserveIndices` — ambiguous-shape positions minus idiom-matched positions) that
`apostrophe` consults independently (apostrophe.md §3.4): `apostrophe` skips those exact index
positions entirely, rather than letting its own case-ladder curl them the way it would curl any
other surviving `NARROW` mark. Without that second check, `apostrophe`'s cases 3/4 would
independently re-derive U+2019 for both marks anyway — reproducing, through a second code path,
precisely the false-positive shape the withdrawn context-free `elisionForms` design (§7 item 8,
History) was rejected for. Both marks are therefore left as literal U+0027, byte-identical,
through the entire pipeline: a deliberate, bounded false negative
(`docs/AUDIT_REMEDIATION_AND_RELEASE_PLAN.md` §3.1: "False negatives are preferable to text
damage"), not an attempt to guess which locale's idiom list should have had an entry.

**This does not broaden the veto to already-curly input.** `rock ’n’ roll` typed directly with
U+2019 (no cited idiom for the locale) is unaffected by this predicate — it is not a pair of
*straight ASCII* marks — and falls through to ordinary NARROW-pair quotation exactly as it did
before spec 0.5.0 (§6 row, "already-curly, no idiom"). Broadening the shape to curly input was
considered and rejected: this veto exists to preserve what an author *typed*, not to retroactively
undo an author's own deliberate use of real typographic marks.

**V1 — same-V1-identity adjacency veto** (both widths):

> Define `V1ID(c) = U+2019 if c = U+0027, else c` — the **V1 identity** of a code point. `V1ID`
> is the identity function everywhere except at U+0027; it is *not* a claim that a given U+0027
> will become U+2019 (see below). Let `gapInsertable = g ∈ SPACE-RIGHT ∨ g ∈ SPACE-LEFT`. If
> `V1ID(Llit) = V1ID(g)`, or (`Llit ∈ INLINE-SPACE` and `V1ID(Lskip) = V1ID(g)` and
> `gapInsertable`), set both capabilities false. Symmetrically for `Rlit`/`Rskip`.

`""`, `''`, `««`, `””` and any longer run of one glyph, by the first (literal) clause. This is
0.1.0's veto, generalised, and it keeps the `"""a""` witness dead and `"a "" b"` intact.
**Granularity is deliberately "same V1 identity", not "same width"**: the narrower test
reproduces both witnesses, and a width-based test would veto the ordinary mixed boundary `"'`.

**`V1ID` and why V1 cannot compare raw code points (spec 0.4.1).** `apostrophe` (R₆) is the one
rule ordered after `quotes` that can change a candidate's own code point, and every edit it makes
replaces a U+0027 with U+2019 — the only code point it ever emits for that position
(`apostrophe.md` §1). **This is not an unconditional mapping.** `apostrophe`'s own case ladder
(`apostrophe.md` §3.3) leaves a U+0027 unedited under two of its five cases — the **prime guard**
(case 1: `6' 2"`, a foot/inch mark) and **case 5** (`a ' b`, `''`: nothing inferable) — and
`apostrophe.md` §5 names both explicitly as surviving, unedited, to the rule's own second-run
argument. So only a *subset* of the U+0027s `quotes` leaves unmatched are ever actually converted.

Every other capability test in this section reads *class* membership, which is unaffected by
that substitution regardless of whether it happens (Lemma A, §5) — but V1, uniquely, compares
*code points*, because that is its job: telling `""` from `"'`. A literal comparison is therefore
the one place a U+0027 neighbour's *eventual* fate matters, and `quotes` cannot know that fate
from inside its own pass: whether a given U+0027 reaches `apostrophe` at all — as opposed to
being claimed by `quotes` itself and rendered as a quote glyph — and what its *own* neighbours
will read once `quotes` has finished rendering the whole accepted set, are exactly the outputs
this rule is still computing when V1 runs. Deciding V1 exactly would mean re-deriving
`apostrophe`'s verdict against `quotes`' own not-yet-final output — a circular second pipeline
inside this rule, not a fix. (A per-position "is this specific U+0027 definitely going to survive
unmatched with these exact neighbours" analysis was considered and rejected for the same reason:
neighbouring accepted pairs can rewrite the very code points that analysis would need to read
first.)

`V1ID` is therefore a **conservative over-approximation**, not an exact rule: it treats *every*
U+0027 as if it might already be, or might become, U+2019, and every U+2019 as if it might be an
unconverted U+0027 — regardless of which of `apostrophe`'s five cases will actually apply.

**What "one-directional" bounds, precisely — a local claim, not a pipeline-level one.** At a
single V1 comparison, `V1ID` can only ever *add* a veto: it merges two identities that raw
equality would have kept apart, and it never grants `canOpen`/`canClose` to a candidate that
would not otherwise have had one — `V1ID` only ever makes the equality test *stricter*, never
looser. **That local fact does not extend to the rule's global output.** Pass 2 (§3.3, the stack
pairing) and pass 4 (§3.5, the certification gate) both operate over the *whole* candidate list at
once, not candidate-by-candidate: declining one candidate can remove a crossing pair, a nesting
conflict, or a certification instability that was previously the reason a *different, unrelated*
pair failed to certify. An extra local veto can therefore **indirectly** let another pair certify
that previously could not, reassign which glyphs/depth a pair receives, or change what `nbsp`
(order 70) inserts downstream — this is not a hypothetical: **the reported counterexample is
exactly this shape.** On pass 1, `V1ID` declining the crossing `NARROW` pair (`U+2019`
adjacent to the unmatched `U+0027`) is precisely what lets the `WIDE` pair certify instead of
being caught in the same gate rejection that, pre-fix, declined both. Vetoing one candidate
*enabled* a different conversion; "extra decline only" was never literally true of the rule's
output, only of the single comparison `V1ID` changes.

The actual safety argument therefore does **not** rest on a monotonicity claim. It rests on: (1)
a missed pairing is the failure mode this whole spec already treats as safe — "missing a possible
improvement is safer than damaging text" (`PLAN.md` §6.1,
`docs/AUDIT_REMEDIATION_AND_RELEASE_PLAN.md` §3.1) — against the defect `V1ID` closes, a hard
release blocker (an idempotency violation); and (2) **inspection of every output `V1ID` globally
changes within a reproducible bounded sweep**, not an a-priori argument about direction. The "V1ID
empirical audit" section below is that inspection: every changed output in the sweep — declined,
newly enabled, or reassigned — is individually classified, and none is a false positive against
plausible prose. `tests/rules/quotes.test.ts` pins one permanent regression case per distinct
mechanism found: a pure conservative veto (prime-guard and case-5 U+0027 preserved exactly), the
indirect newly-enabled-outer-pair mechanism (the reported counterexample's own shape), a pairing
reassignment, and the `fr`/`fr-CA` downstream `nbsp` consequence — plus a direct test that the
plain U+0027 vs. U+2019 distinction still governs `apostrophe` and the medial veto exactly as
before, unaffected by `V1ID`, which is scoped to V1's own comparison alone.

**Reachability, precisely.** `QUOTEMARK`, V1, and `apostrophe`'s case ladder are defined
identically for every locale, so the *algorithmic* shape (an unmatched U+0027 adjacent to a
`QUOTEMARK` candidate whose glyph is U+2019) is constructible in every locale with a synthetic
string, and `tests/rules/quotes.test.ts` sweeps it across every entry in `KNOWN_LOCALES` for
exactly that reason — that is a claim about the algorithm, not about naturally occurring prose.
Separately, and more narrowly: `en-GB`'s primary `close` and `fi`/`sv`'s secondary pair (both
sides) are U+2019 *as that locale's own prescribed glyph* — not merely a candidate a foreign or
adversarial input could contain — so those three locales are where an author's ordinary,
correctly-typed document (one already-closed quotation immediately followed by, say, a
possessive apostrophe with no separating space) is the most plausible route to this shape without
any copy-pasted or malformed input at all. `de-CH`, where the defect was first found, reaches it
only via a mixed straight/curly input (`spec/fixtures/de-CH.json`,
`de-ch-quotes-041-cobug-apostrophe-v1`) — de-CH's own glyphs are `« »`/`‹ ›`, neither of which is
U+2019, so the witness there is adversarial, not a natural-content route.

**V1ID empirical audit.** `quotes.ts`'s V1 block was twice temporarily reverted to the pre-0.4.1
raw comparison, run against a bounded, deterministic alphabet across every locale in
`spec/locales/registry.json`, and restored — a controlled experiment, not a committed second
engine, and not itself part of this repository (the exact reversion is exactly the diff `git
diff` shows against `tests/rules/quotes.test.ts`'s permanent assertions, which is what actually
pins the result). Exact counts from that run are deliberately **not** recorded here: an
uncommitted, one-off harness is not something a future maintainer can re-run from this document
alone, and this spec's normative claims must not depend on an experiment nobody can reproduce.
What is recorded, and *is* reproducible — by running `npx vitest run tests/rules/quotes.test.ts`
against `main` — is the durable conclusion the audit reached:

- Every output `V1ID` changes relative to the raw comparison, across the swept alphabet and every
  locale, falls into exactly one of four mechanisms: a pure extra conservative veto (the mark
  stays exactly as authored); an *indirect* newly-enabled conversion (vetoing one candidate
  removes a crossing/certification conflict and lets a different, unrelated pair certify — the
  reported counterexample's own shape, run in general); a pairing reassignment (the same input
  pairs differently, not more or less); and the `fr`/`fr-CA` downstream `nbsp` consequence of a
  differently accepted or declined pair. No difference in the swept range was unexplained.
- Every newly-enabled or reassigned output in the swept range was inspected against ordinary-prose
  plausibility, not merely checked for a digit adjacency. None resembles content a human author
  would write and reject: the newly-enabled class never contains a letter or digit at all (its
  witnesses are runs of quote-class punctuation with no word between them, not prose); the
  reassignment class only ever chooses between two already-plausible readings of a short ambiguous
  fragment (e.g. an ordinary quotation vs. two independent elisions), never invents a reading with
  no textual basis.
- A separate, narrower sweep confirmed the raw-comparison variant is genuinely non-idempotent
  within a bound that reaches the reported defect's minimal witness shape, and that `V1ID` is not,
  across every locale — the direct measurement of the closure this fix provides, not merely of its
  conservative cost.

`tests/rules/quotes.test.ts`'s "V1ID" describe block pins one permanent, exact-output regression
case for each of the four mechanisms above (plus the U+0027/U+2019-still-matters-outside-V1
control) — that is the reproducible evidence this section rests on.

**The second clause is not in either design document that fed this revision, and closes a
composition-obligation violation found only by running the implementation.** A literal-only V1
lets the certification gate correctly decline a pairing when rendering it would place two
identical glyphs strictly adjacent (e.g. `«` immediately left of a mark the gate would render to
`«`) — but if `nbsp` (a *later* rule) subsequently inserts a space at exactly that gap, on the
*next* full-pipeline pass `quotes` sees the two occurrences with a space between them, the
literal adjacency is gone, and the *same* pairing certifies. That is `nbsp` creating work for an
earlier-ordered rule, forbidden by `pipeline-idempotency.md` §2's composition obligation, and it
reproduces with two witnesses, pinned in `spec/fixtures/fr.json` as `fr-quotes-030-cobug-html-tag-boundary`
(`«"<p class="x">"` in `html` mode) and `fr-quotes-030-cobug-double-open-then-closer` (`««”` in
`text` mode). The fix reads the
skip in exactly the two positions Lemma B (§5) already names as `nbsp`'s whole insertion
surface next to a quote mark — a candidate's own `g` value is shared identically with the
same-glyph neighbour a skip reaches, so checking `g`'s own `SPACE-RIGHT`/`SPACE-LEFT` membership
covers both of Lemma B's insertion sites at once, regardless of which of the two occurrences is
on which side of the gap. **A plain skip-based V1** (comparing `Lskip`/`Rskip` to `g`
unconditionally, with no `gapInsertable` guard) **was tried and rejected**: it also vetoes two
genuinely distinct, space-separated quotations (`'a' 'b'`, ordinary prose, not a typewriter
artefact) in every locale, including ones with no spaced pair at all — the guard is what keeps
the veto scoped to positions `nbsp` can actually reach.

Under mandate 1 the veto is **no longer permanent** — a converted mark can acquire or lose an
identical neighbour between runs — and that is stated rather than papered over: **the gate
(§3.5), not this veto, is the guarantor of stability against `quotes`' own re-derivation.** The
`gapInsertable` clause is what extends that guarantee to survive `nbsp` acting *between*
pipeline passes, which the gate alone — being a property of a single call — cannot see.

Record `{ index, width ∈ {WIDE, NARROW}, canOpen, canClose }` for every `i` with at least one
capability true. Candidates with both false are dropped and never touched.

Pass 1 still does **not** decide that a `NARROW` mark with a letter to the right and a space to
the left is a leading elision. It is `canOpen` and enters the pairing; if it finds no partner it
survives and `apostrophe` renders it U+2019. The pairing settles the ambiguity, not a heuristic.

### 3.3 Pass 2 — pair the candidates, one stack per width

**There are two stacks, one for `WIDE` and one for `NARROW`, and a candidate only ever touches
the stack for its own width.** 0.1.0's per-kind split generalised from "the literal code point
`DQ`/`SQ`" to "the glyph's visual width" — the property that actually carried the argument: no
reader opens a quotation with a double mark and closes it with a single one, in any language.
This is what keeps a Greek elision (`σ'`, `NARROW`) from closing a `WIDE` opener.

Walk the candidate list in index order. For candidate `c`, let `S` be the stack for `c.width`:

1. If `c.canClose`, `S` is non-empty, and **`¬vacuous(top(S).index, c.index)`** → pop `o`, record
   the pair `(o.index, c.index)`.
2. Else if `c.canOpen` → push `c` onto `S`.
3. Else record `c` as unmatched.

When the walk ends, everything still on either stack is unmatched.

> **`vacuous(a, b)`** ⟺ every `cp[k]` with `a < k < b` is in `INLINE-SPACE` (vacuously true when
> `b = a + 1`).

**The vacuity condition is new and is forced by mandate 1.** In 0.1.0 an empty pair was
impossible: two adjacent marks of the same kind were vetoed by V1, and two of different kinds
were on different stacks. Now `«»` is two *different* code points of the *same* width, and `" "`
is two identical marks V1 cannot see past a space; both would enclose no content. The condition
sits in step 1 rather than as a fourth outcome: a closer that fails step 1 **falls through to
step 2 and then step 3**, so every candidate still reaches exactly one of three outcomes and the
accepted/unmatched partition stays exhaustive — that exhaustiveness is what makes the "declined"
set well-defined for the gate. **Do not add a fourth outcome to this list.**

Step 1 before step 2 — **closing takes precedence** — is retained unchanged. An `«` whose
right-hand space `nbsp` inserted reads `closeRight = Rskip`, exactly as it did before `nbsp`
touched it, so the tie-break's ambiguity does not shift under mandate 1.

### 3.4 Pass 3 — assign glyphs by depth

For a set of pairs `A`, the **depth** of `p ∈ A` is

> `depth_A(p) = 1 + |{ q ∈ A : q.open < p.open ∧ p.close < q.close }|`

— one plus the number of *accepted* pairs that strictly enclose it. Odd depth → `quotes.primary`;
even depth → `quotes.secondary`. Depths beyond 2 alternate by the same parity.

**Depth is computed over the accepted set `A`, not over the raw pass-2 output.** On a second run
the accepted set *is* the raw set, so a depth taken over the raw set on run 1 and over the
accepted set on run 2 would disagree whenever the gate declined anything. Depth over `A` agrees
on both runs by construction.

**Depth, not the mark's original width, selects the pair.** `'He said "no" to me,' she noted.`
promotes the outer `NARROW` marks to `en-US`'s `WIDE` primary pair and demotes the inner ones —
the reason width drift exists at all, and the case the certification gate exists to re-verify.

### 3.5 Pass 4 — the certification gate

This pass replaces 0.1.0's Claims 1–3. It is a *check the algorithm performs*, not a property a
reader must verify by argument alone.

**Rendering.** `render(cp, A)` is the array obtained by applying, for every `p ∈ A` with assigned
pair `P = pairFor(depth_A(p))`:

- replace `cp[p.open]` with `P.open` and `cp[p.close]` with `P.close`;
- **if and only if `P.innerSpace = "none"`**, delete the pair's two *inner runs* where the
  landing guard permits:
  - the **open-side run** = the maximal `INLINE-SPACE` run starting at `p.open + 1` (possibly
    empty); its **landing** is the first code point past it;
  - the **close-side run** = the maximal `INLINE-SPACE` run ending at `p.close - 1`; its landing
    is the first code point before it;
  - a run is deleted iff it is non-empty, its landing is in `DELETE-LANDING`, and it is not
    simultaneously both of the pair's runs (a pair enclosing nothing but spaces deletes
    neither — unreachable for an accepted pair given §3.3's vacuity condition, but stated because
    the construction is otherwise silent about it).

`render` also yields the order-preserving index map `π` from surviving input indices to output
indices.

**Certification loop.**

```
A := the pair set from pass 2
loop:
    if A = ∅:                                   accept ∅ and stop
    (y, π) := render(cp, A)
    B := passes 1–2 applied to y                (raw, ungated)
    if { (π(p.open), π(p.close)) : p ∈ A } = B: accept A and stop
    A' := { p ∈ A : (π(p.open), π(p.close)) ∈ B }
    if A' = A:  A := A \ { the pair of A with the greatest `open` index }
    else:       A := A'
```

**Every clause is normative, including the tie-break.** When the intersection fails to shrink
`A` — exactly when `B ⊋ π(A)`, i.e. the rendered array admits a pairing the input did not — one
pair is removed, and *which* pair is specified so two ports cannot disagree.

**Termination.** Each iteration either accepts or strictly shrinks `A`. `A` is finite and `∅`
accepts unconditionally, so the loop runs at most `|A₀| + 1` times. Cost is `O(k·n)` with `k` the
number of pairs; in the overwhelmingly common case the first round certifies and the extra cost
is one `O(n)` pass. An implementation may short-circuit on that.

**Why the exit condition is `B = π(A)` and not `π(A) ⊆ B`.** Exiting with extra pairs in `B` is
unsound: the second run *starts* from `B`, and if `B` certifies, the second run renders `B`'s
extra pairs and the output differs. The intersection alone does not terminate at a sound state,
which is why the forced-removal clause exists.

**Empirical status of the forced-removal clause.** An exhaustive sweep of ~850,000 inputs across
all ten locales (the alphabet of §9's fixtures, to length 4–5, plus the named witnesses) did not
observe the clause firing even once — every case that reached the gate either certified in round
1 or was resolved by the plain intersection shrinking `A`. The clause is implemented as specified
(it is strictly more conservative than omitting it, never less sound, so it costs nothing even if
unreachable in practice) but its necessity is **not** demonstrated by a concrete witness as of
this writing. If a future sweep finds one, it belongs in `spec/fixtures/` as a named case.

### 3.6 Pass 5 — emit

For each `p` in the accepted set:

- an edit replacing `cp[p.open]` with the assigned `open` glyph, **omitted if the code point is
  already that glyph**;
- likewise at `p.close`;
- a deletion edit for each inner run the landing guard permitted, **omitted if the run is
  empty**.

An edit whose replacement is identical to the span it replaces is never emitted — the
invisible-edit principle `dashes.md` §3.3.1 states for the joiner, applied so that
already-correct text produces a byte-identical no-op rather than a diff of self-replacements.
Suppression is per **mark**, not per pair: a pair where only one side needed a glyph change
emits exactly one glyph edit.

Emitted spans are pairwise disjoint: replacements sit at distinct mark indices; a deletion span
lies strictly between a mark and its landing; and since accepted pairs are properly nested or
disjoint (stack discipline) and a pair enclosing only spaces deletes neither run, no two spans
can claim the same index. Edits are sorted ascending before returning.

Unmatched candidates and declined pairs produce no edit and keep their code point exactly.

### 3.7 `innerSpace`: `quotes` deletes, `nbsp` inserts

The split is asymmetric on purpose.

- `innerSpace = "none"` — a space inside the pair is *wrong* and nobody else can remove it.
  `nbsp` has no deletion capability at all. `quotes` deletes it, subject to the landing guard.
- `innerSpace ≠ "none"` — a space inside the pair is *required*, and `nbsp` (order 70) already
  inserts and converts it, correctly and idempotently, at `nbsp.md` §3.10. `quotes` emits
  nothing and deletes nothing there.

So `quotes` still never inserts a space, `nbsp` keeps ownership of all no-break spacing, and
there is no second copy of anyone's rules. `"mot"` → `«mot»` → (via `nbsp`) `«` U+202F `mot`
U+202F `»`; `« mot »` → (no edit from `quotes`) → the same output via `nbsp`. Both paths
converge, which is the property the pipeline needs.

**The landing guard is not a heuristic; it is a structural CO discharge.** The deleted run's near
side is a quote glyph and its far side is in `ALNUM ∪ QUOTEMARK`. Every class the four
earlier-ordered rules read as evidence — `spaces`' `CONTENT`/`STRIP-BEFORE`/bracket sets,
`ellipsis`' dot runs, `dashes`' `DASH`, `INERT-DASH`, `DIGIT`, `SPACE ∪ NOBREAK-SPACE`, `LETTER`,
`ROMAN`, `hyphen`'s `WORDISH` — classifies a quote glyph and a U+0020 **identically** (both
outside all of them, except `SPACE`, which the guard's own construction keeps away from any dash
run). `ALNUM ∪ QUOTEMARK` is the largest landing class for which that holds; letting the
deletion land on a dash is what would produce `" --x"` → `“--x”` → `“—x”`, a violation of `I₃`.
Two absolutes fall out of the same construction: **a `BREAK` is never deleted** (not in
`INLINE-SPACE`, so it terminates the run and, being outside `DELETE-LANDING`, declines the
deletion) and **`MARKER` is never crossed** (same mechanism), so the span partition is stable
between runs as `modes.md` §5 requires.

---

## 4. Must not touch

Each bullet is **[P]** (a guarantee of `transform`) or **[R]** (true of this rule alone, with the
rule that can falsify it named), per `pipeline-idempotency.md` §5.2.

- **[P] A medial apostrophe:** `don't`, `l'été`, `O'Brien`, `Hawai'i`, `1990's` — and their
  U+2019 forms on a second pass. Vetoed in §3.2.
- **[R] A leading elision that finds no partner** (`'90s`, `'tis`) and **[R] a trailing
  possessive that finds no partner** (`the dogs' bowls`). Handed to `apostrophe`.
- **[R] A foot or inch mark:** `6' 2"`. Both marks are `canClose` only with an empty stack. The
  0.1.0 caveat still applies verbatim: in `"6' 2"` the foot mark pairs, and the protection is not
  pipeline-level.
- **[P] Any unbalanced mark.** Convert what is unambiguous, leave the rest — §3.6 of 0.1.0's
  policy is unchanged.
- **[P] Any run of two or more identical quote marks:** `""`, `'''`, `««`, `””`. V1.
- **[P] A pair enclosing nothing but spaces:** `«»`, `" "`, `” ”`. §3.3's vacuity condition.
- **[P] U+2032, U+2033, U+02BC, U+0060, U+00B4** and the LaTeX idioms `` ` `` and `''`. Not in
  `QUOTEMARK`.
- **[P] Anything inside a skipped region.** Attribute values, code spans, fenced code, `<pre>`,
  URLs — removed by the mode adapter.
- **[P] Line terminators.** Never deleted, never crossed by a skip walk.
- **[R] Outer spacing.** This rule deletes only *inner* spacing and inserts nothing.

**No longer on this list, by operator decision:** every non-straight quotation glyph. `“ ” « »
„ ‘ ’ ‚ ‹ ›` and the rest are now candidates. `en-GB` text containing a correct `“…”` pair will
be rewritten to `‘…’`; `de-DE` text containing `«Wort»` becomes `„Wort“`. That is mandate 1, and
it is the largest behavioural change in this revision.

**Known, accepted residual risk — not new under this revision.** A leading elision that has
already been curled to U+2019 (`’90s were fun,’ he said`) can, if a later unrelated closing mark
exists on the same stack, be paired as an opener and lose its elided-digit reading. This was
already possible for straight input under 0.1.0 (`'90s were fun,' he said` is corrupted
identically) — it is §7 item 3's family, "no local way to distinguish an elision from a real
opening quote", now also reachable via curly input because mandate 1 makes curly input a
candidate at all. **§7 item 8's `quotes.elisionIdioms` (spec 0.4.0) does not cover this case**:
that veto fires only on a listed idiom's full left/elided/right context found together, not on
a lone elision separated from any partner by arbitrary distance. It is **not** a new defect this
revision introduces; §5's Corollary A1 explains why no U+2019-specific restriction is applied, and
`spec/fixtures/` pins the verified behaviour across `en-GB`, `en-US`, `fi` and `sv` (§6, rows
E1–E4) so the tradeoff is a citable fact rather than an assumption.

---

## 5. Idempotency argument

0.1.0's Claims 1 and 2 are **withdrawn**, not weakened. Claim 1 ("a converted position is not a
candidate on the second run") is false by construction under mandate 1, and with it goes the
permanence of V1: two marks that were distinct can both be assigned the same glyph, so the
veto's verdict is no longer immutable. Claim 2's monotonicity is likewise gone: a converted mark
can *gain* a capability. Claim 3 rested on both. Three replacements follow.

### Lemma A — glyph-blindness

> Replacing any `QUOTEMARK` at index `j` with any other `QUOTEMARK` changes no capability of any
> candidate at any index `i ≠ j`.

*Proof.* A candidate's four neighbour reads are compared against `NONE`, `SPACELIKE`, `OPENISH`,
`CLOSEISH`, `DASHISH`, `QUOTEMARK`, `MARKER` and `ALNUM` (the medial veto), and V1 compares
`V1ID` of the relevant code points against `V1ID(g)` (spec 0.4.1). Every `QUOTEMARK` is in
`OPENISH`, in `CLOSEISH`, in `QUOTEMARK`, in none of `SPACELIKE`, `DASHISH`, `ALNUM`, and is
neither `MARKER` nor `NONE`. All seven class tests are therefore **invariant**, not merely
monotone. The skip walks are invariant because `QUOTEMARK ∩ INLINE-SPACE = ∅`.

**V1 is invariant too, as of spec 0.4.1, and this required changing V1 itself, not just arguing
about it.** Before 0.4.1, V1 compared raw code points, and replacing a neighbour's `U+0027` with
`U+2019` — the one substitution this lemma's hypothesis is actually exercised against by
`apostrophe`, via Corollary A1 below — could change whether that neighbour's code point equalled
a candidate's own `g`, which is exactly the comparison V1 makes. That was a real gap, not a
theorem this document previously proved: the claim once made here — that "V1's movement is
precisely what the gate certifies" — conflated two different sources of movement. The
certification gate (§3.5) re-derives candidates from `quotes`' *own* hypothetical render, within
one call; it has no visibility into a *different* rule editing the input between two separate
pipeline invocations, which is exactly what `apostrophe` does. §3.2's `V1ID` closes the actual
gap: `V1ID(U+0027) = V1ID(U+2019) = U+2019`, and `V1ID` is the identity elsewhere, so replacing a
`U+0027` neighbour with `U+2019` (or vice versa) changes neither side of any V1 comparison in
`V1ID`-space. V1's verdict is now invariant under Lemma A's hypothesis by the same construction
as the other seven tests, not by appeal to a mechanism (the gate) that cannot see the edit in
question. ∎

**The listed elision veto (spec 0.4.0) is covered by the same argument, not a new proof
obligation.** Every input it reads is one Lemma A already accounts for or one nothing in this
pipeline ever touches:

- `NARROW` membership of `cp[i]` and `cp[j]` — invariant, same as every test above.
- The elided content `cp[i+1 … i+k]` — a literal `LETTER` run (in the shipped `en-US` entry;
  the schema permits any non-empty string, but an idiom's `elided` field is authored as
  letters). `apostrophe` (R₆) never touches a `LETTER`; it replaces exactly one `SQ` with
  exactly one U+2019 and nothing else (`apostrophe.md` §1). Unaffected by any rule ordered at
  or before `quotes` for the same reason.
- The single `INLINE-SPACE` code point on each outer side, and the `left`/`right` `LETTER` runs
  beyond it — `apostrophe` touches neither an `INLINE-SPACE` code point nor a `LETTER`; nothing
  ordered before `quotes` does either (each earlier rule's own §4 "Must not touch" already
  states this for ordinary prose letters and spacing it did not itself just emit, and none of
  them emits a `LETTER`).

So substituting `g`'s own U+0027 for U+2019 at `i` or `j` (the only edit `apostrophe` can make
to this construction, and the only one reachable in this direction) changes none of the four
inputs above, and the veto's verdict on a given pair of indices is invariant under Lemma A's
hypothesis exactly as every other capability test is. Concretely: on the pipeline's second
pass, `rock ’n’ roll`'s two marks are U+2019 rather than U+0027, still `NARROW`, still bounded
by the identical literal `rock`/`n`/`roll` context — the veto fires identically, both marks are
vetoed again, `quotes` makes no pairing, and `apostrophe` does not act on U+2019 at all (§4).
The construction is a fixed point (§6 row P4 pins it).

**Modes.** `text` is the base case above. In `html` and `markdown`, `modes.md` §3.2's
concatenation-with-marker model means the veto's bounded lookaround can land on a `MARKER` (a
negative integer, in none of `LETTER`, `INLINE-SPACE`, `NARROW`) exactly where a real code
point would otherwise be — a context word split from its mark by an element or span boundary
fails the `INLINE-SPACE` test at that position and the veto does not fire (§6 rows H1–H3). This
is not a special case for modes: it is the same "word not found" outcome an ordinary document
boundary produces (`Llit`/`Rlit` = `NONE`), and `modes.md` §5's stability argument — no rule may
emit a code point at a position that changes how the next pass partitions spans — is
unaffected, because this veto neither emits anything nor changes any span boundary; it only
narrows which pairs `quotes` itself forms, which `modes.md` §5 part 3 already covers for the
rest of this rule's determinism.

> **Corollary A1 — `apostrophe` (R₆) is structurally invisible (spec 0.4.1: was claimed, not yet
> true, before `V1ID`).** `apostrophe` replaces U+0027 with U+2019 and nothing else. As a
> *neighbour*, Lemma A applies — **including its V1 clause**, now that V1 itself compares `V1ID`
> rather than raw code points. As the mark *itself*: both `U+0027` and `U+2019` are in `NARROW`,
> so the stack partition is unchanged; the medial veto is stated over `NARROW`, so its verdict is
> unchanged; neither is in `SPACE-RIGHT`/`SPACE-LEFT`, by constraint **Q-A**; and `V1ID` maps
> both to the same value, so V1's verdict on the mark's own candidacy is unchanged too. Every
> verdict is identical. This is a genuine **CO-S** discharge in the sense of
> `pipeline-idempotency.md` §5.1a — `E(apostrophe) = {U+2019}` is wholly inert for this rule,
> because `V1ID` makes it indistinguishable from the one code point it can only ever have
> replaced.
>
> **This corollary was wrong for one release** (spec 0.3.0–0.4.0): it asserted glyph-blindness
> covered V1 by deferring to Lemma A's text, and Lemma A's own proof at the time explicitly
> carved V1 out ("the only test that can move") and waved at the certification gate as the
> guarantor — a claim about a *different* mechanism (single-call self-re-derivation) standing in
> for a proof about *this* one (cross-call stability against a later rule). The gap was real: a
> `NARROW` candidate `g = U+2019` adjacent to an unmatched `U+0027` had a literal-neighbour
> comparison that read differently before and after `apostrophe` converted that neighbour on the
> *previous* pipeline pass, which is precisely `apostrophe` creating work for `quotes` —
> forbidden by `pipeline-idempotency.md` §2. Found by `fast-check` in `de-CH`
> (`spec/fixtures/de-CH.json`, `de-ch-quotes-041-cobug-apostrophe-v1`).
>
> **Reachability, stated precisely rather than as a blanket "every locale."** The *algorithm* —
> `QUOTEMARK`, V1, and `apostrophe`'s case ladder — is locale-independent, so the same synthetic
> witness can be constructed and passed through every locale's data, and
> `tests/rules/quotes.test.ts` does exactly that as a regression sweep. That is a claim about
> algorithmic constructibility, not evidence that the *pre-fix* defect actually reproduced in
> every locale — it was verified directly only in `de-CH`, where `« »`/`‹ ›` (neither U+2019) make
> the witness adversarial rather than naturally occurring. Separately: `en-GB`'s primary `close`
> and `fi`/`sv`'s secondary pair (both sides) *are* U+2019 as those locales' own prescribed
> glyphs, which is what makes this shape especially plausible from ordinary, correctly-typed
> content there — not merely reachable by construction — even though no canonical fixture is
> pinned in those locales for it (§3.2's `V1ID` discussion states the same reachability
> distinction and gives the empirical delta of the fix, "V1ID empirical audit" below).
>
> **On the elision-vs-closer tradeoff.** No U+2019-specific "can never open" restriction is
> applied. Such a restriction was considered and rejected: `fi`/`sv`'s secondary pair is U+2019
> on *both* sides, and forcing `canOpen = false` for every U+2019 would mean an already-correct
> `fi`/`sv` secondary pair could never be *recognised* as a pair at all — only ever declined —
> which directly contradicts mandate 1's purpose for that locale family. The cost of not
> restricting is stated in §4 and verified in §6 (rows E1–E4): it is the same pre-existing
> `rock 'n' roll`-family ambiguity 0.1.0 already documented for straight input, now also
> reachable via curly input, not a new class of damage.

### Lemma B — space-inertness at every position `nbsp` can reach

> Inserting a code point of `INLINE-SPACE`, or converting one `INLINE-SPACE` code point to
> another, at any position `nbsp` can act on, changes no capability of any candidate.

*Proof.* Conversion is trivial: every test reads class membership and U+0020, U+00A0, U+202F are
all in `INLINE-SPACE`. For insertion, `nbsp` has exactly three insertion sites (`nbsp.ts`
`claimInsertion`):

1. **N8, immediately right of an occurrence of `g ∈ SPACE-RIGHT`.**
   - *`g` itself*: `canOpen` reads `Rskip` (skips) and `openLeft` (untouched); `canClose` reads
     `Lskip` (untouched) and `closeRight`, which is `Rskip` because `g ∈ SPACE-RIGHT` (skips).
     All four invariant.
   - *the candidate `c` whose `Llit` was `g`*: `c.canOpen` reads `openLeft`, which is `Llit`
     (unless `c ∈ SPACE-LEFT`, in which case it skips): `g ∈ OPENISH` is accepted,
     `INLINE-SPACE ⊂ SPACELIKE` is accepted — same verdict. `c.canClose` reads `Lskip`, which
     skips the insertion back to `g` — same. Right-hand reads untouched.
   - no other index has a changed neighbourhood.
2. **N8, immediately left of `h ∈ SPACE-LEFT`.** Mirror image: `h.canOpen` reads
   `openLeft = Lskip` (skips, because `h ∈ SPACE-LEFT`); `h.canClose` reads `Lskip`. The
   candidate whose `Rlit` was `h` reads `closeRight = Rlit`, moving from `h ∈ CLOSEISH`
   (accepted) to `INLINE-SPACE` (accepted) — same verdict; and `Rskip`, which skips back to `h`.
3. **N1/N2, immediately left of a mark `m ∈ nbsp.beforePunctuation ∪
   nbsp.narrowBeforePunctuation`.** The only quote mark whose neighbourhood changes is a `g`
   with `Rlit = m`. Its `closeRight` moves from `m` to `INLINE-SPACE`; by constraint **Q-P**,
   `m ∈ CLOSEISH`, so both are accepted — same verdict. Its `Rskip` skips back to `m`. (`nbsp`'s
   own step 3 already declines to insert after an opening glyph.)

No other sub-rule inserts; N3–N7, N9, N10 only convert. ∎

**V1's `gapInsertable` clause (§3.2) is what extends this proof to V1 itself.** The four
capability tests above are the ones Lemma B's statement covers directly, but V1 is also a test a
candidate's own capabilities depend on, and it compares *code points*, not class membership —
Lemma B's "accepts `SPACELIKE` either way" argument does not apply to it. `gapInsertable` is
defined to hold exactly when `g` is a member of `SPACE-RIGHT` or `SPACE-LEFT` — precisely the
condition under which `nbsp`'s insertion sites 1 and 2 above can place a code point at the one
gap V1's second clause reads across — so V1's verdict is invariant to that insertion by the same
argument, case by case: at insertion site 1, the candidate immediately right of `g' ∈ SPACE-RIGHT`
has `gapInsertable = true` when its own glyph equals `g'` (the only case V1's second clause can
ever fire for it), and the literal-vs-skipped reads agree on whether that neighbour is `g'`,
exactly as case 1 above already shows for `canOpen`/`canClose`. Insertion site 2 is the mirror
image for `SPACE-LEFT`. Insertion site 3 (N1/N2) never inserts adjacent to a `QUOTEMARK` glyph on
the side V1 reads (it inserts beside listed punctuation, never beside a quote mark's own
same-glyph neighbour), so it cannot affect `gapInsertable`'s condition at all.

> **Corollary B1.** A run-1/run-2 asymmetry that used to arise from `quotes` reading a
> `SPACE-RIGHT` glyph's right side literally on one run and skipping it on the other cannot arise
> under §3.2: the read is `Rskip` on **both** runs, so `« **"` pairs on the first application and
> re-pairs identically on the second.

### Certification — the theorem

> **Theorem.** For every input `x` and every locale, `Q(Q(x)) = Q(x)`.

*Proof.* Let `A` be the accepted set and `y = Q(x) = render(x, A)`.

**Case `A = ∅`.** Then `y = x`. `Q` is a deterministic function of its input and the locale, with
no state (`ARCHITECTURE.md` §7), so `Q(y) = Q(x) = x = y`. ∎

**Case `A ≠ ∅`.** The loop exited on the equality branch, so `G₀(y) = π(A)`, where `G₀` denotes
passes 1–2. Run `Q` on `y`. Passes 1–2 give `A₀' = G₀(y) = π(A)`. The gate's first round computes
`render(y, π(A))`, and this equals `y`:

- **Glyphs.** `π` is order-preserving, so `depth_{π(A)}(π(p)) = depth_A(p)` for every `p`; the
  assigned pair is the same, and `y` already carries those glyphs at those indices by
  construction of `render`.
- **Inner spacing.** For a pair whose `innerSpace ≠ "none"`, `render` never touches spacing, on
  either run. For `innerSpace = "none"`: a run that was deleted is gone, so there is nothing to
  delete; a run that was declined is still present and its landing is unchanged — `render` maps
  `QUOTEMARK` to `QUOTEMARK` and leaves `ALNUM` alone, so a landing outside `DELETE-LANDING`
  stays outside it, and the same run is declined again.

Therefore `G₀(render(y, π(A))) = G₀(y) = π(A)`, the gate certifies in round 1, and
`Q(y) = render(y, π(A)) = y`. ∎

### Composition obligation

This rule is **R₅**; the obligation runs against `spaces`, `ellipsis`, `dashes` and `hyphen`, and
its own `I₅` must survive `apostrophe`, `symbols` and `nbsp`.

**What this rule emits.** `E(quotes)` = the four locale quote glyphs, each replacing exactly one
`QUOTEMARK` at the same index. Plus deletions of a maximal `INLINE-SPACE` run whose near side is
a quote glyph and whose far side is in `ALNUM ∪ QUOTEMARK`. **Nothing is inserted.**

**The listed elision veto (spec 0.4.0) changes none of the below.** It adds no emission — a
vetoed pair of marks is simply never paired, so `E(quotes)` is exactly what it was — and can
only shrink the set of pairs this rule forms, never grow it. Every discharge that follows was
argued against a `quotes` whose positive behaviour is a superset of the current one, so each
still holds without re-verification.

- **Against `I₁` (`spaces`).** Discharged. No U+0020 is emitted, so no S-b/S-c/S-d position can
  be created. Deletion removes a *maximal* run, so it cannot bring two U+0020 into contact
  (S-a); its neighbours after deletion are a quote glyph and an `ALNUM`/`QUOTEMARK`, both
  `CONTENT`.
- **Against `I₂` (`ellipsis`).** Discharged. No U+002E or U+2026 is emitted; the deletion's
  landing is in `ALNUM ∪ QUOTEMARK`, which contains no dot, so no two dot runs are joined.
- **Against `I₃` (`dashes`).** Discharged **structurally**. A quote glyph is in none of `DASH`,
  `INERT-DASH`, `DIGIT`, `SPACE`, `NOBREAK-SPACE`, `JOINER`, `ROMAN` or `LETTER`, so a
  `cp[L]`/`cp[R]`/`before`/`after` moving from one quote mark to another moves nowhere. The
  deletion's two sides are a quote glyph and a `DELETE-LANDING` member, **neither in
  `DASH ∪ INERT-DASH`** — so no dash run is ever adjacent to a deleted run, no token's
  `lsp`/`rsp` changes, and the landing separates the deletion from any dash run by at least one
  code point. This is the discharge the naive "delete the inner space unconditionally"
  formulation failed, with witness `" --x"` → `“--x”` → `“—x”` (row D1, §6).
- **Against `I₄` (`hyphen`).** Discharged. `hyphen`'s boundary test is `¬WORDISH`, and both a
  U+0020 and a quote glyph are outside `WORDISH = ALNUM ∪ HYPHENISH`. The deletion never lands
  inside a word, only against its first or last code point.
- **`I₅` against `apostrophe` (R₆).** Discharged by Corollary A1 (CO-S).
- **`I₅` against `nbsp` (R₈).** Discharged by Lemma B (CO-S-shaped, over `nbsp`'s insertion
  *sites* rather than its emission alphabet alone — the alphabet by itself is not enough, because
  a `SPACELIKE` insertion is *not* inert at an arbitrary position; it is inert at exactly the
  positions `nbsp` can reach).
- **`I₅` against `symbols` (R₇).** **Known-weak: a case analysis, not CO-S.** `symbols`
  collapses `(c)`/`(r)`/`(tm)` to a single sign, deleting code points, and converts `x` to `×`
  between numerals. A quote mark adjacent to a collapsed span sees `(` on its right (moving to
  `©`, which is neither `OPENISH` nor `CLOSEISH`) or `)` on its left (moving to `©`). Checked
  over all four capability tests, every reachable verdict coincides: `canOpen`'s right test
  accepts `(` and accepts `©`; `canClose`'s right test rejects both; `canOpen`'s left test
  rejects `)` and rejects `©`; `canClose`'s left test accepts both as non-`NONE`. This is not
  made structural — the sweep is the control, per §5.1a of `pipeline-idempotency.md`.

---

## 6. Worked examples

`␣` = U+0020, `⍽` = U+00A0, `⟶` = no change. Every row is verified by running
`src/rules/quotes.ts` against the fixture of the same name in `spec/fixtures/`; none is
hand-traced-only.

### `en-US` — primary `“ ”`, secondary `‘ ’`, `innerSpace: none`

| # | Input | Output | Why |
| --- | --- | --- | --- |
| 1 | `She said "hello" twice.` | `She said “hello” twice.` | depth 1 → primary |
| 3 | `'He said "no" to me,' she noted.` | `“He said ‘no’ to me,” she noted.` | depth, not width, selects the pair; the gate certifies despite both streams swapping width |
| 4 | `He said "hi. She said "bye."` | `He said "hi. She said “bye.”` | the first mark's `closeRight` is the letter `h`, so it is `canOpen` only and cannot swallow the real quotation |
| 5 | `Don't touch it — it's the '90s.` | ⟶ | two medial vetoes; `'90s` is `canOpen`, unmatched, handed to `apostrophe` |
| 6 | `He is 6' 2" tall.` | ⟶ | both marks `canClose` only, both stacks empty |
| 7b | `"""a""` | ⟶ | every mark has an identical literal neighbour, V1 drops all five |
| 7c | `"a "" b"` | `“a "" b”` | the inner `""` is vetoed; the outer pair converts; the gate certifies |
| 8 | `“Already curly,” he said, and "this too."` | `“Already curly,” he said, and “this too.”` | the curly pair is now a real depth-1 pair, not an ignored one |
| A | `“He said ‘no’ twice.”` | ⟶ | already-correct nesting is a no-op |
| M2a | `" hello"` | `“hello”` | mandate 2: `canOpen` reads `Rskip = h`; the inner run's landing is `h ∈ ALNUM`, deleted |
| M2b | `"hello "` | `“hello”` | mirror case |
| D1 | `" --x"` | `“ --x”` | the inner run's landing is `-`, outside `DELETE-LANDING` → deletion declined, glyphs still convert |
| E1 | `’90s were fun,’ he said` | `“90s were fun,” he said` | **elision-vs-closer, curly input** — see §4's residual-risk note |
| E1s | `'90s were fun,' he said` | `“90s were fun,” he said` | the straight-input control: the same corruption, pre-existing since 0.1.0 |

#### Listed elision veto — `en-US`, `elisionIdioms = [{ left: "rock", elided: "n", right: "roll" }]`

Positive — the full context matches and both marks are vetoed, so `apostrophe` (order 50) renders
each independently:

| # | Input | Output | Why |
| --- | --- | --- | --- |
| P1 | `rock 'n' roll` | `rock ’n’ roll` | canonical form |
| P2 | `Rock 'n' roll is great.` | `Rock ’n’ roll is great.` | sentence-initial capital — first-code-point leniency on `left` |
| P3 | `I love rock 'n' roll.` | `I love rock ’n’ roll.` | trailing period after `right` does not block the word-boundary test |
| P4 | `rock ’n’ roll` | ⟶ | already-curly: U+2019 is `NARROW`, the veto fires identically on the already-correct form, `apostrophe` does not act on U+2019 at all — a fixed point (§5) |

Negative — the elided content alone would match, but the full context does not, so these fall
through to ordinary pass 1/2 pairing exactly as before spec 0.4.0. **This is the table that
proves the false positive found in a stage-3 review is closed**: N1 and N2 were reported as
falsely elided by the earlier, context-free `elisionForms` design and are the reason it was
replaced by `elisionIdioms`.

| # | Input | Output | Why |
| --- | --- | --- | --- |
| N1 | `The letter 'n' is common.` | `The letter “n” is common.` | no `left`/`right` context at all — an ordinary depth-1 pair, primary glyphs |
| N2 | `He said "press 'n' now".` | `He said “press ‘n’ now”.` | nested quotation; the inner pair is an ordinary depth-2 pair, secondary glyphs — not an idiom |
| N3 | `rock 'n' pop` | `rock “n” pop` | `right` is `pop`, not `roll` — no configured idiom matches |
| N4 | `fish 'n' chips` | `fish “n” chips` | not sourced or listed: no `{ left: "fish", … }` entry exists in `en-US.json` |
| N5 | `rock 'N' roll` | `rock “N” roll` | `elided` is matched **exactly**, no leniency; `N ≠ n` — the first-code-point leniency applies only to `left`/`right`, never to `elided` |

**Known, accepted residual ambiguity (not a negative-fixture guarantee).** The full-context
requirement narrows the false-positive surface to genuine surface-form coincidence; it cannot
see authorial intent, only code points. A document that explicitly states it means three
separate tokens — a word, a genuinely quoted single letter, another word — and then reproduces
the identical surface sequence for illustration still gets that final occurrence vetoed:

| # | Input | Output | Why |
| --- | --- | --- | --- |
| N6 | `The sequence is the word rock, the quoted letter 'n', and the word roll: rock 'n' roll.` | `The sequence is the word rock, the quoted letter “n”, and the word roll: rock ’n’ roll.` | **the first `'n'` is correctly NOT vetoed** (`left` is `letter`, not `rock`; it is followed by a comma, not a space — neither test reaches a match), proving the matcher works exactly as N1/N2 already show. **The second `rock 'n' roll` IS vetoed and pinned as known, accepted risk, not fixed.** Under the intent the sentence itself states, this is a genuine semantic false positive — accepted as an unavoidable one for this bounded, surface-form contract, since `left`/`elided`/`right` and the single permitted `INLINE-SPACE` are all it is defined over, and none of them can encode "this is a demonstration, not an utterance of the idiom." The implementation still conforms exactly to its own matcher here: the bytes are the idiom's bytes, byte for byte, and the matcher cannot see past that. Recorded so the exposure is visible in the conformance suite rather than discovered in someone's content (§3.2's residual-ambiguity note) |

#### Listed elision veto across span boundaries — `html`, `markdown`

`modes.md` §3.2's boundary marker is not `INLINE-SPACE`, so a context word separated from its
mark by an element or span boundary does not satisfy the veto's outer test and the idiom does
not fire — the marks fall through to ordinary pairing, identically to `text` mode on the same
characters split the same way.

| # | Mode | Input | Output | Why |
| --- | --- | --- | --- | --- |
| H0 | `html` | `<p>rock 'n' roll</p>` | `<p>rock ’n’ roll</p>` | idiom whole within one text node — positive control |
| H1 | `html` | `<p><em>rock</em> 'n' roll</p>` | `<p><em>rock</em> “n” roll</p>` | `left` word is inside a different span; `Llit` at the opening mark is the boundary marker, not `INLINE-SPACE` |
| H2 | `html` | `<p>rock 'n' <em>roll</em></p>` | `<p>rock “n” <em>roll</em></p>` | mirror case on `right` |
| H3 | `markdown` (`commonmark`) | `*rock* 'n' roll\n` | `*rock* “n” roll\n` | `left` word is inside an emphasis span; the veto does not cross it, matching `text` mode's own boundary behaviour on split input |

### `en-GB` — primary `‘ ’`, secondary `“ ”`

| # | Input | Output | Why |
| --- | --- | --- | --- |
| B2 | `‘""-"-"` | ⟶ | width drift interacting with the same-glyph adjacency veto; the gate declines to ∅ |
| E2 | `’90s were fun,’ he said` | `‘90s were fun,’ he said` | elision-vs-closer, curly input |
| E2s | `'90s were fun,' he said` | `‘90s were fun,’ he said` | straight-input control |

### `fi` — primary `” ”` (U+201D both sides), secondary `’ ’` (U+2019 both sides)

| # | Input | Output | Why |
| --- | --- | --- | --- |
| 9 | `Hän sanoi "moi" ja lähti.` | `Hän sanoi ”moi” ja lähti.` | the pairing, not the glyph, knows which is which |
| B | `”Hän sanoi ’moi’”, totesin.` | ⟶ | same-glyph already-correct nesting is a no-op |
| 11 | `"Hän sanoi 'moi'", totesin.` | `”Hän sanoi ’moi’”, totesin.` | row B's input reached from straight marks |
| U1 | `”Hän sanoi ”moi” ja lähti.` | ⟶ | unbalanced same-glyph: three `”`, the stray leading one is left alone |
| E3 | `’90s were fun,’ he said` | `”90s were fun,” he said` | elision-vs-closer, curly input |
| E3s | `'90s were fun,' he said` | `”90s were fun,” he said` | straight-input control |

### `sv` — same shape as `fi`

| # | Input | Output | Why |
| --- | --- | --- | --- |
| E4 | `’90s were fun,’ he said` | `”90s were fun,” he said` | elision-vs-closer, curly input |
| E4s | `'90s were fun,' he said` | `”90s were fun,” he said` | straight-input control |

### `fr` — primary `« »`, `innerSpace: "nbsp"`; secondary `“ ”`, `innerSpace: "none"`

| # | Input | Output *(after `nbsp`)* | Why |
| --- | --- | --- | --- |
| 12 | `Il a dit "bonjour".` | `Il a dit «⍽bonjour⍽».` | `quotes` emits the glyphs; `nbsp` the U+00A0 |
| 13 | `Il a dit «␣bonjour␣».` | `Il a dit «⍽bonjour⍽».` | mandate 2's second half: the pair *forms on the first application* and produces no edit from `quotes` because the glyphs are already right |
| 3a | `«␣**"` | `«⍽**⍽»` *(after `nbsp`)* | width drift interacting with a run-1 `nbsp` insertion; `quotes` alone certifies the pair with one edit |

### `fr-CA`, `html` mode

| # | Input | Output | Why |
| --- | --- | --- | --- |
| 3b | `"<p class="x">«[t](u)` | ⟶ | the mode adapter splices a `MARKER` between the two text spans; `«`'s `closeRight` reads `Rskip` (because `« ∈ SPACE-RIGHT`) and finds `[`, so it is never `canClose` and no pair forms, on either application |

### `ru` — primary `« »`, secondary `„ “`

| # | Input | Output | Why |
| --- | --- | --- | --- |
| 14 | `Он сказал: "это 'моё' дело".` | `Он сказал: «это „моё“ дело».` | depths 1 and 2 |
| B1 | `'"‘` | ⟶ | width drift with no candidate left unmatched to be swallowed; the gate declines to ∅ in one round |

### `el` — primary `« »`, secondary `“ ”` (both `WIDE`)

| # | Input | Output | Why |
| --- | --- | --- | --- |
| 16 | `"Είπε 'όχι' σε μένα", σημείωσε.` | `«Είπε “όχι” σε μένα», σημείωσε.` | width drift with no gate intervention — evidence the gate's cost is near zero |
| 18 | `Είπε "σ' αυτό το βιβλίο" χθες.` | `Είπε «σ' αυτό το βιβλίο» χθες.` | the elision is `NARROW`, the quotation `WIDE`, different stacks — the elision survives untouched for `apostrophe` to convert on the next rule |

### `de-DE` — primary `„ “`, secondary `‚ ‘`

| # | Input | Output | Why |
| --- | --- | --- | --- |
| C | `Er sagte «Wort» leise.` | `Er sagte „Wort“ leise.` | foreign guillemets convert |
| C2 | `Er sagte « Wort » leise.` | `Er sagte „Wort“ leise.` | same, plus both inner runs deleted (landings `W` and `t`) |

### Adversarial sweep — `ru`/`el`/`fr`/`fr-CA` (§7 item 9)

These four locales' primary and secondary pairs are **both `WIDE`**, so the width-keyed stack
split does not independently separate a re-scanned primary stream from a re-scanned secondary
stream the way it does for `en-US`/`en-GB`/`fi`/`sv`. An exhaustive sweep over
`{«, », „, “, ", ', a, ␣}` (the locale's own glyphs plus the shared control alphabet) to length 5
— 149,796 inputs across the four locales — found **zero** idempotency failures; the medial and
same-glyph vetoes plus the certification gate together protect already-curly interleaved text in
this family, even without an independent width partition. Recorded as measured, not asserted.

---

## 7. Open questions, and what could not be closed

Ordered by how much this matters.

1. **Mandate 1's false-positive surface is genuinely larger, and M4 is where it will show.** A
   lone `«` can now pair with a distant `"` (row 3a converts an input 0.1.0 left alone). Any
   document with an odd stray typographic quote — a `»` used as a bullet, a `’` used as a prime,
   a `«` in a citation — can recruit a partner from arbitrarily far away, and unlike a straight
   mark the result is not visibly "unfinished" to a proofreader. This is a **product** risk, not
   an idempotency one; run the M4 corpus against this change specifically before anything else.
2. **The `symbols` (R₇) discharge is a case analysis**, not structural. Frequency: low (needs a
   quote mark literally adjacent to a `(c)`/`(r)`/`(tm)` span), but not closed structurally.
3. **The elision-vs-closer tradeoff (§4, §5 Corollary A1, §6 rows E1–E4) is verified, not
   eliminated.** A leading elision that has already been rendered U+2019 and finds no partner of
   its own can still be recruited as an opener by an unrelated closer elsewhere in the text —
   that is a different mechanism from item 8's closed-idiom case below (`quotes.elisionIdioms`,
   spec 0.4.0) and is **not** closed by it: the veto only fires on a *listed idiom's full
   left/elided/right context* found together, not on a lone leading elision separated from any
   partner by arbitrary distance. No fix is proposed here.
4. **The gate's forced-removal clause's necessity is asserted, not demonstrated with a concrete
   witness.** ~850,000 swept inputs did not trigger it. Implemented anyway (free insurance); if a
   future witness fires it, record it as a fixture.
5. **Declined deletions leave visibly sloppy output** (`" --x"` → `“ --x”`, row D1). This is the
   correct side to be wrong on (the alternative is a confirmed `I₃` violation) but is a real,
   acknowledged gap in mandate 2's coverage.
6. **`" "` and `«»` are prevented by an explicit vacuity guard, not by construction**, unlike
   0.1.0 where an empty pair was structurally impossible. Weaker footing than 0.1.0 had, though
   the gate catches any resulting instability.
7. **Worst case is `O(n²)`** (gate rounds × pass cost). A pathological span of alternating quote
   marks is quadratic; cap rounds if this matters in practice.
8. **`rock 'n' roll` — closed for `en-US` in spec 0.4.0 via `quotes.elisionIdioms =
   [{ left: "rock", elided: "n", right: "roll" }]` (Chicago Manual of Style Online on the
   mark's function, American Heritage Dictionary on the spaced variant's existence — see
   `en-US.json` `sources`), still open everywhere else.** A first design (a bare
   `elisionForms = ["n"]` word list, matching only the elided content) was prototyped and
   reviewed within the same development of spec 0.4.0, and rejected before any release or
   commit — it never shipped, was never published, and no user ever ran it: review found that
   it falsely elided ordinary quotations of the letter *n* — `The letter 'n' is common.`,
   `He said "press 'n' now".` — because it had no way to see the surrounding context.
   `elisionIdioms`' three-part contract (§2, §3.2) is what actually lands in spec 0.4.0, and
   §6's `N1`/`N2` rows exist specifically to keep that reviewed-and-rejected design from being
   reintroduced.
   `en-GB` has no independent citation and carries an extra risk the other locales do not: its
   primary pair *is* the single quote, so `'n'` is far more plausible as genuine quoted dialogue
   there than in a locale whose primary pair is double — populating it would need to clear a
   higher bar than en-US's, not merely find any citation. `fi` and `sv` write the idiom **closed
   up** (`rock'n'roll`, no surrounding spaces) in their own dictionaries, so the veto's
   spaced-form trigger would never fire on correctly-written text in either — an entry there
   would be evidenced-inert, not evidenced-useful, and none was added. **Still open, all
   locales:** `en-GB` single-first (now more consequential under mandate 1); quotation across a
   paragraph boundary; nesting deeper than 2; primes; surviving-mark invisibility to the
   conformance matrix.
9. **`ru`/`el`/`fr`/`fr-CA` already-curly protection is narrower than 0.1.0's** for these
   same-width-primary/secondary locales specifically — the two-stack split no longer
   independently protects already-curly text there the way it protects freshly-typed straight
   text. §6's dedicated adversarial sweep found no failures, but the protection that remains is
   the vetoes and the gate, not an independent structural guarantee.

---

## History

0.1.0 shipped with the four-pass, `STRAIGHT`-only design whose idempotency proof is quoted and
withdrawn in §0/§5 above. 0.2.0 was `dashes`' version bump and did not touch this file. 0.3.0 is
the revision described through most of this document: mandates 1 and 2, the five-pass
algorithm, the certification gate, and the locale-schema constraints in §2.1.

0.4.0 adds the **listed elision veto** (§2, §3.2): `quotes.elisionIdioms`, a locale-data list of
`{ left, elided, right }` triples that declines to pair two `NARROW` marks as a quotation when
the full surrounding context matches a configured idiom, closing the `rock 'n' roll` defect
(§7 item 8) for `en-US`. A first design considered during the same development — a bare
`elisionForms` word list matching only the elided content — was reviewed and rejected before
any commit or release once it was found to falsely elide ordinary quotations of a single letter
(`The letter 'n' is common.`); it never shipped. §6's `N1`/`N2` rows and this history entry
exist so that design is not silently reintroduced.

0.5.0 adds the **general ambiguous-medial-span veto** (§3.2, "General ambiguous-medial-span
veto"), closing the same class of defect for every locale without a cited `elisionIdioms` entry
— not by inferring an idiom, but by preserving the author's straight ASCII marks unconverted. The
shared predicate this and `apostrophe` (order 50) both consult lives in one module,
`src/rules/quote-ambiguity.ts` (JS reference implementation), specifically so `apostrophe`'s own
structural case ladder cannot independently curl a mark this rule has deliberately left alone —
see `apostrophe.md` §3.4 for why that composition risk is real, not hypothetical.
