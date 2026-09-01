#!/usr/bin/env node
// Repeatable raw + gzip bundle-size reporting for every entry point
// (AUDIT_REMEDIATION_AND_RELEASE_PLAN.md 5.1, acceptance criterion 10). Bundles each entry the
// same way the browser bundle does (esbuild, iife, minified, platform: browser) so the numbers
// are comparable to promo/vendor/polytypo.browser.js and to each other, then compares against a
// committed baseline with a tolerance budget. This is size *reporting* with a coarse regression
// tripwire, not the dependency-reach proof — that is scripts/check-entry-reach.mjs, which asserts
// the actual module graph rather than inferring it from a byte count.
//
// scripts/bundle-size-baseline.json is a **post-split** baseline: sizes measured from the four
// separate entry points this stage introduced, recorded for tracking *future* regressions against
// (a size growing from here on). It is not, and must not be described as, the pre-split
// measurement — that number is the single-entry aggregate bundle from the original audit
// (AUDIT_REMEDIATION_AND_RELEASE_PLAN.md 5.1: "approximately 676 KB minified / 195 KB gzip"),
// which predates this refactor and was never re-measured directly by this script. `HISTORICAL_
// PRE_SPLIT_AGGREGATE` below exists only so the two numbers are never conflated in output.
//
// Usage:
//   node scripts/check-bundle-size.mjs             # report + compare against baseline, exit 1 on regression
//   node scripts/check-bundle-size.mjs --write-baseline   # record current sizes as the new post-split baseline
import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH = path.join(ROOT, "scripts", "bundle-size-baseline.json");

const ENTRIES = [
  { name: "index", file: "src/index.ts", globalName: "PolytypoAggregate" },
  { name: "text", file: "src/index.text.ts", globalName: "PolytypoText" },
  { name: "html", file: "src/index.html.ts", globalName: "PolytypoHtml" },
  { name: "markdown", file: "src/index.markdown.ts", globalName: "PolytypoMarkdown" },
];

// The pre-split, single-entry aggregate bundle, as reported in the original audit
// (AUDIT_REMEDIATION_AND_RELEASE_PLAN.md 5.1). Approximate — the audit did not record exact
// byte counts, and this script never re-measured that historical build (the source tree has
// since changed). Shown for context only, never compared against as if it were the baseline.
const HISTORICAL_PRE_SPLIT_AGGREGATE = { rawApprox: 676 * 1024, gzipApprox: 195 * 1024 };

// A regression past this fraction of the baseline fails the check. 5% is deliberately tight:
// esbuild's bundling of a fixed source tree is deterministic (two builds of the same commit
// produce byte-identical output — verified when this baseline was recorded, see the "post-split
// baseline" note below), so the variance this budget actually needs to absorb is toolchain/
// dependency version drift (an esbuild point release, a parser package patch bump), which is
// ordinarily well under 5% for a minified bundle. This project's CI (.github/workflows/ci.yml)
// runs on Node 20 and 22, but this repository does not have both runtimes available to measure
// cross-version variance directly — 5% is the requested default in the absence of that evidence,
// not a number derived from measuring both. Raise it only with recorded before/after numbers
// showing 5% is routinely too tight in practice, not preemptively.
//
// This budget is a secondary signal, not the primary defence against a forbidden parser becoming
// reachable again — a full parse5+micromark leak (~190 KB raw) would blow well past it, but a
// partial or single-package leak might not. scripts/check-entry-reach.mjs's module-graph
// assertion is the actual gate for that; this script's job is repeatable size reporting plus a
// coarse regression tripwire.
const REGRESSION_BUDGET = 0.05;

async function sizesFor(entry) {
  const result = await build({
    entryPoints: [path.join(ROOT, entry.file)],
    bundle: true,
    write: false,
    minify: true,
    format: "iife",
    globalName: entry.globalName,
    platform: "browser",
    target: "es2022",
    logLevel: "silent",
  });
  const code = result.outputFiles[0].contents;
  return { raw: code.byteLength, gzip: gzipSync(code).byteLength };
}

async function loadBaseline() {
  try {
    return JSON.parse(await readFile(BASELINE_PATH, "utf8"));
  } catch {
    return null;
  }
}

const writeBaseline = process.argv.includes("--write-baseline");

const current = {};
for (const entry of ENTRIES) {
  current[entry.name] = await sizesFor(entry);
}

if (writeBaseline) {
  const withMeta = {
    _meta: {
      description:
        "Post-split baseline: measured from the four separate entry points, for tracking " +
        "future regressions from this point forward. NOT the pre-split measurement — see " +
        "HISTORICAL_PRE_SPLIT_AGGREGATE in this script and AUDIT_REMEDIATION_AND_RELEASE_PLAN.md 5.1.",
    },
    ...current,
  };
  await writeFile(BASELINE_PATH, JSON.stringify(withMeta, null, 2) + "\n");
  console.log(`wrote post-split baseline to ${path.relative(ROOT, BASELINE_PATH)}`);
  for (const entry of ENTRIES) {
    const { raw, gzip } = current[entry.name];
    console.log(`  ${entry.name.padEnd(10)} raw ${fmt(raw)}  gzip ${fmt(gzip)}`);
  }
  console.log(
    `\n(for reference only, not compared against: the pre-split aggregate bundle from the audit ` +
      `was approximately ${fmt(HISTORICAL_PRE_SPLIT_AGGREGATE.rawApprox)} raw / ` +
      `${fmt(HISTORICAL_PRE_SPLIT_AGGREGATE.gzipApprox)} gzip)`,
  );
  process.exit(0);
}

function fmt(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`.padStart(9);
}

const baseline = await loadBaseline();
let failed = false;

console.log(
  `comparing against the post-split baseline (${path.relative(ROOT, BASELINE_PATH)}), not the ` +
    `pre-split aggregate — see this script's header comment.\n`,
);
console.log("entry       raw (now)   gzip (now)   raw (baseline)  gzip (baseline)  status");
for (const entry of ENTRIES) {
  const { raw, gzip } = current[entry.name];
  const base = baseline?.[entry.name];
  let status = "no baseline";
  if (base) {
    const rawGrowth = (raw - base.raw) / base.raw;
    const gzipGrowth = (gzip - base.gzip) / base.gzip;
    const regressed = rawGrowth > REGRESSION_BUDGET || gzipGrowth > REGRESSION_BUDGET;
    status = regressed
      ? `FAIL (+${(Math.max(rawGrowth, gzipGrowth) * 100).toFixed(1)}%, budget ${(REGRESSION_BUDGET * 100).toFixed(0)}%)`
      : "ok";
    if (regressed) failed = true;
  }
  console.log(
    `${entry.name.padEnd(10)}  ${fmt(raw)}  ${fmt(gzip)}   ${base ? fmt(base.raw) : "—".padStart(9)}       ${base ? fmt(base.gzip) : "—".padStart(9)}      ${status}`,
  );
}

if (!baseline) {
  console.log("\nno baseline recorded yet — run with --write-baseline to record one.");
} else if (failed) {
  console.error(`\nbundle-size regression exceeds the ${(REGRESSION_BUDGET * 100).toFixed(0)}% budget.`);
  process.exit(1);
} else {
  console.log("\nall entries within the bundle-size regression budget.");
}
