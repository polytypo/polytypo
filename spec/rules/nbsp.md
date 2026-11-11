# Rule: `nbsp`

**Order:** 70 (last). **Default:** on. **Modes:** text, html, markdown, yaml.
**Spec version:** 1.22.0 (0.1.0 for everything except §3.9's `initialBinding` change (0.6.0),
§3.3's span-boundary paragraphs (1.2.0), §3.3's character-reference guard (1.3.0), §5's `I₆`
discharge against `apostrophe`'s `CLOSEDELIM` (1.5.0) and N5's `spacedUnits` / `closedUnits`
insertion and deletion with guards G-U and G-R (§3.7, 1.22.0), noted inline).

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
- `nbsp.beforeUnits` — array of units that bind to a preceding number when the author typed a space
  (conversion only)
- `nbsp.spacedUnits` — array of units a locale writes with a space after the number (spec 1.22.0):
  an existing space is bound, a missing one is inserted
- `nbsp.closedUnits` — array of units a locale writes closed up to the number (spec 1.22.0): a
  space between the number and the unit is deleted
- `nbsp.beforeNumber` — array of abbreviations that bind to a following **number**
- `nbsp.beforeWord` — array of abbreviations that bind to a following **word**
- `nbsp.afterSymbols` — array of symbols that bind to a following number
- `nbsp.initialBinding` — enum: `"none" | "chain" | "single"` (spec 0.6.0; replaces the boolean
  `bindInitials`). See §3.9.
- `quotes.primary.open`, `quotes.primary.close`, `quotes.primary.innerSpace`
- `quotes.secondary.open`, `quotes.secondary.close`, `quotes.secondary.innerSpace`

**Constraint Q-P (`quotes.md` §2.1), normative on this rule's own data.** Every code point in
`nbsp.beforePunctuation` and `nbsp.narrowBeforePunctuation` must be a member of `quotes`'
`CLOSEISH` (`quotes.md` §3.1). This is what makes `quotes`' Lemma B cover N1/N2 as well as N8:
Lemma B's case 3 needs `m ∈ CLOSEISH` to know that a mark whose `closeRight` moves from `m` to a
`SPACELIKE` insertion is accepted either way. The shipped lists (`:`, `;`, `!`, `?` in
`fr`/`fr-CA`, empty elsewhere) satisfy it; `pipeline-idempotency.md` §7 item 4's schema gap is
closed by `locale.schema.json`'s `nbspClosePunctuation` check. A locale adding a new
`beforePunctuation`/`narrowBeforePunctuation` entry outside `CLOSEISH` reopens Lemma B and needs
a `quotes.md` §5 re-derivation, not just a data change.

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
  `abbreviations` lists strings and N4 converts their internal spaces. `initialBinding` (spec
  0.6.0; the enum that replaced the boolean `bindInitials`) is still mechanism, not a code-point
  claim — no typographic authority names U+00A0 by code point for it, and this document still
  owns exactly what C1/C2 do — but the enum is more citable than the boolean it replaced: Chicago
  states "two or more initials" (`"chain"`, en-US/de-DE/de-CH/ru) and André states a single
  abbreviated first name (`"single"`, fr/fr-CA) as two *distinguishable* claims a locale file can
  now actually choose between, where the boolean could only say on or off. `"none"` remains the
  uncitable negative it always was.
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

**The inline span boundary marker is in `CLOSEISH` and not in `OPENISH` (spec 1.2.0).** In `html`
and `markdown` mode the pipeline runs over spans joined by a −1 marker ([modes.md](modes.md) §3.2).
For this rule the marker is a member of `CLOSEISH` only; [modes.md](modes.md) §3.3 records the
split and §3.3 steps 2 and 3 below give the reason for each half. The −2 line marker is a member of
`BREAK`, as it is for every rule.

**`NOBREAK` is a member of `SPACELIKE`.** Every word/number/token boundary test in this rule
uses `SPACELIKE`, never `SP`. This single decision is what makes the rule idempotent: after a
conversion the boundary that justified it still reads as a boundary.

### 3.1a The narrow target, and the `narrowNbsp` option (spec 1.3.0)

**This rule is the only thing in the spec that emits U+202F**, through exactly two sub-rules: N2
(§3.4), always, and N8 (§3.10), when the pair's `innerSpace` is `"narrow-nbsp"`. **No shipped
locale sets `"narrow-nbsp"`** — `fr`, the only locale with a non-empty `narrowBeforePunctuation`,
sets its primary pair to `"nbsp"` — so today the option's whole visible effect is N2's. The N8
clause is written anyway, because the two must move together the day a locale does set it, and a
substitution that covered one emitter and not the other would be a defect nobody could see until
that locale landed. `quotes` places
the glyphs and leaves the inner space to N8 (quotes.md §5); no other rule writes a no-break space
of any width.

That makes one substitution expressible without touching anything else:

> **`NARROW-TARGET`** is U+202F, **unless** the caller passed `narrowNbsp: "nbsp"`, in which case
> it is U+00A0.

**N2 and N8 read `NARROW-TARGET` everywhere they name U+202F** — the state their "already
correct" branch recognises, the code point they convert a space to, and the code point they
insert. Nothing else in this document changes.

**Why a caller would ask.** U+202F is missing from many common text faces (Manrope and EB
Garamond among them), so a browser falls back to another face for that one character and the
advance width changes mid-line; a PDF renderer with no fallback drops the glyph entirely. That
is a **rendering** fact about the reader's fonts, not a typographic one about the language, which
is why it is a caller option and not locale data: `fr` still sets a narrow space before `?`, and
the locale file still says so.

**Why it rewrites the target rather than post-processing the output.** A caller can already write
`transform(...).replaceAll("\u202f", "\u00a0")`, and that is stable **only as long as it always
runs**: feed its output back through `transform` and N2 sees U+00A0 where its target is U+202F,
converts it back, and the two steps disagree for ever. Rewriting the target makes the result a
fixed point by construction — §5's argument is stated per sub-rule **target**, so substituting the
target carries it over verbatim, with no new case to check.

**Validation, and where it happens.** `narrowNbsp` is `"narrow"` or `"nbsp"`; absent means
`"narrow"`. Any other value raises `POLYTYPO_INVALID_OPTION` (`ARCHITECTURE.md` §4.6, new in spec
1.3.0 and general to every option added from 1.3.0 onward). It is checked **immediately after
`mode` and before `rules`**, so the full order is `mode` → `narrowNbsp` → `rules` → `locale` →
`dialect`: the two checks that read nothing but the call itself come first, then rule ids, then
locale data, then the dialect and the parse. The existing pairs are untouched — an unknown rule
still wins over an unknown locale — and this order is public, tested behaviour like the rest.

The check belongs to the **call**, not to this rule: it runs whether or not `nbsp` is enabled, so
`rules: { nbsp: false }` with a misspelled `narrowNbsp` still raises rather than silently
accepting a value that would have mattered.

**Conformance.** `spec/fixtures/*.json` carries the option as a case-level `narrowNbsp` field,
passed through to `transform` exactly as `rules` is; omitting it means `"narrow"`, so every case
written before spec 1.3.0 keeps its meaning. Note what a fixture **cannot** express: the schema's
own enum admits only the two valid values, so `POLYTYPO_INVALID_OPTION` has no fixture, the same
way a missing or misspelled `dialect` has none — a fixture with `mode: "markdown"` is required to
name a valid dialect. Option-validation errors are each runtime's own test, and the order in the
paragraph above is what those tests assert.

**What it does not do.**

- It does not change **which** positions take a no-break space. That is locale data (§2) and is
  untouched: the same indices are claimed, by the same sub-rules, under the same guards.
- It does not change what the rule **reads**. U+202F stays in `NOBREAK` and `SPACELIKE` (§3.1),
  so every guard still treats an authored narrow space as the no-break space it is. The one
  visible consequence is that an authored U+202F at an index N2 or N8 claims is now converted to
  U+00A0, because the rule normalises a claimed index to its target and the target has moved —
  the same normalisation N2 already performs on an authored U+00A0 in the default configuration.
  An authored U+202F anywhere else is left alone (§4).
