---
title: Quotes
description: How the quotes rule turns straight and foreign quotation marks into each locale's primary and secondary pairs, resolves nesting, and leaves unmatched marks alone.
section: rules
order: 60
---

The `quotes` rule finds quotation marks in the text and replaces them with the pair of glyphs the locale prescribes. A quotation inside a quotation gets the locale's secondary pair, so one input turns into different output in English, German, French or Polish. It also removes stray spaces just inside a pair where the locale writes none.

It runs fifth in the pipeline (order 40), before [apostrophe](/docs/rules/apostrophe/), and is on by default in every mode.

## How it works

The rule looks at every quote mark in the text: straight (`"` and `'`) and typographic (`«` `»` `“` `”` `„` `‘` `’` `‚` `‹` `›` and a few more), whether they belong to the locale or to another one. A mark that is already curly is not trusted to be right. `«Wort»` in German text is re-typeset to `„Wort“`, and `“hi”` in British text becomes `‘hi’`.

1. **Classify each mark.** A mark can *open* when it follows a space, an opening bracket, a dash, another quote mark or the start of the text, and is followed by non-space content. It can *close* when it follows non-space content and is followed by a space, punctuation, a dash, another quote mark or the end of the text. The space just inside the mark is ignored for this decision, so `" hello"` still opens. The space on the outside is evidence and is read literally: `"hi" to me` closes because a space follows it.
2. **Pair marks.** Marks are paired like brackets, using one stack for double-width marks (`"` `«` `“` `„` and so on) and one for single-width marks (`'` `‘` `’` `‹` `›`). A closing mark takes the nearest open mark on its own stack. A pair that encloses nothing but spaces is not formed.
3. **Assign glyphs by depth.** The depth of a pair is one plus the number of pairs that enclose it. Odd depth takes the locale's primary pair, even depth the secondary pair, alternating further down. Depth decides the glyphs, not the width of the mark the author typed, so an outer pair typed with single marks still receives the primary pair.
4. **Check the result.** The rule renders the pairing it intends to apply, runs the pairing again over that rendering, and drops pairs until the second pass reproduces exactly the pairs it started from. This is what keeps [idempotency](/docs/concepts/idempotency/) intact when converting marks changes how their neighbours read. In ordinary text the first check passes and nothing is dropped.
5. **Emit edits.** Only marks whose glyph changes are edited, and only inner spaces that should go are deleted.

## Examples

Straight marks, one level of nesting, in en-US. The inner pair is the secondary pair, and the apostrophe in *don't* is left for the next rule:

```example
locale: en-US
---
He said "she told me 'go home' twice" and left. "I don't know," she added.
```

Depth, not the typed width, picks the glyphs. The outer single marks become the primary pair and the inner double marks become the secondary pair:

```example
locale: en-US
---
'He said "no" to me,' she noted.
```

The same sentence in German. The primary pair is „ “ and the secondary pair is ‚ ‘:

```example
locale: de-DE
---
He said "she told me 'go home' twice" and left.
```

Swiss German uses guillemets for the primary pair and single guillemets for the secondary pair, with no spaces inside:

```example
locale: de-CH
---
He said "she told me 'go home' twice" and left.
```

Polish nests with „ ” on the outside and » « on the inside, the reverse of the French-style guillemets:

```example
locale: pl
---
Powiedział "to jest 'ważne' dziś".
```

Russian uses « » outside and „ “ inside:

```example
locale: ru
---
Он сказал: "это 'моё' дело".
```

British English reverses the English roles: single quotes are primary and double quotes are secondary:

```example
locale: en-GB
---
He said "she told me 'go home' twice" and left.
```

Existing curly marks are candidates too. Here a correct American pair sits in British text and is re-typeset to the local primary pair:

```example
locale: en-GB
---
“Already curly,” he said, and "this too."
```

Guillemets from another language convert to the locale's own pair. Spaces just inside the old marks are removed, because German writes none:

```example
locale: de-DE
---
Er sagte « Wort » leise.
```

French sets its primary guillemets with a space inside. `quotes` places the glyphs and `nbsp` supplies the no-break space, so a quotation typed with straight marks and one typed with loose spaces both end up the same:

```example
locale: fr
---
Il a dit "bonjour" puis « merci ».
```

## Locale data

The rule reads these fields from the locale:

