<p align="center">
  <img src="assets/polytypo-lockup-stacked.svg" alt="polytypo" width="260">
</p>

<h1 align="center">polytypo — Python</h1>

<p align="center">
  Locale-correct quotes, dashes, ellipses, apostrophes, symbols and no-break spaces.<br>
  One spec, five runtimes, byte-identical output.
</p>

---

**Status: planned, not yet started.** This document is the specification of the port's public surface, kept in the spec repository so the API is agreed before any code exists. No package is published on PyPI.

Spec version: **0.2.0** · locales: **10** · rules: **8** · `polytypo` on PyPI.

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

```bash
pip install polytypo
```

## Quick start

```python
from polytypo import transform

transform('Is this "polytypo"? - No, it\'s "polytypo"!', locale="en-US")
# → Is this “polytypo”?—No, it’s “polytypo”!

transform('Ist das "polytypo"?', locale="de")   # de → de-DE
# → Ist das „polytypo“?

transform('Il a dit "bonjour".', locale="fr")
# → Il a dit « bonjour ».
```

## API

```python
def transform(
    text: str,
    *,
    locale: str,                     # required — unknown locale raises
    mode: str = "text",              # "text" | "html" | "markdown"
    rules: Mapping[str, bool] | None = None,   # opt-out only
) -> str: ...
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

```python
transform("1914-1918", locale="en-US", rules={"dashes": False})
# → 1914-1918   — every other rule still runs, in the same order
```

### Errors

```python
from polytypo import PolytypoError

try:
    transform("x", locale="xx")
except PolytypoError as error:
    error.code  # "POLYTYPO_UNKNOWN_LOCALE"
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
| `nbsp` | `It is 20 km to the coast` | It is 20 km to the coast |
| `symbols` | `Copyright (c) 2026, 1920x1080` | Copyright © 2026, 1920×1080 |

## Modes

| Mode | What it processes | Status |
| --- | --- | --- |
| `text` | The whole string | Implemented in the JavaScript engine |
| `html` | Text nodes only; skips `code`, `pre`, `kbd`, `samp`, `var`, `script`, `style`, `textarea`, all attributes and existing entities | Specified in `spec/rules/modes.md`, not implemented |
| `markdown` | Prose only; skips code spans, fenced blocks, link destinations, autolinks | Specified in `spec/rules/modes.md`, not implemented |

In every mode the output is **the input with a set of disjoint substring replacements applied, and
nothing else**. The parser locates text; it never produces output. That is the only formulation five
different parsers can agree on.

### Port notes

* Python strings are sequences of code points already — convert once at the boundary and index
  directly; never iterate UTF-8 bytes.
* Use `str.translate`/explicit scanning, not `re`: the spec forbids regex in core rules so that the
  Go port can exist at all.
* No `str.lower()` without an explicit mapping table — locale-dependent case is banned by the spec.

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
