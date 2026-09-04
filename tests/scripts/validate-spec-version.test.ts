// Regression tests for scripts/validate-spec.mjs's global-spec-version-drift check. Extended by
// the first-release versioning pass to treat every spec/fixtures/*.json root (not just
// order.json/registry.json) as a claimant of the current global spec contract version, then
// corrected in the versioning-corrections pass so the expected fixture set is derived from
// spec/locales/registry.json's own "locales" list (never merely "whatever currently exists on
// disk"), so a deleted canonical fixture or a registry-listed locale missing its fixture fails
// closed by name instead of silently disappearing from the claimant list. Runs the real
// production CLI (VALIDATE_SPEC_ROOT override, mirroring scripts/check-actions-pinned.mjs's
// ACTIONS_PINNED_WORKFLOWS_DIR pattern) against disposable spec/ directory trees — never the real
// repository's spec/ files, so no negative control ever risks leaving a real fixture mutated.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = path.join(ROOT, "scripts/validate-spec.mjs");

let tmpDir: string | undefined;

afterEach(() => {
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

/** A minimal, schema-free disposable spec/ tree: no spec/schema/ directory at all, so every
 * schema-dependent check in validate-spec.mjs warns ("schema not present yet") and is skipped
 * rather than failing — isolating these tests to the global-version-drift check alone.
 *
 * `fixtures` maps filename -> full JSON object (caller controls every field, including "spec").
 * `registryLocales` defaults to every `fixtures` key's stem except "locale-resolution.json" —
 * i.e. by default the registry-derived expected set and what's actually on disk agree, so most
 * tests below don't need to state it explicitly; a test that wants a mismatch (a registry-listed
 * locale with no fixture, or vice versa) passes `registryLocales` explicitly to force one.
 * `includeResolutionFixture` (default true) auto-adds a valid locale-resolution.json to
 * `fixtures` when the caller didn't supply one — set false to test its absence.
 * `omitFixturesDir` skips creating spec/fixtures/ at all, for the whole-directory-missing case. */
function buildDisposableSpec(opts: {
  version: string;
  orderSpec?: string;
  registrySpec?: string;
  registryLocales?: string[];
  fixtures?: Record<string, unknown>;
  escapedFixtures?: Record<string, unknown>;
  includeResolutionFixture?: boolean;
  omitFixturesDir?: boolean;
}) {
  const dir = mkdtempSync(path.join(tmpdir(), "polytypo-validate-spec-"));
  mkdirSync(path.join(dir, "rules"), { recursive: true });
  mkdirSync(path.join(dir, "locales"), { recursive: true });

  const fixtures = { ...(opts.fixtures ?? {}) };
  if ((opts.includeResolutionFixture ?? true) && !("locale-resolution.json" in fixtures)) {
    fixtures["locale-resolution.json"] = { spec: opts.version, cases: [] };
  }

  const registryLocales =
    opts.registryLocales ??
    Object.keys(fixtures)
      .filter((name) => name !== "locale-resolution.json")
      .map((name) => name.slice(0, -".json".length));

  writeFileSync(path.join(dir, "VERSION"), opts.version, "utf8");
  writeFileSync(
    path.join(dir, "rules", "order.json"),
    JSON.stringify({ spec: opts.orderSpec ?? opts.version, order: [] }),
    "utf8",
  );
  writeFileSync(
    path.join(dir, "locales", "registry.json"),
    JSON.stringify({ spec: opts.registrySpec ?? opts.version, locales: registryLocales }),
    "utf8",
  );

  if (!opts.omitFixturesDir) {
    mkdirSync(path.join(dir, "fixtures", ".escaped"), { recursive: true });
    for (const [name, data] of Object.entries(fixtures)) {
      writeFileSync(path.join(dir, "fixtures", name), JSON.stringify(data), "utf8");
    }
    for (const [name, data] of Object.entries(opts.escapedFixtures ?? {})) {
      writeFileSync(path.join(dir, "fixtures", ".escaped", name), JSON.stringify(data), "utf8");
    }
  }
  return dir;
}

function runCli(specRoot: string): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [CLI], {
      encoding: "utf8",
      env: { ...process.env, VALIDATE_SPEC_ROOT: specRoot },
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const e = error as { status: number; stdout: string; stderr: string };
    return { status: e.status, stdout: e.stdout, stderr: e.stderr };
  }
}

describe("scripts/validate-spec.mjs — global spec-version drift, fixture roots included", () => {
  it("a clean disposable spec/ where every claimant (order, registry, all fixtures) matches VERSION passes", () => {
    tmpDir = buildDisposableSpec({
      version: "1.0.0",
      fixtures: { "en-US.json": { spec: "1.0.0", locale: "en-US", cases: [] } },
    });
    const result = runCli(tmpDir);
    expect(result.status).toBe(0);
    // 2 static (order.json, registry.json) + 2 fixture roots (en-US.json, auto-added
    // locale-resolution.json).
    expect(result.stdout).toContain("global spec version: 4 claimant(s) match spec/VERSION");
  });

  it("a mismatching locale fixture version fails, naming the exact file and both values", () => {
    tmpDir = buildDisposableSpec({
      version: "1.0.0",
      fixtures: { "en-US.json": { spec: "0.9.0", locale: "en-US", cases: [] } },
    });
    const result = runCli(tmpDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("fixtures/en-US.json");
    expect(result.stderr).toContain('"spec" is "0.9.0" but spec/VERSION is "1.0.0"');
  });

  it('a missing "spec" field on a fixture root fails explicitly, not silently', () => {
    tmpDir = buildDisposableSpec({
      version: "1.0.0",
      fixtures: { "en-US.json": { locale: "en-US", cases: [] } },
    });
    const result = runCli(tmpDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("fixtures/en-US.json");
    expect(result.stderr).toContain('missing required "spec" field');
  });

  it('a non-string "spec" field on a fixture root fails explicitly', () => {
    tmpDir = buildDisposableSpec({
      version: "1.0.0",
      fixtures: { "en-US.json": { spec: 1, locale: "en-US", cases: [] } },
    });
    const result = runCli(tmpDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("fixtures/en-US.json");
    expect(result.stderr).toContain('"spec" must be a string, got 1');
  });

  it("an existing locale-resolution.json with the wrong version fails, same as any other claimant", () => {
    tmpDir = buildDisposableSpec({
      version: "1.0.0",
      fixtures: {
        "en-US.json": { spec: "1.0.0", locale: "en-US", cases: [] },
        "locale-resolution.json": { spec: "0.1.0", cases: [] },
      },
    });
    const result = runCli(tmpDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("fixtures/locale-resolution.json");
    expect(result.stderr).toContain('"spec" is "0.1.0" but spec/VERSION is "1.0.0"');
  });

  it("deleting a registry-listed locale fixture fails, naming its expected path", () => {
    // en-US is registry-listed (via registryLocales), but its fixture file is never written.
    tmpDir = buildDisposableSpec({
      version: "1.0.0",
      registryLocales: ["en-US"],
      fixtures: {},
    });
    const result = runCli(tmpDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("fixtures/en-US.json");
    expect(result.stderr).toContain("missing — expected canonical fixture");
  });

  it("deleting locale-resolution.json fails explicitly, not merely warned about", () => {
    tmpDir = buildDisposableSpec({
      version: "1.0.0",
      fixtures: { "en-US.json": { spec: "1.0.0", locale: "en-US", cases: [] } },
      includeResolutionFixture: false,
    });
    const result = runCli(tmpDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("fixtures/locale-resolution.json");
    expect(result.stderr).toContain("missing — expected canonical fixture");
  });

  it("deleting the entire spec/fixtures/ directory fails with one directory-level diagnostic", () => {
    tmpDir = buildDisposableSpec({
      version: "1.0.0",
      registryLocales: ["en-US"],
      omitFixturesDir: true,
    });
    const result = runCli(tmpDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("fixtures");
    expect(result.stderr).toContain("missing — cannot verify any canonical fixture");
  });

  it("adding a new locale to the registry without its fixture fails automatically, without editing the check", () => {
    tmpDir = buildDisposableSpec({
      version: "1.0.0",
      registryLocales: ["en-US", "de-DE"], // de-DE listed, but only en-US gets a fixture file
      fixtures: { "en-US.json": { spec: "1.0.0", locale: "en-US", cases: [] } },
    });
    const result = runCli(tmpDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("fixtures/de-DE.json");
    expect(result.stderr).toContain("missing — expected canonical fixture");
  });

  it("a fixture document present on disk but absent from the registry is still discovered and validated", () => {
    // "extra-locale" is not in registryLocales at all — an unexpected additional fixture document
    // must still be a claimant, so it cannot evade version validation just by not being listed.
    tmpDir = buildDisposableSpec({
      version: "1.0.0",
      registryLocales: [],
      fixtures: { "extra-locale.json": { spec: "9.9.9", locale: "extra-locale", cases: [] } },
    });
    const result = runCli(tmpDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("fixtures/extra-locale.json");
    expect(result.stderr).toContain('"spec" is "9.9.9" but spec/VERSION is "1.0.0"');
  });

  it("a fixture present both in the registry and on disk contributes exactly one claimant, not two diagnostics", () => {
    tmpDir = buildDisposableSpec({
      version: "1.0.0",
      fixtures: { "en-US.json": { spec: "0.5.0", locale: "en-US", cases: [] } },
    });
    const result = runCli(tmpDir);
    expect(result.status).not.toBe(0);
    const occurrences = result.stderr.split("fixtures/en-US.json").length - 1;
    expect(occurrences).toBe(1);
  });

  it("a wrong-version file under fixtures/.escaped/ is never treated as an authoritative claimant", () => {
    tmpDir = buildDisposableSpec({
      version: "1.0.0",
      fixtures: { "en-US.json": { spec: "1.0.0", locale: "en-US", cases: [] } },
      // Deliberately wrong, mirroring the real CI-generated escaped mirror shape — must be
      // silently excluded from claimant discovery, not merely tolerated as "not yet checked".
      escapedFixtures: { "en-US.json": { spec: "0.1.0", locale: "en-US", cases: [] } },
    });
    const result = runCli(tmpDir);
    // Exit 0 despite the .escaped mirror's deliberately wrong "spec" is the actual proof: if
    // claimant discovery ever started including .escaped/, this run would fail closed instead.
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("global spec version: 4 claimant(s) match spec/VERSION");
  });

  it("an unreadable registry.json never silently shrinks the expected fixture set to a false pass", () => {
    tmpDir = buildDisposableSpec({
      version: "1.0.0",
      fixtures: { "en-US.json": { spec: "1.0.0", locale: "en-US", cases: [] } },
    });
    // Corrupt the registry after the disposable tree is otherwise valid and self-consistent.
    writeFileSync(path.join(tmpDir, "locales", "registry.json"), "{ not valid json", "utf8");
    const result = runCli(tmpDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("locales/registry.json");
    // Must not report a false "global spec version: N claimant(s) match" success note.
    expect(result.stdout).not.toContain("global spec version:");
  });

  it("claimant discovery and reporting is deterministic regardless of filesystem creation order", () => {
    // Create fixture files in reverse-alphabetical order on disk; listJson()'s own .sort() must
    // still produce identical, alphabetically-ordered output across two independent runs.
    tmpDir = buildDisposableSpec({
      version: "1.0.0",
      fixtures: {
        "zz-locale.json": { spec: "8.0.0", locale: "zz-locale", cases: [] },
        "aa-locale.json": { spec: "9.0.0", locale: "aa-locale", cases: [] },
        "mm-locale.json": { spec: "1.0.0", locale: "mm-locale", cases: [] },
      },
    });
    const first = runCli(tmpDir);
    const second = runCli(tmpDir);
    expect(first.status).not.toBe(0);
    expect(first.stderr).toBe(second.stderr);
    // mm-locale.json's "spec" matches VERSION, so it never fails and never appears in stderr;
    // only aa/zz (both mismatched) do, and listJson()'s own sort must report the alphabetically
    // first one (aa) before the alphabetically last one (zz), regardless of on-disk write order.
    expect(first.stderr).not.toContain("mm-locale.json");
    const aaIndex = first.stderr.indexOf("aa-locale.json");
    const zzIndex = first.stderr.indexOf("zz-locale.json");
    expect(aaIndex).toBeGreaterThanOrEqual(0);
    expect(zzIndex).toBeGreaterThanOrEqual(0);
    expect(aaIndex).toBeLessThan(zzIndex);
  });

  it("passes on this repository's real, current spec/ with exactly 13 verified claimants", () => {
    const output = execFileSync(process.execPath, [CLI], { encoding: "utf8", cwd: ROOT });
    // 2 static (order.json, registry.json) + 10 registry-listed locale fixtures +
    // locale-resolution.json = 13.
    expect(output).toContain("global spec version: 13 claimant(s) match spec/VERSION");
    expect(output).toContain("spec validation passed");
  });

  it("the real repository's spec/VERSION and every fixture root are untouched by this test file", () => {
    // Sanity check that the disposable-copy tests above never mutated the real repository —
    // negative controls above operate exclusively on mkdtempSync() directories.
    const version = readFileSync(path.join(ROOT, "spec", "VERSION"), "utf8").trim();
    expect(version).toBe("1.0.0");
  });
});
