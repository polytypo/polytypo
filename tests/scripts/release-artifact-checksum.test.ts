// Integration regression for the release-artifact checksum handoff bug (Stage 6 follow-up
// review, item 1). Reproduces the exact two working directories .github/workflows/release.yml's
// verify and publish jobs use — a "release-artifact/" directory under the job's default working
// directory, generating and later verifying SHA256SUMS from inside it — using the real
// `sha256sum` binary, not a simulation. Demonstrates both that the OLD form (checksum generated
// from the parent directory, recording "release-artifact/<file>") fails verification, and that
// the FIXED form (checksum generated from inside release-artifact/, recording only "<file>")
// passes it — with the file untouched between generation and verification in both cases, so the
// only variable is which working directory `sha256sum` ran from.
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let workspaceDir: string;
let releaseArtifactDir: string;
const TARBALL_NAME = "polytypo-0.1.0.tgz";

beforeEach(async () => {
  workspaceDir = await mkdtemp(path.join(tmpdir(), "polytypo-release-checksum-"));
  releaseArtifactDir = path.join(workspaceDir, "release-artifact");
  await mkdir(releaseArtifactDir);
  // Stand-in for a real tarball: sha256sum only cares about bytes, not tar structure.
  await writeFile(path.join(releaseArtifactDir, TARBALL_NAME), "fake tarball contents\n");
});

afterEach(async () => {
  await rm(workspaceDir, { recursive: true, force: true });
});

function checksumVerifyExitCode() {
  // Exactly what the publish job runs: `cd release-artifact && sha256sum -c SHA256SUMS`.
  try {
    execFileSync("sha256sum", ["-c", "SHA256SUMS"], { cwd: releaseArtifactDir, stdio: "pipe" });
    return 0;
  } catch (error) {
    return (error as { status?: number }).status ?? 1;
  }
}

describe("release-artifact checksum handoff (workflow's exact working directories)", () => {
  it("OLD form fails: checksum generated from the parent directory (records 'release-artifact/<file>')", () => {
    // The original bug: `sha256sum "release-artifact/${FILENAME}" > release-artifact/SHA256SUMS`,
    // run with cwd = workspaceDir (the job's default working directory), not release-artifact/.
    execFileSync(
      "bash",
      ["-c", `sha256sum "release-artifact/${TARBALL_NAME}" > release-artifact/SHA256SUMS`],
      { cwd: workspaceDir },
    );

    expect(checksumVerifyExitCode()).not.toBe(0);
  });

  it("FIXED form passes: checksum generated from inside release-artifact/ (records only '<file>')", () => {
    // The fix: `( cd release-artifact && sha256sum "${FILENAME}" > SHA256SUMS )`.
    execFileSync("bash", ["-c", `sha256sum "${TARBALL_NAME}" > SHA256SUMS`], {
      cwd: releaseArtifactDir,
    });

    expect(checksumVerifyExitCode()).toBe(0);
  });

  it("the fixed SHA256SUMS records the bare filename, not a release-artifact/-prefixed path", async () => {
    execFileSync("bash", ["-c", `sha256sum "${TARBALL_NAME}" > SHA256SUMS`], {
      cwd: releaseArtifactDir,
    });
    const contents = execFileSync("cat", ["SHA256SUMS"], { cwd: releaseArtifactDir, encoding: "utf8" });
    expect(contents.trim().endsWith(`  ${TARBALL_NAME}`)).toBe(true);
    expect(contents).not.toContain("release-artifact/");
  });

  it("verification still fails if the tarball is genuinely corrupted, even with the fixed form", async () => {
    execFileSync("bash", ["-c", `sha256sum "${TARBALL_NAME}" > SHA256SUMS`], {
      cwd: releaseArtifactDir,
    });
    await writeFile(path.join(releaseArtifactDir, TARBALL_NAME), "corrupted contents\n");

    expect(checksumVerifyExitCode()).not.toBe(0);
  });
});
