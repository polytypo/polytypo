# Changelog

Versions here are **spec versions**, and every runtime publishes the same number: `polytypo@1.3.0`
on npm, PyPI, pkg.go.dev, RubyGems and Packagist all implement spec 1.3.0 and produce byte-identical
output. Only released versions are listed.

Read an entry as "what changes in text I already run through polytypo". Each one is a behaviour
change with a cost, stated: a rule that fires where it did not before also fires somewhere you may
not want, and the fixtures pin both sides.

**Two characters below are not in the output.** ⍽ marks U+00A0 NO-BREAK SPACE and · marks U+202F
NARROW NO-BREAK SPACE — both are otherwise indistinguishable from an ordinary space here, and a
changelog whose entries are about invisible characters has to show them somehow.

## 1.3.0 — 20 September 2026

A fourth mode for YAML, eight more languages, and a dash fix that had been quietly putting spaces inside your markup.

- **`yaml` is a fourth mode.** It takes a required `keys` list naming which mapping keys hold prose — there is no default and no guess, because nothing in YAML's syntax separates a `description:` from a `run:`. Quoting, indentation, anchors and a block scalar's chomping indicator are never decoded and rewritten, so everything you did not name comes back byte for byte. The accepted cost is that a document quoting its keys gets nothing, and a scalar spread over several lines is left alone.
- **`dashes`** — In `html` and `markdown`, **three dashes at the edge of an element no longer put spaces inside it**. `<em>---</em>` in a locale that spaces its dashes used to come back as `<em> – </em>` — an element beginning and ending with a space it never contained, invisible until it carried a border or a background. Two dashes were already left alone there; three now are too. The accepted cost is that such a dash is not converted at all in those positions, which is the same trade the two-dash case already made.
- **`nbsp`** — **A character reference survives `text` mode.** In French, `&nbsp;` and `&laquo;` used to come back with a narrow no-break space wedged before their semicolon, which destroyed the reference. They are now left alone. Separately, `Nr.` in German and `n°` in French bind to the number that follows them.
- **`narrowNbsp: "nbsp"` makes the engine emit U+00A0 everywhere it would emit U+202F**, for faces that do not carry the narrow no-break space. It moves the rule's target rather than cleaning up afterwards, so the result is still a fixed point.
- **`ranges`** — **A range may repeat a symbol closed up on both members**: `$15-$20` is a range, `$15 - $20` is not. `ranges` still defaults to off.
- **`analyze()` reports what `transform()` would do without doing it** — one record per edit, with the rule that made it and code-point offsets into the input you passed. It is a report, not a patch.
- **Eight more languages: Spanish, Italian, European and Brazilian Portuguese, Dutch, Polish, Ukrainian and Czech.** Portuguese ships as `pt-PT` and `pt-BR` rather than one neutral `pt`, because they do not agree; `pt` resolves to `pt-PT`.

| Locale | Mode | In | Before | After |
| --- | --- | --- | --- | --- |
| `de-DE` | `html` | `a<em>---</em>b` | `a<em> – </em>b` | `a<em>---</em>b` |
| `fr` | `text` | `oui&nbsp;!` | `oui&nbsp·;!` | `oui&nbsp;!` |
| `de-DE` | `text` | `Nr. 5` | `Nr. 5` | `Nr.⍽5` |
| `de-DE` | `markdown` | `x *---* y` | `x * – * y` | `x *---* y` |

## 1.2.0 — 17 September 2026

Three fixes from production reports: file extensions keep their space, French spacing survives an inline element, and an elision before a quotation mark is set.

- **`spaces`** — A space before a token that begins with a dot is kept. Before 1.2.0 it was deleted, so `Requires .NET 8` came back as `Requires.NET 8` and `a .gitignore file` lost its space too. The rule now looks at the code point after the dot: a letter or a digit means the dot starts a token, not ends a sentence. The accepted cost is that a stray space before a real sentence stop followed by a capitalised word, `end .Next`, is now kept rather than removed.
- **`nbsp`** — In `html` and `markdown` modes, French spacing survives an inline element boundary. `<strong>Label :</strong>` kept its space before 1.2.0 only if the colon sat in the middle of a text run; at the end of a span the space was dropped entirely. The accepted cost is that a colon immediately followed by an opening tag, `12:<b>30</b>`, now gains a no-break space before it.
- **`apostrophe`** — An elision apostrophe directly before an opening quotation mark becomes U+2019. `d'«idée»` and `l'“idée”` kept a straight mark before 1.2.0, in French and Italian the commonest shape there is. Brackets stay excluded, so a prime in `f'(x)` is still left alone.

| Locale | Mode | In | Before | After |
| --- | --- | --- | --- | --- |
| `en-US` | `text` | `Requires .NET 8 and a .gitignore file.` | `Requires.NET 8 and a.gitignore file.` | `Requires .NET 8 and a .gitignore file.` |
| `fr` | `html` | `<strong>Label :</strong> oui` | `<strong>Label:</strong> oui` | `<strong>Label⍽:</strong> oui` |
| `fr` | `text` | `d'«idée»` | `d'«⍽idée⍽»` | `d’«⍽idée⍽»` |

## 1.1.0 — 9 September 2026

Short quotations convert again, and rock 'n' roll is elided in every locale.

- **`apostrophe`** — Up to 1.0.0 the rule refused to convert any one-to-three-letter run between straight single quotes, because it could not tell the `'n'` idiom from an ordinary short quotation. That declined both: `He said 'no' to me.` kept straight marks, and so did `«это 'моё' дело»`. The test is now exactly one code point, `n` or `N`, and the outcome inverts: that one shape becomes U+2019 on both sides in every locale, and every other short quotation converts like any other quotation.
- **`apostrophe`** — The accepted cost, pinned by fixtures: a genuine quotation of the letter n, `The letter 'n' is common.`, is elided. The class it replaces — every short quotation in every locale — was larger.

| Locale | Mode | In | Before | After |
| --- | --- | --- | --- | --- |
| `en-US` | `text` | `He said 'no' to me.` | `He said 'no' to me.` | `He said “no” to me.` |
| `fi` | `text` | `rock 'n' roll` | `rock 'n' roll` | `rock ’n’ roll` |

## 1.0.0 — 7 September 2026

The first frozen spec, and the first published runtime.

- Nine rules in a fixed order, ten locales, three modes, seven error codes, and idempotency as a contract rather than a hope: running `transform` over its own output returns the same bytes. Everything after this entry is a change against that baseline.

## Patch releases

Patch releases carry no behaviour change and no spec change. polytypo-js 1.0.1 moved npm publishing to trusted publishing (OIDC) and rewrote its README; 1.0.2, along with polytypo-python 1.0.1, polytypo-go 1.0.1 and polytypo-ruby 1.0.1, dropped the word “microtypography” from the published package description. The spec stayed at 1.0.0 throughout, and output was byte-identical.
