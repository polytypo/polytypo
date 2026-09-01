#!/usr/bin/env node
// Static check for every workflow file under .github/workflows/: every external `uses:`
// reference is pinned to an immutable full 40-character commit SHA, not a mutable tag, branch,
// abbreviated SHA, or dynamic expression (this stage's security-hardening task). See
// scripts/lib/actions-pinned.mjs for the semantic-parsing policy and why, and
// tests/scripts/actions-pinned.test.ts for the logic's own regression coverage against
// fabricated YAML.
//
// ACTIONS_PINNED_WORKFLOWS_DIR overrides which directory is scanned — test-only, so a regression
// test can run this exact CLI (not a reimplementation of it) against a disposable directory. It
// is never set in CI; the default is always this repository's real .github/workflows.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { checkWorkflowsDirectory } from "./lib/actions-pinned.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOWS_DIR = process.env.ACTIONS_PINNED_WORKFLOWS_DIR
  ? path.resolve(process.env.ACTIONS_PINNED_WORKFLOWS_DIR)
  : path.join(ROOT, ".github", "workflows");

const results = await checkWorkflowsDirectory(WORKFLOWS_DIR);

let anyViolations = false;
for (const { file, violations } of results) {
  const label = path.relative(ROOT, path.join(WORKFLOWS_DIR, file));
  if (violations.length === 0) {
    console.log(`ok    ${label}: every uses: reference is immutably pinned`);
    continue;
  }
  anyViolations = true;
  console.error(`fail  ${label}:`);
  for (const violation of violations) {
    console.error(`  line ${violation.lineNumber}: ${violation.reason}`);
  }
}

if (anyViolations) {
  console.error(
    "\nactions-pinned check failed: pin each external action to its full 40-character commit " +
      "SHA (e.g. `uses: owner/action@<40-char-sha> # v1.2.3`), not a mutable tag, branch, or " +
      "abbreviated SHA. Dependabot (.github/dependabot.yml) proposes SHA updates over time.",
  );
  process.exit(1);
}

console.log("\nactions-pinned check passed: every external uses: reference is a full commit SHA.");
