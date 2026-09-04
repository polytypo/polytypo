// Regression test for scripts/lib/install-footprint.mjs's traversal bug
// (AUDIT_REMEDIATION_AND_RELEASE_PLAN.md 5.1 review, item 1): a `name@version` that first
// appears as a shallow/deduplicated node (no `dependencies`), then later appears again with a
// real `dependencies` subtree, must still have that subtree discovered and counted. An
// early-return-on-seen-key traversal misses it, because it stops descending into the *first*
// occurrence it meets — and never revisits the identity again once the key is marked seen, even
// when a fuller occurrence of the identical identity shows up later in the same tree.
import { describe, expect, it } from "vitest";
import {
  collectDependencyGraph,
  countInstalledDirectories,
} from "../../scripts/lib/install-footprint.mjs";

describe("scripts/lib/install-footprint.mjs — collectDependencyGraph()", () => {
  it("discovers descendants reachable only through a later, fuller occurrence of an already-seen identity", () => {
    // "shared-util@1.0.0" appears twice: first shallow (as a dep of "a", npm's typical
    // deduplicated-occurrence shape), then again with real dependencies (as a dep of "b"). The
    // only path to "leaf-only-reachable-via-shared-util@1.0.0" is through that second, fuller
    // occurrence.
    const tree = {
      dependencies: {
        a: {
          version: "1.0.0",
          dependencies: {
            "shared-util": { version: "1.0.0" }, // shallow: no `dependencies` field
          },
        },
        b: {
          version: "1.0.0",
          dependencies: {
            "shared-util": {
              version: "1.0.0", // same identity, this time with real descendants
              dependencies: {
                "leaf-only-reachable-via-shared-util": { version: "1.0.0" },
              },
            },
          },
        },
      },
    };

    const { identities, directDependencyNames } = collectDependencyGraph(tree);

    expect(directDependencyNames).toEqual(["a", "b"]);
    expect(identities.has("a@1.0.0")).toBe(true);
    expect(identities.has("b@1.0.0")).toBe(true);
    expect(identities.has("shared-util@1.0.0")).toBe(true);
    expect(identities.has("leaf-only-reachable-via-shared-util@1.0.0")).toBe(true);
    expect(identities.size).toBe(4);
  });

  it("does not double-count an identity that legitimately appears more than once", () => {
    const tree = {
      dependencies: {
        a: { version: "1.0.0", dependencies: { shared: { version: "2.0.0" } } },
        b: { version: "1.0.0", dependencies: { shared: { version: "2.0.0" } } },
      },
    };
    const { identities } = collectDependencyGraph(tree);
    expect(identities.size).toBe(3); // a, b, shared — not 4
  });

  it("counts edges (declared dependency relationships) separately from distinct identities", () => {
    const tree = {
      dependencies: {
        a: { version: "1.0.0", dependencies: { shared: { version: "2.0.0" } } },
        b: { version: "1.0.0", dependencies: { shared: { version: "2.0.0" } } },
      },
    };
    const { edgeCount, identities } = collectDependencyGraph(tree);
    expect(edgeCount).toBe(4); // root->a, root->b, a->shared, b->shared
    expect(identities.size).toBe(3);
    expect(edgeCount).toBeGreaterThan(identities.size);
  });

  it("returns no direct dependencies and no identities for a tree with none", () => {
    const { directDependencyNames, identities, edgeCount } = collectDependencyGraph({});
    expect(directDependencyNames).toEqual([]);
    expect(identities.size).toBe(0);
    expect(edgeCount).toBe(0);
  });
});

describe("scripts/lib/install-footprint.mjs — countInstalledDirectories()", () => {
  it("excludes the project-root line and blank lines", () => {
    const parseable = ["/repo", "/repo/node_modules/a", "/repo/node_modules/b", ""].join("\n");
    expect(countInstalledDirectories(parseable)).toBe(2);
  });

  it("matches the audit's reconciliation: 58 total lines, 1 root, 57 installed directories", () => {
    const lines = ["/repo", ...Array.from({ length: 57 }, (_, i) => `/repo/node_modules/pkg-${i}`)];
    expect(countInstalledDirectories(lines.join("\n"))).toBe(57);
  });

  it("returns 0 for output containing only the root", () => {
    expect(countInstalledDirectories("/repo\n")).toBe(0);
  });
});
