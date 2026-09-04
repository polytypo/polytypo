// Orchestrates one M4 dogfooding dry run: validates paths, snapshots the corpus, transforms it
// read-only through the real transform() API, re-snapshots the corpus to prove it stayed
// byte-identical, verifies every fail-closed consistency invariant on the generated evidence,
// and writes the four review artifacts. This is the one function both scripts/dogfood-m4.ts (the
// CLI) and tests/scripts/dogfood.test.ts (the regression suite) call — so a test exercises the
// exact same code path CI/the real run uses, never a reimplementation of it.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Options } from "../../src/types.js";
import { getLocaleData } from "../../src/engine/locale.js";
import { checkAllConsistency } from "./consistency.js";
import {
  buildCorpusManifest,
  discoverMdxFiles,
  manifestsEqual,
  type CorpusManifest,
} from "./corpus.js";
import { REVIEW_CHANGE_MAX_OLD_SPAN_CODEPOINTS } from "./diff.js";
import { computeEvidenceReviewHash, digestArtifact, type EvidenceBlock } from "./evidence-hash.js";
import {
  buildFullDiff,
  buildManifest,
  buildReviewChangeEntries,
  buildReviewMarkdown,
  REVIEW_STATE,
  type ReviewChangeEntry,
} from "./evidence.js";
import { buildImplementationInputsManifest } from "./implementation-inputs.js";
import { assertSafeCorpusRoot, assertSafeOutputDir, findGitRoot } from "./paths.js";
import { buildReviewHtml } from "./review-html.js";
import {
  transformCorpus,
  type TransformCorpusResult,
  type TransformFn,
} from "./transform-corpus.js";

export const POLYTYPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export interface DogfoodOptions {
  corpusRoot: string;
  outDir: string;
  locale: string;
  dialect: "commonmark" | "mdx";
  /** Recorded verbatim in manifest.json — see DogfoodArgs.localeRationale. Defaults to "" for
   * programmatic/test callers that don't need to state one. */
  localeRationale?: string;
  argv: string[];
  /** Overridable only for tests: the implementation-input repo root defaults to this repository's
   * own root, resolved from this file's own location — never the corpus, never a caller-supplied
   * arbitrary path in real use. */
  polytypoRoot?: string;
  /** Overridable only for tests: defaults to the real public transform(). See
   * scripts/dogfood/transform-corpus.ts's TransformCorpusDeps for why this seam exists. */
  transformFn?: TransformFn;
}

export interface DogfoodRunSummary {
  status: "success" | "failed";
  failureReasons: string[];
  outDir: string;
  counts: {
    changedFileCount: number;
    unchangedFileCount: number;
    errorCount: number;
    unifiedDiffHunkCount: number;
    atomicEditCount: number;
    reviewChangeCount: number;
  };
  idempotencyFailures: string[];
  corpusFileCount: number;
  corpusTotalBytes: number;
  corpusAggregateHash: string;
  implementationAggregateHash: string;
  corpusByteIdenticalBeforeAndAfter: boolean;
  reviewState: typeof REVIEW_STATE;
  evidenceReviewHash: string;
}

