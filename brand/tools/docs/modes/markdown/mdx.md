---
title: MDX
seo_title: MDX typography: JSX, expressions and ESM in polytypo markdown mode
description: How markdown mode handles MDX: JSX elements and attributes, expressions, ESM statements, and documents that fail to parse.
section: modes
order: 44
---

`dialect: "mdx"` reads the document as MDX 3: CommonMark plus GFM, without indented code blocks and `<…>` autolinks, with JSX elements and `{…}` expressions. MDX is the author's own content format, so the mode typesets what an author wrote as prose and leaves what the JavaScript runtime reads alone.

## Processed and skipped

| Construct | In MDX mode |
| --- | --- |
| Prose, headings, lists | typeset |
| Children of a JSX element | **typeset** |
| JSX attributes, names and values | skipped |
| `{…}` expression containers | skipped whole |
| `import` and `export` statements | skipped |
| Fenced code, inline code | skipped |
| Frontmatter | skipped, unless [`frontmatterKeys`](/docs/modes/markdown/frontmatter/) names keys |

```example
locale: en-US
mode: markdown
dialect: mdx
---
import { Callout } from "./callout"

export const meta = { title: "A -- B" }

<Callout kind="it's" label={"x" + "y"}>He said "stop" -- twice</Callout>

Total: {count + "a"} items -- "done".
```

The attribute, the expression, the `import` and the `export` come back as written; the text inside `<Callout>` and the paragraph are typeset.

## Names compare case-sensitively

HTML names compare case-insensitively and JSX names case-sensitively. `<Code>` is a component and is not skipped, so its children are typeset. `<code>` is the HTML element and is skipped whole.

## Documents that do not parse

MDX embeds JavaScript, so a malformed JSX tag, an unclosed or broken `{…}` expression or a malformed `export` is a parse error. `transform` then throws `POLYTYPO_MALFORMED_INPUT`. It is the only way input alone can make `transform` throw, and a document that fails here is one the author's own build refuses.

```example
locale: en-US
mode: markdown
dialect: mdx
expect: error
---
Broken: {"x" -- "y"
```

## Not the same as CommonMark

The same file is frequently valid in both dialects and means different things. See [Dialects](/docs/modes/markdown/dialects/) for the differences, and for why a dialect is never detected.

## Runtime support

Not every runtime implements MDX. A runtime that does not declines `dialect: "mdx"` with `POLYTYPO_INVALID_DIALECT` rather than mishandle it. See the [runtime pages](/docs/runtimes/javascript/).

## Related

- [Dialects](/docs/modes/markdown/dialects/)
- [Markdown skip list](/docs/modes/markdown/skip-list/)
- [MDX content guide](/docs/guides/mdx-content/)

Normative text: [spec/rules/modes.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/modes.md) (§3.7).
