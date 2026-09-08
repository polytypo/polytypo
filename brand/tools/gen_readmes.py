#!/usr/bin/env python3
"""Generate the repository's own README.md — the spec and product, not any one runtime's
install/API surface. Each runtime gets its own repository (github.com/polytypo/polytypo-js,
-python, -go, -ruby, -php) added one at a time as it actually exists; this generator does not
speak for runtimes that have no repository yet, and carries no per-language docs of its own.

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
# spec/VERSION is the single source of truth for the global spec version (docs/ARCHITECTURE.md).
# order.json and registry.json carry their own "spec" fields for other purposes; neither is the
# global version, and scripts/validate-spec.mjs asserts they stay in sync with spec/VERSION.
with open(os.path.join(SPEC, "VERSION"), encoding="utf-8") as f:
    SPEC_VERSION = f.read().strip()

LOCALE_DATA = {}
for code in REGISTRY["locales"]:
    with open(os.path.join(SPEC, "locales", f"{code}.json"), encoding="utf-8") as f:
        LOCALE_DATA[code] = json.load(f)

HERO = {loc["locale"]: loc for loc in EXAMPLES["locales"]}

DASH_WORDS = {
    "em-tight": "em dash, unspaced",
    "em-spaced": "em dash, spaced",
    "en-tight": "en dash, unspaced",
    "en-spaced": "en dash, spaced",
    "none": "unchanged",
}


# --------------------------------------------------------------- shared blocks
PACKAGE_HOST_LABELS = [
    ("npmjs.com", "npm"),
    ("pypi.org", "PyPI"),
    ("pkg.go.dev", "pkg.go.dev"),
    ("rubygems.org", "RubyGems"),
    ("packagist.org", "Packagist"),
]


def package_host_label(url):
    for host, label in PACKAGE_HOST_LABELS:
        if host in url:
            return label
    return "package"


# One version-badge shield per registry, keyed by the same host label package_host_label()
# returns — each registry's badge URL shape is genuinely different (Go's is hosted by pkg.go.dev
# itself, not shields.io; RubyGems/npm/PyPI/Packagist each use a different img.shields.io path
# segment), so this is the one place that stays hand-written; which *runtimes* get a badge is
# still driven by conformance-status.json, not by this dict.
PACKAGE_BADGES = {
    "npm": lambda url, name: f'<img src="https://img.shields.io/npm/v/{name}.svg" alt="npm version">',
    "PyPI": lambda url, name: f'<img src="https://img.shields.io/pypi/v/{name}.svg" alt="PyPI version">',
    "pkg.go.dev": lambda url, name: f'<img src="https://pkg.go.dev/badge/{name}.svg" alt="Go Reference">',
    "RubyGems": lambda url, name: f'<img src="https://img.shields.io/gem/v/{name}.svg" alt="Gem version">',
    "Packagist": lambda url, name: f'<img src="https://img.shields.io/packagist/v/{name}.svg" alt="Packagist version">',
}


def package_badges_row():
    with open(os.path.join(REPO, "scripts", "conformance-status.json"), encoding="utf-8") as f:
        status = json.load(f)
    lines = []
    for rt in status["runtimes"]:
        label = package_host_label(rt["package"])
        badge_fn = PACKAGE_BADGES.get(label)
        if badge_fn is None:
            continue
        if label == "pkg.go.dev":
            name = rt["package"].split("pkg.go.dev/", 1)[-1].rstrip("/")
        elif label == "Packagist":
            name = rt["package"].split("packagist.org/packages/", 1)[-1].rstrip("/")
        else:
            name = rt["package"].rstrip("/").rsplit("/", 1)[-1]
        lines.append(f'  <a href="{rt["package"]}">{badge_fn(rt["package"], name)}</a>')
    return "\n".join(lines)


def implementations_table():
    # Driven by scripts/conformance-status.json — the same file that gates a runtime's
    # spec/CONFORMANCE.md row — so a shipped runtime can't go missing from this table, and an
    # unshipped one can't appear in it, by construction rather than by remembering to update prose.
    with open(os.path.join(REPO, "scripts", "conformance-status.json"), encoding="utf-8") as f:
        status = json.load(f)
    rows = ["| Runtime | Repository | Package |", "| --- | --- | --- |"]
    for rt in status["runtimes"]:
        repo_name = rt["repo"].rstrip("/").rsplit("/", 1)[-1]
        package_name = rt["package"].rstrip("/").rsplit("/", 1)[-1]
        rows.append(
            f"| {rt['name']} | [`{repo_name}`]({rt['repo']}) | "
            f"[`{package_name}`]({rt['package']}) ({package_host_label(rt['package'])}) |"
        )
    return "\n".join(rows)


def hero_block():
    # A table, not a fenced code block: GitHub's Markdown renderer wraps table cells but never
    # wraps a code block's long lines, so a plain-text rendering forces a horizontal scrollbar on
    # every row here — exactly the sentence whose typography is the entire point, made harder to
    # read on the one page most visitors see first. One input, one locale per row, in
    # spec/locales/registry.json's own order (REGISTRY["locales"]) rather than a hand-picked
    # subset, so a locale can't silently go missing from this table as more are added.
    en = HERO["en-US"]
    rows = ["| Locale | Output |", "| --- | --- |"]
    for code in REGISTRY["locales"]:
        rows.append(f"| `{code}` | {HERO[code]['hero']['out']} |")
    table = "\n".join(rows)
    return f"**Input**\n\n> {en['hero']['in']}\n\n{table}"


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
        out = c["out"].replace(" ", "⍽") if mark_invisible else c["out"]
        rows.append(f"| `{c['rule']}` | `{c['in']}` | {out} |")
    table = "\n".join(rows)
    if not mark_invisible:
        return table
    return table + "\n\n" + NBSP_NOTE


NBSP_NOTE = """**⍽ is not in the output — it marks U+00A0 NO-BREAK SPACE**, which is otherwise indistinguishable
from an ordinary space on this page. The `nbsp` rule's entire job is invisible, which is exactly why
`spec/fixtures/` is mirrored by a CI-generated escaped `\\uXXXX` file: a diff full of unannotated
U+00A0 and U+202F cannot be reviewed by a human."""


MODES = """| Mode | What it processes | Status |
| --- | --- | --- |
| `text` | The whole string | Implemented |
| `html` | Text nodes only; skips `code`, `pre`, `kbd`, `samp`, `var`, `script`, `style`, `textarea`, all attributes and existing entities | Implemented |
| `markdown` | Prose only; skips code spans, fenced blocks, link destinations, autolinks | Implemented (CommonMark; MDX is JS-only) |"""


TEMPLATE = """<p align="center">
  <img src="{logo}" alt="polytypo" width="260">
