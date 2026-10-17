---
title: Idempotency
seo_title: Idempotent typography: why transform(transform(x)) equals transform(x) | polytypo
description: Why transform(transform(x)) equals transform(x) is a contract in every runtime, and what it means for text that is already typeset.
section: concepts
order: 30
---

`transform` is idempotent: running its output through `transform` again, with the same options, returns that output unchanged. In symbols, `transform(transform(x)) == transform(x)`.

This holds for every input, every locale, every mode and every rule selection. It is a release gate in every runtime, not a goal: a failing idempotency check blocks a release.

## What it means in practice

- **Already-typeset text is safe.** Content that has been through polytypo, or was typeset by hand to the same conventions, comes back identical. You can run a build step on every save, or on a whole archive more than once, and nothing drifts or grows.
- **There is no hidden second pass.** One call does the whole job. `transform` never loops until output stops changing; the rules compose correctly in a single pass.

## Examples

A first pass changes the text:

```example
locale: en-US
---
"Wait" -- it's done...
```

Feeding that result back in changes nothing:

```example
locale: en-US
---
“Wait”—it’s done…
```

The same holds for invisible characters. This French input already holds U+202F before `!` and `?`, and U+00A0 inside the guillemets, and comes back as it was:

```example
locale: fr
---
Oui ! « Non » ?
```

With `narrowNbsp: "nbsp"` the same text is converted to a fixed point of that option. Pass the same option on the second call:

```example
locale: fr
narrowNbsp: nbsp
---
Oui ! « Non » ?
```

## How it is guaranteed

Each rule is a fixed point on its own output. That is necessary but not sufficient: a later rule can undo the state an earlier rule left, so a pipeline of individually idempotent rules need not be idempotent. The spec therefore adds one obligation to every rule: **a rule must never create work for an earlier rule in the order**. Creating work for a later rule is fine, since that rule has not run yet and cleans it up in the same pass.

The check is exhaustive rather than sampled. Every runtime runs every string up to a fixed length over an alphabet that contains the characters the rules emit as well as those they read, for every locale, with each rule alone and with the full pipeline. Each conformance fixture is also run through `transform` a second time, with its own options.

## Edge cases

- **Options must match.** The guarantee is for the same options on both calls. A text produced with `narrowNbsp: "nbsp"` is a fixed point under that option, not under the default, where U+00A0 before French punctuation is converted to U+202F.
- **Disabled rules do not change the argument.** With a rule off, the remaining rules keep their relative order and the property holds for the subset.

## Related

- [Rule order](/docs/concepts/rule-order/)
- [Round trip](/docs/concepts/round-trip/)
- [The `transform` function](/docs/api/transform/)
- [Options](/docs/api/options/)
- [Invisible characters](/docs/concepts/invisible-characters/)

Normative text: [spec/rules/pipeline-idempotency.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/pipeline-idempotency.md).
