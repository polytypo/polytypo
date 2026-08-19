# Rule: `dashes`

**Order:** 30. **Default:** on. **Modes:** text, html, markdown.
**Spec version:** 0.2.0.

---

## 1. Purpose

`dashes` distinguishes the two typographic uses of a horizontal stroke that authors type as
a hyphen-minus and renders each in the form the locale prescribes: the **parenthetical dash**
(the one that interrupts a sentence — like this) and the **range dash** (1914–1918). It does
not touch the third and by far most common use, the ordinary hyphen inside a compound word —
which, in the few morphological forms where the hyphen must additionally be protected from a
line break, belongs to `hyphen` at order 35 — and the entire design of the rule is organised
around never mistaking one for the other.
Both forms are governed by one enum in the locale file: a dash _length_ (`em` or `en`) and a
_spacing_ (`tight` or `spaced`), or the opt-out value `none`. Range detection is deliberately the strictest thing in
the whole spec — it binds runs of ASCII digits only, behind an admissibility gate and five
further guards — because
`COVID-19`, `ISO 8859-1`, `2026-08-15` and `+358-40-555-1234` are all things that must come
out byte-identical.

---

## 2. Locale data consumed

- `dash.parenthetical` — one of `"em-tight"`, `"em-spaced"`, `"en-tight"`, `"en-spaced"`,
  `"none"`.
- `dash.range` — the same five values.

Both fields carry the same enum.

**Evidence for these lists.** A locale attests **membership** — that these tokens belong in this list — and this rule owns the **mechanism** it applies to them. A `sources` citation is not required to name a code point or a binding the locale file has no way to vary. The principle is stated once, normatively, in [nbsp.md](nbsp.md) §2.1 and governs every list-valued field in `locale.schema.json`. **`"none"` means the locale has no verified convention for
that use, and the rule must emit nothing at all for a token of that kind** — not a fallback
to the other field, not a "sensible default", nothing. A missing citation is never a licence
to guess (PLAN.md §6.1), and a locale that has not been researched must round-trip its input
untouched rather than acquire a plausible-looking dash. A `"none"` token is still _classified_
— it is still a range or a parenthetical, and a range token with `dash.range = "none"` is
still never reconsidered as a parenthetical (§3.3).

Nothing else. The choice between a breaking and a no-break space on the left of a spaced
dash is not made here: this rule always emits U+0020, and `nbsp` (order 70) may later
promote it.

---

## 3. Algorithm

Input is a code-point array `cp[0 … n-1]`.

### 3.1 Character classes

