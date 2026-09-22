// Switching a mode in the playground swaps the starting document for one written in that mode's
// own syntax, so the control demonstrates the mode rather than leaving prose the mode has nothing
// to say about. Each sample has to earn that: it must contain prose the mode DOES process AND
// something adjacent it must NOT touch, because that contrast is the only thing distinguishing one
// mode from another.
//
// This is the one file in the suite that runs the real engine over what the page produces — the
// playground script comes from the generated page (see load-playground.ts), and `transform` comes
// from the published `polytypo` package, so a sample that fails to demonstrate its mode fails
// here rather than shipping as a flat example. It is the same engine the promo generator uses for
// every other worked example on the site.
import { readFileSync } from "node:fs";
import path from "node:path";

import { transform } from "polytypo";
import { describe, expect, it } from "vitest";
import YAML from "yaml";

import { loadPlayground, markupDefault, ROOT } from "./load-playground.js";

/** Every locale the site ships, read from the generated data rather than listed here. */
const LOCALES: string[] = (
  JSON.parse(readFileSync(path.join(ROOT, "promo", "examples.json"), "utf8")) as {
    locales: { locale: string }[];
  }
).locales.map((l) => l.locale);

type Options = Parameters<typeof transform>[1];

/** Runs the engine the way the playground's own render() would for a given form state. */
function run(input: string, mode: string, locale: string, dialect: string, keys: string[]) {
  const options: Record<string, unknown> = { locale, mode };
  if (mode === "markdown") options.dialect = dialect;
  if (mode === "yaml") options.keys = keys;
  // The form's values are plain strings; Options' unions are checked by the engine at runtime,
  // which is the behaviour under test here.
  return transform(input, options as unknown as Options);
}

const parseKeys = (raw: string) =>
  raw
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k !== "");

