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

# Per-page meta/OG description — every page previously shared the Home page's own description
# verbatim, which is a duplicate-content SEO defect. Each entry describes what that specific page
# actually shows, never a promise about work not yet done. "{n}" is the live locale count,
# substituted where used (see PAGE_DESCRIPTIONS below). Keep each under ~160 characters.
PAGE_DESCRIPTIONS = {
    "": (
        "polytypo — locale-correct quotes, dashes, ellipses and no-break spaces for {n} locales. "
        "Five runtimes, one portable spec, byte-identical output."
    ),
    "docs": (
        "polytypo reference: transform(input, options) is pure and locale-required. Code examples "
        "in five languages, plus the full error code contract."
    ),
    "playground": (
        "Run polytypo's real engine in your browser. Paste text, pick a locale, and see "
        "locale-correct quotes, dashes, ellipses and no-break spaces applied live."
    ),
    "locales": (
        "polytypo locale coverage: {n} locales, each backed by a normative typographic source and "
        "a conformance fixture set. See what is covered, and how a locale is added."
    ),
    "manifesto": (
        "The em dash was mine before AI. Why locale-correct typography is craft, set by locale "
        "convention long before language models existed — not an AI watermark."
    ),
}

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
# hardcoded copy. Used for sitemap.xml/robots.txt and for the absolute URLs that og:url,
# <link rel="canonical"> and JSON-LD require; every in-page link stays document-relative (see
# PAGE_PREFIXES's own comment on why).
with open(os.path.join(REPO, "package.json"), encoding="utf-8") as f:
    _PKG = json.load(f)
    SITE_ORIGIN = _PKG["homepage"].rstrip("/")
    REPO_URL = _PKG["repository"]["url"].removeprefix("git+").removesuffix(".git")
    LICENSE = _PKG["license"]

# Served at promo/assets/og-image.png — see OG_IMAGE_FILE below. 1200x630 is the OG/Twitter
# large-card convention; the file is hand-produced (brand/README.md) and committed, not generated.
OG_IMAGE_FILE = "polytypo-og-1200x630.png"
OG_IMAGE_WIDTH = 1200
OG_IMAGE_HEIGHT = 630

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

$output = Polytypo::transform($input, 'de');

// mode 'markdown' requires an explicit dialect; 'text' and 'html' ignore it
// (markdown mode is not implemented by this runtime -- see spec/CONFORMANCE.md)
Polytypo::transform($input, 'fr', mode: 'markdown', dialect: 'commonmark');

// opt out of a single rule; the order of the rest never changes
Polytypo::transform($input, 'en-US', rules: ['dashes' => false]);

