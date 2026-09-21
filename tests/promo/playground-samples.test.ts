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
import { transform } from "polytypo";
import { describe, expect, it } from "vitest";

import { loadPlayground, markupDefault } from "./load-playground.js";

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

  it("processes every key the Keys field names, and nothing it does not", async () => {
    const pg = loadPlayground();
    await pg.set({ locale: "de-DE", mode: "yaml" });
    const input = pg.input();
    const keys = parseKeys(pg.keysField());
    expect(keys.length, "the yaml sample should demonstrate more than one key").toBeGreaterThan(1);

    const out = run(input, "yaml", "de-DE", "", keys);
    const lineFor = (doc: string, key: string) => {
      const lines = doc.split("\n");
      const i = lines.findIndex((l) => l.startsWith(`${key}:`));
      // A block scalar's content is the line after its `key: |` header.
      return lines[i + 1] ?? "";
    };

    for (const key of keys) {
      expect(lineFor(out, key), `${key} was named in keys but not processed`).not.toBe(
        lineFor(input, key),
      );
    }
    // `run:` has the same shape as the named keys and differs only in not being named.
    const runLine = (doc: string) => doc.split("\n").find((l) => l.startsWith("run:")) ?? "";
    expect(runLine(input), "the sample needs an unnamed key for contrast").not.toBe("");
    expect(runLine(out), "an unnamed key was processed").toBe(runLine(input));
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
