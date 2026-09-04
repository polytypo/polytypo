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

# brand/favicon/'s exact committed contents (brand/README.md documents this set); listed here
# rather than globbed so an accidental extra file in that directory doesn't silently ship.
FAVICON_FILES = [
    "favicon.svg",
    "favicon.ico",
    "favicon-16.png",
    "favicon-32.png",
    "favicon-48.png",
    "apple-touch-icon-180.png",
]

# Single source of truth for the canonical site origin — package.json's "homepage", not a second
# hardcoded copy. Used only by sitemap.xml/robots.txt, which need an absolute URL; every in-page
# link stays document-relative (see PAGE_PREFIXES's own comment on why).
with open(os.path.join(REPO, "package.json"), encoding="utf-8") as f:
    SITE_ORIGIN = json.load(f)["homepage"].rstrip("/")

# Pages that embed the playground (brand/tools/promo/playground.partial.html, substituted into both
# bodies via {{playground}}) and therefore need its script. The home page carries it so a first-time
# visitor can try the engine before reading anything; /playground is the same component at full size.
PLAYGROUND_SLUGS = ("", "playground")


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

# label, line-comment token (for syntax highlighting), code — the "Using it" tabs on Docs, and the
# JS one doubles as the quickstart snippet on Home.
#
# A pane here shows the CALL and its settings, nothing else — no install command, no publish/
# registry status, nothing about a package that does not exist yet: this project ships what exists
# and says nothing about what doesn't, rather than pre-announcing a release. No sample sentence is
# inlined into a snippet and no `// →` comment states an output: the text is always referred to as
# `input`, the same variable the playground's live call block uses. What the engine actually does
# to a sentence is shown where it can be read as typography — the proof grid on Home, the per-locale
# cards on /locales, the rules table on /docs — not in a fixed-width code block that flattens the
# very glyphs the example is about.
CODE = [
    (
        "JavaScript / TypeScript",
        "//",
        """import { transform } from "polytypo";

const output = transform(input, { locale: "de" });

// mode "markdown" requires an explicit dialect; "text" and "html" ignore it
transform(input, { locale: "fr", mode: "markdown", dialect: "commonmark" });

// opt out of a single rule; the order of the rest never changes
transform(input, { locale: "en-US", rules: { dashes: false } });

try {
  transform(input, { locale: "xx" });
} catch (error) {
  error.code; // "POLYTYPO_UNKNOWN_LOCALE"
}""",
    ),
    (
        "Python",
        "#",
        """from polytypo import transform, PolytypoError

output = transform(input, locale="de")

# mode "markdown" requires an explicit dialect; "text" and "html" ignore it
transform(input, locale="fr", mode="markdown", dialect="commonmark")

transform(input, locale="en-US", rules={"dashes": False})

try:
    transform(input, locale="xx")
except PolytypoError as error:
    error.code  # "POLYTYPO_UNKNOWN_LOCALE\"""",
    ),
    (
        "Go",
        "//",
        """package main

import (
    "errors"
    "fmt"

    "github.com/polytypo/polytypo-go"
)

func main() {
    out, err := polytypo.Transform(input, polytypo.Options{Locale: "de"})
    if err != nil {
        var perr *polytypo.Error
        if errors.As(err, &perr) {
            _ = perr.Code // "POLYTYPO_UNKNOWN_LOCALE"
        }
    }
    fmt.Println(out)

    // Mode "markdown" requires an explicit Dialect; "text" and "html" ignore it
    _, _ = polytypo.Transform(input, polytypo.Options{
        Locale:  "fr",
        Mode:    "markdown",
        Dialect: "commonmark",
    })
}""",
    ),
    (
        "Ruby",
        "#",
        """require "polytypo"

output = Polytypo.transform(input, locale: "de")

# mode "markdown" requires an explicit dialect; "text" and "html" ignore it
Polytypo.transform(input, locale: "fr", mode: "markdown", dialect: "commonmark")

Polytypo.transform(input, locale: "en-US", rules: { dashes: false })

begin
  Polytypo.transform(input, locale: "xx")
rescue Polytypo::Error => error
  error.code # => "POLYTYPO_UNKNOWN_LOCALE"
end""",
    ),
    (
        "PHP",
        "//",
        """<?php
use Polytypo\\Polytypo;
use Polytypo\\PolytypoException;

$output = Polytypo::transform($input, ['locale' => 'de']);

// mode 'markdown' requires an explicit dialect; 'text' and 'html' ignore it
Polytypo::transform($input, ['locale' => 'fr', 'mode' => 'markdown', 'dialect' => 'commonmark']);

try {
    Polytypo::transform($input, ['locale' => 'xx']);
} catch (PolytypoException $error) {
    $error->errorCode; // 'POLYTYPO_UNKNOWN_LOCALE'
}""",
    ),
]

