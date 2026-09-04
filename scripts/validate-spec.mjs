#!/usr/bin/env node
// Validates the canonical spec (spec/) — see docs/ARCHITECTURE.md section 6.3.
// Exits non-zero on any failure. Missing directories are reported as warnings,
// not crashes: other work may not have landed yet.

import { readdir, readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { isAllLetters } from "./lib/is-letter.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// VALIDATE_SPEC_ROOT overrides which spec/ directory is validated — test-only, so a regression
// test can run this exact CLI (not a reimplementation of it) against a disposable directory. It
// is never set in CI; the default is always this repository's real spec/. Mirrors the same
// pattern as ACTIONS_PINNED_WORKFLOWS_DIR (scripts/check-actions-pinned.mjs).
const SPEC = process.env.VALIDATE_SPEC_ROOT
  ? path.resolve(process.env.VALIDATE_SPEC_ROOT)
  : path.join(ROOT, "spec");
const LOCALES_DIR = path.join(SPEC, "locales");
const FIXTURES_DIR = path.join(SPEC, "fixtures");
const SCHEMA_DIR = path.join(SPEC, "schema");
const ESCAPED_DIR = path.join(FIXTURES_DIR, ".escaped");
const RESOLUTION_NAME = "locale-resolution.json";
const VERSION_FILE = path.join(SPEC, "VERSION");
const ORDER_FILE = path.join(SPEC, "rules", "order.json");
const REGISTRY_FILE = path.join(LOCALES_DIR, "registry.json");

// spec/VERSION is the single, authoritative source of truth for the global spec version
// (docs/ARCHITECTURE.md section 2, "L0 — spec": "spec/VERSION — spec version (semver)"; see also
// docs/AUDIT_REMEDIATION_AND_RELEASE_PLAN.md section 4.1). It is never itself validated against
// anything else — everything below validates against it.
//
// order.json, registry.json, and every spec/fixtures/*.json root (including
// locale-resolution.json) are redundant global-version claimants: the current contract defines
// each one's own "spec" field as a required, independent restatement of the exact same global spec
// version, required to match spec/VERSION exactly (docs/ARCHITECTURE.md section 6.1,
// spec/schema/fixtures.schema.json's "spec" description). None of them is itself the source of
// truth, and none carries that field for some field-specific purpose of its own — every one exists
// solely so a reader or a generator consulting that file alone still sees the correct version, and
// so this check can catch the moment any of them drifts. Fixture files were excluded from the
// claimant list for a long stretch of the project's history — that was an oversight, not
// intentional policy, and it let eleven fixture files drift to "0.1.0"/"0.2.0" while spec/VERSION
// moved on unnoticed.
//
// The fixture claimant set is never hard-coded and never merely "whatever is currently on disk":
// it is built from spec/locales/registry.json's own "locales" list (readExpectedLocalesFromRegistry
// below) UNIONed with whatever spec/fixtures/*.json files are actually discovered
// (buildFixtureClaimantSet below), so a newly registered locale without its fixture file, or a
// deleted fixture file, or a deleted fixtures directory, is a hard failure rather than a claimant
// that silently stops existing. listJson() excludes spec/fixtures/.escaped/ — that directory entry
// cannot match its isFile() filter — so the CI-generated escaped mirror is never treated as
// authoritative.
//
// ORDER_FILE and REGISTRY_FILE (both already declared above) are the two non-fixture claimants;
// see checkGlobalVersionDrift() below for exactly where and how each of the three kinds of
// claimant — the two fixed files, the registry-derived expected fixture set, and whatever is
// additionally discovered on disk — is actually read and verified.

const errors = [];
const warnings = [];
const notes = [];

const rel = (p) => path.relative(ROOT, p);
const fail = (file, message) => errors.push({ file: rel(file), message });
const warn = (file, message) => warnings.push({ file: rel(file), message });

async function listJson(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".json"))
      .map((e) => e.name)
      .sort();
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function readJson(file) {
  let raw;
  try {
    raw = await readFile(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return { missing: true };
    fail(file, `cannot read: ${err.message}`);
    return { error: true };
  }
  try {
    return { raw, data: JSON.parse(raw) };
  } catch (err) {
    fail(file, `invalid JSON: ${err.message}`);
    return { raw, error: true };
  }
}

function formatAjvErrors(ajvErrors) {
  return (ajvErrors ?? []).map((e) => {
    const at = e.instancePath === "" ? "/" : e.instancePath;
    const extra = e.params && Object.keys(e.params).length ? ` (${JSON.stringify(e.params)})` : "";
    return `${at} ${e.message}${extra}`;
  });
}

// A locale file must cite a source for every rule it actually carries data for.
// "Carries data" is judged per field, because the schema requires all of them to
// be present even when a locale has nothing to say (docs/PLAN.md section 6.1).
function carriedRules(locale) {
  const carried = [];
  if (locale.quotes) carried.push("quotes");
  // `dash` feeds both `dashes` (dash.parenthetical) and `ranges` (dash.range) as of spec 0.5.0,
  // but the citation obligation stays tagged "dashes" only — the split moved which rule reads
  // the field, not the field itself or what supports it (operator decision: no new locale claim
  // was made). A citation already covering dash.range under "dashes" (e.g. a single source
  // documenting both the parenthetical and range convention together) still satisfies this.
  if (locale.dash) carried.push("dashes");
  if (locale.ellipsis?.abbreviatedAfterTerminal === true) carried.push("ellipsis");
  const hyphen = locale.hyphen;
  if (
    hyphen &&
    ["prefixes", "suffixes", "compounds"].some(
      (k) => Array.isArray(hyphen[k]) && hyphen[k].length > 0,
    )
  ) {
    carried.push("hyphen");
  }
  const nbsp = locale.nbsp;
  if (nbsp) {
    const hasList = [
      "beforePunctuation",
      "narrowBeforePunctuation",
      "afterShortWords",
      "abbreviations",
      "beforeUnits",
      "beforeNumber",
      "beforeWord",
      "afterSymbols",
    ].some((k) => Array.isArray(nbsp[k]) && nbsp[k].length > 0);
    if (hasList || nbsp.initialBinding !== "none") carried.push("nbsp");
  }
  return carried;
}

// spec/rules/quotes.md 3.1 WIDE/NARROW and CLOSEISH, mirrored here (not imported: this script
// validates the spec's own data files and must not depend on the generated build).
const QUOTES_WIDE = new Set([
  0x22, 0xab, 0xbb, 0x201c, 0x201d, 0x201e, 0x201f, 0x301d, 0x301e, 0x301f,
]);
const QUOTES_NARROW = new Set([0x27, 0x2018, 0x2019, 0x201a, 0x201b, 0x2039, 0x203a]);
const QUOTES_CLOSEISH_EXTRA = new Set([
  0x29, 0x5d, 0x7d, 0x2c, 0x2e, 0x3b, 0x3a, 0x21, 0x3f, 0x2026, 0x2013, 0x2014,
]);
function isQuoteMarkCp(cp) {
  return QUOTES_WIDE.has(cp) || QUOTES_NARROW.has(cp);
}
function quoteWidthOf(cp) {
  if (QUOTES_WIDE.has(cp)) return "wide";
  if (QUOTES_NARROW.has(cp)) return "narrow";
  return null;
}
function isQuotesCloseish(cp) {
  return QUOTES_CLOSEISH_EXTRA.has(cp) || isQuoteMarkCp(cp);
}
function firstCodePoint(text) {
  return typeof text === "string" ? text.codePointAt(0) : undefined;
}

// Invariants the rule semantics rely on but no JSON Schema can state.
// quotes.md 3.2's Word definition: a context word is a maximal run of LETTER code points. The
// engine's matcher for left/right is a literal comparison, not a LETTER-class check, so a digit
// or punctuation code point in either would NOT be silently unmatchable — it would match,
// exactly as configured, on any input containing that literal string. That is the problem: such
// an entry would make runtime behaviour exceed what the normative Word definition authorises,
// matching text no citation was ever checked against. Rejected here at the data boundary
// instead. `elided` carries no such constraint — its match is a literal equality test, not a
// LETTER-run walk, and the normative contract does not require one. Uses the same pinned table
// the engine imports (scripts/lib/is-letter.mjs re-parses src/engine/letter-ranges.json rather
// than embedding a second copy), so validation and runtime cannot drift apart on what counts as
// a letter.
function checkElisionIdioms(file, quotes) {
  const idioms = Array.isArray(quotes?.elisionIdioms) ? quotes.elisionIdioms : [];
  for (const idiom of idioms) {
    if (typeof idiom !== "object" || idiom === null || Array.isArray(idiom)) continue;
    for (const key of ["left", "right"]) {
      const value = idiom[key];
      if (typeof value === "string" && !isAllLetters(value)) {
        fail(
          file,
          `quotes.elisionIdioms: "${key}" must consist entirely of LETTER code points (quotes.md 3.2's Word definition) — got "${escapeNonAscii(value)}"`,
        );
      }
    }
  }
}

function checkLocaleInvariants(file, locale) {
  checkElisionIdioms(file, locale.quotes);

  const nbsp = locale.nbsp ?? {};
  const wide = new Set(Array.isArray(nbsp.beforePunctuation) ? nbsp.beforePunctuation : []);
  for (const char of Array.isArray(nbsp.narrowBeforePunctuation)
    ? nbsp.narrowBeforePunctuation
    : []) {
    if (wide.has(char)) {
      fail(
        file,
        `nbsp: "${escapeNonAscii(char)}" is in both "beforePunctuation" and "narrowBeforePunctuation" — a character takes either U+00A0 or U+202F, never both`,
      );
    }
  }

  // Q-P (quotes.md 2.1, nbsp.md 2): every beforePunctuation/narrowBeforePunctuation entry must
  // be in the quotes rule's CLOSEISH, or Lemma B's case 3 (pipeline-idempotency.md 7 item 4)
  // does not cover it.
  for (const key of ["beforePunctuation", "narrowBeforePunctuation"]) {
    for (const char of Array.isArray(nbsp[key]) ? nbsp[key] : []) {
      const cp = firstCodePoint(char);
      if (cp !== undefined && !isQuotesCloseish(cp)) {
        fail(
          file,
          `nbsp.${key}: "${escapeNonAscii(char)}" is not in the quotes rule's CLOSEISH — Q-P requires every entry to be (spec/rules/quotes.md 2.1)`,
        );
      }
    }
  }

  for (const kind of ["primary", "secondary"]) {
    const pair = locale.quotes?.[kind];
    if (!pair) continue;
    // A symmetric pair cannot be paired positionally by the nbsp rule without borrowing the
    // quotes rule's nesting state, so the only implementable inner space is none.
    if (pair.open === pair.close && pair.innerSpace !== "none") {
      fail(
        file,
        `quotes.${kind}: open equals close (${escapeNonAscii(pair.open)}) but "innerSpace" is ${JSON.stringify(pair.innerSpace)} — a symmetric pair must use "none"`,
      );
    }

    // Q-W (quotes.md 2.1): open and close must share a WIDE/NARROW bucket, or a formed pair
    // straddles both of the quotes rule's stacks after rendering and the certification gate
    // would decline every pair in a same-glyph document.
    const openCp = firstCodePoint(pair.open);
    const closeCp = firstCodePoint(pair.close);
    if (openCp !== undefined && closeCp !== undefined) {
      const openWidth = quoteWidthOf(openCp);
      const closeWidth = quoteWidthOf(closeCp);
      if (openWidth === null || closeWidth === null) {
        fail(
          file,
          `quotes.${kind}: "${escapeNonAscii(pair.open)}"/"${escapeNonAscii(pair.close)}" is not a recognised quotation glyph (spec/rules/quotes.md 3.1 QUOTEMARK)`,
        );
      } else if (openWidth !== closeWidth) {
        fail(
          file,
          `quotes.${kind}: open "${escapeNonAscii(pair.open)}" is ${openWidth} but close "${escapeNonAscii(pair.close)}" is ${closeWidth} — Q-W requires a pair to be width-homogeneous (spec/rules/quotes.md 2.1)`,
        );
      }
    }

    // Q-A (quotes.md 2.1): a spaced pair must not use U+2019, or apostrophe's own emission
    // would land in a nbsp-insertion-adjacent skip set and Corollary A1 would break.
    if (pair.innerSpace !== "none" && (openCp === 0x2019 || closeCp === 0x2019)) {
      fail(
        file,
        `quotes.${kind}: "innerSpace" is ${JSON.stringify(pair.innerSpace)} but open/close includes U+2019 — Q-A forbids the apostrophe glyph in a spaced pair (spec/rules/quotes.md 2.1)`,
      );
    }
  }

  // A list entry touching a quote glyph at either edge would let an nbsp sub-rule claim an
  // index adjacent to that glyph, reopening the cross-target conflict N1/N2's guard closes.
  // The glyphs are per-locale, so no JSON Schema can state this.
  const quoteGlyphs = new Set(
    ["primary", "secondary"].flatMap((kind) => {
      const pair = locale.quotes?.[kind];
      return pair ? [pair.open, pair.close] : [];
    }),
  );
  for (const key of [
    "afterShortWords",
    "abbreviations",
    "beforeUnits",
    "beforeNumber",
    "beforeWord",
    "afterSymbols",
  ]) {
    for (const entry of Array.isArray(nbsp[key]) ? nbsp[key] : []) {
      const chars = [...String(entry)];
      const first = chars[0];
      const last = chars[chars.length - 1];
      if (quoteGlyphs.has(first) || quoteGlyphs.has(last)) {
        fail(
          file,
          `nbsp.${key}: entry "${escapeNonAscii(String(entry))}" begins or ends with a quotation glyph declared by this locale — that reopens the N1/N2 vs N8 conflict`,
        );
      }
    }
  }

  // maxLength: 2 in the schema is a UTF-16 artifact; this is the portable check.
  const singleChars = [
    ...["primary", "secondary"].flatMap((kind) => {
      const pair = locale.quotes?.[kind];
      return pair
        ? [
            [`quotes.${kind}.open`, pair.open],
            [`quotes.${kind}.close`, pair.close],
          ]
        : [];
    }),
    ...["beforePunctuation", "narrowBeforePunctuation"].flatMap((key) =>
      (Array.isArray(nbsp[key]) ? nbsp[key] : []).map((char, i) => [`nbsp.${key}[${i}]`, char]),
    ),
  ];
  for (const [where, value] of singleChars) {
    if (typeof value !== "string" || [...value].length !== 1) {
      fail(
        file,
        `${where}: must be exactly one Unicode code point, got "${escapeNonAscii(String(value))}"`,
      );
    }
  }
}

// A fixture whose whole point is a code point that canonically decomposes — the Greek
// compatibility punctuation U+037E and U+0387 — degrades silently if anyone "tidies" the file
// by normalising it: the case survives, still passes, and no longer tests anything. The NFC
// check above only warns, so it cannot catch that. This asserts the characters positively, by
// case id, so the test either exists or CI goes red.
const REQUIRED_CODE_POINTS = {
  "el-spaces-compat-question-mark-untouched": 0x037e,
  "el-spaces-compat-ano-teleia-untouched": 0x0387,
};

function checkNonNfcCases(file, data) {
  for (const c of data.cases ?? []) {
    const required = REQUIRED_CODE_POINTS[c.id];
    if (required === undefined) continue;
    const hex = `U+${required.toString(16).toUpperCase().padStart(4, "0")}`;
    for (const field of ["in", "out"]) {
      const value = c[field];
      if (typeof value !== "string") continue;
      if (![...value].some((ch) => ch.codePointAt(0) === required)) {
        fail(
          file,
          `case "${c.id}" must contain ${hex} in "${field}" — the case exists to prove that ` +
            `code point round-trips untouched, and normalising the file deletes the test ` +
            `without failing it (spec/rules/spaces.md section 3.5)`,
        );
      }
    }
  }
}

// Reads spec/locales/registry.json specifically to determine which locale codes have a canonical
// fixture obligation — never a second, independent list of locale names hard-coded here. Returns
// the "locales" array on success, or null on any read/parse/shape failure (missing file,
// unreadable, invalid JSON, non-object root, non-array "locales"), recording exactly one fail()
// for whichever specific problem it hit. null (never []) on failure is deliberate: the caller must
// be able to tell "the registry could not be read, so the expected fixture set is unknown" apart
// from "the registry says zero locales" — collapsing those to the same shape is exactly the bug
// this rewrite closes (an unreadable registry used to silently shrink the expected fixture set to
// nothing, so a fully-deleted fixtures directory could pass as far as this function was concerned).
//
// Returns { locales, registryRead } — registryRead is the raw readJson(REGISTRY_FILE) result,
// returned so the caller can verify REGISTRY_FILE's own "spec" claim against it directly instead
// of reading the file a second time — registry.json is read once here for both purposes, not
// twice, so a malformed registry produces one diagnostic per distinct problem, not the same
// "invalid JSON"/"missing" diagnostic repeated for the same path.
async function readExpectedLocalesFromRegistry() {
  const registryRead = await readJson(REGISTRY_FILE);
  const { data, error, missing } = registryRead;
  if (missing) {
    fail(REGISTRY_FILE, "missing — cannot determine the expected canonical fixture set without it");
    return { locales: null, registryRead };
  }
  if (error || data === undefined) {
    // readJson() already recorded the specific cause (unreadable or invalid JSON).
    return { locales: null, registryRead };
  }
  if (
    data === null ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    !Array.isArray(data.locales)
  ) {
    fail(
      REGISTRY_FILE,
      `"locales" must be an array — cannot determine the expected canonical fixture set without it, got ${JSON.stringify(data?.locales)}`,
    );
    return { locales: null, registryRead };
  }
  return { locales: data.locales, registryRead };
}

// Verifies one claimant's "spec" field against globalVersion, given an already-fetched
// readJson() result — the single implementation both the generic per-claimant loop and the
// registry.json special case (which reuses readExpectedLocalesFromRegistry()'s own read) call, so
// the two never drift into checking different things for the same kind of claimant. Returns
// true/false; false always means fail() already recorded the specific reason.
function verifyClaimantSpecField(file, { data, error, missing }, globalVersion) {
  if (missing) {
    fail(file, `missing — must claim the global spec version via a top-level "spec" field`);
    return false;
  }
  if (error || data === undefined) {
    // readJson() already recorded the specific cause (unreadable or invalid JSON).
    return false;
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    fail(file, `root must be a JSON object, got ${JSON.stringify(data)}`);
    return false;
  }
  if (!Object.prototype.hasOwnProperty.call(data, "spec")) {
    fail(file, `missing required "spec" field — must claim the global spec version`);
    return false;
  }
  if (typeof data.spec !== "string") {
    fail(file, `"spec" must be a string, got ${JSON.stringify(data.spec)}`);
    return false;
  }
  if (data.spec !== globalVersion) {
    fail(
      file,
      `"spec" is ${JSON.stringify(data.spec)} but spec/VERSION is ${JSON.stringify(globalVersion)} — ` +
        `this field must track spec/VERSION exactly, it is not itself the global version source`,
    );
    return false;
  }
  return true;
}

// Builds the deterministic, non-hard-coded set of fixture files that must claim the global spec
// version: every registry-listed locale's "<code>.json", plus the always-canonical
// locale-resolution.json, UNIONed with every *.json file actually discovered directly under
// spec/fixtures/ (spec/fixtures/.escaped/ is a directory, not a file, so listJson()'s isFile()
// filter excludes it without any special case) — so an unexpected additional fixture document can
// never evade version validation merely by being absent from the registry-derived list. A path
// present in both sources contributes exactly one claimant and exactly one diagnostic, never two.
//
// Returns { claimantPaths, missingExpected, directoryMissing }:
// - directoryMissing: true iff spec/fixtures/ itself does not exist — the caller reports this as
//   one directory-level failure and does not additionally enumerate every individual expected file
//   as "missing" underneath a directory that was never there to begin with.
// - missingExpected: absolute paths for every registry-listed-or-canonical fixture that is not
//   present on disk (only populated when the directory does exist) — reported by name, distinctly
//   from an existing-but-wrong-version file.
// - claimantPaths: every *.json file actually present under spec/fixtures/, sorted — this is the
//   file list the caller reads and verifies "spec" against; expected-but-absent files are not in
//   it, since there is nothing to read.
//
// expectedLocales may be null (registry unreadable/malformed — see readExpectedLocalesFromRegistry)
// — in that case only locale-resolution.json is treated as "expected", but this function's return
// alone is never sufficient to claim success: checkGlobalVersionDrift() forces overall failure
// whenever expectedLocales is null, precisely so an unreadable registry can never silently reduce
// the expected set and let a deleted fixtures directory or a deleted locale fixture pass unnoticed.
async function buildFixtureClaimantSet(expectedLocales) {
  const expectedNames = new Set([RESOLUTION_NAME]);
  for (const code of expectedLocales ?? []) {
    if (typeof code === "string" && code.length > 0) expectedNames.add(`${code}.json`);
  }

  const discoveredNames = await listJson(FIXTURES_DIR);
  if (discoveredNames === null) {
    return { claimantPaths: [], missingExpected: [], directoryMissing: true };
  }

  const discovered = new Set(discoveredNames);
  const missingExpected = [...expectedNames]
    .filter((name) => !discovered.has(name))
    .sort()
    .map((name) => path.join(FIXTURES_DIR, name));

  // discoveredNames already lists every *.json actually present — expected-and-present names are
  // already members of it, so the union is just the discovered set itself, sorted (listJson()
  // already sorts, but re-sorting here keeps this function's output order independent of that
  // implementation detail).
  const claimantPaths = [...discoveredNames].sort().map((name) => path.join(FIXTURES_DIR, name));

  return { claimantPaths, missingExpected, directoryMissing: false };
}

// Returns { ok, claimantCount } — ok is true only if spec/VERSION itself is readable/non-empty,
// the registry-derived expected fixture set was fully determined (never assumed empty on a
// registry failure), every expected canonical fixture exists, and every claimant actually
// present — the two static claimants plus every fixture file discovered under spec/fixtures/ —
// was read and its "spec" field verified equal to spec/VERSION. Any missing file, unreadable/
// invalid JSON, non-object root, missing "spec", non-string "spec", or mismatched "spec" is a
// hard failure — never a silent skip — because a claimant that goes unchecked is indistinguishable
// from one that passed, and that is exactly how the original order.json drift (0.2.0 while
// spec/VERSION was 0.3.0) went unnoticed, and later how eleven fixture files drifted to
// "0.1.0"/"0.2.0" unnoticed for the same reason. claimantCount reflects exactly how many claimants
// were actually verified — the caller's success note is derived from it, never inferred indirectly
// from the absence of errors.
async function checkGlobalVersionDrift() {
  let globalVersion;
  try {
    globalVersion = (await readFile(VERSION_FILE, "utf8")).trim();
  } catch (err) {
    if (err.code === "ENOENT") {
      fail(VERSION_FILE, "missing — it is the single source of truth for the global spec version");
      return { ok: false, claimantCount: 0 };
    }
    throw err;
  }

  if (globalVersion === "") {
    fail(VERSION_FILE, "is empty");
    return { ok: false, claimantCount: 0 };
  }

  let allPassed = true;

  const { locales: expectedLocales, registryRead } = await readExpectedLocalesFromRegistry();
  if (expectedLocales === null) {
    // readExpectedLocalesFromRegistry() already recorded the specific diagnostic. Forcing failure
    // here — rather than proceeding with only locale-resolution.json as "expected" — is the fix:
    // an unreadable registry must never silently shrink the expected fixture set and let this
    // function report success for whatever happens to still be on disk.
    allPassed = false;
  }

  const {
    claimantPaths: fixtureClaimants,
    missingExpected,
    directoryMissing,
  } = await buildFixtureClaimantSet(expectedLocales);

  if (directoryMissing) {
    fail(FIXTURES_DIR, "missing — cannot verify any canonical fixture's global spec version claim");
    allPassed = false;
  } else {
    for (const file of missingExpected) {
      fail(
        file,
        `missing — expected canonical fixture, must claim the global spec version via a top-level "spec" field`,
      );
      allPassed = false;
    }
  }

  // REGISTRY_FILE's own "spec" claim is verified against the read readExpectedLocalesFromRegistry()
  // already performed, not a second readJson(REGISTRY_FILE) — one file, one read, one diagnostic
  // per distinct problem. ORDER_FILE has no other reason to be read yet, so it goes through the
  // generic per-claimant loop below along with every fixture claimant.
  if (!verifyClaimantSpecField(REGISTRY_FILE, registryRead, globalVersion)) {
    allPassed = false;
  }

  const claimants = [ORDER_FILE, ...fixtureClaimants];

  for (const file of claimants) {
    const read = await readJson(file);
    if (!verifyClaimantSpecField(file, read, globalVersion)) {
      allPassed = false;
    }
  }

  return { ok: allPassed, claimantCount: claimants.length + 1 /* + REGISTRY_FILE */ };
}

function escapeNonAscii(text) {
  let out = "";
  for (const unit of text) {
    for (let i = 0; i < unit.length; i++) {
      const code = unit.charCodeAt(i);
      out += code < 0x80 ? unit[i] : "\\u" + code.toString(16).padStart(4, "0");
    }
  }
  return out;
}

async function loadSchema(name) {
  const file = path.join(SCHEMA_DIR, name);
  const result = await readJson(file);
  if (result.missing) {
    warn(file, "schema not present yet — dependent checks skipped");
    return null;
  }
  if (result.error) return null;
  return result.data;
}

async function main() {
  const { ok: globalVersionOk, claimantCount } = await checkGlobalVersionDrift();
  if (globalVersionOk) {
    notes.push(`global spec version: ${claimantCount} claimant(s) match spec/VERSION`);
  }

  const ajv = new Ajv2020.default({ allErrors: true, strict: false });
  addFormats.default(ajv);

  const localeSchema = await loadSchema("locale.schema.json");
  const fixturesSchema = await loadSchema("fixtures.schema.json");
  const resolutionSchema = await loadSchema("resolution.schema.json");
  const registrySchema = await loadSchema("registry.schema.json");

  const validateLocale = localeSchema ? ajv.compile(localeSchema) : null;
  const validateFixtures = fixturesSchema ? ajv.compile(fixturesSchema) : null;
  const validateResolution = resolutionSchema ? ajv.compile(resolutionSchema) : null;
  const validateRegistry = registrySchema ? ajv.compile(registrySchema) : null;

  // ---- locales -------------------------------------------------------------
  const localeFiles = await listJson(LOCALES_DIR);
  const localeStems = [];

  if (localeFiles === null) {
    warn(LOCALES_DIR, "directory does not exist yet");
  } else {
    for (const name of localeFiles) {
      if (name === "registry.json") continue;
      const file = path.join(LOCALES_DIR, name);
      const stem = name.slice(0, -".json".length);
      localeStems.push(stem);

      const { raw, data, error } = await readJson(file);
      if (error || data === undefined) continue;

      if (raw.normalize("NFC") !== raw) {
        fail(file, "file is not in Unicode NFC (docs/ARCHITECTURE.md section 4.3)");
      }

      if (validateLocale && !validateLocale(data)) {
        for (const line of formatAjvErrors(validateLocale.errors)) {
          fail(file, `schema: ${line}`);
        }
        continue;
      }

      if (data.locale !== stem) {
        fail(
          file,
          `"locale" is ${JSON.stringify(data.locale)} but the file name stem is ${JSON.stringify(stem)}`,
        );
      }

      checkLocaleInvariants(file, data);

      const cited = new Set((data.sources ?? []).map((s) => s.rule));
      for (const rule of carriedRules(data)) {
        if (!cited.has(rule)) {
          fail(file, `carries data for "${rule}" but "sources" has no citation for it`);
        }
      }
    }
    notes.push(`locales: ${localeStems.length} file(s) checked`);
  }

  // ---- registry ------------------------------------------------------------
  const registryFile = path.join(LOCALES_DIR, "registry.json");
  const registryResult = await readJson(registryFile);

  if (registryResult.missing) {
    warn(registryFile, "registry not present yet — registry checks skipped");
  } else if (!registryResult.error) {
    const registry = registryResult.data;
    const listed = Array.isArray(registry.locales) ? registry.locales : null;
    const aliases =
      registry.aliases && typeof registry.aliases === "object" ? registry.aliases : {};

    if (registryResult.raw.normalize("NFC") !== registryResult.raw) {
      fail(registryFile, "file is not in Unicode NFC");
    }

    if (validateRegistry && !validateRegistry(registry)) {
      for (const line of formatAjvErrors(validateRegistry.errors)) {
        fail(registryFile, `schema: ${line}`);
      }
    }

    if (listed === null) {
      fail(registryFile, '"locales" must be an array');
    } else if (localeFiles === null || localeStems.length === 0) {
      warn(
        registryFile,
        `no locale files present yet — cannot cross-check the ${listed.length} entry(ies) in "locales"`,
      );
    } else {
      const onDisk = new Set(localeStems);
      const inRegistry = new Set(listed);
      for (const code of listed) {
        if (!onDisk.has(code))
          fail(registryFile, `lists "${code}" but spec/locales/${code}.json does not exist`);
      }
      for (const stem of localeStems) {
        if (!inRegistry.has(stem))
          fail(registryFile, `spec/locales/${stem}.json exists but is not listed in "locales"`);
      }
    }

    for (const [alias, target] of Object.entries(aliases)) {
      if (listed !== null && !listed.includes(target)) {
        fail(
          registryFile,
          `alias "${alias}" points at "${target}", which is not listed in "locales"`,
        );
      }
      if (listed !== null && listed.includes(alias)) {
        fail(registryFile, `alias "${alias}" is also listed as a locale`);
      }
      // An alias value is a final answer: resolution strips a region once and never chains
      // (spec/rules/locale-resolution.md section 2).
      if (Object.prototype.hasOwnProperty.call(aliases, target)) {
        fail(
          registryFile,
          `alias "${alias}" points at "${target}", which is itself an alias — aliases must not be transitive`,
        );
      }
    }
  }

  // ---- fixtures ------------------------------------------------------------
  const fixtureFiles = await listJson(FIXTURES_DIR);
  const escaped = [];

  if (fixtureFiles === null) {
    warn(FIXTURES_DIR, "directory does not exist yet");
  } else {
    for (const name of fixtureFiles) {
      // Resolution cases have no rule, no mode and no text; they are checked below against
      // their own schema.
      if (name === RESOLUTION_NAME) continue;
      const file = path.join(FIXTURES_DIR, name);
      const stem = name.slice(0, -".json".length);
      const { raw, data, error } = await readJson(file);
      if (error || data === undefined) continue;

      if (raw.normalize("NFC") !== raw) {
        warn(file, "file is not in Unicode NFC — fixtures may intentionally test non-NFC input");
      }

      if (validateFixtures && !validateFixtures(data)) {
        for (const line of formatAjvErrors(validateFixtures.errors)) {
          fail(file, `schema: ${line}`);
        }
        continue;
      }

      if (data.locale !== stem) {
        fail(
          file,
          `"locale" is ${JSON.stringify(data.locale)} but the file name stem is ${JSON.stringify(stem)}`,
        );
      }

      const seen = new Set();
      for (const c of data.cases ?? []) {
        if (seen.has(c.id)) fail(file, `duplicate case id "${c.id}"`);
        seen.add(c.id);
      }

      checkNonNfcCases(file, data);

      escaped.push({ locale: data.locale ?? stem, data });
    }
    notes.push(
      `fixtures: ${fixtureFiles.filter((n) => n !== RESOLUTION_NAME).length} locale file(s) checked`,
    );
  }

  // ---- locale-resolution fixtures -----------------------------------------
  const resolutionFile = path.join(FIXTURES_DIR, RESOLUTION_NAME);
  const resolutionResult = await readJson(resolutionFile);

  if (resolutionResult.missing) {
    warn(resolutionFile, "locale-resolution fixtures not present yet — checks skipped");
  } else if (!resolutionResult.error) {
    const data = resolutionResult.data;
    if (validateResolution && !validateResolution(data)) {
      for (const line of formatAjvErrors(validateResolution.errors)) {
        fail(resolutionFile, `schema: ${line}`);
      }
    } else {
      const seen = new Set();
      for (const c of data.cases ?? []) {
        if (seen.has(c.id)) fail(resolutionFile, `duplicate case id "${c.id}"`);
        seen.add(c.id);
      }
      notes.push(`resolution fixtures: ${(data.cases ?? []).length} case(s) checked`);
    }
  }

  // ---- escaped mirrors -----------------------------------------------------
  // Generated review aid: a diff full of invisible U+202F is unreviewable
  // (docs/ARCHITECTURE.md section 6.1). Git-ignored.
  if (escaped.length > 0) {
    await rm(ESCAPED_DIR, { recursive: true, force: true });
    await mkdir(ESCAPED_DIR, { recursive: true });
    for (const { locale, data } of escaped) {
      const body = escapeNonAscii(JSON.stringify(data, null, 2));
      await writeFile(path.join(ESCAPED_DIR, `${locale}.json`), body + "\n", "utf8");
    }
    notes.push(`escaped mirrors: ${escaped.length} file(s) written to ${rel(ESCAPED_DIR)}`);
  }

  // ---- report --------------------------------------------------------------
  for (const w of warnings) console.warn(`warn  ${w.file}: ${w.message}`);
  for (const n of notes) console.log(`ok    ${n}`);

  if (errors.length > 0) {
    console.error("");
    console.error(`spec validation failed with ${errors.length} error(s):`);
    let current = null;
    for (const e of errors) {
      if (e.file !== current) {
        current = e.file;
        console.error(`\n  ${current}`);
      }
      console.error(`    - ${e.message}`);
    }
    console.error("");
    process.exitCode = 1;
    return;
  }

  console.log(
    `spec validation passed${warnings.length > 0 ? ` (${warnings.length} warning(s))` : ""}.`,
  );
}

main().catch((err) => {
  console.error(`spec validation crashed: ${err.message}`);
  process.exitCode = 1;
});
