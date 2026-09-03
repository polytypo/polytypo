// Regression coverage for the promo site making zero page-load requests to a third-party origin
// (Stage 10 correction pass 1 removed `https://rsms.me/inter/inter.css` plus its `preconnect`,
// previously loaded on every one of the five pages — see brand/tools/build_promo.py, and the
// generated promo/assets/fonts.css, which already embeds both brand fonts as data URLs and must
// remain the only font source).
//
// Parses the actual generated promo pages (not the .body.html templates) with parse5, so a
// broken generator-side change is caught here too, not just in the source, and follows every
// locally linked stylesheet (style.css, fonts.css) to scan its actual content as well — a clean
// HTML document with a dirty linked CSS file would otherwise pass unnoticed.
//
// Pages are directory indexes served at directory URLs (promo/docs/index.html → /docs), and their
// asset references are document-relative — "assets/style.css" from the home page,
// "../assets/style.css" from a nested one. Stylesheet resolution therefore has TWO roots, not
// one: hrefs resolve against the *page's own directory*, while containment is still enforced
// against promo/ as a whole. See resolveContainedStylesheetPath's `containmentRoot`. Because this
// file follows and reads every linked stylesheet, it is also what would catch the most likely
// defect of the directory-URL layout: a wrong-depth "../assets/style.css" that does not exist.
//
// CSS `@import` policy: fail-closed. This project's generated promo CSS has no reason to import
// anything — `fonts.css` embeds both fonts as data URLs, `style.css` needs nothing external — so
// every `@import` is rejected outright, local or external, rather than attempting to safely
// resolve a local one. See scanCssForViolations().
//
// Deliberately not a full CSS/HTML spec-compliant parser (`srcset`'s candidate grammar, CSS's
// `url()`/`@import` grammar): both are hand-rolled, small, and scoped to what this project's own
// generator could plausibly emit — a full CSS parser dependency is unnecessary for a bounded,
// self-authored surface this small.
//
// Ordinary outbound hyperlinks (`<a href="https://...">`, e.g. locale-rule citation links) and
// metadata URLs (`<meta property="og:...">`, `<link rel="canonical">`) are not page-load
// dependencies and are deliberately not checked — only elements/URLs the browser actually fetches
// as part of rendering the page are.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";
import { afterEach, describe, expect, it } from "vitest";

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

/** Depth prefix a page's own document-relative asset references carry: "" at the promo root,
 * "../" for a directory index one level down. */
function assetPrefix(page: string): string {
  return page.includes("/") ? "../" : "";
}

/** The directory a page's own relative hrefs resolve against — its containing directory. */
function pageDir(page: string): string {
  return path.dirname(path.join(PROMO_DIR, ...page.split("/")));
}

function readPromoPage(name: string): string {
  const p = path.join(PROMO_DIR, ...name.split("/"));
  if (!existsSync(p)) {
    throw new Error(
      `${p} does not exist — run "npm run generate:all" (or "npm run gen:docs") before ` +
        "running this test file, which checks the generated output, not just its source template.",
    );
  }
  return readFileSync(p, "utf8");
}

function isElement(node: Node): node is Element {
  return "tagName" in node;
}