NUMBER_WORDS = {
    1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six",
    7: "seven", 8: "eight", 9: "nine", 10: "ten", 11: "eleven", 12: "twelve",
}


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


def number_lines(line_htmls):
    """Wraps one already-escaped HTML fragment per source line into the numbered line spans every
    code panel on this site is built from. The number itself is never emitted here: it is CSS
    generated content on `.ln::before` (brand/tools/promo/style.css), so it is not a text node,
    is not part of the element's text content, and does not reach the clipboard when a reader
    selects a block and copies it. The literal newline between spans is what makes a copied block
    keep its line breaks. Server-side twin of site.js's numberLines()."""
    return "\n".join(f'<span class="ln">{html}</span>' for html in line_htmls)


def specimen(marked_html, extra_class=""):
    """A prose before/after example. Deliberately NOT a code panel and deliberately without a
    line-number gutter: a specimen is set in the page's reading face because that is the only way
    it can do its job. In a fixed-width face `“ ” „ « »` all take the same advance and lose their
    shapes, `—` and `–` become near-identical, and U+202F — whose entire point is being narrower
    than U+00A0 — is invisible. The change marks and revealed invisible characters carry over from
    the code-panel treatment; the face and the gutter do not."""
    cls = f"specimen {extra_class}".rstrip()
    return f'<div class="{cls}">{marked_html}</div>'


def highlight_lines(code, comment_token):
    """highlight(), split into numbered lines. Tokenising each line on its own is what keeps a
    token from straddling a line boundary; mirrors site.js's highlightLines()."""
    return number_lines(highlight(line, comment_token) for line in code.split("\n"))


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
    """Highlight the output only — the input column is shown exactly as it was typed. Both sides
    come back as one flat marked-up run, for a specimen rather than a code panel: without a gutter
    there are no line boxes to keep a span inside, so a changed region spanning a newline stays one
    span and `white-space: pre-wrap` on `.specimen` renders the break."""
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
            f'<td class="rule-in">{specimen(before)}</td>'
            f'<td class="rule-out">{specimen(after)}</td>'
            f'<td class="small muted">{note}</td></tr>'
        )
    return (
        "<table><tr><th>Rule</th><th>Locale</th><th>In</th><th>Out</th><th>What it does</th></tr>"
        + "".join(rows)
        + "</table>"
    )


def code_panes():
    # No repeated label heading here — the tab button above the pane already shows and highlights
    # it (bootTabs sets the active tab's own text from data-label); build_panes() below never
    # repeated it either. Only this one drifted, since Home used to also render this label
    # standalone as its own quickstart heading — the drift point is gone along with that section.
    panes = []
    for label, comment_token, code in CODE:
        panes.append(
            f'<div class="pane" data-label="{H.escape(label)}">'
            f"<pre><code>{highlight_lines(code, comment_token)}</code></pre></div>"
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
            f"<pre><code>{highlight_lines(code, '//')}</code></pre></div>"
        )
    return "".join(panes)


def locale_card(loc):
    before, after = diff_html(loc["hero"]["in"], loc["hero"]["out"])
    return (
        '<div class="card"><div class="lang">'
        f'{H.escape(loc["name"])} · {H.escape(loc["locale"])}</div>'
        f'<div class="pair">{specimen(before, "in")}{specimen(after, "out")}</div></div>'
    )


def locale_cards(data):
    return "".join(locale_card(loc) for loc in data["locales"])


