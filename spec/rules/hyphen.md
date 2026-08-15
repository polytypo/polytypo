# Rule: `hyphen`

**Order:** 35 (between `dashes` and `quotes`). **Default:** on.
**Modes:** text, html, markdown.
**Spec version:** 0.1.0.

---

## 1. Purpose

`hyphen` replaces U+002D (hyphen-minus) with U+2011 (non-breaking hyphen) inside a closed list
of morphological forms whose hyphen must not be broken across a line. It exists for Russian,
where `из-под`, `кое-что` and `сделал-таки` are single words that a line-breaking algorithm
will happily split at the hyphen, producing a line ending in `из-` — which every Russian style
guide forbids. It is deliberately the most data-bound rule in the pipeline: it does exactly
nothing except where a locale has listed a literal form, so for `en`, `de`, `fr`, `fi`, `sv`
and `el` — whose lists are empty — it is a provable total no-op, not merely an unlikely one. It
changes one code point to another code point of the same width and semantics; it never
inserts, never deletes, never touches spacing, and never converts anything that is not
already a hyphen inside a word.

---

## 2. Locale data consumed

- `hyphen.prefixes` — word-initial forms written **with a trailing hyphen**, e.g. `"кое-"`
- `hyphen.suffixes` — word-final forms written **with a leading hyphen**, e.g. `"-таки"`
- `hyphen.compounds` — whole hyphenated forms written with U+002D, e.g. `"из-под"`

All three are required by `locale.schema.json` and all three may be empty.

**Evidence for these lists.** A locale attests **membership** — that these tokens belong in this list — and this rule owns the **mechanism** it applies to them. A `sources` citation is not required to name a code point or a binding the locale file has no way to vary. The principle is stated once, normatively, in [nbsp.md](nbsp.md) §2.1 and governs every list-valued field in `locale.schema.json`. Entries are
literal lowercase forms of at least two code points. An entry containing no U+002D is
meaningless and must raise `POLYTYPO_MALFORMED_LOCALE_DATA` — the rule has nothing to convert
in it.

**If all three arrays are empty, the rule emits nothing for any input.** An implementation may
short-circuit on that condition; the observable behaviour is identical either way.

---

## 3. Algorithm

Input is a code-point array `cp[0 … n-1]`.

### 3.1 Character classes

| Class       | Members                                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------------------------- |
| `HY`        | U+002D (hyphen-minus)                                                                                          |
| `NBHY`      | U+2011 (non-breaking hyphen)                                                                                   |
| `HYPHENISH` | `HY` ∪ `NBHY`                                                                                                  |
| `LETTER`    | general category `Lu`, `Ll`, `Lt`, `Lm`, `Lo`, `Mn`, `Mc`, `Me` (combining marks count as letter-continuation) |
| `UPPER`     | general category `Lu` or `Lt`. Used only by §3.3's first-character leniency, via the simple uppercase mapping — no guard tests it directly                                                                                  |
| `DIGIT`     | U+0030–U+0039                                                                                                  |
| `ALNUM`     | `LETTER` ∪ `DIGIT`                                                                                             |
| `WORDISH`   | `ALNUM` ∪ `HYPHENISH` — the characters that continue a hyphenated word                                         |
| `NONE`      | index out of range                                                                                             |

No other class is examined.

**Unicode version.** The general categories and case mappings this rule reads are those of the UCD version pinned in `spec/UNICODE` (`17.0`). The pin is normative for the **derived tables**, not for the host runtime — see [pipeline-idempotency.md](pipeline-idempotency.md) §6a, which also specifies the canary fixtures that make the pin detectable. In particular this rule never looks at a space, and never at
U+2010, U+00AD, U+2013 or U+2014.

### 3.2 Why order 35, and what it may assume

`hyphen` runs **after `dashes` and before `quotes`**. Both halves of that placement are
load-bearing.

**After `dashes`.** `dashes` guard P1 declines every bare U+002D that is not spaced on both
sides, so every intra-word hyphen — which is exactly this rule's entire subject matter —
survives `dashes` untouched. Running `hyphen` first would invert the dependency: `dashes`
would then encounter U+2011 in positions where it expects U+002D, and while its `INERT-DASH`
class already covers U+2011, its verdicts would be reached for a different reason than the
one documented, and the two rules' guards would have to be kept in sync by hand. Running
second means `hyphen` may assume, and an implementation may assert, that **every U+002D it
converts has a letter or digit on both sides** — the complement of what `dashes` claims. That
assumption is what makes §5 short.

