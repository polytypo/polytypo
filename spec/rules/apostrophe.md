# Rule: `apostrophe`

**Order:** 50. **Default:** on. **Modes:** text, html, markdown.
**Spec version:** 0.5.0 (0.4.1 for everything except §2, §3.4 and the §6/§7 updates for the
shared ambiguity predicate).

---

## 1. Purpose

`apostrophe` converts a straight U+0027 (') to U+2019 (’) where it is genuinely an
apostrophe: a contraction (`don't`), an elision (`l'été`, `’tis`), a possessive
(`the dogs' bowls`), or a decade elision (`’90s`). It runs immediately after `quotes`
(order 40) and sees only the U+0027 marks that `quotes` declined to claim, which is the whole
reason the two rules are separate and ordered: quotation resolution needs global information
(pairing across a paragraph), apostrophe resolution needs only local information (two
neighbours), and mixing them produces a rule that is neither provable nor portable. Every
edit is one code point replacing one code point. The rule never inserts, never deletes, and
never touches U+2019 itself.

**As of spec 0.5.0, this rule additionally skips a small, precisely-defined set of positions
entirely** — see §3.4 — rather than applying its case ladder to them. This is the one exception
to "every candidate is decided from exactly two neighbouring code points" (§3.3): whether a
position is in that skip set is decided once, before the scan, from a wider (but still
structural, still bounded) context.

---

## 2. Locale data consumed

**`quotes.elisionIdioms`, indirectly — added spec 0.5.0.** `order.json` now declares
`"localeData": ["quotes"]`. This rule's own case ladder (§3.3) remains structural, not lexical,
and still consumes no locale data directly; the one exception is §3.4's shared predicate, which
reads `quotes.elisionIdioms` to tell an idiom-authorized position (left alone by `quotes`, but
meant to be curled by this rule's ordinary case ladder — unchanged since spec 0.4.0) apart from
an ambiguous-but-uncited position (left alone by `quotes`, and meant to be left alone by this
rule too). Before spec 0.5.0 this rule read no locale data at all; nothing else in §3.3's case
ladder reads any now either.

---

## 3. Algorithm

Input is a code-point array `cp[0 … n-1]`.

### 3.1 Character classes

| Class       | Members                                                                                                                                               |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SQ`        | U+0027 (apostrophe) — the only candidate character                                                                                                    |
| `DIGIT`     | U+0030–U+0039                                                                                                                                         |
| `LETTER`    | general category `Lu`, `Ll`, `Lt`, `Lm`, `Lo`, `Mn`, `Mc`, `Me` (combining marks count as letter-continuation, so `l'e` + U+0301 behaves like `l'é`)  |
| `ALNUM`     | `LETTER` ∪ `DIGIT`                                                                                                                                    |
| `SPACELIKE` | U+0020, U+0009, U+00A0, U+202F, U+2007, U+2009, U+200A, and every member of `BREAK`                                                                   |
| `BREAK`     | U+000A, U+000D, U+000B, U+000C, U+0085, U+2028, U+2029                                                                                                |
| `OPENISH`   | U+0028 `(` U+005B `[` U+007B `{` U+00AB `«` U+2018 U+201A U+201B U+201C U+201E U+201F U+2039 `‹`, U+002D, U+2011, U+2013, U+2014                      |
| `CLOSEISH`  | U+0029 `)` U+005D `]` U+007D `}` U+00BB `»` U+2019 U+201D U+203A `›` U+002C U+002E U+003B U+003A U+0021 U+003F U+2026, U+002D, U+2011, U+2013, U+2014 |
| `NONE`      | index out of range                                                                                                                                    |

**Unicode version.** The general categories this rule reads are those of the UCD version pinned in `spec/UNICODE` (`17.0`). The pin is normative for the **derived tables**, not for the host runtime — see [pipeline-idempotency.md](pipeline-idempotency.md) §6a, which also specifies the canary fixtures that make it detectable.

Note that U+2019 is a member of `CLOSEISH` and U+0027 is a member of neither. This matters for
idempotency and is argued in §5. U+2011 is listed alongside U+002D because `hyphen` (order 35)
converts one to the other and a class that held only U+002D would make a neighbouring
apostrophe's verdict depend on whether `hyphen` had already run (`hyphen.md` §3.2).

### 3.2 Ordering dependency

`quotes` has already run. Consequently:

- Any U+0027 that formed part of a resolved quotation pair is **gone** — it is now a locale
  quote glyph, which is not in `SQ` and is invisible to this rule. A quotation that `quotes`
  resolved can therefore never be corrupted here.
- Any U+0027 that `quotes` vetoed as medial (letter on both sides) or left unmatched is
  still present and is this rule's input.

This rule must not attempt to second-guess `quotes`. If a U+0027 is still here, `quotes`
decided it is not a quotation mark or could not prove that it was.

### 3.3 Scan

Walk `i` from `0` to `n-1`. If `cp[i]` is not in `SQ`, continue. Otherwise compute

- `left = cp[i-1]` if `i > 0`, else `NONE`;
- `right = cp[i+1]` if `i+1 < n`, else `NONE`;

and take the **first** matching case:

1. **Prime guard.** If `left` is in `DIGIT` **and** `right` is not in `LETTER` → emit
   nothing. This is `6' 2"`, `55° 40' N`, `x'` in a formula. A foot mark is not an
   apostrophe, and rendering it as U+2019 is a false positive that a reader will notice.
   Placed first so it wins over case 3.
2. **Medial apostrophe.** If `left` is in `ALNUM` **and** `right` is in `ALNUM` → emit an
   edit replacing `cp[i]` with U+2019. Covers `don't`, `l'été`, `O'Brien`, `n'est`,
   `1990's`, `d'accord`, `Hawai'i`, `can't`.
   (Note that case 1 has already removed the `digit` + `non-letter` combination, so the
   `DIGIT`-left half of this case only fires for `1990's`-style forms where a letter follows.)
3. **Trailing elision or possessive.** If `left` is in `LETTER` **and**
   (`right` is `NONE`, or `right` is in `SPACELIKE`, or `right` is in `CLOSEISH`) → emit an
   edit replacing `cp[i]` with U+2019. Covers `the dogs' bowls`, `les élèves' cahiers`,
   `Jesus'`, `rock 'n'` (the trailing mark).
4. **Leading elision.** If (`left` is `NONE`, or `left` is in `SPACELIKE`, or `left` is in
   `OPENISH`) **and** (`right` is in `ALNUM`) → emit an edit replacing `cp[i]` with U+2019.
   Covers `’90s`, `’tis`, `’em`, `’cause`, `’n'` (the leading mark), `(’tis)`.
   **The replacement is U+2019 — never U+2018.** A leading elision is a raised comma marking
   removed characters, not an opening quotation mark. Getting this backwards is the single
   most common apostrophe bug in existing tools, and it is visually obvious in a serif face.
5. **Otherwise** → emit nothing. This is a U+0027 that is isolated (`a ' b`), doubled (`''`),
   or adjacent to punctuation on both sides. Nothing can be inferred; leave it.

The cases are mutually exclusive after the first-match rule and every one of them is decided
from exactly two neighbouring code points. There is no lookahead beyond one position and no
state carried between candidates.

### 3.4 The shared ambiguity preserve-set (spec 0.5.0)

`quotes` (order 40) now declines to pair two straight ASCII marks in an ambiguous medial shape —
`rock 'n' roll`, `She chose 'A' today` — for every locale without a cited `quotes.elisionIdioms`
match (`quotes.md` §3.2, "General ambiguous-medial-span veto"). Both marks of such a pair reach
this rule exactly like any other surviving U+0027 (§3.2 above): they are not part of a resolved
quotation, so they are this rule's input.

**Without a further check, this rule's own case ladder would curl them anyway** — and get it
wrong for the same reason the withdrawn context-free `elisionForms` design was rejected
(`quotes.md` §7 item 8, History): the leading mark of `rock 'n' roll` has `SPACELIKE` on its left
and `LETTER` on its right, matching case 4 (leading elision); the trailing mark has `LETTER` on
its left and `SPACELIKE` on its right, matching case 3 (trailing elision/possessive). Applied
independently — this rule has no notion that the two marks are a pair, by design (§1) — both
would convert to U+2019, reproducing `rock ’n’ roll` **without any cited evidence that this is
the correct treatment for this locale**. That would silently defeat the whole point of `quotes`'
veto: a decision `quotes` made not to guess would be undone one rule later by this rule guessing
for it, through a different code path.

**The fix: before scanning, compute the preserve set** —
`computePreserveIndices(cp, locale.quotes.elisionIdioms)` (`src/rules/quote-ambiguity.ts`, shared
with `quotes`) — and skip any index in it entirely, before `left`/`right` are even read. The
preserve set is exactly the ambiguous-shaped positions (`quotes.md` §3.2's structural
definition: a pair of straight ASCII single quotes enclosing 1-3 `LETTER` code points, one
`INLINE-SPACE` immediately outside each mark) with no matching `elisionIdioms` entry. A position
**with** a matching idiom is **not** in the preserve set — this rule sees it and applies its
ordinary case ladder to it, exactly as spec 0.4.0-0.4.1 did (case 4 then case 3, for
`en-US`'s `rock 'n' roll`). Only the uncited, ambiguous positions are skipped, and skipping means
literally nothing is emitted for them: the mark stays U+0027, byte-identical, forever (idempotent
by construction — the same shape is found and the same skip decision made on every subsequent
pipeline pass, since nothing ever changes at that position).

This is the one piece of this rule's behaviour that is not a pure two-neighbour decision (§1). It
does not weaken the two-neighbour argument for the positions that do reach the case ladder — the
preserve set only ever **removes** candidates from consideration, never changes how a candidate
that does reach case 1-5 is decided.

### 3.4a Why the prime guard precedes the medial case

`1990's` has a digit on the left and the letter `s` on the right; case 1 does not fire
(`right` is a letter), case 2 does. `6'` has a digit on the left and a space on the right;
case 1 fires and the mark survives. `6'2"` has a digit on both sides; case 1 fires
(`right` is a digit, not a letter) and the mark survives — which is right, because that is a
feet-and-inches measurement, not a contraction.

---

## 4. Must not touch

**Scope.** Per [pipeline-idempotency.md](pipeline-idempotency.md) §5.2 each bullet is **[P]** —
a guarantee of `transform` as a whole — or **[R]** — true of this rule in isolation but capable
of being falsified by another rule, which is then named.

- **[P] U+2019 that is already present.** Not in `SQ`; never examined. Re-processing corrected
  text is a no-op.
- **[R] A quotation mark `quotes` already resolved.** It is no longer U+0027 (§3.2).
- **[R] A foot, minute or prime mark:** `6'`, `55° 40'`, `x'`. Case 1.
  _[R], not [P]. `quotes` (R₅) runs first and can pair a prime with a genuine quotation mark
  before this rule ever sees it: in `"6' 2"` the opening `"` is `canOpen`, the `'` after the
  digit is `canClose`, they pair, and the foot mark is emitted as a closing quote glyph. Bare
  `6' 2"` is safe — neither mark finds a partner — but the protection is not a pipeline-level
  one and must not be advertised as such._
- **[P] An isolated U+0027** with `SPACELIKE` on both sides, or at the very start or end of the
  text unit with `SPACELIKE` on the inner side. Case 5.
- **[P] `''`** — two adjacent U+0027 (a typewriter double quote, or a LaTeX close-quote idiom).
  Neither has `ALNUM` on the relevant side, so case 5 applies to both.
- **[P] U+0060 (`), U+00B4 (´), U+02BC (ʼ), U+02B9, U+2032 (′).** None is in `SQ`. In particular
U+02BC is a *letter* in several orthographies and converting it would be a data mutation.
Converting U+0060 or U+00B4 is a separate normalisation concern that `order.json` does not
  authorise.
- **[P] U+0027 inside a skipped region** — attribute values, code spans, fenced code, URLs.
  Removed by the mode adapter (L2). This rule has no code-awareness and must not acquire any:
  `it's` in prose and `'string'` in a Python snippet are indistinguishable to it.
- **[R] Spacing.** The rule inserts and deletes nothing. _`nbsp` (R₈) changes spacing._
- **[P] An ambiguous medial span with no cited idiom** (spec 0.5.0): `rock 'n' roll` in any
  locale without a matching `quotes.elisionIdioms` entry, `She chose 'A' today`, `They said 'no'
  yesterday`. §3.4's preserve set. Both marks stay literal U+0027 forever — not [R], because no
  other rule can perturb this: `quotes` (R₅) is the only earlier rule that touches quote-shaped
  code points, and its own veto is what put these marks here in the first place.

---

## 5. Idempotency argument

Every edit replaces one U+0027 with one U+2019 at the same index. U+2019 is not in `SQ`, so
an edited position is not a candidate on the second run. The candidate set of the second run
is therefore a subset of the first's: the U+0027 marks that fell through to case 5, plus the
ones caught by the prime guard in case 1.

For each of those, the decision is a pure function of `left` and `right`. The only code
points this rule changed are former U+0027 marks that became U+2019. So the question is: can
a surviving candidate's `left` or `right` have changed class in a way that flips its
outcome?

- U+0027 is in **none** of `ALNUM`, `SPACELIKE`, `OPENISH`, `CLOSEISH`, `DIGIT`, `LETTER`.
- U+2019 is in `CLOSEISH` and in none of the others.

So a neighbour changing from U+0027 to U+2019 can only _add_ `CLOSEISH` membership. Where
does `CLOSEISH` appear in the decision? Only in case 3's right-test. So the only possible
flip is: a candidate `u` whose right neighbour was U+0027 (giving no case-3 match) and is
now U+2019 (giving a case-3 match), where additionally `u`'s left neighbour is a `LETTER`.

Concretely that shape is `LETTER` U+0027 U+0027 — for example `dogs''`. On run 1: the first
mark has `left` = `s` (letter), `right` = U+0027, which is in none of `NONE`/`SPACELIKE`/
`CLOSEISH`, so case 3 does not fire, cases 1, 2 and 4 do not fire, and it falls to case 5.
The second mark has `left` = U+0027 (not `ALNUM`, not `LETTER`, not `SPACELIKE`, not
`OPENISH`) so no case fires; case 5. **Neither is edited on run 1**, so no U+2019 appears and
the flip cannot occur. The premise is vacuous.

More generally: the flip requires the _right_ neighbour to have been edited, i.e. the right
neighbour was a U+0027 that matched one of cases 2, 3, 4. Cases 2 and 4 require `ALNUM` on
that mark's **left** — but its left is `u`, which is U+0027, not `ALNUM`. Case 3 requires
`LETTER` on its left — same contradiction. So the right neighbour of a surviving U+0027 is
never edited, and no surviving candidate's classification changes.

Hence `T(T(x)) = T(x)`.

**What had to be fixed.** Two things:

1. **The naive rule "convert every `'` to `’`" is idempotent but wrong** — it destroys foot
   marks and, more importantly, it is what forces a library to conflate quoting with
   apostrophes. The fix is the case ladder with the prime guard first, which costs one extra
   comparison and removes an entire false-positive class.
2. **The naive rule "a `'` at the start of a word is an opening single quote, so use U+2018"**
   is the one that corrupts `’90s` into `‘90s`. The fix is structural: `quotes` has already
   had its chance to claim the mark as an opening quotation and declined (§3.2), so by the
   time this rule sees it, the only remaining reading is an elision, and the elision glyph is
   U+2019. The rule therefore never emits U+2018 at all — that code point does not appear
   anywhere in this algorithm.

---

### Composition obligation

Per [pipeline-idempotency.md](pipeline-idempotency.md) §5. This rule is **R₆**; the obligation
runs against `spaces`, `ellipsis`, `dashes`, `hyphen` and `quotes`.

**What this rule emits.** One U+2019 replacing one U+0027 at the same index. Nothing else, ever
— no insertion, no deletion, no length change.

**Against `I₁` (`spaces`) and `I₂` (`ellipsis`).** Discharged: no U+0020 and no `DOTLIKE` code
point is emitted, and every edit is 1:1, so nothing is brought into contact with anything.

**Against `I₃` (`dashes`).** Discharged: U+2019 is in none of `DASH`, `INERT-DASH`, `DIGIT`,
`SPACE` or `NOBREAK-SPACE`, and neither is U+0027, so a dash token adjacent to an edited
position sees no class change. Spacing is untouched.

**Against `I₄` (`hyphen`).** Discharged: neither U+0027 nor U+2019 is in `WORDISH`, so a listed
form's word boundaries read identically before and after.

**Against `I₅` (`quotes`).** The interesting one, and the argument below is spec 0.4.1's — the
version this section carried through spec 0.3.0–0.4.0 relied on `quotes` 0.1.0's Claim 3
("the second run's capabilities are a subset of the first's"), which `quotes.md` §0 and §5
**withdrew** when mandate 1 made every quote glyph a re-typesetting candidate: under mandate 1 a
converted mark is a candidate again on the next run, capabilities are not monotone, and no
subset argument is available at all. Citing a withdrawn claim here was itself a latent defect —
`I₅` was asserted on grounds that no longer existed, and it went unnoticed until `fast-check`
found a live counterexample in `de-CH` (`spec/fixtures/de-CH.json`,
`de-ch-quotes-041-cobug-apostrophe-v1`), because `quotes` in `STRAIGHT`/`OPENISH`
terms — the classes this section used to reason about — is not how U+0027 vs. U+2019 actually
matters to `quotes` (0.3.0+): every `QUOTEMARK` (both) is in both `OPENISH` and `CLOSEISH`
(`quotes.md` §3.1, Lemma A), so **no class test distinguishes them at all**; the one place they
were ever distinguishable is `quotes`' V1 same-code-point veto, which compares literal code
points, not classes.

`I₅` is now discharged by `quotes.md` §5's Corollary A1, not by this document: `apostrophe`
emits `E(apostrophe) = {U+2019}` — the only code point it ever writes for a U+0027 — and as of
`quotes` spec 0.4.1 that substitution is **inert** to every one of `quotes`' capability tests, V1
included. **`E(apostrophe) = {U+2019}` is not the claim that every U+0027 this rule sees gets
that treatment** — §3.3's case 1 (prime guard) and case 5 leave a U+0027 unedited, and §5 above
already relies on that fact for this rule's own idempotency argument. `quotes`' V1 handles this
by comparing `V1ID(c) = U+2019 if c = U+0027, else c` rather than the raw code point — a
*conservative* closure, not a claim about which U+0027s actually convert: `quotes` cannot know,
from its own pass, whether a given U+0027 will reach this rule's converting cases or its
non-converting ones without re-deriving this rule's verdict against `quotes`' own not-yet-final
output, which is circular. `V1ID` sidesteps that by treating every U+0027 as *possibly* about to
become U+2019 regardless of which case will actually apply — see `quotes.md` §3.2/§5 for the full
argument. **The cost this trades for is one-directional only at the single V1 comparison** (an
extra veto, never a granted capability there); it is not a claim that `quotes`' final output only
ever declines more — `quotes`' pass 2/pass 4 are global over the whole candidate list, so an extra
local veto can indirectly let a *different* pair certify, reassign a pairing, or change what
`nbsp` inserts downstream, exactly as the reported counterexample itself does. `quotes.md` §5's
"V1ID empirical audit" is the inspection this actually rests on. This document still owns half the
discharge — the emission itself (`E(apostrophe) = {U+2019}`, nothing else, established in §1
above) — but the *proof that the emission is inert* belongs entirely to `quotes.md`, because only
that document defines the capability tests being
discharged against. Restating it here in `quotes`' pre-0.4.1 terms is what went stale last time.

Note also that a U+0027 adjacent to another U+0027 is vetoed by `quotes` pass 1 and survives to
this rule, where case 5 leaves both alone — so the pair `''` is stable in both rules and
neither can perturb the other's view of it.

---

## 6. Worked examples

Locale-independent, **except rows 11/11a/11b** (see there): `␣` = U+0020, `⟶` = no change. Inputs
are shown as they arrive at this rule, i.e. after `quotes` has run.

| #   | Input                           | Output                  | Case | Why                                                                                                                                                                 |
| --- | ------------------------------- | ----------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `don't`                         | `don’t`                 | 2    | letters both sides                                                                                                                                                  |
| 2   | `l'été`                         | `l’été`                 | 2    | elision; also correct when `é` arrives decomposed as `e` + U+0301, because U+0301 is in `LETTER`                                                                    |
| 3   | `the dogs' bowls`               | `the dogs’ bowls`       | 3    | letter left, space right                                                                                                                                            |
| 4   | `Back in the '90s`              | `Back in the ’90s`      | 4    | space left, digit right → U+2019, **not** U+2018                                                                                                                    |
| 5   | `'Tis the season`               | `’Tis the season`       | 4    | start of text, letter right                                                                                                                                         |
| 6   | `He is 6' 2" tall.`             | ⟶                       | 1    | digit left, space right → prime guard                                                                                                                               |
| 7   | `6'2"`                          | ⟶                       | 1    | digit left, digit right → prime guard                                                                                                                               |
| 8   | `The 1990's were loud`          | `The 1990’s were loud`  | 2    | digit left but letter right, so case 1 does not fire                                                                                                                |
| 9   | `a ' b`                         | ⟶                       | 5    | nothing inferable                                                                                                                                                   |
| 10  | `“He said ’tis so,” she noted.` | ⟶                       | —    | the quotation was already resolved by `quotes` and this apostrophe was already U+2019 on a previous run; no U+0027 remains                                          |
| 11  | `rock 'n' roll` (any locale with an empty `quotes.elisionIdioms`, e.g. `en-GB`, `de-DE`, `fi`, `sv`) | ⟶ (unchanged, spec 0.5.0) | — | **as of spec 0.5.0, this rule does see both marks, and skips them.** `quotes`' general ambiguous-medial-span veto (`quotes.md` §3.2) now declines to pair them too (not only the cited-idiom shape), so both marks survive to this rule unedited — but they are in the §3.4 preserve set (no matching `elisionIdioms` entry), so this rule's scan skips both index positions entirely rather than applying cases 3/4 to them. **Before spec 0.5.0** this row instead asserted "this rule never sees these marks" and the output was `rock ”n” roll` in `fi`, `rock ‘n’ roll` in `en-GB` — `quotes` paired them as an ordinary quotation, which `quotes.md` §7 item 8 and `apostrophe.md` §7 item 1 (both closed 0.5.0) named as the open gap this row now documents as resolved |
| 11a | `rock 'n' roll` (`en-US`, `quotes.elisionIdioms = [{ left: "rock", elided: "n", right: "roll" }]`, spec 0.4.0) | `rock ’n’ roll` | 4, 3 | **unchanged by spec 0.5.0.** This position has a matching idiom, so it is *not* in the §3.4 preserve set: `quotes`' listed elision veto declines to pair the marks (unchanged since 0.4.0), and this rule's ordinary case ladder sees both — leading mark takes case 4 (space left, letter right), trailing mark takes case 3 (letter left, space right), independently. Two edits, no coordination between them: this rule still has no notion of "the two marks are a pair" |
| 11b | `The letter 'n' is common.` (`en-US`) | ⟶ | — | **`quotes`' idiom match does not fire here** (no `left`/`right` context matches "rock"/"roll"), but the general ambiguous-shape veto still does (`'n'` is 1 letter, space-flanked) — so, as of spec 0.5.0, this rule again skips the mark via the §3.4 preserve set, same as row 11. Before 0.5.0 the marks paired as an ordinary depth-1 quotation and never reached this rule at all; the observable output (no change) is identical either way, reached by a different mechanism. Recorded because this exact input was the false positive that made a first, context-free design (a bare `elisionForms` word list) unsafe — see `quotes.md` §6 row N1, §7 item 8 |
| 12  | `dogs''`                        | ⟶                       | 5, 5 | neither mark has the neighbour class any converting case requires                                                                                                   |
| 13  | `O'Brien's`                     | `O’Brien’s`             | 2, 2 | two independent medial marks                                                                                                                                        |
| 14  | `Ma'am, it's 5 o'clock`         | `Ma’am, it’s 5 o’clock` | 2 ×3 |                                                                                                                                                                     |

Cases 6, 7, 9, 10 and 12 are "no change" cases.

---

## 7. Open questions

1. **(Closed, spec 0.5.0.) `rock 'n' roll` outside `en-US` no longer silently becomes a
   quotation.** Through spec 0.4.1, `quotes` (order 40) classified the two marks as `canOpen`
   and `canClose` for any locale without a cited idiom and paired them at **depth 1**, taking the
   locale's primary glyphs: `rock ”n” roll` in `fi`, `rock ‘n’ roll` in `en-GB`. This rule could
   not fix it — by the time it ran, a mark `quotes` had paired was no longer U+0027 — and the
   schema-data gap this item originally recorded was that only `en-US` had a citable idiom
   (`quotes.md` §7 item 8 explains why: Chicago Manual of Style Online and the American Heritage
   Dictionary attest the spaced English idiom for `en-US`; `en-GB` carries a higher genuine-
   dialogue collision risk since its primary pair is itself the single quote; `fi`/`sv` write the
   loanword's dictionary headword closed up, `rock'n'roll`, not spaced, so a citation for the
   spaced form would be evidenced-inert; the rest were never researched for it).

   **Spec 0.5.0 closes the gap a different way: not by inventing a citation, but by no longer
   guessing at all.** `quotes.md` §3.2's general ambiguous-medial-span veto now declines to pair
   *any* ambiguous-shaped span, cited idiom or not; this rule's own §3.4 preserve set then keeps
   the uncited positions as literal U+0027 rather than letting its case ladder curl them
   independently. The observable result for `en-GB`/`fi`/`sv`/every other uncited locale is no
   longer a silently-wrong quotation — it is the original ASCII text, unchanged, a documented
   false negative rather than an undocumented false positive. `en-US`'s cited treatment is
   unaffected (`rock ’n’ roll`, apostrophe.md §6 row 11a); every other locale is row 11.
2. **Primes are left straight, not converted to U+2032 / U+2033.** `6'` stays `6'` rather
   than becoming `6′`. Converting it would be defensible, but prime detection has its own
   false-positive profile (a lone `'` after a digit is often just a typo for an apostrophe)
   and there is no `primes` rule in `order.json`. Out of scope; recorded so it is a decision
   rather than an omission.
3. **U+0060 (`) and U+00B4 (´) used as apostrophes.** Common in text typed on some keyboard
layouts and in text pasted from older systems. Converting them is not authorised by
`order.json` and, for U+00B4, is arguably destructive (it is a real spacing acute in some
   orthographies). Unresolved.
4. **Case 5 leaves an isolated `'` visible in the output.** That is deliberate (it is
   recoverable and honest, per `quotes` §3.6), but it means output text can still contain a
   straight mark. A fixture must assert that explicitly so nobody "fixes" it later.
5. **`Hawai'i`, `Qur'an`, transliterated Arabic and Hawaiian ʻokina.** Case 2 converts the
   U+0027 to U+2019. The linguistically correct character is often U+02BB (ʻ) or U+02BC (ʼ),
   not U+2019. Distinguishing them requires a word list, which is out of scope for v1 and
   which the schema cannot express. Known wrong-but-conventional behaviour; documented rather
   than hidden.
6. **`LETTER` includes combining marks**, which makes decomposed input behave like composed
   input. That is correct for this rule, and it is an assumption about the Unicode general
   category table. **The spec does pin a Unicode version: `spec/UNICODE` contains `17.0`.** An
   earlier revision of this item said no pin existed; it did not when the item was written, and
   the item was not revisited when the file appeared.

*(Closed.)* The pin now binds, and it binds to the right thing: `spec/UNICODE` is normative for
   the **derived tables**, not for the host runtime — a host-UCD requirement is unimplementable in
   PHP without `intl` and in Ruby at all, so it is not required. §3.1 of this document and the
   class tables of `dashes`, `hyphen`, `nbsp`, `quotes` and `symbols` all cite it now, which is
   what the file lacked. Detection is by canary fixture, specified in
   [pipeline-idempotency.md](pipeline-idempotency.md) §6a.2 — including the honest note that the
   version-drift canary must be **generated** from a UCD diff rather than hand-picked.
