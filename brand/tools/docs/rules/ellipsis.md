---
title: ellipsis
seo_title: Ellipsis rule: three dots to U+2026 per locale | polytypo
description: The ellipsis rule turns runs of three or more dots into the single character U+2026 and writes the two-dot form after ? and ! in locales that use it.
section: rules
order: 20
---

`ellipsis` replaces a typed run of full stops with the single character U+2026 (…). In locales that write an ellipsis after a question or exclamation mark with only two dots, as Russian does with `Что?..`, it also produces that abbreviated form. It is on by default.

The rule is deliberately narrow. A run of exactly two dots is almost never touched, because `..` appears in relative paths, version ranges and numeric ranges.

## How it works

The rule works on each maximal run of dot-like characters (full stops and U+2026), in order:

1. A single full stop is an ordinary full stop. Nothing happens.
2. Three or more full stops become one U+2026.
3. A run that mixes full stops and U+2026 (`……`, `…..`, `..…`) is normalised to one U+2026.
4. A single existing U+2026 stays, unless the locale asks for the abbreviated form (below).
5. A run of exactly two full stops is left alone, with one exception in locales that do not use the abbreviated form: two dots directly after `?` or `!` become U+2026, because `Really?..` is a typing slip for `Really?…`.

### The abbreviated form

Some locales write the ellipsis after `?` or `!` with two dots, because the mark already occupies the first position of the three. When the locale sets `ellipsis.abbreviatedAfterTerminal` to true, an ellipsis whose left neighbour is `?` or `!` is written as two full stops. The rule decides this once per run: `Что?...` becomes `Что?..` in one step, an existing `Что?…` is rewritten to `Что?..`, and `Что?!...` becomes `Что?!..` because the character before the run is `!`. In these locales a two-dot run is never touched, so `Что?..` is already final.

Only the single character to the left of the run is examined.

### What arrives from `spaces`

The `spaces` rule runs first. It removes the spaces in a Chicago-style `. . .`, so that sequence reaches this rule as `...`. A space in front of a run of two or more dots is kept by `spaces`, so `See ../docs` and `e.g. ..` arrive with their spaces and are never merged into a three-dot run.

## Examples

Three dots, longer runs and mixed runs collapse to one character:

```example
locale: en-US
---
Wait... what? Hmm..... He left… Yes. No.
```

Notice that the single full stops, the existing ellipsis and the sentence ends are untouched.

```example
locale: en-US
---
Wait…… what? and ..… and ….
```

Two dots are protected, with the one exception after `?` or `!`:

```example
locale: en-US
---
See ../docs and Version 1..5 and e.g. ..
```

```example
locale: en-US
---
Really?.. and Really!.. and nothing..here
```

In Russian the rule goes the other way after `?` and `!`. After a letter, the ordinary ellipsis is used:

```example
locale: ru
---
Что?... Что?… Что?!... Он ушёл... см. ../
```

Notice that `Он ушёл...` got the ordinary ellipsis, since a letter precedes it, and the two-dot path `../` is left alone. Turkish and Ukrainian set the same flag:

```example
locale: tr
---
Ne?... Ne?… Gitti...
```

French does not use the abbreviated form, so `?...` becomes `?…`. The `nbsp` rule then adds the narrow no-break space in front of the question mark:

```example
locale: fr
---
Vraiment?... Il est parti...
```

Spaced dots merge (via `spaces`), and a space typed in front of a dot run survives:

```example
locale: en-US
---
Wait ... and Hello . . . and more
```

In `markdown` mode, code spans are not touched:

```example
locale: en-US
mode: markdown
dialect: commonmark
---
Run `foo...bar` then wait...
```

## Locale data

The rule reads one field, `ellipsis.abbreviatedAfterTerminal` (a boolean). It is true for `ru`, `tr` and `uk`, and false for the other locales shipped with polytypo, including `en-US`, `fi`, `fr`, `de-DE`, `el` and `sv`.

## Options

`ellipsis` is on by default. To switch it off:

```js
transform(text, { locale: 'en-US', rules: { ellipsis: false } })
```

With the rule off, `Wait...` stays as typed. The `spaces` rule still runs.

## Edge cases

- A single full stop is never touched, so decimals, abbreviations and `1.2.3` are safe.
- A run of exactly two dots is untouched everywhere, except directly after `?` or `!` in a locale without the abbreviated form. In the abbreviated locales a two-dot run is inert.
- Four dots collapse to one U+2026. The rule does not preserve the Chicago convention of an ellipsis followed by a full stop (`….`).
- Runs are maximal and are never joined across another character. Dots separated by a no-break space or a tab are separate runs; only `spaces`-stripped ordinary spaces let dots merge.
- U+2025 (‥), U+22EF and the CJK dot leaders are neither converted nor produced.
- The spacing around an ellipsis is not decided here. Whether `word …` takes a no-break space belongs to `nbsp`.
- The rule does not delete a space in front of an ellipsis, in any locale, including Greek.
- The abbreviated form is written only after `?` and `!`. A leading `..?` or `..!` is left alone.

## Related

- [spaces](/docs/rules/spaces/): runs first and decides which spaces around dots survive.
- [nbsp](/docs/rules/nbsp/): decides the spacing around the ellipsis.
- [Locale resolution](/docs/concepts/locale-resolution/)
- [Idempotency](/docs/concepts/idempotency/)

Normative text: [spec/rules/ellipsis.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/ellipsis.md).
