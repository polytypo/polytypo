# Rule: `symbols`

**Order:** 60. **Default:** on. **Modes:** text, html, markdown.
**Spec version:** 0.1.0.

---

## 1. Purpose

`symbols` performs two narrow, unrelated substitutions that share only their risk profile:
the ASCII stand-ins `(c)`, `(r)` and `(tm)` become U+00A9 (©), U+00AE (®) and U+2122 (™); and
the letter `x` standing between two numbers becomes U+00D7 (×), the multiplication sign. Both
are the sort of thing that looks trivial and then eats a codebase: `(c)` appears in function
calls and in Markdown footnote-ish constructs, and `x` appears in `0x1F`, in variable names,
in `1080x` shorthand and in the middle of every third English word. The rule is therefore
built out of literal-string matching plus hard adjacency guards, with no case folding
anywhere — the accepted spellings are enumerated explicitly, because
ARCHITECTURE.md §4.4 forbids `toLowerCase()` semantics that vary by host locale (Turkish
dotless ı would otherwise make `(TM)` behave differently in a Turkish process).

---

## 2. Locale data consumed

**None.** `order.json` declares `"localeData": []`. `©`, `®`, `™` and `×` are the same code
points in every locale polytypo supports, and the spacing around `×` is `nbsp`'s decision,
not this rule's.

---

## 3. Algorithm

Input is a code-point array `cp[0 … n-1]`. The rule performs one left-to-right scan; at each
index it tries the trademark table first, then the multiplication case.

### 3.1 Character classes and tables

| Class           | Members                                                         |
| --------------- | --------------------------------------------------------------- |
| `DIGIT`         | U+0030–U+0039 only. **ASCII digits only** — see §7.1            |
| `LETTER`        | general category `Lu`, `Ll`, `Lt`, `Lm`, `Lo`, `Mn`, `Mc`, `Me` |
| `ALNUM`         | `LETTER` ∪ `DIGIT`                                              |
| `SPACE`         | U+0020 only                                                     |
| `NOBREAK-SPACE` | U+00A0, U+202F                                                  |
| `BREAK`         | U+000A, U+000D, U+000B, U+000C, U+0085, U+2028, U+2029          |

**Trademark table.** Exhaustive and case-explicit; nothing else matches.

| Literal (code points)                | Replacement |
| ------------------------------------ | ----------- |
| `(c)` = U+0028 U+0063 U+0029         | U+00A9 (©)  |
| `(C)` = U+0028 U+0043 U+0029         | U+00A9 (©)  |
| `(r)` = U+0028 U+0072 U+0029         | U+00AE (®)  |
| `(R)` = U+0028 U+0052 U+0029         | U+00AE (®)  |
| `(tm)` = U+0028 U+0074 U+006D U+0029 | U+2122 (™)  |
| `(TM)` = U+0028 U+0054 U+004D U+0029 | U+2122 (™)  |
| `(Tm)` = U+0028 U+0054 U+006D U+0029 | U+2122 (™)  |
| `(tM)` = U+0028 U+0074 U+004D U+0029 | U+2122 (™)  |

Comparison is code-point equality. No normalisation, no folding, no locale.

**Unicode version.** The general categories and case mappings this rule reads are those of the UCD version pinned in `spec/UNICODE` (`17.0`). The pin is normative for the **derived tables**, not for the host runtime — see [pipeline-idempotency.md](pipeline-idempotency.md) §6a, which also specifies the canary fixtures that make the pin detectable.

**Multiplication letters — `MUL-LETTER`.** Exactly four code points, enumerated, not
case-folded and not derived from any locale field:

| Code point | Glyph |                         |
| ---------- | ----- | ----------------------- |
| U+0078     | `x`   | Latin small x           |
| U+0058     | `X`   | Latin capital X         |
| U+0445     | `х`   | **Cyrillic** small ha   |
| U+0425     | `Х`   | **Cyrillic** capital Ha |

**The Cyrillic pair is in this set unconditionally, and this rule reads no locale data.** That
is the right call rather than a convenient one: the risk is carried entirely by the _numeric
context_, not by the language. U+0445 standing between two ASCII digits is either a Russian
dimension typed on a Cyrillic layout (`Размер 5х4 см`) or keyboard-layout debris — there is no
third reading — and the sequence does not occur in German, Finnish or English text at all, so
gating it on locale would buy no safety and would add a `localeData` dependency that
`order.json` deliberately does not give this rule.

**Why this substitution in particular must be done by algorithm.** `5х4` and `5x4` are
**visually identical in every font**. This is the one conversion in the whole rule set that is
_invisible in a diff_, so the author cannot catch it by eye at the M4 dogfooding gate
(PLAN.md §8) — the review that is the ship criterion for everything else does not work here. A
human proof-reader will never find it; a machine finds it every time. That asymmetry is the
argument for doing it at all.

