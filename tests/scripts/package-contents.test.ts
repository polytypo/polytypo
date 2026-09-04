// Exercises scripts/lib/package-contents.mjs's pure assertion logic against a fabricated tarball
// manifest — proving each individual assertion (missing top-level file, missing entry format,
// missing chunk, dangling/duplicate/missing source-map reference, invalid map JSON, forbidden
// path, unresolved exports target) can independently fail the check, that a clean manifest
// passes, and that the checker is release-version agnostic (Stage 6 follow-up review item 1: a
// structural tarball checker must not itself reject any particular version — that policy belongs
// solely to the release workflow's tag-vs-version gate, scripts/lib/release-tag.mjs). Permanent,
// checked-in replacement for one-off manual verification: runs on every `npm test`, needs no
// real build or `npm pack`, and cannot drift from the real checker because
// scripts/check-package-contents.mjs imports this exact same `assertPackageContents`.
import { describe, expect, it } from "vitest";
import {
  assertPackageContents,
  ENTRY_NAMES,
  extractChunkReferences,
  extractSourceMappingRefs,
} from "../../scripts/lib/package-contents.mjs";

function pkgWithVersion(version: string) {
  return {
    version,
    exports: {
      ".": {
        import: { types: "./dist/index.d.ts", default: "./dist/index.js" },
        require: { types: "./dist/index.d.cts", default: "./dist/index.cjs" },
      },
      "./text": {
        import: { types: "./dist/text.d.ts", default: "./dist/text.js" },
        require: { types: "./dist/text.d.cts", default: "./dist/text.cjs" },
      },
      "./html": {
        import: { types: "./dist/html.d.ts", default: "./dist/html.js" },
        require: { types: "./dist/html.d.cts", default: "./dist/html.cjs" },
      },
      "./markdown": {
        import: { types: "./dist/markdown.d.ts", default: "./dist/markdown.js" },
        require: { types: "./dist/markdown.d.cts", default: "./dist/markdown.cjs" },
      },
      "./package.json": "./package.json",
    },
  };
}

/** A clean, in-memory fake tarball: files map + matching readFileContent, with every dist/*.js
 * and dist/*.cjs carrying exactly one valid sourceMappingURL reference to a present, valid-JSON
 * map — the shape the real checker expects under this project's "ship maps" policy. */
function cleanTarball() {
  const content: Record<string, string> = {
    "package.json": "{}",
    "README.md": "# polytypo",
    LICENSE: "MIT",
  };
  for (const name of ENTRY_NAMES) {
    for (const ext of ["js", "cjs"]) {
      content[`dist/${name}.${ext}`] = `export {};\n//# sourceMappingURL=${name}.${ext}.map`;
      content[`dist/${name}.${ext}.map`] = JSON.stringify({ version: 3, sources: [] });
    }
    content[`dist/${name}.d.ts`] = "export {};";
    content[`dist/${name}.d.cts`] = "export {};";
  }
  const files = new Set(Object.keys(content));
  const readFileContent = async (relativePath: string) => content[relativePath] ?? null;
  return { files, content, readFileContent };
}

