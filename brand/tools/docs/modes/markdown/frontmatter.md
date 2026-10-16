---
title: Frontmatter
description: How markdown mode treats a YAML or TOML frontmatter block, how to typeset named fields with frontmatterKeys, and how the block is located.
section: modes
order: 43
---

A frontmatter block is metadata at the very start of a Markdown document, delimited by `---` (YAML) or `+++` (TOML). By default `markdown` mode skips it whole, delimiters included. Without that, the closing `---` reads as a setext underline, `title: Une note` becomes a paragraph, and French puts a no-break space before the colon of a machine-read field.

The default has a cost: where frontmatter carries `title` and `description`, those strings are the heading, the `<title>`, the meta description and the card text, so the most visible sentence on the page is the one that is not typeset. The `frontmatterKeys` option opens those fields.

## `frontmatterKeys`

`frontmatterKeys` is optional and applies to `markdown` mode in both dialects. It lists the mapping keys of a **YAML** frontmatter block whose scalar values are prose. Those values are typeset and nothing else in the block is.

```example
locale: en-US
mode: markdown
dialect: commonmark
frontmatterKeys: title, description
---
---
title: He said "hello" once
description: A note -- short
slug: "a--b"
date: 2026-09-26
---

"Body" text.
```

`title` and `description` change; `slug`, `date`, the delimiters and the body's own treatment do not. Without the option the whole block comes back as written:

```example
locale: en-US
mode: markdown
dialect: commonmark
---
---
title: He said "hello" once
---

"Body" text.
```

An empty list is legal and processes nothing. A value that is not a list of strings throws `POLYTYPO_INVALID_OPTION`. In `text`, `html` and `yaml` modes the option is ignored and not validated, as `dialect` is.

### The block is its own text

The pipeline runs over the frontmatter block and over the body **separately**. The option cannot change a byte outside the block, and an unbalanced quotation mark in `title` cannot pair with a mark in your first paragraph. Every other behaviour of the body is as without the option.

### Key matching

Matching uses the same scan as [`yaml` mode](/docs/modes/yaml/keys/): a key matches when its source text equals a listed name exactly, code point for code point, with no case folding, no paths and no wildcards. `title` matches wherever it occurs in the block at any depth, so a nested `seo.title` is typeset too. A quoted key never matches.

### What the scan declines

The scan only claims what it can prove. A value it does not recognise with certainty is left untouched; the worst outcome is untypeset prose, never a changed byte. Notably:

- a double-quoted value containing a backslash, and a single-quoted value containing `''` (the way an apostrophe is written inside single quotes), because the source spells those characters with more characters than they have. A double-quoted `title: "It's"` is typeset; the single-quoted spelling of an apostrophe is not.
- multi-line quoted scalars, flow collections (`{…}`, `[…]`), anchors, aliases and tags;
- a line that contains a tab, or a lone carriage return used as a line ending.

See [YAML quoting](/docs/modes/yaml/quoting/) for the full list.

### TOML

A TOML block (`+++`) is skipped whole, with the option given or not. TOML's quoting is a second grammar with its own escapes and multi-line forms, so the block yields no spans.

## Where the block begins and ends

The extent of the block is decided by a scan, identical in every runtime, and not by whatever frontmatter support a Markdown parser happens to have:

1. The document must **begin** with the delimiter (`---` or `+++`): no leading blank line, no indentation. A single leading byte-order mark (U+FEFF) is stepped over first.
2. The rest of the opening line must be only spaces and tabs.
3. The **closing line** is the first later line that begins the same delimiter and continues with only spaces and tabs. `...` is not a closer, a delimiter of the other kind is not, and `----` closes nothing.
4. With no such closing line there is no block, and the opening delimiter is whatever the dialect makes of it: a thematic break for `---`, paragraph text for `+++`. Everything after it is prose.
5. A line ends at LF, at CR not followed by LF, or at the end of input, so CRLF documents give the same block as LF ones.

Trailing whitespace on a delimiter does not stop a block from being recognised, because editors that trim nothing produce it. The cost is stated: a document whose first line is a thematic break written as `--- `, followed by prose and another `---` line, has everything up to that line skipped.

## Related

- [YAML keys](/docs/modes/yaml/keys/): the matching rules
- [YAML quoting](/docs/modes/yaml/quoting/)
- [MDX content guide](/docs/guides/mdx-content/)
- [Markdown skip list](/docs/modes/markdown/skip-list/)

Normative text: [spec/rules/modes.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/modes.md) (§3.7.3, §3.7.3a, §3.7.4).