</p>

<h1 align="center">polytypo</h1>

<p align="center">
  <a href="https://github.com/polytypo/polytypo/actions/workflows/ci.yml"><img src="https://github.com/polytypo/polytypo/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
{badges}
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
</p>

<p align="center">
  Locale-correct quotes, dashes, ellipses, apostrophes, symbols and no-break spaces —<br>
  one portable spec, designed for byte-identical output across runtimes.
</p>

<p align="center">
  <strong>Try it live, no install: <a href="https://polytypo.dev/">polytypo.dev</a></strong>
</p>

---

Spec version: **{spec_version}** · locales: **{n_locales}** · rules: **{n_rules}**.

## Implementations

{implementations}

## What it does

{hero}

Every string above is real engine output, generated from `promo/examples.json` — not typed by hand.

## Locales

{locales}

## Rules

{rules}

Rule ids are **public API**. Renaming one is a breaking change. Order comes from
`spec/rules/order.json`, never registration order and never map iteration order.

## Examples, by rule

{examples}

## Modes

{modes}

In every mode the output is **the input with a set of disjoint substring replacements applied, and
nothing else**. The parser locates text; it never produces output.

## Conformance

An implementation is polytypo **if and only if** it passes the conformance suite for the spec version
it claims. The suite lives in `spec/fixtures/<locale>.json` as flat `in`/`out` pairs written with
literal characters, mirrored by a CI-generated escaped file so that a diff of an invisible U+202F is
reviewable by a human.

Every fixture is also an idempotency case: the runner asserts `transform(out) == out`. Cases are
tagged with a rule id, so a runtime can report partial conformance honestly instead of claiming all
of it.

## Contributing

A behaviour change is a **spec change first, code second**.

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
    body = TEMPLATE.format(
        logo="brand/logo/polytypo-lockup-stacked.svg",
        spec_version=SPEC_VERSION,
        n_locales=len(REGISTRY["locales"]),
        n_rules=len(ORDER["rules"]),
        badges=package_badges_row(),
        implementations=implementations_table(),
        hero=hero_block(),
        locales=locale_table(),
        rules=rules_table(),
        examples=examples_table("en-US", mark_invisible=True),
        modes=MODES,
    )
    path = os.path.join(REPO, "README.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(body)
    print("  README.md")


if __name__ == "__main__":
    build()
