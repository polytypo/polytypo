<p align="center">
  <img src="brand/logo/polytypo-lockup-stacked.svg" alt="polytypo" width="260">
</p>

<h1 align="center">polytypo — JavaScript / TypeScript</h1>

<p align="center">
  Locale-correct quotes, dashes, ellipses, apostrophes, symbols and no-break spaces.<br>
  One spec, five runtimes, byte-identical output.
</p>

---

**Status: in development, not yet published.** All three modes — `text`, `html` and `markdown` — are implemented for all ten locales against `spec/rules/modes.md`. `markdown` requires an explicit `dialect` (`commonmark` or `mdx`); there is no default and no detection.

Spec version: **0.2.0** · locales: **10** · rules: **8** · not yet on npm.

## What it does

```text
in   Is this "polytypo"? - No, it's "polytypo"! She said, "He replied 'never' twice"... The release - all 5 km of it - covers 1914-1918. Copyright (c) 2026, at 1920x1080.

en-US → Is this “polytypo”?—No, it’s “polytypo”! She said, “He replied ‘never’ twice”… The release—all 5 km of it—covers 1914⁠–⁠1918. Copyright © 2026, at 1920×1080.
en-GB → Is this ‘polytypo’? – No, it’s ‘polytypo’! She said, ‘He replied “never” twice’… The release – all 5 km of it – covers 1914⁠–⁠1918. Copyright © 2026, at 1920×1080.
```

The same construction, in the languages that disagree with English about it:

```text
de-DE → Ist das „polytypo“? – Nein, das ist „polytypo“! Sie sagte: „Er hat ‚nie‘ geantwortet“… Die Ausgabe – z. B. die Jahre 1939⁠–⁠1945 – erscheint in 1920×1080. Copyright © 2026.
de-CH → Ist das «polytypo»? – Nein, das ist «polytypo»! Sie sagte: «Er hat ‹nie› geantwortet»… Die Ausgabe – z. B. die Jahre 1939⁠–⁠1945 – erscheint in 1920×1080. Copyright © 2026.
fr    → C’est « polytypo » ? — Non, c’est « polytypo » ! Elle a dit : « Il a répondu “jamais” »… L’édition — celle de l’été — fait 3×5 cm ; c’est tout. Copyright © 2026.
ru    → Это «полиштамп»? — Нет, это «полиштамп»! Она сказала: «он ответил „никогда“»… Достал из‑под стола — в 1941⁠—⁠1945 годах — размер 10 × 20 см. Все права защищены © 2026.
fi    → Onko tämä ”polytypo”? – Ei, tämä on ”polytypo”! Hän sanoi: ”hän vastasi ’ei koskaan’”… Matkaa on 20 km – vuosina 1914⁠–⁠1918 – ja hinta nousi 10,5 %. Copyright © 2026.
sv    → Är det här ”polytypo”? – Nej, det är ”polytypo”! Hon sa: ”han svarade ’aldrig’”… Vi gick 5 km – åren 1914⁠–⁠1918 – och det kostar 100 kr. Copyright © 2026.
el    → Είναι αυτό «polytypo»; - Όχι, αυτό είναι «polytypo»! Είπε: «απάντησε “ποτέ”»… Η έκδοση - όλα τα 25-45 άτομα - καλύπτει 1989-1991. Copyright © 2026, σε 1920×1080.
```


Every string above is real engine output, generated from `promo/examples.json` — not typed by hand.

## Install

Not published yet — the name `polytypo` is reserved but nothing has been released to npm, and the
package version is still `0.0.0`. Until it ships, use it from a clone:

```bash
git clone https://github.com/polytypo/polytypo-js && cd polytypo-js && npm install && npm run build
```

Once published, installation will be the ordinary one:

```bash
npm install polytypo
```

## Quick start

```js
import { transform } from "polytypo";

transform(`Is this "polytypo"? - No, it's "polytypo"!`, { locale: "en-US" });
// → Is this “polytypo”?—No, it’s “polytypo”!

transform(`Ist das "polytypo"?`, { locale: "de" });   // de → de-DE
// → Ist das „polytypo“?

transform(`Il a dit "bonjour".`, { locale: "fr" });
// → Il a dit « bonjour ».
```

## API

```ts
transform(input: string, options: Options): string

