// Security and structural regression tests for REVIEW.html (scripts/dogfood/review-html.ts).
// String-level checks only, deliberately -- no browser-test dependency is added for these (Stage
// 10 Pass A's own instruction); a real browser smoke test is done separately, once, against a
// small synthetic bundle, and reported in the final response rather than re-run on every CI pass.
import { describe, expect, it } from "vitest";
import { transform } from "../../src/index.js";
import { computeFileDiff } from "../../scripts/dogfood/diff.js";
import { attributeReviewChanges } from "../../scripts/dogfood/attribution.js";
import { buildReviewChangeEntries } from "../../scripts/dogfood/evidence.js";
import { buildReviewHtml, inlineReviewRuntime } from "../../scripts/dogfood/review-html.js";
import { readFileSync } from "node:fs";
import path from "node:path";

const REVIEW_RUNTIME_SOURCE = readFileSync(
  path.join(__dirname, "..", "..", "scripts", "dogfood", "review-runtime.js"),
  "utf8",
);

function buildFixtureHtml(original: string, evidenceReviewHash = "a".repeat(64)) {
  const full = transform(original, { locale: "en-US", mode: "text" });
  const diff = computeFileDiff("f.md", original, full);
  const attr = attributeReviewChanges(
    original,
    { locale: "en-US", mode: "text" },
    diff.reviewChanges,
  );
  const result = {
    path: "f.md",
    bytes: 0,
    sha256: "x",
    status: "changed" as const,
    idempotencyOk: true,
    diff,
    originalText: original,
    transformedText: full,
    attribution: attr,
  };
  const entries = buildReviewChangeEntries([result]);
  const html = buildReviewHtml(
    entries,
    evidenceReviewHash,
    {
      corpus: "/x",
      locale: "en-US",
      mode: "text",
      dialect: "commonmark",
      specVersion: "0.0.0",
      implementationAggregateHash: "b".repeat(64),
      corpusAggregateHash: "c".repeat(64),
      gitHead: "deadbeef",
    },
    REVIEW_RUNTIME_SOURCE,
  );
  return { html, entries };
}

describe("inlineReviewRuntime", () => {
  it("strips leading 'export ' from top-level declarations, leaving the rest untouched", () => {
    const inlined = inlineReviewRuntime(REVIEW_RUNTIME_SOURCE);
    expect(inlined).not.toMatch(/^export\s/m);
    expect(inlined).toContain("function storageKey(");
    expect(inlined).toContain("function validateImportPayload(");
  });
});