- It does not touch **U+2011**, which `hyphen` (order 35) emits. Binding a hyphen is that rule's
  entire job, so `rules: { hyphen: false }` already asks for exactly this and no new option is
  warranted.
- It does not touch **U+2060**, which `ranges` (order 25) emits when it binds a tight range
  (ranges.md §3.3.1). `ranges` is off by default, so a caller who has not enabled it never sees
  one; a caller who has can turn it off again. See §7.8.

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
braces rather than a real tie-break. `initialBinding` (N7, spec 0.6.0) precedes both because an initial is a
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

   **A span boundary marker after the mark is accepted (spec 1.2.0)**, because the marker is in
   `CLOSEISH` (§3.1). This is what makes the `spaces` round trip (`spaces.md` §1) work when an
   inline element closes or a `<br>` follows the mark. `spaces` deletes the U+0020 in
   `<strong>Résistant au gel :</strong> il` and `Et la réglementation ?<br>Oui`, because in both
   the run has content on each side and `right` is in `STRIP-BEFORE`. This sub-rule must then put
   the no-break form back. Before 1.2.0 every runtime left the marker out of `CLOSEISH`, this
   guard refused, and the author's space was lost for good: `gel:</strong>`, `réglementation?<br>`.
   The insertion is at the mark's own index, inside the span, so the edge-growth rule
   ([modes.md](modes.md) §3.4) does not discard it. When the mark is alone in its span
   (`mot<em>!</em>`) the insertion point is the span edge and is still discarded, as before.

   The cost is stated here so it is not rediscovered as a bug. The guard cannot see past the
   marker, so a colon that ends one span while a digit or a `/` starts the next is accepted as
   sentence punctuation: `fr` `12:<b>30</b>` becomes `12⍽:<b>30</b>`. That needs a time, a URL
   or a ratio split by markup exactly at the colon. The shape this repairs, `**Label :**` and
   `<strong>Label :</strong>`, is the standard French definition-list and FAQ pattern, and the
   failure it repairs deletes a character.

3. **Quote-glyph guard.** If `cp[i-1]` is in `SPACELIKE` and `cp[i-2]` is in `OPENISH`, or if
   `cp[i-1]` is in `OPENISH`, **skip**. The space immediately after an opening quotation glyph
   belongs to `quotes.innerSpace` and is owned by N8; two sub-rules must not both have an
   opinion about it. Without this guard N2 and N8 alternate for ever on the French input `«?`
   — see §3.10.1, which is the defect this guard repairs.

   **A span boundary marker never triggers this guard**, because it is not in this rule's
   `OPENISH` (§3.1). N8 matches the literal `P.open` glyph, so it never owns the space beside a
   marker, and nothing is left for the guard to protect. Counting the marker as `OPENISH` would
   make this guard decline ordinary French prose that follows an inline element or a link:
   `Il dit <em>non</em> ! Oui` would keep a plain U+0020 before `!`, and the Markdown
   `Voir [ceci](http://x.org) : oui` a plain U+0020 before `:`. The same membership would also
   widen the left-boundary tests of N3, N7, N9 and N10, and N3's following-token guard, at span
   edges. Spec 1.2.0 does not make that change (§7 item 12).
4. **Character-reference guard (spec 1.3.0).** If `cp[i]` is U+003B, and the code points to its
   left have the shape of a character reference, **skip**. Concretely: let `j = i-1` and walk
   left while `cp[j]` is an ASCII letter or an ASCII digit, giving a run of `len` code points;
   if `len` is at least 1 and at most 32, and `cp[j]` is U+0023, decrement `j` once more; then
   if `cp[j]` is U+0026, this `;` terminates a reference and the sub-rule emits nothing.

   The reason is that in `text` mode there is no markup concept at all (`modes.md` §3.1), so a
   French locale, whose `narrowBeforePunctuation` contains `;`, inserted U+202F before the `;`
   that **ends** the reference: `Bonjour&#160;: oui` became `Bonjour&#160·: oui` and
   `Tom &amp; Jerry` became `Tom &amp· Jerry`. The input stopped being what it was — this is the
   one case found where a rule corrupts the input's own syntax rather than merely typesetting
   something it should not have. In `html` mode the same strings were already safe, because
   §3.6 makes a well-formed reference opaque; the guard makes `text` mode stop destroying them
   too, which is the mode people reach for when they have "just a string".

   The test is the **shape** of a reference, not membership of the HTML named-reference table.
   That table is thousands of entries and would have to be identical in five runtimes, for no
   gain: the guard's job is to decline, and declining on `&notaname;` costs nothing. The bound
   of 32 code points is the length of the longest named reference (31) plus one, and it keeps
   the left walk bounded rather than open-ended.

   Accepted cost, pinned: a French semicolon that directly follows a token containing `&` with
   no space, `R&D;`, keeps a plain U+0020 or no space at all rather than gaining U+202F. Such a
   token is not French prose, and the alternative is breaking every character reference in the
   language's own documents.
5. Let `left = cp[i-1]` or `NONE`.
   - If `left` is `NBSP` → **already correct**, emit nothing.
   - If `left` is `SP` or `NNBSP` → emit an edit replacing `cp[i-1]` with U+00A0.
   - If `left` is in `OTHER-SPACE` → **skip**. A thin or figure space was placed deliberately;
     §4 promises it is left alone, and treating it as content would insert a _second_ space
     beside it.
   - If `left` is `NONE`, in `BREAK`, or U+0009 → skip. A line must not begin with a no-break
     space.
   - Otherwise (`left` is a content character) → emit an edit **inserting** U+00A0 at
     index `i`.

### 3.4 N2 — `narrowBeforePunctuation` (`NARROW-TARGET`)

Identical to N1 with `NARROW-TARGET` (§3.1a — U+202F unless the caller substituted it) in place
of U+00A0: already-correct means `left` **is** `NARROW-TARGET`; a `SP`, or a `NOBREAK` member
that is not `NARROW-TARGET`, is converted to it; a content character causes an insertion of it.
In the default configuration that reads exactly as it always has — already-correct is `NNBSP`,
and `SP` or `NBSP` converts to U+202F. The
quote-glyph guard, the `OTHER-SPACE` guard and the character-reference guard apply unchanged —
the last one matters most here, since `;` is in `narrowBeforePunctuation` for `fr` and nowhere in
`beforePunctuation` for any shipped locale, so N2 is the sub-rule that was destroying references.

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

### 3.7 N5 — units (`beforeUnits`, `spacedUnits`, `closedUnits`)

Three lists, one sub-rule, one scan. `beforeUnits` converts, `spacedUnits` converts and inserts,
`closedUnits` deletes. An entry is in **at most one** of the three lists, and in neither
`spacedUnits` nor `closedUnits` if it is in `afterSymbols`; `scripts/validate-spec.mjs` enforces
both. `fi`'s `§` stays in `beforeUnits` and `afterSymbols`, where the two are disjoint by their
own left and right tests (§3.8).

For each index `a` where an entry `u` of `k` code points from any of the three lists matches
`cp[a … a+k-1]` exactly (code-point equality; no case leniency — `Kg` is not `kg`):

1. **Longest match wins at `a`, across all three lists, with no backtracking** (§3.5). A locale
   listing `km` in one list and `km/h` in another binds `5 km/h` as the longer entry and never
   falls back to `km` when the longer match is rejected.
2. **Right boundary.** `cp[a+k]` must not be in `ALNUM`. This is what stops the unit `kg` from
   matching inside `kgf`, and `m` from matching inside `metres`.
