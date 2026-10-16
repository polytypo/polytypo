---
title: The span model
description: How html, markdown and yaml modes show the rules only the prose of a document, and why spans are joined with boundary markers instead of processed alone.
section: concepts
order: 10
---

In `html`, `markdown` and `yaml` mode most of a document must never be touched: tags, attributes, code, URLs, keys. The text that may be processed is scattered across many fragments. The span model decides what the rules see of those fragments, and what comes out.

A **skipped region** is a stretch of the source the rules never see. A **processable span** is a maximal stretch that is not skipped. Each span is remembered by its offsets in the original source. `text` mode is the degenerate case: one span, the whole input, nothing skipped.

## How it works

1. The mode finds the processable spans in the source and records their offsets.
2. The spans are joined into one sequence, with a **boundary marker** between each neighbouring pair.
3. The rule pipeline runs once over that whole sequence, in the [fixed rule order](/docs/concepts/rule-order/).
4. Every edit a rule produces lies inside a single span. Edits are mapped back to source offsets and applied to the original text, as described in [Round trip](/docs/concepts/round-trip/).

There are two markers, and the choice depends only on the raw source between the two spans:

| Marker | Used when | What the rules see |
| --- | --- | --- |
| Inline boundary | the skipped gap contains no line break (`a<em>x</em>b`) | an opaque character that is neither a letter, a digit, a space nor punctuation, but that counts as quote-adjacent on both sides |
| Line boundary | the gap contains at least one line break (`<p>a</p>` newline `<p>b</p>`) | an ordinary line break, which every rule already handles |

The markers are not Unicode characters, so no document can contain one. Because a line boundary is an ordinary line break, hard-wrapped prose in a document mode behaves like the same characters in `text` mode.

## Why not process each span alone

Run the pipeline on each span separately and quote nesting breaks, because a span cannot know it sits inside a larger quotation:

```example
locale: en-US
---
'hi'
```

Alone, `'hi'` is a top-level quotation and takes the primary glyphs. In a document, the same text is nested:

```example
locale: en-US
mode: html
---
"He said <em>'hi'</em> loudly"
```

Notice that the inner pair comes out as single curly quotes, nested inside the converted outer pair. That is only possible because the rules see all three spans at once.

## Why not simple concatenation

Joining the spans with nothing between them fixes nesting but creates adjacencies that do not exist in the document. Two examples:

```example
locale: en-US
mode: html
---
"a"<code>x</code>"b"
```

Without a marker the text would read `"a""b"`, two identical neighbouring marks that look like a single construct, and the outer marks would pair across the code element. With the marker, `"a"` and `"b"` each pair on their own, and the `code` element is untouched.

```example
locale: en-US
mode: html
---
He said <code>x</code> "hi"
```

Without a marker, the text would read `He said  "hi"` with two spaces, and `spaces` would delete one. The source has a single space, and it is kept.

## Examples

Quote pairs run across an inline element. The marker counts as an acceptable neighbour on either side of a quotation mark:

```example
locale: de-DE
mode: html
---
"Das ist <em>wirklich</em> so", sagte er.
```

A French space before `!` inside an element boundary is still handled, because the space is left in place and converted rather than deleted:

```example
locale: fr
mode: html
---
<em>mot</em> !
```

## Edge cases

- **Rules do not work across a boundary.** A dash next to a boundary, a number next to a unit across a boundary, a hyphenated form split by a tag, and `(c` followed by `)` in a separate span are all left alone. Missing a conversion is the accepted cost; damaging markup is not.
- **A span edge is the end of the text for deletion.** `spaces` does not delete a space at the edge of a span, because the character beyond it is markup and may be the only separator between two inline elements.
- **No edit may grow a span's edge.** An edit that would put a new space, or any other added character, at the very start or end of a span is discarded. In a `-spaced` dash locale, `a<em>--</em>b` stays as written rather than becoming `a<em> – </em>b`:

```example
locale: de-DE
mode: html
---
a<em>--</em>b
```

- **A one-for-one replacement at an edge is fine.** `"` becomes a curly quote even at the first position of a span, and a shortening such as `(c)` to a single symbol is always allowed.

## Related

- [Round trip](/docs/concepts/round-trip/)
- [Rule order](/docs/concepts/rule-order/)
- [Modes overview](/docs/modes/overview/)
- [HTML mode](/docs/modes/html/)
- [Quotes](/docs/rules/quotes/)
- [Spaces](/docs/rules/spaces/)

Normative text: [spec/rules/modes.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/modes.md).