try {
    Polytypo::transform($input, 'xx');
} catch (PolytypoException $error) {
    $error->getErrorCode(); // 'POLYTYPO_UNKNOWN_LOCALE'
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


# CODE's own tab label -> the matching runtime "name" in scripts/conformance-status.json, so the
# repo/package link and version badge under each code pane are read from the same one file the
# canonical README's own Implementations table and badge row are generated from, never
# hand-duplicated here.
_CODE_LABEL_TO_STATUS_NAME = {
    "JavaScript / TypeScript": "JavaScript/TypeScript",
    "Python": "Python",
    "Go": "Go",
    "Ruby": "Ruby",
    "PHP": "PHP",
}

# Registry-specific version-badge shield, keyed the same way brand/tools/gen_readmes.py's own
# PACKAGE_BADGES is (that module isn't imported here to keep these two generators independent, per
# this file's own module docstring on build isolation). Operator decision 2026-09-08: these five
# exact URLs are the one deliberate exception to this site's zero-external-request policy — see
# tests/promo/no-external-requests.test.ts's ALLOWED_EXTERNAL_URLS, which must be updated in
# lockstep with any change here.
_BADGE_SHIELD = {
    "npmjs.com": lambda pkg: f"https://img.shields.io/npm/v/{pkg.rstrip('/').rsplit('/', 1)[-1]}.svg",
    "pypi.org": lambda pkg: f"https://img.shields.io/pypi/v/{pkg.rstrip('/').rsplit('/', 1)[-1]}.svg",
    "pkg.go.dev": lambda pkg: f"https://pkg.go.dev/badge/{pkg.split('pkg.go.dev/', 1)[-1].rstrip('/')}.svg",
    "rubygems.org": lambda pkg: f"https://img.shields.io/gem/v/{pkg.rstrip('/').rsplit('/', 1)[-1]}.svg",
    "packagist.org": lambda pkg: f"https://img.shields.io/packagist/v/{pkg.split('packagist.org/packages/', 1)[-1].rstrip('/')}.svg",
}


def _runtime_status():
    with open(os.path.join(REPO, "scripts", "conformance-status.json"), encoding="utf-8") as f:
        status = json.load(f)
    return {rt["name"]: rt for rt in status["runtimes"]}


def _badge_shield_url(package_url):
    for host, shield in _BADGE_SHIELD.items():
        if host in package_url:
            return shield(package_url)
    return None


def code_panes():
    # No repeated label heading here — the tab button above the pane already shows and highlights
    # it (bootTabs sets the active tab's own text from data-label); build_panes() below never
    # repeated it either. Only this one drifted, since Home used to also render this label
    # standalone as its own quickstart heading — the drift point is gone along with that section.
    #
    # Text links only (Repo/Package) — no version badge here. The badge itself is social proof and
    # belongs where a first-time visitor actually looks for it (the Home hero, see
    # package_badges_row()), not repeated a second time next to a link that already points at the
    # same package.
    by_name = _runtime_status()
    panes = []
    for label, comment_token, code in CODE:
        rt = by_name.get(_CODE_LABEL_TO_STATUS_NAME.get(label))
        links_html = ""
        if rt is not None:
            links_html = (
                '<p class="small muted" style="margin-top: 10px">'
                f'<a href="{H.escape(rt["repo"])}">Repo</a> · '
                f'<a href="{H.escape(rt["package"])}">Package</a>'
                "</p>"
            )
        panes.append(
            f'<div class="pane" data-label="{H.escape(label)}">'
            f"<pre><code>{highlight_lines(code, comment_token)}</code></pre>{links_html}</div>"
        )
    return "".join(panes)


def package_badges_row():
    # One live version badge per published runtime, linked to its package page — the Home hero's
    # social-proof row, the same role a badge row plays in the canonical README (see
    # brand/tools/gen_readmes.py's own package_badges_row(); not imported here, per this file's
    # own module docstring on build isolation between the two generators).
    parts = []
    for rt in _runtime_status().values():
        shield_url = _badge_shield_url(rt["package"])
        if shield_url is None:
            continue
        parts.append(
            f'<a href="{H.escape(rt["package"])}">'
            f'<img src="{H.escape(shield_url)}" alt="{H.escape(rt["name"])} package version" '
            f'style="vertical-align: middle; height: 20px"></a>'
        )
    return " ".join(parts)


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


GITHUB_ICON = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="18" height="18"'
    ' aria-hidden="true" fill="currentColor">'
    '<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38'
    " 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15"
    "-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51"
    "-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0"
    " .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82"
    ".44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54"
    '.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>'
    "</svg>"
)

# The GitHub icon link sits outside NAV_LINKS because it is icon-only (no visible text) and
# external — it does not trigger the Stage-7 320px layout concern that applies to text links.
GITHUB_LINK = (
    '<a href="https://github.com/polytypo/polytypo" aria-label="GitHub"'
    f' rel="noopener noreferrer">{GITHUB_ICON}</a>'
)


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
        f'<div class="links">{links}{GITHUB_LINK}</div>'
        "</div></nav>"
    )


