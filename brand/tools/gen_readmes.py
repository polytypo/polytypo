#!/usr/bin/env python3
"""Generate the README for every runtime from one source of truth.

Shared sections (locale table, rule table, error codes, conformance, licence) are
built from spec/ and promo/examples.json; only the code samples differ per language.
Run after changing the spec or the examples:

    python3 brand/tools/gen_readmes.py
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
SPEC = os.path.join(REPO, "spec")

with open(os.path.join(REPO, "promo", "examples.json"), encoding="utf-8") as f:
    EXAMPLES = json.load(f)
with open(os.path.join(SPEC, "rules", "order.json"), encoding="utf-8") as f:
    ORDER = json.load(f)
with open(os.path.join(SPEC, "locales", "registry.json"), encoding="utf-8") as f:
    REGISTRY = json.load(f)
SPEC_VERSION = ORDER["spec"]

LOCALE_DATA = {}
for code in REGISTRY["locales"]:
    with open(os.path.join(SPEC, "locales", f"{code}.json"), encoding="utf-8") as f:
        LOCALE_DATA[code] = json.load(f)

HERO = {loc["locale"]: loc for loc in EXAMPLES["locales"]}

# Spelled out rather than hardcoded: the count changes whenever a locale lands, and a stale
# "eight" in the status line contradicted the generated locale table two lines below it.
_COUNT_WORDS = {
    1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six",
    7: "seven", 8: "eight", 9: "nine", 10: "ten", 11: "eleven", 12: "twelve",
}
LOCALE_COUNT = len(REGISTRY["locales"])
LOCALE_COUNT_WORD = _COUNT_WORDS.get(LOCALE_COUNT, str(LOCALE_COUNT))

DASH_WORDS = {
    "em-tight": "em dash, unspaced",
    "em-spaced": "em dash, spaced",
    "en-tight": "en dash, unspaced",
    "en-spaced": "en dash, spaced",
    "none": "unchanged",
}


# --------------------------------------------------------------- shared blocks
def hero_block():
    en = HERO["en-US"]
    de = HERO["de-DE"]
    fr = HERO["fr"]
    ru = HERO["ru"]
    return f"""```text
in   {en['hero']['in']}

en-US → {en['hero']['out']}
en-GB → {HERO['en-GB']['hero']['out']}
```

The same construction, in the languages that disagree with English about it:

```text
de-DE → {de['hero']['out']}
de-CH → {HERO['de-CH']['hero']['out']}
fr    → {fr['hero']['out']}
ru    → {ru['hero']['out']}
fi    → {HERO['fi']['hero']['out']}
sv    → {HERO['sv']['hero']['out']}
el    → {HERO['el']['hero']['out']}
```
"""


def locale_table():
    rows = ["| Locale | Language | Primary quotes | Secondary | Parenthetical dash | Range |",
            "| --- | --- | --- | --- | --- | --- |"]
    for code in REGISTRY["locales"]:
        d = LOCALE_DATA[code]
        q, s = d["quotes"]["primary"], d["quotes"]["secondary"]
        inner = {"none": "", "nbsp": " + U+00A0", "narrow-nbsp": " + U+202F"}[q["innerSpace"]]
        rows.append(
            f"| `{code}` | {d['name']} | {q['open']}…{q['close']}{inner} | {s['open']}…{s['close']} | "
            f"{DASH_WORDS[d['dash']['parenthetical']]} | {DASH_WORDS[d['dash']['range']]} |"
        )
    aliases = ", ".join(f"`{a}` → `{t}`" for a, t in REGISTRY["aliases"].items())
    rows.append("")
    rows.append(f"Aliases resolve in the spec, never in a platform locale library: {aliases}. "
                "An unknown locale throws — there is no silent fallback to English.")
    return "\n".join(rows)


def rules_table():
    rows = ["| Order | Rule id | Default | What it does |", "| --- | --- | --- | --- |"]
    for r in ORDER["rules"]:
        summary = r["summary"].split(". ")[0].rstrip(".") + "."
        rows.append(f"| {r['order']} | `{r['id']}` | {r['default']} | {summary} |")
    return "\n".join(rows)


def examples_table(locale, mark_invisible=False):
    e = HERO[locale]
    rows = ["| Rule | In | Out |", "| --- | --- | --- |"]
    for c in e["cases"]:
        out = c["out"].replace(" ", "⍽") if mark_invisible else c["out"]
        rows.append(f"| `{c['rule']}` | `{c['in']}` | {out} |")
    table = "\n".join(rows)
    if not mark_invisible:
        return table
    return table + "\n\n" + NBSP_NOTE


NBSP_NOTE = """**⍽ is not in the output — it marks U+00A0 NO-BREAK SPACE**, which is otherwise indistinguishable
from an ordinary space on this page. The `nbsp` rule's entire job is invisible, which is exactly why
`spec/fixtures/` is mirrored by a CI-generated escaped `\\uXXXX` file: a diff full of unannotated
U+00A0 and U+202F cannot be reviewed by a human."""


MODES_GENERIC = """| Mode | What it processes | Status |
| --- | --- | --- |
| `text` | The whole string | Implemented in the JavaScript engine |
| `html` | Text nodes only; skips `code`, `pre`, `kbd`, `samp`, `var`, `script`, `style`, `textarea`, all attributes and existing entities | Specified in `spec/rules/modes.md`, not implemented |
| `markdown` | Prose only; skips code spans, fenced blocks, link destinations, autolinks | Specified in `spec/rules/modes.md`, not implemented |"""


MODES_JS = """| Mode | What it processes | Parser |
| --- | --- | --- |
| `text` | The whole string | none |
| `html` | Text nodes only; skips `code`, `pre`, `kbd`, `samp`, `var`, `script`, `style`, `textarea`, all attributes and existing entities | `parse5` |
| `markdown` | Prose only; skips code spans, fenced blocks, link destinations, autolinks | `micromark`, per the required `dialect` |

