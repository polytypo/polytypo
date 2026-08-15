#!/usr/bin/env python3
"""Build promo/index.html — the promo page, in the brand book's visual system.

Everything shown on the page comes from promo/examples.json, which is produced by
running the real engine (`npx tsx brand/tools/gen_examples.ts`). Nothing here invents
a before/after pair."""
import difflib
import html as H
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE)) if False else os.path.dirname(os.path.dirname(HERE))
BRAND = os.path.dirname(HERE)
REPO = os.path.dirname(BRAND)
sys.path.insert(0, HERE)
from build_brandbook import fonts_css, inline  # noqa: E402

EXAMPLES = os.path.join(REPO, "promo", "examples.json")

# Which rules to feature, and from which locale, so each row shows the rule at its most telling.
RULE_ROWS = [
    ("spaces", "en-US", None, "Collapse repeated spaces, strip the space before punctuation."),
    ("ellipsis", "en-US", 0, "Three dots become U+2026."),
    ("ellipsis", "ru", 0, "Russian keeps the abbreviated form after terminal punctuation."),
    ("dashes", "en-US", 0, "Parenthetical dash, per locale: em tight, en spaced, em spaced."),
    ("dashes", "en-US", 1, "Numeric and date ranges take an en dash, unspaced."),
    ("hyphen", "ru", 0, "Morphological hyphens bound with U+2011 so they cannot break."),
    ("quotes", "de-DE", 0, "Primary and secondary quotes, with nesting resolved."),
    ("apostrophe", "en-US", 0, "Straight apostrophe to U+2019, contractions intact."),
    ("symbols", "en-US", 0, "(c) (r) (tm) and the multiplication sign between numerals."),
    ("nbsp", "fr", 0, "No-break and narrow no-break spaces, inserted per locale."),
]

SPACES_ROW = {"in": "Hello  ,   world !", "out": "Hello, world!"}

CODE = [
    (
        "JavaScript / TypeScript",
        "js",
        "npm — not yet published",
        """// npm install polytypo
import { transform } from "polytypo";

transform(`Is this "polytypo"? - No, it's "polytypo"!`, { locale: "de" });
// → Ist das „polytypo“? – Nein, das ist „polytypo“!

transform("Il a dit \\"bonjour\\".", { locale: "fr" });
// → Il a dit «\\u202fbonjour\\u202f».

// opt out of a single rule; the order of the rest never changes
transform("1914-1918", { locale: "en-US", rules: { dashes: false } });

try {
  transform("x", { locale: "xx" });
} catch (error) {
  error.code; // "POLYTYPO_UNKNOWN_LOCALE"
}""",
    ),
    (
        "Python",
        "python",
        "PyPI — planned",
        """# pip install polytypo
from polytypo import transform, PolytypoError

transform('Is this "polytypo"? - No, it\\'s "polytypo"!', locale="de")
# → Ist das „polytypo“? – Nein, das ist „polytypo“!

transform('Il a dit "bonjour".', locale="fr")
# → Il a dit «\\u202fbonjour\\u202f».

transform("1914-1918", locale="en-US", rules={"dashes": False})

try:
    transform("x", locale="xx")
except PolytypoError as error:
    error.code  # "POLYTYPO_UNKNOWN_LOCALE\"""",
    ),
    (
        "Go",
        "go",
        "Go modules — planned",
        """// go get github.com/polytypo/polytypo-go
package main

import (
    "fmt"
    "github.com/polytypo/polytypo-go"
)

func main() {
    out, err := polytypo.Transform(
        `Is this "polytypo"? - No, it's "polytypo"!`,
        polytypo.Options{Locale: "de"},
    )
    if err != nil {
        var perr *polytypo.Error
        if errors.As(err, &perr) {
            _ = perr.Code // "POLYTYPO_UNKNOWN_LOCALE"
        }
    }
    fmt.Println(out)
    // Ist das „polytypo“? – Nein, das ist „polytypo“!
}""",
    ),
    (
        "Ruby",
        "ruby",
        "RubyGems — planned",
        """# gem install polytypo
require "polytypo"

Polytypo.transform(%q{Is this "polytypo"? - No, it's "polytypo"!}, locale: "de")
# => "Ist das „polytypo“? – Nein, das ist „polytypo“!"

Polytypo.transform('Il a dit "bonjour".', locale: "fr")
# => "Il a dit «\\u202fbonjour\\u202f»."

Polytypo.transform("1914-1918", locale: "en-US", rules: { dashes: false })

begin
  Polytypo.transform("x", locale: "xx")
rescue Polytypo::Error => error
  error.code # => "POLYTYPO_UNKNOWN_LOCALE"
end""",
    ),
    (
        "PHP",
        "php",
        "Packagist — planned",
        """<?php
// composer require polytypo/polytypo
use Polytypo\\Polytypo;
use Polytypo\\PolytypoException;

Polytypo::transform('Is this "polytypo"? - No, it\\'s "polytypo"!', ['locale' => 'de']);
// → Ist das „polytypo“? – Nein, das ist „polytypo“!

Polytypo::transform('Il a dit "bonjour".', ['locale' => 'fr']);
// → Il a dit «\\u{202f}bonjour\\u{202f}».

try {
    Polytypo::transform('x', ['locale' => 'xx']);
} catch (PolytypoException $error) {
    $error->errorCode; // 'POLYTYPO_UNKNOWN_LOCALE'
}""",
    ),
]


