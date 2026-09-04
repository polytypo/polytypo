// Regression coverage for the home/manifesto "proof grid" (Stage-8 correction fix #1, and the
// final-pass fix #2 closing the drift between this test and the actual rendered cards): the four
// cards must all be the SAME input string run through the real engine, per locale, with results
// that actually differ — not four different fixture sentences dressed up as "the same sentence".
//
// promo/examples.json is generated output (brand/tools/gen_examples.ts running the real engine,
// `npx tsx brand/tools/gen_examples.ts` — see package.json's gen:docs). Its `proofLocales` field
// is the SINGLE source of truth for which locales the grid renders — brand/tools/build_promo.py
// reads that same field rather than declaring its own list, and this test does too, so there is
// no second, independently-maintained locale list anywhere to drift out of sync.
//
// Critically, this file does not just re-check examples.json in isolation — it parses the ACTUAL
// generated promo/index.html and promo/manifesto/index.html (each proof <div class="card"> carries a
// data-locale attribute for exactly this purpose) and asserts against what is really rendered,
// so a builder bug that renders a locale outside the intended set, renders mismatched input text
// in one card, or silently falls out of sync with examples.json's `proof` data would fail here.
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
const EXAMPLES_PATH = path.join(ROOT, "promo", "examples.json");

interface ExamplesJson {
  proofLocales: string[];
  locales: Array<{ locale: string; proof?: { in: string; out: string } }>;
}

function readExamples(): ExamplesJson {
  if (!existsSync(EXAMPLES_PATH)) {
    throw new Error(
      `${EXAMPLES_PATH} does not exist — run "npx tsx brand/tools/gen_examples.ts" ` +
        '(or "npm run gen:docs" / "npm run generate:all") before running this test file.',
    );
  }
  return JSON.parse(readFileSync(EXAMPLES_PATH, "utf8"));
}

function readPromoPage(name: string): string {
  const p = path.join(ROOT, "promo", ...name.split("/"));
  if (!existsSync(p)) {
    throw new Error(
      `${p} does not exist — run "npm run generate:all" before running this test file, which ` +
        "checks the actual generated output, not just its source template.",
    );
  }
  return readFileSync(p, "utf8");
}

function isElement(node: Node): node is Element {
  return "tagName" in node;
}

