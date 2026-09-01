#!/usr/bin/env python3
"""Generate polytypo brand vector assets. Wordmark is outlined from Inter (OFL)."""
import hashlib
import os
import tempfile
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform

HERE = os.path.dirname(os.path.abspath(__file__))

# Fonts are OFL but not vendored into the repo (brand/tools/.gitignore: "*.ttf") — fetched on
# first run and cached next to the tools, so every build after the first is offline.
#
# The URL for each font is pinned to one immutable commit SHA in google/fonts — never `main`
# (rewritten continuously) and never a mutable tag or branch. Each entry's "sha256" is the
# expected hash of that exact commit's file content; ensure_font() below verifies it on every
# use, cached or freshly downloaded, and refuses to proceed on any mismatch.
#
# How these two pins were chosen (2026-08-28): `GET
# /repos/google/fonts/commits?path=<font path>&per_page=1` gave the latest commit that touched
# each file; the raw content at that commit's SHA was downloaded and independently hashed, and
# matched the sha256 below. Re-derive the same way to extend this table to a new font, or to
# move a pin forward after verifying the new commit's content by hash first.
FONTS = {
    "Inter.ttf": {
        "url": (
            "https://raw.githubusercontent.com/google/fonts/"
            "e1d6480102fed30739fead0faee463101f892c8f/"
            "ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf"
        ),
        "sha256": "29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031",
    },
    "JBMono.ttf": {
        "url": (
            "https://raw.githubusercontent.com/google/fonts/"
            "2e05c1cf00a6e4f40a4b931600a90881c26e15cd/"
            "ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf"
        ),
        "sha256": "48715a42ec242c21e9f02692891e147d022299a52e48d5e413e1a942193ffeda",
    },
}

FONT_DOWNLOAD_TIMEOUT_SECONDS = 30


def _sha256_of_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _default_download(url, timeout):
    """Real network fetch. Tests inject a fake in its place — see test_gen_svg.py."""
    import urllib.request

    with urllib.request.urlopen(url, timeout=timeout) as resp:  # noqa: S310 (pinned https URL)
        return resp.read()


def ensure_font(name, download=_default_download, timeout=FONT_DOWNLOAD_TIMEOUT_SECONDS):
    """Return a local path to `name`'s font bytes, verified against its pinned sha256.

    A cached file is re-verified on every call, not trusted because it exists — a corrupted or
    tampered cache is a loud failure here, never silently accepted and never silently
    re-downloaded out from under the caller. A fresh download is verified in memory before it
    ever touches the target path: bytes are written to a same-directory temp file and atomically
    renamed into place only after the checksum matches, so a failed or mismatched download can
    never leave a partial or wrong file at `name`'s path — either the pre-existing valid cache
    (untouched) or nothing.
    """
    if name not in FONTS:
        raise KeyError(f"no immutable source is registered for font {name!r} in FONTS")
    spec = FONTS[name]
    path = os.path.join(HERE, name)

    if os.path.exists(path):
        actual = _sha256_of_file(path)
        if actual != spec["sha256"]:
            raise RuntimeError(
                f"{name}: cached file at {path} does not match the pinned checksum "
                f"(expected {spec['sha256']}, got {actual}). Refusing to use a font that does "
                f"not match its immutable source — delete the cached file to force a fresh, "
                f"verified download, after confirming why it changed."
            )
        return path

    print(f"   fetching {name} from its pinned google/fonts commit ...")
    data = download(spec["url"], timeout)
    actual = hashlib.sha256(data).hexdigest()
    if actual != spec["sha256"]:
        raise RuntimeError(
            f"{name}: downloaded bytes do not match the pinned checksum "
            f"(expected {spec['sha256']}, got {actual}). Discarding the download; nothing was "
            f"written to {path}."
        )

    fd, tmp_path = tempfile.mkstemp(dir=HERE, prefix=f".{name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.replace(tmp_path, path)  # atomic on the same filesystem
    except BaseException:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise
    return path
OUT = os.environ.get("BRAND_OUT", os.path.dirname(HERE))  # brand/

INK = "#14161A"
PAPER = "#FBFAF7"
RED = "#D64027"

# ---------------------------------------------------------------- mark geometry
# Canonical grid: 200 x 120. Ink bbox: x 9.5..190.5, y 37.5..82.5 (181 x 45).
SW = 9.0
CHEVRONS = [
    "M28 42 L14 60 L28 78",
    "M44 42 L30 60 L44 78",
    "M172 42 L186 60 L172 78",
    "M156 42 L170 60 L156 78",
]
DASH = (58.0, 55.5, 84.0, 9.0)  # x, y, w, h
MARK_BBOX = (9.5, 37.5, 181.0, 45.0)


def mark_body(color, sw=SW, dash=DASH):
    paths = "".join(
        f'\n    <path d="{d}"/>' for d in CHEVRONS
    )
    x, y, w, h = dash
    return (
        f'\n  <g fill="none" stroke="{color}" stroke-width="{sw}" '
        f'stroke-linecap="round" stroke-linejoin="round">{paths}\n  </g>'
        f'\n  <rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{color}"/>'
    )


def svg(vb, body, title, desc, w=None, h=None, extra=""):
    dims = ""
    if w:
        dims = f' width="{w}" height="{h}"'
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"{dims} role="img" '
        f'aria-labelledby="t d"{extra}>\n  <title id="t">{title}</title>\n'
        f'  <desc id="d">{desc}</desc>{body}\n</svg>\n'
    )


