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
    expect(html).toContain("is typography, not an AI watermark.");
  });

  it("the manifesto states the thesis independently of the home page", () => {
    const html = readPromoPage("manifesto/index.html");
    expect(html).toContain("The em dash was mine before AI.");
    expect(html).toContain("is typography, not an AI watermark.");
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
  // All five target runtimes (JS/TS, Python, Go, Ruby, PHP) are now actually published, so
  // registry names, package links, and version badges are real facts, not premature promises —
  // the operator lifted the single-runtime-era ban on mentioning them (2026-09-08). What remains
  // permanently forbidden, regardless of how many runtimes ship, is promise/announcement language
  // about a FUTURE state: this project ships what exists and never says "coming soon" about what
  // doesn't.
  it("no page promises a future or not-yet-real state", () => {
    for (const page of PAGES) {
      const html = readPromoPage(page).toLowerCase();
      for (const term of ["coming soon", "— planned", "not yet published"]) {
        expect(html).not.toContain(term);
      }
    }
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

describe("promo pages — no third-party analytics, trackers, cookies, or remote sharing SDKs", () => {
  // One explicit exception: the operator's own self-hosted Umami instance
  // (https://u.rogulia.fi/script.js, added 2026-09-07 — see no-external-requests.test.ts's
  // ALLOWED_EXTERNAL_URLS for the fuller rationale). It is operator-controlled infrastructure,
  // not a third-party SDK in the sense this list guards against, so its presence is asserted
  // explicitly below rather than left to silently not match "umami" because the custom domain
  // doesn't contain that literal word.
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
    it(`${page} contains no third-party analytics/tracker/remote-sharing markers, and carries exactly the operator's own`, () => {
      const html = readPromoPage(page);
      for (const marker of ANALYTICS_MARKERS) {
        expect(html.toLowerCase()).not.toContain(marker.toLowerCase());
      }
      expect(html).toContain('<script defer src="https://u.rogulia.fi/script.js"');
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

describe("promo site — favicon, robots.txt, sitemap.xml", () => {
  it.each([
    ["index.html", ""],
    ["docs/index.html", "../"],
    ["playground/index.html", "../"],
    ["locales/index.html", "../"],
    ["manifesto/index.html", "../"],
  ])("%s links its favicon at the correct depth, and every linked file exists", (page, prefix) => {
    const html = readPromoPage(page);
    expect(html).toContain(`<link rel="icon" href="${prefix}assets/favicon/favicon.svg"`);
    expect(html).toContain(`<link rel="icon" href="${prefix}assets/favicon/favicon.ico"`);
    expect(html).toContain(
      `<link rel="apple-touch-icon" href="${prefix}assets/favicon/apple-touch-icon-180.png">`,
    );
    for (const name of [
      "favicon.svg",
      "favicon.ico",
      "favicon-16.png",
      "favicon-32.png",
      "favicon-48.png",
      "apple-touch-icon-180.png",
    ]) {
      expect(existsSync(path.join(PROMO_DIR, "assets", "favicon", name))).toBe(true);
    }
  });

  it("robots.txt allows everything and points at the sitemap", () => {
    const robots = readFileSync(path.join(PROMO_DIR, "robots.txt"), "utf8");
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Sitemap: https://polytypo.dev/sitemap.xml");
  });

  it("sitemap.xml lists exactly the five generated pages, as absolute directory URLs", () => {
    const sitemap = readFileSync(path.join(PROMO_DIR, "sitemap.xml"), "utf8");
    for (const loc of [
      "https://polytypo.dev/",
      "https://polytypo.dev/docs/",
      "https://polytypo.dev/playground/",
      "https://polytypo.dev/locales/",
      "https://polytypo.dev/manifesto/",
    ]) {
      expect(sitemap).toContain(`<loc>${loc}</loc>`);
    }
    expect(sitemap.match(/<url>/g)).toHaveLength(5);
  });
});

describe("promo site — llms.txt (llmstxt.org convention)", () => {
  function readLlmsTxt(): string {
    const p = path.join(PROMO_DIR, "llms.txt");
    if (!existsSync(p)) {
      throw new Error(
        `${p} does not exist — run "npm run gen:docs" (or "npm run generate:all") before ` +
          "running this test file, which checks the generated output, not just its source.",
      );
    }
    return readFileSync(p, "utf8");
  }

  it("starts with an H1 project name and a blockquote summary, per the llms.txt spec", () => {
    const lines = readLlmsTxt().split("\n");
    expect(lines[0]).toBe("# polytypo");
    expect(lines[1]).toBe("");
    expect(lines[2].startsWith("> ")).toBe(true);
  });

  it("links every promo page it references as an absolute https://polytypo.dev URL", () => {
    const llms = readLlmsTxt();
    for (const url of [
      "https://polytypo.dev/docs/",
      "https://polytypo.dev/locales/",
      "https://polytypo.dev/playground/",
      "https://polytypo.dev/manifesto/",
    ]) {
      expect(llms).toContain(`(${url})`);
    }
  });

  it("lists all five published runtime packages with a working source link each", () => {
    const llms = readLlmsTxt();
    for (const url of [
      "https://www.npmjs.com/package/polytypo",
      "https://pypi.org/project/polytypo/",
      "https://pkg.go.dev/github.com/polytypo/polytypo-go",
      "https://rubygems.org/gems/polytypo",
      "https://packagist.org/packages/polytypo/polytypo",
    ]) {
      expect(llms).toContain(`(${url})`);
    }
    expect(llms.match(/^- \[/gm)).toHaveLength(
      3 /* docs */ + 5 /* packages */ + 1 /* spec */ + 1 /* optional */,
    );
  });

  it("links the canonical spec repo, not a page that doesn't exist yet", () => {
    expect(readLlmsTxt()).toContain("(https://github.com/polytypo/polytypo)");
  });

  it("contains no unresolved template tokens or promises about unshipped work", () => {
    const llms = readLlmsTxt();
    expect(llms).not.toMatch(/\{\{.*?\}\}/);
    expect(llms.toLowerCase()).not.toMatch(/coming soon|planned|roadmap|work in progress/);
  });

  it("is reachable at the site root, and robots.txt does not block it from any crawler", () => {
    // llms.txt has no special robots directive of its own (llmstxt.org) — it just needs to sit
    // at the site root and not be excluded by the sitewide rule this file already asserts on.
    expect(existsSync(path.join(PROMO_DIR, "llms.txt"))).toBe(true);
    const robots = readFileSync(path.join(PROMO_DIR, "robots.txt"), "utf8");
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
  });
});
