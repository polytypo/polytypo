---
title: Rule order
description: The fixed order in which the nine polytypo rules run, why each sits where it does, why ranges is off by default, and how options never reorder them.
section: concepts
order: 40
---

`transform` runs nine rules in one fixed order. The order is part of the specification, not an implementation detail, and it is identical in all five runtimes.

## The order

| Order | Rule | Default | Role |
| --- | --- | --- | --- |
| 10 | [`spaces`](/docs/rules/spaces/) | on | collapse repeated spaces, strip spaces before punctuation and inside brackets |
| 20 | [`ellipsis`](/docs/rules/ellipsis/) | on | three dots to the ellipsis character |
| 25 | [`ranges`](/docs/rules/ranges/) | **off** | numeric and date range dash |
| 30 | [`dashes`](/docs/rules/dashes/) | on | parenthetical dash |
| 35 | [`hyphen`](/docs/rules/hyphen/) | on | non-breaking hyphen in listed forms |
| 40 | [`quotes`](/docs/rules/quotes/) | on | straight quotes to the locale's pairs |
| 50 | [`apostrophe`](/docs/rules/apostrophe/) | on | remaining straight apostrophes |
| 60 | [`symbols`](/docs/rules/symbols/) | on | `(c)`, `(r)`, `(tm)` and the multiplication sign |
| 70 | [`nbsp`](/docs/rules/nbsp/) | on | no-break and narrow no-break spaces |

## Why the order matters

Each rule reads the output of the ones before it, so some orderings are required rather than chosen:

- **`spaces` is first** so every later rule sees clean spacing.
- **`ranges` runs before `dashes`.** A digit-hyphen-digit shape belongs to `ranges` alone, whether or not `ranges` is enabled; `dashes` never reinterprets it as a parenthetical dash.
- **`dashes` runs before `hyphen`.** By the time `hyphen` runs, `dashes` has already declined every hyphen that sits between letters.
- **`quotes` runs before `apostrophe`.** A straight apostrophe can be evidence that a single quote is part of a quotation. `quotes` uses that evidence first; `apostrophe` then converts whatever is left.
- **`nbsp` is last** so every other rule has settled the characters around the spaces it binds.

The order also underpins [idempotency](/docs/concepts/idempotency/): a rule may create work for a later rule but never for an earlier one.

## Examples

The input holds a digit range and a parenthetical dash. `ranges` is off, so the range keeps its hyphen while `dashes` converts the `--`:

```example
locale: en-US
---
5-10 -- "x"
```

Turning `ranges` on also converts the range, bound with word joiners, and `dashes` still handles the rest:

```example
locale: en-US
rules: ranges
---
5-10 -- "x"
```

## Options and order

`ranges` is the only rule that is off by default. A range and a compound label such as `Figure 5-10` have the same shape, and telling them apart would need the preceding word, which the rules never read. It is an explicit opt-in.

The `rules` option switches rules on or off by id. It never reorders them. A disabled rule is removed from the sequence and the rest keep their positions, and the order in which you list ids does not matter. Here `dashes` is off, so the spaced `--` stays while `ranges` still runs:

```example
locale: en-US
rules: ranges, -dashes
---
5-10 -- "x"
```

## Edge cases

- **Rule ids are public API.** They appear in the `rules` option. An unknown id raises `POLYTYPO_UNKNOWN_RULE`.
- **Which rules a locale affects varies.** `spaces`, `apostrophe` and `symbols` read no locale data; the others read the fields listed on their pages.

## Related

- [Options](/docs/api/options/)
- [Idempotency](/docs/concepts/idempotency/)
- [The span model](/docs/concepts/span-model/)
- [Ranges](/docs/rules/ranges/)
- [Error codes](/docs/api/errors/)

Normative text: [spec/rules/order.json](https://github.com/polytypo/polytypo/blob/main/spec/rules/order.json).
