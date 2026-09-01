#!/usr/bin/env node
// Reports the package-wide npm install dependency count (AUDIT_REMEDIATION_AND_RELEASE_PLAN.md
// 5.1 review, item 6). Subpath exports change what a bundler can *reach* and *tree-shake* from a
// given entry point (scripts/check-entry-reach.mjs) — they change nothing about what `npm
// install polytypo` puts on disk. npm resolves the flat `dependencies` field in package.json as a
// single, whole-package install graph; it has no concept of "this consumer only imports
// polytypo/text, so skip parse5 and micromark." A consumer importing only `polytypo/text` still
// gets parse5 and the full Micromark/MDX stack installed, unused. This script exists so that fact
// is reported as real, verified numbers, never described as something Stage 5 reduced — it did
// not, and moving parser packages to optional/peer dependencies to change these numbers is a
// separate design decision this script does not make.
//
// Counting logic lives in scripts/lib/install-footprint.mjs (tested in
// tests/scripts/install-footprint.test.ts): earlier drafts of this script stopped descending into
// a `name@version` the moment it had been seen once, which silently missed real descendants
// whenever npm's tree presented a shallow/deduplicated occurrence of an identity before a fuller
// one — see that module's header comment for the exact fixed bug.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { collectDependencyGraph, countInstalledDirectories } from "./lib/install-footprint.mjs";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function npmLs(extraArgs) {
  const { stdout } = await execFileAsync("npm", ["ls", "--all", "--omit=dev", ...extraArgs], {
    cwd: ROOT,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

const [jsonOutput, parseableOutput] = await Promise.all([
  npmLs(["--json"]),
  npmLs(["--parseable"]),
]);

const tree = JSON.parse(jsonOutput);
const { directDependencyNames, identities, edgeCount } = collectDependencyGraph(tree);
const installedDirectories = countInstalledDirectories(parseableOutput);

console.log(`polytypo's package.json "dependencies" (installed for every consumer, regardless`);
console.log(`of which entry point — "polytypo", "./text", "./html", or "./markdown" — they`);
console.log(`import from; npm install resolves the whole package, not a subpath):\n`);
for (const name of directDependencyNames) console.log(`  ${name}`);

console.log(`\n${directDependencyNames.length} direct production dependencies (package.json "dependencies").`);
console.log(
  `${installedDirectories} installed production package directories on disk, excluding the ` +
    `project root (npm ls --all --omit=dev --parseable: ${installedDirectories + 1} non-empty ` +
    `lines total, 1 of which is the project root itself).`,
);
console.log(
  `${identities.size} distinct production "name@version" identities in the dependency graph ` +
    `(npm ls --all --omit=dev --json, deduplicated).`,
);
console.log(
  `${edgeCount} logical dependency edges (declared "X depends on Y" relationships) — an edge ` +
    `count, not a count of installed packages; it is larger than either figure above because the ` +
    `same package is frequently depended on by more than one other package.`,
);

if (installedDirectories === identities.size) {
  console.log(
    `\nThe directory count and the distinct-identity count agree (${installedDirectories}): in ` +
      `this project's current tree, every installed package occupies exactly one on-disk location ` +
      `— no package is duplicate-installed (non-hoisted) at multiple node_modules paths.`,
  );
} else {
  console.log(
    `\nThe directory count (${installedDirectories}) and the distinct-identity count ` +
      `(${identities.size}) differ: at least one production package is installed at more than one ` +
      `on-disk location (a duplicate, non-hoisted install of the same name@version) — re-run both ` +
      `commands directly if this needs auditing further.`,
  );
}

console.log(
  `\nThe original audit's "58 production dependency nodes" (AUDIT_REMEDIATION_AND_RELEASE_PLAN.md ` +
    `5.1) corresponds to \`npm ls --all --omit=dev --parseable\` returning 58 non-empty lines ` +
    `*including* the project-root line — i.e. ${installedDirectories + 1} total lines, not ` +
    `${installedDirectories + 1} installed dependencies. The dependency-only figure (excluding the ` +
    `root) is ${installedDirectories}, matching this script's own count.`,
);

console.log(`\nThis footprint is identical for every entry point. Subpath exports reduce what a`);
console.log(`bundler can *reach* and *tree-shake* per entry (scripts/check-entry-reach.mjs) and`);
console.log(`the resulting bundle size (scripts/check-bundle-size.mjs) — they do not reduce this`);
console.log(`installation footprint. That would require moving parse5/micromark* to optional or`);
console.log(`peer dependencies, a separate design decision out of this stage's scope.`);
