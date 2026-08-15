# Rule: `ellipsis`

**Order:** 20. **Default:** on. **Modes:** text, html, markdown.
**Spec version:** 0.1.0.

---

## 1. Purpose

`ellipsis` replaces a typed run of full stops with the single character U+2026 (…), and
implements the abbreviated form that some locales use when an ellipsis follows terminal
punctuation — Russian writes `?..` and `!..` with two dots rather than three, because the
question mark or exclamation mark already occupies the first position of the three-dot
group. The rule is intentionally narrow: a run of exactly two full stops is _never_ touched,
because `..` occurs in relative paths, in version ranges and in numeric ranges written by
programmers, and converting it would be a false positive of exactly the class that blocks
the ship gate (PLAN.md M4). Everything this rule does is a pure function of a maximal run of
dot-like characters plus, at most, the one code point to its left.

---

## 2. Locale data consumed

- `ellipsis.abbreviatedAfterTerminal` — boolean, required by `locale.schema.json`.

**Evidence for locale data.** A locale attests **membership** — which tokens, which enum value, which boolean — and the rule owns the **mechanism** applied to them. A `sources` citation is not required to name a code point or a behaviour the locale file has no way to vary. Stated once, normatively, in [nbsp.md](nbsp.md) §2.1; it governs every locale field.

Nothing else. In particular this rule does not read `nbsp` or `quotes`.

---

## 3. Algorithm

Input is a code-point array `cp[0 … n-1]`.

### 3.1 Character classes

| Class      | Members                      |
| ---------- | ---------------------------- |
| `DOT`      | U+002E (full stop)           |
| `ELL`      | U+2026 (horizontal ellipsis) |
| `DOTLIKE`  | `DOT` ∪ `ELL`                |
| `TERMINAL` | U+0021 (!) and U+003F (?)    |

No other character is examined. U+2025 (‥, two-dot leader), U+22EF, U+FE19 and the CJK
leaders are **not** members of any class and are never produced or consumed.

### 3.2 Ordering dependency

`spaces` (order 10) has already run and has deleted every U+0020 that stood immediately before
a **lone** U+002E. Consequently the spaced form `". . ."` reaches this rule as `"..."` and is
handled by the ordinary run logic. This rule therefore never needs to look across spaces, and
must not try to.

The word _lone_ is load-bearing and was added after a defect. `spaces` does **not** strip a
space before a run of two or more dots (`spaces.md` §3.4), so `"e.g. .."` and `"See ../docs"`
arrive here with their spaces intact. Before that condition existed the space vanished, the
two-dot run merged with the abbreviation's full stop into a three-dot run, and this rule then
correctly converted it — producing `e.g…` from input that §4 below promised to leave alone.
Neither rule was misbehaving; the protection simply was not true of the pipeline.

### 3.3 Scan

1. Set `i = 0`.
2. If `cp[i]` is not in `DOTLIKE`, set `i = i + 1` and repeat. Terminate at `i = n`.
3. Find the maximal run: `s = i`; `e` = the smallest index `> s` with `cp[e]` not in
   `DOTLIKE` (or `e = n`). Let `k = e - s`, and let `d` = the number of `DOT` members and
   `q` = the number of `ELL` members in the run (`d + q = k`).
4. **Classify the run.**
   - `k = 1` and `d = 1` → an ordinary full stop. Emit nothing. Go to 7.
   - `k = 1` and `q = 1` → an existing ellipsis. Go to 6 (it may still need the abbreviated
     form).
   - `k = 2` and `q = 0` → **two full stops.** Go to 5.
   - `k ≥ 2` and `q ≥ 1` → a mixed or repeated run (`"…."`, `"……"`, `"..…"`). Normalise:
     emit an edit replacing `cp[s … e-1]` with one U+2026. Set the run to that single
     U+2026 and go to 6.
   - `k ≥ 3` and `q = 0` → three or more full stops. Emit an edit replacing
     `cp[s … e-1]` with one U+2026. Set the run to that single U+2026 and go to 6.
