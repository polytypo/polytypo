---
title: Text mode
seo_title: Text mode: fix typography in a plain string | polytypo
description: The default mode. The whole string is prose, there is no parser and no skip list, so everything in it is typeset.
section: modes
order: 20
---

`text` is the default mode. It hands the entire input to the rules as one piece of prose. There is no parser and no list of things to skip: every character is a candidate.

That makes it the right choice for strings that are prose from end to end (a headline, a product description, a form label) and the wrong choice for anything with markup, code or machine-read fields in it.

## Examples

```example
locale: en-US
---
"He said 'wait'..." - and then he left (c) 2026.
```

```example
locale: fr
---
Il a dit : « Vraiment ? » ... Non !
```

The same call works on any locale; the rules apply that locale's conventions. Both examples above are one string in, one string out: nothing is parsed, so nothing is skipped.

## What text mode will typeset that you did not mean

Because nothing is skipped, `text` mode typesets code, markup and identifiers the same way as prose:

```example
locale: en-US
---
if (a != b) { return "x" -- "y"; }  // (c)
```

The straight quotes, the double hyphen, `(c)` and even the spacing around `!=` and the braces in that line are all changed, which is correct for prose and wrong for code. Markup is no safer: an attribute such as `title="it's -- a note"` is text to this mode and is rewritten. If the string can contain code or markup, use the mode that knows where the code is: [`html`](/docs/modes/html/) or [`markdown`](/docs/modes/markdown/).

## Text mode and fragments

`transform` sees only the string it is given. Rules read the characters on either side of what they change, and that reading stops at the ends of the string. If you split a document into text nodes and transform each one separately, every node boundary becomes an end of text. `Design` and ` - the rest` sent as two calls leave the hyphen alone, while `<strong>Design</strong> - the rest` sent to `html` mode as one fragment is set correctly, because `html` mode reads prose across inline elements.

## Related

- [HTML mode](/docs/modes/html/), [Markdown mode](/docs/modes/markdown/), [YAML mode](/docs/modes/yaml/)
- [Choosing a mode](/docs/getting-started/choosing-a-mode/)
- [Span model](/docs/concepts/span-model/)

Normative text: [spec/rules/modes.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/modes.md) (§3.1: `text` is the case of one span covering the whole input).
