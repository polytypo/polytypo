// The one before/after mark: <del> on what a change removes from the input, <ins> on what it puts
// in the output, the same two classes in every generator and in the playground's live output.
// Source-level: needs neither the generated site nor a browser.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadPolytypoSiteJs } from "./load-site-js.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TOOLS = path.join(ROOT, "brand/tools");
const css = readFileSync(path.join(TOOLS, "promo/style.css"), "utf8");

function python(code: string): string {
  return execFileSync(
    "python3",
    ["-I", "-c", `import sys; sys.path.insert(0, ${JSON.stringify(TOOLS)})\n${code}`],
    {
      encoding: "utf8",
    },
  );
}

describe("diff_html — both sides of a pair carry the mark", () => {
  const out = JSON.parse(
    python(
      `import json, build_promo as b
print(json.dumps({
  "pair": b.diff_html('He said "hi" - ok...', 'He said \\u201chi\\u201d \\u2013 ok\\u2026'),
  "nb": b.diff_html('10 km', '10\\u00a0km'),
  "same": b.diff_html('plain', 'plain'),
  "removal": b.diff_html('a  b', 'a b'),
  "union": b.diff_before_union('x "y" z', ['x \\u201cy\\u201d z', 'x y z']),
}))`,
    ),
  ) as Record<string, string | string[]>;

  it("marks the removed input in <del> and the added output in <ins>", () => {
    const [before, after] = out.pair as string[];
    expect(before).toContain('<del class="chg chg-del">&quot;</del>');
    expect(after).toContain('<ins class="chg chg-ins">“</ins>');
    expect(before).not.toContain("<ins");
    expect(after).not.toContain("<del");
  });

  it("marks nothing when nothing changed", () => {
    expect(out.same).toEqual(["plain", "plain"]);
  });

  it("marks a pure removal on the input side only", () => {
    const [before, after] = out.removal as string[];
    expect(before).toContain("<del");
    expect(after).not.toContain("<ins");
  });

  it("shows an invisible character that is the change inside the mark, labelled", () => {
    const [, after] = out.nb as string[];
    expect(after).toMatch(
      /<ins class="chg chg-ins"><span class="nb" title="U\+00A0 [^"]+">\u00a0<\/span><\/ins>/,
    );
  });

  it("marks a shared input wherever any output changes it", () => {
    const union = out.union as string;
    expect(union.match(/<del/g)?.length).toBe(2);
  });
});

describe("the live playground output uses the same mark", () => {
  const Polytypo = loadPolytypoSiteJs();
  it("paints a change as <ins class='chg chg-ins'>", () => {
    const html = Polytypo.paint(Polytypo.diff([..."a 'b'"], [..."a ‘b’"]));
    expect(html).toContain('<ins class="chg chg-ins"');
  });

  it("paints the input side of the textarea mirror as <del class='chg chg-del'>", () => {
    const both = Polytypo.diffBoth([..."a 'b'"], [..."a ‘b’"]);
    const html = Polytypo.paintDel(both.left);
    expect(html).toBe('a <del class="chg chg-del">\'</del>b<del class="chg chg-del">\'</del>');
  });
});

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** The declaration blocks that define a theme, keyed by theme. */
function themeBlocks(): Record<"light" | "dark", string[]> {
  const root = css.match(/:root\s*\{([^}]*)\}/)![1]!;
  const media = css.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/)![1]!;
  const light = css.match(/:root\[data-theme="light"\]\s*\{([^}]*)\}/)![1]!;
  const dark = css.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/)![1]!;
  return { light: [root, light], dark: [media, dark] };
}

const token = (blocks: string[], name: string): string => {
  for (const block of [...blocks].reverse()) {
    const m = block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
    if (m) return m[1]!;
  }
  throw new Error(`${name} not defined`);
};

describe("style.css — mark colours, both themes", () => {
  const themes = themeBlocks();
  const base = css.match(/:root\s*\{([^}]*)\}/)![1]!;
  for (const theme of ["light", "dark"] as const) {
    const blocks = theme === "light" ? [base, ...themes.light] : [base, ...themes.dark];
    const fg = token(blocks, "--fg");
    it.each(["--diff-del-bg", "--diff-ins-bg", "--surface-strong"])(
      `${theme}: --fg on %s is at least 4.5:1`,
      (name) => {
        expect(contrast(fg, token(blocks, name))).toBeGreaterThanOrEqual(4.5);
      },
    );
  }

  it("draws only the fill, and announces the change to a screen reader instead", () => {
    expect(css).toMatch(/\.chg\s*\{[^}]*text-decoration:\s*none/);
    expect(css).not.toMatch(/\.chg-(?:del|ins)\s*\{[^}]*text-decoration/);
    expect(css).toMatch(/\.chg-del::before\s*\{[^}]*\[removed:/);
    expect(css).toMatch(/\.chg-ins::before\s*\{[^}]*\[added:/);
  });
});
