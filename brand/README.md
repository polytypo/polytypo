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

```bash
python3 brand/tools/gen_svg.py        # vectors (fetches Inter on first run)
npm i --no-save @resvg/resvg-js       # one-off, PNG rasteriser
node brand/tools/render.mjs           # PNG exports + social card
python3 brand/tools/build_brandbook.py # BRANDBOOK.html
npx tsx brand/tools/gen_examples.ts   # promo/examples.json, straight from the engine
python3 brand/tools/build_promo.py    # promo/index.html
python3 brand/tools/gen_readmes.py    # README.md + docs/ports/README.*.md
```

Fonts (Inter, JetBrains Mono — both SIL OFL 1.1) are downloaded into `tools/` on demand and are not
committed. The wordmark is outlined at build time, so no delivered asset needs a font installed.

## Rules, in one screen

- The mark is monochrome. No gradients, no two-tone, no effects, no rotation, no distortion.
- Clear space is 2X on every side, where X = the em dash's thickness. Square tiles (avatar, sticker) use the same 2X; the favicon tile is the one exception at 1X.
- Minimum sizes: lockup 140 px / 30 mm, mark 44 px / 10 mm, favicon tile 32 px (16 px fallback). Below the mark's minimum use the favicon tile or the wordmark.
- Never redraw the mark with fewer chevrons or a shorter dash to make it fit a small size.
- Never typeset the logo by typing `« — »` — use the file.
- The name is always lowercase: **polytypo**.

Source code is MIT. The brand assets are not: they may be used unmodified to refer to or credit the
project, and not as anyone else's identity, nor on goods for sale, without permission.
