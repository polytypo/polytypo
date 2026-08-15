# Rule: `spaces`

**Order:** 10 (first). **Default:** on. **Modes:** text, html, markdown.
**Spec version:** 0.1.0.

---

## 1. Purpose

`spaces` performs the space hygiene that every later rule depends on: it collapses a run of
two or more ordinary spaces down to one, and it deletes an ordinary space that sits between
a word and a following punctuation mark or on the inner edge of a bracket pair. It runs
first so that the rules after it see one canonical spacing form and never have to consider
`"a  ,  b"` alongside `"a, b"`. It is deliberately the most conservative rule in the
pipeline: it only ever _removes_ U+0020 (space), it never inserts anything, it never touches
any other whitespace character, and it never touches whitespace that carries structural
meaning (indentation, Markdown hard line breaks, line terminators). Where a locale genuinely
wants a space before punctuation — French `?` `!` `;` `:` — this rule still removes the
ordinary space, and the `nbsp` rule (order 70) re-inserts the correct no-break form; that
round trip is intentional and is what makes the French output deterministic regardless of
how the author typed it.

---

## 2. Locale data consumed

**None.** `order.json` declares `"localeData": []` for this rule. The behaviour of `spaces`
is identical in every locale. Locale-dependent spacing is entirely the responsibility of
`nbsp`.

---

## 3. Algorithm

The input is a code-point array `cp[0 … n-1]`. Indices below are code-point indices
(ARCHITECTURE.md §4.2). The rule emits edits; the pipeline applies them.

### 3.1 Character classes