**Before `quotes`.** This ordering is materially free — the two rules share no characters —
but it is not entirely free, and the reason is worth recording. `quotes.md` §3.1 lists
U+002D, U+2013 and U+2014 as acceptable left context for an opening quotation mark
(`canOpen`). U+2011 was not in that list. If `hyphen` converted a U+002D that sat immediately
left of a quote candidate, that candidate's `canOpen` would flip from true to false between
one pipeline run and the next — the exact class of cross-rule drift that the idempotency
invariant exists to catch. The shape is unreachable in practice (a `prefixes` entry requires a
`LETTER` after its hyphen, so a quotation mark cannot follow), but relying on unreachability
across two documents is how ports diverge. **`quotes.md`, `apostrophe.md` and `nbsp.md` have
therefore been amended to include U+2011 wherever they already list U+002D/U+2013/U+2014 as
context.** With that amendment, order 35 versus order 45 is genuinely immaterial, and 35 is
kept because it groups the two hyphen-and-dash rules together.

### 3.3 Matching

All three lists use the same comparison, called **hyphen-lenient, first-character-lenient
literal matching**. For a pattern `w` of `k` code points at candidate index `a`:

- **hyphen leniency, at every position `j` in `0 … k-1`:** if `w[j]` is in `HY`, then
  `cp[a+j]` may be in `HY` **or** in `NBHY`; otherwise `cp[a+j] = w[j]` exactly.
  The leniency must cover `j = 0` and not merely `j ≥ 1`, because a **suffix** entry _begins_
  with its hyphen: `-таки` converted once becomes `‑таки`, and a pattern that demanded U+002D
  at position 0 would stop matching its own output. §5's round-trip argument depends on this.
- **first-character case leniency, at `j = 0` only:** either `cp[a] = w[0]`, or `w[0]` is in
  `LETTER` and `cp[a]` is the Unicode **simple uppercase mapping** of `w[0]`. The two
  leniencies never overlap — `w[0]` is a hyphen or a letter, never both.

Nothing else matches. `ИЗ-ПОД` does not match `из-под`; `Из-под` does.

**Capitalisation without host-locale case folding.** The first-character leniency uses the
Unicode simple uppercase mapping — a plain code-point→code-point table from the UCD, applied
to the _pattern_ (which the schema fixes as lowercase), not to the input. It is not
`toUpperCase()`, not `toLocaleUpperCase()`, not ICU, and it does not depend on the host
process's locale (ARCHITECTURE.md §4.4). Mapping the pattern rather than the input is
deliberate: it means at most one extra code point is computed per list entry, it can be
precomputed once when the locale file is loaded, and the notorious Turkish pair never arises
because the simple mapping of `i` is `I` unconditionally and no v1 `hyphen` entry begins with
`i` in any case. This is the same convention `nbsp.afterShortWords` uses (`nbsp.md` §3.5), and
having one convention across the spec is worth more than the marginal extra coverage a second
one would buy.

All-capitals forms (`ИЗ-ПОД` in a heading) are deliberately **not** matched — see §7.1.

### 3.4 Scan

Walk `a` from `0` to `n-1`. At each index, select **one** candidate entry: the longest entry
that matches at `a` across all three lists, with ties broken in the order **compounds,
prefixes, suffixes**. Entries are unique (`uniqueItems`), so this is a total order and the
selection is deterministic.

**Matching and guarding are separate steps, and there is no backtracking.** The selected entry
is then checked against its guards. If it passes, it claims the position and the scan continues
from `a + k`. **If it fails a guard, the sub-rule emits nothing at `a` and no other entry is
tried there**; the scan advances `a` by one. An earlier revision said "the first entry that
matches _and passes its guards_", which is backtracking, and it disagreed with `nbsp`'s
list-driven sub-rules. `nbsp.md` §3.5 now states the same policy, and the two must stay
aligned: longest match wins, guards are applied to the winner only.

Compounds are tried first because a compound is the most specific form: if a locale lists both
the compound `из-под` and the prefix `из-`, the compound's verdict (bind the hyphen inside the
whole word) must win, and it happens to produce the same edit — but the scan position it
consumes differs, and that must be deterministic.

**C — compounds.** For an entry `w` of `k` code points matching at `a`:

1. **Left boundary.** `cp[a-1]` must be `NONE` or **not** in `WORDISH`.
2. **Right boundary.** `cp[a+k]` must be `NONE` or **not** in `WORDISH`.
   Together these mean the compound is a whole word: `из-под` matches in `из-под стола` but
   not inside `квазииз-подный` or `из-под-` .
