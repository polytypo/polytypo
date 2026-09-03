#!/usr/bin/env python3
"""Build the promo site — promo/index.html plus promo/{docs,playground,locales,manifesto}/index.html,
served at the directory URLs /, /docs, /playground, /locales, /manifesto — in the brand book's
visual system.

Before/after pairs come from promo/examples.json, produced by running the real engine
(`npx tsx brand/tools/gen_examples.ts`); nothing here invents one. Counts that change with the
spec — locale count, rule count, per-locale fixture totals — are read directly from spec/ on
every build, the same way brand/tools/gen_readmes.py does, so a number on this site cannot go
stale independently of the data it describes.

Shared CSS and client-side JS live in brand/tools/promo/{style.css,site.js} and are copied
verbatim to promo/assets/ — edit them there, never in promo/assets/ directly, or the next
build silently discards the edit."""
import difflib
import html as H
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BRAND = os.path.dirname(HERE)
REPO = os.path.dirname(BRAND)
PROMO_SRC = os.path.join(HERE, "promo")
sys.path.insert(0, HERE)
from build_brandbook import fonts_css, inline  # noqa: E402

EXAMPLES = os.path.join(REPO, "promo", "examples.json")
SPEC = os.path.join(REPO, "spec")
FIXTURES_DIR = os.path.join(SPEC, "fixtures")

with open(os.path.join(SPEC, "rules", "order.json"), encoding="utf-8") as f:
    _ORDER = json.load(f)
RULE_COUNT = len(_ORDER["rules"])


def fixture_count(locale):
    """Live case count for one locale's spec/fixtures/<locale>.json — never hand-maintained."""
    with open(os.path.join(FIXTURES_DIR, f"{locale}.json"), encoding="utf-8") as f:
        return len(json.load(f)["cases"])

# (slug, nav label, body template). The slug is the page's directory under promo/ and its URL
# path — "" is the site root (promo/index.html, served at /), anything else is a directory index
# (promo/docs/index.html, served at /docs). Directory URLs, not .html filenames, so the public
# paths stay clean and stable.
PAGES = [
    ("", "Home", "home.body.html"),
    ("docs", "Docs", "docs.body.html"),
    ("playground", "Playground", "playground.body.html"),
    ("locales", "Locales", "locales.body.html"),
    # Deliberately not in the primary nav (NAV_LINKS' own hardcoded 4-link list, unchanged) — a
    # 5th link there would re-break the Stage-7 fix for the 320px mobile nav, which fits exactly
    # 4 links + the logo on one row. Reachable instead from the home hero's CTA row and the
    # sitewide footer (footer_html).
    ("manifesto", "Manifesto", "manifesto.body.html"),
]

# Depth prefix every link and asset reference on a page is written relative to. Document-relative,
# never root-relative: before a custom domain exists the site is served from
# polytypo.github.io/polytypo/, where an absolute "/docs/" would point outside the site. A page at
# the root resolves "docs/" directly; a page one directory down needs "../docs/".
PAGE_PREFIXES = {"": "", **{slug: "../" for slug, _label, _body in PAGES if slug}}


def page_href(prefix, slug):
    """Document-relative href for a page, from a page whose depth prefix is `prefix`. Trailing
    slash so both python3 -m http.server and GitHub Pages serve the directory index without a
    redirect; the root page is "./" (or "../" from one level down), never an empty href."""
    return f"{prefix}{slug}/" if slug else (prefix or "./")

# Which locales the proof grid renders is NOT decided here — it is read from examples.json's
# `proofLocales` field (single source of truth, written by brand/tools/gen_examples.ts, also
# read directly by tests/promo/proof-grid.test.ts) so the builder can never drift from what was
# actually verified against the real engine. See gen_examples.ts's PROOF_LOCALES/PROOF_INPUT
# comments for why this set and this input were chosen.

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

