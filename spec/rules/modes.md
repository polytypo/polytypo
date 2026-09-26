# Modes — the L2 contract

**Not a rule.** No entry in `spec/rules/order.json`, no locale data, no edits of its own. This
document specifies how a `html`, `markdown` or `yaml` document is decomposed into processable
text, how the rule pipeline is applied to it, and how the result is reassembled. It is normative
for all five runtimes and is parser-agnostic by construction: `parse5`, `nokogiri`, `lxml`,
`golang.org/x/net/html` and PHP's DOM disagree about almost everything this document does not
forbid them from doing. `yaml` mode is parser-**free** rather than parser-agnostic, for the
reason §3.8.1 measures.
**Spec version:** 1.8.0 (0.1.0 for everything except §3.3's class-membership table rows for
`nbsp` and `apostrophe`, split in 1.2.0, §3.8, added in 1.3.0, §3.3's note on `quotes`'
span-boundary elision veto reading the marker as a trigger, added in 1.4.0 — which changes no
row of the table it follows — §3.3's `CLOSEDELIM` entry, added in 1.5.0, and §3.7.4 with the
amendments it carries to §3.1's definitions, §3.2's Model C, §3.5 step 3, §3.7.3's frontmatter
bullet, §3.8.6's accepted-cost paragraph, §5, §6 and §7, added in 1.7.0, and §3.7.3a, added in
1.8.0).

---

## 1. Purpose

`text` mode hands the pipeline one string. `html`, `markdown` and `yaml` hand it a document in
which _most_ of the characters must not be touched at all — markup, code, URLs, keys — and the
processable text is scattered across dozens of disconnected fragments. Two things then have to
be decided and neither is obvious: **what the rules see**, and **what comes out**.

The second is the easier one and this document answers it absolutely: **the output is the input
with a set of disjoint substring replacements applied, and nothing else.** The source is
_located_, never re-emitted. That is the only formulation under which five parsers can agree,
because it removes serialisation from the contract entirely — and in `yaml` mode it is also what
makes an entire class of reported corruption unreachable (§3.8.1).

The first is the interesting one, it is argued rather than asserted in §3.2, and everything
else in this document follows from it.

---

## 2. Locale data consumed

**None.** The mode layer is locale-independent. It decides _which characters_ the pipeline
sees; the pipeline decides what to do with them.

---

## 3. Algorithm

### 3.1 Definitions

- A **skipped region** is a maximal span of the source document that the pipeline must never
  see and must never modify.
- A **processable span** is a maximal span of the source that is not skipped. Each span is
  identified by its offsets in the **original source**, and those offsets are the only handle
  the mode layer keeps.
- The **span sequence** `S₁ … Sₘ` is the processable spans in document order.
- A **text unit** is one span sequence and the array built from it (§3.5 step 2). A document has
  exactly one, **except** in `markdown` with `frontmatterKeys` (§3.7.4, spec 1.7.0), where the
  frontmatter block's spans form a second unit and the pipeline runs once per unit. The term is
  defined here because §4 and §6 already used it informally for "the concatenation".
- `text` mode is the degenerate case: one span covering the whole input, no skipped regions.
  Every statement below holds for it trivially.

### 3.2 The span model — the decision everything follows from

Three models are available. The choice is not a matter of taste; two of them produce wrong
output on ordinary documents.

**Model A — per-span, independent.** Run the whole pipeline on each span separately. Simple,
parallelisable, and **wrong**. Consider the entirely ordinary

```html
"He said <em>'hi'</em> loudly"
```

The spans are `"He said `, `'hi'` and ` loudly"`. Processed independently, the two double
quotes are unmatched in their own spans and stay straight, while `'hi'` pairs _in isolation_ at
**depth 1** — so it takes the locale's **primary** glyphs and comes out `“hi”` in `en-US`, where
the correct answer is the secondary pair `‘hi’` nested inside a converted outer quotation. That
is not a miss, it is visibly wrong output on a construction that appears in every second
paragraph of edited prose. Model A is rejected.

**Model B — naive concatenation.** Concatenate the spans, run the pipeline, redistribute by
offset. This fixes nesting, and introduces two defects of its own, both from **adjacencies that
do not exist in the document**:

- `"a"<code>x</code>"b"` concatenates to `"a""b"`. The `quotes` pass 1 same-kind adjacency veto
  (`quotes.md` §3.2) sees two identical adjacent marks that are _not_ adjacent in the document,
  vetoes both, and the surviving outer pair then quotes across the whole construction:
  `“a""b”`. Wrong output.
- `He said <code>x</code> "hi"` concatenates to `He said  "hi"` with two spaces that render as
  one and are not adjacent in the source. `spaces` collapses them, deleting a character from a
  text node that had a single space in it.

Model B is rejected. Note that both defects are invisible to every per-rule argument, because
each rule is behaving exactly as specified on the input it was given.

**Model C — concatenation with an explicit boundary marker. Adopted.** The spans are
concatenated with a **boundary marker** between each adjacent pair. The pipeline runs once, over
the whole marker-separated array — once per **text unit** (§3.1), which for every mode but
`markdown` with `frontmatterKeys` (§3.7.4) means once per document. Edits are then
redistributed to spans by offset.

The marker gives the rules what Model A denies them — the knowledge that `'hi'` sits inside a
larger quotation — while denying them what Model B wrongly grants: the belief that the last
character of one span touches the first character of the next.

**Markers are negative integers in the code-point array**, not Unicode code points. Every
runtime's array-of-code-points representation (`number[]`, `[]rune`, `list[int]`, `int[]`) holds
them without collision, and no input text can contain them. Implementations must not substitute
real code points — a private-use character or a noncharacter — because that reintroduces the
possibility of collision with author content and makes the classification table below a lie.

**There are two markers, and which one is used is decided by the source text of the gap:**

| Marker                   | Used when                                                                | Classified as                                       |
| ------------------------ | ------------------------------------------------------------------------ | --------------------------------------------------- |
| **−1** — inline boundary | the skipped region between the two spans contains **no** line terminator | §3.3                                                |
| **−2** — line boundary   | the skipped region contains **at least one** line terminator             | a member of **`BREAK`**, for every rule, everywhere |

The test is on the raw source bytes of the gap, so it is decidable without asking the parser
anything and is identical in five runtimes. `a<em>x</em>b` gives −1; `foo\nbar`, `foo\n\nbar`
and `<p>a</p>\n<p>b</p>` all give −2.

**Why a line boundary is a `BREAK` and not just another opaque marker.** Every rule already has
correct, specified, fixture-covered behaviour at a line terminator, because `text` mode has real
ones: `spaces` refuses to touch a run that borders a `BREAK` (`spaces.md` §3.2 step 4), `dashes`
declines a token with a `BREAK` at `cp[L]`/`cp[R]` (§3.2 step 5), `quotes` counts `BREAK` inside
`SPACELIKE`, and `nbsp` never inserts against one. Reusing that behaviour is free and makes a
mode's output on hard-wrapped prose **identical to `text` mode's on the same characters**, which
is the property a mode that silently converts less than `text` cannot claim. See §7.7 for the
alternative that was rejected.

It also removes a parser dependency that would otherwise have been load-bearing. A Markdown hard
break is two spaces before a line ending; whether those spaces land inside a span or in a
structural token is a decision each parser makes differently. With a −2 marker the question does
not arise: the spaces sit next to a `BREAK`, and `spaces` protects a run bordering a `BREAK` in
every mode and every runtime.

### 3.3 How the marker is classified

Every rule already decides from character classes. The **−1 inline marker's** membership is
fixed here, once, and is normative for all rules present and future.

> **The class names below are per-rule, not spec-wide.** Each rule document defines its own
> `SPACELIKE`, `OPENISH` and `CLOSEISH`, and they differ: `nbsp`'s `SPACELIKE` is the largest
> (it includes the fixed-width spaces), and its `OPENISH`/`CLOSEISH` are **locale-data-driven**,
> since they contain the declared quote glyphs. Read each row as "the marker is a member of that
> rule's class of this name, wherever the rule defines one" — not as a claim that one class of
> that name exists. Conflating two same-named classes across documents is precisely what
> produced the `STRIP-BEFORE` divergence recorded in `dashes.md` §3.2 step 9. (The **−2 line marker** is
simply a member of `BREAK` and of nothing else, so it needs no table: every rule's existing
`BREAK` handling applies to it unchanged.)

| Class family                                                                                | Marker is a member?                         |
| ------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `SPACELIKE`, `SP`, `NOBREAK`, `OTHER-SPACE`, `BREAK`                                        | **no**                                      |
| `LETTER`, `DIGIT`, `ALNUM`, `UPPER`, `WORDISH`, `ROMAN`                                     | **no**                                      |
| `DASH`, `INERT-DASH`, `DASHISH`, `SENTENCE-DASH`, `HY`, `NBHY`                              | **no**                                      |
| `DOTLIKE`, `STRIP-BEFORE`, `TERMINAL`                                                       | **no**                                      |
| `STRAIGHT`, `SQ`, `DQ`                                                                      | **no**                                      |
| `OPEN-BRACKET`, `CLOSE-BRACKET`                                                             | **no**                                      |
| any literal matching list (`abbreviations`, `beforeUnits`, `hyphen.*`, the trademark table) | **no** — the marker never matches a literal |
| `OPENISH` **and** `CLOSEISH` (`quotes`, `apostrophe`)                                       | **yes, both**                               |
| `CLOSEISH` (`nbsp`)                                                                         | **yes**                                     |
| `OPENISH` (`nbsp`), `OPENQUOTE` and `CLOSEDELIM` (`apostrophe`)                             | **no**                                      |

and one exemption:

> In `quotes` §3.2's `canOpen` right-test, which rejects a `right` in `CLOSEISH`, the marker
> receives **the same exemption `STRAIGHT` receives** and does not disqualify.

**One rule reads the marker as a trigger rather than as a class member (spec 1.4.0).** `quotes`'
span-boundary elision veto (`quotes.md` §3.2) fires only when a `NARROW` mark's literal left or
right neighbour *is* the −1 marker, and then reads the `LETTER` run on the mark's other side
against a cited locale list. That is not a class membership and adds no row above: the marker
stays in exactly the classes this table gives it. It is recorded here because the veto exists
precisely to repair what those memberships cost — `MARKER` in `OPENISH` and in `CLOSEISH` is
what let `` `x`'s `` and `l'<em>idée</em>` be classified as quotation candidates, inverting the
enclosing pair (canonical issue #53). **The memberships themselves must not be narrowed to fix
that**: the rows below (`"<em>hello</em>"`, `"a"<code>x</code>"b"`) depend on them, and removing
the marker from either class breaks every quotation that begins or ends at a span boundary, at
both widths.

**The two mistakes are not the same size, and conflating them misleads a port reviewer.** The
other tempting fix — letting the marker satisfy the medial-elision veto's `ALNUM` test — is
stated over `NARROW` (`quotes.md` §3.2), so it cannot touch the two `WIDE` rows below at all.
Its witnesses are their `NARROW` forms: `<em>'fine'</em>` and `'a'<code>x</code>'b'`. Measured,
not argued — that variant breaks the released fixture
`en-us-markdown-commonmark-boundary-nested-quotes`, whose input is `*'hi'*`.

Everywhere else the marker is opaque content: it is "a content character" and nothing more —
**with one exception, which is normative and which resolves a contradiction between this
document and `spaces.md`.**

> ### Edge tests — the marker behaves as `NONE`
>
> Where a rule asks not _"what character is here"_ but _"am I at the edge of the text I am
> allowed to modify"_, the marker behaves as **`NONE`**, exactly as the end of the array does.
>
> There is currently **exactly one such test in the whole spec**: the boundary guard in
> `spaces.md` §3.2 step 4. Every other test in every other rule asks the first question, and the
> marker remains opaque content for all of them.

**Why the exception exists, and why it is not a licence to add more.** Read without it, this
document said a span-final run of spaces has content on both sides, so `spaces` may collapse or
delete it. `spaces.md` step 4 said the opposite in the same breath, and named the reason — a
trailing run "in `html` mode [is] frequently the only separator between two inline elements".
Both cannot be true. The contradiction is resolved in favour of `spaces.md` for three reasons:

- **`spaces` is the only rule that deletes.** Its boundary guard exists because deletion at an
  edge is irreversible and the rule cannot see past the edge to know whether the character
  mattered. At a span edge it genuinely cannot: there is markup there. Every other rule either
  replaces one-for-one or is already constrained by §3.4, so none of them needs the exception and
  none of them may claim it.
- **The literal reading is destructive, not merely different.** `<em>mot</em> !` in `fr` has its
  space deleted by `spaces` (`!` is in `STRIP-BEFORE`), after which `nbsp`'s U+202F insertion is
  discarded by the edge-growth rule because the insertion point is now a span edge. Output:
  `<em>mot</em>!` — a character removed and nothing put back — where `text` mode on the same
  prose gives `mot⍹!`. §7.4 calls a mode that diverges from `text` on identical characters
  indefensible, and this would have been the sharpest instance of it. Under the exception the
  space survives, `nbsp` converts it in place (1 → 1, permitted at an edge), and the two modes
  agree.
- **It makes the round-trip guarantee stronger, never weaker.** The exception only ever causes
  `spaces` to do less: `a  <!--x-->  b` is returned untouched instead of collapsed. Fewer edits
  to bytes the rule cannot fully see is the direction §4 already points in.

**The generalisation, for future rules:** a rule that _deletes_ must treat a span edge as the end
of the text. A rule that replaces or inserts must not — §3.4 governs it instead. If a rule is
ever added that deletes, it inherits this clause and must say so here.

**Why `nbsp` differs (spec 1.2.0).** `nbsp` reads `CLOSEISH` in one place only, the right-context
guard of N1/N2 (`nbsp.md` §3.3 step 2). Membership there is what lets the no-break space come back
after `spaces` deleted the typed one before a mark that ends an inline element:
`<strong>Label :</strong>` in French. It reads `OPENISH` at the quote-glyph guard (`nbsp.md` §3.3
step 3), in the left-boundary tests of N3, N7, N9 and N10, and in N3's following-token guard. At
the quote-glyph guard, membership would lose the narrow space in `<em>non</em> !`. At the other
tests nobody has measured its effect.
Up to spec 1.1.0 this row read "yes, both" for `nbsp` too, while every runtime implemented
"neither". `nbsp.md` §7 item 12 records how the split was decided. `apostrophe`'s `OPENQUOTE`
(`apostrophe.md` §3.1, spec 1.2.0) excludes the marker for a simpler reason: case 3 already
accepts it through `CLOSEISH`, so membership would change nothing.

**Why dual `OPENISH`/`CLOSEISH` membership plus the exemption.** These three settings are what
make quotation marks pair correctly across an inline element, and they were derived by working
the cases, not by analogy:

| Input                            | Concatenation             | Result                                                                                                                                                                                                                  |
| -------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"<em>hello</em>"`               | `"⟦hello⟧"`               | the opening mark's `right` is the marker; it is exempted from the `CLOSEISH` rejection, so `canOpen` holds. The closing mark's `left` is the marker — not `NONE`, not `SPACELIKE` — so `canClose` holds. **They pair.** |
| `"a"<code>x</code>"b"`           | `"a"⟦"b"`                 | the second mark's `right` is the marker, in `CLOSEISH`, so `canClose` holds and `"a"` pairs. The third mark's `left` is the marker, in `OPENISH`, so `canOpen` holds and `"b"` pairs. **Two pairs, correctly.**         |
| `"He said <em>'hi'</em> loudly"` | `"He said ⟦'hi'⟧ loudly"` | outer pair at depth 1 → primary; inner pair enclosed by it at depth 2 → **secondary**. The Model A defect is gone.                                                                                                      |

