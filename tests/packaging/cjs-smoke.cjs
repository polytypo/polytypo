// CommonJS require smoke test — same coverage as esm-smoke.mjs, through require() instead of
// import, proving the "require" condition of every exports subpath resolves and works.
// Requires `npm run build` to have already produced dist/. Run via `npm run test:packaging`.
"use strict";
const assert = require("node:assert/strict");
const { PolytypoError, transform: transformAggregate } = require("polytypo");
const { PolytypoError: PolytypoErrorFromHtml, transform: transformHtml } = require("polytypo/html");
const {
  PolytypoError: PolytypoErrorFromMarkdown,
  transform: transformMarkdown,
} = require("polytypo/markdown");
const { PolytypoError: PolytypoErrorFromText, transform: transformText } = require("polytypo/text");

const locale = "en-US";

assert.equal(transformText("x...y", { locale }), "x…y");
assert.equal(transformText("x...y", { locale }), transformAggregate("x...y", { locale, mode: "text" }));

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

assert.equal(transformAggregate("x...y", { locale }), "x…y");
assert.equal(transformAggregate("<p>x...y</p>", { locale, mode: "html" }), "<p>x…y</p>");
assert.equal(
  transformAggregate("x...y", { locale, mode: "markdown", dialect: "commonmark" }),
  "x…y",
);

console.log("cjs-smoke: ok");
