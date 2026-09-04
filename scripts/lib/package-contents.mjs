// Pure package-content assertion logic for scripts/check-package-contents.mjs, factored out so
// tests/scripts/package-contents.test.ts can exercise it against a fabricated tarball file list
// and package.json — no real build or `npm pack` needed for the unit tests themselves. Stage 6
// task 4 (AUDIT_REMEDIATION_AND_RELEASE_PLAN.md 5.2), extended per the Stage 6 follow-up review
// (source-map integrity) and made release-version agnostic (no opinion on what `pkg.version`
// should be — that policy belongs solely at the release workflow's tag-vs-version gate,
// scripts/lib/release-tag.mjs, never here; a structural tarball checker that also pinned a
// specific version would make every real release fail it by construction).
import { build } from "esbuild";

export const ENTRY_NAMES = ["index", "text", "html", "markdown"];

const ALLOWED_TOP_LEVEL = new Set(["package.json", "README.md", "LICENSE"]);
const FORBIDDEN_PREFIXES = [
  "src/",
  "tests/",
  "spec/",
  "promo/",
  "brand/",
  "docs/",
  "scripts/",
  ".claude/",
  ".github/",
  "node_modules/",
];

// Two successive hand-written regex designs for chunk-reference extraction both turned out to be
// textual guessing dressed up as precision, and both were eventually wrong in a way real esbuild
// output exposed: a line-start anchor happily matches an import-shaped line that is actually
// inside a multi-line template literal or an unadorned `/* ... */` block comment, because nothing
// about "this line starts with `import`" tells you whether that line is inside a string. There is
// no regex fix for that — it is a lexical-nesting question, which is exactly what a real parser
// tracks and a line matcher fundamentally cannot. esbuild is already a direct devDependency
// (Stage 6 task 2's build-tool audit), so this uses esbuild's own parser instead of adding a new
// one: `metafile.inputs[file].imports` is esbuild's own AST-derived list of every import/require
// this file's *code* actually contains — comments and string/template contents were never part of
// that AST to begin with, so they are excluded structurally, not by pattern-matching around them.
/**
 * @param {string} content - JS/CJS file content (either module format; esbuild detects it).
 * @param {string} sourceLabel - a stable name for esbuild diagnostics and for keying into
 *   `metafile.inputs` (e.g. "dist/index.js"); does not need to exist on disk.
 * @returns {Promise<string[]>} every relative `./chunk-*` path this file's parsed AST actually
 *   imports or requires (as `dist/chunk-*`, in source order) — covers static ESM import-from,
 *   side-effect import, re-export-from, and CommonJS `require()` (bound or standalone) uniformly,
 *   since esbuild reports all of them as import records regardless of syntactic shape.
 * @throws {Error} if esbuild cannot parse `content` at all (a real syntax error) — the caller
 *   turns this into an explicit package-content failure naming `sourceLabel`, never a silent skip.
 */
export async function extractChunkReferences(content, sourceLabel = "input.js") {
  const result = await build({
    stdin: {
      contents: content,
      loader: "js",
      sourcefile: sourceLabel,
    },
    bundle: true,
    write: false,
    metafile: true,
    platform: "node",
    format: "esm",
    // "*" marks every import specifier external — not just "./chunk-*". Real dist/chunk-*.js
    // files also contain genuine bare-specifier imports of this package's own production
    // dependencies (e.g. `import { parse } from "parse5"` — tsup's `platform: "neutral"` leaves
    // those unbundled by design, see src/modes/html.ts's dependency-reach contract). Externalizing
    // only "./chunk-*" would leave "parse5" for esbuild to actually resolve, which fails outright
    // with no real `resolveDir`/`node_modules` context from a bare `stdin` build — turning a
    // perfectly valid chunk file into a false "could not be parsed" failure. Marking everything
    // external means esbuild parses every import record (so they all show up in
    // `metafile.inputs`) without trying to resolve or read any of them from disk; only the
    // `./chunk-*`-prefixed records are filtered out below, exactly as intended.
    external: ["*"],
    logLevel: "silent",
  });
  const input = result.metafile.inputs[sourceLabel];
  if (!input) return [];
  return input.imports
    .filter((record) => record.path.startsWith("./chunk-"))
    .map((record) => `dist/${record.path.slice(2)}`);
}

// Real tsup output places every `//# sourceMappingURL=...` reference as the file's own trailing
// line(s) — never mid-file, never inside a string. Scanning strictly backward from the end of the
// file (not a whole-file regex) is what excludes a decoy string/template elsewhere in the file
// containing the same text: such a decoy is not among the file's actual trailing lines, so this
// scan never reaches it. This also still finds the original duplicate-emission bug (tsup once
// emitted this comment twice in a row at the end of every file — see tsup.config.ts's
// `treeshake: false` fix) exactly because that bug's second copy is *also* a trailing line.
const SOURCE_MAPPING_URL_LINE = /^\/\/# sourceMappingURL=(\S+)$/;

/** Every trailing `//# sourceMappingURL=...` line's raw target, in file order — deliberately not
 * deduplicated, so a file emitting the same reference twice in a row (the exact bug this exists
 * to catch) is visible as two entries, not one. Stops at the first non-matching line scanning
 * backward from the end of the file, so it reports only genuine trailing references. */
export function extractSourceMappingRefs(content) {
  const lines = content.split("\n");
  let end = lines.length;
  while (end > 0 && lines[end - 1] === "") end -= 1; // a single trailing blank line, if any

  const refs = [];
  let i = end - 1;
  while (i >= 0) {
    const match = lines[i].match(SOURCE_MAPPING_URL_LINE);
    if (!match) break;
    refs.unshift(match[1]);
    i -= 1;
  }
  return refs;
}

