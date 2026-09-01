// Pure tag-vs-version release gate, extracted from the release workflow's inline bash so it is
// independently testable (tests/scripts/release-tag.test.ts) and so the *only* place package
// version "0.0.0" is treated as unpublishable is here — never in the structural tarball checker
// (scripts/lib/package-contents.mjs), which is deliberately release-version agnostic (Stage 6
// follow-up review, item 1: a structural checker that also rejected 0.0.0 would make every real
// release fail it too, since the checker ran with whatever version happened to be current).
export const PLACEHOLDER_VERSION = "0.0.0";

/**
 * @param {string} tag - e.g. "v0.1.0", from `GITHUB_REF_NAME` on a tag-triggered workflow run.
 * @param {string} packageVersion - `package.json`'s "version" field.
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function verifyReleaseTag(tag, packageVersion) {
  if (packageVersion === PLACEHOLDER_VERSION) {
    return {
      ok: false,
      reason:
        `Refusing to publish version ${PLACEHOLDER_VERSION} — this is the intentionally ` +
        `unreleasable placeholder version. An operator must choose a real version first.`,
    };
  }
  const expectedTag = `v${packageVersion}`;
  if (tag !== expectedTag) {
    return {
      ok: false,
      reason: `Tag (${tag}) does not match package.json version (expected ${expectedTag}).`,
    };
  }
  return { ok: true };
}
