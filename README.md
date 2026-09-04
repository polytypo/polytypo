<p align="center">
  <img src="brand/logo/polytypo-lockup-stacked.svg" alt="polytypo" width="260">
</p>

<h1 align="center">polytypo — JavaScript / TypeScript</h1>

<p align="center">
  Locale-correct quotes, dashes, ellipses, apostrophes, symbols and no-break spaces.<br>
  One runtime today. One portable spec designed for five, byte-identical output.
</p>

---

**Status: stable JavaScript runtime — package version 1.0.0.** All three modes — `text`, `html` and `markdown` — are implemented for all ten locales against `spec/rules/modes.md`. `markdown` requires an explicit `dialect` (`commonmark` or `mdx`); there is no default and no detection.

Spec version: **1.0.0** · package version: **1.0.0** · locales: **10** · rules: **9**.

## What it does

```text
in   She asked, "Isn't this the shop they call 'round the corner'?" ... We'd walked - nearly 3 km - just to find it closed. Copyright (c) 2026; the print measures 40x60 cm.

en-US → She asked, “Isn’t this the shop they call ‘round the corner’?” … We’d walked—nearly 3 km—just to find it closed. Copyright © 2026; the print measures 40×60 cm.
en-GB → She asked, ‘Isn’t this the shop they call “round the corner”?’ … We’d walked – nearly 3 km – just to find it closed. Copyright © 2026; the print measures 40×60 cm.
```

The same construction, in the languages that disagree with English about it:

```text
de-DE → Sie fragte: „Ist das nicht der Laden namens ‚an der Ecke‘?“ … Wir liefen – fast 3 km – und fanden ihn leider geschlossen. Copyright © 2026, Format 40×60 cm, z. B. für Poster.
de-CH → Sie fragte: «Ist das nicht der Laden namens ‹an der Ecke›?» … Wir liefen – fast 3 km – und fanden ihn leider geschlossen. Copyright © 2026, Format 40×60 cm, z. B. für Poster.
fr    → Elle a dit : « Ce n’est pas la librairie qu’on appelle “le coin”, si ? » … On a marché — presque 3 km — pour la trouver fermée. Copyright © 2026 ; le tirage fait 40×60 cm.
ru    → Она спросила: «Это не тот магазинчик, который называют „за углом“?» … Мы прошли — почти 3 км — и нашли его закрытым, а что‑то достали из‑под прилавка. Copyright © 2026, формат 40×60 см.
fi    → Hän kysyi: ”Eikö tämä ole se ’nurkan’ kirjakauppa?” … Kävelimme – lähes 3 km – ja löysimme sen kiinni. Copyright © 2026; tulosteen koko on 40×60 cm, hinta nousi 10,5 %.
sv    → Hon frågade: ”Är det inte affären i ’hörnet’?” … Vi gick – nästan 3 km – och hittade den stängd. Copyright © 2026; trycket mäter 40×60 cm och kostar 10,5 % mer.
el    → Ρώτησε: «Δεν είναι αυτό το μαγαζί “στη γωνία”;» … Περπατήσαμε -- σχεδόν 3 χλμ -- και το βρήκαμε κλειστό. Copyright © 2026, μέγεθος 40×60 cm.
```


Every string above is real engine output, generated from `promo/examples.json` — not typed by hand.

## Install

```bash
npm install polytypo
```

## Quick start

```js
import { transform } from "polytypo";

transform(`They said "don't" - not "won't".`, { locale: "en-US" });
// → They said “don’t”—not “won’t”.

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
transform("Wait - really", { locale: "en-US", mode: "markdown", dialect: "commonmark" });
// → Wait—really

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
transform("pp. 34-36", { locale: "en-US", rules: { dashes: false } });
// → pp. 34-36   — every other rule still runs, in the same order
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
| `POLYTYPO_MALFORMED_INPUT` | The input does not parse in the requested language. Reachable only for `dialect: "mdx"`, which embeds JavaScript — `html` parsing is recovery-based and never throws this, and plain CommonMark has no syntax errors at all. |
| `POLYTYPO_MALFORMED_LOCALE_DATA` | Embedded locale data failed schema validation at build time. |
| `POLYTYPO_RULE_CONTRACT` | A rule produced an edit that violates the pipeline contract. |

Codes are the contract across every runtime this spec is designed for. **Messages are English
prose and are not** — never match on them.

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
| 25 | `ranges` | off | Numeric/date range dash per locale convention (dash.range). |
| 30 | `dashes` | on | Parenthetical dash per locale convention (dash.parenthetical). |
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
| `quotes` | `"He said 'no' to me," she noted.` | “He said 'no' to me,” she noted. |
| `dashes` | `The plan - if there is one - fails.` | The plan—if there is one—fails. |
| `dashes` | `chapters 3-5 and pp. 34-36` | chapters 3-5 and pp. 34-36 |
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

### Subpath entry points

Four import paths are published. All four ship ESM, CommonJS, and their own TypeScript
declarations:

```js
import { transform } from "polytypo";           // aggregate — all three modes, one import
import { transform } from "polytypo/text";       // text-only
import { transform } from "polytypo/html";       // HTML, without the Markdown parser stack
import { transform } from "polytypo/markdown";   // Markdown — CommonMark and MDX
```

Use the aggregate `polytypo` import if your code needs more than one mode. Each mode-specific
entry point fixes its own mode at the type level, taken directly from its source
(`src/index.text.ts`, `src/index.html.ts`, `src/index.markdown.ts`):

```ts
// polytypo/text — TextOptions = Omit<Options, "mode" | "dialect">
transform(input: string, options: TextOptions): string

// polytypo/html — HtmlOptions = Omit<Options, "mode" | "dialect">
transform(input: string, options: HtmlOptions): string

// polytypo/markdown — MarkdownOptions = Omit<Options, "mode"> & { dialect: Dialect }
transform(input: string, options: MarkdownOptions): string
```

`mode` is not a parameter of `TextOptions` or `HtmlOptions` — there is no competing mode to pass,
since each entry point only ever runs the one mode its name says. `MarkdownOptions` keeps the
aggregate entry's `dialect` contract exactly: required, no default. A plain-JS caller — or a
TypeScript caller passing a wider-typed variable, which excess-property checking does not catch —
can still supply a runtime `mode` anyway. That value is checked, not silently ignored or
overridden: omitting it is the normal case; supplying the entry's own fixed mode (e.g. `mode:
"text"` to `polytypo/text`) is redundant but tolerated; supplying any other mode throws
`POLYTYPO_INVALID_MODE`.

Choosing a subpath narrows what a bundler can *reach* — `polytypo/text` never imports `parse5` or
the Micromark/MDX stack, and `polytypo/html` never imports the Micromark/MDX stack. Whether that
narrower reachable graph actually produces a smaller bundle for you depends on your bundler and its
configuration (tree-shaking, code-splitting, externals) — reach is what this package controls;
the bundle it becomes is your tool's job. It does **not** change what `npm install polytypo` puts
on disk either way — npm resolves `package.json`'s `dependencies` as a whole, once, regardless of
which entry point your code imports from.

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
