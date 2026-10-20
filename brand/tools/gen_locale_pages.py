"""One documentation page per locale, at /locales/<code>/.

Every fact on a page comes from spec/locales/<code>.json (data and `sources`), spec/locales/
registry.json (aliases), spec/rules/order.json (which rule reads which field) or
promo/locale-examples.json (engine output for the spec's own conformance fixtures, written by
`npx tsx brand/tools/gen_examples.ts`). Nothing is typed per locale: a page for a locale added to
the registry appears with the next build, and a claim the data does not make is not made.

build_promo.py owns the page shell; this module returns the page body. The rendering helpers that
live there (reveal, specimen, diff_html) are passed in so the two modules do not import each other.
"""
import html as H
import json
import os
import re
import sys
import unicodedata
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from locale_order import sorted_codes  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
SPEC = os.path.join(REPO, "spec")
LOCALE_EXAMPLES = os.path.join(REPO, "promo", "locale-examples.json")


def _load(*parts):
    with open(os.path.join(*parts), encoding="utf-8") as f:
        return json.load(f)


NATIVE = _load(HERE, "locale_native_names.json")
REGISTRY = _load(SPEC, "locales", "registry.json")
# A locale the installed engine rejects has no examples (gen_examples.ts drops it by design), and a
# page is never written without them: it appears with the build that has an engine that knows it.
CODES = sorted_codes(
    [c for c in REGISTRY["locales"] if c in _load(LOCALE_EXAMPLES)["locales"]]
)
ALIASES = REGISTRY["aliases"]
RULES = _load(SPEC, "rules", "order.json")["rules"]
CODE_RUN = 'say("a -- b ...")'  # must match gen_examples.ts

DASHES = {
    "em-tight": "an em dash (U+2014) with no surrounding spaces",
    "em-spaced": "an em dash (U+2014) with a space on each side",
    "en-tight": "an en dash (U+2013) with no surrounding spaces",
    "en-spaced": "an en dash (U+2013) with a space on each side",
    "none": "no substitution: the locale has no verified convention, so the rule writes nothing",
}
DASH_SHORT = {
    "em-tight": "unspaced em dash",
    "em-spaced": "spaced em dash",
    "en-tight": "unspaced en dash",
    "en-spaced": "spaced en dash",
    "none": "no dash substitution",
}
INNER_SPACE = {
    "none": "no space inside the marks",
    "nbsp": "U+00A0 no-break space inside the marks",
    "narrow-nbsp": "U+202F narrow no-break space inside the marks",
}
INITIAL_BINDING = {
    "none": "disabled: initials are never bound to the name that follows",
    "chain": "a sequence of two or more adjacent initials is bound; a lone initial next to an ordinary capitalised word is left alone",
    "single": "a lone initial is bound to the following word as well as a chain of initials",
}
NBSP_LISTS = [
    ("beforePunctuation", "Characters that take U+00A0 before them"),
    ("narrowBeforePunctuation", "Characters that take U+202F before them"),
    ("afterShortWords", "Short words after which the space becomes U+00A0, so the word is not left at the end of a line"),
    ("abbreviations", "Multi-token abbreviations whose internal spaces become U+00A0"),
    ("beforeUnits", "Units and signs bound to the preceding number with U+00A0"),
    ("beforeNumber", "Abbreviations bound to the following number with U+00A0"),
    ("beforeWord", "Abbreviations bound to the following word with U+00A0"),
    ("afterSymbols", "Symbols bound to the following number with U+00A0"),
]
LONG_LIST = 40
# (rule id, section anchor) for the worked-example groups, in the order the sections appear.
SECTION_RULES = {
    "quotes": ["quotes"],
    "apostrophes": ["apostrophe"],
    "dashes": ["dashes", "ranges"],
    "ellipsis": ["ellipsis"],
    "hyphens": ["hyphen"],
    "spacing": ["spaces", "nbsp"],
    "symbols": ["symbols"],
}


def locale_data(code):
    return _load(SPEC, "locales", f"{code}.json")