describe("playground samples — each mode starts with a document that mode actually works on", () => {
  for (const [mode, dialect] of [
    ["text", ""],
    ["html", ""],
    ["markdown", "commonmark"],
    ["markdown", "mdx"],
    ["yaml", ""],
  ] as const) {
    const label = mode + (dialect ? `/${dialect}` : "");

    it(`${label}: the engine changes the sample, so the mode shows its own work`, async () => {
      const pg = loadPlayground();
      await pg.set({ locale: "en-US", mode, ...(dialect ? { dialect } : {}) });
      const input = pg.input();
      expect(input, `${label} sample is empty`).not.toBe("");

      const out = run(input, mode, "en-US", dialect, parseKeys(pg.keysField()));
      expect(out, `${label} sample comes back unchanged — it demonstrates nothing`).not.toBe(input);
    });

    it(`${label}: the sample also carries something the mode must leave alone`, async () => {
      const pg = loadPlayground();
      await pg.set({ locale: "en-US", mode, ...(dialect ? { dialect } : {}) });
      const input = pg.input();
      const out = run(input, mode, "en-US", dialect, parseKeys(pg.keysField()));

      // `text` is the one mode with no skip list at all — the whole string is prose to it, so
      // there is nothing for it to leave alone and this assertion does not apply.
      if (mode === "text") {
        expect(input).not.toMatch(/untouched/);
        return;
      }
      const skipMarker = 'echo "untouched" -- still here...';
      expect(input, `${label} sample has no protected region`).toContain(skipMarker);
      expect(out, `${label} rewrote the region it must not touch`).toContain(skipMarker);
    });
  }

  it("gives the two markdown dialects different documents, each valid in its own dialect", async () => {
    const cm = loadPlayground();
    await cm.set({ locale: "en-US", mode: "markdown", dialect: "commonmark" });
    const mdx = loadPlayground();
    await mdx.set({ locale: "en-US", mode: "markdown", dialect: "mdx" });

    expect(cm.input(), "both dialects start from the same document").not.toBe(mdx.input());

    // The CommonMark sample carries an autolink: valid CommonMark, a parse error in MDX. That
    // asymmetry is exactly why the dialect cannot be detected, and why each sample is written for
    // the dialect it belongs to.
    expect(cm.input()).toContain("<https://example.com/a-b>");
    let thrown: unknown;
    try {
      run(cm.input(), "markdown", "en-US", "mdx", []);
    } catch (error) {
      thrown = error;
    }
    // The stable machine code is the contract; the English message is not.
    expect((thrown as { code?: string } | undefined)?.code).toBe("POLYTYPO_MALFORMED_INPUT");

    // The MDX sample carries a braced expression: JavaScript to MDX, which leaves it alone, and
    // prose to CommonMark, which would typeset the string inside it.
    expect(mdx.input()).toContain('{"a -- b"}');
    expect(run(mdx.input(), "markdown", "en-US", "mdx", [])).toContain('{"a -- b"}');
    expect(
      run(mdx.input(), "markdown", "en-US", "commonmark", []),
      "the wrong dialect should visibly damage the expression",
    ).not.toContain('{"a -- b"}');
  });

  /** The text of one field: a block scalar's content is the line after its `key: |` header, a
   * plain scalar's is the header line itself. */
  const fieldOf = (doc: string, key: string) => {
    const lines = doc.split("\n");
    const i = lines.findIndex((l) => l.startsWith(`${key}:`));
    if (i < 0) return "";
    return lines[i]?.trimEnd() === `${key}: |` ? (lines[i + 1] ?? "") : (lines[i] ?? "");
  };

  it("processes every key the Keys field names, and nothing it does not", async () => {
    const pg = loadPlayground();
    await pg.set({ locale: "de-DE", mode: "yaml" });
    const input = pg.input();
    const keys = parseKeys(pg.keysField());
    expect(keys.length, "the yaml sample should demonstrate more than one key").toBeGreaterThan(1);

    const out = run(input, "yaml", "de-DE", "", keys);
    for (const key of keys) {
      expect(fieldOf(out, key), `${key} was named in keys but not processed`).not.toBe(
        fieldOf(input, key),
      );
    }
    // `run:` is a plain scalar exactly like `title:` and differs only in not being named — which
    // is the whole of what the option does.
    expect(fieldOf(input, "run"), "the sample needs an unnamed key for contrast").not.toBe("");
    expect(fieldOf(out, "run"), "an unnamed key was processed").toBe(fieldOf(input, "run"));
  });

  it("leaves every html attribute byte for byte, including the dashes inside one", async () => {
    // An attribute carries the same characters prose does, and a rewritten one is worse than a
    // missed conversion: a mangled `href` is a broken link. The sample's attributes are written
    // with the exact sequences the rules would otherwise convert — `--` and `...` — so passing
    // this means the skip list held rather than that there was nothing to convert.
    const pg = loadPlayground();
    await pg.set({ locale: "en-US", mode: "html" });
    const input = pg.input();
    const attrs = [
      'class="lede"',
      'data-note="untouched -- attribute..."',
      'href="https://example.com/a-b"',
      'title="untouched -- title..."',
    ];
    for (const attr of attrs) {
      expect(input, `the html sample no longer carries ${attr}`).toContain(attr);
    }
    const out = run(input, "html", "en-US", "", []);
    for (const attr of attrs) {
      expect(out, `html mode rewrote ${attr}`).toContain(attr);
    }
    // And the prose between the tags did change, so the sample is not passing by doing nothing.
    expect(out).not.toBe(input);
  });

  it("writes every sample's prose in the locale's own language, in every locale", async () => {
    // A sample half in the visitor's language and half in invented English reads as unfinished.
    // Every prose string comes from that locale's recorded specimens; what may stay English is
    // the shell command and the URL, neither of which is prose and both of which are there to be
    // left alone.
    const allowedEnglish = ['echo "untouched" -- still here...', "https://example.com/a-b"];
    for (const locale of LOCALES) {
      if (locale.startsWith("en-")) continue;
      for (const [mode, dialect] of [
        ["html", ""],
        ["markdown", "commonmark"],
        ["markdown", "mdx"],
        ["yaml", ""],
      ] as const) {
        const pg = loadPlayground();
        await pg.set({ locale, mode, ...(dialect ? { dialect } : {}) });
        let rest = pg.input();
        for (const allowed of allowedEnglish) rest = rest.split(allowed).join("");
        // Attribute and JSX values are markup, not prose, and are deliberately English.
        rest = rest
          .replace(/(class|data-note|href|title|label)=(\{?"[^"]*"\}?)/g, "")
          .replace(/^(title|description|run|summary):/gm, "");
        // What remains is prose. The invented English phrases all contained one of these words.
        for (const word of ["A list item", "dashed", "Bold", "italic", "both processed", "A link"]) {
          expect(rest, `${locale}/${mode}${dialect ? "/" + dialect : ""} still says "${word}"`).not.toContain(
            word,
          );
        }
      }
    }
  });

  it("shows three YAML scalar forms, so the form is visibly not what decides the outcome", async () => {
    // A quoted field and a block field, both named, are both processed; a plain field that is not
    // named is not. So the sample answers two questions at once: why `description` needs `|`, and
    // that what governs processing is `keys` rather than the shape of the value.
    const pg = loadPlayground();
    await pg.set({ locale: "en-US", mode: "yaml" });
    const lines = pg.input().split("\n");
    expect(lines.some((l) => /^title: ".*"$/.test(l)), "no quoted scalar in the sample").toBe(
      true,
    );
    expect(lines.some((l) => l === "description: |"), "no block scalar in the sample").toBe(true);
    expect(lines.some((l) => /^run: \S/.test(l)), "no plain scalar in the sample").toBe(true);
  });

  it("is valid YAML in every locale, and stays valid after transform", async () => {
    // The sample is something a visitor may copy out, so it has to parse. This is also what
    // forces `description` into a block scalar: 16 of the 18 locales' specimen prose contains
    // ": ", which a plain scalar may not.
    for (const locale of LOCALES) {
      const pg = loadPlayground();
      await pg.set({ locale, mode: "yaml" });
      const input = pg.input();
      expect(() => YAML.parse(input), `${locale}: the yaml sample does not parse`).not.toThrow();

      const out = run(input, "yaml", locale, "", parseKeys(pg.keysField()));
      expect(() => YAML.parse(out), `${locale}: transform produced unparseable YAML`).not.toThrow();
    }
  });

  it("agrees with a real YAML parser about which specimens survive double quoting", async () => {
    // The page ships no YAML parser — by the same decision that made `yaml` mode a specified scan
    // — so it picks the quoted field with a predicate instead. The predicate is only worth
    // anything if it matches what a parser would say, which is what this checks, over every
    // recorded case in every locale. A colon inside the quotes is fine (3.8.6 neutralises it);
    // a double quote or a backslash is not, because escaping it would make the source and the
    // content different strings.
    const predicate = (v: string) =>
      !!v && v.trim() === v && !v.includes('"') && !v.includes("\\");
    const parserSaysSafe = (v: string) => {
      try {
        const doc = YAML.parse(`k: "${v}"\n`) as { k?: unknown };
        return typeof doc.k === "string" && doc.k === v;
      } catch {
        return false;
      }
    };

    const examples = JSON.parse(
      readFileSync(path.join(ROOT, "promo", "examples.json"), "utf8"),
    ) as { locales: { locale: string; cases: { in: string }[] }[] };

    const disagreements: string[] = [];
    let checked = 0;
    for (const loc of examples.locales) {
      for (const c of loc.cases) {
        checked += 1;
        if (predicate(c.in) !== parserSaysSafe(c.in)) disagreements.push(`${loc.locale}: ${c.in}`);
      }
    }
    expect(checked, "no cases were checked").toBeGreaterThan(50);
    expect(disagreements).toEqual([]);
  });

  it("names, in the Keys field's own default, keys the yaml sample really has", async () => {
    // The markup's `value` and the sample document are written in different files; if they drift,
    // the mode opens showing nothing happening, which is the one state it must never open in.
    const pg = loadPlayground();
    await pg.set({ locale: "en-US", mode: "yaml" });
    const input = pg.input();
    for (const key of parseKeys(markupDefault("pg-keys"))) {
      expect(input, `the Keys default names ${key}, which the sample does not contain`).toContain(
        `${key}:`,
      );
    }
  });

  it("keeps a sample the visitor has edited, and only replaces an untouched one", async () => {
    const pg = loadPlayground();
    const typed = "My own text - typed here...";
    await pg.set({ locale: "en-US", input: typed });
    await pg.set({ mode: "html" });
    expect(pg.input(), "switching mode discarded the visitor's own text").toBe(typed);

    const fresh = loadPlayground();
    const before = fresh.input();
    await fresh.set({ mode: "html" });
    expect(fresh.input(), "an untouched sample should be replaced").not.toBe(before);
  });
});
