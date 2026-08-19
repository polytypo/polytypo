# Rule: `quotes`

**Order:** 40. **Default:** on. **Modes:** text, html, markdown.
**Spec version:** 0.3.0.

---

## 0. What changed from 0.1.0, and why it is a rewrite rather than a patch

0.1.0's whole architecture rested on one sentence: *the rule reasons about the straight input
marks and never about the curly output glyphs.* Two operator decisions withdraw that sentence:

1. **Any existing quote glyph is a re-typesetting candidate**, this locale's own or a foreign
   one. `«Wort»` in German prose becomes `„Wort“`. Same principle as `dashes` §3.2 step 2a
   applies to dash length: a quote glyph's identity in ordinary prose is at least as often a
   copy-paste artefact or unfamiliarity as a deliberate choice, and an author who wants their own
   typography untouched has always had the option of not running the pipeline. **0.1.0 §3.8 is
   withdrawn.**
2. **A space touching a quote mark is sloppiness, not evidence.** `" hello"` is `“hello”`; the
   space is deleted. `« bonjour »` is a formed pair on the first application, not only after
   `nbsp` has touched it.

Once every quote glyph is a candidate, **the rule's input alphabet equals its output alphabet**,
and 0.1.0's idempotency proof — whose first line is "a converted position is not a candidate in
pass 1 of the second run" — is not weakened, it is **false**. Three ideas replace it, and each
closes one class of the four defects that motivated this revision:

| Idea | Closes |
| --- | --- |
| **Glyph-blindness (Lemma A, §5).** Every quote mark belongs to `QUOTEMARK`, which is a member of *both* `OPENISH` and `CLOSEISH` and exempt from `canOpen`'s closeish rejection. A candidate's verdict never depends on *which* quote glyph its neighbour is. | neighbour drift; `apostrophe` (R₆) becomes structurally invisible as a neighbour |
| **Directional space-skipping (Lemma B, §5).** `canOpen` skips a space on its inner (right) side, `canClose` on its inner (left) side, unconditionally; each reads its *outer* side literally, except at the two positions `nbsp` can insert — derived from locale data, not hand-picked. | mandate 2; a run-1/run-2 asymmetry across an `nbsp`-inserted space; an HTML span boundary the same shape exposed |
| **Certification (the gate, §3.5).** The accepted pairing is *checked*, not proved: render the hypothetical output, re-run passes 1–2 on it, and decline pairs until the re-run reproduces the accepted set exactly. | width drift interacting with an unmatched candidate — the one remaining non-invariance, and provably non-local |

The division of labour is the point. **Lemmas A and B cover what the gate cannot see** — edits
made by *other* rules after `quotes` has run. **The gate covers everything `quotes` itself
does** — instabilities in the vetoes, the width partition, the depth assignment — without
anyone having to enumerate them by hand. A future change to the capability tests can break
quality; it cannot break idempotency, because the gate checks the actual re-derivation rather
than trusting an argument about it.

---

## 1. Purpose

`quotes` resolves every quotation mark in the text — typewriter (U+0022, U+0027) or typographic
(`«`, `“`, `„`, `‘`, `”`, …), the locale's own or a foreign locale's — into the pair of glyphs
the locale prescribes, alternating between the primary and secondary pairs by nesting depth, and
normalising the spacing immediately inside each pair.

---

## 2. Locale data consumed

- `quotes.primary.open` / `.close` / `.innerSpace`
- `quotes.secondary.open` / `.close` / `.innerSpace`

`innerSpace` is read and acted on in **one direction only**: `quotes` *deletes* an inner space
when the assigned pair's `innerSpace` is `"none"`, and never inserts or converts one. Insertion
and conversion stay with `nbsp` (order 70), exactly as 0.1.0 always said. See §3.7.

### 2.1 Two new normative locale constraints

Both are needed by §5's proof. **All ten shipped locales already satisfy both**, verified against
`spec/locales/*.json`:

- **Q-W — a pair is width-homogeneous.** For each of `primary` and `secondary`, `open` and
  `close` must have the same quote *width* (§3.1). Without it a formed pair straddles both
  stacks after rendering and the gate would decline every pair in a same-glyph document.
- **Q-A — a spaced pair must not use the apostrophe glyph.** If `innerSpace ≠ "none"`, neither
  `open` nor `close` may be U+2019. Without it `apostrophe`'s output would land in a
  `nbsp`-insertion-adjacent skip set and Lemma A's corollary would break.

One constraint belongs to `nbsp`'s data and is stated normatively in `nbsp.md` §2:

- **Q-P — every code point in `nbsp.beforePunctuation` and `nbsp.narrowBeforePunctuation` must
  be a member of this rule's `CLOSEISH`.** This is what makes Lemma B cover N1/N2 as well as N8.
  The shipped lists (`:`, `;`, `!`, `?` in `fr`/`fr-CA`, empty elsewhere) satisfy it.

**Evidence for locale data.** A locale attests **membership**; the rule owns the **mechanism**.
Stated normatively in `nbsp.md` §2.1; it governs every locale field this rule reads.

---

## 3. Algorithm

Input is a code-point array `cp[0 … n-1]`. Five passes plus an emit; no backtracking inside a
pass, no regular expression, no native-string indexing.

### 3.1 Character classes

| Class | Members |
| --- | --- |
| `DQ` | U+0022 |
| `SQ` | U+0027 |
| `STRAIGHT` | `DQ` ∪ `SQ` |
| `WIDE` | U+0022, U+00AB, U+00BB, U+201C, U+201D, U+201E, U+201F, U+301D, U+301E, U+301F |
| `NARROW` | U+0027, U+2018, U+2019, U+201A, U+201B, U+2039, U+203A |
| `QUOTEMARK` | `WIDE` ∪ `NARROW` (disjoint) |
| `DIGIT` | U+0030–U+0039 |
| `LETTER` | general categories `Lu Ll Lt Lm Lo Mn Mc Me` |
| `ALNUM` | `LETTER` ∪ `DIGIT` |
| `BREAK` | U+000A, U+000D, U+000B, U+000C, U+0085, U+2028, U+2029, plus `LINE_MARKER` |
| `INLINE-SPACE` | U+0020, U+0009, U+00A0, U+202F, U+2007, U+2009, U+200A |
| `SPACELIKE` | `INLINE-SPACE` ∪ `BREAK` |
| `OPENISH` | U+0028 `(` U+005B `[` U+007B `{`, `MARKER`, ∪ `QUOTEMARK` |
| `CLOSEISH` | U+0029, U+005D, U+007D, U+002C, U+002E, U+003B, U+003A, U+0021, U+003F, U+2026, U+2013, U+2014, `MARKER`, ∪ `QUOTEMARK` |
| `DASHISH` | U+002D, U+2011, U+2013, U+2014 |
| `DELETE-LANDING` | `ALNUM` ∪ `QUOTEMARK` |
| `NONE` | the pseudo-class "index out of range" |

