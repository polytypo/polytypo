// Regression coverage for the playground now appearing on TWO pages, one of which loads the engine
// lazily. Three properties, each of which would otherwise be enforced by nothing:
//
// 1. The seeded example the home page shows BEFORE the engine arrives is real recorded engine
//    output. That is the whole justification for showing anything at all pre-engine, and it is
//    only true while examples.json's `hero.out` equals a fresh transform() of `hero.in` — so it is
//    asserted against the live engine here rather than assumed. (Same discipline, and the same
//    reason, as tests/promo/proof-grid.test.ts applies to the `proof` field.)
// 2. The two instances are byte-identical, because both are substituted from one source partial.
// 3. Nothing separates the form from the code block that describes it, on either page.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";
import { describe, expect, it } from "vitest";
import { transform } from "../../src/index.js";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PARTIAL_PATH = path.join(ROOT, "brand/tools/promo/playground.partial.html");
const EXAMPLES_PATH = path.join(ROOT, "promo", "examples.json");
const PLAYGROUND_PAGES = ["index.html", "playground/index.html"];

interface ExamplesJson {
  locales: Array<{ locale: string; name: string; hero: { in: string; out: string } }>;
}

function readJson<T>(p: string, hint: string): T {
  if (!existsSync(p)) throw new Error(`${p} does not exist — run "${hint}" first.`);
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

function readPromoPage(name: string): string {
  const p = path.join(ROOT, "promo", ...name.split("/"));
  if (!existsSync(p)) {
    throw new Error(`${p} does not exist — run "npm run generate:all" before this test file.`);
  }
  return readFileSync(p, "utf8");
}

function isElement(node: Node): node is Element {
  return "tagName" in node;
}

function attr(el: Element, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

function findAll(node: Node, predicate: (el: Element) => boolean, out: Element[] = []): Element[] {
  if (isElement(node) && predicate(node)) out.push(node);
  if ("childNodes" in node) for (const child of node.childNodes) findAll(child, predicate, out);
  return out;
}

/** The element siblings that follow `#pg-demo`, as "tag#id" / "tag.class" labels. */
function siblingsAfterDemo(html: string): string[] {
  const document = parse(html);
  const demo = findAll(document, (el) => attr(el, "id") === "pg-demo")[0];
  expect(demo, "no #pg-demo on the page").toBeDefined();
  const parent = demo!.parentNode!;
  const siblings = parent.childNodes.filter(isElement);
  return siblings.slice(siblings.indexOf(demo!) + 1).map((el) => {
    const id = attr(el, "id");
    if (id) return `${el.tagName}#${id}`;
    const cls = attr(el, "class");
    return cls ? `${el.tagName}.${cls.split(/\s+/)[0]}` : el.tagName;
  });
}

describe("promo/examples.json — the pre-engine seed is real recorded engine output", () => {
  const data = readJson<ExamplesJson>(EXAMPLES_PATH, "npm run generate:all");

  it.each(data.locales.map((l) => l.locale))(
    "%s: hero.out equals a fresh transform(hero.in) — the exact call the page makes on load",
    (locale) => {
      const hero = data.locales.find((l) => l.locale === locale)!.hero;
      // No mode option, matching both gen_examples.ts and the playground's default state
      // (mode "text"). The playground may show `hero.out` without the engine ONLY because this
      // holds; if it ever stops holding, the seeded output silently disagrees with what the engine
      // renders a moment later, and that is the failure this test exists to make loud.
      expect(transform(hero.in, { locale })).toBe(hero.out);
    },
  );

  it("idempotency holds for every seeded output (pasting it back changes nothing)", () => {
    for (const { locale, hero } of data.locales) {
      expect(transform(hero.out, { locale })).toBe(hero.out);
    }
  });
});

describe("promo pages — one playground component, embedded twice", () => {
  const partial = readFileSync(PARTIAL_PATH, "utf8").trim();

  it.each(PLAYGROUND_PAGES)("%s embeds the shared partial verbatim", (page) => {
    // Byte-for-byte: the partial carries no {{prefix}} token precisely so both depths can share it
    // unchanged. If one is ever added, this fails loudly rather than letting the two instances
    // drift into being separately maintained copies.
    expect(readPromoPage(page)).toContain(partial);
  });

  it.each(PLAYGROUND_PAGES)("%s puts the code block immediately after the form", (page) => {
    // Exactly three elements follow the demo panel, in this order: the label that names the
    // relationship, the tab bar, the panes. No prose, no CTA, nothing between the form and the
    // code that describes it.
    expect(siblingsAfterDemo(readPromoPage(page)).slice(0, 3)).toEqual([
      "p.eyebrow",
      "div#call-tabs",
      "div#call-panes",
    ]);
  });

  it("the home page leads with the playground, before any section", () => {
    // The point of the move: a first-time visitor reaches the tool after one paragraph, without
    // navigating. If a section is ever inserted above it, the playground is below the fold again.
    const html = readPromoPage("index.html");
    expect(html.indexOf('id="pg-demo"')).toBeLessThan(html.indexOf("<section"));
  });
});