| Class             | Members                                                                                                                                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SPACE`           | U+0020 (space) — **the only** character this rule ever removes                                                                                                                                                                                           |
| `BREAK`           | U+000A (LF), U+000D (CR), U+000B (VT), U+000C (FF), U+0085 (NEL), U+2028 (LS), U+2029 (PS)                                                                                                                                                               |
| `PROTECTED-SPACE` | U+0009 (tab), U+00A0 (nbsp), U+202F (narrow nbsp), U+2007 (figure space), U+2008 (punctuation space), U+2009 (thin space), U+200A (hair space), U+2000–U+2006, U+205F (medium math space), U+3000 (ideographic space), U+200B (zero-width space), U+FEFF |
| `CONTENT`         | any code point that is **not** in `SPACE` and **not** in `BREAK`. Note that every member of `PROTECTED-SPACE` is `CONTENT` for the purposes of this rule — it bounds a space run and is never itself modified.                                           |
| `STRIP-BEFORE`    | exactly six code points: U+002C (,) U+002E (.) U+003B (;) U+003A (:) U+0021 (!) U+003F (?). **U+2026 is deliberately not a member** — see §3.4                                                                                                           |
| `DOTLIKE`         | U+002E (.) and U+2026 (…)                                                                                                                                                                                                                                |
| `OPEN-BRACKET`    | U+0028 `(` U+005B `[` U+007B `{`                                                                                                                                                                                                                         |
| `CLOSE-BRACKET`   | U+0029 `)` U+005D `]` U+007D `}`                                                                                                                                                                                                                         |

`STRIP-BEFORE` contains only these **six** code points. It deliberately excludes closing
quotation marks and guillemets: their inner spacing is `nbsp`'s business (`quotes.innerSpace`),
and stripping there would fight with it.

### 3.2 Scan

1. Set `i = 0`.
2. If `cp[i]` is not `SPACE`, emit nothing, set `i = i + 1`, repeat from 2. Terminate when
   `i = n`.
3. `cp[i]` is `SPACE`. Find the maximal run: let `s = i`; let `e` be the smallest index
   `> s` such that `cp[e]` is not `SPACE` (or `e = n` if the run reaches the end of the
   array). The run is `cp[s … e-1]`, length `k = e - s`.
4. **Boundary guard.** Look one code point left of the run and one right of it:
   - `left = cp[s-1]` if `s > 0`, otherwise `NONE`;
   - `right = cp[e]` if `e < n`, otherwise `NONE`.
     If `left` is `NONE` or is in `BREAK`, **skip the run entirely** (emit nothing, set
     `i = e`, go to 2). This protects leading indentation, including Markdown list and code
     indentation.
     If `right` is `NONE` or is in `BREAK`, **skip the run entirely**. This protects the
     two-space Markdown hard line break (`"foo  \n"`) and trailing spaces at the end of a
     text unit, which in `html` mode are frequently the only separator between two inline
     elements.
     Only a run with `CONTENT` on **both** sides is a candidate.

     **In `html` and `markdown` mode, a span boundary marker counts as `NONE` here.** This is
     the one place in the whole spec where a marker is not opaque content, it is normative, and
     it is specified in [modes.md](modes.md) §3.3 under _Edge tests_ — read the justification
     there before changing either document. In short: this guard exists because deleting
     whitespace at an edge is irreversible and this rule cannot see past the edge, which is
     exactly the situation at a span boundary; and without it `<em>mot</em> !` in `fr` loses its
     space to the `STRIP-BEFORE` branch and gains nothing back, because `nbsp`'s replacement
     insertion is then refused at the span edge.
5. **Decide the replacement length in one step** (never two passes — see §5):
   - If the _empty-bracket guard_ (§3.3) fires → replacement length **1**.
   - Else if `left` is in `OPEN-BRACKET` → replacement length 0.
   - Else if `right` is in `CLOSE-BRACKET` → replacement length 0.
   - Else if `right` is in `STRIP-BEFORE` **and the lone-dot condition (§3.4) holds** →
     replacement length 0.
   - Else → replacement length 1.
     The guard is a clause of this decision, not a separate "skip the run" branch. **This
     reading is normative**; see §3.3.
6. If the replacement length equals `k`, emit nothing (the run is already canonical).
   Otherwise emit one edit replacing `cp[s … e-1]` with either the empty sequence or a
   single U+0020.
7. Set `i = e` and go to 2.

### 3.3 The empty-bracket guard

A space run whose **removal** would produce an empty bracket pair is not removed. Concretely,
for a run at `[s, e)`:

- if `left` is in `OPEN-BRACKET` and `right` is the matching `CLOSE-BRACKET`
  (`(`↔`)`, `[`↔`]`, `{`↔`}`), the guard fires.

**Normative reading: the guard forces the replacement length to 1, it does not skip the run.**
Two readings were possible and they differ on `"(  )"` (two spaces between an empty pair):
"skip the run" leaves `"(  )"`, "replacement length 1" collapses it to `"( )"`. The second is
normative. Reasons: the guard exists to prevent _deletion_, and collapsing a double space is
the rule's ordinary business everywhere else; a run of two spaces inside an empty bracket pair
carries no structural meaning in any of the three modes (the GFM task-list marker is
`"[ ]"` with exactly one space — `"[  ]"` is not a checkbox in any implementation); and the
one-clause form keeps §3.2 step 5 a single total function of `left` and `right`, which is what
the idempotency argument in §5 relies on. The two-space case is a fixture.

The guard exists for one specific ship-blocking reason: the GitHub-Flavoured Markdown
task-list marker `"- [ ] item"`. Collapsing that space is a no-op; _deleting_ it produces
`"- [] item"` and silently destroys the checkbox. The guard also protects `"( )"` used as a
placeholder.

### 3.4 The lone-dot condition

`STRIP-BEFORE` exists to remove a space that a typist left before **one terminal punctuation
mark**. It must not remove a space before a _run_ of dots, because a run of dots is a different
kind of token — a relative path, a truncation, a typed ellipsis — and deleting the space either
merges it with a preceding abbreviation dot or silently destroys word spacing.

> **Lone-dot condition.** If `right` is U+002E, the replacement length may be 0 **only if** the
> maximal run of `DOTLIKE` code points beginning at that index has length exactly 1. Otherwise
> the replacement length is 1.
>
> **U+2026 is not in `STRIP-BEFORE` at all**, so a space before an existing ellipsis is never
> deleted.

Both halves are needed and the second is not obvious. Suppose only the first were adopted.
Then `Wait ...` keeps its space, `ellipsis` converts the run, and the result is `Wait …` — at
which point a _second_ pipeline pass finds a U+0020 before a U+2026, strips it, and yields
`Wait…`. That is a two-pass divergence of exactly the kind
[pipeline-idempotency.md](pipeline-idempotency.md) exists to prevent, introduced by the fix for
another one. Removing U+2026 from `STRIP-BEFORE` closes it: the author's spacing around an
ellipsis, however they wrote it, is preserved and is stable.

**What this deliberately does not break.** The runs in step 3 are maximal runs **in the input
array**, and the condition is evaluated against the input. In the Chicago-style spaced ellipsis
`Hello . . .` every dot is a _lone_ dot at the moment the decision is made — each is followed by
a space, not by another dot — so all three spaces are still stripped, the dots merge into
`Hello...`, and `ellipsis` converts them to `Hello…`. The condition costs that case nothing.

**What it does change.** `Wait ...` now becomes `Wait …` rather than `Wait…`; the space the
author typed survives. That is consistent with how this rule treats every other authorial
spacing choice (§7.5), and it is the price of not deleting the space in `See ../docs`.

### 3.5 Greek compatibility punctuation, and what "match on a code point" means

Greek raises the one case where the character a reader sees and the code point a rule matches
on come apart. Part 1 and part 3 below are properties of the whole rule set and are settled
here rather than in the locale file; part 2 is about this rule only, and says so, because the
generalisation is exactly what does not hold (see §7.8).

| Reader sees       | Recommended code point | Compatibility code point | Canonical relation |
| ----------------- | ---------------------- | ------------------------ | ------------------ |
| ερωτηματικό (`;`) | U+003B `;`             | U+037E                   | U+037E ≡ U+003B    |
| άνω τελεία (`·`)  | U+00B7 `·`             | U+0387                   | U+0387 ≡ U+00B7    |

Both compatibility characters have a **canonical** decomposition, so NFC and NFD both map them
away; the Unicode Standard records that **most** vendor code pages never had them, and states
that their use "is not generally encouraged for representation of Greek punctuation"
(ch. 7 §7.2.1). The consequence for this spec is that a Greek question mark and a Latin
semicolon are, at the level a rule operates on, **the same code point** — U+003B — and no
amount of context lets a single scan distinguish them.

**The normative position, in three parts:**

1. **Every rule matches on the literal code points enumerated in its own class tables, and on
   nothing else.** No rule consults canonical equivalence, no rule normalises its input, and no
   rule has a notion of "the same character spelled differently" (ARCHITECTURE.md §4.3). A class
   table is a list of code points, not a list of characters.

2. **For _this_ rule, the U+003B ambiguity is harmless.** U+003B is in `STRIP-BEFORE`. Read as a
   Latin semicolon it takes no preceding space in any locale polytypo supports; read as a Greek
   ερωτηματικό nothing in the Greek sources asks for one either — the nearest statements are
   about the neighbouring marks and deny the French pattern by name for both (`Στα ελληνικά,
