# Pipeline idempotency

**Not a rule.** No entry in `spec/rules/order.json`, no locale data, no edits. This document
states the invariant that `transform` as a whole must satisfy, proves that per-rule
idempotency does not imply it, and defines the obligation each rule must discharge so that it
does.
**Spec version:** 0.1.0.

---

## 1. Purpose

PLAN.md §3.4 makes `transform(transform(x)) == transform(x)` a hard invariant **on the public
function**, not on individual rules. Every rule document carries a §5 arguing that _that rule_
is a fixed point on its own output. Those arguments are necessary and they are not sufficient:
the composition of eight individually idempotent functions is not in general idempotent, and
in this pipeline it demonstrably was not. Two defect families were found by exhaustive search
over short strings, both of them invisible to every per-rule argument because no per-rule
argument is allowed to mention another rule.

This document supplies the missing layer. It is short, and the obligation it imposes is
mechanical enough to be checked by reading a rule's "Must not touch" section against a table.

---

## 2. The invariant, and why per-rule idempotency does not give it

Write the pipeline as `T = R₈ ∘ R₇ ∘ … ∘ R₁`, the rules in `order.json` order:

| #   | rule         | order |
| --- | ------------ | ----- |
| R₁  | `spaces`     | 10    |
| R₂  | `ellipsis`   | 20    |
| R₃  | `dashes`     | 30    |
| R₄  | `hyphen`     | 35    |
| R₅  | `quotes`     | 40    |
| R₆  | `apostrophe` | 50    |
| R₇  | `symbols`    | 60    |
| R₈  | `nbsp`       | 70    |

(A disabled rule is removed from the sequence and never reorders the rest, so every statement
below holds for any subset, in the same relative order.)

For each rule define the predicate

> **`Iᵢ(y)` ⟺ `Rᵢ(y) = y`** — "rule `i` is a no-op on `y`".

**Lemma.** If `y = T(x)` satisfies `I₁ ∧ I₂ ∧ … ∧ I₈`, then `T(y) = y`.
_Proof._ `R₁(y) = y` by `I₁`; then `R₂(R₁(y)) = R₂(y) = y` by `I₂`; and so on through `R₈`. ∎

So the whole problem reduces to: **make the final output a fixed point of every rule, not just
of the last one that touched it.**

Per-rule idempotency gives `Iᵢ` immediately after `Rᵢ` runs. What it does not give is that
`Iᵢ` still holds at the _end_ of the pipeline. A later rule may undo it. That is exactly the
gap, and it yields the obligation:

> ### The composition obligation (CO)
>
> **For every pair `i < j`: if `Iᵢ(y)` holds, then `Iᵢ(Rⱼ(y))` holds.**
>
> In words: **a rule must never create work for an earlier-ordered rule.**

With CO, an induction over `j` gives the Lemma's premise: after `Rⱼ` has run, `I₁ … Iⱼ` all
hold — `Iⱼ` by `Rⱼ`'s own idempotency, and `I₁ … Iⱼ₋₁` because `Rⱼ` preserved them. After `R₈`
all eight hold, and `T(T(x)) = T(x)`.

Note what CO does **not** require: nothing about `j < i`. A rule may freely create work for a
_later_ rule, because the later rule has not run yet and will clean it up in the same pass.
That asymmetry is the whole content of "the rules run in a fixed order".

### 2.1 Why not simply iterate to a fixed point

