// Per-page OG images (scripts/og/generate-og.mjs). Needs "npm run gen:docs" first, like the
// other promo tests: the PNGs and the manifest are generated, not committed.
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROMO = path.join(ROOT, "promo");
const ORIGIN = (
  JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as { homepage: string }
).homepage.replace(/\/$/, "");
const manifestPath = path.join(ROOT, "brand/tools/out/og-manifest.json");
if (!existsSync(manifestPath))
  throw new Error(`${manifestPath} missing — run "npm run gen:og" first`);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
  string,
  { v: string; alt: string }
>;

const sitemap = readFileSync(path.join(PROMO, "sitemap.xml"), "utf8");
// Every sitemap page except home (which keeps the shared brand image) has its own drawn image.
const pageSlugs = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)]
  .map((m) => m[1].slice(ORIGIN.length + 1).replace(/\/$/, ""))
  .filter((slug) => slug !== "");

function meta(html: string, attr: "property" | "name", key: string): string[] {
  const re = new RegExp(`<meta ${attr}="${key}" content="([^"]*)">`, "g");
  return [...html.matchAll(re)].map((m) => m[1]);
}

describe("per-page OG images", () => {
  it("every sitemap page except home has an image file and a manifest entry", () => {
    expect(pageSlugs.length).toBeGreaterThanOrEqual(50);
    for (const slug of pageSlugs) {
      expect(manifest[slug], slug).toBeDefined();
      expect(existsSync(path.join(PROMO, "images/og", `${slug}.png`)), slug).toBe(true);
    }
  });

  it("every image is a 1200x630 PNG of at most 600 KB", () => {
    for (const slug of pageSlugs) {
      const file = path.join(PROMO, "images/og", `${slug}.png`);
      const buf = readFileSync(file);
      expect(buf.subarray(1, 4).toString(), slug).toBe("PNG");
      expect([buf.readUInt32BE(16), buf.readUInt32BE(20)], slug).toEqual([1200, 630]);
      expect(statSync(file).size, slug).toBeLessThanOrEqual(600 * 1024);
    }
  });

  it("each page has exactly one absolute og:image and twitter:image pointing at its manifest version", () => {
    for (const slug of pageSlugs) {
      const html = readFileSync(path.join(PROMO, slug, "index.html"), "utf8");
      const url = `${ORIGIN}/images/og/${slug}.png?v=${manifest[slug].v}`;
      expect(meta(html, "property", "og:image"), slug).toEqual([url]);
      expect(meta(html, "name", "twitter:image"), slug).toEqual([url]);
      expect(meta(html, "name", "twitter:card"), slug).toEqual(["summary_large_image"]);
    }
  });

  it("og:image width, height, type and alt are set on every page", () => {
    for (const slug of ["", ...pageSlugs]) {
      const html = readFileSync(path.join(PROMO, slug, "index.html"), "utf8");
      expect(meta(html, "property", "og:image:width"), slug).toEqual(["1200"]);
      expect(meta(html, "property", "og:image:height"), slug).toEqual(["630"]);
      expect(meta(html, "property", "og:image:type"), slug).toEqual(["image/png"]);
      const alt = meta(html, "property", "og:image:alt");
      expect(alt, slug).toHaveLength(1);
      expect(alt[0].trim().length, slug).toBeGreaterThan(0);
      expect(meta(html, "name", "twitter:image:alt"), slug).toEqual(alt);
    }
  });
});
