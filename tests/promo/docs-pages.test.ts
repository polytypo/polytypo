// Structure of the documentation pages generated from brand/tools/docs/**/*.md. Checks the
// generated HTML, so a broken template or renderer is caught here and not by the reader.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DOCS_SRC = path.join(ROOT, "brand/tools/docs");
const PROMO_DIR = path.join(ROOT, "promo");

function sources(dir = DOCS_SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? sources(path.join(dir, e.name))
      : e.name.endsWith(".md")
        ? [path.relative(DOCS_SRC, path.join(dir, e.name)).slice(0, -3)]
        : [],
  );
}

function read(slug: string): string {
  const p = path.join(PROMO_DIR, "docs", ...slug.split("/"), "index.html");
  if (!existsSync(p)) throw new Error(`${p} missing — run "npm run gen:docs" first`);
  return readFileSync(p, "utf8");
}

describe("docs_md.py — renderer unit tests", () => {
  it("passes", () => {
    execFileSync("python3", [path.join(ROOT, "brand/tools/test_docs_md.py")], { stdio: "pipe" });
  });
});

describe("documentation pages", () => {
  const slugs = sources();

  it("there is at least one page", () => {
    expect(slugs.length).toBeGreaterThan(0);
  });

  for (const slug of slugs) {
    describe(`docs/${slug}`, () => {
      const html = read(slug);
      const depth = "../".repeat(slug.split("/").length + 1);

      it("has its own canonical URL, a unique title and a TechArticle with breadcrumbs", () => {
        expect(html).toContain(`<link rel="canonical" href="https://polytypo.dev/docs/${slug}/">`);
        expect(html).toMatch(/"@type": "TechArticle"/);
        expect(html).toMatch(/"@type": "BreadcrumbList"/);
      });

      it("references assets at its real depth", () => {
        expect(html).toContain(`href="${depth}assets/style.css"`);
      });

      it("marks itself as the current page in the sidebar, exactly once", () => {
        const current = html.match(/<a href="[^"]*" aria-current="page">/g) ?? [];
        // One in the site nav is possible only for top-level pages; docs pages carry the sidebar's.
        expect(current.length).toBeGreaterThanOrEqual(1);
        expect(html).toContain('<details class="doc-nav">');
      });

      it("has no unresolved template tokens, no duplicate heading ids", () => {
        expect(html).not.toMatch(/\{\{[^}]+\}\}/);
        const ids = [...html.matchAll(/<h[2-4] id="([^"]+)"/g)].map((m) => m[1]);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it("promises no unshipped work", () => {
        const text = html.replace(/<script[\s\S]*?<\/script>/g, "");
        expect(text).not.toMatch(/coming soon|roadmap|we plan|planned|will be supported/i);
      });
    });
  }

  it("descriptions are unique across pages", () => {
    const descriptions = slugs.map(
      (s) => read(s).match(/<meta name="description" content="([^"]*)">/)?.[1],
    );
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("the docs hub links every page", () => {
    const hub = read("").replace(/^/, "");
    for (const slug of slugs) expect(hub).toContain(`href="../docs/${slug}/"`);
  });
});
