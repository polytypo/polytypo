// Exercises scripts/lib/entry-reach.mjs's pure evaluation logic against fabricated module-path
// lists — proving each forbidden/required category can independently make the dependency-reach
// check fail, and that a clean graph passes. This is the permanent, checked-in replacement for a
// one-off manual "mutate a file, observe failure, restore" demonstration
// (AUDIT_REMEDIATION_AND_RELEASE_PLAN.md 5.1 review, item 4): it runs on every `npm test`, needs
// no real esbuild bundle or dist/ build, and cannot go stale relative to the real checker because
// scripts/check-entry-reach.mjs imports the exact same `evaluate`/`ENTRIES` this file imports.
import { describe, expect, it } from "vitest";
import { ENTRIES, evaluate, PACKAGES } from "../../scripts/lib/entry-reach.mjs";

const CLEAN_TEXT_GRAPH = [
  "src/index.text.ts",
  "src/engine/text-pipeline.ts",
  "src/engine/rule-runner.ts",
  "src/rules/quotes.ts",
];

const CLEAN_HTML_GRAPH = [
  ...CLEAN_TEXT_GRAPH,
  "src/index.html.ts",
  "src/engine/html-pipeline.ts",
  "src/modes/html.ts",
  "node_modules/parse5/dist/cjs/index.js",
];

const CLEAN_MARKDOWN_GRAPH = [
  ...CLEAN_HTML_GRAPH,
  "src/index.markdown.ts",
  "src/engine/markdown-pipeline.ts",
  "src/modes/markdown.ts",
  "node_modules/micromark/lib/compile.js",
  "node_modules/micromark-extension-gfm/index.js",
  "node_modules/micromark-extension-frontmatter/index.js",
  "node_modules/micromark-extension-mdxjs/index.js",
];

function pathFor(packageName: string): string {
  return `node_modules/${packageName}/index.js`;
}

describe("scripts/lib/entry-reach.mjs — evaluate()", () => {
  it("passes text on a clean graph", () => {
    expect(evaluate(CLEAN_TEXT_GRAPH, ENTRIES.text)).toMatchObject({ ok: true });
  });

  it("passes html on a clean graph (parse5 present, Markdown stack absent)", () => {
    expect(evaluate(CLEAN_HTML_GRAPH, ENTRIES.html)).toMatchObject({ ok: true });
  });

  it("passes markdown and index on a clean graph (all five present)", () => {
    expect(evaluate(CLEAN_MARKDOWN_GRAPH, ENTRIES.markdown)).toMatchObject({ ok: true });
    expect(evaluate(CLEAN_MARKDOWN_GRAPH, ENTRIES.index)).toMatchObject({ ok: true });
  });

  describe("text — each forbidden category independently fails the check", () => {
    const cases: Array<[string, string]> = [
      ["parse5", "parse5"],
      ["micromark core", "micromark"],
      ["GFM extension", "micromark-extension-gfm"],
      ["frontmatter extension", "micromark-extension-frontmatter"],
      ["MDX extension", "micromark-extension-mdxjs"],
    ];
    for (const [label, packageName] of cases) {
      it(`fails when ${label} leaks in`, () => {
        const mutated = [...CLEAN_TEXT_GRAPH, pathFor(packageName)];
        const result = evaluate(mutated, ENTRIES.text);
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("forbidden");
        expect(result.forbiddenHits).toContain(pathFor(packageName));
      });
    }
  });

  describe("html — each Markdown-stack forbidden category independently fails the check", () => {
    const cases: Array<[string, string]> = [
      ["micromark core", "micromark"],
      ["GFM extension", "micromark-extension-gfm"],
      ["frontmatter extension", "micromark-extension-frontmatter"],
      ["MDX extension", "micromark-extension-mdxjs"],
    ];
    for (const [label, packageName] of cases) {
      it(`fails when ${label} leaks in`, () => {
        const mutated = [...CLEAN_HTML_GRAPH, pathFor(packageName)];
        const result = evaluate(mutated, ENTRIES.html);
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("forbidden");
      });
    }
  });

  it("html fails when parse5 (its required package) is missing", () => {
    const withoutParse5 = CLEAN_HTML_GRAPH.filter((f) => !PACKAGES.parse5.test(f));
    const result = evaluate(withoutParse5, ENTRIES.html);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("missing-required");
    expect(result.missingRequired).toContain(PACKAGES.parse5);
  });

  describe("markdown — each required category independently fails the check when missing", () => {
    const cases: Array<[string, string]> = [
      ["parse5", "parse5"],
      ["micromark core", "micromark"],
      ["GFM extension", "micromark-extension-gfm"],
      ["frontmatter extension", "micromark-extension-frontmatter"],
      ["MDX extension", "micromark-extension-mdxjs"],
    ];
    for (const [label, packageName] of cases) {
      it(`fails when ${label} is missing`, () => {
        const pattern = Object.values(PACKAGES).find((p) => p.test(pathFor(packageName)));
        expect(pattern).toBeDefined();
        const withoutOne = CLEAN_MARKDOWN_GRAPH.filter((f) => !pattern!.test(f));
        const result = evaluate(withoutOne, ENTRIES.markdown);
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("missing-required");
      });
    }
  });

  it("index shares markdown's required-reach spec (both require all five)", () => {
    expect(ENTRIES.index.required).toEqual(ENTRIES.markdown.required);
    expect(ENTRIES.index.forbidden).toEqual(ENTRIES.markdown.forbidden);
  });
});