# One flat, single-path, 24x24-viewBox mark per language, from Simple Icons (CC0) -- a consistent
# icon style across all five, unlike mixing each project's own multi-color brand logo. Rendered
# with fill="currentColor" so it always matches the surrounding link text color, in both the
# light and dark theme this site already supports, with no separate per-theme icon asset needed.
_LANGUAGE_ICON_PATHS = {
    "JavaScript/TypeScript": (
        "M0 0h24v24H0V0zm22.034 18.276c-.175-1.095-.888-2.015-3.003-2.873-.736-.345-1.554-.585-"
        "1.797-1.14-.091-.33-.105-.51-.046-.705.15-.646.915-.84 1.515-.66.39.12.75.42.976.9 "
        "1.034-.676 1.034-.676 1.755-1.125-.27-.42-.404-.601-.586-.78-.63-.705-1.469-1.065-2.834-"
        "1.034l-.705.089c-.676.165-1.32.525-1.71 1.005-1.14 1.291-.811 3.541.569 4.471 1.365 1.02 "
        "3.361 1.244 3.616 2.205.24 1.17-.87 1.545-1.966 1.41-.811-.18-1.26-.586-1.755-1.336l-"
        "1.83 1.051c.21.48.45.689.81 1.109 1.74 1.756 6.09 1.666 6.871-1.004.029-.09.24-.705."
        "074-1.65l.046.067zm-8.983-7.245h-2.248c0 1.938-.009 3.864-.009 5.805 0 1.232.063 "
        "2.363-.138 2.711-.33.689-1.18.601-1.566.48-.396-.196-.597-.466-.83-.855-.063-.105-.11-"
        ".196-.127-.196l-1.825 1.125c.305.63.75 1.172 1.324 1.517.855.51 2.004.675 3.207.405."
        "783-.226 1.458-.691 1.811-1.411.51-.93.402-2.07.397-3.346.012-2.054 0-4.109 0-6.179l."
        "004-.056z"
    ),
    "Python": (
        "M14.25.18l.9.2.73.26.59.3.45.32.34.34.25.34.16.33.1.3.04.26.02.2-.01.13V8.5l-.05.63-."
        "13.55-.21.46-.26.38-.3.31-.33.25-.35.19-.35.14-.33.1-.3.07-.26.04-.21.02H8.77l-.69.05-."
        "59.14-.5.22-.41.27-.33.32-.27.35-.2.36-.15.37-.1.35-.07.32-.04.27-.02.21v3.06H3.17l-."
        "21-.03-.28-.07-.32-.12-.35-.18-.36-.26-.36-.36-.35-.46-.32-.59-.28-.73-.21-.88-.14-1.05-"
        ".05-1.23.06-1.22.16-1.04.24-.87.32-.71.36-.57.4-.44.42-.33.42-.24.4-.16.36-.1.32-.05."
        "24-.01h.16l.06.01h8.16v-.83H6.18l-.01-2.75-.02-.37.05-.34.11-.31.17-.28.25-.26.31-.23."
        "38-.2.44-.18.51-.15.58-.12.64-.1.71-.06.77-.04.84-.02 1.27.05zm-6.3 1.98l-.23.33-.08."
        "41.08.41.23.34.33.22.41.09.41-.09.33-.22.23-.34.08-.41-.08-.41-.23-.33-.33-.22-.41-.09-"
        ".41.09zm13.09 3.95l.28.06.32.12.35.18.36.27.36.35.35.47.32.59.28.73.21.88.14 1.04.05 "
        "1.23-.06 1.23-.16 1.04-.24.86-.32.71-.36.57-.4.45-.42.33-.42.24-.4.16-.36.09-.32.05-."
        "24.02-.16-.01h-8.22v.82h5.84l.01 2.76.02.36-.05.34-.11.31-.17.29-.25.25-.31.24-.38.2-."
        "44.17-.51.15-.58.13-.64.09-.71.07-.77.04-.84.01-1.27-.04-1.07-.14-.9-.2-.73-.25-.59-."
        "3-.45-.33-.34-.34-.25-.34-.16-.33-.1-.3-.04-.25-.02-.2.01-.13v-5.34l.05-.64.13-.54.21-."
        "46.26-.38.3-.32.33-.24.35-.2.35-.14.33-.1.3-.06.26-.04.21-.02.13-.01h5.84l.69-.05.59-."
        "14.5-.21.41-.28.33-.32.27-.35.2-.36.15-.36.1-.35.07-.32.04-.28.02-.21V6.07h2.09l.14."
        "01zm-6.47 14.25l-.23.33-.08.41.08.41.23.33.33.23.41.08.41-.08.33-.23.23-.33.08-.41-.08-"
        ".41-.23-.33-.33-.23-.41-.08-.41.08z"
    ),
    "Go": (
        "M1.811 10.231c-.047 0-.058-.023-.035-.059l.246-.315c.023-.035.081-.058.128-.058h4.172c"
        ".046 0 .058.035.035.07l-.199.303c-.023.036-.082.07-.117.07zM.047 11.306c-.047 0-."
        "059-.023-.035-.058l.245-.316c.023-.035.082-.058.129-.058h5.328c.047 0 .07.035.058.07l-."
        "093.28c-.012.047-.058.07-.105.07zm2.828 1.075c-.047 0-.059-.035-.035-.07l.163-.292c."
        "023-.035.07-.07.117-.07h2.337c.047 0 .07.035.07.082l-.023.28c0 .047-.047.082-.082.082zm"
        "12.129-2.36c-.736.187-1.239.327-1.963.514-.176.046-.187.058-.34-.117-.174-.199-.303-."
        "327-.548-.444-.737-.362-1.45-.257-2.115.175-.795.514-1.204 1.274-1.192 2.22.011.935.654 "
        "1.706 1.577 1.835.795.105 1.46-.175 1.987-.77.105-.13.198-.27.315-.434H10.47c-.245 0-."
        "304-.152-.222-.35.152-.362.432-.97.596-1.274a.315.315 0 01.292-.187h4.253c-.023.316-."
        "023.631-.07.947a4.983 4.983 0 01-.958 2.29c-.841 1.11-1.94 1.8-3.33 1.986-1.145.152-"
        "2.209-.07-3.143-.77-.865-.655-1.356-1.52-1.484-2.595-.152-1.274.222-2.419.993-3.424."
        "83-1.086 1.928-1.776 3.272-2.02 1.098-.2 2.15-.07 3.096.571.62.41 1.063.97 1.356 1.648."
        "07.105.023.164-.117.2m3.868 6.461c-1.064-.024-2.034-.328-2.852-1.029a3.665 3.665 0 01-"
        "1.262-2.255c-.21-1.32.152-2.489.947-3.529.853-1.122 1.881-1.706 3.272-1.95 1.192-.21 "
        "2.314-.095 3.33.595.923.63 1.496 1.484 1.648 2.605.198 1.578-.257 2.863-1.344 3.962-."
        "771.783-1.718 1.273-2.805 1.495-.315.06-.63.07-.934.106zm2.78-4.72c-.011-.153-.011-.27-"
        ".034-.387-.21-1.157-1.274-1.81-2.384-1.554-1.087.245-1.788.935-2.045 2.033-.21.912.234 "
        "1.835 1.075 2.21.643.28 1.285.244 1.905-.07.923-.48 1.425-1.228 1.484-2.233z"
    ),
    "Ruby": (
        "M20.156.083c3.033.525 3.893 2.598 3.829 4.77L24 4.822 22.635 22.71 4.89 23.926h.016C"
        "3.433 23.864.15 23.729 0 19.139l1.645-3 2.819 6.586.503 1.172 2.805-9.144-.03.007.016-"
        ".03 9.255 2.956-1.396-5.431-.99-3.9 8.82-.569-.615-.51L16.5 2.114 20.159.073l-.003.01zM0 "
        "19.089zM5.13 5.073c3.561-3.533 8.157-5.621 9.922-3.84 1.762 1.777-.105 6.105-3.673 "
        "9.636-3.563 3.532-8.103 5.734-9.864 3.957-1.766-1.777.045-6.217 3.612-9.75l.003-.003z"
    ),
    "PHP": (
        "M7.01 10.207h-.944l-.515 2.648h.838c.556 0 .97-.105 1.242-.314.272-.21.455-.559.55-1."
        "049.092-.47.05-.802-.124-.995-.175-.193-.523-.29-1.047-.29zM12 5.688C5.373 5.688 0 "
        "8.514 0 12s5.373 6.313 12 6.313S24 15.486 24 12c0-3.486-5.373-6.312-12-6.312zm-3.26 "
        "7.451c-.261.25-.575.438-.917.551-.336.108-.765.164-1.285.164H5.357l-.327 1.681H3.652l1."
        "23-6.326h2.65c.797 0 1.378.209 1.744.628.366.418.476 1.002.33 1.752a2.836 2.836 0 0 "
        "1-.305.847c-.143.255-.33.49-.561.703zm4.024.715l.543-2.799c.063-.318.039-.536-.068-."
        "651-.107-.116-.336-.174-.687-.174H11.46l-.704 3.625H9.388l1.23-6.327h1.367l-.327 1.682h"
        "1.218c.767 0 1.295.134 1.586.401s.378.7.263 1.299l-.572 2.944h-1.389zm7.597-2.265a2."
        "782 2.782 0 0 1-.305.847c-.143.255-.33.49-.561.703a2.44 2.44 0 0 1-.917.551c-.336.108-"
        ".765.164-1.286.164h-1.18l-.327 1.682h-1.378l1.23-6.326h2.649c.797 0 1.378.209 1.744."
        "628.366.417.477 1.001.331 1.751zM17.766 10.207h-.943l-.516 2.648h.838c.557 0 .971-.105 "
        "1.242-.314.272-.21.455-.559.551-1.049.092-.47.049-.802-.125-.995s-.524-.29-1.047-.29z"
    ),
}