πριν από τη διπλή τελεία δεν πρέπει να υπάρχει διάστημα (πράγμα που συμβαίνει, π.χ., στα
γαλλικά)`, and the same sentence again for the άνω τελεία). Both readings therefore prescribe
   the same edit and this rule never has to choose: `Τι κάνεις ;` becomes `Τι κάνεις;` whichever
   character the author meant. Note the standard of evidence, because it is weaker than it looks
   — no source examined addresses the ερωτηματικό _specifically_, so the claim is "no source
   contradicts it", not "a source requires it". Nothing rests on the difference here, since
   U+003B would be in `STRIP-BEFORE` for the Latin reading alone.

   **This does not generalise to the other rules, and §7.8 records where it fails.** The
   ambiguity is harmless in `spaces` because the two readings happen to agree; that is a fact
   about the two conventions, not a property the rule set enjoys everywhere. `ellipsis` is the
   counter-example: its `TERMINAL` set is `{U+0021, U+003F}`, so the Latin reading of U+003B
   wins silently and `Πράγματι;..` — the genuinely Greek spelling — does not get the treatment
   `Πράγματι?..` gets. **Any rule adding U+003B, U+0021 or U+003F to a class table must decide
   the Greek reading explicitly rather than inheriting this paragraph.**

3. **U+037E, U+0387 and U+00B7 are in no class of any rule, and no rule ever emits them.** Text
   already written with a compatibility code point round-trips **untouched** — it is neither
   converted to the recommended spelling nor treated as the character it decomposes to. Three
   separate reasons, each sufficient:
   - Rewriting U+037E → U+003B or U+0387 → U+00B7 **is** normalisation, whatever it is called,
     and §4.3 forbids it. It is also redundant: any downstream consumer applying NFC does it.
   - **U+00B7 must not join `STRIP-BEFORE`.** It is a deliberate spaced separator in real
     content — `Home · About · Contact`, and the Catalan and French interpunct — and stripping
     there would be a false positive in locales that have nothing to do with Greek. This rule
     reads no locale data (§2), so a Greek-only membership is not available to it.
   - **Adding only U+0387 would be the worst of the three options.** Two canonically equivalent
     characters would behave differently, and the one that got the correct treatment would be
     the spelling Unicode discourages, while the recommended U+00B7 kept its stray space. A
     split that punishes the correct input is not a partial fix.

   The residual cost is exact and small: a space before an άνω τελεία survives. It is a rare
   typo, and the alternative costs other locales real false positives.

   An earlier revision added, in this sentence, that "the recommended Greek keyboard layouts
   produce U+00B7 and U+003B rather than the compatibility pair". **That clause has been
   deleted.** It is an empirical claim about keyboard layouts, it was stated as fact in
   normative prose, and no source was offered for it — it was the only sentence in this section
   a reviewer could not back with something readable. It may well be true; CLDR keyboard data or
   a vendor layout specification would settle it. Until one is cited the argument does not need
   it, which is why deleting was cheaper than sourcing.

### 3.6 Worked trace

`"a  (  b  ,  c  )  d"`

| run    | left | right | decision                                                 |
| ------ | ---- | ----- | -------------------------------------------------------- |
| `a␣␣(` | `a`  | `(`   | not bracket-inner, right not in `STRIP-BEFORE` → 1 space |
| `(␣␣b` | `(`  | `b`   | left is `OPEN-BRACKET`, guard does not fire → 0          |
| `b␣␣,` | `b`  | `,`   | right in `STRIP-BEFORE` → 0                              |
| `,␣␣c` | `,`  | `c`   | → 1 space                                                |
| `c␣␣)` | `c`  | `)`   | right is `CLOSE-BRACKET` → 0                             |
| `)␣␣d` | `)`  | `d`   | → 1 space                                                |

Result: `"a (b, c) d"`.

---

## 4. Must not touch

**Scope.** Per [pipeline-idempotency.md](pipeline-idempotency.md) §5.2 each bullet is **[P]** —
a guarantee of `transform` as a whole — or **[R]** — true of this rule alone and capable of
being falsified by another rule. This rule is R₁, so no _earlier_ rule can invalidate anything
here; but later rules touch some of the same characters, and those bullets are marked [R].

- **[R] Any character other than U+0020.** Tabs (U+0009) are never collapsed, never converted,
  never removed — in Markdown a tab is indentation and the engine has no way to know whether
  it is inside a code block. U+00A0 and U+202F are never collapsed, never removed, and never
  converted to U+0020; a run such as `"a  b"` is left exactly as written.
  U+2000–U+200A, U+205F, U+3000, U+200B and U+FEFF are likewise untouched.
  _[R]: `nbsp` (R₈) may convert an existing U+00A0 to U+202F or the reverse. `transform` does
  not promise an existing no-break space keeps its exact width — only that this rule never
  collapses or deletes one._
- **[P] Line terminators.** No character in `BREAK` is inserted, removed, or reordered. Space
  runs never merge across a line terminator, because a `BREAK` on either side aborts the
  candidate.
- **[R] Leading whitespace on a line** (a run at index 0 or directly after a `BREAK`). Markdown
  indented code blocks, nested list indentation and YAML front matter all depend on it.
  _[R]: `nbsp` (R₈) can convert the **last** space of an indentation run when the character
  after it is listed in `beforePunctuation`/`narrowBeforePunctuation` — a French line beginning
  `␣␣?`. The run is never shortened, so indentation width survives; one code point changes
  class._
- **[P] Trailing whitespace before a line terminator or at the end of the text unit.** This is
  the Markdown hard-break idiom and, in `html` mode, the inter-element separator.
- **[R] Single spaces in ordinary positions.** `"a b"` is not a candidate for anything.
- **[P] `"[ ]"`, `"( )"`, `"{ }"`** — see §3.3.
- **[R] Spaces before a closing quotation mark or guillemet.** Owned by `nbsp` via
  `quotes.innerSpace`.
- **[P] U+037E, U+0387, U+00B7.** In no class of this rule and of no other. A space before an
  άνω τελεία survives, and a Greek compatibility code point is never rewritten to the character
  it canonically decomposes to — §3.5. Note that the Greek ερωτηματικό is _not_ an exception
  here: it is written U+003B, which is in `STRIP-BEFORE` on its own merits.
- **[P] Anything inside a skipped region.** Code spans, fenced code, `<pre>`, attributes and
  URLs never reach this rule; the mode adapter (L2) removes them before the pipeline runs.
  This rule contains no code-awareness of its own and must not grow any.

---

## 5. Idempotency argument

Let `T` be the transformation described in §3.2.

Every edit replaces a maximal `SPACE` run bounded by `CONTENT` on both sides with either
zero or one U+0020. Consider the output `T(x)` and re-run the scan.

- The bounding characters of every run are `CONTENT` and are never modified by this rule, so
  the `left`/`right` classification of any surviving run is unchanged between runs.
- A run replaced by zero spaces no longer exists; its former neighbours `left` and `right`
  are now adjacent. `right` is a member of `STRIP-BEFORE` or a bracket, and `left` is
  `CONTENT`. No new `SPACE` run has been created — deletion cannot create a space — so
  there is nothing to re-examine at that position.
- A run replaced by one space is now a run of length `k' = 1` with the same `left` and
  `right`. Re-running step 5 on it yields the same decision (the decision is a pure function
  of `left` and `right` only), namely replacement length 1, and step 6 then emits nothing
  because `k' = 1` already equals the replacement length.
