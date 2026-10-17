---
title: Typesetting prose in YAML config
seo_title: Fix typography in YAML and OpenAPI descriptions | polytypo
description: Use yaml mode on OpenAPI-style and config YAML, naming the keys that hold prose, and see how quoted, plain and block scalars are handled and what is skipped.
section: guides
order: 30
---

Config files, OpenAPI documents and CI workflows contain sentences (`description`, `summary`, `title`) next to things a machine reads (`run`, `image`, `operationId`). Nothing in YAML's syntax tells them apart. `yaml` mode solves this by making you name the keys: only the values of those keys are typeset, and the rest of the file comes back byte for byte.

The goal of this guide: typeset the descriptions in an OpenAPI file without touching anything else.

## Steps

1. Call `transform` with `mode: "yaml"`, the locale, and `keys`: the list of mapping keys whose values are prose.
2. Write the result back. The file is located, not re-serialised, so comments, indentation, quoting and key order are exactly as they were.

```js
import { readFile, writeFile } from "node:fs/promises";
import { transform } from "polytypo";

const path = "openapi.yaml";
const source = await readFile(path, "utf8");

await writeFile(
  path,
  transform(source, {
    locale: "en-US",
    mode: "yaml",
    keys: ["summary", "description"],
  }),
);
```

`keys` has no default. Omitting it throws `POLYTYPO_INVALID_OPTION`; an empty list is legal and processes nothing.

## What it does to a document

```example
locale: en-US
mode: yaml
keys: description, summary
---
openapi: 3.0.0
info:
  title: Rates API
  description: "Returns rates -- all of them... \"quoted\""
paths:
  /rates:
    get:
      summary: List rates -- "all" of them
      description: |
        First line -- "one"...
        Second line.
      operationId: list--rates
      x-run: echo "a" -- b
```

Notice three things. `summary` and the block-scalar `description` are typeset. `operationId` and `x-run` are not listed, so they are untouched even though they contain `--`. And the top-level `description`, a double-quoted value containing a backslash escape, is left as written; see below.

## Key matching

A key matches when its text equals a listed key exactly, code point for code point. There is no case folding, no path syntax, no wildcards and no nesting: `description` is matched wherever it appears, at any depth. If a machine-read field shares a name with a prose field, you cannot take one without the other.

A quoted key (`"title": …`) never matches.

## Scalar forms

How the value is written decides whether it is processed.

| Form | Example | Result |
| --- | --- | --- |
| Plain, one line | `description: Rates -- all` | Processed |
| Double-quoted, one line | `description: "Rates -- all"` | Processed; content between the quotes |
| Single-quoted, one line | `description: 'Rates -- all'` | Processed |
| Block scalar (pipe or `>` header) | `description: >` | Processed, one line at a time |
| Multi-line plain or quoted | value continues on the next line | Skipped |
| Flow collection, anchor, alias, tag | `[a, b]`, `&x`, `*x`, `!tag` | Skipped |
| Double-quoted with a backslash | `"line\nbreak"` | Skipped |
| Single-quoted with `''` | `'It''s fine'` | Skipped |

A skipped value is not an error. `yaml` mode never throws on the input; a file that is not YAML at all comes back unchanged. The rule is that a construct the scan does not recognise with certainty is left alone.

```example
locale: en-US
mode: yaml
keys: description
---
description: Rates -- all # note -- here
description: key: value -- a
description: first -- line
  second -- line
description: [a -- b]
```

Notice what each line does. The comment after `#` is kept as written. The value containing `: ` is not a plain scalar, so it is skipped, as are the two-line value and the flow collection.

Quoting style changes what is covered. A single-quoted value that contains `''` is skipped:

```example
locale: en-US
mode: yaml
keys: description
---
a: 'x'
description: 'It''s "fine" -- really'
other: x
```

The value is untouched because the apostrophe is written `''`. If your files use single quotes with apostrophes, switch those values to double quotes (without backslashes) or plain style to have them processed.

### Block scalars

For `|` and `>` blocks (with any chomping or indentation indicator), each non-blank content line is processed on its own. The header, the indentation and the trailing line breaks are never touched, so a block's chomping behaviour cannot change.

## Colons and hashes inside plain scalars

Inside a plain scalar, a `:` and a `#` are never edited, and a replacement that would grow against one of them is dropped. This protects the document's structure: a `-spaced` dash replacement next to a colon could turn a plain value into a mapping or into a comment.

For example, in French the colon and the exclamation mark take a no-break space inside a quoted title; a plain value that contains `: ` is not a plain scalar at all and is skipped:

```example
locale: fr
mode: yaml
keys: title
---
title: Chapter 1: "the beginning"!
title: "Chapter 1: the beginning!"
title: 'Chapter 1: the beginning!'
```

The first line contains `: ` in its value, so it is not a valid plain scalar and is skipped whole. In the two quoted lines the colon is ordinary content and is spaced.

## Pitfalls

- **Do not list a machine-read key.** `run`, `image`, `if`, `pattern` and `name` often hold shell, templates or identifiers. Typesetting a workflow's `run` can break the script; that is why the keys are yours to name.
- **A miss is silent.** Values skipped by the table above are not reported. If a value you expected to change did not, check its form first.
- **Frontmatter in Markdown** uses the same scan through a different option: see [MDX content](/docs/guides/mdx-content/#frontmatter).
- **Run it anywhere in a pipeline:** the output of a run is unchanged by a second run, so it is safe in a pre-commit hook.

## Related

- [YAML mode](/docs/modes/yaml/)
- [YAML keys](/docs/modes/yaml/keys/)
- [YAML quoting](/docs/modes/yaml/quoting/)
- [Running polytypo in a build step](/docs/guides/build-step/)
- [Error codes](/docs/api/errors/)

Normative text: [spec/rules/modes.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/modes.md).
