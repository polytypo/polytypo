---
title: Typesetting an MDX blog
seo_title: Fix typography in an MDX blog, including frontmatter | polytypo
description: Process MDX posts with markdown mode and the mdx dialect, typeset frontmatter title and description, and know what is skipped, what is prose and what throws.
section: guides
order: 20
---

An MDX blog mixes prose, JSX components, JavaScript expressions, code and YAML frontmatter in one file. polytypo can typeset the prose and leave everything else byte-for-byte alone, if you call it in `markdown` mode with the `mdx` dialect and say which frontmatter keys hold prose.

The goal of this guide: a call you can run over every post, a clear picture of what it changes, and the handful of ways it fails.

## Steps

1. Call `transform` with `mode: "markdown"`, `dialect: "mdx"` and the post's locale.
2. Name the frontmatter keys that hold prose in `frontmatterKeys`.
3. Handle `POLYTYPO_MALFORMED_INPUT` for files that are not valid MDX.

```js
import { readFile, writeFile } from "node:fs/promises";
import { transform } from "polytypo";

const path = "content/posts/hello-world.mdx";
const source = await readFile(path, "utf8");

const output = transform(source, {
  locale: "en-US",
  mode: "markdown",
  dialect: "mdx",
  frontmatterKeys: ["title", "description"],
});

await writeFile(path, output);
```

For a whole directory, see [Running polytypo in a build step](/docs/guides/build-step/).

## Why the dialect is explicit

CommonMark and MDX disagree on ordinary documents. MDX has no indented code blocks and no `<https://…>` autolinks; CommonMark has no `{…}` expressions and no JSX. A document is often valid in both and means different things in each.

The library does not detect the dialect, because any detector is silently wrong in a case that matters. Your file extension is the answer, and you pass it: `.mdx` is `mdx`, `.md` is `commonmark`. Omitting `dialect` in `markdown` mode throws `POLYTYPO_INVALID_DIALECT`. The details are on [Dialects](/docs/modes/markdown/dialects/).

## What is typeset and what is left alone

In the `mdx` dialect, these are **processed**: paragraphs, headings, list items, link text, table cell text, and the children of JSX elements (`<Callout>Some text</Callout>` is prose you wrote).

These are **skipped**, byte for byte: fenced code and its info string, inline code, link and image destinations and titles, GFM table pipes and alignment rows, HTML blocks and raw inline HTML (under the HTML skip list), `{…}` expression containers, every JSX attribute, `import` and `export` statements, and frontmatter unless you name keys.

```example
locale: en-US
mode: markdown
dialect: mdx
---
<Callout type="note" title="a -- b">It's "fine" -- really...</Callout>

{props.label + " -- x"}

Use `a -- b` here -- ok.
```

Notice that the attribute `title="a -- b"`, the expression `{props.label + " -- x"}` and the code span are unchanged, while the text inside `<Callout>` and the paragraph are typeset.

`export` statements are not prose either. In French, where `:` takes a space before it, the object below stays as written while the sentence below it is converted:

```example
locale: fr
mode: markdown
dialect: mdx
---
export const meta = {slug: "une-note"}

Une note: "salut" -- ok!
```

## Frontmatter

By default the frontmatter block is skipped whole, delimiters included. That is deliberate: it is machine-read, and typesetting it would put quotation marks around a date or a space before a colon in a key. The cost is that the title, the most visible string on the page, stays as authored.

`frontmatterKeys` names the YAML keys whose values are prose. Keys not listed are never touched. Matching is exact and case-sensitive, and a key named `title` is matched at any depth, including inside a nested `seo:` mapping.

```example
locale: en-US
mode: markdown
dialect: mdx
frontmatterKeys: title, description
---
---
title: He said "hello" -- twice
description: It's "fine" -- really...
slug: "hello-twice"
date: 2026-10-01
---

Body text -- "quoted"...
```

Notice that `slug` and `date` are unchanged. Without the option the same call changes only the body:

```example
locale: en-US
mode: markdown
dialect: mdx
---
---
title: He said "hello" -- twice
---

Body text -- "quoted"...
```

The frontmatter block is its own text unit. An unbalanced quotation mark in `title` cannot pair with one in the first paragraph, and `frontmatterKeys` cannot change a byte outside the block.

### Single-quoted values

The block is read with the same scan as [YAML mode](/docs/modes/yaml/), which declines a single-quoted value that contains `''` (YAML's way of writing an apostrophe inside single quotes). That value comes back untouched:

```example
locale: en-US
mode: markdown
dialect: mdx
frontmatterKeys: title
---
---
title: 'It''s -- a "test"'
---

Body
```

A single-quoted value without `''` is processed normally. Double-quoted and plain values are the safest to list. A TOML (`+++`) block is skipped whole whether or not you pass keys.

## What throws

MDX embeds JavaScript, so it can fail to parse. An unterminated element or a broken expression throws `POLYTYPO_MALFORMED_INPUT`. So does an `<https://…>` autolink, which MDX does not allow:

```example
locale: en-US
mode: markdown
dialect: mdx
expect: error
---
See <https://example.com> now
```

The error is deliberate: returning the input unchanged would hide a file your own build would reject, or hide that you named the wrong dialect. Catch it by code (`error.code === "POLYTYPO_MALFORMED_INPUT"`), report the file and carry on, as the [build-step script](/docs/guides/build-step/) does.

## Pitfalls

- **Indented text is prose in MDX.** MDX has no indented code blocks, so four spaces of indentation do not protect anything. Use a fence. Under `commonmark` the same input is a code block and is left alone; under `mdx` it is typeset (the call below is the `mdx` result):

```example
locale: en-US
mode: markdown
dialect: mdx
---
Intro:

    indented -- "text"...
```

- **Wrong dialect, wrong result.** `commonmark` on an MDX file does not recognise `{…}` expressions, so `{props.x + " -- y"}` is treated as prose and its dash is converted. In `commonmark` the autolink `<https://example.com/a--b>` is skipped, while in MDX it does not parse at all.
- **The Python, Go, Ruby and PHP runtimes** do not implement `mdx`: they raise `POLYTYPO_INVALID_DIALECT`. See each [runtime page](/docs/runtimes/javascript/).
- **Locale is yours to supply.** A post in French run with `en-US` gets English quotes. Take the locale from the post's metadata or path.

## Related

- [Markdown mode](/docs/modes/markdown/)
- [MDX dialect](/docs/modes/markdown/mdx/)
- [Frontmatter](/docs/modes/markdown/frontmatter/)
- [Skip list](/docs/modes/markdown/skip-list/)
- [Error codes](/docs/api/errors/)

Normative text: [spec/rules/modes.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/modes.md).
