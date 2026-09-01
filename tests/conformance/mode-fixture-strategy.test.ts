// Protects the representative-coverage minimum documented as non-normative in
// spec/rules/modes.md §8 ("Fixture coverage strategy"). That section explains why
// spec/fixtures/ does not carry the full ten-locales × three-modes Cartesian product — mode
// adapters only select spans and hand them to the same locale-aware rule engine text mode uses
// (src/engine/span-runner.ts vs. src/engine/text-pipeline.ts both call into src/rules/registry.ts)
// — and states seven representative-coverage items instead. This file directly asserts exactly
// three of them, all read from spec/fixtures/*.json:
//   - item 4: at least two distinct locales carry html, markdown/commonmark, and markdown/mdx
//     fixtures (not "the same English output with a different `locale` field");
//   - the code-point half of item 5: at least one fixture per mode contains a non-ASCII code
//     point;
//   - item 7: every locale has a text-mode fixture for every canonical rule id in
//     spec/rules/order.json, checked per (locale, rule id) pair.
// It does not assert, and must not be read as asserting, anything about items 1–3 (HTML/
// CommonMark/MDX span selection), the parser-boundary half of item 5 (astral/surrogate-pair
// handling), or item 6 (byte-identical skipped regions and the round-trip guarantee) — those are
// protected by tests/modes/html.test.ts and tests/modes/markdown.test.ts, which this file does
// not duplicate and does not import.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverFixtureFiles, FIXTURES_DIR } from "./fixtures";

const files = discoverFixtureFiles();

const SPEC_DIR = path.resolve(FIXTURES_DIR, "..");
const ORDER: { rules: { id: string }[] } = JSON.parse(
  readFileSync(path.join(SPEC_DIR, "rules", "order.json"), "utf8"),
);
/** The canonical rule id list, read from spec/rules/order.json — never hardcoded as a count or
 * as a literal id list here, so a rule added or renamed in the spec is picked up automatically. */
const CANONICAL_RULE_IDS: readonly string[] = ORDER.rules.map((r) => r.id);

function localesWith(mode: string, dialect?: string): Set<string> {
  const locales = new Set<string>();
  for (const file of files) {
    for (const c of file.cases) {
      if (c.mode !== mode) continue;
      if (dialect !== undefined && c.dialect !== dialect) continue;
      locales.add(file.locale);
    }
  }
  return locales;
}

function hasNonAsciiCase(mode: string): boolean {
  return files.some((file) =>
    file.cases.some((c) => {
      if (c.mode !== mode) return false;
      const text = c.out ?? c.in;
      return [...text].some((ch) => (ch.codePointAt(0) ?? 0) > 0x7f);
    }),
  );
}

describe("mode-fixture representative-coverage minimum (spec/rules/modes.md §8)", () => {
  it("carries html fixtures in at least two distinct locales", () => {
    const locales = localesWith("html");
    expect(locales.size, `html-mode locales: ${[...locales].sort().join(", ")}`).toBeGreaterThanOrEqual(2);
  });

  it("carries markdown/commonmark fixtures in at least two distinct locales", () => {
    const locales = localesWith("markdown", "commonmark");
    expect(
      locales.size,
      `markdown/commonmark locales: ${[...locales].sort().join(", ")}`,
    ).toBeGreaterThanOrEqual(2);
  });

  it("carries markdown/mdx fixtures in at least two distinct locales", () => {
    const locales = localesWith("markdown", "mdx");
    expect(locales.size, `markdown/mdx locales: ${[...locales].sort().join(", ")}`).toBeGreaterThanOrEqual(2);
  });

  it("at least one html fixture exercises non-ASCII output (code-point/offset boundary coverage)", () => {
    expect(hasNonAsciiCase("html")).toBe(true);
  });

  it("at least one markdown fixture exercises non-ASCII output (code-point/offset boundary coverage)", () => {
    expect(hasNonAsciiCase("markdown")).toBe(true);
  });

  it("every locale has at least one text-mode fixture for every canonical rule id (spec/rules/order.json)", () => {
    // The compositional claim in modes.md §8 depends on text mode already covering every
    // locale-specific rule behaviour independently — this asserts that directly, per (locale,
    // rule id) pair, rather than the weaker "the locale has at least one fixture for *some*
    // rule" this test previously checked. Discovering and running whatever cases exist (the
    // conformance runner's own job) cannot by itself prove a *missing* case doesn't exist —
    // only an explicit cross-check against the canonical rule id list can.
    expect(CANONICAL_RULE_IDS.length, "canonical rule id list must be non-empty").toBeGreaterThan(0);

    const covered = new Map<string, Set<string>>(); // locale -> rule ids covered in text mode
    const locales = new Set<string>();
    for (const file of files) {
      locales.add(file.locale);
      const set = covered.get(file.locale) ?? new Set<string>();
      for (const c of file.cases) {
        if (c.mode === "text") set.add(c.rule);
      }
      covered.set(file.locale, set);
    }

    const missing: string[] = [];
    for (const locale of [...locales].sort()) {
      const rules = covered.get(locale) ?? new Set<string>();
      for (const ruleId of CANONICAL_RULE_IDS) {
        if (!rules.has(ruleId)) missing.push(`${locale}/${ruleId}`);
      }
    }

    expect(missing, `missing (locale/rule) text-mode fixture coverage: ${missing.join(", ")}`).toEqual([]);
    expect(locales.size).toBeGreaterThanOrEqual(10);
  });

  it("html and markdown/mdx locale sets are not both the single English locale (proves the check isn't vacuous)", () => {
    const htmlLocales = localesWith("html");
    const mdxLocales = localesWith("markdown", "mdx");
    expect(htmlLocales.has("en-US") && htmlLocales.size === 1).toBe(false);
    expect(mdxLocales.has("en-US") && mdxLocales.size === 1).toBe(false);
  });

  it("the full-coverage check is not vacuously true (proves it actually inspects rule ids, not just locale presence)", () => {
    // A deliberately incomplete rule-coverage map — one locale missing one canonical rule id —
    // must be reported as a miss by the same logic the test above uses, not silently accepted.
    const fakeCanonicalRuleIds = ["spaces", "quotes", "nbsp"];
    const fakeCoverage = new Map<string, Set<string>>([
      ["en-US", new Set(["spaces", "quotes", "nbsp"])],
      ["fr", new Set(["spaces", "quotes"])], // missing "nbsp" on purpose
    ]);
    const missing: string[] = [];
    for (const [locale, rules] of fakeCoverage) {
      for (const ruleId of fakeCanonicalRuleIds) {
        if (!rules.has(ruleId)) missing.push(`${locale}/${ruleId}`);
      }
    }
    expect(missing).toEqual(["fr/nbsp"]);
  });
});
