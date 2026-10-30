#!/usr/bin/env node
// Fills the home page's download line at deploy time. The figure is the all-time downloads
// summed over the registries (npm, RubyGems, Packagist), plus PyPI's last 180 days, which is all
// PyPI's public statistics keep, so it is a lower bound and "more than" holds; it is rounded down
// to whole thousands. pkg.go.dev has no counter. If any registry cannot be read, or the sum is
// under one thousand, the committed figure stays.
import { readFile, writeFile } from "node:fs/promises";

const PAGE = process.argv[2] ?? "promo/index.html";
const TIMEOUT_MS = 15_000;

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

const today = new Date().toISOString().slice(0, 10);

const sources = [
  async () =>
    (await getJson(`https://api.npmjs.org/downloads/point/2015-01-10:${today}/polytypo`)).downloads,
  async () =>
    (
      await getJson("https://pypistats.org/api/packages/polytypo/overall?mirrors=false")
    ).data.reduce((sum, day) => sum + day.downloads, 0),
  async () => (await getJson("https://rubygems.org/api/v1/gems/polytypo.json")).downloads,
  async () =>
    (await getJson("https://packagist.org/packages/polytypo/polytypo.json")).package.downloads
      .total,
];

let total = 0;
try {
  for (const source of sources) {
    const n = await source();
    if (!Number.isInteger(n) || n < 0) throw new Error(`unexpected download count: ${n}`);
    total += n;
  }
} catch (err) {
  console.warn(`downloads figure left as committed: ${err.message}`);
  process.exit(0);
}

const thousands = Math.floor(total / 1000) * 1000;
if (thousands < 1000) {
  console.warn(`downloads figure left as committed: ${total} is under 1,000`);
  process.exit(0);
}

const html = await readFile(PAGE, "utf8");
const pattern = /(<span data-downloads>)[^<]*(<\/span>)/;
if (!pattern.test(html)) {
  console.error(`${PAGE} has no downloads line to fill`);
  process.exit(1);
}
const filled = html.replace(pattern, `$1${thousands.toLocaleString("en-US")}$2`);
await writeFile(PAGE, filled);
console.log(
  `downloads line set to More than ${thousands.toLocaleString("en-US")} (measured ${total})`,
);
