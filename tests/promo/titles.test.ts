// Search playbook 16.1: a page title is one natural phrase. No segments joined by a delimiter and
// no fixed brand suffix. Checks every generated <title>, og:title and twitter:title, and every
// seo_title in the docs sources. Needs "npm run gen:docs" first, like the other promo tests.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROMO = path.join(ROOT, "promo");

// A colon is allowed nowhere today; list a title here only if a product name forces one.
const COLON_EXCEPTIONS: string[] = [];
const DELIMITERS = ["|", " - ", " – ", " — ", "—"];

function walk(dir: string, ext: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full, ext);
    return e.name.endsWith(ext) ? [full] : [];
  });
}

function violations(title: string): string[] {
  const found = DELIMITERS.filter((d) => title.includes(d));
  if (title.includes(":") && !COLON_EXCEPTIONS.includes(title)) found.push(":");
  return found;
}

function titlesIn(html: string): string[] {
  const unescape = (s: string) => s.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'");
  return [
    ...html.matchAll(/<title>([^<]*)<\/title>/g),
    ...html.matchAll(/<meta property="og:title" content="([^"]*)">/g),
    ...html.matchAll(/<meta name="twitter:title" content="([^"]*)">/g),
  ].map((m) => unescape(m[1] ?? ""));
}

describe("page titles", () => {
  it("no generated title joins segments with a delimiter", () => {
    const pages = walk(PROMO, "index.html");
    expect(pages.length).toBeGreaterThanOrEqual(50);
    for (const file of pages) {
      const titles = titlesIn(readFileSync(file, "utf8"));
      expect(titles, file).toHaveLength(3);
      for (const t of titles) expect(violations(t), `${file}: ${t}`).toEqual([]);
    }
  });

  it("<title>, og:title and twitter:title agree on every page", () => {
    for (const file of walk(PROMO, "index.html")) {
      const [title, og, tw] = titlesIn(readFileSync(file, "utf8"));
      expect([og, tw], file).toEqual([title, title]);
    }
  });

  it("generated titles are unique across the site", () => {
    const titles = walk(PROMO, "index.html").map((f) => titlesIn(readFileSync(f, "utf8"))[0]);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("every seo_title in the docs sources follows the rule", () => {
    const sources = walk(path.join(ROOT, "brand/tools/docs"), ".md");
    let seen = 0;
    for (const file of sources) {
      const m = readFileSync(file, "utf8").match(/^seo_title: (.*)$/m);
      if (!m) continue;
      seen++;
      const title = (m[1] ?? "").replace(/^"(.*)"$/, "$1");
      expect(violations(title), `${file}: ${title}`).toEqual([]);
    }
    expect(seen).toBeGreaterThanOrEqual(40);
  });
});