def _language_icon_svg(name):
    d = _LANGUAGE_ICON_PATHS.get(name)
    if d is None:
        return ""
    return (
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" '
        f'style="vertical-align:-2px;margin-right:4px" aria-hidden="true"><path d="{d}"/></svg>'
    )


def footer_html(data, prefix):
    # No nested .wrap here: footer_html()'s output is placed inside build()'s own outer .wrap
    # (see the f'<div class="wrap">...{footer_html(...)}...</div>' below), so a second .wrap
    # around this content would apply that class's width-inset and bottom-padding rules twice —
    # once from the page's wrap, once from this one — narrowing and right-shifting the footer
    # relative to the content above it, and doubling the page's bottom whitespace.
    # Package links, one per published runtime, short language labels (not the full
    # conformance-status.json "name" — "JavaScript/TypeScript" reads better shortened here) — read
    # from the same one file the Home badges and README Implementations table already use, so a
    # runtime can't go missing from the footer either.
    _footer_labels = {
        "JavaScript/TypeScript": "JS/TS",
        "Python": "Python",
        "Go": "Go",
        "Ruby": "Ruby",
        "PHP": "PHP",
    }
    package_links = " · ".join(
        f'<a href="{H.escape(rt["package"])}">{_language_icon_svg(rt["name"])}'
        f'{H.escape(_footer_labels.get(rt["name"], rt["name"]))}</a>'
        for rt in _runtime_status().values()
    )
    return (
        "<footer><p>"
        f'polytypo · spec {data["spec"]} · MIT for the code, separate terms for the brand assets · '
        "every before/after typography example on this site is generated with the engine.</p>"
        f'<p><a href="{page_href(prefix, "manifesto")}">Manifesto</a></p>'
        f"<p>Packages: {package_links}</p>"
        '<p>Created by <a href="https://iurii.rogulia.fi" rel="author">Iurii Rogulia</a>.</p>'
        "</footer>"
    )


