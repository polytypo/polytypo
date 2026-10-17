---
title: ranges
description: The opt-in ranges rule turns a hyphen between two numbers into the locale's range dash, with the guards that protect dates, phone numbers and decimals.
section: rules
order: 30
---

`ranges` rewrites the hyphen in a numeric range such as `1914-1918` or `5-10 days` into the dash the locale prescribes: an en dash in English, German, Swedish, Finnish, Polish and Czech, an em dash in Russian and Ukrainian. When the dash is tight (no spaces around it), the rule also binds it to the digits with zero-width word joiners so the range cannot break across lines.

**This rule is off by default.** Without it, `5-10`, `Figure 5-10` and `9-11` come through byte for byte unchanged. Turn it on with `rules: { ranges: true }`.

## Why it is opt-in

A hyphen between two numbers is ambiguous without the word in front of it. `takes 5-10 days` is a range. `Figure 5-10` is a compound label (figure 10 of chapter 5), and `9-11` can be a date or a proper noun. Telling them apart needs a per-locale list of label words, and the rules in polytypo scan code points, not words. So the rule makes the choice yours: with `ranges` on, a compound label that has the same shape as a range is converted too.

```example
locale: en-US
---
Takes 5-10 days. See Figure 5-10 and 1914-1918.
```

Notice that nothing changed. The same text with the rule on:

```example
locale: en-US
rules: ranges
---
Takes 5-10 days. See Figure 5-10 and 1914-1918.
```

All three converted, including `Figure 5-10`. That is the accepted trade-off.

## How it works

A hyphen (or a doubled hyphen, or a dash already there) between two numbers is a range candidate. The rule then checks five guards. All of them must pass; otherwise the text is left exactly as written, and the `dashes` rule does not touch it either.

1. **No letter before the number.** `MP3-4` and `H2-2` are rejected.
2. **No chain.** The numbers must not sit next to another dash. `2026-08-15`, `978-3-16-148410-0` and `212-555-1234` are rejected.
3. **Not a decimal or a path.** The number must not follow `.`, `,` or `/`, and must not be followed by `/`. `1.5-2.5` and `01/02-03/04` are rejected.
4. **Digit-run lengths.** Both numbers have the same number of digits, or the left one has one digit and the right one two, with the right one not starting with `0`. `1914-1918` and `5-10` pass. `ISO 8859-1`, `555-1234`, `1-800`, `2020-24`, `10-7` and `9-05` do not.
5. **Not decreasing.** The left number must not be larger than the right one. `20-10` is rejected.

If the guards pass, the rule looks up `dash.range` for the locale and replaces the hyphen with that form. Spaces around the original hyphen are replaced along with it, so `5 - 10` also becomes a tight range in a tight locale.

### Closed-up symbols

A symbol written directly against both numbers is repeated on both sides, and the range is recognised. The symbol must be the same character on both sides: `$` against `$`, `%` against `%`. The recognised symbols are the currency signs (including `$`, `£`, `¥` and the whole Currency Symbols block), `%`, `‰`, `‱` and `°`. A symbol on one side only does not block the range, so `$15-20` and `15-20%` convert.

Unmatched symbols are declined: `$15-€20` is a currency conversion, not a range. A symbol written with a space (`15 kg-20 kg`) is not a closed-up symbol, and the range is not recognised. Prefixes and suffixes of more than one character, such as `US$15-$20` and `15°C-20°C`, are not recognised either.

### The invisible binding

For tight forms the replacement is a word joiner (U+2060), the dash, and another word joiner. The joiners are zero-width, so the bound range looks exactly like an unbound one in any font, and in a diff the line shows a change with no visible difference. The site's examples make them visible; if you inspect output yourself, look at code points rather than glyphs. A range that is already in the target form (`5–10`) is left alone and not bound.

## Examples

English, en dash, tight:

```example
locale: en-US
rules: ranges
---
1914-1918 and pp. 34-36, takes 5-10 days
```

The same input in Russian, where the range is an em dash:

```example
locale: ru
rules: ranges
---
Годы 1941-1945 были тяжёлыми
```

German also uses a tight en dash, and a spaced hyphen between numbers is replaced too:

```example
locale: de-DE
rules: ranges
---
1914-1918 und 5 - 10 Tage
```

French has no verified range convention (`dash.range` is `none`), so the rule does nothing even when enabled:

```example
locale: fr
rules: ranges
---
Années 1914-1918
```

Guards at work. Dates, phone numbers, ISO standards, shorter-right ranges, decimals and part names are untouched:

```example
locale: en-US
rules: ranges
---
2026-08-15, 212-555-1234, ISO 8859-1, 2020-24, 10-7, 1.5-2.5, MP3-4, 1-800, 9-05
```

Closed-up symbols:

```example
locale: en-US
rules: ranges
---
$15-$20, 35%-50%, $15-20, 15-20%
```

Declined shapes:

```example
locale: en-US
rules: ranges
---
$15-€20, 15 kg-20 kg, US$15-$20
```

In `markdown` mode the rule runs on prose only:

```example
locale: en-US
mode: markdown
dialect: commonmark
rules: ranges
---
Takes `5-10` days, 5-10 days
```

## Locale data

The rule reads `dash.range`, one of `em-tight`, `em-spaced`, `en-tight`, `en-spaced` or `none`. The same field was always used for range styling; only the rule that reads it changed.

| Value | Locales |
| --- | --- |
| `en-tight` | `cs`, `en-GB`, `en-US`, `fi`, `de-DE`, `de-CH`, `pl`, `sv` |
| `em-tight` | `ru`, `uk` |
| `none` | `nl`, `fr`, `fr-CA`, `el`, `it`, `pt-BR`, `pt-PT`, `es`, `tr` |

`none` means the locale has no verified range convention. The rule emits nothing there, and does not fall back to the parenthetical dash.

## Options

Enable the rule explicitly:

```js
transform(text, { locale: 'en-US', rules: { ranges: true } })
```

`ranges: false` is the default. There is no other setting.

## Edge cases

- Digits are ASCII only. Arabic-Indic, Devanagari and fullwidth digits are not recognised.
- Decimal ranges (`1.5-2.5`) and abbreviated year ranges (`2020-24`) are left alone.
- Scores such as `5-0` are rejected because the left number is larger than the right, while `0-5` converts.
- `ranges` runs before `dashes`. A range candidate belongs to `ranges` alone, whether or not it is enabled: `dashes` never reinterprets a digit-flanked hyphen as a parenthetical dash. With both rules on, `a - 5-10` becomes `a—5–10` (the parenthetical dash first, then a bound range).
- A bare number with a space-separated unit is not a closed-up symbol. `15 kg–20 kg` stays out of scope.
- Because a range candidate is wider than a plain digit flank, text such as `$15 - $20` that `dashes` once converted by default is now left alone unless `ranges` is on, and is left alone in the `none` locales whatever you enable.

## Related

- [dashes](/docs/rules/dashes/): the parenthetical dash, which never touches a range candidate.
- [Rule order](/docs/concepts/rule-order/)
- [Invisible characters](/docs/concepts/invisible-characters/)
- [Options](/docs/api/options/)

Normative text: [spec/rules/ranges.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/ranges.md).