describe("scripts/lib/package-contents.mjs — assertPackageContents()", () => {
  it("passes a clean, fully-mapped manifest", async () => {
    const { files, readFileContent } = cleanTarball();
    const failures = await assertPackageContents(files, pkgWithVersion("0.0.0"), readFileContent);
    expect(failures).toEqual([]);
  });

  it("is release-version agnostic: accepts the placeholder 0.0.0", async () => {
    const { files, readFileContent } = cleanTarball();
    const failures = await assertPackageContents(files, pkgWithVersion("0.0.0"), readFileContent);
    expect(failures).toEqual([]);
  });

  it("is release-version agnostic: accepts a representative real version (0.1.0)", async () => {
    const { files, readFileContent } = cleanTarball();
    const failures = await assertPackageContents(files, pkgWithVersion("0.1.0"), readFileContent);
    expect(failures).toEqual([]);
  });

  it("is release-version agnostic: accepts other real-looking versions too", async () => {
    const { files, readFileContent } = cleanTarball();
    for (const version of ["1.0.0", "2.3.4", "0.0.1"]) {
      const failures = await assertPackageContents(files, pkgWithVersion(version), readFileContent);
      expect(failures).toEqual([]);
    }
  });

  for (const required of ["package.json", "README.md", "LICENSE"]) {
    it(`fails when top-level ${required} is missing`, async () => {
      const { files, readFileContent } = cleanTarball();
      files.delete(required);
      const failures = await assertPackageContents(files, pkgWithVersion("0.0.0"), readFileContent);
      expect(failures.some((f) => f.includes(required))).toBe(true);
    });
  }

  for (const name of ENTRY_NAMES) {
    for (const suffix of ["js", "cjs", "d.ts", "d.cts"]) {
      it(`fails when dist/${name}.${suffix} is missing`, async () => {
        const { files, readFileContent } = cleanTarball();
        files.delete(`dist/${name}.${suffix}`);
        const failures = await assertPackageContents(
          files,
          pkgWithVersion("0.0.0"),
          readFileContent,
        );
        expect(failures.some((f) => f.includes(`dist/${name}.${suffix}`))).toBe(true);
      });
    }
  }

  it("fails when an entry references a chunk that is not in the tarball", async () => {
    const { files, content, readFileContent } = cleanTarball();
    content["dist/html.cjs"] = `require('./chunk-MISSING.cjs');\n//# sourceMappingURL=html.cjs.map`;
    const failures = await assertPackageContents(files, pkgWithVersion("0.0.0"), readFileContent);
    expect(failures.some((f) => f.includes("chunk-MISSING.cjs"))).toBe(true);
  });

  it("fails when a missing chunk is referenced ONLY via a side-effect import", async () => {
    const { files, content, readFileContent } = cleanTarball();
    content["dist/index.js"] =
      `import "./chunk-MISSING-SIDE-EFFECT.js";\n//# sourceMappingURL=index.js.map`;
    const failures = await assertPackageContents(files, pkgWithVersion("0.0.0"), readFileContent);
    expect(failures.some((f) => f.includes("chunk-MISSING-SIDE-EFFECT.js"))).toBe(true);
  });

  it("fails when a genuinely missing chunk is referenced via the real build's wrapped import shape", async () => {
    const { files, content, readFileContent } = cleanTarball();
    content["dist/index.js"] = [
      "import {",
      "  someBinding",
      '} from "./chunk-MISSING-WRAPPED.js";',
      "//# sourceMappingURL=index.js.map",
    ].join("\n");
    const failures = await assertPackageContents(files, pkgWithVersion("0.0.0"), readFileContent);
    expect(failures.some((f) => f.includes("chunk-MISSING-WRAPPED.js"))).toBe(true);
  });

  it("fails when a file cannot be parsed by esbuild at all — an explicit failure, not a throw or a silent skip", async () => {
    const { files, content, readFileContent } = cleanTarball();
    content["dist/text.js"] = "this is not { valid javascript at all !!!";
    const failures = await assertPackageContents(files, pkgWithVersion("0.0.0"), readFileContent);
    expect(
      failures.some((f) => f.includes("dist/text.js") && f.includes("could not be parsed")),
    ).toBe(true);
  });

  it("fails when a forbidden workspace path leaks into the tarball", async () => {
    for (const leaked of [
      "src/index.ts",
      "tests/engine/foo.test.ts",
      "spec/locales/en-US.json",
      "brand/BRANDBOOK.html",
      "promo/index.html",
      ".github/workflows/ci.yml",
    ]) {
      const { files, readFileContent } = cleanTarball();
      files.add(leaked);
      const failures = await assertPackageContents(files, pkgWithVersion("0.0.0"), readFileContent);
      expect(failures.some((f) => f.includes(leaked))).toBe(true);
    }
  });

  it("fails when an unexpected top-level entry appears outside dist/", async () => {
    const { files, readFileContent } = cleanTarball();
    files.add("CHANGELOG.md");
    const failures = await assertPackageContents(files, pkgWithVersion("0.0.0"), readFileContent);
    expect(failures.some((f) => f.includes("CHANGELOG.md"))).toBe(true);
  });

  it("fails when an exports map target does not exist in the tarball", async () => {
    const { files, readFileContent } = cleanTarball();
    files.delete("dist/markdown.d.cts");
    const failures = await assertPackageContents(files, pkgWithVersion("0.0.0"), readFileContent);
    expect(failures.some((f) => f.includes("dist/markdown.d.cts"))).toBe(true);
  });

  describe("source-map integrity (ship-maps policy)", () => {
    it("fails when a JS/CJS file has no sourceMappingURL comment at all", async () => {
      const { files, content, readFileContent } = cleanTarball();
      content["dist/text.js"] = "export {};"; // no comment
      const failures = await assertPackageContents(files, pkgWithVersion("0.0.0"), readFileContent);
      expect(failures.some((f) => f.includes("dist/text.js") && f.includes("no"))).toBe(true);
    });

    it("fails when a JS/CJS file has two sourceMappingURL comments (the duplicate-emission bug)", async () => {
      const { files, content, readFileContent } = cleanTarball();
      content["dist/index.js"] =
        "export {};\n//# sourceMappingURL=index.js.map\n//# sourceMappingURL=index.js.map";
      const failures = await assertPackageContents(files, pkgWithVersion("0.0.0"), readFileContent);
      expect(failures.some((f) => f.includes("dist/index.js") && f.includes("2"))).toBe(true);
    });

    it("fails when a sourceMappingURL reference is dangling (map not in the tarball)", async () => {
      const { files, readFileContent } = cleanTarball();
      files.delete("dist/html.js.map");
      const failures = await assertPackageContents(files, pkgWithVersion("0.0.0"), readFileContent);
      expect(failures.some((f) => f.includes("dist/html.js") && f.includes("dangling"))).toBe(true);
    });

    it("fails when a referenced map is not valid JSON", async () => {
      const { files, content, readFileContent } = cleanTarball();
      content["dist/markdown.cjs.map"] = "{ not valid json";
      const failures = await assertPackageContents(files, pkgWithVersion("0.0.0"), readFileContent);
      expect(
        failures.some((f) => f.includes("dist/markdown.cjs.map") && f.includes("valid JSON")),
      ).toBe(true);
    });

    it("checks chunk files, not just the four named entries", async () => {
      const { files, content, readFileContent } = cleanTarball();
      files.add("dist/chunk-AAAAAAAA.js");
      content["dist/chunk-AAAAAAAA.js"] = "export {};"; // no sourceMappingURL
      const failures = await assertPackageContents(files, pkgWithVersion("0.0.0"), readFileContent);
      expect(failures.some((f) => f.includes("dist/chunk-AAAAAAAA.js"))).toBe(true);
    });

    it("does not confuse a sourceMappingURL-like string elsewhere in the file with a real trailing reference", async () => {
      const { files, content, readFileContent } = cleanTarball();
      content["dist/text.js"] = [
        'const decoy = "//# sourceMappingURL=fake.js.map";',
        "export {};",
        "//# sourceMappingURL=text.js.map",
      ].join("\n");
      const failures = await assertPackageContents(files, pkgWithVersion("0.0.0"), readFileContent);
      // Exactly one genuine trailing reference — the decoy mid-file string must not be counted
      // as a second one (which would otherwise trip the duplicate-emission failure).
      expect(failures.some((f) => f.includes("dist/text.js"))).toBe(false);
    });
  });

  describe("strict reading: a listed file whose content cannot be read is a failure, never silently skipped", () => {
    it("fails when readFileContent returns null for a file present in the manifest Set", async () => {
      const { files, readFileContent } = cleanTarball();
      const flaky = async (relativePath: string) =>
        relativePath === "dist/text.js" ? null : readFileContent(relativePath);
      const failures = await assertPackageContents(files, pkgWithVersion("0.0.0"), flaky);
      expect(
        failures.some((f) => f.includes("dist/text.js") && f.includes("could not be read")),
      ).toBe(true);
    });
  });
});