- `quotes.primary` and `quotes.secondary`, each with an `open` glyph, a `close` glyph and an `innerSpace` value.
- `quotes.elisionIdioms`, a short list of fixed phrases whose single quotes are elisions, such as `rock 'n' roll` in en-US.
- `quotes.elisionClitics`, lists of word fragments (`s`, `l`, `qu`, `jusqu` and similar) used when a mark sits against the edge of an inline span in HTML or Markdown.

`innerSpace` is `none` in most locales and `nbsp` for the French primary pair. When it is `none`, `quotes` deletes spaces just inside the pair. When it is anything else, `quotes` does not touch them and [nbsp](/docs/rules/nbsp/) inserts or converts them.

The glyph conventions differ enough to be worth comparing:

| Locale | Primary | Secondary |
| --- | --- | --- |
| en-US | “ ” | ‘ ’ |
| en-GB | ‘ ’ | “ ” |
| de-DE | „ “ | ‚ ‘ |
| de-CH | « » | ‹ › |
| fr | « » with no-break spaces inside | “ ” |
| pl | „ ” | » « |
| ru | « » | „ “ |
| fi, sv | ” ” | ’ ’ |

Finnish and Swedish use the same glyph on both sides of a pair. The pairing, not the glyph, tells the rule which mark opens and which closes, so `”Hän sanoi ’moi’”` is a stable result in `fi` and the rule does not mistake it for something to fix.

## Edge cases

- **Apostrophes inside words.** A single-width mark with a letter or digit on both sides (`don't`, `l'été`, `O'Brien`, `1990's`) is never part of a quotation. The [apostrophe](/docs/rules/apostrophe/) rule converts it afterwards.
- **`rock 'n' roll`.** A pair of single marks around exactly one letter `n` or `N`, with a space outside each mark, is treated as elision in every locale, and both marks become apostrophes. The cost is stated: `The letter 'n' is common.` is read the same way. A quoted `n` followed by a comma is not affected.

```example
locale: en-US
---
rock 'n' roll and the 'quoted' word
```

- **Elisions that find no partner.** `'90s` and a trailing possessive such as `the dogs' bowls` are left as typed by this rule and handed to `apostrophe`. A lone leading elision can still be paired with a distant closing mark in the same text, because nothing local distinguishes them.
- **Unmatched marks.** The rule converts what it can pair and leaves the rest. A single stray mark stays exactly as typed:

```example
locale: en-US
---
She said "hello
```

- **Foot and inch marks.** `6' 2"` have nothing to pair with, so they are not changed.

```example
locale: en-US
---
He is 6' 2" tall.
```

- **Runs of identical marks.** `""`, `'''` and `««` are left alone. So is a pair that encloses nothing but spaces (`«»`, `" "`).

```example
locale: en-US
---
He said "" then left.
```

- **Spaces next to the marks.** Spaces inside the pair go when the locale's `innerSpace` is `none`, and only when the next character is a letter, a digit or another quote mark. A space in front of a dash is kept, so `" --x"` loses no space and the glyphs still convert. A line break is never deleted or crossed by a space-skipping check, so a mark at the end of a line does not open across it. Outer spaces are never touched.
- **Pairs across blocks.** Pairing runs over the whole text unit. A quotation can span a blank line in `text` mode, and an unclosed mark can pair with one much further on. In `html` and `markdown` modes a quotation can open before an inline element and close after it.
- **Possessives next to markup.** In `html` and `markdown`, a mark written flush against an inline span, such as `` `x`'s `` or `<code>x</code>'s`, is read through the locale's `elisionClitics` list, so the possessive stays an apostrophe and does not open or close a quotation:

```example
locale: en-GB
mode: markdown
dialect: commonmark
---
He says 'avoid `x`'s printer.' Done.
```

- **Plural possessives next to markup.** `` `xs`' printer `` has the same shape as a closing mark after a span. The rule cannot tell them apart, and the pairing it chooses stands.
- **Primes and look-alikes.** U+2032, U+2033, U+02BC, the grave accent and the acute accent are not quote marks and are never converted.
- **Skipped regions.** Code, URLs, attribute values and other regions skipped by the mode adapter are not examined. See the [span model](/docs/concepts/span-model/).

## Related

- [nbsp](/docs/rules/nbsp/): inserts the no-break space inside French guillemets
- [apostrophe](/docs/rules/apostrophe/): converts the straight apostrophes this rule declines to pair
- [Rule order](/docs/concepts/rule-order/)
- [Idempotency](/docs/concepts/idempotency/)
- [Locale resolution](/docs/concepts/locale-resolution/)

Normative text: [spec/rules/quotes.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/quotes.md).
