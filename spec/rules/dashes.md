# Rule: `dashes`

**Order:** 30. **Default:** on. **Modes:** text, html, markdown.
**Spec version:** 0.6.0 (0.2.0 for everything except the 0.5.0/0.6.0 changes noted inline and in
§8 History).

---

## 1. Purpose

`dashes` renders the **parenthetical dash** — the one that interrupts a sentence — like this —
in the form the locale prescribes. **As of spec 0.5.0, this rule no longer recognises the
numeric/date range dash** (`1914–1918`); that moved to [ranges.md](ranges.md) (order 25, off by
default).

**§1 through §7 below are current and normative for `dashes` alone.** §3.2's shared token-scanning
steps are consumed identically by `ranges` (`ranges.md` §3.1) and are described here because this
is their canonical home, not because they are historical. Only **§8, History**, is non-normative:
it is where the pre-0.5.0 combined rule's development — the guards it took to reach the current
algorithm, and the range-specific reasoning that used to live here and now lives in `ranges.md` —
is preserved for readers who want the reasoning trail. Nothing in §1-§7 requires the reader to
mentally subtract old range-branch statements from current parenthetical ones; where §1-§7
mentions `ranges` at all, it is describing a current, live interaction between the two rules, not
a retired one.

`dashes` does not touch the ordinary hyphen inside a compound word — which, in the few
morphological forms where the hyphen must additionally be protected from a line break, belongs
to `hyphen` at order 35 — and does not touch a digit-flanked stroke at all: that shape belongs to
`ranges` exclusively, and `dashes` declines it **unconditionally**, whether or not `ranges` is
enabled (operator decision, spec 0.5.0; see §3.2's note after step 7, and ranges.md §3.2's G1-G5).
`dashes` never reinterprets a digit-flanked hyphen as a parenthetical dash — that was already true
in every prior spec version, since the two branches were always mutually exclusive per token; the
0.5.0 split makes that exclusivity a boundary between two rules instead of two branches of one.

The parenthetical form is governed by one enum in the locale file: a dash _length_ (`em` or `en`)
and a _spacing_ (`tight` or `spaced`), or the opt-out value `none`.

---

## 2. Locale data consumed

- `dash.parenthetical` — one of `"em-tight"`, `"em-spaced"`, `"en-tight"`, `"en-spaced"`,
  `"none"`.

**As of spec 0.5.0, `dashes` no longer reads `dash.range`** — that field is now read exclusively
by `ranges` ([ranges.md](ranges.md) §2), under the same key, with the same values and the same
citations; the 0.5.0 split moved which rule reads the field, not the field itself or what
supports it (operator decision: no new locale claim was made by the split).

**Evidence for this list.** A locale attests **membership** — that these tokens belong in this
list — and this rule owns the **mechanism** it applies to them. A `sources` citation is not
required to name a code point or a binding the locale file has no way to vary. The principle is
stated once, normatively, in [nbsp.md](nbsp.md) §2.1 and governs every list-valued field in
`locale.schema.json`. **`"none"` means the locale has no verified convention for that use, and
the rule must emit nothing at all for a token of that kind** — not a fallback, not a "sensible
default", nothing. A missing citation is never a licence to guess (PLAN.md §6.1), and a locale
that has not been researched must round-trip its input untouched rather than acquire a
plausible-looking dash.

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
| `DIGIT`         | U+0030–U+0039 only. **ASCII digits only** — see [ranges.md](ranges.md) §7 (the limitation matters for `ranges`' digit-value comparisons; `dashes` never reads a digit's value)                                                                                                                                                                 |
| `LETTER`        | any code point whose Unicode general category is `Lu`, `Ll`, `Lt`, `Lm` or `Lo`, or `Mn`, `Mc`, `Me` (combining marks count as letter-continuation, so a decomposed `é` is treated as one letter followed by a mark) |
| `SPACE`         | U+0020 only                                                                                                                                                                                                          |
| `BREAK`         | U+000A, U+000D, U+000B, U+000C, U+0085, U+2028, U+2029                                                                                                                                                               |
| `NOBREAK-SPACE` | U+00A0, U+202F                                                                                                                                                                                                       |
| `ROMAN`         | the seven uppercase Roman-numeral letters only: U+0049 `I`, U+0056 `V`, U+0058 `X`, U+004C `L`, U+0043 `C`, U+0044 `D`, U+004D `M`. Lower-case forms are **not** members — see §3.4 P4                               |
| `INERT-DASH`    | U+00AD (soft hyphen), U+2011 (non-breaking hyphen), U+2012 (figure dash), U+2015 (horizontal bar), U+FE58, U+FE63, U+FF0D                                                                                            |
| `JOINER`        | U+2060 (word joiner) only. As of spec 0.5.0, produced exclusively by `ranges` (ranges.md §3.3.1) — `dashes` itself never emits one, but still reads through an adjacent run of them (§3.2a, §3.2b), since a `ranges`-produced joiner can sit next to a `dashes` candidate token                                                                                                                    |

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
to give them one — see step 2a's history note), **with one narrow exception added in spec 0.6.0
(§3.4 P5): a run consisting of exactly one U+2013 is declined unconditionally, in every locale**.
Every other mixture of `DASH` glyphs — including a run mixing U+2013 with U+002D/U+2010/U+2212/
U+2014, and every run containing U+2014 — is still promoted to the locale's form exactly as a
pure-hyphen run would be. This treats the dash's *length* the same way this rule has always
treated its spacing — as something to correct, not preserve — on the view that a dash's length in
ordinary prose is at least as often a copy-paste artefact or plain unfamiliarity with which mark
is which as it is a deliberate choice, and an author who wants their own dash typography left
alone has always had the option of not running the pipeline. **P5 is not a retraction of that
view for dashes in general — it is a narrower, evidence-driven claim about one specific glyph
used alone: see §3.4 P5 and §8.8.**

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

   **Full development history — why the guard existed, why it was narrowed once, and why it was
   then retired outright — is §8.1**, kept there because none of it is required to implement the
   current algorithm; the two lines above are the complete current rule.

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
   one reachable; §8.2 defect (d) records how.

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
     idempotency defect (b), §8.2;
   - a space-like neighbour — `cp[L]` is by construction the code point _beyond_ the outer
     spacing, so a space there means two consecutive space-like characters (a U+00A0 next to
     a U+0020, say — `spaces` cannot produce two U+0020). The spacing of such a token is not
     something this rule should be rewriting.
7. **Cluster guard.** Define a **dash cluster** as a maximal span of code points every one of
   which is in `DASH` ∪ `INERT-DASH` ∪ `DIGIT` ∪ `JOINER` (§3.2b — a joiner `ranges` emitted on
   an earlier pass must not split a cluster it sits inside). (Spaces, letters and punctuation all end a
   cluster.) Let `C` be the cluster containing this token's run. **If `C` contains two or more
   maximal runs of `DASH` ∪ `INERT-DASH`, emit nothing for every token in `C`** — the whole
   cluster is inert.
   This covers idempotency defect (a), §8.2: the classification of a range token reads
   `before`/`after`, which may be a dash belonging to a _different_ token, and normalising
   that other token to a spaced form replaces the dash with a space and flips the range
   verdict on the next run.
   `2026-08-15`, `978-3-16-148410-0`, `212-555-1234`, `a—0–0` and `1914-1918—annexation` are
   all single clusters with more than one dash run, and are all inert in their entirety.
   **This guard is not sufficient on its own, and it does not subsume G2.** A cluster ends at
   the first space-like code point, so a _spaced_ token's cluster contains only its own run:
   its `cp[L]` is a digit in a neighbouring cluster and its `before` is a dash in a third one,
   neither of which step 7 can see. That gap is idempotency defect (c), §8.2, and step 8 closes it.
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
   and `— 1914-1918 годы` still converts its range. What it does cost is written up in §7.4.

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
   needed (§7.7).

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
  bound range `ranges` produced on an earlier pass ([ranges.md](ranges.md) §3.3.1): continue with
  `L*`/`R*` in place of `L`/`R`, and extend the token's span to cover the crossed joiners. `dashes`
  itself never reaches this shape as a candidate — extending the span here only ever feeds the
  digit-flanked check that routes the token to `ranges`' exclusive territory (§1, §3.3), never to
  this rule's own parenthetical branch.
- If a joiner was crossed in any other configuration, **emit nothing**. An author who typed
  U+2060 next to a dash meant it, exactly as with `INERT-DASH` (§3.1).

This is what makes a `ranges`-produced binding survive a second pass without a second joiner
being added, and what keeps this shared scan from rewriting a joiner that only `ranges` — never
`dashes` — puts there.

### 3.2b `JOINER` is transparent to every lookaround that leaves the token

