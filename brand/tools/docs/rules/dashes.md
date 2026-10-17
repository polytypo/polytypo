---
title: Dashes
description: The dashes rule sets the parenthetical dash in the form each locale prescribes, and leaves compound hyphens, numbers, ranges and arrows alone.
section: rules
order: 40
---

The `dashes` rule renders the **parenthetical dash**, the one that interrupts a sentence, in the form the locale prescribes. A spaced hyphen or a doubled hyphen becomes the locale’s dash: a tight em dash in `en-US`, a spaced en dash in `de-DE` and `en-GB`, a spaced em dash in `fr` and `ru`. An em dash or en dash the author already typed is corrected in the same way, in spacing and in length.

It is on by default, runs after [spaces](/docs/rules/spaces/), [ellipsis](/docs/rules/ellipsis/) and [ranges](/docs/rules/ranges/), and works in all four modes. It is deliberately conservative. It only touches a stroke that is symmetrically spaced and has text on both sides, and it never touches a hyphen inside a word, a number, a date, a command-line flag or a list marker.

## How it works

The rule scans the text for a **dash token**: a maximal run of dash characters. The characters that count are the hyphen-minus (U+002D), the hyphen (U+2010), the en dash (U+2013), the em dash (U+2014) and the minus sign (U+2212). A run is one token, so `--` is one dash, not two.

Each token then goes through a series of checks. The first one that fails leaves the token exactly as written.

1. **Length.** A run of four or more is decoration (a horizontal rule, a signature line, a Markdown `----`) and is skipped. Runs of one, two or three are candidates.
2. **Symmetry.** The token must have a single ordinary space on both sides, or on neither. A stroke that is spaced on one side only is not a dash: `--force`, `-v`, `- item`, `-- signature`, `->`.
3. **Content on both sides, on the same line.** A dash at the start or end of a line has nothing to interrupt, which protects list items and thematic breaks.
4. **Isolation.** If the character beyond the spacing is another dash, a space or a no-break space, the token is skipped. This covers `a- - a` and any dash that touches a no-break space.
5. **Clusters.** A stretch of digits and dashes with two or more dash runs in it (`2026-08-15`, `212-555-1234`, `a—0–0`) is left entirely alone.
6. **Compound words.** A single hyphen with no space around it is a compound-word hyphen: `well-known`, `e-mail`, `Jean-Luc`.
7. **Numbers.** A dash with a digit on each side is not handled here at all; it belongs to the [ranges](/docs/rules/ranges/) rule.
8. **Roman numerals.** A tight dash between two Roman numerals is left alone.
9. **A single authored en dash** is never rewritten.

A token that passes everything is replaced according to the locale’s `dash.parenthetical` value, with any ordinary spaces around the old dash replaced too. The rule always writes an ordinary space (U+0020). Whether that space becomes a no-break space is decided later by [nbsp](/docs/rules/nbsp/).

## Locale data

The rule reads one field, `dash.parenthetical`, which has five possible values: a length (`em` or `en`) and a spacing (`tight` or `spaced`), or `none`.

| Value | Result | Locales |
| --- | --- | --- |
| `em-tight` | `word—word` | en-US |
| `en-spaced` | `word – word` | cs, nl, en-GB, fi, de-DE, de-CH, pl, pt-BR, sv |
| `em-spaced` | `word — word` | fr, fr-CA, it, pt-PT, ru, uk |
| `none` | left as written | el, es, tr |

`none` means the locale has no verified convention for the parenthetical dash. The rule emits nothing for it, not even a fallback. The range dash is a separate field read by [ranges](/docs/rules/ranges/); the two can differ within one locale. Russian, for example, sets a spaced em dash in a sentence and a tight em dash in a range.

## Parenthetical dashes

The same input, run through three locales, shows the three active conventions. The English input uses a spaced hyphen, the German one a doubled hyphen with no spaces.

```example
locale: en-US
---
The plan - if there is one - fails.
```

```example
locale: en-GB
---
The plan--if there is one--fails.
```

```example
locale: ru
---
Москва - столица
```

A tight locale removes the spaces around the dash; a spaced locale adds them when the input has none. In `de-DE` the doubled hyphen becomes a spaced en dash:

```example
locale: de-DE
---
Der Plan--falls es einen gibt--scheitert.
```