Because it would make the invariant true by construction and hide precisely the defects this
document exists to find. It would also weaken the per-rule guarantee the package sells (a rule
that is a fixed point in isolation is a testable, portable claim; "the loop converges
eventually" is not), and any difference in iteration bound between two runtimes — or any input
where one runtime converges in two passes and another in three — becomes a conformance
divergence rather than a bug. **The rules must compose correctly.** Iteration is forbidden.

---

## 3. The output invariants

To discharge CO a rule author needs to know what `Iᵢ` actually says for each earlier rule, in
terms concrete enough to check. These are the four that constrain anything.

### I₁ — `spaces`

`spaces` deletes U+0020 in three situations and collapses runs. `I₁(y)` therefore requires
that `y` contains **no U+0020 in any of these positions**:

- **S-a** a run of two or more U+0020 with a `CONTENT` code point on both sides;
- **S-b** a U+0020 whose right neighbour is in `STRIP-BEFORE` = { U+002C, U+002E, U+003B,
  U+003A, U+0021, U+003F } and whose left neighbour is `CONTENT` — **and**, when that right
  neighbour is U+002E, the maximal run of { U+002E, U+2026 } beginning there has length exactly
  1 (`spaces.md` §3.4). U+2026 is not a member of `STRIP-BEFORE`;
- **S-c** a U+0020 whose left neighbour is in { U+0028, U+005B, U+007B } — unless the
  empty-bracket guard applies;
- **S-d** a U+0020 whose right neighbour is in { U+0029, U+005D, U+007D } — same proviso.

See `spaces.md` §3.1–§3.3 for the exact definitions of `CONTENT` and the guard.

**Who can violate it.** Only a rule that emits U+0020. In the current pipeline that is
`dashes` alone (`-spaced` forms). `nbsp` emits U+00A0 and U+202F, which are `CONTENT` to
`spaces` and are never touched. Every other rule replaces code points one-for-one or shortens
a run, and none of them can create a U+0020 or bring two apart-standing ones together.

### I₂ — `ellipsis`

`I₂(y)` requires no maximal run over { U+002E, U+2026 } that is either three or more code
points long, or of length ≥ 2 containing a U+2026; plus the locale's terminal form.

**Who can violate it.** Only a rule that emits U+002E or U+2026, or that deletes a code point
standing between two such runs. No rule does either. `I₂` is unconditionally preserved and
needs no attention from rule authors, but it is listed so that a future rule emitting a full
stop knows it has an obligation.

### I₃ — `dashes`

`I₃(y)` requires that no **dash token** in `y` is one `dashes` would edit — see `dashes.md`
§3.2 for the admissibility gate and §3.3/§3.4 for the branches. In practice a later rule
violates `I₃` when it changes the **spacing** around a U+002D/U+2013/U+2014, because spacing
is what `dashes` reads to decide whether a stroke is a parenthetical dash at all.

**Who can violate it.** Nobody, since spec 0.1.0 — and it is worth recording that this line
previously read _"`nbsp`, which inserts and converts space-like code points"_, which was true
and was the source of two defects. `dashes` now treats both U+00A0 and U+202F as making an
adjacent token inert (`dashes.md` §3.2 step 3), so `E(nbsp) = { U+00A0, U+202F }` is wholly
inert for it and **CO-S** discharges the pair structurally. `quotes`, `apostrophe` and `symbols`
replace code points one-for-one with characters in none of `dashes`' classes; `hyphen` emits
U+2011, which `dashes` treats identically to U+002D everywhere it matters.

### I₄ — `hyphen`

`I₄(y)` requires no occurrence of a listed `hyphen` form whose hyphen is still U+002D. A later
rule violates it only by changing a form's word boundaries, i.e. by inserting or removing a
code point immediately beside a listed form. `nbsp` inserts only next to listed punctuation
or beside a quote glyph, so the inserted space never lands between two letters; `symbols`
deletes only `(`…`)` spans. `I₄` is preserved.

### I₅ … I₈

`quotes`, `apostrophe`, `symbols` and `nbsp` are the last four rules; only `nbsp` has anything
after it, and nothing runs after `nbsp` at all. `I₅` must be preserved by `apostrophe`,
`symbols` and `nbsp`; `I₆` by `symbols` and `nbsp`; `I₇` by `nbsp`.

These are discharged in the respective documents, and the argument in each case is the same
shape: the later rule changes only code points whose class membership, as read by the earlier
rule, is unchanged — or is changed only in the direction that _removes_ candidacy. `quotes`
Claim 3 (`quotes.md` §5) is deliberately written to need only "capabilities on the second run
are a subset of the first run's", which is exactly what makes it robust to `apostrophe` and
`nbsp` editing its neighbours afterwards.

---

## 4. The two defect families

Both were found by an exhaustive sweep over every string of length 0–4 drawn from
`{ " ' - SPACE . 1 a }` across all nine locales. Both are CO violations. Neither is visible
to any per-rule idempotency argument, and both were pinned as failing tests rather than hidden
behind a precondition.

### Family 1 — a spaced dash emitted before a full stop

`dashes` (R₃) violates `I₁` (`spaces`, R₁).

```
de-DE:   .--.   →   . – .   →   . –.
```

Minimal shapes: `"--.`, `'--.`, `.--.`, `1--.`, `a--.`. Reproduces in all seven locales whose
`dash.parenthetical` is `em-spaced` or `en-spaced`; `en-US` is `em-tight` and is clean.

`dashes` emits `U+0020 – U+0020` for a `-spaced` locale. The trailing U+0020 now sits directly
before a full stop, which is violation **S-b**: on the next pass `spaces` deletes it, the
token becomes asymmetrically spaced, and `dashes` then declines it. Each rule is a fixed point
on its own output; the composition is not.

The same shape occurs with brackets — `(--a` → `( – a` → `(– a` (violation **S-c**) and
`a--)` → `a – )` → `a –)` (violation **S-d**).

**Repaired in `dashes`**, §3.2 step 9: a token may not be given a `-spaced` form when the
space that form would emit stands in a position `spaces` would delete. The alternative —
teaching `spaces` not to strip a space that follows a dash — was rejected: stripping a space
before punctuation is `spaces`' core job, the exception would have to fire for hyphens too
(`a - .`), and the inputs it would protect (`word – .`, `word – ,`) do not occur in real copy.
Declining leaves the input byte-identical, which is the conservative side of the ship
criterion.

### Family 2 — a quoted hyphen acquires no-break spacing

`nbsp` (R₈) violates `I₃` (`dashes`, R₃), by way of a shape `quotes` (R₅) created.

```
fr:   "-"   →   «-»   →   «⍽-⍽»   →   «⍽–⍽»
```

37 shapes, minimal `"-"`. `fr` only, because it is the only v1 locale with a non-`none`
`quotes.*.innerSpace`.

In the first pass `dashes` sees `"-"`: a bare U+002D with no spacing, which guard P1 declines.
`quotes` then produces `«-»` and `nbsp` inserts the guillemet inner spaces. On the second pass
`dashes` sees a U+002D flanked by space-like code points on both sides — indistinguishable,
by its own classes, from a spaced parenthetical dash — and converts it.

**Repaired in `dashes`**, §3.2 step 3: a `NOBREAK-SPACE` counts as the token's spacing on the
**left only**. The fix has to live in `dashes` and not in `nbsp` for a concrete reason:
`order.json` gives `dashes` `"localeData": ["dash"]`, so it cannot read `quotes.primary.open`
and literally cannot recognise a guillemet. `nbsp` could be taught not to insert beside a
hyphen, but that would require `nbsp` to encode `dashes`' admissibility rules, which is a
layering violation and a second copy of a subtle guard. The asymmetry is justified on its own
terms: `nbsp` promotes the space **before** a dash (Russian binds an em dash to the preceding
word) and never the space after one, so a no-break space to the right of a dash was never put
there for that dash's sake.

---

## 5. The proof obligation on every rule

Every `spec/rules/<id>.md` §5 must contain, in addition to its own idempotency argument, a
subsection discharging CO. It answers exactly two questions:

1. **What does this rule emit?** Enumerate the code points it can insert, and the positions in
   which it can delete or replace one. This is usually three lines.
2. **For each earlier-ordered rule, can that emission violate its invariant?** Walk §3's table
   for every rule with a lower `order`. State the answer and the reason, even when the answer
   is trivially no.

A rule with `order` 10 has an empty obligation and says so.

When a new rule is added, `docs/ARCHITECTURE.md` §5's five-step checklist gains an implicit
sixth item: discharge CO against every rule ordered before it, **and** re-check every rule
ordered after it, since the new rule's invariant becomes something they must now preserve.

### 5.1a CO-S — the structural discharge, and why case analysis is not enough

CO is sound. It was nevertheless violated four times, always in the same direction — a later
rule changing an earlier rule's verdict — and three of those four were _repairs of each other_.
The pattern is worth naming, because the defect was never in CO and always in the **discharge**.

A discharge of the form _"rule `Rⱼ` changes spacing, and I checked the cases I could think of"_
is not a proof. It is a survey, it terminates when the author runs out of imagination, and each
of the three failed `dashes`/`nbsp` repairs was exactly that. The alternative is available and
is usually cheaper to write:

> ### CO-S — sufficient condition for a structural discharge
>
> Let `E(Rⱼ)` be the set of code points `Rⱼ` can emit or insert. If **every member of `E(Rⱼ)`
> is inert for `Rᵢ`** — meaning `Rᵢ` declines to form or edit any token adjacent to it — then
> `Rⱼ` cannot create work for `Rᵢ` **on any input whatsoever**, and CO is discharged for the
> pair `(i, j)` without enumerating a single case.

CO-S is not always achievable, but where it is, it is the discharge to write. The `dashes` /
`nbsp` pair is the worked example. `E(nbsp) = { U+00A0, U+202F }`. Three successive attempts
tried to specify _which_ of those counted as dash spacing and _on which side_:

| Formulation                                      | Fixed                   | Exposed                                                        |
| ------------------------------------------------ | ----------------------- | -------------------------------------------------------------- |
| a `NOBREAK-SPACE` counts as spacing              | the original tight case | `«⍽-⍽»` — family 2                                             |
| …counts on the **left** only                     | family 2                | `«⍽–␣x` — defect (d), reachable from the pipeline's own output |
| **neither counts; a dash touching one is inert** | both, and the class     | —                                                              |

Only the third satisfies CO-S, and it is also the shortest to state and the only one whose
correctness does not depend on which witnesses were in front of the author. A discharge that
has to be re-derived every time the other rule changes is a defect waiting for a new locale.

**When writing a CO discharge, try CO-S first.** If the earlier rule cannot be made inert to
the later rule's whole emission alphabet, say so explicitly and enumerate — but treat the
enumeration as a known-weak argument and make the sweep (§6) the real control.

### 5.2 Rule-local and pipeline-level claims

Every rule document has a §4 "Must not touch". Those lists were written rule-by-rule, and they
read — to anyone who has not memorised `order.json` — as promises about `transform`. Some of
them are not. A §4 bullet is really one of two different assertions:

- **[R] rule-local.** _"Given its input, this rule does not edit X."_ A statement about one
  function. Always checkable from that rule's §3 alone.
- **[P] pipeline-level.** _"`transform` does not edit X."_ A statement about the composition,
  and it is true only if **X survives every rule R₁…R₈** — not merely the one whose §4 it
  appears in.

The gap between them is not academic. `ellipsis` §4 claimed `e.g. ..` was untouched; it is
untouched _by `ellipsis`_, but `spaces` deleted the U+0020 first, the run merged with the
abbreviation's dot, and the pipeline returned `e.g…`. Both rules were behaving exactly as
specified. The false statement was the scope of the claim, not the behaviour of either rule.

> **Derivation rule for a [P] claim.** X is protected end-to-end iff, for every rule `Rᵢ`, no
> sequence of edits by `R₁ … Rᵢ₋₁` can transform the input containing X into something `Rᵢ`
> would edit. In practice this reduces to one question per earlier rule: _can it change a code
> point adjacent to X, or delete one inside it?_ — because every rule in this pipeline decides
> from a bounded neighbourhood.

**Marking is mandatory.** Every §4 bullet in every rule document carries **[P]** or **[R]**.
A bullet describing a user-visible protection — paths, code-like text, identifiers, URLs,
abbreviations, measurements — must be **[P]**, because that is what a README reader will assume
it means; if the pipeline cannot deliver it, the defect is fixed rather than the claim
downgraded. **[R]** is reserved for statements that are genuinely about the rule's own
mechanics, and each one names the rule that can falsify it.

**Reading is not sufficient to find these.** Both instances above, and four more, were found by
_writing conformance fixtures_, not by reviewing prose — including by an agent that had read
all of these documents. A §4 bullet is a hypothesis until a fixture exercises it through the
whole pipeline. §6's sweep obligation is the mechanical half of this; per-bullet fixtures are
the other half, and they are what actually caught the class.

### 5.3 What this is worth, honestly

CO is a sufficient condition, not a necessary one. A pipeline could violate CO and still be
idempotent, if the work one rule creates for an earlier one happens to be undone again. Such a
pipeline would be idempotent by luck and would break on the next locale, so the spec requires
CO rather than the weaker property.

CO is also only as good as the invariant statements in §3. `I₁` is stated precisely because
`spaces` is simple; `I₃` is stated loosely ("no token `dashes` would edit") because `dashes`
is not. A loose invariant means the obligation is discharged by argument rather than by
mechanical check, and arguments about `dashes` have now been wrong three times. The
compensating control is the exhaustive sweep, not the prose — which is why §6 makes it a
release gate.

---

## 6. Testing obligation

The idempotency property test must include, in every runtime:

1. **A bounded exhaustive sweep, in two tiers.** Both are run for every locale in
   `spec/locales/registry.json`, asserting `transform(transform(x)) == transform(x)`.

   | tier | alphabet | length |
   |---|---|---|
   | **wide** | the consumed **and** emitted sets below | 0–5 |
   | **deep** | a core of at least `1`, `-`, U+0020, `.`, U+2060 | 0–8 |

   **Why two tiers, and why the bound moved.** A single length-4 bound was normative until
   `dashes` defect (e) — witness `1-1 - 1`, **seven characters** — shipped underneath it. Nothing
   was excluded and no precondition hid it; the bound simply could not reach it, and the suite
   was green throughout. **A bound that cannot reach a known witness will hide the next one.**
   The wide tier catches interactions between many characters, and grows combinatorially, so it
   stays shallow; the deep tier is narrow enough (5 symbols to length 8 is 390 625 strings per
   locale) to run to a length where multi-token shapes actually appear. U+2060 is in the deep
   alphabet because `dashes` emits it and the guards must be inert to it (§5.1a).

   **Standing obligation:** when a defect is found whose witness the committed bound cannot
   reach, the bound is wrong. Raise it, or add the witness's alphabet to the deep tier, in the
   same change that fixes the defect. **A biased or exhaustive generator is not
   optional**: uniform random strings over a large alphabet essentially never produce `.--.`,
   and the defect it hides may be the important one.

   **The sweep alphabet must contain the code points the rules _emit_, not only those they
   consume.** At minimum:

   |              |                                                                                                                                                           |
   | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | **consumed** | `"` `'` `-` U+0020 `.` `1` `a`                                                                                                                            |
   | **emitted**  | every locale `quotes.*.open`/`close` glyph in the registry — at minimum `«` `»` `“` `”` `„` `‘` `’` — plus U+2013, U+2014, U+2026, U+00A0, U+202F, U+2011 |

   This is a normative requirement and it was learned the expensive way. **Idempotency is a
   statement about re-processing output**, so an alphabet drawn only from input characters
   tests the wrong language: it can only reach the subset of the output space that happens to
   be spelled with input characters. Defect (d) of `dashes.md` §5.2 — `«⍽–␣"`, a shape built
   entirely from characters the pipeline itself emits — was unreachable until the emitted
   alphabet was added, and before that it surfaced on roughly **one property-test seed in
   three**, where it read as flaky infrastructure rather than as a defect. A test that fails
   one run in three and passes the rest is worse than no test, because it trains everyone
   looking at it to re-run.

   Two consequences for whoever maintains the sweep: the alphabet **grows when a locale is
   added**, since a new locale's quote glyphs are new output characters; and the sweep must be
   **deterministic and exhaustive** rather than sampled, so that a failure is reproducible from
   the seed-free description alone.

2. **A per-rule sweep.** The same assertion with a single rule enabled, which localises a
   failure to a rule rather than to the composition.
3. **A composition sweep.** The same assertion with the full pipeline. A failure here that
   passes (2) is a CO violation, and the report should say so — that is the signal this
   document exists to make legible.

4. **A test whose carrier dies keeps passing, and proves nothing.** When a rule narrows, some
   assertions elsewhere stop exercising what they were written for while continuing to go green
   — they pass *for a different reason than when they were written*. That is strictly worse than
   a failing test, because nothing draws attention to it.

   This is not hypothetical: `dashes` §3.2 step 2a stopped the rule restyling an authored dash,
   and every test and worked example carried on `–` → `␣–␣` became inert overnight. One of them
   was in `modes.md` §3.4's normative table, where it had been the illustration of the whole
   edge-growth rule. It was caught only because a *sibling* assertion in the same test failed and
   someone asked why the other two still passed.

   **Obligation when a rule narrows:** audit every assertion that uses the narrowed construct as
   its carrier, and for each one ask whether it still fails when the behaviour it names is broken.
   Rebuild it on a live carrier or delete it. The formulation worth keeping is the implementer's:
   **the carrier is dead, the assertion is alive, the meaning is lost.**

   Two related checks belong to the same discipline:

   - **A round-trip fixture must have teeth.** A document asserted to come back byte-identical
     proves something about skip lists only if it *would* change otherwise. If it is also
     unchanged in `text` mode, it proves nothing at all — the assertion holds for the trivial
     reason. Every such fixture should be verified to change materially in `text` mode.
   - **A guard that has become unreachable is deleted, not left to rot** (§5.1a) — the same
     principle one layer down, applied to the rule instead of the test.

**Preconditions (`fc.pre`, `assume`, and equivalents) that exclude a failing shape are not
permitted in the committed suite** except as a temporary, named, individually-pinned
containment for a defect that is already reported. Every such precondition must name the
document section that will remove it.

---

## 6a. The Unicode pin, and what it can portably require

`spec/UNICODE` contains `17.0`. Until this section it had **no reader**: no rule document cited
it, so an implementation could derive its character tables from any UCD version and still pass
conformance. That is the defect — not the file's absence, but its inertness.

### 6a.1 What the pin means

Two claims get conflated, and only one of them is portable.

1. **"The embedded tables are those derived from UCD 17.0."** Enforceable in every runtime,
   determines output, and is what the pin means. Each port generates its `LETTER` (L ∪ M),
   `UPPER` (Lu ∪ Lt) and simple-uppercase tables from the pinned UCD and checks them in.
2. **"The host runtime's UCD is 17.0."** **Not portable, and therefore not required.** JS exposes
   `process.versions.unicode`, Python `unicodedata.unidata_version`, Go `unicode.Version` — but
   PHP only through `intl`/ICU, which is not always installed, and Ruby has no dependable public
   accessor. A normative requirement of this form would be unimplementable in at least one target
   runtime, which is what ARCHITECTURE.md §4 exists to prevent.

> **`spec/UNICODE` is normative for the derived tables, not for the host runtime.** Every rule
> document that uses `LETTER`, `UPPER` or a case mapping must cite it. A port whose host UCD
> version *is* readable should additionally assert it against the pin as a cheap extra gate;
> where it is not readable that gate does not exist, and the spec must not pretend otherwise.

A host-side drift detector proves that the table matches *some* UCD and that this host agrees
with it. **Only fixtures can prove that five runtimes agree with each other.**

### 6a.2 Canary fixtures

Ordinary conformance cases whose expected output depends on the tables being right, so that table
drift surfaces in the conformance run rather than in one runtime's unit tests.

**On version canaries, honestly.** I cannot name a code point whose general category or simple
uppercase mapping demonstrably changed between UCD 16.0 and 17.0 from anything I can read here.
Naming one on recollection would be worse than naming none: **a canary that cannot fire advertises
a guarantee nobody has.** The version-drift canary must therefore be **generated, not hand-picked**
— a build step diffs the pinned UCD against the previous major version, takes the code points whose
`General_Category` or `Simple_Uppercase_Mapping` differs, and emits fixture rows asserting the
pinned behaviour. Generated rows fire by construction, and the set is re-derived whenever the pin
moves. If the diff is empty for a given version pair, the suite should say so rather than silently
contain nothing.

**Derivation canaries, which I can specify with confidence and which catch the likelier failure.**
The realistic defect is not "a port used UCD 16.0"; it is **"a port called the host's letter
predicate instead of the embedded table"**. Three cases, each chosen because a naive host call
gives a *different answer* from this spec's definition, in every Unicode version:

| Canary | Code point | Fires when |
|---|---|---|
| **`LETTER` includes marks** | U+0301 combining acute, category `Mn` | the port used `\p{L}`, `unicode.IsLetter`, `str.isalpha` or `ctype_alpha`, all of which exclude `Mn`. This spec's `LETTER` is **L ∪ M**, so a decomposed `é` (`e` + U+0301) must behave as one letter — `apostrophe.md` §6 case 2 already depends on it |
| **`UPPER` includes titlecase** | U+01C5 `ǅ`, category `Lt` | the port used an `isUpper` that tests `Lu` only. This spec's `UPPER` is **Lu ∪ Lt** (`nbsp.md` §3.1) |
| **Case mapping is simple and locale-independent** | U+0069 `i` / U+0049 `I` | the port used a locale-sensitive uppercase. Under a Turkish host locale `i` maps to `İ` (U+0130), so `nbsp`'s first-character leniency (§3.5) stops matching a capitalised short word. This is ARCHITECTURE.md §4.4's dotless-ı hazard, made testable |

These prove the tables were **derived correctly**; the generated rows prove they were derived from
the **pinned version**. Both are needed, and only the second depends on data I cannot supply here.

---

## 7. Open questions

1. **`I₃` is not stated precisely enough to check mechanically.** "No token `dashes` would
   edit" is a restatement of the rule, not an invariant. A checkable form would enumerate the
   shapes — and the fact that I cannot write it in half a page is itself evidence that
   `dashes` is the most complex rule in the spec and the one most likely to break again.
2. **CO has not been verified for rule subsets.** The `rules` option lets a caller disable any
   rule. Disabling `spaces` removes `I₁` from the obligation set, which is harmless; but
   disabling a rule can also _expose_ text to a later rule that the disabled rule would have
   normalised, and no sweep currently runs over subsets. The combinatorics are mild (2⁸ = 256
   configurations × the length-4 sweep) and this should probably be a CI job.
3. _(Settled.)_ Modes are now covered by [modes.md](modes.md), which was written to answer
   this item. The premise it was raised under turned out to be the wrong one: the pipeline does
   **not** run per span. Spans are concatenated with an explicit boundary marker and the
   pipeline runs once over the whole array, so a space at a span boundary and a dash in the
   neighbouring span are seen together — and are declined together, because the marker breaks
   the adjacency that would make them a token. `modes.md` §5 adds one obligation this document
   cannot see: **the span partition must be stable between runs**, which constrains what code
   points a rule may emit.
4. **The `nbsp`-before-`quotes` direction.** `quotes` Claim 3 is robust to `nbsp` reducing a
   surviving straight mark's capabilities, and I verified that `nbsp`'s two insertion sites
   (N1/N2 before listed punctuation, N8 beside a quote glyph) can only reduce them. That
   verification is by case analysis over the four capability tests, not by exhaustive search
   over locale data that lists U+0022 in `beforePunctuation` — no locale does, and nothing
   forbids one. A schema constraint banning the straight marks from `nbsp.beforePunctuation`
   and `nbsp.narrowBeforePunctuation` would close it. **Reported.**
