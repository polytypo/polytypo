// Regression coverage for the Copy Link async race fix (Stage-8 final correction #3):
// history.replaceState (the address-bar fallback) must run SYNCHRONOUSLY before `await
// copyText(...)`, not after — otherwise the promised "link is in the address bar even if
// Clipboard fails" fallback isn't actually there yet while the Clipboard promise is pending, and
// a state edit made during that window could race the stale-fragment-invalidation logic from the
// previous pass.
//
// This behavior is inherently tied to DOM/history/clipboard timing (see the live browser test in
// this stage's report for the actual timing proof), so — per this project's existing precedent
// of testing generated output structure when pure extraction isn't practical (see
// tests/promo/generated-pages.test.ts) — this file asserts the SOURCE ORDER of the emitted
// inline script rather than re-simulating a browser event loop.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PLAYGROUND_PATH = path.join(ROOT, "promo", "playground.html");

function readPlayground(): string {
  if (!existsSync(PLAYGROUND_PATH)) {
    throw new Error(
      `${PLAYGROUND_PATH} does not exist — run "npm run generate:all" before running this test file.`,
    );
  }
  return readFileSync(PLAYGROUND_PATH, "utf8");
}

function copyLinkHandlerBody(html: string): string {
  const start = html.indexOf('$copyLink.addEventListener("click"');
  expect(start, "could not find the $copyLink click handler in promo/playground.html").toBeGreaterThan(-1);
  const nextHandler = html.indexOf("if (navigator.share)", start);
  expect(nextHandler, "could not find the end of the $copyLink handler").toBeGreaterThan(start);
  return html.slice(start, nextHandler);
}

describe("promo/playground.html — Copy Link address-bar update happens before awaiting Clipboard", () => {
  const html = readPlayground();
  const body = copyLinkHandlerBody(html);

  it("calls history.replaceState at least once inside the Copy Link handler", () => {
    expect(body).toContain("history.replaceState(null, \"\", url)");
  });

  it("places history.replaceState BEFORE `await copyText(url)`, not after", () => {
    const replaceStateIndex = body.indexOf("history.replaceState(null, \"\", url)");
    const awaitCopyIndex = body.indexOf("await copyText(url)");
    expect(replaceStateIndex).toBeGreaterThan(-1);
    expect(awaitCopyIndex).toBeGreaterThan(-1);
    expect(replaceStateIndex).toBeLessThan(awaitCopyIndex);
  });

  it("checks MAX_PERMALINK_LENGTH before the first history.replaceState call, not after", () => {
    const tooLongCheckIndex = body.indexOf("encoded.length > MAX_PERMALINK_LENGTH");
    const replaceStateIndex = body.indexOf("history.replaceState(null, \"\", url)");
    expect(tooLongCheckIndex).toBeGreaterThan(-1);
    expect(tooLongCheckIndex).toBeLessThan(replaceStateIndex);
  });

  it("does not call history.replaceState again after `await copyText(url)` resolves", () => {
    const awaitCopyIndex = body.indexOf("await copyText(url)");
    const afterAwait = body.slice(awaitCopyIndex + "await copyText(url)".length);
    expect(afterAwait).not.toContain("history.replaceState");
  });

  it("builds the copied/address-bar URL via buildPermalinkUrl, not string concatenation on location.origin", () => {
    // Excludes comment lines (this file's own explanatory comments legitimately mention the
    // string "location.origin + location.pathname" as the OLD, broken approach) — only real
    // code building a URL that way would be a regression.
    const codeLines = html
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(codeLines).not.toMatch(/location\.origin\s*\+/);
  });
});
