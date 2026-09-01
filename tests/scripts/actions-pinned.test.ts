// Regression test for scripts/lib/actions-pinned.mjs — proves the semantic-parsing checker
// accepts an immutably pinned action reference and rejects every unpinned form (mutable major
// tag, full release tag, branch, abbreviated SHA, missing revision, dynamic expression), across
// every valid YAML shape a `uses:` key can take — ordinary block mapping, flow mapping, quoted
// key — not just the common `uses: value` spelling a line-oriented regex would see. Also proves,
// against a disposable directory and by exercising the real CLI script
// (scripts/check-actions-pinned.mjs, via checkWorkflowsDirectory — the exact function it calls,
// not a second hand-rolled scanner), that the checker exits non-zero on a genuine violation.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { checkWorkflowsDirectory, findUnpinnedActionUses } from "../../scripts/lib/actions-pinned.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REAL_SHA = "fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09"; // actions/checkout@v5.1.0, real pin

function yamlStep(usesLine: string) {
  return ["jobs:", "  verify:", "    steps:", `      - ${usesLine}`].join("\n");
}

describe("scripts/lib/actions-pinned.mjs — findUnpinnedActionUses()", () => {
  describe("baseline pinning rules (unchanged by the semantic-parsing rewrite)", () => {
    it("accepts a full 40-character commit SHA with a version comment", () => {
      const yaml = yamlStep(`uses: actions/checkout@${REAL_SHA} # v5.1.0`);
      expect(findUnpinnedActionUses(yaml)).toEqual([]);
    });

    it("rejects a mutable major tag", () => {
      const violations = findUnpinnedActionUses(yamlStep("uses: actions/checkout@v5"));
      expect(violations).toHaveLength(1);
      expect(violations[0]?.reason).toContain("not pinned to a full 40-character commit SHA");
    });

    it("rejects a full release tag", () => {
      const violations = findUnpinnedActionUses(yamlStep("uses: actions/checkout@v5.1.0"));
      expect(violations).toHaveLength(1);
      expect(violations[0]?.reason).toContain("not pinned to a full 40-character commit SHA");
    });

    it("rejects a branch reference", () => {
      const violations = findUnpinnedActionUses(yamlStep("uses: actions/checkout@main"));
      expect(violations).toHaveLength(1);
      expect(violations[0]?.reason).toContain("not pinned to a full 40-character commit SHA");
    });

    it("rejects an abbreviated SHA", () => {
      const violations = findUnpinnedActionUses(yamlStep(`uses: actions/checkout@${REAL_SHA.slice(0, 7)}`));
      expect(violations).toHaveLength(1);
      expect(violations[0]?.reason).toContain("abbreviated commit SHA");
    });

    it("rejects a reference with no revision at all", () => {
      const violations = findUnpinnedActionUses(yamlStep("uses: actions/checkout"));
      expect(violations).toHaveLength(1);
      expect(violations[0]?.reason).toContain("no @revision");
    });

    it("rejects a dynamic expression used as the revision", () => {
      const violations = findUnpinnedActionUses(yamlStep("uses: actions/checkout@${{ inputs.checkout-ref }}"));
      expect(violations).toHaveLength(1);
      expect(violations[0]?.reason).toContain("dynamic expression");
    });

    it("requires an immutable sha256 digest for a docker:// action, not a bare tag", () => {
      expect(findUnpinnedActionUses(yamlStep("uses: docker://alpine:3.18"))).toHaveLength(1);
      expect(findUnpinnedActionUses(yamlStep(`uses: docker://alpine@sha256:${"a".repeat(64)}`))).toEqual([]);
    });
  });

  describe("local-reference policy: only ./ is exempt, ../ is not", () => {
    it("accepts a same-repository ./.github/workflows/example.yml reference with no revision", () => {
      const yaml = yamlStep("uses: ./.github/workflows/example.yml");
      expect(findUnpinnedActionUses(yaml)).toEqual([]);
    });

    it("rejects ../reusable-workflows/example.yml — not a form GitHub recognises as local", () => {
      const yaml = yamlStep("uses: ../reusable-workflows/example.yml");
      const violations = findUnpinnedActionUses(yaml);
      expect(violations).toHaveLength(1);
      // Must not be described as an unsupported *local* form — it isn't a local form at all, it
      // falls through to the ordinary external-reference check and fails there for lacking a pin.
      expect(violations[0]?.reason).toContain("no @revision");
    });

    it("job-level reusable workflow pinned to a full 40-character SHA passes", () => {
      const yaml = [
        "jobs:",
        "  call-workflow:",
        `    uses: octo-org/example-repo/.github/workflows/reusable.yml@${REAL_SHA}`,
      ].join("\n");
      expect(findUnpinnedActionUses(yaml)).toEqual([]);
    });

    it("job-level reusable workflow pinned to a tag fails", () => {
      const yaml = [
        "jobs:",
        "  call-workflow:",
        "    uses: octo-org/example-repo/.github/workflows/reusable.yml@v1",
      ].join("\n");
      const violations = findUnpinnedActionUses(yaml);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.reason).toContain("not pinned to a full 40-character commit SHA");
    });
  });

  describe("semantic-parser cases: valid YAML forms a line-oriented regex would miss", () => {
    it("catches a mutable tag inside a flow mapping", () => {
      const yaml = yamlStep("{ uses: actions/checkout@v5 }");
      const violations = findUnpinnedActionUses(yaml);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.reference).toBe("actions/checkout@v5");
    });

    it("catches a mutable tag under a quoted \"uses\" key", () => {
      const yaml = yamlStep('"uses": actions/checkout@v5');
      const violations = findUnpinnedActionUses(yaml);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.reference).toBe("actions/checkout@v5");
    });

    it("accepts a fully pinned SHA expressed as a flow mapping", () => {
      const yaml = yamlStep(`{ uses: actions/checkout@${REAL_SHA} }`);
      expect(findUnpinnedActionUses(yaml)).toEqual([]);
    });

    it("accepts a fully pinned SHA expressed under a quoted key", () => {
      const yaml = yamlStep(`"uses": actions/checkout@${REAL_SHA}`);
      expect(findUnpinnedActionUses(yaml)).toEqual([]);
    });

    it("ignores a commented-out uses: line", () => {
      const yaml = yamlStep("name: not-real") + "\n      # uses: actions/checkout@v5";
      expect(findUnpinnedActionUses(yaml)).toEqual([]);
    });

    it('ignores the literal text "uses: actions/checkout@v5" inside an unrelated run: block', () => {
      const yaml = [
        "jobs:",
        "  verify:",
        "    steps:",
        "      - name: echo",
        "        run: |",
        '          echo "uses: actions/checkout@v5"',
      ].join("\n");
      expect(findUnpinnedActionUses(yaml)).toEqual([]);
    });

    it("fails closed on malformed YAML, with a diagnostic instead of throwing", () => {
      const malformed = ["jobs:", "  verify:", "    steps:", "      - name: broken", "        run: [unterminated"].join(
        "\n",
      );
      let violations: ReturnType<typeof findUnpinnedActionUses> = [];
      expect(() => {
        violations = findUnpinnedActionUses(malformed);
      }).not.toThrow();
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]?.reason).toContain("YAML syntax error");
    });

    it("fails closed on a null uses: value, with a useful diagnostic", () => {
      const yaml = yamlStep("uses:");
      const violations = findUnpinnedActionUses(yaml);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.reason).toContain("has no value");
    });

    it("fails closed on a uses: value that is a YAML alias, not a literal string", () => {
      const yaml = ["defs:", "  - &pinned actions/checkout@v5", "jobs:", "  verify:", "    steps:", "      - uses: *pinned"].join(
        "\n",
      );
      const violations = findUnpinnedActionUses(yaml);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.reason).toContain("alias");
    });

    it("fails closed on a uses: value that is itself a mapping", () => {
      const yaml = ["jobs:", "  verify:", "    steps:", "      - uses:", "          nested: mapping"].join("\n");
      const violations = findUnpinnedActionUses(yaml);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.reason).toContain("mapping");
    });

    it("fails closed on a uses: value that is itself a sequence", () => {
      const yaml = ["jobs:", "  verify:", "    steps:", "      - uses:", "          - a", "          - b"].join("\n");
      const violations = findUnpinnedActionUses(yaml);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.reason).toContain("sequence");
    });

    it("reports multiple violations across multiple steps, each with its own line number", () => {
      const yaml = [
        "jobs:",
        "  verify:",
        "    steps:",
        "      - uses: actions/checkout@v5",
        "      - uses: actions/setup-node@main",
      ].join("\n");
      const violations = findUnpinnedActionUses(yaml);
      expect(violations).toHaveLength(2);
      expect(violations[0]?.lineNumber).not.toBe(violations[1]?.lineNumber);
    });
  });

  it("passes on this repository's real release.yml and ci.yml", async () => {
    for (const file of ["release.yml", "ci.yml"]) {
      const text = await readFile(path.join(ROOT, ".github", "workflows", file), "utf8");
      expect(findUnpinnedActionUses(text), file).toEqual([]);
    }
  });
});