3. **The separator and the number.** Exactly one of two shapes must hold, otherwise the
   sub-rule does nothing:
   - **Spaced:** `cp[a-1]` is `SP` or `NBSP` (for `closedUnits` also `NNBSP`), `cp[a-2]` is in
     `DIGIT`, and with `Lrun` the maximal `DIGIT` run ending at `a-2` and starting at `b`,
     `cp[b-1]` is not in `LETTER` (so `H2 O` does not bind).
   - **Touching:** `cp[a-1]` is in `DIGIT`, and with `Lrun` the maximal `DIGIT` run ending at
     `a-1` and starting at `b`, `cp[b-1]` is not in `LETTER`.
4. **Action**, by the list the matched entry belongs to:

   | List            | Spaced                                  | Touching       |
   | --------------- | --------------------------------------- | -------------- |
   | `beforeUnits`   | `SP` → U+00A0; `NBSP` already correct   | nothing        |
   | `spacedUnits`   | `SP` → U+00A0; `NBSP` already correct\* | insert U+00A0 before the unit |
   | `closedUnits`   | delete the separator                    | already correct |

   \* `NNBSP` in `cp[a-1]` is not converted and not deleted by `spacedUnits`: an authored U+202F
   is the right kind of space and the rule leaves it.

5. **Guards for insertion and deletion (G-U).** Converting an existing space (`beforeUnits`,
   and `spacedUnits` when a space is already there) follows steps 1-3 and nothing below applies
   to it. Inserting for `spacedUnits` and deleting for `closedUnits` happen only if all of these
   hold, otherwise the sub-rule does nothing for this match:
   1. **Number start.** From `b`, while `cp[b-1]` is U+002C or U+002E and `cp[b-2]` is in
      `DIGIT`, move `b` to the start of the `DIGIT` run ending at `b-2` (a decimal or thousands
      separator belongs to the number). Then `cp[b-1]` must be `NONE`, in `SPACELIKE`, in
      `OPENISH`, in `SENTENCE-DASH`, or one of U+002B, U+00B1, U+00D7, U+2212, U+007E,
      U+2248, U+003C, U+003E, U+2060 (the joiner `ranges` writes beside a dash); or U+002D when `cp[b-2]` is `NONE`, `SPACELIKE` or `OPENISH` (a sign, not a hyphen
      joining `file-5kg`). This is what keeps `v2-5kg.png`, `/5km`, `?q=5kg`, `x_5kg` and `A4 km`
      out of the rule, and it refuses at a span boundary marker (§3.1: the marker is in
      `CLOSEISH`, not in the list above).
   2. **Right context.** `cp[a+k]` is not U+002D, U+2011 or U+005F; and not U+002E followed by a
      member of `ALNUM`. A hyphen after the unit marks a compound (`0,5‰-Grenze`, `15cm-norm`,
      `5-%-Klausel`) in which the author's spacing is the norm, and `5kg.png` is a file name.
   3. **Dash adjacency (G-R), for a unit whose first code point is in `CLOSED-SYMBOL`**
      (`ranges.md` §3.2a: `%`, `‰`, `°`, `$` and the other currency signs). Let `b` be the number
      start of step 5.1 and `e = a+k`. Skip a single run, in any mixture, of `SPACELIKE` code points that are not in `BREAK` and of
      U+2060 (the walk stops at a span boundary marker, which is in `BREAK`), leftwards from `b-1` and rightwards from `e`; if the first code point reached on
      either side is in `DASH` ∪ `INERT-DASH` (`dashes.md` §3.1), do nothing. Whether a symbol is
      closed up to its number is what `ranges` and `dashes` read to decide that `15% - 20%` is a
      range; inserting or deleting the space after both rules have run would hand the next pass a
      different verdict (`15 % - 20 %` → `15%—20%`, which the next pass makes `15%⁠–⁠20%`). A
      unit that is not a closed-up symbol is not read that way and is not subject to this guard.
   4. **Modulo guard (`closedUnits` only).** `cp[a+k]` is not the single code point U+0020
      followed by a member of `DIGIT`: `10 % 3` is an operation, and deleting the space would
      change it. Only U+0020 counts (not U+00A0 or U+202F), which is the reading §5 proves against: no
      other sub-rule converts the space after a `closedUnits` entry (U4 below), so a U+0020 read here
      on the first run is still a U+0020 on the second.
   5. **Multiplication guard (`spacedUnits` insertion only).** Let `b` be the number start of
      step 5.1. Read leftwards from `b-1`: at most one code point of `SPACE` ∪ `NOBREAK-SPACE`,
      then one `MUL-LETTER` (`symbols.md` §3.1), then at most one code point of `SPACE` ∪
      `NOBREAK-SPACE`, then a code point in `DIGIT`. If the whole shape is present, do nothing:
      the number is the right operand of a multiplication chain, and `symbols` declines to
      convert that chain while a letter follows it (guard M3). Inserting U+00A0 would end the
      chain with a non-letter and hand the next pass a chain it now converts (`2 x 3kg` →
      `2 x 3⍽kg` → `2 × 3⍽kg`). A `closedUnits` entry never begins with a letter (U3 below), so deletion
      cannot move M3's verdict and is not subject to this guard; nor can the insertion form a
      chain link of its own, because no `spacedUnits` entry begins with a `MUL-LETTER` (U2).
6. Emit the edit of step 4: a replacement of `cp[a-1]` with U+00A0, the deletion of `cp[a-1]`
   (an edit with an empty replacement), or an insertion of U+00A0 at index `a`.

**Why the three lists differ in what they may do.** A locale file attests *membership* — which
tokens are units and how the locale's sources write them (§2.1). It cannot say how a source's
silence should be read, so it does not get to: a unit whose sources leave the spacing to the
author, or make it depend on grammar (Czech writes `14 %` for a noun and `20%ní` for an
adjective), stays in `beforeUnits` and the engine keeps the author's choice. Insertion and
deletion are a content change, so each is allowed only for a unit with a national source that
states the form, and a locale that is listed in `closedUnits` or `spacedUnits` is making that
claim in its `sources`. Where the sources permit both forms the locale chooses `closedUnits`, so
that one author's text looks the same throughout (operator decision, 2026-11-11).

Bare `°` is in no list in any locale: written closed for an angle or a latitude, and with an
unnamed scale ambiguous. Only `°C` and `°F` are units. Single-letter symbols (`m`, `g`, `s`, `h`)
are listed in no `spacedUnits` or `closedUnits` for the same reason as before: they cannot be told
from ordinary text (`1970s`, `£2m`, `18h30`).

**Data properties the argument of §5 relies on.** They are properties of the entries, not of the
algorithm, and §5 is only as good as they are. `scripts/validate-spec.mjs` enforces U1-U4.

- **U1** No entry of the three lists begins or ends with a quotation glyph the locale declares.
- **U2** No entry of the three lists begins with a member of `SPACELIKE`, `CLOSEISH`
  (`beforePunctuation` and `narrowBeforePunctuation` are subsets of it, `quotes.md` §2.1 Q-P) or
  `DASH` ∪ `INERT-DASH` (`dashes.md` §3.1), or with U+0022, U+0027, U+002C, U+002E, U+002F or
  U+2026, or contains U+002D or U+2011. No `spacedUnits` entry begins with a `MUL-LETTER`
  (`symbols.md` §3.1).
- **U3** No `closedUnits` entry begins with a `LETTER` or contains U+002E.
- **U4** No entry of `afterShortWords`, `abbreviations`, `beforeNumber`, `beforeWord` or
  `afterSymbols` ends with a `DIGIT` or with the last code point of a `closedUnits` entry, and no
  `abbreviations` entry has a `DIGIT` immediately before an internal space. So no sub-rule other
  than N5 can claim the separator between a number and a `closedUnits` entry, or convert the space
  after one.

### 3.8 N6 — `afterSymbols` (U+00A0, conversion only)

For each entry `y` in `nbsp.afterSymbols`, of `k` code points:

