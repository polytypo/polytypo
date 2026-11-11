---
title: quote-punctuation
seo_title: quote-punctuation rule: comma and full stop inside the closing quotation mark | polytypo
description: The opt-in quote-punctuation rule moves a comma or full stop from after a closing quotation mark to before it, for the locale whose convention puts it there, and declines wherever the placement depends on meaning.
section: rules
order: 65
---

`quote-punctuation` moves a comma or a full stop from after a closing quotation mark to before it: `“hello”,` becomes `“hello,”`. It applies only to locales whose cited convention puts these two marks inside the quotation mark. In the shipped locale data that is `en-US` (the Chicago Manual of Style); every other locale is set to `none`, and the rule does nothing there.

**This rule is off by default.** It changes where a character the author typed sits, not just which glyph it is. Turn it on with `rules: { "quote-punctuation": true }`.

## Why it is opt-in

Where a comma or full stop goes relative to a closing quotation mark is a convention, and in most locales it depends on meaning: a mark that belongs to the quoted words goes inside, one that belongs to the surrounding sentence goes outside. `"Stop."` and `"most popular",` look alike on the surface, and a rule that scans code points cannot tell them apart. So the rule is defined only where the convention is positional, a comma or full stop goes inside whatever the sense, and the locale says `none` everywhere else.

Even for `en-US` the move is not always right. In technical text a quoted literal absorbs the punctuation: `set it to "strict".` becomes `set it to “strict.”`. Code spans and code blocks are skipped in the `html` and `markdown` modes, so a literal written as code is safe. That is why the rule is an opt-in.

## How it works

The rule looks at each closing primary quotation mark of the locale (for `en-US`, U+201D) and moves the comma or full stop that follows it to before it, when all of these hold:

1. **A letter comes before the quotation mark.** A digit, another punctuation mark, a bracket or another quotation mark does not qualify, so `“Route 66”.`, `“Stop!”.`, `“e.g.”,` and the nested `“He said ‘hi’”.` are left alone.
2. **The mark is a comma or a full stop.** Semicolons, colons, question marks and exclamation marks are never moved.
3. **A space, a line break or the end of the text comes next.** A letter, a bracket, another dot or a quotation mark does not qualify, so `“file”.txt`, `(“hi”.)` and `“wait”…` are left alone.

Nothing is inserted or deleted, so a call keeps its length, and the output is a fixed point: run again, nothing more moves.

### Modes

A boundary between the quotation mark and the punctuation, or immediately before or after the pair, blocks the move. In `html` and `markdown` that means an element or an emphasis delimiter: `<em>“hello”</em>,` and `*“hello”*,` keep the comma where it was. In `text` mode a range given to `protect` counts as a boundary in the same way. The end of a document is not a boundary.

## Locale data

The rule reads `quotes.punctuationPlacement`, one of `inside` or `none`.

| Value | Locales |
| --- | --- |
| `inside` | `en-US` |
| `none` | every other locale |

`none` means the rule does nothing. For `en-GB` and `de-DE` the cited convention places these marks by meaning (the University of Oxford Style Guide (2014) and the Amtliches Regelwerk of 2024), so there is nothing a scan can apply. For the others no convention has been verified.

## Options

Enable the rule explicitly:

```js
transform(text, { locale: 'en-US', rules: { 'quote-punctuation': true } })
```

`false` is the default. There is no other setting.

## Edge cases

- Only the closing primary quotation mark is read. The secondary close, which in `en-US` is also the apostrophe, is never a trigger: `the dogs’, bowls` is untouched.
- A duplicate is not removed: `“Stop!”.` keeps both marks.
- An unpaired closing quotation mark that the author typed in curly form moves its comma too. The rule trusts the glyph, not the pairing.
- A quotation after a number (`“Route 66”.`) and a nested quotation keep the punctuation outside.

## Related

- [quotes](/docs/rules/quotes/): the rule that produces the quotation marks this rule reads.
- [Rule order](/docs/concepts/rule-order/)
- [Options](/docs/api/options/)

Normative text: [spec/rules/quote-punctuation.md](https://github.com/polytypo/polytypo/blob/main/spec/rules/quote-punctuation.md).