All three are implemented in the JavaScript engine against `spec/rules/modes.md`. The skip list and
the reassembly guarantee live in the spec, not in the parser — the parser differs per runtime
(`nokogiri` in Ruby, `golang.org/x/net/html` in Go, DOM in PHP), the guarantee does not."""


ERRORS = """| Code | Raised when |
| --- | --- |
| `POLYTYPO_UNKNOWN_LOCALE` | The locale is not in the registry and does not resolve to one. |
| `POLYTYPO_INVALID_MODE` | The mode is not `text`, `html` or `markdown`. |
| `POLYTYPO_INVALID_DIALECT` | `mode` is `markdown` and `dialect` is missing, or is not `commonmark` or `mdx`. |
| `POLYTYPO_UNKNOWN_RULE` | The `rules` map names a rule that does not exist. |
| `POLYTYPO_MALFORMED_INPUT` | The input does not parse in the requested language. Reachable only for `dialect: "mdx"`, which embeds JavaScript. |
| `POLYTYPO_MALFORMED_LOCALE_DATA` | Embedded locale data failed schema validation at build time. |
| `POLYTYPO_RULE_CONTRACT` | A rule produced an edit that violates the pipeline contract. |

Codes are the contract across all five runtimes. **Messages are English prose and are not** — never
match on them."""


# ------------------------------------------------------------------ languages
LANGS = {
    "js": {
        "file": "README.md",
        "title": "JavaScript / TypeScript",
        "package": "polytypo",
        "registry": "npm",
        "logo": "brand/logo/polytypo-lockup-stacked.svg",
        "on_registry": False,
        "status": (
            "**Status: in development, not yet published.** All three modes — `text`, `html` and "
            f"`markdown` — are implemented for all {LOCALE_COUNT_WORD} locales against "
            "`spec/rules/modes.md`. `markdown` requires an explicit `dialect` (`commonmark` or "
            "`mdx`); there is no default and no detection."
        ),
        "install": """Not published yet — the name `polytypo` is reserved but nothing has been released to npm, and the
package version is still `0.0.0`. Until it ships, use it from a clone:

```bash
git clone https://github.com/polytypo/polytypo-js && cd polytypo-js && npm install && npm run build
```

Once published, installation will be the ordinary one:

```bash
npm install polytypo
```""",
        "quickstart": """```js
import { transform } from "polytypo";

transform(`Is this "polytypo"? - No, it's "polytypo"!`, { locale: "en-US" });
// → Is this “polytypo”?—No, it’s “polytypo”!