### 3.2 Trademark substitution

At index `i`, if `cp[i]` is U+0028 `(`:

1. Try each row of the trademark table in order of decreasing literal length (the 4-code-point
   rows before the 3-code-point rows), comparing code point by code point against
   `cp[i … i+len-1]`. If none matches, this branch does nothing.
2. Let `m` be the matched span `[i, i+len)`. Compute
   - `before = cp[i-1]` if `i > 0`, else `NONE`;
   - `after = cp[i+len]` if `i+len < n`, else `NONE`.
3. **Guard S1 — left adjacency. Applies to the `(c)` and `(r)` rows only.** If the matched
   row is `(c)`, `(C)`, `(r)` or `(R)`, and `before` is in `ALNUM`, or is U+0029 `)`, or is
   U+005D `]`, or is one of U+00A9 (©), U+00AE (®), U+2122 (™), emit nothing. This rejects
   `f(c)`, `a[i](c)`, `foo(c)` — anything that looks like a call or an index.
   **The `(tm)` rows are exempt from S1**: `Acme(tm)` with no space is how the trademark sign
   is actually typed, and `(tm)` is not a plausible argument list — a single-letter argument
   `c` or `r` is common, a two-letter argument spelled exactly `tm` immediately after an
   identifier is not. This is the operator-accepted resolution of what was §7.2 option (b).
   The three replacement code points are in the list for an idempotency reason argued in §5;
   without them `(c)(r)` needs two runs to converge.
4. **Guard S2 — right adjacency.** If `after` is in `ALNUM`, emit nothing. This rejects
   `(r)evolution`, `(c)ompiler`, `(tm)odel` — the "optional first letter" idiom.
5. **Guard S3 — no nesting.** If `before` is U+0028 `(`, emit nothing. `((c))` is almost
   always deliberate ASCII art or code.
6. Otherwise emit one edit replacing `cp[i … i+len-1]` with the single replacement code
   point. Advance `i` past the matched span.

### 3.3 Multiplication sign — the chain

The branch is specified as a scan of a **whole chain**, `DIGIT+ (X DIGIT+)+`, not as a test on
one letter between two numbers. That shape is what makes `5x4x3` convert **in a single pass**,
and it is deliberately not a patched version of the pairwise form: patching it would mean
converting one operator, leaving the next for a later pass, and reproducing exactly the
non-idempotency recorded in §7.10.

At index `i`, if `cp[i]` is in `DIGIT` and (`i = 0` or `cp[i-1]` is not in `DIGIT`) — the start
of a maximal digit run — attempt to read a chain:

1. **Read the chain.** Let `a = i`. Consume the maximal `DIGIT` run. Then repeatedly attempt to
   consume one **link**: an optional single code point from `SPACE` ∪ `NOBREAK-SPACE`, one
   `MUL-LETTER`, an optional single code point from `SPACE` ∪ `NOBREAK-SPACE`, and a non-empty
   `DIGIT` run.
   **`NOBREAK-SPACE` is included deliberately**, matching the pairwise form this replaces: a
   U+00A0 that a previous `nbsp` run placed between a number and its multiplication sign must
   still read as spacing, or re-processing already-typeset text would stop recognising the
   chain. Step 8 then carries that exact code point across the edit, and §6 case 10 pins it. Stop at the first position where a link cannot be completed.
   Let the chain be `cp[a … b]`, with `m` links and `m + 1` digit runs.
2. If `m = 0`, there is no chain here. Emit nothing and continue the scan from `b + 1`.
3. **Guard M1 — spacing is symmetric and uniform.** For each link, the space-like code point
   before its `MUL-LETTER` and the one after it must both be present or both be absent; and
   **every link in the chain must agree**. Presence is what must match, not the exact code
   point: a link spaced `U+00A0 × U+0020` is symmetric. Let `sp` be that common value, `0` or `1`. If any link is
   asymmetric, or two links disagree, emit nothing for the entire chain.
   `1080x` and `x 5` are not multiplications; `5x4 x 3` is ambiguous input and is declined
   whole rather than half-converted.
4. **Guard M2 — the chain must start at a number.** Let `before = cp[a-1]` (or `NONE`). If
   `before` is in `LETTER`, emit nothing. (`H2x4`, `ax3`.)
5. **Guard M3 — the chain must end at a number.** Let `after = cp[b+1]` (or `NONE`). If `after`
   is in `LETTER`, emit nothing. This is what rejects hexadecimal: in `0x1F` the chain is `0x1`
   and `after` is `F`.
   **M2 and M3 apply to the outer boundaries of the chain, not to each link.** In the pairwise
   form they applied per pair, which is what made a chain reject itself — the letter on the far
   side of the middle digit run was another `MUL-LETTER`.