**`QUOTEMARK` is a member of both `OPENISH` and `CLOSEISH`, and is exempt from `canOpen`'s
closeish rejection** — the same dual membership `STRAIGHT` had in 0.1.0, widened to the whole
class. This is Lemma A's entire mechanism and must not be simplified back to per-glyph lists.
`MARKER` keeps its 0.1.0 treatment (`modes.md` §3.3): in both classes, exempt from the
rejection, and **not** in `SPACELIKE`, so no skip walk ever crosses a span boundary.

**Deliberately excluded from `QUOTEMARK`:** U+2032/U+2033 (primes — a separate rule with its own
false-positive profile, §7), U+02BC (a `Lm` letter), U+0060 and U+00B4. Neither candidates nor
produced.

**Unicode version.** As 0.1.0: the pinned UCD in `spec/UNICODE` is normative for the derived
tables, not for the host runtime (`pipeline-idempotency.md` §6a).

**A declared quote glyph must not be in `SPACELIKE`, `ALNUM` or `STRAIGHT`**, and by Q-W must
share its pair's `WIDE`/`NARROW` bucket with its partner glyph. `singleChar` in
`locale.schema.json` enforces the `STRAIGHT` exclusion.

### 3.1a Locale-derived skip sets

Computed once per call, from locale data alone:

```
SPACE-RIGHT = { p.open  : p ∈ {primary, secondary}, p.innerSpace ≠ "none", p.open ≠ p.close }
SPACE-LEFT  = { p.close : p ∈ {primary, secondary}, p.innerSpace ≠ "none", p.open ≠ p.close }
```

These are **exactly the positions at which `nbsp` N8 can insert a space** (`nbsp.md` §3.10;
`nbsp.ts` `quotesSubRule` skips a pair whose `open` equals its `close`, and skips
`innerSpace: "none"`). For the ten shipped locales: `SPACE-RIGHT = {«}` and `SPACE-LEFT = {»}`
in `fr` and `fr-CA`; both empty everywhere else. The sets are derived from the *reason*, not
hand-written — if a locale gains a spaced pair, they follow automatically and Lemma B keeps
holding.

### 3.2 Pass 1 — collect and classify candidates

Walk `i` from `0` to `n-1`. Skip unless `cp[i] ∈ QUOTEMARK`. Write `g = cp[i]` and compute four
neighbour reads:

- `Llit = cp[i-1]`, or `NONE`; `Rlit = cp[i+1]`, or `NONE`;
- `Lskip` = the first `cp[j]`, `j < i` descending, with `cp[j] ∉ INLINE-SPACE`; `NONE` if the
  walk leaves the array;
- `Rskip` = symmetric to the right.

`MARKER` and every `BREAK` stop a skip walk, because neither is in `INLINE-SPACE` — a skip never
crosses a span boundary or a line terminator.

Then two *directed* reads:

- `openLeft` = `Lskip` if `g ∈ SPACE-LEFT`, else `Llit`;
- `closeRight` = `Rskip` if `g ∈ SPACE-RIGHT`, else `Rlit`.

The two capabilities:

```
canOpen  ⟺ ( openLeft = NONE ∨ openLeft ∈ SPACELIKE ∨ openLeft ∈ OPENISH ∨ openLeft ∈ DASHISH )
         ∧ ( Rskip ≠ NONE ∧ Rskip ∉ SPACELIKE
             ∧ ( Rskip ∉ CLOSEISH ∨ Rskip ∈ QUOTEMARK ∨ Rskip = MARKER ) )

canClose ⟺ ( Lskip ≠ NONE ∧ Lskip ∉ SPACELIKE )
         ∧ ( closeRight = NONE ∨ closeRight ∈ SPACELIKE ∨ closeRight ∈ CLOSEISH ∨ closeRight ∈ DASHISH )
```

`Rskip`/`Lskip` can still be a `BREAK` (a skip walk stops there), which is why both
`∉ SPACELIKE` tests are retained: a mark at a line end does not open across the break, a mark at
a line start does not close back over it.

**Why this exact asymmetry.**

- `canOpen` skips right and `canClose` skips left: each capability treats its *inner* side — the
  side facing the quoted text under that hypothesis — as noise. That is mandate 2, stated once
  and applied uniformly, unconditionally, on every locale.
- Each capability reads its *outer* side literally. The outer space is not noise, it is the
  evidence. `"hi" to me` is a closing mark **because** a space follows it; skipping that space
  (reading `t`) would destroy the commonest closing shape in every language. `He said "hi. She
  said "bye."` is preserved by exactly this: the first mark's `closeRight` is the letter `h`, so
  it is `canOpen` only, and the stray mark cannot swallow the real quotation.
- The two exceptions to "outer side is literal" are *derived*, not chosen: `nbsp` can insert on
  the right of a `SPACE-RIGHT` glyph and the left of a `SPACE-LEFT` glyph, and those are the only
  two outer reads it can reach. Making exactly those two reads skip is what makes every verdict
  inert to `nbsp` (Lemma B).

**Medial-elision veto** (`NARROW` marks only, literal reads):

> if `g ∈ NARROW` and `Llit ∈ ALNUM` and `Rlit ∈ ALNUM`, set both capabilities false.

`don't`, `l'été`, `O'Brien`, `1990's` — and, on a second pipeline pass, `don't` with U+2019,
because `apostrophe` has converted the mark and U+2019 is also `NARROW`. Widening from `SQ` to
`NARROW` is what makes `apostrophe`'s output inert here.

**V1 — same-code-point adjacency veto** (both widths):