| Class           | Members                                                                                                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DASH`          | U+002D (hyphen-minus), U+2010 (hyphen), U+2013 (en dash), U+2014 (em dash), U+2212 (minus sign) — see the note below the table                                                                                      |
| `DIGIT`         | U+0030–U+0039 only. **ASCII digits only** — see §7.1                                                                                                                                                                 |
| `LETTER`        | any code point whose Unicode general category is `Lu`, `Ll`, `Lt`, `Lm` or `Lo`, or `Mn`, `Mc`, `Me` (combining marks count as letter-continuation, so a decomposed `é` is treated as one letter followed by a mark) |
| `SPACE`         | U+0020 only                                                                                                                                                                                                          |
| `BREAK`         | U+000A, U+000D, U+000B, U+000C, U+0085, U+2028, U+2029                                                                                                                                                               |
| `NOBREAK-SPACE` | U+00A0, U+202F                                                                                                                                                                                                       |
| `ROMAN`         | the seven uppercase Roman-numeral letters only: U+0049 `I`, U+0056 `V`, U+0058 `X`, U+004C `L`, U+0043 `C`, U+0044 `D`, U+004D `M`. Lower-case forms are **not** members — see §3.4 P4                               |
| `INERT-DASH`    | U+00AD (soft hyphen), U+2011 (non-breaking hyphen), U+2012 (figure dash), U+2015 (horizontal bar), U+FE58, U+FE63, U+FF0D                                                                                            |
| `JOINER`        | U+2060 (word joiner) only. Produced by the range branch (§3.3.1) and by nothing else in this rule                                                                                                                    |

`INERT-DASH` members are **never** candidates and are **never** produced. Two of the seven are
protective markers owned by someone else — U+00AD is invisible formatting, and U+2011 is
`hyphen` (order 35)'s own output — and stay excluded on that basis alone. The rest —
U+2012, U+2015, U+FE58, U+FE63, U+FF0D — are each a *specialised* dash with its own reason to
exist (digit-width tabular alignment, the dialogue dash some traditions use on purpose, CJK
compatibility forms), not a substitute for a missing key, and reclassifying one would erase the
distinction the author reached for that code point to make.

**`DASH` beyond U+002D/U+2013/U+2014.** U+2010 (hyphen) and U+2212 (minus sign) are members too
(added in spec 0.2.0): both are plain typewriter or OCR substitutes for an ordinary hyphen-minus,
governed by exactly the same rationale as U+002D in step 2 below. U+2013 and U+2014 are ordinary
`DASH` members too, with **no token-level special case** (spec 0.2.0 retires the guard that used
to give them one — see step 2a's history note): a run holding any mixture of `DASH` glyphs is
promoted to the locale's form exactly as a pure-hyphen run would be. This treats the dash's
*length* the same way this rule has always treated its spacing — as something to correct, not
preserve — on the view that a dash's length in ordinary prose is at least as often a copy-paste
artefact or plain unfamiliarity with which mark is which as it is a deliberate choice, and an
author who wants their own dash typography left alone has always had the option of not running
the pipeline.

**Unicode version.** The general categories and case mappings this rule reads are those of the UCD version pinned in `spec/UNICODE` (`17.0`). The pin is normative for the **derived tables**, not for the host runtime — see [pipeline-idempotency.md](pipeline-idempotency.md) §6a, which also specifies the canary fixtures that make the pin detectable. If an author wrote
U+2011 they meant it.

### 3.2 The dash token

1. Scan left to right. At the first index `i` with `cp[i]` in `DASH`, find the maximal run of
   `DASH` members: `s = i`, `e` = first index `> s` not in `DASH`, `k = e - s`.
2. If `k > 3`, the run is decoration (a horizontal rule, a signature line, a Markdown
   `---` setext underline of arbitrary length). Emit nothing; set `i = e`; continue.
2a. **(Retired, spec 0.2.0. Number kept — see the note at the end of this step.)** Spec 0.1.0
   had an authored-dash guard here: any run containing U+2013 or U+2014 was declined outright,
   glyph and spacing both, whatever the locale said. It is gone. U+2013 and U+2014 carry no
   token-level special case anywhere in this algorithm; a run holding them is classified and
   replaced exactly as the same run spelled with U+002D would be. Length is corrected along
   with spacing, by the same replacement tables in §3.3 and §3.4.

   **History, in two moves.** 0.1.0's unconditional guard was itself a repair: an M4 corpus run
   found 1063 lines across 155 files where restyling an author's dash — length and spacing
   changed together — was pure damage, and the guard blocked the whole class by declining every
   authored token outright (§7.14 records the finding in full). A later revision inside 0.2.0
   narrowed the guard instead of removing it — preserve length, correct spacing only — after a
   `Минус — при разногласиях`-shaped complaint showed the unconditional form leaving genuinely
   mis-spaced dashes broken forever. That narrower design shipped only briefly: the length
   restriction rests on treating a dash's length as an authorial decision, and on review that
   premise does not hold in general — a dash's length in ordinary prose is at least as often a
   copy-paste artefact or plain unfamiliarity with which mark is which as it is a deliberate
   choice, and this project has never claimed to distinguish the two from context. **The
   guard is retired outright, on the same basis this rule has always used for spacing:
   correcting an author's mechanical error is what a normalising pass is for, and an author who
   wants their own typography untouched has always had the option of not running one.**

   **§3.3.1's binding restriction is unaffected by this retirement and is stated independently
   there:** this rule still never makes an edit whose entire content is invisible — regardless
   of whether the dash was hyphen- or en/em-typed — because that restriction was never about
   authorship, only about reviewability.

   Numbered `2a` rather than renumbered to `3`: six documents cite the guards of this section by
   number, and a step that is retired but still occupies its number costs less than a
   renumbering would.

3. Determine the **outer spacing** of the token:
   - `lsp = 1` if `s > 0` and `cp[s-1]` is `SPACE`, else `0`;
   - `rsp = 1` if `e < n` and `cp[e]` is `SPACE`, else `0`.
     After `spaces` (order 10) any space run adjacent to the token has length exactly 1 unless
     it borders a line terminator, so a single-code-point probe is sufficient.

   **`SPACE` here means U+0020 and nothing else. A `NOBREAK-SPACE` is not this rule's
   spacing.** If `cp[s-1]` or `cp[e]` is U+00A0 or U+202F, that side's `lsp`/`rsp` is `0`, the
   no-break space becomes `cp[L]`/`cp[R]`, and **step 6 then declines the token** because
   `cp[L]`/`cp[R]` is space-like. A dash touching a no-break space is therefore never edited,
   on either side.

   **This is a principle, not a spacing heuristic, and it replaces two earlier attempts that
   were.** `dashes` normalises _ordinary sentence spacing_, which is U+0020. A no-break space
   beside a dash was put there by somebody else — by the author, or by `nbsp` (order 70), whose
   entire emission alphabet is U+00A0 and U+202F. It is not this rule's to reinterpret, and a
   token that touches one is not this rule's to claim.

   The consequence is the one that matters: **every code point `nbsp` can emit is inert for
   this rule**, so `nbsp` cannot create a dash token, cannot change one's spacing verdict, and
   cannot revive one this rule declined. That discharges the composition obligation against
   `nbsp` structurally rather than case by case — see
   [pipeline-idempotency.md](pipeline-idempotency.md) §5.1a, where it is generalised as
   condition **CO-S**. The two earlier formulations ("a `NOBREAK-SPACE` counts as spacing",
   then "counts on the left only") each fixed the witness in front of them and left the next
   one reachable; §5.2 defect (d) records how.

4. **Symmetry guard.** If `lsp ≠ rsp`, emit nothing and continue. A stroke that is spaced on
   one side and tight on the other is not a dash: it is `--force`, `-5 °C`, a Markdown bullet
   `- item`, a signature `-- Iurii`, or an arrow `->`. This single guard removes the large
   majority of false positives and it applies to both the range and the parenthetical
   branches.
5. Let `L` be the index of the code point immediately left of the token's outer spacing
   (`s - 1 - lsp`), and `R` the index immediately right (`e + rsp`). If either index is out of
   range, or `cp[L]` is in `BREAK`, or `cp[R]` is in `BREAK`, emit nothing and continue. A
   dash needs content on both sides on the same line. (This is what protects a list item at
   the start of a line and a trailing `--` at the end of one.)
6. **Isolation guard.** If `cp[L]` or `cp[R]` is in `INERT-DASH`, or in `DASH`, or in
   `SPACE` ∪ `NOBREAK-SPACE`, emit nothing and continue.
   Three separate things are being excluded here and all three are load-bearing:
   - an `INERT-DASH` neighbour — U+2011 is produced by `hyphen` at order 35 from text this rule
     has already seen, and U+2012/U+2015/the fullwidth and small forms are each a specialised
     dash with its own reason to exist (§3.1); U+2010 and U+2212 are **not** in this set as of
     spec 0.2.0 — they are ordinary `DASH` members and fall into the next bullet instead;
   - a `DASH` neighbour — the pattern `dash space dash` (`a- - a`). Without this clause the
     rule normalises the second stroke, the two dash runs become adjacent, and on the next
     run they read as **one** run of length 2 with a completely different verdict. That is
     idempotency defect (b) in §5;
   - a space-like neighbour — `cp[L]` is by construction the code point _beyond_ the outer
     spacing, so a space there means two consecutive space-like characters (a U+00A0 next to
     a U+0020, say — `spaces` cannot produce two U+0020). The spacing of such a token is not
     something this rule should be rewriting.
7. **Cluster guard.** Define a **dash cluster** as a maximal span of code points every one of
   which is in `DASH` ∪ `INERT-DASH` ∪ `DIGIT` ∪ `JOINER` (§3.2b — a joiner this rule emitted
   must not split a cluster it was inside). (Spaces, letters and punctuation all end a
   cluster.) Let `C` be the cluster containing this token's run. **If `C` contains two or more
   maximal runs of `DASH` ∪ `INERT-DASH`, emit nothing for every token in `C`** — the whole
   cluster is inert.
   This covers idempotency defect (a) in §5.2: the classification of a range token reads
   `before`/`after`, which may be a dash belonging to a _different_ token, and normalising
   that other token to a spaced form replaces the dash with a space and flips the range
   verdict on the next run.
   `2026-08-15`, `978-3-16-148410-0`, `212-555-1234`, `a—0–0` and `1914-1918—annexation` are
   all single clusters with more than one dash run, and are all inert in their entirety.
   **This guard is not sufficient on its own, and it does not subsume G2.** A cluster ends at
   the first space-like code point, so a _spaced_ token's cluster contains only its own run:
   its `cp[L]` is a digit in a neighbouring cluster and its `before` is a dash in a third one,
   neither of which step 7 can see. That gap is idempotency defect (c), and step 8 closes it.
8. **Spacing-transition guard (T1).** This guard depends on which replacement form the token's
   branch will choose, so it is evaluated **immediately before emitting**, in §3.3 and §3.4
   alike; it is stated here because it is a property of the token, not of the branch.

   It applies only when **all** of the following hold:
   - `lsp = rsp = 0` — the token is currently tight; and
   - the chosen form is `em-spaced` or `en-spaced` — the replacement will insert a U+0020 on
     each side.

   In that case, for each side independently:
   - **left:** if `cp[L]` is in `DIGIT`, let `D` be the maximal `DIGIT` run ending at `L` and
     starting at index `d`. Reading **effective neighbours** (§3.2b) outward from `d`: if the
     first is in `DASH` ∪ `INERT-DASH`, **or** the first is in `SPACE` ∪ `NOBREAK-SPACE` and the
     second is in `DASH` ∪ `INERT-DASH`, emit nothing for this token.
   - **right:** if `cp[R]` is in `DIGIT`, let `D` be the maximal `DIGIT` run starting at `R`
     and ending at index `d`. If `cp[d+1]` is in `DASH` ∪ `INERT-DASH`, **or** `cp[d+1]` is in
     `SPACE` ∪ `NOBREAK-SPACE` and `cp[d+2]` is in `DASH` ∪ `INERT-DASH`, emit nothing.

   Read plainly: **a tight token must not become spaced when doing so would insert a space
   between itself and a digit run that has another dash on its far side.** That inserted space
   is the only thing this rule can do that changes a _different_ token's `before`/`after` from
   a dash into a space, which is the single remaining way a range verdict can flip between
   runs (§5.3). The two-code-point reach on each side exists because the other dash may be
   tight against the digit run (`a–1-1`) or spaced away from it (`a–1 - 1`); both distances
   have to be caught, and no third distance is reachable, because a `-spaced` replacement
   inserts exactly one U+0020.

   The guard is deliberately narrow. It never fires when the token is already spaced, never
   when the locale form is `-tight` or `none`, and never when the token's neighbours are
   letters — so `Der Plan--falls es einen gibt--scheitert.` and `Seiten 34-36` are unaffected,
   and `— 1914-1918 годы` still converts its range. What it does cost is written up in §7.9.

9. **Composition guard (T2).** Like T1 this depends on the chosen replacement form, so it is
   evaluated immediately before emitting, in either branch. It exists to discharge the
   composition obligation against `spaces` (order 10) — see
   [pipeline-idempotency.md](pipeline-idempotency.md) §4, defect family 1.

   If the chosen form is `em-spaced` or `en-spaced`, so that the replacement emits a U+0020 on
   each side, then **emit nothing** if either:
   - `cp[R]` is in **T2's own set** — { U+002C, U+002E, U+003B, U+003A, U+0021, U+003F, U+2026 }
     — or in `CLOSE-BRACKET` = { U+0029, U+005D, U+007D }; or
   - `cp[L]` is in `OPEN-BRACKET` = { U+0028, U+005B, U+007B }.

   **T2's set is not `spaces`' `STRIP-BEFORE`, and this document used to claim it was.** They
   differ by exactly one code point: U+2026 is in T2's set and is **not** in `STRIP-BEFORE`
   (`spaces.md` §3.1, §3.4). The old claim — "these are precisely the positions from which
   `spaces` deletes a U+0020" — was true when written and became false when U+2026 left
   `STRIP-BEFORE`; a port transcribing the *rationale* rather than the list would convert
   `a--…` to `a – …` in every `-spaced` locale, where the JS implementation declines. Both
   behaviours are idempotent, so no property test separates them: only a fixture can, and one is
   needed (§7.15).

   **U+2026 stays in T2's set.** T2 is deliberately the wider of the two: its job is to avoid
   emitting a space that something else will remove, and declining one code point more than
   strictly necessary costs a conversion nobody writes (`a--…`) while keeping the guard's
   verdict independent of `spaces`' exact membership — which has now changed once. The two sets
   are related but not equal, and the relationship is stated rather than assumed:
   **T2's set ⊃ `STRIP-BEFORE`, by U+2026.**

   The positions in `STRIP-BEFORE` and the bracket sets are those from which `spaces` deletes a
   U+0020 (`spaces.md` §3.2
   step 5). Emitting a space there produces text that is a fixed point of _this_ rule and not
   of `spaces`, so the next pipeline pass deletes the space, the token becomes asymmetrically
   spaced, and this rule then declines it — a two-pass divergence:

   ```
   de-DE:   .--.   →   . – .   →   . –.
   ```

   A dash spaced against a full stop, a comma or a bracket is not a construction that occurs in
   real copy, so declining costs nothing. Note that the guard is only needed for the `-spaced`
   forms: a `-tight` form emits no U+0020 at all, and `en-US` (`em-tight`) never triggered the
   defect.

### 3.2a `JOINER` neighbours

A `JOINER` adjacent to the token is examined before the branch is chosen:

- Let `L*` be `L` moved left across a maximal run of `JOINER`, and `R*` be `R` moved right
  across a maximal run of `JOINER`. If either walk runs off the array, emit nothing.
- If no joiner was crossed, `L* = L` and `R* = R` and nothing about the rest of the algorithm
  changes.
- If a joiner **was** crossed and `cp[L*]` and `cp[R*]` are both in `DIGIT`, the token is a
  bound range this rule produced on an earlier pass (§3.3.1): continue with `L*`/`R*` in place
  of `L`/`R`, and extend the token's span to cover the crossed joiners.
- If a joiner was crossed in any other configuration, **emit nothing**. An author who typed
  U+2060 next to a dash meant it, exactly as with `INERT-DASH` (§3.1).

This is what makes the binding survive a second pass without a second joiner being added, and
what keeps this rule from rewriting a joiner it did not put there.

### 3.2b `JOINER` is transparent to every lookaround that leaves the token

§3.2a makes a joiner transparent to the token that **owns** it. That is not enough, and the gap
cost an idempotency defect (§5.2, defect (e)). A joiner also sits in the lookaround of a
**neighbouring** token, where nothing was skipping it.

> **Effective neighbour.** For an index `i` and a direction, step outward across any maximal run
> of `JOINER` and take the first code point that is not a `JOINER`, or `NONE` if the walk leaves
> the array.
>
> **Every guard that inspects a code point outside its own token's dash run reads an effective
> neighbour, not a raw index.** That is: `before` and `after` in §3.3 — and therefore G1, G2 and
> G3 — and the two-code-point reach of T1 (§3.2 step 8). `cp[L]` and `cp[R]` are already
> joiner-skipping through §3.2a's `L*`/`R*`.
>
> **`JOINER` is additionally a member of the cluster alphabet** (§3.2 step 7), so a joiner cannot
> split a cluster that would otherwise have contained two dash runs.

**Why this is forced rather than chosen.** `JOINER` is in this rule's own emission alphabet.
By CO-S (`pipeline-idempotency.md` §5.1a), every guard must be inert to every character the rule
can emit — otherwise the guard's verdict depends on **whether the rule has already run**, which
is precisely non-idempotency. A rule that cannot see through its own output is reasoning about a
shape it created. §3.2a applied that principle to the token; §3.2b applies it everywhere else,
and the two together are the complete statement.

---

### 3.3 Range branch

The token is a **range candidate** iff `cp[L]` is in `DIGIT` **and** `cp[R]` is in `DIGIT`.
If it is a range candidate, the parenthetical branch is never considered for this token,
whether or not the guards below pass.

Compute:

- `Lrun` = the maximal run of `DIGIT` ending at `L` (indices `a … L`);
- `Rrun` = the maximal run of `DIGIT` starting at `R` (indices `R … b`);
- `before` = the **effective neighbour** (§3.2b) to the left of index `a`, i.e. the first
  non-`JOINER` code point at or before `a-1`, or `NONE`;
- `after` = the **effective neighbour** to the right of index `b`, or `NONE`.

All five guards must pass:

- **G1 — no letter adjacency.** `before` is not in `LETTER`. (`MP3-4`, `H2-2` rejected.
  `COVID-19` is already rejected earlier, at §3.2 step 3/§3.3, because `cp[L]` is `D`, a
  letter, not a digit.)
- **G2 — no chain.** `before` is not in `DASH` and not in `INERT-DASH`; `after` is not in
  `DASH` and not in `INERT-DASH`. This protects `2026-08-15`, `978-3-16-148410-0` and
  `212-555-1234`.
  **G2 and §3.2 step 7 are both required. Neither subsumes the other, and an implementation
  must check both.** An earlier revision of this document called G2 redundant and invited an
  implementation to check either one; that was wrong, and it is the kind of latitude that
  makes two ports disagree. The two guards see different things:
  - step 7 sees dashes reachable from the token's run **without crossing a space**, which is
    the only reach it has, because a cluster ends at the first space-like code point;
  - G2 sees the code point adjacent to `Lrun`/`Rrun`, which for a **spaced** token lies
    outside the token's own cluster entirely.
    In `a–1 - 1` the range token `-` is spaced, so its cluster is just `{-}` with one dash run
    and step 7 passes; only G2 rejects it, on `before` = U+2013. Remove G2 and the first pass
    already converts it.
- **G3 — not part of a decimal or path.** `before` is not U+002E (.), U+002C (,) or U+002F
  (/); `after` is not U+002F (/). `1.5-2.5` and `01/02-03/04` are left alone.
- **G4 — run lengths.** Either `length(Lrun) = length(Rrun)`, **or** `length(Lrun) = 1` and
  `length(Rrun) = 2` and `Rrun` does not begin with U+0030 (`0`).
  `1914-1918` (4,4) passes; `5-10` (1,2) passes; `0-60` (1,2) passes — the leading-zero clause
  constrains `Rrun` only. `ISO 8859-1` (4,1) fails; `555-1234` (3,4) fails; `1-800` (1,3)
  fails; `2020-24` (4,2) fails; `10-7` (2,1) fails; `9-05` fails on the leading zero.

  **Why this exact shape, and what breaks if it is "simplified".** The obvious generalisation
  is _"allow unequal lengths when both runs are at most two digits"_. Do not adopt it. The
  narrow `(1,2)` branch is not an arbitrary restriction of it — it is the largest widening that
  leaves **G5 correct without modification**, and every part of the clause is load-bearing:

  - **The `(1,2)` branch is exactly what keeps G5's equal-length lexicographic shortcut
    valid.** G5 compares two digit strings left-to-right, which is an integer comparison _only_
    when the strings have the same length. In the `(1,2)` branch G5 cannot fail — a one-digit
    run is at most 9 and a two-digit run without a leading zero is at least 10 — so G5 is
    vacuously true there and is never asked to compare unequal lengths. Its shortcut therefore
    remains sound in the only branch where it does any work.
  - **The leading-zero clause is what keeps G5 vacuous.** Without it, `9-05` would enter the
    new branch, and `05` has the value 5, so the pair is _descending_ — a case G5 exists to
    reject but, being specified for equal-length runs, cannot evaluate. Blocking a `Rrun` that
    begins with U+0030 removes the only counterexample and keeps the "one digit is always
    smaller than two digits" reasoning airtight.
  - **Widening to `(2,1)` breaks G5 without touching it.** A contributor who reads this guard
    as "small magnitudes are fine, so allow `10-7` too" would admit descending pairs whose
    lengths differ, and G5's left-to-right comparison would then silently compare `"10"` with
    `"7"` and conclude `10 < 7`, because `'1' < '7'`. Nothing would look wrong in G5, no test of
    G5 in isolation would fail, and the defect would surface as a wrong conversion. `(2,1)` is
    excluded deliberately, and any future change to it must respecify G5 first.

  The same trap catches a port that widens G4 correctly but transcribes G5 literally: for
  `5-10`, a naive lexicographic comparison yields `"5" > "1"` and silently declines the very
  case this branch exists to admit. §6 cases 3a–3d exist to catch that.

- **G5 — non-decreasing.** The integer value of `Lrun` is less than or equal to the integer
  value of `Rrun`. Compare digit-by-digit from the left (in the only branch where this test can
  fail, the runs have equal length by G4, so no arithmetic and no overflow is needed — this is
  a lexicographic comparison of two equal-length ASCII digit strings, which is identical in
  every runtime; see G4 on why the `(1,2)` branch cannot reach it). `1914-1918` passes;
  `1234-5678` passes; `20-10` fails.

If all guards pass, emit one edit replacing `cp[s - lsp … e - 1 + rsp]` (the token together
with its outer spacing) with:

| `dash.range`  | replacement                                             |
| ------------- | ------------------------------------------------------- |
| `"em-tight"`  | U+2014                                                  |
| `"em-spaced"` | U+0020 U+2014 U+0020                                    |
| `"en-tight"`  | U+2013                                                  |
| `"en-spaced"` | U+0020 U+2013 U+0020                                    |
| `"none"`      | _(emit nothing — the token is left exactly as written)_ |

**Subject to guards T1 and T2 (§3.2 steps 8 and 9), which are evaluated now that the form is
known.** If the replacement is identical, code point for code
point, to the span it would replace, emit nothing instead.

If any guard fails, emit nothing. **The token is not reconsidered as a parenthetical dash.**
A stroke between two digits is a range or it is nothing; turning `ISO 8859-1` into
`ISO 8859 — 1` would be far worse than leaving it.

#### 3.3.1 Binding a tight range

A range is a single lexical unit and must not be broken across lines. UAX #14 gives U+2013 and
U+2014 the line-break class `BA` (break after), so a renderer is free to break `1914–1918`
after the dash, and Мильчин and Chicago both forbid that break in running text.

Therefore, **when the chosen `dash.range` form is `-tight` and all guards have passed, the
emitted replacement is `JOINER dash JOINER`** — U+2060, the dash, U+2060 — and the edit span
covers any `JOINER` already adjacent to the token (§3.2a).

- U+2060 is zero-width and has no other effect on rendering, unlike a no-break space.
- Markup is not an option: the mode contract (`modes.md` §1) states that output is the input
  with disjoint substring replacements applied and nothing else, so a rule may never emit a
  `<span>` or a `<nobr>`. The binding has to be a character.
- **A `-spaced` range form is not bound.** Its two U+0020 are breakable by construction; a
  joiner around the dash would forbid the one break the form itself invites, and no cited
  source asks for that.
- **`none` emits nothing at all**, joiner included (§2).

The parenthetical branch never emits a joiner: an interrupting dash is exactly where a line
_may_ break.

**A range already in its exact target form — glyph, length and spacing — is never bound.**
`1914–1918` in a locale whose `dash.range` is `en-tight` is already correct in every visible
respect; adding only a `JOINER` pair would be an edit whose entire content is invisible, and
this rule never makes one (§7.13). Concretely: compute the replacement with `bind = false`
first — call it the *unbound form*. If the unbound form is identical, code point for code
point, to the span it would replace, the token is left exactly as written; no joiner is added
even though the hyphen-typed `1914-1918` gets one for the same locale. If the unbound form
differs from the input — because the glyph, the length or the spacing is genuinely changing —
the edit is visible on its own merits, and `bind` reverts to `isRange ∧ ¬isSpaced(style)` as
normal: the joiner rides along with a real conversion, which is never itself the only thing an
edit does. This test is evaluated the same way regardless of what the original dash glyph was;
§3.2 step 2a's retirement removed the token-level distinction, and this paragraph's invisible-
edit test is what actually decided the binding question all along — length-preservation was
never load-bearing for it.

The asymmetry this creates is real and is recorded rather than left to be discovered: in one
document, a hyphen-typed range and an already-correct dash-typed range of the same shape come
out differently bound, and nothing visible distinguishes the two outputs. §7.14.

---

### 3.4 Parenthetical branch

Reached only when the token is not a range candidate (i.e. at least one of `cp[L]`, `cp[R]`
is not a `DIGIT`). Additional guards:

- **P1 — a bare hyphen-shaped stroke must be spaced.** If `k = 1` and `cp[s]` is U+002D,
  U+2010 or U+2212 and `lsp = 0`, emit nothing. This is the compound-word guard: `well-known`,
  `e-mail`, `Jean-Luc`, `по-русски`, `well‐known` (U+2010) and `a−b` (U+2212, the same tight
  attached shape) are all untouched. U+2013/U+2014 are never a compound-word substitute — no
  author writes a compound word with a real en or em dash — so this guard never covers them.
  (`lsp = rsp` by §3.2 step 4, so testing one side suffices.)
- **P2 (restored, spec 0.2.0) — an en or em dash is a parenthetical dash, promoted to the
  locale's form exactly as a hyphen would be.** Spec 0.1.0's step 2a made every token holding
  U+2013/U+2014 unreachable in this branch, which made this clause dead code, so it was deleted
  rather than left to rot. 0.2.0 retired step 2a outright (its history note explains why), so
  U+2013/U+2014 reach this branch again on the same terms as U+002D, and the clause is restored
  under its original label and its original, unconditional wording: length and spacing are both
  corrected, with no distinction based on which `DASH` glyph the author typed.
- **P4 — Roman-numeral veto.** If `lsp = rsp = 0` (the token is tight), and the maximal run of
  `ROMAN` code points ending at `cp[L]` is non-empty, and the maximal run of `ROMAN` code points
  starting at `cp[R]` is non-empty, and each of those runs is bounded on its outer side by a
  code point that is not in `LETTER`, then **emit nothing**.

  A tight dash between two Roman numerals is a **range** — `в XV—XVII веках`, `Louis XIV—XVI` —
  and Russian sets ranges with a tight em dash, which is exactly the form already present. The
  range branch cannot see it, because §3.3 admits a range candidate only when a `DIGIT` stands
  on each side; so without this veto the token falls through to the parenthetical branch and an
  `em-spaced` or `en-spaced` locale **damages correct input**: `в XV—XVII веках` becomes
  `в XV — XVII веках`. That is the worst category of defect in this project — not a missed
  improvement but a corruption of text that was already right — and the `ru` locale file's own
  citation uses that very phrase as its range example.

  P4 is a **veto, not a range-enabler**: it declines, and never converts anything. Making
  `ROMAN` runs into full range candidates would let `XV-XVII` (typed with a hyphen) become a
  proper range, but it would also fire on ordinary all-caps words built only from Roman letters
  — `VIVID`, `CIVIL`, `MIX`, `DID` — and converting is the direction that can damage. §7.6
  records the miss.

  Lower-case is excluded for the same reason: `mix—did` must still normalise, and lower-case
  Roman numerals in running prose are vanishingly rare next to lower-case words made of the same
  letters.

- **P3 — a run of 2 or 3 qualifies regardless of spacing**, subject to §3.2 step 4 having
  already required the spacing to be symmetric. `word--word` and `word -- word` both qualify;
  `--force` does not (asymmetric); `---` used as a Markdown thematic break does not (it sits
  alone on its line, so §3.2 step 5 rejects it for want of content on both sides).

Emit one edit replacing `cp[s - lsp … e - 1 + rsp]` with:

| `dash.parenthetical` | replacement                                             |
| -------------------- | ------------------------------------------------------- |
| `"em-tight"`         | U+2014                                                  |
| `"em-spaced"`        | U+0020 U+2014 U+0020                                    |
| `"en-tight"`         | U+2013                                                  |
| `"en-spaced"`        | U+0020 U+2013 U+0020                                    |
| `"none"`             | _(emit nothing — the token is left exactly as written)_ |

**Subject to guards T1 and T2 (§3.2 steps 8 and 9), evaluated now that the form is known.** If the replacement is identical to the span it replaces, emit
nothing.

### 3.5 Continue, and the non-overlap guarantee

Set `i` to the index just past the token's run in the **input** array and continue from §3.2
step 1. Because every edit is computed against input indices and the pipeline applies edits
afterwards, no index arithmetic on a partially rewritten array is ever required.

An edit's span is `cp[s - lsp … e - 1 + rsp]`, which includes the outer spacing. Two such
spans could in principle overlap: if two tokens are separated by exactly one space, that one
space is the first token's `rsp` and the second token's `lsp`, both spans claim it, and the
pipeline sees overlapping edits — which is a `POLYTYPO_RULE_CONTRACT` violation, not a
merge.

**This cannot happen after §3.2 step 6.** Overlap requires `rsp₁ = 1`, `lsp₂ = 1`, and the
shared space at index `e₁ = s₂ - 1`. But then the second token's `cp[L]` is `cp[s₂ - 2] =
cp[e₁ - 1]`, the last code point of the first token's run, which is in `DASH` — so step 6
makes the second token inert. Symmetrically the first token's `cp[R]` is the second token's
first dash, also in `DASH`, so it too is inert. The `dash space dash` shape produces **no
edits at all**, and every pair of emitted spans is therefore separated by at least one code
point that is neither a dash nor a claimed space.

**Normative fallback.** If an implementation nevertheless computes two overlapping spans, the
leftmost token wins and the later token is discarded — the same first-claim-wins policy
`nbsp` uses (see `nbsp.md` §3.2). This is stated so that behaviour is defined rather than
undefined; it is unreachable under the algorithm as written, and an implementation that finds
it reachable has found a bug in this document and should report it rather than rely on the
fallback.

### 3.6 No-break spaces are never touched, and never need preserving

A no-break space adjacent to a dash makes the token inert (§3.2 step 3 + step 6), so this rule
never edits a span containing one and there is nothing to preserve. **Earlier revisions of this
document carried a preservation clause here** — the emitted replacement was to carry a
pre-existing U+00A0 across rather than substitute U+0020 — and it existed only because those
revisions counted a no-break space as spacing and therefore _did_ edit such tokens. With that
gone the clause is vacuous, and vacuous clauses in a spec are a liability: an implementer who
finds one either writes dead code or invents a case to justify it.

The Russian case the clause was written for still comes out right, by a shorter route. Pass 1
converts `Москва - столица` to `Москва — столица` (`em-spaced`, both sides U+0020); `nbsp` then
promotes the leading space to U+00A0 because `ru` lists U+2014 in `nbsp.beforePunctuation`,
giving `Москва⍽— столица`. On the next pass this rule finds `lsp = 0`, `rsp = 1`, declines at
the symmetry guard, and emits nothing. Same output, reached by declining rather than by
recomputing an identical span.

**Every space in an emitted replacement is therefore U+0020 and nothing else.** A `-spaced`
form emits U+0020 on each side, a `-tight` form emits none, and no other _space_ character can
appear in an edit this rule produces. The one non-space code point this rule emits is U+2060,
around a tight range dash and nowhere else (§3.3.1); it is not a space, is zero-width, and is
governed by its own guard in §3.2a.

---

## 4. Must not touch

**Scope.** Per [pipeline-idempotency.md](pipeline-idempotency.md) §5.2 each bullet is **[P]** —
a guarantee of `transform` as a whole — or **[R]** — true of this rule in isolation but capable
of being falsified by another rule, which is then named.

- **[P] The hyphen in a compound word.** `well-known`, `e-mail`, `Jean-Luc`, `well-being`,
  `из-под`, `кое-что`, `-таки`. Guard P1.
- **[P] A leading or trailing hyphen with asymmetric spacing:** `--force`, `-v`, `- item`
  (Markdown/YAML list), `-- signature`, `->`, `<-`. Guard §3.2 step 4.
- **[P] A Markdown thematic break or setext underline** (`---`, `----`, a line of hyphens):
  rejected by §3.2 step 2 (`k > 3`) or step 5 (no content on both sides).
- **[P] ISO dates** `2026-08-15`, **ISBNs**, **phone numbers**, **part numbers**: guard G2 (chain)
  and G4 (equal digit count).
- **[P] `COVID-19`, `MP3-4`, `Windows-1252`, `ISO 8859-1`, `UTF-8`**: guards §3.3 entry
  condition, G1 and G4.
- **[P] A tight dash between two Roman numerals**, in either direction: `XV—XVII`, `I—V`,
  `Louis XIV—XVI`. Guard P4. Note this is a _preservation_ claim, not a conversion one — the
  input is already correct and the rule's job is to leave it alone.
- **[P] Any member of `INERT-DASH`** (spec 0.2.0): U+00AD, U+2011, U+2012, U+2015, and the
  fullwidth/small forms U+FE58, U+FE63, U+FF0D. Neither read as a candidate nor produced. **Not
  a member since 0.2.0: U+2010 and U+2212 are ordinary `DASH` candidates** (§3.1) — `x ‐ y`
  (U+2010) and `x − y` (U+2212) both convert to the locale's parenthetical form, and
  `1990−2000` converts and binds as a range.
- **[P] A negative number.** `-5` has no space to the left of the digit and a letter/space to
  the left of the hyphen → asymmetric → rejected. This holds for U+002D, U+2010 and U+2212
  alike — the same asymmetry guard, not a glyph-specific one.
- **[P] Digit-flanked strokes that fail the range guards.** Left alone entirely, never
  reinterpreted as parenthetical (§3.3, final paragraph).
- **[P] URLs, code spans, fenced code, HTML attributes.** Removed by the mode adapter before this
  rule sees them. This rule has no notion of a URL and must not grow one.
- **[P] Line terminators**, which are never inserted, deleted or crossed.

---

## 5. Idempotency argument

Write `T` for the rule. `T` edits only **dash tokens**: each edit replaces a span consisting
of one maximal `DASH` run plus at most one space-like code point on each side, with a span of
the same shape. `T` never touches a letter, a digit, an `INERT-DASH`, a line terminator, or
any space that is not immediately adjacent to a dash run. §3.5 establishes that the emitted
spans are pairwise disjoint.

### 5.1 The output forms are fixed points

Each emitted form, re-classified on the next run, produces an identical replacement and
therefore no edit:

| Emitted form                          | Re-read as               | Replacement recomputed |
| ------------------------------------- | ------------------------ | ---------------------- |
| `X` tight (`em-tight`/`en-tight`)     | `k = 1`, `lsp = rsp = 0` | same single code point |
| `␣X␣` spaced                          | `k = 1`, `lsp = rsp = 1` | same three code points |
| nothing (`"none"`, or a failed guard) | unchanged token          | nothing                |

A tight parenthetical form is re-admitted by P2 (`k = 1`, not U+002D). A spaced one likewise.
A tight range form is re-admitted because its `Lrun`/`Rrun`/`before`/`after` are untouched by
the edit (the edit replaced only the dash and its spacing). A token that `nbsp` has since
promoted (`ru`: U+00A0 before an em dash) is not recomputed at all — it is declined at the
symmetry guard, which emits nothing, so the output is equally stable (§3.6).

### 5.2 A declined token stays declined

This is where the previous version of this document was **wrong**. It argued that "a declined
token is separated from any edited token by at least one non-space, non-dash content
character". That claim is false, and two counterexamples were found against the
implementation:

**Defect (a) — `DASH digits DASH`.** `ru` (`parenthetical: em-spaced`, `range: em-tight`),
input `a—0–0`. The em dash is a parenthetical token (`cp[L]` is a letter) and normalises to
`␣—␣`. The en dash is a range candidate whose `before` is that em dash, so G2 rejected it.
After the first edit `before` is a **space**, G2 no longer rejects, and the second run emits
`0—0`:

```
run 1:  a—0–0   →  a — 0–0
run 2:  a — 0–0 →  a — 0—0     ← not a fixed point
```

The flaw is structural: a range token's `before`/`after` may belong to a _neighbouring token_,
and normalising that neighbour changes it. **Repaired by the cluster guard, §3.2 step 7.**
`a—0–0` is one cluster (`—`, `0`, `–`, `0`) containing two dash runs, so both tokens are inert
and run 1 already returns the input unchanged. The same repair covers the mirror case
`1914-1918—annexation`, which converged in two runs in an `em-spaced` locale for exactly the
same reason.

**Defect (b) — `DASH SPACE DASH`.** `en-US` (`parenthetical: em-tight`), input `a- - a`. The
first hyphen is asymmetric and is rejected. The second is symmetric with `cp[L]` = `-`, which
step 6 did not reject, so it normalised to a tight em dash — placing it directly against the
first hyphen, where the two form a **single run of length 2** with a different verdict:

```
run 1:  a- - a  →  a-—a
run 2:  a-—a    →  a—a         ← not a fixed point
```

**Repaired by extending §3.2 step 6** to reject a `DASH` neighbour at `cp[L]` or `cp[R]`. Both
tokens in `a- - a` are now inert and run 1 returns the input unchanged. The same extension is
what gives §3.5 its non-overlap guarantee.

**Defect (c) — `DASH digits SPACE DASH SPACE digits`, the spaced form of (a).** The cluster
guard added for defect (a) was not enough, and the §5.3 argument written alongside it was
unsound a second time. Witness, found by exhaustive search over the shipped locales:

```
de-DE   a–1 - 1   →   a – 1 - 1   →   a – 1–1
ru      a–1 - 1   →   a — 1 - 1   →   a — 1—1
```

It reproduces in `de-CH`, `de-DE`, `en-GB`, `fi`, `ru` and `sv` — **every locale whose
`parenthetical` is `-spaced` and whose `range` is not `none`.** `en-US` (`em-tight`) and `fr`
(`range: none`) are immune, which is why no worked example caught it.

The cluster guard misses it because a cluster ends at the first space-like code point. The
range token `-` here is **spaced**, so its own outer spacing terminates its cluster: the
cluster is the single dash run, step 7 passes, `cp[L]` is a digit belonging to a _neighbouring_
cluster, and `before` is a dash in a _third_ one. Only G2 sees that dash. Then the
parenthetical `–` normalises from tight to spaced, inserting a U+0020 exactly where `before`
was, and on the second pass G2 admits the range.

**Repaired by §3.2 step 8**, the spacing-transition guard: a tight token may not become spaced
when that would insert a space between itself and a digit run that has another dash on its far
side. In the witness the `–` is tight, `de-DE` would make it spaced, and the digit `1` to its
right has a `-` two positions beyond — so the `–` is inert, and the input is a fixed point on
the first pass. §5.3 is rewritten to an argument that covers spaced tokens.

**Defect (d) — a manufactured left space, and the third failure of the same repair.** `fr`,
where `quotes.primary.innerSpace` is `nbsp` and `dash.parenthetical` is `em-spaced`:

```
«– "   →   « – "   →   « — "
```

Five witnesses, one family, `fr` only: `«` followed by U+002D or U+2013, then U+0020, then any
content — `«– «`, `«– "`, `«– '`, `«– a`, `«– 1`. Zero in every other locale.