def badge_section_html():
    """The embeddable-badge picker: the exact section that used to live only at the bottom of the
    Docs page's own content, now emitted on every page (build()) right before footer_html() --
    same markup, same page-section styling (h2, .small.muted) it always had, just no longer
    docs-only. Kept as its own <section>, not folded into <footer>'s markup or type scale: the
    operator's call was "same as it was on docs, only on every page", not a footer-sized version
    of it.
    """
    return (
        '<section id="badge">'
        "<h2>Already using polytypo? Add our badge</h2>"
        '<p class="small muted" style="max-width: 60ch">'
        "Two lines, same shape as any other embeddable badge — a script tag and a span. No "
        "per-embed network call: the whole render table ships in that one script. Pick a "
        "language and a theme, then copy the code into your footer, About page, or credits "
        "section."
        "</p>"
        '<div class="badge-controls" '
        'style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin: 14px 0">'
        '<select id="badge-lang" aria-label="Badge language"></select>'
        '<div class="tabs" id="badge-theme-tabs">'
        '<button type="button" data-theme="light" aria-pressed="true">Light</button>'
        '<button type="button" data-theme="dark" aria-pressed="false">Dark</button>'
        "</div>"
        "</div>"
        '<span id="badge-preview" data-polytypo-lang="en" data-polytypo-theme="light" '
        'style="display: inline-block; margin: 0 0 14px"></span>'
        '<div class="scroll"><pre><code id="badge-code"></code></pre></div>'
        '<button type="button" id="badge-copy" class="btn" style="margin-top: 10px">Copy</button>'
        "</section>"
    )


_WEBSITE_NODE = {"@type": "WebSite", "name": "polytypo", "url": f"{SITE_ORIGIN}/"}


