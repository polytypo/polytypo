// Closes the coverage gap left by the directory-URL move (commit a6c97f4): asset depth was
// regression-tested everywhere, but PAGE-LINK depth in only two hand-picked places
// (tests/promo/generated-pages.test.ts asserts `href="manifesto/"` on home and
// `href="../playground/"` on the manifesto). Every other cross-page href was unverified, and a
// wrong-depth one — "docs/" written on a page that is itself one directory down — is exactly the
// defect this layout invites: it 404s in a browser while every existing test stays green.
//
// So this file walks EVERY generated page, extracts EVERY local href and src, resolves each one
// against that page's own directory (they are document-relative, never root-relative — before a
// custom domain exists the site is served from polytypo.github.io/polytypo/, where "/docs/" points
// outside the site entirely) and asserts the target really exists inside promo/.
//
// It also covers one reference that is in no attribute at all: the home page loads the engine
// bundle lazily, by injecting a <script> element whose src is a JS string literal inside the
// generated inline script. No attribute walk can see it, so a wrong-depth "../vendor/..." on home
// would 404 at runtime with the whole suite green. It is extracted from the emitted `ENGINE_SRC`
// and resolved through the same code path as everything else.
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";
import { describe, expect, it } from "vitest";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROMO_DIR = path.join(ROOT, "promo");

const PAGES = [
  "index.html",
  "manifesto/index.html",
  "docs/index.html",
  "playground/index.html",
  "locales/index.html",
];

/** The two pages that embed the playground, and the depth each must reference the engine bundle
 * at — depth 0 from the promo root, one "../" from a directory index. */
const ENGINE_BUNDLE_DEPTH: ReadonlyArray<readonly [page: string, expectedSrc: string]> = [
  ["index.html", "vendor/polytypo.browser.js"],
  ["playground/index.html", "../vendor/polytypo.browser.js"],
];

/** Attributes a browser resolves as a link or a resource. `href` on <a>/<link>, `src` on script
 * and media elements — the full set this generator can emit. */
const REFERENCE_ATTRS: ReadonlyArray<readonly [tag: string, attrName: string]> = [
  ["a", "href"],
  ["link", "href"],
  ["script", "src"],
  ["img", "src"],
  ["source", "src"],
  ["video", "src"],
  ["video", "poster"],
  ["audio", "src"],
  ["iframe", "src"],
  ["embed", "src"],
  ["object", "data"],
];

function readPromoPage(name: string): string {
  const p = path.join(PROMO_DIR, ...name.split("/"));
  if (!existsSync(p)) {
    throw new Error(
      `${p} does not exist — run "npm run generate:all" before running this test file, which ` +
        "checks the actual generated output, not just its source template.",
    );
  }
  return readFileSync(p, "utf8");
}

/** The directory a page's own document-relative references resolve against. */
function pageDir(page: string): string {
  return path.dirname(path.join(PROMO_DIR, ...page.split("/")));
}

function isElement(node: Node): node is Element {
  return "tagName" in node;
}

function attr(el: Element, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

interface Reference {
  /** Where it came from, for a failure message that names the actual element. */
  where: string;
  value: string;
}

/** Every href/src on a page, in document order. */
function collectReferences(html: string): Reference[] {
  const refs: Reference[] = [];
  const walk = (node: Node) => {
    if (isElement(node)) {
      for (const [tag, attrName] of REFERENCE_ATTRS) {
        if (node.tagName !== tag) continue;
        const value = attr(node, attrName);
        if (value !== undefined) refs.push({ where: `<${tag} ${attrName}>`, value });
      }
    }
    if ("childNodes" in node) for (const child of node.childNodes) walk(child);
  };
  walk(parse(html));
  return refs;
}

/** True for a reference that leaves the site (or is not a file reference at all) and therefore has
 * no local target to check: absolute/protocol-relative URLs, non-fetching schemes, and pure
 * same-page fragments. */
function isOffSite(value: string): boolean {
  const trimmed = value.trim();
  return (
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || // https:, mailto:, data:, javascript: …
    trimmed.startsWith("//") ||
    trimmed.startsWith("#")
  );
}

type Resolution = { ok: true; path: string } | { ok: false; reason: string };

/**
 * Resolves one local reference the way a browser would: relative to the page's own directory,
 * with `?query`/`#fragment` stripped, and a directory target ("docs/", "../", "./") mapped to that
 * directory's index.html. Rejects a root-relative reference outright — the layout's single most
 * consequential rule, and one that would otherwise look fine locally under a server rooted at
 * promo/ while breaking on GitHub Pages' project-path deployment.
 */
function resolveLocalReference(value: string, fromDir: string): Resolution {
  const trimmed = value.trim();
  if (trimmed === "") return { ok: false, reason: "empty reference" };
  if (trimmed.startsWith("/")) {
    return {
      ok: false,
      reason: `"${value}" is root-relative; the site must work when served from a subdirectory`,
    };
  }

  const withoutFragment = (trimmed.split("#")[0] ?? "").split("?")[0] ?? "";
  if (withoutFragment === "") return { ok: false, reason: `"${value}" has no path component` };

  const candidate = path.resolve(fromDir, withoutFragment);
  const root = realpathSync(PROMO_DIR);
  const rel = path.relative(root, candidate);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: false, reason: `"${value}" resolves outside promo/ (${candidate})` };
  }

  // A trailing slash always means "the directory index"; a path with no slash may still be a
  // directory (nothing in this generator emits one, but resolving it as a file would be wrong).
  const isDirectoryRef =
    withoutFragment.endsWith("/") || (existsSync(candidate) && statSync(candidate).isDirectory());
  const target = isDirectoryRef ? path.join(candidate, "index.html") : candidate;

  if (!existsSync(target)) {
    return {
      ok: false,
      reason: `"${value}" resolves to ${path.relative(root, target)}, which does not exist`,
    };
  }
  if (!statSync(target).isFile()) {
    return { ok: false, reason: `"${value}" resolves to ${target}, which is not a regular file` };
  }
  return { ok: true, path: target };
}