Treating the marker as `NONE` instead — the intuitive choice, "a span edge is like the edge of
the text" — fails the first row: both marks are dropped and nothing converts. Treating it as
plain opaque content fails the second: the closing mark of `"a"` is not `canClose` because its
`right` is in none of the accepted classes. Only the dual membership plus the exemption passes
all three.

### 3.4 Every other rule gets the right behaviour for free

Because the marker is opaque content and is in none of their classes (apart from the memberships
in the table of §3.3), the remaining rules decline to work across a boundary **without any
special-casing**:

| Situation                     | Concatenation    | Outcome                                                                                                                                            |
| ----------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<em>foo </em>- bar`          | `foo ⟦- bar`     | `dashes`: the code point left of the dash is the marker, not a space, so `lsp = 0` while `rsp = 1` — the symmetry guard declines. Miss, not damage |
| `He said <code>x</code> "hi"` | `He said ⟦ "hi"` | `spaces`: two runs of length 1 separated by the marker, not one run of 2. No collapse                                                              |
| `5 <em>km</em>`               | `5 ⟦km`          | `nbsp` N5 requires `cp[a-1]` to be `SP` or `NBSP`; it is the marker. Declines                                                                      |
| `из<em>-под</em>`             | `из⟦-под`        | `hyphen`: no listed form matches across the marker. Declines                                                                                       |
| `(c<em>)</em>`                | `(c⟦)`           | `symbols`: the literal `(c)` does not match. Declines                                                                                              |

**No rule can produce an edit whose span contains a marker.** Every rule's edit span is a
contiguous run of characters drawn from classes the marker does not belong to, or a literal
match the marker cannot participate in. This is what makes redistribution unambiguous, and it
is a **proof obligation on every future rule**: if a new rule could match across a marker, it
must state how its edits are redistributed. As a safety net, an implementation that computes an
edit whose span contains a marker **must discard that edit** and should report it as a bug.

**The edge-growth rule.** An edit is described by the span it replaces, `cp[p … q]` in the
concatenation, and a replacement sequence of length `r`. For an insertion, `q = p - 1` and the
replaced length is zero. Every edit lies wholly within one processable span `S = cp[s₀ … s₁]`.

> **An edit is discarded if it would place code points at an extremity of its span that were
> not there before.** Formally, with `d = q - p + 1` the replaced length and `w` the replacement:
>
> - if `p = s₀` and (`r > d`, **or** `r > 0` and `w[0]` is U+0020 and `cp[p]` is not U+0020)
>   → **discard**;
> - if `q = s₁` and (`r > d`, **or** `r > 0` and `w[r−1]` is U+0020 and `cp[q]` is not U+0020)
>   → **discard**.
>
> An insertion has `d = 0`, so `r > d` always holds and an insertion is discarded exactly when
> its position coincides with a span edge. That is what this section said before; the rule below
> generalises it.

**The second clause, and why the length test alone was not the rule it claimed to be (spec
1.3.0).** The sentence above is the rule; `r > d` was an incorrect formalisation of it, and the
gap is **`r = d`**. `dashes` P3 admits a run of two _or three_ dashes, so a tight `---` is a
3 → 3 replacement in every `-spaced` locale: the length test sees nothing, and U+0020 lands on
both extremities of the span anyway. Measured, and both cases are ones this document already
claims to have closed:

| Mode       | Input             | Locale  | Before the second clause | What breaks                                               |
| ---------- | ----------------- | ------- | ------------------------ | --------------------------------------------------------- |
| `html`     | `a<em>---</em>b`  | `de-DE` | `a<em> – </em>b`         | the element begins and ends with a space it never held — the harm §7.3 exists to prevent |
| `markdown` | `x *---* y`       | `de-DE` | `x * – * y`              | the asterisks are de-flanked, so the span partition of §5 item 2 is not stable |
| `yaml`     | `description: a:---b` | `de-DE` | `description: a: – b` | **the document no longer parses** — `: ` is now a mapping indicator |

The second clause tests the **character**, not the length, and it tests only U+0020 because
U+0020 is the only code point any rule emits whose meaning comes from its position rather than
from itself (§5 item 2). It leaves every case in the table below unchanged: a one-for-one
`"` → `“` still applies at an edge, a contraction still applies, and a `-spaced` edit that
already spans the surrounding spaces still applies, because there a U+0020 replaces a U+0020.

**This is a behaviour change to `html` and `markdown`, which shipped at v1.0.0**, not only to the
mode added in 1.3.0: three dashes at a span extremity are now left alone in a `-spaced` locale,
exactly as two already were. It needs its own changelog entry, in the terms the rest of the
public copy uses.

**Why it had to be generalised, and what it costs.** The previous formulation discarded
_insertions_ only. But a rule can grow a span with a **replacement**: `dashes` emits a `-spaced`
form by replacing the dash token with `U+0020 – U+0020`, which is one code point becoming three.
When the dash is the whole span, the two new spaces land on the span's edges, and the previous
filter did not see them because no insertion occurred. Three consequences, all observed:

- **html** — `a<em>--</em>b` became `a<em> – </em>b`. The element now begins and ends with a
  space it never contained: the precise harm §7.3 exists to prevent, arriving by a route §7.3
  did not cover.
- **markdown, span partition** — `*–*` became `* – *`, which de-flanks the asterisks so that on
  the next run they are literal content rather than emphasis delimiters. §5 item 2 requires the
  span partition to be stable; it was not.
- **markdown, unbounded growth** — `a\n\n–\n\n'` became `a\n\n – \n\n'` and then
  `a\n\n  –  \n\n'`. The emitted space migrates into the line prefix, which is _outside every
  span_, so the next run starts from a fresh span and emits another one. The document grows
  without bound on every re-processing — which for content re-processed on each save is not a
  cosmetic defect.

Both clauses are mechanically checkable from `(p, q, r, s₀, s₁)` and the replacement's own first
and last code points, with no rule cooperation and no knowledge of Markdown, HTML or YAML syntax.
Together they distinguish exactly the cases that matter:

| Edit                                   | At an edge? | `d` → `r` | Verdict                                                     |
| -------------------------------------- | ----------- | --------- | ----------------------------------------------------------- |
| `"` → `“` (`quotes`)                   | yes         | 1 → 1     | **applied** — a one-for-one replacement never grows an edge |
| `--` → `␣–␣` (`dashes`, `-spaced`)     | yes         | 2 → 3     | **discarded** by the length clause                          |
| `---` → `␣–␣` (`dashes` P3, `-spaced`) | yes         | 3 → 3     | **discarded** by the character clause — the length clause misses it entirely |
| `a--b` → `a␣–␣b` (same edit, interior) | no          | 2 → 3     | **applied** — growth is only a problem at an extremity      |
| `␣--␣` → `␣–␣` (the edit spans its own spaces) | yes | 4 → 3    | **applied** — a U+0020 replaces a U+0020, so no edge changed |
| `(c)` → `©` (`symbols`)                | yes         | 3 → 1     | **applied** — shrinking is always safe                      |
| U+0020 → U+00A0 (`nbsp`)               | yes         | 1 → 1     | **applied** — U+00A0 is not U+0020                          |
| insertion of U+202F (`nbsp` N1/N2)     | yes         | 0 → 1     | **discarded**, as before                                    |

**Deletion at an edge is not restricted**, and does not need to be. A rule can only delete
U+0020 (`spaces`), and a deletion cannot bring into existence a structural token that was not
already there — it can only remove a character from inside a span. The whitespace that _is_
structural in Markdown — a line prefix, a list marker's indentation, the two spaces of a hard
break — is protected by the −2 line marker (§3.2): it sits beside a `BREAK`, and `spaces`
refuses to touch a run bordering one, in every mode.

`fr` `mot<em>!</em>` therefore still keeps no narrow no-break space, for the reason §7.3 gives,
and `a<em>--</em>b` is now left alone as well in every `-spaced` locale (§7.9).

(The original witness for this defect was `a<em>–</em>b`, with an authored en dash. It is still a
fixed point, but it no longer demonstrates anything: `dashes` §3.2 step 2a declines every token
containing an authored U+2013 or U+2014, so that input is now refused a step earlier and never
reaches the edge-growth rule. `--` is the live carrier.)

### 3.5 Applying the result

1. Extract the span sequence from the source. Record each span's **source offsets**.
2. Build the code-point array `S₁ ⌢ [m₁] ⌢ S₂ ⌢ [m₂] ⌢ … ⌢ Sₘ`, where each `mₖ` is **−1 or −2
   by §3.2's test on the raw source of that gap** — not always −1. In `yaml` the −2 is the common
   case, since a block scalar's spans are separated by a line terminator. **Whether a −1 can
   arise in `yaml` at all is open** — no construction has been exhibited, and §3.8.4 step 9
   gives flow collections no spans — see `quotes.md` §3.2, which depends on the answer for
   nothing but states the obligation it creates: a rule must key off the marker, never off the
   mode.
3. Run the pipeline **once**, in `order.json` order, over that array. A document with a second
   text unit — `markdown` with `frontmatterKeys`, and only that (§3.1, §3.7.4) — repeats steps 1
   to 4 for it. The two edit sets are disjoint, because no span of one unit lies inside the other.
4. Each edit lies wholly within one span (§3.4). Map it back to source offsets.
5. Emit the **original source bytes**, with those replacements applied and nothing else changed.

Step 5 is the round-trip guarantee and is stated in full in §4.

### 3.6 Skip list — `html`

Skipped, exhaustively and exactly:

- the **entire subtree** of `code`, `pre`, `kbd`, `samp`, `var`, `script`, `style`, `textarea`,
  `svg`, `math` — including any nested elements, whatever they are. A `<pre><em>x</em></pre>`
  is skipped whole;
- **every attribute**, name and value, of every element, without exception;
- **every well-formed character reference** — `&name;`, `&#1234;`, `&#x2014;` — as an opaque
  unit. A text node containing one is split into spans around it, so the reference's spelling is
  preserved exactly, which is the only way `&nbsp;` does not become a literal U+00A0 and back.
  **A bare `&` that begins no well-formed reference stays inside its span.** No rule emits or
  deletes `&`, so it is in no danger; lifting it out would create a boundary that suppresses
  conversions on both sides of it for nothing — `Tom & Jerry's "book"` would lose the pairing of
  its quotation marks. Well-formedness, not the presence of an ampersand, is what makes a
  skipped region;
- comments, CDATA, doctype, processing instructions, and any prologue.

**Element names compare case-insensitively**, per HTML: `<CODE>`, `<Code>` and `<code>` are all
skipped. (In MDX, JSX names compare case-sensitively — §3.7.3.)

`svg` and `math` are skipped although neither appears in PLAN.md §3.2's list. Neither is prose:
in MathML a quotation mark, a hyphen and a prime are **operators and identifiers**, where
substituting a curly glyph or an en dash changes what the expression means, not how it looks.
The accepted cost is that `<svg><text>` and `<svg><title>` do hold real prose and are now left
untypeset. That asymmetry is deliberate — widening a skip list later is additive, while
narrowing one after release breaks every document that depended on the wider behaviour.

Everything else is processable, **including unknown and custom elements** (`<my-callout>`,
`<Foo>`). An unknown element is far more likely to be a wrapper than a code container, and
guessing from its name is exactly the kind of heuristic that behaves differently in five
runtimes. **The skip list is closed**: extending it is a spec change, not an implementation
decision.

### 3.7 Skip list — `markdown`

#### 3.7.1 The dialect is chosen by the caller, never detected

`markdown` is not one language. CommonMark and MDX disagree on ordinary documents: **MDX has no
indented code blocks and no `<https://…>` autolinks; CommonMark has no `{…}` expressions and no
JSX.** A document is frequently valid in both and means different things in each.

