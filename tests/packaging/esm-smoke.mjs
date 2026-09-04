// ESM import smoke test — imports every public entry point through its published package path
// ("polytypo", "polytypo/text", "polytypo/html", "polytypo/markdown"), relying on Node's
// self-reference resolution (a package can import itself by name via its own `exports` map).
// Requires `npm run build` to have already produced dist/. Run via `npm run test:packaging`.
import assert from "node:assert/strict";
import { PolytypoError, transform as transformAggregate } from "polytypo";
import { PolytypoError as PolytypoErrorFromHtml, transform as transformHtml } from "polytypo/html";
import {
  PolytypoError as PolytypoErrorFromMarkdown,
  transform as transformMarkdown,
} from "polytypo/markdown";
import { PolytypoError as PolytypoErrorFromText, transform as transformText } from "polytypo/text";

const locale = "en-US";

// One real transformation through each entry point, each checked against the aggregate entry.
assert.equal(transformText("x...y", { locale }), "x…y");
assert.equal(
  transformText("x...y", { locale }),
  transformAggregate("x...y", { locale, mode: "text" }),
);

assert.equal(transformHtml("<p>x...y</p>", { locale }), "<p>x…y</p>");
assert.equal(
  transformHtml("<p>x...y</p>", { locale }),
  transformAggregate("<p>x...y</p>", { locale, mode: "html" }),
);

assert.equal(transformMarkdown("x...y", { locale, dialect: "commonmark" }), "x…y");
assert.equal(transformMarkdown("x...y", { locale, dialect: "mdx" }), "x…y");
assert.equal(
  transformMarkdown("x...y", { locale, dialect: "commonmark" }),
  transformAggregate("x...y", { locale, mode: "markdown", dialect: "commonmark" }),
);

// Every subpath's PolytypoError re-export is the same class as the aggregate's — no duplicate
// class definitions leaking out of separate bundle chunks.
assert.equal(PolytypoErrorFromText, PolytypoError);
assert.equal(PolytypoErrorFromHtml, PolytypoError);
assert.equal(PolytypoErrorFromMarkdown, PolytypoError);

// Each fixed-mode entry rejects an explicit conflicting `mode` rather than silently ignoring it.
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

// Aggregate entry still exercises all three modes.
assert.equal(transformAggregate("x...y", { locale }), "x…y");
assert.equal(transformAggregate("<p>x...y</p>", { locale, mode: "html" }), "<p>x…y</p>");
assert.equal(
  transformAggregate("x...y", { locale, mode: "markdown", dialect: "commonmark" }),
  "x…y",
);

console.log("esm-smoke: ok");
