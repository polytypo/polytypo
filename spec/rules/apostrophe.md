# Rule: `apostrophe`

**Order:** 50. **Default:** on. **Modes:** text, html, markdown, yaml.
**Spec version:** 1.5.0 (0.4.1 for everything except §2, §3.4 and the §6/§7 updates for the
withdrawal of the shared ambiguity preserve set (1.1.0), §3.1's `OPENQUOTE` with §3.3's case 3a
(1.2.0), §3.3 case 4's note on the traffic `quotes`' span-boundary elision veto sends it
(1.4.0) — which adds no case and changes nothing this rule computes — and §3.1's `CLOSEDELIM`
with §3.3's case 2a (1.5.0)).

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

**Spec 1.1.0 restores this rule to a pure two-neighbour decision.** Spec 0.5.0 had it skip a small
set of positions entirely, before reading their neighbours; that set is withdrawn — see §3.4 —
and every candidate is again decided from exactly two neighbouring code points (§3.3), with no
exception.

---

## 2. Locale data consumed

**None, as of spec 1.1.0.** `order.json` declares `"localeData": []` for this rule, as it did
before 0.5.0. §3.3's case ladder is structural, not lexical, and reads no locale data; §3.4's
preserve set — the only thing that ever did, reaching `quotes.elisionIdioms` indirectly through
the shared predicate — is withdrawn.

Spec 0.5.0 declared `"localeData": ["quotes"]` here because its preserve set had to tell an
idiom-authorized position (left alone by `quotes`, but meant to be curled by this rule) apart from
an ambiguous-but-uncited one (left alone by `quotes`, and meant to be left alone here too).
Spec 1.1.0 removes that distinction at the source: `quotes` now vetoes both kinds of position for
the same reason and with the same intent — that this rule convert them — so there is nothing left
for this rule to look up.

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
| `OPENQUOTE` | U+00AB `«` U+2018 U+201A U+201B U+201C U+201E U+201F U+2039 `‹` — the quotation glyphs of `OPENISH`, without its brackets and dashes (spec 1.2.0, case 3a) |
| `CLOSEDELIM` | U+0029 `)` U+005D `]` U+007D `}` U+00BB `»` U+2019 U+201D U+203A `›` — the bracket and quotation members of `CLOSEISH`, without its sentence punctuation and without the dashes `OPENISH` already carries (spec 1.5.0, case 2a) |
| `NONE`      | index out of range                                                                                                                                    |

**Unicode version.** The general categories this rule reads are those of the UCD version pinned in `spec/UNICODE` (`17.0`). The pin is normative for the **derived tables**, not for the host runtime — see [pipeline-idempotency.md](pipeline-idempotency.md) §6a, which also specifies the canary fixtures that make it detectable.

Note that U+2019 is a member of `CLOSEISH` and of `CLOSEDELIM`, and that U+0027 is a member of
no class in this table at all. This matters for idempotency and is argued in §5. U+2011 is listed alongside U+002D because `hyphen` (order 35)
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
2a. **Suffix or possessive after a closing delimiter (spec 1.5.0).** If `left` is in
   `CLOSEDELIM` **and** `right` is in `ALNUM` → emit an edit replacing `cp[i]` with U+2019.
   Covers `(order 90)'s own output`, `“Hamlet”'s first line`, `the footnote [3]'s author`,
   `{user}'s account`.

   **This closes an asymmetry between the two sides of the ladder, not a gap in a language.**
   The **right** side has accepted a closing delimiter since 0.4.1 — case 3 takes every member of
   `CLOSEISH`, so `dogs')` and `dogs'”` convert — while the **left** side accepted only `ALNUM`
   (cases 1, 2, 3, 3a) and `NONE`/`SPACELIKE`/`OPENISH` (case 4). Nothing chose that: it made a
   possessive's verdict depend on which of two tables a closing glyph happens to sit in. U+00AB
   and U+2039 are `OPENISH` members, so `»Wort«'s` already converted through case 4, while
   `‹Wort›'s` and `«Wort»'s` — the same shape with the other guillemet — did not. Case 2a accepts
   on the left exactly the closing counterparts the right side already accepts, and the three
   forms now agree.

   **`CLOSEISH`'s sentence punctuation is excluded.** U+002C U+002E U+003B U+003A U+0021 U+003F
   U+2026 are **not** in `CLOSEDELIM`. A U+0027 after one of them is at least as likely to be an
   opening quotation mark `quotes` could not pair — `He said,'yes'`, where `canOpen`'s right-test
   rejects the `CLOSEISH` left neighbour — as a possessive, and this rule cannot tell which. The
   English shapes that would have argued for U+002E are the ones Chicago's own orthography
   removes: `CMOS` 10.4(c) writes `US` and `PhD`, not `U.S.'s` and `Ph.D.'s`, so the sequence
   U+002E U+0027 U+0073 does not arise in that orthography. Excluded on that evidence, with the
   shape recorded at §6 row 23 so it stays visible.

   **Every symbol is excluded too, for a stronger reason: nothing attests one.** `%`, `°`,
   U+2030 and the superscript digits are not in `CLOSEDELIM`. §7 item 8 records the measurement.

   **The accepted cost is §7 item 9**, and it is the mirror of the trade case 3a accepts: a mark
   in this position is either a possessive or an *opening* quotation mark `quotes` could not pair,
   and two neighbours cannot tell them apart.

   **What this case does not claim.** It decides the identity of a mark the author has already
   typed; it does not endorse the construction. `CMOS`'s reachable statement on the possessive of
   a quoted title answers this exact shape by steering to an attributive rephrasing — *the "Wild
   Horses" bass line* — and endorses none of the possessive forms it was offered (Q&A,
   "Quotations and Dialogue" #12). That is advice about what to write, not a claim about what the
   mark is: nothing consulted reads a U+0027 in this position as anything other than an
   apostrophe, and this rule has no licence to rephrase anyone's sentence. §7 item 10 records the
   one place where following the same authority further would mean *inserting*, which this rule
   cannot do.

   **`MARKER` is not in `CLOSEDELIM`** (`modes.md` §3.3) and does not need to be: the marker is
   in `OPENISH`, so a possessive written flush against an inline span already reaches case 4 and
   emits the same U+2019 (case 4's note). `modes.md` needs no new row for this case — only the
   `no` entry recording that the marker stays out of it.

   **`(`, `[` and `{` stay out of every right-hand test**, so `f'(x)` is still a prime — case 5,
   for the reason case 3a's bracket exclusion gives. Case 2a reads the *closing* brackets on the
   **left**, where a bracket closes a group rather than opening one.
3. **Trailing elision or possessive.** If `left` is in `LETTER` **and**
   (`right` is `NONE`, or `right` is in `SPACELIKE`, or `right` is in `CLOSEISH`) → emit an
   edit replacing `cp[i]` with U+2019. Covers `the dogs' bowls`, `les élèves' cahiers`,
   `Jesus'`, `rock 'n'` (the trailing mark).
3a. **Elision before a quotation (spec 1.2.0).** If `left` is in `LETTER` **and** `right` is in
   `OPENQUOTE` → emit an edit replacing `cp[i]` with U+2019. Covers `d'« urine »`, `l'“idea”`,
   `dell'‘arte’`, `qu'« il »`. French and Italian put an elided article or conjunction directly
   against a quotation all the time, and until 1.2.0 no case matched it: case 2 needs `ALNUM` on
   the right, case 3 needs `CLOSEISH`, and an opening quotation glyph is `OPENISH` only. A
   straight `"` is in none of this rule's classes, so no case matched it either. By the time the
   mark reaches this rule, `quotes` (order 40) has usually turned `l'"idée"` into `l'«idée»`, so
   the mark arrives beside `«`. This case does not add U+0022 to any class.

   **This case reads no locale data.** `OPENQUOTE` is a fixed set, like `OPENISH`, and §2 still
   holds. The same set covers the locales in which one of these glyphs closes a quotation.
   `de-DE` closes `„…“` with U+201C, so `„Hans'“` is a trailing possessive before a closing
   quote. Case 3 misses it because U+201C is not in `CLOSEISH`, and case 3a gives the U+2019 that
   case 3 would have given. `fi` and `sv` close with U+201D, which is in `CLOSEISH`, so case 3
   already covered them.

   **Brackets and dashes are excluded on purpose.** `f'(x)` is a prime on a function name and
   must stay as typed, and a letter followed by U+0027 and a dash is already case 3.
4. **Leading elision.** If (`left` is `NONE`, or `left` is in `SPACELIKE`, or `left` is in
   `OPENISH`) **and** (`right` is in `ALNUM`) → emit an edit replacing `cp[i]` with U+2019.
   Covers `’90s`, `’tis`, `’em`, `’cause`, `’n'` (the leading mark), `(’tis)`.

   **It also carries a traffic its name does not describe (spec 1.4.0): a possessive or elision
   written flush against an inline span boundary.** `modes.md` §3.2's marker is in this rule's
   `OPENISH` (`modes.md` §3.3), so `` `x`'s `` and `<code>x</code>'s` match here rather than at
   case 2, whose `ALNUM` left-read the marker fails. The glyph is the same U+2019 either way, so
   the outcome is correct and no case is added — but the reason those marks now *reach* this
   ladder is `quotes`' span-boundary elision veto (`quotes.md` §3.2, spec 1.4.0), which declines
   to pair them. Before 1.4.0 `quotes` claimed them and inverted the enclosing pair. The mirror
   shape, `l'<em>idée</em>`, reaches **case 3** by the same route: the marker is in `CLOSEISH`
   too. Neither case may be narrowed to exclude the marker without reopening that defect.
   **The replacement is U+2019 — never U+2018.** A leading elision is a raised comma marking
   removed characters, not an opening quotation mark. Getting this backwards is the single
   most common apostrophe bug in existing tools, and it is visually obvious in a serif face.
5. **Otherwise** → emit nothing. This is a U+0027 that is isolated (`a ' b`), doubled (`''`),
   or adjacent to punctuation on both sides. Nothing can be inferred; leave it.

The cases are mutually exclusive after the first-match rule and every one of them is decided
from exactly two neighbouring code points. There is no lookahead beyond one position and no
state carried between candidates.

### 3.4 The shared ambiguity preserve-set — withdrawn (spec 1.1.0)

**This rule computes no preserve set and skips no position.** `computePreserveIndices` is
withdrawn along with the veto shape that motivated it. Every U+0027 that `quotes` (order 40)
declines to claim reaches §3.3's case ladder and is decided there, from its two neighbours, with
no prior filtering — the state of affairs before spec 0.5.0, restored.

Spec 0.5.0 had `quotes` decline to pair two straight ASCII marks in an ambiguous medial shape —
`rock 'n' roll`, `She chose 'A' today` — for every locale without a cited `quotes.elisionIdioms`
match, *and* preserve them from this rule. The second half was necessary because this rule's
ladder would otherwise convert them: the leading mark of `rock 'n' roll` has `SPACELIKE` on its
left and `LETTER` on its right, matching case 4 (leading elision); the trailing mark has `LETTER`
on its left and `SPACELIKE` on its right, matching case 3 (trailing elision/possessive). Applied
independently — this rule has no notion that the two marks are a pair, by design (§1) — both
convert to U+2019, giving `rock ’n’ roll`. Under 0.5.0 that was a defect to be prevented: it
undid, one rule later and through a different code path, a decision `quotes` had deliberately
made not to guess.

**Spec 1.1.0 makes that same conversion the specified outcome**, so the mechanism that prevented
it has nothing left to prevent. `quotes`' universal medial-`n` veto (`quotes.md` §3.2) declines
the pairing precisely so that this rule's cases 4 and 3 will convert both marks, in every locale —
exactly what the cited `en-US` idiom already did in spec 0.4.0, now generalised. The shape
predicate (`src/rules/quote-ambiguity.ts`) is now `quotes`' alone; this rule needs no knowledge of
the veto whatsoever, which is why §2 is back to reading no locale data.

**A port must not reintroduce a skip here.** A position `quotes` vetoed is not a position this
rule may leave alone: leaving it alone is what produces an unconverted `rock 'n' roll`, and the
conformance fixtures for all ten locales assert the converted form.

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
  U+0027 is in no class this rule tests (§3.1), so neither mark has, on the side facing the
  other, anything a converting case accepts; case 5 applies to both.
- **[P] U+0060 (`), U+00B4 (´), U+02BC (ʼ), U+02B9, U+2032 (′).** None is in `SQ`. In particular
U+02BC is a *letter* in several orthographies and converting it would be a data mutation.
Converting U+0060 or U+00B4 is a separate normalisation concern that `order.json` does not
  authorise.
- **[P] U+0027 inside a skipped region** — attribute values, code spans, fenced code, URLs.
  Removed by the mode adapter (L2). This rule has no code-awareness and must not acquire any:
  `it's` in prose and `'string'` in a Python snippet are indistinguishable to it.
- **[R] Spacing.** The rule inserts and deletes nothing. _`nbsp` (R₈) changes spacing._
- **[R] A mark already curled by someone else.** This rule emits U+2019 only in place of U+0027
  (§1), so a medial span typed with real single quotation marks — `rock ’n’ roll`, `rock ‘n’
  roll` — passes through untouched even though `quotes` (R₅) vetoed its pairing (`quotes.md`
  §3.2). That is what makes the converted form a fixed point on the second pipeline pass.

  Spec 0.5.0 listed an additional **[P]** guarantee here — an ambiguous medial span with no cited
  idiom (`rock 'n' roll` outside `en-US`, `She chose 'A' today`, `They said 'no' yesterday`) stayed
  literal U+0027 forever via §3.4's preserve set. **Withdrawn in 1.1.0**: `She chose 'A' today` is
  now an ordinary quotation resolved by `quotes`, and `rock 'n' roll` is converted here, in every
  locale.

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

- U+0027 is in **none** of `ALNUM`, `SPACELIKE`, `OPENISH`, `CLOSEISH`, `OPENQUOTE`,
  `CLOSEDELIM`, `DIGIT`, `LETTER`.
- U+2019 is in `CLOSEISH` and `CLOSEDELIM`, and in none of the others.

Neither code point is in `OPENQUOTE`, so a neighbour's edit cannot change case 3a's right-test.
The argument below needs no new branch for it.

So a neighbour changing from U+0027 to U+2019 can only _add_ `CLOSEISH` and `CLOSEDELIM`
membership. Those two classes appear in exactly two places in the decision: `CLOSEISH` in case
3's right-test, and `CLOSEDELIM` in case 2a's left-test (spec 1.5.0). So there are two possible
flips, one on each side, and **both are vacuous, by the same argument mirrored**.

The right-hand flip would be: a candidate `u` whose right neighbour was U+0027 (giving no case-3
match) and is now U+2019 (giving a case-3 match), where additionally `u`'s left neighbour is a
`LETTER`.

Concretely that shape is `LETTER` U+0027 U+0027 — for example `dogs''`. On run 1: the first
mark has `left` = `s` (letter), `right` = U+0027, which is in none of `NONE`/`SPACELIKE`/
`CLOSEISH`, so case 3 does not fire, cases 1, 2, 3a and 4 do not fire, and it falls to case 5.
The second mark has `left` = U+0027 (not `ALNUM`, not `LETTER`, not `SPACELIKE`, not
`OPENISH`) so no case fires; case 5. **Neither is edited on run 1**, so no U+2019 appears and
the flip cannot occur. The premise is vacuous.

More generally: the flip requires the _right_ neighbour to have been edited, i.e. the right
neighbour was a U+0027 that matched one of cases 2, 2a, 3, 3a, 4. Cases 2 and 4 require `ALNUM`
on that mark's **left** — but its left is `u`, which is U+0027, not `ALNUM`. Cases 3 and 3a
require `LETTER` on its left, and case 2a requires `CLOSEDELIM` — the same contradiction three
more times. So the right neighbour of a surviving U+0027 is never edited, and no surviving
candidate's classification changes.

**The left-hand flip (case 2a) is vacuous for the mirrored reason.** It would require a surviving
candidate `u` whose _left_ neighbour was U+0027 and is now U+2019, with `ALNUM` on `u`'s right.
So the left neighbour must have been edited — and its own right neighbour is `u`, a U+0027.
Cases 2, 2a and 4 require `ALNUM` on the right (U+0027 is not), case 3 requires `NONE`,
`SPACELIKE` or `CLOSEISH` (U+0027 is in none of them), and case 3a requires `OPENQUOTE` (U+0027
is not). So the left neighbour of a surviving U+0027 is never edited either. Concretely `x''s`,
the shape the flip would need: on run 1 the first mark's `right` is U+0027 and the second mark's
`left` is U+0027, so neither converts, no U+2019 appears between them, and the premise is again
vacuous.

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
— no insertion, no deletion, no length change. Case 3a (spec 1.2.0) and case 2a (spec 1.5.0)
change *which* U+0027 marks are replaced, and do not change what is emitted. Every discharge below is written against the
emission, and `quotes`' V1 already treats every U+0027 as a possible U+2019 (`V1ID`, below), so
none of them needs re-deriving.

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
| 11  | `rock 'n' roll` (any locale with an empty `quotes.elisionIdioms`, e.g. `en-GB`, `de-DE`, `fi`, `sv`) | `rock ’n’ roll` | 4, 3 | **as of spec 1.1.0 this rule sees both marks and converts them, in every locale.** `quotes`' universal medial-`n` veto (`quotes.md` §3.2) declines the pairing for exactly that purpose, and this rule's ordinary ladder does the rest — identical to row 11a, which is the point: the cited-idiom path and the universal path now reach the same output by the same two case decisions. **In spec 0.5.0** this row asserted no change at all, because the marks were in §3.4's preserve set; that set is withdrawn. **Before 0.5.0** the marks never reached this rule — `quotes` paired them as an ordinary quotation, giving `rock ”n” roll` in `fi` and `rock ‘n’ roll` in `en-GB`, the gap `quotes.md` §7 item 8 named |
| 11a | `rock 'n' roll` (`en-US`, `quotes.elisionIdioms = [{ left: "rock", elided: "n", right: "roll" }]`, spec 0.4.0) | `rock ’n’ roll` | 4, 3 | **unchanged by either 0.5.0 or 1.1.0** — the one row whose behaviour has been constant since 0.4.0, and the model the other nine locales were brought into line with. `quotes`' listed elision veto declines to pair the marks, and this rule's ordinary case ladder sees both — leading mark takes case 4 (space left, letter right), trailing mark takes case 3 (letter left, space right), independently. Two edits, no coordination between them: this rule still has no notion of "the two marks are a pair" |
| 11b | `The letter 'n' is common.` (`en-US`) | `The letter ’n’ is common.` | 4, 3 | **`quotes`' idiom match does not fire here** (no `left`/`right` context matches "rock"/"roll"), but the universal medial-`n` veto does, so both marks reach this rule and both convert. **This is spec 1.1.0's accepted false positive**, stated in full at `quotes.md` §3.2 and pinned at `quotes.md` §6 row N1: a genuine quotation of the letter *n* comes out as an elision. It is the exact input that made a first, context-free design (a bare `elisionForms` word list) unsafe in 0.4.0; 1.1.0 accepts the cost deliberately, against a measured alternative, rather than by overlooking it — `quotes.md` §7 item 8 records the comparison |
| 12  | `dogs''`                        | ⟶                       | 5, 5 | neither mark has the neighbour class any converting case requires                                                                                                   |
| 13  | `O'Brien's`                     | `O’Brien’s`             | 2, 2 | two independent medial marks                                                                                                                                        |
| 14  | `Ma'am, it's 5 o'clock`         | `Ma’am, it’s 5 o’clock` | 2 ×3 |                                                                                                                                                                     |
| 15  | `d'«urine»`                     | `d’«urine»`             | 3a   | letter left, opening quotation glyph right. **Spec 1.2.0**; previously case 5 left it straight                                                                    |
| 16  | `l'“idea”`                      | `l’“idea”`              | 3a   | same, with U+201C                                                                                                                                                 |
| 17  | `„Hans'“`                       | `„Hans’“`               | 3a   | U+201C closes in `de-DE`, and 3a does not need to know that: a letter followed by U+0027 and a quotation glyph is an elision or a possessive either way                |
| 18  | `f'(x) = 2`                     | ⟶                       | 5    | `(` is not in `OPENQUOTE`. A prime on a function name is not an apostrophe                                                                                        |
| 19  | `The pipeline (order 90)'s own output` | `The pipeline (order 90)’s own output` | 2a   | closing bracket left, letter right. **Spec 1.5.0**; previously case 5 left it straight                                                                       |
| 20  | `“Hamlet”'s first line`         | `“Hamlet”’s first line` | 2a   | U+201D left — `en-US`'s own closing glyph. The rule decides what the author typed, not whether they should have: a U+0027 here is a possessive or an unpaired opening mark (§7 item 9), and never a prime. `CMOS` would rephrase the sentence instead — see case 2a and §7 item 10                                       |
| 21  | `»Wort«'s, ‹Wort›'s and «Wort»'s` | `»Wort«’s, ‹Wort›’s and «Wort»’s` | 4, 2a, 2a | **the asymmetry case 2a removes.** The first form already converted before 1.5.0, because U+00AB is an `OPENISH` member and case 4 reads `OPENISH` on the left; the other two stayed straight because U+203A and U+00BB are in `CLOSEISH`, which no left-hand test read. Same shape, same reading, three glyphs — now one verdict |
| 22  | `{user}'s account`              | `{user}’s account`      | 2a   | a template placeholder closes a group the way any bracket does. U+007D is in `CLOSEDELIM`                                                                       |
| 23  | `He said,'yes' and left.`       | `He said,'yes’ and left.` | 5, 3 | **U+002C is deliberately not in `CLOSEDELIM`.** `quotes` declined the pairing (`canOpen`'s right-test rejects a `CLOSEISH` left neighbour), and this rule cannot tell an opening quotation mark after a comma from a possessive, so the leading mark is left recoverable as U+0027 (§7 item 4). The trailing mark is case 3, exactly as before 1.5.0 — the row is unchanged by 1.5.0 and is here to pin that                                       |
| 24  | `10%'u 24m²'ye 50°'lik`         | ⟶                       | 5    | no symbol is in `CLOSEDELIM` — not `%`, not U+00B0, not a superscript digit. §7 item 8                                                                        |

| 25  | `(aside)'quoted' here`          | `(aside)’quoted’ here`  | 2a, 3 | **the accepted cost, §7 item 9.** The author meant a quotation, and both marks now read as closing glyphs. It was already mismatched before 1.5.0 in the other direction — 1.4.0 gave `(aside)'quoted’ here`, case 3 having curled the trailing mark while the leading one had no case at all                                        |

Cases 6, 7, 9, 10, 12, 18 and 24 are "no change" cases.

---

## 7. Open questions

1. **(Closed twice — spec 0.5.0, then differently in spec 1.1.0.) `rock 'n' roll` outside `en-US`
   no longer silently becomes a quotation.** Through spec 0.4.1, `quotes` (order 40) classified the
   two marks as `canOpen`
   and `canClose` for any locale without a cited idiom and paired them at **depth 1**, taking the
   locale's primary glyphs: `rock ”n” roll` in `fi`, `rock ‘n’ roll` in `en-GB`. This rule could
   not fix it — by the time it ran, a mark `quotes` had paired was no longer U+0027 — and the
   schema-data gap this item originally recorded was that only `en-US` had a citable idiom
   (`quotes.md` §7 item 8 explains why: Chicago Manual of Style Online and the American Heritage
   Dictionary attest the spaced English idiom for `en-US`; `en-GB` carries a higher genuine-
   dialogue collision risk since its primary pair is itself the single quote; `fi`/`sv` write the
   loanword's dictionary headword closed up, `rock'n'roll`, not spaced, so a citation for the
   spaced form would be evidenced-inert; the rest were never researched for it).

   **Spec 0.5.0 closed the gap by no longer guessing at all**: `quotes.md` §3.2's general
   ambiguous-medial-span veto declined to pair *any* ambiguous-shaped span, cited or not, and this
   rule's §3.4 preserve set kept the uncited positions as literal U+0027. The result for
   `en-GB`/`fi`/`sv` and every other uncited locale was the original ASCII text, unchanged — a
   documented false negative in place of an undocumented false positive.

   **Spec 1.1.0 closes it a third way, and this one is a decision rather than an abstention.** The
   operator ruled on 2026-09-09 that `rock 'n' roll` and `rock'n'roll` are international and take
   U+2019 everywhere, so the veto no longer needs a per-locale citation to justify converting:
   `quotes.md` §3.2's universal medial-`n` veto declines the pairing in all ten locales precisely
   so this rule's cases 4 and 3 will convert both marks. Every locale now behaves as `en-US` did
   from 0.4.0 — row 11 and row 11a have the same output and the same case numbers — and 0.5.0's
   preserve set is withdrawn (§3.4). The evidentiary notes above still govern `elisionIdioms`,
   which is unchanged; they no longer govern this shape.
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
7. **(Spec 1.2.0.) Case 3a can curl an unpaired closing single quote.** When a U+0027 with a
   letter on its left and a quotation glyph on its right reaches this rule, `quotes` has already
   declined to pair it. `quotes` pairs every mark it can. So a mark in that position is either an
   elision or an unmatched quotation mark, and this rule cannot tell which. Case 3 has always
   accepted the same trade: it curls an unmatched closing quote before a space. Case 3a extends it
   to a quotation glyph. The issue that motivated it (French and Italian elision before `«` and
   `“`) is common, and the counter-case is a malformed quotation.
8. **(Spec 1.5.0.) A U+0027 after a symbol — `%`, U+00B0, U+2030, a superscript digit — is left
   straight, and that is a decision rather than an omission.** Issue #28 asked for the left-hand
   class to be widened to these on the strength of a production report of Turkish text
   (`24 m²'ye`, `10%'u`, `{price}'den`) run through `en-GB`. The `{price}'den` half is now case 2a;
   the symbol half is declined, on three findings:

   - **The Turkish premise does not hold.** TDK, *Yazım Kuralları*, "Kesme İşareti", attests the
     apostrophe for suffixes after abbreviations (rule 3: `TBMM'nin`, `TDK'nin`, `BM'de`, `ABD'de`,
     `TV'ye`) and after numerals (rule 4: `1985'te`, `8'inci madde`, `7,65'lik`, `657'yle`). None
     of its seven rules mentions the percent sign or a unit symbol, and every attested example has
     `ALNUM` on the left of the mark, so **case 2 already converts all of them**. Turkish also
     writes the percent sign *before* the number — `%50'si` — which puts a digit, not `%`, on the
     mark's left. `10%'u` is not Turkish notation.
   - **No English authority attests the shape either.** `CMOS` Q&A "Possessives and Attributives"
     #41 (citing `CMOS` 7.17) and "Plurals" #8 (citing 7.15) put the apostrophe after a letter in
     every example — `CBS's`, `HHS's`, `PDFs'` — and `CMOS` Q&A "Abbreviations" #112 advises
     spelling units of measurement out in non-technical prose rather than possessivising the
     symbol. `New Hart's Rules`, the AP Stylebook and Merriam-Webster were not reachable and are
     recorded as unknown rather than as silence.
   - **Measured: the shape has no witness.** Adding `%`, U+00B0, U+2030 and U+2070–U+2079 to
     `CLOSEDELIM` changes nothing over this repository's own English prose — every `.md` file, in
     `markdown` mode, `en-GB` — while case 2a as specified changes exactly four spans there, all
     of them genuine possessives after a closing parenthesis.

   Recorded so that a later report of the same shape is met with this evidence rather than with a
   second design pass. What would reopen it: a normative citation that the mark is an apostrophe
   after a symbol in some language, which is then a locale question in the sense of PLAN §6.2,
   not a class-table preference.
9. **(Spec 1.5.0.) Case 2a can curl an unpaired *opening* single quote — the mirror of item 7, and
   the more visible of the two.** `(aside)'quoted' here` becomes `(aside)’quoted’ here`: the
   author meant a quotation, and both marks now read as closing glyphs. The reasoning is item 7's,
   one class along. `quotes` has already declined the mark — `canOpen`'s right-test rejects a
   `CLOSEISH` left neighbour, so a quotation opening flush after `)` or `”` is exactly the shape
   `quotes` cannot pair — and two neighbours cannot separate that from a possessive.

   **It is a change in which half is wrong, not a new wrong.** Measured against the published
   1.4.0 package: that input already came out mismatched, as `(aside)'quoted’ here`. Case 3 curled
   the trailing mark, because a letter on the left and a space on the right is a trailing
   possessive by every test this rule has; the leading mark matched no case and stayed straight.
   So 1.4.0 produced one curled and one straight mark, and 1.5.0 produces two curled ones. Neither
   is the quotation the author wrote.

   **This is not the U+2018 bug case 4 warns about.** The rule still never emits U+2018 anywhere
   (§5). What is lost here is a genuine *opening* quotation mark, in the one position `quotes`
   declines to claim it — not a leading elision rendered backwards.

   The trade is accepted for the reason cases 3, 3a and 2a all accept theirs: the possessive is
   ordinary and frequent, the counter-case is a quotation that `quotes` could not resolve, and
   recoverability is one character. Pinned at §6 row 25 and as a conformance fixture, so no port
   can narrow or widen it without the suite noticing.
10. **(Spec 1.5.0.) Case 2a can produce two contiguous U+2019, and nothing in the pipeline
    separates them.** In `en-GB`, whose primary pair closes with U+2019, `A ‘quoted’'s meaning`
    gives `A ‘quoted’’s meaning`: the closing quotation mark and the possessive end up flush, and
    at text size the pair reads as one double quote.

    **The authority names both the remedy and the character.** `CMOS`'s own editors describe the
    fix as adding a space between the contiguous marks, and enumerate it by code point — U+00A0,
    or a thin space U+2009 or hair space U+200A in print, or U+202F, which *CMOS* Online itself
    now sets between a quotation mark and an apostrophe (18th ed. §6.11, as described in *CMOS
    Shop Talk*, "When Quotation Marks and Apostrophes Collide", updated
    2025-12-16).

    **polytypo emits the right character and inserts nothing.** This rule *cannot* insert: §1 and
    §4 make every edit one code point replacing one code point at the same index, and that is
    load-bearing for §5's idempotency argument, not an accident. Insertion is `nbsp`'s work
    (order 70), and `nbsp` has no sub-rule for two adjacent quotation marks. So the spacing
    between them is unaddressed by every rule in `order.json` — recorded here as a decision
    rather than left as an omission, in the standing of items 2 and 3.

    **A future `nbsp` sub-rule would need its own citation, not this one.** The attested passage
    is one mark-order away from the shape case 2a produces: it separates a title's *own* trailing
    apostrophe from a following closing quotation mark — its example is the song title *Ain't
    Misbehavin'* set in single quotation marks, so the two marks there are the title's own
    apostrophe and then the closing quote, apostrophe first. The possessive ordering — closing mark, then apostrophe, then `s` —
    is addressed by nothing retrieved, and `CMOS` §7.29 ("Possessive with italicized or quoted
    terms"), the paragraph that governs it, is behind a subscription and unread. Borrowing the
    citation across that difference is exactly the move this project settles by evidence instead.
