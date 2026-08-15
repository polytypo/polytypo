#!/usr/bin/env python3
"""Build brand/BRANDBOOK.html: inlines every SVG asset and subsets both brand fonts,
so the document is a single self-contained file."""
import base64
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BRAND = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import gen_svg as G  # noqa: E402

INK, PAPER, RED, GREY = G.INK, G.PAPER, G.RED, "#8B9098"
MX, MY, MW, MH = G.MARK_BBOX

UNICODES = (
    "U+0020-007E,U+00A0-00FF,U+0100-017F,U+0300-0301,U+0400-045F,"
    "U+2000-206F,U+2116,U+2032-2033,U+20AC,U+2122,U+00D7,U+2212"
)


# ------------------------------------------------------------------ fonts
def font_face(path, family, weights):
    from fontTools import subset

    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["kern", "liga", "calt", "ccmp", "locl"]
    options.desubroutinize = False
    options.drop_tables += ["DSIG"]
    font = subset.load_font(path, options)
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=subset.parse_unicodes(UNICODES))
    subsetter.subset(font)
    buf = io.BytesIO()
    subset.save_font(font, buf, options)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return (
        f"@font-face{{font-family:'{family}';font-weight:{weights};font-style:normal;"
        f"font-display:swap;src:url(data:font/woff2;base64,{b64}) format('woff2-variations')}}"
    )


def fonts_css():
    return (
        font_face(G.ensure_font("Inter.ttf"), "Inter Brand", "100 900")
        + font_face(G.ensure_font("JBMono.ttf"), "JB Mono Brand", "100 800")
    )


# ------------------------------------------------------------------ helpers
_uid = [0]


def inline(rel):
    """Inline an asset SVG, making its aria ids unique."""
    with open(os.path.join(BRAND, rel), encoding="utf-8") as f:
        svg = f.read().strip()
    _uid[0] += 1
    n = _uid[0]
    svg = svg.replace('aria-labelledby="t d"', f'aria-labelledby="t{n} d{n}"')
    svg = svg.replace('id="t"', f'id="t{n}"').replace('id="d"', f'id="d{n}"')
    return svg


def mark(color=INK, sw=G.SW, dash=G.DASH):
    return G.mark_body(color, sw=sw, dash=dash)


def wrap(vb, body, style="", cls=""):
    return f'<svg viewBox="{vb}" class="{cls}" style="{style}" xmlns="http://www.w3.org/2000/svg">{body}</svg>'


# ------------------------------------------------------------- construction
def construction():
    grid = []
    for x in range(0, 201, 10):
        grid.append(f'<line x1="{x}" y1="0" x2="{x}" y2="120"/>')
    for y in range(0, 121, 10):
        grid.append(f'<line x1="0" y1="{y}" x2="200" y2="{y}"/>')
    g = (
        f'<g stroke="{GREY}" stroke-width="0.35" opacity=".45">{"".join(grid)}</g>'
        f'<rect x="0" y="0" width="200" height="120" fill="none" stroke="{GREY}" stroke-width="0.8"/>'
        f'<line x1="0" y1="60" x2="200" y2="60" stroke="{RED}" stroke-width="0.6" stroke-dasharray="3 3" opacity=".8"/>'
        + mark(INK)
    )
    # dimensions
    dim = (
        f'<g stroke="{RED}" stroke-width="0.7" fill="{RED}" font-size="6" '
        f'font-family="var(--mono)">'
        f'<line x1="58" y1="96" x2="142" y2="96"/>'
        f'<line x1="58" y1="92" x2="58" y2="100"/><line x1="142" y1="92" x2="142" y2="100"/>'
        f'<text x="100" y="107" text-anchor="middle">em dash 84</text>'
        f'<line x1="9.5" y1="30" x2="190.5" y2="30"/>'
        f'<line x1="9.5" y1="26" x2="9.5" y2="34"/><line x1="190.5" y1="26" x2="190.5" y2="34"/>'
        f'<text x="100" y="23" text-anchor="middle">ink width 181</text>'
        f'<line x1="196" y1="37.5" x2="196" y2="82.5"/>'
        f'<line x1="192" y1="37.5" x2="200" y2="37.5"/><line x1="192" y1="82.5" x2="200" y2="82.5"/>'
        f'<text x="204" y="62" font-size="6">45</text>'
        f'<text x="14" y="88" font-size="6">stroke 9</text>'
        f'<text x="150" y="88" font-size="6">apex 75.6°</text>'
        f"</g>"
    )
    return wrap("-6 14 232 104", g + dim, "width:100%;max-width:760px")


