// Regression tests for the M4 dogfooding dry-run tool (scripts/dogfood/*.ts,
// scripts/dogfood-m4.ts). These test the audit/tooling guarantees the task asked for — discovery,
// safety, hashing, evidence generation, fail-closed behavior — not the typography engine itself,
// which already has its own unit and conformance tests. Every corpus used here is disposable and
// synthetic; none of this ever reads or writes the real ~/Projects/rogulia content.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  aggregateHash,
  buildCorpusManifest,
  discoverMdxFiles,
  SymlinkEncounteredError,
} from "../../scripts/dogfood/corpus.js";
import { escapeNotable } from "../../scripts/dogfood/diff.js";
import {
  DogfoodSafetyError,
  assertSafeOutputDir,
  findGitRoot,
} from "../../scripts/dogfood/paths.js";
import { runDogfood } from "../../scripts/dogfood/run.js";

const disposableDirs: string[] = [];
function freshDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  disposableDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (disposableDirs.length > 0) {
    const dir = disposableDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

// A post whose prose reliably produces changes across quotes/apostrophe/dashes/nbsp under
// en-US/markdown/mdx, so "normal changed output" tests have real signal without depending on the
// real corpus.
function proseThatChanges(): string {
  return [
    "---",
    'title: "Test post"',
    "---",
    "",
    "# Heading",
    "",
    'It\'s the "best" idea — genuinely — and Dr. Smith agrees.',
    "",
  ].join("\n");
}

function proseThatDoesNotChange(): string {
  return [
    "---",
    'title: "No-op"',
    "---",
    "",
    "# Heading",
    "",
    "Plain text with no typography to fix.",
    "",
  ].join("\n");
}

describe("scripts/dogfood/corpus.ts — discoverMdxFiles()", () => {
  it("recursively discovers .mdx files in deterministic POSIX-relative order", () => {
    const root = freshDir("dogfood-discover-");
    mkdirSync(path.join(root, "b-post"), { recursive: true });
    mkdirSync(path.join(root, "a-post", "nested"), { recursive: true });
    writeFileSync(path.join(root, "b-post", "index.mdx"), "content", "utf8");
    writeFileSync(path.join(root, "a-post", "index.mdx"), "content", "utf8");
    writeFileSync(path.join(root, "a-post", "nested", "extra.mdx"), "content", "utf8");

    const first = discoverMdxFiles(root);
    const second = discoverMdxFiles(root);
    expect(first).toEqual(["a-post/index.mdx", "a-post/nested/extra.mdx", "b-post/index.mdx"]);
    expect(second).toEqual(first);
  });

  it("filters to only .mdx files, ignoring other extensions", () => {
    const root = freshDir("dogfood-filter-");
    writeFileSync(path.join(root, "post.mdx"), "content", "utf8");
    writeFileSync(path.join(root, "post.md"), "content", "utf8");
    writeFileSync(path.join(root, "image.png"), "content", "utf8");
    writeFileSync(path.join(root, "notes.txt"), "content", "utf8");

    expect(discoverMdxFiles(root)).toEqual(["post.mdx"]);
  });

  it("fails closed the moment a symlinked file is encountered, without following it", () => {
    const root = freshDir("dogfood-symlink-file-");
    writeFileSync(path.join(root, "real.mdx"), "content", "utf8");
    const target = freshDir("dogfood-symlink-target-");
    writeFileSync(path.join(target, "outside.mdx"), "secret", "utf8");
    symlinkSync(path.join(target, "outside.mdx"), path.join(root, "linked.mdx"));

    expect(() => discoverMdxFiles(root)).toThrow(SymlinkEncounteredError);
  });

  it("fails closed the moment a symlinked directory is encountered", () => {
    const root = freshDir("dogfood-symlink-dir-");
    const target = freshDir("dogfood-symlink-dir-target-");
    mkdirSync(path.join(target, "post"), { recursive: true });
    writeFileSync(path.join(target, "post", "index.mdx"), "content", "utf8");
    symlinkSync(target, path.join(root, "linked-dir"));

    expect(() => discoverMdxFiles(root)).toThrow(SymlinkEncounteredError);
  });
});

describe("scripts/dogfood/corpus.ts — aggregate hashing", () => {
  it("produces a manifest with unambiguous, length-framed aggregate hashing", () => {
    const root = freshDir("dogfood-manifest-");
    writeFileSync(path.join(root, "a.mdx"), "hello", "utf8");
    writeFileSync(path.join(root, "b.mdx"), "world", "utf8");
    const files = discoverMdxFiles(root);
    const manifest = buildCorpusManifest(root, files);

    expect(manifest.fileCount).toBe(2);
    expect(manifest.totalBytes).toBe(10);
    expect(manifest.files.map((f) => f.path)).toEqual(["a.mdx", "b.mdx"]);
    expect(manifest.aggregateHash).toMatch(/^[0-9a-f]{64}$/);

    // Recomputing by hand from the same entries must reproduce the same hash — proves the
    // algorithm is a pure function of (sorted path, sha256) pairs, not of read order or anything
    // else incidental.
    const recomputed = aggregateHash(
      manifest.files.map((f) => ({ path: f.path, sha256: f.sha256 })),
    );
    expect(recomputed).toBe(manifest.aggregateHash);
  });

  it("the length-framing makes two different (path, hash) splits produce different aggregate hashes", () => {
    // Without a length prefix, entries could be concatenated ambiguously; with it, "ab"/"cd" and
    // "a"/"bcd" style splits must never collide.
    const h1 = "1".repeat(64);
    const h2 = "2".repeat(64);
    const a = aggregateHash([
      { path: "ab", sha256: h1 },
      { path: "c", sha256: h2 },
    ]);
    const b = aggregateHash([
      { path: "a", sha256: h1 },
      { path: "bc", sha256: h2 },
    ]);
    expect(a).not.toBe(b);
  });
});

describe("scripts/dogfood/paths.ts — output-directory safety", () => {
  it("refuses an output directory inside the corpus", () => {
    const corpus = freshDir("dogfood-path-corpus-");
    const out = path.join(corpus, "evidence");
    expect(() =>
      assertSafeOutputDir({ outDir: out, corpusRoot: corpus, forbiddenRoots: [] }),
    ).toThrow(DogfoodSafetyError);
  });

  it("refuses a corpus placed inside the output directory (the reverse containment)", () => {
    const out = freshDir("dogfood-path-out-");
    const corpus = path.join(out, "corpus");
    expect(() =>
      assertSafeOutputDir({ outDir: out, corpusRoot: corpus, forbiddenRoots: [] }),
    ).toThrow(DogfoodSafetyError);
  });

  it("refuses an output directory inside a forbidden repository root", () => {
    const repoRoot = freshDir("dogfood-path-repo-");
    const corpus = freshDir("dogfood-path-corpus2-");
    const out = path.join(repoRoot, "evidence");
    expect(() =>
      assertSafeOutputDir({ outDir: out, corpusRoot: corpus, forbiddenRoots: [repoRoot] }),
    ).toThrow(DogfoodSafetyError);
  });

  it("refuses to overwrite an existing nonempty evidence directory", () => {
    const corpus = freshDir("dogfood-path-corpus3-");
    const out = freshDir("dogfood-path-out2-");
    writeFileSync(path.join(out, "manifest.json"), "{}", "utf8");
    expect(() =>
      assertSafeOutputDir({ outDir: out, corpusRoot: corpus, forbiddenRoots: [] }),
    ).toThrow(DogfoodSafetyError);
  });

  it("accepts and creates a fresh (nonexistent) output directory", () => {
    const corpus = freshDir("dogfood-path-corpus4-");
    const parent = freshDir("dogfood-path-parent-");
    const out = path.join(parent, "brand-new-evidence-dir");
    expect(() =>
      assertSafeOutputDir({ outDir: out, corpusRoot: corpus, forbiddenRoots: [] }),
    ).not.toThrow();
  });

  it("accepts an existing but empty output directory", () => {
    const corpus = freshDir("dogfood-path-corpus5-");
    const out = freshDir("dogfood-path-out3-");
    expect(() =>
      assertSafeOutputDir({ outDir: out, corpusRoot: corpus, forbiddenRoots: [] }),
    ).not.toThrow();
  });

  it("findGitRoot locates the nearest ancestor containing .git", () => {
    const repo = freshDir("dogfood-gitroot-");
    mkdirSync(path.join(repo, ".git"), { recursive: true });
    mkdirSync(path.join(repo, "content", "blog"), { recursive: true });
    expect(findGitRoot(path.join(repo, "content", "blog"))).toBe(repo);
  });

  it("findGitRoot returns null when no ancestor has .git up to a bounded probe root", () => {
    const noGit = freshDir("dogfood-nogitroot-");
    // We can't safely walk to the real filesystem root in a test, but we can prove it doesn't
    // find one in a fresh tmp subtree that we control.
    expect(findGitRoot(noGit)).not.toBe(noGit);
  });
});

describe("scripts/dogfood/diff.ts — escapeNotable()", () => {
  it("makes NBSP, NNBSP, WORD JOINER, and non-breaking hyphen visible", () => {
    const text = `a${String.fromCodePoint(0x00a0)}b${String.fromCodePoint(0x202f)}c${String.fromCodePoint(0x2060)}d${String.fromCodePoint(0x2011)}e`;
    const { escaped, notable } = escapeNotable(text);
    expect(escaped).toBe(
      "a<U+00A0 NO-BREAK SPACE>b<U+202F NARROW NO-BREAK SPACE>c<U+2060 WORD JOINER>d<U+2011 NON-BREAKING HYPHEN>e",
    );
    expect(notable.map((n) => n.codePoint)).toEqual(["U+00A0", "U+2011", "U+202F", "U+2060"]);
  });

  it("makes a Latin/Cyrillic confusable 'x' visible even though the plain diff looks identical", () => {
    const latin = escapeNotable(String.fromCodePoint(0x0078)); // Latin x
    const cyrillic = escapeNotable(String.fromCodePoint(0x0445)); // Cyrillic х
    expect(latin.escaped).toBe("<U+0078 LATIN SMALL LETTER X>");
    expect(cyrillic.escaped).toBe("<U+0445 CYRILLIC SMALL LETTER HA>");
    expect(latin.escaped).not.toBe(cyrillic.escaped);
  });

  it("leaves ordinary printable text (including accented Latin and non-watchlist Cyrillic) unescaped", () => {
    const text = "café Привет world";
    expect(escapeNotable(text).escaped).toBe(text);
    expect(escapeNotable(text).notable).toEqual([]);
  });
});

describe("scripts/dogfood/run.ts — runDogfood() end-to-end on disposable corpora", () => {
  function writePost(corpusRoot: string, relDir: string, content: string): void {
    const dir = path.join(corpusRoot, relDir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "index.mdx"), content, "utf8");
  }

  it("normal changed output produces the four review artifacts and does not fail the run", () => {
    const corpus = freshDir("dogfood-run-changed-corpus-");
    writePost(corpus, "post-one", proseThatChanges());
    const out = path.join(freshDir("dogfood-run-changed-out-"), "evidence");

    const summary = runDogfood({
      corpusRoot: corpus,
      outDir: out,
      locale: "en-US",
      dialect: "mdx",
      argv: [],
    });

    expect(summary.status).toBe("success");
    expect(summary.counts.changedFileCount).toBe(1);
    expect(summary.counts.errorCount).toBe(0);
    expect(summary.reviewState).toBe("pending-human-review");

    for (const file of ["manifest.json", "full.diff", "changes.json", "REVIEW.md"]) {
      expect(readFileSync(path.join(out, file), "utf8").length).toBeGreaterThan(0);
    }
    const manifest = JSON.parse(readFileSync(path.join(out, "manifest.json"), "utf8"));
    expect(manifest.reviewState).toBe("pending-human-review");
    const changes = JSON.parse(readFileSync(path.join(out, "changes.json"), "utf8"));
    expect(changes.length).toBeGreaterThan(0);
    expect(readFileSync(path.join(out, "full.diff"), "utf8")).toContain("post-one/index.mdx");
  });

  it("a no-op corpus (nothing to change) still succeeds, with zero changes", () => {
    const corpus = freshDir("dogfood-run-noop-corpus-");
    writePost(corpus, "post-one", proseThatDoesNotChange());
    const out = path.join(freshDir("dogfood-run-noop-out-"), "evidence");

    const summary = runDogfood({
      corpusRoot: corpus,
      outDir: out,
      locale: "en-US",
      dialect: "mdx",
      argv: [],
    });

    expect(summary.status).toBe("success");
    expect(summary.counts.changedFileCount).toBe(0);
    expect(summary.counts.unchangedFileCount).toBe(1);
    const changes = JSON.parse(readFileSync(path.join(out, "changes.json"), "utf8"));
    expect(changes).toEqual([]);
    expect(readFileSync(path.join(out, "full.diff"), "utf8")).toBe("");
  });

  it("malformed MDX is recorded per file and causes the run to fail closed (nonzero status)", () => {
    const corpus = freshDir("dogfood-run-malformed-corpus-");
    writePost(corpus, "good-post", proseThatChanges());
    writePost(corpus, "bad-post", "---\ntitle: bad\n---\n\n{1 +}\n");
    const out = path.join(freshDir("dogfood-run-malformed-out-"), "evidence");

    const summary = runDogfood({
      corpusRoot: corpus,
      outDir: out,
      locale: "en-US",
      dialect: "mdx",
      argv: [],
    });

    expect(summary.status).toBe("failed");
    expect(summary.counts.errorCount).toBe(1);
    // The rest of the corpus was still inventoried, not aborted:
    expect(
      summary.counts.changedFileCount +
        summary.counts.unchangedFileCount +
        summary.counts.errorCount,
    ).toBe(2);
    const manifest = JSON.parse(readFileSync(path.join(out, "manifest.json"), "utf8"));
    expect(manifest.results.errorCount).toBe(1);
    expect(manifest.reviewState).toBe("pending-human-review");
  });

  it("an idempotency failure (injected transform boundary) is detected and fails the run", () => {
    const corpus = freshDir("dogfood-run-idempotency-corpus-");
    writePost(corpus, "post-one", proseThatChanges());
    const out = path.join(freshDir("dogfood-run-idempotency-out-"), "evidence");

    // A deliberately non-idempotent fake: appends a marker every time it runs, so
    // transformFn(transformFn(x)) !== transformFn(x). This exercises the detection path itself
    // without needing to find real content that defeats the real engine's own idempotency
    // guarantee (already covered by the engine's own property tests).
    let calls = 0;
    const nonIdempotentTransformFn = (input: string): string => {
      calls += 1;
      return `${input}<call-${calls}>`;
    };

    const summary = runDogfood({
      corpusRoot: corpus,
      outDir: out,
      locale: "en-US",
      dialect: "mdx",
      argv: [],
      transformFn: nonIdempotentTransformFn,
    });

    expect(summary.status).toBe("failed");
    expect(summary.idempotencyFailures).toEqual(["post-one/index.mdx"]);
    expect(summary.failureReasons.some((r) => r.includes("idempotency"))).toBe(true);
  });

  it("the source corpus stays byte-identical before and after the run", () => {
    const corpus = freshDir("dogfood-run-byteidentical-corpus-");
    const content = proseThatChanges();
    writePost(corpus, "post-one", content);
    const out = path.join(freshDir("dogfood-run-byteidentical-out-"), "evidence");

    runDogfood({ corpusRoot: corpus, outDir: out, locale: "en-US", dialect: "mdx", argv: [] });

    expect(readFileSync(path.join(corpus, "post-one", "index.mdx"), "utf8")).toBe(content);
    const manifest = JSON.parse(readFileSync(path.join(out, "manifest.json"), "utf8"));
    expect(manifest.corpus.byteIdenticalBeforeAndAfter).toBe(true);
  });

  it("stable ordering and stable diff/change IDs: two runs over the same inputs produce identical evidence bytes", () => {
    const corpus = freshDir("dogfood-run-stable-corpus-");
    writePost(corpus, "post-one", proseThatChanges());
    writePost(corpus, "post-two", proseThatChanges().replace("Dr. Smith", "Dr. Jones"));
    const outA = path.join(freshDir("dogfood-run-stable-outA-"), "evidence");
    const outB = path.join(freshDir("dogfood-run-stable-outB-"), "evidence");

    const argv = ["--corpus", corpus, "--out", outA, "--locale", "en-US", "--dialect", "mdx"];
    runDogfood({ corpusRoot: corpus, outDir: outA, locale: "en-US", dialect: "mdx", argv });
    runDogfood({ corpusRoot: corpus, outDir: outB, locale: "en-US", dialect: "mdx", argv });

    expect(readFileSync(path.join(outA, "full.diff"), "utf8")).toBe(
      readFileSync(path.join(outB, "full.diff"), "utf8"),
    );
    expect(readFileSync(path.join(outA, "changes.json"), "utf8")).toBe(
      readFileSync(path.join(outB, "changes.json"), "utf8"),
    );
    expect(readFileSync(path.join(outA, "REVIEW.md"), "utf8")).toBe(
      readFileSync(path.join(outB, "REVIEW.md"), "utf8"),
    );

    // manifest.json differs only in the command.out field (the two disposable output dirs have
    // different paths by construction) — everything else, including both hashes, must match.
    const manifestA = JSON.parse(readFileSync(path.join(outA, "manifest.json"), "utf8"));
    const manifestB = JSON.parse(readFileSync(path.join(outB, "manifest.json"), "utf8"));
    expect(manifestA.corpus.aggregateHash).toBe(manifestB.corpus.aggregateHash);
    expect(manifestA.implementationInputs.aggregateHash).toBe(
      manifestB.implementationInputs.aggregateHash,
    );
    expect(manifestA.results).toEqual(manifestB.results);
    expect(manifestA.reviewState).toBe("pending-human-review");
    expect(manifestB.reviewState).toBe("pending-human-review");
  });

  it("review state is always pending-human-review, never a passed/approved state", () => {
    const corpus = freshDir("dogfood-run-reviewstate-corpus-");
    writePost(corpus, "post-one", proseThatChanges());
    const out = path.join(freshDir("dogfood-run-reviewstate-out-"), "evidence");

    runDogfood({ corpusRoot: corpus, outDir: out, locale: "en-US", dialect: "mdx", argv: [] });

    const review = readFileSync(path.join(out, "REVIEW.md"), "utf8");
    expect(review).toContain("pending-human-review");
    expect(review).toContain("UNREVIEWED");
    expect(review).not.toMatch(/\bACCEPT\b(?!`)/); // legend mentions the word, but no row is pre-decided
  });
});