### Dashes that are already typed

An em dash or en dash in the input is not preserved as the author’s choice. It is classified and replaced like a hyphen would be, so both its length and its spacing are brought to the locale’s form. `en-US` turns a spaced em dash into a tight one; `de-DE` turns a tight em dash into a spaced en dash.

```example
locale: en-US
---
The plan — if there is one — fails.
```

```example
locale: de-DE
---
Der Plan—falls es einen gibt—fällt.
```

A mixed run of dash characters is one token and is treated the same way. Here `-–` is a run of two:

```example
locale: en-US
---
a-–b
```

The U+2010 hyphen and the U+2212 minus sign are ordinary candidates too, since they are typewriter or OCR substitutes for a hyphen-minus.

### The lone en dash is never rewritten

One case is exempt. A single, pure U+2013 is left alone in every locale. An en dash and an em dash do different jobs (connection and range against interruption), and a lone en dash is taken to be a deliberate mark of the first kind. In `en-US`, where the parenthetical form is an em dash, a spaced en dash stays an en dash:

```example
locale: en-US
---
1 May – 3 June
```

The exemption applies to a run of exactly one en dash. A run mixing it with another dash character is still converted, as in the `a-–b` example above.

## Compound words, flags and list markers

A hyphen with no space around it is part of a word, and the rule does not read it as a dash. This is why the symmetry and compound checks come first. The input below contains a compound, an e-mail address, an identifier with a digit suffix and a name, and none of them changes:

```example
locale: en-US
---
A well-known e-mail address, COVID-19, Jean-Luc
```

Asymmetric spacing keeps command-line flags, list items and signatures intact. A leading `- ` at the start of a line, as in a Markdown or YAML list, has no content to its left, so it is untouched. A signature `-- Iurii` at the start of a line is untouched for the same reason. In the output every stroke stays as typed; the only edit is a no-break space before `°C`, added by [nbsp](/docs/rules/nbsp/).

```example
locale: en-US
---
Run --force to override, -5 °C outside, a -> b
```

Lines made only of hyphens, such as `---` under a heading or as a thematic break, are skipped by the length and line-content checks:

```example
locale: en-US
---
Title
---
Body text
```

## Numbers, dates and ranges

A dash with a digit on both sides is a **range candidate** and belongs to the `ranges` rule, never to `dashes`. This holds whether or not `ranges` is turned on. With default options, `5-10`, `34-36`, `Figure 5-10` and an ISO date such as `2026-08-15` come out byte for byte as they went in:

```example
locale: en-US
---
Released 2026-08-15, pp. 34-36
```

Turn the `ranges` rule on and the page range becomes an en dash (bound with an invisible word joiner so it cannot wrap), while the date is still declined. See [Ranges](/docs/rules/ranges/) for the details.

```example
locale: en-US
rules: ranges
---
Released 2026-08-15, pp. 34-36
```

Since spec 1.3.0 a range candidate can also have one closed-up symbol such as `$` or `%` next to a number. `$15 - $20` and `35%-50%` are therefore `ranges` territory too, and `dashes` does not convert them:

```example
locale: en-US
---
Prices run $15 - $20, up 35%-50%.
```

The same applies to a dash between two numbers that is not a range, such as a phone number (`212-555-1234`) or an ISBN. They contain more than one dash run in a cluster of digits, so nothing in the cluster is touched.

A dash with a digit on one side only is a different case. `Price--$50--drop` has letters next to the dashes and is a normal parenthetical in `en-US`:

```example
locale: en-US
---
Price--$50--drop
```

In a locale with a spaced form this is one place where the rule declines. A tight dash that would gain spaces is left alone when it sits against a digit run which has another dash on its far side, because inserting a space there could change how the neighbouring token reads on a second pass. In `de-DE`, `Anstieg--50%--war` is therefore left as typed, exactly as `Anstieg--50--war` is. A locale with a tight form never hits this guard.

## Roman numerals

A tight dash between two Roman numerals is a range already in its correct form, and in Russian it is a tight em dash. Converting it with the spaced parenthetical form would damage correct text, so the rule skips it:

```example
locale: ru
---
в XV—XVII веках
```