describe("scripts/lib/package-contents.mjs — extractChunkReferences() (esbuild-parser-backed)", () => {
  // Every form verified against this build's real dist/ output (Stage 6 follow-up review):
  // esbuild's own parser reports these as import records via metafile.inputs, so comments and
  // string/template contents are excluded structurally — they were never part of the AST these
  // records come from, not filtered out by pattern-matching around them.
  it('matches a named import: import { x } from "./chunk-A.js"', async () => {
    expect(await extractChunkReferences('import { x } from "./chunk-A.js";')).toEqual([
      "dist/chunk-A.js",
    ]);
  });

  it("matches a named import, single-quoted", async () => {
    expect(await extractChunkReferences("import { x } from './chunk-A.js';")).toEqual([
      "dist/chunk-A.js",
    ]);
  });

  it('matches a re-export: export { x } from "./chunk-B.js"', async () => {
    expect(await extractChunkReferences('export { x } from "./chunk-B.js";')).toEqual([
      "dist/chunk-B.js",
    ]);
  });

  it('matches a re-export-all: export * from "./chunk-B.js"', async () => {
    expect(await extractChunkReferences('export * from "./chunk-B.js";')).toEqual([
      "dist/chunk-B.js",
    ]);
  });

  it("matches a CommonJS require, bound to a variable, double-quoted", async () => {
    expect(await extractChunkReferences('var x = require("./chunk-C.cjs");')).toEqual([
      "dist/chunk-C.cjs",
    ]);
  });

  it("matches a CommonJS require, bound to a variable, single-quoted", async () => {
    expect(await extractChunkReferences("var x = require('./chunk-C.cjs');")).toEqual([
      "dist/chunk-C.cjs",
    ]);
  });

  it("matches a standalone (side-effect) CommonJS require", async () => {
    expect(await extractChunkReferences("require('./chunk-C.cjs');")).toEqual(["dist/chunk-C.cjs"]);
  });

  it("matches a bare ESM side-effect import, double-quoted", async () => {
    expect(await extractChunkReferences('import "./chunk-D.js";')).toEqual(["dist/chunk-D.js"]);
  });

  it("matches a bare ESM side-effect import, single-quoted", async () => {
    expect(await extractChunkReferences("import './chunk-D.js';")).toEqual(["dist/chunk-D.js"]);
  });

  it('matches this build\'s real wrapped ESM shape: import {\\n  x\\n} from "./chunk-*";', async () => {
    const content = ["import {", "  runHtmlPipeline", '} from "./chunk-A.js";'].join("\n");
    expect(await extractChunkReferences(content)).toEqual(["dist/chunk-A.js"]);
  });

  it("matches a wrapped import with multiple bindings", async () => {
    const content = ["import {", "  a,", "  b", '} from "./chunk-B.js";'].join("\n");
    expect(await extractChunkReferences(content)).toEqual(["dist/chunk-B.js"]);
  });

  it("matches a bare-specifier import to an external package alongside a chunk import, keeping only the chunk", async () => {
    const content = [
      'import { parse } from "parse5";',
      'import { runHtmlPipeline } from "./chunk-A.js";',
    ].join("\n");
    expect(await extractChunkReferences(content)).toEqual(["dist/chunk-A.js"]);
  });

  it("matches every reference in a realistic multi-import file, exactly once each, in order", async () => {
    const content = [
      "import {",
      "  runHtmlPipeline",
      '} from "./chunk-THTKPESX.js";',
      'import "./chunk-KMYENGNP.js";',
      'export { PolytypoError } from "./chunk-LTLYN67P.js";',
      "var chunk = require('./chunk-CJS1.cjs');",
    ].join("\n");
    expect(await extractChunkReferences(content)).toEqual([
      "dist/chunk-THTKPESX.js",
      "dist/chunk-KMYENGNP.js",
      "dist/chunk-LTLYN67P.js",
      "dist/chunk-CJS1.cjs",
    ]);
  });

  it("returns an empty array for content with no chunk references at all", async () => {
    expect(await extractChunkReferences("export function transform(x) { return x; }")).toEqual([]);
  });

  it("throws on genuinely unparseable content, naming the source label in the error", async () => {
    await expect(
      extractChunkReferences("this is not { valid javascript at all !!!", "dist/broken.js"),
    ).rejects.toThrow(/dist\/broken\.js/);
  });

  describe("deceptive decoys that a line-anchored regex could not exclude, but a real parser does", () => {
    it("ignores a single-line commented-out side-effect import", async () => {
      expect(await extractChunkReferences('// import "./chunk-NOTREAL.js";')).toEqual([]);
    });

    it("ignores a multiline block comment whose inner line begins with 'import'", async () => {
      const content = ["/*", 'import "./chunk-NOTREAL.js";', "*/"].join("\n");
      expect(await extractChunkReferences(content)).toEqual([]);
    });

    it("ignores a multiline block comment whose inner line begins with '} from'", async () => {
      const content = ["/*", "import {", "  x", '} from "./chunk-NOTREAL.js";', "*/"].join("\n");
      expect(await extractChunkReferences(content)).toEqual([]);
    });

    it("ignores a multiline template literal whose inner line is a complete, convincing import statement", async () => {
      const content = ["const example = `", 'import "./chunk-NOTREAL.js";', "`;"].join("\n");
      expect(await extractChunkReferences(content)).toEqual([]);
    });

    it("ignores a require(...) call embedded inside a string literal", async () => {
      const content = `const warning = 'Do not hand-write: require("./chunk-NOTREAL.cjs")';`;
      expect(await extractChunkReferences(content)).toEqual([]);
    });

    it("ignores a require(...) call embedded inside a single-line template literal", async () => {
      const content = 'const warning = `Do not hand-write: require("./chunk-NOTREAL.cjs")`;';
      expect(await extractChunkReferences(content)).toEqual([]);
    });

    it("ignores prose containing a convincing 'from \"./chunk-*\"' clause inside a line comment", async () => {
      expect(
        await extractChunkReferences(
          '// this behavior comes from "./chunk-NOTREAL.js" historically',
        ),
      ).toEqual([]);
    });

    it("still finds the real reference alongside a decoy of every kind in the same file", async () => {
      const content = [
        '// import "./chunk-NOTREAL.js";',
        `const warning = 'require("./chunk-ALSO-NOTREAL.cjs")';`,
        "const example = `",
        'import "./chunk-TEMPLATE-NOTREAL.js";',
        "`;",
        "/*",
        '} from "./chunk-COMMENT-NOTREAL.js";',
        "*/",
        "import {",
        "  realBinding",
        '} from "./chunk-REAL.js";',
      ].join("\n");
      expect(await extractChunkReferences(content)).toEqual(["dist/chunk-REAL.js"]);
    });
  });
});