def fixture_count(code):
    return len(_load(SPEC, "fixtures", f"{code}.json")["cases"])


def examples():
    return _load(LOCALE_EXAMPLES)


def _lang(code):
    return code.split("-")[0]


def _glyph(ch, reveal):
    name = unicodedata.name(ch, "")
    return (
        f'<span class="glyph">{reveal(ch)}</span> <code>U+{ord(ch):04X}</code>'
        f'<span class="muted small"> {H.escape(name.lower())}</span>'
    )


def _quote_pair_text(pair):
    return f"{pair['open']}…{pair['close']}"


def native_name(code):
    return NATIVE[code]


def _codes(chars):
    return " ".join(f"<code>{H.escape(c)}</code>" for c in chars)


def quick_answer(d):
    """Two or three plain sentences stating the locale's main conventions, every clause read from
    the locale file."""
    q, dash, nb = d["quotes"], d["dash"], d["nbsp"]
    name = H.escape(d["name"])
    p, s2 = q["primary"], q["secondary"]
    inner = ""
    if p["innerSpace"] != "none" or s2["innerSpace"] != "none":
        inner = f", with {INNER_SPACE[p['innerSpace']]}"
        if s2["innerSpace"] != p["innerSpace"]:
            inner += f" (secondary: {INNER_SPACE[s2['innerSpace']]})"
    out = [
        f"{name} sets primary quotation marks as <code>{H.escape(_quote_pair_text(p))}</code> and "
        f"secondary quotation marks as <code>{H.escape(_quote_pair_text(s2))}</code>{inner}."
    ]
    par = (
        f"A break in a sentence is written with {DASHES[dash['parenthetical']]}"
        if dash["parenthetical"] != "none"
        else "No parenthetical dash convention is verified, so none is substituted"
    )
    rng = (
        f"number and date ranges take {DASHES[dash['range']]}"
        if dash["range"] != "none"
        else "no single range convention is verified, so none is substituted"
    )
    out.append(f"{par}; {rng}.")
    parts = []
    if nb["beforePunctuation"]:
        parts.append(f"U+00A0 goes before {_codes(nb['beforePunctuation'])}")
    if nb["narrowBeforePunctuation"]:
        parts.append(f"U+202F goes before {_codes(nb['narrowBeforePunctuation'])}")
    if not parts and nb["beforeUnits"]:
        parts.append(f"numbers bind to units such as {_codes(nb['beforeUnits'][:3])} with U+00A0")
    if parts:
        out.append("; ".join(parts)[0].upper() + "; ".join(parts)[1:] + ".")
    return " ".join(out)


def pages():
    """One page record per registered locale, in the site-wide locale order (locale_order.py)."""
    out = []
    for code in CODES:
        d = locale_data(code)
        q = d["quotes"]
        out.append(
            {
                "slug": f"locales/{code}",
                "code": code,
                "name": d["name"],
                "title": f"{d['name']} ({code})",
                "seo_title": (
                    f"{d['name']} typography rules: {_quote_pair_text(q['primary'])} quotes, "
                    f"{DASH_SHORT[d['dash']['parenthetical']]} | polytypo"
                ),
                "description": (
                    f"{d['name']} ({code}): quotation marks {_quote_pair_text(q['primary'])} and "
                    f"{_quote_pair_text(q['secondary'])}, {DASH_SHORT[d['dash']['parenthetical']]} "
                    f"for breaks; {len({s['cite'] for s in d['sources']})} cited sources, "
                    f"{fixture_count(code)} tested examples."
                ),
                "trail": [("Home", ""), ("Locales", "locales/")],
                "jsonld_extra": {
                    "inLanguage": "en",
                    "about": {
                        "@type": "Thing",
                        "name": f"{d['name']} typography",
                        "alternateName": native_name(code),
                    },
                    "citation": [s["cite"] for s in d["sources"]],
                },
            }
        )
    return out


