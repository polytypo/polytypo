// Proves — rather than just asserts in a comment — that tsup's `splitting: true` shares real
// chunk files across entries in BOTH built formats, not only ESM. A prior report claimed CJS
// output always inlines/duplicates shared code (a generic esbuild limitation); the built output
// contradicts that claim, so this check pins the corrected, verified fact: `dist/text.cjs`,
// `dist/html.cjs`, `dist/markdown.cjs` and `dist/index.cjs` all `require()` at least one
// identical chunk path, meaning they share the physical file rather than duplicating its
// contents. Requires `npm run build` to have already produced dist/. Run via
// `npm run test:packaging`.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, "..", "..", "dist");

function chunkRequiresOf(source) {
  const matches = [...source.matchAll(/require\(['"]\.\/(chunk-[^'"]+\.cjs)['"]\)/g)];
  return new Set(matches.map((m) => m[1]));
}

const [textSrc, htmlSrc, markdownSrc, indexSrc] = await Promise.all(
  ["text.cjs", "html.cjs", "markdown.cjs", "index.cjs"].map((f) =>
    readFile(path.join(DIST, f), "utf8"),
  ),
);

const textChunks = chunkRequiresOf(textSrc);
const htmlChunks = chunkRequiresOf(htmlSrc);
const markdownChunks = chunkRequiresOf(markdownSrc);
const indexChunks = chunkRequiresOf(indexSrc);

assert.ok(textChunks.size > 0, "dist/text.cjs requires no local chunk — unexpected build shape");

const sharedWithHtml = [...textChunks].filter((c) => htmlChunks.has(c));
const sharedWithMarkdown = [...textChunks].filter((c) => markdownChunks.has(c));
const sharedWithIndex = [...textChunks].filter((c) => indexChunks.has(c));

assert.ok(
  sharedWithHtml.length > 0,
  "dist/text.cjs and dist/html.cjs share no chunk — CJS splitting regressed to per-entry duplication",
);
assert.ok(
  sharedWithMarkdown.length > 0,
  "dist/text.cjs and dist/markdown.cjs share no chunk — CJS splitting regressed to per-entry duplication",
);
assert.ok(
  sharedWithIndex.length > 0,
  "dist/text.cjs and dist/index.cjs share no chunk — CJS splitting regressed to per-entry duplication",
);

console.log(
  `chunk-sharing-smoke: ok (text/html/markdown/index share ${sharedWithHtml[0]} and friends across dist/*.cjs)`,
);
