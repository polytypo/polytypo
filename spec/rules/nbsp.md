# Rule: `nbsp`

**Order:** 70 (last). **Default:** on. **Modes:** text, html, markdown.
**Spec version:** 0.1.0.

---

## 1. Purpose

`nbsp` is the rule that makes a line break fall where the language allows it. It converts
ordinary spaces to U+00A0 (no-break space) or U+202F (narrow no-break space), and inserts one
of those where a locale requires a space that the author did not type — before French
`? ! ; :`, inside French guillemets, between a number and its unit, between a Russian
preposition and the word it governs, between initials and a surname. It runs **last**, after
every other rule has settled the characters around each candidate space, which is what makes
its decisions simple: by the time it runs, `spaces` has normalised every ordinary space run
to length one, `dashes` has fixed the dash forms, and `quotes` has produced the final quote
glyphs whose inner spacing this rule then owns. It is also the rule with the largest surface
for oscillation, so almost all of its design effort goes into being a strict no-op on text
that already carries the right no-break spaces.

---

## 2. Locale data consumed

- `nbsp.beforePunctuation` — array of single characters that take U+00A0 before them
- `nbsp.narrowBeforePunctuation` — array of single characters that take U+202F before them
- `nbsp.afterShortWords` — array of lowercase words
- `nbsp.abbreviations` — array of literal multi-token abbreviations written with U+0020
- `nbsp.beforeUnits` — array of units that bind to a preceding number
- `nbsp.beforeNumber` — array of abbreviations that bind to a following **number**
- `nbsp.beforeWord` — array of abbreviations that bind to a following **word**
- `nbsp.afterSymbols` — array of symbols that bind to a following number
- `nbsp.bindInitials` — boolean
- `quotes.primary.open`, `quotes.primary.close`, `quotes.primary.innerSpace`
- `quotes.secondary.open`, `quotes.secondary.close`, `quotes.secondary.innerSpace`

### 2.1 A locale attests membership; the rule owns the mechanism

**Normative, and general — it governs every list-valued field in `locale.schema.json`, not only
this rule's.**

> A `sources` citation must support exactly what the locale file **can express**: which tokens
> are in which list, which enum value is chosen, which boolean is set. It is **not** required to
> support the behaviour the rule attaches to that membership.

So a locale populating `beforeUnits` needs a source establishing that **these tokens are units
and are written with a space after the number**. It does **not** need a source saying that space
is non-breaking, or that it is U+00A0 rather than U+202F, or that the rule converts an existing
space rather than inserting a missing one. Those are decisions this document has already made,
once, for every locale.

**The decisive argument is that evidentiary burden must track expressive power.** There is no
field in which a locale can say "bind these units" or "do not bind them" — the schema offers a
list and nothing else. A locale therefore cannot be *wrong* about the mechanism, cannot vary it,
and cannot be asked to cite it. Requiring a citation for a claim the file has no way to make is
not rigour; it is a category error, and its effect is to empty fields that are correctly
populated.

Four supporting points:

- **The schema already says so.** `beforeUnits` is defined as "Units and signs that bind to a
  preceding number with U+00A0". The binding is in the *field's* definition, which is where a
  uniform mechanism belongs.
- **Every other field works this way, and must.** `afterShortWords` enumerates words and N3
  decides what happens to the following space; nobody asks Мильчин to name U+00A0 by code point.
  `abbreviations` lists strings and N4 converts their internal spaces. `bindInitials` is a
  boolean whose entire content is mechanism — under the opposite reading it would be
  unciteable in principle, since no typographic authority names a code point for it.
- **PLAN.md §6 and ARCHITECTURE.md §5.1 already draw this line.** Declarative facts that vary by
  locale go in the file; algorithms that do not vary go in the rule. *Which tokens are units*
  varies by language. *A measurement does not break between its number and its unit* does not —
  it is the same universal principle that justifies the range binding in `dashes.md` §3.3.1, and
  that one is argued from UAX #14 and Chicago/Мильчин centrally rather than per locale.
- **Authorities describe how text should look and behave when set, not how it is encoded.** This
  spec has drawn that distinction twice already and in the same direction: for Greek
  (`spaces.md` §3.5 — the guide instructs a typist, it does not ask a tool to delete) and for
  vulgar fractions (`symbols.md` §7.6 — the sources describe how a fraction should *look*). A
  source stating "a space separates the number from the unit", plus a rule stating "that space
  must not break", is not the source being over-read.

**What this does not license.** The membership claim still needs a source, and the principle
makes that burden *sharper*, not looser:

- Listing a token the source does not attest is unsupported however the mechanism is owned.
- `fi`'s `abbreviations: ["fil. maist."]` is right on exactly this test: Kotus attests the
  internal shape of **one** abbreviation, which is a membership claim about a single token that
  happens to contain a space. Joining two tokens a source merely shows side by side would be a
  membership claim the source does not make, and would stay unsupported under either reading.
- A field whose *shape* the source contradicts is still wrong. This principle relocates the
  burden; it does not lower it.

**Consequence, recorded so it is not re-litigated per locale.** A `beforeUnits` list resting on a
source that states the space but not its non-breaking character is **correctly populated**.
`fi.beforeUnits` is restored on that footing, and `en-GB`'s and `sv`'s measurement units stand on
the same one. The reverse reading — requiring each locale to attest the mechanism — would leave
N5 effectively dead outside `en-US` and `ru`, which is a large behavioural consequence to arrive
at one file at a time; if it is ever taken, it must be taken deliberately and written here.

---

**Precondition.** `nbsp.beforePunctuation` and `nbsp.narrowBeforePunctuation` must be
disjoint. `locale.schema.json` does not enforce this (reported); an implementation that finds
a character in both must raise `POLYTYPO_MALFORMED_LOCALE_DATA` rather than pick one.

---

## 3. Algorithm

Input is a code-point array `cp[0 … n-1]`.

### 3.1 Character classes