6. **Guard M4 — hexadecimal literal.** If `sp = 0`, the **first** link's letter is U+0078
   (Latin lowercase — a hex literal is never written with Cyrillic, so this guard stays
   Latin-only), and the first digit run is the single code point U+0030 (`0`), emit nothing.
   This catches `0x10`, `0x24` and every hex literal whose digits happen to be decimal, which
   M3 alone misses.
7. **There is no M5.** The former chain guard existed only to decline the shape this branch now
   converts, and it was **removed rather than extended** — see §7.3. Its stated redundancy with
   M2/M3 was correct for the pairwise form and is the reason the pairwise form could never have
   been patched into working: M2/M3 _are_ what rejected a chain.
8. Otherwise emit **one edit per link**. For link `k` whose letter sits at index `j`, replace
   `cp[j-sp … j+sp]` with
   - `sp = 0` → the single code point U+00D7;
   - `sp = 1` → the three code points `cp[j-1]` U+00D7 `cp[j+1]`, i.e. **each side keeps the
     exact space code point it had in the input**, so a U+00A0 placed by a previous `nbsp` run
     is preserved rather than downgraded to U+0020.

   The edits cannot overlap: consecutive links are separated by a digit run of at least one
   code point. If a computed replacement is identical to the span it replaces, emit nothing for
   that link. Continue the scan from `b + 1`.

**Mixed alphabets convert.** `5x4х3` — one Latin `x`, one Cyrillic `х` — is a single chain and
both links convert. The four members of `MUL-LETTER` are interchangeable here, and no guard
distinguishes them (M4 is the sole exception and it inspects only the first link). This is the
right answer rather than a permissive one: mixed input is precisely the keyboard-layout debris
the Cyrillic addition was made for (§3.1), the numeric context is identical whichever letter
appears, and declining on mixture would make the rule's behaviour depend on **which layout the
author's finger slipped to** — the least predictable criterion available, and one no author
could ever discover from the output, since the two letters are visually identical.

**An already-converted operator ends a chain.** U+00D7 is not in `MUL-LETTER`, so `5×4x3` reads
as the digit run `5`, then U+00D7 (no chain), then the chain `4x3`, which converts. The result
is `5×4×3` either way; sub-chains do not need to be joined.

### 3.4 Plus-minus

The literal three-code-point sequence **`+/-`** — U+002B, U+002F, U+002D — becomes U+00B1 (`±`).

**Only `+/-`. The bare sequence `+-` is never converted**, and that asymmetry is the whole
design. `+/-` is unambiguous: no language, format or notation uses it for anything else. `+-`
is not — it occurs in diff and patch listings, in ASCII table rules and borders, in regular
expression character classes such as `[+-]`, and as two adjacent operators in source code. None
of those is protected in `text` mode, where nothing is skipped. Converting `+-` would be a false
positive in exactly the content this package is used on. See §7.11 so it is not added later "for
symmetry".

At index `i`, if `cp[i]` is U+002B and `cp[i+1]` is U+002F and `cp[i+2]` is U+002D:

1. **Guard F1 — not a character class.** Let `before = cp[i-1]` (or `NONE`). If `before` is
   U+005B `[`, emit nothing. `[+/-]` is a regular expression, and this is the one code-like
   context that survives into prose about code.
2. **Guard F2 — numeric context.** Let `j = i + 3`. If `cp[j]` is U+0020, advance `j` by one.
   If `cp[j]` is not in `DIGIT`, emit nothing.
3. Otherwise emit one edit replacing `cp[i … i+2]` with the single code point U+00B1. Any space
   between the sign and the digit is left exactly as it was.

**Why a following digit is required.** This was the one genuinely open choice, and I took the
narrow side. The permissive form — convert `+/-` wherever it appears — is more useful in the
rare standalone reading ("плюс-минус", "the error is +/-"), and it is wrong in a case that is
not rare at all: **prose that names the characters rather than using them**. A changelog reading
`lines marked +/- were edited`, or a legend `+/- indicates added and removed rows`, becomes
`lines marked ± were edited` — a silent corruption of a sentence that was about the ASCII
symbols themselves. Requiring a digit declines every one of those, because what follows is a
letter.

The cost is precisely measurable and small: standalone `±` in running prose is uncommon, it is
usually spelled out in words when it is meant, and an author who wants it can type it. The
benefit is that the guard is _structural_ — it keys on the numeric context, exactly as the
multiplication branch does — rather than on a list of contexts someone has to remember to
extend. One intervening U+0020 is allowed so that both `+/-5` and `+/- 5` work, which covers
the way the sequence is actually written.

### 3.5 Scan order

The three branches key on different code points — U+0028, a `DIGIT`, and U+002B — so no two can
match at the same index. The scan visits each index once; on a successful edit it continues from
the index after the matched span, so a replacement can never be re-examined within the same
pass.

---

## 4. Must not touch

**Scope.** Per [pipeline-idempotency.md](pipeline-idempotency.md) §5.2 each bullet is **[P]** —
a guarantee of `transform` as a whole — or **[R]** — true of this rule in isolation but capable
of being falsified by another rule, which is then named.

