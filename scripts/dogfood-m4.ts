#!/usr/bin/env -S npx tsx
// M4 dogfooding dry-run CLI (docs/ROADMAP.md M4, docs/PLAN.md dogfooding section,
// docs/AUDIT_REMEDIATION_AND_RELEASE_PLAN.md 3.1). Strictly read-only against the corpus: runs
// the real public transform() API over every discovered *.mdx file and writes a review bundle
// (manifest.json, full.diff, changes.json, REVIEW.md) to a fresh output directory. Never edits,
// formats, renames, or creates anything under the corpus root, and never declares M4 passed —
// the review state this tool writes is always "pending-human-review".
//
// Usage:
//   npm run dogfood:m4 -- --corpus /absolute/path/to/content/blog --out /absolute/path/to/output \
//     --locale en-US --dialect mdx
//
// Exit code distinguishes two genuinely different outcomes:
//   0 — the review bundle was produced successfully. It may contain any number of ordinary
//       proposed typography changes; that alone is success, not failure. M4 remains pending until
//       a human reviews REVIEW.md.
//   1 — something the tool itself could not tolerate: an invalid/unsafe argument, a malformed
//       input file, an idempotency failure, a corpus mutation, an incomplete inventory, or an
//       evidence-generation failure. See stderr for which.
import { parseDogfoodArgs, type DogfoodArgs } from "./dogfood/args.js";
import { DogfoodSafetyError } from "./dogfood/paths.js";
import { SymlinkEncounteredError } from "./dogfood/corpus.js";
import { runDogfood } from "./dogfood/run.js";

function die(message: string): never {
  console.error(`dogfood:m4: ${message}`);
  console.error(
    "usage: npm run dogfood:m4 -- --corpus <absolute-path> --out <absolute-path> --locale <locale> --dialect <commonmark|mdx>",
  );
  process.exit(1);
}

const parsed = parseDogfoodArgs(process.argv.slice(2));
if (parsed.error) die(parsed.error);
// parseDogfoodArgs's return type guarantees `args` is present whenever `error` is not — die()
// above never returns, so this cast reflects that guarantee rather than overriding it.
const args = parsed.args as DogfoodArgs;

try {
  const summary = runDogfood({
    corpusRoot: args.corpus,
    outDir: args.out,
    locale: args.locale,
    dialect: args.dialect,
    localeRationale: args.localeRationale,
    argv: process.argv.slice(2),
  });

  console.log(`dogfood:m4: evidence written to ${summary.outDir}`);
  console.log(
    `dogfood:m4: ${summary.counts.changedFileCount} changed, ${summary.counts.unchangedFileCount} unchanged, ` +
      `${summary.counts.errorCount} errored (${summary.corpusFileCount} files, ${summary.corpusTotalBytes} bytes)`,
  );
  console.log(
    `dogfood:m4: ${summary.counts.unifiedDiffHunkCount} unified diff hunk(s), ${summary.counts.atomicEditCount} atomic edit(s), ` +
      `${summary.counts.reviewChangeCount} review change(s) -- three different counts; a hunk bundles several atomic edits, ` +
      "and one or more nearby atomic edits group into one review change",
  );
  console.log(
    `dogfood:m4: corpus byte-identical before/after: ${summary.corpusByteIdenticalBeforeAndAfter}`,
  );
  console.log(`dogfood:m4: review state: ${summary.reviewState}`);

  if (summary.status === "failed") {
    console.error("dogfood:m4: FAILED (fail-closed):");
    for (const reason of summary.failureReasons) {
      console.error(`  - ${reason}`);
    }
    process.exit(1);
  }

  console.log(
    "dogfood:m4: success — a review bundle was produced. M4 is NOT passed; it remains pending-human-review " +
      "until every change in REVIEW.md is reviewed with zero REJECT decisions.",
  );
  process.exit(0);
} catch (error) {
  if (error instanceof DogfoodSafetyError || error instanceof SymlinkEncounteredError) {
    console.error(`dogfood:m4: refused (fail-closed): ${error.message}`);
  } else {
    console.error(
      `dogfood:m4: unexpected failure: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    );
  }
  process.exit(1);
}