function attr(el: Element, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

// ---- URL classification -----------------------------------------------------------------
/** True for a URL a browser would actually fetch: absolute http(s), or protocol-relative
 * (`//host/...`), which is exactly as external as `https://`. A bare relative path
 * (`assets/fonts.css`) or a `data:` URL is same-origin/inline and is fine. */
function isExternalResourceUrl(url: string | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith("//");
}

/** `srcset` is a comma-separated list of "<url> <descriptor>?" candidates — every one of them is
 * a URL the browser may fetch (which candidate it picks depends on the viewport/density, not on
 * position), so a relative first candidate followed by an external second one must still be
 * caught. Not a full spec-compliant parser: commas inside a URL are vanishingly rare in this
 * project's own generated markup and are not defended against here. */
function srcsetCandidates(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter((url): url is string => Boolean(url));
}

// ---- CSS scanning (inline <style>, style="" attributes, and linked .css files) -----------
interface CssViolation {
  kind: "url()" | "@import";
  raw: string;
  url: string;
}

/** Small, explicit scanner for this project's own bounded, self-authored CSS surface. Two
 * passes: every `@import` is flagged unconditionally (fail-closed — see the file header), then
 * every remaining `url(...)` (quoted or bare, with any already-flagged `@import url(...)` text
 * removed first so it is not counted twice) is flagged only when external. Not a general CSS
 * parser. */
function scanCssForViolations(cssText: string): CssViolation[] {
  const found: CssViolation[] = [];

  const importRe = /@import\s+([^;]+);?/gi;
  for (const m of cssText.matchAll(importRe)) {
    found.push({ kind: "@import", raw: m[0].trim(), url: (m[1] ?? "").trim() });
  }
  const withoutImports = cssText.replace(importRe, "");

  const urlRe = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  for (const m of withoutImports.matchAll(urlRe)) {
    const url = (m[2] ?? "").trim();
    if (isExternalResourceUrl(url)) found.push({ kind: "url()", raw: m[0], url });
  }

  return found;
}

// ---- HTML walk ----------------------------------------------------------------------------
interface Violation {
  page: string;
  description: string;
}

// `rel` values the browser fetches as part of rendering the page (stylesheets, connection/asset
// preparation hints, subresource preloads, icons) — as opposed to `rel="canonical"`/`"alternate"`,
// which are metadata a crawler or the user follows, not something the browser loads unasked.
const RESOURCE_BEARING_LINK_RELS = new Set([
  "stylesheet",
  "preconnect",
  "preload",
  "prefetch",
  "dns-prefetch",
  "modulepreload",
  "icon",
  "shortcut icon",
  "apple-touch-icon",
  "manifest",
  "font",
]);

/** Elements whose single named attribute is a fetched resource URL, checked as one candidate
 * (not a `srcset`-style list). */
const SINGLE_URL_ATTRS: ReadonlyArray<readonly [tag: string, attrName: string]> = [
  ["script", "src"],
  ["img", "src"],
  ["source", "src"],
  ["video", "src"],
  ["video", "poster"],
  ["audio", "src"],
  ["iframe", "src"],
  ["object", "data"],
  ["embed", "src"],
];

/** Elements whose named attribute is a `srcset`-style comma-separated candidate list. */
const SRCSET_ATTRS: ReadonlyArray<readonly [tag: string, attrName: string]> = [
  ["img", "srcset"],
  ["source", "srcset"],
];

/** Local stylesheet hrefs this walk discovers via `<link rel="stylesheet" href="...">` —
 * collected during the DOM walk, resolved and read afterward by `checkLinkedStylesheets`. */
function collectLocalStylesheetHrefs(document: Node): string[] {
  const hrefs: string[] = [];
  const walk = (node: Node) => {
    if (isElement(node) && node.tagName === "link") {
      const relTokens = (attr(node, "rel") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      const href = attr(node, "href");
      if (relTokens.includes("stylesheet") && href && !isExternalResourceUrl(href)) {
        hrefs.push(href);
      }
    }
    if ("childNodes" in node) for (const child of node.childNodes) walk(child);
  };
  walk(document);
  return hrefs;
}

/** Resolves a local stylesheet `href` against `baseDir` and validates that it stays inside
 * `containmentRoot`. The two are separate because a directory-index page's own relative hrefs
 * resolve against its own directory (`promo/docs/`) while the boundary they may not escape is the
 * whole site root (`promo/`) — resolving `../assets/style.css` against `promo/docs/` is legitimate
 * and lands inside `promo/`, whereas resolving it against `promo/` itself would escape. When
 * `containmentRoot` is omitted it defaults to `baseDir`, which is the single-root behaviour every
 * synthetic negative control below relies on.
 *
 * This function — and only this function — consults the real filesystem (`fs.realpathSync`,
 * `fs.statSync`) to do so, even when `StylesheetSource.readFile` below is injected: `baseDir`
 * selects *where* it looks, not *whether* it looks at a real filesystem. Every failure mode is
 * returned as a typed `{ ok: false, reason }` value, never thrown, so a caller can always turn it
 * into a violation instead of crashing `checkPage()`.
 *
 * Rejected, in order, and never read:
 *  - an absolute path;
 *  - an empty pathname once any `?query`/`#fragment` suffix is stripped (a query-only or
 *    fragment-only href, or `href="."`, both reduce to this);
 *  - a path that resolves outside `containmentRoot` — via `../`, or a symlink at or inside the
 *    resolved path pointing outside it;
 *  - a path that resolves to `containmentRoot` itself (a directory, never a stylesheet);
 *  - anything that does not exist, cannot be canonicalised, or exists but is not a regular file
 *    (a directory, a device, a socket, …).
 */
function resolveContainedStylesheetPath(
  href: string,
  baseDir: string,
  containmentRoot: string = baseDir,
): { ok: true; path: string } | { ok: false; reason: string } {
  const withoutFragment = (href.split("#")[0] ?? href).split("?")[0] ?? href;
  if (path.isAbsolute(withoutFragment)) {
    return { ok: false, reason: `absolute path "${href}" is not permitted` };
  }
  if (withoutFragment === "") {
    return { ok: false, reason: `"${href}" has no path once its query/fragment is removed` };
  }

  let resolvedBase: string;
  try {
    resolvedBase = realpathSync(baseDir);
  } catch (error) {
    return { ok: false, reason: `base directory "${baseDir}" could not be resolved: ${String(error)}` };
  }

  let resolvedRoot: string;
  try {
    resolvedRoot = realpathSync(containmentRoot);
  } catch (error) {
    return {
      ok: false,
      reason: `containment root "${containmentRoot}" could not be resolved: ${String(error)}`,
    };
  }

  // Stage 1: a plain-path containment check on the *unresolved* candidate, independent of
  // whether it exists. This catches ordinary `../` traversal even when the target is missing —
  // deferring straight to `realpathSync` (stage 2) would instead report a nonexistent traversal
  // target as "could not be resolved," which is true but a strictly weaker, less specific
  // finding than "this href escapes the promo root" for an href that plainly does.
  const candidate = path.resolve(resolvedBase, withoutFragment);
  const rawRel = path.relative(resolvedRoot, candidate);
  if (rawRel === "" || rawRel.startsWith("..") || path.isAbsolute(rawRel)) {
    return { ok: false, reason: `"${href}" resolves outside the promo root (${containmentRoot})` };
  }

  // Stage 2: resolve symlinks at or inside the candidate and re-check containment against the
  // *real* path — a symlink that sits inside the containment root (so stage 1 saw it as
  // contained) but points outside it must still be rejected, and this is also where nonexistence
  // surfaces.
  let real: string;
  try {
    real = realpathSync(candidate);
  } catch (error) {
    return { ok: false, reason: `"${href}" could not be resolved: ${String(error)}` };
  }
  const rel = path.relative(resolvedRoot, real);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: false, reason: `"${href}" resolves outside the promo root (${containmentRoot})` };
  }

  let stats;
  try {
    stats = statSync(real);
  } catch (error) {
    return { ok: false, reason: `"${href}" could not be stat'd: ${String(error)}` };
  }
  if (!stats.isFile()) {
    return { ok: false, reason: `"${href}" is not a regular file` };
  }

  return { ok: true, path: real };
}

