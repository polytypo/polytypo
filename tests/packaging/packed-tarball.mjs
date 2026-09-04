#!/usr/bin/env node
// Tests the actual `npm pack` tarball, not Node package self-reference (Stage 6 task 5,
// AUDIT_REMEDIATION_AND_RELEASE_PLAN.md 5.2). tests/packaging/run.mjs's smoke tests import
// "polytypo" from files inside this repository, resolved through Node's self-reference feature —
// that proves the exports map is internally consistent, but never proves a real `npm install`
// from a real tarball, in a project with no relationship to this repo, actually works. This
// script does that: it creates a temporary consumer project OUTSIDE this repository, `npm
// install`s a real tarball into it, and exercises every public entry point from there — ESM,
// CommonJS, and TypeScript declaration resolution (.mts/.cts, exact .d.ts-vs-.d.cts condition
// selection) — with no relative import back into this repo's src/ or dist/, and no package
// self-reference. Cleans up its temp directory on both success and failure. Never deletes the
// input tarball itself when one was supplied via --tarball (see below) — only tarballs this
// script produced itself are its own to remove.
//
// Two modes:
//   node tests/packaging/packed-tarball.mjs
//     Local convenience mode: builds and packs its own tarball (in a temp dir it owns and
//     cleans up), then tests it.
//
//   node tests/packaging/packed-tarball.mjs --tarball <path/to/polytypo-*.tgz>
//     Tests an EXISTING tarball someone else already built and packed — no build, no pack. This
//     is what the release workflow's verify job uses: it builds and packs exactly one real
//     tarball, this script tests that exact file, and the same file is later uploaded as the
//     release artifact and published without ever being rebuilt.
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";
import { parseTarballArg } from "../../scripts/lib/cli-args.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TSC_BIN = path.join(ROOT, "node_modules", ".bin", "tsc");

