---
title: Hyphen
description: The hyphen rule binds the hyphen in listed Russian and Ukrainian forms with a non-breaking hyphen so a line break cannot split the word.
section: rules
order: 50
---

The `hyphen` rule replaces a hyphen-minus (U+002D) with a non-breaking hyphen (U+2011) inside a closed list of forms, so that a line-breaking algorithm cannot split the word at the hyphen. It exists for Russian and Ukrainian, where `из-под`, `кое-что` and `сделал-таки` are single words and a line ending in `из-` is a typographic fault.

It is a data-driven rule. It does nothing except where a locale has listed a literal form. It changes one code point to another of the same meaning: it never inserts, deletes or moves anything and never touches spacing. Two of the nineteen locales, `ru` and `uk`, carry lists. For the other seventeen the rule is a no-op, and the output is identical byte for byte.

It is on by default, runs after [dashes](/docs/rules/dashes/) and before [quotes](/docs/rules/quotes/), and works in all four modes.

## How it works

A locale lists forms in three groups:

- **compounds**: whole hyphenated words, such as `из-под`
- **prefixes**: word-initial forms ending in a hyphen, such as `кое-`
- **suffixes**: word-final forms starting with a hyphen, such as `-таки`

At each position the rule picks the longest listed form that matches there, trying compounds before prefixes before suffixes on a tie. It then checks the word boundaries for that group. If the check passes, the hyphen becomes U+2011 and the scan continues after the match. If it fails, nothing is changed at that position, and no shorter form is tried there.

| Group | The form must | And the boundary check requires |
| --- | --- | --- |
| compound | be a whole word | no letter, digit or hyphen directly before or after it |
| prefix | start a word | no letter, digit or hyphen before it, and a letter right after the hyphen |
| suffix | end a word | a letter right before the hyphen, and no letter, digit or hyphen after the form |

The matching is exact with two exceptions. A hyphen in a listed form matches either a hyphen-minus or a non-breaking hyphen in the text, which is what makes the rule idempotent. And the first letter of a form also matches its capital, so a form at the start of a sentence is found. Nothing else is case-folded.

Because [dashes](/docs/rules/dashes/) runs first and never converts a hyphen with a letter on each side, every hyphen this rule sees has already been left alone as an ordinary compound hyphen.

## Examples

A compound, in the middle of a sentence and at the start of one. The capital `И` matches because the first letter of a form is case-lenient:

```example
locale: ru
---
Достал из-под стола. Из-за дождя ушёл.
```

Prefixes and suffixes. A prefix has to be followed by a letter, and a suffix has to follow one:

```example
locale: ru
---
кое-что и кой-кого, что-нибудь или что-либо, он сделал-таки это, скажи-ка
```

The same hyphen is also left alone where the form is not complete. Here the first `кое-` is followed by a space, so it does not qualify as a prefix, while the second one does:

```example
locale: ru
---
кое- и кое-что
```

A listed form inside a longer word does not match, and neither does a hyphenated word that is not on the list. `научно-технический` is an ordinary compound adjective, and the rule has no morphology of its own, only the list:

```example
locale: ru
---
квазииз-подный и научно-технический
```

A suffix at the start of a line has no letter before it, so it is not a suffix:

```example
locale: ru
---
-таки в начале
```

### Ukrainian

Ukrainian lists more forms, including abbreviations and compounds with `з-`:

```example
locale: uk
---
будь-який, з-під столу, хтозна-що, ін-т, гр-н
```

### Locales without lists

English, German, French and every other locale outside `ru` and `uk` have empty lists. The hyphens below stay hyphen-minus characters:

```example
locale: en-US
---
A well-known e-mail address, COVID-19, Jean-Luc
```

## Locale data

The rule reads three required fields from the `hyphen` object of the locale, each a list of lower-case literal strings that may be empty:

- `hyphen.prefixes`
- `hyphen.suffixes`
- `hyphen.compounds`

Each entry must contain at least one hyphen-minus; an entry without one is malformed locale data and raises `POLYTYPO_MALFORMED_LOCALE_DATA`. The lists are exactly what the locale file says:

| Locale | Prefixes | Suffixes | Compounds |
| --- | --- | --- | --- |
| ru | `кое-`, `кой-` | `-то`, `-либо`, `-нибудь`, `-таки`, `-ка` | `из-за`, `из-под` |
| uk | `будь-`, `казна-`, `хтозна-`, `бозна-` | `-бо`, `-но`, `-от`, `-то`, `-таки`, `-будь`, `-небудь` | nineteen forms, among them `з-під`, `із-за`, `ін-т`, `р-н` |

## Already bound, and idempotency

A form that already carries a non-breaking hyphen matches the list in the same way and is left unchanged. Running the rule twice, or on text that was already typeset, changes nothing more:

```example
locale: ru
---
Достал из‑под стола
```

## Edge cases

- **All capitals are not matched.** `ИЗ-ПОД СТОЛА` keeps its ordinary hyphen. Only the first letter of a form is case-lenient. `Из-под` matches, but a heading set in capitals, or a form such as `Из-Под` with a capital inside it, does not.

```example
locale: ru
---
ИЗ-ПОД СТОЛА
```

- **Lists are blunt.** `-то` is a particle in `кто-то` but a different word in other positions. The rule binds any listed suffix that follows a letter, so a locale lists only forms whose binding is unconditional.
- **It does not fix spelling.** The rule binds a hyphen that is already there. It does not rewrite the morphology around one, so a Russian ordinal such as `10-ый` is left as typed.
- **Other dash-like characters are never read or written:** U+2010, the soft hyphen U+00AD, U+2012, U+2013, U+2014 and U+2212. A soft hyphen inside `из-под` is the author’s deliberate break hint.
- **Rendering.** U+2011 forbids a break at the hyphen. Some older fonts lack the glyph and fall back visibly. A renderer’s own automatic hyphenation may still break the word elsewhere at a syllable boundary.

## Modes and skipped regions

The rule runs on prose in every mode. In `markdown` and `html` the mode keeps URLs, code spans, fenced blocks and attributes out of its reach, so a slug such as `/из-под` is safe and the word next to it is still bound:

```example
locale: ru
mode: markdown
dialect: commonmark
---
См. https://example.com/из-под и из-под стола.
```

In `text` mode everything is prose. The rule has no URL awareness of its own.

## Turning it off

```js
import { transform } from 'polytypo';

transform('Достал из-под стола', {
  locale: 'ru',
  rules: { hyphen: false },
});
```

```example
locale: ru
rules: -hyphen
---
Достал из-под стола
```

## Related

- [Dashes](/docs/rules/dashes/), which runs just before and leaves intra-word hyphens alone
- [Nbsp](/docs/rules/nbsp/), the other rule that keeps short words and units from wrapping
- [Invisible characters](/docs/concepts/invisible-characters/)
- [Idempotency](/docs/concepts/idempotency/)
- [Options](/docs/api/options/)

Normative text: [spec/rules/hyphen.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/hyphen.md).
