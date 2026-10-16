---
title: Round trip
description: In html, markdown and yaml modes the output is your input with a few substring replacements applied, and nothing is re-serialised.
section: concepts
order: 20
---

In `html`, `markdown` and `yaml` mode, `transform` returns the input source with a set of disjoint substring replacements applied at recorded offsets. No other byte of the input changes.

This is stronger than "unchanged when nothing needs fixing". The parser, where there is one, is used only to find where the prose is. It is then discarded. The document is never rebuilt from a parse tree, so nothing a serialiser would normalise can change.

## How it works

The [span model](/docs/concepts/span-model/) records, for every processable span, where it starts and ends in the original source. The rules produce edits against the joined text; each edit is mapped back to those offsets. The result is the original source with only those stretches replaced.

`yaml` mode uses no parser at all. It scans the text to find the values of the keys you name, so there is nothing to decode and re-emit.

## Examples

An HTML document. Only the prose changes. The upper-case tags, the unquoted and single-quoted attributes, the `&nbsp;` and `&amp;` references, the self-closing `<BR/>`, the doctype, the comment, the `pre` block and the script are returned as they were written:

```example
locale: en-US
mode: html
---
<!DOCTYPE html>
<P CLASS=lead id='a'>"Hello" -- it's <BR/>fine&nbsp;now &amp; then...</P>
<!-- keep "this" -- as is -->
<pre>"raw" -- text</pre>
<script>var s = "x -- y";</script>
<p>She said "no"...</p>
```

A Markdown document. The list markers, emphasis delimiters, link destination and title, inline code and indented code block are untouched. The trailing newline is kept:

````example
locale: en-US
mode: markdown
dialect: commonmark
---
# "Title" -- here

* "one" -- it's
* two...

Para with `"code" -- x` and a [link](http://x.com/a--b "t") and *"em"* text.

    "indented" -- code
````

## What is preserved

- Attribute quoting (`class=foo`, `class='foo'` and `class="foo"` all stay as written), attribute order, duplicate attributes and whitespace inside tags.
- Tag name case, and self-closing and void forms (`<br>`, `<br/>`, `<br />`).
- Character references: `&amp;` does not become `&#38;`, and `&nbsp;` does not become U+00A0. A bare `&` stays a bare `&`.
- The doctype, comments and trailing whitespace.
- Markdown list markers, emphasis delimiters, heading style, table alignment, hard-break spaces and line endings.
- YAML quoting style, indentation, anchors, tags and block scalar chomping indicators.
- Malformed input. Unclosed tags, stray `<` and mismatched nesting are not repaired. Parser error recovery only affects where prose is found, never what is written out.

## Edge cases

- **MDX can fail to parse.** Markdown with `dialect: "mdx"` embeds JavaScript, and a broken JSX element or expression raises `POLYTYPO_MALFORMED_INPUT` instead of producing output. See [Error codes](/docs/api/errors/).
- **Edits that would change structure are dropped.** An edit that would add a space at the very start or end of a span is discarded, so a markup boundary is never made to touch new whitespace. See [the span model](/docs/concepts/span-model/#edge-cases).

## Related

- [The span model](/docs/concepts/span-model/)
- [Idempotency](/docs/concepts/idempotency/)
- [Modes overview](/docs/modes/overview/)
- [HTML mode](/docs/modes/html/)
- [Markdown mode](/docs/modes/markdown/)
- [YAML mode](/docs/modes/yaml/)

Normative text: [spec/rules/modes.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/modes.md).