def proof_input(data):
    """The one shared input every proof-grid card runs through transform() — rendered once, not
    once per card, since PROOF_INPUT (gen_examples.ts) is by construction the identical literal
    string behind every entry in data["proofLocales"]."""
    by_locale = {loc["locale"]: loc for loc in data["locales"]}
    text = by_locale[data["proofLocales"][0]]["proof"]["in"]
    return (
        '<p class="small muted" style="margin: 0 0 8px">Input, unchanged</p>'
        f"{specimen(reveal(text), 'proof-shared-input')}"
    )


def proof_grid(data):
    """The home page's and manifesto's "not one universal style" evidence: the SAME input string
    (examples.json's generated `proof` field — one PROOF_INPUT run through every locale by the
    real engine in gen_examples.ts) rendered for each locale in data["proofLocales"] (the single
    source of truth for this selection, also read directly by tests/promo/proof-grid.test.ts),
    same card markup as locale_card() so it fits the existing visual system without new CSS.
    Each card carries data-locale so a test can parse the ACTUAL generated HTML rather than
    trust any independently-declared list of what should be there.

    Only the OUTPUT is shown per card — the shared input is proof_input()'s job, rendered once
    above the grid, not repeated verbatim in every one of these narrow cards. diff_html still
    computes against the input so the "chg" highlight marks survive; only the "before" half of
    its return value is unused here."""
    by_locale = {loc["locale"]: loc for loc in data["locales"]}
    cards = []
    for code in data["proofLocales"]:
        loc = by_locale[code]
        case = loc["proof"]
        _before, after = diff_html(case["in"], case["out"])
        cards.append(
            f'<div class="card" data-locale="{H.escape(code)}"><div class="lang">'
            f'{H.escape(loc["name"])} · {H.escape(code)}</div>'
            f'<div class="pair pair--solo">{specimen(after, "out")}</div></div>'
        )
    return "".join(cards)


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
    # No nested .wrap here: footer_html()'s output is placed inside build()'s own outer .wrap
    # (see the f'<div class="wrap">...{footer_html(...)}...</div>' below), so a second .wrap
    # around this content would apply that class's width-inset and bottom-padding rules twice —
    # once from the page's wrap, once from this one — narrowing and right-shifting the footer
    # relative to the content above it, and doubling the page's bottom whitespace.
    return (
        "<footer><p>"
        f'polytypo · spec {data["spec"]} · MIT for the code, separate terms for the brand assets · '
        "every before/after typography example on this site is generated with the engine.</p>"
        f'<p><a href="{page_href(prefix, "manifesto")}">Manifesto</a></p>'
        '<p>Created by <a href="https://iurii.rogulia.fi" rel="author">Iurii Rogulia</a>.</p>'
        "</footer>"
    )


