---
title: Modes
seo_title: polytypo modes: text, html, markdown and yaml compared
description: The four ways polytypo reads a document, what each one treats as prose, and how to choose between them.
section: modes
order: 10
---

A mode tells polytypo what the string you pass in actually is. The rules (quotes, dashes, spaces, no-break spaces and the rest) are the same in every mode; the mode decides **which characters the rules are allowed to see**. Everything a mode does not hand to the rules comes back byte for byte.

There are four modes, selected with the `mode` option:

| Mode | The input is | What the rules see | Needs |
| --- | --- | --- | --- |
| [`text`](/docs/modes/text/) | plain prose | the whole string | nothing |
| [`html`](/docs/modes/html/) | an HTML document or fragment | text nodes only, never tags, attributes or code | nothing |
| [`markdown`](/docs/modes/markdown/) | CommonMark or MDX | prose, never code, link destinations, HTML or (by default) frontmatter | `dialect` |
| [`yaml`](/docs/modes/yaml/) | a YAML file | the values of the keys you name | `keys` |

## Why there are modes at all

Typography rules read the characters around what they change. In plain prose that is safe. In a document it is not: a rule that turns `"` into a curly quote must not touch the quote that closes an HTML attribute, and a rule that puts a space before a colon in French must not touch `title:` in frontmatter.

`html` and `markdown` are prose formats with islands of code in them, so the modes skip a fixed, closed list of islands and treat everything else as prose. `yaml` is the opposite, a data format with islands of prose in it, so it processes only what you name. That difference is why `markdown` needs a `dialect` and `yaml` needs `keys`: in both cases the one fact the library cannot work out for itself is required.

## What every mode guarantees

- **Unprocessed text is returned unchanged.** The output is the input with a set of replacements applied at known positions; the source is located, never re-emitted. Markup is not re-serialised, attribute quoting and whitespace stay as written. See [Round-trip guarantee](/docs/concepts/round-trip/).
- **Prose is processed as one text.** A quotation that opens before an inline element and closes after it is still one quotation. See [Span model](/docs/concepts/span-model/).
- **The result is a fixed point.** Running a mode again on its own output changes nothing. See [Idempotency](/docs/concepts/idempotency/).

## Choosing a mode

- A string of prose, such as a headline, a CMS field or a notification: `text`.
- A string that contains tags, or can contain `&amp;` or `&#160;`: `html`, even when it is a fragment. A string that might contain a character reference is HTML.
- A `.md` or `.mdx` file: `markdown`, with the dialect the file is written in.
- A configuration or API description file with some prose fields: `yaml`, with the keys of those fields.

[Choosing a mode](/docs/getting-started/choosing-a-mode/) goes through the pitfalls of getting this wrong.

## Related

- [`transform`](/docs/api/transform/) and [options](/docs/api/options/)
- [Span model](/docs/concepts/span-model/)

Normative text: [spec/rules/modes.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/modes.md).