describe("scripts/lib/package-contents.mjs — extractSourceMappingRefs() (trailing-line scan)", () => {
  it("finds a single trailing reference", () => {
    const content = "export {};\n//# sourceMappingURL=index.js.map";
    expect(extractSourceMappingRefs(content)).toEqual(["index.js.map"]);
  });

  it("finds two trailing references — the original duplicate-emission bug", () => {
    const content =
      "export {};\n//# sourceMappingURL=index.js.map\n//# sourceMappingURL=index.js.map";
    expect(extractSourceMappingRefs(content)).toEqual(["index.js.map", "index.js.map"]);
  });

  it("finds zero references when there is no trailing comment at all", () => {
    expect(extractSourceMappingRefs("export {};")).toEqual([]);
  });

  it("tolerates a single trailing blank line after the comment", () => {
    const content = "export {};\n//# sourceMappingURL=index.js.map\n";
    expect(extractSourceMappingRefs(content)).toEqual(["index.js.map"]);
  });

  it("does not count a sourceMappingURL-shaped string that is not among the file's trailing lines", () => {
    const content = [
      'const decoy = "//# sourceMappingURL=fake.js.map";',
      "export {};",
      "//# sourceMappingURL=real.js.map",
    ].join("\n");
    expect(extractSourceMappingRefs(content)).toEqual(["real.js.map"]);
  });

  it("does not count a sourceMappingURL-shaped line inside a template literal, even as the file's last content line", () => {
    const content = ["export {};", "const s = `", "//# sourceMappingURL=fake.js.map", "`;"].join(
      "\n",
    );
    // The template literal's inner line IS the last *line* of the file, but it is not a real
    // trailing comment — this scan does not understand string/template nesting (only
    // extractChunkReferences, which is esbuild-parser-backed, does); documented as a known scope
    // boundary. Real tsup output never places a sourceMappingURL comment anywhere but as the
    // file's true last line, so this does not arise in practice — the assertion here is that a
    // *missing* real trailing reference is still correctly reported (zero found), not that this
    // decoy is silently accepted as valid.
    expect(extractSourceMappingRefs(content)).toEqual([]);
  });
});