On pass 1 the token is asymmetric (`lsp = 0` because `«` is not a space, `rsp = 1`) and is
declined. `nbsp` N8 then inserts the guillemet's inner U+00A0 after `«`. On pass 2 the token
has a no-break space on the left and an ordinary space on the right — and under the _previous_
formulation, in which a `NOBREAK-SPACE` counted as spacing **on the left**, that read as
symmetric. The token was promoted from en to em.

**This one matters more than (a), (b) and (c).** Those needed hand-typed straight marks; this
input is _already-typeset text_ built from characters the pipeline itself emits — `«` from
`quotes`, U+00A0 from `nbsp`, `–` from this rule. It is reachable by re-processing our own
output, which is the CMS-on-every-save case PLAN.md §1 names as the reason idempotency is the
package's headline property.

**It was also self-inflicted.** The left-only rule was introduced as the repair for defect
family 2, and it is precisely what made (d) reachable: before it, no no-break space counted as
spacing at all. Three of the four repairs in this area have been of the form "decide which
space characters count on which side", and each one fixed its witness and exposed the next.

**Repaired by removing the whole class of reasoning** (§3.2 step 3): only U+0020 is this rule's
spacing, a no-break space on either side makes the token inert, and therefore _every_ character
`nbsp` can emit is inert here. That is a structural discharge of the composition obligation
rather than a case analysis, and it is generalised in
[pipeline-idempotency.md](pipeline-idempotency.md) §5.1a as condition **CO-S**.