> **`markdown` mode takes a required `dialect` option**, one of:
>
> | value          | language                                                                                                                               |
> | -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
> | `"commonmark"` | CommonMark 0.31 **plus GFM** — tables, strikethrough, task lists, autolink literals                                                    |
> | `"mdx"`        | MDX 3 — CommonMark plus GFM, **minus** indented code blocks and `<…>` autolinks, **plus** JSX elements and `{…}` expression containers |
>
> It has **no default**, and omitting it when `mode` is `"markdown"` throws, exactly as an
> omitted `locale` does (PLAN.md §5.1). `dialect` is ignored in `text` and `html` modes.

**Detection is forbidden**, and that is the important half. A heuristic is available and looks
reasonable — parse as MDX, and if it succeeds _and_ finds an MDX construct, call it MDX — but it
is silently wrong in exactly the case that matters. **One `<https://example.com>` autolink makes
a file invalid MDX**, so the heuristic falls back to CommonMark, and
`export const meta = {slug: "une-note"}` is then no longer an ESM statement but a **paragraph**:
it becomes processable text, and `fr` puts a narrow no-break space before its colon. A silent
false positive inside a machine-read field, in the author's own content format, produced by a
dialect the caller never chose.

The caller always knows which dialect they have — it is the file extension — and the library
never can. Requiring the option moves an unanswerable question to the party that holds the
answer, which is the reasoning that already makes `locale` required. A separate mode id for MDX
was rejected because MDX **is** Markdown with two constructs swapped, so an option on the mode
it varies says what is true; spec 1.3.0 later added `yaml` as a fourth mode id (§3.8), and the
two decisions do not conflict — YAML has no mode to hang off, and a `dialect` on nothing is not
a shape this contract has. **Ratified by the operator as public contract**: the throw carries
its own code, `POLYTYPO_INVALID_DIALECT`. See §7.8.

#### 3.7.2 A document that does not parse in its declared dialect

> **`transform` throws, carrying the stable code `POLYTYPO_MALFORMED_INPUT`.** The parser's own
> error type must never escape. **Ratified by the operator as public contract** — this code and
> `POLYTYPO_INVALID_DIALECT` are part of the taxonomy, not proposals.

**This can only happen in one place, and knowing that is what decides it.** Neither of the other
two languages can fail: HTML parsing is specified with total error recovery, and **every byte
sequence is valid CommonMark** — there is no such thing as a CommonMark syntax error. Only
`dialect: "mdx"` can reject a document, and only because MDX embeds JavaScript: an unterminated
JSX element, a malformed `{…}` expression, a broken `export`. A document that fails there is one
the author's own build already refuses.

Given that, returning the input untouched is the worse option. It would mean polytypo silently
succeeding on a file that is broken, hiding a build error behind a typography pass, and — the
common case — hiding the caller's own mistake of naming the wrong dialect. §3.7.1 forbids
detection precisely so that a wrong dialect is the caller's error rather than the library's
guess; swallowing the consequence would give that decision back with none of the information.
PLAN.md §5.1 fails fast on an unknown locale for the same reason, and this is the same shape.

Two constraints on the throw:

- **The runtime's parser error must be wrapped, never propagated.** A `VFileMessage`, a
  `Nokogiri::SyntaxError` or a Python exception on the public surface puts a dependency's type in
  the contract and is unreproducible in the other four runtimes. Only the code is contractual
  (ARCHITECTURE.md §4.6); a message and a source position are useful and are not part of it.
- **This is the only way input can make `transform` throw.** Every other throw is caused by
  options or by locale data. `transform` was previously total on its input, and it no longer is
  — that is a real change in the shape of the public contract, and it is why the new code needs
  sign-off (§7.8) rather than being an implementation detail.

#### 3.7.3 What is skipped

Skipped, exhaustively:

- **frontmatter** — a metadata block at the very start of the document, delimited by `---`
  (YAML) or `+++` (TOML), skipped whole including its delimiters. **Since 1.7.0 a caller may
  name keys inside a YAML block to process — §3.7.4 — and the skip stands unchanged when they
  do not.** Without it the closing `---`
  reads as a setext underline, `title: Une note` becomes a paragraph, and `fr` inserts a narrow
  no-break space before the colon of a machine-read field. That is a guaranteed false positive
  on the M4 corpus (PLAN.md §8), where every file opens with frontmatter;
- fenced code blocks, including the info string and the fences;
- indented code blocks — **`commonmark` only**; MDX has none;
- inline code spans, including the backticks;
- autolinks `<https://…>` — **`commonmark` only**;
- **link and image destinations and titles** — the `(…)` of `[text](url "title")`, and the
  definition line of a reference link. The **link text** is processable;
- **GFM constructs**: table pipes, delimiter and alignment rows, task-list checkboxes,
  strikethrough delimiters, and footnote definition labels. GFM is enabled in **both** dialects,
  and saying so is not decoration: §4's promise that table alignment rows survive is empty
  unless tables are recognised at all, and §6's `[P: html, markdown]` marking on `dashes`' URL
  bullet holds **only** because GFM autolink literals make a bare `https://…` a link — in pure
  CommonMark a bare URL is ordinary text and would be typeset;
- HTML blocks and inline raw HTML, which are handed to the `html` skip list of §3.6 rather than
  processed as markdown. **Inline HTML arrives as isolated tags with Markdown between them**,
  not as a tree, so §3.6's subtree rule must be implemented as a **stack of open skipped
  elements**: push on a start tag whose name is in the skip list, pop on its matching end tag,
  and treat everything as skipped while the stack is non-empty. An unclosed skipped start tag
  skips to the end of the block. Without the stack, `<code>a *b* c</code>` leaks its Markdown
  middle back into a span;
- **MDX only**: JSX expression containers `{…}` in full, and every JSX attribute. **JSX element
  children are processable** — `<Callout>Some text here</Callout>` is prose the author wrote and
  wants typeset, and MDX is the author's own content format (PLAN.md §8, M4).

**Element names compare case-sensitively in JSX and case-insensitively in HTML.** `<Code>` is an
MDX component and is **not** in the skip list; `<code>`, `<CODE>` and `<Code>` in raw HTML all
are. This follows the two languages rather than any choice of ours, and an implementation that
lower-cases JSX names before matching will skip a component's children.

Nesting follows the same rule as `html`: a skipped construct is skipped whole, including
anything that looks processable inside it.

#### 3.7.3a Where the frontmatter block begins and ends

**Spec 1.8.0.** §3.7.3 skips "a metadata block at the very start of the document, delimited by
`---` (YAML) or `+++` (TOML)". That is prose, and frontmatter is in neither CommonMark nor GFM,
so until now each runtime reached the construct through its own parser's frontmatter support —
four extensions, four answers. Measured on the published 1.7.0 line, `en-US`, `commonmark`,
asking only whether the block is skipped or typeset as prose:

| document                                    | JS      | Python  | Go          | Ruby        |
| ------------------------------------------- | ------- | ------- | ----------- | ----------- |
| `---` / `title: "x - y"` / `---`            | skipped | skipped | skipped     | skipped     |
| trailing space on the **opening** delimiter | skipped | skipped | **typeset** | **typeset** |
| trailing space on the **closing** delimiter | skipped | skipped | **typeset** | **typeset** |
| `...` as the closer                         | typeset | typeset | typeset     | typeset     |
| `---` after a leading blank line            | typeset | typeset | typeset     | typeset     |

Two of four turn `date: "2026-09-26"` into a quoted-and-curled string over one trailing space
that no author typed on purpose, and both were conformant, because no fixture pinned the edge.

> **The block's extent is decided by the scan below, not by a parser's frontmatter support.** A
> runtime whose parser also recognises the construct must produce the same extent as this scan; the
> scan is what a fixture pins and what a disagreement is measured against.
>
> **And the parser is handed the block masked out.** The source given to the Markdown parser is the
> document with the located block — both delimiter lines included, **and the leading U+FEFF of step
> 1 if there is one** — replaced by U+0020, line terminators kept as they are, so that nothing
> inside the block can form or close a construct in the body.
>
> **The masked source must be positionally aligned with the original in the unit the runtime maps
> parser offsets back through.** That is the invariant, and it is not the same as "one U+0020 per
> code point": a runtime that hands its parser's byte offsets straight through owes byte-length
> preservation, and masking `😀` to a single space shortens its source by three and shifts every
> body offset after it. A runtime that converts offsets against the **masked** source before
> reading them against the original owes code-point alignment only, which one U+0020 per code point
> gives it — and in a language whose strings are sequences of code points, byte-length preservation
> cannot even be expressed. Both are conformant; stating it as an index-unit count was not, and the
> port that indexes code points while its parser counts bytes is what showed it.
>
> **And no span may lie inside the block, whatever the parser did with the masked text.** Masking
> is what makes that true for most parsers and it is not sufficient for all of them: measured,
> tree-sitter-markdown reads a final all-space line with no terminator as a paragraph, so a
> document whose closing `---` ends the file comes back with a span over the delimiter itself —
> the parser did not see the block at all, and step 5's "end of input ends a line" is the clause it
> does not implement. A runtime whose parser emits such a span **clips it to the part outside the
> block, and drops it when nothing is left**: the block's own characters must not reach the rules,
> and body prose past the block must not be lost to a parser's mistake about where the block ended.
> The mask is there so the parse is not deformed; this rule is there so the spans cannot be wrong
> even when it is.
>
> The mark is masked with the block because leaving it out breaks both: a first line of U+FEFF
> followed by spaces is not blank, no parser is required to strip the mark, and goldmark does not.

Masking is not an implementation note, and the runtime that skipped it is measured. Suppressing a
span inside the block's range is not enough, because the parser has already read the block's
characters by then: a fenced-code line inside a metadata value pairs with the body's own fence, and
the body's code block and its prose swap places. One document, the same call in four runtimes, on
published 1.7.0:

