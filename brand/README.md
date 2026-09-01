# polytypo brand assets

The full brand book — rationale, construction, colour, type, misuse, applications and the merch
programme — is [BRANDBOOK.html](BRANDBOOK.html). Open it in a browser; it is a single self-contained
file with the fonts embedded.

## Files

| Path                               | What it is                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `logo/polytypo-lockup.svg`         | Primary horizontal lockup (ink). `-inverse` = paper, `-current` = `currentColor`.                     |
| `logo/polytypo-lockup-stacked.svg` | Stacked lockup for narrow and square containers.                                                      |
| `logo/polytypo-mark.svg`           | The mark alone. `-inverse`, `-current` variants.                                                      |
| `logo/polytypo-wordmark.svg`       | Wordmark alone, outlined from Inter SemiBold.                                                         |
| `logo/polytypo-avatar*.svg`        | 512 × 512 avatar: ink, light, rounded.                                                                |
| `logo/polytypo-favicon*.svg`       | Favicon tile: the mark full-bleed in a 64 × 64 square. Ink, paper and bare (`currentColor`) variants. |
| `png/`                             | Raster exports 512–2048 px, social card 1200 × 630, touch icons.                                      |
| `favicon/`                         | `favicon.ico` (16 · 32 · 48), `favicon.svg`, `apple-touch-icon-180.png`.                              |
| `merch/`                           | Print-ready SVG with physical sizes in mm, plus slogan lockups.                                       |
| `tools/`                           | Generators — every asset is reproducible from geometry.                                               |

## Regenerating

### Python environment (required before any of the commands below)

`gen_svg.py` and `build_brandbook.py` need `fonttools` (font instancing, subsetting, WOFF2) and
`brotli` (WOFF2's compression codec) — packages this repository's `npm ci` does not, and should
not, install. A fresh checkout has neither until you set up a Python environment for them:

```bash
python3 -m venv .venv-brand           # Python 3.10+ (tested on 3.14)
source .venv-brand/bin/activate       # .venv-brand\Scripts\activate on Windows
pip install -r brand/tools/requirements.txt
```

`brand/tools/requirements.txt` pins exact versions, so generation is reproducible from a clean
environment rather than whatever happens to already be on the host's global site-packages —
running the commands below against a machine's ambient Python install (no venv, no pinned
requirements) is unsupported and not guaranteed to produce byte-identical output. `npm run
generate:all` (below) covers `gen:docs`/`gen:promo-bundle`/`gen:brandbook`, in that order, using
whichever `python3` is first on `PATH` — activate the venv above before running it.

### Commands

```bash
python3 brand/tools/gen_svg.py        # vectors (fetches Inter on first run, then caches it)
npm i --no-save @resvg/resvg-js       # one-off, PNG rasteriser
node brand/tools/render.mjs           # PNG exports + social card
npm run gen:brandbook                 # BRANDBOOK.html — also part of `npm run generate:all`
npx tsx brand/tools/gen_examples.ts   # promo/examples.json, straight from the engine
python3 brand/tools/build_promo.py    # promo/index.html and the other four promo pages
python3 brand/tools/gen_readmes.py    # README.md + docs/ports/README.*.md
```

Fonts (Inter, JetBrains Mono — both SIL OFL 1.1) are fetched from one immutable, checksum-verified
`google/fonts` commit per font (never the mutable `main` branch — see `gen_svg.py`'s `FONTS`
table) into `tools/` on first run, cached there, and are not committed. Every subsequent build,
online or offline, re-verifies the cached bytes against the pinned checksum before using them and
refuses to proceed on a mismatch — see `gen_svg.py`'s `ensure_font()` and `test_gen_svg.py`. The
wordmark is outlined and embedded as WOFF2 at build time, so no delivered asset needs a font
installed, and the generated site never loads a font from a third party.

## Rules, in one screen

- The mark is monochrome. No gradients, no two-tone, no effects, no rotation, no distortion.
- Clear space is 2X on every side, where X = the em dash's thickness. Square tiles (avatar, sticker) use the same 2X; the favicon tile is the one exception at 1X.
- Minimum sizes: lockup 140 px / 30 mm, mark 44 px / 10 mm, favicon tile 32 px (16 px fallback). Below the mark's minimum use the favicon tile or the wordmark.
- Never redraw the mark with fewer chevrons or a shorter dash to make it fit a small size.
- Never typeset the logo by typing `« — »` — use the file.
- The name is always lowercase: **polytypo**.

Source code is MIT. The brand assets are not: they may be used unmodified to refer to or credit the
project, and not as anyone else's identity, nor on goods for sale, without permission.