**Defect (e) — the joiner blinds a neighbour's G2.** `de-DE`, and every one of the seven
locales whose `range` is not `none`:

```
1-1 - 1   →   1⟨J⟩–⟨J⟩1 - 1   →   1⟨J⟩–⟨J⟩1⟨J⟩–⟨J⟩1
```

This is **defect (a) in a new dress**, and it arrived with §3.3.1's joiner rather than with the
authored-dash guard. On pass 1 the second token is a range candidate whose `before` is the first
token's hyphen, so G2 rejects it. Pass 1 then converts the first token and emits
`JOINER dash JOINER` — and the joiner now sits between the digit run and the dash, so on pass 2
the second token's `before` is a `JOINER`, which is in neither `DASH` nor `INERT-DASH`. G2
admits, and the second range converts a pass late.

Two facts isolate it from the authored-dash guard: on pass 2 the only edit is on the **hyphen**
token, not on the dash the rule had already produced; and the same shape written with an authored
dash, `1–1 - 1`, was a fixed point throughout, because there G2 sees a real `DASH`.

The joiner does to G2 exactly what a `-spaced` replacement does — it puts something between the
digit run and the dash — and **T1 fires only for `-spaced` forms**, so a `-tight` range had no
cover at all.

**Repaired by §3.2b:** every guard that leaves its own token reads an *effective neighbour* that
skips joiners, and `JOINER` joins the cluster alphabet. The witness is then rejected by G2 on
every pass, exactly as on pass 1.

