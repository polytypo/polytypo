# `analyze` — the reported-edits entry point

**Not a rule.** No entry in `spec/rules/order.json`, no locale data of its own, no edits. This
document specifies a **second public entry point** beside `transform`, which runs the identical
pipeline and reports what it would do instead of doing it.
**Spec version:** 1.3.0 (new in 1.3.0).

---

## 1. Why a second function and not an option

`transform` returns a string. A `dryRun: true`-style option would make the **return type depend
on the value of an argument**, and that is not portable across the five runtimes this project
targets: TypeScript could express it with overloads, but Go's `Transform(string, Options)
(string, error)` has no room for a second result shape, PHP would have to declare
`string|array`, and Python `str | list[Change]` — a union every caller must narrow before it can
use either half. One function, one return type, in all five.

So `transform` is untouched and keeps its signature. `analyze` is a sibling:

```
transform(input, options) -> string
analyze(input, options)   -> Change[]
```

Same `options`, same validation, same errors, same purity (`ARCHITECTURE.md` §7: no I/O, no
clock, no globals, reentrant). Everything §2 of every rule document says about what the pipeline
does applies unchanged — `analyze` **is** the pipeline; it merely keeps the edits instead of
discarding them after applying.

This is the feature `ARCHITECTURE.md` §7.1 reserved the engine's shape for: *rules produce edits,
the pipeline applies them*. Nothing in the engine changes to support it.

---

## 2. What a `Change` is

```
Change {
  ruleId  a rule id from spec/rules/order.json
  start   code-point offset into `input`, inclusive
  end     code-point offset into `input`, exclusive
  before  the text this rule replaced — empty for a pure insertion
  after   the text it replaced it with — empty for a pure deletion
}
```

- **Offsets are code points, never native string indices** (`ARCHITECTURE.md` §4.2). A runtime
  whose strings are UTF-16 must convert; a runtime whose strings are bytes must convert.
- **Offsets are into `input` exactly as the caller passed it.** In `html`, `markdown` and
  `yaml` mode that means offsets into the **document**, not into the span the rules actually ran
  over. This
  is not a new obligation: [modes.md](modes.md) §4 already defines the output as "the input
  source with a set of disjoint substring replacements applied **at recorded offsets**", and
  those are the offsets meant.
- `start == end` is a pure insertion; `before` is then empty. `after` empty with `end > start`
  is a pure deletion. Both occur: `nbsp` inserts, `spaces` deletes.

---

## 3. Order

Changes are reported in **pipeline order**: rules in the order `spec/rules/order.json` declares,
and within one rule ascending by `start`. That is the order in which the work actually happened,
and it is the order a reader needs to understand a result — `spaces` deleting a space and `nbsp`
putting a no-break one back at the same index is intelligible in that order and baffling in any
other.

---

## 4. What is contract and what is observation

This is the part to read before building anything on top.

**Contract, conformance-tested:**

- **A1.** `analyze` accepts exactly what `transform` accepts and rejects exactly what it rejects,
  with the same error codes — including `POLYTYPO_MALFORMED_INPUT` for a document that does not
  parse as its declared dialect.
- **A2.** `analyze` is pure and returns the same list for the same arguments, always.
- **A3.** The list is **empty if and only if** `transform(input, options) == input`. A document
  that needs nothing produces no changes; a document that produces no changes needs nothing.
- **A4.** Every `ruleId` is a rule that was **enabled for that call** — a rule turned off through
  `rules`, and `ranges` when it was not turned on, can never appear.
- **A5.** Every `start` and `end` is within `0 … length(input)` in code points, and
  `start <= end`.

**Observation, not conformance-tested:**

- **The decomposition itself.** How a runtime splits one visible change into `Change` records —
  one edit or two, where exactly a boundary falls when two rules touch adjacent characters — is
  that runtime's report of its own work. Five runtimes are **not** required to produce
  identical lists, and no fixture asserts one.

That line is drawn deliberately. Making the decomposition contract would freeze the internal
shape of every rule forever: two rules touching adjacent code points would have to agree, across
five languages, on how many edits that is. The cost is real and the benefit is not — a caller
wants to know *what changes and which rule did it*, which A1–A5 give.

**The output of `transform` remains the only byte-level contract.** If a caller needs the
transformed text, the way to get it is to call `transform`.

---

## 5. Changes may overlap, and a naive patch does not reconstruct the output

The pipeline is sequential: each rule sees the text the previous rules left. Two rules may
therefore touch the **same original range**, and both changes are reported, both in original
coordinates.

The standing example is French, where `spaces` (order 10) deletes the space before `:` and
`nbsp` (order 70) inserts U+00A0 at the same place:

| | ruleId | start | end | before | after |
| --- | --- | --- | --- | --- | --- |
| 1 | `spaces` | 3 | 4 | `␣` | |
| 2 | `nbsp` | 4 | 4 | | `⍽` |

Applying that list to the input as if it were a patch — even in order, even accumulating
offsets — is **not** guaranteed to reproduce `transform`'s output, and this specification does
not promise that it does. A consumer that wants the output calls `transform`; a consumer that
wants to show a reviewer what will change uses the list as the report it is.

An implementation **must not** silently merge or drop changes to make the list patchable. A
report that omits work the pipeline did is worse than one a caller cannot replay.

---

## 6. Conformance

No new fixture format. `spec/fixtures/*.json` keeps its `in`/`out` shape, and `analyze` is not
expressible in it — a fixture asserting a specific `Change[]` would be asserting the very
decomposition §4 declines to make contract.

Each runtime proves A1–A5 with its own tests, and the two that are cheap to get wrong are worth
naming:

- **A3 against the whole fixture corpus.** For every canonical fixture case, `analyze` returns
  an empty list exactly when `in == out`. That is a strong test and it costs one loop.
- **A5 under the mode adapters.** A runtime that reports span-local offsets in `html`,
  `markdown` or `yaml` mode passes every text-mode test and is still wrong. Test a document
  whose first span does not start at offset 0. `yaml` is the cheapest of the three to get wrong
  and the cheapest to test: no span in it ever starts at offset 0, since every one of them is
  preceded by at least a key and a colon.

---

## 7. Open questions

1. **A contract-level decomposition, if anyone ever needs one.** §4 makes the split an
   observation. If a consumer appears that genuinely needs byte-identical `Change[]` across
   runtimes — a distributed review tool, say, diffing one runtime's report against another's —
   that is a later, larger spec change: it would need a canonical edit-merging rule and fixtures
   in a new format. Nothing in this document forecloses it; A1–A5 stay true either way.
2. **`analyze` over a document with no spans.** `html` mode on a document that is markup from
   end to end returns an empty list, which A3 already requires, since `transform` returns the
   input unchanged. Recorded because it reads like an edge case and is not one.
