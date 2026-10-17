---
title: analyze
seo_title: analyze(): preview typography changes without applying them | polytypo
description: The same pipeline as transform, reporting what it would change instead of changing it, with code-point offsets into your input.
section: api
order: 30
---

`analyze(input, options)` runs the identical pipeline as [`transform`](/docs/api/transform/) and returns the list of changes it would make, instead of the transformed string. It accepts the same options, validates them identically and throws the same errors.

It exists for review tooling: to show a reader what will change, and which rule changes it, without applying anything.

```js
import { analyze } from "polytypo";

analyze('Wait... "really"?', { locale: "en-US" });
// [
//   { ruleId: "ellipsis", start: 4,  end: 7,  before: "...", after: "…" },
//   { ruleId: "quotes",   start: 8,  end: 9,  before: '"',   after: "“" },
//   { ruleId: "quotes",   start: 15, end: 16, before: '"',   after: "”" },
// ]
```

```python
import polytypo

polytypo.analyze('Wait... "really"?', locale="en-US")
# [Change(rule_id='ellipsis', start=4, end=7, before='...', after='…'), ...]
```

```go
changes, err := polytypo.Analyze(`Wait... "really"?`, polytypo.Options{Locale: "en-US"})
```

```ruby
Polytypo.analyze(%q{Wait... "really"?}, locale: "en-US")
```

```php
Polytypo::analyze('Wait... "really"?', 'en-US');
```

## A change

| Field | Meaning |
| --- | --- |
| `ruleId` | the rule that made the change, one of the nine rule ids |
| `start` | offset into `input`, inclusive, in code points |
| `end` | offset into `input`, exclusive, in code points |
| `before` | the text the rule replaced; empty for a pure insertion |
| `after` | the text it replaced it with; empty for a pure deletion |

`start == end` is an insertion (`nbsp` inserts); an empty `after` with `end > start` is a deletion (`spaces` deletes).

- **Offsets are code points**, never UTF-16 indices or bytes. In `😀 and "this"` the opening quotation mark is at offset 6 in every runtime.
- **Offsets are into your input exactly as passed.** In `html`, `markdown` and `yaml` mode they are offsets into the document, not into the span the rules ran over.
- **Changes are in pipeline order**: rules in the fixed rule order, and within one rule ascending by `start`.

## What is guaranteed

- `analyze` accepts what `transform` accepts and rejects what it rejects, with the same error codes.
- It is pure and returns the same list for the same arguments.
- The list is **empty if and only if** `transform(input, options)` equals `input`.
- Every `ruleId` is a rule that was enabled for the call. A rule turned off, and `ranges` when it was not turned on, never appear.
- Every `start` and `end` is within the input and `start <= end`.

## What is not guaranteed

The list is a report, not a patch. How one visible change is split into records, such as one edit or two, is each runtime's own account of its work, and runtimes are not required to produce identical lists. The output of `transform` is the only byte-level contract: to get the text, call `transform`.

Two rules may also touch the same original range, and both changes are reported in original coordinates. In French, `spaces` deletes the space before `:` and `nbsp` inserts a no-break space at the same place:

| | ruleId | start | end | before | after |
| --- | --- | --- | --- | --- | --- |
| 1 | `spaces` | 3 | 4 | space | empty |
| 2 | `nbsp` | 4 | 4 | empty | U+00A0 |

Applying such a list as a patch is not guaranteed to reproduce `transform`'s output, and no change is merged or dropped to make it so.

## Related

- [transform](/docs/api/transform/)
- [Options](/docs/api/options/)
- [Rule order](/docs/concepts/rule-order/)

Normative text: [spec/rules/analyze.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/analyze.md).