transform(`Ist das "polytypo"?`, { locale: "de" });   // de → de-DE
// → Ist das „polytypo“?

transform(`Il a dit "bonjour".`, { locale: "fr" });
// → Il a dit « bonjour ».
```""",
        "api": """```ts
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
```""",
        "optout": """```js
transform("1914-1918", { locale: "en-US", rules: { dashes: false } });
// → 1914-1918   — every other rule still runs, in the same order
```""",
        "errors": """```js
import { PolytypoError } from "polytypo";

try {
  transform("x", { locale: "xx" });
} catch (error) {
  if (error instanceof PolytypoError) {
    error.code; // "POLYTYPO_UNKNOWN_LOCALE"
  }
}
```""",
        "extra": """### Bundling

The package is ESM and CJS, side-effect free and tree-shakeable. Locale data is embedded into the
published artifact at build time — nothing is read from disk or fetched at runtime.""",
        "modes": MODES_JS,
        "mark_invisible": True,
    },
    "python": {
        "file": "docs/ports/README.python.md",
        "title": "Python",
        "package": "polytypo",
        "registry": "PyPI",
        "logo": "assets/polytypo-lockup-stacked.svg",
        "status": (
            "**Status: planned, not yet started.** This document is the specification of the port's "
            "public surface, kept in the spec repository so the API is agreed before any code exists. "
            "No package is published on PyPI."
        ),
        "install": "```bash\npip install polytypo\n```",
        "quickstart": """```python
from polytypo import transform

