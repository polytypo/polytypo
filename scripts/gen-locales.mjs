#!/usr/bin/env node
// Embeds spec/locales/*.json into src/generated/locales.ts as plain TypeScript literals.
// The runtime never reads the filesystem (ARCHITECTURE.md 3.1), so this is the only place
// locale JSON is ever loaded. Output is deterministic: keys are emitted in a fixed order.

import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localesDir = join(root, "spec", "locales");
const registryPath = join(localesDir, "registry.json");
const outPath = join(root, "src", "generated", "locales.ts");

function fail(message) {
  console.error(`gen-locales: ${message}`);
  process.exit(1);
}

function readJson(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    fail(`cannot read ${path}: ${error.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`malformed JSON in ${path}: ${error.message}`);
  }
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

// --- read the registry ------------------------------------------------------

if (!existsSync(localesDir)) fail(`${localesDir} does not exist`);
if (!existsSync(registryPath)) fail(`${registryPath} does not exist`);

const registry = readJson(registryPath);
if (!isStringArray(registry.locales) || registry.locales.length === 0) {
  fail("registry.json: `locales` must be a non-empty array of strings");
}
if (!isPlainObject(registry.aliases)) {
  fail("registry.json: `aliases` must be an object");
}
for (const [alias, target] of Object.entries(registry.aliases)) {
  if (typeof target !== "string" || !registry.locales.includes(target)) {
    fail(`registry.json: alias "${alias}" points at "${target}", which is not a declared locale`);
  }
}

const specVersion = readFileSync(join(root, "spec", "VERSION"), "utf8").trim();

// --- read the locale files --------------------------------------------------

const QUOTE_INNER_SPACE = ["none", "nbsp", "narrow-nbsp"];
const PARENTHETICAL = ["em-tight", "em-spaced", "en-tight", "en-spaced", "none"];
const RANGE = ["em-tight", "em-spaced", "en-tight", "en-spaced", "none"];
const SOURCE_RULES = [
  "quotes",
  "dashes",
  "ellipsis",
  "hyphen",
  "nbsp",
  "spaces",
  "apostrophe",
  "symbols",
];
const HYPHEN_LISTS = ["prefixes", "suffixes", "compounds"];

function checkQuotePair(file, path, value) {
  if (!isPlainObject(value)) fail(`${file}: ${path} must be an object`);
  for (const key of ["open", "close"]) {
    if (typeof value[key] !== "string" || [...value[key]].length !== 1) {
      fail(`${file}: ${path}.${key} must be exactly one code point`);
    }
  }
  if (!QUOTE_INNER_SPACE.includes(value.innerSpace)) {
    fail(`${file}: ${path}.innerSpace must be one of ${QUOTE_INNER_SPACE.join(", ")}`);
  }
  return { open: value.open, close: value.close, innerSpace: value.innerSpace };
}

function checkLocale(file, data) {
  for (const key of ["locale", "name", "quotes", "dash", "ellipsis", "hyphen", "nbsp", "sources"]) {
    if (!(key in data)) fail(`${file}: missing required field \`${key}\``);
  }
  if (typeof data.locale !== "string" || typeof data.name !== "string") {
    fail(`${file}: \`locale\` and \`name\` must be strings`);
  }
  if (!isPlainObject(data.quotes)) fail(`${file}: \`quotes\` must be an object`);
  if (!isPlainObject(data.dash)) fail(`${file}: \`dash\` must be an object`);
  if (!PARENTHETICAL.includes(data.dash.parenthetical)) {
    fail(`${file}: dash.parenthetical must be one of ${PARENTHETICAL.join(", ")}`);
  }
  if (!RANGE.includes(data.dash.range)) {
    fail(`${file}: dash.range must be one of ${RANGE.join(", ")}`);
  }
  if (
    !isPlainObject(data.ellipsis) ||
    typeof data.ellipsis.abbreviatedAfterTerminal !== "boolean"
  ) {
    fail(`${file}: ellipsis.abbreviatedAfterTerminal must be a boolean`);
  }
  if (!isPlainObject(data.hyphen)) fail(`${file}: \`hyphen\` must be an object`);
  for (const key of HYPHEN_LISTS) {
    if (!isStringArray(data.hyphen[key]))
      fail(`${file}: hyphen.${key} must be an array of strings`);
  }
  if (!isPlainObject(data.nbsp)) fail(`${file}: \`nbsp\` must be an object`);
  for (const key of [
    "beforePunctuation",
    "narrowBeforePunctuation",
    "afterShortWords",
    "abbreviations",
    "beforeUnits",
    "beforeNumber",
    "beforeWord",
    "afterSymbols",
  ]) {
    if (!isStringArray(data.nbsp[key])) fail(`${file}: nbsp.${key} must be an array of strings`);
  }
  if (typeof data.nbsp.bindInitials !== "boolean") {
    fail(`${file}: nbsp.bindInitials must be a boolean`);
  }
  if (!Array.isArray(data.sources) || data.sources.length === 0) {
    fail(`${file}: \`sources\` must be a non-empty array (docs/PLAN.md 6.1)`);
  }
  for (const source of data.sources) {
    if (!isPlainObject(source) || !SOURCE_RULES.includes(source.rule)) {
      fail(`${file}: every source needs a \`rule\` from ${SOURCE_RULES.join(", ")}`);
    }
    if (typeof source.cite !== "string" || source.cite.length < 8) {
      fail(`${file}: source for "${source.rule}" needs a \`cite\` string`);
    }
  }

  return {
    locale: data.locale,
    name: data.name,
    quotes: {
      primary: checkQuotePair(file, "quotes.primary", data.quotes.primary),
      secondary: checkQuotePair(file, "quotes.secondary", data.quotes.secondary),
    },
    dash: { parenthetical: data.dash.parenthetical, range: data.dash.range },
    ellipsis: { abbreviatedAfterTerminal: data.ellipsis.abbreviatedAfterTerminal },
    hyphen: {
      prefixes: data.hyphen.prefixes,
      suffixes: data.hyphen.suffixes,
      compounds: data.hyphen.compounds,
    },
    nbsp: {
      beforePunctuation: data.nbsp.beforePunctuation,
      narrowBeforePunctuation: data.nbsp.narrowBeforePunctuation,
      afterShortWords: data.nbsp.afterShortWords,
      abbreviations: data.nbsp.abbreviations,
      beforeUnits: data.nbsp.beforeUnits,
      beforeNumber: data.nbsp.beforeNumber,
      beforeWord: data.nbsp.beforeWord,
      afterSymbols: data.nbsp.afterSymbols,
      bindInitials: data.nbsp.bindInitials,
    },
    sources: data.sources.map((source) => {
      const out = { rule: source.rule, cite: source.cite };
      if (typeof source.url === "string") out.url = source.url;
      if (typeof source.note === "string") out.note = source.note;
      return out;
    }),
  };
}

