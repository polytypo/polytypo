#!/usr/bin/env node
// Deterministic package-content assertions (AUDIT_REMEDIATION_AND_RELEASE_PLAN.md 5.2, Stage 6
// task 4). Two modes:
//
//   node scripts/check-package-contents.mjs
//     Local convenience mode: builds the package, runs `npm pack --dry-run --json` to get the
//     manifest `npm publish` would use, and reads dist/*.js|*.cjs|*.map directly off disk for the
//     chunk/source-map integrity checks. Does not require a real tarball on disk.
//
//   node scripts/check-package-contents.mjs --tarball <path/to/polytypo-*.tgz>
//     Verifies an EXISTING tarball byte-for-byte: lists and extracts it (via the system `tar`
//     binary — not an npm dependency, same convention as `npm`/`python3` elsewhere in this
//     project's scripts) into a temporary directory and reads package.json/dist/* from the
//     extracted copy. This is what the release workflow's verify job uses, so the artifact it
//     checks and the artifact it later uploads are the exact same file — never a re-pack.
//
// The assertion logic itself lives in scripts/lib/package-contents.mjs and is independently
// exercised against a fabricated tarball manifest in tests/scripts/package-contents.test.ts.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseTarballArg } from "./lib/cli-args.mjs";
import { assertPackageContents } from "./lib/package-contents.mjs";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function usageError(message) {
  console.error(`error: ${message}`);
  console.error("usage: node scripts/check-package-contents.mjs [--tarball <path>]");
  process.exit(1);
}

function parseArgs(argv) {
  const result = parseTarballArg(argv);
  if (result.error) usageError(result.error);
  return { tarballPath: result.tarballPath ? path.resolve(result.tarballPath) : null };
}

async function fromBuiltDist() {
  console.log("building...");
  await execFileAsync("npm", ["run", "build"], { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 });

  console.log("packing (dry run)...");
  const { stdout } = await execFileAsync("npm", ["pack", "--dry-run", "--json"], {
    cwd: ROOT,
    maxBuffer: 16 * 1024 * 1024,
  });
  const [packResult] = JSON.parse(stdout);
  const files = new Set(packResult.files.map((f) => f.path));

  const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  const readFileContent = async (relativePath) => {
    try {
      return await readFile(path.join(ROOT, relativePath), "utf8");
    } catch {
      return null;
    }
  };

  return { files, pkg, readFileContent, packResult, cleanup: async () => {} };
}

async function fromRealTarball(tarballPath) {
  console.log(`inspecting real tarball: ${tarballPath}`);
  const extractDir = await mkdtemp(path.join(tmpdir(), "polytypo-tarball-check-"));

  // Everything from here down that can throw runs inside this try — if listing, extraction,
  // package.json parsing, or anything else in setup fails, extractDir is removed before the
  // error propagates. Without this, a failure here would leak the temp directory: the function
  // would throw before ever returning its `cleanup` callback, so nothing downstream could call
  // it. See tests/scripts/package-contents-tarball-inspection.test.ts.
  try {
    const { stdout: listing } = await execFileAsync("tar", ["-tzf", tarballPath], {
      maxBuffer: 16 * 1024 * 1024,
    });
    // npm tarballs wrap everything under a single top-level "package/" directory.
    const files = new Set(
      listing
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && line !== "package/")
        .map((line) => line.replace(/^package\//, ""))
        .filter((line) => !line.endsWith("/")), // directory entries, not files
    );

    await execFileAsync("tar", ["-xzf", tarballPath, "-C", extractDir], {
      maxBuffer: 16 * 1024 * 1024,
    });
    const packageDir = path.join(extractDir, "package");

    const pkg = JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf8"));
    const readFileContent = async (relativePath) => {
      try {
        return await readFile(path.join(packageDir, relativePath), "utf8");
      } catch {
        return null;
      }
    };

    const stats = await stat(tarballPath);
    const packResult = { size: stats.size, unpackedSize: null };

    return {
      files,
      pkg,
      readFileContent,
      packResult,
      cleanup: () => rm(extractDir, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(extractDir, { recursive: true, force: true });
    throw error;
  }
}

const { tarballPath } = parseArgs(process.argv.slice(2));
const { files, pkg, readFileContent, packResult, cleanup } = tarballPath
  ? await fromRealTarball(tarballPath)
  : await fromBuiltDist();

let failures;
try {
  failures = await assertPackageContents(files, pkg, readFileContent);
} finally {
  await cleanup();
}

if (failures.length > 0) {
  console.error("\npackage-content assertions failed:\n");
  for (const failure of failures) console.error(`fail  ${failure}`);
  process.exit(1);
}

console.log(`\nok    ${files.size} tarball entries`);
console.log(
  `ok    package size ${packResult.size} bytes` +
    (packResult.unpackedSize != null ? `, unpacked ${packResult.unpackedSize} bytes` : ""),
);
console.log("\npackage-content assertions passed.");
