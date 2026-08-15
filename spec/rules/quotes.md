# Rule: `quotes`

**Order:** 40. **Default:** on. **Modes:** text, html, markdown.
**Spec version:** 0.1.0.

---

## 1. Purpose

`quotes` converts typewriter quotation marks — U+0022 (") and U+0027 (') — into the pair of
glyphs the locale prescribes, resolving which occurrence is an opening mark and which is a
closing one, and alternating between the primary and secondary pairs by nesting depth. The
whole design rests on one decision: **the rule reasons about the straight input marks and
never about the curly output glyphs.** That is what makes Finnish and Swedish tractable,
where the opening and the closing mark of a pair are the same code point U+201D (”); a state
machine that scans the _output_ cannot tell those two apart and therefore cannot be
idempotent, which is why essentially every competing library is wrong here. It is also why
this rule is scheduled before `apostrophe` (order 50): while `quotes` runs, a straight
U+0027 is still present and can be weighed as quotation evidence; whatever `quotes` declines
to claim is handed on to `apostrophe`.

---

## 2. Locale data consumed

- `quotes.primary.open`
- `quotes.primary.close`
- `quotes.primary.innerSpace`
- `quotes.secondary.open`
- `quotes.secondary.close`
- `quotes.secondary.innerSpace`

`innerSpace` is **read but not acted on** by this rule; see §3.7.

**Evidence for locale data.** A locale attests **membership** — which tokens, which enum value, which boolean — and the rule owns the **mechanism** applied to them. A `sources` citation is not required to name a code point or a behaviour the locale file has no way to vary. Stated once, normatively, in [nbsp.md](nbsp.md) §2.1; it governs every locale field. Every other field of the
locale file is ignored.

---

## 3. Algorithm

Input is a code-point array `cp[0 … n-1]`. The rule is four passes over that array plus a
constant-time emit; none of them uses backtracking or a regular expression.

### 3.1 Character classes

| Class       | Members                                                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DQ`        | U+0022 (quotation mark)                                                                                                                                                                          |
| `SQ`        | U+0027 (apostrophe)                                                                                                                                                                              |
| `STRAIGHT`  | `DQ` ∪ `SQ`                                                                                                                                                                                      |
| `DIGIT`     | U+0030–U+0039                                                                                                                                                                                    |
| `LETTER`    | general category `Lu`, `Ll`, `Lt`, `Lm`, `Lo`, `Mn`, `Mc`, `Me` (combining marks count as letter-continuation)                                                                                   |
| `ALNUM`     | `LETTER` ∪ `DIGIT`                                                                                                                                                                               |
| `SPACELIKE` | U+0020, U+0009, U+00A0, U+202F, U+2007, U+2009, U+200A, and every member of `BREAK`                                                                                                              |
| `BREAK`     | U+000A, U+000D, U+000B, U+000C, U+0085, U+2028, U+2029                                                                                                                                           |
| `OPENISH`   | U+0028 `(` U+005B `[` U+007B `{` U+00AB `«` U+2018 U+201A U+201B U+201C U+201E U+201F U+2039 `‹` U+301D, plus every member of `STRAIGHT`                                                         |
| `CLOSEISH`  | U+0029 `)` U+005D `]` U+007D `}` U+00BB `»` U+2019 U+201D U+203A `›` U+002C `,` U+002E `.` U+003B `;` U+003A `:` U+0021 `!` U+003F `?` U+2026 `…` U+2013 U+2014, plus every member of `STRAIGHT` |
| `DASHISH`   | U+002D, U+2011, U+2013, U+2014. U+2011 is present because `hyphen` (order 35) converts U+002D to it; without it a candidate's classification would flip between pipeline runs (`hyphen.md` §3.2) |
| `NONE`      | the pseudo-class of "index out of range"                                                                                                                                                         |

`STRAIGHT` deliberately belongs to **both** `OPENISH` and `CLOSEISH`.

**Unicode version.** The general categories and case mappings this rule reads are those of the UCD version pinned in `spec/UNICODE` (`17.0`). The pin is normative for the **derived tables**, not for the host runtime — see [pipeline-idempotency.md](pipeline-idempotency.md) §6a, which also specifies the canary fixtures that make the pin detectable. This is not sloppiness:
it guarantees that replacing a neighbouring straight mark with a curly glyph (which is in
exactly one of the two classes) can only ever _remove_ a capability from a neighbouring
candidate, never add one. That monotonicity is the load-bearing part of the idempotency
proof — see §5, Claim 2.

**The classes do not track the open/close _role_, and must not be read as if they did.** An
earlier revision of this document required a locale's declared `open` glyph to be in `OPENISH`
and its `close` glyph in `CLOSEISH`. That constraint is false for half the shipped locales and
has been withdrawn:

| Locale     | Declaration                | Class of the glyph |
| ---------- | -------------------------- | ------------------ |
| `fi`, `sv` | primary `open` = U+201D    | `CLOSEISH`         |
| `fi`, `sv` | secondary `open` = U+2019  | `CLOSEISH`         |
| `de-DE`    | primary `close` = U+201C   | `OPENISH`          |
| `de-DE`    | secondary `close` = U+2018 | `OPENISH`          |
| `ru`       | secondary `close` = U+201C | `OPENISH`          |

Those locale files are right — they are cited to Kotus, Språkrådet and Duden — so the
constraint was what was wrong. A glyph's class reflects the _shape_ it most often has in
running text, which is what makes it useful for classifying a **neighbouring** candidate; it
says nothing about the role the glyph plays in the locale that declared it.

The actual normative requirement, which is all the idempotency proof needs, is:

> **A declared quote glyph must not be in `SPACELIKE`, must not be in `ALNUM`, and must not be
> in `STRAIGHT`.** The last is enforced by `locale.schema.json`'s `singleChar`; the first two
> hold for every quotation glyph in Unicode and are stated so that the proof can cite them.

No constraint on `OPENISH`/`CLOSEISH` membership is needed at all — see §5, Claim 2, which
shows that every test mentioning those classes is _already satisfied_ by a `STRAIGHT`
neighbour, so replacing one can only ever degrade a capability regardless of which class the
replacement lands in. As it happens every glyph in the two lists above belongs to exactly one
of them, which is worth knowing but is not relied upon.

A locale introducing a glyph absent from both lists must add it to whichever list matches its
shape; that is a spec change, and it affects only how _neighbouring_ candidates are read.

### 3.2 Pass 1 — collect and classify candidates

Walk `i` from `0` to `n-1`. For each `i` with `cp[i]` in `STRAIGHT`, compute

- `left = cp[i-1]` if `i > 0`, else `NONE`;
- `right = cp[i+1]` if `i+1 < n`, else `NONE`;

and derive two booleans:

- `canOpen` is true iff
  (`left` is `NONE`, or `left` is in `SPACELIKE`, or `left` is in `OPENISH`, or `left` is
  in `DASHISH`)
  **and** (`right` is not `NONE`, `right` is not in `SPACELIKE`, and `right` is not in
  `CLOSEISH` — except that a `right` which is in `STRAIGHT` does not disqualify).
- `canClose` is true iff
  (`left` is not `NONE` and `left` is not in `SPACELIKE`)
  **and** (`right` is `NONE`, or `right` is in `SPACELIKE`, or `right` is in `CLOSEISH`, or
  `right` is in `DASHISH`).

Then apply the **medial-apostrophe veto**, which applies to `SQ` only:

- if `cp[i]` is in `SQ` and `left` is in `ALNUM` and `right` is in `ALNUM`, then set both
  `canOpen` and `canClose` to false. The mark is `don't`, `l'été`, `O'Brien`, `1990's`,
  `нью-йорк'ский`. It is not a quotation mark under any reading and must be left for
  `apostrophe`.

Then apply the **same-kind adjacency veto**, which applies to both kinds:

- if `left` is in `STRAIGHT` and `left` is the _same code point_ as `cp[i]`, or `right` is in
  `STRAIGHT` and is the same code point as `cp[i]`, then set both `canOpen` and `canClose` to
  false.

In other words `""` and `''` — two adjacent identical typewriter marks — are not quotation
marks and are dropped outright. `"'` and `'"`, two adjacent marks of _different_ kinds, are
untouched by this veto: that is the ordinary shape of a nested quotation opening or closing at
the same point (`"'Tis so,"`, `Hän sanoi "moi"`, `…'moi'"`), and vetoing it would cost far
more than it buys.

This veto replaces the empty-pair discard that used to live in pass 2, and it is the repair
for the idempotency defect in §5.4. The property that makes it work is that it is
**self-reinforcing**: a mark is vetoed only because an identical straight mark sits next to
it, and that neighbour is vetoed for the same reason, so neither is ever a candidate, neither
is ever converted, and the veto's verdict can never change between runs.

Record a candidate record `{index, kind ∈ {DQ, SQ}, canOpen, canClose}` for every `i` with at
least one of the two booleans true. Candidates with both false are dropped and are never
touched by this rule.

Note what pass 1 does **not** do: it does not decide that a `SQ` with a letter on the right
and a space on the left is a leading elision (`’90s`, `’tis`). Such a mark is `canOpen` and
enters the pairing; if it finds no partner it survives untouched and `apostrophe` will render
it as U+2019. The pairing, not a heuristic, settles the ambiguity.

### 3.3 Pass 2 — pair the candidates, one stack per kind

**There are two stacks, one for `DQ` and one for `SQ`, and a candidate only ever touches the
stack for its own kind.** A double mark closes only a double mark and a single mark only a
single one. Each stack entry is a candidate record.

This is the one place where the shape of the input, rather than the locale, decides: **no
reader opens a quotation with `"` and closes it with `'`**, in any language, so a mixed pair is
never the right answer and does not need a locale to rule it out.

Nesting still interleaves, and that is worth stating because a single shared stack was
originally chosen for exactly that reason. `"He said 'no' twice"` puts each kind on its own
stack, the `SQ` pair closes inside the `DQ` pair, and both come out right — because **genuine
nesting is balanced within each kind**. What a shared stack additionally accepted was
_unbalanced_ input, where the innermost open mark is of the other kind; that is not nesting,
and treating it as nesting is what destroyed the Greek sentence in §5.5.

Walk the candidate list in index order. For candidate `c`, let `S` be the stack for `c.kind`:

1. If `c.canClose` is true and `S` is non-empty, pop the top entry `o` from `S` and record the
   pair `(o.index, c.index)`. Depth is **not** taken from the stack height here; see §3.4.
2. Else if `c.canOpen` is true, push `c` onto `S`.
3. Else record `c` as unmatched.

When the walk ends, every candidate still on either stack is recorded as unmatched.

**The three outcomes are unchanged, so Claim 3's partition survives intact.** Splitting the
stack does not add a fourth outcome; it only narrows which entry step 1 can pop. Every
statement of the proof in §5 holds verbatim once "the stack" is read as "the stack for its
kind", because a candidate never inspects, pushes to, or pops from the other kind's stack. The
per-kind form is a strict generalisation: with one kind present, the two formulations are
identical.

**Pass 2 has exactly three outcomes — paired, pushed, or step 3 — and every candidate reaches
exactly one of them.** That exhaustiveness is not a stylistic preference; Claim 3 of §5
partitions the unmatched candidates into "left on the stack" and "reached step 3", and a
fourth outcome makes the partition wrong and the proof unsound. A previous revision had one:
an empty-pair branch that popped the opener and recorded both marks unmatched, leaving the
opener in neither class. §5.4 documents the defect that caused. **Do not add a fourth
outcome to this list.** The empty-pair case it existed for is now handled in pass 1, where
the verdict depends only on immutable data.

Step 1 is tried **before** step 2, i.e. closing takes precedence over opening when a candidate
could be either. This is a **tie-break for an uncommon shape, not something that governs
ordinary prose**, and it is worth being precise about which shape, because the obvious
illustrations are all wrong.

A candidate is both `canOpen` and `canClose` only when its `left` is in `OPENISH` ∪ `DASHISH`
(it must be neither `NONE` nor `SPACELIKE`, or `canClose` fails; and it must be one of those
two classes, or `canOpen` fails) **and** its `right` is in `STRAIGHT` ∪ { U+002D, U+2011 } (the
only code points that `canClose`'s right-test accepts and `canOpen`'s right-test does not
reject). Running text essentially never produces that combination — which is why the precedence
almost never fires, and why it still has to be specified: two implementations that disagree
about it would diverge silently on the inputs where it does.

A minimal input that exercises it, in `en-US`:

|                      |                                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| input                | `"a ("-b"`                                                                                                                    |
| the ambiguous mark   | index 4: `left` is U+0028 (in `OPENISH`), `right` is U+002D (in `DASHISH`, and not in `CLOSEISH`) — so both booleans are true |
| step 1 before step 2 | the mark **closes** the quotation opened at index 0 → `“a (”-b"`                                                              |
| step 2 before step 1 | the mark would **open** instead, and the mark at index 7 would close it → `"a (“-b”`                                          |

Both outputs are stable, so idempotency does not choose between them; the spec does.

An earlier revision of this document illustrated the precedence with `"He said "hi.""`. That example is
now **wrong**: the two trailing marks are identical and adjacent, so the pass 1 veto (§3.2)
drops them, and the input comes back byte-identical with no pair anywhere. The behaviour is
correct; the example simply no longer exercises what it was cited for.

**Pairing is per-kind, and the old objection to that does not transfer.** An earlier revision
of this section said the opposite — that pairing is kind-agnostic, that requiring the kinds to
match "would let a closer skip a mismatched top of stack, which reintroduces exactly the
non-exhaustive fourth outcome". That objection was sound **against the design it was aimed at**,
and only against that one: _kind-matching on a single shared stack_. There, a closer that finds
a mismatched entry on top has to do something with it, and both available answers are wrong —
popping it pairs across kinds, skipping it is a fourth outcome and Claim 3's partition collapses.

**Two independent stacks remove the choice rather than resolving it.** A closer never inspects
the other kind's stack, so it never encounters a mismatched top, so there is nothing to skip.
Step 1's condition is exactly `canClose ∧ own stack non-empty`, the three outcomes stand, and
Claim 3 holds verbatim once "the stack" is read as "the stack for its kind".

The witness that was cited against kind-matching now passes: `"a 'b" c'` in `en-US` put the
marks at indices 3 and 8 together on the first run and 0 and 5 on the second, because one shared
stack interleaved them. With per-kind stacks the `DQ` at 0 pairs with the `DQ` at 5 and the `SQ`
at 3 with the `SQ` at 8, both on the first run, and the second run has no candidates left. The
witness disproved kind-matching-on-one-stack; it never disproved this.

**No pair can enclose zero code points.** A pair needs two candidates of the same kind (§3.3),
and two _adjacent_ marks of the same kind have already been dropped by the pass 1 veto, so an
empty pair cannot be formed at all. Two adjacent marks of _different_ kinds are not a pair
either, for the same reason they are not a pair anywhere else — pairing is per-kind: `"'` is
left exactly as written and is never emitted as `“”`. No guard is spent on any of this; it
falls out of §3.3.

### 3.4 Pass 3 — assign glyphs by depth

The **depth** of a recorded pair `p` is

> `depth(p) = 1 + ` the number of recorded pairs `q` with `q.open < p.open` and
> `p.close < q.close`

— that is, one plus the number of _successfully paired_ quotations that strictly enclose it.
Depth is computed from the finished pair list, **not** from the stack height at the moment of
popping, because the stack may hold candidates that never find a partner. In
`He said "hi. She said "bye."` the stack holds the unmatched first mark while the second pair
is closed; counting stack height would make that pair depth 2 and emit a secondary-level
quotation for what a reader sees as a first-level one. Counting enclosing _pairs_ gives
depth 1, which is correct.

For each recorded pair at depth `d` (`d ≥ 1`):

- if `d` is odd → use `quotes.primary`;
- if `d` is even → use `quotes.secondary`.

Depth, not the kind of the straight mark, selects the pair. In `'He said "hi"'` the outer
single marks are depth 1 and become the locale's primary pair, and the inner double marks
become the secondary pair — that is the point of normalising to a house style. In the
overwhelmingly common `"He said 'hi'"` the parity and the typewriter convention agree.

Depths beyond 2 alternate by the same parity rule (depth 3 → primary, depth 4 → secondary).
Real prose essentially never goes there; the parity rule is specified only so that two
implementations cannot disagree.

### 3.5 Pass 4 — emit

For each pair, emit two edits: replace the code point at the opening index with the chosen
pair's `open` code point, and the code point at the closing index with its `close` code
point. Each edit is exactly one code point replacing exactly one code point; no insertion,
no deletion, no reflow.

Unmatched candidates produce no edit. They remain U+0022 or U+0027 in the output.

### 3.6 Unbalanced quotes are left alone — and why

An odd number of quotation marks, or a closing mark with nothing open, means the text does
not say what the author meant it to say. Three responses are available: guess, refuse the
whole text, or convert what is unambiguous and leave the rest.

This rule converts what is unambiguous and leaves the rest, for three reasons:

1. **Guessing corrupts silently.** A stray `"` at the start of a pasted paragraph would, under
   a sequential 1st-is-open/2nd-is-close scheme, shift every subsequent quotation in the
   paragraph by one, turning every opening mark into a closing one. The damage is invisible
   in a diff full of curly glyphs and unbounded in extent. The ship criterion is zero false
   positives (PLAN.md M4).
2. **Refusing the whole text is worse than useless** in `html`/`markdown` mode, where one bad
   text node would disable the rule for a page.
3. **Leaving a straight mark is honest and recoverable.** A surviving `"` is visible to the
   author, who can fix the source. A wrongly-curled `”` is not.

The stack in §3.3 already restricts the damage: an unmatchable mark cannot consume a
matchable one, because a candidate that is not `canClose` never pops and a candidate that is
not `canOpen` never pushes.

### 3.7 `innerSpace` is not this rule's job

`locale.schema.json` puts `innerSpace` on the quote pair, and the French primary pair needs
U+202F between `«` and the quoted text. This rule **does not insert it**, for two reasons:
the pipeline gives `nbsp` (order 70) `"localeData": ["nbsp", "quotes"]` precisely so that all
no-break spacing is decided in one place after every other rule has settled; and inserting a
space here would mean `spaces` (order 10, already past) never gets to see the result.

Concretely: `quotes` turns `"mot"` into `«mot»` for `fr`, and `nbsp` then turns that into
`«` U+202F `mot` U+202F `»`. If the input already read `« mot »`, `quotes` does nothing at
all (no straight marks are present) and `nbsp` converts the two U+0020 in place. Both paths
converge on the same output, which is the property the pipeline needs.

### 3.8 Already-curly text

Existing locale glyphs, and foreign curly glyphs, are **not** candidates. They are not
converted, not re-paired, and they do not contribute to the depth computed in §3.4. A
paragraph containing both `“already curly”` and `"straight"` will have the straight pair
converted at depth 1, ignoring the curly one.

This is a deliberate limitation, not an oversight: treating existing curly glyphs as
candidates would mean re-deciding text the author may have set by hand, and — critically —
in a same-glyph locale like `fi` there is no way to tell an existing `”` opener from an
existing `”` closer without exactly the ambiguous state machine this rule exists to avoid.
Converting `“…”` (US) to `”…”` (Finnish) is a _translation_ task and is out of scope.

---

## 4. Must not touch

**Scope.** Per [pipeline-idempotency.md](pipeline-idempotency.md) §5.2 each bullet is **[P]** —
a guarantee of `transform` as a whole — or **[R]** — true of this rule in isolation but capable
of being falsified by another rule, which is then named.

- **[P] A medial apostrophe:** `don't`, `l'été`, `O'Brien`, `Hawai'i`, `1990's`. Vetoed in §3.2.
- **[R] A leading elision that finds no partner:** `’90s`, `’tis`, `’em`. It stays U+0027 here and
  becomes U+2019 in `apostrophe`.
- **[R] A trailing possessive that finds no partner:** `the dogs' bowls`. Same handover.
- **[R] A foot or inch mark:** `6' 2"`. Both marks are unmatched (the `'` has a digit left and a
  space right so it is `canClose` only; the `"` is `canClose` only; neither has an open on
  the stack), so both survive.
  _[R]: in `"6' 2"` the opening `"` is `canOpen` and the `'` after the digit is `canClose`, so
  they pair and the foot mark is emitted as a closing quote glyph. Bare `6' 2"` is safe — neither
  mark finds a partner — but the protection is not pipeline-level. See `apostrophe.md` §4._ `apostrophe` has its own guard for the `'` (see that document
  §3.4); the `"` is left as U+0022 permanently.
- **[P] Any unbalanced mark** (§3.6).
- **[P] `''` and `""`** — two adjacent _identical_ straight marks are vetoed in pass 1
  (§3.2) and are never candidates. `apostrophe` leaves `''` alone as well (see that document §4).
- **[P] Any run of two or more identical straight marks**, anywhere: `""`, `'''`, `""""`. Every
  mark in such a run has an identical straight neighbour and is vetoed (§3.2).
- **[P] Every non-straight quotation glyph**: U+2018, U+2019, U+201A, U+201B, U+201C, U+201D,
  U+201E, U+201F, U+00AB, U+00BB, U+2039, U+203A, U+301D–U+301F, U+02BC, U+2032, U+2033.
  None is a candidate and none is ever produced except as a locale's declared `open`/`close`.
- **[P] U+0060 (`) and U+00B4 (´)**, and the LaTeX idioms ` `` `and`''`. Not candidates.
- **[P] Anything inside a skipped region.** Attribute values, code spans, fenced code, `<pre>`
  and URLs are removed by the mode adapter before this rule runs. A `"` inside an HTML
  attribute must never reach it.
- **[R] Spacing of any kind.** This rule inserts and deletes nothing; every edit is 1:1 (§3.5).

---

## 5. Idempotency argument

Let `T` be the rule and let `y = T(x)`. Run `T` again on `y`.

### Claim 1 — converted marks are inert, and the veto is permanent

Every edit replaces a `STRAIGHT` code point with a locale `open` or `close` glyph. No locale
may declare U+0022 or U+0027 as a quote glyph — enforced by `locale.schema.json`'s
`singleChar`, which carries `"not": {"enum": ["\"", "'"]}`. Therefore a converted position is
not in `STRAIGHT` and is not a candidate in pass 1 of the second run.

The pass 1 **veto** is likewise permanent. A mark is vetoed only when an identical straight
mark is immediately adjacent; that neighbour is vetoed by the same test, so neither is a
candidate, neither is ever converted, and neither can acquire or lose an identical straight
neighbour — no edit creates a `STRAIGHT` code point. A vetoed mark is therefore vetoed on
every run, and a non-vetoed candidate never becomes vetoed.

The candidate set of the second run is consequently exactly `U`, the candidates that pass 2
left unmatched.

### Claim 2 — capabilities are monotone non-increasing

`canOpen` and `canClose` depend only on `cp[i-1]` and `cp[i+1]`. The only code points `T`
changed are former `STRAIGHT` marks, each of which became some declared glyph `g`. By §3.1,
`g` is not in `SPACELIKE`, not in `ALNUM`, and not in `STRAIGHT`. Examine each test for a
candidate `u ∈ U` whose neighbour changed:

- **`canOpen` left-test** (accepts `NONE`, `SPACELIKE`, `OPENISH`, `DASHISH`). Before the edit
  `left` was `STRAIGHT`, which is in `OPENISH` (§3.1), so the test **passed**. After, it
  passes iff `g` is in `OPENISH`. **true → true or true → false.**
- **`canOpen` right-test** (rejects `NONE`, `SPACELIKE`, and `CLOSEISH` other than
  `STRAIGHT`). Before, `right` was `STRAIGHT` and explicitly admitted, so the test **passed**.
  After, it passes iff `g` is not in `CLOSEISH`. **true → true or true → false.**
- **`canClose` left-test** (requires not `NONE`, not `SPACELIKE`). `g` is not in `SPACELIKE`
  and neither is a straight mark. **unchanged.**
- **`canClose` right-test** (accepts `NONE`, `SPACELIKE`, `CLOSEISH`, `DASHISH`). Before,
  `right` was `STRAIGHT`, in `CLOSEISH`, so the test **passed**. After, it passes iff `g` is
  in `CLOSEISH`. **true → true or true → false.**
- **Medial veto.** Requires `ALNUM` on both sides. `g` is not `ALNUM` and neither is a straight
  mark. **unchanged.**
- **Same-kind adjacency veto.** Permanent, by Claim 1. **unchanged.**

No test can turn from false to true. Therefore for every `u ∈ U`,
`canOpen₂(u) ⟹ canOpen₁(u)` and `canClose₂(u) ⟹ canClose₁(u)`.

Notice what this argument does **not** require: it never asks which class `g` belongs to. Every
test that mentions `OPENISH` or `CLOSEISH` was _already satisfied_ by the `STRAIGHT` neighbour
— because `STRAIGHT` is in both classes and is explicitly exempted from the one rejection test
— so replacing it can only degrade the outcome, whatever `g` is. This is why §3.1's withdrawn
constraint about `open` glyphs being in `OPENISH` was never needed, and why its falseness for
`fi`, `sv`, `de-DE` and `ru` does not endanger idempotency.

### Claim 3 — no pair forms on the second run

By §3.3 every candidate reaches exactly one of three outcomes, so the unmatched set partitions
**exhaustively** into

- `C` = candidates that reached step 3; and
- `O` = candidates still on a stack when pass 2 ended.

Throughout, "the stack" means **the stack for the candidate's own kind** (§3.3). A candidate
never touches the other kind's stack, so each kind's argument is independent and the reasoning
below is unchanged from the single-stack form.

_No member of `C` is `canOpen₁`._ Step 3 is reached only when step 2 did not fire, and step 2
fires on `canOpen`. By Claim 2, `canOpen₂` is false for them too.

_Every member of `O` that is `canClose₁` was processed with an empty stack._ Otherwise step 1
would have fired — its condition is exactly `canClose ∧ stack non-empty`, with no further
qualification — and it would have been paired, not left on the stack. And since members of `O`
are never popped, an empty stack at that index means no member of `O` precedes it.

Now run pass 2 over `U` in index order:

- Members of `C` have `canOpen₂ = false`. If `canClose₂` is true, step 1 needs a non-empty
  stack; the stack can only hold members of `O` pushed earlier. A member of `C` reached step 3
  in run 1, which for a `canClose₁` candidate means the stack was empty then, so no member of
  `O` precedes it — and members of `O` are never popped, so none can have been pushed and
  removed. The stack is empty in run 2 as well. Step 1 does not fire, step 2 does not fire,
  step 3 records it unmatched. No edit.
- Members of `O`: if `canClose₂` is true then `canClose₁` was true, so by the paragraph above
  no member of `O` precedes it, and no member of `C` pushes. The stack is empty, step 1 does
  not fire, and it is pushed if `canOpen₂` or dropped if not. If `canClose₂` is false it is
  pushed or dropped directly. Either way, no pair.

Pass 2 of the second run therefore records zero pairs, pass 4 emits zero edits, and
`T(T(x)) = T(x)`. ∎

### 5.4 The first defect: an empty-pair branch breaking the partition

The argument above is the _original_ Claim 3, restored. It was correct for the three-outcome
pass 2 it was written against, and it was invalidated by an empty-pair branch that introduced
a fourth outcome: a closer adjacent to the stack top popped the opener and recorded **both**
marks unmatched. Such an opener is in neither `C` (it never reached step 3) nor `O` (it was
popped), so the partition was not exhaustive — and because the opener kept `canOpen`, a second
run could push it and form a pair the first run had not.

Witness, `en-US`, confirmed through `transform`:

```
"""a""   →   ""“a”"   →   "““a””
```

An exhaustive sweep over `{" ' a SPACE . ( 1}` up to length 7, across all nine locales, found
1248 failing inputs. Every one contains two adjacent straight marks, and none is reachable
without the discard branch.

**The repair moves the decision from pass 2 to pass 1.** Adjacency of two _identical_ straight
marks is a property of the input that this rule can never change (Claim 1), so vetoing on it
is stable by construction, whereas "the candidate that happens to be on top of the stack is
adjacent to me" is a property of pass 2's state, which depends on which other candidates were
consumed — exactly the thing that differs between runs.

Under that repair the `"""a""` witness has **no candidates at all**: all five marks have an identical
straight neighbour, so all five are vetoed and the input is returned unchanged on the first
pass.

The alternative of _leaving the opener on the stack instead of popping it_ was rejected too: it
keeps the fourth outcome and merely relocates the problem, since the discarded closer is then in
no class.

### 5.5 The second defect: a mixed pair swallowing a quotation

The per-kind split of §3.3 repairs a different and worse defect, found while adding `el`.

With one shared stack, pairing was kind-agnostic, so a `DQ` could close an `SQ` and vice
versa. The shape that exposes it is an **elision inside a straight-quoted span**:

```
el      Είπε "σ' αυτό το βιβλίο" χθες.   →   Είπε «σ» αυτό το βιβλίο" χθες.
en-US   She said "it's the '90s" and left.   →   She said "it’s the “90s” and left.
```

In the Greek line the `'` of `σ'` is `canClose` (letter left, space right), it popped the
opening `"`, and the pair was emitted as `«σ»` — a destroyed sentence, with the real closing
`"` left stranded. This is **damage, not a miss**, and it is the class of defect PLAN.md §8's
M4 gate exists to prevent, so it is a release blocker rather than an open question.

Two things make it severe rather than exotic. It corrupts **ordinary prose**: the English line
is unremarkable writing, and Greek elision and apocope — `σ'`, `απ'`, `γι'`, `θ'`, `ν'` — occur
in almost every paragraph, so for Greek this was not an edge case but the common case. And it
is **locale-independent**: `en-US`, `en-GB`, `de-CH`, `fr` and `ru` all mangled the same input,
which is why the repair belongs in the algorithm and not in locale data.

**Why the obvious repair is wrong.** Keeping one stack and merely requiring the popped entry to
match the closer's kind is _not_ idempotent. The enumeration that catches it is the `mixed-kind straight marks are idempotent` block in `tests/engine/idempotency.test.ts`, which exists for this class and fails on exactly this variant (195 non-idempotent inputs) while passing on the per-kind form: a non-matching
entry then sits on the stack blocking the pair beneath it, `apostrophe` converts that entry to
U+2019 on the same run, and the second run — no longer blocked — forms the pair the first run
refused.

```
en-US   "'".'   →   "“".”   →   (a second run differs)
```

Per-kind stacks have no such state: the `SQ` never occupies the `DQ` stack in the first place,
so nothing is blocked and nothing is unblocked by a later rule.

**Cost, measured rather than asserted.** Over the alphabet `{" ' a SPACE .}` up to length 6
across all nine locales — 175 779 (input, locale) pairs — the per-kind form differs from the
kind-agnostic one on 25 674 of them, and **every single differing input contains both a `"` and
a `'`**. Text using one kind of straight mark, which is nearly all real text, is bit-identical.
The differing cases are unbalanced mixed-kind input, where the old answer invented a pair
across kinds and the new one declines to.

**The original justification for one stack was the weaker claim.** §3.3 used to read "a single
stack is used for both kinds, because nesting genuinely interleaves". Genuine nesting does
interleave, but it is **balanced within each kind**, and per-kind stacks handle it exactly:
`"He said 'no' twice"` and `'He said "no" twice'` both resolve as before. What the shared stack
additionally accepted was unbalanced input — and that acceptance was the defect, not a feature.

### What had to be fixed

The formulation everyone reaches for first is a state machine with a boolean `inQuote`,
flipped at each quotation mark. It fails three ways and all three had to be designed out:

1. **Same-glyph locales.** With `open = close = U+201D`, the output cannot be re-parsed, so
   the naive rule is not idempotent by construction. Fixed by never reading output glyphs:
   candidacy is defined on `STRAIGHT` only (§3.1, §3.8).
2. **Unbalanced input.** A flip-flop assigns _some_ glyph to every mark, so one stray quote
   inverts an entire paragraph. Fixed by the stack plus the explicit "leave it alone" policy
   (§3.3, §3.6), which also makes Claim 3 provable rather than hoped-for.
   2b. **Empty pairs.** Handling them inside pass 2 added a fourth outcome and broke the partition
   Claim 3 depends on (§5.4). Fixed by moving the decision to pass 1, where it reads only
   immutable data.
3. **Neighbour-class drift.** Converting one mark changes the neighbour of the next, which
   under a naive class table can _add_ a capability between run 1 and run 2. Fixed by the
   dual membership of `STRAIGHT` in `OPENISH` and `CLOSEISH`, which makes capabilities
   monotone (Claim 2).

A fourth thing had to be fixed that is not about idempotency but about correctness: taking
the nesting depth from the stack height (the obvious implementation) mis-levels every
quotation that follows an unmatched mark. §3.4 defines depth over the finished pair list
instead.

---

### 5.6 Composition obligation

Per [pipeline-idempotency.md](pipeline-idempotency.md) §5. This rule is **R₅**; the obligation
runs against `spaces`, `ellipsis`, `dashes` and `hyphen`.

**What this rule emits.** One locale quote glyph replacing one `STRAIGHT` code point, at the
same index (§3.5). No insertion, no deletion, no length change, no spacing of any kind.

**Against `I₁` (`spaces`).** Discharged: no U+0020 is emitted or removed, and no code point is
inserted or deleted, so no space run changes.

**Against `I₂` (`ellipsis`).** Discharged: no `DOTLIKE` code point is emitted, and none is
brought into contact with another, since every edit is 1:1.

**Against `I₃` (`dashes`).** Discharged **on its own**, but note what "on its own" excludes.
This rule changes no spacing, and a quote glyph in a dash token's `cp[L]`/`cp[R]` is ordinary
content — not in `DASH`, `INERT-DASH`, `DIGIT` or any space class — so no `dashes` verdict
moves. What _did_ break `I₃` is `nbsp` (R₈) subsequently inserting a `quotes.innerSpace` beside
a hyphen this rule had enclosed in guillemets: defect family 2. The shape originates here and
the violation is committed there, which is a good illustration of why the obligation is stated
per-rule on _emissions_ rather than on outcomes. See `dashes.md` §3.2 step 3 for the repair.

**Against `I₄` (`hyphen`).** Discharged: quote glyphs and straight marks are alike absent from
`WORDISH`, so no listed form's word boundary changes.

**What must be preserved for this rule.** `I₅` must survive `apostrophe`, `symbols` and `nbsp`.
All three can edit a _neighbour_ of a surviving straight mark — `apostrophe` turning an
adjacent U+0027 into U+2019, `nbsp` inserting a no-break space beside one. Claim 3 is
deliberately written to require only that capabilities on the second run are a **subset** of
the first run's, never that they are equal, so any change those rules make in the
capability-removing direction is harmless. I checked the two directions that would be harmful
and neither is reachable: `apostrophe`'s replacement moves a neighbour from `STRAIGHT` (in both
`OPENISH` and `CLOSEISH`) to U+2019 (in `CLOSEISH` only), which can only remove; and `nbsp`'s
two insertion sites — before a listed punctuation character, and beside a quote glyph — always
place the new space with punctuation or a glyph on one side, so a straight mark's neighbour
never changes from a letter into a space, which is the only change that could _add_ `canOpen`.
That check is by case analysis, not by exhaustive search; `pipeline-idempotency.md` §7.4
records the schema gap that would make it airtight.

---

## 6. Worked examples

`␣` = U+0020, `⟶` = no change. Locale data is **quoted from the shipped locale files**, not from the schema shape; each block
states the pairs it uses. (These blocks were written while the locale files did not yet exist and
said so; nine exist and validate now, so a row that disagrees with one is a defect in the row.)

### `en-US` — primary `“ ”` (U+201C/U+201D), secondary `‘ ’` (U+2018/U+2019), `innerSpace: none`

| #   | Input                                       | Output                                      | Why                                                                                                                                               |
| --- | ------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `She said "hello" twice.`                   | `She said “hello” twice.`                   | depth 1 → primary                                                                                                                                 |
| 2   | `"He said 'no' to me," she noted.`          | `“He said ‘no’ to me,” she noted.`          | per-kind stacks; the `SQ` pair is enclosed by the `DQ` pair, so it is at depth 2 → secondary                                                                                                      |
| 3   | `'He said "no" to me,' she noted.`          | `“He said ‘no’ to me,” she noted.`          | depth, not kind, selects the pair (§3.4)                                                                                                          |
| 4   | `He said "hi. She said "bye."`              | `He said "hi. She said “bye.”`              | three `DQ`; the first is `canOpen` only, the third `canClose` only; the first survives unmatched (§3.6)                                           |
| 5   | `Don't touch it — it's the '90s.`           | ⟶                                           | `Don't` and `it's` are vetoed as medial; `'90s` is `canOpen` but finds no partner, so `apostrophe` will render it U+2019                          |
| 6   | `He is 6' 2" tall.`                         | ⟶                                           | no pairing possible; both marks survive                                                                                                           |
| 7   | `The letter ''`                             | ⟶                                           | the two `'` are identical and adjacent → both vetoed in pass 1 (§3.2)                                                                             |
| 7b  | `"""a""`                                    | ⟶                                           | **the §5.4 witness.** All five marks have an identical straight neighbour, so none is a candidate. Previously produced `""“a”"` and then `"““a””` |
| 7c  | `"a "" b"`                                  | `“a "" b”`                                  | the inner `""` is vetoed and stays straight; the outer pair converts normally. A second run finds only the two vetoed marks and does nothing      |
| 8   | `“Already curly,” he said, and "this too."` | `“Already curly,” he said, and “this too.”` | existing glyphs ignored for depth (§3.8); the straight pair is depth 1                                                                            |

### `fi` — primary `” ”` (U+201D **both sides**), secondary `’ ’` (U+2019 both sides)

| #   | Input                         | Output                        | Why                                                                                                                                                                                                     |
| --- | ----------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9   | `Hän sanoi "moi" ja lähti.`   | `Hän sanoi ”moi” ja lähti.`   | opening and closing glyph are the same code point; the rule knew which was which from the pairing, not from the glyph                                                                                   |
| 10  | `Hän sanoi ”moi” ja lähti.`   | ⟶                             | the output of case 9 re-processed: no `STRAIGHT` marks remain, so there is nothing to do. This is the case a flip-flop state machine gets wrong                                                         |
| 11  | `"Hän sanoi 'moi'", totesin.` | `”Hän sanoi ’moi’”, totesin.` | depth 2 → secondary, also same-glyph. The `'` and `"` at the end are adjacent but of **different kinds**, so the pass 1 veto does not touch them — this is the case the veto is deliberately narrow for |

### `fr` — primary `« »` (U+00AB/U+00BB), `innerSpace: "narrow-nbsp"`, secondary per locale file

| #   | Input                   | Output                | Why                                                                                   |
| --- | ----------------------- | --------------------- | ------------------------------------------------------------------------------------- |
| 12  | `Il a dit "bonjour".`   | `Il a dit «bonjour».` | `quotes` emits the glyphs only; `nbsp` then inserts U+202F on both inner edges (§3.7) |
| 13  | `Il a dit «␣bonjour␣».` | ⟶                     | no straight marks; `nbsp` converts the two U+0020 to U+202F                           |

### `ru` — primary `« »`, secondary `„ “` (U+201E/U+201C)

| #   | Input                          | Output                         | Why                                |
| --- | ------------------------------ | ------------------------------ | ---------------------------------- |
| 14  | `Он сказал: "это 'моё' дело".` | `Он сказал: «это „моё“ дело».` | depth 1 primary, depth 2 secondary |

### `el` — primary `« »` (U+00AB/U+00BB), secondary `“ ”` (U+201C/U+201D), `innerSpace: none`

The same glyph inventory as `fr` but with no inner space, so it is the block that separates
"which pair" from "what `nbsp` does to it".

| #   | Input                             | Output                            | Why                                                                                                                                                                                                                                                                            |
| --- | --------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 15  | `Είπε "καλημέρα" και έφυγε.`      | `Είπε «καλημέρα» και έφυγε.`      | depth 1 → primary. `innerSpace: "none"`, so unlike case 12 `nbsp` adds nothing afterwards                                                                                                                                                                                      |
| 16  | `"Είπε 'όχι' σε μένα", σημείωσε.` | `«Είπε “όχι” σε μένα», σημείωσε.` | depth 2 → secondary. Greek is the only v1 locale pairing guillemets with curly **double** quotes                                                                                                                                                                               |
| 17  | `Το βιβλίο «Ο Ζορμπάς» εκδόθηκε.` | ⟶                                 | no `STRAIGHT` marks; re-processing corrected Greek is a no-op                                                                                                                                                                                                                  |
| 18  | `Είπε "σ' αυτό το βιβλίο" χθες.`  | `Είπε «σ’ αυτό το βιβλίο» χθες.`  | **the §5.5 repair.** The elision mark is `canClose`, but it is an `SQ` while the open mark is a `DQ`, so per-kind stacks (§3.3) never bring them together; the two `"` pair and `apostrophe` takes the elision. Before the split this emitted `«σ»` and destroyed the sentence |
| 19  | `Είπε «σ' αυτό το βιβλίο» χθες.`  | `Είπε «σ’ αυτό το βιβλίο» χθες.`  | the same sentence with the guillemets already curly. It was correct even before the repair, and it is kept because agreement between the two spellings is now the point                                                                                                        |

Cases 5, 6, 7, 7b, 10, 13 and 17 are "no change" cases.

---

## 7. Open questions

1. **`rock 'n' roll`.** Pass 1 makes both marks candidates (`␣'n` is `canOpen`, `n'␣` is
   `canClose`) and pass 2 pairs them. The pair encloses `n` at **depth 1**, so §3.4 sends it to
   the locale's _primary_ pair, not the secondary one: the output is `rock “n” roll` in
   `en-US`, `rock ”n” roll` in `fi`, and `rock ‘n’ roll` in `en-GB` — the last only because
   `en-GB` declares the single pair as primary, not because anything selected a secondary
   level. Correct English typography is `rock ’n’ roll`, two closing marks.

   _(The related fault this item used to carry — an elision inside a straight-quoted span being
   swallowed, `Είπε "σ' αυτό" χθες.` → `Είπε «σ» αυτό" χθες.` — is **fixed**, by the per-kind
   stacks of §3.3. It was a different fault despite the family resemblance: that one paired
   across kinds, this one pairs two marks of the same kind, and no stack discipline separates
   them. See §5.5.)_

   (An earlier
   revision of this document predicted `‘n’` for `en-US` and called it "the locale's secondary
   glyphs"; that was wrong twice over, and it mattered, because it made the defect look like a
   nesting-level bug rather than what it is.) Distinguishing it from the legitimate
   `the letter 'a'` is not possible from the code points alone. The fix is a short per-locale
   list of literal elision forms, and **`locale.schema.json` has no field for it**. Flagged in
   the report; not invented here.

2. **`en-GB` single-first.** PLAN.md §7 marks the British primary pair as uncertain. This
   rule is indifferent — it does whatever the locale file declares — but the depth-parity
   normalisation in §3.4 means a British text written single-first will be rewritten to
   whatever the locale declares as primary. If the operator would rather preserve the
   author's choice of level-1 glyph kind, §3.4 needs a different rule and the schema needs a
   flag.
3. **Nesting deeper than 2.** Parity alternation is specified so implementations agree, but no
   normative source was consulted for depth ≥ 3. If a source says otherwise for a given
   locale, this is a spec change.
4. _(Settled.)_ `locale.schema.json`'s `singleChar` now carries
   `"not": {"enum": ["\"", "'"]}`, so a locale cannot declare U+0022 or U+0027 as a quote
   glyph. Claim 1 of §5 rests on that constraint and may now cite it rather than assume it.
5. **Quotation across a paragraph boundary.** English convention re-opens (but does not close)
   a quotation that continues across paragraphs. In `text` mode a `BREAK` does not reset the
   stack, so a multi-paragraph quotation pairs the first opener with the _second_ opener.
   Whether the stack should reset at a blank line — and whether a mode adapter should split
   text units at paragraph boundaries — is unresolved and is the single most likely source of
   real-content surprises at the M4 gate.
6. **Straight marks that survive are invisible to the conformance matrix.** A fixture asserts
   an exact output string, so an unmatched mark is asserted as unchanged; but there is no way
   for a runtime to _report_ "I declined to convert 3 marks". The reserved `analyze()` API
   (ARCHITECTURE.md §7.1) would want that. Not a v1 problem, recorded so the edit model keeps
   room for it.
7. **Primes.** `6'` and `2"` should arguably become U+2032 and U+2033 rather than staying
   straight. That is a separate rule with its own false-positive profile and is not in
   `order.json`. Out of scope.
8. _(Settled — the cost is paid, not deferred.)_ This item recorded the unmeasured cost of
   kind-agnostic pairing: `'a"` pairing a `DQ` with an `SQ` and emitting a matched pair where the
   author wrote two different characters. **Pairing is now per-kind (§3.3), so the cost is zero
   and there is nothing left to measure.**

   Worth recording that the adopted repair was **neither of the two options this item named**. It
   rejected kind-matching — correctly, for the single shared stack it was judging — and proposed
   a _post-pairing filter_, rejecting a recorded pair whose marks differ in kind before pass 3
   assigns glyphs. Two independent stacks beat that filter on two counts: the mismatched pair is
   never **formed**, so the opener stays available to a later legitimate closer instead of being
   discarded along with it; and nothing has to be re-inspected between passes. On the Greek
   elision sentence of §5.5 the filter would have unmatched both marks, whereas the stack split
   pairs the two `"` correctly and hands the `SQ` to `apostrophe` — the right output rather than
   a less wrong one.

   The lesson generalises, which is why this is rewritten rather than deleted: an item recording
   a cost names the options **its author could see**, and must not be read later as having
   enumerated them.
