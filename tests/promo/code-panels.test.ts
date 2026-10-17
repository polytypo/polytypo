// The code-panel boundary: which blocks on this site are code panels, which are not, and what a
// code panel is allowed to contain.
//
// Two separate contracts live here, and they are separate on purpose.
//
// 1. A CODE panel (a `<pre><code>` block) has a dark-on-light mono treatment and NO line-number
//    gutter: a number is never part of the block's text, and nothing in the stylesheet generates
//    one, so a copied selection can only ever contain the code itself.
//
// 2. A TEXT specimen — a before/after typography example — is deliberately NOT a code panel. It is
//    set in the page's reading face at reading size, because a fixed-width face is precisely where
//    `“ ” „ « »` all take the same advance and lose their shapes, `—` and `–` stop differing, and
//    U+202F — whose entire point is being narrower than U+00A0 — becomes invisible. Those three
//    things are what a specimen exists to show, so the face is not decoration here; it is the
//    content. This half of the file is what the previous reading got backwards.
//
// And the content rule that follows from the same principle in the other direction: a code panel
// contains code. No sample sentence is inlined into a snippet and no comment states an output.
//
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";
import { describe, expect, it } from "vitest";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROMO_DIR = path.join(ROOT, "promo");
const css = readFileSync(path.join(ROOT, "brand/tools/promo/style.css"), "utf8");

const PAGES = [
  "index.html",
  "manifesto/index.html",
  "docs/index.html",
  "playground/index.html",
  "locales/index.html",
  "showcase/index.html",
  "changelog/index.html",
];

/** Pages that carry at least one `<pre>` code panel with content baked in at build time. Named
 * rather than discovered, so a page silently losing its panels fails instead of passing vacuously.
 * Home's own call-code panes and /playground's are `<pre>` elements the client fills, empty in the
 * generated HTML — Home dropped its baked five-language install snippet (previously duplicating
 * the live call directly above it; see brand/tools/promo/home.body.html's #embed section) in favor
 * of one line linking to Docs, which is now the only page with that content baked in at build time.
 * /locales and /manifesto carry specimens only. */
const PAGES_WITH_FILLED_CODE_PANELS = ["docs/index.html"];

/** Pages that carry at least one prose specimen — the proof grid, the per-locale cards, or the
 * rules table's In/Out cells. /playground has none: its output pane is filled by the client. */
const PAGES_WITH_SPECIMENS = [
  "index.html",
  "manifesto/index.html",
  "docs/index.html",
  "locales/index.html",
];

function readPromoPage(name: string): string {
  const p = path.join(PROMO_DIR, ...name.split("/"));
  if (!existsSync(p)) {
    throw new Error(
      `${p} does not exist — run "npm run gen:docs" (or "npm run generate:all") before running ` +
        "this test file, which checks the generated output, not just its source template.",
    );
  }
  return readFileSync(p, "utf8");
}

function isElement(node: Node): node is Element {
  return "tagName" in node;
}

function findAll(node: Node, predicate: (el: Element) => boolean, out: Element[] = []): Element[] {
  if (isElement(node) && predicate(node)) out.push(node);
  if ("childNodes" in node) for (const child of node.childNodes) findAll(child, predicate, out);
  return out;
}

function attr(el: Element, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

function hasClass(el: Element, cls: string): boolean {
  return (attr(el, "class") ?? "").split(/\s+/).includes(cls);
}

/** Concatenates every text node — exactly what a text/plain copy of the block yields, given that
 * `.ln` is inline and the line breaks between spans are real text nodes. */
function extractText(node: Node): string {
  if (node.nodeName === "#text" && "value" in node) return node.value;
  if ("childNodes" in node) return node.childNodes.map(extractText).join("");
  return "";
}

/** Comment-free stylesheet, for the scans that look at selectors: a `/* … *␘/` block before a rule
 * is part of neither its selector nor its body, but a regex reading backwards from `{` would
 * otherwise swallow it. */
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Every `selector { ...declarations... }` body for an exact selector, concatenated in source
 * order — a selector can legitimately appear in more than one rule (`.rule-in, .rule-out` for the
 * shared geometry, `.rule-out` alone for the type), and the contract is about their sum.
 * Anchored to the start of a line so `.specimen` matches its own rules and not the first
 * descendant selector that happens to end in it (`.rule-in .specimen`). */
function findRule(selector: string): string | undefined {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bodies = [...cssCode.matchAll(new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, "gm"))].map(
    (m) => m[1]!,
  );
  return bodies.length ? bodies.join("\n") : undefined;
}