# ------------------------------------------------------------------- wordmark
def build_wordmark(text="polytypo", weight=600, xheight=25.0, tracking=-0.008):
    font = TTFont(ensure_font("Inter.ttf"))
    font = instancer.instantiateVariableFont(font, {"wght": weight, "opsz": 32})
    upem = font["head"].unitsPerEm
    sx = font["OS/2"].sxHeight
    size = xheight * upem / sx
    scale = size / upem
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    kern = _kern_pairs(font)

    from fontTools.pens.boundsPen import BoundsPen

    pen_out = SVGPathPen(gs)
    bounds = BoundsPen(gs)
    x = 0.0
    prev = None
    for ch in text:
        gname = cmap[ord(ch)]
        if prev is not None:
            x += kern.get((prev, gname), 0) * scale
        t = Transform(scale, 0, 0, -scale, x, 0)
        gs[gname].draw(TransformPen(pen_out, t))
        gs[gname].draw(TransformPen(bounds, t))
        x += gs[gname].width * scale + tracking * size
        prev = gname
    width = x - tracking * size

    asc = font["OS/2"].sTypoAscender * scale
    desc = -font["OS/2"].sTypoDescender * scale
    bx0, by0, bx1, by1 = bounds.bounds
    return {
        "d": pen_out.getCommands(),
        "advance": width,
        "size": size,
        "asc": asc,
        "desc": desc,
        "top": by0,
        "bottom": by1,
        "left": bx0,
        "right": bx1,
    }


