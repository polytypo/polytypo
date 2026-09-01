#!/usr/bin/env node
// Dependency-reach assertion for every entry point (AUDIT_REMEDIATION_AND_RELEASE_PLAN.md 5.1,
// acceptance criteria 1-3, and the follow-up review's item 4). Bundles each entry with esbuild
// and inspects the metafile's `inputs` — the actual resolved module graph, following every real
// relative chunk import and every external node_modules package import esbuild itself resolves
// (not a heuristic inferred from an entry's filename or its own top-level source text) — against
// per-package identities for parse5, Micromark core, and each of the GFM/frontmatter/MDX
// extensions (scripts/lib/entry-reach.mjs), so a violation reports exactly which component
// leaked or went missing rather than a single combined "Markdown stack" verdict.
//
// Runs against both the TypeScript source (src/index.*.ts) and the built output (dist/*.js,
// dist/*.cjs): the source graph can be clean while tsup's chunking still leaks a forbidden module
// into a shared chunk a forbidden entry pulls in, so only the built output is what a consumer
// actually installs and both must be checked. Every entry/format file is also asserted present —
// a missing file is a build regression this script must not silently pass over.
//
// The assertion logic itself (which patterns are forbidden/required per entry, and how a
// violation is reported) lives in scripts/lib/entry-reach.mjs and is independently exercised
// against fabricated module-path lists in tests/scripts/entry-reach.test.ts — a permanent
// self-test proving each forbidden/required category can independently fail the check, run on
// every `npm test` rather than a one-off manual mutation.
import { build } from "esbuild";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ENTRIES, evaluate } from "./lib/entry-reach.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function reachFor(entryPoint) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    metafile: true,
    platform: "node",
    format: entryPoint.endsWith(".cjs") ? "cjs" : "esm",
    target: "es2022",
    logLevel: "silent",
  });
  return Object.keys(result.metafile.inputs);
}

function report(label, inputs, spec, failures) {
  const result = evaluate(inputs, spec);
  if (!result.ok) {
    const detail =
      result.reason === "forbidden"
        ? `reaches forbidden module(s):\n  ${result.forbiddenHits.join("\n  ")}`
        : `is missing required module(s) matching:\n  ${result.missingRequired.map(String).join("\n  ")}`;
    failures.push(`${label} ${detail}`);
    return;
  }
  console.log(`ok    ${label} (${inputs.length} modules)`);
}

function sourceFileFor(name) {
  return name === "index" ? "index.ts" : `index.${name}.ts`;
}

async function checkSource() {
  const failures = [];
  for (const [name, spec] of Object.entries(ENTRIES)) {
    const fileName = sourceFileFor(name);
    const entry = path.join(ROOT, "src", fileName);
    const inputs = await reachFor(entry);
    report(`source src/${fileName}`, inputs, spec, failures);
  }
  return failures;
}

async function checkBuilt() {
  const distDir = path.join(ROOT, "dist");
  let dirEntries;
  try {
    dirEntries = await readdir(distDir);
  } catch {
    return ["dist/ does not exist — run `npm run build` before `npm run check:entry-reach`."];
  }
  const failures = [];
  for (const [name, spec] of Object.entries(ENTRIES)) {
    for (const ext of ["js", "cjs"]) {
      const fileName = `${name}.${ext}`;
      if (!dirEntries.includes(fileName)) {
        failures.push(`dist/${fileName} is missing — build did not produce every entry/format.`);
        continue;
      }
      // Bundles the actual built file, so relative chunk imports (dist/chunk-*.js/.cjs) and
      // external node_modules imports are both followed for real, not inferred from the
      // filename "text"/"html"/"markdown"/"index" or from grepping the file's own source text.
      const inputs = await reachFor(path.join(distDir, fileName));
      report(`built dist/${fileName}`, inputs, spec, failures);
    }
  }
  return failures;
}

const failures = [...(await checkSource()), ...(await checkBuilt())];

if (failures.length > 0) {
  console.error("\ndependency-reach assertion failed:\n");
  for (const failure of failures) console.error(`fail  ${failure}\n`);
  process.exit(1);
}

console.log(
  "\ndependency-reach assertion passed: forbidden modules unreachable, required modules present, on every entry/format.",
);