````
--- 
x: |
  ```
---

```
code "q"
```

Body "q".
````

| runtime    | result                                                                      |
| ---------- | --------------------------------------------------------------------------- |
| JS, Python | `code "q"` stays straight, `Body “q”` converts — correct                    |
| Go         | **`code “q”` is typeset inside the code block**, and `Body "q"` is missed    |
| Ruby       | correct with this bare-looking fence, wrong the moment the fence has a space |

Go reaches that by parsing the whole source and suppressing spans in the block's range, which is
the obvious way to do it without a frontmatter-aware parser and is wrong for a reason no span-level
rule can see: the damage is in what the parser concluded, not in which spans were emitted. Masking
costs one pass over a known range and removes the class.

**The scan**, over the source's code-point array, in §3.8.4's terms:

1. the document must **begin** with the delimiter — `---` or `+++` at offset 0, no leading blank
   line and no indentation. **A single leading U+FEFF is stepped over first** and is not part of
   the document for this scan. It is a byte-order mark, not content: every editor that writes one
   writes it before the fence, and reading it as content would deny the block to every file some
   Windows editors produce. Measured on 1.7.0, JS and Python already step over it and Go and Ruby
   do not — the same two-against-two split, on the same damaging side, as the trailing space;
2. the rest of that line must be only U+0020 and U+0009. Anything else and there is no block, and
   what the line then is belongs to the dialect rather than to this scan: `--- yaml` is not a
   thematic break, since a break admits only spaces and tabs after its run;
3. the **closing line** is the first later line whose first code point begins the same delimiter,
   followed by only U+0020 and U+0009. Indentation disqualifies it exactly as it disqualifies the
   opening line — a closer is not searched for inside a line, it is a line. `...` is not a closer
   in either matter, a delimiter of the other kind is not one either, and a fourth delimiter
   character is not whitespace, so `----` closes nothing;
4. with no such line there is **no block**, and the opening delimiter is whatever the dialect makes
   of it — a thematic break for `---`, ordinary paragraph text for `+++` — with everything after it
   prose, which is what `en-us-markdown-commonmark-frontmatter-unterminated` already pins;
5. a **line ends as CommonMark ends one** — at U+000A, at a U+000D that is not followed by
   U+000A, or at the end of input — and the terminator is never part of the line. So a CRLF
   document gives the same block as the same bytes with LF, a file whose last line is `---\r`
   with no final U+000A still closes its block, and a document written with lone U+000D line
   endings has one at all.

   **This is the Markdown document's line model, and it is deliberately not §3.8.4's.** The block
   is a Markdown construct, so it ends its lines the way the language around it does. The content
   inside it keeps §3.8.4's LF-only model — and the reason is not that YAML agrees, because it
   does not: YAML 1.2.2 §5.4 admits a lone U+000D as a line break too. §3.8.4 is a deliberate
   simplification, taken and measured in 1.3.0, and this section does not widen it, because
   widening the content scan's line model is a change to `yaml` mode for every caller and wants
   its own measurement. A port that harmonises the two has silently made that change. What it
   costs here is recorded in §7.13.

   All three shapes above are documents whose metadata a stricter reading hands to the rules, and
   the reference runtime already treats all three as blocks — measured on 1.7.0.

**Which way to be wrong, and why this way.** A locator errs in one of two directions and they are
not the same size. Recognising a block that is not one skips text that was prose: a miss, and
§3.8.3 already accepts misses by the dozen. Failing to recognise a block that is one hands the
metadata to the rules as prose: `title: Q3 review: what changed` takes a no-break space before
its colon in `fr` — U+00A0, since `fr` puts `:` in `beforePunctuation` and only `;`, `!` and `?`
in the narrow list — and a date grows quotation marks. The first is invisible and harmless;
the second is the damage §3.7.3 exists to prevent. **So the wider reading wins every edge where
the runtimes disagree**, and the trailing-space clause of steps 2 and 3 is that reading written
down.

The accepted cost is stated rather than hidden: a document whose very first line is a thematic
break written as `--- `, followed by prose and another `---` line, has **everything up to that
line** skipped — not one paragraph but the whole first section, heading included, since the scan
takes the first later delimiter line whatever lies between. It is skipped by JS and Python today,
has been for every release, and nobody has reported it — while a frontmatter block carrying
trailing whitespace on its fence is what any editor that trims nothing produces.

**What this costs each runtime.** JS and Python already behave this way, so the change there is
that the extent stops being their parser's opinion and becomes this scan's — which also removes
the second parse `frontmatterKeys` cost them (polytypo/polytypo#59), since locating the block no
longer needs one. Go and Ruby change behaviour: both must widen their locator to admit trailing
U+0020 and U+0009 on either delimiter. Go already owns a hand-written locator for exactly this
reason and `detectFrontmatter` is where it lives.

#### 3.7.4 Frontmatter by named keys — the one opt-out from §3.7.3

**Spec 1.7.0.** §3.7.3 skips the frontmatter block whole and its reason for doing so still holds.
It is also the one place where the default hides the sentence most readers of the page will see:
where frontmatter carries `title`, `description` and `summary`, those strings are the heading,
the `<title>`, the meta description and the card text, so the single most visible string on the
page is the one polytypo will not touch. Both reports that asked for this — polytypo/polytypo#13,
and the production integration in #26 over 196 MDX posts, independently — hand-rolled it instead,
and the first of them corrupted its own content doing so: its extractor knew double-quoted YAML
scalars and silently skipped every single-quoted one.

> **`markdown` mode takes an optional `frontmatterKeys` option: the mapping keys in the
> document's YAML frontmatter block whose scalar values are processable.** Absent means
> §3.7.3 unchanged — the block is skipped whole, delimiters included. An **empty list is
> legal** and yields no spans, as it does for `keys` (§3.8.2). A value that is not a list of
> strings throws `POLYTYPO_INVALID_OPTION`.

**Ratified by the operator as public contract, 2026-09-25**, under this name rather than by
widening `keys`. Three reasons, in the order that decided it: `keys` is **required** in `yaml`
mode and optional here, so one name would carry two requiredness contracts; `polytypo` 1.6.3
**accepts a `keys` it ignores** in `markdown` mode — measured, not assumed — so reusing the name
would silently begin typesetting frontmatter for any caller who passes one options object to both
modes; and the name says which block it governs, which a bare `keys` on a mode whose body is also
full of keys does not.

**What the option governs, in source offsets.** The block is the frontmatter construct §3.7.3
already recognises, and the option only changes what happens inside it:

- the **content** is the source from the code point after the opening delimiter line's
  terminator to the code point that begins the closing delimiter line. A U+000D before that
  terminator belongs to the terminator, exactly as in §3.8.4, so a CRLF document and the same
  bytes with LF give the same content;
- **a line of that content containing a U+000D not followed by U+000A yields no spans**, exactly
  as §3.8.4 step 1 already declines a line containing U+0009 and for the same kind of reason. The
  two line models meet here and do not compose: §3.7.3a step 5 finds the block in a lone-U+000D
  document, and §3.8.4's LF-only scan then reads that whole block as one line. Measured, the
  result of letting it through is not merely inert — `title: a "b` and `c" d` on two mapping
  lines pair their marks across the boundary, an unlisted line inside the listed key's scalar
  takes `fr`'s spacing, and the U+000D lands **inside a span**, which §3.8.4 forbids in the same
  breath. Per line rather than per block, because a stray U+000D inside one quoted value is
  something people produce by accident and it should cost that value rather than the whole block:
  a lone-U+000D document is one §3.8.4 line and loses everything, a document with one such value
  loses that line and keeps the rest. **The test runs to the start of the next line, not to the
  end of this one**, because §3.8.4's own splitter treats a trailing U+000D as a terminator even
  without a U+000A after it — so a block whose single line ends in one looks clean if the
  terminator is excluded, and one of the four lone-U+000D fixtures separates the two readings.
  **The decline drops the spans the content scan produced for that line; it does not alter the
  content the scan is given, and a span reaching a declined position is dropped whole rather than
  trimmed.** Three ports reached for the shortcut of substituting the U+000D for another
  character the scan already declines, and it is not equivalent: substitution moves the character
  to a different line and can end a value run, so `title` / `slug` / a content-final U+000D
  converts both keys instead of one, and a stray U+000D on a key whose value run continues onto
  an indented line converts a key that is not a key. Both shapes are pinned, and both agree with
  what `yaml` mode already does with the same characters — measured in two shipped runtimes.
  **Where this rule and `yaml` mode part is on purpose, and it is one shape:** a content line
  whose terminator is a bare U+000D is clean to `yaml` mode, which strips it, and declined here,
  because the window includes it. So `title` / `slug` / a content-final U+000D converts `slug` in
  `yaml` mode and does not here. The wider decline is the direction this section takes everywhere
  else — a miss is invisible, a U+000D inside a span is not — and the cost is conversions lost in
  documents written with line endings from the last century. Widening §3.8.4 instead would be a
  change to `yaml` mode for every caller and wants its own measurement;
- **both delimiter lines stay outside every span**, as does every line terminator, so no edit
  can reach `---` itself and §3.7.3's setext-underline hazard is unreachable;
- an **unterminated** block is not a block — §3.7.3 already yields no frontmatter construct
  there, and the option adds no spans to it;
- a **TOML block (`+++`) yields no spans, with the option given or not.** TOML's quoting is a
  second grammar — basic strings escape with U+005C, literal strings do not escape at all, and
  both have multi-line forms — and §3.8.3's posture applies: a construct the scan cannot claim
  with certainty yields no spans. Neither report asked for TOML and no corpus measured here
  contains one, so specifying a TOML locator would be scope taken on speculation. Recorded as an
  accepted miss in §7.13.

**The option adds spans only where §3.7.3's skip removed them.** If there is no block — an
unterminated one, a `---` that is not at the start of the document, an opening line carrying
anything but whitespace — the text is ordinary prose in the body's own unit and the option
contributes nothing. That coupling is what makes double processing unreachable: no source position
can belong to both units — **and since 1.8.0 it is §3.7.3a's mask and its no-span rule that enforce
it**, not an agreement between two locators. Measured while that mask was still being specified, a
block whose closer the body's parser did not accept had its content emitted twice, once by each
unit: `more: b - c` came back as `more: b—cb—c`. **Since 1.8.0 the block's extent is §3.7.3a's
scan** rather than whatever each parser's frontmatter support decided, so the option no longer
inherits a variance that was measured in eleven documents out of twenty.

**Key matching is §3.8.2's, which means bare names at any depth.** `title` is processable wherever
it occurs in the block, `seo.title` included — measured: `seo:` then an indented `title:` is
processed under `frontmatterKeys: ["title"]` — with the cost §7.12 already accepts for `keys`: no
paths, no globs, so a caller with a machine-read `title` nested somewhere must either take it too
or name none. Matching is exact, code point for code point, with no case folding.

**The scan is §3.8's, unchanged.** §3.8.4 steps 1–9, §3.8.5 and §3.8.6 apply to the block content
verbatim, with `frontmatterKeys` as step 8's key predicate in place of `keys`. Nothing about YAML
is specified twice: frontmatter **is** YAML, and the argument that made §3.8 a hand-written scan
rather than a parser call (§3.8.1 — two of the five ecosystems' libraries cannot report an end
offset) applies here for the same reason and with the same measurements. Every miss §7.11 lists
is inherited with it, the quoted-escape bails included, and §7.13 gives what that costs on a real
corpus.

**The frontmatter block is its own text unit, and this is the part that is not obvious.** §3.2
concatenates a document's spans into one array and runs the pipeline once over it, and §7.10
records that a quotation opened in one paragraph can still pair with a mark in the next, because
the stack is not reset at a −2 marker. Measured on `polytypo` 1.6.3 in `yaml` mode, which has
exactly this shape:

```
a: he said "hello          →    a: he said ‘hello
b: world" she said              b: world’ she said
```

Two spans, a −2 marker between them, and the marks paired across it. If frontmatter spans joined
the body's array, the same mechanism would let an unbalanced mark in `title` pair with one in the
first paragraph — and the body's output would then depend on the document's metadata.

> **The frontmatter block's spans form a text unit of their own.** The pipeline runs over
> that array and over the body's array separately; the two edit sets are disjoint by
> construction, since no span of one lies inside the other.

That is one more pipeline run per document and it buys a claim worth having, which a port can
test directly: **`frontmatterKeys` cannot change a byte outside the frontmatter block**, so every
case released before 1.7.0 keeps its recorded output — those cases set no option, and the body is
not reachable from one. The narrower claim is the true one: a released case's *block* would
convert if the option named a key in it. Measured, `fr-markdown-commonmark-frontmatter-nbsp`:
`title: Une note ; suite` takes its narrow no-break space under `frontmatterKeys: ["title"]`,
which is the whole point of the option and not a change to that case. The
asymmetry with `yaml` mode, where one document's keys do pair across each other, is deliberate:
there the whole document is data with prose in it, while here the block is metadata *about* a
document whose prose is the body, and the two are not one sentence in any document.

**The option applies to both dialects**, `commonmark` and `mdx`. YAML frontmatter is the same
construct in both, and §3.7.3 already lists it once for both.

**Validation.** `nbsp.md` §3.1a fixes the order through `dialect` — `mode` → `narrowNbsp` →
`rules` → `locale` → `dialect` — and `ARCHITECTURE.md`'s options table carries the whole of it.
`frontmatterKeys` joins that chain **after `dialect`**, and, like every option, is checked **before
the parse**. Both halves decide a case that is otherwise ambiguous. A call naming neither a valid
`dialect` nor a valid `frontmatterKeys` raises `POLYTYPO_INVALID_DIALECT`, because `dialect` is
first — and unlike `dialect` and `keys`, which belong to different modes and so never both apply,
these two do, which is what makes their order observable at all. A document that does not parse in
its dialect, called with a `frontmatterKeys` that is not a list of strings, raises
`POLYTYPO_INVALID_OPTION` and not `POLYTYPO_MALFORMED_INPUT`.

In `text`, `html` and `yaml` modes the option is **ignored and not validated**, exactly as
`dialect` is ignored in `text` and `html` (§3.7.1). That is the weaker of
the two choices and it is taken for consistency: a mode-specific option that throws in one mode and
is ignored in another teaches a caller nothing they can act on, and `dialect` set the precedent
before this option existed.

**What a fixture cannot express here**, the same gap `nbsp.md` §3.1a records for `narrowNbsp`: the
schema admits only a list of strings and only on a `markdown` case, so neither the throw above nor
the ignored-elsewhere rule has a fixture. Both are each runtime's own unit test, and the order in
this paragraph is what those tests assert.

##### 3.7.4.1 What this was tested against

The corpus is **187 `.mdx` files** — the author's own site content, all of `content/`, of which the
107 under `content/blog/` are the M4 corpus proper (PLAN.md §8). Every one of them opens with YAML
frontmatter and none with TOML. Keys `title`, `summary`,
`description`, `subtitle`, `quote`: **447 listed scalars**. Eight locales (`en-GB`, `en-US`,
`de-DE`, `fr`, `ru`, `es`, `sv`, `tr`), so 1496 file/locale cases per configuration.

Measured with `polytypo` 1.6.3's **`yaml` mode over the extracted block** — the scan this section
reuses — because `markdown` mode with the option exists in no runtime yet. The separate-unit rule
above is what makes that a faithful proxy rather than an approximation: the body cannot
participate.

Three configurations, 4488 cases — the corpus as authored, the corpus de-typeset, and the corpus
de-typeset with **every one of its 39 frontmatter keys** listed: **no byte changed outside a
listed scalar, no parse failure, no structural change, no change to an unlisted leaf, no
idempotency failure.** The de-typeset corpus is derived, and reported as derived: the site's
content is already typeset, so the characters polytypo inserts were folded back to their ASCII
originals to obtain input that has something to convert. It is a weaker corpus than found text,
and it is the only way this corpus can show a conversion at all.

- **The M4 bar holds as written.** As authored, in `en-GB` — the site's own locale — **0 of 187
  files change**. Each of the other six changes 13 files and `fr` changes 117, every one of them
  inside a listed scalar and from that locale's own conventions rather than from anything missed.
- **De-typeset, 247 of the 447 listed scalars convert** in `en-GB`, and none of the other 200
  is a miss: the pipeline leaves them alone in `text` mode too.
- **The measurement is discriminating, which was checked rather than assumed.** The naive thing
  a caller hand-rolls — the same blocks through `text` mode, no scan and no key list — damages
  **every single case**: of 748 (187 files in `en-GB`, `de-DE`, `fr` and `ru`), **420 no longer
  parse as YAML at all, 82 come back with different mapping keys, 246 with different values, and
  none comes back unchanged.** The witnesses are ordinary: `fr` turns the key `name:` into
  `name :`, and `en-GB` turns `slug: "pierre-moreau-architecture"` into
  `slug: "‘pierre-moreau-architecture’"`. A harness reporting clean for both runs would prove
  nothing; this one separates them completely.
- **What the key list protects here.** Listing all 39 keys converts four values the recommended
  five do not, and two of them are damage rather than coverage: in `fr`, `seoTitle` gains a
  narrow no-break space before the colon of a string written for a search engine, and a client
  name `"HTPBE?"` becomes `"HTPBE ?"`. The other two are improvements a caller might well want
  (`"Niamh O'Sullivan"` → `"Niamh O’Sullivan"`), which is the point: only the caller can tell
  those apart, and that is the same argument §3.8.2 makes.
- **The inherited escape bail, measured.** Re-emitting each of the 247 convertible values in
  one quoting style and running the scan over it: **single-quoted, 130 of 247 yield no spans**;
  double-quoted, none do. The reason is §3.8.6's — an apostrophe inside a single-quoted scalar
  is written `''`, which spells content with more characters than it has. Every listed scalar in
  this corpus as written is double-quoted, so the bail never fires on it; a caller whose YAML
  style is single quotes gets nothing on half of their prose, silently. That number is the
  accepted cost of reusing §3.8's scan rather than a defect of this section, and §7.13 records it
  where a reader will look for it.

### 3.8 Skip list — `yaml`

**Spec 1.3.0.** `yaml` is the fourth mode id, and PLAN.md §3.2's "exactly three modes" is amended
by that decision. Two things about it decide everything below, and neither is true of the other
two modes: **no parser is used** (§3.8.1), and **the caller names the keys whose values hold
prose** (§3.8.2). The first is forced by what five ecosystems can report; the second by what YAML
is.

#### 3.8.1 Why a scanner, and why the issue's stated blocker is not one

The request (#18) arrived with a data-corruption report attached. A caller with an `openapi.yaml`
wrote their own splicer over a YAML library, and a block scalar's decoded value carries its
trailing line terminator only for some chomping indicators; they wrote the value back with the
wrong assumption and the following key was absorbed into the string. The file stayed
syntactically valid and became semantically wrong.

**That bug class is unreachable here, and it is unreachable by construction rather than by
care.** It is a property of decode → mutate → **re-encode**, and §1 already forbids the third
step: the source is located, never serialised. A chomping indicator is a byte of the source that
no span contains, so nothing this document permits can misread it, rewrite it, or lose it. The
same sentence disposes of indentation, anchors, tag handles and quoting style.

What the mode needs, then, is not a parser but a **locator**: something that reports the source
offsets of scalar content. The obvious move is to take those offsets from each ecosystem's YAML
library, and it does not survive contact with the five runtimes. Measured, 2026-09-20:

| Runtime | Library                    | Scalar positions                                                     |
| ------- | -------------------------- | -------------------------------------------------------------------- |
| JS      | `yaml`                     | start **and** end, exact to the token                                |
| Python  | PyYAML                     | start **and** end, exact to the token                                |
| Ruby    | Psych                      | start **and** end, as line/column                                    |
| Go      | `gopkg.in/yaml.v3`         | **start only** — `Node` carries `Line`/`Column` and no end position  |
| PHP     | `symfony/yaml`             | **none** — the public surface decodes to values and reports no nodes |

Two of five cannot supply what the contract needs, and PHP has no alternative: `ext-yaml` binds
libyaml's value API and reports no positions either. A parser-backed `yaml` mode is therefore not
portable, and the §4 cost paragraph — "a runtime whose parser cannot report source offsets cannot
implement `html` mode conformantly" — would have excluded two runtimes outright rather than
describing a constraint they could meet.

So the locator is **specified here and hand-written per runtime**, like every core rule and like
locale resolution: a single left-to-right scan over the code-point array, no regular expressions,
no lookbehind. That is a cost — it is the first format knowledge polytypo owns rather than
delegates — and it buys the one thing delegation could not: the same spans in five runtimes.

#### 3.8.2 Why the caller names the keys, and why no heuristic can

> **`yaml` mode takes a required `keys` option: the list of mapping keys whose scalar values are
> processable.** It has **no default**, and omitting it when `mode` is `"yaml"` throws
> `POLYTYPO_INVALID_OPTION`, exactly as an omitted `dialect` throws in `markdown` mode. A value
> that is not a list of strings throws the same code. An **empty list is legal** and yields no
> spans — "process nothing" is a choice a caller may make, not an error.

The first draft of this section had no such option. It processed every string scalar and decided
prose by a content test — a scalar had to contain a space and a letter. Both the option and this
paragraph exist because that draft was **measured against this repository's own
`.github/workflows/`, and it corrupted them**: 37 of 106 spans changed, in `en-US`, `de-DE` and
`fr` alike. Two of the results:

```
run: |
  if ! git cat-file -e "$SHA"; then      →      if! git cat-file -e "$SHA"; then
