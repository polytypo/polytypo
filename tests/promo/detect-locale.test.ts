import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadPolytypoSiteJs } from "./load-site-js.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const registry = JSON.parse(
  readFileSync(path.join(ROOT, "spec/locales/registry.json"), "utf8"),
) as { locales: string[]; aliases: Record<string, string> };

const { detectLocale, readPref, writePref } = loadPolytypoSiteJs();
const pick = (...languages: string[]) =>
  detectLocale(languages, registry.locales, registry.aliases);

describe("detectLocale", () => {
  it("resolves like locale-resolution.md 3.4: exact, alias, then the region stripped once", () => {
    expect(pick("de-CH")).toBe("de-CH");
    expect(pick("de-AT")).toBe("de-DE");
    expect(pick("de")).toBe("de-DE");
    expect(pick("pt-AO")).toBe("pt-PT");
    expect(pick("pt-BR")).toBe("pt-BR");
    expect(pick("fr-CH")).toBe("fr");
    expect(pick("no-NO")).toBe("nb");
    expect(pick("tr-TR")).toBe("tr");
  });

  it("matches regardless of case and underscore separators", () => {
    expect(pick("DE_ch")).toBe("de-CH");
  });

  it("sends English outside the US and Canada to en-GB", () => {
    for (const tag of ["en-GB", "en-AU", "en-NZ", "en-IE", "en-IN", "en-ZA"]) {
      expect(pick(tag), tag).toBe("en-GB");
    }
    for (const tag of ["en", "en-US", "en-CA"]) expect(pick(tag), tag).toBe("en-US");
  });

  it("takes the first language that can be served, in the browser's order", () => {
    expect(pick("zh-Hans-CN", "ja", "sv-SE", "de")).toBe("sv");
  });

  it("returns null when nothing matches", () => {
    expect(pick("zh-CN", "ja")).toBeNull();
    expect(pick()).toBeNull();
  });

  it("serves the badge's language list: no en-GB there, so English stays en", () => {
    expect(detectLocale(["en-AU"], ["en", "de"], {})).toBe("en");
    expect(detectLocale(["de-AT"], ["en", "de"], {})).toBe("de");
  });
});

describe("readPref / writePref", () => {
  it("degrade to a no-op when storage is unavailable", () => {
    expect(readPref("polytypo:locale")).toBeNull();
    expect(() => writePref("polytypo:locale", "de-DE")).not.toThrow();
  });
});
