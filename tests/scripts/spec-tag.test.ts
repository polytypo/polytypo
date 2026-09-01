// Exercises scripts/lib/spec-tag.mjs — the canonical spec-tag half of the two-tag release
// contract (docs/ROADMAP.md M5, docs/REPOSITORY_SPLIT_AND_SPEC_SYNC.md section 4.4). Three tiers:
// pure unit tests against an injected `run` stub (no git process spawned at all), integration
// tests against disposable temporary git repositories (never this repository — no tag is ever
// created here), and structural assertions on the real .github/workflows/release.yml text proving
// both verification steps run before build/pack/publish, the checkout fetches full history, no
// GitHub context expression appears directly inside a `run:` block, and `spec-v*` is not a
// publish trigger.
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveSpecTagName, parseStrictSpecVersion, verifySpecTag } from "../../scripts/lib/spec-tag.mjs";
import { findContextExpressionsInRunBlocks } from "../../scripts/lib/workflow-shell-safety.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("scripts/lib/spec-tag.mjs — parseStrictSpecVersion()", () => {
  it("accepts a bare MAJOR.MINOR.PATCH version", () => {
    expect(parseStrictSpecVersion("1.0.0")).toEqual({ ok: true, version: "1.0.0" });
  });

  it("trims surrounding whitespace/newlines, as spec/VERSION is stored with a trailing newline", () => {
    expect(parseStrictSpecVersion("1.0.0\n")).toEqual({ ok: true, version: "1.0.0" });
  });

  it("rejects an empty (or whitespace-only) version", () => {
    for (const raw of ["", "   ", "\n"]) {
      const result = parseStrictSpecVersion(raw);
      expect(result.ok).toBe(false);
    }
  });

  it("rejects a pre-release suffix", () => {
    expect(parseStrictSpecVersion("1.0.0-beta.1").ok).toBe(false);
  });

  it("rejects a build-metadata suffix", () => {
    expect(parseStrictSpecVersion("1.0.0+build.5").ok).toBe(false);
  });

  it("rejects a leading zero in any component", () => {
    for (const raw of ["01.0.0", "1.00.0", "1.0.00"]) {
      expect(parseStrictSpecVersion(raw).ok).toBe(false);
    }
  });

  it("rejects a malformed, non-numeric, or partial version", () => {
    for (const raw of ["v1.0.0", "1.0", "1.0.0.0", "not-a-version", "1.0.x"]) {
      expect(parseStrictSpecVersion(raw).ok).toBe(false);
    }
  });

  it("derives spec-v1.0.0 from this repository's real, current spec/VERSION", () => {
    const raw = readFileSync(path.join(ROOT, "spec", "VERSION"), "utf8");
    const parsed = parseStrictSpecVersion(raw);
    expect(parsed).toEqual({ ok: true, version: "1.0.0" });
    if (parsed.ok) expect(deriveSpecTagName(parsed.version)).toBe("spec-v1.0.0");
  });
});

describe("scripts/lib/spec-tag.mjs — deriveSpecTagName()", () => {
  it("prefixes with spec-v and nothing else", () => {
    expect(deriveSpecTagName("1.0.0")).toBe("spec-v1.0.0");
    expect(deriveSpecTagName("0.6.0")).toBe("spec-v0.6.0");
  });
});