def clearspace():
    pad = 18.0
    body = (
        f'<rect x="{MX - pad}" y="{MY - pad}" width="{MW + pad * 2}" height="{MH + pad * 2}" '
        f'fill="none" stroke="{RED}" stroke-width="1" stroke-dasharray="5 4"/>'
        + mark(INK)
        + f'<g stroke="{RED}" stroke-width="0.8" fill="{RED}" font-size="8" font-family="var(--mono)">'
        f'<line x1="{MX - pad}" y1="{MY - pad + 4}" x2="{MX}" y2="{MY - pad + 4}"/>'
        f'<text x="{MX - pad / 2}" y="{MY - pad - 3}" text-anchor="middle">2X</text>'
        f'<rect x="{MX + 48}" y="{MY - pad - 12}" width="9" height="9" fill="{RED}"/>'
        f'<text x="{MX + 62}" y="{MY - pad - 4}">X = 9 = dash thickness</text>'
        f"</g>"
    )
    return wrap(f"{MX - pad - 14} {MY - pad - 26} {MW + pad * 2 + 28} {MH + pad * 2 + 34}",
                body, "width:100%;max-width:560px")


# ------------------------------------------------------------------ misuse
def misuse():
    vb = f"{MX - 8} {MY - 14} {MW + 16} {MH + 28}"
    cases = []

    def tile(body, title, note, vbox=vb):
        return (
            f'<figure class="dont"><div class="flag">Don’t</div>'
            f'<div style="background:var(--paper);border-radius:8px;padding:14px 10px">'
            f'{wrap(vbox, body, "width:100%")}</div>'
            f'<figcaption class="cap"><b>{title}</b> {note}</figcaption></figure>'
        )

    cases.append(tile(
        f'<g transform="translate({MX} 0) scale(1.0 1) translate({-MX} 0)">'
        f'<g transform="translate(0 60) scale(1 0.62) translate(0 -60)">{mark(INK)}</g></g>',
        "Never distort.", "The proportions are the logo. Scale uniformly or not at all."))

    cases.append(tile(
        f'<g transform="rotate(-12 100 60)">{mark(INK)}</g>',
        "Never rotate.", "Text does not lean. Neither does the mark."))

    cases.append(tile(
        G.mark_body(INK).rsplit("<rect", 1)[0] + f'<rect x="58" y="55.5" width="84" height="9" fill="{RED}"/>',
        "Never two-tone.", "One colour, always. The dash is not an accent."))

    cases.append(tile(
        f'<defs><filter id="sh"><feDropShadow dx="3" dy="4" stdDeviation="3" flood-opacity=".45"/></filter></defs>'
        f'<g filter="url(#sh)">{mark(INK)}</g>',
        "Never add effects.", "No shadow, glow, bevel, outline or gradient."))

    cases.append(tile(
        f'<g transform="translate(200 0) scale(-1 1)">{mark(INK)}</g>',
        "Never flip the chevrons.", "»—« is not a quotation. It is the opposite of one."))

    cases.append(tile(
        G.mark_body(INK).rsplit("<rect", 1)[0] + f'<rect x="88" y="55.5" width="24" height="9" fill="{INK}"/>',
        "Never shorten the dash.", "A hyphen in place of an em dash is the bug this project fixes."))

    cases.append(tile(
        f'<rect x="{MX - 4}" y="{MY - 6}" width="{MW + 8}" height="{MH + 12}" rx="10" fill="{RED}"/>'
        f'{mark(PAPER)}'
        f'<text x="{MX + 6}" y="{MY - 10}" font-size="13" font-family="var(--sans)" fill="{INK}">v1.0 release</text>',
        "Never crowd it.", "Clear space is 2X on every side, containers included."))

    cases.append(tile(
        f'<text x="100" y="76" text-anchor="middle" font-size="56" font-family="Georgia,serif" fill="{INK}">'
        f'«&#160;—&#160;»</text>',
        "Never type it.", "Typed in a text field, the logo becomes whatever font is installed."))

    return "".join(cases)


