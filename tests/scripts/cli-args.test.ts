// Regression test for scripts/lib/cli-args.mjs's strict --tarball parsing (Stage 6 follow-up
// review, item 3): a mistyped flag, a duplicate flag, or a missing value must be reported as an
// error, never silently ignored or silently falling back to local build-and-pack mode.
import { describe, expect, it } from "vitest";
import { parseTarballArg } from "../../scripts/lib/cli-args.mjs";

describe("scripts/lib/cli-args.mjs — parseTarballArg()", () => {
  it("returns tarballPath: null for no arguments (local convenience mode)", () => {
    expect(parseTarballArg([])).toEqual({ tarballPath: null });
  });

  it("parses --tarball <path>", () => {
    expect(parseTarballArg(["--tarball", "/tmp/polytypo-0.1.0.tgz"])).toEqual({
      tarballPath: "/tmp/polytypo-0.1.0.tgz",
    });
  });

  it("rejects a missing --tarball value", () => {
    const result = parseTarballArg(["--tarball"]);
    expect(result.tarballPath).toBeUndefined();
    expect(result.error).toMatch(/requires a value/);
  });

  it("rejects a duplicate --tarball flag", () => {
    const result = parseTarballArg(["--tarball", "a.tgz", "--tarball", "b.tgz"]);
    expect(result.tarballPath).toBeUndefined();
    expect(result.error).toMatch(/duplicate/);
  });

  it("rejects an unknown argument", () => {
    const result = parseTarballArg(["--bogus"]);
    expect(result.tarballPath).toBeUndefined();
    expect(result.error).toMatch(/unknown argument/);
  });

  it("rejects an unknown argument even when it follows a valid --tarball <path>", () => {
    const result = parseTarballArg(["--tarball", "a.tgz", "--verbose"]);
    expect(result.tarballPath).toBeUndefined();
    expect(result.error).toMatch(/unknown argument/);
  });

  it("does not silently swallow a mistyped flag as a build-mode fallback", () => {
    // A caller who does `if (result.tarballPath) {...} else {...build mode...}` without checking
    // `result.error` first would silently run local build-and-pack for a mistyped flag — this
    // test exists so that misuse is caught here, not by re-deriving it at every call site.
    const result = parseTarballArg(["--tarbal", "a.tgz"]); // typo: "tarbal"
    expect(result.error).toBeDefined();
    expect(result.tarballPath).toBeUndefined();
  });
});