- A skipped run is skipped again for the same reason (its guard condition depends only on
  `left`, `right` and bracket matching, all unchanged).

Therefore `T(T(x)) = T(x)`.

**What had to be fixed to get here.** The naive formulation — "first collapse doubles, then
strip spaces before punctuation" — is two passes and is _not_ obviously idempotent, and worse,
it is not obviously order-independent: `"a  ,  b"` collapses to `"a , b"` and then strips to
`"a, b"`, which requires the second pass to run over the output of the first, i.e. a
fixed-point loop. Fixed-point loops are exactly what a spec must not require, because two
implementations will disagree about how many iterations they run. The formulation above
computes the replacement length for each run **once**, from `left` and `right` alone, so a
single pass reaches the fixed point directly.

The second thing that had to be fixed: the naive rule "collapse every run of ≥2 spaces" is
not merely non-idempotent-adjacent, it is _destructive_ on Markdown hard breaks and on
indentation. The `CONTENT`-on-both-sides boundary guard (step 4) is what makes the rule safe,
and it is a precondition of the argument above, not an optimisation.

---

### Composition obligation

Per [pipeline-idempotency.md](pipeline-idempotency.md) §5. This rule is **R₁**: nothing runs
before it, so **the obligation is empty**. There is no earlier invariant it could break.