def build():
    data = load_examples()
    n = len(data["locales"])
    locale_count_word = NUMBER_WORDS.get(n, str(n))
    rules_count_word = NUMBER_WORDS.get(RULE_COUNT, str(RULE_COUNT))
    # The proof grid's own card count, so the heading above it ("The same sentence. Four different,
    # correct answers.") is derived from the same proofLocales the grid is built from and cannot
    # promise a number the page does not show.
    proof_count_word = NUMBER_WORDS.get(len(data["proofLocales"]), str(len(data["proofLocales"])))

    out_dir = os.path.join(REPO, "promo")
    assets_dir = os.path.join(out_dir, "assets")
    os.makedirs(assets_dir, exist_ok=True)
    shutil.copyfile(os.path.join(PROMO_SRC, "style.css"), os.path.join(assets_dir, "style.css"))
    shutil.copyfile(os.path.join(PROMO_SRC, "site.js"), os.path.join(assets_dir, "site.js"))
    # brand/favicon/ is a committed, hand-produced asset set (brand/README.md documents its
    # contents) — nothing here generates it, this just copies it into the served tree.
    favicon_src = os.path.join(BRAND, "favicon")
    favicon_dir = os.path.join(assets_dir, "favicon")
    os.makedirs(favicon_dir, exist_ok=True)
    for name in FAVICON_FILES:
        shutil.copyfile(os.path.join(favicon_src, name), os.path.join(favicon_dir, name))
    # Shared, cacheable, linked (not inlined) — so nav between the five pages doesn't re-download
    # ~170 KB of embedded woff2 on every click.
    with open(os.path.join(assets_dir, "fonts.css"), "w", encoding="utf-8") as f:
        f.write(fonts_css())

    # The playground form and the code block describing it, substituted verbatim into BOTH
    # home.body.html and playground.body.html — one source file, so the two instances cannot drift
    # apart. Home carries it so a first-time visitor can try the engine without navigating
    # anywhere; /playground is the same component at full size, with the technical notes.
    #
    # The call block lives in this partial rather than in each page's own body template on purpose:
    # nothing may sit between the form and the code that describes it, and keeping them in one file
    # makes that structural instead of a convention two templates have to remember separately.
    #
    # Both pages therefore carry the same element ids. They are separate documents, so that is not
    # a collision — build_playground_script() emits one script per page, differing only in `prefix`
    # and `lazy`.
    with open(os.path.join(PROMO_SRC, "playground.partial.html"), encoding="utf-8") as f:
        playground_markup = f.read()

    replacements = {
        "{{rules_table}}": rules_table(data),
        "{{code_panes}}": code_panes(),
        "{{build_panes}}": build_panes(),
        "{{playground}}": playground_markup,
        "{{locale_count}}": locale_count_word,
        "{{Locale_count}}": locale_count_word.capitalize(),
        "{{rules_count}}": rules_count_word,
        "{{Rules_count}}": rules_count_word.capitalize(),
        "{{proof_count}}": proof_count_word,
        "{{Proof_count}}": proof_count_word.capitalize(),
        "{{locale_cards}}": locale_cards(data),
        "{{proof_input}}": proof_input(data),
        "{{proof_grid}}": proof_grid(data),
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
            f'<link rel="icon" href="{prefix}assets/favicon/favicon.svg" type="image/svg+xml">\n'
            f'<link rel="icon" href="{prefix}assets/favicon/favicon.ico" sizes="16x16 32x32 48x48">\n'
            f'<link rel="apple-touch-icon" href="{prefix}assets/favicon/apple-touch-icon-180.png">\n'
            f'<link rel="stylesheet" href="{prefix}assets/fonts.css">\n'
            f'<link rel="stylesheet" href="{prefix}assets/style.css">\n'
            f"<title>{H.escape(page_title)}</title>\n"
            f'</head>\n<body class="page-{slug or "home"}">\n'
            f"{nav_html(slug, prefix)}\n"
            f'<div class="wrap">\n{body}\n{footer_html(data, prefix)}\n</div>\n'
            f'<script src="{prefix}assets/site.js"></script>\n'
        )

        # bootTabs() is a no-op for a tab set this page doesn't have, so one call per known tab set
        # is emitted everywhere rather than a per-page list that has to be kept in sync.
        doc += (
            "<script>\n"
            'Polytypo.bootTabs("lang-tabs", "lang-panes");\n'
            'Polytypo.bootTabs("build-tabs", "build-panes");\n'
            "</script>\n"
        )

        # Both pages that carry the playground get the same script. They differ in ONE thing: the
        # home page loads the ~680 KB engine bundle lazily (first interaction, or the section
        # nearing the viewport) because a visitor did not ask for it by arriving there, while
        # /playground — which they did choose — loads it eagerly with an ordinary <script src>.
        if slug in PLAYGROUND_SLUGS:
            doc += build_playground_script(data, prefix, lazy=slug != "playground")

        doc += "</body>\n</html>\n"

        rel_path = os.path.join(slug, "index.html") if slug else "index.html"
        out_path = os.path.join(out_dir, rel_path)
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(doc)
        print(f"  promo/{rel_path.replace(os.sep, '/')}  {os.path.getsize(out_path) / 1024:.0f} KB")

    write_robots_and_sitemap(out_dir)


