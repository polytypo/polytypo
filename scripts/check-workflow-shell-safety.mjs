#!/usr/bin/env node
// Static check for every workflow file: no `${{ ... }}` GitHub Actions expression embedded in a
// `run:` step's shell text (Stage 6 follow-up review, item 2). See
// scripts/lib/workflow-shell-safety.mjs for why, and
// tests/scripts/workflow-shell-safety.test.ts for the logic's own regression coverage against
// fabricated YAML.
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { findContextExpressionsInRunBlocks } from "./lib/workflow-shell-safety.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOWS_DIR = path.join(ROOT, ".github", "workflows");

const files = (await readdir(WORKFLOWS_DIR)).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));

let anyViolations = false;
for (const file of files) {
  const filePath = path.join(WORKFLOWS_DIR, file);
  const text = await readFile(filePath, "utf8");
  const violations = findContextExpressionsInRunBlocks(text);
  if (violations.length === 0) {
    console.log(`ok    .github/workflows/${file}: no \${{ }} expressions inside run: blocks`);
    continue;
  }
  anyViolations = true;
  console.error(`fail  .github/workflows/${file}:`);
  for (const violation of violations) {
    console.error(`  line ${violation.lineNumber}: ${violation.context} — pass through env: instead`);
  }
}

if (anyViolations) {
  console.error(
    "\nworkflow-shell-safety check failed: move the GitHub context value(s) above into a step-level " +
      "env: var and reference them as a shell variable, e.g. env: { RELEASE_TAG: ${{ github.ref_name }} } " +
      'then run: node script.mjs "${RELEASE_TAG}".',
  );
  process.exit(1);
}

console.log("\nworkflow-shell-safety check passed: no run: block embeds a ${{ }} expression.");