interface Options {
  locale: string;                            // required — unknown locale throws
  mode?: "text" | "html" | "markdown";       // default "text"
  dialect?: "commonmark" | "mdx";            // required when mode is "markdown"; no default
  rules?: Partial<Record<RuleId, boolean>>;  // opt-out only; false disables
}
```

`dialect` is required — not defaulted — whenever `mode` is `"markdown"`, and ignored otherwise.
CommonMark and MDX disagree about ordinary documents, so the caller states which one it has; that
is the file extension, and the library cannot know it. Detection is deliberately refused: a single
`<https://…>` autolink makes a file invalid MDX, and a heuristic would then silently reclassify an
ESM statement as prose.

```js
transform('Is this "polytypo"? - No', { locale: "en-US", mode: "markdown", dialect: "commonmark" });
// → Is this “polytypo”?—No

transform("a", { locale: "en-US", mode: "markdown" });
// throws PolytypoError { code: "POLYTYPO_INVALID_DIALECT" }
```

`transform` is **pure**: no filesystem, no network, no clock, no environment, no globals, no
module-level state. Calling it twice with the same arguments returns the same string, and calling it
on its own output is a no-op:

```text
transform(transform(x)) == transform(x)
```

That is a hard invariant, proven by property-based tests, not a hope. A failing idempotency property
is a release blocker.

### Turning a rule off

```js
transform("1914-1918", { locale: "en-US", rules: { dashes: false } });
// → 1914-1918   — every other rule still runs, in the same order
```

### Errors

```js
import { PolytypoError } from "polytypo";

try {
  transform("x", { locale: "xx" });
} catch (error) {
  if (error instanceof PolytypoError) {
    error.code; // "POLYTYPO_UNKNOWN_LOCALE"
  }
}
```

| Code | Raised when |
| --- | --- |
| `POLYTYPO_UNKNOWN_LOCALE` | The locale is not in the registry and does not resolve to one. |
| `POLYTYPO_INVALID_MODE` | The mode is not `text`, `html` or `markdown`. |
| `POLYTYPO_INVALID_DIALECT` | `mode` is `markdown` and `dialect` is missing, or is not `commonmark` or `mdx`. |
| `POLYTYPO_UNKNOWN_RULE` | The `rules` map names a rule that does not exist. |
| `POLYTYPO_MALFORMED_INPUT` | The input does not parse in the requested language. Reachable only for `dialect: "mdx"`, which embeds JavaScript. |
| `POLYTYPO_MALFORMED_LOCALE_DATA` | Embedded locale data failed schema validation at build time. |
| `POLYTYPO_RULE_CONTRACT` | A rule produced an edit that violates the pipeline contract. |

Codes are the contract across all five runtimes. **Messages are English prose and are not** — never
match on them.

## Locales

| Locale | Language | Primary quotes | Secondary | Parenthetical dash | Range |
| --- | --- | --- | --- | --- | --- |
| `en-US` | English (United States) | “…” | ‘…’ | em dash, unspaced | en dash, unspaced |
| `en-GB` | English (United Kingdom) | ‘…’ | “…” | en dash, spaced | en dash, unspaced |
| `de-DE` | German (Germany) | „…“ | ‚…‘ | en dash, spaced | en dash, unspaced |
| `de-CH` | German (Switzerland) | «…» | ‹…› | en dash, spaced | en dash, unspaced |
| `fr` | French | «…» + U+00A0 | “…” | em dash, spaced | unchanged |
| `fr-CA` | French (Canada) | «…» + U+00A0 | “…” | em dash, spaced | unchanged |
| `ru` | Russian | «…» | „…“ | em dash, spaced | em dash, unspaced |
| `fi` | Finnish | ”…” | ’…’ | en dash, spaced | en dash, unspaced |
| `sv` | Swedish | ”…” | ’…’ | en dash, spaced | en dash, unspaced |
| `el` | Greek | «…» | “…” | unchanged | unchanged |

Aliases resolve in the spec, never in a platform locale library: `en` → `en-US`, `de` → `de-DE`. An unknown locale throws — there is no silent fallback to English.

## Rules