**Why the committed sweep did not catch it, which matters more than the defect.** The witness is
**seven characters**; `pipeline-idempotency.md` §6 mandated exhaustive coverage to length **four**.
No precondition was hiding it and nothing was excluded — the bound simply could not reach it. A
normative bound that cannot reach a known witness will hide the next one, and §6 has been changed
accordingly.

### 5.3 The repaired argument

The previous two revisions of this section were both unsound, in the same place: they
reasoned about which code points an edit can touch, and drew the boundary too tightly. The
argument below is organised the other way round — it enumerates the _inputs to a verdict_ and
shows, for each, that the rule cannot change it.

**What an edit can do.** An edit replaces `cp[s-lsp … e-1+rsp]` — one maximal `DASH` run plus
at most one space-like code point on each side — with `space? dash space?`. Therefore an edit
can only ever:

- **(E1)** replace one dash with another dash at some position;
- **(E2)** shorten or lengthen a dash run (`--` → `—`), without creating a space;
- **(E3)** delete a U+0020 that was adjacent to a dash (a `-tight` form);
- **(E4)** insert a U+0020 adjacent to a dash (a `-spaced` form).

It can never touch a letter, a digit, a `.`, a `,`, a `/`, a line terminator, or any space
that is not adjacent to a dash run. §3.5 establishes that edit spans are pairwise disjoint.

**What a verdict reads.** For a token `T`: `k`; `lsp`, `rsp`; `cp[L]`, `cp[R]`; the cluster
containing `T`'s run; and, when `T` is a range candidate, `Lrun`, `Rrun`, `before`, `after`.
Take them in turn.

- **`k` and the run.** `T`'s run is outside every edit span. No edit can join two runs: E2 and
  E3 are the only edits that shorten anything, and by §3.2 step 6 the code point beyond a
  token's spacing on either side is neither a dash nor space-like, so the gap between two runs
  is never closed. _(Defect (b) was exactly this, before step 6 rejected a `DASH` neighbour.)_
- **`lsp`, `rsp`.** They probe `cp[s-1]` and `cp[e]`. If either lay in another token's edit
  span, the two tokens would be adjacent or separated by one shared space — the `dash dash`
  or `dash space dash` shape — excluded by maximality and by step 6 respectively.
- **`cp[L]`, `cp[R]`.** Suppose `cp[L]` lies in an edited token `T'`'s span. Then `cp[L]` is a
  dash of `T'` or an outer space of `T'`. **Either way step 6 declined `T`** — it rejects both
  `DASH` and space-like at that position — and either way the position still holds a dash or a
  space after `T'`'s edit (E1–E4 never put a letter or digit there). So `T` is declined again,
  for the same reason. This is why step 6's space-like clause is load-bearing and not
  defensive padding.
- **The cluster.** A cluster with ≥2 dash runs emits nothing at all, so it is byte-identical
  next run and stays inert. A cluster with exactly one dash run may be edited; the edit cannot
  **merge** it with a neighbouring cluster except by E3, deleting a space — and a merge only
  ever _adds_ dash runs to a cluster, which can only make more tokens inert, never fewer. It
  cannot **split** a live cluster into a state that revives something, because a split (E4)
  turns a one-dash-run cluster into one-dash-run pieces. And it cannot split an _inert_
  cluster at all, because an inert cluster emits nothing. So no token moves from inert to
  live via the cluster guard.
- **`Lrun`, `Rrun`.** Digit runs. No edit touches a digit.
- **`before`, `after` — the case that failed twice.** These are the code points adjacent to
  `Lrun` and `Rrun`, and for a _spaced_ token they lie two positions beyond `cp[L]`/`cp[R]`,
  outside the token's own cluster, where neither step 6 nor step 7 can see them. G1, G3 and G5
  read them for membership in `LETTER`, `.`/`,`/`/` and digit value — none of which any edit
  can produce or destroy. **G2 reads them for membership in `DASH` ∪ `INERT-DASH`, and that is
  the one verdict input this rule is capable of changing**, via E4: a neighbouring tight token
  that becomes spaced replaces a dash at that position with a space, turning a G2 rejection
  into a G2 admission.

  Every instance of that flip has the same shape. Let `T` be a range token that G2 rejected,
  so `before` (say) is a dash at index `d-1`, where `d` is the start of `Lrun`. For that dash
  to become a space, it must be inside some edited token `A`'s span, and `A`'s replacement
  must place a U+0020 at exactly that index — which requires `A`'s run to end at `d-1` with
  `rsp_A = 0`, and `A`'s chosen form to be `-spaced`. In other words: **`A` is tight, `A` is
  about to become spaced, and the side of `A` that is about to gain a space faces `Lrun`,
  which has a dash on its far side.** That is precisely, and only, the configuration that
  **§3.2 step 8 declares inert.** The same argument mirrored gives the `after` side and `A`
  tight on its left.

  Step 8's two-code-point reach is exactly what the case requires and no more: `T`'s dash sits
  at distance 1 from `Lrun` if `T` is tight and distance 2 if `T` is spaced, and a `-spaced`
  replacement inserts exactly one U+0020, so no other distance is reachable.

  The reverse flip — `before` going from a space to a dash, via E3 — is benign and needs no
  guard. It turns a G2 admission into a G2 rejection, and a rejection emits nothing, so a
  token converted on the first run simply keeps the form it was given. Output unchanged.

Every input to every verdict is therefore stable across a re-run, and by §5.1 every emitted
form recomputes to itself. Hence `T(T(x)) = T(x)`. ∎