3. For every position `j` with `w[j]` in `HY`: if `cp[a+j]` is already in `NBHY`, emit nothing
   for that position; otherwise emit an edit replacing `cp[a+j]` with U+2011.

**P — prefixes.** An entry `w` ends with U+002D; let `k` be its length.

1. **Left boundary.** `cp[a-1]` must be `NONE` or not in `WORDISH` — the prefix starts a word.
2. **Right boundary.** `cp[a+k]` must be in `LETTER`. A prefix must actually prefix something:
   `кое-что` matches, `кое-` at the end of a line or before a space does not, and neither does
   `кое-2`.
3. Emit an edit replacing the final code point of the match (`cp[a+k-1]`, the hyphen) with
   U+2011, unless it is already in `NBHY`.

**S — suffixes.** An entry `w` begins with U+002D; let `k` be its length. Because a suffix is
matched at its own start index, the scan finds it at the hyphen, not at the start of the word.

1. **Left boundary.** `cp[a-1]` must be in `LETTER`. A suffix must actually suffix something:
   `сделал-таки` matches, a line beginning `-таки` does not.
2. **Right boundary.** `cp[a+k]` must be `NONE` or not in `WORDISH`.
3. Emit an edit replacing the first code point of the match (`cp[a]`, the hyphen) with U+2011,
   unless it is already in `NBHY`.

Note that the first-character leniency of §3.3 is inert for suffixes (their first code point
is a hyphen, not a letter) and for compounds it applies to the word's initial letter, which is
the sentence-start case (`Из-под стола…`).

---

## 4. Must not touch

**Scope.** Per [pipeline-idempotency.md](pipeline-idempotency.md) §5.2 each bullet is **[P]** —
a guarantee of `transform` as a whole — or **[R]** — true of this rule in isolation but capable
of being falsified by another rule, which is then named.

- **[P] Any hyphen not covered by a listed form.** `научно-технический`, `Jean-Luc`, `e-mail`,
  `well-known`, `COVID-19` are all left as U+002D. This rule has no morphology of its own; it
  has a list.
- **[P] Every locale with empty lists.** `en`, `de`, `fr`, `fi`, `sv`, `el` — the rule is a total no-op
  and must produce byte-identical output (§2).
- **[R] A hyphen that `dashes` owns.** Anything spaced on both sides was already handled at order
  30; by §3.2 this rule only ever sees intra-word hyphens, and its boundary guards enforce
  that independently rather than trusting it.
- **[P] U+2010 (hyphen), U+00AD (soft hyphen), U+2012, U+2013, U+2014, U+2212.** Not in
  `HYPHENISH`; never read, never written. A soft hyphen inside `из-под` is the author's
  deliberate break hint and is not this rule's business.
- **[R] Spacing of any kind.** No space is inserted, removed or converted. Every edit is one code
  point replacing one code point at the same index.
- **[P] All-capitals forms** — `ИЗ-ПОД` (§7.1).
- **[P] A listed form appearing inside a longer word.** Boundary guards C1/C2, P1, S2.
- **[P] Anything inside a skipped region.** A hyphen in a URL, a code span, a fenced block or an
  HTML attribute is removed by the mode adapter (L2) before this rule runs. `из-под` in a
  slug is therefore safe; this rule has no URL-awareness and must not acquire any.

---

## 5. Idempotency argument

Let `T` be the rule.

**The output form is recognised as already-correct.** Every edit replaces a U+002D with a
U+2011 at the same index. §3.3's comparison is **hyphen-lenient**: a pattern's U+002D matches
either U+002D or U+2011 in the text. So on the second run the same list entry matches at the
same index `a` with the same length `k` — the match is not lost by the conversion, which is
the property the leniency exists for. The emission step of each branch then finds `cp[a+j]`
(or `cp[a+k-1]`, or `cp[a]`) already in `NBHY` and emits nothing.

**No guard's verdict changes.** The guards test:

- membership in `LETTER`, `UPPER`, `DIGIT` — no edit ever writes a character in any of these
  classes, and no edit ever removes one, since every edit is a 1:1 replacement of a hyphen;
- membership in `WORDISH` — which contains **both** U+002D and U+2011 by construction
  (`HYPHENISH ⊂ WORDISH`). This is the second place the design has to be deliberate: if
  `WORDISH` contained only U+002D, then converting a hyphen would change a neighbouring
  form's boundary test from "is in `WORDISH`, reject" to "is not in `WORDISH`, accept", and a
  form adjacent to a converted one could start matching on the second run. With `NBHY` in
  `WORDISH`, the boundary verdicts are invariant.

