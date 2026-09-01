// Path-safety helpers for the M4 dogfooding dry-run tool (scripts/dogfood-m4.ts). This module
// contains no typography-engine imports and no I/O beyond stat/readdir/mkdir — it exists purely
// to make "never touch the real corpus, never write anywhere unsafe" checkable in isolation.
import { existsSync, lstatSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

export class DogfoodSafetyError extends Error {}

export function assertAbsolute(label: string, value: string): void {
  if (!path.isAbsolute(value)) {
    throw new DogfoodSafetyError(`${label} must be an absolute path, got "${value}"`);
  }
}

/** True iff `child` is `parent` itself or lives anywhere underneath it, compared as resolved
 * paths (no symlink resolution — callers that need symlink-safe containment resolve with
 * `fs.realpathSync` first). */
export function isPathInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Walks upward from `startDir` looking for a `.git` entry (directory or file — a worktree's
 * `.git` is a file). Returns the first directory found to contain one, or null if the filesystem
 * root is reached first. Used to reject an evidence directory placed inside either project
 * repository, not just the literal corpus root. */
export function findGitRoot(startDir: string): string | null {
  let dir = path.resolve(startDir);
  for (;;) {
    if (existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export interface SafeOutputDirCheck {
  outDir: string;
  corpusRoot: string;
  /** Additional roots the output directory must not be placed inside — e.g. the polytypo repo
   * root and the corpus's own git root (if any is found). */
  forbiddenRoots: readonly (string | null)[];
}

/**
 * Validates and prepares the evidence output directory:
 *  - both `outDir` and `corpusRoot` must be absolute (fail-closed on relative paths, which are
 *    ambiguous under a changing `cwd`);
 *  - `outDir` must not be the corpus root, inside it, or an ancestor of it;
 *  - `outDir` must not be inside any of `forbiddenRoots`;
 *  - if `outDir` already exists, it must not be a symlink, must be a directory, and must be
 *    empty — refusing to overwrite prior evidence is the explicit policy, not an oversight;
 *  - if `outDir` does not exist, it is created (`mkdir -p`).
 * Throws DogfoodSafetyError on any violation; never partially creates a directory it is about to
 * reject.
 */
export function assertSafeOutputDir({ outDir, corpusRoot, forbiddenRoots }: SafeOutputDirCheck): void {
  assertAbsolute("--out", outDir);
  assertAbsolute("--corpus", corpusRoot);
  const resolvedOut = path.resolve(outDir);
  const resolvedCorpus = path.resolve(corpusRoot);

  if (isPathInside(resolvedCorpus, resolvedOut) || isPathInside(resolvedOut, resolvedCorpus)) {
    throw new DogfoodSafetyError(
      `--out "${resolvedOut}" must not be inside, equal to, or an ancestor of the corpus root "${resolvedCorpus}"`,
    );
  }

  for (const root of forbiddenRoots) {
    if (root && isPathInside(path.resolve(root), resolvedOut)) {
      throw new DogfoodSafetyError(`--out "${resolvedOut}" must not be inside repository root "${root}"`);
    }
  }

  if (existsSync(resolvedOut)) {
    const stats = lstatSync(resolvedOut);
    if (stats.isSymbolicLink()) {
      throw new DogfoodSafetyError(`--out "${resolvedOut}" is a symlink — refusing to write through it`);
    }
    if (!stats.isDirectory()) {
      throw new DogfoodSafetyError(`--out "${resolvedOut}" exists and is not a directory`);
    }
    const entries = readdirSync(resolvedOut);
    if (entries.length > 0) {
      throw new DogfoodSafetyError(
        `--out "${resolvedOut}" already exists and is not empty — supply a fresh directory instead of overwriting prior evidence`,
      );
    }
    return;
  }

  mkdirSync(resolvedOut, { recursive: true });
}

export function assertSafeCorpusRoot(corpusRoot: string): void {
  assertAbsolute("--corpus", corpusRoot);
  const resolved = path.resolve(corpusRoot);
  if (resolved === path.parse(resolved).root) {
    throw new DogfoodSafetyError(`--corpus "${resolved}" is a filesystem root — refusing to scan it`);
  }
  if (!existsSync(resolved)) {
    throw new DogfoodSafetyError(`--corpus "${resolved}" does not exist`);
  }
  const stats = lstatSync(resolved);
  if (stats.isSymbolicLink()) {
    throw new DogfoodSafetyError(`--corpus "${resolved}" is a symlink — refusing to scan through it (fail-closed symlink policy)`);
  }
  if (!stats.isDirectory()) {
    throw new DogfoodSafetyError(`--corpus "${resolved}" is not a directory`);
  }
}