/** The engine-bundle path the generated inline script injects at runtime. */
function engineSrcFrom(html: string): string | undefined {
  return html.match(/const ENGINE_SRC = "([^"]+)";/)?.[1];
}

describe("promo pages — every local href and src resolves from its own directory", () => {
  for (const page of PAGES) {
    it(`${page}: every local reference exists inside promo/ and is not root-relative`, () => {
      const refs = collectReferences(readPromoPage(page)).filter((r) => !isOffSite(r.value));
      // Guards against a silently-empty walk: every page links assets, nav and the footer.
      expect(refs.length, `${page}: expected local references to check`).toBeGreaterThan(5);

      const failures = refs
        .map((ref) => ({ ref, resolved: resolveLocalReference(ref.value, pageDir(page)) }))
        .filter((r) => !r.resolved.ok)
        .map((r) => `${r.ref.where} ${(r.resolved as { reason: string }).reason}`);
      expect(failures, `${page}:\n${failures.join("\n")}`).toEqual([]);
    });
  }

  it("the nav links on a nested page really do carry the extra '../' (proves depth is exercised)", () => {
    // Without this, a generator that emitted depth-0 hrefs on every page could still pass above if
    // the assertions happened to be run from the root only. The nested pages must differ.
    const nested = collectReferences(readPromoPage("docs/index.html")).map((r) => r.value);
    expect(nested).toContain("../assets/style.css");
    expect(nested).toContain("../playground/");
    const home = collectReferences(readPromoPage("index.html")).map((r) => r.value);
    expect(home).toContain("assets/style.css");
    expect(home).toContain("playground/");
  });
});

describe("promo pages — the lazily injected engine bundle is depth-correct too", () => {
  for (const [page, expectedSrc] of ENGINE_BUNDLE_DEPTH) {
    it(`${page} references the engine bundle at "${expectedSrc}"`, () => {
      const src = engineSrcFrom(readPromoPage(page));
      expect(src, `${page}: no ENGINE_SRC found in the emitted playground script`).toBe(
        expectedSrc,
      );
    });

    it(`${page}'s ENGINE_SRC resolves to a real file inside promo/`, () => {
      const src = engineSrcFrom(readPromoPage(page))!;
      const resolved = resolveLocalReference(src, pageDir(page));
      expect(resolved.ok, resolved.ok ? "" : resolved.reason).toBe(true);
    });
  }

  it("the home page's bundle reference exists ONLY in the script, never as a <script src>", () => {
    // The lazy-load contract: nothing in the markup may point at the 682 KB bundle, or the browser
    // would fetch it during first paint no matter what the script does afterwards.
    const markupSrcs = collectReferences(readPromoPage("index.html"))
      .filter((r) => r.where === "<script src>")
      .map((r) => r.value);
    expect(markupSrcs).not.toContain("vendor/polytypo.browser.js");
    expect(engineSrcFrom(readPromoPage("index.html"))).toBe("vendor/polytypo.browser.js");
  });
});

describe("link-depth resolver — negative controls (each must be CAUGHT, not silently passed)", () => {
  const docsDir = pageDir("docs/index.html");

  it("catches a root-relative href, even when the same path exists relative to promo/", () => {
    const resolved = resolveLocalReference("/docs/", docsDir);
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.reason).toContain("root-relative");
  });

  it("catches a wrong-depth href: 'assets/style.css' written on a page one directory down", () => {
    // The exact regression the directory-URL layout invites, and the one this file exists for.
    expect(resolveLocalReference("assets/style.css", docsDir).ok).toBe(false);
    expect(resolveLocalReference("../assets/style.css", docsDir).ok).toBe(true);
  });

  it("catches a wrong-depth page link: '../docs/' written on the home page", () => {
    expect(resolveLocalReference("../docs/", pageDir("index.html")).ok).toBe(false);
    expect(resolveLocalReference("docs/", pageDir("index.html")).ok).toBe(true);
  });

  it("catches a reference that escapes promo/ entirely", () => {
    const resolved = resolveLocalReference("../../package.json", docsDir);
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.reason).toContain("outside promo/");
  });

  it("catches a link to a directory that has no index.html", () => {
    const resolved = resolveLocalReference("../vendor/", docsDir);
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.reason).toContain("does not exist");
  });

  it("resolves a directory href to its index.html, and './' / '../' to the right page", () => {
    const fromDocs = resolveLocalReference("../", docsDir);
    expect(fromDocs.ok).toBe(true);
    if (fromDocs.ok) expect(fromDocs.path).toBe(path.join(realpathSync(PROMO_DIR), "index.html"));

    const fromHome = resolveLocalReference("./", pageDir("index.html"));
    expect(fromHome.ok).toBe(true);
    if (fromHome.ok) expect(fromHome.path).toBe(path.join(realpathSync(PROMO_DIR), "index.html"));

    const nested = resolveLocalReference("playground/", pageDir("index.html"));
    expect(nested.ok).toBe(true);
    if (nested.ok) {
      expect(nested.path).toBe(path.join(realpathSync(PROMO_DIR), "playground", "index.html"));
    }
  });

  it("keeps a query/fragment suffix from changing which file is resolved", () => {
    const withSuffix = resolveLocalReference("../docs/#why", docsDir);
    const plain = resolveLocalReference("../docs/", docsDir);
    expect(withSuffix.ok && plain.ok && withSuffix.path === plain.path).toBe(true);
  });
});
