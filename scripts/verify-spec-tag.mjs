#!/usr/bin/env node
// CLI wrapper around scripts/lib/spec-tag.mjs, used by .github/workflows/release.yml's verify
// job. Reads spec/VERSION from this checkout and takes the expected release commit as argv[2]
// (the workflow passes the tag-triggering commit, `${{ github.sha }}`, via an env var). Exits
// non-zero with a GitHub Actions `::error::` annotation on any failure — missing spec tag, tag
// pointing at the wrong commit, malformed spec/VERSION, or a nonexistent expected commit.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { verifySpecTag } from "./lib/spec-tag.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const expectedCommitSha = process.argv[2];
if (!expectedCommitSha) {
  console.error("::error::usage: node scripts/verify-spec-tag.mjs <expected-commit-sha>");
  process.exit(1);
}

const specVersionRaw = await readFile(path.join(ROOT, "spec", "VERSION"), "utf8");

console.log(`spec/VERSION:           ${specVersionRaw.trim()}`);
console.log(`expected release commit: ${expectedCommitSha}`);

const result = verifySpecTag({ specVersionRaw, expectedCommitSha, cwd: ROOT });
if (!result.ok) {
  console.error(`::error::${result.reason}`);
  process.exit(1);
}

console.log(`ok: canonical spec tag "${result.tagName}" resolves to commit ${result.commit}, matching the release commit.`);