1. Find each index `a` where `cp[a … a+k-1]` matches `y` exactly.
2. **Left boundary.** `cp[a-1]` must not be in `ALNUM`.
3. **Right side.** `cp[a+k]` must be `SP` or `NBSP`. If `NBSP`, emit nothing. If there is no
   space, do nothing (never insert).
4. `cp[a+k+1]` must be in `DIGIT`.
5. Emit an edit replacing `cp[a+k]` with U+00A0.

### 3.9 N7 — `initialBinding` (U+00A0), only when `nbsp.initialBinding` is not `"none"` (spec 0.6.0)

Define an **initial** at index `p` as: `cp[p]` in `UPPER`, `cp[p+1]` = U+002E (.), and
`cp[p-1]` either `NONE`, in `SPACELIKE`, or in `OPENISH`. (One letter, one full stop, at a
token start.)

Two clauses, both operating on a single space at index `q`:

- **C1 — initial on the left.** If `cp[q]` is `SP` or `NBSP`, and there is an initial ending
  at `q-1` (i.e. `cp[q-1]` = U+002E and `cp[q-2]` is an initial's letter satisfying the
  definition above), and `cp[q+1]` is in `UPPER`, **and the mode condition below holds**, then
  bind: if `cp[q]` is `NBSP` emit nothing, else emit an edit replacing `cp[q]` with U+00A0.

  **Mode condition (spec 0.6.0).** Split `cp[q+1]`'s role into two shapes:
  - **Between-initials** — `cp[q+1]` is *itself* an initial (i.e. `q+1` also satisfies the
    `initial` definition above: `cp[q+1]` in `UPPER`, `cp[q+2]` = U+002E). This shape always
    binds, in every mode except `"none"` — it is unambiguous by construction: two adjacent
    initial-shaped tokens are Chicago's own literal case ("between two or more initials").
  - **Initial-to-word** — `cp[q+1]` is `UPPER` but not itself an initial (no U+002E follows at
    `q+2`), i.e. the space leads into a candidate surname or ordinary word. This shape's
    eligibility depends on `nbsp.initialBinding`:
    - `"single"` — binds unconditionally, the historical shape (this is what `fr`/`fr-CA` need
      for `N. Bourbaki`/`M. Dupont` — André §5.1.3, cited below).
    - `"chain"` — binds **only if** the initial ending at `q-1` (letter at `p = q-2`) is itself
      immediately preceded by another initial: `cp[p-1]` is `SP` or `NBSP`, `cp[p-2]` = U+002E,
      and `p-3` satisfies the `initial` definition. In other words: bind the space leading out
      of a chain into a following word only once the chain already has two or more members —
      Chicago's own "two or more initials" wording, applied to this shape specifically rather
      than to N7 as a whole. `E. B. White`: the space before `White` binds, because `B.` is
      itself preceded by `E.`. A lone `A. Smith`, or `...take the top N. It runs...`, does not:
      neither `A.` nor `N.` is preceded by another initial, so this shape declines. The declined
      case is a **deliberate false negative**, not a bug: this document has no way to tell a
      genuine single-initial name from an ordinary sentence boundary using only local structure
      (§7.9a), and `"chain"` resolves that ambiguity by declining rather than guessing, on the
      same footing P4 in `dashes.md` §3.4 declines rather than guessing at a range.
    - `"none"` — N7 does not run at all (checked once, before either clause).

  This covers both spaces of `А. С. Пушкин` under `"chain"` (`ru`): the first is
  between-initials (`cp[q+1]` is `С`, itself an initial), the second is initial-to-word but
  eligible because `С.` is preceded by `А.`.

  **Guard C1-a — lower-case abbreviation tail.** C1 does **not** fire (in any mode, on either
  shape) if, letting `p = q-2` be the initial's letter, `cp[p-1]` is in `SPACELIKE`, `cp[p-2]`
  is U+002E, and `cp[p-3]` is in `LETTER` but **not** in `UPPER`. In other words: an uppercase
  letter plus a dot that is itself preceded by a _lower-case_ letter plus a dot is the second
  token of an abbreviation, not an initial.

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
  same way, **in every mode except `"none"`** — C2 already requires two initials by
  construction (Chicago's own "two or more"), so it needs no mode split.
  This covers `Пушкин А. С.` — the surname-first order — without binding every
  `word` + `Capital letter + period` pair, which would fire on ordinary sentences.

C2 binds only the space before the initials group; the space _inside_ the group is bound by
C1 (its `cp[q+1]` is the second initial's letter, which is `UPPER`).

### 3.10 N8 — `quotes.innerSpace`

For each of the two quote pairs `P` ∈ {`quotes.primary`, `quotes.secondary`} with
`P.innerSpace ≠ "none"`, let `target` be U+00A0 if `P.innerSpace = "nbsp"` and `NARROW-TARGET`
(§3.1a — U+202F unless the caller substituted it) if `P.innerSpace = "narrow-nbsp"`.

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

**Never inserts.** `Nr.5` stays `Nr.5`, for the same reason N6 never inserts: adding a space
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
5. **Initial-collision guard (G-D).** If `nbsp.initialBinding` is not `"none"`, **and** `s` is
   exactly two code points, **and** the first is in `UPPER`, **and** the second is U+002E, skip.
   An _uppercase_ letter plus a dot is structurally indistinguishable from an initial, and in a
   locale where N7 is active, N7 owns that shape with better evidence (it inspects what follows
   for a second initial or a surname). G-D's own condition does not distinguish `"chain"` from
   `"single"` — it only asks whether N7 is active at all — because G-D's job is routing (which
   sub-rule owns this shape), not deciding whether the space actually ends up bound; that
   decision is C1's alone (§3.9), and under `"chain"` a routed-to-N7 space can still end up
   declined if no chain is confirmed.

   All three conditions matter:
   - **`UPPER`** — without it, a lower-case two-code-point entry such as `ул.` would be inert
     in an `initialBinding`-active locale, and `ул. Ленина` would not bind. A lower-case letter
     plus a dot is not a plausible initial in any orthography this spec covers, so the guard
     must not capture one. (An earlier revision justified this clause with `г. Москва`, which is
     **not** an example of it: `ru.json` does not list `г.` in `beforeWord` at all — see §6 row
     13a.)
   - **`initialBinding !== "none"`** — in a locale where N7 is switched off, nothing else claims
     the shape and there is no collision to avoid.
   - **exactly two code points** — `Mme`, `ул.`, `art.` are longer and are never initials.

   Consequence for French, stated plainly because an earlier revision of this document got the
   underlying fact wrong: **`fr` has `initialBinding: "single"`** (spec 0.6.0; cited to Jacques
   André §5.1.3 for `N. Bourbaki`). So a listed `M.` _is_ inert in N10, and `M. Dupont` binds
   through N7 clause C1 instead — which reaches the same U+00A0 by a different route, eligible
   under `"single"`'s unconditional initial-to-word shape (§3.9). The residual gap is that C1
   requires an `UPPER` code point after the space, so `M. dupont` with a lower-case surname does
   not bind at all. That is an acceptable miss; French surnames are capitalised.

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

Sub-rules N1, N2, N5 (through `spacedUnits`) and N8 can _insert_ a code point, and N5 (through `closedUnits`) can _delete_ one. Because rules produce edits and the
pipeline applies them (ARCHITECTURE.md §7.1), every index above refers to the **input**
array. An insertion is an edit with an empty replaced span at a given index. Two insertions
at the same index cannot occur: the first-claim-wins rule of §3.2 forbids it.

The claim key of an insertion is the index it is inserted at (the index of the code point it
goes before); the key of a conversion or a deletion is the index of the code point it replaces.
Both kinds of key share one index space, so an insertion at `a` and a conversion of `cp[a]` are
the **same** key and the first claim wins. For N5's touching insertion at `a`, `cp[a]` is the
first code point of a listed unit, and neither rival can arise: a conversion or deletion of
`cp[a]` needs `cp[a]` to be a space, an N1/N2 insertion at `a` needs it to be in
`beforePunctuation` ∪ `narrowBeforePunctuation` (a subset of `CLOSEISH`), and an N8 insertion
needs a quotation glyph beside it; U1 and U2 exclude all three. N5's conversion or deletion of
the separator `cp[a-1]` is keyed `a-1`, which another sub-rule can claim only for a
`beforeUnits` or `spacedUnits` entry (N1-N4 and N6-N10 convert, and first claim wins as for any
index); for a `closedUnits` entry U4 and U2 leave N5 the only claimant.

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
- **[P] A unit in `beforeUnits` with no space before it, and a unit in no list.** `5km` stays
  exactly as typed when `km` is in `beforeUnits` or in no list; N5 inserts only for `spacedUnits`
  and deletes only for `closedUnits` (§3.7 step 4).
- **[P] A unit inside a compound, a file name or an identifier.** `0,5‰-Grenze`, `15cm-norm`,
  `5kg.png`, `/5km`, `x_5kg` and `10 % 3` are left as typed by N5's guards G-U (§3.7 step 5).
- **[P] A number written as `H2O`, `A4`, `MP3`.** N5 step 3's letter guard.
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
| N2       | `NARROW-TARGET` immediately left of the mark          | §3.4                                       |
| N3       | `NBSP` after the short word                           | §3.5 step 3                                |
| N4       | `NBSP` at every internal position of the abbreviation | §3.6 step 1 (space-lenient match) + step 3 |
| N5       | `NBSP` before the unit (`beforeUnits`, `spacedUnits`); no separator (`closedUnits`) | §3.7 step 4 |
| N6       | `NBSP` after the symbol                               | §3.8 step 3                                |
| N7       | `NBSP` at the bound space                             | §3.9                                       |
| N8       | `target` beside the quote glyph                       | §3.10                                      |
| N9       | `NBSP` between the abbreviation and the number        | §3.11 step 3                               |
| N10      | `NBSP` between the abbreviation and the word          | §3.12 step 3                               |

So it suffices to show that on the second run **the same sub-rule claims the same index** —
i.e. that no guard's verdict flips because of an edit made on the first run.

Guards test three kinds of thing:

0. **The `narrowNbsp` substitution (§3.1a) needs no separate argument.** Every row of the table
   above names a sub-rule's **target**, not a literal code point, and N2's and N8's targets are
   the only ones the option moves. Substituting `NARROW-TARGET` therefore carries the whole
   argument over unchanged: the post-state each branch recognises moves with the character each
   branch writes, which is precisely what post-processing the output could not do (§3.1a). The
   substitution also cannot create a **new** conflict between two sub-rules, because it only ever
   makes N2's and N8's targets **equal to** N1's, never different from it, and no sub-rule's claim
   depends on what another sub-rule's target is — the quote-glyph guard (§3.3 step 3) decides
   ownership of the index beside a quotation glyph by position, whatever character either
   sub-rule would have written there.
1. **Membership in `SPACELIKE`.** Every conversion `SP → NBSP`, `SP → NNBSP`,
   `NNBSP → NBSP`, `NBSP → NNBSP` stays inside `SPACELIKE` (§3.1). Every insertion (N1, N2, N5
   through `spacedUnits`, N8) adds a `NOBREAK`, which is in `SPACELIKE`. So every boundary test
   that passed on run 1 passes on run 2, and every one that failed still fails — **provided**
   boundary tests do not tell `SP` from `NOBREAK`. Every guard above is written against
   `SPACELIKE`, `ALNUM`, `UPPER`, `DIGIT`, `OPENISH`, `CLOSEISH`, `BREAK` or `NONE`, none of
   which gains or loses a member under a `SP`/`NOBREAK` conversion, with **two deliberate
   exceptions**, each of which tests `SP` specifically: the choice between "convert" and "emit
   nothing" in every sub-rule (an `NBSP` is already correct), and N5 step 5.4 (the space after a
   closed unit must be U+0020). The first is the sub-rule's own post-state and is covered by the
   table above. The second holds because no other sub-rule converts the space after a
   `closedUnits` entry (U4) and N5 never edits it (the code point before it is the last code point
   of a unit, and a separator needs a `DIGIT` before it and a unit after it), so a U+0020 read
   there stays U+0020.
   **N5's deletion is the one edit that removes a `SPACELIKE` member**, and it is argued in the
   third length-changing case below.
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