The obligation pointing the other way is not empty, and it is the one that bit. `I₁` — the
statement that this rule is a no-op, spelled out as S-a … S-d in that document §3 — must be
preserved by all seven later rules. Only one of them emits U+0020 at all (`dashes`), and it
violated S-b, S-c and S-d until guard T2 was added. The exact positions from which this rule
deletes a space are therefore load-bearing for the whole pipeline, and §3.2 step 5 should be
treated as a published interface rather than an implementation detail.

---

## 6. Worked examples

`␣` = U+0020, `⟶` = no change expected, `↵` = U+000A, `⍽` = U+00A0. Every row is
locale-independent **except 9b**, which is marked with its locale: the rule reads no locale data
(§2), but that row's point is that a Greek reading and a Latin reading of U+003B reach the same
verdict here, so naming the locale is what makes the claim checkable.

| #   | Input                  | Output             | Why                                                                                                                                                                   |
| --- | ---------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Hello␣␣␣world.`       | `Hello␣world.`     | run of 3 with `CONTENT` both sides → 1                                                                                                                                |
| 2   | `Hello␣,␣world␣!`      | `Hello,␣world!`    | `,` and `!` are in `STRIP-BEFORE`; the run after `,` keeps one space                                                                                                  |
| 3   | `(␣ok␣)␣and␣[␣x␣]`     | `(ok)␣and␣[x]`     | bracket-inner runs deleted; the guard does not fire because the inner side is not the matching closer                                                                 |
| 4   | `-␣[␣]␣buy␣milk`       | ⟶                  | empty-bracket guard (§3.3): replacement length 1, and the run is already length 1 → no edit. The GFM checkbox survives                                                |
| 4b  | `(␣␣)`                 | `(␣)`              | empty-bracket guard forces length 1, it does not skip — §3.3, normative reading                                                                                       |
| 5   | `line␣one␣␣↵line␣two`  | ⟶                  | the two-space run is directly followed by `BREAK` → skipped; the Markdown hard break survives                                                                         |
| 6   | `␣␣␣␣indented␣code`    | ⟶                  | run starts at index 0 → skipped                                                                                                                                       |
| 7   | `5⍽␣␣km`               | `5⍽␣km`            | the U+00A0 is `CONTENT`; only the U+0020 run beside it collapses, and the U+00A0 itself is untouched                                                                  |
| 8   | `a⍽⍽b`                 | ⟶                  | no U+0020 anywhere; two no-break spaces are never collapsed                                                                                                           |
| 9   | `Bonjour␣!␣Ça␣va␣?`    | `Bonjour!␣Ça␣va?`  | French input; the ordinary spaces go, and `nbsp` (order 70) later restores `Bonjour⁠<U+202F>!`                                                                        |
| 9b  | `Τι␣κάνεις␣;`          | `Τι␣κάνεις;`       | **`el`.** The Greek question mark is written U+003B, which is in `STRIP-BEFORE` on the Latin semicolon's own merits, so the space is stripped with no Greek-specific decision — §3.5 part 2. `nbsp` puts nothing back, because `el`'s punctuation lists are empty |
| 10  | `See␣p.␣12␣.`          | `See␣p.␣12.`       | run before the final `.` deleted — a lone dot, so the condition holds                                                                                                 |
| 10a | `See␣../docs`          | ⟶                  | **lone-dot condition (§3.4).** The dot run has length 2, so the space survives. Previously produced `See../docs`, silently destroying word spacing in a relative path |
| 10b | `e.g.␣..`              | ⟶                  | same. Previously produced `e.g...`, which `ellipsis` then legitimately read as a three-dot run and converted to `e.g…`                                                |
| 10c | `Wait␣...`             | ⟶                  | the space survives (run length 3). `ellipsis` then yields `Wait␣…`, and because U+2026 is not in `STRIP-BEFORE` that is a fixed point                                 |
| 10d | `Hello␣.␣.␣.`          | `Hello...`         | every dot is a **lone** dot in the input, so all three spaces strip and the Chicago-style spaced ellipsis still merges — `ellipsis` converts it to `Hello…`           |
| 10e | `Wait␣…`               | ⟶                  | U+2026 is not in `STRIP-BEFORE`                                                                                                                                       |
| 11  | `foo␣␣␣␣↵␣␣␣␣bar`      | ⟶                  | first run touches a `BREAK` on the right, second on the left                                                                                                          |
| 12  | `Q:␣␣why␣?␣␣Because␣.` | `Q:␣why?␣Because.` | mixed                                                                                                                                                                 |

Cases 4, 5, 6, 8, 10a, 10b, 10c, 10e and 11 are "no change" cases.

---

## 7. Open questions

1. **U+0009 (tab) is completely untouched.** In `text` mode a run of tabs between two words
   is arguably the same typing accident as a run of spaces. I chose safety, because the rule
   cannot distinguish prose from Markdown indentation. If the dogfooding gate (PLAN.md M4)
   shows tab noise in real content, the fix is a separate opt-in rule, not a change here.
2. **U+2009 (thin space) and friends are untouched.** Some authors paste text from InDesign
   or LaTeX carrying real thin spaces. Normalising them to U+202F would be locale-dependent
   and is arguably a `nbsp` concern. Unresolved; currently they are simply preserved.
3. **`STRIP-BEFORE` includes U+003A (colon).** `"10 : 30"` becomes `"10:30"`. I believe this
   is right for prose but it is a real behaviour change on tabular text. Needs a fixture
   decision from the operator.
4. **`STRIP-BEFORE` excludes U+2014/U+2013.** A spaced em dash is a legitimate parenthetical
   form in several locales, so stripping there would be wrong; the `dashes` rule owns dash
   spacing. Confirmed by construction, but worth a fixture.
5. **Should a space before an opening bracket be normalised?** `"word(note)"` versus
   `"word (note)"` is an authorial choice, not a typographic error, so this rule does
   nothing. Recorded so nobody adds it later "for symmetry".
6. **`html` mode boundary semantics.** A text node ending in a space followed by a sibling
   text node beginning with a space is, at the DOM level, two runs of length 1 that render
   as one collapsed space. This rule sees them separately and leaves both. Whether the mode
   adapter should present adjacent text nodes as one logical unit is an L2 question that
   this document cannot settle; it is flagged here because the answer changes `spaces`
   fixtures for `html` mode.
7. **The lone-dot condition (§3.4) changes `Wait␣...` to `Wait␣…` rather than `Wait…`.** The
   author's space survives. I judge that correct — it is the same principle as §7.5, and it is
   what makes `See␣../docs` safe — but it is a visible change from the previous behaviour and
   it deserves a fixture and an operator glance. If tight is preferred, the fix is **not** to
   restore stripping before a dot run (that reopens `See␣../docs`) but to have `ellipsis`
   absorb a preceding space, which is a different rule's business and a different decision.
8. **The Greek reading of U+003B is honoured here and ignored by `ellipsis`.** §3.5 part 2 is
   true of this rule and does not generalise; this entry is where the generalisation fails, and
   it was found by review rather than by construction, so assume there are others.
   `ellipsis.md` §3.1 defines `TERMINAL` as `{U+0021, U+003F}`. A Greek author writes a question
   with U+003B, so `Πράγματι;..` keeps its two-dot run while `Πράγματι?..` — which uses a
   character Greek does not use for questions — becomes `Πράγματι?…`. Greek gets the treatment
   only when it is written wrongly. Verified against the engine, and pinned by the fixture
   `el-ellipsis-greek-question-mark-not-terminal`.

   It is a **miss, not damage**: the input round-trips unchanged, and the two-dot run is left
   exactly as written. That is why it is recorded rather than fixed here.

   **The obvious fix — adding U+003B to `TERMINAL` — was researched and is REFUSED.** This is a
   settled decision, not an open question, and it is recorded here so it is not reopened:

   - **It would be a regression in Russian.** The abbreviated two-dot form is tied to two named
     marks, not to a class of "terminal punctuation". Лопатин, «Правила русской орфографии и
     пунктуации. Полный академический справочник» §154: «При сочетании вопросительного или
     восклицательного знака с многоточием знаки эти ставятся на месте первой точки» — and
     §§155–158, which cover every other combination, never mention the semicolon. Розенталь
     §68.1 says the same. So `текст;...` must stay `текст;…` in Russian, and putting U+003B in
     `TERMINAL` would invent a rule that no Russian authority states.
   - **No Greek source asks for it either.** The Ministry of Education grammar and the Κέντρο
     Ελληνικής Γλώσσας materials describe αποσιωπητικά without giving any rule for their
     interaction with the ερωτηματικό, and Greek has no counterpart to the Russian
     dot-absorption convention at all. «πάντοτε τρεις» is stated against runs of four and five
     dots, not against a neighbouring mark.
   - So the change is **unsupported on both sides**: it would break the one locale with a cited
     rule in order to serve a locale whose sources are silent.

   What remains is the two-dot input `Πράγματι;..`, which no authority addresses in either
   language. It round-trips unchanged, which is the correct behaviour for an unspecified case.
   The correctly-written three-dot form `Πράγματι;...` already converts to U+2026, because a
   three-dot run needs no help from `TERMINAL`.
9. **A verified Greek source contradicts §3.4, and the divergence is deliberate.** The EU
   Interinstitutional Style Guide (Greek edition) §10.1.9 ii) states «Μεταξύ των αποσιωπητικών
   και της λέξης που προηγείται δεν αφήνουμε διάστημα» — *no space is left between the ellipsis
   and the word before it*. §3.4 removes U+2026 from `STRIP-BEFORE` and preserves a space before
   a dot run **in every locale**, so `Πράγματι …` is returned as typed. The rule and the source
   disagree, the source was read and verified, and this entry exists so that the disagreement is
   recorded rather than unremarked.

   **The divergence stands, and the space is preserved.** Three reasons, in the order that
   decided it:

   - **Honouring it requires a rule that deletes on locale data, and this rule has none.**
     `order.json` gives `spaces` `"localeData": []`; §2 states that its behaviour is identical in
     every locale, which is not decoration but the reason it can be reasoned about at all. The
     alternatives are to give `spaces` locale data — an `order.json` change, and the end of a
     property the whole document relies on — or to make `ellipsis` delete the preceding space,
     which turns a rule that only ever replaces into a rule that deletes, and thereby drags in
     `modes.md` §3.3's edge-test clause, `I₂`, and a fresh CO discharge. Neither is a small change,
     and neither is justified by one locale.
   - **The instruction is about setting text, not about repairing it.** The guide tells a Greek
     typist not to leave a space there. It does not ask a tool to remove one the writer left. That
     distinction is the same one §3.5 part 2 draws for the ερωτηματικό, and it is the reason this
     document is comfortable saying "no source contradicts it" there and must not say "a source
     requires it" here.
   - **The divergence is conservative in the direction the M4 gate cares about.** Preserving
     costs a missed correction on Greek text containing a typo; honouring it would mean deleting
     a character the author typed, in one locale only, through machinery no other locale exercises.
     `dashes` §3.2 step 2a was just narrowed on exactly that principle after 1063 lines of the
     author's corpus were rewritten against his intent.

   **What would change the answer:** a second locale wanting the same behaviour. One locale does
   not pay for a schema field, a deleting `ellipsis`, and a new composition argument; two might,
   and at that point the right shape is `ellipsis.noSpaceBefore` consumed by `ellipsis` — which
   already reads locale data — rather than anything in this rule. Recorded in `ellipsis.md` §7 and
   in `spec/locales/el.json`'s `ellipsis` note, so that all three say the same thing.