transform('Is this "polytypo"? - No, it\\'s "polytypo"!', locale="en-US")
# → Is this “polytypo”?—No, it’s “polytypo”!

transform('Ist das "polytypo"?', locale="de")   # de → de-DE
# → Ist das „polytypo“?

transform('Il a dit "bonjour".', locale="fr")
# → Il a dit « bonjour ».
```""",
        "api": """```python
def transform(
    text: str,
    *,
    locale: str,                     # required — unknown locale raises
    mode: str = "text",              # "text" | "html" | "markdown"
    rules: Mapping[str, bool] | None = None,   # opt-out only
) -> str: ...
```""",
        "optout": """```python
transform("1914-1918", locale="en-US", rules={"dashes": False})
# → 1914-1918   — every other rule still runs, in the same order
```""",
        "errors": """```python
from polytypo import PolytypoError

try:
    transform("x", locale="xx")
except PolytypoError as error:
    error.code  # "POLYTYPO_UNKNOWN_LOCALE"
```""",
        "extra": """### Port notes

* Python strings are sequences of code points already — convert once at the boundary and index
  directly; never iterate UTF-8 bytes.
* Use `str.translate`/explicit scanning, not `re`: the spec forbids regex in core rules so that the
  Go port can exist at all.
* No `str.lower()` without an explicit mapping table — locale-dependent case is banned by the spec.""",
    },
    "go": {
        "file": "docs/ports/README.go.md",
        "title": "Go",
        "package": "github.com/polytypo/polytypo-go",
        "registry": "Go modules",
        "logo": "assets/polytypo-lockup-stacked.svg",
        "status": (
            "**Status: planned, not yet started.** This document is the specification of the port's "
            "public surface, kept in the spec repository so the API is agreed before any code exists. "
            "No module is published."
        ),
        "install": "```bash\ngo get github.com/polytypo/polytypo-go\n```",
        "quickstart": """```go
package main

import (
    "fmt"

    polytypo "github.com/polytypo/polytypo-go"
)

func main() {
    out, err := polytypo.Transform(
        `Is this "polytypo"? - No, it's "polytypo"!`,
        polytypo.Options{Locale: "en-US"},
    )
    if err != nil {
        panic(err)
    }
    fmt.Println(out)
    // Is this “polytypo”?—No, it’s “polytypo”!
}
```""",
        "api": """```go
func Transform(input string, opts Options) (string, error)

type Options struct {
    Locale string             // required — unknown locale returns *Error
    Mode   Mode               // ModeText (default), ModeHTML, ModeMarkdown
    Rules  map[RuleID]bool    // opt-out only; false disables
}
```""",
        "optout": """```go
out, err := polytypo.Transform("1914-1918", polytypo.Options{
    Locale: "en-US",
    Rules:  map[polytypo.RuleID]bool{polytypo.RuleDashes: false},
})
// → 1914-1918   — every other rule still runs, in the same order
```""",
        "errors": """```go
_, err := polytypo.Transform("x", polytypo.Options{Locale: "xx"})

var perr *polytypo.Error
if errors.As(err, &perr) {
    _ = perr.Code // "POLYTYPO_UNKNOWN_LOCALE"
}
```""",
        "extra": """### Port notes

* Go is the reason the spec forbids regex in core rules: RE2 has no lookahead, lookbehind or
  backreferences. Rules are a single left-to-right scan over `[]rune`.
* Convert `string` → `[]rune` once on entry and back once on exit. Never index a `string` inside a
  rule — that indexes bytes.
* Never drive the pipeline from a `map`: Go randomises map iteration order. Order comes from
  `spec/rules/order.json`, resolved into a slice at init.
* Locale data is embedded with `go:embed` at build time — no filesystem access at runtime.""",
    },
    "ruby": {
        "file": "docs/ports/README.ruby.md",
        "title": "Ruby",
        "package": "polytypo",
        "registry": "RubyGems",
        "logo": "assets/polytypo-lockup-stacked.svg",
        "status": (
            "**Status: planned, not yet started.** This document is the specification of the port's "
            "public surface, kept in the spec repository so the API is agreed before any code exists. "
            "No gem is published."
        ),
        "install": "```bash\ngem install polytypo\n```",
        "quickstart": """```ruby
require "polytypo"

Polytypo.transform(%q{Is this "polytypo"? - No, it's "polytypo"!}, locale: "en-US")
# => "Is this “polytypo”?—No, it’s “polytypo”!"

Polytypo.transform('Ist das "polytypo"?', locale: "de")   # de → de-DE
# => "Ist das „polytypo“?"

Polytypo.transform('Il a dit "bonjour".', locale: "fr")
# => "Il a dit « bonjour »."
```""",
        "api": """```ruby
Polytypo.transform(input, locale:, mode: :text, rules: {}) # => String

# locale  required — unknown locale raises Polytypo::Error
# mode    :text (default), :html, :markdown
# rules   opt-out only, e.g. { dashes: false }
```""",
        "optout": """```ruby
Polytypo.transform("1914-1918", locale: "en-US", rules: { dashes: false })
# => "1914-1918"   — every other rule still runs, in the same order
```""",
        "errors": """```ruby
begin
  Polytypo.transform("x", locale: "xx")
rescue Polytypo::Error => error
  error.code # => "POLYTYPO_UNKNOWN_LOCALE"
end
```""",
        "extra": """### Port notes

* Force `Encoding::UTF_8` at the boundary and work on `String#each_char` / `codepoints`; a rule must
  never see a byte string.
* `String#downcase` is locale-independent in Ruby but the spec still forbids case folding inside
  rules — compare against the explicit tables instead.
* The gem embeds locale data as generated Ruby constants; nothing is read from `$LOAD_PATH` or disk
  at runtime.""",
    },
    "php": {
        "file": "docs/ports/README.php.md",
        "title": "PHP",
        "package": "polytypo/polytypo",
        "registry": "Packagist",
        "logo": "assets/polytypo-lockup-stacked.svg",
        "status": (
            "**Status: planned, not yet started.** This document is the specification of the port's "
            "public surface, kept in the spec repository so the API is agreed before any code exists. "
            "No package is published on Packagist."
        ),
        "install": "```bash\ncomposer require polytypo/polytypo\n```",
        "quickstart": """```php
<?php
use Polytypo\\Polytypo;

Polytypo::transform('Is this "polytypo"? - No, it\\'s "polytypo"!', ['locale' => 'en-US']);
// → Is this “polytypo”?—No, it’s “polytypo”!

Polytypo::transform('Ist das "polytypo"?', ['locale' => 'de']);   // de → de-DE
// → Ist das „polytypo“?

Polytypo::transform('Il a dit "bonjour".', ['locale' => 'fr']);
// → Il a dit « bonjour ».
```""",
        "api": """```php
Polytypo::transform(string $input, array $options): string

// $options = [
//   'locale' => 'de-DE',        // required — unknown locale throws
//   'mode'   => 'text',         // 'text' | 'html' | 'markdown'
//   'rules'  => ['dashes' => false],  // opt-out only
// ];
```""",
        "optout": """```php
Polytypo::transform('1914-1918', [
    'locale' => 'en-US',
    'rules'  => ['dashes' => false],
]);
// → 1914-1918   — every other rule still runs, in the same order
```""",
        "errors": """```php
use Polytypo\\PolytypoException;

try {
    Polytypo::transform('x', ['locale' => 'xx']);
} catch (PolytypoException $error) {
    $error->errorCode; // 'POLYTYPO_UNKNOWN_LOCALE'
}
```""",
        "extra": """### Port notes

* `mb_*` functions with an explicit `UTF-8` encoding only, and a single conversion to a code-point
  array at the boundary — `strlen`/`substr` are byte operations and will corrupt every locale here.
* `mb_internal_encoding()` is ambient state: never rely on it, always pass the encoding.
* Locale data ships as generated PHP arrays inside the package; nothing is parsed from JSON at
  runtime.
* JoliTypo already solves multilingual microtypography in PHP and solves it well. This port exists so
  that a PHP application and a JS front end produce **byte-identical** output from the same spec
  version — not to replace it.""",
    },
}


TEMPLATE = """<p align="center">
  <img src="{logo}" alt="polytypo" width="260">
</p>

<h1 align="center">polytypo — {title}</h1>

<p align="center">
  Locale-correct quotes, dashes, ellipses, apostrophes, symbols and no-break spaces.<br>
  One spec, five runtimes, byte-identical output.
</p>

---

{status}

Spec version: **{spec}** · locales: **{n_locales}** · rules: **{n_rules}** · {registry_line}

## What it does

{hero}

Every string above is real engine output, generated from `promo/examples.json` — not typed by hand.

## Install

{install}

## Quick start

{quickstart}

## API

{api}

`transform` is **pure**: no filesystem, no network, no clock, no environment, no globals, no
module-level state. Calling it twice with the same arguments returns the same string, and calling it
on its own output is a no-op:

```text
transform(transform(x)) == transform(x)
```

That is a hard invariant, proven by property-based tests, not a hope. A failing idempotency property
is a release blocker.

### Turning a rule off

{optout}

### Errors

{errors}

{errors_table}

## Locales

{locales}

## Rules

{rules}

Rule ids are **public API** — they appear in the `rules` option and in future integration config.
Renaming one is a breaking change. Order comes from `spec/rules/order.json`, never from registration
order and never from map iteration order.

## Examples, by rule

{examples}

## Modes

{modes}

In every mode the output is **the input with a set of disjoint substring replacements applied, and
nothing else**. The parser locates text; it never produces output. That is the only formulation five
different parsers can agree on.

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
"""


def build():
    for key, cfg in LANGS.items():
        registry_line = (
            f"`{cfg['package']}` on {cfg['registry']}."
            if cfg.get("on_registry", True)
            else f"not yet on {cfg['registry']}."
        )
        body = TEMPLATE.format(
            logo=cfg["logo"],
            title=cfg["title"],
            status=cfg["status"],
            spec=SPEC_VERSION,
            n_locales=len(REGISTRY["locales"]),
            n_rules=len(ORDER["rules"]),
            registry_line=registry_line,
            hero=hero_block(),
            install=cfg["install"],
            quickstart=cfg["quickstart"],
            api=cfg["api"],
            optout=cfg["optout"],
            errors=cfg["errors"],
            errors_table=ERRORS,
            locales=locale_table(),
            rules=rules_table(),
            examples=examples_table("en-US", mark_invisible=cfg.get("mark_invisible", False)),
            modes=cfg.get("modes", MODES_GENERIC),
        )
        if cfg.get("extra"):
            body = body.replace("## Conformance", cfg["extra"] + "\n\n## Conformance")
        path = os.path.join(REPO, cfg["file"])
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(body)
        print(f"  {cfg['file']}")


if __name__ == "__main__":
    build()