Four specific cases need checking because they change lengths:

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
- **N5 insertion (`spacedUnits`).** Run 1 turns `5km` into `5` `NBSP` `km`. On run 2 the match is
  the same entry at the same index (longest match, right boundary and number start read only
  `ALNUM`, `DIGIT` and `LETTER`, which the insertion does not change), `cp[a-1]` is `NBSP`, and
  the table's action is "already correct" → no edit. The insertion creates no candidate for a
  lower sub-rule: it sits between a `DIGIT` and a unit's first code point, which is not a mark
  (U2, so not N1/N2), not a quotation glyph (U1, so not N8), and ends no short word,
  abbreviation or symbol a sub-rule matches (U4); N7 needs a U+002E (C1) or a `LETTER` (C2)
  before the space, not a `DIGIT`.
- **N5 deletion (`closedUnits`).** Run 1 turns `5 %` into `5%`. On run 2 the shape is touching,
  and for a `closedUnits` entry the touching action is "already correct" → no edit; the match is
  the same entry (the digit run and everything right of the gap are unchanged). A separator that
  run 1 **declined** to delete must still be declined: the guards of step 5 read (5.1) the code
  point before the number and its class, (5.2) the code point after the unit, (5.3) the first
  code point beyond a run of `SPACELIKE` and U+2060 on each side, (5.4) U+0020 and a `DIGIT` after
  the unit. The only edits of run 1 that can sit at those positions are conversions inside
  `SPACELIKE` (a skipped run stays a skipped run), N8's insertion of a `NOBREAK` right of an
  opening glyph (`OPENISH` and `SPACELIKE` are both accepted by 5.1, and 5.3 skips it), and N1/N2/
  N8 insertions before a closing mark or glyph (5.2 and 5.3 accept a closing mark and a `NOBREAK`
  alike); 5.4 is argued in class 1 above. No guard flips, so the same separator is declined again,
  and the sub-rules after N5 see the same `SP` or `NOBREAK` they saw on run 1 and decide as
  before. The same holds for an insertion that run 1
  declined: 5.5 reads only `SPACE` ∪ `NOBREAK-SPACE`, a `MUL-LETTER` and a `DIGIT`, accepts a
  space of either kind, and no run-1 edit changes a `MUL-LETTER` or a `DIGIT`. N5's deletion removes a `SPACELIKE` code point, so a test that read across the gap now
  reads its neighbours: the digit on the left and the unit's first code point on the right, which
  U2 and U3 make a non-space, non-letter, non-mark, non-dash code point. A sub-rule could anchor
  at that separator only as N1/N2 (a mark at `cp[a]`, excluded by U2), as N3, N4, N6, N9 or N10 (a
  match ending at the `DIGIT`, excluded by U4) or as N7 (excluded as above); N5's own test is
  the one argued here.

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
3. **N5 and N6 had to be conversion-only, until a locale could say which form it wants.** The
   naive version inserts a space before a unit, turning `5km` into `5 km` — a content change, not
   a typographic one — and, worse, in a locale listing `%` it turns `50%` into `50 %`, which is
   wrong in English and right in French. One list cannot express that, so N5 was restricted to
   conversion. Spec 1.22.0 adds the two lists that can (`spacedUnits`, `closedUnits`), and N5
   inserts or deletes only for an entry a locale has put there; `beforeUnits` and N6 stay
   conversion-only.
4. **The conflict policy had to be total and index-based.** "Whichever sub-rule runs first in
   the loop" is not a specification; it is a Go map iteration bug waiting to happen (§3.2).

---

### Composition obligation

