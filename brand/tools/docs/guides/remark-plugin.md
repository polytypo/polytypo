---
title: Typesetting Markdown in a remark pipeline
seo_title: Fix typography in a remark or unified pipeline with remark-polytypo | polytypo
description: Add remark-polytypo to a unified, MDX or Next.js pipeline to typeset Markdown prose at build time, with the options, the plugin order and the warnings it reports.
section: guides
order: 25
---

`remark-polytypo` is a [remark](https://github.com/remarkjs/remark) plugin for the JavaScript package. It is published on npm as [`remark-polytypo`](https://www.npmjs.com/package/remark-polytypo); the source is in [polytypo/remark-polytypo](https://github.com/polytypo/remark-polytypo). It applies `markdown` mode to the document a unified pipeline is processing and carries the result into the tree, so the pipeline you already have typesets its prose without a separate script.

The goal of this guide: a working pipeline, the one ordering rule that matters, and what the plugin tells you when it leaves something alone.

## Steps

1. Install the plugin next to `unified`: `npm install remark-polytypo`. It is ESM only and needs Node.js 20 or newer and `unified` 11.
2. Add it to the processor with a `locale` and a `dialect`, **before** any other plugin that rewrites text.
3. Read `file.messages` after processing to see what was left unchanged.

```js
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkPolytypo from "remark-polytypo";

const file = await unified()
  .use(remarkParse)
  .use(remarkPolytypo, { locale: "de-DE", dialect: "commonmark" })
  .use(remarkStringify)
  .process('Er sagte "Hallo" - und ging... `"code"`');

String(file);
// Er sagte „Hallo“ – und ging… `"code"`
```

Code, link destinations, HTML, MDX expressions, JSX attributes and `import` and `export` statements are not touched, exactly as in [`markdown` mode](/docs/modes/markdown/).

## MDX and Next.js

For `.mdx` files pass `dialect: "mdx"`. With `@mdx-js/mdx`:

```js
import { compile } from "@mdx-js/mdx";
import remarkPolytypo from "remark-polytypo";

await compile(source, {
  remarkPlugins: [[remarkPolytypo, { locale: "en-GB", dialect: "mdx" }]],
});
```

With `@next/mdx` and Turbopack, plugins are named as strings with serializable options:

```js
// next.config.mjs
import createMDX from "@next/mdx";

const withMDX = createMDX({
  options: {
    remarkPlugins: [["remark-polytypo", { locale: "en-GB", dialect: "mdx" }]],
  },
});

export default withMDX({ pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"] });
```

## Options

`locale` and `dialect` are required. There is no default for either and nothing is detected, for the reasons given on [Dialects](/docs/modes/markdown/dialects/).

| Option            | Value                       | Meaning                                                                          |
| ----------------- | --------------------------- | -------------------------------------------------------------------------------- |
| `locale`          | a locale id such as `en-GB` | Which locale's conventions to apply. An unknown locale throws.                   |
| `dialect`         | `"commonmark"` or `"mdx"`   | `mdx` for `.mdx` files, `commonmark` for `.md`.                                  |
| `rules`           | an object of booleans       | Turns single rules on or off. See the [options reference](/docs/api/options/).   |
| `narrowNbsp`      | `"narrow"` or `"nbsp"`      | The same option as in `transform`.                                               |
| `frontmatterKeys` | an array of keys            | YAML frontmatter keys whose values are prose. Needs `remark-frontmatter`.        |

The values are polytypo's own and polytypo validates them: a `PolytypoError` with its code reaches you unchanged. `mode`, `keys` and `protect` do not exist in the plugin, and the values are static, with no function form.

## Put it first

The plugin reads the file's source text, runs `markdown` mode over it, parses the source and the result with the processor's own parser, and copies the differences into the tree. A change is matched to a node by its source position, and the node is only changed if its value is still the one the parser produced.

So a plugin that rewrites text before this one, smart quotes for example, defeats the match: that text is no longer where the plugin expects it, and the plugin leaves it alone and says so.

## What it tells you

Whatever the plugin cannot apply safely is left as it was, and a message is added to `file.messages` with the source `remark-polytypo`.

| `ruleId`                 | Meaning                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `dropped-change`         | A change landed outside prose (raw HTML, math, an MDX expression). That one change is dropped and the text around it is carried.    |
| `left-unchanged`         | A change would move the boundary of the surrounding text, for example where a link address ends. The whole unit is left unchanged.   |
| `unmatched-edit`         | A node no longer matches the source, because an earlier plugin changed it or the parser gave it no position. The unit is left alone. |
| `frontmatter-not-parsed` | `frontmatterKeys` is set but the tree has no `yaml` node. Add `remark-frontmatter` before this plugin.                               |

A unit is one paragraph, heading or table cell, except that a blockquote, a list or a footnote definition is one unit together with everything inside it, because quotation marks pair across the paragraphs of a quote. If any part of a unit is left unchanged, the whole unit is.

Four cases stop the build with an error: a file with no source text, a document whose tree changes shape above the level of a paragraph, typeset text that the processor's parser cannot read (usually `dialect` does not match the document), and a `PolytypoError` from polytypo such as `POLYTYPO_UNKNOWN_LOCALE`.

For a whole directory without a remark pipeline, see [Running polytypo in a build step](/docs/guides/build-step/). The plugin's own README is at [github.com/polytypo/remark-polytypo](https://github.com/polytypo/remark-polytypo).
