// Runs the real public transform() API over every discovered corpus file: read-only (only
// readFileSync is ever called on corpus paths), catches a malformed-input error per file without
// aborting the rest of the corpus, verifies idempotency on every successfully transformed output,
// and computes the diff + rule attribution + risk tags for every changed file.
//
// Stage 10 Pass A correction: risk tagging now runs *after* attribution (tagging.ts's
// `quote-pairing-candidate` needs attribution's `overlappingIsolatedRules` as an input) and
// produces one `RiskTag[]` per `ReviewChange`, keyed the same way attribution already was.
import { readFileSync } from "node:fs";
import path from "node:path";
import { PolytypoError, transform } from "../../src/index.js";
import type { Options } from "../../src/types.js";
import { getLocaleData } from "../../src/engine/locale.js";
import { attributeReviewChanges, type ReviewChangeAttribution } from "./attribution.js";
import { sha256HexOfBuffer } from "./corpus.js";
import { computeFileDiff, type FileDiff } from "./diff.js";
import { computeQuotePairing, type QuotePairing } from "./quote-pairing.js";
import { computeRiskTags, type RiskTag } from "./tagging.js";

export interface FileResult {
  path: string;
  bytes: number;
  sha256: string;
  status: "unchanged" | "changed" | "error";
  errorCode?: string;
  errorMessage?: string;
  /** Absent only when status is "error". */
  idempotencyOk?: boolean;
  diff?: FileDiff;
  originalText?: string;
  transformedText?: string;
  attribution?: Map<string, ReviewChangeAttribution>;
  riskTags?: Map<string, RiskTag[]>;
  quotePairing?: Map<string, QuotePairing>;
}

export interface TransformCorpusResult {
  results: FileResult[];
  counts: { changed: number; unchanged: number; errored: number };
  idempotencyFailures: string[];
}

export type TransformFn = (input: string, options: Options) => string;

export interface TransformCorpusDeps {
  /** Defaults to the real public transform(). The one injectable seam in this module, purely for
   * testing the idempotency-failure detection path itself. See tests/scripts/dogfood.test.ts. */
  transformFn?: TransformFn;
}

/** Runs `options` through transform() (or `deps.transformFn`, for tests) for every file in
 * `relPaths` (relative to `corpusRootAbs`), in the given order. A per-file error is caught and
 * recorded rather than propagated, so one bad file never prevents the rest of the corpus from
 * being inventoried. */
export function transformCorpus(
  corpusRootAbs: string,
  relPaths: readonly string[],
  options: Options,
  deps: TransformCorpusDeps = {},
): TransformCorpusResult {
  const transformFn = deps.transformFn ?? transform;
  const results: FileResult[] = [];
  let changed = 0;
  let unchanged = 0;
  let errored = 0;
  const idempotencyFailures: string[] = [];
  // Resolved once for the whole corpus -- the CLI contract is one explicit locale for the whole
  // run (dogfood-m4.ts), never per-file. Used only to give `computeRiskTags` the exact locale
  // data it needs for `single-initial-binding-candidate`'s locale-aware OPENISH set.
  const localeData = getLocaleData(options.locale);

  for (const rel of relPaths) {
    const abs = path.join(corpusRootAbs, ...rel.split("/"));
    const buf = readFileSync(abs);
    const sha256 = sha256HexOfBuffer(buf);
    const input = buf.toString("utf8");

    let output: string;
    try {
      output = transformFn(input, options);
    } catch (error) {
      errored += 1;
      results.push({
        path: rel,
        bytes: buf.length,
        sha256,
        status: "error",
        ...(error instanceof PolytypoError ? { errorCode: error.code } : {}),
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    let idempotencyOk: boolean;
    try {
      idempotencyOk = transformFn(output, options) === output;
    } catch {
      idempotencyOk = false;
    }
    if (!idempotencyOk) idempotencyFailures.push(rel);

    if (output === input) {
      unchanged += 1;
      results.push({ path: rel, bytes: buf.length, sha256, status: "unchanged", idempotencyOk });
      continue;
    }

    changed += 1;
    const diff = computeFileDiff(rel, input, output);
    const attribution =
      transformFn === transform
        ? attributeReviewChanges(input, options, diff.reviewChanges)
        : new Map<string, ReviewChangeAttribution>();

    const riskTags = new Map<string, RiskTag[]>();
    for (const rc of diff.reviewChanges) {
      const edits = diff.atomicEdits.filter((e) => rc.atomicEditIds.includes(e.id));
      riskTags.set(
        rc.id,
        computeRiskTags({ oldText: input, newText: output, reviewChange: rc, atomicEdits: edits, attribution: attribution.get(rc.id), locale: localeData }),
      );
    }
    const quotePairing = computeQuotePairing(input, diff.reviewChanges, attribution);

    results.push({
      path: rel,
      bytes: buf.length,
      sha256,
      status: "changed",
      idempotencyOk,
      diff,
      originalText: input,
      transformedText: output,
      attribution,
      riskTags,
      quotePairing,
    });
  }

  return { results, counts: { changed, unchanged, errored }, idempotencyFailures };
}
