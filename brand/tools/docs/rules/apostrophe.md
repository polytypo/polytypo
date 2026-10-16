---
title: Apostrophe
description: The apostrophe rule turns the straight apostrophe into U+2019 in contractions, elisions, possessives and decade abbreviations, and leaves foot marks and primes alone.
section: rules
order: 70
---

The `apostrophe` rule converts a straight apostrophe (U+0027) to the typographic apostrophe (U+2019, ’) where it really is an apostrophe: a contraction (`don't`), an elision (`l'été`, `'tis`), a possessive (`the dogs' bowls`) or a decade abbreviation (`'90s`). Every edit replaces one code point with one code point, and nothing is inserted or deleted.

It is on by default and works in all four modes. It runs right after [quotes](/docs/rules/quotes/), which is the whole reason the two rules are separate. Pairing quotation marks needs a view of the whole paragraph. Deciding whether a mark is an apostrophe needs only the two characters beside it. The apostrophe rule therefore only sees the straight marks that `quotes` did not turn into quotation glyphs.

## How it works

For each remaining U+0027 the rule looks at the character on its left and the character on its right and takes the first case that matches.

| Left | Right | Result | Example |
| --- | --- | --- | --- |
| digit | not a letter | left as typed (a foot or minute mark) | `6' 2"`, `55° 40'` |
| letter or digit | letter or digit | converted | `don't`, `l'été`, `O'Brien`, `1990's` |
| closing bracket or closing quotation mark | letter or digit | converted | `(order 90)'s`, `“Hamlet”'s` |
| letter | end of text, space, or closing punctuation | converted | `dogs' bowls`, `Jesus'` |
| letter | opening quotation mark | converted | `l'“idée”`, `d'«urine»` |
| start of text, space or opening punctuation | letter or digit | converted | `'90s`, `'tis`, `'em` |
| anything else | anything else | left as typed | `a ' b`, `dogs''` |

A few details sit behind those rows.

- **The prime check comes first.** A digit on the left and no letter on the right is a measurement. `6'` and `6'2"` are feet and inches, not apostrophes, and the rule leaves them. `1990's` has a letter on the right, so it converts.
- **A leading elision becomes U+2019, never U+2018.** The mark in `'90s` or `'tis` is a raised comma standing for dropped characters, not an opening quotation mark. By the time the rule sees it, `quotes` has already had its chance to treat it as a quotation and declined.
- **Combining marks count as letters,** so `l'e` followed by a combining acute behaves like `l'é`.
- **Opening brackets do not count on the right.** `f'(x)` is a prime on a function name and stays as typed.
- **Closing sentence punctuation on the left does not count.** A mark after a comma or full stop could equally be an unpaired opening quotation mark, and the rule cannot tell, so it leaves it recoverable as U+0027.

The rule reads no locale data. The decision is structural, based on the two neighbouring characters, so it behaves the same in every locale. What differs per locale is the work `quotes` does beforehand, which determines what reaches this rule.

## Examples

Contractions, a possessive, a decade, a leading elision and an elision before `o'clock` all convert:

```example
locale: en-US
---
Don't go; the dogs' bowls; back in the '90s; 'Tis the season; it's 5 o'clock
```

A digit followed by a letter is a possessive or plural form, as in `1990's`, and converts. Foot and minute marks are left straight:

```example
locale: en-US
---
The 1990's were loud. He is 6' 2" tall, at 55° 40' N.
```

Elision is the main case in French and Italian, where an article or pronoun is attached to the next word, often directly before a quotation. Here `quotes` first turns the straight double quotes into guillemets, then this rule curls the apostrophe against the opening guillemet:

```example
locale: fr
---
L'été n'est pas d'accord. Qu'"il" parte et d'"urine" aussi.
```

A mark written with letters on both sides is an apostrophe whatever the language. A trailing possessive before a closing quotation mark in German also converts:

```example
locale: de-DE
---
„Hans'“ Buch
```

### Quotes and apostrophes together

A pair of single quotes around a phrase is a quotation. The `quotes` rule claims it first, and the apostrophe rule never sees those marks:

```example
locale: en-US
---
I said 'hello' to them, and 'goodbye'.
```

### Possessive after a closing bracket or quotation mark

A mark with a closing bracket or closing quotation glyph on its left and a letter on its right is a possessive:

```example
locale: en-US
---
The pipeline (order 90)'s own output
```

An inline code span or HTML element ending just before the mark also counts as a boundary, so a possessive written flush against `<code>` converts:

```example
locale: en-US
mode: html
---
<code>x</code>'s value
```

## Rock ’n’ roll

A single straight letter between spaces, as in `rock 'n' roll`, is read as an elision in every locale. `quotes` declines to pair it as a quotation precisely so that this rule converts both marks:

```example
locale: en-GB
---
rock 'n' roll
```

The same rule applies to any single `n` in single quotes. A genuine quotation of the letter comes out as an elision, which is an accepted cost:

```example
locale: en-US
---
The letter 'n' is common.
```

## Edge cases

- **An isolated mark is left alone.** A mark with a space on both sides, or two marks in a row, has nothing the rule can infer from. These stay straight:

```example
locale: en-US
---
a ' b and dogs''
```

- **A mark after a comma or other sentence punctuation** is not treated as a possessive. In `He said,'yes' and left.` the first mark stays straight because it may be an opening quotation mark that `quotes` could not pair, while the trailing one has a letter on its left and converts. The output is mismatched, and the straight mark is still recoverable.

```example
locale: en-US
---
He said,'yes' and left.
```

- **A prime on a function name** such as `f'(x)` stays straight.
- **The cost of reading closing brackets and quotation marks as possessives.** In `(aside)'quoted' here` the author may have meant a quotation. Both marks read as closing marks, and both convert.
- **Names transliterated with a modifier letter.** `Hawai'i` becomes `Hawai’i` with U+2019. The linguistically better character is often U+02BB or U+02BC, but telling them apart needs a word list the rule does not have.

## What it does not touch

- **A U+2019 that is already present** is never examined, so running the rule on typeset text changes nothing.
- **Other apostrophe-like characters:** the grave accent (`` ` ``), the acute accent (´), the modifier letter apostrophe (ʼ, a letter in several orthographies), and the prime (′). They are not candidates.
- **Primes are not converted to prime characters.** `6'` stays `6'`.
- **Marks in skipped regions.** The mode removes code spans, fenced code, URLs and HTML attribute values before the rule runs, so `it's` in prose and `'string'` in code are handled by the mode, not by the rule. Check:

```example
locale: en-US
mode: markdown
dialect: commonmark
---
It's `don't` and ok
```

```example
locale: en-US
mode: html
---
<p>It's</p><a href="x" title="it's">a</a><code>don't</code>
```

In `text` mode the whole input is prose, and every apostrophe in it is a candidate.

## Turning it off

```js
import { transform } from 'polytypo';

transform("Don't go", { locale: 'en-US', rules: { apostrophe: false } });
```

```example
locale: en-US
rules: -apostrophe
---
Don't go
```

Turning the rule off does not turn off `quotes`. A quotation in single quotes is still paired by it, and marks that `quotes` leaves unpaired stay straight.

## Related

- [Quotes](/docs/rules/quotes/), which runs first and decides which marks are quotation marks
- [Dashes](/docs/rules/dashes/), the other rule that works on small single-character marks
- [Rule order](/docs/concepts/rule-order/)
- [Idempotency](/docs/concepts/idempotency/)
- [Options](/docs/api/options/)

Normative text: [spec/rules/apostrophe.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/apostrophe.md).
