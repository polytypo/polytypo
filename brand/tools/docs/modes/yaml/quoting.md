---
title: Quoting and scalar forms
description: Which YAML value forms yaml mode typesets, which it leaves untouched, and why a colon or hash inside a plain scalar is treated as a boundary.
section: modes
order: 52
---

Once `yaml` mode has found a listed key, the form of its value decides what happens. The rule behind every entry below is that a construct the scan does not recognise with certainty yields no spans: it is left untypeset and never changed.

## Plain scalars

A plain scalar runs to the end of the line, minus a trailing comment (a `#` preceded by a space) and trailing spaces. It is typeset, with these exceptions where it yields nothing:

- the value continues on more-indented lines (a multi-line plain scalar, whose folding is not claimed);
- it begins with `- ` (compact nesting opens a sequence) or contains `: `, which would make it a mapping.

```example
locale: en-US
mode: yaml
keys: note
---
note: a "plain" value -- with a comment # keep "this"
```

### Colon and hash are boundaries

Inside a plain scalar, `:` and `#` are opaque one-character units, and the scalar's range is split at each of them. The reason is a structural one. A rule can insert a space, and a space is the only thing that makes `:` a mapping indicator (when it follows) or `#` a comment (when it precedes). Left unsplit, `k: a:--b` in German would become `k: a: – b`, which no longer parses, and `k: a--#b` would turn the end of the value into a comment.

With the split, the dash sits at the edge of a span, and a replacement there that is longer than what it replaced is discarded. The compact forms that shrink are still applied: `k: a:--b` in `en-US` becomes `k: a:—b` and reparses as the same scalar.

```example
locale: en-US
mode: yaml
keys: k
---
k: a:--b
```

```example
locale: de-DE
mode: yaml
keys: k
---
k: a:--b
```

German leaves the line as it was, because the spaced dash it would insert is longer than what it replaces. The accepted cost: a conversion that would grow against a colon or hash is missed. French inserts no narrow no-break space before a colon inside a **plain** scalar.

## Quoted scalars

The content between the quotes is typeset. The scalar must open and close on one line, and only spaces and an optional comment may follow the closing quote. No colon test applies: quoting neutralises the colon, so `title: "Chapter 1: the beginning"` is processed.

Two bails keep source characters and content characters the same thing:

- a **double-quoted** scalar whose content contains a backslash yields nothing, because `\n`, `\"` and `é` are spelled with more characters than they stand for;
- a **single-quoted** scalar whose content contains two consecutive apostrophes yields nothing, for the same reason.

```example
locale: en-US
mode: yaml
keys: a, b, c
---
a: "She said -- \"no\""
b: 'It''s a "test" -- really'
c: "plain 'quotes' -- fine"
```

Only `c` changes. The cost is real: an apostrophe inside a single-quoted scalar is written `''`, so single-quoted prose that contains one is skipped. Switching such a value to double quotes makes it eligible.

## Block scalars

`|` and `>`, with an optional chomping indicator (`-` or `+`) and indentation indicator (`1`–`9`), are recognised. **Each non-blank content line is one span**; the indentation, the header and every line terminator are outside every span, so the chomping behaviour is never touched and no output can add or remove a trailing newline.

```example
locale: en-US
mode: yaml
keys: description
---
description: |-
  First line "quoted" -- done...
  Second line

  after a blank
other: |
  keep "this" -- as is
```

A block with a tab, or a later line indented less than the first, yields nothing, because either choice would guess which line the author meant to be content.

## Never processed

Flow collections (`{…}` and `[…]`), anchors (`&`), aliases (`*`), tags (`!`), empty values, comments, and multi-line quoted scalars.

## Related

- [YAML mode](/docs/modes/yaml/)
- [Keys](/docs/modes/yaml/keys/)
- [Frontmatter](/docs/modes/markdown/frontmatter/)

Normative text: [spec/rules/modes.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/modes.md) (§3.8.3–§3.8.6).
