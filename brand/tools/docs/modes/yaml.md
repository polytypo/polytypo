---
title: YAML mode
description: Typeset the prose values of named keys in a YAML file, with a specified scan instead of a parser, and everything else returned byte for byte.
section: modes
order: 50
---

`yaml` mode typesets the string values of the mapping keys you name in `keys` and leaves every other byte of the file alone. It is for configuration and API-description files (OpenAPI documents, GitHub issue forms, content collections) that hold a few fields of prose among many fields a machine reads.

It is the one mode that skips **by default**. `html` and `markdown` are prose formats with islands of code, so they skip a closed list of islands. YAML is a data format with islands of prose, and nothing in its syntax separates the two, so you name the islands.

## Examples

```example
locale: en-US
mode: yaml
keys: description, summary
---
openapi: 3.1.0
info:
  title: Pets -- "API"
  description: A service for "pets" -- all of them...
paths:
  /pets:
    get:
      summary: List pets - paginated
      operationId: "list -- pets"
```

`description` and `summary` are typeset; `title` and `operationId` are not listed and come back as written.

## How it works

The mode is a hand-written left-to-right scan over the source, specified once and implemented in every runtime. It finds the **value** of each key, decides whether the key is listed, and, if so, selects the part of the value that is prose. It never parses the document into a tree and never writes one back, so there is no re-encoding step that could lose a chomping indicator, a tag or a quoting style.

Why a scan and not each runtime's YAML library: two of the five ecosystems' libraries cannot report where a scalar ends in the source (Go's `yaml.v3` reports only a start position, PHP's `symfony/yaml` reports none), and a parser-backed mode would not be portable. The scan gives the same spans in all five runtimes.

## What you must provide

`keys` is required and has no default. Omitting it, or passing something that is not a list of strings, throws `POLYTYPO_INVALID_OPTION`. An empty list is legal and processes nothing. See [Keys](/docs/modes/yaml/keys/).

## What it never does

- It never throws on the document. YAML has no declared grammar here to violate, so a file that is not YAML at all yields few spans or none and comes back unchanged.
- It never processes a key, only values.
- It never processes a construct it does not recognise with certainty. The worst outcome of a gap is prose left untypeset; it is never a changed byte. See [Quoting and scalar forms](/docs/modes/yaml/quoting/).

## Why `keys` is not optional

A first version processed every string scalar and decided by a content test. Measured against a real set of GitHub Actions workflows, it changed 37 of 106 spans, and the results were broken files: `if ! git cat-file` became `if! git cat-file`, and `${{ matrix.node }}` became `${{matrix.node}}`. Shell and template expressions are written in words, so they pass any test that finds prose. Only the schema above the YAML says that `description` is prose and `run` is a command, and only the caller knows the schema.

## Related

- [Keys](/docs/modes/yaml/keys/)
- [Quoting and scalar forms](/docs/modes/yaml/quoting/)
- [YAML config guide](/docs/guides/yaml-config/)
- [Frontmatter](/docs/modes/markdown/frontmatter/): the same scan runs over a Markdown frontmatter block

Normative text: [spec/rules/modes.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/modes.md) (§3.8).