Per [pipeline-idempotency.md](pipeline-idempotency.md) §5. This rule is **R₈** and runs last,
so nothing has to preserve _its_ invariant — but it must preserve all seven others, and it is
the rule with the largest emission surface in the pipeline. It is also the rule that committed
defect family 2.

**What this rule emits.** U+00A0 and U+202F only, either replacing a single space-like code
point in place or **inserted** at one of four kinds of site: before a listed punctuation
character (N1, N2), after an opening quote glyph, and before a closing quote glyph (N8), and
between a `DIGIT` and a `spacedUnits` entry (N5). It never emits U+0020, and never emits a letter,
digit, dot, dash or quotation mark. Its one removal is N5's deletion, for a `closedUnits` entry,
of the single separator (U+0020, U+00A0 or U+202F) between a `DIGIT` and the entry; nothing else
is ever deleted. Each obligation below therefore covers what is written (`E(nbsp)`) and, for the
deletion, what is no longer there. Every argument rests on the entry properties U1-U4 of §3.7.

**Against `I₁` (`spaces`).** Discharged, and this is why the rule never emits U+0020: U+00A0
and U+202F are `CONTENT` to `spaces`, which touches only U+0020. Converting a U+0020 to a
no-break space can only _remove_ a potential `spaces` edit, never create one. An insertion adds
a `CONTENT` code point, which cannot lengthen a U+0020 run or place a U+0020 in a stripping
position. N5's deletion removes a run of exactly one separator whose neighbours are a `DIGIT` and,
by U2, a code point outside `SPACELIKE`; so no other U+0020 run is adjacent to it, none is
lengthened, shortened or merged, and no U+0020 acquires a new left or right neighbour (S-a to S-d
read only the immediate neighbours of a run). The one longer read, the emoticon guard's walk
(`spaces.md` §3.6), steps only over `:` `;` `-` `^` and the mouth glyphs; the gap has a `DIGIT`
on its left, which is in none of those sets, so a walk that stopped at the separator now stops at
the digit.

**Against `I₂` (`ellipsis`).** Discharged: no `DOTLIKE` code point is emitted, and insertions
only push code points apart, never together. N5's deletion does close a gap, between a `DIGIT`
and the unit's first code point, and the closure is harmless because neither side can be
`DOTLIKE`: the left is a `DIGIT`, and the right is not U+002E or U+2026 (U2). No dot run is
joined, and no dot run acquires a new neighbour that is part of another one.

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

N5's deletion is the one operation of this rule that `E(nbsp)` does not describe, since it writes
nothing. It cannot touch a dash token's own spacing: the deleted separator has a `DIGIT` on its
left and a code point outside `DASH` ∪ `INERT-DASH` on its right (U2), so no dash run is adjacent
to it. What a verdict can read across it is `ranges`' `after` and T1's first and second
effective neighbour past a digit run, and the walk over a `CLOSED-SYMBOL`; those are covered, for
a unit that begins with a `CLOSED-SYMBOL`, by guard G-R of §3.7 step 5 (the insertion and the
deletion are both declined next to a dash), and, for every other unit, by the fact that those
reads test for a dash, U+002E, U+002C or U+002F and the unit's first code point is none of them
(U2). Under `"em-paired"` the separator is not a terminal and is not adjacent to one, so no
segment boundary moves (`dashes.md` §3.4a). See `pipeline-idempotency.md` §3, `I₂ₐ`.

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
could start matching that did not before. That would be an `I₄` violation. For N1, N2 and N8 it
is unreachable because every insertion site puts the new space next to a listed punctuation
character or a quote glyph, and a form whose neighbour is punctuation or a quote glyph was
already accepted.

N5's insertion is the case that does not fit that argument: it puts a no-break space between a
`DIGIT`, which is in `WORDISH`, and the first code point of a unit, which is usually a letter
(`5km`). A form that begins at that letter (a prefix or a compound; a suffix begins with a hyphen,
which U2 forbids as a unit's first code point; a form consists of letters and hyphens) was rejected on its left neighbour and would be
accepted after the insertion. It cannot be, because N5 inserts only if the unit is matched at the
same index and `cp[a+k]` is not in `ALNUM`. The form is made of letters and hyphens,
and the unit contains no hyphen (U2), so the unit either ends inside the form's first word
(`cp[a+k]` is then `ALNUM`, step 2 fails), or ends exactly at the form's first hyphen (`cp[a+k]`
is then U+002D, which step 5.2 declines), or extends past it, which would put a hyphen inside the
unit. N5's deletion cannot reach a form either: the code point it exposes on the right is not a
`LETTER` (U3) and a form begins with one. If a future sub-rule inserts between two letters, or a
future unit may contain a hyphen or begin with a letter after deletion, this obligation must be
re-derived.

**Against `I₅`, `I₆`, `I₇` (`quotes`, `apostrophe`, `symbols`).** Discharged by case analysis
over the neighbour tests; the `quotes` half is the one that matters and is written out in
`quotes.md` §5.6, which shows that neither insertion site can _add_ a capability to a surviving
straight mark. `apostrophe`'s case ladder reads `ALNUM`, `LETTER`, `DIGIT`, `SPACELIKE`,
`OPENISH`, `OPENQUOTE`, `CLOSEISH` and — from spec 1.5.0 — `CLOSEDELIM`; an inserted no-break
space is `SPACELIKE`, and the only cases it could newly satisfy require a `SPACELIKE` **left**
neighbour, which is case 4 (leading elision) — and case 4 also requires an `ALNUM` right
neighbour, which an insertion cannot create.

