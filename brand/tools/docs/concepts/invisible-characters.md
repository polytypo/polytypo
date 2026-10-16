---
title: Invisible characters
description: The four characters polytypo inserts that you cannot see, U+00A0, U+202F, U+2011 and U+2060, what inserts each, how to spot them, and the narrowNbsp option.
section: concepts
order: 60
---

Four of the characters polytypo writes have no visible glyph in normal text, or look like something else. They are what make the output behave correctly at line ends. They are also what you are looking at when a diff shows a line "changed" that looks the same.

| Code point | Name | Inserted by | Purpose |
| --- | --- | --- | --- |
| U+00A0 | no-break space | [`nbsp`](/docs/rules/nbsp/) | keeps a short word, number or unit attached to its neighbour; also inside quote marks for some locales |
| U+202F | narrow no-break space | [`nbsp`](/docs/rules/nbsp/) | thin space before `? ! : ;` in French, never broken from the word before |
| U+2011 | non-breaking hyphen | [`hyphen`](/docs/rules/hyphen/) | stops a listed hyphenated form from splitting across lines |
| U+2060 | word joiner | [`ranges`](/docs/rules/ranges/) | binds a converted range as one unit; zero width |

## How each is produced

**U+00A0.** `nbsp` converts an ordinary space to U+00A0 where a break would read badly: after a Russian one-letter preposition, between a number and its unit, and inside the guillemets of locales that put a space there. It only converts spaces that exist. It does not add words or spacing you did not type.

```example
locale: ru
---
в Москве, с ним
```

```example
locale: en-US
---
See page 5 and 10 km.
```

**U+202F.** `nbsp` is the only rule that emits it. French sets a narrow space before `?`, `!`, `:` and `;`:

```example
locale: fr
---
Quoi ? Oui !
```

**U+2011.** `hyphen` replaces a hyphen with U+2011 inside a closed list of forms the locale declares, so they cannot be broken at the hyphen. It does nothing for a locale whose list is empty:

```example
locale: ru
---
из-под стола
```

**U+2060.** Only `ranges` emits it, and only when that rule is switched on. A range written tight is wrapped as joiner, dash, joiner:

```example
locale: en-US
rules: ranges
---
pages 5-10
```

## How to see them

The examples on this site make these characters visible: changed characters are highlighted, and non-printing ones are drawn as symbols. In your own tooling:

- In JavaScript, `JSON.stringify` does not escape them. Replace them yourself, for example `s.replace(/[  ‑⁠]/g, c => "\\u" + c.codePointAt(0).toString(16))`.
- Most editors have a "render whitespace" or "show invisibles" option.
- A U+00A0 or U+202F looks like a space and does not break; a U+2011 looks like a hyphen; a U+2060 looks like nothing at all.

## Fonts that lack U+202F

U+202F is missing from many common text faces. A browser then falls back to another font for that one character and the width changes in the middle of a line, and a PDF renderer with no fallback may drop the glyph. If that affects you, pass `narrowNbsp: "nbsp"`. It makes `nbsp` write U+00A0 wherever it would write U+202F:

```example
locale: fr
narrowNbsp: nbsp
---
Quoi ? Oui !
```

The substitution is applied to the rule's target, not to its output, so the result stays [idempotent](/docs/concepts/idempotency/) under the same option. Text produced with `narrowNbsp: "nbsp"` is not a fixed point of the default setting, which would turn those U+00A0 characters back into U+202F. Keep the option the same across runs. Any value other than `"narrow"` or `"nbsp"` throws `POLYTYPO_INVALID_OPTION`.

There is no option for U+2060 and none for U+2011. Turn `ranges` off, which is its default, to emit no word joiner, and `rules: { hyphen: false }` to emit no non-breaking hyphen. A word joiner is also carried along when a range is copied out of a page.

## Edge cases

- **Your own invisible characters are kept.** An existing U+2060, U+2007, U+2009, U+200A or U+FEFF is not touched by `nbsp`, and a U+00A0 or U+202F that is already the right character stays.
- **Fixed-width and thin spaces are not converted.** Only the ordinary space is.

## Related

- [No-break spaces](/docs/rules/nbsp/)
- [Hyphen](/docs/rules/hyphen/)
- [Ranges](/docs/rules/ranges/)
- [Options](/docs/api/options/)
- [Idempotency](/docs/concepts/idempotency/)

Normative text: [spec/rules/nbsp.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/nbsp.md).