const HOW_TO_REVIEW_MD = `# How to review this M4 evidence bundle

This bundle is machine-generated evidence for a human author's decision -- it never decides
anything itself. Nothing here has been reviewed yet.

## Open REVIEW.html

Open \`REVIEW.html\` directly in a browser (double-click it, or File → Open, or drag it into a
browser window -- it works from a plain \`file://\` URL, no server needed). It never makes a
network request: no CDN, no fonts, no analytics, no fetch. Everything it needs is inlined in the
one file.

## How the previews work

Each row shows two things:

- **sourcePreview** -- the real surrounding text from the ORIGINAL file, with this row's own
  edit(s) highlighted.
- **isolatedAfterPreview** -- the SAME window with ONLY this row's own edit(s) applied. It is
  deliberately not a slice of the fully-transformed file, so it never shows another, unrelated
  row's edit inside this row's own preview.

A multi-edit row highlights every one of its edits individually, not one merged block.

## Attribution and risk tags

**Attribution** names which rule(s) produced a change, inferred by running the real \`transform()\`
API with each rule isolated and checking which isolated result(s) reproduce the observed edit.
\`single-rule\` is a confirmed exact match by one rule. \`multi-rule-composition\` means several
rules' isolated edits, applied together unmodified, reproduce the result (they co-occurred, not
proven to interact). \`interaction-candidate\` means something did NOT simply add up -- worth a
closer look, but not proof of a bug. See REVIEW.md's own "Counts by attribution" section for the
full legend.

**Risk tags** flag patterns that are more likely to be a real typography mistake (a numeric range
that might not be a date range, a figure label, a dash that changed style near other punctuation,
an MDX/JSX boundary). A tag is a hint about where to look, not a verdict -- absence of a tag is not
proof of correctness, and presence of one is not proof of a problem.

## Shortcuts

\`j\`/\`k\` or ←/→ = previous/next · \`a\` = ACCEPT · \`r\` = REJECT · \`d\` = NEEDS-DISCUSSION ·
\`u\` = UNREVIEWED · \`/\` = focus search · \`g\` = focus jump-to-id.

## Saving your progress

Decisions and notes are saved automatically to this browser's local storage, scoped to this exact
bundle (its \`evidenceReviewHash\` -- a different code/corpus/locale snapshot never mixes in).
That is enough to resume later in the same browser, but it is NOT a backup: clearing browser data
loses it.

**Export a backup**: click "Export decisions JSON" any time. **Resume from a backup, or hand
decisions to someone else to double-check**: click "Import decisions JSON" and pick the file. An
import is rejected outright (nothing is applied) if it is malformed, from a different bundle, has
duplicate or unknown ids, or an invalid decision value -- and a partial import (fewer ids than the
full set) is never silently accepted.

**Sending your decisions back for review**: the exported JSON file is a plain, readable record --
send it however you'd send any file (email, a shared drive, a PR comment). It is self-describing
(it names its own bundle hash and lists every id with its decision), so a colleague, or a
polytypo maintainer, can re-import it against this same bundle to see exactly what you decided.

## What "done" means

M4's ship criterion is **zero false positives**, decided by the author reading every change. This
tool cannot determine that for you. The banner at the top of REVIEW.html tracks only whether every
row currently has an ACCEPT decision recorded IN YOUR BROWSER -- it is a personal review-progress
indicator, not a pass/fail verdict on the tool run. Even a fully-ACCEPTed bundle does not make M4
"PASS" on its own; that determination is the author's, made outside this tool.
`;

function readGitState(repoRoot: string): { head: string; dirty: boolean } {
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    return { head, dirty: status.trim().length > 0 };
  } catch {
    return { head: "unknown", dirty: true };
  }
}