> Let `gapInsertable = g ∈ SPACE-RIGHT ∨ g ∈ SPACE-LEFT`. If
> `Llit = g`, or (`Llit ∈ INLINE-SPACE` and `Lskip = g` and `gapInsertable`), set both
> capabilities false. Symmetrically for `Rlit`/`Rskip`.

`""`, `''`, `««`, `””` and any longer run of one glyph, by the first (literal) clause. This is
0.1.0's veto, generalised, and it keeps the `"""a""` witness dead and `"a "" b"` intact.
**Granularity is deliberately "same code point", not "same width"**: the narrower test
reproduces both witnesses, and a width-based test would veto the ordinary mixed boundary `"'`.

**The second clause is not in either design document that fed this revision, and closes a
composition-obligation violation found only by running the implementation.** A literal-only V1
lets the certification gate correctly decline a pairing when rendering it would place two
identical glyphs strictly adjacent (e.g. `«` immediately left of a mark the gate would render to
`«`) — but if `nbsp` (a *later* rule) subsequently inserts a space at exactly that gap, on the
*next* full-pipeline pass `quotes` sees the two occurrences with a space between them, the
literal adjacency is gone, and the *same* pairing certifies. That is `nbsp` creating work for an
earlier-ordered rule, forbidden by `pipeline-idempotency.md` §2's composition obligation, and it
reproduces with two witnesses, pinned in `spec/fixtures/fr.json` as `fr-quotes-030-cobug-html-tag-boundary`
(`«"<p class="x">"` in `html` mode) and `fr-quotes-030-cobug-double-open-then-closer` (`««”` in
`text` mode). The fix reads the
skip in exactly the two positions Lemma B (§5) already names as `nbsp`'s whole insertion
surface next to a quote mark — a candidate's own `g` value is shared identically with the
same-glyph neighbour a skip reaches, so checking `g`'s own `SPACE-RIGHT`/`SPACE-LEFT` membership
covers both of Lemma B's insertion sites at once, regardless of which of the two occurrences is
on which side of the gap. **A plain skip-based V1** (comparing `Lskip`/`Rskip` to `g`
unconditionally, with no `gapInsertable` guard) **was tried and rejected**: it also vetoes two
genuinely distinct, space-separated quotations (`'a' 'b'`, ordinary prose, not a typewriter
artefact) in every locale, including ones with no spaced pair at all — the guard is what keeps
the veto scoped to positions `nbsp` can actually reach.

Under mandate 1 the veto is **no longer permanent** — a converted mark can acquire or lose an
identical neighbour between runs — and that is stated rather than papered over: **the gate
(§3.5), not this veto, is the guarantor of stability against `quotes`' own re-derivation.** The
`gapInsertable` clause is what extends that guarantee to survive `nbsp` acting *between*
pipeline passes, which the gate alone — being a property of a single call — cannot see.

Record `{ index, width ∈ {WIDE, NARROW}, canOpen, canClose }` for every `i` with at least one
capability true. Candidates with both false are dropped and never touched.

Pass 1 still does **not** decide that a `NARROW` mark with a letter to the right and a space to
the left is a leading elision. It is `canOpen` and enters the pairing; if it finds no partner it
survives and `apostrophe` renders it U+2019. The pairing settles the ambiguity, not a heuristic.

### 3.3 Pass 2 — pair the candidates, one stack per width

**There are two stacks, one for `WIDE` and one for `NARROW`, and a candidate only ever touches
the stack for its own width.** 0.1.0's per-kind split generalised from "the literal code point
`DQ`/`SQ`" to "the glyph's visual width" — the property that actually carried the argument: no
reader opens a quotation with a double mark and closes it with a single one, in any language.
This is what keeps a Greek elision (`σ'`, `NARROW`) from closing a `WIDE` opener.

Walk the candidate list in index order. For candidate `c`, let `S` be the stack for `c.width`:

1. If `c.canClose`, `S` is non-empty, and **`¬vacuous(top(S).index, c.index)`** → pop `o`, record
   the pair `(o.index, c.index)`.
2. Else if `c.canOpen` → push `c` onto `S`.
3. Else record `c` as unmatched.

When the walk ends, everything still on either stack is unmatched.

> **`vacuous(a, b)`** ⟺ every `cp[k]` with `a < k < b` is in `INLINE-SPACE` (vacuously true when
> `b = a + 1`).

**The vacuity condition is new and is forced by mandate 1.** In 0.1.0 an empty pair was
impossible: two adjacent marks of the same kind were vetoed by V1, and two of different kinds
were on different stacks. Now `«»` is two *different* code points of the *same* width, and `" "`
is two identical marks V1 cannot see past a space; both would enclose no content. The condition
sits in step 1 rather than as a fourth outcome: a closer that fails step 1 **falls through to
step 2 and then step 3**, so every candidate still reaches exactly one of three outcomes and the
accepted/unmatched partition stays exhaustive — that exhaustiveness is what makes the "declined"
set well-defined for the gate. **Do not add a fourth outcome to this list.**

Step 1 before step 2 — **closing takes precedence** — is retained unchanged. An `«` whose
right-hand space `nbsp` inserted reads `closeRight = Rskip`, exactly as it did before `nbsp`
touched it, so the tie-break's ambiguity does not shift under mandate 1.

### 3.4 Pass 3 — assign glyphs by depth

For a set of pairs `A`, the **depth** of `p ∈ A` is

> `depth_A(p) = 1 + |{ q ∈ A : q.open < p.open ∧ p.close < q.close }|`

— one plus the number of *accepted* pairs that strictly enclose it. Odd depth → `quotes.primary`;
even depth → `quotes.secondary`. Depths beyond 2 alternate by the same parity.

**Depth is computed over the accepted set `A`, not over the raw pass-2 output.** On a second run
the accepted set *is* the raw set, so a depth taken over the raw set on run 1 and over the
accepted set on run 2 would disagree whenever the gate declined anything. Depth over `A` agrees
on both runs by construction.

**Depth, not the mark's original width, selects the pair.** `'He said "no" to me,' she noted.`
promotes the outer `NARROW` marks to `en-US`'s `WIDE` primary pair and demotes the inner ones —
the reason width drift exists at all, and the case the certification gate exists to re-verify.

### 3.5 Pass 4 — the certification gate