function collectExportTargets(node, out = []) {
  if (typeof node === "string") {
    out.push(node);
  } else if (node && typeof node === "object") {
    for (const value of Object.values(node)) collectExportTargets(value, out);
  }
  return out;
}

/**
 * @param {Set<string>} files - tarball entry paths, as reported by `npm pack --dry-run --json`
 *   or by listing a real tarball's contents.
 * @param {{version: string, exports: unknown}} pkg - parsed package.json. Only `pkg.exports` is
 *   read (to resolve every "exports" target and assert it exists in `files`); `pkg.version` is
 *   never read or asserted here — that policy belongs solely to the release workflow's
 *   tag-vs-version gate, scripts/lib/release-tag.mjs.
 * @param {(relativePath: string) => Promise<string | null>} readFileContent - returns the text
 *   content of a tarball-relative path (e.g. "dist/text.js"), or null if it cannot be read. The
 *   real checker reads from a real build or a real extracted tarball; tests supply a fabricated
 *   in-memory map.
 * @returns {Promise<string[]>} failure messages; empty means every assertion passed.
 */
export async function assertPackageContents(files, pkg, readFileContent) {
  const failures = [];
  const fail = (message) => failures.push(message);

  for (const required of ALLOWED_TOP_LEVEL) {
    if (!files.has(required)) fail(`${required} is missing from the tarball`);
  }

  for (const name of ENTRY_NAMES) {
    for (const suffix of ["js", "cjs", "d.ts", "d.cts"]) {
      const filePath = `dist/${name}.${suffix}`;
      if (!files.has(filePath)) fail(`${filePath} is missing from the tarball`);
    }
  }

  for (const file of files) {
    for (const prefix of FORBIDDEN_PREFIXES) {
      if (file.startsWith(prefix)) fail(`forbidden path leaked into the tarball: ${file}`);
    }
    const allowed = ALLOWED_TOP_LEVEL.has(file) || file.startsWith("dist/");
    if (!allowed) {
      fail(
        `unexpected top-level tarball entry, not one of package.json/README.md/LICENSE/dist/*: ${file}`,
      );
    }
  }

  const exportTargets = collectExportTargets(pkg.exports)
    .filter((target) => target.startsWith("./") && target !== "./package.json")
    .map((target) => target.slice(2));
  for (const target of exportTargets) {
    if (!files.has(target))
      fail(`package.json "exports" target "${target}" does not exist in the tarball`);
  }

  // --- chunk completeness and source-map integrity ---------------------------------------------
  // Every dist/*.js and dist/*.cjs in the tarball (entries and chunks alike, not just the four
  // named entries — a chunk can import another chunk too), read once, checked twice: every
  // relative "./chunk-*" reference esbuild's parser actually finds must exist, and the file must
  // carry exactly one trailing `sourceMappingURL` comment (this project's ship-maps policy — see
  // tsup.config.ts) referencing a map that is present in the tarball and parses as valid JSON.
  const jsAndCjsFiles = [...files].filter(
    (f) => f.startsWith("dist/") && (f.endsWith(".js") || f.endsWith(".cjs")),
  );
  for (const filePath of jsAndCjsFiles) {
    const content = await readFileContent(filePath);
    if (content == null) {
      // The file is listed in the tarball manifest but its content could not be read — a real
      // problem (extraction failure, permissions, a manifest that lies about what's actually on
      // disk), never something to pass over quietly. Silently skipping it here would mean this
      // assertion simply never runs for that file, which is indistinguishable from "checked and
      // clean" in the passing-test case — exactly the failure mode a content assertion exists to
      // prevent.
      fail(`${filePath} is listed in the tarball but its content could not be read`);
      continue;
    }

    // A real parse failure is also an explicit failure, not a silent skip or an uncaught throw:
    // it is caught here and reported by name, and the loop continues to check every other file
    // (and, further up the call stack, scripts/check-package-contents.mjs's own try/finally still
    // runs its temp-directory cleanup regardless of whether this function throws or returns).
    try {
      const chunkRefs = await extractChunkReferences(content, filePath);
      for (const chunkFile of chunkRefs) {
        if (!files.has(chunkFile)) {
          fail(`${filePath} references "${chunkFile}", which is missing from the tarball`);
        }
      }
    } catch (error) {
      fail(`${filePath} could not be parsed by esbuild: ${error.message}`);
    }

    const mapRefs = extractSourceMappingRefs(content);
    if (mapRefs.length === 0) {
      fail(
        `${filePath} has no "sourceMappingURL" comment — expected exactly one under this project's ship-maps policy`,
      );
    } else if (mapRefs.length > 1) {
      fail(
        `${filePath} has ${mapRefs.length} "sourceMappingURL" comments (${mapRefs.join(", ")}), expected exactly one`,
      );
    } else {
      const mapPath = `dist/${mapRefs[0]}`;
      if (!files.has(mapPath)) {
        fail(
          `${filePath} references source map "${mapRefs[0]}", which is missing from the tarball (dangling reference)`,
        );
      } else {
        const mapContent = await readFileContent(mapPath);
        if (mapContent == null) {
          fail(`${mapPath} (referenced by ${filePath}) could not be read`);
        } else {
          try {
            JSON.parse(mapContent);
          } catch (error) {
            fail(`${mapPath} (referenced by ${filePath}) is not valid JSON: ${error.message}`);
          }
        }
      }
    }
  }

  return failures;
}
