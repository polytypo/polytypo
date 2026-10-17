---
title: symbols
seo_title: Symbols rule: (c), (r), (tm) to ©, ®, ™ | polytypo
description: The symbols rule converts (c), (r) and (tm) to the copyright, registered and trademark signs, between-number x to the multiplication sign, and +/- before a digit to a plus-minus sign.
section: rules
order: 80
---

`symbols` performs three narrow substitutions that look trivial and are easy to get wrong:

- `(c)`, `(r)` and `(tm)` become ©, ® and ™.
- The letter `x` between two numbers becomes the multiplication sign ×.
- `+/-` followed by a number becomes ±.

Each substitution is a literal match with adjacency guards, so code, hexadecimal literals and ordinary words are left alone. The rule is on by default, reads no locale data and behaves the same in every locale.

## How it works

The rule scans left to right and tries three cases, each keyed on a different first character, so they never compete.

### Trademark signs

The accepted spellings are listed explicitly: `(c)` and `(C)`, `(r)` and `(R)`, and `(tm)`, `(TM)`, `(Tm)`, `(tM)`. Nothing else matches, so `(s)`, `(a)` and `(x)` are never touched. Three guards apply:

- **Left side, for `(c)` and `(r)` only.** If the character before is a letter or digit, `)` or `]`, or one of ©, ® or ™, nothing happens. This keeps `f(c)` and `arr[i](c)` intact. `(tm)` is exempt: `Acme(tm)` is how the sign is actually typed, so `f(tm)` does become `f™`.
- **Right side.** If a letter or digit follows directly, nothing happens. `(r)evolution`, `(c)ompiler` and `(s)he` are the "optional first letter" idiom.
- **No nesting.** If the character before is `(`, nothing happens: `((c))` is left as it is.

### Multiplication sign

The rule reads a whole chain of numbers joined by the letter: digits, optional space, the letter, optional space, digits, and so on. The letters accepted are Latin `x` and `X` and Cyrillic `х` and `Х`. The Cyrillic pair is included because a Cyrillic `х` between digits looks identical to a Latin `x` and is a keyboard-layout slip.

A chain converts only if all of these hold:

- Spacing is symmetric and consistent. Either every `x` has a space on both sides or none has. `3 x4` is declined, and so is `5x4 x 3`.
- The chain does not start directly after a letter (`H2x4`, `ax3`) and does not end directly before a letter. The second guard rejects hexadecimal `0x1F`.
- A hex literal such as `0x10` (no spaces, Latin `x`, first number exactly `0`) is declined.

The whole chain converts in one pass, so `5x4x3` becomes `5×4×3` at once. The existing spaces are kept, character for character: a no-break space already in the text stays a no-break space.

### Plus-minus

Only the three-character sequence `+/-` converts, and only when a digit follows it, optionally after one space. `+-` alone is never converted, since it appears in diffs, ASCII tables and regular expressions. A `+/-` directly after `[` (a regex character class) is skipped.

## Examples

Trademark signs, with the guards visible:

```example
locale: en-US
---
Acme (c) 2026, Acme(R), Acme (tm), Acme(TM). f(c) and (r)evolution and ((c)) and (s)he
```

Notice that `Acme(R)` and `f(c)` stayed (a letter before a `(r)` or `(c)`), while `Acme(TM)` converted.

Adjacent signs: a `(c)` or `(r)` directly after another sign is declined, which keeps a second pass from changing anything, while `(tm)` is always converted:

```example
locale: en-US
---
(c)(r) and (c)(tm) and (tm)(c)
```

Multiplication:

```example
locale: en-US
---
A 1920x1080 screen, 5x4x3 box, 3 x 4 and 3 x4 and 1080x and x264 and 0x1F and H2x4
```

Only the first three chains converted. Each of the others is asymmetric, has no number on one side, or looks like hex or a name.

The Russian layout case, where the letter between the digits is Cyrillic:

```example
locale: ru
---
Размер 5х4 см и 5x4х3 и 3 х 4
```

Both alphabets convert, even in one chain. The `nbsp` rule has also bound `см` to the number.

German and French get the same sign. The spacing differences come from `nbsp`:

```example
locale: de-DE
---
Maße 3 x 4 cm
```

Plus-minus:

```example
locale: en-US
---
Error +/-5 and +/- 5 and [+/-]5 and +/- indicates rows and +-5
```

Only the first two converted. The regex class, the prose use and `+-` are untouched.

In `markdown` mode, code spans are skipped:

```example
locale: en-US
mode: markdown
dialect: commonmark
---
Use (c) in `f(c) 5x4` and (c) here 5x4
```

In `html` mode, `<pre>` and attributes are skipped:

```example
locale: en-US
mode: html
---
<p>(c) 2026 5x4</p><pre>(c) 5x4</pre><a href="/a(c)">x</a>
```

## Locale data

None. The signs are the same code points in every locale, and the spacing around ×, ©, ® and ™ is not decided here. The rule only carries over whatever spacing the text already has.

## Options

`symbols` is on by default. To switch it off:

```js
transform(text, { locale: 'en-US', rules: { symbols: false } })
```

All three substitutions go off together; there is no way to keep one and drop another.

## Edge cases

- Matching is by code point, with no case folding, so a Turkish process behaves like any other.
- `x` as a word or variable (`x = 5`, `the x axis`, `Malcolm X`) has no number on both sides and stays.
- An existing × ends a chain: `5×4x3` becomes `5×4×3`.
- A Cyrillic `х` in a word, such as `хорошо`, is not touched: the rule needs ASCII digits on both sides and no letter next to the chain.
- Digits are ASCII only.
- `(c)` after an existing © (`©(c)`) is declined by the left-side guard, which is what keeps the rule stable on a second pass.
- The plus-minus sign needs a digit after `+/-`, so prose that names the characters is never rewritten.
- Skipped regions are decided by the mode, not by this rule. In `text` mode nothing is skipped, so `(c)` inside code is converted there.

## Related

- [nbsp](/docs/rules/nbsp/): spacing around ×, ©, ® and ™.
- [Rule order](/docs/concepts/rule-order/)
- [Markdown skip list](/docs/modes/markdown/skip-list/)
- [Modes overview](/docs/modes/overview/)

Normative text: [spec/rules/symbols.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/symbols.md).