def resolution_rows(code, tags):
    """Classify each tag by the path locale-resolution.md §3.4 takes for it. Classification only
    reads the registry; the engine confirmed each tag resolves here (gen_examples.ts)."""

    def canonical(tag):
        t = tag.replace("_", "-")
        if len(t) >= 2:
            t = t[:2].lower() + t[2:]
        if len(t) == 5 and t[2] == "-":
            t = t[:3] + t[3:].upper()
        return t

    rows = []
    for tag in tags:
        c = canonical(tag)
        if c == code:
            how = "registered locale" if c == tag else "registered locale, after case and separator normalisation"
        elif ALIASES.get(c) == code:
            how = "declared alias" if c == tag else "declared alias, after case and separator normalisation"
        else:
            base = c[:2]
            how = "region removed, then the registered locale" if base == code else "region removed, then a declared alias"
        rows.append((tag, how))
    return rows


def _chips(items, long_label):
    if not items:
        return '<span class="muted">none</span>'
    texts = [f"{i['left']} · {i['elided']} · {i['right']}" if isinstance(i, dict) else i for i in items]
    chips = '<span class="chips">' + " ".join(f"<code>{H.escape(t)}</code>" for t in texts) + "</span>"
    if len(items) > LONG_LIST:
        return f"<details><summary>{len(items)} entries — {H.escape(long_label)}</summary>{chips}</details>"
    return chips


def _example_cards(cases, h):
    cards = []
    for c in cases:
        before, after = h.diff_html(c["in"], c["out"])
        opts = []
        if "rules" in c:
            opts.append("rules: " + json.dumps(c["rules"]))
        if "narrowNbsp" in c:
            opts.append(f"narrowNbsp: {json.dumps(c['narrowNbsp'])}")
        extra = f'<p class="small muted">options: {H.escape("; ".join(opts))}</p>' if opts else ""
        cards.append(
            f'<div class="card"><div class="lang">{H.escape(c["id"])}</div>'
            f'<div class="pair">{h.specimen(before, "in")}{h.specimen(after, "out")}</div>{extra}</div>'
        )
    return f'<div class="card-grid card-grid--two">{"".join(cards)}</div>'


def _rule_examples(ex, rule_ids, h):
    parts = []
    for rid in rule_ids:
        cases = ex["byRule"].get(rid)
        if not cases:
            continue
        note = ""
        if rid == "ranges":
            note = (
                "<p>The <code>ranges</code> rule is off by default; these cases enable it with "
                "<code>rules: { ranges: true }</code>.</p>"
            ) if all(c.get("rules", {}).get("ranges") for c in cases) else ""
        parts.append(f"<h3><code>{rid}</code></h3>{note}{_example_cards(cases, h)}")
    return "".join(parts)


def _kv(rows):
    body = "".join(f"<tr><th>{k}</th><td>{v}</td></tr>" for k, v in rows)
    return f'<div class="scroll"><table class="kv">{body}</table></div>'


def _h2(anchor, title):
    return (
        f'<h2 id="{anchor}">{H.escape(title)} '
        f'<a class="anchor" href="#{anchor}" aria-label="Link to this section">#</a></h2>'
    )


def _flatten(d, prefix=""):
    out = {}
    for k, v in d.items():
        path = f"{prefix}{k}"
        if isinstance(v, dict):
            out.update(_flatten(v, path + "."))
        else:
            out[path] = v
    return out