5. **The two-dot case.** Let `left = cp[s-1]` if `s > 0`, else `NONE`.
   - If `ellipsis.abbreviatedAfterTerminal` is `true` → emit nothing, unconditionally. In
     such a locale `"?.."` is the _correct_ output form and must survive re-processing.
   - If `ellipsis.abbreviatedAfterTerminal` is `false` **and** `left` is in `TERMINAL` →
     emit an edit replacing `cp[s … e-1]` with one U+2026. (`"?.."` in an English text is a
     typing slip for `"?…"`.) Go to 7; step 6 cannot fire because the locale flag is false.
   - Otherwise → emit nothing. This is the branch that protects `"../"`, `"1..5"` and
     `"a..b"`.
     Go to 7.
6. **Abbreviated-after-terminal form.** The run is now a single U+2026 at position `s`
   (either pre-existing or just produced by step 4).
   - If `ellipsis.abbreviatedAfterTerminal` is `false` → emit nothing. Go to 7.
   - Let `left = cp[s-1]` if `s > 0`, else `NONE`. If `left` is **not** in `TERMINAL` →
     emit nothing. Go to 7.
   - Otherwise emit an edit replacing the single U+2026 at `s` with the two code points
     U+002E U+002E. Steps 4 and 6 are stages of one decision about one span: the rule emits
     **exactly one edit per run**, whose replacement is the final form. `"?..."` is therefore
     a single edit replacing three U+002E with two U+002E, not two chained edits.
7. Set `i = e` and go to 2.

### 3.4 Interaction with `!?` and `?!`

`left` in step 6 is a single code point. For `"?!..."` the character left of the ellipsis is
U+0021, which is in `TERMINAL`, so the abbreviated form fires: `"?!.."`. This matches the
Russian convention (`«Что?!..»`). No lookbehind beyond one code point is required or
permitted.

---

## 4. Must not touch

**Scope.** Per [pipeline-idempotency.md](pipeline-idempotency.md) §5.2 each bullet is **[P]** —
a guarantee of `transform` as a whole — or **[R]** — true of this rule alone. Every bullet here
is [P], and two of them only became true when `spaces` gained the lone-dot condition.

- **[P] A single U+002E.** Sentence full stops, decimal points, abbreviation dots (`p.`, `z.`),
  and the dot in `"1.2.3"` are all runs of length 1.
- **[P] A run of exactly two U+002E**, except in the one narrow case in step 5 where the locale
  does _not_ use the abbreviated form and the run directly follows `!` or `?`. This protects
  `"../"`, `"./.."`, `"1..5"`, `"e.g. .."` and every other two-dot idiom.
  _[P] only since `spaces` gained the lone-dot condition. `"e.g. .."` previously became `e.g…`
  and `"See ../docs"` lost its space — the run itself was untouched throughout, which is exactly
  what made the claim look true while the pipeline falsified it._
- **[P] U+2025 (‥) and the CJK dot leaders.** Not in any class; never produced, never consumed.
- **[P] Two `DOT` runs separated by anything at all.** Runs are maximal and are never joined
  across an intervening character. After `spaces` has run, a surviving separator between
  dots is a no-break space or a tab, i.e. something the author put there deliberately.
- **[P] Anything in a skipped region.** `"..."` inside a code span or a URL never reaches this
  rule; the mode adapter removes it. This rule has no code-awareness and must not acquire
  any.
- **[P] The spacing around an ellipsis.** Whether `"word …"` should carry a no-break space is
  `nbsp`'s decision, driven by `nbsp.beforePunctuation` / `nbsp.narrowBeforePunctuation`,
  which may list U+2026.

---

## 5. Idempotency argument

Write `T` for the rule. The output of `T` contains, at every position where `T` acted, one
of exactly two forms:

- **Form A: a lone U+2026** whose left neighbour is either absent or not in `TERMINAL`, or
  whose locale has `abbreviatedAfterTerminal = false`.
- **Form B: exactly two U+002E** whose left neighbour is in `TERMINAL`, in a locale with
  `abbreviatedAfterTerminal = true`.

Re-running `T`:

