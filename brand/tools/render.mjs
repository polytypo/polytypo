import { createRequire } from "node:module";

// resvg is not a project dependency; install it on demand:
//   npm i --no-save @resvg/resvg-js
const require = createRequire(import.meta.url);
let Resvg;
try {
  ({ Resvg } = require("@resvg/resvg-js"));
} catch {
  console.error("missing @resvg/resvg-js — run: npm i --no-save @resvg/resvg-js");
  process.exit(1);
}
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const OUT = process.env.BRAND_OUT || new URL("..", import.meta.url).pathname;
const jobs = [
  ["logo/polytypo-lockup.svg", "png/polytypo-lockup-512.png", 512],
  ["logo/polytypo-lockup.svg", "png/polytypo-lockup-1024.png", 1024],
  ["logo/polytypo-lockup.svg", "png/polytypo-lockup-2048.png", 2048],
  ["logo/polytypo-lockup-inverse.svg", "png/polytypo-lockup-inverse-1024.png", 1024],
  ["logo/polytypo-lockup-stacked.svg", "png/polytypo-lockup-stacked-1024.png", 1024],
  [
    "logo/polytypo-lockup-stacked-inverse.svg",
    "png/polytypo-lockup-stacked-inverse-1024.png",
    1024,
  ],
  ["logo/polytypo-mark.svg", "png/polytypo-mark-512.png", 512],
  ["logo/polytypo-mark.svg", "png/polytypo-mark-1024.png", 1024],
  ["logo/polytypo-mark-inverse.svg", "png/polytypo-mark-inverse-1024.png", 1024],
  ["logo/polytypo-wordmark.svg", "png/polytypo-wordmark-1024.png", 1024],
  ["logo/polytypo-square.svg", "png/polytypo-square-1024.png", 1024],
  ["logo/polytypo-square.svg", "png/polytypo-square-2048.png", 2048],
  ["logo/polytypo-square-inverse.svg", "png/polytypo-square-inverse-1024.png", 1024],
  ["logo/polytypo-square-inverse.svg", "png/polytypo-square-inverse-2048.png", 2048],
  ["logo/polytypo-avatar.svg", "png/polytypo-avatar-2048.png", 2048],
  ["logo/polytypo-avatar.svg", "png/polytypo-avatar-512.png", 512],
  ["logo/polytypo-avatar.svg", "png/polytypo-avatar-1024.png", 1024],
  ["logo/polytypo-avatar-light.svg", "png/polytypo-avatar-light-512.png", 512],
  ["logo/polytypo-avatar-rounded.svg", "png/polytypo-avatar-rounded-512.png", 512],
  ["logo/polytypo-favicon.svg", "png/apple-touch-icon-180.png", 180],
  ["logo/polytypo-favicon.svg", "png/favicon-48.png", 48],
  ["logo/polytypo-favicon.svg", "png/favicon-32.png", 32],
  ["logo/polytypo-favicon.svg", "png/favicon-16.png", 16],
  ["merch/polytypo-mark-heavy.svg", "png/merch-mark-heavy-2048.png", 2048],
  ["merch/polytypo-mark-red.svg", "png/merch-mark-red-2048.png", 2048],
  ["merch/slogan-em-dash-was-mine.svg", "png/merch-slogan-em-dash-was-mine-2048.png", 2048],
  ["merch/slogan-u2014.svg", "png/merch-slogan-u2014-2048.png", 2048],
  ["merch/slogan-locale-correct.svg", "png/merch-slogan-locale-correct-2048.png", 2048],
];

for (const [src, dst, width] of jobs) {
  const svg = readFileSync(join(OUT, src), "utf8");
  const r = new Resvg(svg, { fitTo: { mode: "width", value: width }, background: undefined });
  const png = r.render().asPng();
  mkdirSync(dirname(join(OUT, dst)), { recursive: true });
  writeFileSync(join(OUT, dst), png);
  console.log("  ", dst, width);
}

// og-image 1200x630, paper background, centred lockup
const lock = readFileSync(join(OUT, "logo/polytypo-lockup.svg"), "utf8");
const inner = lock.replace(/^[\s\S]*?<desc[^>]*>[\s\S]*?<\/desc>/, "").replace("</svg>", "");
const vb = lock
  .match(/viewBox="([^"]+)"/)[1]
  .split(" ")
  .map(Number);
const scale = (1200 * 0.62) / vb[2];
const og = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#FBFAF7"/>
<g transform="translate(${(1200 - vb[2] * scale) / 2 - vb[0] * scale} ${315 - (vb[1] + vb[3] / 2) * scale}) scale(${scale})">${inner}</g>
</svg>`;
writeFileSync(
  join(OUT, "png/polytypo-og-1200x630.png"),
  new Resvg(og, { fitTo: { mode: "width", value: 1200 } }).render().asPng(),
);
console.log("   png/polytypo-og-1200x630.png");
