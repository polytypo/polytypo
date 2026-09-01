# Rule: `ranges`

**Order:** 25. **Default:** off. **Modes:** text, html, markdown.
**Spec version:** 0.5.0 (new rule; split out of `dashes`).

---

## 1. Purpose

`ranges` recognises the numeric/date **range dash** — `1914–1918` — and renders it in the form
the locale prescribes. It is the second of the two typographic uses `dashes` (order 30) used to
own; the two rules together still cover exactly the same input shape `dashes` alone used to
(spec ≤ 0.4.1), split apart because they now carry **different default-on status**.

**Why this is a separate opt-in rule rather than a bounded fix inside `dashes`.** A digit-flanked
hyphen shaped `5-10` is genuinely ambiguous without knowing the word that precedes it:

- `takes 5-10 days`, `aged 9-10 years`, `pages 5-10`, `0-60`, `€30-80` — genuine ranges. Converting
  the hyphen to the locale's dash is correct.
- `Figure 5-10`, `Table 3-12`, `Section 2-14` — **compound labels**, not ranges (they mean "figure
  10 in chapter 5" — chapter-and-item, not a span). Converting the hyphen here is a false positive
  that reads oddly to a careful proofreader, even though it is rarely noticed casually.
- `9-11`, `7-11` — bare proper nouns (a date, a convenience-store chain) that happen to have the
  identical digit-hyphen-digit shape and are neither a label nor a range.

Separating the first case from the second and third needs the word immediately before the
hyphen's left digit run — `Figure`, `Table`, `Section`, `Fig.`, `Abb.`, `рис.` — which is an
open-ended, per-locale, per-house-style word list with no natural closure
([dashes.md](dashes.md) §7.11, carried forward unchanged from when this algorithm lived there).
`locale.schema.json` could hold such a list as literal strings, but populating it would mean
either (a) inventing entries with no normative citation — forbidden by this project's evidence
discipline (PLAN.md §6.1) — or (b) leaving it empty, which is not a fix, only a schema field that
looks like one. Neither the bare digit-hyphen-digit shape nor a label word list gives a
**structurally closed, portable** rule that never produces a false positive: this project's rules
scan code points, not words with real-world referents, and are built never to consult that kind
of context (ARCHITECTURE.md §4.1).

**The resolution is: make range conversion something the caller explicitly asks for, and leave it
off by default.** With `ranges` off (the default), `5-10`, `Figure 5-10`, `9-11` and `7-11` are
all byte-identical no-ops — the compound-label false positive cannot occur, because nothing in
this class converts at all. A caller who explicitly opts in (`{ rules: { ranges: true } }`) is
choosing to accept the residual, structurally irreducible ambiguity between a genuine range and a
same-shaped label or proper noun, in exchange for genuine ranges being typeset correctly. This is
a documented tradeoff, not a claim of reliable label detection — see §5.

---

## 2. Locale data consumed

- `dash.range` — one of `"em-tight"`, `"em-spaced"`, `"en-tight"`, `"en-spaced"`, `"none"`. The
  **same field**, under the **same locale JSON key**, `dashes` has always read for range styling
  — this rule's split from `dashes` moves which rule reads it, not what the field means or which
  citations support it. No new locale claim is made by this document (operator decision, spec
  0.5.0): every `dash.range` value in `spec/locales/*.json` is unchanged from spec 0.4.1.

`"none"` means the locale has no verified range convention, and this rule must emit nothing at
all for a range token in that locale — not a fallback to `dash.parenthetical`, nothing.

---

## 3. Algorithm

Input is a code-point array `cp[0 … n-1]`. Character classes (`DASH`, `DIGIT`, `LETTER`, `SPACE`,
`BREAK`, `NOBREAK-SPACE`, `INERT-DASH`, `JOINER`) are exactly [dashes.md](dashes.md) §3.1's —
this rule and `dashes` read the same input alphabet, because both scan the same DASH-token shape
before diverging on what each does with it.

### 3.1 The dash token (shared with `dashes`)

Steps 1-7 of [dashes.md](dashes.md) §3.2 — run detection, the length-3 decoration cutoff, outer
spacing, the symmetry guard, the content-on-both-sides guard, the joiner-crossing walk (§3.2a),
the isolation guard and the cluster guard (§3.2 step 7) — apply here **identically, unchanged**.
A token that `dashes`' §3.2 steps would decline is declined here too, for the same reasons; the
two rules diverge only starting at §3.3 below. The JS reference implementation shares one
internal module (`src/rules/dash-shared.ts`) between `src/rules/dashes.ts` and
`src/rules/ranges.ts` for exactly this reason — a port is free to structure its own module
boundary differently, but must reproduce the same shared guard behaviour in both rules, not two
independent approximations of it.

`JOINER`-crossing re-entry (dashes.md §3.2a's third bullet: "if a joiner was crossed and
`cp[L*]`/`cp[R*]` are both `DIGIT`, the token is a bound range this rule produced on an earlier
pass") is **this rule's own** re-entry condition — it is how a tight range this rule already
converted survives a second pipeline pass without regrowing a second joiner. `dashes` shares the
same joiner-crossing walk (it must, to correctly decline a token immediately touching a range
this rule already produced) but never itself owns that re-entry: any joiner adjacent to a
non-digit-flanked token is declined outright (dashes.md §3.2a's fourth bullet).

### 3.2 Range guards (G1-G5)

The token is a **range candidate** iff `cp[L]` is in `DIGIT` **and** `cp[R]` is in `DIGIT` — `L`
and `R` after the joiner-crossing walk of §3.1. If it is a range candidate, this rule owns it
exclusively: `dashes` never processes it, whether or not `ranges` is enabled (operator decision,
spec 0.5.0 — see [dashes.md](dashes.md) §1). If it is **not** a range candidate (either flank is
not `DIGIT`), this rule emits nothing for it at all; it is `dashes`' concern or no rule's.

Compute `Lrun`, `Rrun`, `before`, `after` exactly as [dashes.md](dashes.md) §3.3 (pre-0.5.0)
specified — reproduced here verbatim since this is now its own rule document:

- `Lrun` = the maximal run of `DIGIT` ending at `L` (indices `a … L`);
- `Rrun` = the maximal run of `DIGIT` starting at `R` (indices `R … b`);
- `before` = the **effective neighbour** (dashes.md §3.2b) to the left of index `a`;
- `after` = the **effective neighbour** to the right of index `b`.

All five guards must pass:

- **G1 — no letter adjacency.** `before` is not in `LETTER`. (`MP3-4`, `H2-2` rejected. `COVID-19`
  is already rejected earlier, because `cp[L]` is `D`, a letter, not a digit.)
- **G2 — no chain.** `before` is not in `DASH` and not in `INERT-DASH`; `after` is not in `DASH`
  and not in `INERT-DASH`. This protects `2026-08-15`, `978-3-16-148410-0` and `212-555-1234`.
  **This guard reads the input as it stood before this rule (or `dashes`) made any edit in this
  pipeline pass** — see §4's note on why `ranges` runs before `dashes`: evaluating G2 against an
  adjacency `dashes` just created (by removing a space next to this token) rather than against
  what the author actually typed is exactly the defect §4 documents and the reason for the chosen
  order.
- **G3 — not part of a decimal or path.** `before` is not U+002E, U+002C or U+002F; `after` is
  not U+002F. `1.5-2.5` and `01/02-03/04` are left alone.
- **G4 — run lengths.** Either `length(Lrun) = length(Rrun)`, **or** `length(Lrun) = 1` and
  `length(Rrun) = 2` and `Rrun` does not begin with U+0030. `1914-1918` (4,4) passes; `5-10` (1,2)
  passes; `0-60` (1,2) passes; `ISO 8859-1` (4,1) fails; `555-1234` (3,4) fails; `1-800` (1,3)
  fails; `2020-24` (4,2) fails; `10-7` (2,1) fails; `9-05` fails on the leading zero. See
  [dashes.md](dashes.md) §3.3's historical discussion of why this exact shape and not a wider one
  — unchanged, reproduced there rather than duplicated here since it is a proof about G5's
  correctness, not new content this rule's split needs to restate.
- **G5 — non-decreasing.** The integer value of `Lrun` ≤ the integer value of `Rrun`, compared
  digit-by-digit left to right (sound only because G4 guarantees equal length in the only branch
  where G5 does work). `1914-1918` passes; `1234-5678` passes; `20-10` fails.

If any guard fails, emit nothing. **The token is not reconsidered by `dashes`.** A stroke between
two digits is a range or it is nothing; `dashes` never sees it (§3.1 above).

### 3.3 Replacement

If all guards pass, emit one edit replacing `cp[s - lsp … e - 1 + rsp]` with:

| `dash.range`  | replacement                                             |
| ------------- | -------------------------------------------------------- |
| `"em-tight"`  | U+2014                                                    |
| `"em-spaced"` | U+0020 U+2014 U+0020                                      |
| `"en-tight"`  | U+2013                                                    |
| `"en-spaced"` | U+0020 U+2013 U+0020                                      |
| `"none"`      | _(emit nothing — the token is left exactly as written)_   |

Subject to guards T1 and T2 ([dashes.md](dashes.md) §3.2 steps 8-9, `isSpacingTransitionBlocked`
and the strip-before/open-bracket checks — shared, unchanged, evaluated here against
`dash.range`'s chosen form exactly as they were against either branch's form pre-0.5.0). If the
replacement is identical, code point for code point, to the span it would replace, emit nothing
instead.

#### 3.3.1 Binding a tight range

Unchanged from [dashes.md](dashes.md) §3.3.1 (pre-0.5.0), reproduced here since binding is now
exclusively this rule's behaviour: when the chosen `dash.range` form is `-tight` and all guards
have passed, the emitted replacement is `JOINER dash JOINER` (U+2060, the dash, U+2060), and the
edit span covers any `JOINER` already adjacent to the token — the range is a single lexical unit
(UAX #14 gives U+2013/U+2014 the line-break class `BA`, and Мильчин and Chicago both forbid
breaking a range in running text). A range already in its exact target form is never bound (the
invisible-edit test: compute the unbound replacement first; if it is already a no-op, stay
unbound). `dashes` never emits a joiner — an interrupting parenthetical dash is exactly where a
line **may** break.

### 3.4 Continue, non-overlap, no-break spaces

[dashes.md](dashes.md) §3.5 (continue/non-overlap) and §3.6 (no-break spaces are never touched)
apply to this rule exactly as written there — both are properties of the shared token shape
(§3.1), not of which branch/rule a token ends up in.

---

## 4. Rule order: why `ranges` runs before `dashes`

`ranges` is order 25, `dashes` is order 30 — `ranges` runs first. This was chosen from an
observed behavioural difference, not for convenience.

The pre-0.5.0 unified `dashes` rule found every dash token's edits in **one scan over the
unedited input**, then applied all of them together — so every token's guards, including G2's
cross-token "no chain" check, always read the original, unedited adjacency structure, regardless
of which other tokens in the same document were also converting. Splitting `ranges` and `dashes`
into two sequential rule passes means one of them necessarily sees the other's *output*, not the
original input, for whichever positions the first rule touched.

**Concrete case: `a - 5-10`** (a parenthetical dash directly followed, by one space, by a
genuine range). `en-US`: `dash.parenthetical = "em-tight"`, `dash.range = "en-tight"`.

- **`ranges` first:** `ranges` scans the original text; the range token's `before` (G2) is the
  space at index 3, not a dash, so G2 passes and `5-10` becomes `5⁠–⁠10`. `dashes` then scans
  `a - 5⁠–⁠10`; its own token (`a - 5`) is unaffected by the far-away range edit and converts to
  `a—5⁠–⁠10` normally. **Final: `a—5⁠–⁠10`.**
- **`dashes` first:** `dashes` converts `a - 5` to `a—5` (its `em-tight` form has no spaces, so
  the edit span swallows the space that used to separate the parenthetical dash from the digit
  run). `ranges` then scans `a—5-10`; the range token's `before` (G2) is now the em-dash
  `dashes` just emitted, immediately adjacent (no space) — G2 reads this as a **chain** (the same
  shape as `978-3-16-148410-0`) and declines. **Final: `a—5-10`** — the range is silently never
  converted, purely because of which rule happened to run first, not because of anything either
  rule's own guards were designed to protect.

`ranges`-before-`dashes` reproduces the pre-0.5.0 unified rule's output (`a—5⁠–⁠10`) exactly;
`dashes`-before-`ranges` introduces a new, order-induced decline that never happened before the
split. `tests/rules/ranges.test.ts` and `tests/rules/dashes.test.ts` pin this case as a fixed
regression witness. This is a single reproducible counter-example, not an exhaustive proof that
no input ever favours the opposite order — but it is evidence in one concrete direction, and
`ranges`-before-`dashes` is kept on that evidence, not on a preference between two otherwise
indistinguishable choices.

---

## 5. What this rule does not, and cannot, solve

**`ranges` converts `Figure 5-10` to `Figure 5⁠–⁠10` when explicitly enabled**, exactly as it
converts a genuine range. This is not an oversight this document is unaware of — it is the
residual ambiguity §1 names as the reason the rule is opt-in. Enabling `ranges` is an explicit
choice to accept that a compound label sharing the digit-hyphen-digit shape will be converted
alongside genuine ranges; the caller has no bounded, cited mechanism this project can offer to
tell the two apart (§1). A future spec version could add a cited, closed `dash.labelWords` list
per locale (dashes.md §7.11's own suggestion) if and when locale-authority research produces
citable evidence for specific label words in specific locales — no such citation exists as of
spec 0.5.0, and an empty or invented list is not that fix (§1).

---

## 6. Worked examples

`⟨J⟩` = U+2060 (word joiner), `⟶` = no change. **Every row in this table requires
`{ rules: { ranges: true } }` explicitly** — `ranges` is off by default (§1), so every one of
these inputs is a byte-identical no-op with default options; that default-options behaviour is
what canonical fixtures (`spec/fixtures/*.json`) assert. These rows describe this rule's own
conversion behaviour once explicitly enabled — they were relocated here, verbatim, from
`dashes.md` §6 (rows 3, 3a-3j, 13, 17), which owned range detection through spec 0.4.1.

**A row containing an invisible code point must be checked in the escaped mirror, never read** —
U+2060 is zero-width, so a row that omits it looks correct on screen and is wrong at the byte
level (dashes.md §6's own note about this applies identically here).

### `en-US` — `range: "en-tight"`

| #   | Input                      | Output                                | Why                                                                                                                                                                            |
| --- | --------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3   | `1914-1918 and pp. 34-36`   | `1914⟨J⟩–⟨J⟩1918 and pp. 34⟨J⟩–⟨J⟩36` | range, G4 equal-length branch (4,4) and (2,2), G5 ✓                                                                                                                            |
| 3a  | `Takes 5-10 days`           | `Takes 5⟨J⟩–⟨J⟩10 days`               | G4's `(1,2)` branch; `Rrun` is `10`, no leading zero. G5 is vacuous here                                                                                                       |
| 3b  | `aged 9-10 years`           | `aged 9⟨J⟩–⟨J⟩10 years`               | `(1,2)`; the largest one-digit run against the smallest two-digit run                                                                                                          |
| 3c  | `chapters 1-12`             | `chapters 1⟨J⟩–⟨J⟩12`                 | `(1,2)`                                                                                                                                                                        |
| 3d  | `0-60 in six seconds`       | `0⟨J⟩–⟨J⟩60 in six seconds`           | `Lrun` may be `0` — the leading-zero clause constrains `Rrun` only. `before` is `NONE`, so G1 and G3 pass                                                                      |
| 3e  | `won 10-7`                  | ⟶                                      | `(2,1)`: G4's directional branch does not admit it. G5 would also reject it; G4 gets there first                                                                              |
| 3f  | `code 9-05`                 | ⟶                                      | `(1,2)` but `Rrun` begins with U+0030 — the pair G5 could not have caught, since G5 is specified for equal-length runs                                                        |
| 3g  | `Call 555-1234`             | ⟶                                      | `(3,4)` — neither branch. The phone-number case G4 exists for                                                                                                                  |
| 3h  | `Call 1-800 now`            | ⟶                                      | `(1,3)` — the `(1,2)` branch requires `length(Rrun) = 2` exactly                                                                                                               |
| 3i  | `the 2020-24 season`        | ⟶                                      | `(4,2)` — the abbreviated year range remains a recorded miss (dashes.md §7.3)                                                                                                  |
| 3j  | `Figure 5-10`                | `Figure 5⟨J⟩–⟨J⟩10`                   | **DOCUMENTED LIMITATION, not portable conformance evidence — §5.** A compound label, not a range; this rule has no way to tell the two apart. Never asserted by a canonical fixture; see `tests/rules/ranges.test.ts` |
| 43  | `1914–1918`                  | ⟶                                     | the token is already exactly correct for `en-tight` — glyph, length and spacing — so it is left alone. §3.3's invisible-edit test (compute the unbound form; bind only if that would itself be a visible change) is what decides this, not any property of the original glyph |
| 44  | `1914-1918`                  | `1914⟨J⟩–⟨J⟩1918`                     | the hyphen-typed range still converts and still binds. 43 and 44 are the asymmetry dashes.md §7.14 records |

### `de-DE` — `range: "en-tight"`

| #   | Input           | Output                | Why   |
| --- | ---------------- | ---------------------- | ----- |
| 13  | `Seiten 34-36`  | `Seiten 34⟨J⟩–⟨J⟩36`  | range |

#### Joiner transparency (dashes.md §3.2b, spec cases 45-47)

| #   | Input       | Output              | Why                                                                                                                                                                    |
| --- | ----------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 45  | `1-1␣-␣1`   | `1⟨J⟩–⟨J⟩1␣-␣1`     | **defect (e), dashes.md §8.2 (historical).** The second token's `before` is an effective neighbour that skips the joiner and finds the `–`, so G2 rejects it on every pass. Previously (pre-0.4.1 unified rule) pass 2 produced `1⟨J⟩–⟨J⟩1⟨J⟩–⟨J⟩1` |
| 46  | `1–1␣-␣1`   | ⟶                   | the **control**: the first token is already exactly correct for `en-tight` (glyph, length, spacing), so §3.3's invisible-edit test leaves it unbound and unchanged; the second token's G2 still rejects it, because `before` is a real `DASH` regardless of which `DASH` glyph it is. `1—1 - 1` (an em dash where the locale wants en) is **not** a fixed point here — it converts to `1⟨J⟩–⟨J⟩1 - 1`, the same as row 45 |

### `ru` — `range: "em-tight"`

| #   | Input                          | Output                                | Why                                                                                                              |
| --- | ------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 17  | `Годы 1941-1945 были тяжёлыми` | `Годы 1941⟨J⟩—⟨J⟩1945 были тяжёлыми` | Russian sets an **em** dash in ranges; `range: "em-tight"`. Aligned to the shipped fixture — which pair of years the row uses is arbitrary |
| 47  | `1-1␣-␣1`                      | `1⟨J⟩—⟨J⟩1␣-␣1`                       | the defect of row 45 reproduced in every locale whose `range` is not `none`; `ru` sets `em-tight` |

---

## 7. Open questions

Every item below is current and open against `ranges` specifically. Items that are shared
machinery rather than range-specific stay in [dashes.md](dashes.md) §7 (its canonical home,
§3.1 above); items that are purely historical are [dashes.md](dashes.md) §8.

1. **`DIGIT` is ASCII-only** (the class itself is defined in [dashes.md](dashes.md) §3.1, shared
   with `dashes`). Arabic-Indic, Devanagari and fullwidth digits are not recognised, so
   `١٩١٤-١٩١٨` is left alone. The limitation lands here rather than in `dashes.md` §7 because only
   `ranges`' G4/G5 actually read a digit's *value* — `dashes` never does. Extending to Unicode
   `Nd` would require every runtime to agree on a Unicode version _and_ a digit-value table;
   ASCII-only is the portable choice for the v1 locale set. Recorded so the limitation is
   deliberate rather than accidental.
2. **Decimal ranges.** `1.5-2.5` and `1,5-2,5` are legitimate ranges and are currently rejected
   by G3. Supporting them means deciding which of U+002E / U+002C is the decimal separator in a
   given locale, which is data the schema does not carry. Left unsupported.
3. **Abbreviated year ranges.** `2020-24` is a real convention (Chicago) and is rejected by G4.
   The false-positive risk of relaxing G4 (it would also accept `8859-1`) was judged worse than
   the miss. Needs an operator decision.
4. **Scores and votes.** `5-0`, `2-1` pass all guards and become en dashes. That is arguably
   correct typographically (an en dash is standard for scores), but G5 rejects `5-0` while
   accepting `0-5`, which is inconsistent for this use. Either scores are out of scope or G5
   needs an exception; unresolved.
5. **The U+2060 range binding is invisible in both the rendered text and a plain diff, and that
   is a reviewing hazard, not just a curiosity.** Every other change this rule makes is catchable
   by eye — a hyphen becomes a dash, a space appears or disappears. §3.3.1's joiner is zero-width:
   a bound form and its unbound equivalent are pixel-identical in every font, and a unified diff
   shows a changed line with no visible difference on it. **A worked-example or fixture row that
   omits the joiner looks correct on screen and is wrong at the byte level** — §6's own standing
   note says so, and the escaped mirror in `spec/fixtures/.escaped/` is the only rendering in
   which the joiner is visible; check it, never read the row on screen. This is not an argument
   against the binding, which is well-sourced and correct, only a property this rule (and any
   future rule emitting a zero-width or invisible code point — U+00AD, U+200B, a variation
   selector) has to manage explicitly rather than assume a reviewer will catch by eye. The
   historical cost of this exact hazard — 32 fixture cases silently broken, and one idempotency
   defect needing a seven-character witness — is recorded at [dashes.md](dashes.md) §8.6, from
   when this rule's behaviour still lived there.
6. **The compound-label ambiguity (`Figure 5-10`, G4's `(1,2)` branch) is already the full current
   statement of this rule's central tradeoff — see §5 above, not duplicated here.**
