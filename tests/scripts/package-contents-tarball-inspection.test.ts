// Integration test for scripts/check-package-contents.mjs's `fromRealTarball()` (Stage 6
// follow-up review, item 3): if listing, extraction, or package.json parsing fails partway
// through setup, the temporary extraction directory it already created must still be removed —
// not leaked because the function threw before it could return its `cleanup` callback. Exercises
// the real CLI script against a genuinely corrupt "tarball" (not a real .tgz), since the internal
// `fromRealTarball()` function isn't exported — this proves the observable behaviour (no leaked
// temp directory) rather than the internal control flow.
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CHECK_SCRIPT = path.join(ROOT, "scripts", "check-package-contents.mjs");
const LEAK_PREFIX = "polytypo-tarball-check-";

async function leakedExtractionDirs() {
  const entries = await readdir(tmpdir());
  return entries.filter((name) => name.startsWith(LEAK_PREFIX));
}

let scratchDir: string;

beforeEach(async () => {
  scratchDir = await mkdtemp(path.join(tmpdir(), "polytypo-corrupt-tarball-"));
});

afterEach(async () => {
  await rm(scratchDir, { recursive: true, force: true });
});

describe("scripts/check-package-contents.mjs --tarball <corrupt file> — cleanup on failure", () => {
  it("does not leak a temp extraction directory when the tarball fails to list/extract", async () => {
    const before = await leakedExtractionDirs();

    const corruptTarball = path.join(scratchDir, "not-actually-a-tarball.tgz");
    await writeFile(corruptTarball, "this is not gzip or tar data\n");

    expect(() =>
      execFileSync("node", [CHECK_SCRIPT, "--tarball", corruptTarball], {
        cwd: ROOT,
        stdio: "pipe",
      }),
    ).toThrow(); // `tar -tzf` on non-gzip data exits non-zero, so the script must too.

    const after = await leakedExtractionDirs();
    expect(after.length).toBe(before.length); // no new polytypo-tarball-check-* directory left behind
  });

  it("does not leak a temp extraction directory when the tarball has no package.json", async () => {
    const before = await leakedExtractionDirs();

    // A well-formed, empty gzip'd tar archive — lists and extracts fine, but has no
    // package/package.json for the script to parse, so JSON.parse's readFile throws.
    const emptyTarball = path.join(scratchDir, "empty.tgz");
    execFileSync("tar", ["-czf", emptyTarball, "-T", "/dev/null"]);

    expect(() =>
      execFileSync("node", [CHECK_SCRIPT, "--tarball", emptyTarball], { cwd: ROOT, stdio: "pipe" }),
    ).toThrow();

    const after = await leakedExtractionDirs();
    expect(after.length).toBe(before.length);
  });
});