def _kern_pairs(font):
    """Flat kern pairs from GPOS pair positioning (Inter's lowercase pairs)."""
    pairs = {}
    if "GPOS" not in font:
        return pairs
    from fontTools.ttLib.tables import otTables

    gsub_lookups = font["GPOS"].table.LookupList.Lookup
    for lookup in gsub_lookups:
        for st in lookup.SubTable:
            if isinstance(st, otTables.PairPos) and st.Format == 1:
                first = st.Coverage.glyphs
                for gi, ps in zip(first, st.PairSet):
                    for pvr in ps.PairValueRecord:
                        v = getattr(pvr.Value1, "XAdvance", 0) or 0
                        if v:
                            pairs[(gi, pvr.SecondGlyph)] = v
            elif isinstance(st, otTables.PairPos) and st.Format == 2:
                c1 = st.ClassDef1.classDefs
                c2 = st.ClassDef2.classDefs
                cov = set(st.Coverage.glyphs)
                by_class1 = {}
                for g, c in c1.items():
                    by_class1.setdefault(c, []).append(g)
                by_class2 = {}
                for g, c in c2.items():
                    by_class2.setdefault(c, []).append(g)
                for i, rec1 in enumerate(st.Class1Record):
                    for j, rec2 in enumerate(rec1.Class2Record):
                        v = getattr(rec2.Value1, "XAdvance", 0) or 0
                        if not v:
                            continue
                        for g1 in by_class1.get(i, []):
                            if g1 not in cov:
                                continue
                            for g2 in by_class2.get(j, []):
                                pairs.setdefault((g1, g2), v)
    return pairs


# ------------------------------------------------------------------- writing
def w(path, content):
    full = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(content)
    print("  ", path)


