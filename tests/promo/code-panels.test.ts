// The code-panel boundary: which blocks on this site are code panels, which are not, and what a
// code panel is allowed to contain.
//
// Two separate contracts live here, and they are separate on purpose.
//
// 1. A CODE panel (a `<pre><code>` block) keeps the treatment it was given: a dark ground and a
//    line-number gutter. The gutter's two invisible properties are pinned because neither shows up
//    in a screenshot — a line number rendered as a real text node looks identical to one rendered
//    by a CSS counter, and the difference only appears when somebody selects a block, copies it,
//    and pastes twenty numbered lines into their editor. What keeps numbers off the clipboard is
//    two things together:
//      - the number is CSS generated content (`content: counter(ln)`), never a DOM text node; and
//      - `user-select: none`, because Chrome otherwise includes generated content in a copied
//        selection even though it is not in the DOM.
//    Removing either one alone reintroduces the bug, so an assertion on only one would pass
//    through half of it.
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
// The DOM-text assertions below are the faithful stand-in for a clipboard read: `.ln` spans are
// inline and the newlines between them are real text nodes, so a block's text content IS the
// text/plain a copy produces. Verified in a live browser at the time of writing; asserted here
// because CI has no browser.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse, parseFragment } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";
import { describe, expect, it } from "vitest";
import { loadPolytypoSiteJs } from "./load-site-js.js";

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
];

/** Pages that carry at least one `<pre>` code panel with content baked in at build time. Named
 * rather than discovered, so a page silently losing its panels fails instead of passing vacuously.
 * /playground's five call-code panes are `<pre>` elements the client fills, empty in the generated
 * HTML; /locales and /manifesto carry specimens only. */
const PAGES_WITH_FILLED_CODE_PANELS = ["index.html", "docs/index.html"];

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

function fontSizePx(declarations: string): number | undefined {
  const px = declarations.match(/font-size:\s*([\d.]+)px/);
  return px ? Number(px[1]) : undefined;
}