**Why this version should be trusted more than the last two.** The failed arguments both
worked forwards — "here is what an edit touches, therefore nothing else can be affected" —
and both missed a verdict input that sits further from the edit than the guards reach. This
one works backwards from the verdict inputs, and it identifies **one** input (G2's dash test)
as the only one the rule can perturb, then points at the single guard that forbids the
perturbation. The claim is now falsifiable in a useful way: if a counterexample exists, it
must be an edit that changes `before` or `after` from a dash to a space without being a tight
token becoming spaced against a digit run — and E1–E4 admit no such edit.

### 5.3a What retiring the authored-dash guard does to the argument

**Spec 0.1.0's claim here was that the guard made this rule strictly more stable, because it
declined every token holding U+2013/U+2014 outright and so was inert to its own output in the
glyph-and-spacing dimension by construction, not by recomputation. That claim is retired along
with the guard.** Spec 0.2.0 gives U+2013/U+2014 no token-level treatment at all: from step 1
onward they are exactly as much a `DASH` member as U+002D, so every witness §5.1–§5.3 exists to
close is live for them too, and the stability argument has to cover them explicitly rather than
assume they are inert.

It reduces to two obligations, both already discharged elsewhere in this document:

- **Recomputation to a fixed point.** A token built from U+2013/U+2014 is, from the replacement
  step onward, computed by exactly the same code path as a token built from U+002D — §5.1's
  per-row argument (tight and spaced parenthetical forms recomputing to themselves, the range
  branch's `sameContent` no-op) already covers every shape this rule can produce, regardless of
  which `DASH` glyph the input held, and needs nothing added for it.
- **CO-S — this rule must be inert to its own output (`pipeline-idempotency.md` §5.1a).** A tight
  range this rule binds (§3.3.1) is, on its next pass, a single U+2013 or U+2014 reached by
  crossing its own `JOINER` pair. Under 0.1.0's guard this was the case the guard was built to
  recognise (via the crossed-joiner check re-admitting a digit-flanked token); under 0.2.0 the
  same token is now just an ordinary range candidate that happens to already hold the correct
  glyph, and §3.3.1's *invisible-edit test* — compute the unbound form, and bind only if the
  unbound form would itself be a visible change — is what keeps it a fixed point: the unbound
  form equals the input exactly (right glyph, right spacing), so `bind` stays `false` and the
  joiners are re-affirmed rather than stripped. This is the same test that discharges the
  ordinary "already-correct dash-typed range" case in the paragraph above; CO-S for the
  self-produced case falls out of it rather than needing a separate mechanism. This was
  confirmed, not merely argued: `tests/rules/dashes.test.ts`'s exhaustive bounded sweep and its
  `fast-check` idempotency property both cover the 0.2.0 code path and are green.

What the retirement does **not** change: the rule still emits U+0020 for hyphen input, so guard
T2 and the whole of defect family 1 remain live; it still emits U+2060, so §3.2a's joiner
handling remains live; and the guards that protect a hyphen token from a *neighbouring* dash —
step 6, step 7, G2 — are unaffected, because they always read `DASH` membership, never
authorship, and continue to.

**P2** is restored (§3.4) to its original, unconditional wording. **P4** still fires on
`XV--XVII`, a hyphen-run between Roman numerals, and now also on `в XV—XVII веках` typed with a
real em dash, for the same reason it always fired: a tight dash between two word-bounded `ROMAN`
runs is a range the parenthetical branch must not touch, regardless of which `DASH` glyph it is
made of. **T1** still fires on a tight `--` run facing a digit run with a dash beyond, and now
also on the same shape typed with U+2013/U+2014, U+2010 or U+2212.

### 5.4 Composition obligation

Per [pipeline-idempotency.md](pipeline-idempotency.md) §5. This rule is R₃, so the obligation
runs against `spaces` (R₁) and `ellipsis` (R₂).

**What this rule emits.** U+2013 or U+2014, at the position of a dash run; zero or one U+0020
immediately on each side of it. It deletes only U+0020 and dash code points. **It can never
emit a no-break space** (§3.6), a letter, a digit, a full stop or a line terminator.

**Against `I₁` (`spaces`).** This is the one obligation with teeth, because `dashes` is the
only rule in the pipeline that emits U+0020. The `-spaced` forms could place a space in a
position `spaces` deletes — violations S-b, S-c and S-d — and did: **that is defect family 1**,
repaired by guard T2 (§3.2 step 9). The remaining S-a violation (a run of two or more spaces)
is impossible: the replacement emits exactly one U+0020 per side, and step 6 guarantees the
code point beyond it is not space-like, so no run of two can form.

**Against `I₂` (`ellipsis`).** Discharged trivially: this rule never emits U+002E or U+2026,
and it never deletes a code point standing between two dot runs — every deletion is a U+0020
or a dash adjacent to the token, and a dot run is neither.

**What this rule must have preserved _for_ it.** `I₃` is what later rules must not break, and
`nbsp` (R₈) broke it twice — defect family 2 and defect (d) of §5.2. It is now discharged
**structurally** rather than by case analysis: `nbsp`'s entire emission alphabet is U+00A0 and
U+202F, both of which make an adjacent dash token inert (§3.2 step 3 + step 6). There is
consequently no input on which `nbsp` can create a dash token, alter one's spacing verdict, or
revive one this rule declined — which is condition **CO-S** in
[pipeline-idempotency.md](pipeline-idempotency.md) §5.1a. `hyphen` (R₄) converts
some U+002D to U+2011; that changes no verdict, because a U+002D `hyphen` claims is intra-word
and this rule had already declined it under P1, and because step 6, G2 and the cluster alphabet
all treat `DASH` and `INERT-DASH` alike. `quotes` (R₅), `apostrophe` (R₆) and `symbols` (R₇)
replace code points with characters in none of this rule's classes, and none of them changes
spacing.

### 5.5 What had to be fixed

1. _"Convert `-` to an en dash between numbers"_ re-fires forever in a `-spaced` locale.
   Fixed by making the edit span **include the outer spacing** and defining the replacement as
   the complete `space? dash space?` form.
2. _"A dash with a space on either side is parenthetical"_ turns `--force` and every Markdown
   bullet into an em dash. Fixed by the symmetry guard (§3.2 step 4).
3. _"If the range guards fail, fall through to the parenthetical branch"_ produces
   `ISO 8859 — 1`. Fixed by making the range branch terminal.
4. **Defect (b):** neighbouring dash tokens separated by one space merge into one run after
   the first edit. Fixed by the `DASH`/space-like extension of step 6, which also guarantees
   non-overlapping edits (§3.5).
5. **Defect (a):** a range token's `before`/`after` may be a dash owned by an adjacent token,
   whose normalisation flips the verdict. Fixed by the cluster guard, step 7.

6. **Defect (c):** the cluster guard cannot see a _spaced_ token's `before`/`after`, because
   a cluster ends at the first space, so a neighbouring tight-to-spaced normalisation still
   flipped a G2 verdict. Fixed by the spacing-transition guard, step 8 — and by rewriting
   §5.3 so that it reasons from verdict inputs rather than from edit reach, which is what let
   the same claim fail twice.

Items 4, 5 and 6 were shipped defects, not hypotheticals; all are in the worked examples as
cases 18–21 and 24–26.

---

## 6. Worked examples

`␣` = U+0020, `⍽` = U+00A0, `⟨J⟩` = U+2060 (word joiner), `⟶` = no change.

**A row containing an invisible code point must be checked in the escaped mirror, never read.**
U+2060 is zero-width: a range row that omits it looks _exactly_ right on screen and is wrong at
the byte level, which is how rows 3, 3a–3d, 3j, 13 and 17 below stayed stale after §3.3.1
started emitting it. `⟨J⟩` is a notation used only in this table; the fixture files carry the
real U+2060, and `spec/fixtures/.escaped/` is the only rendering in which its presence or
absence can actually be seen. The same applies to any future rule emitting U+00AD, U+200B or a
variation selector.

### `en-US` — `parenthetical: "em-tight"`, `range: "en-tight"`

| #   | Input                                         | Output                                | Why                                                                                                                                                                            |
| --- | --------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `The plan␣-␣if there is one␣-␣fails.`         | `The plan—if there is one—fails.`     | P1 satisfied (spaced), `em-tight` collapses the spacing                                                                                                                        |
| 2   | `The plan--if there is one--fails.`           | `The plan—if there is one—fails.`     | P3, tight both sides                                                                                                                                                           |
| 3   | `1914-1918 and pp. 34-36`                     | `1914⟨J⟩–⟨J⟩1918 and pp. 34⟨J⟩–⟨J⟩36` | range, G4 equal-length branch (4,4) and (2,2), G5 ✓                                                                                                                            |
| 3a  | `Takes 5-10 days`                             | `Takes 5⟨J⟩–⟨J⟩10 days`               | G4's `(1,2)` branch; `Rrun` is `10`, no leading zero. G5 is vacuous here                                                                                                       |
| 3b  | `aged 9-10 years`                             | `aged 9⟨J⟩–⟨J⟩10 years`               | `(1,2)`; the largest one-digit run against the smallest two-digit run                                                                                                          |
| 3c  | `chapters 1-12`                               | `chapters 1⟨J⟩–⟨J⟩12`                 | `(1,2)`                                                                                                                                                                        |
| 3d  | `0-60 in six seconds`                         | `0⟨J⟩–⟨J⟩60 in six seconds`           | `Lrun` may be `0` — the leading-zero clause constrains `Rrun` only. `before` is `NONE`, so G1 and G3 pass                                                                      |
| 3e  | `won 10-7`                                    | ⟶                                     | `(2,1)`: G4's new branch is **directional** and does not admit it. G5 would also reject it; G4 gets there first                                                                |
| 3f  | `code 9-05`                                   | ⟶                                     | `(1,2)` but `Rrun` begins with U+0030. This is the pair G5 could not have caught, since G5 is specified for equal-length runs                                                  |
| 3g  | `Call 555-1234`                               | ⟶                                     | `(3,4)` — neither branch. The phone-number case G4 exists for                                                                                                                  |
| 3h  | `Call 1-800 now`                              | ⟶                                     | `(1,3)` — the new branch requires `length(Rrun) = 2` exactly                                                                                                                   |
| 3i  | `the 2020-24 season`                          | ⟶                                     | `(4,2)` — the abbreviated year range remains a recorded miss (§7.3)                                                                                                            |
| 3j  | `Figure 5-10`                                 | `Figure 5⟨J⟩–⟨J⟩10`                   | **pinned as known-wrong.** A compound label, not a range; see §7.11. Recorded so the behaviour is visible in the conformance suite rather than discovered in someone's content |
| 4   | `A well-known e-mail address`                 | ⟶                                     | P1: bare hyphen, unspaced                                                                                                                                                      |
| 5   | `COVID-19 and ISO 8859-1`                     | ⟶                                     | `cp[L]` is a letter for the first; G4 fails (4 vs 1) for the second                                                                                                            |
| 6   | `Released 2026-08-15, ISBN 978-3-16-148410-0` | ⟶                                     | G2, chain                                                                                                                                                                      |
| 7   | `Call 212-555-1234`                           | ⟶                                     | G2, chain                                                                                                                                                                      |
| 8   | `run --force to override`                     | ⟶                                     | asymmetric spacing                                                                                                                                                             |
| 9   | `- first item`                                | ⟶                                     | no content to the left on the line                                                                                                                                             |
| 10  | `Scores: 20-10`                               | ⟶                                     | G5 fails (20 > 10)                                                                                                                                                             |

### `de-DE` — `parenthetical: "en-spaced"`, `range: "en-tight"`

| #   | Input                                         | Output                                        | Why                                                    |
| --- | --------------------------------------------- | --------------------------------------------- | ------------------------------------------------------ |
| 11  | `Der Plan--falls es einen gibt--scheitert.`   | `Der Plan␣–␣falls es einen gibt␣–␣scheitert.` | `en-spaced` inserts the spacing the tight input lacked |
| 12  | `Der Plan␣–␣falls es einen gibt␣–␣scheitert.` | ⟶                                             | already the target form                                |
| 13  | `Seiten 34-36`                                | `Seiten 34⟨J⟩–⟨J⟩36`                          | range                                                  |

### `ru` — `parenthetical: "em-spaced"`, `range: "em-tight"`

| #   | Input                          | Output                               | Why                                                                                                                                                                                 |
| --- | ------------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 14  | `Москва␣-␣столица`             | `Москва␣—␣столица`                   | `em-spaced`                                                                                                                                                                         |
| 15  | `Москва⍽—␣столица`             | ⟶                                    | declined by the **symmetry guard** (`lsp = 0`, since a U+00A0 is not this rule's spacing; `rsp = 1`) — unaffected by step 2a's retirement, because the symmetry guard has never read which `DASH` glyph the token holds                                                 |
| 16  | `из-под стола, кое-что`        | ⟶                                    | P1. (`hyphen`, order 35, will bind these two hyphens with U+2011 — that is a different rule)                                                                                        |
| 17  | `Годы 1941-1945 были тяжёлыми` | `Годы 1941⟨J⟩—⟨J⟩1945 были тяжёлыми` | Russian sets an **em** dash in ranges; `range: "em-tight"`. Aligned to the shipped fixture — which pair of years the row uses is arbitrary, and a second fixture differing only in its digits would be coverage of nothing                                                                                                                          |
| 17a | `в XV—XVII веках`              | ⟶                                    | **guard P4.** A tight em dash between two Roman-numeral runs is a range already in its correct form. Previously produced `в XV — XVII веках`, damaging input that was already right |
| 17b | `в XV-XVII веках`              | ⟶                                    | P4 fires here too (it tests the token's spacing and its neighbours, not which dash was typed), so the hyphen is left as written rather than converted. A miss, not damage — §7.6   |
| 17c | `Москва—столица`               | `Москва␣—␣столица`  | Cyrillic is not `ROMAN`, so P4 does not fire. ru's parenthetical is `em-spaced`; the token's length already matches (`em`), so only its spacing changes — but a length mismatch would convert here too, since spec 0.2.0 retired the token-level distinction entirely (§3.2 step 2a) |

### Idempotency regression cases

These are the two shipped defects of §5.2. Both are now "no change" cases, and both must be
fixtures.

| #   | Locale  | Input                   | Output    | Why                                                                                                                                                                                                                                                                                                                                   |
| --- | ------- | ----------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 18  | `ru`    | `a—0–0`                 | ⟶         | §3.2 step 7: one cluster (`—`,`0`,`–`,`0`) with two dash runs → entirely inert. Previously converged only after two runs                                                                                                                                                                                                              |
| 19  | `en-US` | `a-␣-␣a`                | ⟶         | §3.2 step 6: the second token's `cp[L]` is `-`, in `DASH`. Previously produced `a-—a` and then `a—a`                                                                                                                                                                                                                                  |
| 20  | `de-DE` | `1914-1918--annexation` | ⟶         | one cluster, three dash runs. Previously the `--` became `␣–␣` on run 1 and the range fired on run 2                                                                                                                                                                                                                                  |
| 21  | `en-US` | `a␣-␣-␣b`               | ⟶         | both tokens see a `DASH` at `cp[L]` or `cp[R]`; also the shape that would have produced overlapping edit spans (§3.5)                                                                                                                                                                                                                 |
| 24  | `de-DE` | `a–1␣-␣1`               | ⟶         | **defect (c).** Step 8: the `–` is tight, `en-spaced` would make it spaced, and the digit run `1` to its right has a `-` two code points beyond → the `–` is inert. The `-` is rejected by G2 (`before` is `–`). Previously `a – 1 - 1` then `a – 1–1`                                                                                |
| 25  | `ru`    | `a–1␣-␣1`               | ⟶         | same shape, `em-spaced` parenthetical and `em-tight` range. Previously `a — 1 - 1` then `a — 1—1`                                                                                                                                                                                                                                     |
| 26  | `de-DE` | `a–1-1`                 | ⟶         | the tight sibling of case 24, but **step 7** is what rejects it: with no space anywhere, `–1-1` is a single cluster containing two dash runs, so the whole cluster is inert. Step 8 is load-bearing only for the _spaced_ form in case 24, where the range token's own spacing ends its cluster and step 7 cannot see the second dash |
| 27  | `en-US` | `a–1␣-␣1`               | `a—1␣-␣1` | en-US's parenthetical is `em-tight` (not spaced), so **T1 never applies** — the token converts freely, length included. `de-DE`'s `en-spaced` parenthetical, by contrast, makes this token spaced, and T1 blocks it (the trailing `- 1` sits a far dash away): `run("a–1 - 1", deDE)` stays `a–1 - 1`, unconverted — this is what row 27 originally tested, and the mechanism is unchanged by step 2a's retirement                                                                                                                                                                                                      |

### Composition regression cases

Both families from [pipeline-idempotency.md](pipeline-idempotency.md) §4. Each rule was a fixed
point on its own output; the pipeline was not.

| #   | Locale  | Input             | Output | Why                                                                                                                                                                                                                                                        |
| --- | ------- | ----------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 28  | `de-DE` | `.--.`            | ⟶      | **family 1.** T2: the form is `en-spaced` and `cp[R]` is U+002E, from which `spaces` deletes a U+0020. Previously `. – .` then `. –.`                                                                                                                      |
| 29  | `ru`    | `a--.`            | ⟶      | same, `em-spaced`                                                                                                                                                                                                                                          |
| 30  | `de-DE` | `(--a`            | ⟶      | T2 on the left: `cp[L]` is U+0028, after which `spaces` deletes a U+0020                                                                                                                                                                                   |
| 31  | `de-DE` | `a--)`            | ⟶      | T2 on the right: `cp[R]` is U+0029                                                                                                                                                                                                                         |
| 32  | `en-US` | `.--.`            | `.—.`  | `em-tight` emits no U+0020, so T2 never applies and there is nothing for `spaces` to undo                                                                                                                                                                  |
| 33  | `fr`    | `«⍽-⍽»`           | ⟶      | **family 2.** Neither U+00A0 is spacing, so `lsp = rsp = 0`; the token is symmetric but `cp[L]` is the U+00A0, and **step 6** declines it as space-like. Previously the second pipeline pass produced `«⍽–⍽»`                                              |
| 34  | `ru`    | `слово⍽—␣столица` | ⟶      | `lsp = 0`, `rsp = 1` → the symmetry guard declines. The Russian `nbsp`-promoted form survives by being refused, not by being recomputed                                                                                                                    |
| 35  | `fr`    | `«⍽–␣"`           | ⟶      | **defect (d), §5.2.** The U+00A0 that `nbsp` N8 inserted after `«` is not spacing, so `lsp = 0` against `rsp = 1` and the symmetry guard declines. Under the previous left-only rule this read as symmetric and was promoted to `«⍽—␣"` on the second pass |
| 36  | `fr`    | `«–␣"`            | ⟶      | the pass-1 form of case 35: `cp[s-1]` is `«`, not a space, so the token is asymmetric from the start. `nbsp` then inserts the inner space, producing case 35, which is now a fixed point                                                                   |
| 37  | `fr`    | `«⍽–␣a`           | ⟶      | the same family with a letter to the right; all five witnesses (`«`, `"`, `'`, `a`, `1`) behave identically                                                                                                                                                |

### Dash-glyph reclassification, spec 0.2.0 (formerly "the authored-dash guard — §3.2 step 2a")

The M4 gate rejected 1063 lines of exactly this shape, 30% of the whole diff: the author's spaced
em dashes rewritten to the `en-US` `em-tight` convention. `en-GB` was no escape — there the same
em dashes became en dashes on 1060 lines. Both English locales were restyling a deliberate
authorial choice across an entire corpus.

| #   | Locale  | Input                                  | Output                            | Why                                                                                                                     |
| --- | ------- | -------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 38  | `en-US` | `documents␣—␣PDFs, invoices␣—␣and you` | `documents—PDFs, invoices—and you` | **the M4 blocker, reopened deliberately in spec 0.2.0** (§7 item 14). en-US's parenthetical is `em-tight`; the author's dash is already EM, so only its spacing is corrected — length happens to already match here |
| 39  | `en-GB` | `documents␣—␣PDFs␣—␣and you`           | `documents – PDFs – and you`       | the same input in the other English locale: en-GB's parenthetical is `en-spaced`, so the length converts (em → en) as well as the spacing already being correct — this is the M4 corpus's own shape, reopened on the same operator decision as row 38 |
| 40  | `en-US` | `The plan␣-␣if there is one␣-␣fails.`  | `The plan—if there is one—fails.` | **hyphen input is unaffected** — this is the conversion the rule exists for, and it still fires                         |
| 41  | `de-DE` | `Der Plan—falls es einen gibt—fällt.`  | `Der Plan – falls es einen gibt – fällt.` | an em dash typed by the author; de-DE's parenthetical is `en-spaced`, so both the length (em → en) and the spacing (tight → spaced) are corrected. Under 0.1.0's guard, and under the briefly-shipped 0.2.0 narrowing, this row stayed unchanged — retiring the guard outright is what converts it |
| 42  | `en-US` | `a-–b`                                 | `a—b`                              | a **mixed run** of `DASH` glyphs is a single token, promoted exactly as the equivalent hyphen run (`a--b`) would be — P3 admits a `k = 2` run regardless of spacing                                                          |
| 43  | `en-US` | `1914–1918`                            | ⟶                                 | en-US's range is `en-tight`; the token is already exactly correct — glyph, length and spacing — so it is left alone. §3.3.1's invisible-edit test (compute the unbound form; bind only if that would itself be a visible change) is what decides this, not any property of the original glyph |
| 44  | `en-US` | `1914-1918`                            | `1914⟨J⟩–⟨J⟩1918`                 | the hyphen-typed range still converts and still binds. 43 and 44 are the asymmetry §7.14 records                         |

### The joiner-transparency repair — §3.2b

| #   | Locale  | Input       | Output              | Why                                                                                                                                                                    |
| --- | ------- | ----------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 45  | `de-DE` | `1-1␣-␣1`   | `1⟨J⟩–⟨J⟩1␣-␣1`     | **defect (e), §5.2.** The second token's `before` is an effective neighbour that skips the joiner and finds the `–`, so G2 rejects it on every pass. Previously pass 2 produced `1⟨J⟩–⟨J⟩1⟨J⟩–⟨J⟩1` |
| 46  | `de-DE` | `1–1␣-␣1`   | ⟶                   | the **control**: the first token is already exactly correct for `en-tight` (glyph, length, spacing), so §3.3.1's invisible-edit test leaves it unbound and unchanged; the second token's G2 still rejects it, because `before` is a real `DASH` regardless of which `DASH` glyph it is. `1—1 - 1` (an em dash where the locale wants en) is **not** a fixed point here — it converts to `1⟨J⟩–⟨J⟩1 - 1`, the same as row 45 |
| 47  | `ru`    | `1-1␣-␣1`   | `1⟨J⟩—⟨J⟩1␣-␣1`     | the defect reproduced in all seven locales whose `range` is not `none`; `ru` sets `em-tight`                                                                            |

### `el` — `parenthetical: "none"`, `range: "none"`

The first locale with `"none"` on **both** fields, so the rule is a **total no-op** for it in the
same provable sense `hyphen` is a no-op for a locale with empty lists. Tokens are still
classified — §3.3's "a range token is never reconsidered as a parenthetical" still holds — but no
classification has an emission to make. The rows below are therefore all "no change" rows by
construction, and they are worth pinning precisely because nothing else in the suite exercises
the both-`none` combination.

**The two fields are `"none"` for two different reasons, and collapsing them into one sentence
misrepresents the source.** An earlier revision of this section said the Greek source "is not
silent here, it is _ambivalent_". That is true of `range` and **false of `parenthetical`**, where
the guide is explicit.

- **`range: "none"` — genuine ambivalence.** The rule appears **twice** in §10.1.8 of the EU
  Interinstitutional Style Guide (Greek edition), once under «Ενωτικό (-)» and once under «Παύλα
  μεσαίου μεγέθους (–)», and **each occurrence explicitly concedes the other mark**. A source
  that names both forms in both places is not being vague; it is declining to rank them.
  Emitting either would express a preference the citation does not carry, so the rule emits
  nothing.
- **`parenthetical: "none"` — a schema limit, not ambivalence.** The guide prescribes a U+2014
  pair (its own header gives «Alt 0151») and states the spacing exactly: «Όπως η παρένθεση, η
  διπλή παύλα δεν χωρίζεται με κενά διαστήματα από τη λέξη, φράση ή πρόταση που περικλείει·
  αντίθετα, μπαίνουν διαστήματα πριν από την πρώτη και μετά τη δεύτερη παύλα.» — ordinary spaces
  **outside** the pair, none on the **inner** edges. `dash.parenthetical`'s enum has no value for
  that asymmetry: `"em-spaced"` puts a space on each side of _each_ dash, which is precisely what
  the sentence forbids, and `"em-tight"` drops the outer spaces the sentence requires. So the
  source is clear and the schema cannot record it. `"none"` is what the file must say until the
  enum grows; the gap is with the operator and is **not** a licence to approximate.

In both cases `"none"` is the honest encoding, not a placeholder awaiting a default (§2) — but
only one of them is waiting on a _source_. `spec/locales/el.json`'s `dashes.note` carries the
detail, including a **source conflict** this document does not try to settle: the EU guide sets
U+2014 parenthetically while the state school grammar appears to set U+2013.

| #   | Input                                  | Output | Why                                                                                                              |
| --- | -------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| 48  | `άτομα ηλικίας 25-45 ετών`             | ⟶      | classified as a range, `range: "none"` → nothing emitted. The hyphen the author typed is what the source permits |
| 49  | `Το σχέδιο␣-␣αν υπάρχει␣-␣αποτυγχάνει` | ⟶      | classified as a parenthetical, `parenthetical: "none"` → nothing emitted                                         |
| 50  | `την περίοδο 1989–1991`                | ⟶      | an en dash already in the form the source prints; no rule reconsiders it                                         |

### A locale with no verified convention — `parenthetical: "none"`, `range: "none"`

| #   | Input                                 | Output | Why                                                                             |
| --- | ------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| 51  | `The plan␣-␣if there is one␣-␣fails.` | ⟶      | the token is classified as parenthetical and then nothing is emitted            |
| 52  | `1914-1918`                           | ⟶      | classified as a range, nothing emitted; **not** reconsidered as a parenthetical |

Cases 3e, 3f, 3g, 3h, 3i, 4, 5, 6, 7, 8, 9, 10, 12, 15, 16, 17a, 17b, 18, 19, 20, 21, 24, 25, 26,
28, 29, 30, 31, 33, 34, 35, 36, 37, 43, 46, 48, 49, 50, 51 and 52 are "no change" cases. (Rebuilt
programmatically from the rows themselves and re-checked against spec 0.2.0's live
`transform()` output. **17c, 27, 38, 39, 41 and 42 are no longer "no change" as of 0.2.0** and
were removed from this list — each converts visibly now that the authored-dash guard is
retired. 17a, 17b and 34 use guards unrelated to authorship — P4 and the symmetry guard — and
remain no-change exactly as before. Re-derive this list from the table, not from memory,
before trusting it: it has been wrong twice already in this document's history.)

---

## 7. Open questions

1. **`DIGIT` is ASCII-only.** Arabic-Indic, Devanagari and fullwidth digits are not
   recognised, so `١٩١٤-١٩١٨` is left alone. Extending to Unicode `Nd` would require every
   runtime to agree on a Unicode version _and_ on a digit-value table; ASCII-only is the
   portable choice for the six v1 locales. Recorded so the limitation is deliberate rather
   than accidental.
2. **Decimal ranges.** `1.5-2.5` and `1,5-2,5` are legitimate ranges and are currently
   rejected by G3. Supporting them means deciding which of U+002E / U+002C is the decimal
   separator in a given locale, which is data the schema does not carry. Left unsupported.
3. **Abbreviated year ranges.** `2020-24` is a real convention (Chicago) and is rejected by
   G4. I judged the false-positive risk of relaxing G4 (it would also accept `8859-1`) to be
   worse than the miss. Needs an operator decision.
4. **Scores and votes.** `5-0`, `2-1` pass all guards and become en dashes. That is arguably
   correct typographically (an en dash is standard for scores), but G5 rejects `5-0` while
   accepting `0-5`, which is inconsistent for this use. Either scores are out of scope or G5
   needs an exception; unresolved.
5. **Named date ranges.** `1 May - 3 June` has a letter on one side, so it takes the
   parenthetical branch and becomes an em dash in `en-US`. Typographically it should be an
   en dash range. Recognising it requires month-name lists, which is locale data the schema
   does not have and which I am not entitled to add. Recorded as a known miss.
6. **P4 declines rather than converting, so `XV-XVII` keeps its hyphen** (§6 case 17b). The
   full fix is to admit `ROMAN` runs as range candidates, with guards analogous to G1–G5 —
   but G4 (equal digit count) does not transfer, since `XV`/`XVII` differ in length, and G5
   (non-decreasing) would need Roman-to-integer evaluation, which is a parser rather than a
   comparison. Given all-caps English words built from Roman letters (`MIX`, `CIVIL`,
   `VIVID`), converting is the direction that can damage, so v1 declines. If Russian fixtures
   show the miss matters, the right shape is a length-bounded `ROMAN` run (say ≤ 7 code
   points) plus a real numeral evaluation, specified here first.
7. _(Retired.)_ `dash.range` now carries the same five-value enum as `dash.parenthetical`,
   including `em-*` (Russian uses it) and `none`. Nothing outstanding.
8. _(Retired.)_ §3.6's preservation clause is gone. A no-break space beside a dash now makes
   the token inert, so no edit can contain one and there is nothing to preserve. The Russian
   case it was written for is covered by declining instead — §6 case 34.
7a. **A dash whose spacing is partly no-break is never normalised at all.** If an author writes
   `mot⍽- autre` by hand, this rule declines rather than converting, because it cannot tell that
   U+00A0 from one `nbsp` put there. That is a deliberate miss on the conservative side, and it
   is the price of the structural discharge in §5.4. If real content shows it, the fix is **not**
   to reinterpret no-break spacing here — that road has produced three defects — but to have
   `nbsp` avoid creating the shape, which requires it to know what a dash token is.
9. **Step 8 costs a small class of legitimate normalisations**, and the cost is worth naming
   rather than hiding. In a `-spaced` parenthetical locale, a tight dash that sits directly
   against a digit run which has another dash beyond it is now left alone: `de-DE` leaves
   `Anhang A–1-2` untouched where it would previously have produced `Anhang A – 1-2`. I judge
   that a _gain_ — `A–1`, `B-2`, `Teil C-3` are identifiers, and spacing them out is a false
   positive of the kind the M4 gate exists to catch — but it is a behaviour change reached for
   an idempotency reason, not a typographic one, and it should be confirmed against real
   content. The guard fires only when a second dash is present near the digit run, so the
   ordinary `Kapitel 3—Einleitung` still normalises.
10. **Three of this rule's five guards now exist for idempotency rather than for typography**
    (step 6's `DASH` and space-like clauses, step 7, step 8). That is a lot of machinery for
    inputs — `a–1 - 1`, `a- - a` — that no author writes deliberately. The alternative design,
    which I did not take, is to declare a token inert whenever _any_ other dash lies within
    some fixed radius, which would be one guard instead of three but would also drop
    `pp. 34-36 — see notes` and `— 1914-1918 годы`, both of which are real Russian and English
    copy. Recorded so the trade is visible if the guard set ever needs simplifying.
11. **Compound labels are converted, and this is the cost of G4's `(1,2)` branch.**
    `Figure 5-10`, `Table 3-12` and `Section 2-14` mean "chapter 5, figure 10" — a two-part
    label, not a range — and the rule converts the hyphen to an en dash. So do the proper nouns
    `9-11` and `7-11`.

    **The exposure is pre-existing, not introduced here.** `Figure 3-7` is `(1,1)`, satisfies
    the equal-length branch and G5, and has converted since the first version of this rule.
    What the `(1,2)` branch does is _widen_ an exposure that already shipped — from
    `Figure 3-7` to `Figure 5-10` as well. That distinction is why the widening was judged
    acceptable: declining `5-10` buys no protection against the class that is actually exposed,
    while costing a construction (`takes 5-10 days`, `aged 9-10`, `0-60`) that is about as
    common as ranges get in English.

    **Separating the two needs the preceding noun** — `Figure`, `Table`, `Section`, `Fig.`,
    `Abb.`, `рис.` — which is an open-ended, per-locale word list. `locale.schema.json` could
    hold it (it is a list of literal strings), but the list has no natural closure, it differs
    per language and per house style, and getting it wrong in the _other_ direction would start
    declining genuine ranges after any word that happened to be listed. The rule deliberately
    does not have that context, and this is therefore an **argued miss rather than an
    oversight**.

    The failure mode is mild in a way the phone-number case is not: a hyphen becomes an en dash
    inside a label, which is a normalisation a reader may not even notice, whereas converting
    `555-1234` would corrupt a number. §6 case 3j pins the behaviour so it is visible in the
    conformance matrix. If the M4 dogfooding gate shows it on real content, the cheapest fix is
    a `dash.labelWords` list consulted only to _decline_, never to convert.

12. **Decided refusals, verified against Lebedev's live service.** Recorded here so they are
    not re-litigated:
    - **A direct-speech dash at line start** — `—` opening a line of dialogue, and the
      conversion of a leading `-` into one. Refused, and it is refused _by construction_
      rather than by preference: in `markdown` a leading `- ` is a list marker, so a rule that
      rewrote it would silently destroy list structure in the author's own content format.
      §3.2 step 5 already declines a token with no content to its left, and that is now a
      deliberate guarantee rather than a side effect.
    - **ISO date reformatting** (`2026-08-15` → any other form). Refused. This rule spends its
      cluster guard (§3.2 step 7) on leaving such strings byte-identical; rewriting them would
      contradict it.
    - **`->` and `=>` as arrows.** Refused — they are source code far more often than prose,
      and the symmetry guard already declines them.
    - **Wrapping output in markup.** `<nobr class="phone">212-85-06</nobr>` is what Lebedev's
      service emits for a digit-dash chain. Refused as an architectural matter — see
      `symbols.md` §7.8. Its observed failure mode is directly relevant here: that service wraps
      `Дата 2026-08-15 отчёт` as a telephone number. Encoding a _guess_ about what a digit-dash
      chain means, in the document, converts a silent miss into permanent damage. Declining the
      whole cluster is the better trade and this is the evidence for it.
13. **The U+2060 range binding is invisible in both the rendered text and a plain diff, and that
    is a reviewing hazard, not just a curiosity.** Every other change this rule has ever made is
    catchable by eye — a hyphen becomes a dash, a space appears or disappears. §3.3.1's joiner is
    zero-width: the bound form `1914⟨J⟩–⟨J⟩1918` and the unbound `1914–1918` are pixel-identical in
    every font — this sentence has to use the §6 notation to state its own example, which is the
    point — and a unified
    diff shows a changed line with no visible difference on it.

    Two practical consequences, both already paid for once:

    - **A worked-example row that omits the joiner looks correct.** §6's rows 3, 3a–3d, 3j, 13
      and 17 stayed stale after §3.3.1 landed, and were caught by a fixture author checking raw
      bytes rather than trusting the rendering. §6's standing note now says so; the escaped
      mirror in `spec/fixtures/.escaped/` is the only rendering in which the joiner is visible.
    - **The change was spec-first and legitimate, and still broke 32 fixture cases in another
      agent's files without announcing itself.** A normative change whose effect cannot be seen
      needs to be _told_, not shown. Any future rule emitting a zero-width or invisible code
      point — U+00AD, U+200B, U+2060, a variation selector — inherits this: say so in the commit
      that introduces it, and expect every existing fixture containing the affected construct to
      need regeneration.

    This is not an argument against the binding, which is well-sourced and correct. It is an
    argument that invisibility is a property a spec has to manage explicitly, in the same way
    `symbols.md` §3.1 manages the Cyrillic `х` — the other change in this project that no
    reviewer can catch by eye.
14. **The authored-dash guard's history, and why it ended in full retirement (spec 0.2.0).**
    Spec 0.1.0 introduced an unconditional guard here after an M4 corpus run found 1063 lines
    across 155 files where restyling an author's dash — glyph length and spacing changed
    together — was pure damage against a criterion (PLAN.md §8) that names exactly that as the
    ship blocker. A later revision inside 0.2.0 narrowed the guard rather than removing it —
    preserve the author's dash length, correct only the spacing — after a
    `Минус — при разногласиях`-shaped operator complaint showed the unconditional form leaving
    genuinely mis-spaced dashes broken forever. That narrowing rested on treating a dash's
    length as reliably an authorial decision. On operator review that premise was rejected: a
    dash's length in ordinary prose is at least as often a copy-paste artefact or plain
    unfamiliarity with which mark is which as it is deliberate, and this project has no way to
    tell the two apart from context — so the guard was retired outright rather than kept
    narrow, on the same footing this rule has always used for spacing: an author who wants their
    own dash typography untouched has always had the option of not running the pipeline.

    Two consequences worth stating plainly, neither hidden:

    - **`en-US`'s `em-tight` convention, and every locale's dash convention, now governs every
      dash in the document — hyphen-typed or not, whatever length or spacing it started with.**
      `documents — PDFs, invoices — and you` and `documents–PDFs, invoices–and you` both become
      `documents—PDFs, invoices—and you` in `en-US`. This is the M4 corpus's 1063-line class,
      reopened deliberately: the operator judged that the M4 gate's corpus finding reflected a
      false premise about dash length being authorial, not a property of the tool that had to be
      preserved regardless of that premise.
    - **A range already in its exact target form — glyph, length and spacing — is still never
      bound; a range that needs any visible correction (hyphen-typed, or a dash of the wrong
      length or spacing) is.** `1914–1918` in an `en-tight` locale keeps its breakable dash,
      because binding it would be an edit whose entire content is invisible (§3.3.1); the same
      shape typed `1914-1918`, or typed `1941—1945` where the locale wants `en-tight`, converts
      and binds, because the glyph itself is visibly changing. This asymmetry is unaffected by
      the guard's retirement — it was never about authorship, only about reviewability — and
      remains the one most likely to be reported as a bug (§6 cases 43, 44).

    The length restriction could be reopened only by a locale field distinguishing "normalise
    dash length" from "promote hyphens only" — which is a caller preference, not a typographic
    fact about a language, and so does not belong in a locale file.
15. **T2's set is deliberately wider than `spaces`' `STRIP-BEFORE`, by U+2026, and no fixture
    covers the difference.** §3.2 step 9 declines a `-spaced` form before U+2026 although
    `spaces` would not delete a space there. Both readings are idempotent, so the property suite
    cannot separate them — **only a fixture can**, and `a--…` in a `-spaced` locale has none.
    Needed: one positive row per `-spaced` locale asserting that the input is returned unchanged.
    Until it exists, a port could transcribe either set and stay green.
16. **The joiner has now cost twice, and this is the record, not an argument to remove it.**
    §3.3.1's U+2060 binding was approved knowing it is invisible in both the rendering and a
    plain diff (§7.13). What that invisibility has actually cost, so far:

    - **32 fixture cases silently broken** in another agent's files when the binding landed. The
      change was spec-first and legitimate; nothing in the rendered output showed it.
    - **One idempotency defect, defect (e) of §5.2**, needing a **seven-character** witness to
      find — beyond the length-4 exhaustive bound that was normative at the time, so the suite
      stayed green while the defect shipped.

    Neither is an argument against the binding: it is well-sourced, it is what stops a range
    breaking across lines, and the alternative — markup — is forbidden by `modes.md` §4. The
    entry exists so that **the next person weighing a zero-width emission can read what this one
    cost** rather than re-deriving it. A rule that emits an invisible character buys a real
    typographic gain and pays in reviewability, and both halves should be on the table.