This pass replaces 0.1.0's Claims 1–3. It is a *check the algorithm performs*, not a property a
reader must verify by argument alone.

**Rendering.** `render(cp, A)` is the array obtained by applying, for every `p ∈ A` with assigned
pair `P = pairFor(depth_A(p))`:

- replace `cp[p.open]` with `P.open` and `cp[p.close]` with `P.close`;
- **if and only if `P.innerSpace = "none"`**, delete the pair's two *inner runs* where the
  landing guard permits:
  - the **open-side run** = the maximal `INLINE-SPACE` run starting at `p.open + 1` (possibly
    empty); its **landing** is the first code point past it;
  - the **close-side run** = the maximal `INLINE-SPACE` run ending at `p.close - 1`; its landing
    is the first code point before it;
  - a run is deleted iff it is non-empty, its landing is in `DELETE-LANDING`, and it is not
    simultaneously both of the pair's runs (a pair enclosing nothing but spaces deletes
    neither — unreachable for an accepted pair given §3.3's vacuity condition, but stated because
    the construction is otherwise silent about it).

`render` also yields the order-preserving index map `π` from surviving input indices to output
indices.

**Certification loop.**

```
A := the pair set from pass 2
loop:
    if A = ∅:                                   accept ∅ and stop
    (y, π) := render(cp, A)
    B := passes 1–2 applied to y                (raw, ungated)
    if { (π(p.open), π(p.close)) : p ∈ A } = B: accept A and stop
    A' := { p ∈ A : (π(p.open), π(p.close)) ∈ B }
    if A' = A:  A := A \ { the pair of A with the greatest `open` index }
    else:       A := A'
```

**Every clause is normative, including the tie-break.** When the intersection fails to shrink
`A` — exactly when `B ⊋ π(A)`, i.e. the rendered array admits a pairing the input did not — one
pair is removed, and *which* pair is specified so two ports cannot disagree.

**Termination.** Each iteration either accepts or strictly shrinks `A`. `A` is finite and `∅`
accepts unconditionally, so the loop runs at most `|A₀| + 1` times. Cost is `O(k·n)` with `k` the
number of pairs; in the overwhelmingly common case the first round certifies and the extra cost
is one `O(n)` pass. An implementation may short-circuit on that.

**Why the exit condition is `B = π(A)` and not `π(A) ⊆ B`.** Exiting with extra pairs in `B` is
unsound: the second run *starts* from `B`, and if `B` certifies, the second run renders `B`'s
extra pairs and the output differs. The intersection alone does not terminate at a sound state,
which is why the forced-removal clause exists.

**Empirical status of the forced-removal clause.** An exhaustive sweep of ~850,000 inputs across
all ten locales (the alphabet of §9's fixtures, to length 4–5, plus the named witnesses) did not
observe the clause firing even once — every case that reached the gate either certified in round
1 or was resolved by the plain intersection shrinking `A`. The clause is implemented as specified
(it is strictly more conservative than omitting it, never less sound, so it costs nothing even if
unreachable in practice) but its necessity is **not** demonstrated by a concrete witness as of
this writing. If a future sweep finds one, it belongs in `spec/fixtures/` as a named case.

### 3.6 Pass 5 — emit

For each `p` in the accepted set:

- an edit replacing `cp[p.open]` with the assigned `open` glyph, **omitted if the code point is
  already that glyph**;
- likewise at `p.close`;
- a deletion edit for each inner run the landing guard permitted, **omitted if the run is
  empty**.

An edit whose replacement is identical to the span it replaces is never emitted — the
invisible-edit principle `dashes.md` §3.3.1 states for the joiner, applied so that
already-correct text produces a byte-identical no-op rather than a diff of self-replacements.
Suppression is per **mark**, not per pair: a pair where only one side needed a glyph change
emits exactly one glyph edit.

Emitted spans are pairwise disjoint: replacements sit at distinct mark indices; a deletion span
lies strictly between a mark and its landing; and since accepted pairs are properly nested or
disjoint (stack discipline) and a pair enclosing only spaces deletes neither run, no two spans
can claim the same index. Edits are sorted ascending before returning.

Unmatched candidates and declined pairs produce no edit and keep their code point exactly.

### 3.7 `innerSpace`: `quotes` deletes, `nbsp` inserts

The split is asymmetric on purpose.

- `innerSpace = "none"` — a space inside the pair is *wrong* and nobody else can remove it.
  `nbsp` has no deletion capability at all. `quotes` deletes it, subject to the landing guard.
- `innerSpace ≠ "none"` — a space inside the pair is *required*, and `nbsp` (order 70) already
  inserts and converts it, correctly and idempotently, at `nbsp.md` §3.10. `quotes` emits
  nothing and deletes nothing there.

So `quotes` still never inserts a space, `nbsp` keeps ownership of all no-break spacing, and
there is no second copy of anyone's rules. `"mot"` → `«mot»` → (via `nbsp`) `«` U+202F `mot`
U+202F `»`; `« mot »` → (no edit from `quotes`) → the same output via `nbsp`. Both paths
converge, which is the property the pipeline needs.

**The landing guard is not a heuristic; it is a structural CO discharge.** The deleted run's near
side is a quote glyph and its far side is in `ALNUM ∪ QUOTEMARK`. Every class the four
earlier-ordered rules read as evidence — `spaces`' `CONTENT`/`STRIP-BEFORE`/bracket sets,
`ellipsis`' dot runs, `dashes`' `DASH`, `INERT-DASH`, `DIGIT`, `SPACE ∪ NOBREAK-SPACE`, `LETTER`,
`ROMAN`, `hyphen`'s `WORDISH` — classifies a quote glyph and a U+0020 **identically** (both
outside all of them, except `SPACE`, which the guard's own construction keeps away from any dash
run). `ALNUM ∪ QUOTEMARK` is the largest landing class for which that holds; letting the
deletion land on a dash is what would produce `" --x"` → `“--x”` → `“—x”`, a violation of `I₃`.
Two absolutes fall out of the same construction: **a `BREAK` is never deleted** (not in
`INLINE-SPACE`, so it terminates the run and, being outside `DELETE-LANDING`, declines the
deletion) and **`MARKER` is never crossed** (same mechanism), so the span partition is stable
between runs as `modes.md` §5 requires.

---

## 4. Must not touch