function readPackageVersion(repoRoot: string): string {
  try {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
      version?: string;
    };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function readSpecVersion(repoRoot: string): string {
  try {
    return readFileSync(path.join(repoRoot, "spec", "VERSION"), "utf8").trim();
  } catch {
    return "unknown";
  }
}

/** Runs the full dry run and writes manifest.json, full.diff, changes.json, and REVIEW.md into
 * `options.outDir`. Never writes anywhere else — in particular, never anywhere under
 * `options.corpusRoot`. Returns a summary whose `status` is the sole source of truth for the
 * CLI's exit code: "failed" on any malformed input, idempotency failure, corpus mutation,
 * consistency-invariant violation, or evidence-generation failure; "success" otherwise,
 * regardless of how many ordinary typography changes were proposed — a large diff is not itself
 * a failure. */
export function runDogfood(options: DogfoodOptions): DogfoodRunSummary {
  const polytypoRoot = options.polytypoRoot ?? POLYTYPO_ROOT;
  const failureReasons: string[] = [];

  assertSafeCorpusRoot(options.corpusRoot);
  const corpusGitRoot = findGitRoot(options.corpusRoot);
  assertSafeOutputDir({
    outDir: options.outDir,
    corpusRoot: options.corpusRoot,
    forbiddenRoots: [polytypoRoot, corpusGitRoot],
  });

  const relPaths = discoverMdxFiles(options.corpusRoot);
  const corpusPreRun: CorpusManifest = buildCorpusManifest(options.corpusRoot, relPaths);

  const transformOptions: Options = {
    locale: options.locale,
    mode: "markdown",
    dialect: options.dialect,
  };
  const transformResult: TransformCorpusResult = transformCorpus(
    options.corpusRoot,
    relPaths,
    transformOptions,
    options.transformFn ? { transformFn: options.transformFn } : {},
  );

  // Re-discover, not just re-hash the same list: a file added, removed, or renamed during the
  // run must be caught even if some existing file's bytes never changed.
  const relPathsAfter = discoverMdxFiles(options.corpusRoot);
  const corpusPostRun: CorpusManifest = buildCorpusManifest(options.corpusRoot, relPathsAfter);
  const corpusUnchanged =
    manifestsEqual(corpusPreRun, corpusPostRun) &&
    corpusPreRun.files.length === corpusPostRun.files.length &&
    corpusPreRun.files.every(
      (f, i) =>
        f.path === corpusPostRun.files[i]?.path && f.sha256 === corpusPostRun.files[i]?.sha256,
    );

  if (!corpusUnchanged) {
    failureReasons.push("corpus mutated during the run — pre-run and post-run manifests differ");
  }
  if (transformResult.counts.errored > 0) {
    failureReasons.push(
      `${transformResult.counts.errored} file(s) failed to transform (malformed input)`,
    );
  }
  if (transformResult.idempotencyFailures.length > 0) {
    failureReasons.push(
      `${transformResult.idempotencyFailures.length} file(s) failed the idempotency check`,
    );
  }
  if (transformResult.results.length !== relPaths.length) {
    failureReasons.push(
      `incomplete inventory: discovered ${relPaths.length} file(s) but produced ${transformResult.results.length} result(s)`,
    );
  }

  const unifiedDiffHunkCount = transformResult.results.reduce(
    (sum, r) => sum + (r.status === "changed" && r.diff ? r.diff.diffHunks.length : 0),
    0,
  );
  const atomicEditCount = transformResult.results.reduce(
    (sum, r) => sum + (r.status === "changed" && r.diff ? r.diff.atomicEdits.length : 0),
    0,
  );
  const reviewChangeEntries: ReviewChangeEntry[] = buildReviewChangeEntries(
    transformResult.results,
  );

  const implementationInputs = buildImplementationInputsManifest(polytypoRoot);
  const gitState = readGitState(polytypoRoot);
  const specVersion = readSpecVersion(polytypoRoot);

  const buildManifestObject = (evidence: EvidenceBlock | null): object =>
    buildManifest({
      provenance: {
        argv: options.argv,
        corpusRoot: options.corpusRoot,
        outDir: options.outDir,
        locale: options.locale,
        localeRationale: options.localeRationale ?? "",
        mode: "markdown",
        dialect: options.dialect,
        nodeVersion: process.version,
        packageVersion: readPackageVersion(polytypoRoot),
        specVersion,
        gitHead: gitState.head,
        gitDirty: gitState.dirty,
      },
      implementationInputs,
      corpusPreRun,
      corpusPostRun,
      corpusManifestsEqual: corpusUnchanged,
      results: transformResult.results,
      counts: {
        changedFileCount: transformResult.counts.changed,
        unchangedFileCount: transformResult.counts.unchanged,
        errorCount: transformResult.counts.errored,
        unifiedDiffHunkCount,
        atomicEditCount,
        reviewChangeCount: reviewChangeEntries.length,
      },
      idempotencyFailures: transformResult.idempotencyFailures,
      evidence,
    });

  // Pass 1: a counts-only manifest (no evidence block yet -- REVIEW.html and evidenceReviewHash
  // do not exist yet) purely so buildReviewMarkdown can render its run-summary section. This is
  // never written to disk.
  const manifestForMarkdown = buildManifestObject(null);
  const fullDiffText = buildFullDiff(transformResult.results);
  const reviewMarkdown = buildReviewMarkdown(
    manifestForMarkdown,
    reviewChangeEntries,
    transformResult.results,
  );

  // Evidence identity (Stage 10 Pass A second correction, item 5): computed from changes.json's
  // and REVIEW.md's own content -- both already fully determined above -- never from manifest.json
  // (which embeds this hash) and never from REVIEW.html (generated next, embedding this hash as a
  // static value). See evidence-hash.ts's own doc comment for why this ordering avoids a cycle.
  const changesJsonText = JSON.stringify(reviewChangeEntries, null, 2) + "\n";
  const changesJsonDigest = digestArtifact(changesJsonText);
  const reviewMarkdownDigest = digestArtifact(reviewMarkdown);
  const evidenceReviewHash = computeEvidenceReviewHash({
    implementationAggregateHash: implementationInputs.aggregateHash,
    corpusAggregateHash: corpusPreRun.aggregateHash,
    locale: options.locale,
    mode: "markdown",
    dialect: options.dialect,
    specVersion,
    changesJsonSha256: changesJsonDigest.sha256,
    reviewMarkdownSha256: reviewMarkdownDigest.sha256,
  });

  let reviewRuntimeSource = "";
  try {
    reviewRuntimeSource = readFileSync(
      path.join(polytypoRoot, "scripts", "dogfood", "review-runtime.js"),
      "utf8",
    );
  } catch (error) {
    failureReasons.push(
      `evidence-generation failure: could not read review-runtime.js: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const reviewHtml = buildReviewHtml(
    reviewChangeEntries,
    evidenceReviewHash,
    {
      corpus: options.corpusRoot,
      locale: options.locale,
      mode: "markdown",
      dialect: options.dialect,
      specVersion,
      implementationAggregateHash: implementationInputs.aggregateHash,
      corpusAggregateHash: corpusPreRun.aggregateHash,
      gitHead: gitState.head,
    },
    reviewRuntimeSource,
  );
  const reviewHtmlDigest = digestArtifact(reviewHtml);

  const evidenceBlock: EvidenceBlock = {
    evidenceReviewHash,
    evidenceReviewHashSchemaVersion: 1,
    artifacts: {
      changesJson: changesJsonDigest,
      reviewMarkdown: reviewMarkdownDigest,
      reviewHtml: reviewHtmlDigest,
    },
  };

  // Pass 2: the manifest actually written to disk, now including the evidence block computed
  // above. reviewMarkdown itself is NOT regenerated from this manifest (it would then contain a
  // hash that depends on its own content) -- REVIEW.md's evidenceReviewHash line was already
  // rendered from `manifestForMarkdown`'s absence of one; see the run summary section, which
  // handles a `null` evidence block by omitting that line entirely for pass 1 and would include it
  // for a hypothetical pass-2 markdown, but pass 2 never re-renders markdown, only the manifest.
  const manifestObject = buildManifestObject(evidenceBlock);

  // Fail-closed consistency invariants (Stage 10 correction): every one of these must hold
  // before evidence is trusted enough to write. A violation here is treated exactly like an
  // idempotency failure or a malformed input — it fails the run, it does not silently ship a
  // broken ledger.
  const fileLineCounts = new Map<string, { oldLines: number; newLines: number }>();
  for (const r of transformResult.results) {
    if (r.status === "changed" && r.diff) {
      fileLineCounts.set(r.path, { oldLines: r.diff.oldLineCount, newLines: r.diff.newLineCount });
    }
  }
  const manifestResults = (
    manifestObject as {
      results: { reviewChangeCount: number; unifiedDiffHunkCount: number; atomicEditCount: number };
    }
  ).results;
  failureReasons.push(
    ...checkAllConsistency({
      entries: reviewChangeEntries,
      results: transformResult.results,
      reviewMarkdown,
      manifestCounts: {
        reviewChangeCount: manifestResults.reviewChangeCount,
        unifiedDiffHunkCount: manifestResults.unifiedDiffHunkCount,
        atomicEditCount: manifestResults.atomicEditCount,
      },
      actualUnifiedDiffHunkCount: unifiedDiffHunkCount,
      actualAtomicEditCount: atomicEditCount,
      reviewChangeMaxOldSpanCodePoints: REVIEW_CHANGE_MAX_OLD_SPAN_CODEPOINTS,
      fileLineCounts,
      locale: getLocaleData(options.locale),
    }),
  );

  // Serialization-determinism self-check: the exact same in-memory data, serialized twice, must
  // produce byte-identical JSON/Markdown. Catches non-determinism (unstable object-key order,
  // an uncontrolled timestamp) before it ever reaches disk, independent of the "run the whole
  // CLI twice" check the task's own verification step performs externally.
  if (
    JSON.stringify(manifestObject, null, 2) !==
    JSON.stringify(buildManifestObject(evidenceBlock), null, 2)
  ) {
    failureReasons.push(
      "consistency: manifest.json serialization is non-deterministic across two in-memory builds",
    );
  }
  if (
    changesJsonText !==
    JSON.stringify(buildReviewChangeEntries(transformResult.results), null, 2) + "\n"
  ) {
    failureReasons.push(
      "consistency: changes.json serialization is non-deterministic across two in-memory builds",
    );
  }
  if (
    reviewHtml !==
    buildReviewHtml(
      reviewChangeEntries,
      evidenceReviewHash,
      {
        corpus: options.corpusRoot,
        locale: options.locale,
        mode: "markdown",
        dialect: options.dialect,
        specVersion,
        implementationAggregateHash: implementationInputs.aggregateHash,
        corpusAggregateHash: corpusPreRun.aggregateHash,
        gitHead: gitState.head,
      },
      reviewRuntimeSource,
    )
  ) {
    failureReasons.push(
      "consistency: REVIEW.html serialization is non-deterministic across two in-memory builds",
    );
  }

  try {
    mkdirSync(options.outDir, { recursive: true });
    writeFileSync(
      path.join(options.outDir, "manifest.json"),
      JSON.stringify(manifestObject, null, 2) + "\n",
      "utf8",
    );
    writeFileSync(path.join(options.outDir, "full.diff"), fullDiffText, "utf8");
    writeFileSync(path.join(options.outDir, "changes.json"), changesJsonText, "utf8");
    writeFileSync(path.join(options.outDir, "REVIEW.md"), reviewMarkdown, "utf8");
    writeFileSync(path.join(options.outDir, "REVIEW.html"), reviewHtml, "utf8");
    writeFileSync(path.join(options.outDir, "HOW_TO_REVIEW.md"), HOW_TO_REVIEW_MD, "utf8");
  } catch (error) {
    failureReasons.push(
      `evidence-generation failure: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return {
    status: failureReasons.length === 0 ? "success" : "failed",
    failureReasons,
    outDir: options.outDir,
    counts: {
      changedFileCount: transformResult.counts.changed,
      unchangedFileCount: transformResult.counts.unchanged,
      errorCount: transformResult.counts.errored,
      unifiedDiffHunkCount,
      atomicEditCount,
      reviewChangeCount: reviewChangeEntries.length,
    },
    idempotencyFailures: [...transformResult.idempotencyFailures],
    corpusFileCount: corpusPreRun.fileCount,
    corpusTotalBytes: corpusPreRun.totalBytes,
    corpusAggregateHash: corpusPreRun.aggregateHash,
    implementationAggregateHash: implementationInputs.aggregateHash,
    corpusByteIdenticalBeforeAndAfter: corpusUnchanged,
    reviewState: REVIEW_STATE,
    evidenceReviewHash,
  };
}
