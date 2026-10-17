---
title: Locale resolution
description: How the locale option becomes exactly one locale: exact match, alias, one region strip, and an error otherwise, never a fallback to English.
section: concepts
order: 50
---

`transform` needs exactly one locale, named by the required `locale` option. Resolution turns the tag you pass into one of the nineteen supported locales, or throws `POLYTYPO_UNKNOWN_LOCALE`. There is no default locale, and no fallback to English or to any "nearest" language.

The algorithm is specified in the spec and is the same in all five runtimes. It does not use the platform's locale-negotiation library, because those libraries disagree with each other and will return a best guess for a language the tool has never heard of. Applying Finnish rules to a Portuguese text silently is worse than an error.

## How it works

1. **Presence.** A missing, `null`, empty or non-string `locale` throws.
2. **Canonicalisation.** `_` becomes `-`, the language part is lowercased, the region part uppercased. This uses plain ASCII arithmetic, so the host's own locale (a Turkish machine, for example) has no effect. `EN_us`, `en-US` and `en_US` are the same tag.
3. **Shape check.** Only two shapes are accepted: two letters (`de`), or two letters, a hyphen and two letters (`de-AT`). Three-letter codes (`eng`), script subtags (`sr-Latn`), numeric regions (`es-419`) and `und` throw.
4. **Resolve.**
   1. If the tag is a supported locale, use it.
   2. If the tag is an alias, use its target.
   3. If the tag has a region, drop the region once and try the language alone, first as a locale and then as an alias.
   4. Otherwise throw.

The region is dropped once. There is no second retry, a language is never dropped, and an alias never points to another alias.

## Supported locales and aliases

Nineteen locales: `cs`, `nl`, `en-GB`, `en-US`, `fi`, `fr`, `fr-CA`, `de-DE`, `de-CH`, `el`, `it`, `pl`, `pt-BR`, `pt-PT`, `ru`, `es`, `sv`, `tr`, `uk`. Three aliases: `en` is `en-US`, `de` is `de-DE`, and `pt` is `pt-PT`. See [all locales](/locales/).

## Examples

An alias:

```example
locale: en
---
"quoted"
```

A region that is not supported is stripped, then the language is looked up. `de-AT` becomes `de`, which is the alias for `de-DE`:

```example
locale: de-AT
---
"quoted"
```

`de-CH` is its own locale and is not stripped:

```example
locale: de-CH
---
"quoted"
```

`tr-TR` has no entry of its own. The region is stripped and `tr` matches:

```example
locale: tr-TR
---
"quoted"
```

`fr-BE` resolves to `fr`; `fr-CA` is a separate locale with different spacing around quotes:

```example
locale: fr-BE
---
"quoted"
```

Case and separator do not matter:

```example
locale: EN_us
---
"quoted"
```

Unsupported language. Norwegian is not Swedish or Danish, and nothing guesses:

```example
locale: nb-NO
expect: error
---
"quoted"
```

Malformed tags are rejected the same way:

```example
locale: sr-Latn
expect: error
---
"quoted"
```

```example
locale: es-419
expect: error
---
"quoted"
```

```example
locale: eng
expect: error
---
"quoted"
```

## Edge cases

- **One code for every failure.** A malformed tag and an unknown one both raise `POLYTYPO_UNKNOWN_LOCALE`. See [Error codes](/docs/api/errors/).
- **A region silently resolves to its language.** `sv-FI` uses the Swedish locale, and `en-AU` uses `en-US`. If a region needs different conventions, it is not distinguished from its language unless it is in the list above.
- **No environment lookups.** `LANG`, `navigator.language` and `Accept-Language` are never read. Pass the locale of the content you are typesetting.
- **Resolved once per call.** Resolution happens before any rule runs, and nothing is cached between calls.

## Related

- [Options](/docs/api/options/)
- [Error codes](/docs/api/errors/)
- [The `transform` function](/docs/api/transform/)
- [All locales](/locales/)

Normative text: [spec/rules/locale-resolution.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/locale-resolution.md).
