// Regression test for scripts/lib/workflow-shell-safety.mjs — proves the checker actually
// detects the exact class of bug it exists to prevent (Stage 6 follow-up review, item 2): a
// `${{ github.* }}` expression interpolated directly into a `run:` step's shell text, across
// every YAML scalar form a `run:` value can legally take (literal/folded block scalars with
// every indentation/chomping-indicator combination, and inline scalars), and including a GitHub
// expression whose argument contains a `}` (which a naive `[^}]*`-based matcher cannot find the
// close of — this checker doesn't need to, since it only proves the opener is absent). Also
// proves the fixed pattern (the same value passed through `env:`, referenced as a shell
// variable) does NOT trip the checker.
import { describe, expect, it } from "vitest";
import { findContextExpressionsInRunBlocks } from "../../scripts/lib/workflow-shell-safety.mjs";

function yamlRunStep(runHeader: string, ...bodyLines: string[]) {
  return [
    "jobs:",
    "  verify:",
    "    steps:",
    "      - name: Step",
    `        run: ${runHeader}`,
    ...bodyLines.map((line) => `          ${line}`),
  ].join("\n");
}

describe("scripts/lib/workflow-shell-safety.mjs — findContextExpressionsInRunBlocks()", () => {
  describe("literal block scalar (|) and its indentation/chomping-indicator variants", () => {
    const HEADERS = ["|", "|-", "|+", "|2", "|2-", "|2+", "|-2", "|+2"];
    for (const header of HEADERS) {
      it(`detects an expression under 'run: ${header}'`, () => {
        const yaml = yamlRunStep(header, 'echo "${{ github.ref_name }}"');
        const violations = findContextExpressionsInRunBlocks(yaml);
        expect(violations).toHaveLength(1);
      });
    }
  });

  describe("folded block scalar (>) and its indentation/chomping-indicator variants", () => {
    const HEADERS = [">", ">-", ">+", ">2", ">2-", ">2+", ">-2", ">+2"];
    for (const header of HEADERS) {
      it(`detects an expression under 'run: ${header}'`, () => {
        const yaml = yamlRunStep(header, 'echo "${{ github.ref_name }}"');
        const violations = findContextExpressionsInRunBlocks(yaml);
        expect(violations).toHaveLength(1);
      });
    }
  });

  it("detects an expression under a block scalar header with a trailing comment", () => {
    const yaml = yamlRunStep("|  # shell", 'echo "${{ github.ref_name }}"');
    expect(findContextExpressionsInRunBlocks(yaml)).toHaveLength(1);
  });

  it("detects an expression in an inline run:", () => {
    const yaml = [
      "jobs:",
      "  verify:",
      "    steps:",
      "      - name: Step",
      '        run: echo "${{ github.ref_name }}"',
    ].join("\n");
    expect(findContextExpressionsInRunBlocks(yaml)).toHaveLength(1);
  });

  it("detects a GitHub expression whose argument contains a brace, e.g. format('{0}', ...)", () => {
    // A naive /\$\{\{[^}]*\}\}/ stops at the inner "}" in "{0}" and never finds the real close —
    // this checker only needs to find the opener, so it must still report this.
    const yaml = yamlRunStep("|", 'echo "${{ format(\'{0}\', github.ref_name) }}"');
    const violations = findContextExpressionsInRunBlocks(yaml);
    expect(violations).toHaveLength(1);
    expect(violations.at(0)?.context).toContain("${{ format('{0}', github.ref_name) }}");
  });

  it("detects multiple openers on the same line", () => {
    const yaml = yamlRunStep("|", 'echo "${{ github.sha }} ${{ github.ref_name }}"');
    expect(findContextExpressionsInRunBlocks(yaml)).toHaveLength(2);
  });

  it("does NOT flag the fixed pattern: the same value passed through env: and referenced as a shell variable", () => {
    const yaml = [
      "jobs:",
      "  verify:",
      "    steps:",
      "      - name: Verify tag",
      "        env:",
      "          RELEASE_TAG: ${{ github.ref_name }}",
      "        run: |",
      '          node scripts/verify-release-tag.mjs "${RELEASE_TAG}"',
    ].join("\n");
    expect(findContextExpressionsInRunBlocks(yaml)).toEqual([]);
  });

  it("does not confuse a shell variable reference (${VAR}) with a GitHub expression (${{ }})", () => {
    const yaml = yamlRunStep("|", 'echo "${FILENAME}"', 'TARBALL="release-artifact/${FILENAME}"');
    expect(findContextExpressionsInRunBlocks(yaml)).toEqual([]);
  });

  it("stops a block scalar's shell text at the next dedented key (a sibling step field)", () => {
    const yaml = [
      "jobs:",
      "  verify:",
      "    steps:",
      "      - name: One",
      "        run: |",
      "          echo hi",
      "        env:",
      "          UNRELATED: ${{ github.actor }}",
      "      - name: Two",
      "        run: echo bye",
    ].join("\n");
    // github.actor sits in an `env:` block (safe), not inside either `run:` block.
    expect(findContextExpressionsInRunBlocks(yaml)).toEqual([]);
  });

  it("reports multiple violations across multiple steps, each with its own line number", () => {
    const yaml = [
      "jobs:",
      "  verify:",
      "    steps:",
      "      - name: One",
      "        run: echo ${{ github.sha }}",
      "      - name: Two",
      "        run: |",
      "          echo ${{ github.actor }}",
    ].join("\n");
    const violations = findContextExpressionsInRunBlocks(yaml);
    expect(violations).toHaveLength(2);
    expect(violations.at(0)?.lineNumber).not.toBe(violations.at(1)?.lineNumber);
  });

  it("passes on this repository's real release.yml and ci.yml", async () => {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    for (const file of ["release.yml", "ci.yml"]) {
      const text = await readFile(path.join(ROOT, ".github", "workflows", file), "utf8");
      expect(findContextExpressionsInRunBlocks(text), file).toEqual([]);
    }
  });
});