# ------------------------------------------------------------- applications
def app_readme():
    lock = inline("logo/polytypo-lockup-stacked.svg")
    lock = lock.replace("<svg ", '<svg style="width:180px;height:auto" ', 1)
    badges = "".join(
        f'<span style="display:inline-block;background:#E6E3DC;color:#5A6068;border-radius:4px;'
        f'padding:3px 9px;font-size:9px;font-family:var(--mono);margin:0 4px 0 0">{t}</span>'
        for t in ("npm v1.0.0", "MIT", "spec 1.0", "6 locales")
    )
    return (
        f'<div style="background:{PAPER};padding:34px 26px;text-align:center;color:{INK}">'
        f"{lock}"
        f'<p style="font-size:11.5px;color:#5A6068;margin:16px 0 12px;font-family:var(--sans)">'
        f"Locale-correct quotes, dashes, ellipses and no-break spaces.</p>{badges}</div>"
    )


def app_og():
    lock = inline("logo/polytypo-lockup.svg")
    lock = lock.replace("<svg ", '<svg style="width:62%;height:auto" ', 1)
    return (
        f'<div style="background:{PAPER};aspect-ratio:1200/630;display:flex;align-items:center;'
        f'justify-content:center;color:{INK}">{lock}</div>'
    )


def app_browser():
    fav = inline("logo/polytypo-favicon.svg").replace(
        "<svg ", '<svg style="width:14px;height:14px;flex:none" ', 1
    )
    return (
        f'<div style="background:#E6E3DC;padding:10px 10px 0;color:{INK}">'
        f'<div style="display:flex;align-items:center;gap:7px;background:{PAPER};border-radius:8px 8px 0 0;'
        f'padding:8px 12px;width:190px;font-family:var(--sans);font-size:11px">{fav}'
        f'<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">polytypo — microtypography</span></div>'
        f'<div style="background:{PAPER};padding:9px 12px;font-family:var(--mono);font-size:10px;color:#5A6068">'
        f"polytypo.dev</div></div>"
    )


def app_cli():
    return (
        f'<div style="background:{INK};color:{PAPER};padding:22px 20px;font-family:var(--mono);'
        f'font-size:11.5px;line-height:1.85">'
        f'<div style="color:#8B9098">$ npx polytypo --locale de README.md</div>'
        f'<div style="margin-top:10px;font-size:15px;letter-spacing:.02em">«—» polytypo '
        f'<span style="color:#8B9098;font-size:11.5px">v1.0.0</span></div>'
        f'<div style="color:#8B9098">spec 1.0 · locale de · mode markdown</div>'
        f'<div style="margin-top:8px">42 edits · 7 rules · 0 warnings</div></div>'
    )


# -------------------------------------------------------------------- build
def build():
    with open(os.path.join(HERE, "brandbook.template.html"), encoding="utf-8") as f:
        html = f.read()

    html = html.replace("{{fonts}}", fonts_css())
    html = html.replace("{{construction}}", construction())
    html = html.replace("{{clearspace}}", clearspace())
    html = html.replace("{{misuse}}", misuse())
    html = html.replace("{{app_readme}}", app_readme())
    html = html.replace("{{app_og}}", app_og())
    html = html.replace("{{app_browser}}", app_browser())
    html = html.replace("{{app_cli}}", app_cli())
    html = re.sub(r"\{\{svg:([^}]+)\}\}", lambda m: inline(m.group(1)), html)

    body = html
    doc = (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
        f"{body}\n</html>\n"
    )
    out = os.path.join(BRAND, "BRANDBOOK.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(doc)
    print(f"  BRANDBOOK.html  {os.path.getsize(out) / 1024:.0f} KB")

    # body-only copy (for embedding / publishing)
    frag = os.environ.get("BRANDBOOK_FRAGMENT")
    if frag:
        with open(frag, "w", encoding="utf-8") as f:
            f.write(body)
        print("  fragment:", frag)


if __name__ == "__main__":
    build()