def write_robots_and_sitemap(out_dir):
    """robots.txt and sitemap.xml — the only two files on the site that need an absolute URL
    (SITE_ORIGIN, from package.json's "homepage"); every page URL below is one of PAGES' own
    slugs, so this cannot list a page the build didn't actually generate."""
    with open(os.path.join(out_dir, "robots.txt"), "w", encoding="utf-8") as f:
        f.write(f"User-agent: *\nAllow: /\n\nSitemap: {SITE_ORIGIN}/sitemap.xml\n")

    urls = "".join(
        f"<url><loc>{SITE_ORIGIN}/{slug + '/' if slug else ''}</loc></url>\n"
        for slug, _label, _body in PAGES
    )
    sitemap = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{urls}"
        "</urlset>\n"
    )
    with open(os.path.join(out_dir, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write(sitemap)
    print("  promo/robots.txt")
    print("  promo/sitemap.xml")


def build_playground_script(data, prefix, lazy):
    """The playground's inline script, emitted for every page that embeds the playground.

    `lazy` changes exactly one thing: how the ~680 KB engine bundle arrives.

    Eager (/playground) — an ordinary <script src> tag, so the engine is already evaluated by the
    time this script runs. The visitor navigated to a page whose entire purpose is the engine.

    Lazy (home) — the bundle is not referenced by the markup at all; a <script> element is injected
    on the first sign the visitor wants it (touching the form, or the section nearing the viewport
    after the page has finished loading). Until then the output pane shows the output
    promo/examples.json RECORDED for the seeded example — a real engine run captured at build time
    by brand/tools/gen_examples.ts (`transform(HERO[locale], {locale})`, i.e. text mode), never a
    hand-written approximation. That is also why the recorded result may only be shown for exactly
    that state: this locale's own default example, in text mode. Anything else has no recorded
    answer and must not be guessed at.
    """
    payload = json.dumps(data, ensure_ascii=False)
    engine_src = f"{prefix}vendor/polytypo.browser.js"
    eager_script = "" if lazy else f'<script src="{engine_src}"></script>\n'
    lazy_literal = "true" if lazy else "false"
    return f"""{eager_script}<script>
const DATA = {payload};
(function playground() {{
  const {{
    mark, diff, paint, highlightLines, bootTabs, summarizeChange, summarizeError, copyStatusText,
  }} = window.Polytypo;
  const LAZY = {lazy_literal};
  const ENGINE_SRC = "{engine_src}";
  const LOCALES = DATA.locales.map((l) => [l.locale, l.name]);
  const DIFF_CAP = 4000; // above this, skip character-level highlighting (O(n*m) LCS)
  const TA_MIN_H = 120; // keep in sync with textarea.pg-textarea / .pg-output in style.css
  const TA_MAX_H = 320;

  const $demo = document.getElementById("pg-demo");
  const $locale = document.getElementById("pg-locale");
  const $mode = document.getElementById("pg-mode");
  const $dialectWrap = document.getElementById("pg-dialect-wrap");
  const $dialect = document.getElementById("pg-dialect");
  const $input = document.getElementById("pg-input");
  const $output = document.getElementById("pg-output");
  const $count = document.getElementById("pg-count");
  const $outputSummary = document.getElementById("pg-output-summary");
  const $foot = document.getElementById("pg-foot");
  const $copyOutput = document.getElementById("pg-copy-output");
  const $actionStatus = document.getElementById("pg-action-status");

  for (const [code, name] of LOCALES) {{
    const o = document.createElement("option");
    o.value = code; o.textContent = code + " — " + name;
    $locale.appendChild(o);
  }}

  // Mirrors HERO["en-US"] in gen_examples.ts — unreachable in practice (every locale in the
  // dropdown has its own recorded hero), kept in sync anyway so it isn't a stale copy of text
  // that no longer exists anywhere else if it's ever hit for a locale code with no recording.
  const FALLBACK_SAMPLE =
    `She asked, "Isn't this the shop they call 'round the corner'?" ... We'd walked - nearly 3 ` +
    `km - just to find it closed. Copyright (c) 2026; the print measures 40x60 cm.`;

  /** This locale's recorded {{ in, out }} pair from examples.json — the real engine run captured at
   * build time, which is the only output this page may show before the engine itself is here. */
  function recordedFor(code) {{
    const entry = DATA.locales.find((l) => l.locale === code);
    return entry ? entry.hero : null;
  }}

  function defaultFor(code) {{
    const recorded = recordedFor(code);
    return recorded ? recorded.in : FALLBACK_SAMPLE;
  }}

  let lastDefault = defaultFor($locale.value);
  $input.value = lastDefault;

  // "idle" is reachable only on the lazy page: on the eager one the bundle has either already
  // evaluated (ready) or failed outright, and there is nothing left to wait for.
  let engine = window.PolytypoBrowser || null;
  let engineState = engine ? "ready" : LAZY ? "idle" : "failed";
  let isLoadSlow = false;

  const RECORDED_NOTE = {{
    idle: "recorded example — the engine loads when you use the form",
    loading: "recorded example — the engine is loading",
    failed: "recorded example — the engine bundle did not load",
  }};

  function startEngineLoad() {{
    if (engineState !== "idle") return;
    engineState = "loading";
    // No spinner: on a fast connection it would appear and vanish before anyone could read it. If
    // the bundle is still in flight after 250ms, the status line already on the page says so.
    const slowTimer = setTimeout(() => {{ isLoadSlow = true; render(); }}, 250);
    const script = document.createElement("script");
    script.src = ENGINE_SRC;
    const settle = () => {{
      clearTimeout(slowTimer);
      isLoadSlow = false;
      engine = window.PolytypoBrowser || null;
      engineState = engine ? "ready" : "failed";
      // Nothing needs queueing and nothing is lost: render() reads $input.value and every <select>
      // at call time, so whatever was typed while the bundle was in flight is what gets typeset.
      render();
    }};
    script.addEventListener("load", settle);
    script.addEventListener("error", settle);
    document.head.appendChild(script);
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
        : "") +
      `  }},\\n` +
      `);`;
    $callJs.innerHTML = highlightLines(jsCode, "//");

    const pyCode =
      `from polytypo import transform\\n\\n` +
      `transform(\\n` +
      `    input,  # your text, type: str\\n` +
      `    locale=${{locale}},  # required, type: str — one of: ${{LOCALE_LIST}}\\n` +
      `    mode=${{mode}},  # type: str, default: "text" — "text" | "html" | "markdown"\\n` +
      (showDialect
        ? `    dialect=${{dialect}},  # type: str, required because mode is "markdown" — "commonmark" | "mdx"\\n`
        : "") +
      `)`;
    $callPy.innerHTML = highlightLines(pyCode, "#");

    const goCode =
      `out, err := polytypo.Transform(\\n` +
      `    input, // your text, type: string\\n` +
      `    polytypo.Options{{\\n` +
      `        Locale:  ${{locale}}, // required, type: string — one of: ${{LOCALE_LIST}}\\n` +
      `        Mode:    ${{mode}}, // type: string, default: "text" — "text" | "html" | "markdown"\\n` +
      (showDialect
        ? `        Dialect: ${{dialect}}, // type: string, required because Mode is "markdown" — "commonmark" | "mdx"\\n`
        : "") +
      `    }},\\n` +
      `)`;
    $callGo.innerHTML = highlightLines(goCode, "//");

    const rbCode =
      `require "polytypo"\\n\\n` +
      `Polytypo.transform(\\n` +
      `  input, # your text, type: String\\n` +
      `  locale: ${{rubyStrLit(options.locale)}}, # required, type: String — one of: ${{LOCALE_LIST}}\\n` +
      `  mode: ${{rubyStrLit(options.mode)}}, # type: String, default: "text" — "text" | "html" | "markdown"\\n` +
      (showDialect
        ? `  dialect: ${{rubyStrLit(options.dialect)}}, # type: String, required because mode is "markdown" — "commonmark" | "mdx"\\n`
        : "") +
      `)`;
    $callRb.innerHTML = highlightLines(rbCode, "#");

    const phpCode =
      `Polytypo::transform(\\n` +
      `    $input, // your text, type: string\\n` +
      `    [\\n` +
      `        'locale' => ${{phpStrLit(options.locale)}}, // required, type: string — one of: ${{LOCALE_LIST}}\\n` +
      `        'mode' => ${{phpStrLit(options.mode)}}, // type: string, default: 'text' — 'text' | 'html' | 'markdown'\\n` +
      (showDialect
        ? `        'dialect' => ${{phpStrLit(options.dialect)}}, // type: string, required because mode is 'markdown' — 'commonmark' | 'mdx'\\n`
        : "") +
      `    ],\\n` +
      `);`;
    $callPhp.innerHTML = highlightLines(phpCode, "//");
  }}

  function clearCallCode() {{
    for (const el of [$callJs, $callPy, $callGo, $callRb, $callPhp]) el.textContent = "";
  }}

  /** Paints one before/after pair into the output pane and returns the tail of #pg-foot's status
   * line. Shared by the live-engine path and the recorded-example path so both render identically —
   * the recorded example is real engine output and is shown as such, not as a lesser placeholder. */
  function paintPair(before, after) {{
    if (before.length <= DIFF_CAP) {{
      const segments = diff([...before], [...after]);
      $output.innerHTML = paint(segments);
      return summarizeChange(before, after, segments);
    }}
    $output.innerHTML = mark(after);
    return before.length.toLocaleString("en-US") +
      " chars — change-highlighting skipped above " + DIFF_CAP.toLocaleString("en-US") + " chars";
  }}

  /** Everything the page can honestly show before, or without, the engine.
   *
   * The seeded state — this locale's own default example, in text mode — is exactly what
   * examples.json recorded a real engine run for, so it renders precisely as the engine would.
   * Any other state has no recorded answer: while the bundle is still in flight the pane is left
   * empty rather than passing off a previous input's result as this one's, and if the bundle
   * failed the pane falls back to the recorded example and says plainly that it is not your text. */
  function renderWithoutEngine(options, text) {{
    const recorded = recordedFor(options.locale);
    const isRecordedState = Boolean(recorded) && options.mode === "text" && text === recorded.in;
    $output.classList.remove("error");

    if (isRecordedState) {{
      $outputSummary.textContent = paintPair(recorded.in, recorded.out);
      $foot.textContent = RECORDED_NOTE[engineState] || "";
      return;
    }}

    if (engineState === "failed") {{
      if (recorded) paintPair(recorded.in, recorded.out);
      else $output.innerHTML = "";
      $outputSummary.textContent = "";
      $foot.textContent =
        "The engine bundle (" + ENGINE_SRC + ") did not load — the output above is the recorded " +
        options.locale + " example, not your own text.";
      return;
    }}

    $output.innerHTML = "";
    $outputSummary.textContent = "";
    $foot.textContent = isLoadSlow
      ? "Loading the engine — your text is typeset the moment it arrives."
      : "";
  }}

  // Fits both panes to whichever needs more room, between TA_MIN_H and TA_MAX_H, instead of
  // sizing off the textarea alone: the mono input face and the output's larger reading face wrap
  // the same character count into a different number of lines, so matching heights off only one
  // side can clip the other. Called from render()'s `finally` below, so it runs after every exit
  // path — including the early returns — has already finished setting both panes' content.
  function fitPanes() {{
    $input.style.height = "auto";
    $output.style.height = "auto";
    const needed = Math.max($input.scrollHeight, $output.scrollHeight);
    const h = Math.min(Math.max(needed, TA_MIN_H), TA_MAX_H);
    $input.style.height = h + "px";
    $output.style.height = h + "px";
  }}

  function render() {{
    try {{
      const text = $input.value;
      const n = text.length;
      $count.textContent = n ? n.toLocaleString("en-US") + " chars" : "";
      $dialectWrap.hidden = $mode.value !== "markdown";

      if (!text) {{
        $output.classList.remove("error");
        $output.innerHTML = "";
        $outputSummary.textContent = "";
        $foot.textContent = "";
        clearCallCode();
        return;
      }}

      const options = {{ locale: $locale.value, mode: $mode.value }};
      if ($mode.value === "markdown") options.dialect = $dialect.value;

      // The call block describes what the form is set to, not what the engine returned — it is
      // pure string building. Rendered before every engine branch below so it tracks the controls
      // even while the bundle is still loading, and still shows the call that threw when one does.
      renderCallCode(options);

      if (engineState !== "ready") {{
        renderWithoutEngine(options, text);
        return;
      }}

      let out;
      try {{
        out = engine.transform(text, options);
      }} catch (error) {{
        $output.classList.add("error");
        const code = error && error.code ? error.code : "Error";
        $output.textContent =
          code + ": " + (error && error.message ? error.message : String(error));
        $outputSummary.textContent = "";
        $foot.textContent = summarizeError(code);
        return;
      }}

      $output.classList.remove("error");
      $outputSummary.textContent = paintPair(text, out);
      $foot.textContent = "";
    }} finally {{
      fitPanes();
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

  $copyOutput.addEventListener("click", async () => {{
    const text = $output.textContent;
    if (!text) {{
      $actionStatus.textContent = "Nothing to copy yet.";
      return;
    }}
    const ok = await copyText(text);
    $actionStatus.textContent = copyStatusText("Output", ok);
  }});

  // startEngineLoad() returns immediately unless the engine is still unrequested, so wiring it to
  // every control costs nothing on the eager page and needs no LAZY branch here.
  $locale.addEventListener("change", () => {{
    startEngineLoad();
    if ($input.value === lastDefault) {{
      lastDefault = defaultFor($locale.value);
      $input.value = lastDefault;
    }}
    render();
  }});
  $mode.addEventListener("change", () => {{
    startEngineLoad();
    render();
  }});
  $dialect.addEventListener("change", () => {{
    startEngineLoad();
    render();
  }});
  $input.addEventListener("input", () => {{
    // Requested from the raw event, not from run()'s 120ms-debounced render(), so the bundle is
    // already in flight during the debounce window rather than 120ms behind it.
    startEngineLoad();
    run();
  }});

  // Both panes are capped at the same height (see .pg-output in style.css) and scroll on their
  // own past that — without this, comparing a long before/after means scrolling one pane, losing
  // your place, and hunting for it again in the other. Guarded by a lock rather than removing the
  // listener mid-callback, since scrolling `to` fires `to`'s own scroll event straight back in.
  let syncingScroll = false;
  function syncScroll(from, to) {{
    if (syncingScroll) return;
    const fromMax = from.scrollHeight - from.clientHeight;
    const toMax = to.scrollHeight - to.clientHeight;
    if (fromMax <= 0 || toMax <= 0) return;
    syncingScroll = true;
    to.scrollTop = (from.scrollTop / fromMax) * toMax;
    syncingScroll = false;
  }}
  $input.addEventListener("scroll", () => syncScroll($input, $output));
  $output.addEventListener("scroll", () => syncScroll($output, $input));

  // `resize: vertical` on the textarea (style.css) only resizes the textarea itself; mirror
  // whatever height a visitor drags it to onto the output pane so the two stay matched.
  if (typeof ResizeObserver === "function") {{
    new ResizeObserver(() => {{
      $output.style.height = $input.offsetHeight + "px";
    }}).observe($input);
  }}

  if (LAZY) {{
    // First sign of intent, whichever comes first: focusing the input (before a single character
    // is typed), changing a control, or the section nearing the viewport.
    $input.addEventListener("focus", startEngineLoad, {{ once: true }});
    if (typeof IntersectionObserver === "function" && $demo) {{
      const observer = new IntersectionObserver((entries) => {{
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        startEngineLoad();
      }}, {{ rootMargin: "400px" }});
      // Armed only once the page has finished loading. The playground sits one paragraph below the
      // headline, so it is above the fold on an ordinary viewport and would otherwise intersect
      // during first paint — which is precisely what this page must not spend 680 KB on.
      const arm = () => {{ if (engineState === "idle") observer.observe($demo); }};
      if (document.readyState === "complete") arm();
      else window.addEventListener("load", arm, {{ once: true }});
    }}
  }}

  bootTabs("call-tabs", "call-panes");
  render();
}})();
</script>
"""


if __name__ == "__main__":
    build()
