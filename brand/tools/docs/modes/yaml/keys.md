---
title: YAML keys
description: How the keys option selects values in yaml mode: exact matching, any depth, no paths or globs, and which lines the scan reads as keys.
section: modes
order: 51
---

`keys` names the mapping keys whose scalar values are prose. It is required in `yaml` mode, and it is the only thing that decides what is processed.

## Matching

A key matches when its source text, with trailing spaces removed, equals a member of `keys` **code point for code point**.

- **Exact.** `Description` does not match `description`. There is no case folding, because case operations depend on the locale (Turkish dotless ı is the standing reason).
- **Any depth.** `description` matches wherever the key occurs, at any nesting level. There are no paths, no globs and no wildcards, so a machine-read `description` somewhere else in the same file would be typeset too; list the keys only if you want every occurrence.
- **Keys are never processed.** Only values.
- **A quoted key never matches.**

```example
locale: en-US
mode: yaml
keys: title
---
title: A "quoted" -- title
meta:
  title: nested "one"
Title: capitalised "key"
"title": quoted key
```

The first two keys match, at depth zero and inside `meta`. `Title` differs in case and the quoted key is declined.

## Which lines are read as keys

The scan goes line by line. A line yields a value to look at only when all of this holds:

1. It is not blank, a comment (`#`) or a directive (`%`), a document marker (`---`, `...`) or a line containing a tab.
2. After any block-sequence markers (`- `, repeatable, as in `- - key: v`) it holds a key followed by `:` and a space or the end of the line. A colon not followed by a space is an ordinary character of the key, so `a:b: v` has the key `a:b`.
3. The key text does not contain `"`, `'`, `{`, `[`, `&`, `*`, `!` or `#`. This applies at every position, so `a!b: value` yields nothing.
4. The key is in `keys`.
5. The value begins on the same line. If it is empty, the more-indented lines that follow are a nested node and are scanned as lines of their own.

Lines that belong to a value (more indented than the key, or blank) are never scanned as keys. A multi-line value cannot leak mappings into the scan.

```example
locale: en-US
mode: yaml
keys: description
---
- name: "one"
  description: first "item" -- done
- description: second "item" -- done
items:
  - description: third "item" -- done
```

## Choosing keys

List only the keys you know hold prose. Listing every key is legal and is the scan's most exposed configuration: it converts a client name such as `"HTPBE?"` in French to `"HTPBE ?"` and puts a narrow no-break space into a string written for a search engine. Only you can tell those values from the prose ones, which is why the option is yours.

## Related

- [YAML mode](/docs/modes/yaml/)
- [Quoting and scalar forms](/docs/modes/yaml/quoting/)
- [Frontmatter](/docs/modes/markdown/frontmatter/): `frontmatterKeys` uses this matching

Normative text: [spec/rules/modes.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/modes.md) (§3.8.2, §3.8.4).