**Scan positions are stable.** The scan advances by `a + k` after a claim, and `k` is the
pattern length, which does not depend on the text. Since every edit is 1:1, no index shifts.
So the same entries claim the same positions in the same order on every run.

Hence `T(T(x)) = T(x)`. ∎

**Input that already contains U+2011.** This is the same case as "the rule's own output", and
it is handled identically: a form written by the author as `из‑под` with a real U+2011 matches
(hyphen-lenient), passes its guards, and produces **no edit**. A U+2011 outside any listed
form is never examined at all. So text that is already correctly bound round-trips
byte-identically, which is the round-trip requirement of ARCHITECTURE.md §6.3 item 4 and the
reason the leniency is specified rather than left to an implementation.

**Stability under the rest of the pipeline.** `dashes` runs before this rule within a single
pipeline pass, but on the _next_ pass it sees the U+2011 this rule produced. Its verdicts do
not change: `dashes` §3.1 puts U+2011 in `INERT-DASH`, its §3.2 step 6 rejects a token whose
neighbour is in `INERT-DASH` **or** in `DASH` alike, and its cluster alphabet contains both —
so a position that was declined when it held U+002D is declined when it holds U+2011, for the
same reason. `quotes`, `apostrophe` and `nbsp` list U+2011 alongside U+002D/U+2013/U+2014 in
their context classes (§3.2), so their classifications are likewise unaffected.

**What had to be fixed.** The naive formulation — _"replace the hyphen in each listed form
with U+2011"_ — is not idempotent, because on the second run the form no longer matches: the
pattern holds U+002D and the text now holds U+2011, so the rule silently stops recognising its
own output. That is harmless for the output itself but it is a latent trap, because it means
the rule's behaviour depends on whether it has run before, and any later guard that consults a
list membership would then disagree between runs. Making the comparison hyphen-lenient, and
putting U+2011 into `WORDISH`, are the two changes that make the rule's view of the text
identical before and after its own edits.

---

### Composition obligation

Per [pipeline-idempotency.md](pipeline-idempotency.md) §5. This rule is **R₄**, so the
obligation runs against `spaces` (R₁), `ellipsis` (R₂) and `dashes` (R₃).

**What this rule emits.** U+2011, one code point replacing one U+002D at the same index, inside a
matched form. It inserts nothing, deletes nothing, and changes no length.

**Against `I₁` (`spaces`).** Discharged: no U+0020 is emitted or deleted, and no code point is
inserted or removed, so no space run can change length or neighbourhood.

**Against `I₂` (`ellipsis`).** Discharged: U+2011 is not in `DOTLIKE` and no dot run is
touched.

**Against `I₃` (`dashes`).** This is the only one with content. Converting U+002D to U+2011
changes a code point that `dashes` classifies — but it moves it from `DASH` to `INERT-DASH`,
and `dashes` treats the two identically in every place a _neighbouring_ token could read them:
its isolation guard (§3.2 step 6) rejects both, guard G2 rejects both, and its cluster alphabet
contains both. The converted hyphen itself was never a `dashes` token: `dashes` guard P1
declines a bare U+002D that is not spaced on both sides, and this rule only ever claims a
hyphen with a letter or a listed form's interior on each side. So no verdict changes, and the
positions this rule edits are exactly the ones `dashes` had already declined.

---

## 6. Worked examples

`⟶` = no change, `‑` = U+2011 (non-breaking hyphen), `-` = U+002D.

### `ru` — `compounds: ["из-под","из-за","по-моему"]`, `prefixes: ["кое-"]`, `suffixes: ["-таки","-то","-либо","-нибудь"]`