function checkNode(node: Node, page: string, violations: Violation[]): void {
  if (isElement(node)) {
    const tag = node.tagName;

    if (tag === "link") {
      const relTokens = (attr(node, "rel") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      const href = attr(node, "href");
      const isResourceBearing = relTokens.some((r) => RESOURCE_BEARING_LINK_RELS.has(r));
      if (isResourceBearing && isExternalResourceUrl(href)) {
        violations.push({
          page,
          description: `<link rel="${attr(node, "rel")}" href="${href}"> loads a third-party resource on page load`,
        });
      }
    }

    if (tag === "input") {
      const type = (attr(node, "type") ?? "").toLowerCase();
      if (type === "image") {
        const src = attr(node, "src");
        if (isExternalResourceUrl(src)) {
          violations.push({ page, description: `<input type="image" src="${src}"> loads a third-party image` });
        }
      }
    } else {
      for (const [t, attrName] of SINGLE_URL_ATTRS) {
        if (tag !== t) continue;
        const value = attr(node, attrName);
        if (isExternalResourceUrl(value)) {
          violations.push({
            page,
            description: `<${tag} ${attrName}="${value}"> loads a third-party resource`,
          });
        }
      }
    }

    for (const [t, attrName] of SRCSET_ATTRS) {
      if (tag !== t) continue;
      const raw = attr(node, attrName);
      for (const candidate of srcsetCandidates(raw)) {
        if (isExternalResourceUrl(candidate)) {
          violations.push({
            page,
            description: `<${tag} ${attrName}="${raw}"> candidate "${candidate}" is a third-party image`,
          });
        }
      }
    }

    if (tag === "style" && "childNodes" in node) {
      const cssText = node.childNodes
        .map((c) => ("value" in c ? (c as { value: string }).value : ""))
        .join("");
      for (const v of scanCssForViolations(cssText)) {
        violations.push({ page, description: `inline <style> ${v.kind} references a disallowed resource: ${v.raw}` });
      }
    }

    const styleAttr = attr(node, "style");
    if (styleAttr) {
      for (const v of scanCssForViolations(styleAttr)) {
        violations.push({
          page,
          description: `<${tag} style="${styleAttr}"> ${v.kind} references a disallowed resource: ${v.raw}`,
        });
      }
    }

    // `<a href>` is deliberately not checked — an outbound hyperlink is not a page-load request.
  }

  if ("childNodes" in node) {
    for (const child of node.childNodes) {
      checkNode(child, page, violations);
    }
  }
}

interface StylesheetSource {
  /** Directory local stylesheet hrefs resolve against — for a real page, that page's own
   * directory, since its hrefs are document-relative. This selects *where*
   * `resolveContainedStylesheetPath` looks; the containment and regular-file checks it performs
   * (`realpathSync`, `statSync`) always run against the real filesystem at that location, for
   * every caller, real or synthetic — they are not part of this injectable surface. */
  baseDir: string;
  /** Boundary a resolved stylesheet may not escape — the promo root for a real page, so a
   * nested page's legitimate `../assets/style.css` is contained while a genuine escape still is
   * not. Omitted means "same as `baseDir`", the single-root behaviour the synthetic negative
   * controls below are written against. */
  containmentRoot?: string;
  /** Reads a path that has already passed containment and regular-file validation — defaults to
   * real `fs.readFileSync`. This is the one operation that's actually mockable: a test can
   * substitute a controlled failure or a synthetic body here without needing to fake
   * `existsSync`/`realpathSync`/`statSync`, which stay real regardless. Any exception this
   * throws is caught by `checkLinkedStylesheets` and reported as a violation, never propagated
   * to the caller. */
  readFile: (resolvedPath: string) => string;
}

/** The real-filesystem source for one generated page: resolve against the page's own directory,
 * contain within promo/. */
function realStylesheetSource(page: string): StylesheetSource {
  return {
    baseDir: pageDir(page),
    containmentRoot: PROMO_DIR,
    readFile: (p) => readFileSync(p, "utf8"),
  };
}

function checkLinkedStylesheets(
  document: Node,
  page: string,
  violations: Violation[],
  source: StylesheetSource,
): void {
  for (const href of collectLocalStylesheetHrefs(document)) {
    const resolved = resolveContainedStylesheetPath(href, source.baseDir, source.containmentRoot);
    if (!resolved.ok) {
      violations.push({ page, description: `linked stylesheet "${href}": ${resolved.reason}` });
      continue; // never read or scanned: containment/regular-file validation already failed
    }

    let cssText: string;
    try {
      cssText = source.readFile(resolved.path);
    } catch (error) {
      violations.push({
        page,
        description: `linked stylesheet "${href}" could not be read: ${String(error)}`,
      });
      continue; // never scanned: the read itself failed
    }

    for (const v of scanCssForViolations(cssText)) {
      violations.push({
        page,
        description: `linked stylesheet "${href}" ${v.kind} references a disallowed resource: ${v.raw}`,
      });
    }
  }
}

function checkPage(
  html: string,
  page: string,
  source: StylesheetSource = realStylesheetSource(page),
): Violation[] {
  const document = parse(html);
  const violations: Violation[] = [];
  checkNode(document, page, violations);
  checkLinkedStylesheets(document, page, violations, source);
  return violations;
}

describe("promo pages — zero third-party page-load requests", () => {
  it.each(PAGES)(
    "%s makes no external stylesheet/preconnect/script/media/frame/style request, inline or linked, and no @import",
    (page) => {
      const violations = checkPage(readPromoPage(page), page);
      expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    },
  );

  it("no page contains the literal string rsms.me (the specific dependency this test guards against)", () => {
    for (const page of PAGES) {
      expect(readPromoPage(page)).not.toContain("rsms.me");
    }
  });

  it("still contains legitimate outbound citation hyperlinks (proves the check isn't vacuous by rejecting everything)", () => {
    const html = readPromoPage("locales/index.html");
    expect(html).toMatch(/<a[^>]+href="https:\/\/[^"]+"/);
  });

  it("promo/assets/fonts.css remains the only font source (data-URL embedded, generated by build_brandbook.py's fonts_css())", () => {
    const fontsCssPath = path.join(PROMO_DIR, "assets", "fonts.css");
    expect(existsSync(fontsCssPath)).toBe(true);
    const css = readFileSync(fontsCssPath, "utf8");
    expect(css).toContain("@font-face");
    expect(css).toContain("data:font/woff2;base64,");
    expect(scanCssForViolations(css)).toEqual([]);
    for (const page of PAGES) {
      const html = readPromoPage(page);
      // Depth-exact, not a loosened pattern: the home page links "assets/fonts.css" and a
      // directory-index page "../assets/fonts.css", and linking the wrong one is precisely the
      // regression this asserts against.
      expect(html).toContain(`<link rel="stylesheet" href="${assetPrefix(page)}assets/fonts.css">`);
    }
  });

  it("every locally linked stylesheet on every page resolves inside promo/ and is actually read and scanned", () => {
    for (const page of PAGES) {
      const document = parse(readPromoPage(page));
      const hrefs = collectLocalStylesheetHrefs(document);
      expect(hrefs.length, `${page}: expected at least one local stylesheet link`).toBeGreaterThan(0);
      for (const href of hrefs) {
        // Resolved from the page's own directory (its hrefs are document-relative) but contained
        // within promo/ — so a wrong-depth "../assets/style.css" fails here as nonexistent.
        const resolved = resolveContainedStylesheetPath(href, pageDir(page), PROMO_DIR);
        expect(
          resolved.ok,
          `${page}: "${href}" must resolve inside promo/` +
            (resolved.ok ? "" : ` — ${resolved.reason}`),
        ).toBe(true);
        if (resolved.ok) {
          expect(existsSync(resolved.path), `${page}: linked stylesheet "${href}" must exist`).toBe(true);
        }
      }
    }
  });

  it("every page's own <script src> resolves to a file that exists inside promo/", () => {
    for (const page of PAGES) {
      const srcs = [...readPromoPage(page).matchAll(/<script\s+src="([^"]+)"/g)].map((m) => m[1]!);
      expect(srcs.length, `${page}: expected at least one local script`).toBeGreaterThan(0);
      for (const src of srcs) {
        // Same two-root resolution as stylesheets; scripts are the other depth-sensitive asset
        // reference the generator emits (assets/site.js, and the playground's engine bundle).
        const resolved = resolveContainedStylesheetPath(src, pageDir(page), PROMO_DIR);
        expect(
          resolved.ok,
          `${page}: <script src="${src}"> must resolve to an existing file inside promo/` +
            (resolved.ok ? "" : ` — ${resolved.reason}`),
        ).toBe(true);
      }
    }
  });
});

describe("no-external-requests detector — negative controls (each must be CAUGHT, not silently passed)", () => {
  it("1. catches an external second srcset candidate behind a relative first one", () => {
    const html =
      '<!doctype html><html><body><img src="a.png" srcset="a.png 1x, https://evil.example/b.png 2x"></body></html>';
    const violations = checkPage(html, "synthetic");
    expect(violations.some((v) => v.description.includes("evil.example"))).toBe(true);
  });

  it("3. catches an external string-form @import", () => {
    const css = '@import "https://evil.example/reset.css";';
    const violations = scanCssForViolations(css);
    expect(violations.some((v) => v.kind === "@import" && v.url.includes("evil.example"))).toBe(true);
  });

  it("3b. catches an external url()-form @import too (both @import forms)", () => {
    const css = "@import url(https://evil.example/reset.css);";
    const violations = scanCssForViolations(css);
    expect(violations.some((v) => v.kind === "@import")).toBe(true);
  });

  it("3c. fail-closed: catches a LOCAL @import too — the policy is 'no @import', not 'no external @import'", () => {
    const violations = scanCssForViolations('@import "local.css";');
    expect(violations.some((v) => v.kind === "@import" && v.url.includes("local.css"))).toBe(true);
  });

  it("4. catches an external URL inside an inline style=\"\" attribute", () => {
    const html =
      '<!doctype html><html><body><div style="background-image:url(https://evil.example/bg.png)"></div></body></html>';
    const violations = checkPage(html, "synthetic");
    expect(violations.some((v) => v.description.includes("evil.example"))).toBe(true);
  });

  it("does not flag a relative srcset or a relative style=\"\" url()", () => {
    const html =
      '<!doctype html><html><body>' +
      '<img src="a.png" srcset="a.png 1x, a-2x.png 2x">' +
      '<div style="background-image:url(assets/bg.png)"></div>' +
      "</body></html>";
    expect(checkPage(html, "synthetic")).toEqual([]);
  });

  it("does not flag a data: URL in url() or an <a href> citation link", () => {
    const html =
      '<!doctype html><html><body>' +
      '<div style="background:url(data:image/png;base64,AAAA)"></div>' +
      '<a href="https://example.com/citation">a source</a>' +
      "</body></html>";
    expect(checkPage(html, "synthetic")).toEqual([]);
  });
});

describe("no-external-requests detector — end-to-end linked-stylesheet negative control (real files, disposable directory)", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  it("2. catches an external url() inside a linked (non-inline) stylesheet, through the full HTML→link→file→scan path", () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "polytypo-no-external-requests-"));
    writeFileSync(
      path.join(tmpDir, "evil.css"),
      ".brand { background: url(https://evil.example/logo.png); }",
      "utf8",
    );
    const html =
      '<!doctype html><html><head><link rel="stylesheet" href="evil.css"></head><body></body></html>';

    // No `readFile` override — this exercises the real fs.readFileSync path, not an injected
    // mock, against the disposable directory via the `baseDir` override alone.
    const violations = checkPage(html, "synthetic", { baseDir: tmpDir, readFile: (p) => readFileSync(p, "utf8") });

    expect(
      violations.some((v) => v.description.includes("linked stylesheet") && v.description.includes("evil.example")),
      JSON.stringify(violations, null, 2),
    ).toBe(true);
  });

  it("a clean linked stylesheet in the same disposable-directory setup produces no violation (proves the path isn't vacuously failing)", () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "polytypo-no-external-requests-"));
    writeFileSync(path.join(tmpDir, "clean.css"), ".brand { color: #000; }", "utf8");
    const html =
      '<!doctype html><html><head><link rel="stylesheet" href="clean.css"></head><body></body></html>';
    const violations = checkPage(html, "synthetic", { baseDir: tmpDir, readFile: (p) => readFileSync(p, "utf8") });
    expect(violations).toEqual([]);
  });

  it("path containment: rejects a linked stylesheet href that escapes the base directory via ../", () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "polytypo-no-external-requests-"));
    // A real file that exists just outside tmpDir, so a successful escape would actually read it.
    const outside = path.join(tmpdir(), `polytypo-outside-${Date.now()}.css`);
    writeFileSync(outside, "body{background:url(https://evil.example/x.png)}", "utf8");
    try {
      const html = `<!doctype html><html><head><link rel="stylesheet" href="../${path.basename(outside)}"></head><body></body></html>`;
      const violations = checkPage(html, "synthetic", { baseDir: tmpDir, readFile: (p) => readFileSync(p, "utf8") });
      expect(
        violations.some((v) => v.description.includes("resolves outside the promo root")),
        JSON.stringify(violations, null, 2),
      ).toBe(true);
      // And critically: the escaping file's own external url() must NOT have been the thing
      // reported — the escape itself is the violation, reported before the file is ever read.
      expect(violations.some((v) => v.description.includes("evil.example"))).toBe(false);
    } finally {
      rmSync(outside, { force: true });
    }
  });

  it("two-root resolution: a nested page's ../ href is contained, but one that escapes promo/ is still rejected", () => {
    // The directory-URL layout's own case, against the real promo/ output: resolving from
    // promo/docs/ with promo/ as the containment root must accept "../assets/style.css" and
    // still reject an href that climbs past promo/ entirely. Without the second root the first
    // would be a false positive; without the first root the second would be a false negative.
    const docsDir = path.join(PROMO_DIR, "docs");
    const contained = resolveContainedStylesheetPath("../assets/style.css", docsDir, PROMO_DIR);
    expect(contained.ok, JSON.stringify(contained)).toBe(true);

    const escaping = resolveContainedStylesheetPath("../../package.json", docsDir, PROMO_DIR);
    expect(escaping.ok).toBe(false);
    if (!escaping.ok) expect(escaping.reason).toContain("resolves outside the promo root");
  });

  it("path containment: rejects an absolute-path href", () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "polytypo-no-external-requests-"));
    const html = '<!doctype html><html><head><link rel="stylesheet" href="/etc/passwd"></head><body></body></html>';
    const violations = checkPage(html, "synthetic", { baseDir: tmpDir, readFile: (p) => readFileSync(p, "utf8") });
    expect(violations.some((v) => v.description.includes("absolute path"))).toBe(true);
  });

  it("path containment: a query/fragment suffix does not change which file is resolved or bypass containment", () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "polytypo-no-external-requests-"));
    writeFileSync(path.join(tmpDir, "clean.css"), ".brand { color: #000; }", "utf8");
    const html =
      '<!doctype html><html><head><link rel="stylesheet" href="clean.css?v=1#frag"></head><body></body></html>';
    const violations = checkPage(html, "synthetic", { baseDir: tmpDir, readFile: (p) => readFileSync(p, "utf8") });
    expect(violations).toEqual([]);

    const escapeHtml =
      '<!doctype html><html><head><link rel="stylesheet" href="../outside.css?v=1"></head><body></body></html>';
    const escapeViolations = checkPage(escapeHtml, "synthetic", {
      baseDir: tmpDir,
      readFile: (p) => readFileSync(p, "utf8"),
    });
    expect(escapeViolations.some((v) => v.description.includes("resolves outside the promo root"))).toBe(true);
  });

  it("path containment: rejects a symlink inside the base directory that points outside it", () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "polytypo-no-external-requests-"));
    const outside = path.join(tmpdir(), `polytypo-symlink-target-${Date.now()}.css`);
    writeFileSync(outside, "body{background:url(https://evil.example/x.png)}", "utf8");
    const linkPath = path.join(tmpDir, "inside-link.css");
    try {
      // Not every filesystem/OS grants symlink permission (notably some Windows
      // configurations) — skip cleanly if it fails, rather than failing this test on an
      // environment limitation unrelated to what it's proving.
      symlinkSync(outside, linkPath);
    } catch {
      rmSync(outside, { force: true });
      return; // symlinks unsupported in this environment — nothing more to prove here
    }
    try {
      const html =
        '<!doctype html><html><head><link rel="stylesheet" href="inside-link.css"></head><body></body></html>';
      const violations = checkPage(html, "synthetic", { baseDir: tmpDir, readFile: (p) => readFileSync(p, "utf8") });
      expect(
        violations.some((v) => v.description.includes("resolves outside the promo root")),
        JSON.stringify(violations, null, 2),
      ).toBe(true);
      expect(violations.some((v) => v.description.includes("evil.example"))).toBe(false);
    } finally {
      rmSync(outside, { force: true });
    }
  });

  it("fail-closed: href=\".\" is reported as a violation and does not throw", () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "polytypo-no-external-requests-"));
    const html = '<!doctype html><html><head><link rel="stylesheet" href="."></head><body></body></html>';
    let violations: Violation[] = [];
    expect(() => {
      violations = checkPage(html, "synthetic", { baseDir: tmpDir as string, readFile: (p) => readFileSync(p, "utf8") });
    }).not.toThrow();
    expect(
      violations.some((v) => v.description.includes("resolves outside the promo root") || v.description.includes("has no path")),
      JSON.stringify(violations, null, 2),
    ).toBe(true);
  });

  it("fail-closed: a query-only or fragment-only href is reported as a violation and does not throw", () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "polytypo-no-external-requests-"));
    for (const href of ["?v=1", "#frag", "?v=1#frag"]) {
      const html = `<!doctype html><html><head><link rel="stylesheet" href="${href}"></head><body></body></html>`;
      let violations: Violation[] = [];
      expect(() => {
        violations = checkPage(html, "synthetic", {
          baseDir: tmpDir as string,
          readFile: (p) => readFileSync(p, "utf8"),
        });
      }, `href="${href}" must not throw`).not.toThrow();
      expect(
        violations.some((v) => v.description.includes("has no path")),
        `href="${href}": ${JSON.stringify(violations, null, 2)}`,
      ).toBe(true);
    }
  });

  it("fail-closed: a directory target is rejected as non-regular and readFile is never called on it", () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "polytypo-no-external-requests-"));
    mkdirSync(path.join(tmpDir, "a-directory.css")); // deliberately a directory, not a file
    const html =
      '<!doctype html><html><head><link rel="stylesheet" href="a-directory.css"></head><body></body></html>';
    let readFileCalls = 0;
    const violations = checkPage(html, "synthetic", {
      baseDir: tmpDir,
      readFile: (p) => {
        readFileCalls += 1;
        return readFileSync(p, "utf8"); // would throw EISDIR if ever reached — proves the guard, not this fallback
      },
    });
    expect(readFileCalls, "readFile must never be called for a non-regular target").toBe(0);
    expect(
      violations.some((v) => v.description.includes("not a regular file")),
      JSON.stringify(violations, null, 2),
    ).toBe(true);
  });

  it("fail-closed: a readFile failure is converted into a violation and does not escape as an exception", () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "polytypo-no-external-requests-"));
    writeFileSync(path.join(tmpDir, "clean.css"), ".brand { color: #000; }", "utf8");
    const html =
      '<!doctype html><html><head><link rel="stylesheet" href="clean.css"></head><body></body></html>';
    let violations: Violation[] = [];
    expect(() => {
      violations = checkPage(html, "synthetic", {
        baseDir: tmpDir as string,
        readFile: () => {
          throw new Error("simulated read failure (e.g. permission denied, TOCTOU race)");
        },
      });
    }).not.toThrow();
    expect(
      violations.some((v) => v.description.includes("could not be read")),
      JSON.stringify(violations, null, 2),
    ).toBe(true);
    // And the simulated failure text itself surfaces, so a real failure is diagnosable, not swallowed.
    expect(violations.some((v) => v.description.includes("simulated read failure"))).toBe(true);
  });
});
