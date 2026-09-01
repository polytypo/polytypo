#!/usr/bin/env node
// CLI wrapper around scripts/lib/release-tag.mjs, used by .github/workflows/release.yml's verify
// job. Reads the tag from argv[2] (the workflow passes `${{ github.ref_name }}`) and the version
// from this repository's own package.json. Exits non-zero with a GitHub Actions `::error::`
// annotation on failure — 0.0.0 is rejected unconditionally, before the tag is even compared.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { verifyReleaseTag } from "./lib/release-tag.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const tag = process.argv[2];
if (!tag) {
  console.error("::error::usage: node scripts/verify-release-tag.mjs <tag>");
  process.exit(1);
}

const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));

console.log(`package.json version: ${pkg.version}`);
console.log(`tag:                  ${tag}`);

const result = verifyReleaseTag(tag, pkg.version);
if (!result.ok) {
  console.error(`::error::${result.reason}`);
  process.exit(1);
}

console.log(`ok: tag "${tag}" matches package.json version "${pkg.version}", and it is not the placeholder.`);