In the output the dash is unchanged; the only edit is the no-break space that [nbsp](/docs/rules/nbsp/) adds after the one-letter word. The guard declines and never converts. `XV-XVII` typed with a hyphen is also left alone, so a hyphenated Roman range keeps its hyphen. Only capital Roman letters count, so lower-case words such as `mix—did` are still normalised.

## Spacing and no-break spaces

Only the ordinary space (U+0020) counts as spacing around a dash. A no-break space (U+00A0) or narrow no-break space (U+202F) beside a dash makes the whole token inert, on either side. A no-break space is not something this rule put there, so it is not this rule’s to reinterpret. The practical consequence is that the rule is stable under the pipeline’s own output: [nbsp](/docs/rules/nbsp/) may later turn the space before a Russian em dash into a no-break space, and a second run then leaves it alone.

A dash whose spacing is part no-break, such as one the author typed as `mot` + U+00A0 + `- autre`, is therefore never normalised.

## Punctuation and brackets

In a spaced locale the rule does not create a space that another rule would remove. A dash directly before `.`, `,`, `;`, `:`, `!`, `?`, `…` or a closing bracket, or directly after an opening bracket, is left alone. A tight locale emits no spaces, so there is nothing to undo and the dash converts:

```example
locale: de-DE
---
Ein Satz.--. Ende
```

```example
locale: en-US
---
Ein Satz.--. Ende
```

## Dash-like characters that are never touched

These characters are never candidates and never produced: the soft hyphen (U+00AD), the non-breaking hyphen (U+2011, which the [hyphen](/docs/rules/hyphen/) rule writes), the figure dash (U+2012), the horizontal bar (U+2015) and the small and fullwidth forms U+FE58, U+FE63 and U+FF0D. Each has a purpose of its own, and the rule does not read a specialised dash as a typo. A candidate whose neighbour is one of them is skipped as well.

## Modes and skipped regions

In `html`, `markdown` and `yaml` modes the rule only sees prose. Code spans, fenced code, URLs and HTML attributes are removed by the mode before the rule runs. The rule itself has no notion of a URL.

```example
locale: en-US
mode: markdown
dialect: commonmark
---
Use `a -- b` for the flag -- not the dash.
```

In `text` mode the whole input is prose, so a doubled hyphen inside a URL in plain text is converted like any other. Choose [a mode](/docs/getting-started/choosing-a-mode/) that matches the content if the text mixes prose and code.

## Turning it off

Set the rule off with the `rules` option. Nothing else changes, because disabling a rule removes it from the sequence without reordering the rest.

```js
import { transform } from 'polytypo';

transform('The plan - if there is one - fails.', {
  locale: 'en-US',
  rules: { dashes: false },
});
```

```example
locale: en-US
rules: -dashes
---
The plan - if there is one - fails.
```

## What it does not do

- It does not convert a range such as `1914-1918`. That is [ranges](/docs/rules/ranges/), which is off by default.
- It does not change a hyphen inside a word. The few forms where a hyphen must not break across lines belong to [hyphen](/docs/rules/hyphen/).
- It does not turn a leading `-` or `—` into a dialogue dash. A leading hyphen is a list marker in Markdown, and rewriting it would break list structure.
- It does not turn `->` or `=>` into arrows. They are source code more often than prose.
- It does not reformat dates or other digit chains.
- It does not recognise a named date range typed with a hyphen. `1 May - 3 June` has letters beside the hyphen, and in `en-US` it becomes `1 May—3 June`. Only an en dash the author already typed (`1 May – 3 June`) is protected. Recognising the hyphen form would need month names, which the locale data does not carry.
- It emits nothing for locales whose `dash.parenthetical` is `none` (Greek, Spanish, Turkish):

```example
locale: el
---
Το σχέδιο - αν υπάρχει - αποτυγχάνει
```

## Related

- [Ranges](/docs/rules/ranges/), which handles digit-flanked dashes
- [Hyphen](/docs/rules/hyphen/), which binds hyphens in listed Russian and Ukrainian forms
- [Spaces](/docs/rules/spaces/) and [Nbsp](/docs/rules/nbsp/), the rules that run before and after
- [Rule order](/docs/concepts/rule-order/)
- [Options](/docs/api/options/)

Normative text: [spec/rules/dashes.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/dashes.md).
