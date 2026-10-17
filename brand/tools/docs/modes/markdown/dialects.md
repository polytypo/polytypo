---
title: Markdown dialects
seo_title: Markdown dialects: commonmark vs mdx in polytypo
description: Why markdown mode requires an explicit dialect, what commonmark and mdx each mean, and what happens when the document does not parse.
section: modes
order: 41
---

`markdown` mode takes a required `dialect`:

| Value | Language |
| --- | --- |
| `"commonmark"` | CommonMark 0.31 plus GFM: tables, strikethrough, task lists, autolink literals |
| `"mdx"` | MDX 3: CommonMark plus GFM, without indented code blocks and `<…>` autolinks, with JSX elements and `{…}` expressions |

The option has **no default**. Omitting it, or passing any other value, throws `POLYTYPO_INVALID_DIALECT`. `dialect` is ignored in `text`, `html` and `yaml` modes.

```example
locale: en-US
mode: markdown
expect: error
---
Some "text".
```

## Why it is never detected

CommonMark and MDX disagree on ordinary documents: MDX has no indented code blocks and no `<https://…>` autolinks, and CommonMark has no `{…}` expressions and no JSX. A document is often valid in both and means different things in each.

Detection looks easy and is wrong exactly when it matters. One `<https://example.com>` autolink makes a file invalid MDX, so a "try MDX first" heuristic falls back to CommonMark, and `export const meta = {slug: "une-note"}` stops being an ESM statement and becomes a paragraph. In French that paragraph gets a no-break space before its colon: a silent change inside a machine-read field, produced by a dialect the caller never chose.

The caller always knows the dialect, because it is the file extension. The library never can. Requiring the option moves a question nothing can answer to the one party that holds the answer, which is the same reason `locale` is required.

## The same text, two dialects

An autolink is valid CommonMark and a parse error in MDX:

```example
locale: en-US
mode: markdown
dialect: commonmark
---
See <https://example.com/a--b> for "details".
```

```example
locale: en-US
mode: markdown
dialect: mdx
expect: error
---
See <https://example.com/a--b> for "details".
```

Indented code differs too. Four spaces open a code block in CommonMark, so the line below is skipped:

```example
locale: en-US
mode: markdown
dialect: commonmark
---
A paragraph.

    echo "x" -- "y"
```

MDX has no indented code blocks, so the same text is prose and is typeset:

```example
locale: en-US
mode: markdown
dialect: mdx
---
A paragraph.

    echo "x" -- "y"
```

A fence or a code span is the one marker that means code in both dialects.

## A document that does not parse

`transform` throws `POLYTYPO_MALFORMED_INPUT`. Only `mdx` can reject a document, because MDX embeds JavaScript: a malformed JSX tag, an unclosed or malformed `{…}` expression or a broken `export`. HTML parsing recovers from every error, and every byte sequence is valid CommonMark.

Returning the input untouched instead would hide a build error behind a typography pass and hide the commonest cause, naming the wrong dialect. The parser's own error type never reaches the public surface; only the code is part of the contract.

## Runtime support

Every runtime implements the contract for the dialects it claims and declines the others with `POLYTYPO_INVALID_DIALECT`. Which runtime supports which dialect is on each [runtime page](/docs/runtimes/javascript/).

## Related

- [MDX](/docs/modes/markdown/mdx/)
- [Skip list](/docs/modes/markdown/skip-list/)
- [Error codes](/docs/api/errors/)

Normative text: [spec/rules/modes.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/modes.md) (§3.7.1, §3.7.2).