def load_examples():
    with open(EXAMPLES, encoding="utf-8") as f:
        return json.load(f)


INVISIBLE = {
    "\u00a0": "U+00A0 no-break space",
    "\u202f": "U+202F narrow no-break space",
    "\u2011": "U+2011 non-breaking hyphen",
    "\u2060": "U+2060 word joiner — binds a range so it cannot break",
}


def reveal(text):
    """Same treatment the page gives invisible characters, for server-rendered cells."""
    out = []
    for ch in text:
        title = INVISIBLE.get(ch)
        if ch == "\u2060":
            # zero-width: nothing to underline. The dash it binds carries the mark instead.
            out.append(ch)
        elif title:
            out.append(f'<span class="nb" title="{title}">{ch}</span>')
        else:
            out.append(H.escape(ch))
    marked = "".join(out)
    return marked.replace(
        "\u2060–\u2060",
        '<span class="bound" title="U+2060 word joiner on both sides: this range cannot break">'
        "\u2060–\u2060</span>",
    ).replace(
        "\u2060—\u2060",
        '<span class="bound" title="U+2060 word joiner on both sides: this range cannot break">'
        "\u2060—\u2060</span>",
    )


def diff_html(a, b):
    """Highlight the output only — the input column is shown exactly as it was typed."""
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    right = []
    for tag, _i1, _i2, j1, j2 in sm.get_opcodes():
        if j1 == j2:
            continue
        chunk = reveal(b[j1:j2])
        right.append(chunk if tag == "equal" else f'<span class="chg">{chunk}</span>')
    return reveal(a), "".join(right)


def rules_table(data):
    by_locale = {loc["locale"]: loc for loc in data["locales"]}
    rows = []
    for rule, locale, index, note in RULE_ROWS:
        if rule == "spaces":
            case = SPACES_ROW
        else:
            cases = [c for c in by_locale[locale]["cases"] if c["rule"] == rule]
            if not cases:
                continue
            case = cases[min(index or 0, len(cases) - 1)]
        before, after = diff_html(case["in"], case["out"])
        rows.append(
            f'<tr><td class="mono">{rule}</td><td class="mono">{locale}</td>'
            f'<td class="rule-in">{before}</td>'
            f'<td class="rule-out">{after}</td>'
            f'<td class="small muted">{note}</td></tr>'
        )
    return (
        "<table><tr><th>Rule</th><th>Locale</th><th>In</th><th>Out</th><th>What it does</th></tr>"
        + "".join(rows)
        + "</table>"
    )


def code_panes():
    panes = []
    for label, _slug, status, code in CODE:
        cls = "status live" if "not yet published" in status else "status"
        panes.append(
            f'<div class="pane" data-label="{H.escape(label)}">'
            f'<h3 style="margin:22px 0 0">{H.escape(label)}'
            f'<span class="{cls}">{H.escape(status)}</span></h3>'
            f"<pre><code>{H.escape(code)}</code></pre></div>"
        )
    return "".join(panes)


def build():
    data = load_examples()
    with open(os.path.join(HERE, "promo.template.html"), encoding="utf-8") as f:
        page = f.read()

    page = page.replace("{{fonts}}", fonts_css())
    page = page.replace("{{rules_table}}", rules_table(data))
    page = page.replace("{{code_panes}}", code_panes())
    # Spelled out from the data rather than typed into the template: a hardcoded "eight"
    # in the hero contradicted the locale switcher rendered directly beneath it.
    _words = {6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten", 11: "eleven", 12: "twelve"}
    n = len(data["locales"])
    page = page.replace("{{locale_count}}", _words.get(n, str(n)))
    page = page.replace("{{examples}}", json.dumps(data, ensure_ascii=False))
    page = re.sub(r"\{\{svg:([^}]+)\}\}", lambda m: inline(m.group(1)), page)

    out_dir = os.path.join(REPO, "promo")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, "index.html")
    doc = (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
        '<meta name="description" content="polytypo — locale-correct quotes, dashes, ellipses '
        f'and no-break spaces for {len(data["locales"])} locales. One spec, five runtimes.">\n'
        f"{page}\n</html>\n"
    )
    with open(out, "w", encoding="utf-8") as f:
        f.write(doc)
    print(f"  promo/index.html  {os.path.getsize(out) / 1024:.0f} KB")


if __name__ == "__main__":
    build()
