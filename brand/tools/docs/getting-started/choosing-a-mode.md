---
title: Choosing a mode
description: Which mode to call for which input, and what goes wrong when a string is passed to the wrong one.
section: getting-started
order: 20
---

A mode says what your string is. The rules are the same in all of them; what differs is which characters the rules may touch. Passing the wrong mode does not raise an error. It produces typography in the wrong places, and that is why the choice is worth making deliberately.

| Your string is | Use |
| --- | --- |
| prose from end to end: a headline, a CMS field, a notification | [`text`](/docs/modes/text/) |
| HTML, a fragment of it, or anything that can contain `&amp;` | [`html`](/docs/modes/html/) |
| a Markdown or MDX file | [`markdown`](/docs/modes/markdown/) with the right `dialect` |
| a YAML file with some prose fields | [`yaml`](/docs/modes/yaml/) with the `keys` of those fields |

## Pass whole prose, not fragments

`transform` sees only the string it is given. Rules read the characters on either side of what they change, and that reading stops at the ends of the string. Walk a component tree and transform each text node alone, and every node boundary becomes an end of text.

```example
locale: en-US
---
 - the rest
```

Sent alone, a dash with no word before it has nothing to attach to. The same text inside one `html` fragment is read across the element:

```example
locale: en-US
mode: html
---
<strong>Design</strong> - the rest
```

## Do not send code to `text`

`text` cannot tell code or markup from prose, so it typesets whatever is in the string. In code that means `(c)`, `(r)`, `(tm)` and `x` between numbers, spaces just inside brackets, straight quotes anywhere, and hyphens between words. In markup it reaches into attributes:

```example
locale: en-US
---
<a href="/x" title="it's -- a note">link</a>
```

The `title` attribute is rewritten, which changes the document. `html` mode leaves every attribute alone, and so does `markdown` for the HTML inside it. Use the mode that knows where the code is, or keep code out of the call. A string that can contain tags, `&amp;` or `&#160;` is HTML, fragment or not.

## Markdown skips what the dialect calls code

In `markdown` mode the skipped regions are the dialect's own structural ones, not whatever looks like code to a reader. CommonMark calls an indented block code at four spaces; at two it is an ordinary paragraph, so a JSON sample indented by two spaces comes back with curly quotes: valid JSON in, invalid JSON out, and nothing in the return value says so. MDX has no indented code blocks at all, so there even four spaces is prose, and a brace inside it is a JSX expression: the same sample throws `POLYTYPO_MALFORMED_INPUT`. A fence or a code span is the one marker that means code in both dialects. See [Dialects](/docs/modes/markdown/dialects/).

## Name what YAML prose is

YAML is the inverse of HTML and Markdown: data with islands of prose. `yaml` mode processes only the values of the keys you list, because nothing in the syntax separates a `description` from a `run`. See [YAML keys](/docs/modes/yaml/keys/).

## Related

- [Modes](/docs/modes/overview/)
- [Span model](/docs/concepts/span-model/)
- [Build step guide](/docs/guides/build-step/)