| #   | Input                         | Output                      | Why                                                                              |
| --- | ----------------------------- | --------------------------- | -------------------------------------------------------------------------------- |
| 1   | `Достал из-под стола`         | `Достал из‑под стола`       | compound, both boundaries non-`WORDISH`                                          |
| 2   | `Из-под стола донёсся звук`   | `Из‑под стола донёсся звук` | first-character leniency: simple uppercase mapping of `и`                        |
| 3   | `ИЗ-ПОД СТОЛА`                | ⟶                           | all-capitals is not matched (§7.1)                                               |
| 4   | `кое-что и кое-как`           | `кое‑что и кое‑как`         | prefix; `cp[a+k]` is a letter in both                                            |
| 5   | `Он сделал-таки это`          | `Он сделал‑таки это`        | suffix; `cp[a-1]` is a letter                                                    |
| 6   | `что-нибудь или что-либо`     | `что‑нибудь или что‑либо`   | two suffixes                                                                     |
| 7   | `Достал из‑под стола`         | ⟶                           | already U+2011 — hyphen-lenient match, no edit. **The round-trip case**          |
| 8   | `научно-технический прогресс` | ⟶                           | not in any list                                                                  |
| 9   | `кое- и кое-что`              | `кое- и кое‑что`            | the first `кое-` fails P2 (`cp[a+k]` is a space, not a letter); the second binds |
| 10  | `квазииз-подный`              | ⟶                           | compound guard C1: `cp[a-1]` is `и`, in `WORDISH`                                |
| 11  | `Москва — из-за дождя`        | `Москва — из‑за дождя`      | the em dash is `dashes`' business and is untouched here; the compound binds      |
| 12  | `-таки в начале строки`       | ⟶                           | suffix guard S1: `cp[a-1]` is `NONE`                                             |

### `en`, `de`, `fr`, `fi`, `sv`, `el` — all three lists empty

| #   | Input                                             | Output | Why                          |
| --- | ------------------------------------------------- | ------ | ---------------------------- |
| 13  | `A well-known e-mail address, COVID-19, Jean-Luc` | ⟶      | no entries; total no-op (§2) |
| 14  | `Any text at all`                                 | ⟶      | same                         |

Cases 3, 7, 8, 10, 12, 13 and 14 are "no change" cases.

---

## 7. Open questions

1. **All-capitals forms are not matched.** `ИЗ-ПОД СТОЛА` in a Russian heading keeps its
   breakable hyphen. Matching it needs either a full uppercase comparison of every code point
   (which requires an explicit case-mapping table in the spec, not just the single first
   character) or a second set of list entries. Russian headings are frequently set in caps, so
   this is a real miss, not a theoretical one. I did not add a full case table because it is a
   cross-cutting decision — `nbsp.afterShortWords` has exactly the same limitation — and
   because ARCHITECTURE.md §4.4 wants any such table to be explicit spec data. Recommend
   deciding it once, for both rules, together with the Unicode-version pinning question.
2. **Title Case within a form is not matched.** `Из-Под` (a stylised heading) does not match.
   Same root cause as §7.1.
3. **`hyphen.prefixes` and `hyphen.suffixes` cannot express a constraint on what follows or
   precedes** beyond "a letter". Russian `-то` is a particle in `кто-то` but a conjunction in
   other positions, and `по-` is a prefix in `по-моему` but a preposition elsewhere. The lists
   are blunt instruments; the mitigation is to list only forms whose binding is
   unconditional, and `по-` is deliberately shown in §6 as a **compound** (`по-моему`) rather
   than a prefix for that reason. Whether the Russian locale file should list `по-` as a
   prefix at all is a locale-research question with a normative source (Мильчин), not a
   question about this rule.
4. **U+2011 has real-world rendering gaps.** A few older fonts lack the glyph and fall back
   visibly. The alternatives are U+2010 plus U+2060 (word joiner), or a zero-width no-break
   space after the hyphen — both worse in other ways, and both invisible in a diff. U+2011 is
   the operator's stated choice and is recorded here as such, but if the M4 dogfooding gate
   shows a rendering problem in the author's own font stack, this is the decision to revisit.
5. **Nothing prevents a locale from listing an entry with no hyphen in it.** §2 requires
   `POLYTYPO_MALFORMED_LOCALE_DATA`, but `locale.schema.json`'s `wordList` only constrains
   length and uniqueness, so the check is a runtime one rather than a CI one. A
   `"pattern"`-free way to express it in JSON Schema does not exist, so this probably belongs
   in `scripts/validate-spec.mjs` alongside the one-code-point check. **Reported.**
6. **The interaction with hyphenation is untested.** A CSS `hyphens: auto` renderer may still
   break inside `из‑под` at a syllable boundary; U+2011 only forbids the break _at the hyphen_.
   That is out of scope (PLAN.md §4 excludes hyphenation) but worth knowing before claiming
   the rule "prevents the word from breaking".
7. **Ordinal repair is refused** — `10-ый` → `10-й`, and the whole family of Russian
   ordinal-ending corrections Lebedev's service performs. This rule binds a hyphen that is
   already correct; it does not rewrite the morphology around one. Changing `ый` to `й` is a
   spelling correction, and PLAN.md §4 refuses spellcheck and typo correction without an
   explicit operator decision. Recorded so the presence of `hyphen.suffixes` is not read as an
   invitation.
