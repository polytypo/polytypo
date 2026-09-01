// Pure(-ish) spec-tag verification gate for the release workflow (docs/ROADMAP.md M5,
// docs/REPOSITORY_SPLIT_AND_SPEC_SYNC.md section 4.4's spec-tag integrity gates, scoped down to
// the minimal check this stage needs). Mirrors scripts/lib/release-tag.mjs's separation on
// purpose: the *only* place spec/VERSION's format is validated and the canonical spec tag name is
// derived is here, never re-derived or re-validated anywhere else, so the package-tag check and
// this check can never quietly diverge on what "the correct spec tag" means.
//
// The two-tag v1 release contract this enforces (docs/AUDIT_REMEDIATION_AND_RELEASE_PLAN.md
// section 8.4, docs/ROADMAP.md M5):
//   1. An operator creates canonical spec tag `spec-v<spec/VERSION>` at the release commit and
//      pushes it first — manually, for v1; this module never creates, moves, fetches, or pushes
//      a tag, it only reads what already exists in the checkout it is run against.
//   2. The operator creates and pushes npm package tag `v<package.json version>` at the exact
//      same commit — this is what actually triggers release.yml (scripts/lib/release-tag.mjs
//      already gates on that tag; this module gates on the *other* one, independently).
//   3. Before building or publishing anything, release.yml must prove both tags name the exact
//      same commit. This module is that proof for the spec-tag half.
//
// Git interaction is isolated behind one small `run(args, cwd)` seam (default: execFileSync) so
// tests/scripts/spec-tag.test.ts can inject a stub for the pure-logic cases and use a real,
// disposable git repository (never this repository) for the integration cases — never a shell
// string built by concatenating a tag name or SHA, always an argv array.
import { execFileSync } from "node:child_process";

/** Project policy (deliberately strict, matching how spec/VERSION has always been written:
 * "0.1.0" .. "1.0.0", never a pre-release or build-metadata suffix): exactly MAJOR.MINOR.PATCH,
 * each component either "0" or a digit string with no leading zero. Pre-release (`-foo`) and
 * build-metadata (`+foo`) suffixes are valid SemVer in general but are rejected here on purpose —
 * a canonical spec version is a plain release number, and accepting more would let a spec tag
 * silently point at something the rest of the spec-versioning contract (scripts/validate-spec.mjs,
 * spec/schema/fixtures.schema.json's "spec" field) was never designed to compare against. */
const STRICT_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** @param {string} raw - spec/VERSION's file contents, not yet trimmed.
 * @returns {{ok: true, version: string} | {ok: false, reason: string}} */
export function parseStrictSpecVersion(raw) {
  const version = typeof raw === "string" ? raw.trim() : "";
  if (version === "") {
    return { ok: false, reason: "spec/VERSION is empty (after trimming whitespace)." };
  }
  if (!STRICT_SEMVER.test(version)) {
    return {
      ok: false,
      reason:
        `spec/VERSION content "${version}" is not a strict MAJOR.MINOR.PATCH release version — ` +
        `pre-release suffixes (-foo), build-metadata suffixes (+foo), leading zeros, and any ` +
        `other form are rejected by this project's spec-tag policy.`,
    };
  }
  return { ok: true, version };
}

/** The one place the canonical spec tag name is derived from a validated spec version — never
 * accepted as a caller-supplied string, so a caller cannot ask this module to verify an arbitrary
 * tag name that happens not to match spec/VERSION. */
export function deriveSpecTagName(specVersion) {
  return `spec-v${specVersion}`;
}

function defaultRun(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** Resolves `refName` (must already include the `refs/tags/` prefix) to a full commit SHA,
 * peeling an annotated tag object to the commit it targets (`^{commit}`, a no-op for a
 * lightweight tag, which already points directly at a commit). Deliberately scoped to
 * `refs/tags/<name>` rather than the bare tag name: `git rev-parse` resolves an unprefixed name
 * against branches, remote-tracking branches, and tags alike (whichever it finds first per its
 * own disambiguation rules), which would let a same-named branch silently substitute for the tag
 * this function must refuse. Returns null (never throws) if the ref does not exist as a tag. */
function resolveTagCommit(tagRefName, cwd, run) {
  try {
    return run(["rev-parse", "--verify", "--quiet", `${tagRefName}^{commit}`], cwd);
  } catch {
    return null;
  }
}

/** Resolves an arbitrary commit-ish (expected to be a 40-character SHA from GITHUB_SHA in
 * practice, but not assumed to be well-formed) to a full commit SHA. Returns null (never throws)
 * on anything that doesn't resolve to a real commit in this checkout. */
function resolveCommitish(commitish, cwd, run) {
  try {
    return run(["rev-parse", "--verify", "--quiet", `${commitish}^{commit}`], cwd);
  } catch {
    return null;
  }
}

/**
 * Verifies that the canonical spec tag derived from `specVersionRaw` exists as a real tag (not a
 * branch or other ref of the same name) in the git checkout at `cwd`, and that it resolves to the
 * exact same commit as `expectedCommitSha`. Never creates, moves, fetches, or pushes anything —
 * read-only against whatever refs are already present in the checkout.
 *
 * @param {object} opts
 * @param {string} opts.specVersionRaw - spec/VERSION's raw file contents.
 * @param {string} opts.expectedCommitSha - the release commit (GITHUB_SHA in the real workflow).
 * @param {string} [opts.cwd] - git working directory; defaults to process.cwd().
 * @param {(args: string[], cwd: string|undefined) => string} [opts.run] - injectable git
 *   invocation seam, for tests only; defaults to a real `execFileSync("git", args, {cwd})` call.
 * @returns {{ok: true, tagName: string, commit: string} | {ok: false, reason: string}}
 */
export function verifySpecTag({ specVersionRaw, expectedCommitSha, cwd = process.cwd(), run = defaultRun }) {
  const parsed = parseStrictSpecVersion(specVersionRaw);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  const tagName = deriveSpecTagName(parsed.version);
  const tagRef = `refs/tags/${tagName}`;

  const expectedCommit = resolveCommitish(expectedCommitSha, cwd, run);
  if (expectedCommit === null) {
    return {
      ok: false,
      reason: `Expected release commit "${expectedCommitSha}" does not resolve to a real commit in this checkout.`,
    };
  }

  const tagCommit = resolveTagCommit(tagRef, cwd, run);
  if (tagCommit === null) {
    return {
      ok: false,
      reason:
        `Required canonical spec tag "${tagName}" (derived from spec/VERSION="${parsed.version}") ` +
        `was not found as a real tag in this checkout. It must be created and pushed by an ` +
        `operator before the npm package tag, at the same commit as the release.`,
    };
  }

  if (tagCommit !== expectedCommit) {
    return {
      ok: false,
      reason:
        `Canonical spec tag "${tagName}" resolves to commit ${tagCommit}, but the release commit ` +
        `is ${expectedCommit} — the spec tag and the npm package tag must point at the exact same commit.`,
    };
  }

  return { ok: true, tagName, commit: tagCommit };
}
