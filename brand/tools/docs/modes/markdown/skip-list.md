---
title: Markdown skip list
description: Exactly which parts of a Markdown document markdown mode leaves untouched, and which parts it typesets.
section: modes
order: 42
---

The Markdown skip list is closed: every construct below is skipped whole, including anything inside it that looks like prose, and everything else is processed. Extending the list is a specification change.

## Skipped

- **Frontmatter**: a block at the very start of the document delimited by `---` (YAML) or `+++` (TOML), including its delimiters. [Frontmatter](/docs/modes/markdown/frontmatter/) explains how to open named YAML keys.
- **Fenced code blocks**, including the info string and the fences.
- **Indented code blocks**, in `commonmark` only. MDX has none.
- **Inline code spans**, including the backticks.
- **Autolinks** `<https://…>`, in `commonmark` only.
- **Link and image destinations and titles**: the `(…)` of `[text](url "title")` and the definition line of a reference link. The link text is processed.
- **GFM constructs**: table pipes, delimiter and alignment rows, task-list checkboxes, strikethrough delimiters and footnote definition labels. GFM autolink literals count too: a bare `https://…` is a link and is not typeset.
- **HTML blocks and inline raw HTML**, which follow the [HTML skip list](/docs/modes/html/). Inline HTML arrives as isolated tags with Markdown between them, so a skipped element such as `<code>` stays skipped until its matching end tag, and Markdown inside it is not processed.
- **MDX only**: JSX expression containers `{…}` in full, and every JSX attribute.

Skipping is whole: a skipped construct is skipped with everything inside it.

## Processed

Everything else is prose: paragraphs, headings, list items, table cell text, block quotes, link and image text, emphasis, and in MDX the **children** of JSX elements. `<Callout>Some text here</Callout>` is text the author wrote and wants typeset.

```example
locale: en-US
mode: markdown
dialect: commonmark
---
| Name | Note |
| --- | --- |
| "A" | it's -- fine |

- [x] "done" - really
- [ ] see <https://example.com/x--y>

<span title="a -- b">"inline" html</span> and <code>"x" -- "y"</code>
```

Cells and list items are typeset, the autolink and the `title` attribute are not, and `<code>` content stays as written.

## Element names in HTML and in JSX

HTML element names compare case-insensitively, JSX names case-sensitively. `<Code>` in MDX is a component and is **not** skipped; `<code>`, `<CODE>` and `<Code>` in raw HTML are all skipped. This follows the two languages, not a choice of this library.

## Why code is recognised by the dialect, not by how it looks

The skipped regions are the dialect's own structural ones. CommonMark calls an indented block code at four spaces; at two spaces it is an ordinary paragraph, so a JSON sample indented by two spaces comes back with curly quotes. MDX has no indented code at all, so there even four spaces is prose, and a brace inside it is a JSX expression: the same sample throws `POLYTYPO_MALFORMED_INPUT`. A fence or a code span is the only marker that means code in both dialects.

## Related

- [Frontmatter](/docs/modes/markdown/frontmatter/)
- [MDX](/docs/modes/markdown/mdx/)
- [HTML skip list](/docs/modes/html/)

Normative text: [spec/rules/modes.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/modes.md) (§3.7.3).
