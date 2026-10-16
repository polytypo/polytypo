---
title: Options
description: Every polytypo option, its type and default, what it requires, and which error an invalid value raises.
section: api
order: 20
---

Options are the second argument of [`transform`](/docs/api/transform/) and [`analyze`](/docs/api/analyze/). Names are given as in JavaScript; each runtime spells them in its own style (`narrow_nbsp`, `NarrowNbsp`) with the same meaning.

| Option | Type | Default | Required |
| --- | --- | --- | --- |
| [`locale`](#locale) | string | none | always |
| [`mode`](#mode) | `"text"` \| `"html"` \| `"markdown"` \| `"yaml"` | `"text"` | no |
| [`dialect`](#dialect) | `"commonmark"` \| `"mdx"` | none | with `mode: "markdown"` |
| [`keys`](#keys) | list of strings | none | with `mode: "yaml"` |
| [`frontmatterKeys`](#frontmatterkeys) | list of strings | none | no |
| [`rules`](#rules) | map of rule id to boolean | all on except `ranges` | no |
| [`narrowNbsp`](#narrownbsp) | `"narrow"` \| `"nbsp"` | `"narrow"` | no |

## locale

Required, with no exceptions. An unknown or missing locale throws `POLYTYPO_UNKNOWN_LOCALE`; there is no fallback to English. Resolution (`de-AT` to `de`, `de` to `de-DE`) is specified in [Locale resolution](/docs/concepts/locale-resolution/). The locales are listed on [Locales](/locales/).

One call applies one locale. Language is never detected.

## mode

Selects what the input is. `text` has no parser and no skip list; `html` and `markdown` run the rules on prose only; `yaml` runs them only on the values of the keys you name. An unknown value throws `POLYTYPO_INVALID_MODE`. See [Modes](/docs/modes/overview/).

## dialect

Required when `mode` is `"markdown"`, with no default. Omitting it or giving an unknown value throws `POLYTYPO_INVALID_DIALECT`. It is ignored in the other modes. Dialects are never detected: see [Dialects](/docs/modes/markdown/dialects/).

## keys

Required when `mode` is `"yaml"`, with no default. The mapping keys whose scalar values are prose. Omitting it, or a value that is not a list of strings, throws `POLYTYPO_INVALID_OPTION`. An empty list is legal and processes nothing. Matching is exact, at any depth, with no paths or globs. It is ignored in the other modes. See [YAML keys](/docs/modes/yaml/keys/).

## frontmatterKeys

Optional, and meaningful only when `mode` is `"markdown"` (spec 1.7.0). Names the keys of a YAML frontmatter block whose values are processed. Absent means the block is skipped whole; an empty list is legal and processes nothing. A value that is not a list of strings throws `POLYTYPO_INVALID_OPTION`. It is ignored, and not validated, in the other modes. See [Frontmatter](/docs/modes/markdown/frontmatter/).

## rules

A map from rule id to boolean. `{ dashes: false }` switches a default-on rule off. `ranges` is the one rule that is off by default: `{ ranges: true }` switches it on. Absence of a key always means that rule's own default. Turning a rule off removes it from the pipeline and never reorders the rest. An unrecognised rule id throws `POLYTYPO_UNKNOWN_RULE`.

```example
locale: en-US
rules: ranges, -dashes
---
Pages 34-36 -- see "chapter" 3-5.
```

With `dashes` off and `ranges` on, the parenthetical `--` is left alone and the numeric ranges take an en dash. See [ranges](/docs/rules/ranges/) and [dashes](/docs/rules/dashes/).

## narrowNbsp

`"nbsp"` makes the engine emit U+00A0 wherever it would emit U+202F, the narrow no-break space that many common typefaces do not carry. The default is `"narrow"`. The option moves the rule's target rather than cleaning up afterwards, so the result is still a fixed point. Any other value throws `POLYTYPO_INVALID_OPTION`. It is checked whether or not `nbsp` is enabled, because the check belongs to the call.

```example
locale: fr
narrowNbsp: nbsp
---
Vraiment ? Oui !
```

See [Invisible characters](/docs/concepts/invisible-characters/).

## Validation order

Options are checked before anything is parsed, in this order: `mode`, `narrowNbsp`, `rules`, `locale`, `dialect`, then `frontmatterKeys`. A call with several invalid options reports the first in that order. Mode-specific options are validated only in their own mode, apart from `locale`, `mode`, `rules` and `narrowNbsp`.

## Related

- [transform](/docs/api/transform/)
- [Error codes](/docs/api/errors/)
- [Modes](/docs/modes/overview/)

Normative text: [spec/rules/modes.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/modes.md) and [spec/rules/nbsp.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/nbsp.md) (§3.1a).