| Order | Rule id | Default | What it does |
| --- | --- | --- | --- |
| 10 | `spaces` | on | Collapse repeated spaces, strip spaces before punctuation, normalize spacing inside brackets. |
| 20 | `ellipsis` | on | Three dots to U+2026; locale-dependent abbreviated forms after terminal punctuation. |
| 30 | `dashes` | on | Parenthetical dash and numeric/date range dash per locale convention. |
| 35 | `hyphen` | on | Bind morphological hyphen forms with U+2011 (non-breaking hyphen) so they cannot be broken across lines. |
| 40 | `quotes` | on | Straight quotes to locale primary/secondary pairs with nesting resolution. |
| 50 | `apostrophe` | on | Remaining straight apostrophes to U+2019 without corrupting contractions. |
| 60 | `symbols` | on | (c)/(r)/(tm) to the corresponding signs; multiplication sign between numerals. |
| 70 | `nbsp` | on | Insert no-break and narrow no-break spaces per locale. |

Rule ids are **public API** — they appear in the `rules` option and in future integration config.
Renaming one is a breaking change. Order comes from `spec/rules/order.json`, never from registration
order and never from map iteration order.

## Examples, by rule

| Rule | In | Out |
| --- | --- | --- |
| `quotes` | `"He said 'no' to me," she noted.` | “He said ‘no’ to me,” she noted. |
| `dashes` | `The plan - if there is one - fails.` | The plan—if there is one—fails. |
| `dashes` | `1914-1918 and pp. 34-36` | 1914⁠–⁠1918 and pp. 34⁠–⁠36 |
| `ellipsis` | `Wait... what?` | Wait… what? |
| `apostrophe` | `don't` | don’t |
| `nbsp` | `It is 20 km to the coast` | It is 20⍽km to the coast |
| `symbols` | `Copyright (c) 2026, 1920x1080` | Copyright © 2026, 1920×1080 |

**⍽ is not in the output — it marks U+00A0 NO-BREAK SPACE**, which is otherwise indistinguishable
from an ordinary space on this page. The `nbsp` rule's entire job is invisible, which is exactly why
`spec/fixtures/` is mirrored by a CI-generated escaped `\uXXXX` file: a diff full of unannotated
U+00A0 and U+202F cannot be reviewed by a human.

## Modes

| Mode | What it processes | Parser |
| --- | --- | --- |
| `text` | The whole string | none |
| `html` | Text nodes only; skips `code`, `pre`, `kbd`, `samp`, `var`, `script`, `style`, `textarea`, all attributes and existing entities | `parse5` |
| `markdown` | Prose only; skips code spans, fenced blocks, link destinations, autolinks | `micromark`, per the required `dialect` |

All three are implemented in the JavaScript engine against `spec/rules/modes.md`. The skip list and
the reassembly guarantee live in the spec, not in the parser — the parser differs per runtime
(`nokogiri` in Ruby, `golang.org/x/net/html` in Go, DOM in PHP), the guarantee does not.

In every mode the output is **the input with a set of disjoint substring replacements applied, and
nothing else**. The parser locates text; it never produces output. That is the only formulation five
different parsers can agree on.

### Bundling

The package is ESM and CJS, side-effect free and tree-shakeable. Locale data is embedded into the
published artifact at build time — nothing is read from disk or fetched at runtime.

## Conformance

An implementation is polytypo **if and only if** it passes the conformance suite for the spec version
it claims. The suite lives in `spec/fixtures/<locale>.json` as flat `in`/`out` pairs written with
literal characters, mirrored by a CI-generated escaped file so that a diff of an invisible U+202F is
reviewable by a human.

Every fixture is also an idempotency case: the runner asserts `transform(out) == out`. Cases are
tagged with a rule id, so a runtime can report partial conformance honestly instead of claiming all
of it.

## Contributing

A behaviour change is a **spec change first, code second**. Fixing a bug in one runtime without
adding a fixture is how five ports quietly stop being the same library — so it is not accepted.

1. `spec/rules/<id>.md` — the semantics, in prose, with worked examples
2. `spec/rules/order.json` — the rule's position and default
3. `spec/locales/<code>.json` — data only: literal strings, code points, lists, enums
4. `spec/fixtures/<code>.json` — cases, including an idempotency case
5. Only then: the implementation

Locale claims are settled by citation, not preference. Every locale file carries a mandatory
`sources` array pointing at the normative reference — Duden, Imprimerie nationale, Kotus,
Språkrådet, Chicago, Мильчин.

## Licence

Source code: MIT. Brand assets (the mark, the wordmark and their lockups) are **not** covered by the
MIT licence — see `brand/README.md`. They may be used unmodified to refer to or credit this project,
and not as another project's identity, nor on goods for sale, without permission.
