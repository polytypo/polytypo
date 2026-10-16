---
title: JavaScript and TypeScript
description: Install polytypo from npm, call transform and analyze in JavaScript or TypeScript, read error codes, and see which modes and dialects the package covers.
section: runtimes
order: 10
---

The JavaScript/TypeScript package is published on npm as [`polytypo`](https://www.npmjs.com/package/polytypo); the source is in [polytypo/polytypo-js](https://github.com/polytypo/polytypo-js). It claims spec 1.8.0 and covers every mode, both Markdown dialects, all nine rules and all nineteen locales. It ships ESM and CommonJS builds with type declarations, and requires Node 20 or later.

## Install

```bash
npm install polytypo
```

## Calling it

`transform(input, options)` returns the typeset string. `options` is a plain object with camelCase keys. Only `locale` is always required.

```ts
import { transform } from "polytypo";

transform(input, { locale: "de-DE" });

// mode "markdown" requires an explicit dialect; "text" and "html" ignore it
transform(input, { locale: "fr", mode: "markdown", dialect: "commonmark" });

// mode "yaml" requires the keys whose values hold prose
transform(input, { locale: "en-US", mode: "yaml", keys: ["description"] });

// switch one rule off; the order of the rest never changes
transform(input, { locale: "en-US", rules: { dashes: false } });
```

| Option | Type | Notes |
| --- | --- | --- |
| `locale` | `string` | Required. No default, no fallback to English. |
| `mode` | `"text" \| "html" \| "markdown" \| "yaml"` | Defaults to `"text"`. |
| `dialect` | `"commonmark" \| "mdx"` | Required for `markdown`; ignored in `text` and `html`. |
| `keys` | `readonly string[]` | Required for `yaml`. |
| `frontmatterKeys` | `readonly string[]` | Optional, `markdown` only. |
| `rules` | `Partial<Record<RuleId, boolean>>` | Per-rule override. `ranges` is off unless set to `true`. |
| `narrowNbsp` | `"narrow" \| "nbsp"` | Defaults to `"narrow"`. |

The full option contract is on [Options](/docs/api/options/).

### Entry points

The package root loads every parser. Each mode also has its own entry that defaults `mode` to itself and loads only what that mode needs:

| Entry | Parsers it loads |
| --- | --- |
| `polytypo/text` | none |
| `polytypo/html` | parse5 |
| `polytypo/markdown` | parse5, micromark with its GFM, frontmatter and MDX extensions |
| `polytypo/yaml` | none |
| `polytypo` | all of the above |

```ts
import { transform } from "polytypo/markdown";

transform(source, { locale: "en-US", dialect: "mdx", frontmatterKeys: ["title"] });
```

### Reporting without changing

`analyze(input, options)` takes the same options and returns the edits `transform` would make, as `{ ruleId, start, end, before, after }` records with code-point offsets into the input. See [analyze](/docs/api/analyze/).

## Errors

Every failure is a `PolytypoError` (exported from the package root) with a stable `code`. Branch on `error.code`, never on the message.

```ts
import { transform, PolytypoError } from "polytypo";

try {
  transform(input, { locale: "xx" });
} catch (error) {
  if (error instanceof PolytypoError) {
    error.code; // "POLYTYPO_UNKNOWN_LOCALE"
  }
}
```

The eight codes are listed on [Error codes](/docs/api/errors/). `POLYTYPO_MALFORMED_INPUT` is reachable only with `mode: "markdown"` and `dialect: "mdx"`.

## Complete example

Save as `example.mjs` after `npm install polytypo`, then run `node example.mjs`.

```js
import { transform, analyze, PolytypoError } from "polytypo";

const input = 'She said, "it\'s fine" -- but I wasn\'t sure...';

console.log(transform(input, { locale: "en-US" }));
// She said, “it’s fine”—but I wasn’t sure…

console.log(transform(input, { locale: "de-DE" }));
// She said, „it’s fine“ – but I wasn’t sure…

console.log(transform(input, { locale: "en-US", rules: { dashes: false } }));
// She said, “it’s fine” -- but I wasn’t sure…

console.log(analyze('Wait... "really"?', { locale: "en-US" }));
// [ { ruleId: 'ellipsis', start: 4, end: 7, before: '...', after: '…' },
//   { ruleId: 'quotes', start: 8, end: 9, before: '"', after: '“' },
//   { ruleId: 'quotes', start: 15, end: 16, before: '"', after: '”' } ]

try {
  transform(input, { locale: "xx" });
} catch (error) {
  if (!(error instanceof PolytypoError)) throw error;
  console.log(error.code); // POLYTYPO_UNKNOWN_LOCALE
}
```

The same call, measured:

```example
locale: de-DE
---
She said, "it's fine" -- but I wasn't sure...
```

## Conformance

The package passes the conformance suite for spec 1.8.0. Modes: `text`, `html`, `markdown` (dialects `commonmark` and `mdx`) and `yaml`. Rules: all nine. The matrix for every runtime is [spec/CONFORMANCE.md](https://github.com/polytypo/polytypo/blob/main/spec/CONFORMANCE.md).

## Related

- [Python](/docs/runtimes/python/), [Go](/docs/runtimes/go/), [Ruby](/docs/runtimes/ruby/), [PHP](/docs/runtimes/php/)
- [Installation](/docs/getting-started/installation/)
- [Options](/docs/api/options/)
- [Running polytypo in a build step](/docs/guides/build-step/)

Conformance matrix: [spec/CONFORMANCE.md](https://github.com/polytypo/polytypo/blob/main/spec/CONFORMANCE.md).