- **[P] `(s)`, `(a)`, `(e)`, `(i)`, `(n)`** and every other parenthesised single letter. The
  table is exhaustive.
- **[P] `(c)` and `(r)` in a call or index position:** `f(c)`, `arr[i](c)`. Guard S1. Note that
  `(tm)` is **not** protected this way and `f(tm)` does become `f™` — deliberate, §3.2 step 3.
- **[P] `(r)evolution`, `(c)ompiler`, `(s)he`.** Guard S2.
- **[P] Existing ©, ®, ™, ×.** Not candidates; the rule reads `(` and `x`/`X` only.
- **[P] Cyrillic `х` outside a numeric context.** `хорошо`, `их`, `по-моему х` — M2/M3 decline
  a letter neighbour in either alphabet, and step 2 requires an ASCII digit on each side.
- **[P] `x` as a word or a variable:** `x = 5`, `the x axis`, `Malcolm X`. Guard M1 or step 2
  (no digit neighbour).
- **[P] `1080x`, `x264`, `2x` alone.** Guard M1 (asymmetric spacing) or step 2.
- **[P] Hexadecimal literals `0x1F`, `0xFF`, `0x10`.** Guards M3 and M4.
- **[P] The bare sequence `+-`.** Never converted, in any context — §3.4 and §7.11.
- **[P] `[+/-]` in a regular expression.** Guard F1.
- **[P] `+/-` followed by a letter.** `+/- indicates added rows` keeps its ASCII sequence.
  Guard F2.
- **[R] Spacing.** The rule never inserts or deletes a space; it only carries the existing one
  across the edit (§3.3 step 8).
- **[P] Anything inside a skipped region.** `(c)` in a code span and `0x1F` in a fenced block are
  removed by the mode adapter before this rule runs.
- **[P] Emoticons and ASCII art.** `(x)`, `:-)`, `(^_^)` contain no table entry and no numeral
  context.

---

## 5. Idempotency argument

**Trademark branch.** Every edit replaces a span beginning with U+0028 by a single code
point that is not U+0028, so a second run never re-enters the branch at that position, and no
new U+0028 is ever created (the edit only removes them). The classification of a surviving
`(`-candidate depends on `before`, `after` and the literal span. `after` can only have been
changed if the _following_ span was edited — impossible, because the following span would
then have to start at `after`'s position with U+0028, and a candidate whose `after` is U+0028
fails nothing and is edited itself, removing the adjacency. `before` can have been changed by
an immediately preceding edit: `(c)(r)`. On run 1 the second match has `before` = U+0029 and
is rejected by S1; after the first edit the array reads `©(r)`, and without the amendment
`before` = U+00A9 would satisfy S1 on run 2 and produce a new edit — a two-run convergence,
i.e. a violated invariant. **S1 lists U+00A9, U+00AE and U+2122 for exactly this reason**, so
`(c)(r)` converges to `©(r)` on run 1 and is stable.

The `(tm)` exemption from S1 does not weaken this. A `(tm)` match is admitted regardless of
`before`, so it is edited on run 1 whatever its left neighbour is; there is no left-neighbour
condition left to flip on run 2. `(c)(tm)` converges to `©™` in a single run, and `(tm)(c)`
to `™(c)` — the trailing `(c)` being rejected by S1 on both runs, on `)` first and on U+2122
after.

**Multiplication branch.** Every edit replaces `[space] X [space]` with `[space] × [space]`
(or a bare multiplication letter with `×`). U+00D7 is not in `MUL-LETTER`, so no edited position
is a candidate again — and because the branch converts a **whole chain in one pass**, no
_unedited_ `MUL-LETTER` is left inside a chain either. A second run reading `5×4×3` finds digit
runs separated by U+00D7, cannot complete a single link, and emits nothing.

This is the property the chain form buys, and it is worth stating as the contrast it is: the
pairwise form this replaced could only ever convert one operator at a time, so `5x4x3` would
have gone to `5×4x3` and then to `5×4×3` — two passes, two different answers, which is the
defect §7.10 records in another implementation. Idempotency here is **by construction of the
scan**, not by a guard that has to be kept symmetric.

The surrounding digits are untouched, so `before` and `after` are unchanged for every other
chain in the text; and chains are separated by at least one non-digit, non-link code point, so
one chain's edits can never alter another's boundaries.

**Plus-minus branch.** The edit replaces three code points beginning with U+002B by one U+00B1,
which is not U+002B, so the position is not a candidate again. No new U+002B is created — the
edit only removes one — so no neighbouring candidate can be created. F1 reads `cp[i-1]` and F2
reads forward past the match; neither position can have been changed by another `+/-` edit,
since two matches cannot overlap and an edit never writes a digit or a `[`.

