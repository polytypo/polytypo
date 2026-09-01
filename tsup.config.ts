import { defineConfig } from "tsup";

// Four entries, one per package.json "exports" subpath (AUDIT_REMEDIATION_AND_RELEASE_PLAN.md
// 5.1). `splitting: true` makes tsup 8.5 share physical chunks of common engine/rule code across
// entries instead of inlining that code into each — a project-specific, verified fact for both
// generated output formats: `dist/*.js` (ESM) and `dist/*.cjs` (CJS) entries both `import`/
// `require` shared `chunk-*` files rather than duplicating their contents. This is not a claim
// about esbuild's or tsup's CJS code-splitting capability in general; it is what this exact
// project's build, at this configuration, produces right now — chunk filenames are content
// hashes and change on every source/output change, so no filename is pinned here. The dynamic
// proof is tests/packaging/chunk-sharing-smoke.mjs, which discovers each build's actual chunk
// filenames from the built output rather than hard-coding one, and fails if a future change
// regresses CJS output back to per-entry duplication. Chunk-sharing is a size optimisation, not
// what proves an entry excludes a forbidden parser dependency — that is
// scripts/check-entry-reach.mjs, which inspects the resolved module graph.
// Source-map policy (AUDIT_REMEDIATION_AND_RELEASE_PLAN.md 5.2, corrected on review):
// `sourcemap: true`, and the published npm package DOES include `dist/*.map` — package.json
// "files" is plain `["dist"]`, no `.map` negation. Publishing maps was chosen over omitting them:
//   - the earlier reasoning for omitting them claimed maps are "mainly useful for minified code"
//     and therefore low-value here since this build is unminified — that is not accurate. A
//     source map's job is mapping *emitted* JavaScript locations back to *original* locations,
//     and bundling/chunk-splitting (this config's `splitting: true`) already moves code across
//     file boundaries and reshuffles line numbers relative to the original per-rule/per-module
//     .ts sources regardless of minification; an unminified bundle still benefits from an
//     accurate "jump to source" and from stack traces/breakpoints resolving to the real .ts file
//     and line rather than a generated dist/chunk-*.js line;
//   - `sourcesContent` embedding the original .ts text is not a secrecy concern for an open-source
//     project whose source is already public on the canonical repository — the same fact that
//     previously argued for omission argues just as directly for inclusion, since there is
//     nothing left to protect by leaving maps out;
//   - the package is small: verified packed/unpacked sizes with and without maps are recorded in
//     this session's report rather than hard-coded here, since both change on every dependency or
//     tsup version bump — see scripts/check-package-contents.mjs's own size report and
//     scripts/bundle-size-baseline.json for the numbers this decision was actually checked
//     against, not an assumption.
// `treeshake: false` is required for maps to be correct, not merely a style preference: tsup 8.5,
// when `treeshake: true` is combined with `splitting: true`, routes output through an internal
// Rollup re-bundle pass whose own emitted code already carries a `//# sourceMappingURL=...`
// comment — and tsup's outer file-writer unconditionally appends *another* one on top
// (node_modules/tsup/dist/index.js, the `info.code + getSourcemapComment(...)` write path),
// producing two duplicate, identical comments per file (verified: `dist/index.js` had the
// `//# sourceMappingURL=index.js.map` line twice before this fix). Disabling `treeshake`
// bypasses that Rollup pass entirely, leaving tsup's own single comment as the only one. Verified
// empirically after the fix: chunk-sharing (splitting) and total dist/ size are both unaffected —
// `treeshake` here was only ever gating the extra Rollup pass, not meaningful dead-code removal at
// this project's scale. scripts/check-package-contents.mjs asserts exactly one
// `sourceMappingURL` per published .js/.cjs file, so a regression back to the duplicate-emission
// path fails the packaging check, not just this comment.
export default defineConfig({
  entry: {
    index: "src/index.ts",
    text: "src/index.text.ts",
    html: "src/index.html.ts",
    markdown: "src/index.markdown.ts",
  },
  format: ["esm", "cjs"],
  outExtension: ({ format }) => ({ js: format === "cjs" ? ".cjs" : ".js" }),
  target: "es2022",
  platform: "neutral",
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: false,
  splitting: true,
});