| Class           | Members                                                                                                                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SP`            | U+0020 (space)                                                                                                                                                                                                   |
| `NBSP`          | U+00A0                                                                                                                                                                                                           |
| `NNBSP`         | U+202F                                                                                                                                                                                                           |
| `NOBREAK`       | `NBSP` ∪ `NNBSP`                                                                                                                                                                                                 |
| `SPACELIKE`     | `SP` ∪ `NOBREAK` ∪ U+0009 ∪ U+2007 ∪ U+2008 ∪ U+2009 ∪ U+200A ∪ U+2000–U+2006 ∪ U+205F ∪ U+3000 ∪ every member of `BREAK`                                                                                        |
| `OTHER-SPACE`   | the fixed-width spaces above: U+2000–U+200A, U+205F, U+3000. In `SPACELIKE`, but **never** converted and never a valid "already correct" state                                                                   |
| `BREAK`         | U+000A, U+000D, U+000B, U+000C, U+0085, U+2028, U+2029                                                                                                                                                           |
| `DIGIT`         | U+0030–U+0039                                                                                                                                                                                                    |
| `LETTER`        | general category `Lu`, `Ll`, `Lt`, `Lm`, `Lo`, `Mn`, `Mc`, `Me`                                                                                                                                                  |
| `UPPER`         | general category `Lu` or `Lt`                                                                                                                                                                                    |
| `ALNUM`         | `LETTER` ∪ `DIGIT`                                                                                                                                                                                               |
| `OPENISH`       | U+0028 `(` U+005B `[` U+007B `{` and every locale `open` glyph                                                                                                                                                   |
| `SENTENCE-DASH` | U+2013, U+2014 only. **Not** U+002D and **not** U+2011 — see §3.5                                                                                                                                                |
| `DASHISH`       | U+002D, U+2011, U+2013, U+2014. U+2011 is included because `hyphen` (order 35) produces it; a class holding only U+002D would make a word-boundary verdict depend on whether `hyphen` had run (`hyphen.md` §3.2) |
| `CLOSEISH`      | U+0029 `)` U+005D `]` U+007D `}` and every locale `close` glyph                                                                                                                                                  |
| `NONE`          | index out of range                                                                                                                                                                                               |

**Unicode version.** The general categories and case mappings this rule reads are those of the UCD version pinned in `spec/UNICODE` (`17.0`). The pin is normative for the **derived tables**, not for the host runtime — see [pipeline-idempotency.md](pipeline-idempotency.md) §6a, which also specifies the canary fixtures that make the pin detectable.

**`NOBREAK` is a member of `SPACELIKE`.** Every word/number/token boundary test in this rule
uses `SPACELIKE`, never `SP`. This single decision is what makes the rule idempotent: after a
conversion the boundary that justified it still reads as a boundary.

### 3.2 Structure: ten sub-rules, first claim wins

The rule is one left-to-right scan that evaluates **ten** independent sub-rules, N1 through N10. (It was eight before `beforeNumber` and `beforeWord` were added as N9 and N10; a reader who stops at N8 loses both, and with them the abbreviation binding for four locales.) Two sub-rules
may target the same index with different replacements (French `«` followed by a word that
starts with `«`… or, more realistically, a unit that is also a listed short word). The
resolution is fixed and total:

> Sub-rules are evaluated in the order **N1, N2, N3, N4, N5, N6, N7, N8, N9, N10** as written
> below.
> Each produces candidate edits keyed by the index of the space (or insertion point) it
> claims. **The first sub-rule to claim an index wins; every later edit at that index is
> discarded.** No index is ever edited twice.

This is stated because a map- or set-based implementation that resolves conflicts by
iteration order will behave differently in Go (ARCHITECTURE.md §4.5).

> **First-claim-wins is not sufficient on its own, and relying on it as though it were is a
> bug.** It resolves a conflict only when both sub-rules actually _emit an edit_ at the index.
> A sub-rule whose "already correct" branch fires emits nothing and therefore **claims
> nothing**, silently yielding the index to a lower-priority sub-rule — which then edits it,
> after which the higher-priority sub-rule is no longer satisfied, and the two alternate on
> successive runs. That is not a hypothetical: it is exactly how N2 and N8 oscillated on the
> French input `«?` (§3.10.1). **Sub-rules that target different code points must therefore be
> made disjoint by construction, not merely ordered.** Where two sub-rules could want
> different characters at one index, one of them must be given a guard that makes it decline
> the index outright, so that its verdict does not depend on what the other did.

**Why N9 and N10 are last, and in that order.** `nbsp.abbreviations` (N4) holds multi-token
forms such as `т. д.`; if a locale also lists `т.` in `beforeWord`, the space inside the
longer, more specific form must be claimed by N4, so N4 must precede N10. `beforeNumber`
precedes `beforeWord` so that an abbreviation listed in both — `S.` before `12` and before
`Petersburg` — resolves to the number reading first; the two are then disjoint by their own
guards (N9 requires a following digit, N10 a following letter) and the ordering is belt and
braces rather than a real tie-break. `bindInitials` (N7) precedes both because an initial is a
narrower, structurally-recognised form than a listed abbreviation, and the two agree on the
replacement (U+00A0) wherever they overlap.

### 3.3 N1 — `beforePunctuation` (U+00A0)

For each index `i` such that `cp[i]` is a member of `nbsp.beforePunctuation`:

1. **Run guard.** If `cp[i-1]` is a member of `beforePunctuation` ∪ `narrowBeforePunctuation`,
   skip. Only the first mark of `?!` or `!!!` takes the space.
2. **Right-context guard.** Let `after = cp[i+1]` or `NONE`. If `after` is **not** `NONE`,
   not in `SPACELIKE`, not in `CLOSEISH`, **not U+2026**, and not a member of
   `beforePunctuation` ∪ `narrowBeforePunctuation`, skip.

   U+2026 is in the accepted set because the guard exists to detect a punctuation mark that is
   _inside a token_ — `http://`, `12:30` — and an ellipsis after a question mark is nothing of
   the kind. Without it, French `Vraiment?…` got no narrow space while `Vraiment ?` did, purely
   because `ellipsis` (order 20) had converted the dots before `nbsp` looked. The space belongs
   before the `?` whatever follows it. This is the guard that protects
   `http://example.org` and `12:30` in a locale that lists U+003A — after the colon comes
   `/` or a digit, so nothing happens.

3. **Quote-glyph guard.** If `cp[i-1]` is in `SPACELIKE` and `cp[i-2]` is in `OPENISH`, or if
   `cp[i-1]` is in `OPENISH`, **skip**. The space immediately after an opening quotation glyph
   belongs to `quotes.innerSpace` and is owned by N8; two sub-rules must not both have an
   opinion about it. Without this guard N2 and N8 alternate for ever on the French input `«?`
   — see §3.10.1, which is the defect this guard repairs.
4. Let `left = cp[i-1]` or `NONE`.
   - If `left` is `NBSP` → **already correct**, emit nothing.
   - If `left` is `SP` or `NNBSP` → emit an edit replacing `cp[i-1]` with U+00A0.
   - If `left` is in `OTHER-SPACE` → **skip**. A thin or figure space was placed deliberately;
     §4 promises it is left alone, and treating it as content would insert a _second_ space
     beside it.
   - If `left` is `NONE`, in `BREAK`, or U+0009 → skip. A line must not begin with a no-break
     space.
   - Otherwise (`left` is a content character) → emit an edit **inserting** U+00A0 at
     index `i`.

### 3.4 N2 — `narrowBeforePunctuation` (U+202F)

Identical to N1 with `NNBSP` and `NBSP` exchanged: already-correct means `left` is `NNBSP`;
`SP` or `NBSP` is converted to U+202F; a content character causes an insertion of U+202F. The
quote-glyph guard and the `OTHER-SPACE` guard apply unchanged.

Because N1 runs first, a character listed in both arrays would be handled by N1 — which is
why §2 requires the arrays to be disjoint and requires an implementation to fail loudly
rather than rely on that precedence.

### 3.5 N3 — `afterShortWords` (U+00A0)

For each entry `w` in `nbsp.afterShortWords` (a lowercase word of `k` code points):

1. Find each index `a` where `cp[a … a+k-1]` matches `w` under the **first-character-lenient**
   comparison: `cp[a+j] = w[j]` exactly for `j ≥ 1`, and for `j = 0` either `cp[a] = w[0]` or
   `cp[a]` is the Unicode **simple uppercase mapping** of `w[0]`. Simple uppercase mapping is
   taken from the Unicode Character Database, is a plain code-point→code-point table, and is
   **not** a locale-sensitive operation — this satisfies ARCHITECTURE.md §4.4 (`i` → `I`
   always, never `İ`). No other case variation matches: `IN` does not match `in`.
2. **Left boundary.** `cp[a-1]` must be `NONE`, in `SPACELIKE`, in `OPENISH`, or in
   **`SENTENCE-DASH`**. Otherwise skip.

   **A hyphen — U+002D or U+2011 — fails this test, and that is the point.** A hyphen marks an
   _intra-word_ position by construction, so the token after one is not a free-standing word.
   Without this, `из-за дождя` binds twice over: `hyphen` (order 35) produces `из‑за`, and then
   this sub-rule matches the listed short word `за` at the position after the U+2011 and emits
   `из‑за` + U+00A0 + `дождя`. But `за` there is not a preposition — it is the tail of a single
   compound preposition — so the binding is typographically wrong on ordinary Russian prose.
   The same reasoning covers every form `hyphen` produces: compound tails (`под` in `из-под`),
   prefix bodies (`что` in `кое-что`) and suffix bodies (`то`, `таки`) are all word-internal and
   none of them should ever be treated as a word start here.
   `SENTENCE-DASH` keeps the case the boundary was written for: an em or en dash genuinely does
   introduce a new phrase, so `— в Москве` still binds `в`.