Each bullet is **[P]** (a guarantee of `transform`) or **[R]** (true of this rule alone, with the
rule that can falsify it named), per `pipeline-idempotency.md` §5.2.

- **[P] A medial apostrophe:** `don't`, `l'été`, `O'Brien`, `Hawai'i`, `1990's` — and their
  U+2019 forms on a second pass. Vetoed in §3.2.
- **[R] A leading elision that finds no partner** (`'90s`, `'tis`) and **[R] a trailing
  possessive that finds no partner** (`the dogs' bowls`). Handed to `apostrophe`.
- **[R] A foot or inch mark:** `6' 2"`. Both marks are `canClose` only with an empty stack. The
  0.1.0 caveat still applies verbatim: in `"6' 2"` the foot mark pairs, and the protection is not
  pipeline-level.
- **[P] Any unbalanced mark.** Convert what is unambiguous, leave the rest — §3.6 of 0.1.0's
  policy is unchanged.
- **[P] Any run of two or more identical quote marks:** `""`, `'''`, `««`, `””`. V1.
- **[P] A pair enclosing nothing but spaces:** `«»`, `" "`, `” ”`. §3.3's vacuity condition.
- **[P] U+2032, U+2033, U+02BC, U+0060, U+00B4** and the LaTeX idioms `` ` `` and `''`. Not in
  `QUOTEMARK`.
- **[P] Anything inside a skipped region.** Attribute values, code spans, fenced code, `<pre>`,
  URLs — removed by the mode adapter.
- **[P] Line terminators.** Never deleted, never crossed by a skip walk.
- **[R] Outer spacing.** This rule deletes only *inner* spacing and inserts nothing.

**No longer on this list, by operator decision:** every non-straight quotation glyph. `“ ” « »
„ ‘ ’ ‚ ‹ ›` and the rest are now candidates. `en-GB` text containing a correct `“…”` pair will
be rewritten to `‘…’`; `de-DE` text containing `«Wort»` becomes `„Wort“`. That is mandate 1, and
it is the largest behavioural change in this revision.

**Known, accepted residual risk — not new under this revision.** A leading elision that has
already been curled to U+2019 (`’90s were fun,’ he said`) can, if a later unrelated closing mark
exists on the same stack, be paired as an opener and lose its elided-digit reading. This was
already possible for straight input under 0.1.0 (`'90s were fun,' he said` is corrupted
identically) — it is `quotes.md` open item 1's `rock 'n' roll` family, "no local way to
distinguish an elision from a real opening quote", now also reachable via curly input because
mandate 1 makes curly input a candidate at all. It is **not** a new defect this revision
introduces; §5's Corollary A1 explains why no U+2019-specific restriction is applied, and
`spec/fixtures/` pins the verified behaviour across `en-GB`, `en-US`, `fi` and `sv` (§6, rows
E1–E4) so the tradeoff is a citable fact rather than an assumption.

---

## 5. Idempotency argument

0.1.0's Claims 1 and 2 are **withdrawn**, not weakened. Claim 1 ("a converted position is not a
candidate on the second run") is false by construction under mandate 1, and with it goes the
permanence of V1: two marks that were distinct can both be assigned the same glyph, so the
veto's verdict is no longer immutable. Claim 2's monotonicity is likewise gone: a converted mark
can *gain* a capability. Claim 3 rested on both. Three replacements follow.

### Lemma A — glyph-blindness

> Replacing any `QUOTEMARK` at index `j` with any other `QUOTEMARK` changes no capability of any
> candidate at any index `i ≠ j`.

*Proof.* A candidate's four neighbour reads are compared against `NONE`, `SPACELIKE`, `OPENISH`,
`CLOSEISH`, `DASHISH`, `QUOTEMARK`, `MARKER` and `ALNUM` (the medial veto), and V1 compares
against `g` itself. Every `QUOTEMARK` is in `OPENISH`, in `CLOSEISH`, in `QUOTEMARK`, in none of
`SPACELIKE`, `DASHISH`, `ALNUM`, and is neither `MARKER` nor `NONE`. All seven class tests are
therefore **invariant**, not merely monotone. The skip walks are invariant because
`QUOTEMARK ∩ INLINE-SPACE = ∅`. The only test that can move is V1, which compares code points
directly — and V1's movement is precisely what the gate certifies (§3.5). ∎

> **Corollary A1 — `apostrophe` (R₆) is structurally invisible.** `apostrophe` replaces U+0027
> with U+2019 and nothing else. As a *neighbour*, Lemma A applies. As the mark *itself*: both are
> in `NARROW`, so the stack partition is unchanged; the medial veto is stated over `NARROW`, so
> its verdict is unchanged; and neither is in `SPACE-RIGHT`/`SPACE-LEFT`, by constraint **Q-A**.
> Every verdict is identical. This is a **CO-S** discharge in the sense of
> `pipeline-idempotency.md` §5.1a — `E(apostrophe) = {U+2019}` is wholly inert for this rule.
>
> **On the elision-vs-closer tradeoff.** No U+2019-specific "can never open" restriction is
> applied. Such a restriction was considered and rejected: `fi`/`sv`'s secondary pair is U+2019
> on *both* sides, and forcing `canOpen = false` for every U+2019 would mean an already-correct
> `fi`/`sv` secondary pair could never be *recognised* as a pair at all — only ever declined —
> which directly contradicts mandate 1's purpose for that locale family. The cost of not
> restricting is stated in §4 and verified in §6 (rows E1–E4): it is the same pre-existing
> `rock 'n' roll`-family ambiguity 0.1.0 already documented for straight input, now also
> reachable via curly input, not a new class of damage.

### Lemma B — space-inertness at every position `nbsp` can reach

> Inserting a code point of `INLINE-SPACE`, or converting one `INLINE-SPACE` code point to
> another, at any position `nbsp` can act on, changes no capability of any candidate.

*Proof.* Conversion is trivial: every test reads class membership and U+0020, U+00A0, U+202F are
all in `INLINE-SPACE`. For insertion, `nbsp` has exactly three insertion sites (`nbsp.ts`
`claimInsertion`):

1. **N8, immediately right of an occurrence of `g ∈ SPACE-RIGHT`.**
   - *`g` itself*: `canOpen` reads `Rskip` (skips) and `openLeft` (untouched); `canClose` reads
     `Lskip` (untouched) and `closeRight`, which is `Rskip` because `g ∈ SPACE-RIGHT` (skips).
     All four invariant.
   - *the candidate `c` whose `Llit` was `g`*: `c.canOpen` reads `openLeft`, which is `Llit`
     (unless `c ∈ SPACE-LEFT`, in which case it skips): `g ∈ OPENISH` is accepted,
     `INLINE-SPACE ⊂ SPACELIKE` is accepted — same verdict. `c.canClose` reads `Lskip`, which
     skips the insertion back to `g` — same. Right-hand reads untouched.
   - no other index has a changed neighbourhood.
2. **N8, immediately left of `h ∈ SPACE-LEFT`.** Mirror image: `h.canOpen` reads
   `openLeft = Lskip` (skips, because `h ∈ SPACE-LEFT`); `h.canClose` reads `Lskip`. The
   candidate whose `Rlit` was `h` reads `closeRight = Rlit`, moving from `h ∈ CLOSEISH`
   (accepted) to `INLINE-SPACE` (accepted) — same verdict; and `Rskip`, which skips back to `h`.
3. **N1/N2, immediately left of a mark `m ∈ nbsp.beforePunctuation ∪
   nbsp.narrowBeforePunctuation`.** The only quote mark whose neighbourhood changes is a `g`
   with `Rlit = m`. Its `closeRight` moves from `m` to `INLINE-SPACE`; by constraint **Q-P**,
   `m ∈ CLOSEISH`, so both are accepted — same verdict. Its `Rskip` skips back to `m`. (`nbsp`'s
   own step 3 already declines to insert after an opening glyph.)

No other sub-rule inserts; N3–N7, N9, N10 only convert. ∎

**V1's `gapInsertable` clause (§3.2) is what extends this proof to V1 itself.** The four
capability tests above are the ones Lemma B's statement covers directly, but V1 is also a test a
candidate's own capabilities depend on, and it compares *code points*, not class membership —
Lemma B's "accepts `SPACELIKE` either way" argument does not apply to it. `gapInsertable` is
defined to hold exactly when `g` is a member of `SPACE-RIGHT` or `SPACE-LEFT` — precisely the
condition under which `nbsp`'s insertion sites 1 and 2 above can place a code point at the one
gap V1's second clause reads across — so V1's verdict is invariant to that insertion by the same
argument, case by case: at insertion site 1, the candidate immediately right of `g' ∈ SPACE-RIGHT`
has `gapInsertable = true` when its own glyph equals `g'` (the only case V1's second clause can
ever fire for it), and the literal-vs-skipped reads agree on whether that neighbour is `g'`,
exactly as case 1 above already shows for `canOpen`/`canClose`. Insertion site 2 is the mirror
image for `SPACE-LEFT`. Insertion site 3 (N1/N2) never inserts adjacent to a `QUOTEMARK` glyph on
the side V1 reads (it inserts beside listed punctuation, never beside a quote mark's own
same-glyph neighbour), so it cannot affect `gapInsertable`'s condition at all.