function run(command, args, opts = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...opts });
  if (result.status !== 0) {
    const label = [command, ...args].join(" ");
    throw new Error(`command failed (${label}):\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  }
  return result;
}

function usageError(message) {
  console.error(`error: ${message}`);
  console.error("usage: node tests/packaging/packed-tarball.mjs [--tarball <path>]");
  process.exit(1);
}

function parseArgs(argv) {
  const result = parseTarballArg(argv);
  if (result.error) usageError(result.error);
  return { suppliedTarballPath: result.tarballPath ? path.resolve(result.tarballPath) : null };
}

const { suppliedTarballPath } = parseArgs(process.argv.slice(2));

let tmpRoot;
let failed = false;

try {
  let tarballPath;
  if (suppliedTarballPath) {
    tarballPath = suppliedTarballPath;
    console.log(`using supplied tarball: ${tarballPath}`);
  } else {
    console.log("building...");
    run("npm", ["run", "build"], { cwd: ROOT });
  }

  tmpRoot = await mkdtemp(path.join(tmpdir(), "polytypo-tarball-test-"));
  const consumerDir = path.join(tmpRoot, "consumer");
  await mkdir(consumerDir);

  if (!suppliedTarballPath) {
    const tarballDir = path.join(tmpRoot, "tarball");
    await mkdir(tarballDir);
    console.log(`\npacking (real npm pack, not --dry-run) into ${tarballDir}...`);
    const packOut = run("npm", ["pack", "--pack-destination", tarballDir, "--json"], { cwd: ROOT });
    const [packResult] = JSON.parse(packOut.stdout);
    tarballPath = path.join(tarballDir, packResult.filename);
    console.log(`tarball: ${tarballPath} (${packResult.size} bytes packed)`);
  }

  console.log(`\ncreating temporary consumer project at ${consumerDir}...`);
  await writeFile(
    path.join(consumerDir, "package.json"),
    JSON.stringify({ name: "polytypo-tarball-consumer", private: true, version: "0.0.0" }, null, 2),
  );

  console.log("installing the tarball (npm install <tarball path>)...");
  run("npm", ["install", tarballPath, "--no-audit", "--no-fund"], { cwd: consumerDir });

  const installedPkgPath = path.join(consumerDir, "node_modules", "polytypo", "package.json");
  run("node", ["-e", `require(${JSON.stringify(installedPkgPath)})`], { cwd: consumerDir });
  console.log("confirmed: node_modules/polytypo/package.json exists and parses.");

  // --- ESM smoke test, run from the consumer, importing only "polytypo"/"polytypo/*" ----------
  const esmSmokePath = path.join(consumerDir, "esm-smoke.mjs");
  await writeFile(
    esmSmokePath,
    `
import assert from "node:assert/strict";
import { PolytypoError, transform as transformAggregate } from "polytypo";
import { PolytypoError as PolytypoErrorFromHtml, transform as transformHtml } from "polytypo/html";
import { PolytypoError as PolytypoErrorFromMarkdown, transform as transformMarkdown } from "polytypo/markdown";
import { PolytypoError as PolytypoErrorFromText, transform as transformText } from "polytypo/text";

const locale = "en-US";
assert.equal(transformAggregate("x...y", { locale }), "x…y");
assert.equal(transformText("x...y", { locale }), "x…y");
assert.equal(transformHtml("<p>x...y</p>", { locale }), "<p>x…y</p>");
assert.equal(transformMarkdown("x...y", { locale, dialect: "commonmark" }), "x…y");
assert.equal(transformMarkdown("x...y", { locale, dialect: "mdx" }), "x…y");

assert.equal(PolytypoErrorFromText, PolytypoError);
assert.equal(PolytypoErrorFromHtml, PolytypoError);
assert.equal(PolytypoErrorFromMarkdown, PolytypoError);

assert.throws(
  () => transformText("x", { locale, mode: "html" }),
  (error) => error instanceof PolytypoError && error.code === "POLYTYPO_INVALID_MODE",
);
assert.throws(
  () => transformHtml("x", { locale, mode: "markdown" }),
  (error) => error instanceof PolytypoError && error.code === "POLYTYPO_INVALID_MODE",
);
assert.throws(
  () => transformMarkdown("x", { locale, dialect: "commonmark", mode: "text" }),
  (error) => error instanceof PolytypoError && error.code === "POLYTYPO_INVALID_MODE",
);
assert.throws(
  () => transformAggregate("x", { locale: "xx" }),
  (error) => error instanceof PolytypoError && error.code === "POLYTYPO_UNKNOWN_LOCALE",
);
console.log("packed-tarball esm-smoke: ok");
`,
  );
  console.log("\n--- ESM smoke test (from installed tarball) ---");
  run("node", [esmSmokePath], { cwd: consumerDir });
  console.log("packed-tarball esm-smoke: ok");

  // --- CJS smoke test -----------------------------------------------------------------------
  const cjsSmokePath = path.join(consumerDir, "cjs-smoke.cjs");
  await writeFile(
    cjsSmokePath,
    `
"use strict";
const assert = require("node:assert/strict");
const { PolytypoError, transform: transformAggregate } = require("polytypo");
const { PolytypoError: PolytypoErrorFromHtml, transform: transformHtml } = require("polytypo/html");
const { PolytypoError: PolytypoErrorFromMarkdown, transform: transformMarkdown } = require("polytypo/markdown");
const { PolytypoError: PolytypoErrorFromText, transform: transformText } = require("polytypo/text");

const locale = "en-US";
assert.equal(transformAggregate("x...y", { locale }), "x…y");
assert.equal(transformText("x...y", { locale }), "x…y");
assert.equal(transformHtml("<p>x...y</p>", { locale }), "<p>x…y</p>");
assert.equal(transformMarkdown("x...y", { locale, dialect: "commonmark" }), "x…y");
assert.equal(transformMarkdown("x...y", { locale, dialect: "mdx" }), "x…y");

assert.equal(PolytypoErrorFromText, PolytypoError);
assert.equal(PolytypoErrorFromHtml, PolytypoError);
assert.equal(PolytypoErrorFromMarkdown, PolytypoError);

assert.throws(
  () => transformText("x", { locale, mode: "html" }),
  (error) => error instanceof PolytypoError && error.code === "POLYTYPO_INVALID_MODE",
);
assert.throws(
  () => transformHtml("x", { locale, mode: "markdown" }),
  (error) => error instanceof PolytypoError && error.code === "POLYTYPO_INVALID_MODE",
);
assert.throws(
  () => transformMarkdown("x", { locale, dialect: "commonmark", mode: "text" }),
  (error) => error instanceof PolytypoError && error.code === "POLYTYPO_INVALID_MODE",
);
console.log("packed-tarball cjs-smoke: ok");
`,
  );
  console.log("\n--- CommonJS smoke test (from installed tarball) ---");
  run("node", [cjsSmokePath], { cwd: consumerDir });
  console.log("packed-tarball cjs-smoke: ok");

  // --- .mts / .cts declaration consumers, compiled against the real installed package ----------
  const mtsPath = path.join(consumerDir, "mts-consumer.mts");
  await writeFile(
    mtsPath,
    `
import { transform as transformAggregate, type Options } from "polytypo";
import { transform as transformHtml, type HtmlOptions } from "polytypo/html";
import { transform as transformMarkdown, type MarkdownOptions } from "polytypo/markdown";
import { transform as transformText, type TextOptions } from "polytypo/text";

const aggregateOptions: Options = { locale: "en-US", mode: "text" };
transformAggregate("x", aggregateOptions);
const textOptions: TextOptions = { locale: "en-US" };
transformText("x", textOptions);
const htmlOptions: HtmlOptions = { locale: "en-US" };
transformHtml("x", htmlOptions);
const markdownOptions: MarkdownOptions = { locale: "en-US", dialect: "commonmark" };
transformMarkdown("x", markdownOptions);
`,
  );
  const ctsPath = path.join(consumerDir, "cts-consumer.cts");
  await writeFile(
    ctsPath,
    `
import { transform as transformAggregate, type Options } from "polytypo";
import { transform as transformHtml, type HtmlOptions } from "polytypo/html";
import { transform as transformMarkdown, type MarkdownOptions } from "polytypo/markdown";
import { transform as transformText, type TextOptions } from "polytypo/text";

const aggregateOptions: Options = { locale: "en-US", mode: "text" };
transformAggregate("x", aggregateOptions);
const textOptions: TextOptions = { locale: "en-US" };
transformText("x", textOptions);
const htmlOptions: HtmlOptions = { locale: "en-US" };
transformHtml("x", htmlOptions);
const markdownOptions: MarkdownOptions = { locale: "en-US", dialect: "commonmark" };
transformMarkdown("x", markdownOptions);
`,
  );
  await writeFile(
    path.join(consumerDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          lib: ["ES2022"],
          module: "nodenext",
          moduleResolution: "nodenext",
          strict: true,
          skipLibCheck: true,
          noEmit: true,
          types: [],
        },
        include: ["mts-consumer.mts", "cts-consumer.cts"],
      },
      null,
      2,
    ),
  );
  console.log("\n--- .mts/.cts declaration consumers (tsc, real installed package) ---");
  // Invokes this repo's own tsc binary as pure tooling — it compiles files that live entirely in
  // consumerDir and resolves "polytypo"/"polytypo/*" against consumerDir/node_modules, which is
  // what actually gets type-checked here; the compiler binary's own install location is
  // irrelevant to that resolution.
  run(TSC_BIN, ["-p", path.join(consumerDir, "tsconfig.json")], { cwd: consumerDir });
  console.log("packed-tarball .mts/.cts consumers: ok");

  // --- exact .d.ts vs .d.cts conditional selection, resolved against the real installed package -
  console.log("\n--- declaration-resolution resolver assertion (real installed package) ---");
  const ENTRIES = [
    { specifier: "polytypo", name: "index" },
    { specifier: "polytypo/text", name: "text" },
    { specifier: "polytypo/html", name: "html" },
    { specifier: "polytypo/markdown", name: "markdown" },
  ];
  const CASES = [
    {
      label: "import (.mts)",
      containingFile: mtsPath,
      resolutionMode: ts.ModuleKind.ESNext,
      expectedExt: ".d.ts",
    },
    {
      label: "require (.cts)",
      containingFile: ctsPath,
      resolutionMode: ts.ModuleKind.CommonJS,
      expectedExt: ".d.cts",
    },
  ];
  const compilerOptions = {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
  };
  const resolutionFailures = [];
  for (const entry of ENTRIES) {
    for (const testCase of CASES) {
      const result = ts.resolveModuleName(
        entry.specifier,
        testCase.containingFile,
        compilerOptions,
        ts.sys,
        undefined,
        undefined,
        testCase.resolutionMode,
      );
      const resolved = result.resolvedModule;
      if (!resolved) {
        resolutionFailures.push(`${entry.specifier} under ${testCase.label}: did not resolve`);
        continue;
      }
      const resolvedPath = resolved.resolvedFileName;
      const expectedFile = `node_modules/polytypo/dist/${entry.name}${testCase.expectedExt}`;
      if (
        !resolvedPath.endsWith(testCase.expectedExt) ||
        !resolvedPath.includes(`polytypo/dist/${entry.name}`)
      ) {
        resolutionFailures.push(
          `${entry.specifier} under ${testCase.label}: expected .../${expectedFile}, got ${resolvedPath}`,
        );
        continue;
      }
      console.log(
        `ok    ${entry.specifier.padEnd(20)} ${testCase.label.padEnd(16)} -> ${path.relative(consumerDir, resolvedPath)}`,
      );
    }
  }
  if (resolutionFailures.length > 0) {
    throw new Error(`declaration-resolution assertion failed:\n${resolutionFailures.join("\n")}`);
  }

  console.log("\npacked-tarball tests: all passed");
} catch (error) {
  failed = true;
  console.error("\npacked-tarball tests: FAILED");
  console.error(error instanceof Error ? error.message : error);
} finally {
  if (tmpRoot) {
    console.log(`\ncleaning up ${tmpRoot}...`);
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

if (failed) process.exit(1);