3. **Right boundary.** `cp[a+k]` must exist and be `SP` or `NBSP`. If it is `NBSP`, emit
   nothing (already correct). If it is anything else — a letter, a punctuation mark, a line
   break, `NNBSP` — skip. (A `NNBSP` there was put by another sub-rule with better
   information.)
4. **Following-token guard.** `cp[a+k+1]` must exist and be in `ALNUM` or `OPENISH`.
   A short word must not be bound to a punctuation mark or to the end of a line.
5. Emit an edit replacing `cp[a+k]` with U+00A0.

**Longest match wins, and there is no backtracking.** When two entries match at the same index
`a`, only the longest is considered; entries are unique (`uniqueItems` in the schema), so this
is a total order. **If the longest matching entry fails a guard, no shorter entry is retried at
that index** — the sub-rule emits nothing there and the scan moves on. This is normative for
every list-driven sub-rule in this document (N3, N4, N5, N6, N9, N10) and for `hyphen`
(`hyphen.md` §3.4). Two reasons: a shorter entry succeeding where a longer one failed is almost
always wrong (if `mm` was rejected because the following code point is a letter, `m` is wrong
for the same reason), and backtracking makes the result depend on the interaction between list
contents and guard order in a way that is tedious to reproduce identically in five runtimes.

### 3.6 N4 — `abbreviations` (U+00A0 for every internal space)

For each entry `s` in `nbsp.abbreviations`, of `k` code points:

1. Find each index `a` where `cp[a … a+k-1]` matches `s` under **space-lenient exact**
   comparison: for every position `j`, either `cp[a+j] = s[j]`, or `s[j]` is `SP` and
   `cp[a+j]` is in `NOBREAK`. Every non-space code point must match exactly — no case
   leniency at all here, because `z. B.` and `Z. B.` are different strings and the locale
   file is expected to list what it means.
2. **Boundaries.** `cp[a-1]` must not be in `ALNUM`; `cp[a+k]` must not be in `ALNUM`.
   (`z. B.` inside `Xz. B.y` is not a match.)
3. For every position `j` with `s[j]` = `SP`: if `cp[a+j]` is already `NBSP`, emit nothing for
   that position; otherwise emit an edit replacing `cp[a+j]` with U+00A0.

Longest match wins at a given `a`, with no backtracking (§3.5).

### 3.7 N5 — `beforeUnits` (U+00A0, conversion only)

For each entry `u` in `nbsp.beforeUnits`, of `k` code points:

1. Find each index `a` where `cp[a … a+k-1]` matches `u` exactly (code-point equality; no
   case leniency — `Kg` is not `kg`).
2. **Right boundary.** `cp[a+k]` must not be in `ALNUM`. This is what stops the unit `kg`
   from matching inside `kgf`, and `m` from matching inside `metres`.
3. **Left side.** `cp[a-1]` must be `SP` or `NBSP`; nothing else qualifies. If it is `NBSP`,
   emit nothing. **If there is no space at all, this sub-rule does nothing** — see §7.2, it
   never inserts.
4. `cp[a-2]` must be in `DIGIT`. Let `Lrun` be the maximal `DIGIT` run ending at `a-2`,
   starting at index `b`. `cp[b-1]` must not be in `LETTER` (so `H2 O` does not bind).
5. Emit an edit replacing `cp[a-1]` with U+00A0.

Longest match wins at a given `a`, with no backtracking (§3.5), so a locale listing both `m`
and `mm` binds `5 mm` correctly and does not fall back to `m` when the `mm` match is rejected.

### 3.8 N6 — `afterSymbols` (U+00A0, conversion only)

For each entry `y` in `nbsp.afterSymbols`, of `k` code points:

1. Find each index `a` where `cp[a … a+k-1]` matches `y` exactly.
2. **Left boundary.** `cp[a-1]` must not be in `ALNUM`.
3. **Right side.** `cp[a+k]` must be `SP` or `NBSP`. If `NBSP`, emit nothing. If there is no
   space, do nothing (never insert).
4. `cp[a+k+1]` must be in `DIGIT`.
5. Emit an edit replacing `cp[a+k]` with U+00A0.

### 3.9 N7 — `bindInitials` (U+00A0), only when `nbsp.bindInitials` is `true`

Define an **initial** at index `p` as: `cp[p]` in `UPPER`, `cp[p+1]` = U+002E (.), and
`cp[p-1]` either `NONE`, in `SPACELIKE`, or in `OPENISH`. (One letter, one full stop, at a
token start.)

Two clauses, both operating on a single space at index `q`:

- **C1 — initial on the left.** If `cp[q]` is `SP` or `NBSP`, and there is an initial ending
  at `q-1` (i.e. `cp[q-1]` = U+002E and `cp[q-2]` is an initial's letter satisfying the
  definition above), and `cp[q+1]` is in `UPPER`, then bind: if `cp[q]` is `NBSP` emit
  nothing, else emit an edit replacing `cp[q]` with U+00A0.
  This covers both spaces of `А. С. Пушкин`: the first because `cp[q+1]` is `С`, the second
  because `cp[q+1]` is `П`.

  **Guard C1-a — lower-case abbreviation tail.** C1 does **not** fire if, letting `p = q-2` be
  the initial's letter, `cp[p-1]` is in `SPACELIKE`, `cp[p-2]` is U+002E, and `cp[p-3]` is in
  `LETTER` but **not** in `UPPER`. In other words: an uppercase letter plus a dot that is
  itself preceded by a _lower-case_ letter plus a dot is the second token of an abbreviation,
  not an initial.

  This is not a refinement, it is a false-positive repair on real German data. With the
  shipped `de-DE` file, `z. B. Berlin` produced `z.⍽B.⍽Berlin`: N4 correctly bound the space
  inside `z. B.`, and then C1 read `B.` as an initial and `Berlin` as a surname and bound the
  space after it too. A false positive on ordinary prose is the ship-blocking class for this
  project (PLAN.md §4, the M4 gate), so this needed a guard rather than a note. §6 example 14
  was right and the rule was wrong.
  `А. С. Пушкин` is unaffected: `cp[p-3]` there is `А`, which is in `UPPER`.

- **C2 — two initials on the right.** If `cp[q]` is `SP` or `NBSP`, `cp[q-1]` is in `LETTER`,
  and the code points starting at `q+1` form **two consecutive initials** (`X. Y.`, i.e. an
  initial at `q+1`, a `SP` or `NBSP` at `q+3`, and an initial at `q+4`), then bind `cp[q]` the
  same way.
  This covers `Пушкин А. С.` — the surname-first order — without binding every
  `word` + `Capital letter + period` pair, which would fire on ordinary sentences.