> **Corollary B1.** A run-1/run-2 asymmetry that used to arise from `quotes` reading a
> `SPACE-RIGHT` glyph's right side literally on one run and skipping it on the other cannot arise
> under §3.2: the read is `Rskip` on **both** runs, so `« **"` pairs on the first application and
> re-pairs identically on the second.

### Certification — the theorem

> **Theorem.** For every input `x` and every locale, `Q(Q(x)) = Q(x)`.

*Proof.* Let `A` be the accepted set and `y = Q(x) = render(x, A)`.

**Case `A = ∅`.** Then `y = x`. `Q` is a deterministic function of its input and the locale, with
no state (`ARCHITECTURE.md` §7), so `Q(y) = Q(x) = x = y`. ∎

**Case `A ≠ ∅`.** The loop exited on the equality branch, so `G₀(y) = π(A)`, where `G₀` denotes
passes 1–2. Run `Q` on `y`. Passes 1–2 give `A₀' = G₀(y) = π(A)`. The gate's first round computes
`render(y, π(A))`, and this equals `y`:

- **Glyphs.** `π` is order-preserving, so `depth_{π(A)}(π(p)) = depth_A(p)` for every `p`; the
  assigned pair is the same, and `y` already carries those glyphs at those indices by
  construction of `render`.
- **Inner spacing.** For a pair whose `innerSpace ≠ "none"`, `render` never touches spacing, on
  either run. For `innerSpace = "none"`: a run that was deleted is gone, so there is nothing to
  delete; a run that was declined is still present and its landing is unchanged — `render` maps
  `QUOTEMARK` to `QUOTEMARK` and leaves `ALNUM` alone, so a landing outside `DELETE-LANDING`
  stays outside it, and the same run is declined again.

Therefore `G₀(render(y, π(A))) = G₀(y) = π(A)`, the gate certifies in round 1, and
`Q(y) = render(y, π(A)) = y`. ∎

### Composition obligation

This rule is **R₅**; the obligation runs against `spaces`, `ellipsis`, `dashes` and `hyphen`, and
its own `I₅` must survive `apostrophe`, `symbols` and `nbsp`.

**What this rule emits.** `E(quotes)` = the four locale quote glyphs, each replacing exactly one
`QUOTEMARK` at the same index. Plus deletions of a maximal `INLINE-SPACE` run whose near side is
a quote glyph and whose far side is in `ALNUM ∪ QUOTEMARK`. **Nothing is inserted.**

- **Against `I₁` (`spaces`).** Discharged. No U+0020 is emitted, so no S-b/S-c/S-d position can
  be created. Deletion removes a *maximal* run, so it cannot bring two U+0020 into contact
  (S-a); its neighbours after deletion are a quote glyph and an `ALNUM`/`QUOTEMARK`, both
  `CONTENT`.
- **Against `I₂` (`ellipsis`).** Discharged. No U+002E or U+2026 is emitted; the deletion's
  landing is in `ALNUM ∪ QUOTEMARK`, which contains no dot, so no two dot runs are joined.