name: Node ${{ matrix.node }}            →      name: Node ${{matrix.node}}
```

The first is a shell script that no longer parses. Both passed the content test comfortably —
they have spaces and letters, because shell and template expressions are written in words.

**The reason no better content test exists is structural, and it is the whole argument for the
option.** `html` and `markdown` are prose formats with islands of code in them, so a closed skip
list works: the islands are marked by the syntax itself — a `<code>` element, a fence — and
naming them is a finite job this document can do once. **YAML is the inverse: a data format with
islands of prose in it**, and nothing in YAML's syntax distinguishes them. `description`,
`summary` and `title` hold sentences; `run`, `command`, `if`, `image`, `pattern` and `name` hold
things a machine reads. They are the same construct, spelled the same way, and they differ only
in what the schema above the YAML means by them — which the caller knows and the library cannot.

That is the same shape as the `dialect` decision (§3.7.1) and it is settled the same way:
**requiring the option moves an unanswerable question to the party that holds the answer.** The
request itself predicted it — "probably an option for which keys to process, since typesetting a
`url:` or an `id:` value is not wanted" — and the measurement above is what turned that from a
reasonable expectation into a requirement.

**Matching is exact and deliberately dumb**, so that five hand-written scanners cannot disagree:
a key matches iff its source text, with trailing U+0020 removed, equals a member of `keys` code
point for code point. No case folding — ARCHITECTURE.md §4.4 forbids locale-dependent case
operations and Turkish dotless ı is the standing reason. No paths, no globs, no wildcards, no
nesting: a key named `description` is processable wherever it occurs and at any depth. A **quoted
key never matches**, because §3.8.4 step 5 has already declined the line; that is an accepted
cost, recorded in §7.11.

**The option also removes a defect the content test carried**, which is why nothing of it
survives. A content test is a predicate on the text inside a span, and `spaces` can delete the
very U+0020 the predicate reads: `ref: ${{ steps.pin.outputs.sha }}` yielded one span on the
first run, `ref: ${{steps.pin.outputs.sha}}` on the second, and no span at all — §5's obligation
that the span partition be stable, **falsified on a one-line document**. `keys` is a predicate on
the key, which no rule can reach, so the partition is fixed by the source and the obligation
holds again. §5's yaml paragraph records this as the reason the predicate must stay structural.

#### 3.8.3 Skip by default — the rule the scan is built around

> **A construct the scan does not recognise with certainty yields no spans.** The worst outcome
> of a gap in the scan is prose left untypeset. It is never a changed byte.

This is the inverse of the posture `html` takes, where everything not in a closed skip list is
processable (§3.6). The asymmetry is deliberate and follows from §3.8.1: an HTML adapter has a
conforming parser telling it what every construct is, so "process what is not skipped" is a claim
it can back. The YAML scan has no such oracle, so it may only claim what it has proved. **`yaml`
mode names what is processable and skips the rest**, and the list below is closed: extending it
is a spec change.

A consequence worth stating: **`transform` never throws on input in `yaml` mode.** There is no
declared grammar to violate, so §3.7.2's `POLYTYPO_MALFORMED_INPUT` has no `yaml` counterpart. A
file that is not YAML at all yields few spans or none and comes back byte for byte. The only
throw this mode adds is the option throw of §3.8.2, which is about the call, not the input.

#### 3.8.4 The scan

The source is the code-point array of §3.1. A **line** is a maximal run containing no U+000A,
**and a U+000D immediately before that U+000A is not part of the line** — it is a terminator like
the U+000A itself, so it lies outside every span and comes back untouched. Line terminators are
never inside a span, so no rule can create or destroy one. `indent` is the number of leading
U+0020 on the line and `i` the index of the first code point after them.

The carriage-return clause is normative rather than obvious, and it is here because five runtimes
would otherwise inherit five answers from five standard-library calls. Without it a CRLF file
diverges from the same bytes with LF: the block header of §3.8.5 reads as `|` followed by U+000D
and is unrecognised, so the block yields no spans, while a plain scalar carries the carriage
return **inside** its span and hands it to the rules as content.

> **Normative, and the repair of a defect the first draft shipped: a line consumed by a construct
> is never scanned again.** Step 7 defines the one case — an inline value's continuation lines —
> and without it a multi-line quoted scalar, a multi-line flow collection and a folded plain
> scalar all leak their continuation lines back into the scan as if they were mappings.

Lines are processed in order.

1. The line yields no spans if it is empty or all U+0020, or if it contains U+0009 anywhere. A
   tab makes indentation undecidable, which is what every step below depends on.
2. The line yields no spans if `cp[i]` is `#` (comment) or `%` (directive).
3. The line yields no spans if it begins at `i` with `---` or with `...` and the next code point
   is U+0020 or the line ends there. The trailing-content form is declined as well as the bare
   one: `--- key: value` is a node introduced by a document marker, and reading the marker as part
   of a key is how the first draft produced a key of `--- key`.
4. **Block sequence entries are consumed, not skipped.** While `cp[i]` is `-` and `cp[i+1]` is
   U+0020, advance `i` past the marker and past any U+0020 after it. Repeat — `- - key: v` is
   legal and nests. If `i` reaches the end of the line, it yields no spans.
5. **Find the key.** Scan `j` upward from `i`.
   - If `cp[j]` is `"`, `'`, `{`, `[`, `&`, `*`, `!` or `#`, the line yields no spans. This test
     applies at **every** `j`, not only at `j = i`: it declines a quoted, flow, anchored, aliased
     or tagged key, and equally a key that merely contains one of those characters anywhere —
     `a!b: value` yields nothing. The wider reading is the normative one, and saying so is what
     stops a second implementer from testing only the first position and getting a different span
     set. The cost is recorded in §7.11.
   - If `cp[j]` is `:` **and** `j` is the last code point of the line or `cp[j+1]` is U+0020, the
     key is `cp[i … j−1]` with trailing U+0020 removed, and the scan continues at step 6.
   - **Otherwise `j` advances by one and the scan continues**, including when `cp[j]` is a colon
     that is not followed by U+0020 or the line end — such a colon is an ordinary character of the
     key, and `a:b: v` has the key `a:b`. Stating the else-branch is not pedantry: without it the
     first draft admitted two readings of that line, which is the exact divergence §3.8.1 says
     the scan exists to prevent.
   - If no such `j` exists, or the key is empty, the line yields no spans.
6. Let `v` be the index of the first code point after the colon that is not U+0020. **If there is
   none, the value is empty**: the following, more-indented lines are a nested node and are
   scanned on their own. The line yields no spans; go to the next line.
7. Otherwise the line carries an **inline value**, and the **value run** — every following line
   that is blank or indented more than `indent` — belongs to that value. Those lines are never
   scanned as lines of their own. The only spans they can contribute are the ones step 9 takes
   from a recognised block scalar; every other step below yields no spans for the whole run.
8. **The key must be listed.** If the key of step 5 is not a member of `keys` (§3.8.2), the line
   and its value run yield no spans. This is the step that makes `run:`, `if:` and `image:`
   unreachable, and it is checked before the value's form so that an unlisted key costs nothing
   to decline.
9. `cp[v]` selects the form:
   - `&`, `*` or `!` — anchor, alias or tag — and `{` or `[` — a flow collection: no spans.
   - `#`: the value is absent and only a comment follows: no spans.
   - `|` or `>`: §3.8.5, block scalar.
   - `"` or `'`: §3.8.6, quoted scalar.
   - anything else: §3.8.6, plain scalar.

#### 3.8.5 Block scalars — one span per content line, and the chomping indicator never enters

The header is `cp[v]` followed by **at most one** chomping indicator (`-` or `+`) and **at most
one** indentation indicator (`1`–`9`), in either order, then optional U+0020 and an optional `#`
comment, then the end of the line. Any other header is unrecognised and the block yields no
spans. **The header is never inside a span.**

The block's content is the value run of §3.8.4 step 7. Let `bi` be the indentation of its first
non-blank line, or `indent + n` when the header carried an explicit indentation indicator `n`.
**One definition, and three conditions that make the whole block yield no spans** — the block is
consumed either way, never rescanned:

- any line of the run contains U+0009;
- the run's first non-blank line is indented less than `bi`, which can only happen when an
  explicit indicator disagrees with the block as written;
- any later non-blank line of the run is indented less than `bi`.

The last one is the case the first draft left with two readings — `k: |` followed by a line at
four spaces and then one at two — and it is settled by bailing rather than by choosing, because
either choice would be a guess about which line the author meant to be content.

> **Each non-blank content line contributes exactly one span, `[lineStart + bi, lineEnd)`.** Blank
> lines contribute none. The indentation is outside every span; so is every line terminator, and
> so is the run of line terminators at the end of the block that the chomping indicator governs.

That last clause is the direct answer to the report in §3.8.1: **the trailing newlines are not in
any span, so no `yaml`-mode output can add or remove one.** `|`, `|-`, `|+`, `>`, `>-` and `>+`
are handled identically here because the difference between them lives entirely in bytes the mode
never touches.

Extra indentation beyond `bi` on a content line stays **inside** that line's span, because in a
literal block it is content. It is safe there because each content line is its own span and the
gap between two of them contains a line terminator: the marker is a **−2**, a member of `BREAK`,
and `spaces` refuses to touch a run bordering one (`spaces.md` §3.2 step 4). The −1 marker's
`NONE` exception of §3.3 is a different mechanism and is not what protects it.

#### 3.8.6 Quoted and plain scalars

**Quoted.** The scalar must open and close **on the same line**; if the matching quote is not on
that line the value yields no spans, and its continuation lines are consumed by §3.8.4 step 7
rather than rescanned. After the closing quote only U+0020 and an optional `#` comment may
follow. The span is the content between the quotes, exclusive of both.

Two bails make source characters and content characters the same thing, which §3.1's offset model
requires:

- a double-quoted scalar whose content contains U+005C yields no spans — `\n`, `\"` and `é`
  are content the source spells with more characters than it has;
- a single-quoted scalar whose content contains two consecutive U+0027 yields no spans, for the
  same reason.

This is the treatment `html` gives a character reference (§3.6), reached from the same constraint
rather than by analogy. **No colon test applies to a quoted scalar** — quoting neutralises the
colon, and applying the plain-scalar test here is what made the first draft decline
`title: "Chapter 1: the beginning"`.

**Plain.** The scalar runs to the end of the line, minus a trailing comment — the first `#`
preceded by U+0020, and that U+0020 with it — and minus any remaining trailing U+0020. Then:

- **the continuation bail**: if the value run of §3.8.4 step 7 is not empty, the scalar is a
  multi-line plain scalar and yields no spans. Its line folding is a construct this scan does not
  claim;
- **compact nesting is not a value**: the scalar yields no spans if it begins with `-` followed by
  U+0020 or the line end (`key: - item` opens a sequence), or if it contains a colon followed by
  U+0020 or the line end (`key: a .:` is a mapping whose key is `a .`). The second test is exact
  rather than conservative — **a plain scalar can never contain a colon in that position** — and
  it runs here, after the comment has been removed, so that `key: prose # note: here` is not
  declined for a colon that is not in the scalar at all.

> **`:` and `#` are opaque one-code-point skipped units inside a plain scalar.** The scalar's
> range is split at each of them, exactly as a character reference splits an HTML text node.

Without the split, `yaml` mode corrupts documents, and the two witnesses are ordinary:

| Source     | Locale  | Without the split | Reparsed as                                        |
| ---------- | ------- | ----------------- | -------------------------------------------------- |
| `k: a:--b` | `de-DE` | `k: a: – b`       | **a parse error** — `: ` is now a mapping indicator |
| `k: a--#b` | `de-DE` | `k: a – #b`       | `k` is `a –` — the rest became a comment            |

Both come from the same source: `dashes` emits U+0020 in every `-spaced` locale, and **U+0020 is
the only thing that makes either character structural** — a `:` is a mapping indicator only when
a U+0020 follows it, a `#` a comment introducer only when a U+0020 precedes it. With the split,
`:` and `#` lie outside every span, so the dash token sits at a span **extremity**, and §3.4's
edge-growth rule discards a replacement there that is longer than what it replaced. The `-spaced`
form is 2 → 3. It is discarded, in `de-DE`, `fr` and `ru` alike.

**The em-tight form is 2 → 1, and it is applied** — `k: a:--b` becomes `k: a:—b` in `en-US`,
which reparses as the same one plain scalar it was. That is not a hole in the argument, it is the
argument: a contraction cannot emit U+0020, and U+0020 is the whole of what the split protects.
The length test of §3.4 separates exactly the two, with no knowledge of YAML — which is what
makes it bind rules not yet written, while a per-rule observation would not.

The accepted cost is that a conversion whose replacement would **grow** against a colon or a hash
is missed: `fr` inserts no narrow no-break space before a colon inside a **plain** YAML scalar —
inside a quoted one the colon is content, no split applies and the space is inserted, which
`fr-markdown-commonmark-frontmatter-keys-colon` pins — and
`one--two` takes its spaced dash only where the split leaves it interior to a span. That is the
same trade §7.3 already made for `mot<em>!</em>`, and in the same direction: a miss is visible to
the author and fixable in the source; a corrupted document is neither.

#### 3.8.7 What this was tested against

Three bodies of evidence, and the order matters: the first two were run against the **keyless
draft** and are reported here for what they failed to catch, which is as much a part of this
section as what they established.

**A real corpus, span placement only.** 70 YAML files — GitHub Actions workflows,
`docker-compose`, Dependabot, issue-form templates, and two OpenAPI documents including the one
the request came from. The scan's spans were checked against the `yaml` package's own scalar
ranges: **3135 spans, none overlapping a key, none outside a string value scalar, none whose text
was not a literal substring of that scalar's decoded value.** That establishes the **geometry** of
the scan and nothing else. It never ran the pipeline, so every span it approved could still have
been a shell script — and 37 of them were. Read alone it is exactly the kind of measurement that
looks like proof and is not.

**A bounded exhaustive sweep**, in the form `pipeline-idempotency.md` §6 requires of the rules.
Payloads of length 1–4 over the alphabet `a`, U+0020, `-`, **`---`**, `:`, `#`, `'`, `"`, `\` and
`.` in eleven document templates — all three scalar forms, sequence entries, compact nesting,
nested mappings, an interior block-scalar line, and a quoted scalar left open across a line — each
transformed in eight locales, reparsed, and compared against the original's **structure and
non-string leaves**. **977 680 cases, 99 274 of them changed by the transform: no parse failure,
no structural change, no idempotency failure.**

**The sweep is discriminating, and that was checked rather than assumed.** With §3.4's character
clause reverted, the same run reports **480 structural changes** — `k: a:---a` becoming
`k: a: – a`, a string turning into a nested mapping — in every locale that emits a spaced dash. A
measurement that passes both with and without the thing it is supposed to protect proves nothing,
and two earlier versions of this sweep were in exactly that position.

**Three things it could not find**, each worth naming because each cost something.

- It did not find the workflow damage, because a shell script inside a block scalar is a string
  before the transform and a string after it. **Structural equality is not integrity**, and a
  sweep shaped like this one cannot be the only guard on a data format.
- Its first alphabet omitted U+0022, so it could not reach a quoted scalar's own delimiters. The
  multi-line-quoted template and the two characters it needs were added afterwards, and §5 now
  requires them.
- Its alphabet then held `-` but not `---`, and at a payload length of four no combination of
  single dashes reaches a three-dash run flanked by content. That is why the `r = d` hole in §3.4
  survived two full runs of this sweep at 649 440 cases each, reported clean both times. **`---`
  is in the alphabet as one token for that reason**, and §5's sweep obligation now names it.

**A real corpus, end to end.** The scan plus the full pipeline over the same 70 files in eight
locales, comparing the result against the original byte for byte. This is the measurement that
produced §3.8.2 and the only one of the three that can see a value damaged without being
destroyed:

| `keys` | Result |
| ------ | ------- |
| none — every string scalar processable (the keyless draft) | **37 of 106 spans changed in this repository's own workflows**, including `if !` → `if!` and `"$SHA"` → `“$SHA”` inside a `run:` block |
| every key that occurs anywhere in the corpus, 575 of them | 560 file/locale cases: no parse failure, no structural change, no idempotency failure — the scan's own safety envelope, at its most exposed |
| `description`, `summary`, `title` — what a caller would actually pass | **no workflow file changes at all**; 8 files change, and every one of them is prose-bearing: the two OpenAPI documents, four issue-form templates, and a package manifest |

The third row is the mode working as specified, and the first is why the option is not optional.

---

## 4. The round-trip guarantee

> **`transform` in `html`, `markdown` and `yaml` mode returns the input source with a set of
> disjoint substring replacements applied at recorded offsets. No other byte of the input
> changes, ever.**

This is stronger than "byte-identical when no changes are needed" (PLAN.md §3.2) and it implies
it. It is stated as a prohibition because that is the only form five parsers cannot drift on:

- **[P] The document is never serialised.** The parser is used to locate spans and is then
  discarded. An implementation that reconstructs output from a DOM is non-conforming even if
  its output happens to match.
- **[P] Attribute quoting is preserved** — `class=foo`, `class='foo'`, `class="foo"` all
  survive as written. Attributes are skipped _and_ never re-emitted.
- **[P] Self-closing and void-element forms are preserved** — `<br>`, `<br/>`, `<br />`.
- **[P] Character-reference spelling is preserved** — `&amp;` does not become `&#38;`, `&nbsp;`
  does not become U+00A0, and a bare `&` that a parser would repair stays a bare `&`.
- **[P] Tag name case, attribute order, duplicate attributes, and whitespace inside tags are
  preserved.**
- **[P] The prologue, doctype, comments, and trailing whitespace are preserved.**
- **[P] Markdown is never reformatted** — list markers, emphasis delimiters, heading style,
  table alignment, hard-break spaces and line endings are all outside every span.
- **[P] Malformed input is not repaired.** Unclosed tags, stray `<`, mismatched nesting: the
  parser's error recovery affects only where spans are found, never what is emitted.

- **[P] YAML quoting style, indentation, anchors, tag handles and chomping indicators are
  preserved** — `yaml` mode uses no parser and no emitter, so none of them is ever decoded and
  rewritten (§3.8.1). A block scalar's trailing line terminators lie outside every span and are
  returned exactly as written, whichever chomping indicator governs them.

The cost is real and is accepted: a runtime whose parser cannot report source offsets cannot
implement `html` mode conformantly. That constraint belongs to the implementation, not to this
contract. It does not bind `yaml` mode, which has no parser to ask — §3.8.1 records why asking
one was not an option in the first place.

---

## 5. Idempotency under composition

`pipeline-idempotency.md` proves `T(T(x)) = T(x)` for a single text run, on the composition
obligation **CO**: no rule creates work for an earlier-ordered rule. Modes do not weaken CO, and
they do not carry it over for free either. Write `M` for the whole mode transform.

**`M(M(x)) = M(x)` requires three things**, of which only the first is already proved:

1. **The pipeline is idempotent on the concatenated array.** This is exactly
   `pipeline-idempotency.md`, applied to an array that happens to contain markers. The markers
   are inert — no rule matches them, no rule edits them, and they are in none of the classes any
   guard tests except `OPENISH`/`CLOSEISH` for `quotes`, where they behave like a fixed piece of
   punctuation that no rule can change. So every CO discharge in every rule document holds
   verbatim.

2. **The span partition is stable.** `M` must produce the same sequence of spans for `M(x)` as
   for `x`. This is a **new obligation, invisible to every per-rule argument**, and it is the
   one a mode adapter can break on its own: if applying edits changed how the document parses,
   the second run would see different spans, the concatenation would differ, and the rules would
   legitimately reach different conclusions.

   An earlier revision discharged this by claiming that **every code point the rules emit is
   syntactically inert in `html` and `markdown`**. That claim is **false**, and the
   counterexample is the most ordinary character in the set. **U+0020 is not a markup character
   and is not inert**: beside `*` or `_` it decides whether a delimiter run is left- or
   right-flanking, and at the start of a line it is a line prefix, a list continuation or
   indented code. `dashes` emits U+0020 in every `-spaced` locale. The claim was wrong when it
   was written, and it is what hid the defect now repaired in §3.4.

   The honest discharge has four parts, and the third is **positional rather than alphabetic** —
   the same move as CO-S in `pipeline-idempotency.md` §5.1a, applied to _where_ a character may
   be placed rather than to _which_ characters exist:

   - **§4 forbids reserialisation**, so markup bytes are untouched by construction. Nothing a
     rule does can move, requote or respell a tag, an entity or a fence.
   - **No rule emits a markup character.** Of the code points the rules can emit —
     U+2018/U+2019/U+201A–U+201F, U+00AB/U+00BB, U+2039/U+203A, U+2013/U+2014, U+2026, U+00A0,
     U+202F, U+2011, U+00D7, U+00B1, U+00A9, U+00AE, U+2122, U+002E, U+0020 — none is `<`, `&`,
     `>`, `*`, `_`, `` ` ``, `[`, `]`, `(`, `)`, `#`, `|` or a line terminator. This part of the
     old claim survives and covers every emitted character **except U+0020**.
   - **U+0020 is made safe by position, not by inertness.** The edge-growth rule (§3.4) means a
     rule can introduce a code point only at a position **strictly interior** to a span. An
     interior position has span content on both sides, so an emitted U+0020 can never become
     adjacent to a delimiter — delimiters are structural tokens, outside every span — and can
     never begin a line, because a line terminator is always a −2 marker and a line start is
     therefore a span edge or outside spans entirely. **The characters that decide Markdown
     structure and the positions a rule may write to are disjoint sets.** That is what makes the
     partition stable; no property of U+0020 itself is relied upon.
   - **Deletion** is only ever of a U+0020, and structural whitespace borders a `BREAK` — a real
     one in `text` mode, a −2 marker in the others — where `spaces` refuses to act
     (`spaces.md` §3.2 step 4). A deletion therefore cannot turn `- item` into `-item`, collapse
     an indented code block, or destroy a hard break.

   > **Normative, and binding on future rules:** a rule may emit a code point that is
   > syntactically significant in a mode **only** where the edge-growth rule confines it to a
   > span interior. A rule that needs to place such a character at a span edge must specify its
   > own span-stability argument here first, and must not assume a character is inert merely
   > because it is not markup. U+0020 is the standing counterexample.

   **In `yaml` the same four parts hold, the third needs one addition, and the obligation needs
   a fifth part this mode is the first to require.**

   The addition to the third: YAML's structural characters are a larger set than Markdown's, but
   only two of them are made structural by an adjacent U+0020 — `:` becomes a mapping indicator
   when a U+0020 follows it, and `#` becomes a comment introducer when a U+0020 precedes it — and
   those are exactly the two that §3.8.6 lifts out of every plain scalar as opaque units. They are
   therefore outside every span, an emitted U+0020 can never become adjacent to one, and the dash
   token that would have emitted it sits at a span extremity, where §3.4's length test discards
   the 2 → 3 replacement that emits U+0020 and admits the 2 → 1 replacement that cannot. In a quoted scalar both are neutralised by the
   quoting; in a block scalar both are literal content. Of the remaining emitted code points, only
   U+002E is structural in YAML **syntax** at all, and only as `...` at the start of a line — a
   position no span contains, since a plain scalar's span begins after its key and its colon, and
   a block scalar's begins after an indentation of at least one U+0020. Deletion is unchanged:
   `spaces` may delete only a U+0020, and a block scalar's indentation borders a −2 marker.

   > **What that argument does not cover, and what §7.11 accepts.** A plain scalar's **type** is
   > resolved from its whole text, not from any one character, so an edit anywhere inside one can
   > change a value's tag without touching anything syntactic. Measured: `description: 1 .`
   > becomes `description: 1.` in every locale, because `spaces` strips the space before a
   > sentence-final dot — and the value goes from the string `"1 ."` to the number `1`. No
   > enumeration of emitted code points can close this, because the mechanism is not a character
   > but a whole-token resolution; the span-stability obligation of item 2 is unaffected, since
   > the predicate that selects the span is the key. This is a cost of processing plain scalars at
   > all, it applies only to a value a caller has explicitly listed as prose, and it is accepted
   > rather than closed.

   > **The fifth part, normative and binding on future modes: the predicate that decides whether
   > a span exists must not read anything a rule can change.** In `html` and `markdown` the
   > question never arises, because span selection reads only the document's structure. `yaml`'s
   > first draft decided a plain scalar's processability from **its own text** — it had to contain
   > a space and a letter — and `spaces` can delete that space. One line was enough to falsify the
   > obligation: `ref: ${{ steps.pin.outputs.sha }}` yields one span, comes back as
   > `ref: ${{steps.pin.outputs.sha}}`, and yields none on the next run. `M(M(x)) = M(x)` survived
   > that only by accident — a lost span means fewer edits, and the first run's edits happened to
   > be fixed points — but the obligation itself was false, so the conclusion rested on nothing.
   > §3.8.2's `keys` option is the repair: the predicate reads the **key**, which lies outside
   > every span and which no rule can reach, so the partition is a function of the source alone.

   **`markdown` with `frontmatterKeys` (§3.7.4) inherits both**, and adds one obligation of its
   own that is discharged by the same observation. The block's spans are selected by §3.8's scan
   over YAML, so the four parts and the fifth hold verbatim — the predicate is `frontmatterKeys`
   against a key, and a key is outside every span. What is new is that the document now has **two
   units** rather than one, and `M` must partition it into the same two on the second run: the
   boundary between them is the frontmatter construct's own delimiter lines, which lie outside
   every span in either unit, so no edit can move, create or destroy one. A document whose
   frontmatter is processed therefore has a partition that is a function of the source alone,
   exactly as one whose frontmatter is skipped does.

   A content-dependent predicate is not merely risky here, it is unarguable: item 2's whole
   method is to show that the characters rules may write and the positions they may write to are
   disjoint from what decides structure. A predicate over span content puts the rules' own output
   back inside that decision, and there is no version of the argument that survives it.