C2 binds only the space before the initials group; the space _inside_ the group is bound by
C1 (its `cp[q+1]` is the second initial's letter, which is `UPPER`).

### 3.10 N8 — `quotes.innerSpace`

For each of the two quote pairs `P` ∈ {`quotes.primary`, `quotes.secondary`} with
`P.innerSpace ≠ "none"`, let `target` be U+00A0 if `P.innerSpace = "nbsp"` and U+202F if
`P.innerSpace = "narrow-nbsp"`.

**Sidedness precondition.** If `P.open` and `P.close` are the same code point, this sub-rule
does nothing for that pair, and an implementation must not guess. See §7.5.

Otherwise:

- **After an opening glyph.** For each index `o` with `cp[o]` = `P.open`:
  - if `cp[o+1]` is `target` → emit nothing;
  - else if `cp[o+1]` is `SP` or in `NOBREAK` → emit an edit replacing `cp[o+1]` with
    `target`;
  - else if `cp[o+1]` is `NONE` or in `BREAK` → skip;
  - else → emit an edit inserting `target` at index `o+1`.
- **Before a closing glyph.** For each index `c` with `cp[c]` = `P.close`, symmetrically on
  `cp[c-1]`, skipping when `cp[c-1]` is `NONE` or in `BREAK`.

**When `innerSpace` is `"none"` this sub-rule does nothing at all, and in particular it does
not _remove_ a space the author put inside the quotation marks.** This is normative, not an
oversight: `de-CH` declares `innerSpace: "none"` and `« hallo »` therefore survives as written.

The reasoning is that `innerSpace` describes what the pipeline **inserts**, not what it
enforces. Removing a space is a deletion of author content, and this spec deletes a U+0020 in
exactly three narrowly-argued places, all of them in `spaces` (§3.2 step 5) and none of them
next to a quotation mark — `STRIP-BEFORE` excludes quotation glyphs precisely so that their
inner spacing stays a single rule's business. A tool that silently closed up `« hallo »` in a
Swiss text would be making an editorial judgement about the author's copy rather than a
typographic correction to it, and the M4 criterion is zero false positives, not maximum
conformity. The counter-argument — that `«hallo»` is the only Swiss-conforming form, so leaving
the spaces leaves the document wrong — is real, and §7.4 records it as the operator's to settle.

#### 3.10.1 The N1/N2 oscillation this rule was part of

`fr` declares `quotes.primary.innerSpace = "nbsp"` (target U+00A0) and lists `?` in
`nbsp.narrowBeforePunctuation` (target U+202F). On the input `«?` both N2 and N8 want the
single index between the two characters, and they want different code points:

```
«?  →  «⍽?   (N8 inserts U+00A0)   →  «⍹?   (N2 converts to U+202F)
    →  «⍽?   (N8 converts back)    →  …
```

First-claim-wins did not resolve it, for the reason set out in §3.2: on the second run N2's
"already correct" branch fires, emits nothing, and therefore claims nothing — leaving N8 free
to act on an index N2 still has an opinion about.

**Repaired in N1/N2**, not here: the space beside an opening quotation glyph is `innerSpace`,
full stop, and N1/N2 now decline it outright (§3.3 step 4). N8 is unchanged. The alternative —
having N8 accept any `NOBREAK` beside a quote glyph as already correct — was rejected because
it would also make N8 unable to correct a genuinely wrong inner space anywhere else, trading a
narrow conflict for a broad loss of function.

Note the general shape, because it will recur: **the sub-rule that yields must be the one that
can state its exception locally.** N1/N2 can say "not next to an opening quote glyph" using
`OPENISH`, which they already have. N8 cannot say "not where a punctuation rule wants a
different width" without importing both punctuation lists.

### 3.11 N9 — `beforeNumber` (U+00A0, conversion only)

An abbreviation in `nbsp.beforeNumber` binds forward to a number: `Nr. 5`, `S. 12`,
`art. 237`, `§§ 12`. Schema minimum length is 2 code points, so a bare initial cannot be
listed.

For each entry `s` in `nbsp.beforeNumber`, of `k` code points:

1. Find each index `a` where `cp[a … a+k-1]` matches `s` **exactly**, code point for code
   point. No case leniency at all: `Nr.` is not `nr.`, and a locale that wants both lists
   both. (This differs from N3, where the schema explicitly asks for first-character
   leniency; here it does not, and inventing it would make `S.` match `s.` and bind sentence
   fragments.)
2. **Left boundary.** `cp[a-1]` must be `NONE`, in `SPACELIKE`, in `OPENISH`, or in
   `SENTENCE-DASH`. Otherwise skip. This is stronger than "not `ALNUM`" and it is what stops
   `S.` matching inside `Fig.S. 3`. A hyphen fails it, for the reason given in §3.5 step 2 —
   an abbreviation cannot begin immediately after an intra-word hyphen.
3. **The separator.** `cp[a+k]` must be `SP` or `NBSP`; anything else — a letter, a digit, a
   line terminator, `NNBSP`, a tab — and the sub-rule does nothing. If it is `NBSP`, emit
   nothing: already correct.
   **Exactly one separator.** If `cp[a+k+1]` is also in `SPACELIKE`, skip.
4. **"A following number" means:** `cp[a+k+1]` is in `DIGIT`. That is the whole definition —
   one code point, tested for membership in U+0030–U+0039. It deliberately does **not**
   require the digit run to be of any particular length, to be followed by anything in
   particular, or to be a "plausible" number: a digit immediately after the separator is
   sufficient evidence, and no false positive of consequence exists for it (`Nr. 5x` is still
   a number after `Nr.`).
5. Emit an edit replacing `cp[a+k]` with U+00A0.

**Never inserts.** `Nr.5` stays `Nr.5`, for the same reason N5 never inserts: adding a space
is a content change, not a typographic one.

**N9 has no equivalent of N10's guard G-D**, so a one-letter abbreviation such as `S.` binds
forward here even though it is structurally indistinguishable from an initial. That is
deliberate and safe: N9 fires only when a `DIGIT` follows, and N7 clause C1 fires only when an
`UPPER` code point follows, so the two are disjoint by their own right-hand tests and cannot
both claim a space. `S. 12` is a page reference and only N9 can see it; `S. Petrov` is an
initial and only N7 can. No guard is needed to keep them apart.

Longest match wins at a given `a`, with no backtracking (§3.5).

### 3.12 N10 — `beforeWord` (U+00A0, conversion only)

An abbreviation in `nbsp.beforeWord` binds forward to a word: `г. Москва`, `ул. Ленина`,
`M. Dupont`, `Mme Hugo`, `Dr. Schmidt`. **This is the highest-false-positive sub-rule in the
spec** and its guards are correspondingly heavier — an abbreviation that also occurs at the
end of a sentence will bind across the sentence boundary, and no purely syntactic test can
separate the two readings. Locale files must list only forms whose binding is normative
(the schema description says so); this document adds the structural guards.

For each entry `s` in `nbsp.beforeWord`, of `k` code points:

1. Match `cp[a … a+k-1]` against `s` **exactly**, code point for code point. No case leniency
   in either direction. `г.` matches only lowercase `г.`; `M.` matches only uppercase `M.`;
   `Mme` matches only that capitalisation. A locale wanting both cases lists both, which is
   cheap and explicit and keeps the spec free of any case-folding table on this path.
2. **Left boundary (G-L).** `cp[a-1]` must be `NONE`, in `SPACELIKE`, in `OPENISH`, or in
   `SENTENCE-DASH`. Otherwise skip — a hyphen fails it, per §3.5 step 2.
3. **The separator (G-S).** `cp[a+k]` must be `SP` or `NBSP`. `NBSP` → emit nothing, already
   correct. Anything else → skip. If `cp[a+k+1]` is also in `SPACELIKE`, skip.
4. **"A following word" means (G-W):** `cp[a+k+1]` is in `LETTER`. Not `ALNUM` — a digit there
   is N9's business, and N9 has already run, so a `beforeWord` entry that is also a
   `beforeNumber` entry never double-claims. Not `OPENISH`, not a quotation glyph, not a
   dash: `г. «Москва»` is left alone, because the binding target is then a quotation and the
   line-break risk this sub-rule exists to remove is not present in the same way.
5. **Initial-collision guard (G-D).** If `nbsp.bindInitials` is `true`, **and** `s` is exactly
   two code points, **and** the first is in `UPPER`, **and** the second is U+002E, skip.
   An _uppercase_ letter plus a dot is structurally indistinguishable from an initial, and in a
   locale where N7 is active, N7 owns that shape with better evidence (it inspects what follows
   for a second initial or a surname).

   All three conditions matter:
   - **`UPPER`** — without it, a lower-case two-code-point entry such as `ул.` would be inert
     in a `bindInitials` locale, and `ул. Ленина` would not bind. A lower-case letter plus a dot
     is not a plausible initial in any orthography this spec covers, so the guard must not
     capture one. (An earlier revision justified this clause with `г. Москва`, which is **not**
     an example of it: `ru.json` does not list `г.` in `beforeWord` at all — see §6 row 13a.)
   - **`bindInitials`** — in a locale where N7 is switched off, nothing else claims the shape
     and there is no collision to avoid.
   - **exactly two code points** — `Mme`, `ул.`, `art.` are longer and are never initials.

   Consequence for French, stated plainly because an earlier revision of this document got the
   underlying fact wrong: **`fr` has `bindInitials: true`** (cited to Jacques André §5.1.3 for
   `N. Bourbaki`). So a listed `M.` _is_ inert in N10, and `M. Dupont` binds through N7 clause
   C1 instead — which reaches the same U+00A0 by a different route. The residual gap is that
   C1 requires an `UPPER` code point after the space, so `M. dupont` with a lower-case surname
   does not bind at all. That is an acceptable miss; French surnames are capitalised.

6. **Line-boundary guard (G-B).** If `cp[a+k]` is in `BREAK`, or if `cp[a+k+1]` is `NONE`,
   skip. Covered by G-S/G-W but stated separately because it is the guard that keeps a
   no-break space off the end of a text unit.
7. Emit an edit replacing `cp[a+k]` with U+00A0.

**Never inserts.** Longest match wins at a given `a`, with no backtracking (§3.5).

**What is deliberately _not_ guarded.** There is no sentence-boundary test. In
`Это было в 1990 г. Москва тогда была другой`, the form `г.` ends the sentence and `Москва`
begins the next, yet every guard above passes and the two are bound. Distinguishing that from
`г. Москва` ("the city of Moscow") requires knowing whether `г.` means _год_ or _город_,
which is a lexical question the spec cannot answer from code points. The mitigation is
entirely in the locale data — list a form in `beforeWord` only when the wrong reading is rare
or harmless — and the failure mode is mild: a no-break space where a break was permitted, not
a changed character. This is recorded as §7.9 and must be reviewed at the M4 gate.

### 3.13 Insertions and indices

Sub-rules N1, N2 and N8 can _insert_ a code point. Because rules produce edits and the
pipeline applies them (ARCHITECTURE.md §7.1), every index above refers to the **input**
array. An insertion is an edit with an empty replaced span at a given index. Two insertions
at the same index cannot occur: the first-claim-wins rule of §3.2 forbids it.

---

## 4. Must not touch

**Scope.** Per [pipeline-idempotency.md](pipeline-idempotency.md) §5.2 each bullet is **[P]** —
a guarantee of `transform` as a whole — or **[R]** — true of this rule in isolation but capable
of being falsified by another rule, which is then named.

- **[P] A line terminator.** No sub-rule inserts, deletes or crosses one; every guard that could
  reach a `BREAK` skips instead.
- **[P] The start or end of a text unit.** A no-break space is never inserted at index 0, never
  after the last code point, and never adjacent to a `BREAK`. In `html` mode a text node
  frequently begins or ends at a tag boundary, and a leading U+00A0 there is a visible
  rendering change.
- **[P] A tab.** U+0009 is `SPACELIKE` for boundary purposes but is never converted.
- **[R] A space that another sub-rule already claimed** (§3.2).
- **[P] `http://`, `12:30`, `1:2`** in a locale that lists U+003A in `beforePunctuation`. N1
  guard 2.
- **[P] The second and later marks of `?!`, `!!!`, `?..`** — N1/N2 guard 1.
- **[P] A unit with no space before it.** `5km` and `5%` stay exactly as typed; N5 converts, never
  inserts (§7.2).
- **[P] A number written as `H2O`, `A4`, `MP3`.** N5 step 4's letter guard.
- **[P] An existing U+00A0 or U+202F that is already the right character.** Every sub-rule's
  "already correct" branch emits nothing, so a correctly-typeset document round-trips
  byte-identically. This is the property PLAN.md §3.4 exists for.
- **[P] An existing U+2007, U+2009, U+200A, U+2060 or U+FEFF.** None is in `NOBREAK`; none is
  converted. If an author placed a thin space, it stays.
- **[P] The quotation marks themselves.** N8 only touches the space beside them.
- **[P] Anything inside a skipped region.** Handled by the mode adapter.

---

## 5. Idempotency argument

Let `T` be the rule and consider `y = T(x)`.

**Every sub-rule has an explicit "already correct" branch that emits nothing**, and the
target of each sub-rule is exactly the state that branch recognises:

| Sub-rule | Post-state at the claimed index                       | Recognised as already correct by           |
| -------- | ----------------------------------------------------- | ------------------------------------------ |
| N1       | `NBSP` immediately left of the mark                   | §3.3 step 4, first bullet                  |
| N2       | `NNBSP` immediately left of the mark                  | §3.4                                       |
| N3       | `NBSP` after the short word                           | §3.5 step 3                                |
| N4       | `NBSP` at every internal position of the abbreviation | §3.6 step 1 (space-lenient match) + step 3 |
| N5       | `NBSP` before the unit                                | §3.7 step 3                                |
| N6       | `NBSP` after the symbol                               | §3.8 step 3                                |
| N7       | `NBSP` at the bound space                             | §3.9                                       |
| N8       | `target` beside the quote glyph                       | §3.10                                      |
| N9       | `NBSP` between the abbreviation and the number        | §3.11 step 3                               |
| N10      | `NBSP` between the abbreviation and the word          | §3.12 step 3                               |

So it suffices to show that on the second run **the same sub-rule claims the same index** —
i.e. that no guard's verdict flips because of an edit made on the first run.

Guards test three kinds of thing:

1. **Membership in `SPACELIKE`.** Every conversion `SP → NBSP`, `SP → NNBSP`,
   `NNBSP → NBSP`, `NBSP → NNBSP` stays inside `SPACELIKE` (§3.1). Every insertion adds a
   `NOBREAK`, which is in `SPACELIKE`. So every boundary test that passed on run 1 passes on
   run 2, and every one that failed still fails — **provided** boundary tests never use `SP`
   specifically. They do not: §3.1 states this and every guard above is written against
   `SPACELIKE`, `ALNUM`, `UPPER`, `DIGIT`, `OPENISH`, `CLOSEISH`, `BREAK` or `NONE`, none of
   which gains or loses a member under a `SP`/`NOBREAK` conversion.
2. **Membership in `ALNUM`, `DIGIT`, `UPPER`, `LETTER`, `OPENISH`, `CLOSEISH`.** No sub-rule
   ever edits a code point in any of these classes; every edit replaces or inserts a space
   character. Unchanged.
3. **Literal matching (N3, N4, N5, N6, N9, N10).** N4 is space-lenient by construction, so a matched
   abbreviation still matches after its internal spaces become `NBSP`. N3, N5, N6, N9 and N10 match
   only the word/unit/symbol/abbreviation itself, never the adjacent space, so their matches
   are untouched. N9 and N10 additionally require the separator to be `SP` or `NBSP` and
   treat `NBSP` as "already correct", so their second-run verdict is "emit nothing" at the
   very index they claimed on the first run. The _side conditions_ that read the adjacent space accept both `SP` and `NBSP`
   and distinguish them only to decide "convert" versus "emit nothing".

Two specific insertion cases need checking because they change lengths:

- **N1/N2 insertion.** Run 1 turns `mot!` into `mot` `NNBSP` `!`. On run 2, `left` of the `!`
  is `NNBSP` → "already correct" → no edit. Note the insertion did **not** create a new
  candidate: the inserted character is a space, and no sub-rule's _match_ is a space (N4
  matches a literal containing spaces, but the literal must also match its non-space code
  points, and inserting one space next to a punctuation mark cannot complete an abbreviation
  match that failed before, because the abbreviation's non-space code points are unchanged).
- **N8 insertion.** Run 1 turns `«mot»` into `«` `NNBSP` `mot` `NNBSP` `»`. On run 2 both
  positions hit the "already `target`" branch. Additionally the inserted `NNBSP` becomes the
  `left` neighbour of nothing punctuation-like, and the `right` neighbour of `«`, which is not
  a candidate for any other sub-rule.

Finally, the **first-claim-wins** ordering of §3.2 is deterministic and depends only on the
sub-rule index, not on the array contents, so the same sub-rule wins on both runs.

Hence `T(T(x)) = T(x)`.

**What had to be fixed.** Four things, all of them the difference between a rule that works
and a rule that oscillates:

1. **`NOBREAK` had to be inside `SPACELIKE`.** The naive version writes boundary tests
   against U+0020, so after run 1 converts the space, run 2 no longer sees a word boundary,
   and a _different_ sub-rule (or none) claims the position. Symptom: N3 and N5 fight over
   `5 km` in a locale that lists `km` as a unit and has a short word ending in a way that
   overlaps.
2. **N4 had to match space-leniently.** Matching `z. B.` literally means the converted
   `z.` `NBSP` `B.` no longer matches, which is harmless on its own — but it means the
   abbreviation is invisible to sub-rule ordering on run 2 and a lower-priority sub-rule
   (N3, say, on the word `z`) can claim the same index with a different verdict. Making the
   match space-lenient keeps N4 in control of its own indices forever.
3. **N5 and N6 had to be conversion-only.** The naive version inserts a space before a unit,
   turning `5km` into `5 km` — a content change, not a typographic one — and, worse, in a
   locale listing `%` it turns `50%` into `50 %`, which is wrong in English and right in
   French, i.e. it is a locale decision that `beforeUnits` alone cannot express. Restricting
   to conversion makes the rule safe and shifts the question to §7.2 where it belongs.
4. **The conflict policy had to be total and index-based.** "Whichever sub-rule runs first in
   the loop" is not a specification; it is a Go map iteration bug waiting to happen (§3.2).

---

### Composition obligation

Per [pipeline-idempotency.md](pipeline-idempotency.md) §5. This rule is **R₈** and runs last,
so nothing has to preserve _its_ invariant — but it must preserve all seven others, and it is
the rule with the largest emission surface in the pipeline. It is also the rule that committed
defect family 2.

**What this rule emits.** U+00A0 and U+202F only, either replacing a single space-like code
point in place or **inserted** at one of three kinds of site: before a listed punctuation
character (N1, N2), after an opening quote glyph, and before a closing quote glyph (N8). It
never emits U+0020, never emits a letter, digit, dot, dash or quotation mark, and never deletes
anything.

**Against `I₁` (`spaces`).** Discharged, and this is why the rule never emits U+0020: U+00A0
and U+202F are `CONTENT` to `spaces`, which touches only U+0020. Converting a U+0020 to a
no-break space can only _remove_ a potential `spaces` edit, never create one. An insertion adds
a `CONTENT` code point, which cannot lengthen a U+0020 run or place a U+0020 in a stripping
position.

**Against `I₂` (`ellipsis`).** Discharged: no `DOTLIKE` code point is emitted, and insertions
only push code points apart, never together.

**Against `I₃` (`dashes`).** **This is the obligation the rule failed, twice**, and it is now
discharged structurally rather than by argument.

N8 inserting a `quotes.innerSpace` beside a quoted hyphen turned `«-»` into `«⍽-⍽»`, which
`dashes` read as a spaced parenthetical dash on the following pass — defect family 2. The
repair made a right-hand no-break space not count as dash spacing, which left the _asymmetric_
shape reachable: `«–␣"` gains an inner U+00A0 from N8, and a left-hand no-break space still
counted, so the token became symmetric and was promoted from en to em — defect (d),
`dashes.md` §5.2. Both were caused by this sub-rule's insertions, and both repairs were
attempts to specify which no-break space counts as spacing on which side.

**The discharge no longer depends on that.** `E(nbsp) = { U+00A0, U+202F }` — those are the
only code points this rule can emit or insert, in any sub-rule, under any locale data. `dashes`
now treats **both** as making an adjacent token inert (`dashes.md` §3.2 step 3), so no emission
of this rule can create a dash token, change one's spacing verdict, or revive one `dashes`
declined. That is condition **CO-S** of `pipeline-idempotency.md` §5.1a, and it holds for every
input rather than for the witnesses anyone happened to test.

The Russian direction — N1/N2 promoting the U+0020 before an em dash to U+00A0 — is covered by
the same statement: `dashes` declines the promoted token at its symmetry guard and emits
nothing, so the output `Москва⍽— столица` is stable.

**The repair stayed in `dashes` rather than moving here**, for the layering reason in
`pipeline-idempotency.md` §4: `order.json` gives `dashes` `"localeData": ["dash"]` and no access
to `quotes`, so it cannot recognise a guillemet; and requiring this rule to suppress an
insertion that might create a dash token would mean encoding `dashes`' admissibility rules in a
second place, which is how the two rules drifted apart in the first place.

**Against `I₄` (`hyphen`).** Discharged, but only just, and the reason is worth stating. A
listed hyphen form's boundary guards ask whether the neighbouring code point is in `WORDISH`.
An insertion beside such a form would change that neighbour from whatever it was to a no-break
space, which is not `WORDISH` — so the guard could go from _reject_ to _accept_ and a form
could start matching that did not before. That would be an `I₄` violation. It is unreachable
because every insertion site puts the new space next to a listed punctuation character or a
quote glyph, never between two letters, and a form whose neighbour is punctuation or a quote
glyph was already accepted. If a future sub-rule inserts between two letters, this obligation
must be re-derived.

**Against `I₅`, `I₆`, `I₇` (`quotes`, `apostrophe`, `symbols`).** Discharged by case analysis
over the neighbour tests; the `quotes` half is the one that matters and is written out in
`quotes.md` §5.6, which shows that neither insertion site can _add_ a capability to a surviving
straight mark. `apostrophe`'s case ladder reads `ALNUM`, `LETTER`, `DIGIT`, `SPACELIKE`,
`OPENISH` and `CLOSEISH`; an inserted no-break space is `SPACELIKE`, and the only cases it
could newly satisfy require a `SPACELIKE` **left** neighbour, which is case 4 (leading elision)
— and case 4 also requires an `ALNUM` right neighbour, which an insertion cannot create.
`symbols` reads `ALNUM`, `DIGIT` and symmetric spacing; a no-break space is already accepted as
spacing there (`symbols.md` §3.3 step 1), and converting U+0020 to U+00A0 leaves `lsp`/`rsp` unchanged.

---

## 6. Worked examples

`␣` = U+0020, `⍽` = U+00A0, `⍹` = U+202F, `⟶` = no change. Each block states the fields it uses,
and **those fields are quoted from the shipped locale file** rather than assumed. That
distinction is not pedantry: while this preamble said the locale files did not exist yet, rows
row 13a drifted into asserting behaviour the shipped `ru.json` does not produce — and a
neighbouring row asserted an `ru` `beforeNumber` binding that has neither data nor a source
behind it, and has since been deleted rather than softened. Both survived several reviews
because nothing obliged anyone to check. A row here is a claim
about the engine **and** about a file in `spec/locales/`, and both halves have to hold.

### `fr` — `narrowBeforePunctuation: ["?","!",";"]`, `beforePunctuation: [":"]`, primary `« »` with `innerSpace: "narrow-nbsp"`

| #   | Input                               | Output                               | Why                                                                                                                                                             |
| --- | ----------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Bonjour!`                          | `Bonjour⍹!`                          | N2 insertion; the ordinary space, if any, was already removed by `spaces`                                                                                       |
| 2   | `Bonjour⍹!`                         | ⟶                                    | N2 "already correct" — this is the round-trip case                                                                                                              |
| 3   | `Il a dit «mot».`                   | `Il a dit «⍹mot⍹».`                  | N8 inserts on both inner edges                                                                                                                                  |
| 4   | `Il a dit «⍹mot⍹».`                 | ⟶                                    | N8 already correct                                                                                                                                              |
| 5   | `Voir http://example.org: la suite` | `Voir http://example.org⍽: la suite` | N1 guard 2 rejects the colon in `http://` (next code point is `/`) and accepts the sentence colon (next is a space)                                             |
| 6   | `Vraiment?!`                        | `Vraiment⍹?!`                        | N1/N2 guard 1: only the first mark takes a space                                                                                                                |
| 6a  | `Vraiment?…`                        | `Vraiment⍹?…`                        | U+2026 is accepted right context (§3.3 step 2). Previously the narrow space was omitted here but not in `Vraiment␣?`, purely because `ellipsis` had already run |
| 6b  | `Voir␣../docs`                      | ⟶                                    | the French instance of the `spaces` lone-dot defect; see `spaces.md` §3.4                                                                                       |

### `ru` — `afterShortWords: ["в","и","на",…]`, `abbreviations: ["т. д.","и т. п."]`, `bindInitials: true`, `afterSymbols: ["№","§"]`

| #   | Input                   | Output                  | Why                                                                                                                                                                                                                         |
| --- | ----------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7   | `Он живёт в␣Москве`     | `Он живёт в⍽Москве`     | N3: left boundary is a space, right is `SP`, following token is a letter                                                                                                                                                    |
| 8   | `Он живёт в⍽Москве`     | ⟶                       | N3 already correct                                                                                                                                                                                                          |
| 9   | `и␣т.␣д.`               | `и⍽т.⍽д.`               | the leading `и` by N3, the internal space by N4 (`т. д.`)                                                                                                                                                                   |
| 10  | `А.␣С.␣Пушкин`          | `А.⍽С.⍽Пушкин`          | N7 clause C1 twice                                                                                                                                                                                                          |
| 11  | `Пушкин␣А.␣С.`          | `Пушкин⍽А.⍽С.`          | first space by C2 (two initials follow), second by C1                                                                                                                                                                       |
| 12  | `см. №␣5`               | `см. №⍽5`               | N6                                                                                                                                                                                                                          |
| 13  | `Иван␣пошёл␣домой`      | ⟶                       | no short word, no abbreviation, no unit, no initial                                                                                                                                                                         |
| 13a | `г.␣Москва, ул.␣Ленина` | `г.␣Москва, ул.⍽Ленина` | N10 binds **only `ул.`**. `ru.json`'s `beforeWord` is `["ул.","пл."]`; `г.` is not in it — it is in `beforeUnits`, where it binds **backwards** to a preceding year (`1990⍽г.`), which is the actual Russian convention. Row checked against the shipped file, not against a hypothetical one                                                                                                                                                         |
| 13c | `г.⍽Москва`             | ⟶                       | N10 "already correct"                                                                                                                                                                                                       |
| 13d | `г.Москва`              | ⟶                       | N9/N10 never insert                                                                                                                                                                                                         |
| 13e | `г. «Москва»`           | ⟶                       | N10 guard G-W: the following code point is a quotation glyph, not a letter                                                                                                                                                  |
| 13f | `из-за␣дождя`           | `из‑за␣дождя`           | `hyphen` binds the compound; N3 does **not** then bind `за`, because its left neighbour is U+2011 and a hyphen fails the left boundary (§3.5 step 2). Previously produced `из‑за⍽дождя`, a false positive on ordinary prose |
| 13g | `из-под␣стола`          | `из‑под␣стола`          | same shape with the other listed compound                                                                                                                                                                                   |
| 13h | `—␣в␣Москве`            | `—␣в⍽Москве`            | `SENTENCE-DASH` still opens a phrase, so a genuine preposition after an em dash binds normally                                                                                                                              |

### `de-DE` — `abbreviations: ["z. B.","d. h."]`, `beforeUnits: ["%","km","°C"]`

| #   | Input                   | Output                  | Why                                                                                                                                                                                                                                      |
| --- | ----------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 14  | `z.␣B.␣Berlin`          | `z.⍽B.␣Berlin`          | N4 binds the space inside the abbreviation. The space after `B.` is **not** bound: guard C1-a sees that the `B.` is preceded by the lower-case `z.` and declines. Previously produced `z.⍽B.⍽Berlin`, a false positive on ordinary prose |
| 15  | `z.⍽B. Berlin`          | ⟶                       | N4 space-lenient match, already correct                                                                                                                                                                                                  |
| 16  | `Es sind 20␣km bis 5␣%` | `Es sind 20⍽km bis 5⍽%` | N5 twice                                                                                                                                                                                                                                 |
| 17  | `Es sind 20km`          | ⟶                       | N5 never inserts (§7.2)                                                                                                                                                                                                                  |
| 18  | `H2␣O ist kein Wert`    | ⟶                       | N5 step 4: `2` is preceded by the letter `H`                                                                                                                                                                                             |
| 19  | `siehe Nr.␣5 und S.␣12` | `siehe Nr.⍽5 und S.⍽12` | N9 twice                                                                                                                                                                                                                                 |
| 20  | `siehe nr.␣5`           | ⟶                       | N9 matches exactly; `nr.` is not `Nr.`                                                                                                                                                                                                   |

### `fr` — `beforeWord: ["M.","Mme","Mlle"]`

| #   | Input                   | Output                  | Why                                                                                                                                                                                              |
| --- | ----------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 21  | `M.␣Dupont et Mme␣Hugo` | `M.⍽Dupont et Mme⍽Hugo` | `Mme` binds via N10 (three code points, G-D does not apply). `M.` is inert in N10 because `fr` has `bindInitials: true` and G-D fires — it binds via **N7 C1** instead, reaching the same U+00A0 |
| 22  | `M.␣dupont`             | ⟶                       | lower-case surname: N7 C1 needs `UPPER` after the space, and N10 is inert for `M.`. A documented gap, §7.10                                                                                      |
| 23  | `«?`                    | `«⍽?`                   | N1/N2 decline the index (quote-glyph guard, §3.3 step 3) and N8 owns it, inserting the `innerSpace` target. Previously this oscillated between U+00A0 and U+202F for ever — §3.10.1              |
| 24  | `«⍽?`                   | ⟶                       | the fixed point of case 23                                                                                                                                                                       |
| 25  | `mot␣?`                 | `mot⍹?`                 | the ordinary case: the code point before the space is a letter, so N2 applies normally                                                                                                           |

### `el` — every list empty, `bindInitials: false`, `quotes.innerSpace: "none"`

The first locale for which this rule is a **total no-op**, in the same provable sense `hyphen` is
a no-op for a locale with empty lists. It is worth a block of its own because the claim needs
_both_ halves of `order.json`'s `"localeData": ["nbsp", "quotes"]` to hold, and only one of them
is visible in the `nbsp` object: the eight lists being empty disables N1–N7 and N9–N10, and
**`quotes.innerSpace: "none"` is what additionally disables N8**. A locale with empty lists but a
non-`none` `innerSpace` would still edit — `fr` case 23 is exactly that shape — so "all lists
empty" alone does not license the claim.

Greek is also the case that shows why N1/N2 being empty is a positive finding rather than an
unfilled field. The Greek source denies the French space-before-punctuation pattern **by name**
(«πράγμα που συμβαίνει, π.χ., στα γαλλικά»), so `spaces` strips the space at order 10 and nothing
here puts one back. That is a cited decision, not a default.

| #   | Input          | Output | Why                                                                                                                                                     |
| --- | -------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 26  | `Τι κάνεις;`   | ⟶      | `beforePunctuation` and `narrowBeforePunctuation` are empty, so N1/N2 have no member to match. Contrast `fr` case 25, where the same shape gains U+202F |
| 27  | `10,5␣%␣φέτος` | ⟶      | `beforeUnits` is empty, so N5 is inert and the ordinary space survives as U+0020                                                                        |
| 28  | `«καλημέρα»`   | ⟶      | `innerSpace: "none"`, so N8 inserts nothing. This is the half of the no-op claim that lives in the `quotes` object rather than the `nbsp` one           |

Cases 2, 4, 8, 13, 13c, 13d, 13e, 15, 17, 18, 20, 22, 24, 26, 27 and 28 are "no change" cases.

---

## 7. Open questions

1. **The schema does not enforce that `beforePunctuation` and `narrowBeforePunctuation` are
   disjoint**, nor that a character appears in only one of `beforeUnits` / `afterSymbols`.
   §2 requires an implementation to fail loudly; a `$defs`-level constraint or a CI check
   would be better. Reported.
2. **N5/N6 never insert a space.** `5km` stays `5km` and `50%` stays `50%`. For German,
   Duden requires a space before `%` and before a unit, so `50%` is arguably _wrong_ input
   that polytypo declines to fix. Inserting is a content change and the schema has no flag to
   authorise it per locale (something like `"insertBeforeUnits": true`). Needs an operator
   decision; I chose the conservative branch because of the zero-false-positive ship
   criterion.
3. **`afterShortWords` matching is "case-insensitive only for the first character"** per the
   schema description, which I have implemented as the Unicode **simple** uppercase mapping.
   That is a data table, not a locale operation, so it satisfies §4.4. **The spec pins a Unicode version —
   `spec/UNICODE` contains `17.0` — and the pin is now normative for the derived tables**
   (`pipeline-idempotency.md` §6a). §3.1 cites it, as do the other four rules that read general
   categories. An earlier revision of this item said no pin existed and then that it had no
   reader; both were true when written and neither is now.
4. **`innerSpace: "none"` does not remove an existing space inside quotation marks** — now
   stated normatively in §3.10 rather than left open, with the deletion-is-not-correction
   argument. `de-CH` `« hallo »` and `en-US` `“ hello ”` both survive as typed. The live
   question is only whether the operator wants the opposite: a locale declaring `"none"` could
   be read as asserting that no inner space is permissible, in which case removal would be a
   correction and not a mutilation. I did not take that reading, because it is the only place
   in the spec where a locale field would license a deletion. **Operator decision**; the
   fixtures currently pin non-removal.
5. **A quote pair whose `open` equals `close` cannot have an `innerSpace`.** Finnish and
   Swedish use U+201D on both sides, and their `innerSpace` is expected to be `"none"`, so the
   case is currently vacuous — but the schema permits `{"open":"”","close":"”","innerSpace":
"nbsp"}`, which this rule cannot implement (it cannot tell an opener from a closer without
   the pairing information that only `quotes` has, and `quotes` does not pass state to `nbsp`).
   §3.10 makes it a documented no-op. Either the schema should forbid it or the pipeline
   should let `quotes` hand its pair positions to `nbsp` — the latter breaks the "rules are
   independent" property and I did not propose it unilaterally. Reported.
6. **`bindInitials` clause C2 requires two consecutive initials.** `Пушкин А.` (one initial)
   is not bound. Restricting it this way avoids binding every `word` + `Capital.` pair, but it
   is a guess about Russian practice and needs checking against Мильчин.
7. _(Settled.)_ `nbsp.beforeNumber` and `nbsp.beforeWord` were added to the schema and are
   specified as N9 (§3.11) and N10 (§3.12). `Nr. 5`, `S. 12`, `art. 237`, `г. Москва`,
   `ул. Ленина`, `M. Dupont` are all now expressible.
8. _(Settled.)_ U+2011 is produced by the `hyphen` rule at order 35 — see
   [hyphen.md](hyphen.md). `nbsp` still never produces it, which is correct: a hyphen is not a
   space and binding it is a different rule with different locale data. U+2060 (word joiner)
   is produced by `dashes` (order 30) around a tight range dash — see
   [dashes.md](dashes.md) §3.3.1. `nbsp` still never produces it, and still never converts an
   author's own U+2060.
9. **N10 has no sentence-boundary guard — but with the shipped locale data the risk is not
   reachable, and an earlier revision of this item was wrong to call it "the single most likely
   `nbsp` false positive at the M4 gate".** That misdirected the review, which is worse than
   saying nothing: it pointed the gate at an input the engine cannot produce.

   The mechanism is real in the abstract. If a locale listed `г.` in `beforeWord`, then
   `в 1990 г. Москва…` would bind across a sentence boundary, because nothing distinguishes
   *год* from *город* syntactically. **`ru.json` does not list it.** `beforeWord` is
   `["ул.","пл."]` — two forms that are unambiguously nouns and cannot end a sentence in the
   relevant sense — and `г.` is instead in `beforeUnits`, binding **backwards** to a preceding
   year. That is a better answer than any guard this rule could have carried: it encodes the
   reading (*год*) that actually collides, and it binds in the direction that reading requires,
   so the forward-binding ambiguity never arises.

   What remains open is the general shape, not this instance: **a locale author may still put an
   ambiguous form in `beforeWord`**, and this rule will bind it across a sentence boundary
   without complaint. The mitigation is locale-data curation and the schema description already
   says so ("Riskier than beforeNumber — list only forms whose binding is normative"). The
   lesson worth keeping is the one this entry got wrong: **a prose claim about what a rule does
   to a language must be checked against the shipped locale file**, because the rule alone does
   not determine it.
10. **G-D is conditional on `bindInitials`**, so a `beforeWord` entry's behaviour depends on
    an unrelated field. That is the only coupling of its kind in the rule and it is mildly
    unpleasant, but every alternative is worse: an absolute guard makes `г.` inert, and no
    guard at all lets N7 and N10 both claim `M. Dupont`. The residual cost is §6 case 22 —
    `M. dupont` binds through neither sub-rule. A cleaner long-term design is for N7 to
    publish the spans it recognises and for N10 to defer to them by index rather than by
    shape; that is the same mechanism C1-a needed and would let both guards collapse into one.
    Worth doing once there are `ru` and `fr` initials fixtures to check it against.
11. **Decided refusals, verified against Lebedev's live service.** Recorded so they are not
    re-litigated:
    - **Digit-group binding** — `100 000` → `100`+U+00A0+`000`. Refused for v1. It is
      expressible here in principle (it needs no locale list, only a digit-run test), but it
      fires on every four-plus-digit number in a document and would need its own
      false-positive analysis against dates, identifiers and code. Not refused on principle;
      refused as unscoped.
    - **U+00A0 before the Russian particles `ли`, `же`, `бы`.** Refused as a rule; if a
      normative source (Мильчин) supports it, the mechanism already exists —
      `nbsp.afterShortWords` binds the space _after_ a short word, and a particle needs the
      space _before_ it, so it would need a new locale field and a citation. Not data we have.
    - **Degree insertion** (`5 C` → `5 °C`) and **currency substitution** (`1 руб.` → `1 ₽`).
      Refused: both rewrite content rather than normalising typography.