`CLOSEDELIM` (spec 1.5.0) needs its own line because this rule inserts *beside quote glyphs*, and
six of that class's seven members are closing brackets and closing quotation marks. Two facts
discharge it. First, U+00A0 and U+202F are in no `apostrophe` class but `SPACELIKE`, so an
insertion can only ever *remove* a `CLOSEDELIM` member from a neighbour position, never create
one — and case 2a is the only case reading that class, so removal can only decline. Second, the
one shape where the two rules are genuinely adjacent is an inner space beside a quotation glyph
(N1/N2): in `fr`, `«mot»'s` gains its U+00A0 on the glyph's **inner** side, giving `« mot »'s`,
so the `»` that case 2a reads stays immediately left of the mark and the verdict is identical
before and after. Pinned as a conformance fixture rather than left as prose. If a future
sub-rule inserts between a closing delimiter and a following mark, this paragraph must be
re-derived.

N5's insertion and deletion are no new case for `quotes` or `apostrophe`: neither side of the gap
is a quote mark or an apostrophe candidate (a `DIGIT`; and by U1 and U2 not a quotation glyph, not
U+0022 and not U+0027), and every read those rules make starts at such a mark and crosses
`INLINE-SPACE` outward from it, so none reaches the gap (`quotes.md` §5.6, Lemma B item 4).
`symbols` reads `ALNUM`, `DIGIT` and symmetric spacing; a no-break space is already accepted as
spacing there (`symbols.md` §3.3 step 1), and converting U+0020 to U+00A0 leaves `lsp`/`rsp` unchanged.
The chain scan of `symbols.md` §3.3 is the one place N5 can matter, and it matters in one
direction for each edit. A chain is `DIGIT+ (X DIGIT+)+`, declined by guard M3 when a `LETTER`
follows its last digit run. Insertion can lift that verdict: `2 x 3kg` is declined (`k` follows), and
`2 x 3⍽kg` would be converted on the next pass (a no-break space follows); this is the reason for
guard 5.5 of §3.7, which declines the insertion whenever the number is the right operand of a link
shape, symmetric or not (declining an insertion costs only a miss, so the guard does not repeat
M1). No other chain shape is affected: the inserted space follows the last digit run, so it never
lies inside a link, and U2 keeps a `spacedUnits` entry from beginning a link of its own. Deletion
cannot lift it: the code point that follows the digit run changes from a separator to the unit's
first code point, and neither is a `LETTER` (U3), so M3's verdict, and with it every chain
verdict, is the same on both runs.

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

### `fr` — `narrowBeforePunctuation: ["?","!",";"]`, `beforePunctuation: [":"]`, primary `« »` with `innerSpace: "nbsp"`

| #   | Input                               | Output                               | Why                                                                                                                                                             |
| --- | ----------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Bonjour!`                          | `Bonjour⍹!`                          | N2 insertion; the ordinary space, if any, was already removed by `spaces`                                                                                       |
| 2   | `Bonjour⍹!`                         | ⟶                                    | N2 "already correct" — this is the round-trip case                                                                                                              |
| 3   | `Il a dit «mot».`                   | `Il a dit «⍽mot⍽».`                  | N8 inserts on both inner edges. **U+00A0, not U+202F**: `fr.json` sets the primary pair's `innerSpace` to `"nbsp"` — corrected in spec 1.3.0, having claimed the narrow space since this table was written |
| 4   | `Il a dit «⍹mot⍹».`                 | `Il a dit «⍽mot⍽».`                  | and therefore **not** already correct: N8 converts an authored narrow space to its own target. The row claimed a fixed point on the same mistake                |
| 5   | `Voir http://example.org: la suite` | `Voir http://example.org⍽: la suite` | N1 guard 2 rejects the colon in `http://` (next code point is `/`) and accepts the sentence colon (next is a space)                                             |
| 6   | `Vraiment?!`                        | `Vraiment⍹?!`                        | N1/N2 guard 1: only the first mark takes a space                                                                                                                |
| 6a  | `Vraiment?…`                        | `Vraiment⍹?…`                        | U+2026 is accepted right context (§3.3 step 2). Previously the narrow space was omitted here but not in `Vraiment␣?`, purely because `ellipsis` had already run |
| 6b  | `Voir␣../docs`                      | ⟶                                    | the French instance of the `spaces` lone-dot defect; see `spaces.md` §3.4                                                                                       |
| 6c  | `<strong>gel␣:</strong>␣il` (`html`) | `<strong>gel⍽:</strong>␣il`         | **spec 1.2.0.** `spaces` deletes the U+0020; the mark's right neighbour is the span boundary marker, which is in `CLOSEISH`, so N1 inserts U+00A0 at the mark's index, inside the span. Previously produced `gel:</strong>` |
| 6d  | `réglementation␣?<br>Oui` (`html`)  | `réglementation⍹?<br>Oui`            | same, with N2. `<br>` leaves no line terminator in the gap, so the marker is −1, not −2                                                                         |
| 6e  | `<em>non</em>␣!␣Oui` (`html`)       | `<em>non</em>⍹!␣Oui`                 | `spaces` leaves the run alone (its `left` is a span edge), and N2 converts it. The marker two places left of the mark is not `OPENISH`, so step 3 does not decline |
| 6f  | `12:<b>30</b>` (`html`)             | `12⍽:<b>30</b>`                      | **the accepted cost of 6c** — step 2 cannot see past the marker                                                                                                 |

### `ru` — `afterShortWords: ["в","и","на",…]`, `abbreviations: ["т. д.","и т. п."]`, `initialBinding: "chain"`, `afterSymbols: ["№","§"]`

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
| 13i | `в␣<em>Москве</em>` (`html`) | ⟶                  | **spec 1.2.0.** N3's following-token guard asks for `ALNUM` or `OPENISH`, and for this rule the span boundary marker is in neither (§3.1). The space stays U+0020. Whether it should bind is §7 item 12                   |

### `de-DE` — `abbreviations: ["z. B.","d. h."]`, `spacedUnits: ["%","km","°C"]` (among others)

| #   | Input                   | Output                  | Why                                                                                                                                                                                                                                      |
| --- | ----------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 14  | `z.␣B.␣Berlin`          | `z.⍽B.␣Berlin`          | N4 binds the space inside the abbreviation. The space after `B.` is **not** bound: guard C1-a sees that the `B.` is preceded by the lower-case `z.` and declines. Previously produced `z.⍽B.⍽Berlin`, a false positive on ordinary prose |
| 15  | `z.⍽B. Berlin`          | ⟶                       | N4 space-lenient match, already correct                                                                                                                                                                                                  |
| 16  | `Es sind 20␣km bis 5␣%` | `Es sind 20⍽km bis 5⍽%` | N5 twice                                                                                                                                                                                                                                 |
| 17  | `Es sind 20km`          | `Es sind 20⍽km`         | N5 inserts for `spacedUnits` (de-DE lists `km` there)                                                                                                                                                                                                                  |
| 18  | `H2␣O ist kein Wert`    | ⟶                       | N5 step 3: `2` is preceded by the letter `H`                                                                                                                                                                                             |
| 19  | `siehe Nr.␣5 und S.␣12` | `siehe Nr.⍽5 und S.⍽12` | N9 twice                                                                                                                                                                                                                                 |
| 20  | `siehe nr.␣5`           | ⟶                       | N9 matches exactly; `nr.` is not `Nr.`                                                                                                                                                                                                   |
| 21  | `Bonjour&#160;:␣oui` (`fr`) | ⟶ | **spec 1.3.0.** N2's character-reference guard: the `;` closes `&#160;`, so no U+202F is inserted and the reference survives. Before 1.3.0 this produced `Bonjour&#160·:␣oui` |
| 22  | `Tom␣&amp;␣Jerry` (`fr`) | ⟶ | **spec 1.3.0.** Same guard on a named reference |
| 23  | `Oui␣;␣non` (`fr`)      | `Oui·;␣non` | The guard is not a blanket refusal of `;` — an ordinary semicolon still takes U+202F |

#### `narrowNbsp: "nbsp"` (§3.1a, spec 1.3.0)

Every row `fr`, and every row measured. `⍽` = U+00A0, `⍹` = U+202F.