3. **Redistribution is deterministic.** Guaranteed by §3.4: no edit spans a marker, and any edit
   that would place code points at a span extremity which were not there before — an insertion at
   a boundary, or a replacement longer than what it replaced — is discarded rather than assigned
   to a side. The discard is a pure function of `(p, q, r, s₀, s₁)`, so it happens identically on
   every run: a rule that was declined at an edge once is declined there always, and the output
   contains nothing for the next run to reconsider.

Given 1–3, `M(M(x)) = M(x)`.

**The testing obligation of `pipeline-idempotency.md` §6 extends to modes**: the bounded
exhaustive sweep must be run in `html`, `markdown` and `yaml` mode over documents that place
span boundaries inside the swept string — at minimum a template like `A<em>B</em>C` with the
sweep alphabet distributed across `A`, `B` and `C`. A sweep that only ever produces one span
tests none of this document. In `yaml` the sweep alphabet must include `:`, `#`, `-` and **`---`
as one token**, since those are the characters whose adjacency the argument above turns on and a
three-dash run is not reachable from single dashes at a bounded payload length; and it must
include U+0022 and U+005C, without which the sweep cannot reach a quoted scalar's delimiters at
all. Since 1.7.0 the `markdown` run must also carry a template with a **frontmatter block and
`frontmatterKeys` naming a key in it** — a document with two text units (§3.1) tests a composition
the single-unit templates cannot reach. §3.8.7 records what each run did and did not establish — including that a sweep comparing
structure and types is blind to a string whose content is damaged, and that an alphabet without
`---` reported clean twice while §3.4's `r = d` hole was open.

---

## 6. Which §4 claims change

Per `pipeline-idempotency.md` §5.2, a **[P]** claim is a promise about `transform`. Several were
written for `text` mode and are mode-dependent. The notation extends: **[P: html, markdown]**
means the claim holds in those modes only.

- **"Anything inside a skipped region"**, asserted in every rule's §4, is
  **[P: html, markdown, yaml]** and is now _defined_ rather than assumed — §3.6, §3.7 and §3.8
  are what those bullets refer to. In `text` mode there are no skipped regions and the bullet is
  vacuous. In `yaml` the definition runs the other way round (§3.8.2): the skipped region is
  everything the scan did not claim. Since 1.7.0 one region in `markdown` is skipped
  **conditionally** — the frontmatter block, whenever `frontmatterKeys` names a key in it
  (§3.7.4) — so the bullet is read against the options the call was made with. No rule's §4
  changes: the block is either skipped whole, as before, or decomposed by §3.8's scan, whose
  own claims §3.8 already states.
- **`dashes` §4 "URLs, code spans, fenced code, HTML attributes"** — **[P: html, markdown]**.
  In `text` mode a URL is ordinary text. The rule is nevertheless safe there, but by its own
  guards (P1 declines the tight hyphens in `a-b`, the cluster guard declines `2026-08-15`), not
  because anything skipped it. The distinction matters to a reader deciding whether to run
  `text` mode over a document containing URLs. **`yaml` sits with `text` here, not with the
  other two**: a URL written inside a listed key's scalar is ordinary text and nothing skips it.
  A URL that is the whole value of a `url:` key is a different matter and is skipped, but by
  §3.8.2's `keys` option rather than by any rule of this bullet — the caller did not list that
  key.
- **`symbols` §4 "`(c)` and `(r)` in a call or index position"**, and the whole `0x1F` family —
  **[P] in all modes**, since they rest on guards S1/M3/M4 rather than on skipping. §7.2 of that
  document already records that the `(tm)` exemption's exposure is `text`-mode-only, and this is
  why.
- **`ellipsis` §4 "`../`, `./..`"** and **`spaces` §4's path protection** — **[P] in all modes**.
  They rest on the lone-dot condition (`spaces.md` §3.4), not on skipping.
- **`quotes` §4 "Any unbalanced mark"** — **[P] in all modes**, and _strengthened_ by §3.3: a
  mark that would have been unbalanced within its own span may now pair across an element, which
  converts more, never less.
- **`nbsp` §4 "The start or end of a text unit"** — **[P] in all modes, and strengthened.** A
  "text unit" is §3.1's — the concatenation — and §3.4 additionally refuses any insertion at a
  span boundary, so no span ever begins or ends with a character `nbsp` put there. The guarantee
  is now about element boundaries as well as document boundaries. Since 1.7.0 a document may have
  two units (§3.7.4), and the guarantee is read **per unit**: the frontmatter block's first and
  last positions are unit extremities of their own, which refuses more than one unit would, never
  less. That is also what makes `-separate-unit` deterministic rather than a coincidence — the
  same reading `quotes` gives a unit edge.

- **`dashes` §4, the `-spaced` forms** — a new **[R]** consequence in `html`/`markdown`, not a
  change to any existing bullet. A `-spaced` locale converts a dash only where the replacement
  fits inside a span without touching either edge, so `a<em>--</em>b` is left alone in `de-DE`
  while `en-US` converts it — only a contraction survives at an edge (§7.9). Nothing in `dashes.md` is false; the rule simply gets fewer chances
  to fire. §7.9 records it.

No rule's §4 becomes _false_ in a mode. Two become narrower ([P: html, markdown]); none becomes
rule-local.

---

## 7. Open questions

1. _(Settled — both skipped.)_ `svg` and `math` are in §3.6's skip list although neither is in
   PLAN.md §3.2's. The decisive argument was MathML: a quotation mark, a hyphen and a prime are
   **operators and identifiers** there, so substitution changes meaning rather than appearance.
   The accepted cost is `<svg><text>` and `<svg><title>`, which do hold prose and are now left
   untypeset. Direction matters here — widening a skip list is additive, narrowing one after
   release breaks documents — so the conservative side was taken deliberately rather than
   pending evidence.
2. **A skipped element between two halves of a word.** `un<code>x</code>believable` yields two
   spans that no rule joins, which is correct, but it also means `hyphen` and the `nbsp` literal
   lists silently fail on any word interrupted by markup. Correct and conservative, but worth a
   fixture so it is a decision rather than a surprise.
3. **An insertion at a span boundary is discarded, and the miss is permanent under this
   contract.** (Since the edge-growth rule of §3.4, this is one case of a general prohibition on
   writing a code point onto a span edge; the argument below is what established the principle,
   and it applies unchanged to the replacement case that generalised it.) `fr` `mot<em>!</em>` keeps no narrow no-break space. This is an argued
   limitation, not an oversight, and the argument is the mirror pair — neither side is
   universally safe:

   | Input           | Spans      | Assign to left span | Assign to right span |
   | --------------- | ---------- | ------------------- | -------------------- |
   | `mot<em>!</em>` | `mot`, `!` | `mot⍹<em>!</em>` ✓  | `mot<em>⍹!</em>` ✗   |
   | `<em>mot</em>!` | `mot`, `!` | `<em>mot⍹</em>!` ✗  | `<em>mot</em>⍹!` ✓   |

   Whichever rule is adopted, one of these two ordinary documents ends up with an element that
   begins or ends with a space that was never in it. That is invisible in a plain rendering and
   immediately visible the moment the element carries an underline, a border or a background —
   and the package must never put a character inside an element it did not come from. A miss is
   visible to the author and fixable in the source; corrupted markup is neither.

   Note that only _insertion_ is affected. `<em>mot</em> !` already has a U+0020 inside the
   right-hand span, so N2 converts it in place and French spacing works normally; the loss is
   confined to documents where the space does not exist at all and the punctuation is wrapped.

   **A real fix needs something this contract does not have:** the ability to represent
   "between two nodes" as a position, so that an inserted character could be emitted as a
   sibling of both elements rather than a child of either. That is a different document model —
   the adapter would have to be able to _add_ to the document rather than only replace inside
   spans, which §4's round-trip prohibition rules out by design. Any future attempt starts by
   reopening §4, not by revisiting this paragraph.

4. _(Settled — soft breaks are `BREAK`, not boundaries.)_ A soft line break inside a paragraph
   is a **−2 line marker** (§3.2), classified as a member of `BREAK` for every rule. The
   alternative readings were both worse. Treating it as an ordinary **−1 inline boundary** — what
   an implementation gets by default, since a line ending is a structural token like any other —
   makes a mode diverge from `text` mode on the same characters: a `"` at the start of a wrapped
   line has a `BREAK` on its left in `text` (so it can only open) and an opaque content marker in
   `html`/`markdown` (so it could also close), and `"foo\n"bar` then pairs in one and not the
   other. A mode that converts _differently_ from `text` on identical prose is indefensible; a
   mode that converts _less_ is nearly as bad, and hard-wrapped prose is precisely the M4 corpus.
   Putting the line terminator physically **inside** the span was the other candidate and it
   fails on structure: a continuation line's block prefix — a blockquote `>`, a list item's
   indentation — must stay outside, which makes the span non-contiguous and breaks the
   source-offset model §4 depends on.
   The −2 marker gets the benefit of both: spans stay contiguous, and every rule's existing,
   fixture-covered `BREAK` behaviour applies unchanged. It also removes a parser dependency that
   would otherwise have been load-bearing — whether the two spaces of a Markdown hard break land
   inside a span or in a structural token is a per-parser decision, and with a −2 marker beside
   them `spaces` protects them either way.
5. **Adjacent text nodes.** Some parsers report `a<!-- c -->b` or a long text run as two adjacent
   text nodes with no element between them. This document treats every gap between processable
   spans as a boundary, so such a split would suppress conversions that ought to happen.
   Implementations **should** coalesce adjacent processable spans separated by nothing in the
   source; whether that is required, and how it interacts with comments, is not settled here.
6. **`markdown` emphasis delimiters inside a span.** `*foo*` is markup, but a naive adapter that
   walks an `mdast` tree gets `foo` as a text node and the asterisks as structure — so they are
   outside every span, which is right. An adapter that instead processes raw source lines would
   have them inside a span and could let a rule edit next to them. The tree-walking approach is
   assumed throughout; it is not stated as a requirement because it names an implementation
   strategy, and it probably should be.
7. **No mode covers plain-text email or reStructuredText**, and the `rules` option cannot
   express "skip this region" for a caller with their own format. That is out of scope for v1
   (PLAN.md §4) and is recorded so the span model is not mistaken for an extension point. _(YAML
   was in this item until 1.3.0 and is now §3.8; the two formats named here are not, and the
   argument that moved YAML does not carry over — it turned on a measured corpus and a
   corruption report, neither of which exists for these.)_

8. **`dialect` and `POLYTYPO_MALFORMED_INPUT` are new public surface and need operator
   sign-off.** Both are specified — I did not leave them open — but both change the contract.

   The first is `dialect` (§3.7.1): a required option on `markdown` mode rather than a fourth
   mode id, because mode ids are public API and PLAN.md §3.2 names exactly three. Two things
   there are mine to flag rather than to decide: whether the operator prefers the option or a
   `markdown-mdx` mode id after all; and which code the missing or invalid value raises. I
   specified a throw with no default, on the fail-fast reasoning that already governs `locale`,
   but ARCHITECTURE.md §4.6 has no code for it — `POLYTYPO_INVALID_MODE` is the closest fit and
   is arguably a lie, since the mode is valid and only its dialect is not. A
   `POLYTYPO_INVALID_DIALECT` code would be honest, and is a contract addition.

   The second is `POLYTYPO_MALFORMED_INPUT` (§3.7.2). It adds a code to the taxonomy **and**
   makes `transform` non-total on its input for the first time. I judged that right on
   fail-fast grounds and because the only reachable case is a genuinely broken MDX file, but a
   caller running polytypo over a large corpus may reasonably want a document-level failure not
   to abort a batch. If so, the answer is a wrapper in _their_ code, not an option here — this
   spec has no error-suppression switch and should not acquire one.