const files = readdirSync(localesDir)
  .filter((name) => name.endsWith(".json") && name !== "registry.json")
  .sort();

const locales = new Map();
for (const file of files) {
  const tag = file.slice(0, -".json".length);
  const data = readJson(join(localesDir, file));
  if (data.locale !== tag) {
    fail(`${file}: field \`locale\` is "${data.locale}" but the file is named "${tag}"`);
  }
  if (!registry.locales.includes(tag)) {
    fail(`${file}: "${tag}" is not listed in registry.json`);
  }
  locales.set(tag, checkLocale(file, data));
}

// Locale files are written by other contributors and land one at a time; a partially
// populated directory is a normal intermediate state, not a build failure.
if (locales.size === 0) {
  console.warn(
    "gen-locales: WARNING — spec/locales contains no locale files; " +
      "generating an empty locale table. transform() will throw for every locale.",
  );
} else if (locales.size < registry.locales.length) {
  const missing = registry.locales.filter((tag) => !locales.has(tag));
  console.warn(
    `gen-locales: WARNING — registry declares locales with no data yet: ${missing.join(", ")}`,
  );
}

// --- emit -------------------------------------------------------------------

function literal(value) {
  if (typeof value === "string") return escapeString(value);
  if (typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[${value.map(literal).join(", ")}]`;
  }
  const entries = Object.entries(value).map(([key, item]) => `${escapeKey(key)}: ${literal(item)}`);
  return `{ ${entries.join(", ")} }`;
}

// Regex is allowed in build tooling, never in src/ (ARCHITECTURE.md 4.1).
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function escapeKey(key) {
  return IDENTIFIER.test(key) ? key : escapeString(key);
}

// Non-ASCII is escaped: a diff full of literal U+00A0 and U+202F cannot be reviewed.
function escapeString(value) {
  let out = '"';
  for (const char of value) {
    const code = char.codePointAt(0);
    if (char === '"') out += '\\"';
    else if (char === "\\") out += "\\\\";
    else if (code >= 0x20 && code <= 0x7e) out += char;
    else if (code > 0xffff) out += `\\u{${code.toString(16).toUpperCase()}}`;
    else out += `\\u${code.toString(16).toUpperCase().padStart(4, "0")}`;
  }
  return out + '"';
}

const aliasEntries = Object.entries(registry.aliases).sort(([a], [b]) =>
  a < b ? -1 : a > b ? 1 : 0,
);
const localeEntries = [...locales.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

const lines = [
  "// Generated by scripts/gen-locales.mjs — do not edit. Run `npm run gen`.",
  "// Source: spec/locales/*.json + spec/locales/registry.json",
  "",
  'import type { LocaleData } from "../types.js";',
  "",
  `export const SPEC_VERSION = ${escapeString(specVersion)};`,
  "",
  "export const KNOWN_LOCALES: readonly string[] = [",
  ...[...registry.locales].sort().map((tag) => `  ${escapeString(tag)},`),
  "];",
  "",
  aliasEntries.length === 0
    ? "export const ALIASES: Readonly<Record<string, string>> = {};"
    : "export const ALIASES: Readonly<Record<string, string>> = {",
  ...aliasEntries.map(([alias, target]) => `  ${escapeKey(alias)}: ${escapeString(target)},`),
  "};",
  "",
  ...(localeEntries.length === 0
    ? ["export const LOCALES: Readonly<Record<string, LocaleData>> = {};"]
    : [
        "export const LOCALES: Readonly<Record<string, LocaleData>> = {",
        ...localeEntries.map(([tag, data]) => `  ${escapeKey(tag)}: ${literal(data)},`),
        "};",
      ]),
  "",
];

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, lines.join("\n"), "utf8");
console.log(`gen-locales: wrote ${outPath} (${locales.size} locale(s), spec ${specVersion})`);
