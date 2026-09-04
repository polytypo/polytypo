// Enumerates and hashes the current working-tree bytes this dogfooding run actually loads —
// deliberately not "Git HEAD": this repository has uncommitted changes throughout its history,
// and a manifest that only recorded HEAD would misrepresent which implementation the corpus was
// actually run against. Every listed root is read directly off disk (never via `git show` or
// `git ls-files`), so an uncommitted or gitignored-but-present file (e.g. a freshly regenerated
// src/generated/locales.ts) is captured exactly as it will be imported.
import { existsSync, lstatSync } from "node:fs";
import path from "node:path";
import {
  aggregateHash,
  buildCorpusManifest,
  listRegularFilesRecursive,
  type CorpusManifest,
} from "./corpus.js";

export interface ImplementationInputRoot {
  /** Repo-root-relative path, POSIX form. */
  root: string;
  description: string;
  /** Only meaningful when `root` is a directory: which files under it count as implementation
   * input, given a path already relative to `root` itself. Absent for single-file roots. */
  filter?: (relPathUnderRoot: string) => boolean;
}

export const IMPLEMENTATION_INPUT_ROOTS: readonly ImplementationInputRoot[] = [
  {
    root: "src",
    description:
      "TypeScript implementation (engine, rules, modes) — includes src/generated/locales.ts when present on disk",
    filter: (rel) => rel.endsWith(".ts"),
  },
  {
    root: "spec",
    description:
      "canonical spec: rules, locale data, fixtures, schema, VERSION (excludes the CI-generated spec/fixtures/.escaped mirror)",
    filter: (rel) => !rel.startsWith("fixtures/.escaped/"),
  },
  {
    root: "scripts/gen-locales.mjs",
    description: "canonical generator for src/generated/locales.ts from spec/locales/*.json",
  },
  { root: "scripts/dogfood-m4.ts", description: "this dry-run tool's own CLI entry point" },
  {
    root: "scripts/dogfood",
    description: "this dry-run tool's own library modules",
    filter: (rel) => rel.endsWith(".ts"),
  },
  { root: "package.json", description: "package metadata (name, version, dependencies)" },
  { root: "package-lock.json", description: "exact resolved dependency graph" },
];

/**
 * Lists every file this run's implementation inputs include, as POSIX-relative paths from
 * `repoRootAbs`, sorted. A single-file root (e.g. `package.json`) contributes itself; a
 * directory root is walked recursively with its own `filter` and the same fail-closed symlink
 * policy as corpus discovery (scripts/dogfood/corpus.ts) — an implementation tree containing a
 * symlink is refused exactly as a corpus containing one would be, for the same reason: a symlink
 * can point outside what was intended to be hashed.
 */
export function listImplementationInputFiles(repoRootAbs: string): string[] {
  const results: string[] = [];
  for (const { root, filter } of IMPLEMENTATION_INPUT_ROOTS) {
    const abs = path.join(repoRootAbs, ...root.split("/"));
    if (!existsSync(abs)) continue; // e.g. src/generated/locales.ts before the first `npm run gen`
    const stats = lstatSync(abs);
    if (stats.isFile()) {
      results.push(root);
      continue;
    }
    if (stats.isDirectory()) {
      const nested = listRegularFilesRecursive(abs, { filter: filter ?? (() => true) });
      for (const rel of nested) results.push(`${root}/${rel}`);
    }
  }
  results.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return results;
}

export interface ImplementationInputsManifest extends CorpusManifest {
  roots: readonly ImplementationInputRoot[];
}

/** Builds the same shape of manifest as the corpus one (buildCorpusManifest), over the
 * implementation-input file list, using the identical aggregate-hash scheme (corpus.ts's
 * aggregateHash) — one hashing algorithm, two domains. */
export function buildImplementationInputsManifest(
  repoRootAbs: string,
): ImplementationInputsManifest {
  const relPaths = listImplementationInputFiles(repoRootAbs);
  const base = buildCorpusManifest(repoRootAbs, relPaths);
  return { ...base, roots: IMPLEMENTATION_INPUT_ROOTS };
}

// Re-exported so callers that only need the manifest shape don't have to import corpus.ts too.
export { aggregateHash };