def _compare_section(code, d, ex, h, prefix):
    cmp = ex["compare"]
    other = cmp["neighbour"]
    od = locale_data(other)
    a = _flatten({k: v for k, v in d.items() if k not in ("locale", "name", "sources")})
    b = _flatten({k: v for k, v in od.items() if k not in ("locale", "name", "sources")})
    rows = []
    for path in a:
        if a[path] == b.get(path):
            continue
        if isinstance(a[path], list):
            only_here = [i for i in a[path] if i not in b[path]]
            only_there = [i for i in b[path] if i not in a[path]]
            here = _chips(only_here, "only here") if only_here else '<span class="muted">—</span>'
            there = _chips(only_there, "only there") if only_there else '<span class="muted">—</span>'
            label = f"<code>{path}</code> <span class='muted small'>(entries only in one)</span>"
        else:
            here = f"<code>{h.reveal(str(a[path]))}</code>"
            there = f"<code>{h.reveal(str(b[path]))}</code>"
            label = f"<code>{path}</code>"
        rows.append(f"<tr><td>{label}</td><td>{here}</td><td>{there}</td></tr>")
    before, after = h.diff_html(cmp["in"], cmp["out"])
    _b2, other_after = h.diff_html(cmp["in"], cmp["neighbourOut"])
    table = (
        '<div class="scroll"><table class="kv"><tr><th>Field</th>'
        f"<th>{H.escape(code)}</th><th>{H.escape(other)}</th></tr>{''.join(rows)}</table></div>"
        if rows
        else "<p>The two locale files hold identical data.</p>"
    )
    link = f'<a href="{prefix}locales/{other}/">{H.escape(other)}</a>'
    return (
        _h2("compare", f"How does {d['name']} differ from {od['name']}?")
        + f"<p>{H.escape(code)} and {link} are separate locales. Fields whose values differ:</p>"
        + table
        + "<p>The same input through both:</p>"
        + f'<div class="card"><div class="lang">input</div><div class="pair pair--solo">{h.specimen(before, "in")}</div></div>'
        + '<div class="card-grid card-grid--two">'
        + f'<div class="card"><div class="lang">{H.escape(code)}</div><div class="pair pair--solo">{h.specimen(after, "out")}</div></div>'
        + f'<div class="card"><div class="lang">{H.escape(other)}</div><div class="pair pair--solo">{h.specimen(other_after, "out")}</div></div>'
        + "</div>"
    )


def _modes_section(ex, h, n):
    rows = []
    claims = {}
    for m in ex["modes"]:
        before, after = h.diff_html(m["in"], m["out"])
        rows.append(
            f'<div class="card"><div class="lang">{H.escape(m["mode"])}</div>'
            f'<div class="pair">{h.specimen(before, "in")}{h.specimen(after, "out")}</div></div>'
        )
        claims[m["mode"]] = CODE_RUN in m["out"]
    kept = [m for m in ("html", "markdown") if claims.get(m)]
    sentence = (
        "<p>Each input is the locale's sample sentence followed by a code run, "
        f"<code>{H.escape(CODE_RUN)}</code>."
    )
    if not claims.get("text"):
        sentence += " <code>text</code> mode sets the whole string as prose, code run included."
    if kept:
        sentence += (
            f" In {' and '.join('<code>' + m + '</code>' for m in kept)} mode the code run comes back "
            "byte for byte; only the prose is set."
        )
    sentence += "</p>"
    return _h2("modes", f"How does {n} text behave in text, HTML and Markdown modes?") + sentence + f'<div class="card-grid">{"".join(rows)}</div>'


_URL_RE = re.compile(r"https?://[^\s)»]+")
_SPACED_DATE_RE = re.compile(r"\b(\d{1,2})\. (\d{1,2})\. (\d{4})\b")
_SHORT_URL = 40


def _linkify(text):
    """Escape `text` and turn each URL in it into a link; a long URL shows only its host."""
    out, last = [], 0
    for m in _URL_RE.finditer(text):
        url = m.group(0).rstrip(".,;:")
        end = m.start() + len(url)
        out.append(H.escape(text[last : m.start()]))
        shown = url if len(url) <= _SHORT_URL else urlparse(url).netloc
        out.append(f'<a href="{H.escape(url, quote=True)}" rel="noopener">{H.escape(shown)}</a>')
        last = end
    out.append(H.escape(text[last:]))
    return "".join(out)


def _tight_dates(text):
    """'19. 10. 2026' -> '19.10.2026': the shown date format never has spaces after the dots."""
    return _SPACED_DATE_RE.sub(r"\1.\2.\3", text)


