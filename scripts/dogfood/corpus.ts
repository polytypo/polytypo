// Corpus discovery and content-hashing for the M4 dogfooding dry-run tool. Read-only: every
// function here only ever reads from disk (readFileSync/readdirSync/lstatSync), never writes,
// renames, or touches anything under the corpus root.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import path from "node:path";

export class SymlinkEncounteredError extends Error {
  readonly offendingPath: string;
  constructor(offendingPath: string) {
    super(
      `symlink encountered at "${offendingPath}" — fail-closed policy: no symlink is ever followed or silently skipped`,
    );
    this.offendingPath = offendingPath;
  }
}

/**
 * Recursively discovers regular `*.mdx` files under `rootAbs`, returning their paths relative to
 * `rootAbs` in POSIX form (`/`-separated regardless of host OS), sorted by ordinary code-point
 * string comparison — deterministic across runs and hosts.
 *
 * Symlink policy (fail-closed, not skip-and-continue): any symlink encountered anywhere in the
 * tree — a symlinked file, a symlinked directory, or `rootAbs` itself — aborts discovery
 * immediately by throwing SymlinkEncounteredError. A corpus that legitimately contains no
 * symlinks is unaffected; a corpus that does is refused outright rather than silently followed
 * (which could escape `rootAbs`) or silently skipped (which could hide content from review).
 */
export function discoverMdxFiles(rootAbs: string): string[] {
  return listRegularFilesRecursive(rootAbs, { filter: (relPath) => relPath.endsWith(".mdx") });
}

export interface ListFilesOptions {
  /** Called with the POSIX-relative path of each regular file found; return true to include it.
   * Directories to skip entirely (never descended into) can be excluded via `skipDir`. */
  filter: (relPath: string) => boolean;
  /** Called with the POSIX-relative path of each directory before it is descended into; return
   * true to skip it (and everything under it) without error — used for things like `node_modules`
   * that are legitimately absent from a symlink-free tree walk, not for tolerating symlinks. */
  skipDir?: (relPath: string) => boolean;
}

/**
 * Recursively walks `rootAbs`, returning POSIX-relative paths of regular files for which
 * `filter` returns true, sorted by code-point string comparison. Shares the discovery function's
 * fail-closed symlink policy: any symlink anywhere in the walked tree (including `rootAbs`
 * itself) throws SymlinkEncounteredError rather than being followed or silently skipped.
 */
export function listRegularFilesRecursive(rootAbs: string, options: ListFilesOptions): string[] {
  const rootStats = lstatSync(rootAbs);
  if (rootStats.isSymbolicLink()) throw new SymlinkEncounteredError(rootAbs);

  const results: string[] = [];

  function walk(dirAbs: string, relPrefix: string): void {
    const entries = readdirSync(dirAbs, { withFileTypes: true });
    // Sort directory entries before recursing so traversal order (and therefore which symlink,
    // if any, is reported first) is itself deterministic.
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const entryAbs = path.join(dirAbs, entry.name);
      const entryRel = relPrefix === "" ? entry.name : `${relPrefix}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        throw new SymlinkEncounteredError(entryAbs);
      }
      if (entry.isDirectory()) {
        if (options.skipDir?.(entryRel)) continue;
        walk(entryAbs, entryRel);
        continue;
      }
      if (entry.isFile() && options.filter(entryRel)) {
        results.push(entryRel);
      }
    }
  }

  walk(rootAbs, "");
  results.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return results;
}

export function sha256HexOfBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export interface HashedFileEntry {
  path: string;
  sha256: string;
}

/**
 * The one aggregate-hashing scheme used everywhere this tool needs a single hash over many
 * files (the corpus manifest and the implementation-input manifest both use it): sha256 over the
 * UTF-8 bytes of, for each entry in ascending `path` order,
 *   `<utf8-byte-length-of-path>:<path>\n<sha256-hex-of-file-contents>\n`
 * The length prefix on `path` makes the framing unambiguous regardless of what characters a path
 * contains (a path cannot itself forge a fake boundary the way an unprefixed `path\nhash\n`
 * scheme could if a path contained a literal newline). Entries must already be sorted by the
 * caller — this function does not re-sort, so a caller that hashes an unsorted list has a bug,
 * not a silently-corrected one.
 */
export function aggregateHash(entries: readonly HashedFileEntry[]): string {
  const hash = createHash("sha256");
  for (const entry of entries) {
    const pathByteLength = Buffer.byteLength(entry.path, "utf8");
    hash.update(`${pathByteLength}:${entry.path}\n${entry.sha256}\n`, "utf8");
  }
  return hash.digest("hex");
}

export const AGGREGATE_HASH_ALGORITHM_DESCRIPTION =
  "sha256 over UTF-8 bytes of, for each entry in ascending path order: " +
  "'<utf8-byte-length-of-path>:<path>\\n<sha256-hex-of-file-contents>\\n'";

export interface CorpusFileRecord {
  path: string;
  bytes: number;
  sha256: string;
}

export interface CorpusManifest {
  files: CorpusFileRecord[];
  fileCount: number;
  totalBytes: number;
  aggregateHash: string;
}

/** Reads every file in `relPaths` (relative to `rootAbs`) as exact bytes and records its length
 * and sha256 — this is the corpus snapshot taken before and after the run to prove it stayed
 * byte-identical. */
export function buildCorpusManifest(rootAbs: string, relPaths: readonly string[]): CorpusManifest {
  const sorted = [...relPaths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const files: CorpusFileRecord[] = sorted.map((rel) => {
    const buf = readFileSync(path.join(rootAbs, ...rel.split("/")));
    return { path: rel, bytes: buf.length, sha256: sha256HexOfBuffer(buf) };
  });
  const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);
  return {
    files,
    fileCount: files.length,
    totalBytes,
    aggregateHash: aggregateHash(files.map((f) => ({ path: f.path, sha256: f.sha256 }))),
  };
}

/** True iff two corpus manifests describe byte-identical content (same files, same lengths, same
 * hashes) — used to compare the pre-run and post-run snapshots. */
export function manifestsEqual(a: CorpusManifest, b: CorpusManifest): boolean {
  return (
    a.aggregateHash === b.aggregateHash &&
    a.fileCount === b.fileCount &&
    a.totalBytes === b.totalBytes
  );
}
