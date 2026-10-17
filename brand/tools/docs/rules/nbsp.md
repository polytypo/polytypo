---
title: No-break spaces
description: How the nbsp rule converts and inserts U+00A0 and U+202F per locale, with the ten lists it reads, the narrowNbsp option and what it leaves alone.
section: rules
order: 90
---

The `nbsp` rule makes a line break fall where the language allows it. It turns an ordinary space into a no-break space (U+00A0) or a narrow no-break space (U+202F) where a locale needs one: before French `? ! ; :`, between a number and its unit, after a short Russian or Czech preposition, between initials and a surname. In a few places it inserts a space the author did not type.

It runs last (order 70), after every other rule has settled the characters around each space, and it is on by default in every mode. Almost everything it does is conversion of a space that is already there. Text that already carries the right no-break spaces passes through unchanged.

## How it works

The rule is one scan with ten sub-rules, N1 to N10, each driven by a list in the locale file. When two sub-rules want the same position, the earlier one wins and the position is edited once.

| Sub-rule | Locale field | What it does |
| --- | --- | --- |
| N1 | `beforePunctuation` | U+00A0 before the listed marks |
| N2 | `narrowBeforePunctuation` | narrow no-break space before the listed marks |
| N3 | `afterShortWords` | U+00A0 after a listed short word |
| N4 | `abbreviations` | U+00A0 for every space inside a listed abbreviation |
| N5 | `beforeUnits` | U+00A0 between a number and a listed unit |
| N6 | `afterSymbols` | U+00A0 between a listed symbol and the number after it |
| N7 | `initialBinding` | U+00A0 inside initials and between initials and a surname |
| N8 | `quotes.*.innerSpace` | the space just inside a quotation pair |
| N9 | `beforeNumber` | U+00A0 between a listed abbreviation and a following number |
| N10 | `beforeWord` | U+00A0 between a listed abbreviation and a following word |

Only N1, N2 and N8 insert a space. The others convert an existing space and do nothing if there is none.

### Before punctuation (N1, N2)

French sets a space before `:` `;` `!` `?`. The fr locale puts `:` in `beforePunctuation` (U+00A0) and `;` `!` `?` in `narrowBeforePunctuation` (U+202F). If the author typed no space, one is inserted. If there is a space, it is converted. If the correct character is already there, nothing changes.

```example
locale: fr
---
Vraiment ? Oui ! Et alors ; voici : un test.
```

Several guards keep this from damaging text:

- Only the first mark of a run takes a space: `Vraiment?!` gets one narrow space before the `?` and none before the `!`.
- The mark must be followed by a space, a closing bracket, a quote mark, an ellipsis, another listed mark or the end of the text. `http://example.org` and `12:30` therefore keep their colons tight.
- The space after an opening quotation glyph belongs to N8, so `«?` gets a no-break space after the guillemet and none before the question mark.
- A semicolon that ends a character reference (`&#160;`, `&amp;`) is skipped, so references survive in `text` mode.
- A line never begins with a no-break space, and a tab or a thin space someone placed deliberately is left alone.

```example
locale: fr
---
Vraiment?! Voir http://example.org et 12:30.
```

### Short words (N3)

Russian, Polish and Czech do not leave a one- or two-letter preposition at the end of a line. The word must follow a space, an opening bracket, an em or en dash or the start of the text, and be followed by exactly one ordinary space and then a letter, digit or opening bracket. The first letter is matched in either case; the rest must match exactly.

```example
locale: ru
---
Он живёт в Москве и работает на заводе.
```

```example
locale: cs
---
Byl jsem v Praze a u moře.
```

The Polish list differs from the Czech one (no `k` or `s`, but `w`), so the same sentence structure binds different words:

```example
locale: pl
---
Ala ma kota i idzie w las.
```

A word after a hyphen is not a free-standing word. In `из-за дождя` the `за` is the tail of one compound preposition and is not bound.

### Abbreviations (N4, N9, N10)

`abbreviations` lists multi-token forms written with ordinary spaces, such as German `z. B.` or Russian `т. е.`. Every space inside a listed form becomes U+00A0. The text on both sides must not be a letter or digit, and case must match exactly.

`beforeNumber` holds abbreviations that bind to a number after them (`Nr. 5`, `S. 12`). `beforeWord` holds those that bind to a word (`Mme Hugo`, `ул. Ленина`). Both require exactly one space and never insert one.

```example
locale: de-DE
---
Es sind 20 km, z. B. bis Berlin, siehe Nr. 5 und S. 12, § 3.
```

`beforeWord` has no way to see a sentence boundary, so locale files list only forms where the wrong reading is rare. In Russian, `ул.` binds forward to the street name. `г.` is a `beforeUnits` entry that binds backwards to a year, not a `beforeWord` entry:

```example
locale: ru
---
Мы жили на ул. Ленина, г. Москва, в 1990 г. см. № 5
```

### Units and symbols (N5, N6)

