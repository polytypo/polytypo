// Exercises scripts/lib/release-tag.mjs's pure tag-vs-version gate — the *only* place package
// version "0.0.0" is treated as unpublishable (Stage 6 follow-up review, item 1). Demonstrates,
// without any real tag, GitHub Actions run, or npm publish: 0.0.0 is rejected regardless of tag;
// a matching real version/tag pair passes; a mismatching tag still fails even for a real version.
import { describe, expect, it } from "vitest";
import { PLACEHOLDER_VERSION, verifyReleaseTag } from "../../scripts/lib/release-tag.mjs";

describe("scripts/lib/release-tag.mjs — verifyReleaseTag()", () => {
  it("rejects the placeholder version 0.0.0 even when the tag matches exactly", () => {
    const result = verifyReleaseTag("v0.0.0", "0.0.0");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("0.0.0");
  });

  it("rejects 0.0.0 regardless of what tag was pushed", () => {
    for (const tag of ["v0.0.0", "v1.0.0", "v0.1.0", "not-even-a-version-tag"]) {
      const result = verifyReleaseTag(tag, PLACEHOLDER_VERSION);
      expect(result.ok).toBe(false);
    }
  });

  it("accepts a matching real version/tag pair (v0.1.0 / 0.1.0)", () => {
    const result = verifyReleaseTag("v0.1.0", "0.1.0");
    expect(result).toEqual({ ok: true });
  });

  it("accepts other matching real version/tag pairs", () => {
    for (const version of ["1.0.0", "2.3.4", "0.0.1", "10.20.30"]) {
      const result = verifyReleaseTag(`v${version}`, version);
      expect(result).toEqual({ ok: true });
    }
  });

  it("rejects a mismatching tag for a real, non-placeholder version", () => {
    const result = verifyReleaseTag("v0.2.0", "0.1.0");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("v0.2.0");
  });

  it("rejects a tag missing the leading 'v'", () => {
    const result = verifyReleaseTag("0.1.0", "0.1.0");
    expect(result.ok).toBe(false);
  });

  it("rejects a tag with extra pre-release/build metadata not present in the version", () => {
    const result = verifyReleaseTag("v0.1.0-beta.1", "0.1.0");
    expect(result.ok).toBe(false);
  });
});