- **Against `I₃` (`dashes`).** Discharged **structurally**. A quote glyph is in none of `DASH`,
  `INERT-DASH`, `DIGIT`, `SPACE`, `NOBREAK-SPACE`, `JOINER`, `ROMAN` or `LETTER`, so a
  `cp[L]`/`cp[R]`/`before`/`after` moving from one quote mark to another moves nowhere. The
  deletion's two sides are a quote glyph and a `DELETE-LANDING` member, **neither in
  `DASH ∪ INERT-DASH`** — so no dash run is ever adjacent to a deleted run, no token's
  `lsp`/`rsp` changes, and the landing separates the deletion from any dash run by at least one
  code point. This is the discharge the naive "delete the inner space unconditionally"
  formulation failed, with witness `" --x"` → `“--x”` → `“—x”` (row D1, §6).
- **Against `I₄` (`hyphen`).** Discharged. `hyphen`'s boundary test is `¬WORDISH`, and both a
  U+0020 and a quote glyph are outside `WORDISH = ALNUM ∪ HYPHENISH`. The deletion never lands
  inside a word, only against its first or last code point.
- **`I₅` against `apostrophe` (R₆).** Discharged by Corollary A1 (CO-S).
- **`I₅` against `nbsp` (R₈).** Discharged by Lemma B (CO-S-shaped, over `nbsp`'s insertion
  *sites* rather than its emission alphabet alone — the alphabet by itself is not enough, because
  a `SPACELIKE` insertion is *not* inert at an arbitrary position; it is inert at exactly the
  positions `nbsp` can reach).
- **`I₅` against `symbols` (R₇).** **Known-weak: a case analysis, not CO-S.** `symbols`
  collapses `(c)`/`(r)`/`(tm)` to a single sign, deleting code points, and converts `x` to `×`
  between numerals. A quote mark adjacent to a collapsed span sees `(` on its right (moving to
  `©`, which is neither `OPENISH` nor `CLOSEISH`) or `)` on its left (moving to `©`). Checked
  over all four capability tests, every reachable verdict coincides: `canOpen`'s right test
  accepts `(` and accepts `©`; `canClose`'s right test rejects both; `canOpen`'s left test
  rejects `)` and rejects `©`; `canClose`'s left test accepts both as non-`NONE`. This is not
  made structural — the sweep is the control, per §5.1a of `pipeline-idempotency.md`.

---

## 6. Worked examples

`␣` = U+0020, `⍽` = U+00A0, `⟶` = no change. Every row is verified by running
`src/rules/quotes.ts` against the fixture of the same name in `spec/fixtures/`; none is
hand-traced-only.

### `en-US` — primary `“ ”`, secondary `‘ ’`, `innerSpace: none`

| # | Input | Output | Why |
| --- | --- | --- | --- |
| 1 | `She said "hello" twice.` | `She said “hello” twice.` | depth 1 → primary |
| 3 | `'He said "no" to me,' she noted.` | `“He said ‘no’ to me,” she noted.` | depth, not width, selects the pair; the gate certifies despite both streams swapping width |
| 4 | `He said "hi. She said "bye."` | `He said "hi. She said “bye.”` | the first mark's `closeRight` is the letter `h`, so it is `canOpen` only and cannot swallow the real quotation |
| 5 | `Don't touch it — it's the '90s.` | ⟶ | two medial vetoes; `'90s` is `canOpen`, unmatched, handed to `apostrophe` |
| 6 | `He is 6' 2" tall.` | ⟶ | both marks `canClose` only, both stacks empty |
| 7b | `"""a""` | ⟶ | every mark has an identical literal neighbour, V1 drops all five |
| 7c | `"a "" b"` | `“a "" b”` | the inner `""` is vetoed; the outer pair converts; the gate certifies |
| 8 | `“Already curly,” he said, and "this too."` | `“Already curly,” he said, and “this too.”` | the curly pair is now a real depth-1 pair, not an ignored one |
| A | `“He said ‘no’ twice.”` | ⟶ | already-correct nesting is a no-op |
| M2a | `" hello"` | `“hello”` | mandate 2: `canOpen` reads `Rskip = h`; the inner run's landing is `h ∈ ALNUM`, deleted |
| M2b | `"hello "` | `“hello”` | mirror case |
| D1 | `" --x"` | `“ --x”` | the inner run's landing is `-`, outside `DELETE-LANDING` → deletion declined, glyphs still convert |
| E1 | `’90s were fun,’ he said` | `“90s were fun,” he said` | **elision-vs-closer, curly input** — see §4's residual-risk note |
| E1s | `'90s were fun,' he said` | `“90s were fun,” he said` | the straight-input control: the same corruption, pre-existing since 0.1.0 |

### `en-GB` — primary `‘ ’`, secondary `“ ”`

| # | Input | Output | Why |
| --- | --- | --- | --- |
| B2 | `‘""-"-"` | ⟶ | width drift interacting with the same-glyph adjacency veto; the gate declines to ∅ |
| E2 | `’90s were fun,’ he said` | `‘90s were fun,’ he said` | elision-vs-closer, curly input |
| E2s | `'90s were fun,' he said` | `‘90s were fun,’ he said` | straight-input control |

### `fi` — primary `” ”` (U+201D both sides), secondary `’ ’` (U+2019 both sides)

| # | Input | Output | Why |
| --- | --- | --- | --- |
| 9 | `Hän sanoi "moi" ja lähti.` | `Hän sanoi ”moi” ja lähti.` | the pairing, not the glyph, knows which is which |
| B | `”Hän sanoi ’moi’”, totesin.` | ⟶ | same-glyph already-correct nesting is a no-op |
| 11 | `"Hän sanoi 'moi'", totesin.` | `”Hän sanoi ’moi’”, totesin.` | row B's input reached from straight marks |
| U1 | `”Hän sanoi ”moi” ja lähti.` | ⟶ | unbalanced same-glyph: three `”`, the stray leading one is left alone |
| E3 | `’90s were fun,’ he said` | `”90s were fun,” he said` | elision-vs-closer, curly input |
| E3s | `'90s were fun,' he said` | `”90s were fun,” he said` | straight-input control |

### `sv` — same shape as `fi`

| # | Input | Output | Why |
| --- | --- | --- | --- |
| E4 | `’90s were fun,’ he said` | `”90s were fun,” he said` | elision-vs-closer, curly input |
| E4s | `'90s were fun,' he said` | `”90s were fun,” he said` | straight-input control |

