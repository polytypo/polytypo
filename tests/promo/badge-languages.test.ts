// The embeddable badge (promo/badge.js) offers one caption per language. A locale added to the
// registry without its language here would leave the badge behind the locale list.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const registry = JSON.parse(
  readFileSync(path.join(ROOT, "spec/locales/registry.json"), "utf8"),
) as { locales: string[] };
const script = readFileSync(path.join(ROOT, "promo/badge.js"), "utf8");
const matrix = JSON.parse(/var MATRIX = (\{.*\});\n/.exec(script)?.[1] ?? "") as Record<
  string,
  { light: string; dark: string }
>;

describe("badge languages follow the locale registry", () => {
  const languages = [...new Set(registry.locales.map((code) => code.split("-")[0]))].sort();

  it("has a light and a dark caption for every registered language, and no others", () => {
    expect(Object.keys(matrix).sort()).toEqual(languages);
    for (const entry of Object.values(matrix)) {
      expect(entry.light).toContain("polytypo");
      expect(entry.dark).toContain("polytypo");
    }
  });

  it("offers every language in the picker", () => {
    const home = readFileSync(path.join(ROOT, "promo/index.html"), "utf8");
    for (const lang of languages) expect(home).toContain(`<option value="${lang}">`);
  });
});
