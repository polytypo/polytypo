// Source-level regression coverage for docs/AUDIT_REMEDIATION_AND_RELEASE_PLAN.md 6.2 (viral
// positioning): the required thesis wording, honest runtime status, and the absence of any
// analytics/tracking/remote-sharing dependency, checked against the actual generated promo/*.html
// output (not the .body.html templates) so a broken generator-side replacement key would be
// caught here too. Requires `promo/` to already be built — this repo's own documented order is
// `npm run generate:all` (or `gen:docs`) before running tests, same as this stage's own report.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROMO_DIR = path.join(ROOT, "promo");

const PAGES = ["index.html", "manifesto.html", "docs.html", "playground.html", "locales.html"];

function readPromoPage(name: string): string {
  const p = path.join(PROMO_DIR, name);
  if (!existsSync(p)) {
    throw new Error(
      `${p} does not exist — run "npm run gen:docs" (or "npm run generate:all") before ` +
        "running this test file, which checks the generated output, not just its source template.",
    );
  }
  return readFileSync(p, "utf8");
}

describe("promo/*.html — the em-dash thesis is present where required", () => {
  it("index.html leads with the thesis", () => {
    const html = readPromoPage("index.html");
    expect(html).toContain("The em dash was mine before AI.");
    expect(html).toContain("is typography, not a watermark.");
  });

  it("manifesto.html states the thesis independently of index.html", () => {
    const html = readPromoPage("manifesto.html");
    expect(html).toContain("The em dash was mine before AI.");
    expect(html).toContain("is typography, not a watermark.");
  });

  it("manifesto.html has its own stable URL and is reachable from the home page", () => {
    expect(existsSync(path.join(PROMO_DIR, "manifesto.html"))).toBe(true);
    const home = readPromoPage("index.html");
    expect(home).toMatch(/href="manifesto\.html"/);
  });

  it("manifesto.html invites readers to the playground without requiring npm/API docs", () => {
    const html = readPromoPage("manifesto.html");
    expect(html).toMatch(/href="playground\.html"/);
  });
});

describe("promo/*.html — honest runtime and claim wording", () => {
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

describe("promo/*.html — no analytics, trackers, cookies, or remote sharing SDKs", () => {
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

  it("playground.html's only <script src> references are the site's own local files", () => {
    const html = readPromoPage("playground.html");
    const srcs = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((m) => m[1]);
    expect(srcs.length).toBeGreaterThan(0);
    for (const src of srcs) {
      expect(src).not.toMatch(/^https?:\/\//);
    }
  });

  it("permalink sharing never sends input anywhere — no fetch()/XMLHttpRequest in playground.html", () => {
    const html = readPromoPage("playground.html");
    expect(html).not.toContain("fetch(");
    expect(html).not.toContain("XMLHttpRequest");
    expect(html).not.toContain("new WebSocket");
  });

  it("the Copy Link permalink is documented as fragment-only, never sent to a server", () => {
    const html = readPromoPage("playground.html");
    expect(html).toMatch(/never sent to any server/);
  });
});
