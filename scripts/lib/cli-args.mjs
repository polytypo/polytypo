// Strict parsing for the `--tarball <path>` flag shared by scripts/check-package-contents.mjs and
// tests/packaging/packed-tarball.mjs (Stage 6 follow-up review, item 3). A silently-tolerant
// parser (e.g. `argv.indexOf("--tarball")`, ignoring everything else) accepts a mistyped flag or
// a duplicate `--tarball` without complaint, silently falling back to local build-and-pack mode
// — exactly the wrong failure mode for a release-workflow input. Pure and side-effect free (no
// `process.exit`, no path resolution against `cwd`) so it is directly testable
// (tests/scripts/cli-args.test.ts); callers resolve the returned path and report the error
// themselves.
/**
 * @param {string[]} argv - already stripped of `node script.mjs`, i.e. `process.argv.slice(2)`.
 * @returns {{tarballPath: string | null, error?: undefined} | {tarballPath?: undefined, error: string}}
 */
export function parseTarballArg(argv) {
  let tarballPath = null;
  let seenFlag = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg !== "--tarball") {
      return { error: `unknown argument: "${arg}"` };
    }
    if (seenFlag) {
      return { error: "duplicate --tarball flag" };
    }
    seenFlag = true;
    const value = argv[i + 1];
    if (value === undefined) {
      return { error: "--tarball requires a value" };
    }
    tarballPath = value;
    i += 1; // consume the value too
  }

  return { tarballPath };
}
