import { describe, it, expect } from "vitest";
import { transform } from "../../src/index";
import { getLocaleData, resolveLocaleTag } from "../../src/engine/locale";
import { LOCALES } from "../../src/generated/locales";
import { PolytypoError } from "../../src/errors";
import type { Options } from "../../src/types";

describe("locale resolution", () => {
  const table: ReadonlyArray<readonly [string, string]> = [
    ["en-US", "en-US"],
    ["en-GB", "en-GB"],
    ["de-DE", "de-DE"],
    ["de-CH", "de-CH"],
    ["fi", "fi"],
    ["sv", "sv"],
    ["fr", "fr"],
    ["ru", "ru"],
    // alias table
    ["en", "en-US"],
    ["de", "de-DE"],
    // region stripped, then resolved again
    ["de-AT", "de-DE"],
    ["en-AU", "en-US"],
    ["fr-CA", "fr"],
    ["ru-BY", "ru"],
    // case and separator normalization
    ["FI", "fi"],
    ["en-gb", "en-GB"],
    ["DE_ch", "de-CH"],
  ];

  for (const [input, expected] of table) {
    it(`resolves ${input} to ${expected}`, () => {
      expect(resolveLocaleTag(input)).toBe(expected);
    });
  }

  // locale-resolution.md 3.3: exactly two accepted shapes, everything else throws — a
  // malformed tag is never quietly repaired into a resolvable one.
  const malformed = [
    "eng",
    "sr-Latn",
    "es-419",
    "und",
    "de-",
    "en-US-POSIX",
    "de-CH-1901",
    "x-pig",
  ];

  for (const input of ["", "xx", "xx-YY", "klingon", "-", "e", ...malformed]) {
    it(`throws POLYTYPO_UNKNOWN_LOCALE for ${JSON.stringify(input)}`, () => {
      try {
        resolveLocaleTag(input);
      } catch (error) {
        expect(error).toBeInstanceOf(PolytypoError);
        expect((error as PolytypoError).code).toBe("POLYTYPO_UNKNOWN_LOCALE");
        return;
      }
      throw new Error("expected a POLYTYPO_UNKNOWN_LOCALE error");
    });
  }

  it("never falls back to English", () => {
    expect(() => resolveLocaleTag("xx")).toThrow(PolytypoError);
    expect(() => resolveLocaleTag("es")).toThrow(PolytypoError);
  });
});

describe("absent or non-string locale (locale-resolution.md 3.1 step 1)", () => {
  // Not expressible as a resolution fixture: resolution.schema.json requires `tag` and types it
  // as a string, so "absent" and "null" have no encoding. Encoding "" instead would be a
  // different case — that one already passes — so the coverage lives here until the schema
  // gains a way to say "the option was not supplied".
  const cases: ReadonlyArray<readonly [string, unknown]> = [
    ["absent", undefined],
    ["null", null],
    ["a number", 42],
    ["an object", {}],
    ["an array", []],
    ["a boolean", false],
  ];

  for (const [label, value] of cases) {
    it(`throws POLYTYPO_UNKNOWN_LOCALE, not a TypeError, when locale is ${label}`, () => {
      try {
        transform("a", { locale: value } as unknown as Options);
      } catch (error) {
        expect(error).toBeInstanceOf(PolytypoError);
        expect((error as PolytypoError).code).toBe("POLYTYPO_UNKNOWN_LOCALE");
        return;
      }
      throw new Error("expected a POLYTYPO_UNKNOWN_LOCALE error");
    });
  }

  it("throws the coded error when the options object itself is missing", () => {
    for (const options of [undefined, null]) {
      try {
        transform("a", options as unknown as Options);
      } catch (error) {
        expect((error as PolytypoError).code).toBe("POLYTYPO_UNKNOWN_LOCALE");
        continue;
      }
      throw new Error("expected a POLYTYPO_UNKNOWN_LOCALE error");
    }
  });

  it("covers every mode, since the check sits where the option is first read", () => {
    const modes = [
      { mode: "text" as const },
      { mode: "html" as const },
      { mode: "markdown" as const, dialect: "commonmark" as const },
      { mode: "markdown" as const, dialect: "mdx" as const },
    ];
    for (const extra of modes) {
      try {
        transform("a <em>b</em>", extra as unknown as Options);
      } catch (error) {
        expect((error as PolytypoError).code).toBe("POLYTYPO_UNKNOWN_LOCALE");
        continue;
      }
      throw new Error(`expected a POLYTYPO_UNKNOWN_LOCALE error for mode ${extra.mode}`);
    }
  });
});

describe("locale data lookup", () => {
  const available = Object.keys(LOCALES);

  it.skipIf(available.length === 0)("returns data for a generated locale", () => {
    const tag = available[0] as string;
    const data = getLocaleData(tag);
    expect(data.locale).toBe(tag);
    expect(data.sources.length).toBeGreaterThan(0);
  });

  it("reports a registry locale with no generated data as malformed", () => {
    const missing = ["en-US", "en-GB", "de-DE", "de-CH", "fr", "ru", "fi", "sv"].filter(
      (tag) => !available.includes(tag),
    );
    if (missing.length === 0) return;
    try {
      getLocaleData(missing[0] as string);
    } catch (error) {
      expect((error as PolytypoError).code).toBe("POLYTYPO_MALFORMED_LOCALE_DATA");
      return;
    }
    throw new Error("expected a POLYTYPO_MALFORMED_LOCALE_DATA error");
  });
});