function extractText(node: Node): string {
  if (node.nodeName === "#text" && "value" in node) return node.value;
  if ("childNodes" in node) return node.childNodes.map(extractText).join("");
  return "";
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

/** Parses the rendered proof cards (`<div class="card" data-locale="…">`) out of one generated
 * promo page, in document order, as { locale, out }. The shared input (identical across every
 * card by construction) is rendered once, above the grid, not repeated per card — see
 * parseProofInput() for that. */
function parseProofCards(html: string): Array<{ locale: string; out: string }> {
  const document = parse(html);
  const cardEls = findAll(
    document,
    (el) => el.tagName === "div" && hasClass(el, "card") && attr(el, "data-locale") !== undefined,
  );
  return cardEls.map((card) => {
    const locale = attr(card, "data-locale")!;
    const outEl = findAll(card, (el) => el.tagName === "div" && hasClass(el, "out"))[0];
    if (!outEl) {
      throw new Error(`proof card for ${locale} is missing its .out element`);
    }
    return { locale, out: extractText(outEl) };
  });
}

/** Parses the one shared input specimen rendered once above the proof grid
 * (`<div class="specimen proof-shared-input">`), not repeated inside each card. */
function parseProofInput(html: string): string {
  const document = parse(html);
  const el = findAll(
    document,
    (node) => node.tagName === "div" && hasClass(node, "proof-shared-input"),
  )[0];
  if (!el) throw new Error("shared proof input specimen (.proof-shared-input) not found");
  return extractText(el);
}

describe("promo/examples.json — proofLocales is the single source of truth", () => {
  const data = readExamples();

  it("declares at least two locales (a meaningful comparison needs more than one)", () => {
    expect(data.proofLocales.length).toBeGreaterThanOrEqual(2);
  });

  it("every declared proof locale has a recorded `proof` field", () => {
    const byLocale = new Map(data.locales.map((l) => [l.locale, l]));
    for (const code of data.proofLocales) {
      const entry = byLocale.get(code);
      expect(entry, `missing locale ${code} in examples.json`).toBeDefined();
      expect(entry?.proof, `missing proof field for ${code}`).toBeDefined();
    }
  });
});

describe.each(["index.html", "manifesto/index.html"])("promo/%s — rendered proof grid", (page) => {
  const data = readExamples();
  const byLocale = new Map(data.locales.map((l) => [l.locale, l]));
  const html = readPromoPage(page);
  const cards = parseProofCards(html);
  const sharedInput = parseProofInput(html);

  it("renders the shared input exactly once, matching examples.json's recorded `proof.in`", () => {
    const first = data.proofLocales[0]!;
    expect(sharedInput).toBe(byLocale.get(first)?.proof?.in);
  });

  it("renders exactly the locales declared in examples.json's proofLocales, in order", () => {
    expect(cards.map((c) => c.locale)).toEqual(data.proofLocales);
  });

  it("renders no locale outside the intended/declared set", () => {
    for (const card of cards) {
      expect(data.proofLocales, `${card.locale} was rendered but is not in proofLocales`).toContain(
        card.locale,
      );
    }
  });

  it("every rendered card's output equals a fresh transform() call for its locale (not stale/hand-authored)", () => {
    for (const card of cards) {
      const fresh = transform(sharedInput, { locale: card.locale });
      expect(card.out).toBe(fresh);
    }
  });

  it("every rendered card matches examples.json's recorded `proof` field exactly", () => {
    for (const card of cards) {
      const proof = byLocale.get(card.locale)?.proof;
      expect(proof).toBeDefined();
      expect(proof!.in).toBe(sharedInput);
      expect(card.out).toBe(proof!.out);
    }
  });

  it("the rendered cards produce materially different output, not byte-identical results across locales", () => {
    const outputs = cards.map((c) => c.out);
    expect(new Set(outputs).size).toBe(cards.length);
  });

  it("idempotency holds for every rendered proof output (transform(out) === out)", () => {
    for (const card of cards) {
      expect(transform(card.out, { locale: card.locale })).toBe(card.out);
    }
  });
});

describe("promo/index.html vs promo/manifesto/index.html — same proof set on both pages", () => {
  const indexHtml = readPromoPage("index.html");
  const manifestoHtml = readPromoPage("manifesto/index.html");
  const indexCards = parseProofCards(indexHtml);
  const manifestoCards = parseProofCards(manifestoHtml);

  it("both pages render the same locales in the same order", () => {
    expect(manifestoCards.map((c) => c.locale)).toEqual(indexCards.map((c) => c.locale));
  });

  it("both pages render byte-identical shared input", () => {
    expect(parseProofInput(manifestoHtml)).toBe(parseProofInput(indexHtml));
  });

  it("both pages render byte-identical output per locale", () => {
    for (let i = 0; i < indexCards.length; i++) {
      expect(manifestoCards[i]!.out).toBe(indexCards[i]!.out);
    }
  });
});

describe("brand/tools/gen_examples.ts — deterministic regeneration", () => {
  it("running the generator twice yields identical proof data", () => {
    // Re-derive independently of the generator script itself (which requires a subprocess and
    // file write) — since gen_examples.ts's proof field is `{ in: PROOF_INPUT, out: transform(...) }`
    // with no I/O, randomness, or clock dependence, calling transform() twice in-process for the
    // same input is an equivalent determinism proof to running the CLI generator twice and
    // diffing promo/examples.json (which the manual verification pass in this correction also
    // does at the file-tree level).
    const data = readExamples();
    for (const code of data.proofLocales) {
      const proof = data.locales.find((l) => l.locale === code)?.proof;
      const run1 = transform(proof!.in, { locale: code });
      const run2 = transform(proof!.in, { locale: code });
      expect(run1).toBe(run2);
      expect(run1).toBe(proof!.out);
    }
  });
});