- Form A is a run with `k = 1`, `q = 1`. Step 4 sends it to step 6. Step 6 emits nothing
  because either the flag is false or `left` is not in `TERMINAL` — both of which are exactly
  the conditions under which Form A was produced. No edit.
- Form B is a run with `k = 2`, `q = 0`. Step 5 is reached, and the first branch applies
  (flag is `true`) → emit nothing, unconditionally. No edit.
- Runs the rule declined to touch (single dot, two dots outside the special case) are
  classified identically on the second run, because classification depends only on the run
  itself and on one left neighbour, neither of which this rule altered — the rule never
  edits a character outside a `DOTLIKE` run, and a `DOTLIKE` run is never adjacent to
  another `DOTLIKE` run after `T` (runs are maximal, so merging cannot occur).

Hence `T(T(x)) = T(x)`.

**What had to be fixed.** The naive formulation is _"`...` → `…`, and in Russian `?…` →
`?..`"_. That is not idempotent, because the output `?..` is a two-dot run which the same
naive rule's companion clause _"collapse repeated dots"_ would then re-expand — or, in the
formulation used by several existing libraries, `?..` → `?…` → `?..` → … oscillating.
Two changes fix it:

1. The two-dot run is **unconditionally inert** when `abbreviatedAfterTerminal` is true. The
   output form is a fixed point by construction rather than by luck.
2. The two-dot → ellipsis conversion exists **only** in the complementary locale setting and
   **only** after terminal punctuation, so the two branches can never both apply to the same
   text under the same locale. The flag partitions the behaviour; it does not layer it.

---

### Composition obligation

Per [pipeline-idempotency.md](pipeline-idempotency.md) §5. This rule is **R₂**, so the
obligation runs against `spaces` (R₁) only.

**What this rule emits.** One U+2026 replacing a run of U+002E/U+2026, or two U+002E replacing
one U+2026. Nothing else: no spaces, no letters, no dashes, and never a code point outside
`DOTLIKE`.

**Against `I₁` (`spaces`).** Discharged. This rule never emits U+0020, so violations S-a, S-c
and S-d are unreachable. S-b — a U+0020 whose right neighbour is in `STRIP-BEFORE` — deserves a
second look, because U+002E and U+2026 are both in `STRIP-BEFORE` and this rule moves them
about. But every replacement starts at the first code point of the run and the code point to
its left is unchanged; if that neighbour were a U+0020, `spaces` would already have deleted it
in the same pass, since the run began with a `DOTLIKE` character then too. Shortening a run
cannot bring a space into contact with a dot that was not already in contact with one.

**`I₂` in the other direction** is preserved by every later rule trivially: none of them emits
U+002E or U+2026, and none deletes a code point standing between two dot runs.

---

## 6. Worked examples

`⟶` = no change. Both locale settings are shown because the rule is one of only two whose
output differs on a boolean.

### `ellipsis.abbreviatedAfterTerminal = false` (en, fi, sv, de, fr, el)

| #   | Input           | Output        | Why                                                                                                                                                                                              |
| --- | --------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `Wait... what?` | `Wait… what?` | `k = 3`, `q = 0` → single U+2026                                                                                                                                                                 |
| 2   | `Wait…… what?`  | `Wait… what?` | mixed run normalised                                                                                                                                                                             |
| 3   | `Really?.. `    | `Really?… `   | two dots after `?` in a non-abbreviating locale                                                                                                                                                  |
| 4   | `See ../docs`   | ⟶             | two-dot run, left neighbour U+0020 not in `TERMINAL`. **The space also survives**, which is `spaces.md` §3.4's doing, not this rule's — before that condition the pipeline returned `See../docs` |
| 4a  | `e.g. ..`       | ⟶             | likewise: the space survives, so no three-dot run is ever formed. Previously `e.g…`                                                                                                              |
| 5   | `Version 1..5`  | ⟶             | two-dot run, left neighbour is a digit                                                                                                                                                           |
| 6   | `He left…`      | ⟶             | already a lone U+2026                                                                                                                                                                            |
| 7   | `Hmm.....`      | `Hmm…`        | `k = 5` → one U+2026                                                                                                                                                                             |
| 8   | `Yes. No.`      | ⟶             | two independent runs of length 1                                                                                                                                                                 |

