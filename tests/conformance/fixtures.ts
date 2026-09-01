// Loading and reporting helpers for the conformance runner (docs/ARCHITECTURE.md section 6).
// Fixture files are canonical spec data, so they are parsed fail-fast: a malformed file is a
// spec bug and must not be silently skipped.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Dialect, Mode, Options } from "../../src/types";
import type { PolytypoErrorCode } from "../../src/errors";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const FIXTURES_DIR = path.join(ROOT, "spec", "fixtures");
export const RESOLUTION_FILE = path.join(FIXTURES_DIR, "locale-resolution.json");

/** Not a locale fixture file: resolution cases have no rule, no mode and no text. */
const RESOLUTION_NAME = "locale-resolution.json";

const MODES: readonly string[] = ["text", "html", "markdown"];
const DIALECTS: readonly string[] = ["commonmark", "mdx"];

export interface ConformanceCase {
  readonly id: string;
  readonly rule: string;
  readonly mode: Mode;
  /**
   * Required exactly when `mode` is `"markdown"`, forbidden otherwise — mirrors
   * spec/schema/fixtures.schema.json's `allOf` conditional (modes.md 3.7.1: `dialect` has no
   * default and detection is forbidden, so a fixture must name it exactly as a caller would).
   */
  readonly dialect?: Dialect | undefined;
  readonly in: string;
  readonly out?: string | undefined;
  readonly throws?: PolytypoErrorCode | undefined;
  readonly note?: string | undefined;
  readonly rules?: Options["rules"];
}

export interface ConformanceFile {
  readonly name: string;
  readonly path: string;
  readonly spec: string;
  readonly locale: string;
  readonly cases: readonly ConformanceCase[];
}

export interface ResolutionCase {
  readonly id: string;
  readonly tag: string;
  readonly resolves?: string | undefined;
  readonly throws?: PolytypoErrorCode | undefined;
  readonly note?: string | undefined;
}

export interface ResolutionFile {
  readonly path: string;
  readonly spec: string;
  readonly cases: readonly ResolutionCase[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

function requireString(value: unknown, where: string): string {
  if (typeof value !== "string") throw new Error(`${where}: expected a string`);
  return value;
}

function optionalString(value: unknown, where: string): string | undefined {
  return value === undefined ? undefined : requireString(value, where);
}

function requireArray(value: unknown, where: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${where}: expected an array`);
  return value;
}

function parseRuleOverrides(value: unknown, where: string): Options["rules"] {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error(`${where}: "rules" must be an object`);
  for (const [key, flag] of Object.entries(value)) {
    if (typeof flag !== "boolean") throw new Error(`${where}: "rules.${key}" must be a boolean`);
  }
  // Unknown rule ids are the pipeline's business: it raises POLYTYPO_UNKNOWN_RULE for them.
  return value as Options["rules"];
}

function parseDialect(value: unknown, mode: Mode, where: string): Dialect | undefined {
  const dialect = optionalString(value, `${where} "dialect"`);
  if (mode === "markdown") {
    if (dialect === undefined) {
      throw new Error(
        `${where}: "dialect" is required when "mode" is "markdown" (modes.md 3.7.1 — no ` +
          `default, detection is forbidden, a fixture must name it exactly as a caller would)`,
      );
    }
    if (!DIALECTS.includes(dialect)) {
      throw new Error(`${where}: unknown dialect "${dialect}"`);
    }
    return dialect as Dialect;
  }
  if (dialect !== undefined) {
    throw new Error(`${where}: "dialect" is only meaningful when "mode" is "markdown"`);
  }
  return undefined;
}

function parseCase(raw: unknown, where: string): ConformanceCase {
  if (!isRecord(raw)) throw new Error(`${where}: expected an object`);
  const id = requireString(raw.id, `${where} "id"`);
  const mode = requireString(raw.mode, `${where} "mode"`);
  if (!MODES.includes(mode)) throw new Error(`${where}: unknown mode "${mode}"`);
  const dialect = parseDialect(raw.dialect, mode as Mode, where);
  const out = optionalString(raw.out, `${where} "out"`);
  const throws = optionalString(raw.throws, `${where} "throws"`);
  if ((out === undefined) === (throws === undefined)) {
    throw new Error(`${where}: exactly one of "out" and "throws" is required`);
  }
  return {
    id,
    rule: requireString(raw.rule, `${where} "rule"`),
    mode: mode as Mode,
    dialect,
    in: requireString(raw.in, `${where} "in"`),
    out,
    throws: throws as PolytypoErrorCode | undefined,
    note: optionalString(raw.note, `${where} "note"`),
    rules: parseRuleOverrides(raw.rules, where),
  };
}

/**
 * Every spec/fixtures/*.json except the resolution file, discovered at test time so that a
 * locale landing later needs no change here. The generated .escaped/ mirror is a directory
 * and is skipped along with anything else that is not a file.
 */
export function discoverFixtureFiles(): readonly ConformanceFile[] {
  let entries;
  try {
    entries = readdirSync(FIXTURES_DIR, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const names = entries
    .filter((e) => e.isFile() && e.name.endsWith(".json") && e.name !== RESOLUTION_NAME)
    .map((e) => e.name)
    .sort();

  return names.map((name) => {
    const file = path.join(FIXTURES_DIR, name);
    const raw = readJson(file);
    if (!isRecord(raw)) throw new Error(`${name}: expected an object at the top level`);
    const cases = requireArray(raw.cases, `${name} "cases"`).map((c, i) =>
      parseCase(c, `${name} cases[${i}]`),
    );
    return {
      name,
      path: file,
      spec: requireString(raw.spec, `${name} "spec"`),
      locale: requireString(raw.locale, `${name} "locale"`),
      cases,
    };
  });
}

/** The locale-resolution fixtures, or null when the file has not landed yet. */
export function loadResolutionFile(): ResolutionFile | null {
  let raw: unknown;
  try {
    raw = readJson(RESOLUTION_FILE);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (!isRecord(raw)) throw new Error(`${RESOLUTION_NAME}: expected an object at the top level`);

  const cases = requireArray(raw.cases, `${RESOLUTION_NAME} "cases"`).map((entry, i) => {
    const where = `${RESOLUTION_NAME} cases[${i}]`;
    if (!isRecord(entry)) throw new Error(`${where}: expected an object`);
    const resolves = optionalString(entry.resolves, `${where} "resolves"`);
    const throws = optionalString(entry.throws, `${where} "throws"`);
    if ((resolves === undefined) === (throws === undefined)) {
      throw new Error(`${where}: exactly one of "resolves" and "throws" is required`);
    }
    return {
      id: requireString(entry.id, `${where} "id"`),
      tag: requireString(entry.tag, `${where} "tag"`),
      resolves,
      throws: throws as PolytypoErrorCode | undefined,
      note: optionalString(entry.note, `${where} "note"`),
    };
  });

  return {
    path: RESOLUTION_FILE,
    spec: requireString(raw.spec, `${RESOLUTION_NAME} "spec"`),
    cases,
  };
}

/**
 * Non-ASCII rendered as \uXXXX. A diff full of invisible U+00A0 and U+202F is unreviewable
 * (docs/ARCHITECTURE.md section 6.1), so every string in a failure message goes through this.
 */
export function escapeNonAscii(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    out += code < 0x80 ? text[i] : "\\u" + code.toString(16).padStart(4, "0");
  }
  return out;
}

export function caseLabel(file: string, locale: string, id: string): string {
  return `${file} · case "${id}" · locale "${locale}"`;
}