def _sources_section(d, code):
    order = [r["id"] for r in RULES]
    by_rule = {}
    for s in d["sources"]:
        by_rule.setdefault(s["rule"], []).append(s)
    parts = []
    for rid in sorted(by_rule, key=lambda r: order.index(r)):
        items = []
        for s in by_rule[rid]:
            url = s.get("url", "")
            link = ""
            if urlparse(url).scheme in ("http", "https"):
                link = (
                    f' <a href="{H.escape(url, quote=True)}" rel="noopener">'
                    f"{H.escape(urlparse(url).netloc)}</a>"
                )
            note = f'<p class="small muted">{H.escape(_tight_dates(s["note"]))}</p>' if s.get("note") else ""
            items.append(f'<li><span lang="{_lang(code)}">{_linkify(s["cite"])}</span>{link}{note}</li>')
        parts.append(f'<h3><code>{rid}</code></h3><ul class="sources">{"".join(items)}</ul>')
    n = len(d["sources"])
    return (
        _h2("sources", f"Which sources define {d['name']} typography?")
        + f"<p>{n} citation{'s' if n != 1 else ''} in <code>spec/locales/{H.escape(code)}.json</code>, "
        "grouped by the rule each one supports. A citation names the authority; the note records what "
        "the source does and does not settle.</p>" + "".join(parts)
    )


def _split_name(name):
    """'English (United States)' -> ('English', 'United States'); 'French' -> ('French', None)."""
    if name.endswith(")") and " (" in name:
        lang, _, rest = name.partition(" (")
        return lang, rest[:-1]
    return name, None


def _nav_row(p, prefix, code, label):
    current = ' aria-current="page"' if p["code"] == code else ""
    return (
        f'<li><a href="{prefix}{p["slug"]}/"{current}><span>{H.escape(label)}</span>'
        f'<code>{H.escape(p["code"])}</code></a></li>'
    )


def _sidebar(code, prefix, all_pages):
    """Locales in the site-wide order, with every language that has more than one locale grouped
    under its name; the locale named by the language alone (French) is that group's "Base"."""
    parts = []
    i = 0
    while i < len(all_pages):
        lang, _variant = _split_name(all_pages[i]["name"])
        j = i
        while j < len(all_pages) and _split_name(all_pages[j]["name"])[0] == lang:
            j += 1
        group = all_pages[i:j]
        if len(group) > 1:
            rows = "".join(_nav_row(p, prefix, code, _split_name(p["name"])[1] or "Base") for p in group)
            parts.append(f'<li class="nav-group"><span>{H.escape(lang)}</span><ul>{rows}</ul></li>')
        else:
            parts.extend(_nav_row(p, prefix, code, p["name"]) for p in group)
        i = j
    return (
        '<details class="doc-nav"><summary>Locales</summary><nav aria-label="Locales">'
        f'<a class="nav-top" href="{prefix}locales/">All locales</a><ul class="nav-flat">{"".join(parts)}</ul>'
        f'<a class="nav-cta" href="{prefix}contribute/"><strong>Are you a developer?</strong> '
        "<span>Add your locale and contribute to polytypo ⇨</span></a></nav></details>"
    )


def _try_section(code, name, prefix):
    return (
        f'<section id="try">'
        f"<h2>Run polytypo with {H.escape(name)} rules</h2>"
        f"<p>Edit the text and polytypo typesets it with the <code>{H.escape(code)}</code> locale, "
        "in your browser. The code under the form is the call that produces the result.</p>"
        "{{playground}}"
        f'<p class="small muted">Other locales, and all the options, are in the '
        f'<a href="{prefix}playground/?locale={H.escape(code)}">full playground</a>.</p>'
        "</section>"
    )


def _pager_link(rel, href, title):
    label = "Previous" if rel == "prev" else "Next"
    return (
        f'<a class="pg {rel}" rel="{rel}" href="{href}"><span>{label}</span>'
        f"<strong>{H.escape(title)}</strong></a>"
    )


