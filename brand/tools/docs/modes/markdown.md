---
title: Markdown mode
description: Typeset the prose of a CommonMark or MDX document, leaving code, links, HTML and frontmatter exactly as written.
section: modes
order: 40
---

`markdown` mode parses a Markdown document and runs the rules over its prose: paragraphs, headings, list items, table cells and the text of links. Code, link destinations, raw HTML and the frontmatter block are skipped and come back byte for byte.

It has one required option, [`dialect`](/docs/modes/markdown/dialects/), because "Markdown" is not one language. It has one optional option, [`frontmatterKeys`](/docs/modes/markdown/frontmatter/), which opens named fields of the frontmatter block to the rules.

## Examples

```example
locale: en-US
mode: markdown
dialect: commonmark
---
# The "new" plan -- v2

He said "wait..." and left. Read [the "docs"](https://example.com/a--b "A -- title").

Use `echo "x"` here.
```

The heading and the paragraph are typeset. The link text is prose and is typeset; the link destination and its title are not. The code span is skipped whole.

A fenced block is skipped including its info string and fences:

````example
locale: en-US
mode: markdown
dialect: commonmark
---
Say "hello" first:

```js
console.log("hi" -- "there");
```

Then "goodbye".
````

## Quotation marks and nesting across markup

The prose of a document is read as one text, not paragraph by paragraph and not node by node. Emphasis, links and inline code in the middle of a sentence do not break a quotation in two, and a straight quote next to a code span is not mistaken for one that touches it. See [Span model](/docs/concepts/span-model/).

```example
locale: en-US
mode: markdown
dialect: commonmark
---
"He said *'hi'* loudly," she wrote.
```

## What the mode needs from you

- **A dialect.** `dialect` has no default and is never detected. Omitting it throws `POLYTYPO_INVALID_DIALECT`. See [Dialects](/docs/modes/markdown/dialects/).
- **Nothing else.** GFM (tables, strikethrough, task lists, autolink literals) is on in both dialects.

## Pages in this section

- [Dialects](/docs/modes/markdown/dialects/): `commonmark` and `mdx`, and why the library never guesses
- [Frontmatter](/docs/modes/markdown/frontmatter/): the skipped block, `frontmatterKeys`, and how the block is located
- [Skip list](/docs/modes/markdown/skip-list/): everything the mode leaves alone
- [MDX](/docs/modes/markdown/mdx/): JSX, expressions and parse errors

## Related

- [HTML mode](/docs/modes/html/): the skip list inline HTML follows
- [MDX content guide](/docs/guides/mdx-content/)
- [Error codes](/docs/api/errors/)

Normative text: [spec/rules/modes.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/modes.md) (§3.7).