def jsonld(slug, page_title, description, canonical_url):
    """Structured data for one page: a WebPage node everywhere, plus — Home only — a
    SoftwareSourceCode node describing what actually ships (MIT, the canonical spec repo, and
    every runtime currently published — read from scripts/conformance-status.json, never
    hand-listed, so a newly-shipped runtime can't go stale here). Not SoftwareApplication: that
    type implies an installable app with an `offers` price point, which overclaims what a
    library is.
    """
    webpage_node = {
        "@type": "WebPage",
        "name": page_title,
        "description": description,
        "url": canonical_url,
        "isPartOf": _WEBSITE_NODE,
    }
    if slug != "":
        doc = {"@context": "https://schema.org", **webpage_node}
    else:
        software_node = {
            "@type": "SoftwareSourceCode",
            "name": "polytypo",
            "description": description,
            "url": canonical_url,
            "codeRepository": REPO_URL,
            "license": "https://spdx.org/licenses/MIT.html",
            "programmingLanguage": [rt["name"] for rt in _runtime_status().values()],
        }
        doc = {"@context": "https://schema.org", "@graph": [webpage_node, software_node]}
    # </script> inside a JSON string would otherwise close the element early — escape the slash,
    # which JSON permits (\/ is a valid escape) and HTML parsers do not treat as a delimiter.
    return json.dumps(doc, ensure_ascii=False).replace("</", "<\\/")


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
    # og:image / twitter:image target — same committed brand/png/ asset every page's <head> points
    # at, copied verbatim rather than re-derived so it cannot drift from what brand/BRANDBOOK.html
    # documents as the canonical share image.
    shutil.copyfile(
        os.path.join(BRAND, "png", OG_IMAGE_FILE), os.path.join(assets_dir, "og-image.png")
    )
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
        "{{package_badges}}": package_badges_row(),
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
        description = PAGE_DESCRIPTIONS[slug].format(n=n)
        canonical_url = f"{SITE_ORIGIN}/{slug + '/' if slug else ''}"
        image_url = f"{SITE_ORIGIN}/assets/og-image.png"
        doc = (
            "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
            '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
            f'<meta name="description" content="{H.escape(description)}">\n'
            f'<link rel="canonical" href="{canonical_url}">\n'
            f'<link rel="icon" href="{prefix}assets/favicon/favicon.svg" type="image/svg+xml">\n'
            f'<link rel="icon" href="{prefix}assets/favicon/favicon.ico" sizes="16x16 32x32 48x48">\n'
            f'<link rel="apple-touch-icon" href="{prefix}assets/favicon/apple-touch-icon-180.png">\n'
            f'<link rel="stylesheet" href="{prefix}assets/fonts.css">\n'
            f'<link rel="stylesheet" href="{prefix}assets/style.css">\n'
            f"<title>{H.escape(page_title)}</title>\n"
            # Open Graph — every page, so a link shared from any of the five (not just Home)
            # carries its own title/description/image instead of Facebook/Slack/etc. guessing
            # from the raw markup.
            '<meta property="og:site_name" content="polytypo">\n'
            '<meta property="og:type" content="website">\n'
            f'<meta property="og:url" content="{canonical_url}">\n'
            f'<meta property="og:title" content="{H.escape(page_title)}">\n'
            f'<meta property="og:description" content="{H.escape(description)}">\n'
            f'<meta property="og:image" content="{image_url}">\n'
            f'<meta property="og:image:width" content="{OG_IMAGE_WIDTH}">\n'
            f'<meta property="og:image:height" content="{OG_IMAGE_HEIGHT}">\n'
            '<meta property="og:locale" content="en_US">\n'
            '<meta name="twitter:card" content="summary_large_image">\n'
            f'<meta name="twitter:title" content="{H.escape(page_title)}">\n'
            f'<meta name="twitter:description" content="{H.escape(description)}">\n'
            f'<meta name="twitter:image" content="{image_url}">\n'
            f"<script type=\"application/ld+json\">{jsonld(slug, page_title, description, canonical_url)}</script>\n"
            '<script defer src="https://u.rogulia.fi/script.js" '
            'data-website-id="d119baa4-9e97-428a-9f3f-bf0d29a54a97"></script>\n'
            f'</head>\n<body class="page-{slug or "home"}">\n'
            f"{nav_html(slug, prefix)}\n"
            f'<div class="wrap">\n{body}\n{badge_section_html()}\n{footer_html(data, prefix)}\n</div>\n'
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

        # badge_section_html() is emitted on every page now, not just "docs", so its wiring
        # script loads unconditionally here too.
        doc += build_badge_script(prefix)

        doc += "</body>\n</html>\n"

        rel_path = os.path.join(slug, "index.html") if slug else "index.html"
        out_path = os.path.join(out_dir, rel_path)
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(doc)
        print(f"  promo/{rel_path.replace(os.sep, '/')}  {os.path.getsize(out_path) / 1024:.0f} KB")

    write_robots_and_sitemap(out_dir)
    write_badge_js(out_dir)
    write_llms_txt(out_dir, data)


def write_robots_and_sitemap(out_dir):
    """robots.txt and sitemap.xml — two of the three files on the site that need an absolute URL
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


def write_llms_txt(out_dir, data):
    """llms.txt (the llmstxt.org convention) — a curated Markdown entry point for AI agents/LLMs,
    served at the site root (SITE_ORIGIN/llms.txt, the third of the three files here that needs an
    absolute URL). Every fact below is read live from the same data the rest of this build already
    loads (`data`, `_runtime_status()`, the module-level `_ORDER`), never hand-duplicated, so this
    file cannot drift from what the site itself claims. robots.txt's blanket `Allow: /` already
    covers AI crawlers (no per-agent rule is needed); this file is what gives one a structured
    summary instead of making it parse five HTML pages to find the same links."""
    n = len(data["locales"])
    locale_list = ", ".join(loc["locale"] for loc in data["locales"])
    rule_ids = ", ".join(r["id"] for r in _ORDER["rules"])

    lines = [
        "# polytypo",
        "",
        "> Locale-correct quotes, dashes, ellipses, hyphens and no-break spaces. One portable "
        "spec, five runtime implementations, byte-identical output — transform(input, { locale }) "
        "is pure, with no I/O, network access or global state.",
        "",
        "polytypo is a typography rules engine, not a grammar or spell checker: it normalizes "
        "punctuation and spacing to the convention of a specific locale, and every rule cites its "
        "normative source (Chicago/Oxford, Duden, Imprimerie nationale, Kotus, Språkrådet, "
        f"Мильчин). Spec {data['spec']}, {n} locales ({locale_list}), rules run in this fixed "
        f"order: {rule_ids}.",
        "",
        "## Docs",
        "",
        f"- [Reference]({SITE_ORIGIN}/docs/): API shape, options, the full error code contract, "
        "code examples for all five runtimes.",
        f"- [Locales]({SITE_ORIGIN}/locales/): per-locale coverage, each backed by a citation and "
        "a conformance fixture set.",
        f"- [Playground]({SITE_ORIGIN}/playground/): run the real engine on your own text in the "
        "browser.",
        "",
        "## Packages",
        "",
    ]
    for rt in _runtime_status().values():
        lines.append(f"- [{rt['name']}]({rt['package']}) — source: {rt['repo']}")
    lines += [
        "",
        "## Spec",
        "",
        f"- [Canonical spec repo]({REPO_URL}): normative rules, locale data and conformance "
        'fixtures — runtime-agnostic, MIT licensed. An implementation is "polytypo" iff it passes '
        "this suite for the spec version it claims.",
        "",
        "## Optional",
        "",
        f"- [Manifesto]({SITE_ORIGIN}/manifesto/): why this is typography, set by locale "
        "convention long before language models existed, not an AI watermark.",
        "",
    ]
    with open(os.path.join(out_dir, "llms.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("  promo/llms.txt")


# Attribution caption per language, "polytypo" marked with <b> at its actual position in each
# (never derived by string-replacing "polytypo": Finnish inflects the brand name itself --
# "polytypon", the genitive form -- so a substring replace would bold only part of the word).
# Operator-reviewed 2026-09-08, not machine-translated: German prefers "durch" (performed-by) over
# "von", Finnish "polytypon avulla" ("with the help of polytypo") over the ambiguous adessive
# alone, and Russian deliberately breaks from the other six languages' "cleanup by X" structure --
# "текст оттипографен <b>polytypo</b>" reads as a natural short UI credit line in Russian, not a
# literal translation of the English noun phrase.
# Keyed by language, not locale: the badge's caption text is the same for every locale that
# shares a language (en-US/en-GB, de-DE/de-CH, fr/fr-CA), so the picker offers exactly these seven
# languages -- not ten locales where three pairs would produce byte-identical text under different
# labels. See BADGE_LANG_NAMES for the picker's own display names, in this same order.
BADGE_TEXT = {
    "en": "Typographic cleanup by <b>polytypo</b>",
    "de": "Typografische Bereinigung durch <b>polytypo</b>",
    "fr": "Nettoyage typographique par <b>polytypo</b>",
    "ru": "текст оттипографен <b>polytypo</b>",
    "fi": "Typografinen siistiminen <b>polytypon</b> avulla",
    "sv": "Typografisk uppstädning av <b>polytypo</b>",
    "el": "Τυπογραφικός καθαρισμός από το <b>polytypo</b>",
}

BADGE_LANG_NAMES = {
    "en": "English",
    "de": "German",
    "fr": "French",
    "ru": "Russian",
    "fi": "Finnish",
    "sv": "Swedish",
    "el": "Greek",
}

_BADGE_THEME_COLORS = {
    "light": {"bg": "#FBFAF7", "fg": "#14161A", "border": "rgba(20,22,26,0.14)"},
    "dark": {"bg": "#14161A", "fg": "#FBFAF7", "border": "rgba(251,250,247,0.18)"},
}


def badge_html(lang, theme):
    """One self-contained, copy-pasteable attribution badge: plain HTML and inline styles only --
    no <script>, no external image request, nothing to break if the embedding site's own CSS or
    CSP changes. The mark is the same guillemets-around-an-em-dash brand mark used everywhere else
    on this site (brand/logo/polytypo-mark.svg), inlined and recolored per theme rather than
    linked, for the same zero-dependency reason. `?utm_source=badge` on the link lets analytics
    tell embed-driven visits apart from every other referral source.
    """
    caption = BADGE_TEXT[lang]
    c = _BADGE_THEME_COLORS[theme]
    mark_svg = (
        '<svg width="20" height="12" viewBox="9.5 37.5 181.0 45.0" aria-hidden="true">'
        f'<g fill="none" stroke="{c["fg"]}" stroke-width="9.0" stroke-linecap="round" stroke-linejoin="round">'
        '<path d="M28 42 L14 60 L28 78"/><path d="M44 42 L30 60 L44 78"/>'
        '<path d="M172 42 L186 60 L172 78"/><path d="M156 42 L170 60 L156 78"/></g>'
        f'<rect x="58.0" y="55.5" width="84.0" height="9.0" fill="{c["fg"]}"/></svg>'
    )
    return (
        '<a href="https://polytypo.dev/?utm_source=badge" target="_blank" rel="noopener" '
        'style="display:inline-flex;align-items:center;gap:8px;'
        f'padding:6px 12px;background:{c["bg"]};border:1px solid {c["border"]};border-radius:6px;'
        "text-decoration:none;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;"
        f'font-size:13px;color:{c["fg"]};line-height:1">{mark_svg}<span>{caption}</span></a>'
    )


def badge_matrix():
    """{lang: {"light": html, "dark": html}} for exactly the seven languages BADGE_TEXT covers --
    embedded directly into promo/badge.js (write_badge_js()), the single source of truth both this
    site's own live preview and every external embed render from. Deliberately not keyed by the
    ten locales spec/rules/locale-resolution.md accepts: three language pairs (en-US/en-GB,
    de-DE/de-CH, fr/fr-CA) would otherwise ship two byte-identical entries each, for no benefit.
    """
    return {
        lang: {theme: badge_html(lang, theme) for theme in ("light", "dark")} for lang in BADGE_TEXT
    }


def write_badge_js(out_dir):
    """promo/badge.js -- served at SITE_ORIGIN/badge.js, the same two-line embed shape as
    vatnode.dev's own badge (`<script async src=".../badge.js"></script>` plus a `<span
    data-...>`): an external site sets `data-polytypo-lang`/`data-polytypo-theme` on a `<span>`,
    this script finds every such span on the page and fills it in. `lang`, not `locale`: the
    caption text is keyed by language (see BADGE_TEXT), so a `de-DE` vs `de-CH` distinction would
    be a parameter that never changes anything -- honest naming over the ten-locale-count vanity
    that most polytypo copy otherwise correctly emphasizes. No network call, no per-embed fetch --
    the whole render table (badge_matrix()) ships inside this one file, so rendering is
    synchronous and works offline once loaded. `window.PolytypoBadge.render()` is also what this
    site's own picker (badge_section_html(), every page) calls after changing the preview span's
    attributes, so the live preview and every real embed run through the exact same code path.
    """
    matrix_json = json.dumps(badge_matrix(), ensure_ascii=False).replace("</", "<\\/")
    content = f"""(function () {{
  var MATRIX = {matrix_json};
  var DEFAULT_LANG = "en";
  var DEFAULT_THEME = "light";

  function render(el) {{
    var byLang = MATRIX[el.getAttribute("data-polytypo-lang")] || MATRIX[DEFAULT_LANG];
    var theme = el.getAttribute("data-polytypo-theme") || DEFAULT_THEME;
    el.innerHTML = byLang[theme] || byLang[DEFAULT_THEME];
  }}

  function init() {{
    var els = document.querySelectorAll("[data-polytypo-lang]");
    for (var i = 0; i < els.length; i++) render(els[i]);
  }}

  if (document.readyState === "loading") {{
    document.addEventListener("DOMContentLoaded", init);
  }} else {{
    init();
  }}

  window.PolytypoBadge = {{init: init, render: render}};
}})();
"""
    with open(os.path.join(out_dir, "badge.js"), "w", encoding="utf-8") as f:
        f.write(content)
    print("  promo/badge.js")


def build_badge_script(prefix):
    """The badge picker's own wiring, emitted on every page (badge_section_html() is now called
    for every page in build(), not just "docs"): a language <select> (the seven BADGE_TEXT keys,
    not the ten locales -- see badge_matrix()) and a light/dark toggle drive a live `<span
    data-polytypo-lang data-polytypo-theme>` preview via `window.PolytypoBadge` (loaded
    synchronously here, not `async`, so it is guaranteed ready before this script runs -- an
    external embedder is told to use `async` for their own page's load performance, but this page
    controls its own script order already). The copy-code box always shows the real two-line
    embed -- `<script async src=".../badge.js">` is built via string concatenation, never a
    literal "</script>" substring, so it cannot prematurely close this containing <script> tag.
    """
    options = "".join(
        f'<option value="{H.escape(lang)}">{H.escape(name)}</option>'
        for lang, name in BADGE_LANG_NAMES.items()
    )
    return f"""<script src="{prefix}badge.js"></script>
<script>
(function () {{
  var langSel = document.getElementById("badge-lang");
  langSel.innerHTML = {json.dumps(options)};
  var themeButtons = [].slice.call(document.querySelectorAll("#badge-theme-tabs button"));
  var preview = document.getElementById("badge-preview");
  var codeEl = document.getElementById("badge-code");
  var copyBtn = document.getElementById("badge-copy");
  var theme = "light";

  function snippet() {{
    return '<script async src="{SITE_ORIGIN}/badge.js"><' + '/script>\\n' +
      '<span data-polytypo-lang="' + langSel.value + '" data-polytypo-theme="' + theme + '"></span>';
  }}
  function render() {{
    preview.setAttribute("data-polytypo-lang", langSel.value);
    preview.setAttribute("data-polytypo-theme", theme);
    window.PolytypoBadge.render(preview);
    codeEl.textContent = snippet();
  }}
  langSel.addEventListener("change", render);
  themeButtons.forEach(function (b) {{
    b.addEventListener("click", function () {{
      theme = b.dataset.theme;
      themeButtons.forEach(function (o) {{ o.setAttribute("aria-pressed", String(o === b)); }});
      render();
    }});
  }});
  copyBtn.addEventListener("click", function () {{
    navigator.clipboard.writeText(codeEl.textContent).then(function () {{
      var was = copyBtn.textContent;
      copyBtn.textContent = "Copied";
      setTimeout(function () {{ copyBtn.textContent = was; }}, 1500);
    }});
  }});
  render();
}})();
</script>"""


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
