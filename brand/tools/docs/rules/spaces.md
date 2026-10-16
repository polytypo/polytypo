---
title: spaces
description: The spaces rule collapses runs of ordinary spaces, removes spaces before punctuation and inside brackets, and leaves indentation, hard breaks and emoticons alone.
section: rules
order: 10
---

`spaces` is the first rule in the pipeline and the most conservative one. It does two things: it collapses a run of two or more ordinary spaces (U+0020) into one, and it deletes a space that sits in front of closing punctuation or on the inside of a bracket pair. It only ever removes U+0020. It never inserts a character, never touches any other kind of whitespace, and never touches whitespace that has structural meaning.

It runs first so that every later rule sees one canonical spacing form instead of having to consider `a  ,  b` next to `a, b`. It is on by default and behaves the same in every locale.

## How it works

The rule looks at each maximal run of U+0020 characters and decides, once, how long the run should be: zero or one.

A run is a candidate only if there is ordinary content on both sides. A run at the start of the text or directly after a line break is skipped (indentation), and so is a run directly before a line break or at the end of the text (the Markdown hard break, and the separator between two inline elements in HTML). In `html` and `markdown` mode the edge of a text span counts as the end of the text for this check, because the rule cannot see what lies beyond it and deleting whitespace cannot be undone.

For a candidate run, the first matching case wins:

1. The run sits between an opening and its matching closing bracket (`( )`, `[ ]`, `{ }`): length 1. Removing the space would turn the GitHub task-list marker `[ ]` into `[]`.
2. The character before the run is an opening bracket `(`, `[` or `{`: length 0.
3. The character after the run is a closing bracket `)`, `]` or `}`: length 0.
4. The character after the run is one of `, . ; : ! ?`: length 0, subject to the two guards below.
5. Anything else: length 1.

Because the length is computed once from the two neighbours, a single pass reaches the final result. `a  ,  b` becomes `a, b` without a second scan.

### The lone-dot guard

A space before a full stop is removed only when the dot is a single terminal full stop. If the dot is part of a longer run (`..`, `...`) or is followed directly by a letter or digit, the space stays. That keeps `See ../docs` intact, keeps `Wait ...` for the `ellipsis` rule to convert (to `Wait …`), and keeps `.NET`, `.gitignore` and `.5` as words.

The cost is stated in the spec: a misplaced full stop followed directly by a letter, as in `end .Next`, keeps its stray space. Deleting it would glue two words together, which is worse.

U+2026 is not in the list of characters that pull a space off, so a space before an existing ellipsis is never removed.

### The emoticon guard

`:` and `;` are both sentence punctuation and the eyes of a text emoticon. The rule recognises an eye, an optional nose (`-` or `^`) and a mouth (one of `( ) [ ] D d P p O o / \ | *`) as an emoticon and keeps the space in front of it. It also keeps the space after a mouth that is a bracket, so `a :( b` does not become `a :(b`. If the mouth is followed by a letter or digit (`:Deal`), it is not treated as an emoticon.

## Examples

Runs collapse, and spaces vanish before punctuation and inside brackets:

```example
locale: en-US
---
Hello   world  ,  and ( text ) here !
```

The same pass on a longer string with a bracket in the middle:

```example
locale: en-US
---
a  (  b  ,  c  )  d
```

The rule does not look at the language. In French the space before `!` and `?` is removed here, and the `nbsp` rule, which runs last, puts a narrow no-break space back. The result is the same however the author typed it:

```example
locale: fr
---
Bonjour !  Ça va  ?
```

Mixed punctuation and spacing:

```example
locale: en-US
---
Wait ... what?  See ../docs and use .NET, .NET Core
```

Notice that `Wait ...` and `See ../docs` keep their spaces, and that `ellipsis` converted the three dots after `spaces` had left them alone.

Chicago-style spaced dots are different: every dot is a lone dot at the moment of the decision, so all the spaces go and the dots then merge:

```example
locale: en-US
---
Hello . . . and then more
```

Emoticons keep their word spacing:

```example
locale: en-US
---
Привет :-)  and a :( b
```

Only the doubled space after `:-)` collapsed. The space in front of each emoticon and after the second one stayed.

A space inside a task-list marker is preserved, and the two trailing spaces that make a Markdown hard line break survive:

````example
locale: en-US
mode: markdown
dialect: commonmark
---
- [ ] task  with   gap
- [x] done  
next line
````

Skipped regions are never seen by the rule. In `markdown` mode the code span, the indented code block and the fenced block keep their spacing, while the prose around them is cleaned:

````example
locale: en-US
mode: markdown
dialect: commonmark
---
text  with   `code   span`  and  more

    indented   code

```
fenced   code
```
````

## Locale data

None. The rule reads no locale field, and its behaviour is identical in every locale. Locale-specific spacing before punctuation, such as the French narrow no-break space, belongs to [nbsp](/docs/rules/nbsp/).

## Options

`spaces` is on by default. To switch it off:

```js
transform(text, { locale: 'en-US', rules: { spaces: false } })
```

The other rules still run, in their usual order.

## Edge cases

- Only U+0020 is ever changed. Tabs, no-break spaces (U+00A0, U+202F), thin and figure spaces, the ideographic space, zero-width space and the byte-order mark are never collapsed or removed. `5` followed by two U+00A0 characters and `km` stays as written; only an ordinary space run beside a no-break space collapses.
- Line terminators are never inserted, removed or reordered, and a run never merges across one.
- Indentation (a run at the start of the text or after a line break) is left as written, and so are trailing spaces before a line break or at the end of the text.
- The six punctuation marks that pull a space off are exactly `, . ; : ! ?`. Closing quotation marks and guillemets are not among them; the space inside quotation marks belongs to `nbsp`.
- The Greek question mark is written U+003B, the same code point as the Latin semicolon, so `Τι κάνεις ;` loses its space with no Greek-specific logic. The Greek compatibility characters U+037E and U+0387, and the middle dot U+00B7, are not in any list: text that already contains them is left as it is. A space before an *ano teleia* therefore survives, and so does the spaced separator in `Home · About · Contact`.
- Emoticon recognition covers the eye-nose-mouth shape only. Kaomoji such as `(^_^)`, `=)` and emoji are not special-cased.
- The rule has no awareness of code. In `text` mode nothing is skipped, so spacing inside code is changed like any other text; the `html`, `markdown` and `yaml` modes remove code spans, fenced code, `<pre>`, attributes and similar regions before the rule runs.

## Related

- [ellipsis](/docs/rules/ellipsis/): converts the dot runs that `spaces` leaves in place.
- [nbsp](/docs/rules/nbsp/): re-inserts the locale's no-break space before punctuation.
- [Rule order](/docs/concepts/rule-order/)
- [Idempotency](/docs/concepts/idempotency/)
- [Span model](/docs/concepts/span-model/)

Normative text: [spec/rules/spaces.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/spaces.md).