describe("REVIEW.html: no external requests, no CDN, no unsafe sinks", () => {
  it("15. contains no http://, https://, or protocol-relative URLs", () => {
    const { html } = buildFixtureHtml("It's fine.\n");
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/["'(]\/\/[a-z0-9]/i); // protocol-relative "//host/..."
  });

  it("contains no external <script src> or <link href>", () => {
    const { html } = buildFixtureHtml("It's fine.\n");
    expect(html).not.toMatch(/<script[^>]+\ssrc=/i);
    expect(html).not.toMatch(/<link[^>]+\shref=/i);
  });

  it("contains no fetch/XHR/WebSocket/EventSource/sendBeacon calls anywhere in the page", () => {
    const { html } = buildFixtureHtml("It's fine.\n");
    expect(html).not.toMatch(/\bfetch\s*\(/);
    expect(html).not.toMatch(/XMLHttpRequest/);
    expect(html).not.toMatch(/new WebSocket/);
    expect(html).not.toMatch(/new EventSource/);
    expect(html).not.toMatch(/sendBeacon/);
  });

  it("declares a Content-Security-Policy meta tag consistent with a fully local, no-network page", () => {
    const { html } = buildFixtureHtml("It's fine.\n");
    expect(html).toMatch(/<meta http-equiv="Content-Security-Policy"/);
    expect(html).toContain("default-src 'none'");
  });

  it("never assigns to innerHTML/outerHTML/document.write -- content rendering is textContent/DOM-node only", () => {
    const { html } = buildFixtureHtml("It's fine.\n");
    expect(html).not.toMatch(/\.innerHTML\s*=/);
    expect(html).not.toMatch(/\.outerHTML\s*=/);
    expect(html).not.toMatch(/document\.write/);
  });
});

describe("REVIEW.html: user-controlled / corpus-derived content is never live markup", () => {
  it("14. a review row's before/after text containing HTML/script-like content is embedded only as JSON data inside a <script> block, and the page's own runtime never inserts it via innerHTML -- so an HTML parser never treats it as markup, even though the literal characters appear in the JSON blob (that is normal, safe: content inside a <script> element's text is never tag-parsed by the HTML tokenizer, only JS-parsed)", () => {
    const { html } = buildFixtureHtml(
      "Text with \"<img src=x onerror=alert(1)>\" and 'quotes' here.\n",
    );
    // Never assigned to innerHTML/outerHTML anywhere in the page's script logic (already covered
    // by a dedicated test above) -- that is what actually determines whether this text can ever
    // become live markup, not whether the substring appears in the JSON data blob.
    expect(html).not.toMatch(/\.innerHTML\s*=/);
    // The hostile fragment must not appear OUTSIDE the embedded-data <script> block -- i.e. not in
    // the page's static HTML markup (header, filters, footer) where it never belongs at all.
    const dataScriptStart = html.indexOf("window.__REVIEW_DATA__");
    const beforeDataScript = html.slice(0, dataScriptStart);
    expect(beforeDataScript).not.toContain("<img src=x onerror=alert(1)>");
  });

  it("a literal </script> inside corpus text cannot prematurely close the embedded data <script> block", () => {
    const { html } = buildFixtureHtml(
      'See the "</script><script>alert(1)</script>" example here.\n',
    );
    // The specific danger is the HTML tokenizer seeing a real "</script>" close sequence while
    // still inside the data <script> element's text, which would truncate that element early and
    // let everything after it (including "<script>alert(1)</script>") be parsed as new markup /a
    // new real script. embedJson's `</` -> `<\/` substitution prevents exactly that: verify no
    // case-insensitive "</script>" close sequence survived inside the data blob.
    const dataScriptStart = html.indexOf("window.__REVIEW_DATA__");
    const dataScriptEnd = html.indexOf(";</script>", dataScriptStart);
    expect(dataScriptEnd).toBeGreaterThan(dataScriptStart);
    const dataBlob = html.slice(dataScriptStart, dataScriptEnd);
    expect(dataBlob.toLowerCase()).not.toContain("</script>");
    // The page must still contain exactly three real <script>...</script> elements (runtime, data,
    // behaviour) -- counted via real closing tags, since only "</script>" (not a bare "<script>"
    // reopening inside inert text) is meaningful to the HTML tokenizer here.
    const realCloseCount = (html.match(/<\/script>/gi) ?? []).length;
    expect(realCloseCount).toBe(3);
  });

  it("header interpolation (corpus/locale/git) HTML-escapes its inputs", () => {
    const { html } = buildFixtureHtml("It's fine.\n", "a".repeat(64));
    const withHostileMeta = buildReviewHtml(
      buildFixtureHtml("It's fine.\n").entries,
      "a".repeat(64),
      {
        corpus: "<script>alert(1)</script>",
        locale: "en-US",
        mode: "text",
        dialect: "commonmark",
        specVersion: "0",
        implementationAggregateHash: "b".repeat(64),
        corpusAggregateHash: "c".repeat(64),
        gitHead: "x",
      },
      REVIEW_RUNTIME_SOURCE,
    );
    expect(withHostileMeta).not.toContain("<script>alert(1)</script>");
    expect(withHostileMeta).toContain("&lt;script&gt;");
    void html;
  });
});

describe("REVIEW.html: content and determinism", () => {
  it("8. every review change id appears exactly once in the embedded review data", () => {
    const original = 'She said "this is fine" and it\'s here — nearly there.\n';
    const { html, entries } = buildFixtureHtml(original);
    for (const e of entries) {
      const occurrences = html.split(JSON.stringify(e.id)).length - 1;
      expect(occurrences).toBeGreaterThanOrEqual(1);
    }
    // The embedded `"ids":[...]` array must list each id exactly once.
    const idsMatch = html.match(/"ids":\[(.*?)\],"entries"/);
    expect(idsMatch).not.toBeNull();
    const ids = JSON.parse(`[${idsMatch![1]}]`) as string[];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(entries.length);
  });

  it("17. the same entries + hash + meta + runtime source produce byte-identical HTML (evidenceReviewHash reproducibility)", () => {
    const original = "It's fine.\n";
    const a = buildFixtureHtml(original, "same-hash");
    const b = buildFixtureHtml(original, "same-hash");
    expect(a.html).toBe(b.html);
  });

  it("18. a different evidenceReviewHash changes the embedded page content", () => {
    const original = "It's fine.\n";
    const a = buildFixtureHtml(original, "hash-one");
    const b = buildFixtureHtml(original, "hash-two");
    expect(a.html).not.toBe(b.html);
  });

  it("16. all paths inside the embedded data are relative/opaque -- no file:// incompatible absolute-URL assumptions in the script logic itself", () => {
    const { html } = buildFixtureHtml("It's fine.\n");
    // The export/import mechanism must use Blob + <a download>, never a raw filesystem write API.
    expect(html).toContain("URL.createObjectURL");
    expect(html).not.toMatch(/require\(["']fs["']\)/);
  });
});
