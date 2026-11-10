# Rule: `quote-punctuation`

**Order:** 45. **Default:** off. **Modes:** text, html, markdown, yaml.
**Spec version:** 1.21.0 (new rule).

---

## 1. Purpose

`quote-punctuation` moves a comma or a full stop from after a closing primary quotation mark to
before it, for a locale whose cited convention puts them inside the mark. It exists because
`quotes` converts glyphs and nothing else: `"hello",` becomes `“hello”,` in `en-US` and
`‘hello’,` in `en-GB`, and in both the comma stays where the author put it (canonical
polytypo#74). For American English that is the wrong place — Chicago sets commas and periods
before the closing mark (the citation is in `spec/locales/en-US.json`) — so text typeset by
`en-US` still carries British placement whenever its author typed it.

Every other rule in this project changes characters while keeping each one next to the neighbours
the author gave it. This rule changes where a character _sits_. That is why it is **off by
default** and why it is built to decline rather than to decide.

**What it deliberately does not do.** Where punctuation goes relative to a closing mark is, in
most locales, a question of meaning: a mark that belongs to the quoted material goes inside, one
that belongs to the surrounding sentence goes outside. `"Stop."` and `"most popular",` look alike
on the surface, and a scan of code points cannot tell them apart. So the rule is defined only
where the convention is positional — **a comma or a full stop goes inside, whatever the sense** —
and everywhere else (`en-GB`, German, and every locale whose placement was not verified) the
locale says `"none"` and the rule does nothing. The accepted cost of the one positional locale is
in §6.

---

## 2. Locale data consumed

- `quotes.punctuationPlacement` — one of `"inside"`, `"none"`. Required in every locale file.
  `"none"` means the rule does nothing: either the locale places these marks by meaning, or no
  convention has been verified (a missing citation is never a licence to guess). `"inside"` means
  the locale's cited convention puts a comma or full stop before the closing primary mark.
- `quotes.primary.close` — the glyph the scan keys on. `quotes.secondary` is **not** read: a
  secondary close is a `NARROW` glyph, and in `en-US` it is U+2019, which is also the apostrophe
  (`the dogs’, bowls`).
- Nothing else. The rule has no tables of its own.

`"inside"` is a claim the algorithm's composition argument (§5) depends on, so
`scripts/validate-spec.mjs` refuses a locale file that makes it where that argument does not hold:

- **QP-1.** `quotes.primary.close` is a `WIDE` glyph (`quotes.md` §3.1) and differs from
  `quotes.primary.open`. A symmetric pair cannot tell a closing mark from an opening one, and a
  `NARROW` close is either the apostrophe glyph or a mark a word can end in.
- **QP-2.** `dash.parenthetical` is not `"em-paired"`. `dashes.md` §3.4a ends a segment at a
  full stop that is followed by a space; moving the stop across the quotation mark removes that
  boundary (`”.␣` becomes `.”␣`), so a pair of strokes the first pass kept apart could meet on the
  second.
- **QP-3.** Neither `quotes.primary.innerSpace` nor `quotes.secondary.innerSpace` is a space. A
  spaced primary pair puts a space on the mark's left, so the scan could never fire, and any
  spaced pair keeps `quotes.md`'s `gapInsertable` non-vacuous, which §5's argument against `I₅`
  relies on being vacuous.

`en-US` is the only locale that declares `"inside"` as of spec 1.21.0. The value is a statement
about a source, not about a language: `en-GB` and `de-DE` are `"none"` for the reason §1 gives,
and carry the citation that shows it; `de-CH` and every other `"none"` locale are `"none"` because
no convention has been verified for them.

---

## 3. Algorithm

Input is a code-point array `cp[0 … n-1]` in which modes may have placed boundary markers
(`modes.md` §3.2). The rule performs one left-to-right scan and produces edits; the pipeline
applies them. The rule is a no-op unless `quotes.punctuationPlacement` is `"inside"`.

### 3.1 Character classes

The classes are those of `quotes.md` §3.1, unchanged: `LETTER`, `SPACELIKE` (which contains
`BREAK`, so a −2 line marker is `SPACELIKE`), and `NONE` for an index outside the array. The −1
inline marker is in none of them (`modes.md` §3.3). Let `Q` be `quotes.primary.close`.

### 3.2 The scan

For each index `i` from `0` while `i + 1 < n`, in ascending order, the pair `cp[i], cp[i+1]` is
an **edit** if and only if all of the following hold:

| #   | Condition                                                                        |
| --- | -------------------------------------------------------------------------------- |
| C1  | `cp[i] = Q`                                                                      |
| C2  | `cp[i+1]` is U+002C or U+002E                                                    |
| C3  | `i ≥ 1` and `cp[i-1]` is in `LETTER`                                             |
| C4  | `cp[i+2]` is `NONE` or in `SPACELIKE`                                            |

The edit replaces the two code points with `cp[i+1], cp[i]` — the same two code points in the
opposite order. After an edit continue from `i + 2`; otherwise from `i + 1`.

**What each condition buys.**

- **C3** requires a letter, not merely a non-space. It declines after a digit (`5”,` is the shape
  of an inch mark and of a quoted number), after another terminal (`”!.`, `…”.`), after a
  full stop (`e.g.”,` — whether the stop belongs to the abbreviation is not decidable here), after
  any quotation mark (a nested quotation, `“He said ‘hi’”.`), after a bracket, and across any
  boundary marker or protected run (the marker is not `LETTER`).
- **C4** requires the punctuation to end its clause. It declines when a letter, a digit, a
  bracket, another dot, a quotation mark or a boundary marker comes next: `“file”.txt`,
  `(“hi”.)`, `“wait”…`, and `“file”.${ext}` with a protected `${ext}`.
- **C2** moves only the comma and the full stop. `;` `:` `?` `!` and the dashes are positional in
  no locale this specification has verified — Chicago puts them outside unless they belong to the
  quotation — so they are left where the author wrote them, and so is a full stop that duplicates
  a terminal already inside the mark (`“Stop!”.`, which stays).

The edit has length two for length two, so it never changes the length of the text, never
inserts a U+0020, and never needs the edge-growth check of `modes.md` §3.4: the replacement's
first and last code points are not U+0020.

### 3.3 Modes, `protect`, `analyze`

**Document modes.** A span boundary between the mark and the punctuation, or on either side of
the pair, puts a marker at `cp[i-1]`, `cp[i+1]` or `cp[i+2]`. A marker at `cp[i-1]` fails C3, at
`cp[i+1]` fails C2, and at `cp[i+2]` fails C4. The rule therefore needs no special handling of
`html`, `markdown` or `yaml`: it acts only when the whole of `Q`, the punctuation, and the text on
either side are in one span, and the redistribution of edits to spans is trivial because the edit
never contains a marker. The end of a text unit is `NONE`, not a marker, so `<p>Call it
"ready".</p>` moves the stop while `<p>Call it "ready".</p><p>Next</p>` does not (§6).

**`text` mode `protect`.** A protected run is a boundary marker, including at the very start or
end of the input (`modes.md` §3.9.3), so it blocks the scan the same way. The edit never changes
the length of the text and never touches a protected code point, so a case's `protectOut` equals
its `protect`.

**`analyze`.** Reports one change per edit, with `ruleId` `quote-punctuation`, and only when the
rule is enabled for the call (`analyze.md` A4).

---

## 4. Must not touch

**Scope.** Per [pipeline-idempotency.md](pipeline-idempotency.md) §5.2 each bullet is **[P]** — a
guarantee of `transform` as a whole — or **[R]** — true of this rule in isolation but capable of
being falsified by another rule, which is then named.

- **[P] Anything, unless the caller asked.** The rule is off by default; `transform` without
  `{ rules: { "quote-punctuation": true } }` leaves every comma and stop where it was typed.
- **[P] Every locale whose `punctuationPlacement` is `"none"`.** Enabling the rule is a no-op
  there.
- **[P] `;` `:` `?` `!`** and a full stop that follows one: `“Stop!”.` is unchanged.
- **[P] A punctuation mark after a digit or a non-letter.** `“Route 66”.`, `6’ 2”,`.
- **[P] A nested quotation's closing mark.** `“He said ‘hi’”.` — the glyph left of the primary
  close is `’`, not a letter.
- **[P] A secondary close, and the apostrophe.** `the dogs’, bowls`. The scan keys on the primary
  close only (QP-1).
- **[P] A stop or comma followed by anything but a space, a line break or the end of the text.**
  `“file”.txt`, `(“hi”.)`, `“wait”…`, `“a”,”b”`.
- **[P] Across a span boundary or a protected run, on any of the three sides.**
- **[P] A straight quotation mark.** The rule reads the glyph `quotes` produced; an unconverted
  U+0022 is not `Q`.
- **[R] Which marks are quotation marks.** Decided by `quotes`; this rule moves a punctuation mark
  next to one that `quotes` already settled, or that the author already typed in curly form.

---

## 5. Idempotency argument

**The rule alone.** An edit swaps `Q` and a punctuation mark. Afterwards `Q` stands at `i+1`
with `cp[i+2]` unchanged, and `cp[i+2]` is `NONE` or `SPACELIKE`, which is not U+002C or U+002E, so
C2 fails there. The punctuation mark now at `i` is not `Q`, so C1 fails there. A candidate pair
elsewhere reads `cp[j-1]`, `cp[j]`, `cp[j+1]` and `cp[j+2]`; an edit at `i` changes only `cp[i]`
and `cp[i+1]`. For `j > i + 1` to read either, `j - 1 ≤ i + 1`, so `j ≤ i + 2`; but `j = i + 2`
requires `cp[i+2] = Q`, which C4 excludes. For `j < i`, `j + 2 ≥ i` means `j = i - 2` and
`cp[j+2] = cp[i]`, which was `Q` and is not `NONE` or `SPACELIKE`, so `j` was not a candidate
before and is not one after. Two candidates are never adjacent for the same reason. Hence
`T(T(x)) = T(x)` for this rule on its own, and `I₅ₐ(y)` — "no pair in `y` satisfies C1–C4" — holds
on its output.

### Composition obligation

Per [pipeline-idempotency.md](pipeline-idempotency.md) §5. This rule is **R₅ₐ**; it runs after
`quotes` (R₅) and before `apostrophe` (R₆), so the obligation runs against `spaces`, `ellipsis`,
`ranges`, `dashes`, `hyphen` and `quotes` (its output must satisfy their invariants), and `I₅ₐ`
must survive `apostrophe`, `symbols` and `nbsp`.

**What this rule emits.** The same two code points it consumed, swapped: `Q` moves right by one
index and U+002C or U+002E moves left by one. **No code point is inserted or deleted**, and the
neighbours of the pair are `cp[i-1] ∈ LETTER` on the left and `NONE` or `SPACELIKE` on the right,
both before and after the edit.

- **`I₁` (`spaces`).** Discharged. No U+0020 is created and none is removed. A U+0020 before the
  punctuation is impossible (`cp[i-1]` is a letter before the edit, and after it the punctuation's
  left neighbour is that same letter). `spaces` removes a run of U+0020 when the code point to
  its right is in `STRIP-BEFORE`; no run ends at `cp[i]` or `cp[i+1]` either before or after the
  edit, because `cp[i-1]` is a letter and the swapped pair is adjacent.
- **`I₂` (`ellipsis`).** Discharged. A single dot is moved; C4 excludes a following dot and C3
  excludes a preceding one (`…”.` and `”...` are both declined), so no run of dots is formed or
  split.
- **`I₂ₐ` (`ranges`), `I₃` (`dashes`).** Discharged by class membership: `Q`, U+002C and U+002E
  are in none of `DASH`, `INERT-DASH`, `DIGIT`, `SPACE`, `NOBREAK-SPACE`, `JOINER` or `ROMAN`, so
  a token's `cp[L]`, `cp[R]`, `before`, `after` and cluster never move between classes. The one
  place `dashes` reads a full stop is §3.4a's segment boundary, excluded by **QP-2**.
- **`I₄` (`hyphen`).** Discharged. A listed form is bounded by `¬WORDISH` on both sides; `Q`, `,`
  and `.` are all outside `WORDISH`, so the boundary does not move.
- **`I₅` (`quotes`).** Discharged by comparing the verdict inputs `quotes` reads at the mark.
  For the mark itself: `Lskip` changes from a letter (`ALNUM`) to the punctuation mark (neither
  `NONE` nor `SPACELIKE`) and `closeRight` from the punctuation mark (`CLOSEISH`) to `NONE` or
  `SPACELIKE`; `canClose` accepts both before and after, and `canOpen` rejects both (`openLeft` is
  a letter before, and `,` or `.` — in `CLOSEISH` but not `OPENISH` — after). For a candidate to
  the right, across the spaces: `Lskip` changes from the punctuation mark to `Q`, and
  `canClose`/`canOpen` read it only against `NONE` and `SPACELIKE`. The elision vetoes read
  `NARROW` marks and `ALNUM` neighbours, and none of the code points that moved is either. The
  gap test `gapInsertable` is vacuous because **QP-3** forbids a spaced pair. So the candidates,
  their verdicts and their pairing are the same on the second pass, and the certification gate
  (`quotes.md` §3.5) sees the same document modulo this swap.
- **`I₅ₐ` against `apostrophe` (R₆).** Discharged. `apostrophe` emits only U+2019, never `Q`
  (QP-1 excludes a `Q` equal to U+2019), so it creates no candidate; and it changes a code point
  to U+2019 only where it stood as U+0027, which is not `LETTER`, so it cannot make `cp[i-1]` a
  letter.
- **`I₅ₐ` against `symbols` (R₇).** Discharged. `symbols` emits U+00A9, U+00AE, U+2122, U+00D7
  and U+00B1, none in `LETTER` or `SPACELIKE`, and replaces spans bounded by non-`ALNUM`
  neighbours, so it cannot make `cp[i-1]` a letter or `cp[i+2]` a space.
- **`I₅ₐ` against `nbsp` (R₈).** Discharged. `nbsp` converts one space to another or inserts a
  space; `SPACELIKE` accepts either, so C4 holds both ways. `nbsp` can insert a space between
  `Q` and the punctuation (N1/N2) only if the locale lists that punctuation in
  `beforePunctuation` or `narrowBeforePunctuation`, which `en-US` does not; if a locale did, the
  insertion would make `cp[i+1]` a space, which fails C2, so the pair is no longer a candidate.

**What is argued and what is measured.** The discharges against `ellipsis`, `ranges`, `dashes`,
`hyphen` and `nbsp` are class-membership arguments over the alphabet `{Q, U+002C, U+002E}` and
the two neighbour classes, in the shape of `symbols.md` §5, not CO-S proofs, and each runtime's
idempotency sweep with the rule enabled is the control (`pipeline-idempotency.md` §5.1a). A
throwaway reference implementation of §3.2 (not a runtime) was applied to the **finished output** of
the `polytypo` 1.20.1 pipeline — that is, after `apostrophe`, `symbols` and `nbsp` had run, not
between `quotes` and `apostrophe` where the rule sits — over the released `en-US` text fixtures,
1,128 variants of them with a comma or stop added after each quotation mark, and 400,000 random
strings of letters, quotation marks, commas, stops, spaces, brackets and dashes. For each, the
scanned output was re-run through the pipeline and the scan, and came back unchanged. No violation
was found. That checks that the pipeline leaves a scanned text alone; it does **not** check the
rule's composition against `apostrophe`, `symbols` or `nbsp` in its real position, and it is no
proof. Those checks belong to the runtimes' own sweeps.

---

## 6. Worked examples

`⟶` = no change. Every row is a conformance fixture in `spec/fixtures/en-US.json` with
`rules: { "quote-punctuation": true }`, unless it says otherwise. Input is the author's text; the
output is what the whole pipeline produces, so a row shows `quotes`' conversion and this rule's
move together.

### `en-US` — `punctuationPlacement: "inside"`, text mode

| #   | Input                               | Output                              | Why                                                       |
| --- | ----------------------------------- | ----------------------------------- | --------------------------------------------------------- |
| 1   | `She said "hello", then left.`      | `She said “hello,” then left.`      | C1–C4                                                     |
| 2   | `He called it "done". Then he left.`| `He called it “done.” Then he left.`| a stop, followed by a space                               |
| 3   | `Call it "ready".`                  | `Call it “ready.”`                  | C4: end of the text is `NONE`                             |
| 4   | `Call it "ready".` + U+000A + `Next`| `Call it “ready.”` + U+000A + `Next`| C4: a line break is `SPACELIKE`                           |
| 5   | `The "first", the "second".`        | `The “first,” the “second.”`        | two independent edits                                     |
| 6   | `"Go home".`                        | `“Go home.”`                        | **a complete sentence in the quotation is not special**   |
| 7   | `Both "a", "b" and "c".`            | `Both “a,” “b” and “c.”`            | the middle quotation has nothing to move                  |
| 8   | `She said “hello,” then left.`      | ⟶                                   | already inside: nothing at `cp[i+1]`                      |
| 9   | `Broken pair”, then`                | `Broken pair,” then`                | **an unpaired closing mark is moved too** (accepted cost) |
| 10  | `"Stop!".`                          | `“Stop!”.`                          | C3: the glyph on the left is `!`                          |
| 11  | `It said "wait…".`                  | `It said “wait…”.`                  | C3: `…`                                                   |
| 12  | `Use "e.g.", then`                  | `Use “e.g.”, then`                  | C3: `.`                                                   |
| 13  | `"Route 66".`                       | `“Route 66”.`                       | C3: a digit                                               |
| 14  | `"He said 'hi'".`                   | `“He said ‘hi’”.`                   | C3: `’`; nested quotation, accepted miss                  |
| 15  | `Say "a"; say "b": say "c"?`        | `Say “a”; say “b”: say “c”?`        | C2: `;` `:` `?` are never moved                           |
| 16  | `"file".txt`                        | `“file”.txt`                        | C4: a letter follows                                      |
| 17  | `He said ("hi".)`                   | `He said (“hi”.)`                   | C4: a bracket follows                                     |
| 18  | `He said "wait"...`                 | `He said “wait”…`                   | `ellipsis` runs first; C2 fails on U+2026                 |
| 19  | `Check the dogs’, bowls and cats.`  | ⟶                                   | U+2019 is the secondary close, not `Q` (QP-1)             |
| 20  | `She said "hello", then left.`, rule not enabled | `She said “hello”, then left.` | the default: off                       |

### Document modes and `protect`

| #   | Mode       | Input                                          | Output                                         | Why                                                                |
| --- | ---------- | ---------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| H1  | `html`     | `<p>She said "hello", then left.</p>`          | `<p>She said “hello,” then left.</p>`          | one text node                                                      |
| H2  | `html`     | `<p>She said <em>"hello"</em>, then left.</p>` | `<p>She said <em>“hello”</em>, then left.</p>` | a marker at `cp[i+1]` fails C2                                     |
| H3  | `html`     | `<p>She said "<em>hello</em>", then left.</p>` | `<p>She said “<em>hello</em>”, then left.</p>` | a marker at `cp[i-1]` fails C3                                     |
| H4  | `html`     | `<p>She said "hello".</p>` + U+000A + `<p>Next.</p>` | `<p>She said “hello.”</p>` + U+000A + `<p>Next.</p>` | the gap holds a line terminator: a −2 marker is `BREAK`, so C4 holds |
| H5  | `html`     | `<p>She said "hello".</p><p>Next.</p>`         | `<p>She said “hello”.</p><p>Next.</p>`         | the gap holds none: a −1 marker at `cp[i+2]` fails C4              |
| M1  | `markdown` | `She said "hello", then left.` + U+000A        | `She said “hello,” then left.` + U+000A        | one span                                                           |
| M2  | `markdown` | `*She said "hello"*, then left.`               | `*She said “hello”*, then left.`               | the closing `*` is a boundary                                      |
| M3  | `markdown` | `*He said "hi".* Next`                         | `*He said “hi”.* Next`                         | the same, at `cp[i+2]`                                             |
| Y1  | `yaml`     | `title: She said "hello", then left.`          | `title: She said “hello,” then left.`          | a processable plain scalar is one span                             |
| P1  | `text`, `protect` | `Set "file".${ext} now`                 | `Set “file”.${ext} now`                        | the protected run is a marker at `cp[i+2]`                         |
| P2  | `text`, `protect` | `Use "${name}", then stop.`             | `Use “${name}”, then stop.`                    | the protected run is a marker at `cp[i-1]`                         |
| P3  | `text`, `protect` | `Say "hi", then ${x}.`                  | `Say “hi,” then ${x}.`                         | the hole is elsewhere; `protectOut` equals `protect`               |

Rows P1 to P3 give `protect` as the code-point ranges of `${ext}`, `${name}` and `${x}`.

### Every other locale

For each of the other twenty-six locales a fixture enables the rule on text that is already in
that locale's quotation marks, with a comma after the closing mark, and expects it back unchanged;
`en-GB` is the one that starts from straight quotes (`She said "hello", then left.` becomes
`She said ‘hello’, then left.`). They prove `"none"` is a no-op in every locale and keep the
rule from silently becoming locale-dependent.

### Accepted costs

These are the price of declining rather than deciding, named so a reader can weigh them:

- **A quoted literal absorbs the punctuation.** `set it to "strict".` becomes `set it to
  “strict.”`. In `en-US` that is the rule Chicago states for prose; for a literal it is wrong,
  and the manual makes an exception (CMOS Shop Talk, “Section 7.75 in the Spotlight”, a
  16th-edition text; whether it holds in the 18th was not checked) that this rule does not model.
  Code spans are skipped by every mode, so a literal in code is safe. This is also why the rule
  is off by default: with it on, 4 of the 201 `en-US` fixtures that are in text mode, have an
  `out`, and set no `rules` override (counted before this rule's own cases were added) would
  produce different output.
- **No duplicate removal.** `“Stop!”.` keeps both marks.
- **Nested and numeric quotations are missed** (rows 13 and 14): `“Route 66”.` and
  `“He said ‘hi’”.` keep the stop outside.
- **A closing tag or an emphasis delimiter right after the stop blocks the move** (H5, M3), while
  the same text at the very end of a document moves it. A markup boundary is not a space.
- **An unpaired curly closing mark moves its punctuation** (row 9). The rule trusts the glyph,
  not the pairing.
- **Every locale but `en-US` is untouched.** For `en-GB` and `de-DE` the cited placement depends
  on meaning (University of Oxford Style Guide (2014): “place any punctuation which does not
  belong to the quote outside”; Rat für deutsche Rechtschreibung 2024 §79 E1); for the others no
  convention has been verified. A caller who wants it applied there has no option to ask for it.

---

## 7. Open questions

1. **`"outside"`.** German places a comma after the closing mark when a carrier sentence
   follows the quotation (§79 E1(2)); that is the one position-only statement found. A
   value that moved a comma from inside to outside would be positional there and could be added to
   the enum without changing any existing value. Nothing is specified for it; recorded because it
   is the one other position-only convention the sources established.
2. **Is a Chicago exception for computer terms a hole in `"inside"`?** CMOS Shop Talk, 2015, 16th
   ed.: punctuation that is not part of a quoted computer term stays outside. The 18th edition
   was not read. If it keeps the exception, a locale entry cannot express it and the rule's
   default-off status is the only protection.
3. **The primary close only.** A single-quoted first-level quotation (`en-GB`) is not covered by
   QP-1 because `en-GB` is `"none"`; if a locale ever declares `"inside"` with a `NARROW` primary
   close, QP-1 has to be revisited together with the apostrophe argument.
