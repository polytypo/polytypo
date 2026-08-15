# Modes — the L2 contract

**Not a rule.** No entry in `spec/rules/order.json`, no locale data, no edits of its own. This
document specifies how a `html` or `markdown` document is decomposed into processable text,
how the rule pipeline is applied to it, and how the result is reassembled. It is normative for
all five runtimes and is parser-agnostic by construction: `parse5`, `nokogiri`, `lxml`,
`golang.org/x/net/html` and PHP's DOM disagree about almost everything this document does not
forbid them from doing.
**Spec version:** 0.1.0.

---

## 1. Purpose

`text` mode hands the pipeline one string. `html` and `markdown` hand it a document in which
_most_ of the characters must not be touched at all — markup, code, URLs — and the processable
text is scattered across dozens of disconnected fragments. Two things then have to be decided
and neither is obvious: **what the rules see**, and **what comes out**.

The second is the easier one and this document answers it absolutely: **the output is the input
with a set of disjoint substring replacements applied, and nothing else.** The parser is used to
_locate_ text, never to produce output. That is the only formulation under which five parsers
can agree, because it removes serialisation from the contract entirely.

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
the whole marker-separated array. Edits are then redistributed to spans by offset.

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
| `OPENISH` **and** `CLOSEISH` (`quotes`, `apostrophe`, `nbsp`)                               | **yes, both**                               |

and one exemption:

> In `quotes` §3.2's `canOpen` right-test, which rejects a `right` in `CLOSEISH`, the marker
> receives **the same exemption `STRAIGHT` receives** and does not disqualify.

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

Because the marker is opaque content and is in none of their classes, the remaining rules
decline to work across a boundary **without any special-casing**:

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
> not there before.** Formally, with `d = q - p + 1` the replaced length:
>
> - if `p = s₀` and `r > d` → **discard**;
> - if `q = s₁` and `r > d` → **discard**.
>
> An insertion has `d = 0`, so `r > d` always holds and an insertion is discarded exactly when
> its position coincides with a span edge. That is what this section said before; the rule below
> generalises it.

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

The length test is the whole rule, and it is mechanically checkable from `(p, q, r, s₀, s₁)`
alone, with no rule cooperation and no knowledge of Markdown or HTML syntax. It distinguishes
exactly the cases that matter:

| Edit                                  | At an edge? | `d` → `r` | Verdict                                                     |
| ------------------------------------- | ----------- | --------- | ----------------------------------------------------------- |
| `"` → `“` (`quotes`)                  | yes         | 1 → 1     | **applied** — a one-for-one replacement never grows an edge |
| `--` → `␣–␣` (`dashes`, `-spaced`)    | yes         | 2 → 3     | **discarded**                                               |
| `a--b` → `a␣–␣b` (same edit, interior) | no         | 2 → 3     | **applied** — growth is only a problem at an extremity      |
| `(c)` → `©` (`symbols`)               | yes         | 3 → 1     | **applied** — shrinking is always safe                      |
| U+0020 → U+00A0 (`nbsp`)              | yes         | 1 → 1     | **applied**                                                 |
| insertion of U+202F (`nbsp` N1/N2)    | yes         | 0 → 1     | **discarded**, as before                                    |

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
2. Build the code-point array: `S₁ ⌢ [−1] ⌢ S₂ ⌢ [−1] ⌢ … ⌢ Sₘ`.
3. Run the pipeline **once**, in `order.json` order, over that array.
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
answer, which is the reasoning that already makes `locale` required. A fourth mode id was
rejected because mode ids are public API and PLAN.md §3.2 names exactly three, whereas an option
is additive. **Ratified by the operator as public contract**: the throw carries its own code,
`POLYTYPO_INVALID_DIALECT`. See §7.8.

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
  (YAML) or `+++` (TOML), skipped whole including its delimiters. Without it the closing `---`
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

---

## 4. The round-trip guarantee

> **`transform` in `html` and `markdown` mode returns the input source with a set of disjoint
> substring replacements applied at recorded offsets. No other byte of the input changes,
> ever.**

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

The cost is real and is accepted: a runtime whose parser cannot report source offsets cannot
implement `html` mode conformantly. That constraint belongs to the implementation, not to this
contract.

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

3. **Redistribution is deterministic.** Guaranteed by §3.4: no edit spans a marker, and any edit
   that would place code points at a span extremity which were not there before — an insertion at
   a boundary, or a replacement longer than what it replaced — is discarded rather than assigned
   to a side. The discard is a pure function of `(p, q, r, s₀, s₁)`, so it happens identically on
   every run: a rule that was declined at an edge once is declined there always, and the output
   contains nothing for the next run to reconsider.

Given 1–3, `M(M(x)) = M(x)`.

**The testing obligation of `pipeline-idempotency.md` §6 extends to modes**: the bounded
exhaustive sweep must be run in `html` and `markdown` mode over documents that place span
boundaries inside the swept string — at minimum a template like `A<em>B</em>C` with the sweep
alphabet distributed across `A`, `B` and `C`. A sweep that only ever produces one span tests
none of this document.

---

## 6. Which §4 claims change

Per `pipeline-idempotency.md` §5.2, a **[P]** claim is a promise about `transform`. Several were
written for `text` mode and are mode-dependent. The notation extends: **[P: html, markdown]**
means the claim holds in those modes only.

- **"Anything inside a skipped region"**, asserted in every rule's §4, is **[P: html, markdown]**
  and is now _defined_ rather than assumed — §3.6 and §3.7 are what those bullets refer to. In
  `text` mode there are no skipped regions and the bullet is vacuous.
- **`dashes` §4 "URLs, code spans, fenced code, HTML attributes"** — **[P: html, markdown]**.
  In `text` mode a URL is ordinary text. The rule is nevertheless safe there, but by its own
  guards (P1 declines the tight hyphens in `a-b`, the cluster guard declines `2026-08-15`), not
  because anything skipped it. The distinction matters to a reader deciding whether to run
  `text` mode over a document containing URLs.
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
  "text unit" is the concatenation, and §3.4 additionally refuses any insertion at a span
  boundary, so no span ever begins or ends with a character `nbsp` put there. The guarantee is
  now about element boundaries as well as document boundaries.

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
   (PLAN.md §4) and is recorded so the span model is not mistaken for an extension point.
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