| #   | Input                        | Default (`narrow`)                    | `narrowNbsp: "nbsp"`                  | Why                                                                                                                                  |
| --- | ---------------------------- | ------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 31  | `Un délai ?`                 | `Un délai⍹?`                          | `Un délai⍽?`                          | N2's target moves; the index it claims, and the guard that let it claim it, do not                                                    |
| 32  | `Oui⍹?`                      | ⟶                                     | `Oui⍽?`                               | an authored narrow space at a claimed index is normalised to the target, as an authored U+00A0 is in the default configuration        |
| 33  | `Il a dit : « oui » ; puis ?` | `Il a dit⍽: «⍽oui⍽»⍹; puis⍹?`        | `Il a dit⍽: «⍽oui⍽»⍽; puis⍽?`        | N1 (colon) and N8 (`fr`'s pair, `innerSpace: "nbsp"`) already wrote U+00A0 and do not move; only N2 does                             |
| 34  | `12:30 et http://x ; oui`    | `12:30 et http://x⍹; oui`             | `12:30 et http://x⍽; oui`             | the option changes what is written, never what is read: N1's right-context guard still protects the time and the URL                 |

### `fr` — `beforeWord: ["M.","Mme","Mlle"]`

| #   | Input                   | Output                  | Why                                                                                                                                                                                              |
| --- | ----------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 21  | `M.␣Dupont et Mme␣Hugo` | `M.⍽Dupont et Mme⍽Hugo` | `Mme` binds via N10 (three code points, G-D does not apply). `M.` is inert in N10 because `fr` has `initialBinding: "single"` and G-D fires — it binds via **N7 C1** instead, eligible under `"single"`'s unconditional initial-to-word shape, reaching the same U+00A0 |
| 22  | `M.␣dupont`             | ⟶                       | lower-case surname: N7 C1 needs `UPPER` after the space, and N10 is inert for `M.`. A documented gap, §7.10                                                                                      |
| 23  | `«?`                    | `«⍽?`                   | N1/N2 decline the index (quote-glyph guard, §3.3 step 3) and N8 owns it, inserting the `innerSpace` target. Previously this oscillated between U+00A0 and U+202F for ever — §3.10.1              |
| 24  | `«⍽?`                   | ⟶                       | the fixed point of case 23                                                                                                                                                                       |
| 25  | `mot␣?`                 | `mot⍹?`                 | the ordinary case: the code point before the space is a letter, so N2 applies normally                                                                                                           |

### `el` — `closedUnits: ["%","°C"]`, `initialBinding: "none"`, `quotes.innerSpace: "none"`

Greek is the locale where this rule does almost nothing, and the one that shows why an empty list
is a positive finding rather than an unfilled field. The Greek source denies the French
space-before-punctuation pattern **by name** («πράγμα που συμβαίνει, π.χ., στα γαλλικά»), so
`spaces` strips the space at order 10 and nothing here puts one back. That is a cited decision,
not a default. The only list that is not empty is `closedUnits`: the inter-institutional guide
permits both forms for a percentage and a temperature, the sources examined set them tight
(`kathimerini.gr`, `tovima.gr` and eleven other sites: 140 of 140 `%` and 41 of 41 `°C` closed),
and a locale that is offered both chooses the closed one (§3.7). N8 stays disabled by
`quotes.innerSpace: "none"`; a locale with empty lists but a non-`none` `innerSpace` would still
edit — `fr` case 23 is exactly that shape.

| #   | Input          | Output | Why                                                                                                                                                     |
| --- | -------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 26  | `Τι κάνεις;`   | ⟶      | `beforePunctuation` and `narrowBeforePunctuation` are empty, so N1/N2 have no member to match. Contrast `fr` case 25, where the same shape gains U+202F |
| 27  | `10,5␣%␣φέτος` | `10,5%␣φέτος` | `%` is in `closedUnits`: N5 deletes the space between the number and the sign. The space after the sign is not N5's and stays |
| 27a | `10,5%␣φέτος` | ⟶      | already closed                                                                                                                                          |
| 28  | `«καλημέρα»`   | ⟶      | `innerSpace: "none"`, so N8 inserts nothing. This is the half of the no-op claim that lives in the `quotes` object rather than the `nbsp` one           |

Cases 2, 6b, 8, 13, 13c, 13d, 13e, 13i, 15, 18, 20, 22, 24, 26, 27a and 28 are "no change"
cases. (Case 4 left that list in spec 1.3.0, when the row was corrected from a fixed point to a
conversion; the §3.1a rows are numbered 31-34 and are outside it.)

---

## 7. Open questions

1. **The schema does not enforce that `beforePunctuation` and `narrowBeforePunctuation` are
   disjoint**, nor that a character appears in only one of `beforeUnits` / `afterSymbols`.
   §2 requires an implementation to fail loudly; a `$defs`-level constraint or a CI check
   would be better. Reported.
2. **N6 never inserts a space** (`§ 7` is bound, `§7` is not). N5 inserts and deletes since spec
   1.22.0, per list (§3.7). Open: the units whose only support is BIPM or a paywalled standard
   (`it`, `es`, `ro`, `uk`, `pt-BR` `%`) sit in `beforeUnits`; moving one to `spacedUnits` or
   `closedUnits` needs a national source.
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
6. **`initialBinding` clause C2 requires two consecutive initials, in every mode.** `Пушкин А.`
   (one initial) is not bound. Restricting it this way avoids binding every `word` + `Capital.`
   pair, but it is a guess about Russian practice and needs checking against Мильчин.
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
9a. **N7's own sentence-boundary miss (spec 0.6.0) — resolved for `"chain"`, deliberately left
    open for `"single"`.** A fresh M4 dogfooding pass surfaced the C1 sibling of item 9's N10
    miss: `"...take the top N. It runs..."` bound `N.` to `It` across a sentence boundary,
    because the old boolean `bindInitials` let C1's initial-to-word shape fire on any lone
    initial next to any uppercase-starting word, with no check that a genuine name — as opposed
    to an ordinary sentence ending in a single capital letter — was actually present. `"chain"`
    closes this for en-US/de-DE/de-CH/ru by requiring a confirmed sequence of two or more
    initials before that shape binds (Chicago's own "two or more initials" wording, applied
    literally rather than only for turning N7 on at all) — see §3.9's mode condition.

    **This does not close the miss for `"single"` (`fr`/`fr-CA`).** `N. Bourbaki` and
    `M. Dupont` — both cited, both canonical fixtures — are structurally the identical shape to
    the English witness: one lone initial, one following capitalized word, no preceding initial
    and no further initial on the right. No local, non-lexical structural signal distinguishes
    them (both my English witness and both French citations happen to sit at the very start of
    their sentence, which is suggestive but not load-bearing evidence, and is not implemented as
    a guard here — it is not reliable enough to specify without lexical or genuine
    sentence-segmentation data, which this rule does not have and is not mine to add
    unilaterally). A French sentence ending in a lone initial immediately followed by a new
    sentence starting with a capitalized word would misfire under `"single"` exactly as the
    English witness did before `"chain"` existed. This is a **known, accepted limitation of
    `"single"` mode**, not a regression: the alternative (applying `"chain"`'s restriction to
    French too) would break `N. Bourbaki`/`M. Dupont`, which André's own citation supports and
    which have been canonical fixtures since before this item was written. Revisiting it needs
    either a genuinely new structural signal (none is known) or a locale-specific operator
    decision to accept `"single"`'s narrower false-positive-vs-false-negative trade for French,
    which is the decision already made, recorded here rather than left implicit.
10. **G-D is conditional on `initialBinding !== "none"`**, so a `beforeWord` entry's behaviour depends on
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
12. **The span boundary marker's class membership was split in spec 1.2.0.** Before 1.2.0,
    [modes.md](modes.md) §3.3's table put the −1 marker in this rule's `OPENISH` and `CLOSEISH`,
    while all five runtimes put it in neither. `docs/ROADMAP.md` recorded the discrepancy during the
    Python port and left it for a `spec-guardian` call. Production French content forced the call
    (§3.3 step 2, §6 rows 6c–6f): taken literally, the table fixes the lost space but loses the
    narrow space in `<em>non</em> !` and in `[ceci](url) : oui` through step 3. The runtimes'
    reading fixes neither. The split, `CLOSEISH` yes and `OPENISH` no, is the one reading that
    keeps both. Whether `OPENISH` should also include the marker is a separate question. It would
    widen the left-boundary tests of N3, N7, N9 and N10 and N3's following-token guard, and nobody
    has measured the false-positive profile of that. The answer in 1.2.0 is no, pinned by the
    fixture `ru-nbsp-span-boundary-not-openish-short-word` (`в <em>Москве</em>` stays unbound);
    changing it is a spec change.
13. **U+2060 has the same font problem and no option (spec 1.3.0).** `ranges` binds a tight range
    as `JOINER dash JOINER` (ranges.md §3.3.1), and the same production report that asked for
    `narrowNbsp` also raised the word joiner — not for a missing glyph, since it is zero-width,
    but for copy/paste and search indexing: a reader who copies `3⁠–⁠5` out of a page gets two
    invisible characters with it. Nothing was decided here, deliberately. `ranges` is **off by
    default**, so a caller who has not asked for range conversion never sees a joiner, and one
    who has can stop asking; that is a narrower situation than U+202F, which a French locale
    emits with default options. If a `wordJoiner` option is ever added it belongs in
    `ranges.md`, not here, and it needs its own answer to the question §3.1a answers for this
    rule: the joiner is what makes a converted range survive a second pass without regrowing a
    second joiner (ranges.md §3.1's re-entry condition), so removing it removes that anchor and
    the re-entry argument has to be rebuilt on the bare dash.
14. **U+2011 needs no option, and that is worth stating once.** `hyphen` (order 35) exists only to
    replace a hyphen with U+2011 in the forms a locale lists, so `rules: { hyphen: false }`
    already expresses "do not emit U+2011" exactly. The production report asked for
    `nonBreakingHyphen: false`, which suggests the rule table does not make that obvious — a
    documentation gap, not a missing option.