/** The smallest size a `font-size` declaration can resolve to: a literal px value, or the lowest
 * value its `--fs-*` token takes across the root and the narrow-viewport override. */
function fontSizePx(declarations: string): number | undefined {
  const decl = declarations.match(/font-size:\s*([^;]+);/)?.[1]?.trim();
  if (!decl) return undefined;
  const px = decl.match(/^([\d.]+)px$/);
  if (px) return Number(px[1]);
  const token = decl.match(/^var\(\s*(--fs-[\w-]+)\s*\)$/)?.[1];
  if (!token) return undefined;
  const values = [...cssCode.matchAll(new RegExp(`${token}:\\s*([\\d.]+)px`, "g"))].map((m) =>
    Number(m[1]),
  );
  return values.length ? Math.min(...values) : undefined;
}

describe("brand/tools/promo/style.css — a code panel has no line-number gutter", () => {
  it("generates no line numbers and keeps no line counter", () => {
    expect(cssCode).not.toMatch(/counter-reset:\s*ln/);
    expect(cssCode).not.toMatch(/content:\s*counter\(\s*ln\s*\)/);
    expect(cssCode).not.toMatch(/\.ln\b/);
  });
});

describe("brand/tools/promo/style.css — a specimen is prose, not a code panel", () => {
  // The regression this file was rewritten for: the proof cards, the locale cards, the rules
  // table's In/Out cells and the playground output were all given the code panel's monospace face
  // and dark ground, which is exactly the treatment that hides what they are there to show.
  const specimen = findRule(".specimen");

  it("gives .specimen no face, no ground and no gutter of its own", () => {
    expect(specimen, ".specimen rule is missing entirely").toBeDefined();
    expect(specimen, ".specimen sets a font-family — it must inherit the page's").not.toMatch(
      /font-family/,
    );
    expect(specimen, ".specimen paints a background — it must sit on the page").not.toMatch(
      /background/,
    );
    expect(specimen, ".specimen resets the line counter — it has no gutter").not.toMatch(
      /counter-reset/,
    );
  });

  it("keeps the two things a specimen does need: repeated spaces shown, long runs contained", () => {
    // pre-wrap because a `spaces` specimen is ABOUT repeated spaces and collapsing them hides the
    // demonstration; overflow-wrap so a long unbroken run wraps instead of widening the page.
    expect(specimen).toMatch(/white-space:\s*pre-wrap/);
    expect(specimen).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it.each([
    [".card .out", 16],
    [".wb-output", 16],
  ])("%s sets the engine's output in the reading face at >= %ipx", (selector, minPx) => {
    const rule = findRule(selector);
    expect(rule, `${selector} rule is missing`).toBeDefined();
    expect(rule, `${selector} forces a font-family — it must inherit the reading face`).not.toMatch(
      /font-family/,
    );
    const size = fontSizePx(rule!);
    expect(size, `${selector} declares no font-size`).toBeDefined();
    expect(size!).toBeGreaterThanOrEqual(minPx);
  });

  it("still sets the INPUT half in monospace, so the pair is not simply all one face", () => {
    // Positive control: this file could otherwise be satisfied by deleting every font-family in
    // the stylesheet. The "what you typed" half is raw source and is meant to look like it.
    for (const selector of [".card .in", ".rule-in"]) {
      const rule = findRule(selector);
      expect(rule, `${selector} rule is missing`).toMatch(/font-family:\s*var\(--font-mono\)/);
    }
  });

  it("keeps the rules table's Out cell in the page's reading face", () => {
    const rule = findRule(".rule-out");
    expect(rule, ".rule-out rule is missing").toBeDefined();
    expect(rule).not.toMatch(/font-family/);
  });
});

describe.each(PAGES)("promo/%s — no line number is baked into the text", (page) => {
  const document = parse(readPromoPage(page));

  it("carries no line-number span in any panel", () => {
    expect(findAll(document, (el) => hasClass(el, "ln"))).toEqual([]);
  });

  it("renders code panels where the content exists at build time", () => {
    const filled = findAll(document, (el) => el.tagName === "pre").filter(
      (pre) => extractText(pre).trim() !== "",
    );
    if (PAGES_WITH_FILLED_CODE_PANELS.includes(page)) expect(filled.length).toBeGreaterThan(0);
  });
});

describe.each(PAGES_WITH_SPECIMENS)("promo/%s — a specimen is not a code panel", (page) => {
  const document = parse(readPromoPage(page));
  const specimens = findAll(document, (el) => hasClass(el, "specimen"));

  it("renders at least one specimen (so the checks below are not vacuous)", () => {
    expect(specimens.length).toBeGreaterThan(0);
  });

  it("wraps no specimen in a <pre> or a <code>", () => {
    const offenders: string[] = [];
    for (const el of specimens) {
      for (const inner of findAll(el, (c) => c !== el)) {
        if (inner.tagName === "pre" || inner.tagName === "code") {
          offenders.push(`<${inner.tagName}> inside a specimen`);
        }
      }
    }
    expect(offenders).toEqual([]);
    // And from the other direction: no specimen sits inside a code panel either.
    for (const pre of findAll(document, (el) => el.tagName === "pre")) {
      expect(findAll(pre, (el) => hasClass(el, "specimen"))).toEqual([]);
    }
  });

  it("gives no specimen a line-number gutter", () => {
    for (const el of specimens) {
      expect(findAll(el, (c) => hasClass(c, "ln"))).toEqual([]);
    }
  });

  it.each([
    ["chg", "what the engine changed"],
    ["nb", "an invisible character, revealed and labelled"],
  ])("still marks .%s — %s", (cls) => {
    // Positive control against over-reverting: the code-panel FACE was withdrawn from specimens,
    // the marks on top of it were not. Asserted per class, not as "at least one mark of any kind":
    // dropping the change highlight while keeping the invisible-character underline would
    // otherwise slip through.
    const marks = specimens.flatMap((el) => findAll(el, (c) => hasClass(c, cls)));
    expect(marks.length).toBeGreaterThan(0);
  });

  it("labels every revealed invisible character, so the mark is explicable without a legend", () => {
    for (const el of specimens) {
      for (const nb of findAll(el, (c) => hasClass(c, "nb"))) {
        expect(attr(nb, "title"), "an .nb mark with no title").toMatch(/^U\+[0-9A-F]{4} /);
      }
    }
  });
});

describe("promo/playground/index.html — the output pane is a prose surface too", () => {
  const document = parse(readPromoPage("playground/index.html"));
  const output = findAll(document, (el) => attr(el, "id") === "pg-output");

  it("exists exactly once and is a specimen, not a code panel", () => {
    expect(output.length).toBe(1);
    const classes = (attr(output[0]!, "class") ?? "").split(/\s+/).filter(Boolean);
    expect(classes).toEqual(["specimen"]);
  });

  it("is filled by the client, so nothing is baked into it at build time", () => {
    expect(extractText(output[0]!)).toBe("");
  });
});

describe("promo — a code panel contains code, and nothing else", () => {
  /** Every filled `<pre>` on the site, as plain source text: the five language panes plus the
   * three build-step panes, wherever they appear. */
  const panes = PAGES.flatMap((page) => {
    const document = parse(readPromoPage(page));
    return findAll(document, (el) => el.tagName === "pre" && attr(el, "id") !== "badge-code")
      .map((pre) => ({ page, code: extractText(pre) }))
      .filter((p) => p.code.trim() !== "");
  });

  it("finds the panes it is about to check (guards every assertion below from vacuity)", () => {
    // 5 language panes + 3 build panes, all on Docs — the only page with baked-in panes now that
    // Home's own copy of the five language panes is gone (see PAGES_WITH_FILLED_CODE_PANELS).
    expect(panes.length).toBe(8);
  });

  it("states no output in a comment — the `// →` / `# =>` form is gone", () => {
    const offenders: string[] = [];
    for (const { page, code } of panes) {
      for (const line of code.split("\n")) {
        if (/^\s*(\/\/|#)\s*(→|=>|->)/.test(line)) offenders.push(`${page}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("passes the text as a variable — no transform() call takes a string literal", () => {
    // The operator's rule, verbatim: a snippet shows the call and its settings, with the text
    // referred to as a variable. `transform(\`Is this "polytypo"? - No…\`, …)` is what this
    // catches, in every one of the five languages and in either quote style.
    const offenders: string[] = [];
    for (const { page, code } of panes) {
      for (const m of code.matchAll(/[Tt]ransform\(\s*([^\s,)]*)/g)) {
        if (/^["'`]/.test(m[1] ?? "")) offenders.push(`${page}: transform(${m[1]}…`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("contains no character the engine only ever emits into prose", () => {
    // A sample sentence's *output* gives itself away by its glyphs. Straight ASCII punctuation and
    // the em dash are ordinary in a source comment and are deliberately not on this list; every
    // one of these is something transform() produces and a snippet therefore has no reason to
    // hold. The `\u202f`-style escape spellings are caught separately below — the removed
    // French examples wrote the narrow no-break space that way rather than as the character.
    // The invisible members are written as escapes, per the project's own convention: a literal
    // U+00A0 here would be indistinguishable from a plain space in a diff.
    const TYPESET = "“”„‘’‚«»…×\u00a0\u202f\u2011\u2060";
    const offenders: string[] = [];
    for (const { page, code } of panes) {
      for (const ch of code) {
        if (TYPESET.includes(ch)) {
          offenders.push(
            `${page}: U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`,
          );
        }
      }
      for (const m of code.matchAll(/\\u\{?20[12][0-9a-f]\}?/gi))
        offenders.push(`${page}: ${m[0]}`);
    }
    expect([...new Set(offenders)]).toEqual([]);
  });

  it("still shows the call, its settings and its error code (not merely an empty block)", () => {
    // Positive control: the checks above are all prohibitions, and deleting the panes would
    // satisfy every one of them.
    const all = panes.map((p) => p.code).join("\n");
    for (const needed of [
      "locale",
      "mode",
      "dialect",
      "keys",
      "rules",
      "POLYTYPO_UNKNOWN_LOCALE",
    ]) {
      expect(all, `no pane mentions ${needed}`).toContain(needed);
    }
    for (const { page, code } of panes) {
      expect(code, `${page}: a pane with no transform call`).toMatch(/[Tt]ransform/);
    }
  });
});

describe("promo/locales/index.html — specimen text survives the treatment byte for byte", () => {
  // The strongest available form of "copying yields clean text": the expected value comes from
  // promo/examples.json (real recorded engine output), independent of the generator. Any number,
  // separator or stray glyph leaking into the specimen's text fails this.
  //
  // tests/promo/proof-grid.test.ts already makes the equivalent assertion for the proof cards on
  // the home page and the manifesto; the per-locale cards on /locales are covered only here.
  interface Example {
    locale: string;
    hero: { in: string; out: string };
  }
  const data = JSON.parse(readFileSync(path.join(PROMO_DIR, "examples.json"), "utf8")) as {
    locales: Example[];
  };
  const document = parse(readPromoPage("locales/index.html"));
  const cards = findAll(
    document,
    (el) => hasClass(el, "card") && findAll(el, (c) => hasClass(c, "specimen")).length === 2,
  );

  it("renders one card per locale in examples.json", () => {
    expect(cards.length).toBe(data.locales.length);
  });

  it.each(data.locales.map((l) => [l.locale, l] as const))(
    "%s — the card's in/out text is exactly the recorded engine run",
    (locale, example) => {
      const card = cards[data.locales.findIndex((l) => l.locale === locale)]!;
      const inEl = findAll(card, (el) => hasClass(el, "specimen") && hasClass(el, "in"))[0]!;
      const outEl = findAll(card, (el) => hasClass(el, "specimen") && hasClass(el, "out"))[0]!;
      expect(extractText(inEl)).toBe(example.hero.in);
      expect(extractText(outEl)).toBe(example.hero.out);
    },
  );
});
