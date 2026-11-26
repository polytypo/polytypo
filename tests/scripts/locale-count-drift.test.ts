// The locale count and list are facts of spec/locales/registry.json. A hand-written copy of either
// in a human-edited source goes stale on the next locale (CLAUDE.md said "twenty-seven" at 35).
// Generated outputs (README, promo/, BRANDBOOK) take the number from the registry; this test covers
// the sources a person writes. Historic small counts ("ten locales", "18 locales") are not totals.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const registry = JSON.parse(
  readFileSync(path.join(ROOT, "spec/locales/registry.json"), "utf8"),
) as {
  locales: string[];
  aliases: Record<string, string>;
};
const ids = registry.locales;
const count = ids.length;

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50 };
function wordToNumber(word: string): number | undefined {
  const [tens = "", ones] = word.toLowerCase().split("-");
  const base = TENS[tens];
  if (base === undefined) return undefined;
  if (ones === undefined) return base;
  const i = ONES.indexOf(ones);
  return i > 0 ? base + i : undefined;
}

function walk(dir: string, accept: (file: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "__pycache__" || name === "out" || name === "node_modules") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, accept, out);
    else if (accept(full)) out.push(full);
  }
  return out;
}

const SOURCES = [
  path.join(ROOT, "CLAUDE.md"),
  path.join(ROOT, "docs/ARCHITECTURE.md"),
  ...walk(path.join(ROOT, "brand/tools/docs"), (f) => f.endsWith(".md")),
  ...walk(path.join(ROOT, "brand/tools/promo"), () => true),
  ...walk(path.join(ROOT, "brand/tools"), (f) => /\.(py|ts)$/.test(f)).filter(
    (f) => path.dirname(f) === path.join(ROOT, "brand/tools"),
  ),
].filter((f) => existsSync(f)); // CLAUDE.md is git-ignored: absent on a fresh clone

const COUNT_RE = /\b(\d{2,3}|(?:twenty|thirty|forty|fifty)(?:-[a-z]+)?)[ -]locales?\b/gi;
// Not totals of polytypo's own locales: a competitor's claim, and the BCP 47 standard's number.
const NOT_OURS = [/competing library with fifty locales/gi, /BCP 47 locale/g];
const CODE_RE = /`([A-Za-z]{2,3}(?:-[A-Za-z]{2,4})?)`/g;

describe("hand-written locale facts agree with spec/locales/registry.json", () => {
  it("lists one locale file per registry entry", () => {
    const files = readdirSync(path.join(ROOT, "spec/locales"))
      .filter((n) => n.endsWith(".json") && n !== "registry.json")
      .map((n) => n.slice(0, -5))
      .sort();
    expect(files).toEqual([...ids].sort());
  });

  it("states no locale total other than the registry's", () => {
    const stale: string[] = [];
    for (const file of SOURCES) {
      const text = NOT_OURS.reduce((t, re) => t.replace(re, ""), readFileSync(file, "utf8"));
      for (const m of text.matchAll(COUNT_RE)) {
        const raw = m[1] ?? "";
        const n = /^\d/.test(raw) ? Number(raw) : wordToNumber(raw);
        if (n !== undefined && n >= 20 && n !== count) {
          stale.push(`${path.relative(ROOT, file)}: "${m[0]}" (registry has ${count})`);
        }
      }
    }
    expect(stale).toEqual([]);
  });

  it("lists every locale wherever a paragraph lists most of them", () => {
    const partial: string[] = [];
    for (const file of SOURCES) {
      for (const paragraph of readFileSync(file, "utf8").split(/\n\s*\n/)) {
        const mentioned = new Set(
          [...paragraph.matchAll(CODE_RE)].map((m) => m[1] ?? "").filter((c) => ids.includes(c)),
        );
        if (mentioned.size < 15) continue;
        const missing = ids.filter((c) => !mentioned.has(c));
        if (missing.length > 0) {
          partial.push(`${path.relative(ROOT, file)}: list lacks ${missing.join(", ")}`);
        }
      }
    }
    expect(partial).toEqual([]);
  });

  it("writes aliases as the registry defines them", () => {
    const claude = path.join(ROOT, "CLAUDE.md");
    if (!existsSync(claude)) return;
    const text = readFileSync(claude, "utf8");
    for (const m of text.matchAll(/`([a-z]{2})`→`([A-Za-z-]+)`/g)) {
      const [, alias = "", target = ""] = m;
      if (registry.aliases[alias] !== undefined || ids.includes(target)) {
        expect(registry.aliases[alias], `alias ${alias}`).toBe(target);
      }
    }
    for (const [alias, target] of Object.entries(registry.aliases)) {
      expect(text, `CLAUDE.md should mention alias ${alias}`).toContain(
        `\`${alias}\`→\`${target}\``,
      );
    }
  });
});

describe("badge language maps follow the registry", () => {
  const source = readFileSync(path.join(ROOT, "brand/tools/build_promo.py"), "utf8");
  const keys = (name: string): string[] => {
    const body = new RegExp(`^${name} = \\{\\n([\\s\\S]*?)^\\}`, "m").exec(source)?.[1] ?? "";
    return [...body.matchAll(/^\s+"([a-z-]+)":/gm)].map((m) => m[1] ?? "").sort();
  };
  const languages = [...new Set(ids.map((c) => c.split("-")[0] ?? c))].sort();

  it.each(["BADGE_TEXT", "BADGE_LANG_NAMES"])("%s has exactly the registered languages", (name) => {
    expect(keys(name)).toEqual(languages);
  });
});
