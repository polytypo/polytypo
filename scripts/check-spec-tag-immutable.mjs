#!/usr/bin/env node
// A released spec version is frozen: once `spec-v<version>` is tagged, `spec/` may not be amended
// in place under that same version. On 2026-09-24 two commits (cc07ac1, 4214d5f) edited
// spec/rules/apostrophe.md and spec/rules/quotes.md after spec-v1.6.0 was tagged and published;
// nothing here noticed, and it surfaced only when a runtime repo's check-vendored-spec.sh compared
// its vendored tree against spec-v1.6.0 hours later. That cost spec 1.6.1 and 1.6.2 — see canonical
// issue #56 and docs/ARCHITECTURE.md section 6.2a. This check is the missing half of that one: the
// runtimes verify their copy against the tag, and this verifies the tag against main.
//
// The rule: if refs/tags/spec-v<HEAD's spec/VERSION> exists, spec/ at HEAD must equal spec/ at that
// tag. If it does not exist the version is unreleased and the check passes — the normal state
// between a version bump and its tag.
//
// Uses only the local object database (the tag is local here); it never fetches. That makes the
// checkout depth in .github/workflows/ci.yml load-bearing — see the fetch-depth: 0 comment there —
// so a checkout carrying no spec-v* tag at all is reported as a failure rather than a silent pass.
//
// Two things deliberately not done, recorded so they are not proposed again:
//
//   1. No retro-fix of the one other historical occurrence. Walking every spec-v* tag against the
//      commit before the next spec/VERSION bump shows exactly one more in-place edit to a released
//      version: spec/rules/symbols.md under spec-v1.0.0. It does not affect HEAD, which differs
//      from spec-v1.6.3 only by CONFORMANCE.md, so this check passes today. Rewriting a published
//      tag to repair it would be worse than the defect.
//   2. No unit test. The two sibling hygiene checks put their logic in scripts/lib/*.mjs with a
//      test in tests/scripts/, because both are string parsing over fabricated input. This one is
//      git invocations, so a test would need git fixtures; it is proved instead by running it in a
//      detached worktree at each violating commit, which is what §4 of its review records:
//        git worktree add --detach /tmp/wt cc07ac1
//        cp scripts/check-spec-tag-immutable.mjs /tmp/wt/scripts/
//        node /tmp/wt/scripts/check-spec-tag-immutable.mjs   # must exit 1, naming the file
//      Add a test only if the script grows logic that is not a git call.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// spec/CONFORMANCE.md is generated *after* a release, once every runtime has published the version
// and been verified against the registries (commits 0a1743a, 4f4e57b, 378e5a4 are the pattern), so
// it legitimately differs from the tag it names. Excluded by name rather than by a pattern: this is
// the one such file today, and a second one should have to be added deliberately. It is not left
// unchecked — ci.yml's "Check generated artifacts are up to date" step already holds it to
// `npm run gen:conformance` output.
const POST_RELEASE_GENERATED = ["spec/CONFORMANCE.md"];

const git = (...args) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8" });

const version = git("show", "HEAD:spec/VERSION").trim();
const tag = `spec-v${version}`;

const knownTags = git("tag", "--list", "spec-v*").trim();
if (knownTags === "") {
  console.error(
    "fail  no spec-v* tag is present in this checkout, so nothing could be compared.\n\n" +
      "spec-tag-immutability check failed: this check is only meaningful against the release tags. " +
      "A shallow or tagless clone makes it vacuous, which is the one outcome worse than a failure. " +
      "In CI, keep `fetch-depth: 0` on the checkout step in .github/workflows/ci.yml.",
  );
  process.exit(1);
}

let tagExists = true;
try {
  git("rev-parse", "--verify", "--quiet", `refs/tags/${tag}`);
} catch {
  tagExists = false;
}

if (!tagExists) {
  console.log(`ok    spec/VERSION is ${version} and ${tag} is not tagged yet — unreleased.`);
  console.log(
    "\nspec-tag-immutability check passed: this version is still open for amendment until it is tagged.",
  );
  process.exit(0);
}

const changed = git(
  "diff",
  "--name-status",
  "--no-renames",
  `refs/tags/${tag}`,
  "HEAD",
  "--",
  "spec/",
)
  .split("\n")
  .filter((line) => line !== "")
  .map((line) => {
    const [status, file] = line.split("\t");
    return { status, file };
  })
  .filter(({ file }) => !POST_RELEASE_GENERATED.includes(file));

if (changed.length === 0) {
  console.log(
    `ok    spec/ at HEAD is identical to ${tag} (excluding ${POST_RELEASE_GENERATED.join(", ")}).`,
  );
  console.log(
    "\nspec-tag-immutability check passed: the released spec version has not been amended in place.",
  );
  process.exit(0);
}

console.error(`fail  spec/ at HEAD differs from ${tag}, but spec/VERSION still says ${version}:`);
const label = { A: "added", M: "modified", D: "deleted" };
for (const { status, file } of changed) {
  console.error(`  ${label[status] ?? status}  ${file}`);
}
console.error(
  `\nspec-tag-immutability check failed: ${tag} is published, and every runtime vendors and verifies ` +
    "that exact tree — amending it here makes each vendored copy wrong without changing what the " +
    "version means. Bump spec/VERSION, add the brand/tools/changelog.json entry, and release the " +
    "change as a new version instead of editing a released one.",
);
process.exit(1);
