// Draws one 1200x630 PNG per locale page at build time (satori + resvg) and writes the manifest
// brand/tools/out/og-manifest.json ({ "<slug>": "<hash8>" }) that build_promo.py reads.
// Locale pages are drawn from the spec; every other page except home from brand/tools/out/og-pages.json.
// Output: promo/images/og/<slug>.png (gitignored). Fail-fast: any problem throws with the page named.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { HEIGHT, MAX_TEXT_CHARS, PAPER, WIDTH } from "./tokens.mjs";
import { template } from "./template.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const read = (...p) => readFileSync(path.join(ROOT, ...p));
const readJson = (...p) => JSON.parse(read(...p).toString("utf8"));

const FONT_FILES = [
  { name: "Inter", file: "Inter-Medium.ttf", weight: 500 },
  { name: "JBMono", file: "JetBrainsMono-Medium.ttf", weight: 500 },
];
const fonts = FONT_FILES.map((f) => ({
  name: f.name,
  weight: f.weight,
  style: "normal",
  data: readFileSync(path.join(HERE, "fonts", f.file)),
}));
const logoSvg = read("brand", "logo", "polytypo-lockup.svg");
const logo = `data:image/svg+xml;base64,${logoSvg.toString("base64")}`;

// Same locale set as gen_locale_pages.py: registry locales the installed engine can exemplify.
const registry = readJson("spec", "locales", "registry.json");
const exemplified = readJson("promo", "locale-examples.json").locales;
const codes = registry.locales.filter((c) => c in exemplified);

// The text is the page's own h1 (gen_locale_pages.py: "<name> typography rules · <code>").
function pageFor(code) {
  const d = readJson("spec", "locales", `${code}.json`);
  return plainPageFor({
    slug: `locales/${code}`,
    text: `${d.name} typography rules \u00b7 ${code}`,
  });
}

// Other pages come from build_promo.py (--og-pages): { slug, text }.
function plainPageFor(p) {
  if (!p.text || p.text.length > MAX_TEXT_CHARS)
    throw new Error(`og: ${p.slug}: text "${p.text}" empty or over ${MAX_TEXT_CHARS} chars`);
  return { slug: p.slug, text: p.text, logo, alt: `polytypo: ${p.text}` };
}

const templateSource = readFileSync(path.join(HERE, "template.mjs"));
const tokensSource = readFileSync(path.join(HERE, "tokens.mjs"));
const generatorSource = readFileSync(path.join(HERE, "generate-og.mjs"));
const versions = ["satori", "@resvg/resvg-js"]
  .map((n) => readJson("node_modules", n, "package.json").version)
  .join("+");

// The hash is of the INPUT, not the output: a PNG encoder or font rasterizer difference between
// machines must not change the committed HTML's ?v= (pages-deploy.yml requires zero drift).
function inputHash(page) {
  const h = createHash("sha256");
  for (const part of [
    JSON.stringify(page),
    templateSource,
    tokensSource,
    generatorSource,
    versions,
    ...fonts.map((f) => f.data),
  ])
    h.update(part);
  return h.digest("hex").slice(0, 8);
}

const outDir = path.join(ROOT, "promo", "images", "og");
const manifest = {};
const plainPages = readJson("brand", "tools", "out", "og-pages.json").map(plainPageFor);
const pages = [...codes.map(pageFor), ...plainPages];
for (const page of pages) {
  try {
    const svg = await satori(template(page), { width: WIDTH, height: HEIGHT, fonts });
    const png = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH }, background: PAPER })
      .render()
      .asPng();
    const file = path.join(outDir, `${page.slug}.png`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, png);
    manifest[page.slug] = { v: inputHash(page), alt: page.alt };
  } catch (err) {
    throw new Error(`og: ${page.slug}: ${err.message}`, { cause: err });
  }
}
const manifestPath = path.join(ROOT, "brand", "tools", "out", "og-manifest.json");
mkdirSync(path.dirname(manifestPath), { recursive: true });
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
process.stdout.write(`og: wrote ${pages.length} images to promo/images/og/\n`);