### `ellipsis.abbreviatedAfterTerminal = true` (ru)

| #   | Input        | Output     | Why                                               |
| --- | ------------ | ---------- | ------------------------------------------------- |
| 9   | `Что?...`    | `Что?..`   | run → U+2026 → abbreviated after `?`              |
| 10  | `Что?…`      | `Что?..`   | existing U+2026 after `?` rewritten               |
| 11  | `Что?..`     | ⟶          | already the target form; step 5 first branch      |
| 12  | `Что?!...`   | `Что?!..`  | left neighbour of the run is U+0021               |
| 13  | `Он ушёл...` | `Он ушёл…` | left neighbour is a letter → ordinary ellipsis    |
| 14  | `см. ../`    | ⟶          | two-dot run, unconditionally inert in this locale |

Cases 4, 5, 6, 8, 11 and 14 are "no change" cases.

---

## 7. Open questions

1. **Four dots.** Chicago (and several book styles) write `"….",` an ellipsis followed by a
   sentence-ending period, for an omission at the end of a sentence. This rule collapses
   `"...."` to a single `"…"`, losing that distinction. Distinguishing the two requires
   knowing whether the omission ends the sentence, which is not decidable from the code
   points. I chose collapse; an alternative is to leave runs of exactly four alone. Needs an
   operator decision and a fixture either way.
2. **`abbreviatedAfterTerminal` is a single boolean**, so a locale cannot say "abbreviate
   after `?` but not after `!`". No known locale needs that, but the schema forecloses it.
   Recorded, not proposed.
3. **The `!..` / `?..` order.** Russian also uses `"..?"` and `"..!"` in some sources for an
   ellipsis _preceding_ terminal punctuation. This rule does not implement that direction,
   and `"..?"` is left alone (two-dot run). Whether Мильчин requires the leading form is a
   locale-research question, and if the answer is yes, the schema needs a second flag.
4. _(Partly settled.)_ The `nbsp` asymmetry recorded here is fixed on the `nbsp` side: U+2026
   is now accepted right context for N1/N2 (`nbsp.md` §3.3 step 2), so French `Vraiment?…`
   takes its narrow space just as `Vraiment ?` does. What remains open is the original
   observation — **The interaction with `nbsp` is unspecified from this side.** If a locale lists U+2026 in
   `nbsp.beforePunctuation`, then `"word …"` gains a no-break space, but the abbreviated
   Russian form `"?.."` ends in U+002E and would not. That asymmetry may or may not be
   correct; it is a question for the `ru` locale file, not for this rule.
5. **Two dots in a non-abbreviating locale after `?`/`!`** (case 3) is the only place this
   rule converts a two-dot run. It is conservative and safe, but it is also the only asymmetry
   in the rule. If it produces a false positive in real content, deleting the branch costs
   nothing.
6. **Greek forbids a space before the ellipsis; polytypo preserves it anyway.** The EU
   Interinstitutional Style Guide (Greek edition) §10.1.9 ii) — «Μεταξύ των αποσιωπητικών και της
   λέξης που προηγείται δεν αφήνουμε διάστημα» — is verified against the source and is not
   honoured. `spaces.md` §3.4 preserves a space before a dot run in every locale, so `Πράγματι …`
   comes back as typed.

   The full argument is in `spaces.md` §7.9 and is not repeated; the part that belongs **here** is
   why this rule does not fix it instead. This rule reads locale data and could carry an
   `ellipsis.noSpaceBefore` flag, which the schema can express and which fits the declarative-data
   line of PLAN.md §6. What that would cost is a change of kind, not of degree: **this rule
   currently only ever replaces one span of dot-like code points with another, and it would become
   a rule that deletes a character outside its own run.** Deleting brings in `modes.md` §3.3's
   edge-test clause (a deleting rule must treat a span edge as the end of the text), a new
   discharge against `I₁`, and a re-derivation of §5's idempotency argument, which currently
   depends on the run being the only thing touched. That is not worth it for one locale, and it is
   worth it for two. Recorded so the option is costed rather than forgotten.