describe("scripts/lib/actions-pinned.mjs — checkWorkflowsDirectory()", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("discovers both .yml and .yaml files", async () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "polytypo-actions-pinned-"));
    writeFileSync(path.join(tmpDir, "a.yml"), yamlStep(`uses: actions/checkout@${REAL_SHA}`), "utf8");
    writeFileSync(path.join(tmpDir, "b.yaml"), yamlStep(`uses: actions/checkout@${REAL_SHA}`), "utf8");
    writeFileSync(path.join(tmpDir, "c.txt"), "not a workflow", "utf8");
    const results = await checkWorkflowsDirectory(tmpDir);
    expect(results.map((r) => r.file).sort()).toEqual(["a.yml", "b.yaml"]);
    expect(results.every((r) => r.violations.length === 0)).toBe(true);
  });

  it("passes on this repository's real .github/workflows directory", async () => {
    const results = await checkWorkflowsDirectory(path.join(ROOT, ".github", "workflows"));
    expect(results.length).toBeGreaterThanOrEqual(2);
    for (const { file, violations } of results) {
      expect(violations, file).toEqual([]);
    }
  });
});

describe("scripts/check-actions-pinned.mjs — CLI negative control (real production code path)", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  function runRealCli(workflowsDir: string) {
    // The actual CLI script, unmodified — not a reimplementation — pointed at a disposable
    // directory via the test-only ACTIONS_PINNED_WORKFLOWS_DIR override. This is the exact code
    // path CI runs (`npm run check:actions-pinned`), just with a different target directory.
    return execFileSync(process.execPath, [path.join(ROOT, "scripts/check-actions-pinned.mjs")], {
      encoding: "utf8",
      env: { ...process.env, ACTIONS_PINNED_WORKFLOWS_DIR: workflowsDir },
    });
  }

  it("exits non-zero against a disposable fixture using flow-style uses: actions/checkout@v5", () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "polytypo-actions-pinned-cli-"));
    writeFileSync(path.join(tmpDir, "bad.yml"), yamlStep("{ uses: actions/checkout@v5 }"), "utf8");
    expect(() => runRealCli(tmpDir as string)).toThrow();
  });

  it("exits zero once the same fixture is pinned to a full SHA", () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "polytypo-actions-pinned-cli-"));
    writeFileSync(path.join(tmpDir, "good.yml"), yamlStep(`{ uses: actions/checkout@${REAL_SHA} }`), "utf8");
    expect(() => runRealCli(tmpDir as string)).not.toThrow();
  });

  it("exits 0 against this repository's real workflows with no directory override", () => {
    const output = execFileSync(process.execPath, [path.join(ROOT, "scripts/check-actions-pinned.mjs")], {
      encoding: "utf8",
      cwd: ROOT,
    });
    expect(output).toContain("actions-pinned check passed");
  });
});
