import { ALIASES, KNOWN_LOCALES, LOCALES } from "../generated/locales.js";
import { fromCodePoints, toCodePoints } from "./codepoints.js";
import { PolytypoError } from "../errors.js";
import type { LocaleData } from "../types.js";

const HYPHEN = 0x2d;
const UNDERSCORE = 0x5f;
const UPPER_A = 0x41;
const UPPER_Z = 0x5a;
const LOWER_A = 0x61;
const LOWER_Z = 0x7a;
const CASE_GAP = 0x20;

/** Names the offending value without interpolating an object that may throw in `toString`. */
function describe(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  return typeof value;
}

function isLowerAscii(cp: number | undefined): boolean {
  return cp !== undefined && cp >= LOWER_A && cp <= LOWER_Z;
}

function isUpperAscii(cp: number | undefined): boolean {
  return cp !== undefined && cp >= UPPER_A && cp <= UPPER_Z;
}

/**
 * spec/rules/locale-resolution.md 3.2. ASCII arithmetic only: no toLowerCase, no toUpperCase,
 * no ICU, no host locale, so a Turkish process resolves `EN-us` exactly as a Finnish one does
 * (ARCHITECTURE.md 4.4).
 */
function canonicalize(tag: string): number[] {
  const c = toCodePoints(tag).map((cp) => (cp === UNDERSCORE ? HYPHEN : cp));
  const m = c.length;
  if (m >= 2) {
    for (const j of [0, 1]) {
      if (isUpperAscii(c[j])) c[j] = (c[j] as number) + CASE_GAP;
    }
  }
  if (m === 5 && c[2] === HYPHEN) {
    for (const j of [3, 4]) {
      if (isLowerAscii(c[j])) c[j] = (c[j] as number) - CASE_GAP;
    }
  }
  return c;
}

/**
 * spec/rules/locale-resolution.md 3.3. Exactly two accepted shapes, tested by index rather
 * than by pattern (ARCHITECTURE.md 4.1). Everything else — `eng`, `sr-Latn`, `es-419`,
 * `de-`, `en-US-POSIX`, `und` — is malformed and throws like any unknown tag.
 */
function hasAcceptedShape(c: readonly number[]): boolean {
  if (c.length === 2) return isLowerAscii(c[0]) && isLowerAscii(c[1]);
  if (c.length === 5) {
    return (
      isLowerAscii(c[0]) &&
      isLowerAscii(c[1]) &&
      c[2] === HYPHEN &&
      isUpperAscii(c[3]) &&
      isUpperAscii(c[4])
    );
  }
  return false;
}

/** Alias values are concrete locales by registry invariant (locale-resolution.md 2). */
function aliasTarget(tag: string): string | undefined {
  const target = Object.prototype.hasOwnProperty.call(ALIASES, tag) ? ALIASES[tag] : undefined;
  if (target === undefined) return undefined;
  if (!KNOWN_LOCALES.includes(target)) {
    throw new PolytypoError(
      "POLYTYPO_MALFORMED_LOCALE_DATA",
      `Registry alias "${tag}" points at "${target}", which is not a declared locale.`,
    );
  }
  return target;
}

function lookup(tag: string): string | undefined {
  // Exact before alias, so a registry that wrongly lists a tag in both cannot make lookup
  // order observable (locale-resolution.md 3.4).
  if (KNOWN_LOCALES.includes(tag)) return tag;
  return aliasTarget(tag);
}

/**
 * Exact match, then the registry alias table, then the language subtag alone — once, with no
 * chain. Never Intl, never a platform locale negotiator: those disagree across runtimes and
 * several of them return a best-effort match for a language they have never heard of
 * (ARCHITECTURE.md 4.7, locale-resolution.md 1).
 */
/** `tag` is typed `unknown`: it comes straight from the caller and is validated here, at the boundary. */
export function resolveLocaleTag(tag: unknown): string {
  // locale-resolution.md 3.1 step 1: absent, null or empty throws the coded error like any
  // other unresolvable tag. `locale: string` is a compile-time claim; a plain-JS caller can
  // pass anything, and a native TypeError is not in the error taxonomy (ARCHITECTURE.md 4.6),
  // so a port following 3.1 would fail differently on the same input.
  // An empty string needs no branch here: it has no accepted shape and falls through below.
  if (typeof tag !== "string") {
    throw new PolytypoError(
      "POLYTYPO_UNKNOWN_LOCALE",
      `The \`locale\` option is required and must be a string; received ${describe(tag)}.`,
    );
  }
  const c = canonicalize(tag);
  if (hasAcceptedShape(c)) {
    const canonical = fromCodePoints(c);
    const direct = lookup(canonical);
    if (direct !== undefined) return direct;
    if (c.length === 5) {
      const base = lookup(fromCodePoints(c.slice(0, 2)));
      if (base !== undefined) return base;
    }
  }
  throw new PolytypoError(
    "POLYTYPO_UNKNOWN_LOCALE",
    `Unknown locale "${tag}". Known locales: ${KNOWN_LOCALES.join(", ")}.`,
  );
}

export function getLocaleData(tag: unknown): LocaleData {
  const resolved = resolveLocaleTag(tag);
  const data = Object.prototype.hasOwnProperty.call(LOCALES, resolved)
    ? LOCALES[resolved]
    : undefined;
  if (data === undefined) {
    throw new PolytypoError(
      "POLYTYPO_MALFORMED_LOCALE_DATA",
      `Locale "${resolved}" is declared in the registry but no locale data was generated. Run \`npm run gen\`.`,
    );
  }
  return data;
}

export { KNOWN_LOCALES };