describe("brand/tools/promo/style.css — the gutter is generated content, and unselectable", () => {
  const rule = findRule(".ln::before");

  it("renders the number with a CSS counter rather than any authored text", () => {
    expect(rule, ".ln::before rule is missing entirely").toBeDefined();
    expect(rule).toMatch(/content:\s*counter\(\s*ln\s*\)/);
  });

  it("marks the number unselectable, so a copied selection cannot pick it up", () => {
    // Chrome includes ::before content in a copied selection unless this is set — generated
    // content alone is not sufficient.
    expect(rule).toMatch(/user-select:\s*none/);
    expect(rule).toMatch(/-webkit-user-select:\s*none/);
  });

  it("scopes the counter to the code panel, so numbering restarts at 1 in every block", () => {
    // Without a per-panel reset a hidden tab pane's lines would keep counting into the next one.
    expect(findRule("pre"), "the pre rule is missing").toMatch(/counter-reset:\s*ln/);
  });

  it("resets the counter nowhere else — only a code panel has a gutter at all", () => {
    const owners = [...cssCode.matchAll(/([^{};]+)\{[^}]*counter-reset:\s*ln/g)].map((m) =>
      m[1]!.trim(),
    );
    expect(owners).toEqual(["pre"]);
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
    [".rule-out", 16],
    [".pg-output", 19],
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

  it("keeps the playground output legible at 320px rather than dropping it to code size", () => {
    const mobile = css.match(/@media \(max-width: 640px\) \{[\s\S]*?\n\}/)?.[0];
    expect(mobile, "the 640px block is missing").toBeDefined();
    const size = fontSizePx(mobile!.match(/\.pg-output\s*\{([^}]*)\}/)?.[1] ?? "");
    expect(size, ".pg-output has no narrow-viewport size").toBeDefined();
    expect(size!).toBeGreaterThanOrEqual(19);
  });
});

/** Every element a `.ln` span is allowed to contain: the two syntax-highlighting token classes.
 * The change/reveal marks are not on this list any more — they belong to specimens and to the
 * playground output, neither of which is a code panel, so one appearing inside a line span would
 * mean prose had been rendered into one. */
const ALLOWED_IN_LINE = new Set(["tok-str", "tok-com"]);

describe.each(PAGES)("promo/%s — no line number is baked into the text", (page) => {
  const html = readPromoPage(page);
  const document = parse(html);
  const lines = findAll(document, (el) => hasClass(el, "ln"));
  const panels = findAll(document, (el) => el.tagName === "pre");

  it("renders code panels, numbered wherever the content exists at build time", () => {
    // Guards every assertion below from passing vacuously if the treatment is dropped wholesale.
    if (PAGES_WITH_FILLED_CODE_PANELS.includes(page)) {
      expect(panels.length).toBeGreaterThan(0);
      expect(lines.length).toBeGreaterThan(0);
    } else {
      // /playground's panels are all filled by the client; /locales and /manifesto have none.
      expect(lines.length).toBe(0);
    }
  });

  it("puts nothing inside a line span except text and known token wrappers", () => {
    const violations: string[] = [];
    for (const line of lines) {
      for (const el of findAll(line, () => true)) {
        if (el === line) continue;
        if (el.tagName !== "span") {
          violations.push(`<${el.tagName}> inside a line span`);
          continue;
        }
        for (const cls of (attr(el, "class") ?? "").split(/\s+/).filter(Boolean)) {
          if (!ALLOWED_IN_LINE.has(cls)) violations.push(`class "${cls}" inside a line span`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("never starts a line's text with that line's own number", () => {
    // The direct form of the bug: `<span class="ln">1 import …</span>`. Checked against each
    // line's actual ordinal rather than "starts with a digit", so a code line that legitimately
    // begins with a number is not a false positive.
    const offenders: string[] = [];
    for (const panel of panels) {
      const panelLines = findAll(panel, (el) => hasClass(el, "ln"));
      panelLines.forEach((line, i) => {
        const text = extractText(line);
        if (new RegExp(`^${i + 1}(\\s|\\u00a0)`).test(text)) {
          offenders.push(`line ${i + 1}: ${JSON.stringify(text.slice(0, 40))}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("gives one line span per line of the panel's own text", () => {
    // Ties the count of gutter numbers to the text: an extra .ln would number a line that does
    // not exist, and a missing one would leave a line unnumbered.
    for (const panel of panels) {
      const panelLines = findAll(panel, (el) => hasClass(el, "ln"));
      if (panelLines.length === 0) continue;
      expect(extractText(panel).split("\n").length).toBe(panelLines.length);
    }
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

  it("exists exactly once and carries no code-panel class", () => {
    expect(output.length).toBe(1);
    const classes = (attr(output[0]!, "class") ?? "").split(/\s+/).filter(Boolean);
    expect(classes).toEqual(["pg-output"]);
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
    return findAll(document, (el) => el.tagName === "pre")
      .map((pre) => ({ page, code: extractText(pre) }))
      .filter((p) => p.code.trim() !== "");
  });

  it("finds the panes it is about to check (guards every assertion below from vacuity)", () => {
    // 5 language panes on Home, 5 + 3 build panes on Docs.
    expect(panes.length).toBe(13);
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
    for (const needed of ["locale", "mode", "dialect", "rules", "POLYTYPO_UNKNOWN_LOCALE"]) {
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

describe("brand/tools/promo/site.js — only the code renderer numbers lines", () => {
  const Polytypo = loadPolytypoSiteJs();
  const source = readFileSync(path.join(ROOT, "brand/tools/promo/site.js"), "utf8");

  /** Parses a rendered fragment and returns its text, its line count, and any class inside a line
   * span that has no business being there. */
  function inspect(html: string): { text: string; offenders: string[]; lines: number } {
    const fragment = parseFragment(html);
    const lineEls = findAll(fragment, (el) => hasClass(el, "ln"));
    const offenders: string[] = [];
    for (const line of lineEls) {
      for (const el of findAll(line, () => true)) {
        if (el === line) continue;
        for (const cls of (attr(el, "class") ?? "").split(/\s+/).filter(Boolean)) {
          if (!ALLOWED_IN_LINE.has(cls)) offenders.push(cls);
        }
      }
    }
    return { text: extractText(fragment), offenders, lines: lineEls.length };
  }

  const MULTILINE = 'a "b" c\nsecond line\n\nfourth after a blank';

  it("highlightLines() preserves the code exactly and keeps tokens inside their own line", () => {
    const code = 'const a = "x"; // note\nconst b = 2;';
    const r = inspect(Polytypo.highlightLines(code, "//"));
    expect(r.text).toBe(code);
    expect(r.lines).toBe(2);
    expect(r.offenders).toEqual([]);
  });

  it("still numbers a single-line block, so one-line and multi-line blocks match", () => {
    expect(inspect(Polytypo.highlightLines("x = 1", "//")).lines).toBe(1);
  });

  it("does not number the prose renderers — mark() and paint() emit no line spans", () => {
    // The playground output is a specimen, not a code panel: it has no gutter, so its renderers
    // must not wrap anything in `.ln`. This is the assertion that fails if the line-numbered
    // wrappers are wired back into the output pane.
    expect(inspect(Polytypo.mark(MULTILINE)).lines).toBe(0);
    const segments = Polytypo.diff([...MULTILINE], [...MULTILINE.replace(/"/g, "“")]);
    expect(inspect(Polytypo.paint(segments)).lines).toBe(0);
  });

  it("keeps the prose renderers lossless and inert all the same", () => {
    // hostile-output.test.ts pins mark()/paint() in general; repeated here for the exact pair the
    // output pane now uses directly, because that wiring changed.
    const hostile = '<img src=x onerror="alert(1)">\n<script>alert(1)</script>';
    expect(inspect(Polytypo.mark(hostile)).text).toBe(hostile);
    expect(Polytypo.mark(hostile)).not.toMatch(/<\s*(img|script)[\s>/]/i);

    const segments = Polytypo.diff([...""], [...hostile]);
    expect(inspect(Polytypo.paint(segments)).text).toBe(hostile);
    expect(Polytypo.paint(segments)).not.toMatch(/<\s*(img|script)[\s>/]/i);
  });

  it("no longer defines the line-numbered prose wrappers at all", () => {
    // Dead code, not merely unexported: they existed only to put a gutter on the output pane.
    for (const name of ["markLines", "paintLines"]) {
      expect(source, `site.js still defines ${name}`).not.toContain(name);
    }
  });
});