Both branches therefore leave no candidate at an edited position and no changed
classification at a surviving one, so `T(T(x)) = T(x)`.

**What had to be fixed**, summarised: (a) Guard S1 had to be extended to the three
replacement code points, or `(c)(r)` needs two passes; (b) the multiplication branch had to
carry the existing space code point across the edit rather than emitting U+0020, or text that
`nbsp` had already processed would oscillate between U+00A0 and U+0020 on alternate runs;
(c) _(superseded.)_ This clause required "the chain guard M5 to be symmetric, rejecting on
_either_ side, or `2x3x4` would converge to `2×3x4` on run 1 and `2×3×4` on run 2". **There is
no M5** — §3.3 step 7 removed it rather than extending it, because M5's redundancy with M2/M3
was precisely what made the pairwise form reject chains. The defect it describes is now
prevented by the chain scan itself: `2x3x4` converts in one pass, so there is no run 2 for it to
converge on. Kept as a record of what the pairwise form required, and marked, rather than
deleted silently — the sentence is the only surviving trace of why M5 could not simply be
patched.

---

### Composition obligation

Per [pipeline-idempotency.md](pipeline-idempotency.md) §5. This rule is **R₇**; the obligation
runs against `spaces`, `ellipsis`, `dashes`, `hyphen`, `quotes` and `apostrophe`.

**What this rule emits.** U+00A9, U+00AE or U+2122 replacing a three- or four-code-point span
beginning with U+0028; and U+00D7 replacing one `MUL-LETTER`, carrying the adjacent space code
points across unchanged (§3.3 step 8). It never emits a space, a dot, a dash, a quotation mark
or a letter.

**Against `I₁` (`spaces`).** Discharged. No U+0020 is emitted. The trademark replacement
_shortens_ a span, which could in principle bring two code points together — but both
neighbours are guarded to be non-`ALNUM` on the left and non-`ALNUM` on the right, and neither
guard admits a U+0020 on both sides simultaneously in a way that creates a run: the span
replaced is bounded by `(` and `)`, so a space on each side of it stays one space on each side
of the resulting sign. `×` is not in `STRIP-BEFORE`, so a preserved space before it is not
something `spaces` would delete.

**Against `I₂` (`ellipsis`).** Discharged: no dots emitted, and the deleted `(`…`)` span cannot
separate two dot runs, because a `DOTLIKE` run adjacent to `(` on one side and `)` on the other
is not brought into contact — the sign replaces them.

**Against `I₃` (`dashes`).** Discharged: no dash is emitted and no spacing changes. A dash
token adjacent to a replaced span sees its `cp[L]`/`cp[R]` change from `(`/`)` to a sign; both
are ordinary content to `dashes` and neither is in `DASH`, `INERT-DASH`, `DIGIT` or a space
class, so no verdict moves.

**Against `I₄` (`hyphen`).** Discharged: the replaced span is bounded by non-`ALNUM` code
points and the emitted signs are not in `WORDISH`, so no listed hyphen form's word boundary
changes.

**Against `I₅`/`I₆` (`quotes`, `apostrophe`).** Discharged: this rule emits nothing in
`STRAIGHT`, and the signs it does emit are not in `SPACELIKE` or `ALNUM`, so a surviving
straight mark adjacent to one keeps every capability it had — and by `quotes` Claim 3, which
needs only that capabilities do not _increase_, that is sufficient.

---

## 6. Worked examples

`␣` = U+0020, `⍽` = U+00A0, `⟶` = no change. Locale-independent.

**A standing note for anyone adding a row here.** These rows become conformance fixtures
verbatim, so each one must exercise **only** the rule it documents. Choose the surrounding words
so that no _other_ rule fires: no unit or unit-like token (`mm`, `cm`, `см`, `km`, `%`, `°C`),
which `nbsp.beforeUnits` binds to a preceding number with U+00A0; no abbreviation ending in a
full stop, which `nbsp.beforeNumber` / `beforeWord` bind; and no short function word, which
`nbsp.afterShortWords` binds. A row reading `Tolerance ±5 mm` teaches a reader that `symbols`
produces the space it does not produce — the true pipeline output carries a U+00A0 that belongs
to `nbsp`. Prose elsewhere in this document may use realistic units freely; only §6 is
constrained.