def main():
    os.makedirs(OUT, exist_ok=True)
    wm = build_wordmark()
    mx, my, mw, mh = MARK_BBOX

    # ---- mark only -------------------------------------------------------
    for name, color in (("mark", INK), ("mark-inverse", PAPER), ("mark-current", "currentColor")):
        w(
            f"logo/polytypo-{name}.svg",
            svg(
                f"{mx} {my} {mw} {mh}",
                mark_body(color),
                "polytypo",
                "Guillemets enclosing an em dash.",
            ),
        )

    # ---- wordmark --------------------------------------------------------
    pad = 0
    vb_w = wm["right"] - wm["left"]
    vb_h = wm["bottom"] - wm["top"]
    for name, color in (("wordmark", INK), ("wordmark-inverse", PAPER)):
        w(
            f"logo/polytypo-{name}.svg",
            svg(
                f"{wm['left']:.2f} {wm['top']:.2f} {vb_w:.2f} {vb_h:.2f}",
                f'\n  <path d="{wm["d"]}" fill="{color}"/>',
                "polytypo",
                "The polytypo wordmark, set in Inter SemiBold.",
            ),
        )

    # ---- horizontal lockup ----------------------------------------------
    gap = 26.0
    wm_x = mx + mw + gap - wm["left"]
    baseline = 60.0 + 12.5  # mark centre + half x-height
    top = min(my, baseline + wm["top"])
    bottom = max(my + mh, baseline + wm["bottom"])
    right = wm_x + wm["right"]
    lock_vb = f"{mx} {top:.2f} {right - mx:.2f} {bottom - top:.2f}"

    def lockup(color):
        return mark_body(color) + (
            f'\n  <path transform="translate({wm_x:.2f} {baseline:.2f})" '
            f'd="{wm["d"]}" fill="{color}"/>'
        )

    for name, color in (("lockup", INK), ("lockup-inverse", PAPER), ("lockup-current", "currentColor")):
        w(
            f"logo/polytypo-{name}.svg",
            svg(
                lock_vb,
                lockup(color),
                "polytypo",
                "The polytypo logo: guillemets enclosing an em dash, beside the wordmark.",
            ),
        )

    # ---- stacked lockup --------------------------------------------------
    # wordmark is scaled so its ink width matches the mark exactly (flush stack)
    wm_s = build_wordmark(xheight=25.0 * mw / (wm["right"] - wm["left"]))
    s_gap = 22.0
    s_baseline = my + mh + s_gap - wm_s["top"]
    s_wm_x = mx - wm_s["left"]
    s_bottom = s_baseline + wm_s["bottom"]
    s_vb = f"{mx} {my} {mw} {s_bottom - my:.2f}"

    def stacked(color):
        return mark_body(color) + (
            f'\n  <path transform="translate({s_wm_x:.2f} {s_baseline:.2f})" '
            f'd="{wm_s["d"]}" fill="{color}"/>'
        )

    for name, color in (("lockup-stacked", INK), ("lockup-stacked-inverse", PAPER)):
        w(
            f"logo/polytypo-{name}.svg",
            svg(s_vb, stacked(color), "polytypo", "The polytypo logo, stacked."),
        )

    # ---- square logo tile: stacked lockup centred in a square (2X padding) ----
    def square(bg, fg, size=1024.0):
        content_h = s_bottom - my
        k = size * (mw / (mw + 4 * DASH[3])) / mw  # 2X padding left and right
        tx = size / 2 - (mw * k) / 2 - mx * k
        ty = size / 2 - (content_h * k) / 2 - my * k
        return (
            f'\n  <rect width="{size:.0f}" height="{size:.0f}" fill="{bg}"/>'
            f'\n  <g transform="translate({tx:.2f} {ty:.2f}) scale({k:.4f})">{stacked(fg)}\n  </g>'
        )

    w("logo/polytypo-square.svg", svg("0 0 1024 1024", square(PAPER, INK), "polytypo",
        "Square logo: stacked lockup on paper."))
    w("logo/polytypo-square-inverse.svg", svg("0 0 1024 1024", square(INK, PAPER), "polytypo",
        "Square logo: stacked lockup on ink."))

    # ---- avatar (square) -------------------------------------------------
    def avatar(bg, fg, radius=0):
        # tile padding is 2X on each side, X = dash thickness (see BRANDBOOK §04)
        target_w = 512 * mw / (mw + 4 * DASH[3])
        k = target_w / mw
        tx = (512 - target_w) / 2 - mx * k
        ty = 256 - (my + mh / 2) * k
        rect = f'\n  <rect width="512" height="512" rx="{radius}" fill="{bg}"/>'
        body = f'\n  <g transform="translate({tx:.2f} {ty:.2f}) scale({k:.4f})">{mark_body(fg)}\n  </g>'
        return rect + body

    w("logo/polytypo-avatar.svg", svg("0 0 512 512", avatar(INK, PAPER), "polytypo", "Square avatar, paper mark on ink."))
    w("logo/polytypo-avatar-light.svg", svg("0 0 512 512", avatar(PAPER, INK), "polytypo", "Square avatar, ink mark on paper."))
    w("logo/polytypo-avatar-rounded.svg", svg("0 0 512 512", avatar(INK, PAPER, 96), "polytypo", "Square avatar with rounded corners."))

    # ---- favicon: the real mark, full-bleed in the tile (no simplification) ----
    def favicon(bg, fg, radius=12, bare=False, width_frac=mw / (mw + 2 * DASH[3])):
        k = 64 * width_frac / mw
        tx = 32 - (mw * k) / 2 - mx * k
        ty = 32 - (mh * k) / 2 - my * k
        rect = "" if bare else f'\n  <rect width="64" height="64" rx="{radius}" fill="{bg}"/>'
        body = (
            f'\n  <g transform="translate({tx:.3f} {ty:.3f}) scale({k:.4f})">'
            f"{mark_body(fg)}\n  </g>"
        )
        return rect + body

    w("logo/polytypo-favicon.svg", svg("0 0 64 64", favicon(INK, PAPER), "polytypo",
        "Favicon: the mark, full-bleed on an ink tile."))
    w("logo/polytypo-favicon-light.svg", svg("0 0 64 64", favicon(PAPER, INK), "polytypo",
        "Favicon: the mark on a paper tile."))
    w("logo/polytypo-favicon-bare.svg", svg("0 0 64 64",
        favicon(None, "currentColor", bare=True, width_frac=1.0), "polytypo",
        "Favicon glyph, no tile, currentColor."))

    # ---- merch: heavier mark for embroidery / small print ----------------
    w(
        "merch/polytypo-mark-heavy.svg",
        svg(
            f"{mx - 1} {my - 1} {mw + 2} {mh + 2}",
            mark_body(INK, sw=11.0, dash=(58.0, 54.5, 84.0, 11.0)),
            "polytypo",
            "Heavy-weight mark for embroidery and small-scale print.",
        ),
    )
    w(
        "merch/polytypo-mark-red.svg",
        svg(f"{mx} {my} {mw} {mh}", mark_body(RED), "polytypo", "Mark in Correction Red, one-colour print."),
    )

    # ---- merch slogan lockups -------------------------------------------
    slogans = [
        ("em-dash-was-mine", "The em dash was mine.", 18.0),
        ("u2014", "U+2014", 22.0),
        ("locale-correct", "Locale-correct by default", 15.0),
    ]
    for slug, text, xh in slogans:
        sw_ = build_wordmark(text=text, weight=500, xheight=xh, tracking=0.0)
        gap_ = 30.0
        bx = mx + (mw - (sw_["right"] - sw_["left"])) / 2 - sw_["left"]
        base = my + mh + gap_ - sw_["top"]
        vb = f"{min(mx, bx + sw_['left']):.2f} {my} " \
             f"{max(mw, sw_['right'] - sw_['left']):.2f} {base + sw_['bottom'] - my:.2f}"
        body = mark_body(INK) + (
            f'\n  <path transform="translate({bx:.2f} {base:.2f})" d="{sw_["d"]}" fill="{INK}"/>'
        )
        w(f"merch/slogan-{slug}.svg", svg(vb, body, "polytypo", text))

    # ---- print-ready merch files (physical dimensions in mm) -------------
    def phys(vb_w, vb_h, mm_w):
        return mm_w, mm_w * vb_h / vb_w

    mark_vb = f"{mx} {my} {mw} {mh}"
    specs = [
        ("print-tee-front-mark", mark_body(INK), mark_vb, mw, mh, 240.0,
         "Tee, front print, one colour."),
        ("print-hoodie-chest-mark", mark_body(INK), mark_vb, mw, mh, 90.0,
         "Hoodie, left-chest print, one colour."),
        ("embroidery-cap-mark", mark_body(INK, sw=11.0, dash=(58.0, 54.5, 84.0, 11.0)),
         f"{mx - 1} {my - 1} {mw + 2} {mh + 2}", mw + 2, mh + 2, 110.0,
         "Cap, flat embroidery, one colour, minimum stroke 1.4 mm at this size."),
    ]
    for slug, body, vb, vw, vh, mm_w in [(a, b, c, d, e, f) for a, b, c, d, e, f, _ in specs]:
        ww, hh = phys(vw, vh, mm_w)
        w(
            f"merch/{slug}.svg",
            svg(vb, body, "polytypo", dict((sp[0], sp[6]) for sp in specs)[slug],
                w=f"{ww:.1f}mm", h=f"{hh:.1f}mm"),
        )

    # die-cut sticker: mark on paper tile with a 3 mm keyline and a cut path
    st_pad = 26.0
    st_vb_w, st_vb_h = mw + st_pad * 2, mh + st_pad * 2
    sticker = (
        f'\n  <rect x="{mx - st_pad}" y="{my - st_pad}" width="{st_vb_w}" height="{st_vb_h}" '
        f'rx="24" fill="{PAPER}" stroke="{INK}" stroke-width="3"/>' + mark_body(INK)
    )
    w(
        "merch/sticker-mark-diecut.svg",
        svg(f"{mx - st_pad} {my - st_pad} {st_vb_w} {st_vb_h}", sticker, "polytypo",
            "Die-cut sticker, 80 mm wide, cut line = outer rounded rectangle.",
            w="80.0mm", h=f"{80.0 * st_vb_h / st_vb_w:.1f}mm"),
    )

    print("wordmark advance", round(wm["advance"], 2), "size", round(wm["size"], 2))
    print("lockup viewBox", lock_vb)


if __name__ == "__main__":
    main()
