// Pure counting logic for scripts/check-install-footprint.mjs, factored out so
// tests/scripts/install-footprint.test.ts can exercise it against a fabricated `npm ls --json`
// tree without shelling out to npm. AUDIT_REMEDIATION_AND_RELEASE_PLAN.md 5.1 review, item 1.
//
// npm's `ls --all --json` output can present the *same* `name@version` more than once in the
// tree: once as a full node carrying its own `dependencies` subtree, and once (elsewhere, at a
// different install location) as a shallow/deduplicated occurrence with no `dependencies` field
// at all. Which occurrence comes first in traversal order is not guaranteed. A traversal that
// stops descending the moment it has already recorded a given `name@version` will, if the
// *first* occurrence it meets happens to be the shallow one, never visit that package's real
// descendants — even though a later, fuller occurrence of the identical identity exists in the
// same tree. That is the exact bug this module fixes: deduplication must affect the final
// *count* of distinct identities, never whether a node's own children get visited. Every node is
// always descended into (if it carries a `dependencies` field), independent of whether its
// `name@version` was seen before. This cannot infinite-loop: the input is a tree freshly produced
// by `JSON.parse`, so distinct occurrences are always distinct objects with no shared references
// back up the tree — there is no cycle to guard against, only harmless repeated work when the
// same subtree truly is visited more than once.
export function collectDependencyGraph(tree) {
  const identities = new Set();
  let edgeCount = 0;

  function visit(node) {
    if (!node.dependencies) return;
    for (const [name, dep] of Object.entries(node.dependencies)) {
      edgeCount += 1;
      identities.add(`${name}@${dep.version ?? "?"}`);
      // Always recurse — deduplication (the `identities` Set) governs the count, never whether
      // this specific occurrence's own children get discovered.
      visit(dep);
    }
  }

  visit(tree);

  return {
    directDependencyNames: Object.keys(tree.dependencies ?? {}),
    identities,
    edgeCount,
  };
}

/**
 * Counts non-empty lines from `npm ls --all --omit=dev --parseable` output, excluding the
 * project-root line (always first) — i.e. the number of installed production dependency
 * directories on disk. This is a physical-filesystem count, independent of and a cross-check
 * against `collectDependencyGraph`'s distinct-identity count from the JSON tree: the two numbers
 * coincide exactly when every installed package appears at exactly one on-disk location (true for
 * this project's current tree — verified in AUDIT_REMEDIATION_AND_RELEASE_PLAN.md 5.1's review),
 * but a project using nested (non-hoisted) duplicate installs of the same name@version at
 * multiple locations would show more directories than distinct identities.
 */
export function countInstalledDirectories(parseableOutput) {
  const lines = parseableOutput.split("\n").filter((line) => line.trim().length > 0);
  return Math.max(0, lines.length - 1);
}