§3.2a makes a joiner transparent to the token that **owns** it. That is not enough, and the gap
cost an idempotency defect (§8.2, defect (e)). A joiner also sits in the lookaround of a
**neighbouring** token, where nothing was skipping it.

> **Effective neighbour.** For an index `i` and a direction, step outward across any maximal run
> of `JOINER` and take the first code point that is not a `JOINER`, or `NONE` if the walk leaves
> the array.
>
> **Every guard that inspects a code point outside its own token's dash run reads an effective
> neighbour, not a raw index.** That is: `before` and `after`, owned by `ranges` since spec 0.5.0
> ([ranges.md](ranges.md) §3.2-§3.3) — and therefore G1, G2 and G3 — and the two-code-point reach
> of T1 (§3.2 step 8, shared by both rules). `cp[L]` and `cp[R]` are already joiner-skipping
> through §3.2a's `L*`/`R*`.
>
> **`JOINER` is additionally a member of the cluster alphabet** (§3.2 step 7), so a joiner cannot
> split a cluster that would otherwise have contained two dash runs.

**Why this is forced rather than chosen.** `ranges` (order 25) emits `JOINER`; `dashes` (order 30)
runs later in the same pipeline pass and consumes the text `ranges` already produced. That is a
**current cross-rule composition obligation**, not an own-emission one: `dashes`' shared token
guards and lookarounds must be invariant under `JOINER`, so a verdict this rule reaches does not
depend on whether an earlier `ranges` pass has already bound the range sitting next to it. A guard
that could not see through a neighbouring `ranges` token's joiners would read a bound range's
`JOINER dash JOINER` as something other than the plain dash it wraps, and reach a different
verdict than it would against the same input before `ranges` ran — which is exactly the
composition failure [pipeline-idempotency.md](pipeline-idempotency.md) §4 and §5 forbid between
two rules in one pipeline. **Before the spec 0.5.0 split, when range handling was still part of
this document's own algorithm, the identical requirement was instead an *own-emission* CO-S
obligation** ([pipeline-idempotency.md](pipeline-idempotency.md) §5.1a) — the single rule had to
be inert to its own `JOINER` output, on the same footing it had to be inert to its own dash
output. That ownership is historical now (§8.4 records it); the shape of the requirement did not
change when the rule that emits `JOINER` did. §3.2a supplies this reading
for the token that sits next to a joiner; §3.2b supplies it for every other guard's lookaround,
and the two together are the complete current statement of `dashes`' joiner-transparent reading
behaviour.

---

### 3.3 Range branch — retired here, moved to `ranges` (spec 0.5.0)

**This section described the range branch through spec 0.4.1. As of spec 0.5.0, range detection
is [ranges.md](ranges.md) §3.2-§3.3.1 in full** — the admissibility test (`cp[L]`/`cp[R]` both
`DIGIT`), guards G1-G5, the replacement table, and binding a tight range (§3.3.1) all moved there
verbatim, still reading the same `dash.range` locale field under the same key.

**What stays true here, restated because it is `dashes`' own contract now rather than a
consequence of one rule's two branches:** a digit-flanked dash token (`cp[L]` and `cp[R]` both
`DIGIT`) is never processed by `dashes` — not converted, not declined-and-then-reconsidered,
simply never reached. This holds **unconditionally**, whether `ranges` is enabled or not (§1).
`ranges` disabled does not mean the token falls back to parenthetical treatment; it means nothing
in the pipeline touches it at all, and `5-10`, `Figure 5-10`, `9-11` and `7-11` are all
byte-identical no-ops with default options.

The section number is kept, not renumbered away, for the same reason §3.2 step 2a keeps its
number after being retired: several documents (this one's own §4, §6, §7; `ranges.md`;
`pipeline-idempotency.md`) cite sections of this document by number, and a retired section that
still occupies its number costs less than a renumbering would.

---

### 3.4 Parenthetical branch

Reached for every token this rule sees — a digit-flanked token (both `cp[L]` and `cp[R]` in
`DIGIT`) is never handed to `dashes` at all (§3.3, §1), not merely excluded from this branch, so
"is not a range candidate" (i.e. at least one of `cp[L]`, `cp[R]` is not a `DIGIT`) is true of
every token that reaches here by construction. Additional guards:

