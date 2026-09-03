// Regression coverage for the two properties of the code-panel treatment that would rot silently:
// a copied selection carries no line numbers, and the gutter is generated rather than baked into
// the block's text.
//
// Both matter because neither is visible in a screenshot. A line number rendered as a real text
// node looks identical to one rendered by a CSS counter — the difference only shows up when
// somebody selects a block, copies it, and pastes twenty numbered lines into their editor.
//
// What actually keeps numbers off the clipboard is two things together, so both are pinned here:
//   - the number is CSS generated content (`content: counter(ln)`), never a DOM text node, which
//     is why it is absent from every element's text content; and
//   - `user-select: none`, because Chrome otherwise includes generated content in a copied
//     selection even though it is not in the DOM.
// Removing either one alone reintroduces the bug, so an assertion on only one would pass through
// half of it.
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

/** Finds `selector { ...declarations... }` for an exact selector list, non-greedy on the body.
 * Anchored to the start of a line so `.specimen` matches its own rule and not the first
 * descendant selector that happens to end in it (`.rule-in .specimen`). */
function findRule(selector: string): string | undefined {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, "m"))?.[1];
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

  it("scopes the counter per panel, so numbering restarts at 1 in every block", () => {
    // Without a per-panel reset a hidden tab pane's lines would keep counting into the next one.
    for (const selector of ["pre", ".specimen", ".pg-output"]) {
      expect(findRule(selector), `${selector} rule is missing`).toMatch(/counter-reset:\s*ln/);
    }
  });
});

/** Every element a `.ln` span is allowed to contain: the two syntax-highlighting token classes and
 * the three change/reveal marks. Anything else — in particular a span holding a rendered line
 * number — is the defect this list exists to catch. */
const ALLOWED_IN_LINE = new Set(["tok-str", "tok-com", "chg", "nb", "bound"]);

describe.each(PAGES)("promo/%s — no line number is baked into the text", (page) => {
  const html = readPromoPage(page);
  const document = parse(html);
  const lines = findAll(document, (el) => hasClass(el, "ln"));
  const panels = findAll(
    document,
    (el) => el.tagName === "pre" || hasClass(el, "specimen") || hasClass(el, "pg-output"),
  );

  it("renders code panels, numbered wherever the content exists at build time", () => {
    // Guards every assertion below from passing vacuously if the treatment is dropped wholesale.
    // /playground is the one page whose panels are all filled by the client — its output pane and
    // its five call-code panes are empty in the generated HTML — so it has panels but no lines.
    expect(panels.length).toBeGreaterThan(0);
    if (page === "playground/index.html") {
      expect(lines.length).toBe(0);
    } else {
      expect(lines.length).toBeGreaterThan(0);
    }
  });

  it("puts nothing inside a line span except text and known token/mark wrappers", () => {
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

describe("brand/tools/promo/site.js — the live renderers number lines the same way", () => {
  const Polytypo = loadPolytypoSiteJs();

  /** Parses a rendered fragment and returns [text, offendingClasses]. */
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

  it("markLines() preserves the text exactly and emits one line span per line", () => {
    const r = inspect(Polytypo.markLines(MULTILINE));
    expect(r.text).toBe(MULTILINE);
    expect(r.lines).toBe(4);
    expect(r.offenders).toEqual([]);
  });

  it("paintLines() preserves the OUTPUT text exactly and emits one line span per line", () => {
    const before = MULTILINE;
    const after = MULTILINE.replace(/"/g, "“");
    const segments = Polytypo.diff([...before], [...after]);
    const r = inspect(Polytypo.paintLines(segments));
    expect(r.text).toBe(after);
    expect(r.lines).toBe(4);
    expect(r.offenders).toEqual([]);
  });

  it("paintLines() never lets a highlight span straddle a line boundary", () => {
    // A changed region spanning a newline must be cut into one span per line, or the wrapper
    // would swallow the line break and the gutter would lose a row.
    const segments: Array<[boolean, string]> = [[true, "one\ntwo"]];
    const html = Polytypo.paintLines(segments);
    expect(inspect(html).lines).toBe(2);
    expect(inspect(html).text).toBe("one\ntwo");
    expect(html).not.toMatch(/<span class="chg"[^>]*>[^<]*\n/);
  });

  it("highlightLines() preserves the code exactly and keeps tokens inside their own line", () => {
    const code = 'const a = "x"; // note\nconst b = 2;';
    const r = inspect(Polytypo.highlightLines(code, "//"));
    expect(r.text).toBe(code);
    expect(r.lines).toBe(2);
    expect(r.offenders).toEqual([]);
  });

  it("still numbers a single-line block, so one-line and multi-line blocks match", () => {
    for (const html of [
      Polytypo.markLines("only one line"),
      Polytypo.paintLines(Polytypo.diff([..."a"], [..."b"])),
      Polytypo.highlightLines("x = 1", "//"),
    ]) {
      expect(inspect(html).lines).toBe(1);
    }
  });

  it("keeps hostile text inert on the new line-numbered paths too", () => {
    // hostile-output.test.ts pins mark()/paint(); these wrappers are new code on the same
    // rendering path, so the same guarantee is asserted for them rather than assumed inherited.
    const hostile = '<img src=x onerror="alert(1)">\n<script>alert(1)</script>';
    const marked = inspect(Polytypo.markLines(hostile));
    expect(marked.text).toBe(hostile);
    expect(marked.offenders).toEqual([]);
    expect(Polytypo.markLines(hostile)).not.toMatch(/<\s*(img|script)[\s>/]/i);

    const segments = Polytypo.diff([...""], [...hostile]);
    const painted = inspect(Polytypo.paintLines(segments));
    expect(painted.text).toBe(hostile);
    expect(painted.offenders).toEqual([]);
    expect(Polytypo.paintLines(segments)).not.toMatch(/<\s*(img|script)[\s>/]/i);
  });
});
