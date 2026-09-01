#!/usr/bin/env node
// Resolver assertion for the exports map's condition-specific "types" fields
// (AUDIT_REMEDIATION_AND_RELEASE_PLAN.md 5.1 review, item 2). Compiling
// tests/packaging/mts-consumer.mts and cts-consumer.cts is necessary but not sufficient: TypeScript
// compiles successfully even when both the "import" and "require" conditions happen to resolve to
// the same wrong file (that was the exact bug — a flat top-level "types" always pointed at
// `.d.ts`, so a `require()` consumer type-checked fine against ESM-shaped declarations). This
// script uses the TypeScript compiler API directly — `ts.resolveModuleName` with an explicit
// resolution mode — to prove the *exact* declaration file selected for every public entry under
// both conditions, independent of whether a consumer file happens to compile.
import ts from "typescript";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const COMPILER_OPTIONS = {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ES2022,
};

const ENTRIES = [
  { specifier: "polytypo", name: "index" },
  { specifier: "polytypo/text", name: "text" },
  { specifier: "polytypo/html", name: "html" },
  { specifier: "polytypo/markdown", name: "markdown" },
];

// The containing file's own extension is what tells NodeNext resolution which condition
// ("import" vs "require") applies — this is the whole point of the assertion, so both must be
// exercised from a file that actually has the corresponding extension.
const CASES = [
  {
    label: "import (.mts)",
    containingFile: path.join(ROOT, "tests/packaging/mts-consumer.mts"),
    resolutionMode: ts.ModuleKind.ESNext,
    expectedExt: ".d.ts",
  },
  {
    label: "require (.cts)",
    containingFile: path.join(ROOT, "tests/packaging/cts-consumer.cts"),
    resolutionMode: ts.ModuleKind.CommonJS,
    expectedExt: ".d.cts",
  },
];

const host = ts.sys;
const failures = [];

for (const entry of ENTRIES) {
  for (const testCase of CASES) {
    const result = ts.resolveModuleName(
      entry.specifier,
      testCase.containingFile,
      COMPILER_OPTIONS,
      host,
      undefined,
      undefined,
      testCase.resolutionMode,
    );
    const resolved = result.resolvedModule;
    if (!resolved) {
      failures.push(`${entry.specifier} under ${testCase.label}: did not resolve at all`);
      continue;
    }
    const resolvedPath = resolved.resolvedFileName;
    const expectedFile = `dist/${entry.name}${testCase.expectedExt}`;
    if (!resolvedPath.endsWith(testCase.expectedExt) || !resolvedPath.includes(`/dist/${entry.name}`)) {
      failures.push(
        `${entry.specifier} under ${testCase.label}: expected .../${expectedFile}, got ${resolvedPath}`,
      );
      continue;
    }
    console.log(`ok    ${entry.specifier.padEnd(20)} ${testCase.label.padEnd(16)} -> ${path.relative(ROOT, resolvedPath)}`);
  }
}

if (failures.length > 0) {
  console.error("\ndeclaration-resolution assertion failed:\n");
  for (const failure of failures) console.error(`fail  ${failure}`);
  process.exit(1);
}

console.log("\ndeclaration-resolution assertion passed: every entry resolves to the correct .d.ts/.d.cts under its matching condition.");