9. **The edge-growth rule costs conversions that `text` mode makes, and only a contraction
   survives at a span edge.** That sentence is the whole rule, and it follows from §3.4's length
   test rather than sitting beside it: an edit at an extremity is applied iff `r ≤ d`. So a
   `dashes` promotion at a span edge converts **only where the locale's parenthetical form is
   shorter than the input that triggered it**.

   Measured across all nine locales, on `a<em>--</em>b`:

   | Locale | `dash.parenthetical` | At a span edge | Interior (`a<em>x--y</em>b`) |
   | --- | --- | --- | --- |
   | `en-US` | `em-tight` | **converts** — `a<em>—</em>b`, since 2 → 1 is a contraction | converts |
   | `de-CH`, `de-DE`, `en-GB`, `fi`, `sv` | `en-spaced` | unchanged — 2 → 3 grows both edges | converts, `a<em>x – y</em>b` |
   | `fr`, `ru` | `em-spaced` | unchanged — same reason | converts |
   | `el` | `none` | unchanged — emits nothing anywhere | unchanged |

   `en-US` is the only locale whose parenthetical form is shorter than the `--` that triggers it,
   and it is therefore the only one that converts at an edge. The asymmetry is real — the same
   document is typeset differently in `de-DE` and `en-US` for a reason that has nothing to do
   with German or American typography — but it applies to a **narrower class** than an earlier
   revision of this item claimed, and it now has a mechanical explanation rather than a
   coincidental one.

   That earlier revision was also **factually wrong** in a way worth recording, because the error
   outlived the thing that caused it. It said `a<em>–</em>b` "keeps its en dash unspaced in
   `de-DE` … while `en-US` (`em-tight`) converts it happily". Neither half is true any more:
   `dashes` §3.2 step 2a declines **every** token containing an authored U+2013 or U+2014, so
   nothing converts that input in any locale. The claim was correct when written and was
   invalidated by a change in another document; the carrier died and the sentence did not notice.
   §3.4's worked table had the identical fault and was rebuilt on `--` for the same reason.

10. **Whether a −2 marker should also end a `quotes` pairing scope** is open. Today a quotation
    opened in one paragraph and never closed can still pair with a mark in the _next_ paragraph,
    because the stack is not reset at a `BREAK` — which is exactly the behaviour `text` mode has,
    so the two agree. It may nonetheless be wrong in both, and `quotes.md` §7.5 already records
    the multi-paragraph question. If that is ever resolved, it must be resolved for `text` and
    the modes together, not here.

11. **`yaml` mode's accepted misses, and one accepted cost.** Every entry but the last is a
    construct the scan declines to claim, so prose inside it is returned untouched; each could be
    admitted later without breaking a document that relies on today's behaviour, and none could
    be withdrawn later without breaking one. They are recorded together because the direction is
    the argument — and the last entry is here precisely because it is the one that does not share
    it:

    - **a bare sequence item** — `- Some prose here` yields no spans, because §3.8.4 step 5
      requires a processable scalar to be the value of a key, and a bare item has none for
      `keys` to match. `- key: value` is unaffected;
    - **a key containing `"`, `'`, `{`, `[`, `&`, `*`, `!` or `#` anywhere** — `"description"`,
      but also `a!b` — declined at step 5 before the key is compared, so a document that quotes
      its keys gets nothing from this mode;
    - **a plain scalar whose type is resolved from its whole text** — a listed key's value can
      change tag without any syntactic character being touched (§5 item 2's note). `1 .` becomes
      `1.` and stops being a string. This one is not a miss but an accepted cost, and it is the
      only entry here that is not purely in the widening direction;
    - **a multi-line plain scalar**, and a quoted scalar or flow collection that does not close
      on its opening line: all three are consumed by step 7 and yield no spans;
    - **a flow collection** — `tags: [one, two]` and `{a: b}` — even on one line;
    - **a quoted scalar containing an escape** — `"say \"hi\""` — where the source spells the
      content with more characters than it has;
    - **a block scalar whose indentation is ambiguous**, per §3.8.5's three bail conditions.

12. **`keys` matches a bare name at any depth, and nothing narrower.** `description` is
    processable wherever it occurs, which is what makes the option portable — no paths, no
    globs, no schema. The cost is that a caller who wants `components.schemas.*.description`
    but not `info.description` cannot say so, and a caller whose document has a machine-read
    `description` somewhere in it must choose between typesetting that one too and typesetting
    none of them. A path syntax is the obvious extension and is deliberately not specified here:
    it is a small language, five runtimes would have to agree on it exactly, and no measured
    document has yet needed it. If one does, this is where it reopens, and the extension is
    additive — a caller passing bare names keeps today's behaviour.

13. **What `frontmatterKeys` deliberately does not claim (spec 1.7.0).** Three entries, and the
    last is a number rather than a construct:

    - **TOML frontmatter (`+++`) yields no spans**, with the option given or not. Its quoting is a
      second grammar — U+005C escapes in basic strings, none in literal strings, multi-line forms
      of both — and §3.8.3's posture is to claim only what the scan has proved. Neither report
      behind the option (polytypo/polytypo#13, #26) asked for TOML, and the 187-file corpus of
      §3.7.4.1 contains none. Widening to TOML is additive: a caller passing keys today keeps
      today's behaviour.
    - **~~The block itself is recognised by the mode, not by a scan specified here.~~ Closed in
      1.8.0 by §3.7.3a.** It was here because §3.7.4's content range is exact once there is a
      block, while the block itself came from each parser's own frontmatter support — and the
      measurement that followed found those disagreeing two against two on a trailing space,
      with the two that declined the block typesetting the metadata. The locator is now
      specified, which is where it belonged: it governs the skip for every caller, not only
      those who pass the option.
    - **A lone-U+000D document has a block, and `frontmatterKeys` yields nothing inside it.**
      §3.7.3a step 5 finds the block by CommonMark's line model and §3.8.4 reads content by its
      own, so the block reaches the content scan as a single line. An earlier draft let that
      stand and called it inert; measuring it showed it was not. On two mapping lines a quotation
      opened on one paired with a mark on the other, an unlisted line inside the listed key's
      scalar took `fr`'s spacing, and the U+000D landed inside a span — which §3.8.4 forbids in
      the same breath. §3.7.4 therefore declines any content line carrying such a U+000D — per
      line, so that a stray one inside a single quoted value costs that value and not the block.
      The block is still skipped, so nothing machine-read is typeset either way. A lone-U+000D
      document is one line to §3.8.4 and therefore loses the whole block, which is the price of
      not widening that section here.
    - **§3.8.6's single-quoted bail costs more here than anywhere it has been measured before.**
      Of the 1858 corpus values a locale would convert across eight locales, **1040 yield no spans
      when written as a single-quoted scalar** — 130 of 247 in `en-GB` alone, the figure 1.7.0
      shipped with, and `scripts/miss-census.mjs` in this repository is what reproduces either on
      demand. An apostrophe inside such a scalar is spelled `''`, and an apostrophe
      is exactly what `apostrophe` and `quotes` convert, so the bail falls hardest on the values
      the option exists for. Double-quoted, none bail. The corpus as authored is entirely
      double-quoted, so its own author never meets this; a caller whose YAML style is single
      quotes gets nothing on half their prose, and gets it silently. The repair is not this
      section's to make: §3.8.6 is ratified and measured, and the obvious extension — treating
      `''` as an opaque two-code-point unit, exactly as §3.8.6 already treats `:` and `#` inside a
      plain scalar — changes `yaml` mode for every caller and needs its own measurement and its
      own sign-off.

## 8. Fixture coverage strategy (non-normative)

This section records why `spec/fixtures/` does not carry the full every-locale × four-modes
Cartesian product, and what a smaller set must still prove instead. It has **no normative
force** — it does not change §§1–7 — and if it drifts out of sync with the actual fixtures, that
is a defect in this section, not license to distrust the fixtures.

**Why the full product is not required.** §3.2–§3.5 establish that a mode adapter's only job is
to identify which spans of the source are processable text and which are structural markup:
locating skip-list boundaries, computing marker gaps, and reassembling by offset. Once a span is
handed off, `runOverSpans` (`src/engine/span-runner.ts`, used by `html` and `markdown`) calls
exactly the same per-rule `apply()` functions, against the same locale data, that `text` mode's
`runRules` (`src/engine/text-pipeline.ts`) calls — there is one implementation per rule id,
shared by every mode, not one per mode. A locale's quote glyphs, dash conventions, or `nbsp`
targets are therefore already fully exercised by `text`-mode fixtures; an `html`/`markdown`
fixture in the same locale mostly re-tests that same rule logic through an extra layer of span
bookkeeping, not something the locale itself changes about it.

What *does* vary by mode is the span-selection and reassembly machinery, and that machinery is
locale-agnostic: the HTML skip list and the CommonMark/MDX skip lists never consult `LocaleData`.
A representative sample proves the machinery correct; the full product would mostly multiply
proof of the same machinery by locale count, without adding coverage of anything the locale
changes.

**What representative coverage requires instead**, and where it currently lives:

1. **HTML span selection** — the skip list, character-reference handling, and round-trip
   guarantee, exercised directly (`tests/modes/html.test.ts`) and via fixtures.
2. **CommonMark span selection** — fenced/indented/inline code, autolinks, link destinations and
   titles, reference-link definitions, and the round-trip guarantee
   (`tests/modes/markdown.test.ts`).
3. **MDX span selection** — expression containers, JSX attributes and children, ESM export
   blocks, and the JSX-vs-skipped-element case distinction (`tests/modes/markdown.test.ts`).
3a. **YAML span selection** — the three scalar forms, the `keys` option (a listed key, an
   unlisted one, a quoted one, the same name at two depths), block-scalar indentation and
   chomping, the `:`/`#` split of §3.8.6, step 7's consumption of an inline value's continuation
   lines, and every bail of §3.8.4. `yaml` carries a heavier fixture burden than the other two
   for a reason §8's opening argument does not cover: its span selection is **specified rather
   than delegated** (§3.8.1), so a fixture is the only thing standing between five hand-written
   scanners and five different answers. The bounded sweep of §3.8.7 is part of this item, not an
   extra — and so is the end-to-end corpus run, for the reason §3.8.7 gives: a sweep that
   compares structure cannot see a string being damaged without being destroyed.
4. **At least two materially different locale outputs per mode/dialect**, so a fixture is not
   merely "the same English output with a different `locale` field": `spec/fixtures/fr.json` and
   `fr-CA.json` carry `html`/`markdown`/`mdx` cases whose guillemets-plus-U+00A0 output is
   structurally different from `en-US`'s curly quotes, not just a different glyph in the same
   shape. `yaml` carries `en-US`, `de-DE` and `fr`, and for that mode **one of them must be a
   `-spaced` locale**: §3.8.6's `:`/`#` split only discriminates where the replacement grows, so
   an em-tight-only fixture set passes with the split removed.
5. **Non-ASCII text and code-point/offset boundaries** — an astral-character (surrogate-pair)
   preservation case in HTML mode, and genuinely accented non-ASCII prose exercised through the
   French MDX and CommonMark fixtures and round-trip tests.
6. **Byte-identical skipped regions** — the round-trip guarantee ("returns a document/article
   that needs no changes byte for byte") asserted directly for HTML, CommonMark, MDX and YAML.
   In `yaml` the guarantee is also what proves §3.8.2: a document the scan does not understand
   must come back unchanged, so an unrecognised construct is a fixture, not a hope.
7. **Every locale-specific transformation independently covered through `text`-mode fixtures** —
   the conformance suite's own per-locale, per-rule coverage, not this file.

**Enforcement**, split across the two places that actually check each item — neither file alone
covers all eight:

- `tests/conformance/mode-fixture-strategy.test.ts` reads `spec/fixtures/*.json` directly and
  protects item 4 (at least two distinct locales carry `html`, `markdown`/`commonmark`,
  `markdown`/`mdx` and `yaml` fixtures, and at least one `yaml` locale is `-spaced`), the
  code-point half of item 5 (at least one fixture per mode contains a non-ASCII code point,
  `yaml` included), and item 7 (every locale has a `text`-mode fixture for
  *every* canonical rule id in `spec/rules/order.json`, checked per locale/rule id pair, not
  merely "the locale has a fixture for some rule"). It does not inspect span selection or
  round-trip behaviour at all.
- **In each runtime repository**, `tests/modes/html.test.ts`, `tests/modes/markdown.test.ts` and
  `tests/modes/yaml.test.ts` protect items 1–3a (HTML, CommonMark, MDX and YAML span selection
  respectively), the parser-boundary half of item 5 (an astral-character/surrogate-pair
  preservation case in HTML mode), and item 6 (the round-trip guarantee — "returns a
  document/article that needs no changes byte for byte" — asserted directly for HTML, CommonMark,
  MDX and YAML). Those files are not in this repository, which has no engine to run them through,
  so this bullet is an obligation on every runtime: one that ships `yaml` without them is not
  conformant for the mode however green its fixtures are.

If a future edit narrows fixture coverage, or removes a span-selection or round-trip assertion,
the corresponding test above fails before this section's claim goes silently stale.