describe("scripts/lib/spec-tag.mjs — verifySpecTag() with an injected run() stub (no git spawned)", () => {
  it("fails closed on a malformed spec/VERSION before ever calling run()", () => {
    let called = false;
    const result = verifySpecTag({
      specVersionRaw: "not-a-version",
      expectedCommitSha: "deadbeef",
      run: () => {
        called = true;
        return "deadbeef";
      },
    });
    expect(result.ok).toBe(false);
    expect(called).toBe(false);
  });

  it("fails closed when the expected commit does not resolve", () => {
    const result = verifySpecTag({
      specVersionRaw: "1.0.0",
      expectedCommitSha: "not-a-real-sha",
      run: () => {
        throw new Error("git rev-parse: not a valid object name");
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("not-a-real-sha");
  });

  it("fails closed when the spec tag is missing", () => {
    const result = verifySpecTag({
      specVersionRaw: "1.0.0",
      expectedCommitSha: "abc123",
      run: (args) => {
        if (args.includes("abc123^{commit}")) return "abc123full";
        throw new Error("unknown revision or path not in the working tree");
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("spec-v1.0.0");
  });

  it("fails closed when the spec tag points at a different commit than the release", () => {
    const result = verifySpecTag({
      specVersionRaw: "1.0.0",
      expectedCommitSha: "release-sha",
      run: (args) => {
        if (args.includes("release-sha^{commit}")) return "commit-a";
        if (args.includes("refs/tags/spec-v1.0.0^{commit}")) return "commit-b";
        throw new Error("unexpected args");
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("commit-a");
      expect(result.reason).toContain("commit-b");
    }
  });

  it("succeeds when the spec tag resolves to the exact release commit", () => {
    const result = verifySpecTag({
      specVersionRaw: "1.0.0",
      expectedCommitSha: "release-sha",
      run: (args) => {
        if (args.includes("release-sha^{commit}")) return "same-commit";
        if (args.includes("refs/tags/spec-v1.0.0^{commit}")) return "same-commit";
        throw new Error("unexpected args");
      },
    });
    expect(result).toEqual({ ok: true, tagName: "spec-v1.0.0", commit: "same-commit" });
  });

  it("never passes a hostile expected SHA through anything but a discrete argv element", () => {
    const hostile = '$(rm -rf /tmp/should-not-run); echo pwned; `id`';
    let sawHostileAsWholeArg = false;
    const result = verifySpecTag({
      specVersionRaw: "1.0.0",
      expectedCommitSha: hostile,
      run: (args) => {
        // The pure logic must pass the hostile string as one argv element (never interpolated
        // into a larger string), and this stub is a plain function call, not a shell — there is
        // no way for the payload to execute here either way, but we additionally assert the
        // argv-array contract holds.
        if (args.includes(`${hostile}^{commit}`)) sawHostileAsWholeArg = true;
        throw new Error("not a valid object name");
      },
    });
    expect(result.ok).toBe(false);
    expect(sawHostileAsWholeArg).toBe(true);
  });
});

describe("scripts/lib/spec-tag.mjs — verifySpecTag() against disposable real git repositories", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  function git(args: string[], cwd: string) {
    return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  }

  function initRepo() {
    const dir = mkdtempSync(path.join(tmpdir(), "polytypo-spec-tag-"));
    git(["init", "--quiet"], dir);
    git(["config", "user.email", "test@example.invalid"], dir);
    git(["config", "user.name", "Test"], dir);
    return dir;
  }

  function commit(dir: string, message: string) {
    git(["commit", "--quiet", "--allow-empty", "-m", message], dir);
    return git(["rev-parse", "HEAD"], dir);
  }

  it("fails when no spec tag exists at all", () => {
    tmpDir = initRepo();
    const sha = commit(tmpDir, "release commit");
    const result = verifySpecTag({ specVersionRaw: "1.0.0", expectedCommitSha: sha, cwd: tmpDir });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("spec-v1.0.0");
  });

  it("fails when the npm package tag v1.0.0 exists but spec-v1.0.0 does not", () => {
    tmpDir = initRepo();
    const sha = commit(tmpDir, "release commit");
    git(["tag", "v1.0.0"], tmpDir);
    const result = verifySpecTag({ specVersionRaw: "1.0.0", expectedCommitSha: sha, cwd: tmpDir });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("spec-v1.0.0");
  });

  it("fails when spec-v1.0.0 exists but at the wrong commit", () => {
    tmpDir = initRepo();
    commit(tmpDir, "old commit");
    git(["tag", "spec-v1.0.0"], tmpDir);
    const releaseSha = commit(tmpDir, "release commit");
    const result = verifySpecTag({ specVersionRaw: "1.0.0", expectedCommitSha: releaseSha, cwd: tmpDir });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("must point at the exact same commit");
  });

  it("succeeds with a matching lightweight tag at the release commit", () => {
    tmpDir = initRepo();
    const sha = commit(tmpDir, "release commit");
    git(["tag", "spec-v1.0.0"], tmpDir);
    const result = verifySpecTag({ specVersionRaw: "1.0.0", expectedCommitSha: sha, cwd: tmpDir });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tagName).toBe("spec-v1.0.0");
      expect(result.commit).toBe(sha);
    }
  });

  it("succeeds with a matching annotated tag at the release commit, dereferenced to the commit", () => {
    tmpDir = initRepo();
    const sha = commit(tmpDir, "release commit");
    git(["tag", "-a", "spec-v1.0.0", "-m", "spec release 1.0.0"], tmpDir);
    const result = verifySpecTag({ specVersionRaw: "1.0.0", expectedCommitSha: sha, cwd: tmpDir });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.commit).toBe(sha);
  });

  it("does not let a branch of the same name substitute for the tag", () => {
    tmpDir = initRepo();
    const sha = commit(tmpDir, "release commit");
    git(["branch", "spec-v1.0.0"], tmpDir);
    const result = verifySpecTag({ specVersionRaw: "1.0.0", expectedCommitSha: sha, cwd: tmpDir });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("was not found as a real tag");
  });

  it("fails on an invalid/nonexistent expected commit SHA even if the correct tag exists", () => {
    tmpDir = initRepo();
    commit(tmpDir, "release commit");
    git(["tag", "spec-v1.0.0"], tmpDir);
    const result = verifySpecTag({
      specVersionRaw: "1.0.0",
      expectedCommitSha: "0000000000000000000000000000000000dead",
      cwd: tmpDir,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("does not resolve to a real commit");
  });

  it("rejects a hostile-looking expected SHA without any shell side effect", () => {
    tmpDir = initRepo();
    commit(tmpDir, "release commit");
    git(["tag", "spec-v1.0.0"], tmpDir);
    const canaryPath = path.join(tmpDir, "should-not-exist");
    const hostile = `$(touch ${canaryPath})\`touch ${canaryPath}\`; touch ${canaryPath}`;
    const result = verifySpecTag({ specVersionRaw: "1.0.0", expectedCommitSha: hostile, cwd: tmpDir });
    expect(result.ok).toBe(false);
    expect(() => readFileSync(canaryPath)).toThrow();
  });
});

describe(".github/workflows/release.yml — spec-tag verification is wired in correctly", () => {
  const workflowText = readFileSync(path.join(ROOT, ".github", "workflows", "release.yml"), "utf8");

  it("checks out with fetch-depth: 0", () => {
    expect(workflowText).toMatch(/actions\/checkout@[0-9a-f]{40}[\s\S]*?fetch-depth:\s*0/);
  });

  it("runs the spec-tag verifier before build/pack, alongside the package-tag verifier", () => {
    const specTagIndex = workflowText.indexOf("scripts/verify-spec-tag.mjs");
    const packageTagIndex = workflowText.indexOf("scripts/verify-release-tag.mjs");
    // Match the actual `run:` step lines, not the prose in comments above them (the file's header
    // comment describes the publish job's behavior using the same phrases well before either real
    // step appears).
    const buildIndex = workflowText.indexOf("run: npm run build");
    const packIndex = workflowText.indexOf("npm pack --pack-destination");
    const publishIndex = workflowText.indexOf('npm publish "${TARBALL}"');

    expect(specTagIndex).toBeGreaterThan(-1);
    expect(packageTagIndex).toBeGreaterThan(-1);
    expect(specTagIndex).toBeLessThan(buildIndex);
    expect(packageTagIndex).toBeLessThan(buildIndex);
    expect(buildIndex).toBeLessThan(packIndex);
    expect(packIndex).toBeLessThan(publishIndex);
  });

  it("does not add a package.json script for the spec-tag checker", () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(Object.values(pkg.scripts ?? {}).some((s) => String(s).includes("verify-spec-tag"))).toBe(false);
  });

  it("still triggers only on the npm package tag pattern v*, not spec-v*", () => {
    const triggerSection = workflowText.slice(0, workflowText.indexOf("permissions:"));
    expect(triggerSection).toMatch(/tags:\s*\n\s*-\s*"v\*"/);
    expect(triggerSection).not.toContain("spec-v");
  });

  it("has no GitHub context expression directly inside a run: block", () => {
    expect(findContextExpressionsInRunBlocks(workflowText)).toEqual([]);
  });

  it("still grants no contents: write anywhere", () => {
    expect(workflowText).not.toContain("contents: write");
  });
});