### `fr` — primary `« »`, `innerSpace: "nbsp"`; secondary `“ ”`, `innerSpace: "none"`

| # | Input | Output *(after `nbsp`)* | Why |
| --- | --- | --- | --- |
| 12 | `Il a dit "bonjour".` | `Il a dit «⍽bonjour⍽».` | `quotes` emits the glyphs; `nbsp` the U+00A0 |
| 13 | `Il a dit «␣bonjour␣».` | `Il a dit «⍽bonjour⍽».` | mandate 2's second half: the pair *forms on the first application* and produces no edit from `quotes` because the glyphs are already right |
| 3a | `«␣**"` | `«⍽**⍽»` *(after `nbsp`)* | width drift interacting with a run-1 `nbsp` insertion; `quotes` alone certifies the pair with one edit |

### `fr-CA`, `html` mode

| # | Input | Output | Why |
| --- | --- | --- | --- |
| 3b | `"<p class="x">«[t](u)` | ⟶ | the mode adapter splices a `MARKER` between the two text spans; `«`'s `closeRight` reads `Rskip` (because `« ∈ SPACE-RIGHT`) and finds `[`, so it is never `canClose` and no pair forms, on either application |

### `ru` — primary `« »`, secondary `„ “`

| # | Input | Output | Why |
| --- | --- | --- | --- |
| 14 | `Он сказал: "это 'моё' дело".` | `Он сказал: «это „моё“ дело».` | depths 1 and 2 |
| B1 | `'"‘` | ⟶ | width drift with no candidate left unmatched to be swallowed; the gate declines to ∅ in one round |

### `el` — primary `« »`, secondary `“ ”` (both `WIDE`)

| # | Input | Output | Why |
| --- | --- | --- | --- |
| 16 | `"Είπε 'όχι' σε μένα", σημείωσε.` | `«Είπε “όχι” σε μένα», σημείωσε.` | width drift with no gate intervention — evidence the gate's cost is near zero |
| 18 | `Είπε "σ' αυτό το βιβλίο" χθες.` | `Είπε «σ' αυτό το βιβλίο» χθες.` | the elision is `NARROW`, the quotation `WIDE`, different stacks — the elision survives untouched for `apostrophe` to convert on the next rule |

### `de-DE` — primary `„ “`, secondary `‚ ‘`

| # | Input | Output | Why |
| --- | --- | --- | --- |
| C | `Er sagte «Wort» leise.` | `Er sagte „Wort“ leise.` | foreign guillemets convert |
| C2 | `Er sagte « Wort » leise.` | `Er sagte „Wort“ leise.` | same, plus both inner runs deleted (landings `W` and `t`) |

### Adversarial sweep — `ru`/`el`/`fr`/`fr-CA` (§7 item 9)

These four locales' primary and secondary pairs are **both `WIDE`**, so the width-keyed stack
split does not independently separate a re-scanned primary stream from a re-scanned secondary
stream the way it does for `en-US`/`en-GB`/`fi`/`sv`. An exhaustive sweep over
`{«, », „, “, ", ', a, ␣}` (the locale's own glyphs plus the shared control alphabet) to length 5
— 149,796 inputs across the four locales — found **zero** idempotency failures; the medial and
same-glyph vetoes plus the certification gate together protect already-curly interleaved text in
this family, even without an independent width partition. Recorded as measured, not asserted.

---

## 7. Open questions, and what could not be closed

Ordered by how much this matters.

1. **Mandate 1's false-positive surface is genuinely larger, and M4 is where it will show.** A
   lone `«` can now pair with a distant `"` (row 3a converts an input 0.1.0 left alone). Any
   document with an odd stray typographic quote — a `»` used as a bullet, a `’` used as a prime,
   a `«` in a citation — can recruit a partner from arbitrarily far away, and unlike a straight
   mark the result is not visibly "unfinished" to a proofreader. This is a **product** risk, not
   an idempotency one; run the M4 corpus against this change specifically before anything else.
2. **The `symbols` (R₇) discharge is a case analysis**, not structural. Frequency: low (needs a
   quote mark literally adjacent to a `(c)`/`(r)`/`(tm)` span), but not closed structurally.
3. **The elision-vs-closer tradeoff (§4, §5 Corollary A1, §6 rows E1–E4) is verified, not
   eliminated.** It is the same pre-existing ambiguity as `rock 'n' roll` (item 4 below), now
   also reachable via curly input. No fix is proposed here; a per-locale elision word list would
   close both at once and needs a schema field that does not exist.
4. **The gate's forced-removal clause's necessity is asserted, not demonstrated with a concrete
   witness.** ~850,000 swept inputs did not trigger it. Implemented anyway (free insurance); if a
   future witness fires it, record it as a fixture.
5. **Declined deletions leave visibly sloppy output** (`" --x"` → `“ --x”`, row D1). This is the
   correct side to be wrong on (the alternative is a confirmed `I₃` violation) but is a real,
   acknowledged gap in mandate 2's coverage.
6. **`" "` and `«»` are prevented by an explicit vacuity guard, not by construction**, unlike
   0.1.0 where an empty pair was structurally impossible. Weaker footing than 0.1.0 had, though
   the gate catches any resulting instability.
7. **Worst case is `O(n²)`** (gate rounds × pass cost). A pathological span of alternating quote
   marks is quadratic; cap rounds if this matters in practice.
8. **Unchanged from 0.1.0, still open:** `rock 'n' roll`; `en-GB` single-first (now more
   consequential under mandate 1); quotation across a paragraph boundary; nesting deeper than 2;
   primes; surviving-mark invisibility to the conformance matrix.
9. **`ru`/`el`/`fr`/`fr-CA` already-curly protection is narrower than 0.1.0's** for these
   same-width-primary/secondary locales specifically — the two-stack split no longer
   independently protects already-curly text there the way it protects freshly-typed straight
   text. §6's dedicated adversarial sweep found no failures, but the protection that remains is
   the vetoes and the gate, not an independent structural guarantee.

---

## History

0.1.0 shipped with the four-pass, `STRAIGHT`-only design whose idempotency proof is quoted and
withdrawn in §0/§5 above. 0.2.0 was `dashes`' version bump and did not touch this file. 0.3.0 is
this revision: mandates 1 and 2, the five-pass algorithm, the certification gate, and the
locale-schema constraints in §2.1.
