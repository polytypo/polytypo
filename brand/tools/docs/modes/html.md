---
title: HTML mode
seo_title: HTML mode: fix typography in HTML without touching tags or code | polytypo
description: Typeset the prose in an HTML document or fragment while tags, attributes, code, scripts and character references come back byte for byte.
section: modes
order: 30
---

`html` mode parses the input as HTML and runs the rules over the text nodes only. Tags, attributes, comments, character references and the contents of code-like elements are skipped and returned exactly as written. It takes a fragment as readily as a whole document.

Prose is read **across inline elements**. A quotation that opens before an `<em>` and closes after it is still one quotation, and a dash between `</strong>` and the next word is set as a dash.

## Examples

```example
locale: en-US
mode: html
---
<p class="lead" title="Don't touch">He said "hello" - <em>really</em>...</p>
```

The text changes; the attribute value, with its straight apostrophe, is not text and does not.

Quotation marks pair across inline markup:

```example
locale: en-US
mode: html
---
<p>"He said <em>'hi'</em> loudly"</p>
```

The outer pair becomes primary quotes and the inner one a nested, secondary pair. Processing each text node on its own would get the nesting wrong, which is why the document is read as one text. See [Span model](/docs/concepts/span-model/).

Code is left alone, even when it holds markup inside:

```example
locale: en-US
mode: html
---
<p>Run "make" or <code>echo "a" -- "b"</code>.</p>
<pre><em>"x" - y</em></pre>
```

## What is skipped

The list is exhaustive and closed:

- the **entire subtree** of `code`, `pre`, `kbd`, `samp`, `var`, `script`, `style`, `textarea`, `svg` and `math`, whatever is nested inside;
- **every attribute**, name and value, on every element;
- every well-formed **character reference** (`&amp;`, `&#160;`, `&#x2014;`), as an opaque unit. `&nbsp;` stays `&nbsp;` rather than becoming a literal U+00A0;
- comments, CDATA sections, the doctype and processing instructions.

Element names compare case-insensitively, as in HTML, so `<CODE>` is skipped as `<code>` is.

Everything else is prose, **including unknown and custom elements**. `<my-callout>` is far more likely to wrap text than to hold code, and guessing from a name is the sort of heuristic that behaves differently across five runtimes. Extending the skip list is a specification change, not an implementation choice.

A bare `&` that does not begin a well-formed reference stays inside the prose: `Tom & Jerry's "book"` has its quotation marks paired normally.

## Accepted costs

`svg` and `math` are skipped whole. In MathML a quotation mark, hyphen or prime is an operator or identifier, where a curly glyph or an en dash would change what an expression means. The price is that `<svg><text>` and `<svg><title>`, which do hold prose, are left untouched.

## Related

- [Skip list for Markdown](/docs/modes/markdown/skip-list/): inline HTML inside Markdown uses this list
- [Round-trip guarantee](/docs/concepts/round-trip/)
- [Span model](/docs/concepts/span-model/)

Normative text: [spec/rules/modes.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/modes.md) (§3.6).