A unit in `beforeUnits` binds to the digits before it, when the unit is followed by something other than a letter or digit. Digits glued to a letter (`H2 O`) do not count as a number.

```example
locale: de-DE
---
Es sind 20 km und 5 %.
```

`afterSymbols` works the other way: `§ 3`, `№ 5`.

N5 and N6 only convert. `20km` and `50%` are left as typed, because adding a space would change the content.

```example
locale: de-DE
---
Es sind 20km und 50%.
```

### Initials (N7)

`initialBinding` is `none`, `chain` or `single`. An initial is one capital letter and a full stop at the start of a token.

- `chain` (en-US, de-DE, ru and others): the spaces between initials bind, and so does the space before the surname once the chain has two initials. A lone `A. Smith` does not bind, because it cannot be told from the end of a sentence.
- `single` (fr, cs): a single initial also binds to the following capitalised word.
- `none`: the sub-rule is off.

```example
locale: en-US
---
J. R. R. Tolkien wrote it. Meet A. Smith there.
```

A capital letter and a full stop that follow a lowercase letter and a full stop, as in `z. B.`, are the tail of an abbreviation and not an initial.

### Space inside quotation pairs (N8)

When a pair's `innerSpace` is `nbsp`, as it is for the French primary pair, N8 inserts or converts the space inside the guillemets. A spaced input and an unspaced input end up the same:

```example
locale: fr
---
Il a dit « mot » et «autre».
```

## Narrow versus ordinary no-break space

U+00A0 is a no-break space of normal width. U+202F is narrower, which is how French sets the space before `? ! ;`. N2 always targets the narrow space. No shipped locale gives a quotation pair a narrow inner space, so inside guillemets the rule writes U+00A0.

Many fonts have no glyph for U+202F. The browser then falls back to another font for that one character and the line width shifts, or a PDF renderer drops the glyph. The `narrowNbsp` option replaces the narrow target with U+00A0 everywhere the rule would have written U+202F:

```example
locale: fr
narrowNbsp: nbsp
---
Vraiment ? Oui ! Et alors ; voici : un test.
```

The option changes what is written, not which positions are chosen or what is read. An existing U+202F at a position the rule owns is normalised to the target. Elsewhere it is left alone. Valid values are `narrow` (the default) and `nbsp`; anything else raises `POLYTYPO_INVALID_OPTION`, even when `nbsp` is switched off. See [Options](/docs/api/options/). Converting the output yourself with `replaceAll` is not equivalent: feeding that result back through the rule turns the spaces into U+202F again.

## Locale data

Locales differ in which lists are filled. Each entry is attested by a source for its locale.

- **fr, fr-CA:** punctuation lists, French abbreviations, `M.` `Mme` `Mlle`, units, `art.` `n°`, guillemets with a no-break inner space (fr-CA has the colon only).
- **ru, uk:** short prepositions, abbreviations such as `т. д.`, units and `№`, `ул.`, initials in chains.
- **de-DE, de-CH:** `z. B.` `d. h.`, `Nr.` `S.` `Art.`, units, `§`.
- **cs, pl:** one- or two-letter prepositions, `§`, units, Czech `tj.` `tzv.`, Polish `lek. med.`.
- **en-GB, en-US, sv:** units (sv also `§`); en-US adds initial chains.
- **el:** every list is empty. For Greek the rule changes nothing, and the source for Greek explicitly rejects a space before punctuation.

```example
locale: el
---
Τι κάνεις; Έχει 10,5 % φέτος και «καλημέρα».
```

## Edge cases

- **Edges.** A no-break space is never inserted at the start or end of a text unit, and never next to a line break. In `html` this matters because a text node often begins at a tag.
- **Other spaces.** A tab, a thin space (U+2009), a figure space (U+2007) or any other fixed-width space is left as the author typed it.
- **Markup boundaries.** In `html` and `markdown`, a French mark that follows an inline element still gets its space: `<em>non</em> !` becomes `<em>non</em>` plus a narrow space plus `!`. The cost is that `12:<b>30</b>` is read as sentence punctuation and gets a space before the colon. A Russian preposition before an inline element, as in `в <em>Москве</em>`, stays unbound.
- **Case.** Short words match with a capital first letter. Abbreviations, units and symbols match exactly, so `Nr.` is not `nr.`.
- **Longest match.** If two list entries match at a position, only the longer is considered. If it fails a guard, the shorter is not tried.
- **Known miss.** `M. dupont` with a lowercase surname is not bound, because the initial rule needs a capital after the space.

## Related

- [Quotes](/docs/rules/quotes/): places the quotation glyphs whose inner space N8 owns
- [Spaces](/docs/rules/spaces/): removes the ordinary spaces that N1 and N2 then replace
- [Options](/docs/api/options/)
- [Invisible characters](/docs/concepts/invisible-characters/)
- [Rule order](/docs/concepts/rule-order/)

Normative text: [spec/rules/nbsp.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/nbsp.md).
