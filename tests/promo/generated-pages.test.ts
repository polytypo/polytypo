// Source-level regression coverage for docs/AUDIT_REMEDIATION_AND_RELEASE_PLAN.md 6.2 (viral
// positioning): the required thesis wording, honest runtime status, and the absence of any
// analytics/tracking/remote-sharing dependency, checked against the actual generated promo pages
// (not the .body.html templates) so a broken generator-side replacement key would be caught here
// too. Requires `promo/` to already be built — this repo's own documented order is
// `npm run generate:all` (or `gen:docs`) before running tests, same as this stage's own report.
//
// Pages are directory indexes served at directory URLs (promo/docs/index.html → /docs); only the
// home page sits at the promo root. Cross-page links are document-relative and therefore
// depth-dependent — "docs/" from home, "../docs/" from a nested page — so every href assertion
// below names the depth it is asserting at rather than a single sitewide string.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROMO_DIR = path.join(ROOT, "promo");

const PAGES = [
  "index.html",
  "manifesto/index.html",
  "docs/index.html",
  "playground/index.html",
  "locales/index.html",
];

function readPromoPage(name: string): string {
  const p = path.join(PROMO_DIR, ...name.split("/"));
  if (!existsSync(p)) {
    throw new Error(
      `${p} does not exist — run "npm run gen:docs" (or "npm run generate:all") before ` +
        "running this test file, which checks the generated output, not just its source template.",
    );
  }
  return readFileSync(p, "utf8");
}

describe("promo pages — the em-dash thesis is present where required", () => {
  it("the home page leads with the thesis", () => {
    const html = readPromoPage("index.html");
    expect(html).toContain("The em dash was mine before AI.");
    expect(html).toContain("is typography, not a watermark.");
  });

  it("the manifesto states the thesis independently of the home page", () => {
    const html = readPromoPage("manifesto/index.html");
    expect(html).toContain("The em dash was mine before AI.");
    expect(html).toContain("is typography, not a watermark.");
  });

  it("the manifesto has its own stable URL (/manifesto) and is reachable from the home page", () => {
    expect(existsSync(path.join(PROMO_DIR, "manifesto", "index.html"))).toBe(true);
    const home = readPromoPage("index.html");
    // Home is at depth 0, so the link to /manifesto is the bare directory "manifesto/".
    expect(home).toMatch(/href="manifesto\/"/);
  });

  it("the manifesto invites readers to the playground without requiring npm/API docs", () => {
    const html = readPromoPage("manifesto/index.html");
    // The manifesto is one directory down, so its link to /playground is "../playground/".
    expect(html).toMatch(/href="\.\.\/playground\/"/);
  });
});

describe("promo pages — honest runtime and claim wording", () => {
  it("states JavaScript is the implemented runtime today, not a broader claim", () => {
    const html = readPromoPage("index.html");
    expect(html).toMatch(/JavaScript is the implemented runtime today/);
  });

  it("does not claim the npm package is published", () => {
    for (const page of PAGES) {
      const html = readPromoPage(page).toLowerCase();
      for (const claim of ["available on npm", "published to npm", "now on npm", "npm i polytypo"]) {
        expect(html).not.toContain(claim);
      }
    }
    // "npm install polytypo" legitimately appears in the code sample, always paired with its
    // own "not yet published" status badge — assert that honest pairing is still there.
    const home = readPromoPage("index.html");
    expect(home).toContain("npm install polytypo");
    expect(home).toContain("npm — not yet published");
  });

  it("does not claim virality, adoption, or measured accuracy anywhere in generated copy", () => {
    for (const page of PAGES) {
      const html = readPromoPage(page).toLowerCase();
      for (const claim of ["going viral", "viral growth", "trusted by", "used in production by"]) {
        expect(html).not.toContain(claim);
      }
    }
  });
});

describe("promo pages — no analytics, trackers, cookies, or remote sharing SDKs", () => {
  const ANALYTICS_MARKERS = [
    "google-analytics",
    "googletagmanager",
    "gtag(",
    "plausible.io",
    "umami",
    "mixpanel",
    "segment.io",
    "hotjar",
    "sentry.io",
    "doubleclick",
    "facebook.net",
    "connect.facebook",
    "twitter.com/intent",
    "sharer.php",
    "document.cookie",
    "sendBeacon",
  ];

  for (const page of PAGES) {
    it(`${page} contains no analytics/tracker/remote-sharing markers`, () => {
      const html = readPromoPage(page);
      for (const marker of ANALYTICS_MARKERS) {
        expect(html.toLowerCase()).not.toContain(marker.toLowerCase());
      }
    });
  }

  it("the playground's only <script src> references are the site's own local files", () => {
    const html = readPromoPage("playground/index.html");
    const srcs = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((m) => m[1]);
    expect(srcs.length).toBeGreaterThan(0);
    for (const src of srcs) {
      expect(src).not.toMatch(/^https?:\/\//);
    }
  });

  // Both pages that embed the playground, not just /playground: the home page now carries the
  // same form, so the "what you type never leaves your browser" property has to hold on two pages.
  // This replaces the previous check that the removed Copy Link feature *documented* itself as
  // fragment-only — the prose is gone with the feature, so the property is asserted directly, on
  // more pages than before, instead of via a claim about wording.
  it.each(["index.html", "playground/index.html"])(
    "%s never sends input anywhere — no fetch()/XMLHttpRequest/WebSocket/form submission",
    (page) => {
      const html = readPromoPage(page);
      expect(html).not.toContain("fetch(");
      expect(html).not.toContain("XMLHttpRequest");
      expect(html).not.toContain("new WebSocket");
      expect(html).not.toMatch(/<form[\s>]/i);
    },
  );

  it("the lazily loaded engine bundle arrives as a <script> element, not an outbound request API", () => {
    // The home page fetches the engine on first interaction. Doing that with fetch()/XHR would
    // both break the assertion above and be a genuinely different privacy posture (a request body
    // this page could put anything into), so the loader is pinned to script-element injection.
    const html = readPromoPage("index.html");
    expect(html).toContain("script.src = ENGINE_SRC");
    expect(html).toContain('document.createElement("script")');
  });
});