- **P5 (spec 0.6.0) — authored en-dash mark-identity veto.** If `k = 1` and `cp[s]` is U+2013,
  emit nothing — **unconditionally**: every locale, tight or spaced, regardless of
  `dash.parenthetical`'s target glyph. A run mixing U+2013 with any other `DASH` member (`a-–b`,
  `k = 2` or `3`) is **not** covered and still promotes under P2/P3 below, exactly as before.

  This is the one narrow exception to P2's "no distinction based on which `DASH` glyph the
  author typed": a pure, single, authored en-dash is treated as carrying its own mark identity —
  interruption (em-dash) and connection/range (en-dash) are two established, different
  conventional roles, not merely two lengths of the same mark — and is never silently rewritten
  into a different mark, in any locale, including one whose own `dash.parenthetical` target
  glyph is en-dash (there, only the *spacing* of an authored en-dash may still be corrected; the
  *glyph* is never touched by any path in this rule, so the distinction is moot but the veto
  still applies structurally, for the same input-invariance reason P4 declines rather than
  reasons about the locale's own target).

  **Full argument for why this does not reopen the guards §8.1 records retiring — fresh M4
  evidence, the narrower scope, and why it is unconditional across every locale rather than
  keyed to the target glyph — is §8.8.**
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
  — `VIVID`, `CIVIL`, `MIX`, `DID` — and converting is the direction that can damage. §7.2
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
appear in an edit this rule produces. **This rule's current emission alphabet is exactly U+2013
or U+2014 — the target dash glyph itself — plus, for a spaced form, U+0020 on each side; nothing
else.** In particular it emits no U+2060. Through spec 0.4.1, a converted *tight* range dash could
additionally carry U+2060 immediately before and after the emitted dash glyph (§3.3.1, pre-0.5.0);
range binding — and every U+2060 this rule's output can now contain — is exclusively `ranges`'
behaviour ([ranges.md](ranges.md) §3.3.1) as of spec 0.5.0, since `dashes` never processes the
digit-flanked token a binding would apply to in the first place (§1). `dashes` still *reads*
through an adjacent run of joiners a neighbouring `ranges` token produced (§3.2a, §3.2b), which is
a different thing from emitting one itself.

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
- **[P] ISO dates** `2026-08-15`, **ISBNs**, **phone numbers**, **part numbers**: digit-flanked,
  so they never reach `dashes` at all as of spec 0.5.0 (§1, §3.3). When `ranges` is explicitly
  enabled, its own guards G2 (chain) and G4 (equal digit count) additionally decline them on
  their own terms ([ranges.md](ranges.md) §3.2, §6).
- **[P] `COVID-19`, `MP3-4`, `Windows-1252`, `ISO 8859-1`, `UTF-8`**: `COVID-19`'s hyphen is
  letter-flanked (`cp[L]` is a letter, so P1's compound-word guard applies); the other four are
  digit-flanked and never reach `dashes` at all as of spec 0.5.0 (§1). `ranges.md` §3.2's G1/G4
  additionally decline the digit-flanked ones on their own terms when `ranges` is explicitly
  enabled.
- **[P] A tight dash between two Roman numerals**, in either direction: `XV—XVII`, `I—V`,
  `Louis XIV—XVI`. Guard P4. Note this is a _preservation_ claim, not a conversion one — the
  input is already correct and the rule's job is to leave it alone.
- **[P] Any member of `INERT-DASH`** (spec 0.2.0): U+00AD, U+2011, U+2012, U+2015, and the
  fullwidth/small forms U+FE58, U+FE63, U+FF0D. Neither read as a candidate nor produced. **Not
  a member since 0.2.0: U+2010 and U+2212 are ordinary `DASH` candidates** (§3.1) — `x ‐ y`
  (U+2010) and `x − y` (U+2212) both convert to the locale's parenthetical form. `1990−2000` is
  digit-flanked, so it never reaches `dashes`' parenthetical form at all — with `ranges`
  explicitly enabled it converts and binds as a range there (ranges.md §3.3, §3.3.1).
- **[P] A negative number.** `-5` has no space to the left of the digit and a letter/space to
  the left of the hyphen → asymmetric → rejected. This holds for U+002D, U+2010 and U+2212
  alike — the same asymmetry guard, not a glyph-specific one.
- **[P] Every digit-flanked stroke, unconditionally** — `5-10`, `Figure 5-10`, `9-11`: never
  reached by `dashes` at all, let alone reinterpreted as parenthetical (§1, §3.3). This holds
  regardless of whether `ranges`' own guards would have accepted or declined the token —
  `dashes` does not evaluate them and does not need to.
- **[P] URLs, code spans, fenced code, HTML attributes.** Removed by the mode adapter before this
  rule sees them. This rule has no notion of a URL and must not grow one.
- **[P] Line terminators**, which are never inserted, deleted or crossed.

---

## 5. Idempotency argument

Write `T` for `dashes`. `T` edits only **parenthetical dash tokens**: at least one of `cp[L]`,
`cp[R]` is not `DIGIT` (§1, §3.3) — a digit-flanked token is never reached by `T` on any pass, so
nothing below needs to reason about one. Each edit `T` makes replaces a span consisting of one
maximal `DASH` run plus at most one space-like code point on each side, with a span of the same
shape (`space? dash space?`). So every edit is one of:

- **(E1)** replace one dash with another dash at the run's position;
- **(E2)** shorten or lengthen the run (`--` → `—`), without creating a space;
- **(E3)** delete a U+0020 adjacent to the run (producing a `-tight` form);
- **(E4)** insert a U+0020 adjacent to the run (producing a `-spaced` form).

`T` never touches a letter, a digit, a full stop, a comma, a solidus, a line terminator, or any
space not immediately adjacent to a dash run. §3.5 establishes that emitted spans are pairwise
disjoint, so no edit's output can be reinterpreted as part of a different edit's span on the same
pass.

### 5.1 Emitted forms are fixed points

| Emitted form                            | Re-read as               | Recomputed replacement |
| ---------------------------------------- | ------------------------- | ------------------------ |
| `X` tight (`em-tight`/`en-tight`)        | `k = 1`, `lsp = rsp = 0`  | same single code point   |
| `␣X␣` spaced (`em-spaced`/`en-spaced`)   | `k = 1`, `lsp = rsp = 1`  | same three code points   |
| nothing (`"none"`, or a declined token)  | unchanged input            | nothing                  |

A tight form is re-admitted by P2 (`k = 1`, and the glyph is a `DASH` member — spec 0.2.0 gives
U+2013/U+2014 no token-level special case, §3.2 step 2a, so this holds regardless of which `DASH`
glyph the token holds). A spaced form is re-admitted the same way, with `lsp = rsp = 1` read back
by §3.2 step 3. A token `nbsp` has since promoted (`ru`: U+00A0 before an em dash) is not
recomputed at all — §3.2 step 3 makes a no-break-space neighbour space-like, so the isolation
guard (step 6) declines it and nothing is emitted (§3.6). A digit-flanked token stays outside `T`'s
domain on every pass, by construction, so it is trivially a fixed point of `T` regardless of what
`ranges` does to it.

### 5.2 A declined token stays declined

For a token `T'` that `T` declines, its verdict depends only on: `k` and the run's position;
`lsp`, `rsp`; `cp[L]`, `cp[R]`; the dash cluster containing its run (§3.2 step 7); the `ROMAN`
runs P4 reads; the run's own code point, which P5 reads; and, when relevant, the digit run T1
reads. None of these can be changed by an edit `T` itself makes elsewhere in the same pass:

- **The run's own code point (P5, spec 0.6.0).** P5's verdict — `k = 1` and `cp[s] = U+2013` —
  reads only the run's own single code point, which by the same disjoint-spans argument as `k`
  above sits outside every edit span and so is byte-identical on every pass. A token P5 declines
  stays declined on exactly the same footing as P4: the input P5 reads is one this rule's own
  edits cannot produce or destroy (no edit's replacement contains U+2013 anywhere in this rule's
  emission alphabet — §3.6 — so a *new* pure-U+2013 run this rule itself created is not even a
  reachable state to worry about).

- **The run and its spacing (`k`, `lsp`, `rsp`).** `T'`'s run sits outside every edit span
  (spans are pairwise disjoint, §3.5). `lsp`/`rsp` probe `cp[s-1]`/`cp[e]`; if either lay inside
  another edited token's span, the two tokens would be adjacent or separated by exactly one
  shared space — both shapes the isolation guard (step 6) already declines (a `DASH` or
  space-like neighbour), so neither arises for a token that reaches a verdict at all.
- **`cp[L]`, `cp[R]`.** If `cp[L]` lies inside an edited token's span, it is a dash or an outer
  space of that token — either way step 6 already declined `T'` (it rejects both `DASH` and
  space-like at that position), and E1–E4 never put a letter or digit there, so `T'` is declined
  again on the next pass, for the same reason. The mirror argument gives `cp[R]`.
- **The cluster.** A cluster with ≥2 dash runs emits nothing at all (step 7), so it is
  byte-identical next pass and stays inert. A cluster with exactly one dash run may be edited,
  but the edit cannot merge it with a neighbouring cluster except by deleting a space (E3), and a
  merge only ever adds dash runs — which can only make more tokens inert, never fewer. It cannot
  split a live cluster into something revivable (E4 turns a one-run cluster into one-run pieces),
  and it cannot split an inert cluster at all, since an inert cluster emits nothing. No token
  moves from inert to live via the cluster guard.
- **`ROMAN` adjacency (P4).** No edit touches a letter, so the `ROMAN` runs flanking a token are
  untouched by any of `T`'s own edits.
- **The digit run T1 reads.** No edit touches a digit, so the digit run itself is stable. T1's
  concern is not this token's own recomputation but a *neighbouring* token's verdict — see §5.3.

Every input to a declined token's verdict is therefore unaffected by any edit `T` makes, on every
pass: `T(T(x))` declines exactly where `T(x)` declined. The historical counterexamples that led to
this guard set — before it closed every gap — are summarised in §8.2.

### 5.3 Interaction with `ranges` is stable

`ranges` (order 25) runs before `dashes` (order 30) in every pass. Three guarantees hold between
them, and all three are current:

- **`dashes` emits only U+2013 or U+2014, plus zero or one U+0020 on each side — never U+2060.**
  Range binding ([ranges.md](ranges.md) §3.3.1) is exclusively `ranges`' emission; an interrupting
  parenthetical dash is exactly where a line *may* break, so there is nothing for `dashes` to bind
  (§3.6).
- **A digit-flanked token is never reinterpreted as parenthetical, on any pass.** The `isDigit`
  test that routes a token to `ranges` instead of `dashes` (§1, §3.3) is evaluated after the
  joiner-crossing walk (§3.2a), so a token `ranges` bound on an earlier pass — where the walk
  re-enters across the `JOINER` pair and finds `DIGIT` on both effective neighbours — presents to
  `dashes` with digit-flanked `leftCp`/`rightCp` exactly as an unbound one would, and `dashes`
  declines it on the same unconditional test. `dashes` cannot strip a binding it never
  reconsiders, and cannot create one, since it never emits `JOINER`.
- **`dashes`' own edits cannot flip a *neighbouring* range token's guard verdict on the next
  pass, even though `dashes` itself never reads that token's guards.** The one edit shape that
  could — a tight token becoming spaced, inserting a U+0020 next to a digit run that has another
  dash on its far side — is exactly what the spacing-transition guard (T1, §3.2 step 8) declines.
  This is `dashes`' composition obligation *toward* `ranges`, symmetric to the rule-order argument
  in [ranges.md](ranges.md) §4: `ranges` must not see an adjacency `dashes` disturbed, and T1 is
  how `dashes` upholds that on every subsequent pass. The full historical derivation of why this
  is the only verdict input `dashes` can perturb — and the defects that motivated T1 and the
  cluster guard — is §8.2 and §8.3.

### 5.4 Composition obligations

Per [pipeline-idempotency.md](pipeline-idempotency.md) §5. This rule is R₃, so the obligation runs
against `spaces` (R₁) and `ellipsis` (R₂), and it must itself survive every later rule.

**What this rule emits.** U+2013 or U+2014 at a dash run's position; zero or one U+0020
immediately on each side. It deletes only U+0020 and dash code points. It never emits a no-break
space, a letter, a digit, a full stop, or U+2060.

**Against `spaces` (I₁).** The only rule before `hyphen` that emits U+0020, so a `-spaced` form
could place a space where `spaces` deletes one — guard T2 (§3.2 step 9) exists for exactly this.
A run of two or more spaces is structurally impossible: the replacement emits exactly one U+0020
per side, and step 6 guarantees the code point beyond it is not space-like.

**Against `ellipsis` (I₂).** Discharged trivially: this rule never emits U+002E or U+2026, and
every deletion is a U+0020 or a dash adjacent to the token — never a code point standing between
two dot runs.

**What must be preserved *for* this rule.** `nbsp` (R₈)'s entire emission alphabet is U+00A0 and
U+202F, both of which make an adjacent dash token inert (§3.2 step 3 + step 6) — so `nbsp` cannot
create a dash token, alter a spacing verdict, or revive a declined one. This is condition **CO-S**
in [pipeline-idempotency.md](pipeline-idempotency.md) §5.1a, discharged structurally rather than
case by case. `hyphen` (R₄) converts some U+002D to U+2011: no verdict changes, because a U+002D
`hyphen` claims is intra-word and `dashes` had already declined it under P1, and because step 6
and the cluster alphabet treat `DASH` and `INERT-DASH` alike. `quotes` (R₅), `apostrophe` (R₆) and
`symbols` (R₇) emit characters in none of this rule's classes and never change spacing. `ranges`
(order 25, runs earlier in the same pass) is covered by §5.3 above.

### 5.5 Conclusion

Every input to every verdict — declined or emitted — is stable across a re-run of `dashes` alone
(§5.1, §5.2), stable under `ranges`' own edits and vice versa (§5.3), and stable under every other
rule in the pipeline (§5.4). Hence `T(T(x)) = T(x)`, discharging `dashes`' contribution to the
pipeline-level fixed point [pipeline-idempotency.md](pipeline-idempotency.md) §2 requires. ∎

---

## 6. Worked examples

`␣` = U+0020, `⍽` = U+00A0, `⟨J⟩` = U+2060 (word joiner), `⟶` = no change.

**A row containing an invisible code point must be checked in the escaped mirror, never read.**
U+2060 is zero-width: a range row that omits it looks _exactly_ right on screen and is wrong at
the byte level — the same caution [ranges.md](ranges.md) §6 states for its own rows, which is
where every range row (formerly numbered 3, 3a–3d, 3j, 13 and 17 in this table) now lives. `⟨J⟩`
is a notation used only in these two tables; the fixture files carry the real U+2060, and
`spec/fixtures/.escaped/` is the only rendering in which its presence or absence can actually be
seen. The same applies to any future rule emitting U+00AD, U+200B or a variation selector.

**As of spec 0.5.0, this table contains `dashes`' own behaviour only — parenthetical dashes.**
Every digit-flanked input below shows this rule's current, actual behaviour: no change at all,
because `dashes` never processes a digit-flanked token (§1, §3.3). Row numbers 3, 3a–3j, 13 and
17 are kept exactly where they were — not renumbered, not deleted — because fixtures and other
documents cite them by number; each now points to [ranges.md](ranges.md) §6, which is the current
normative source for what happens to that same input when `ranges` is explicitly enabled.

### `en-US` — `parenthetical: "em-tight"` (`range` is now [ranges.md](ranges.md)'s field, `"en-tight"`, not this rule's)

| #   | Input                                         | Output                                | Why                                                                                                                                                                            |
| --- | --------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `The plan␣-␣if there is one␣-␣fails.`         | `The plan—if there is one—fails.`     | P1 satisfied (spaced), `em-tight` collapses the spacing                                                                                                                        |
| 2   | `The plan--if there is one--fails.`           | `The plan—if there is one—fails.`     | P3, tight both sides                                                                                                                                                           |
| 3   | `1914-1918 and pp. 34-36`                     | ⟶                                     | digit-flanked on both sides of both tokens — never reaches `dashes` at all (§1, §3.3); see [ranges.md](ranges.md) §6 row 3 for what `ranges` does with this input when explicitly enabled |
| 3a  | `Takes 5-10 days`                             | ⟶                                     | digit-flanked — see [ranges.md](ranges.md) §6 row 3a                                                                                                                           |
| 3b  | `aged 9-10 years`                             | ⟶                                     | digit-flanked — see [ranges.md](ranges.md) §6 row 3b                                                                                                                           |
| 3c  | `chapters 1-12`                               | ⟶                                     | digit-flanked — see [ranges.md](ranges.md) §6 row 3c                                                                                                                           |
| 3d  | `0-60 in six seconds`                         | ⟶                                     | digit-flanked — see [ranges.md](ranges.md) §6 row 3d                                                                                                                           |
| 3e  | `won 10-7`                                    | ⟶                                     | digit-flanked; also declined by `ranges` itself when enabled — see [ranges.md](ranges.md) §6 row 3e                                                                           |
| 3f  | `code 9-05`                                   | ⟶                                     | digit-flanked; also declined by `ranges` itself when enabled — see [ranges.md](ranges.md) §6 row 3f                                                                           |
| 3g  | `Call 555-1234`                               | ⟶                                     | digit-flanked; also declined by `ranges` itself when enabled — see [ranges.md](ranges.md) §6 row 3g                                                                           |
| 3h  | `Call 1-800 now`                              | ⟶                                     | digit-flanked; also declined by `ranges` itself when enabled — see [ranges.md](ranges.md) §6 row 3h                                                                           |
| 3i  | `the 2020-24 season`                          | ⟶                                     | digit-flanked; also declined by `ranges` itself when enabled — see [ranges.md](ranges.md) §6 row 3i                                                                           |
| 3j  | `Figure 5-10`                                 | ⟶                                     | digit-flanked — never reaches `dashes` (§1, §3.3), so this compound label is a byte-identical no-op with default options. See [ranges.md](ranges.md) §5 and §6 row 3j for the documented, opt-in-only limitation |
| 4   | `A well-known e-mail address`                 | ⟶                                     | P1: bare hyphen, unspaced                                                                                                                                                      |
| 5   | `COVID-19 and ISO 8859-1`                     | ⟶                                     | `COVID-19`: `cp[L]` is a letter, P1's compound-word guard declines it. `ISO 8859-1`: digit-flanked — never reaches `dashes` (§1, §3.3); see [ranges.md](ranges.md) §6 row 5 for what `ranges` does with the digit-flanked token when explicitly enabled (G4 rejects it there, 4 vs 1) |
| 6   | `Released 2026-08-15, ISBN 978-3-16-148410-0` | ⟶                                     | digit-flanked — never reaches `dashes` (§1, §3.3); see [ranges.md](ranges.md) §6 row 6 (G2 chain rejects both there when `ranges` is enabled)                                 |
| 7   | `Call 212-555-1234`                           | ⟶                                     | digit-flanked — never reaches `dashes` (§1, §3.3); see [ranges.md](ranges.md) §6 row 7 (G2 chain rejects it there when `ranges` is enabled)                                   |
| 8   | `run --force to override`                     | ⟶                                     | asymmetric spacing                                                                                                                                                             |
| 9   | `- first item`                                | ⟶                                     | no content to the left on the line                                                                                                                                             |
| 10  | `Scores: 20-10`                               | ⟶                                     | digit-flanked — never reaches `dashes` (§1, §3.3); see [ranges.md](ranges.md) §6 row 10 (G5 rejects it there when `ranges` is enabled, 20 > 10)                               |

### `de-DE` — `parenthetical: "en-spaced"` (`range` is now [ranges.md](ranges.md)'s field, `"en-tight"`, not this rule's)

| #   | Input                                         | Output                                        | Why                                                    |
| --- | --------------------------------------------- | --------------------------------------------- | ------------------------------------------------------ |
| 11  | `Der Plan--falls es einen gibt--scheitert.`   | `Der Plan␣–␣falls es einen gibt␣–␣scheitert.` | `en-spaced` inserts the spacing the tight input lacked |
| 12  | `Der Plan␣–␣falls es einen gibt␣–␣scheitert.` | ⟶                                             | already the target form                                |
| 13  | `Seiten 34-36`                                | ⟶                                              | digit-flanked — never reaches `dashes` (§1, §3.3); see [ranges.md](ranges.md) §6 for what `ranges` does with this input when explicitly enabled |

### `ru` — `parenthetical: "em-spaced"` (`range` is now [ranges.md](ranges.md)'s field, `"em-tight"`, not this rule's)

| #   | Input                          | Output                               | Why                                                                                                                                                                                 |
| --- | ------------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 14  | `Москва␣-␣столица`             | `Москва␣—␣столица`                   | `em-spaced`                                                                                                                                                                         |
| 15  | `Москва⍽—␣столица`             | ⟶                                    | declined by the **symmetry guard** (`lsp = 0`, since a U+00A0 is not this rule's spacing; `rsp = 1`) — unaffected by step 2a's retirement, because the symmetry guard has never read which `DASH` glyph the token holds                                                 |
| 16  | `из-под стола, кое-что`        | ⟶                                    | P1. (`hyphen`, order 35, will bind these two hyphens with U+2011 — that is a different rule)                                                                                        |
| 17  | `Годы 1941-1945 были тяжёлыми` | ⟶ | digit-flanked — never reaches `dashes` (§1, §3.3); see [ranges.md](ranges.md) §6 row 17 for what `ranges` does with this input when explicitly enabled (Russian sets an em dash in ranges, `range: "em-tight"`) |
| 17a | `в XV—XVII веках`              | ⟶                                    | **guard P4.** A tight em dash between two Roman-numeral runs is a range already in its correct form. Previously produced `в XV — XVII веках`, damaging input that was already right |
| 17b | `в XV-XVII веках`              | ⟶                                    | P4 fires here too (it tests the token's spacing and its neighbours, not which dash was typed), so the hyphen is left as written rather than converted. A miss, not damage — §7.2   |
| 17c | `Москва—столица`               | `Москва␣—␣столица`  | Cyrillic is not `ROMAN`, so P4 does not fire. ru's parenthetical is `em-spaced`; the token's length already matches (`em`), so only its spacing changes — but a length mismatch would convert here too, since spec 0.2.0 retired the token-level distinction entirely (§3.2 step 2a) |

### Idempotency regression cases

These are the shipped defects from §8.2. Both are now "no change" cases, and both must be
fixtures.

**Spec 0.5.0 note.** Every row below has been re-verified against `dashes`' own current output
(default options — `ranges` disabled), not the old combined rule's. Every one is still "no
change", but for a digit-flanked row (18, 20, 24, 25) that involves a would-be range token, the
reason is no longer "the shared guards evaluate and reject it" — with `ranges` off, that token is
simply never looked at by anything. The output these rows assert is unaffected; the "Why" column's
reasoning about a digit-flanked sub-token predates the split and should be read as "and, if
`ranges` is also enabled, its own G-guards independently reject the same token" rather than as a
claim about default-options behaviour.

| #   | Locale  | Input                   | Output    | Why                                                                                                                                                                                                                                                                                                                                   |
| --- | ------- | ----------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 18  | `ru`    | `a—0–0`                 | ⟶         | §3.2 step 7: one cluster (`—`,`0`,`–`,`0`) with two dash runs → entirely inert. Previously converged only after two runs                                                                                                                                                                                                              |
| 19  | `en-US` | `a-␣-␣a`                | ⟶         | §3.2 step 6: the second token's `cp[L]` is `-`, in `DASH`. Previously produced `a-—a` and then `a—a`                                                                                                                                                                                                                                  |
| 20  | `de-DE` | `1914-1918--annexation` | ⟶         | one cluster, three dash runs. Previously the `--` became `␣–␣` on run 1 and the range fired on run 2                                                                                                                                                                                                                                  |
| 21  | `en-US` | `a␣-␣-␣b`               | ⟶         | both tokens see a `DASH` at `cp[L]` or `cp[R]`; also the shape that would have produced overlapping edit spans (§3.5)                                                                                                                                                                                                                 |
| 24  | `de-DE` | `a–1␣-␣1`               | ⟶         | **defect (c), §8.2 (historical).** Step 8 (shared): the `–` is tight, `en-spaced` would make it spaced, and the digit run `1` to its right has a `-` two code points beyond → the `–` is inert. The `-` was rejected by `ranges`' own G2 (`before` is `–`) at the time this row was written, pre-0.5.0. Previously `a – 1 - 1` then `a – 1–1`                                                                                |
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
| 35  | `fr`    | `«⍽–␣"`           | ⟶      | **defect (d), §8.2.** The U+00A0 that `nbsp` N8 inserted after `«` is not spacing, so `lsp = 0` against `rsp = 1` and the symmetry guard declines. Under the previous left-only rule this read as symmetric and was promoted to `«⍽—␣"` on the second pass |
| 36  | `fr`    | `«–␣"`            | ⟶      | the pass-1 form of case 35: `cp[s-1]` is `«`, not a space, so the token is asymmetric from the start. `nbsp` then inserts the inner space, producing case 35, which is now a fixed point                                                                   |
| 37  | `fr`    | `«⍽–␣a`           | ⟶      | the same family with a letter to the right; all five witnesses (`«`, `"`, `'`, `a`, `1`) behave identically                                                                                                                                                |

### Dash-glyph reclassification, spec 0.2.0 (formerly "the authored-dash guard — §3.2 step 2a")

The M4 gate rejected 1063 lines of exactly this shape, 30% of the whole diff: the author's spaced
em dashes rewritten to the `en-US` `em-tight` convention. `en-GB` was no escape — there the same
em dashes became en dashes on 1060 lines. Both English locales were restyling a deliberate
authorial choice across an entire corpus.

| #   | Locale  | Input                                  | Output                            | Why                                                                                                                     |
| --- | ------- | -------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 38  | `en-US` | `documents␣—␣PDFs, invoices␣—␣and you` | `documents—PDFs, invoices—and you` | **the M4 blocker, reopened deliberately in spec 0.2.0** (§8.1). en-US's parenthetical is `em-tight`; the author's dash is already EM, so only its spacing is corrected — length happens to already match here |
| 39  | `en-GB` | `documents␣—␣PDFs␣—␣and you`           | `documents – PDFs – and you`       | the same input in the other English locale: en-GB's parenthetical is `en-spaced`, so the length converts (em → en) as well as the spacing already being correct — this is the M4 corpus's own shape, reopened on the same operator decision as row 38 |
| 40  | `en-US` | `The plan␣-␣if there is one␣-␣fails.`  | `The plan—if there is one—fails.` | **hyphen input is unaffected** — this is the conversion the rule exists for, and it still fires                         |
| 41  | `de-DE` | `Der Plan—falls es einen gibt—fällt.`  | `Der Plan – falls es einen gibt – fällt.` | an em dash typed by the author; de-DE's parenthetical is `en-spaced`, so both the length (em → en) and the spacing (tight → spaced) are corrected. Under 0.1.0's guard, and under the briefly-shipped 0.2.0 narrowing, this row stayed unchanged — retiring the guard outright is what converts it |
| 42  | `en-US` | `a-–b`                                 | `a—b`                              | a **mixed run** of `DASH` glyphs is a single token, promoted exactly as the equivalent hyphen run (`a--b`) would be — P3 admits a `k = 2` run regardless of spacing                                                          |
| 43  | `en-US` | `1914–1918`                            | ⟶                                 | digit-flanked — never reaches `dashes` (§1, §3.3); already correctly a no-op under default options regardless. See [ranges.md](ranges.md) §6 row 43 for `ranges`' own behaviour (also a no-op here, since the token is already exactly `en-tight`) when explicitly enabled |
| 44  | `en-US` | `1914-1918`                            | ⟶                                 | digit-flanked — never reaches `dashes` (§1, §3.3); a byte-identical no-op with default options. See [ranges.md](ranges.md) §6 row 44 for what `ranges` does with this input when explicitly enabled (converts and binds) |

### The joiner-transparency repair — §3.2b, dashes.md's current scope

Every row in the pre-0.5.0 version of this subsection was a digit-flanked token — `ranges`'
territory exclusively now. They are relocated to [ranges.md](ranges.md) §6 (rows 45-47), which is
the current normative source; row numbers are unchanged for citation stability. With default
options every one of them is a no-op here, for the same reason as rows 43-44 above: `dashes`
never reaches a digit-flanked token at all.

| #   | Locale  | Input       | Output | Why                                                                                                    |
| --- | ------- | ----------- | ------ | -------------------------------------------------------------------------------------------------------- |
| 45  | `de-DE` | `1-1␣-␣1`   | ⟶      | digit-flanked — never reaches `dashes`; see [ranges.md](ranges.md) §6 row 45 (defect (e), §8.2, reproduced there under explicit opt-in) |
| 46  | `de-DE` | `1–1␣-␣1`   | ⟶      | digit-flanked — never reaches `dashes`; see [ranges.md](ranges.md) §6 row 46 (the control for row 45)  |
| 47  | `ru`    | `1-1␣-␣1`   | ⟶      | digit-flanked — never reaches `dashes`; see [ranges.md](ranges.md) §6 row 47                           |

### `el` — `parenthetical: "none"` (`range` is now [ranges.md](ranges.md)'s field, also `"none"`, not this rule's)

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
| 48  | `άτομα ηλικίας 25-45 ετών`             | ⟶      | digit-flanked — never reaches `dashes` (§1, §3.3); see [ranges.md](ranges.md) §6 row 48 for `ranges`' own no-op here (`range: "none"` — nothing to emit even when explicitly enabled) |
| 49  | `Το σχέδιο␣-␣αν υπάρχει␣-␣αποτυγχάνει` | ⟶      | classified as a parenthetical, `parenthetical: "none"` → nothing emitted                                         |
| 50  | `την περίοδο 1989–1991`                | ⟶      | digit-flanked — never reaches `dashes` (§1, §3.3); already an en dash in the form the source prints, so [ranges.md](ranges.md) is inert here too even when explicitly enabled |

### A locale with no verified convention — `parenthetical: "none"` (`range` is now [ranges.md](ranges.md)'s field, also `"none"`, not this rule's)

| #   | Input                                 | Output | Why                                                                             |
| --- | ------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| 51  | `The plan␣-␣if there is one␣-␣fails.` | ⟶      | the token is classified as parenthetical and then nothing is emitted            |
| 52  | `1914-1918`                           | ⟶      | digit-flanked — never reaches `dashes` (§1, §3.3); see [ranges.md](ranges.md) §6 row 52 for `ranges`' own no-op here (locale has no verified `range` convention) |

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

**Every item below is current** — an open question or a decided limitation of `dashes` itself, as
of spec 0.6.0. Range-specific open questions (ASCII-only digits, decimal ranges, abbreviated-year
ranges, scores, the U+2060 review hazard) moved to [ranges.md](ranges.md) §7, since `ranges` is
the rule they are now open *against*; purely historical material (the authored-dash guard's
development, the compound-label widening's original acceptance) moved to §8.

1. **Named date ranges typed with an ASCII hyphen remain a genuine cross-rule miss — narrowed but
   not closed by P5 (spec 0.6.0).** P5 only ever declines an *already-authored* U+2013; it has no
   opinion about a hyphen. `1 May - 3 June` has a letter on one side of the hyphen, so `dashes`
   (not `ranges`) still processes it and still produces an em dash in `en-US`; only
   `1 May – 3 June` — where the author already typed U+2013 — is now protected. `dashes` owns the
   remaining failure on its own side — it has no month-name data and P1/P4 give it no way to
   recognise the hyphen-typed shape as anything but an ordinary parenthetical dash — and `ranges`
   cannot help either, since `ranges` never sees a letter-flanked token at all (§1, §3.3).
   Recognising the hyphen-typed case would need month-name lists, which is locale data the schema
   does not have and which is not mine to add
   unilaterally. Recorded as a known miss on `dashes`' side of the boundary.
2. **P4 declines rather than converts, so `XV-XVII` keeps its hyphen** (§6 case 17b). The full fix
   is to admit `ROMAN` runs as range-like candidates with guards of their own — but a
   length-based guard does not transfer cleanly (`XV`/`XVII` differ in length) and a
   non-decreasing check would need Roman-to-integer evaluation, a parser rather than a comparison.
   Given all-caps English words built from Roman letters (`MIX`, `CIVIL`, `VIVID`), converting is
   the direction that can damage, so v1 declines. If Russian fixtures show the miss matters, the
   right shape is a length-bounded `ROMAN` run (say ≤ 7 code points) plus a real numeral
   evaluation, specified here first.
3. **A dash whose spacing is partly no-break is never normalised at all.** If an author writes
   `mot⍽- autre` by hand, this rule declines rather than converting, because it cannot tell that
   U+00A0 from one `nbsp` put there. That is a deliberate miss on the conservative side, and it is
   the price of the structural discharge in §5.4. If real content shows it, the fix is **not** to
   reinterpret no-break spacing here — that road has produced defects (§8.2) — but to have `nbsp`
   avoid creating the shape, which requires it to know what a dash token is.
4. **T1 (§3.2 step 8) costs a small class of legitimate normalisations**, and the cost is worth
   naming rather than hiding. In a `-spaced` parenthetical locale, a tight dash that sits directly
   against a digit run which has another dash beyond it is left alone: `de-DE` leaves
   `Anhang A–1-2` untouched, where an unguarded rule would produce `Anhang A – 1-2`. I judge that
   a _gain_ — `A–1`, `B-2`, `Teil C-3` are identifiers, and spacing them out is a false positive of
   the kind the M4 gate exists to catch — but it is a behaviour change reached for a composition
   reason (protecting `ranges`' next-pass verdict, §5.3), not a typographic one, and it should be
   confirmed against real content. The guard fires only when a second dash is present near the
   digit run, so the ordinary `Kapitel 3—Einleitung` still normalises.
5. **Two of this rule's guards now exist mainly for composition with `ranges` rather than for
   `dashes`' own typography** (step 7's cluster guard and step 8, T1). That is real machinery for
   inputs — `a–1 - 1`, `a- - a` — that no author writes deliberately, kept because it protects a
   *different* rule's next-pass verdict (§5.3) as much as it protects this rule's own. The
   alternative design, which was not taken, is to declare a token inert whenever *any* other dash
   lies within some fixed radius — one guard instead of two, but one that would also drop
   `pp. 34-36 — see notes` and `— 1914-1918 годы`, both real Russian and English copy. Recorded so
   the trade is visible if the guard set ever needs simplifying.
6. **Decided refusals, verified against Lebedev's live service.** Recorded here so they are not
   re-litigated:
   - **A direct-speech dash at line start** — `—` opening a line of dialogue, and the conversion
     of a leading `-` into one. Refused, and it is refused _by construction_ rather than by
     preference: in `markdown` a leading `- ` is a list marker, so a rule that rewrote it would
     silently destroy list structure in the author's own content format. §3.2 step 5 already
     declines a token with no content to its left, and that is now a deliberate guarantee rather
     than a side effect.
   - **ISO date reformatting** (`2026-08-15` → any other form). Refused, and as of spec 0.5.0 this
     is entirely [ranges.md](ranges.md)'s question to answer, not this rule's — `dashes` never
     sees a digit-flanked token at all (§1, §3.3). Recorded here because the refusal predates the
     split and the reasoning (declining the whole cluster rather than guessing) is the shared
     philosophy both rules still apply via the cluster guard (§3.2 step 7).
   - **`->` and `=>` as arrows.** Refused — they are source code far more often than prose, and
     the symmetry guard already declines them.
   - **Wrapping output in markup.** Refused as an architectural matter — see `symbols.md` §7.8.
     Encoding a _guess_ about what a digit-dash chain means, rather than declining it outright, is
     what makes an external service's markup-wrapping approach dangerous (it once wrapped a date
     as a phone number); declining the whole cluster is the better trade.
7. **T2's set is deliberately wider than `spaces`' `STRIP-BEFORE`, by U+2026, and no fixture
   covers the difference.** §3.2 step 9 declines a `-spaced` form before U+2026 although `spaces`
   would not delete a space there. Both readings are idempotent, so the property suite cannot
   separate them — **only a fixture can**, and `a--…` in a `-spaced` locale has none. Needed: one
   positive row per `-spaced` locale asserting that the input is returned unchanged. Until it
   exists, a port could transcribe either set and stay green. (T2 is shared with `ranges`, §3.3
   there — the same gap applies to a `-spaced` range replacement before U+2026.)

---

## 8. History

**This section is explicitly non-normative.** §1 through §7 above are the complete current
contract for `dashes`; nothing below is required of a conformant implementation. §8 exists so the
reasoning trail and defect record that produced that contract are not lost — several guards in
§3.2 and guarantees in §5 exist *because* of a specific historical counterexample, and an
implementer who understands why a guard exists is less likely to remove it by mistake. Every
subsection is dated and points to whichever current document — this one or
[ranges.md](ranges.md) — now normatively owns the behaviour it describes.

### 8.1 The authored-dash guard: introduction and full retirement (spec 0.1.0 → 0.2.0)

Spec 0.1.0 introduced an unconditional guard at what is now §3.2 step 2a: any dash run containing
U+2013 or U+2014 was declined outright, glyph and spacing both, whatever the locale said. It was
itself a repair — an M4 corpus run found 1063 lines across 155 files where restyling an author's
dash (length and spacing changed together) was pure damage against a criterion (PLAN.md §8) that
names exactly that as a ship blocker.

A later revision inside 0.2.0 narrowed the guard rather than removing it — preserve the author's
dash length, correct only the spacing — after a `Минус — при разногласиях`-shaped operator
complaint showed the unconditional form leaving genuinely mis-spaced dashes broken forever. That
narrower design shipped only briefly: it rested on treating a dash's length as reliably an
authorial decision, and on review that premise did not hold in general — a dash's length in
ordinary prose is at least as often a copy-paste artefact or plain unfamiliarity with which mark
is which as it is deliberate, and this project has no way to tell the two apart from context.
**The guard was retired outright, on the same footing this rule has always used for spacing:
correcting an author's mechanical error is what a normalising pass is for, and an author who
wants their own typography untouched has always had the option of not running one.**

From spec 0.2.0 onward, U+2013/U+2014 carry no token-level special case anywhere in the algorithm:
a run holding them is classified and replaced exactly as the same run spelled with U+002D would be
(current: §3.1, §3.2 step 2a, §3.4 P2). Two consequences, current and worth restating plainly:

- **Every locale's dash convention now governs every dash in the document, hyphen-typed or not.**
  `documents — PDFs, invoices — and you` and `documents–PDFs, invoices–and you` both become
  `documents—PDFs, invoices—and you` in `en-US` (§6 case 38). This is the M4 corpus's 1063-line
  class, reopened deliberately: the operator judged the M4 gate's finding reflected a false
  premise about dash length being authorial, not a property the tool had to preserve regardless
  of that premise.
- **A range already in its exact target form is still never bound; a range needing any visible
  correction is** — current, [ranges.md](ranges.md) §3.3.1's invisible-edit test, not this rule's
  concern at all as of spec 0.5.0 (§1). This asymmetry is unaffected by the guard's retirement —
  it was never about authorship, only about reviewability (§8.6) — and remains the one most likely
  to be reported as a bug (§6 cases 43, 44).

The length restriction could be reopened only by a locale field distinguishing "normalise dash
length" from "promote hyphens only" — a caller preference, not a typographic fact about a
language, and so not something that belongs in a locale file.

The section number `2a` (§3.2) is kept rather than renumbered, for the same reason a retired step
generally keeps its number in this document: several documents cite it (this one's own §3.1,
§3.4; `ranges.md` §3.1).

### 8.2 Idempotency defects of the pre-0.5.0 combined rule

Through spec 0.4.x, this rule evaluated both the parenthetical and the digit-flanked (range)
branches of every dash token, and five idempotency defects were found and closed during that
period. Two remain live concerns for `dashes` alone today (§5.2 restates their guards directly,
without walking through the defect history); three were purely an interaction between the two
branches and are now `ranges`' own composition obligation ([ranges.md](ranges.md) §4).

**Defect (b) — `DASH SPACE DASH`, current guard: §3.2 step 6.** `en-US`, input `a- - a`. The first
hyphen was asymmetric and rejected; the second, symmetric with `cp[L] = "-"`, was not rejected by
the guard then in place, so it normalised to a tight em dash — placing it directly against the
first hyphen, where the two formed a single run of length 2 with a different verdict on the next
pass (`a- - a → a-—a → a—a`). **Repaired by extending §3.2 step 6** to reject a `DASH` neighbour at
`cp[L]` or `cp[R]`, which is current §5.2's "`cp[L]`, `cp[R]`" argument and also what gives §3.5
its non-overlap guarantee.

**Defect (d) — a manufactured left space, current guard: §3.2 step 3.** `fr`, where
`quotes.primary.innerSpace` is `nbsp` and `dash.parenthetical` is `em-spaced`: `«– " → « – " → «
— "`. Five witnesses, one family, `fr` only: `«` followed by U+002D or U+2013, then U+0020, then
any content. On pass 1 the token was asymmetric (`«` is not a space) and declined; `nbsp` then
inserted the guillemet's inner U+00A0; on pass 2, under the *previous* rule ("a no-break space
counts as spacing on the left"), the token read as symmetric and was wrongly promoted from en to
em. This mattered more than (a)–(c) below: the input was *already-typeset text* built from
characters the pipeline itself emits (`«` from `quotes`, U+00A0 from `nbsp`, the dash from this
rule), reachable by re-processing the pipeline's own output — the CMS-on-every-save case
PLAN.md §1 names as the reason idempotency is the package's headline property. It was also
self-inflicted: the left-only rule was introduced as the repair for an earlier `nbsp`-composition
defect, and was precisely what made this one reachable. **Repaired by removing that whole class of
reasoning** (current §3.2 step 3): only U+0020 is this rule's spacing, a no-break space on either
side makes the token inert, and every character `nbsp` can emit is therefore inert here — the
structural CO-S discharge current §5.4 states.

**Defect (a) — `DASH digits DASH`, historical: now `ranges`' concern.** `ru`, input `a—0–0`. The
em dash was a parenthetical token that normalised to `␣—␣`; the en dash was a range candidate
whose `before` was that em dash (G2 rejected it); after the first edit, `before` became a space,
G2 no longer rejected, and the second pass emitted `0—0` — not a fixed point. Repaired by the
cluster guard (§3.2 step 7, shared): `a—0–0` is one cluster with two dash runs, so both tokens are
inert from the start. The cluster guard remains current and shared (§5.2), but the *reason* it
mattered here — a range token's G2 reading a neighbour's dash — is [ranges.md](ranges.md) §4's own
composition-obligation proof now, not this document's.

**Defect (c) — the spaced sibling of (a), historical: now `ranges`' concern.** `de-DE`/`ru`, input
`a–1 - 1`: the cluster guard from defect (a) was not enough, because a *spaced* range token's own
outer spacing ends its cluster before it reaches the neighbouring dash. Witness: `a–1 - 1 → a – 1
- 1 → a – 1–1`, reproduced in every locale whose parenthetical is `-spaced` and whose range is not
`none`. Repaired by the spacing-transition guard (T1, §3.2 step 8): a tight token may not become
spaced when doing so would insert a space between itself and a digit run that has another dash on
its far side. T1 is current and lives in `dashes` (current §5.3) precisely because it is
`dashes`' own edit that must not disturb `ranges`' verdict on the next pass — the guard itself is
current, but the G2-side half of the story (why this is the only verdict input `dashes` can
perturb) is `ranges`' concern; the full historical argument is §8.3.

**Defect (e) — the joiner blinds a neighbour's G2, historical: now `ranges`' concern.** Every
locale whose range is not `none`, witness `1-1 - 1 → 1⟨J⟩–⟨J⟩1 - 1 → 1⟨J⟩–⟨J⟩1⟨J⟩–⟨J⟩1` (seven
characters — beyond the length-4 exhaustive bound normative at the time, which is why the shipped
suite did not catch it). §3.3.1's joiner sat between a digit run and a dash, so on the next pass
the neighbouring token's `before` read as a `JOINER`, in neither `DASH` nor `INERT-DASH`, and G2
wrongly admitted a range that should still have been rejected. Repaired by §3.2b: every guard that
leaves its own token reads an *effective neighbour* that skips joiners, so `before`/`after` see
through the joiner to the real dash underneath. §3.2b is current and shared; the G2-specific
consequence is [ranges.md](ranges.md)'s own concern now.

**Summary of fixes**, for citation stability (§6 cases 18–21, 24–26 pin these):

1. Defect (b): extending step 6 to reject a `DASH` neighbour.
2. Defect (a): the cluster guard, step 7.
3. Defect (c): the spacing-transition guard, step 8.
4. Defect (d): removing "no-break space counts as spacing" entirely, step 3.
5. Defect (e): joiner-transparent effective neighbours, §3.2b.

### 8.3 The pre-0.5.0 range-token verdict argument (G2 as the one perturbable input)

Reproduced as history — this is the fullest statement of *why* T1 was the only guard defects (c)
and (e) needed, from when `before`/`after`/G1-G5 were still this document's own concern rather
than `ranges`':

For a range token `T`, the verdict inputs `Lrun`, `Rrun` (digit runs) are untouched by any edit —
no edit touches a digit. `before`/`after` are the code points adjacent to `Lrun`/`Rrun`, and for a
*spaced* token they lie two positions beyond `cp[L]`/`cp[R]`, outside the token's own cluster,
where neither the isolation guard (step 6) nor the cluster guard (step 7) can see them. G1, G3 and
G5 read them for membership in `LETTER`, `.`/`,`/`/` and digit value — none of which any edit can
produce or destroy. **G2 reads them for membership in `DASH` ∪ `INERT-DASH`, and that is the one
verdict input the rule was capable of changing**, via a `-spaced` replacement: a neighbouring
tight token that becomes spaced replaces a dash at that position with a space, turning a G2
rejection into a G2 admission.

Every instance of that flip has the same shape. Let `T` be a range token G2 rejected, so `before`
(say) is a dash at index `d-1`, where `d` is the start of `Lrun`. For that dash to become a space,
it must be inside some edited token `A`'s span, and `A`'s replacement must place a U+0020 at
exactly that index — which requires `A`'s run to end at `d-1` with `rsp_A = 0`, and `A`'s chosen
form to be `-spaced`. In other words: `A` is tight, `A` is about to become spaced, and the side of
`A` about to gain a space faces `Lrun`, which has a dash on its far side. That is precisely, and
only, the configuration T1 (§3.2 step 8) declares inert. The mirrored argument gives the `after`
side. T1's two-code-point reach is exactly what the case requires and no more: `T`'s dash sits at
distance 1 from `Lrun` if `T` is tight and distance 2 if `T` is spaced, and a `-spaced` replacement
inserts exactly one U+0020, so no other distance is reachable. The reverse flip — `before` going
from a space to a dash — is benign and needs no guard: it turns a G2 admission into a G2
rejection, and a rejection emits nothing, so a token converted on an earlier pass simply keeps the
form it was given.

The current version of this argument, for the tokens `ranges` now owns exclusively, is
[ranges.md](ranges.md) §4.

### 8.4 Range binding and CO-S under the retired authored-dash guard (spec 0.2.0)

Reproduced as history: at the time this was written, a tight range was bound (§3.3.1, pre-0.5.0)
by this same rule, and the CO-S argument below is what proved that binding survived the authored
dash guard's retirement. A tight range this rule bound was, on its next pass, a single U+2013 or
U+2014 reached by crossing its own `JOINER` pair. Under 0.1.0's guard this was the case the guard
was built to recognise (via the crossed-joiner check re-admitting a digit-flanked token); under
0.2.0 the same token was just an ordinary range candidate that happened to already hold the
correct glyph, and §3.3.1's (pre-0.5.0) *invisible-edit test* — compute the unbound form, and bind
only if the unbound form would itself be a visible change — is what kept it a fixed point: the
unbound form equalled the input exactly (right glyph, right spacing), so `bind` stayed `false` and
the joiners were re-affirmed rather than stripped. This was confirmed, not merely argued, at the
time: the then-combined rule's exhaustive bounded sweep and its `fast-check` idempotency property
both covered the 0.2.0 code path and were green.

The current version of this proof, for `ranges`' own binding, is [ranges.md](ranges.md) §4's
rule-order argument together with `tests/rules/ranges.test.ts`.

### 8.5 Compound labels and the G4 `(1,2)` branch: why the widening was accepted (spec ≤ 0.4.1)

`Figure 5-10`, `Table 3-12` and `Section 2-14` mean "chapter 5, figure 10" — a two-part label, not
a range — and, when the rule that owned range detection also owned an equal-length-or-`(1,2)`
guard, the hyphen converted to an en dash. So did the proper nouns `9-11` and `7-11`. The exposure
was pre-existing, not introduced by the `(1,2)` branch: `Figure 3-7` is `(1,1)`, satisfies the
equal-length branch, and had converted since the first version of the rule. What the `(1,2)`
branch did was *widen* an exposure that already shipped — from `Figure 3-7` to `Figure 5-10` as
well. That distinction is why the widening was judged acceptable at the time: declining `5-10`
bought no protection against the class that was actually exposed, while costing a construction
(`takes 5-10 days`, `aged 9-10`, `0-60`) about as common as ranges get in English.

Separating the two needs the preceding noun — `Figure`, `Table`, `Section`, `Fig.`, `Abb.`,
`рис.` — an open-ended, per-locale, per-house-style word list with no natural closure and no
citable evidence at the time (or since). The failure mode was judged mild relative to the
phone-number case: a hyphen becoming an en dash inside a label is a normalisation a reader may not
even notice, whereas converting `555-1234` would corrupt a number.

**Current status.** As of spec 0.5.0, this entire question belongs to `ranges` (order 25, off by
default) — see [ranges.md](ranges.md) §1 and §5 for the current statement of the same tradeoff,
which is unchanged in substance from what is reproduced above, only in which document and which
rule's default-on status governs its reachability. `dashes.md` §6 row 3j shows the current
byte-identical no-op with default options; `ranges.md` §6 row 3j shows what `ranges` still does
with the same input when explicitly enabled.

### 8.6 The U+2060 range binding: a review hazard, and what it cost (spec 0.3.x)

Every other change this rule made, before the split, was catchable by eye — a hyphen becomes a
dash, a space appears or disappears. §3.3.1's joiner was zero-width: the bound form
`1914⟨J⟩–⟨J⟩1918` and the unbound `1914–1918` were pixel-identical in every font, and a unified
diff showed a changed line with no visible difference on it. Two consequences, both paid for once:

- A worked-example table row that omitted the joiner looked correct on screen and was wrong at
  the byte level — several rows stayed stale after §3.3.1 landed, caught only by a fixture author
  checking raw bytes rather than trusting the rendering.
- The change was spec-first and legitimate, and still broke 32 fixture cases in another agent's
  files without announcing itself, because a normative change whose effect cannot be seen needs
  to be *told*, not shown.

The joiner also cost one idempotency defect — defect (e), §8.2 — needing a seven-character witness
to find, beyond the length-4 exhaustive bound normative at the time. Neither cost is an argument
against the binding, which is well-sourced, correct, and what stops a range breaking across lines
(the alternative, markup, is forbidden by `modes.md` §4). It is a record of what a zero-width
emission costs in reviewability, kept so the next person weighing one can read it rather than
re-derive it.

**Current status.** Range binding is exclusively [ranges.md](ranges.md)'s behaviour now (§3.3.1
there); the still-open, general lesson — that a future zero-width emission needs its own
announcement, and that fixture rows containing one must be checked in the escaped mirror, never
read on screen — is restated as a current open question at [ranges.md](ranges.md) §7.

### 8.7 Retired locale-field notes (spec 0.5.0)

`dash.range` carries the same five-value enum as `dash.parenthetical`, including `em-*` (Russian
uses it) and `none` — this was already true before the split and needed no schema change to move
which rule reads the field (§2). §3.6's old preservation clause (a no-break space beside a dash
was to be carried across an edit rather than replaced) is gone: a no-break space beside a dash now
makes the token inert (§3.2 step 3 + step 6), so no edit can contain one and there is nothing to
preserve — the Russian case it was written for is covered by declining instead (§6 case 34).

### 8.8 P5, the authored en-dash mark-identity veto: fresh M4 evidence and why it does not reopen
§8.1's retired guards (spec 0.6.0)

A fresh M4 dogfooding pass against the author's own blog corpus, run against the spec 0.5.0
implementation candidate, surfaced 8 human-rejected review rows, every one an authored U+2013 that this rule's P2 promoted
to U+2014: a cost range (`$0.005–$0.018`), a price-placeholder range (`€X–€Y`), a date range
occurring three times (`18 Oct–2 Nov`, tight and spaced), a compound article-title label
(`Senior–Junior Gap`), and both dashes of a joint eponymous algorithm name (`Fowler–Noll–Vo`).
Independently computed against the same corpus: of the 8598 rows in that review, **exactly 8**
touch an authored U+2013 as their edit's source character, and all 8 were the rejects above —
**zero** of the corpus's other 8589 accepted edits involve an authored en-dash at all. In this
real corpus, every single instance of "author typed U+2013" was range/joint-name damage, and
correcting an authored en-dash's glyph never once helped.

**Why this does not reopen 0.1.0's guard or 0.2.0's narrower one (§8.1).** Both of those declined
*any* dash whose length "looked off," including a hyphen-typed compound word's edge case, an
authored em-dash that merely needed re-spacing, and a run mixing glyphs — a broad claim the
operator judged, on the 1063-line M4 evidence available then, to be wrong more often than right
("a dash's length in ordinary prose is at least as often a copy-paste artefact... as it is
deliberate"). P5 makes a categorically narrower claim: not about dash *length* in general, but
about one specific, already-established mark — U+2013, used **alone**, as a pure single-code-point
run — which is not merely "a differently-sized em dash" the way `--` or `---` are, but a distinct
conventional glyph with its own established roles (range, connection, joint-naming) that a
length-based or "any DASH glyph" argument does not reach. §8.1's own reasoning for retiring the
guard — treating length as unreliable authorial signal — does not transfer to treating *which of
two established marks the author reached for* as unreliable, and the fresh evidence above is
specific to exactly that distinction: not "any authored dash," but "authored U+2013 alone."
`a-–b` (a mixed run) and every input holding U+2014 are unaffected by P5 and continue exactly as
0.2.0 left them (§6 case 42, case 38) — P5 does not touch em-dash handling at all, and this
corpus's evidence gives no reason to: it found zero em-dash rejects.

**Why P5 is unconditional across every locale, not keyed to `dash.parenthetical`'s target
glyph.** An earlier draft of this guard declined only when the locale's own target glyph was not
U+2013 (reasoning: if the target *is* U+2013, only spacing changes, never the glyph, so nothing
mark-identity-relevant happens). That is true of *this rule's own single-token replacement*, but
it does not follow that a target-glyph-conditioned guard is safe: the failure P5 exists to
prevent is an authored en-dash range or joint name being silently re-spaced into ordinary
sentence punctuation, and that risk is exactly as real when the target glyph is U+2013
(`en-GB`/`de-DE`/`de-CH`/`fi`/`sv`, all `en-spaced`) as when it is U+2014 — a tight authored
`18 Oct–2 Nov` respaced to `18 Oct – 2 Nov` in an en-spaced locale reads exactly as much like
ordinary parenthetical punctuation as the em-dash case does; only the glyph substitution is
absent, not the risk. P5 therefore declines the whole token — glyph *and* spacing both — in every
locale, on the same footing P4's Roman-numeral veto declines regardless of what
`dash.parenthetical` says: a veto that depended on the locale's own target would leave the
identical semantic failure reachable in exactly the locales whose target happens to already be
U+2013, which is precisely backwards from what fresh evidence about *this* glyph is meant to
protect.

**Fixture cost, computed, not estimated.** Every locale's `dashes` fixtures were checked for a
row exercising "authored en-dash promoted to a different glyph": none exists anywhere in the
canonical set. The only prose claim P5 falsifies is `en-us-dashes-authored-em-dash-respaced`'s
note (§6), which asserted an authored en-dash converts identically to an authored em-dash; that
note is corrected in the same change that introduces P5.
