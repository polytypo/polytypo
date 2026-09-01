#!/usr/bin/env node
// Orchestrates the packaging smoke tests: TypeScript declaration consumer checks (bundler-mode
// literal-restriction check, plus separate .mts/.cts nodenext consumers), ESM import smoke test,
// CommonJS require smoke test, CJS chunk-sharing smoke test, and the declaration-resolution
// resolver assertion — all importing through the published package path ("polytypo",
// "polytypo/text", "polytypo/html", "polytypo/markdown"), never a relative src/ path. Assumes
// dist/ is already built (npm run test:packaging runs `npm run build` first).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

const steps = [
  {
    name: "TypeScript declaration consumer, bundler mode (tsc -p tests/packaging/tsconfig.json)",
    command: "npx",
    args: ["tsc", "-p", path.join(HERE, "tsconfig.json")],
  },
  {
    name: "TypeScript .mts/.cts declaration consumers, nodenext mode (tsc -p tests/packaging/tsconfig.nodenext.json)",
    command: "npx",
    args: ["tsc", "-p", path.join(HERE, "tsconfig.nodenext.json")],
  },
  {
    name: "Declaration-resolution resolver assertion",
    command: process.execPath,
    args: [path.join(ROOT, "scripts", "check-declaration-resolution.mjs")],
  },
  {
    name: "ESM import smoke test",
    command: process.execPath,
    args: [path.join(HERE, "esm-smoke.mjs")],
  },
  {
    name: "CommonJS require smoke test",
    command: process.execPath,
    args: [path.join(HERE, "cjs-smoke.cjs")],
  },
  {
    name: "CJS chunk-sharing smoke test",
    command: process.execPath,
    args: [path.join(HERE, "chunk-sharing-smoke.mjs")],
  },
];

let failed = false;
for (const step of steps) {
  console.log(`\n--- ${step.name} ---`);
  const result = spawnSync(step.command, step.args, { cwd: ROOT, stdio: "inherit" });
  if (result.status !== 0) {
    failed = true;
    console.error(`FAILED: ${step.name}`);
  }
}

if (failed) {
  console.error("\npackaging smoke tests: FAILED");
  process.exit(1);
}
console.log("\npackaging smoke tests: all passed");