def body(page, prefix, h, all_pages):
    """The page body for one locale. `h` supplies reveal, specimen and diff_html."""
    code = page["code"]
    d = locale_data(code)
    ex = examples()["locales"][code]
    n = d["name"]
    q, dash, ell, hy, nb = d["quotes"], d["dash"], d["ellipsis"], d["hyphen"], d["nbsp"]
    cites = d["sources"]
    cited_rules = ", ".join(f"<code>{r}</code>" for r in dict.fromkeys(s["rule"] for s in cites))

    glance = _kv(
        [
            ("Tag", f"<code>{H.escape(code)}</code>"),
            ("Name", H.escape(d["name"])),
            ("Primary quotes", f"{_glyph(q['primary']['open'], h.reveal)} … {_glyph(q['primary']['close'], h.reveal)}"),
            ("Secondary quotes", f"{_glyph(q['secondary']['open'], h.reveal)} … {_glyph(q['secondary']['close'], h.reveal)}"),
            ("Parenthetical dash", H.escape(DASH_SHORT[dash["parenthetical"]])),
            ("Range dash", H.escape(DASH_SHORT[dash["range"]])),
            ("Rules with citations", cited_rules),
            ("Conformance cases", str(fixture_count(code))),
        ]
    )

    aliases_here = [a for a, v in ALIASES.items() if v == code]
    res_rows = resolution_rows(code, ex["resolution"])
    resolution = (
        _h2("resolution", f"Which locale tags resolve to {n}?")
        + "<p>The locale option is resolved exactly, then by declared alias, then by dropping the region once; "
        "anything else throws <code>POLYTYPO_UNKNOWN_LOCALE</code>.</p>"
        + (
            f"<p>Declared alias{'es' if len(aliases_here) != 1 else ''}: "
            + ", ".join(f"<code>{H.escape(a)}</code>" for a in aliases_here)
            + f" → <code>{H.escape(code)}</code>.</p>"
            if aliases_here
            else ""
        )
        + '<div class="scroll"><table class="kv"><tr><th>Tag</th><th>How it resolves</th></tr>'
        + "".join(f"<tr><td><code>{H.escape(t)}</code></td><td>{H.escape(how)}</td></tr>" for t, how in res_rows)
        + "</table></div>"
    )

    pair_rows = _kv(
        [
            ("Primary", f"{_glyph(q['primary']['open'], h.reveal)} … {_glyph(q['primary']['close'], h.reveal)} — {H.escape(INNER_SPACE[q['primary']['innerSpace']])}"),
            ("Secondary", f"{_glyph(q['secondary']['open'], h.reveal)} … {_glyph(q['secondary']['close'], h.reveal)} — {H.escape(INNER_SPACE[q['secondary']['innerSpace']])}"),
        ]
    )
    elision = ""
    if q["elisionIdioms"]:
        idioms = "".join(
            f"<tr><td><code>{H.escape(i['left'])}</code></td><td><code>{H.escape(i['elided'])}</code></td>"
            f"<td><code>{H.escape(i['right'])}</code></td></tr>"
            for i in q["elisionIdioms"]
        )
        elision += (
            "<h3>Elision idioms</h3><p>When a narrow quote pair matches one of these exactly, the marks are "
            "not paired as a quotation.</p>"
            f'<div class="scroll"><table class="kv"><tr><th>Before</th><th>Elided</th><th>After</th></tr>{idioms}</table></div>'
        )
    clit = q["elisionClitics"]
    if clit["before"] or clit["after"]:
        elision += (
            "<h3>Elision clitics</h3><p>Word fragments that stand against an apostrophe at the edge of an "
            "inline span; a narrow mark next to one is not paired as a quotation.</p>"
            + _kv([("Before the apostrophe", _chips(clit["before"], "before")), ("After the apostrophe", _chips(clit["after"], "after"))])
        )
    quotes = _h2("quotes", f"Which quotation marks does {n} use?") + pair_rows + elision + _rule_examples(ex, SECTION_RULES["quotes"], h)

    apos = _rule_examples(ex, SECTION_RULES["apostrophes"], h)
    apostrophes = (_h2("apostrophe", f"How are apostrophes set in {n}?") + apos) if apos else ""

    dashes = (
        _h2("dashes", f"Which dashes does {n} use for breaks and ranges?")
        + _kv(
            [
                ("Parenthetical break (<code>dash.parenthetical</code>)", H.escape(DASHES[dash["parenthetical"]])),
                ("Between numbers and dates (<code>dash.range</code>)", H.escape(DASHES[dash["range"]])),
            ]
        )
        + "<p>The <code>dashes</code> rule reads the parenthetical convention. The <code>ranges</code> rule "
        "reads the range convention and is off by default.</p>"
        + _rule_examples(ex, SECTION_RULES["dashes"], h)
    )

    ellipsis = (
        _h2("ellipsis", f"How is the ellipsis set in {n}?")
        + (
            "<p>An ellipsis directly after <code>!</code> or <code>?</code> is written with two dots rather than three.</p>"
            if ell["abbreviatedAfterTerminal"]
            else "<p>An ellipsis keeps its full form after <code>!</code> and <code>?</code>; this locale does not abbreviate it there.</p>"
        )
        + _rule_examples(ex, SECTION_RULES["ellipsis"], h)
    )

    if hy["prefixes"] or hy["suffixes"] or hy["compounds"]:
        hyphens = (
            _h2("hyphens", f"How are hyphens handled in {n}?")
            + "<p>Morphological forms whose hyphen is bound with U+2011 so it cannot break across lines.</p>"
            + _kv(
                [
                    ("Prefixes", _chips(hy["prefixes"], "prefixes")),
                    ("Suffixes", _chips(hy["suffixes"], "suffixes")),
                    ("Compounds", _chips(hy["compounds"], "compounds")),
                ]
            )
            + _rule_examples(ex, SECTION_RULES["hyphens"], h)
        )
    else:
        hyphens = _h2("hyphens", f"How are hyphens handled in {n}?") + "<p>The hyphen lists are empty for this locale, so the <code>hyphen</code> rule changes nothing.</p>"

    spacing_rows = [(label + f" (<code>nbsp.{key}</code>)", _chips(nb[key], label)) for key, label in NBSP_LISTS]
    spacing_rows.append(("Initials (<code>nbsp.initialBinding</code>)", f"<code>{nb['initialBinding']}</code> — {H.escape(INITIAL_BINDING[nb['initialBinding']])}"))
    spacing = (
        _h2("spacing", f"Where does {n} use no-break spaces?")
        + _kv(spacing_rows)
        + _rule_examples(ex, SECTION_RULES["spacing"], h)
    )

    sym = _rule_examples(ex, SECTION_RULES["symbols"], h)
    symbols = (_h2("symbols", f"How are symbols set in {n}?") + sym) if sym else ""

    compare = _compare_section(code, d, ex, h, prefix) if ex["compare"] else ""

    idx = all_pages.index(page)
    pager = []
    if idx > 0:
        p = all_pages[idx - 1]
        pager.append(_pager_link("prev", f'{prefix}{p["slug"]}/', p["title"]))
    if idx < len(all_pages) - 1:
        p = all_pages[idx + 1]
        pager.append(_pager_link("next", f'{prefix}{p["slug"]}/', p["title"]))

    crumbs = f'<nav class="crumbs" aria-label="Breadcrumb"><a href="{prefix}">Home</a> / <a href="{prefix}locales/">Locales</a> / {H.escape(code)}</nav>'
    return (
        f'<div class="doc-layout">{_sidebar(code, prefix, all_pages)}<article class="doc">'
        f"{crumbs}<h1>{H.escape(d['name'])} typography rules <span class=\"muted\">&middot; {H.escape(code)}</span></h1>"
        f'<p class="muted" lang="{_lang(code)}">{H.escape(native_name(code))}</p>'
        f'<p class="doc-lead">{quick_answer(d)}</p>'
        + h.updated()
        + _try_section(code, d["name"], prefix)
        + _h2("at-a-glance", f"{n} typography at a glance")
        + glance
        + resolution
        + quotes
        + apostrophes
        + dashes
        + ellipsis
        + hyphens
        + spacing
        + symbols
        + _modes_section(ex, h, n)
        + compare
        + _sources_section(d, code)
        + f'<nav class="doc-pager" aria-label="Pager">{"".join(pager)}</nav></article></div>'
    )