# label, status, code — used for the "Using it" tabs on Docs, and the JS one doubles as the
# quickstart snippet on Home.
# label, status, line-comment token (for syntax highlighting), code
CODE = [
    (
        "JavaScript / TypeScript",
        "npm — not yet published",
        "//",
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
        "PyPI — planned",
        "#",
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
        "Go modules — planned",
        "//",
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
        "RubyGems — planned",
        "#",
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
        "Packagist — planned",
        "//",
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

NUMBER_WORDS = {6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten", 11: "eleven", 12: "twelve"}


def load_examples():
    with open(EXAMPLES, encoding="utf-8") as f:
        return json.load(f)


INVISIBLE = {
    " ": "U+00A0 no-break space",
    " ": "U+202F narrow no-break space",
    "‑": "U+2011 non-breaking hyphen",
    "⁠": "U+2060 word joiner — binds a range so it cannot break",
}


def reveal(text):
    """Same treatment the page gives invisible characters, for server-rendered cells."""
    out = []
    for ch in text:
        title = INVISIBLE.get(ch)
        if ch == "⁠":
            # zero-width: nothing to underline. The dash it binds carries the mark instead.
            out.append(ch)
        elif title:
            out.append(f'<span class="nb" title="{title}">{ch}</span>')
        else:
            out.append(H.escape(ch))
    marked = "".join(out)
    return marked.replace(
        "⁠–⁠",
        '<span class="bound" title="U+2060 word joiner on both sides: this range cannot break">'
        "⁠–⁠</span>",
    ).replace(
        "⁠—⁠",
        '<span class="bound" title="U+2060 word joiner on both sides: this range cannot break">'
        "⁠—⁠</span>",
    )


def highlight(code, comment_token):
    """Minimal syntax highlighting for a static code sample: string literals and line
    comments only, in source order — everything else keeps the block's plain foreground
    color rather than a wrong guess. Mirrors brand/tools/promo/site.js's client-side
    `highlight()`, used for the playground's dynamically generated call examples; this is
    the server-side twin for content that's static at build time."""
    pattern = re.compile(
        r'"(?:[^"\\]|\\.)*"' + r"|'(?:[^'\\]|\\.)*'" + r"|" + re.escape(comment_token) + r".*$",
        re.MULTILINE,
    )
    out = []
    last = 0
    for m in pattern.finditer(code):
        out.append(H.escape(code[last : m.start()]))
        text = m.group(0)
        cls = "tok-com" if text.startswith(comment_token) else "tok-str"
        out.append(f'<span class="{cls}">{H.escape(text)}</span>')
        last = m.end()
    out.append(H.escape(code[last:]))
    return "".join(out)


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
    for label, status, comment_token, code in CODE:
        cls = "status live" if "not yet published" in status else "status"
        panes.append(
            f'<div class="pane" data-label="{H.escape(label)}">'
            f'<h3 style="margin:22px 0 0">{H.escape(label)}'
            f'<span class="{cls}">{H.escape(status)}</span></h3>'
            f"<pre><code>{highlight(code, comment_token)}</code></pre></div>"
        )
    return "".join(panes)


# label, code — all three are JS, shown in "Wiring it into a build step" on Docs.
BUILD_CODE = [
    (
        "Markdown / MDX pipeline",
        """// e.g. a remark/unified plugin, or any step that reads .md/.mdx files
import { readFile, writeFile } from "node:fs/promises";
import { transform } from "polytypo";

const path = "content/posts/hello-world.mdx";
const source = await readFile(path, "utf8");
const dialect = path.endsWith(".mdx") ? "mdx" : "commonmark";

await writeFile(path, transform(source, { locale: "en-US", mode: "markdown", dialect }));
// transform(transform(x)) === transform(x) — safe to run on every build, not just once.""",
    ),
    (
        "CMS field on save",
        """// wherever a rich-text field is persisted — a webhook handler, a save hook
import { transform } from "polytypo";

function sanitizeBody(html, locale) {
  // html parsing is recovery-based and never throws POLYTYPO_MALFORMED_INPUT — that code is
  // reachable only for markdown's mdx dialect, which embeds JavaScript. Nothing to catch here.
  return transform(html, { locale, mode: "html" });
}""",
    ),
    (
        "React / templating",
        """// call it wherever untrusted or imported copy reaches a render — not on every keystroke
import { transform } from "polytypo";

function Byline({ text, locale }) {
  return <p>{transform(text, { locale })}</p>;
}""",
    ),
]


def build_panes():
    panes = []
    for label, code in BUILD_CODE:
        panes.append(
            f'<div class="pane" data-label="{H.escape(label)}">'
            f"<pre><code>{highlight(code, '//')}</code></pre></div>"
        )
    return "".join(panes)


def locale_card(loc):
    before, after = diff_html(loc["hero"]["in"], loc["hero"]["out"])
    return (
        '<div class="card"><div class="lang">'
        f'{H.escape(loc["name"])} · {H.escape(loc["locale"])}</div>'
        f'<div class="pair"><div class="in">{before}</div>'
        f'<div class="out">{after}</div></div></div>'
    )


def locale_cards(data, only=None):
    locales = data["locales"]
    if only:
        by_code = {loc["locale"]: loc for loc in locales}
        locales = [by_code[code] for code in only if code in by_code]
    return "".join(locale_card(loc) for loc in locales)


def proof_grid(data):
    """The home page's and manifesto's "not one universal style" evidence: the SAME input string
    (examples.json's generated `proof` field — one PROOF_INPUT run through every locale by the
    real engine in gen_examples.ts) rendered for each locale in data["proofLocales"] (the single
    source of truth for this selection, also read directly by tests/promo/proof-grid.test.ts),
    same card markup as locale_card() so it fits the existing visual system without new CSS.
    Each card carries data-locale so a test can parse the ACTUAL generated HTML rather than
    trust any independently-declared list of what should be there."""
    by_locale = {loc["locale"]: loc for loc in data["locales"]}
    cards = []
    for code in data["proofLocales"]:
        loc = by_locale[code]
        case = loc["proof"]
        before, after = diff_html(case["in"], case["out"])
        cards.append(
            f'<div class="card" data-locale="{H.escape(code)}"><div class="lang">'
            f'{H.escape(loc["name"])} · {H.escape(code)}</div>'
            f'<div class="pair"><div class="in">{before}</div>'
            f'<div class="out">{after}</div></div></div>'
        )
    return "".join(cards)


def proof_legend(data):
    """Always-visible (not hover-only) explanation of the invisible characters actually present
    in the proof grid's rendered outputs — built from the real generated data so it can never
    describe a character that isn't there. Order follows INVISIBLE's iteration (code point
    order in that dict's own definition), so the legend is deterministic across builds."""
    by_locale = {loc["locale"]: loc for loc in data["locales"]}
    outputs = "".join(by_locale[code]["proof"]["out"] for code in data["proofLocales"])
    present = [(ch, title) for ch, title in INVISIBLE.items() if ch in outputs]
    if not present:
        return ""
    items = "".join(f"<li><span class=\"mono\">{H.escape(ch)}</span> — {H.escape(title)}</li>" for ch, title in present)
    return (
        '<div class="small muted proof-legend" style="max-width: 60ch">'
        f"Invisible characters in these outputs (always shown here — tooltips above are an "
        f"optional extra, not required to understand them):<ul>{items}</ul></div>"
    )


def status_table(data):
    n = len(data["locales"])
    rows = [
        ("Spec — locale data, rule semantics, fixtures", f'{data["spec"]}, {n} locales, {RULE_COUNT} rules, in the repository'),
        (
            "JavaScript / TypeScript engine — <code>text</code>, <code>html</code>, <code>markdown</code> modes",
            "Implemented, passing the conformance suite (spec/rules/modes.md)",
        ),
        ("npm package", "Not published yet — planned API only, no installable package"),
        ("Python, Go, Ruby, PHP ports", "Planned APIs, no installable package for any of them. No port starts before the JS package clears its own dogfooding gate"),
        ("CMS plugins, hosted API, CLI", "Not in v1, by decision"),
    ]
    body = "".join(f"<tr><td>{thing}</td><td>{state}</td></tr>" for thing, state in rows)
    return f"<table><tr><th>Thing</th><th>State</th></tr>{body}</table>"


NAV_LINKS = [("", "Home"), ("docs", "Docs"), ("playground", "Playground"), ("locales", "Locales")]


def nav_html(active_slug, prefix):
    links = "".join(
        f'<a href="{page_href(prefix, slug)}"'
        f'{" aria-current=\"page\"" if slug == active_slug else ""}>{label}</a>'
        for slug, label in NAV_LINKS
    )
    mark = inline("logo/polytypo-mark-current.svg")
    return (
        '<nav class="site-nav"><div class="wrap">'
        f'<a class="brand" href="{page_href(prefix, "")}">{mark}polytypo</a>'
        f'<div class="links">{links}</div>'
        "</div></nav>"
    )


def footer_html(data, prefix):
    return (
        "<footer><div class=\"wrap\"><p>"
        f'polytypo · spec {data["spec"]} · MIT for the code, separate terms for the brand assets · '
        "every before/after typography example on this site is generated with the engine.</p>"
        f'<p><a href="{page_href(prefix, "manifesto")}">Manifesto</a></p>'
        '<p>Created by <a href="https://iurii.rogulia.fi" rel="author">Iurii Rogulia</a>.</p>'
        "</div></footer>"
    )


def build():
    data = load_examples()
    n = len(data["locales"])
    locale_count_word = NUMBER_WORDS.get(n, str(n))
    rules_count_word = NUMBER_WORDS.get(RULE_COUNT, str(RULE_COUNT))

    out_dir = os.path.join(REPO, "promo")
    assets_dir = os.path.join(out_dir, "assets")
    os.makedirs(assets_dir, exist_ok=True)
    shutil.copyfile(os.path.join(PROMO_SRC, "style.css"), os.path.join(assets_dir, "style.css"))
    shutil.copyfile(os.path.join(PROMO_SRC, "site.js"), os.path.join(assets_dir, "site.js"))
    # Shared, cacheable, linked (not inlined) — so nav between the five pages doesn't re-download
    # ~170 KB of embedded woff2 on every click.
    with open(os.path.join(assets_dir, "fonts.css"), "w", encoding="utf-8") as f:
        f.write(fonts_css())

    replacements = {
        "{{rules_table}}": rules_table(data),
        "{{code_panes}}": code_panes(),
        "{{build_panes}}": build_panes(),
        "{{locale_count}}": locale_count_word,
        "{{Locale_count}}": locale_count_word.capitalize(),
        "{{rules_count}}": rules_count_word,
        "{{Rules_count}}": rules_count_word.capitalize(),
        "{{spec_version}}": data["spec"],
        "{{status_table}}": status_table(data),
        "{{home_locale_cards}}": locale_cards(data, only=["en-US", "de-DE", "fr", "ru"]),
        "{{locale_cards}}": locale_cards(data),
        "{{proof_grid}}": proof_grid(data),
        "{{proof_legend}}": proof_legend(data),
    }
    # Per-locale fixture totals — read live from spec/fixtures/, never hand-maintained, so the
    # coverage table on the Locales page cannot drift from the conformance suite it describes.
    for loc in data["locales"]:
        code = loc["locale"]
        replacements[f"{{{{fixtures:{code}}}}}"] = str(fixture_count(code))

    for slug, title, body_file in PAGES:
        prefix = PAGE_PREFIXES[slug]
        with open(os.path.join(PROMO_SRC, body_file), encoding="utf-8") as f:
            body = f.read()
        for key, val in replacements.items():
            body = body.replace(key, val)
        # Every cross-page href in a body template is written "{{prefix}}docs/" so one token
        # carries the page's depth; the root page substitutes "" and a nested page "../".
        body = body.replace("{{prefix}}", prefix)
        body = re.sub(r"\{\{svg:([^}]+)\}\}", lambda m: inline(m.group(1)), body)

        page_title = "polytypo" if title == "Home" else f"polytypo — {title}"
        doc = (
            "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
            '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
            f'<meta name="description" content="polytypo — locale-correct quotes, dashes, '
            f'ellipses and no-break spaces for {n} locales. One runtime today. One portable '
            f'spec designed for five.">\n'
            f'<link rel="stylesheet" href="{prefix}assets/fonts.css">\n'
            f'<link rel="stylesheet" href="{prefix}assets/style.css">\n'
            f"<title>{H.escape(page_title)}</title>\n"
            "</head>\n<body>\n"
            f"{nav_html(slug, prefix)}\n"
            f'<div class="wrap">\n{body}\n{footer_html(data, prefix)}\n</div>\n'
            f'<script src="{prefix}assets/site.js"></script>\n'
        )

        if slug == "playground":
            doc += build_playground_script(data, prefix)
        else:
            doc += (
                "<script>\n"
                'Polytypo.bootTabs("lang-tabs", "lang-panes");\n'
                'Polytypo.bootTabs("build-tabs", "build-panes");\n'
                "</script>\n"
            )

        doc += "</body>\n</html>\n"

        rel_path = os.path.join(slug, "index.html") if slug else "index.html"
        out_path = os.path.join(out_dir, rel_path)
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(doc)
        print(f"  promo/{rel_path.replace(os.sep, '/')}  {os.path.getsize(out_path) / 1024:.0f} KB")


def build_playground_script(data, prefix):
    payload = json.dumps(data, ensure_ascii=False)
    return f"""<script src="{prefix}vendor/polytypo.browser.js"></script>
<script>
const DATA = {payload};
(function playground() {{
  const engine = window.PolytypoBrowser;
  const {{
    mark, diff, paint, highlight, bootTabs, summarizeChange, summarizeError,
    encodePermalinkFragment, decodePermalinkFragment, copyStatusText, permalinkStatusText,
    shareStatusText, buildPermalinkUrl, stripPermalinkFragment, validateRestoredState,
    MAX_PERMALINK_LENGTH,
  }} = window.Polytypo;
  const LOCALES = DATA.locales.map((l) => [l.locale, l.name]);
  const DIFF_CAP = 4000; // above this, skip character-level highlighting (O(n*m) LCS)

  const $locale = document.getElementById("pg-locale");
  const $mode = document.getElementById("pg-mode");
  const $dialectWrap = document.getElementById("pg-dialect-wrap");
  const $dialect = document.getElementById("pg-dialect");
  const $input = document.getElementById("pg-input");
  const $output = document.getElementById("pg-output");
  const $count = document.getElementById("pg-count");
  const $foot = document.getElementById("pg-foot");
  const $permalinkNotice = document.getElementById("pg-permalink-notice");
  const $copyOutput = document.getElementById("pg-copy-output");
  const $copyLink = document.getElementById("pg-copy-link");
  const $share = document.getElementById("pg-share");
  const $actionStatus = document.getElementById("pg-action-status");

  for (const [code, name] of LOCALES) {{
    const o = document.createElement("option");
    o.value = code; o.textContent = code + " — " + name;
    $locale.appendChild(o);
  }}

  const FALLBACK_SAMPLE =
    `Is this "polytypo"? - No, it's "polytypo"! She said, "He replied 'never' twice"... ` +
    `The release - all 5 km of it - covers 1914-1918. Copyright (c) 2026, at 1920x1080.`;

  function defaultFor(code) {{
    const e = DATA.locales.find((l) => l.locale === code);
    return e ? e.hero.in : FALLBACK_SAMPLE;
  }}

  let lastDefault = defaultFor($locale.value);
  $input.value = lastDefault;

  if (!engine) {{
    $output.classList.add("error");
    $output.textContent =
      "The engine bundle (promo/vendor/polytypo.browser.js) failed to load — nothing else on " +
      "this page depends on it, but the playground does. Run npm run gen:promo-bundle.";
    $foot.textContent = summarizeError("PolytypoEngineMissing");
    return;
  }}

  // Fix #4 (stale-permalink invalidation): once the address bar's hash was set by either a
  // restore-on-load below or a later "Copy Link" click, it must be removed the FIRST time the
  // user changes state afterward (input/locale/mode/dialect) — and only once, not on every
  // keystroke. `hashArmed` tracks whether there is currently a hash to invalidate;
  // `clearStaleFragmentOnce()` is the single place that does it, called from every state-change
  // handler below, and it is idempotent per arming (checks-then-clears the flag).
  let hashArmed = location.hash.length > 1;
  function clearStaleFragmentOnce() {{
    if (!hashArmed) return;
    hashArmed = false;
    history.replaceState(null, "", stripPermalinkFragment(location.href));
  }}

  // Restore playground state from a "Copy Link" permalink, if the page was opened with one.
  // Any validation failure (malformed encoding, unknown version, oversized fragment, a
  // locale/mode/dialect this build doesn't actually offer, or — fix #5 — a non-markdown mode
  // paired with a non-empty dialect) falls back to the normal default example rather than
  // partially applying untrusted state. decodePermalinkFragment only checks shape/type;
  // validateRestoredState (shared with the unit tests in tests/promo/permalink.test.ts) is what
  // confirms the decoded values are ones this page's own <select> option lists actually support,
  // and that mode/dialect form a sensible pair — REQUIRING dialect === "" outside markdown mode
  // rather than merely ignoring a stray value, so e.g. [1, "en-US", "text", "mdx", "hello"] is
  // rejected outright instead of silently dropping the "mdx".
  {{
    const fragment = location.hash.slice(1);
    if (fragment) {{
      const decoded = decodePermalinkFragment(fragment);
      let restored = false;
      if (decoded.ok) {{
        const options = {{
          locales: LOCALES.map(([code]) => code),
          modes: [...$mode.options].map((o) => o.value),
          dialects: [...$dialect.options].map((o) => o.value),
        }};
        if (validateRestoredState(decoded.state, options)) {{
          const {{ locale, mode, dialect, input }} = decoded.state;
          $locale.value = locale;
          $mode.value = mode;
          if (mode === "markdown") $dialect.value = dialect;
          $input.value = input;
          lastDefault = defaultFor(locale);
          restored = true;
        }}
      }}
      if (!restored) {{
        $permalinkNotice.hidden = false;
        $permalinkNotice.textContent =
          "This link's shared state could not be restored — showing the default example instead.";
        // hashArmed is already true from the initial `location.hash.length > 1` check above:
        // even an unrestorable hash is still sitting in the address bar and is just as
        // misleading as a stale one, so it gets the same one-shot removal on the next edit.
      }}
    }}
  }}

  let timer = null;
  const run = () => {{ clearTimeout(timer); timer = setTimeout(render, 120); }};

  const $callJs = document.getElementById("call-code-js");
  const $callPy = document.getElementById("call-code-py");
  const $callGo = document.getElementById("call-code-go");
  const $callRb = document.getElementById("call-code-rb");
  const $callPhp = document.getElementById("call-code-php");

  const strLit = (s) => JSON.stringify(s);
  const rubyStrLit = (s) => strLit(s).replace(/#\\{{/g, "\\\\#{{");
  const phpStrLit = (s) => "'" + s.replace(/\\\\/g, "\\\\\\\\").replace(/'/g, "\\\\'") + "'";

  const LOCALE_LIST = LOCALES.map(([code]) => code).join(", ");

  function renderCallCode(options) {{
    const showDialect = options.mode === "markdown";
    const locale = strLit(options.locale);
    const mode = strLit(options.mode);
    const dialect = strLit(options.dialect || "commonmark");

    const jsCode =
      `import {{ transform }} from "polytypo";\\n\\n` +
      `transform(\\n` +
      `  input, // your text, type: string\\n` +
      `  {{\\n` +
      `    locale: ${{locale}}, // required, type: string — one of: ${{LOCALE_LIST}}\\n` +
      `    mode: ${{mode}}, // type: string, default: "text" — "text" | "html" | "markdown"\\n` +
      (showDialect
        ? `    dialect: ${{dialect}}, // type: string, required because mode is "markdown" — "commonmark" | "mdx"\\n`
        : `    // dialect: "commonmark", // required only when mode is "markdown"; ignored otherwise\\n`) +
      `  }},\\n` +
      `);`;
    $callJs.innerHTML = highlight(jsCode, "//");

    const pyCode =
      `from polytypo import transform\\n\\n` +
      `transform(\\n` +
      `    input,  # your text, type: str\\n` +
      `    locale=${{locale}},  # required, type: str — one of: ${{LOCALE_LIST}}\\n` +
      `    mode=${{mode}},  # type: str, default: "text" — "text" | "html" | "markdown"\\n` +
      (showDialect
        ? `    dialect=${{dialect}},  # type: str, required because mode is "markdown" — "commonmark" | "mdx"\\n`
        : `    # dialect="commonmark",  # required only when mode is "markdown"; ignored otherwise\\n`) +
      `)`;
    $callPy.innerHTML = highlight(pyCode, "#");

    const goCode =
      `out, err := polytypo.Transform(\\n` +
      `    input, // your text, type: string\\n` +
      `    polytypo.Options{{\\n` +
      `        Locale:  ${{locale}}, // required, type: string — one of: ${{LOCALE_LIST}}\\n` +
      `        Mode:    ${{mode}}, // type: string, default: "text" — "text" | "html" | "markdown"\\n` +
      (showDialect
        ? `        Dialect: ${{dialect}}, // type: string, required because Mode is "markdown" — "commonmark" | "mdx"\\n`
        : `        // Dialect: "commonmark", // required only when Mode is "markdown"; ignored otherwise\\n`) +
      `    }},\\n` +
      `)`;
    $callGo.innerHTML = highlight(goCode, "//");

    const rbCode =
      `require "polytypo"\\n\\n` +
      `Polytypo.transform(\\n` +
      `  input, # your text, type: String\\n` +
      `  locale: ${{rubyStrLit(options.locale)}}, # required, type: String — one of: ${{LOCALE_LIST}}\\n` +
      `  mode: ${{rubyStrLit(options.mode)}}, # type: String, default: "text" — "text" | "html" | "markdown"\\n` +
      (showDialect
        ? `  dialect: ${{rubyStrLit(options.dialect)}}, # type: String, required because mode is "markdown" — "commonmark" | "mdx"\\n`
        : `  # dialect: "commonmark", # required only when mode is "markdown"; ignored otherwise\\n`) +
      `)`;
    $callRb.innerHTML = highlight(rbCode, "#");

    const phpCode =
      `Polytypo::transform(\\n` +
      `    $input, // your text, type: string\\n` +
      `    [\\n` +
      `        'locale' => ${{phpStrLit(options.locale)}}, // required, type: string — one of: ${{LOCALE_LIST}}\\n` +
      `        'mode' => ${{phpStrLit(options.mode)}}, // type: string, default: 'text' — 'text' | 'html' | 'markdown'\\n` +
      (showDialect
        ? `        'dialect' => ${{phpStrLit(options.dialect)}}, // type: string, required because mode is 'markdown' — 'commonmark' | 'mdx'\\n`
        : `        // 'dialect' => 'commonmark', // required only when mode is 'markdown'; ignored otherwise\\n`) +
      `    ],\\n` +
      `);`;
    $callPhp.innerHTML = highlight(phpCode, "//");
  }}

  function clearCallCode() {{
    for (const el of [$callJs, $callPy, $callGo, $callRb, $callPhp]) el.textContent = "";
  }}

  function render() {{
    const text = $input.value;
    const n = text.length;
    $count.textContent = n ? n.toLocaleString("en-US") + " chars" : "";
    $dialectWrap.hidden = $mode.value !== "markdown";

    if (!text) {{
      $output.classList.remove("error");
      $output.innerHTML = "";
      $foot.textContent = "";
      clearCallCode();
      return;
    }}

    const options = {{ locale: $locale.value, mode: $mode.value }};
    if ($mode.value === "markdown") options.dialect = $dialect.value;

    let out;
    try {{
      out = engine.transform(text, options);
    }} catch (error) {{
      $output.classList.add("error");
      const code = error && error.code ? error.code : "Error";
      $output.textContent = code + ": " + (error && error.message ? error.message : String(error));
      $foot.textContent = summarizeError(code);
      clearCallCode();
      return;
    }}

    renderCallCode(options);
    $output.classList.remove("error");
    if (n <= DIFF_CAP) {{
      const segments = diff([...text], [...out]);
      $output.innerHTML = paint(segments);
      $foot.textContent =
        $locale.value + " · " + $mode.value + " · " + summarizeChange(text, out, segments);
    }} else {{
      $output.innerHTML = mark(out);
      $foot.textContent =
        $locale.value + " · " + $mode.value + " · " + n.toLocaleString("en-US") +
        " chars — change-highlighting skipped above " + DIFF_CAP.toLocaleString("en-US") + " chars";
    }}
  }}

  async function copyText(text) {{
    try {{
      await navigator.clipboard.writeText(text);
      return true;
    }} catch {{
      return false;
    }}
  }}

  function buildPermalink() {{
    const encoded = encodePermalinkFragment({{
      locale: $locale.value,
      mode: $mode.value,
      dialect: $mode.value === "markdown" ? $dialect.value : "",
      input: $input.value,
    }});
    // buildPermalinkUrl uses the URL API against the CURRENT full href — not
    // `location.origin + location.pathname` string concatenation, which breaks under file://
    // (location.origin is the string "null" there). See tests/promo/permalink.test.ts.
    return {{ encoded, url: buildPermalinkUrl(location.href, encoded) }};
  }}

  $copyOutput.addEventListener("click", async () => {{
    const text = $output.textContent;
    if (!text) {{
      $actionStatus.textContent = "Nothing to copy yet.";
      return;
    }}
    const ok = await copyText(text);
    $actionStatus.textContent = copyStatusText("Output", ok);
  }});

  $copyLink.addEventListener("click", async () => {{
    const {{ encoded, url }} = buildPermalink();
    if (encoded.length > MAX_PERMALINK_LENGTH) {{
      // Oversized state must not touch the address bar at all — checked, and returns, before
      // any history mutation.
      $actionStatus.textContent = permalinkStatusText("too-long");
      return;
    }}
    // Fix #3 (race condition): the address bar is updated SYNCHRONOUSLY, before awaiting
    // Clipboard — not after. `navigator.clipboard.writeText()` can stay pending for a while (a
    // real permission prompt, a slow platform call), and the address-bar fallback this promises
    // (fix #3 of the previous pass) has to already be true DURING that window, not only once the
    // promise settles. Doing this after the await also raced the stale-fragment-invalidation
    // logic below: an edit made while Clipboard was still pending could have its "clear the
    // stale hash" run BEFORE this handler's own (delayed) history.replaceState, so the edit's
    // clear would be immediately undone by a hash that was already stale the moment it landed.
    // Reusing `url` (built via buildPermalinkUrl, not string concatenation) as the
    // history.replaceState target keeps the copied string and the address-bar string
    // byte-identical for https/localhost/query-string/file:// alike.
    history.replaceState(null, "", url);
    hashArmed = true; // re-arm: the next edit should invalidate THIS fresh fragment, once.
    const ok = await copyText(url);
    // Nothing below this line touches history/hashArmed — by the time this await resolves, the
    // user may already have edited state and cleared the fragment (clearStaleFragmentOnce()),
    // and this handler must not re-apply the stale `url` captured before the await.
    $actionStatus.textContent = permalinkStatusText(ok ? "copied" : "clipboard-unavailable");
  }});

  // Progressive enhancement only — every action above already works without it.
  if (navigator.share) {{
    $share.hidden = false;
    $share.addEventListener("click", async () => {{
      const {{ encoded, url }} = buildPermalink();
      if (encoded.length > MAX_PERMALINK_LENGTH) {{
        $actionStatus.textContent = permalinkStatusText("too-long");
        return;
      }}
      try {{
        await navigator.share({{ url, title: "polytypo playground" }});
        $actionStatus.textContent = shareStatusText("shared");
      }} catch (error) {{
        // AbortError: the user dismissed the share sheet — reported neutrally, not as a
        // failure. Anything else is a real API failure and must be visible, not silent.
        $actionStatus.textContent = shareStatusText(
          error && error.name === "AbortError" ? "cancelled" : "failed",
        );
      }}
    }});
  }}

  $locale.addEventListener("change", () => {{
    clearStaleFragmentOnce();
    if ($input.value === lastDefault) {{
      lastDefault = defaultFor($locale.value);
      $input.value = lastDefault;
    }}
    render();
  }});
  $mode.addEventListener("change", () => {{
    clearStaleFragmentOnce();
    render();
  }});
  $dialect.addEventListener("change", () => {{
    clearStaleFragmentOnce();
    render();
  }});
  $input.addEventListener("input", () => {{
    // Cleared here, in the raw event handler — not inside run()'s 120ms-debounced render() —
    // so the stale fragment is gone on the FIRST keystroke, not 120ms after the last one.
    clearStaleFragmentOnce();
    run();
  }});
  bootTabs("call-tabs", "call-panes");
  render();
}})();
</script>
"""


if __name__ == "__main__":
    build()