| #   | Input                                    | Output                           | Why                                                                                                                                                                                                  |
| --- | ---------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Copyright (c) 2026 Iurii Rogulia`       | `Copyright © 2026 Iurii Rogulia` | table hit, S1/S2/S3 pass                                                                                                                                                                             |
| 2   | `Acme(tm) and Acme (R)`                  | `Acme™ and Acme ®`               | `(tm)` is exempt from S1 (§3.2 step 3), so the letter `e` at `before` does not reject it; `(R)` passes S1 because `before` is a space. S2 passes for both (`after` is a space and end-of-text)       |
| 2b  | `f(c) and f(tm)`                         | `f(c) and f™`                    | the S1 asymmetry, stated as one case: S1 applies to the `(c)`/`(r)` rows and rejects the first (`before` is `f`); the `(tm)` rows are exempt and the second converts. Deliberate — §3.2 step 3, §7.2 |
| 3   | `The (r)evolution will not be televised` | ⟶                                | S2: `after` is `e`                                                                                                                                                                                   |
| 4   | `f(c) returns c`                         | ⟶                                | S1: `before` is `f`                                                                                                                                                                                  |
| 5   | `A 3x5 card, 10 x 20 grid`               | `A 3×5 card, 10 × 20 grid`       | tight and symmetric-spaced forms                                                                                                                                                                     |
| 5a  | `Размер 5х4`                             | `Размер 5×4`                     | **Cyrillic U+0445 between ASCII digits.** Identical in appearance to case 5 and invisible in a diff — §3.1                                                                                           |
| 5b  | `Размер 5Х4`                             | `Размер 5×4`                     | Cyrillic capital U+0425                                                                                                                                                                              |
| 5c  | `хорошо и их`                            | ⟶                                | Cyrillic `х` with letter neighbours: step 2 requires an ASCII digit on each side                                                                                                                     |
| 5d  | `5х4х3`                                  | `5×4×3`                          | an all-Cyrillic chain, both links converted in **one pass** (§3.3)                                                                                                                                   |
| 5e  | `A 2x3x4 box`                            | `A 2×3×4 box`                    | the Latin chain. Previously declined in its entirety                                                                                                                                                 |
| 5f  | `5x4х3`                                  | `5×4×3`                          | **mixed alphabets** — one Latin `x`, one Cyrillic `х`, one chain, both links convert                                                                                                                 |
| 5g  | `Стол 120х80х75`                         | `Стол 120×80×75`                 | three-link chain, multi-digit runs                                                                                                                                                                   |
| 5h  | `10 x 20 x 30`                           | `10 × 20 × 30`                   | spaced chain; `sp = 1` uniformly, and each side keeps its own space code point                                                                                                                       |
| 5i  | `5x4 x 3`                                | ⟶                                | **M1**: link 1 is tight, link 2 is spaced. Ambiguous input, declined whole rather than half-converted                                                                                                |
| 5j  | `5×4x3`                                  | `5×4×3`                          | an already-converted operator ends a chain; the remaining sub-chain converts                                                                                                                         |
| 5k  | `Tolerance +/-5 points`                  | `Tolerance ±5 points`            | `+/-` with an immediately following digit                                                                                                                                                            |
| 5l  | `Tolerance +/- 5 points`                 | `Tolerance ± 5 points`           | one intervening U+0020 is allowed; the space itself is untouched                                                                                                                                     |
| 5m  | `Погрешность 5+/-3`                      | `Погрешность 5±3`                | a digit on the left is not an obstacle — F1 rejects only `[`                                                                                                                                         |
| 5n  | `lines marked +/- were edited`           | ⟶                                | **F2**: what follows is a letter. Prose _about_ the characters is not converted                                                                                                                      |
| 5o  | `match [+/-] once`                       | ⟶                                | **F1**: a regular-expression character class                                                                                                                                                         |
| 5p  | `Range 5+-3`                             | ⟶                                | bare `+-` is never converted, in any context (§3.4, §7.11)                                                                                                                                           |
| 6   | `Colour 0x1F, mask 0xFF, offset 0x10`    | ⟶                                | M3 (`0x1F`, `0xFF`) and M4 (`0x10`)                                                                                                                                                                  |
| 7   | `Resolution 1920x1080`                   | `Resolution 1920×1080`           | digits both sides, no letters adjacent                                                                                                                                                               |
| 8   | `Let x = 5 and solve for x`              | ⟶                                | no digit neighbour                                                                                                                                                                                   |
| 9   | `0x1F, 0xFF, 0x10 stay`                  | ⟶                                | M3 rejects the first two (`after` is a letter), M4 the third                                                                                                                                         |
| 10  | `10⍽×␣20`                                | ⟶                                | already converted, and the U+00A0 is preserved (§3.3 step 8)                                                                                                                                         |
| 11  | `((c))`                                  | ⟶                                | S3                                                                                                                                                                                                   |
| 12  | `Version 1080x`                          | ⟶                                | M1, asymmetric                                                                                                                                                                                       |
| 13  | `© 2026, ® and ™`                        | ⟶                                | no candidates at all                                                                                                                                                                                 |
| 14  | `2*3`                                    | ⟶                                | `*` is never a multiplication sign here — §7.8                                                                                                                                                       |

Cases 3, 4, 5c, 5i, 5n, 5o, 5p, 6, 8, 9, 10, 11, 12, 13 and 14 are "no change" cases.

---

## 7. Open questions

1. **`DIGIT` is ASCII-only**, as in `dashes`. `١٠ x ٢٠` is not recognised. Deliberate, for the
   same portability reason (no Unicode `Nd` value table required in five runtimes).
2. _(Settled.)_ S1 used to apply to all three signs, which missed `Acme(tm)` — the commonest
   real spelling. Option (b), restricting S1 to `(c)`/`(r)`, was accepted by the operator and
   is written into §3.2 step 3. The residual cost is that `f(tm)` in prose becomes `f™`; in
   `html`/`markdown` mode a real code span is removed by the mode adapter before this rule
   runs, so the exposure is `text` mode only. Fixtures: §6 cases 2 and 2b.
3. _(Settled — implemented.)_ Chains convert. §3.3 is a scan of `DIGIT+ (X DIGIT+)+` with
   M2/M3 applied to the chain's outer boundaries, which is the respecification this item asked
   for; M5 was **removed rather than patched**, because M5's redundancy with M2/M3 was exactly
   what made the pairwise form reject chains. `5x4x3`, `5х4х3` and the mixed `5x4х3` all
   convert in one pass.
4. **`Pixel 4x5` and similar product names are converted** to `Pixel 4×5`. No guard can
   distinguish that from a genuine dimension. Accepted false positive; it should be checked
   against real content at the M4 gate.
5. **No `(p)` → `℗`.** `order.json`'s summary for this rule names the copyright, registered and
   trademark signs, the multiplication sign, and — since spec 0.1.0 — plus-minus. Adding more is
   a spec change, not an implementation detail.
6. **Vulgar fractions are refused, in every form.** Neither the precomposed characters (`½`,
   `¼`, `⅜`) nor the U+2044 fraction-slash construction. This is a **decision, not an open
   question**, and it is the only candidate in the review refused on grounds of principle rather
   than of risk. The argument, in the order that decided it:

   - **The Unicode inventory is incomplete by construction, so the rule cannot be consistent
     even when it is correct.** `½ ¼ ¾ ⅓ ⅔ ⅕ ⅛` exist; `3/16`, `5/32`, `1/12`, `7/10` do not.
     So a paragraph containing `1/2 дюйма` and `3/16 дюйма` comes out as `½ дюйма` beside
     `3/16 дюйма` — two notations for the same kind of quantity, in adjacent sentences,
     **where the input had one**. The rule leaves the text less internally consistent than it
     found it. That is not a rule that is right most of the time; it is a rule that is wrong
     _when it fires correctly_, and no guard can fix it, because the defect is in the existence
     of the mapping table rather than in its edges.
   - **In `text` mode nothing is skipped, and a path is ordinary text.** `/usr/1/2/bin` becomes
     `/usr/½/bin`. `modes.md` skips code and URLs in `html` and `markdown`, but `text` mode has
     no adapter, and a substitution whose safety depends on the mode is not one this spec should
     carry.
   - **It does not survive downstream normalisation.** U+00BD has a **compatibility
     decomposition** to `1` U+2044 `2`, so any consumer applying NFKC — a search indexer, a
     database collation, a template engine — silently undoes the work. ARCHITECTURE.md §4.3
     forbids _us_ from normalising; it cannot forbid anyone downstream. A conversion that a
     common downstream pass reverses is not worth any false-positive budget at all.
   - **It is invisible in a diff**, so the M4 gate cannot catch it — the same class as the
     Cyrillic `х` (§3.1). But the Cyrillic case is one where the machine is right every time and
     the human cannot see it; this is one where the machine introduces the inconsistency and the
     human still cannot see it. The asymmetry is what makes the same property an argument _for_
     one and _against_ the other.
   - **No authority asks for it.** Chicago, the Unicode Standard and Мильчин all describe how a
     fraction should _look_ — raised numerator, proper solidus, correct kerning — which is the
     job of a font's `frac` feature or a typesetter, not of a character substitution. PLAN.md
     §6.1 settles disagreements by citation, and there is no citation to be had.
   - The ambiguity cases — `1/2/2026`, `and/or`, a URL path, `5 1/2` versus `5/2` — are real but
     were **not decisive**. Guards could be written for them. Nothing can be written for the
     first point.

   **The single condition under which this reopens:** a rendering context where polytypo knows
   the target font provides `frac`, so a fraction could be marked up rather than substituted.
   That is a different product (PLAN.md §9), it requires emitting markup, which §7.9 refuses on
   architectural grounds, and it is **not authorized**.

7. _(Settled — implemented.)_ Cyrillic U+0445/U+0425 are members of `MUL-LETTER` (§3.1). The
   premise of the original question was wrong: this is **not** locale-dependent data. The
   numeric context carries the whole risk, the sequence does not occur in the other v1 locales,
   and no schema field or `localeData` entry is needed. Confirmed empirically against Lebedev's
   live service, which performs the same substitution.
8. **Decided refusals.** Recorded so they are not re-litigated. Each was checked against
   Lebedev's live service (Kovodstvo §62, Typograf) rather than reconstructed from memory:
   - **`*` → `×`.** Refused, and Lebedev does not do it either. `2*3` is indistinguishable from
     Markdown emphasis, a shell glob, a footnote marker and multiplication in source. No
     numeric-context guard separates them, because the numeric context is present in all four
     readings.
   - **Arrows (`->`, `=>`) and comparison operators (`!=`, `<=`, `>=`).** Refused: source code
     far more often than prose in the content this package targets, and `->` collides with
     `dashes`.
   - **Degree insertion** (`5 C` → `5 °C`), **digit-group binding** (`100 000`), **`m2` → `м²`**,
     **currency substitution** (`1 руб.` → `1 ₽`), **ordinal repair** (`10-ый` → `10-й`).
     Refused: each inserts or rewrites _content_ rather than normalising typography, and several
     are locale-specific editorial conventions rather than microtypography. Digit-group binding
     would belong to `nbsp` if it were ever wanted, not here.
   - **ISO date reformatting.** Refused outright. `dashes` goes to considerable trouble to leave
     `2026-08-15` byte-identical (§3.2 step 7 there); rewriting it elsewhere would be incoherent.
   - **Greek compatibility punctuation.** No mapping U+037E → U+003B (ερωτηματικό) and none
     U+0387 → U+00B7 (άνω τελεία), in either direction. Both compatibility characters decompose
     **canonically**, so rewriting one is normalisation under a different name — forbidden by
     ARCHITECTURE.md §4.3 — and redundant besides, since any downstream NFC pass performs it.
     The converse mapping, "spell the Greek question mark U+037E because it is the Greek one",
     is refused on the Unicode Standard's own advice (ch. 7 §7.2.1: their use "is not generally
     encouraged"). This rule therefore has no Greek branch at all, and `spaces.md` §3.5 carries
     the full argument, including why the ambiguity costs the pipeline nothing.
   - **Any insertion of markup into the result** — see §7.9.
9. **No markup is ever inserted, by this rule or any other.** Lebedev's service wraps its
   output: `212-85-06` becomes `<nobr class="phone">…</nobr>`, and `(r)` becomes
   `<sup class="reg">®</sup>`. polytypo will not, and the reason is architectural rather than
   aesthetic: ARCHITECTURE.md §2 puts the rule engine at L1, which knows nothing about HTML, and
   `modes.md` §4 guarantees the output is the input with disjoint substring replacements and
   nothing else. A rule that emitted a tag would be unimplementable in `text` mode and would
   break the round-trip guarantee in the other two.
   It is also, empirically, that approach's worst failure: `Дата 2026-08-15 отчёт` comes back
   with the ISO date wrapped as a telephone number. A rule that decides "this is a phone number"
   and then _encodes that decision in the document_ converts a silent miss into permanent
   damage — which is the strongest available argument for `dashes`' cluster guard leaving
   digit-dash chains untouched instead of trying to classify them.
10. **Lebedev's own output is not idempotent**, and this is an observation from the live
    service rather than a claim about it: `5х4х3` → `5×4х3` → `5×4×3`. Two passes give two
    different answers, and a third gives a third. For content that is re-processed on every
    save — the CMS case PLAN.md §1 names — that is a document that never converges.
    This is the most concrete evidence available for why PLAN.md §3.4 makes
    `transform(transform(x)) == transform(x)` a **release blocker** rather than a quality goal,
    and it belongs in the README comparison table that PLAN.md §8 M5 requires.

    Our behaviour on the same input is now the direct contrast: `5х4х3` → `5×4×3` in **one
    pass**, and the second pass is a no-op (§6 case 5d). That is not because we were more
    careful with the same design — it is because the branch is specified as a chain scan rather
    than as a pairwise test (§3.3), and a pairwise test _cannot_ be made idempotent here by any
    amount of guarding. The comparison is therefore about the shape of the specification, not
    about implementation quality, which is the more useful thing to say in a README.

11. **`+-` is not converted and must not be added later.** Only the literal `+/-` becomes U+00B1
    (§3.4). The temptation to add `+-` "for symmetry" is exactly why this entry exists: `+-`
    occurs in diff and patch listings, in ASCII table borders, in regex character classes like
    `[+-]`, and as two adjacent operators in source code — none of which is skipped in `text`
    mode. `+/-` has no such collisions. The asymmetry is the point, not an oversight.
12. **`+/-` requires a following digit** (guard F2), so standalone `±` in prose is a miss:
    `плюс-минус`, or `the tolerance is +/-`, keeps its ASCII form. The alternative was refused
    because prose that _names_ the characters — `lines marked +/- were edited` — is common in
    changelogs and documentation and would be silently corrupted. If real content shows the miss
    matters, the safe widening is a short list of following words, not the removal of F2.
