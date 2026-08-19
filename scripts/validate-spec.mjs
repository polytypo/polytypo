#!/usr/bin/env node
// Validates the canonical spec (spec/) — see docs/ARCHITECTURE.md section 6.3.
// Exits non-zero on any failure. Missing directories are reported as warnings,
// not crashes: other work may not have landed yet.

import { readdir, readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPEC = path.join(ROOT, "spec");
const LOCALES_DIR = path.join(SPEC, "locales");
const FIXTURES_DIR = path.join(SPEC, "fixtures");
const SCHEMA_DIR = path.join(SPEC, "schema");
const ESCAPED_DIR = path.join(FIXTURES_DIR, ".escaped");
const RESOLUTION_NAME = "locale-resolution.json";

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
    if (hasList || nbsp.bindInitials === true) carried.push("nbsp");
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
function checkLocaleInvariants(file, locale) {
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
